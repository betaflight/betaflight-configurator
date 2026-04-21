import "../components/init.js";
import { gui_log } from "./gui_log.js";
import { i18n } from "./localization.js";
import GUI from "./gui.js";
import { get as getConfig, set as setConfig } from "./ConfigStorage.js";
import { checkSetupAnalytics } from "./Analytics.js";
import { initializeSerialBackend, connectDisconnect } from "./serial_backend.js";
import CONFIGURATOR from "./data_storage.js";
import CliAutoComplete from "./CliAutoComplete.js";
import DarkTheme, { setDarkTheme } from "./DarkTheme.js";
import { applyExpertMode } from "./utils/applyExpertMode.js";
import { mountVueTab } from "./vue_tab_mounter.js";
import * as THREE from "three";
import NotificationManager from "./utils/notifications.js";
import { Capacitor } from "@capacitor/core";
import loginManager from "./LoginManager.js";
import { enableDevelopmentOptions } from "./utils/developmentOptions.js";

// Silence Capacitor bridge debug spam on native platforms
if (Capacitor?.isNativePlatform?.() && typeof Capacitor.isLoggingEnabled === "boolean") {
    Capacitor.isLoggingEnabled = false;
}

import("./msp/debug/msp_debug_tools.js")
    .then(() => {
        console.log("🔧 MSP Debug Tools loaded for development environment");
        console.log("• Press Ctrl+Shift+M to toggle debug dashboard");
        console.log("• Use MSPTestRunner.help() for all commands");
    })
    .catch((err) => {
        console.warn("Failed to load MSP debug tools:", err);
    });

document.addEventListener("DOMContentLoaded", function () {
    appReady();
});

function readConfiguratorVersionMetadata() {
    // These are injected by vite. Check for undefined is needed to prevent race conditions
    CONFIGURATOR.productName = typeof __APP_PRODUCTNAME__ !== "undefined" ? __APP_PRODUCTNAME__ : "Betaflight App";
    CONFIGURATOR.version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
    CONFIGURATOR.gitRevision = typeof __APP_REVISION__ !== "undefined" ? __APP_REVISION__ : "unknown";
}

function cleanupLocalStorage() {
    // storage quota is 5MB, we need to clean up some stuff (more info see PR #2937)
    const cleanupLocalStorageList = [
        "cache",
        "firmware",
        "https",
        "selected_board",
        "unifiedConfigLast",
        "unifiedSourceCache",
    ];

    for (const key in localStorage) {
        for (const item of cleanupLocalStorageList) {
            if (key.includes(item)) {
                localStorage.removeItem(key);
            }
        }
    }

    setConfig({ erase_chip: true }); // force erase chip on first run
}

function appReady() {
    readConfiguratorVersionMetadata();

    cleanupLocalStorage();

    i18n.init(async function () {
        await startProcess();

        checkSetupAnalytics(function (analyticsService) {
            analyticsService.sendEvent(analyticsService.EVENT_CATEGORIES.APPLICATION, "AppStart", {
                sessionControl: "start",
                configuratorVersion: CONFIGURATOR.getDisplayVersion(),
                gitRevision: CONFIGURATOR.gitRevision,
                productName: CONFIGURATOR.productName,
                operatingSystem: GUI.operating_system,
                language: i18n.selectedLanguage,
            });
        });

        initializeSerialBackend();

        // Open options tab on first run (Vue)
        const firstRunCfg = getConfig("firstRun") ?? {};
        if (firstRunCfg.firstRun === undefined) {
            setConfig({ firstRun: true });
            // Open the options tab after a short delay to ensure UI is ready
            setTimeout(() => {
                // Select the root-mounted Vue tab directly, no DOM injection.
                mountVueTab("options", () => {});
            }, 100);
        }
    });

    const showNotifications = getConfig("showNotifications", false).showNotifications;
    if (showNotifications && NotificationManager.checkPermission() === "default") {
        NotificationManager.requestPermission();
    }
}

//Process to execute to real start the app
async function startProcess() {
    // translate to user-selected language
    i18n.localizePage();

    // Initialize login manager
    await loginManager.initialize();

    gui_log(i18n.getMessage("infoVersionOs", { operatingSystem: GUI.operating_system }));
    gui_log(i18n.getMessage("infoVersionConfigurator", { configuratorVersion: CONFIGURATOR.getDisplayVersion() }));

    // with Vue reactive system we don't need to call these,
    // our view is reactive to model changes
    // updateTopBarVersion();

    // log webgl capability
    // it would seem the webgl "enabling" through advanced settings will be ignored in the future
    // and webgl will be supported if gpu supports it by default (canary 40.0.2175.0), keep an eye on this one
    document.createElement("canvas");

    // log library versions in console to make version tracking easier
    console.log(`Libraries: three.js - ${THREE.REVISION}`);

    const windowHref = window.location.href;
    let subdomain = "";
    let isDevelopmentUrl = false;

    try {
        const url = new URL(windowHref);
        const hostname = url.hostname;

        // Derive the left-most label as subdomain
        if (hostname) {
            const hostnameParts = hostname.split(".");
            subdomain = hostnameParts[0] || "";
        }

        // Set isDevelopmentUrl to true only if hostname includes "localhost" OR subdomain matches /^pr\d+/i
        isDevelopmentUrl =
            hostname.includes("localhost") ||
            hostname.includes("127.0.0.1") ||
            /^pr\d+/i.test(subdomain) ||
            subdomain.includes("master");
    } catch {
        // Handle file:// or malformed URLs - fallback to checking href string
        isDevelopmentUrl = windowHref.includes("localhost") || windowHref.includes("127.0.0.1");
    }

    if (isDevelopmentUrl) {
        console.log("Detected development URL");

        const automaticDevOptions = getConfig("automaticDevOptions", true).automaticDevOptions;
        if (automaticDevOptions) {
            console.log("Automatically enabling development settings");
            enableDevelopmentOptions();
        }
    }

    // Tabs
    for (const li of document.querySelectorAll("#tabs ul.mode-connected li")) {
        li.addEventListener("click", function () {
            // store the first class of the current tab (omit things like ".active")
            const tabName = this.className.split(" ")[0];

            const tabNameWithoutPrefix = tabName.substring(4);
            if (tabNameWithoutPrefix !== "cli") {
                // Don't store 'cli' otherwise you can never connect to another tab.
                setConfig({ lastTab: tabName });
            }
        });
    }

    const canSwitchTab = (tabRequiresConnection) => {
        if (tabRequiresConnection && !CONFIGURATOR.connectionValid) {
            gui_log(i18n.getMessage("tabSwitchConnectionRequired"));
            return false;
        }

        if (GUI.connect_lock) {
            gui_log(i18n.getMessage("tabSwitchWaitForOperation"));
            return false;
        }

        if (GUI.flashingInProgress) {
            gui_log(i18n.getMessage("tabSwitchWaitForOperation"));
            return false;
        }

        return true;
    };

    const handleDisallowedTab = (tab, tabName) => {
        if (tab !== "firmware_flasher") {
            gui_log(i18n.getMessage("tabSwitchUpgradeRequired", [tabName]));
            return false;
        }

        // Firmware flasher lives in the disconnected tab strip; disconnect first if needed
        // and let finishClose() restore the flasher via GUI.pendingTab.
        if (GUI.connected_to || GUI.connecting_to) {
            GUI.pendingTab = "firmware_flasher";
            connectDisconnect();
        } else {
            document.querySelector("#tabs ul.mode-disconnected .tab_firmware_flasher a")?.click();
        }
        return true;
    };

    const uiTabs = document.querySelectorAll("#tabs > ul");
    for (const a of document.querySelectorAll("#tabs > ul a")) {
        a.addEventListener("click", function () {
            if (this.parentElement.classList.contains("active") || GUI.tab_switch_in_progress) {
                return;
            }

            // only initialize when the tab isn't already active
            const self = this;
            const tabClass = self.parentElement.className.split(/\s+/)[0];
            const tabRequiresConnection = self.closest("ul").classList.contains("mode-connected");
            const tab = tabClass.substring(4);
            const tabName = self.textContent;

            if (!canSwitchTab(tabRequiresConnection)) {
                return;
            }

            // Check if tab is allowed
            const isLoginSectionTab = self.closest("ul").classList.contains("mode-loggedin");
            const isTabAllowed = GUI.allowedTabs.includes(tab) || isLoginSectionTab;

            if (!isTabAllowed) {
                handleDisallowedTab(tab, tabName);
                return;
            }

            GUI.tab_switch_in_progress = true;

            GUI.tab_switch_cleanup(function () {
                // disable previously active tab highlight
                for (const ul of uiTabs) {
                    for (const li of ul.querySelectorAll("li")) {
                        li.classList.remove("active");
                    }
                }

                // Highlight selected tab
                self.parentElement.classList.add("active");

                function content_ready() {
                    GUI.tab_switch_in_progress = false;
                }

                checkSetupAnalytics(function (analyticsService) {
                    analyticsService.sendAppView(tab);
                });

                if (!mountVueTab(tab, content_ready)) {
                    console.log(`Tab not found: ${tab}`);
                    GUI.tab_switch_in_progress = false;
                }
            });
        });
    }

    document.querySelector("#tabs ul.mode-disconnected li a")?.click();

    const compactHeaderLayoutMediaQuery = window.matchMedia(
        "(max-width: 575px), (max-width: 950px) and (max-height: 500px) and (orientation: landscape)",
    );
    const syncCompactHeaderLayout = () => {
        document.body.classList.toggle("compact-header-layout", compactHeaderLayoutMediaQuery.matches);
    };
    syncCompactHeaderLayout();
    compactHeaderLayoutMediaQuery.addEventListener("change", syncCompactHeaderLayout);

    document.getElementById("menu_btn")?.addEventListener("click", function () {
        document.querySelector(".tab_container")?.classList.toggle("reveal");
        const bg = document.getElementById("background");
        if (bg) {
            bg.style.display =
                bg.style.display === "none" || getComputedStyle(bg).display === "none" ? "block" : "none";
        }
    });

    document.getElementById("background")?.addEventListener("click", function () {
        document.querySelector(".tab_container")?.classList.remove("reveal");
        this.style.display = "none";
    });

    window.addEventListener("resize", function () {
        syncCompactHeaderLayout();

        // Keep JS toggle cleanup aligned with the compact header CSS breakpoint.
        if (!compactHeaderLayoutMediaQuery.matches) {
            document.querySelector(".tab_container")?.classList.remove("reveal");
            const bg = document.getElementById("background");
            if (bg) {
                bg.style.display = "none";
            }
        }
    });

    applyExpertMode(Boolean(getConfig("expertMode").expertMode), { persist: false });

    let result = getConfig("cliAutoComplete");
    CliAutoComplete.setEnabled(typeof result.cliAutoComplete === "undefined" || result.cliAutoComplete); // On by default

    result = getConfig("darkTheme");
    if (result.darkTheme === undefined || typeof result.darkTheme !== "number") {
        // sets dark theme to auto if not manually changed
        setDarkTheme(2);
    } else {
        setDarkTheme(result.darkTheme);
    }

    // Apply color theme from config (default to "yellow")
    result = getConfig("colorTheme");
    const colorTheme = result.colorTheme ?? "yellow";
    document.body.dataset.theme = colorTheme;

    // Contrast theme requires dark mode
    if (colorTheme === "contrast") {
        setDarkTheme(0);
        setConfig({ darkTheme: 0 });
    }

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
        DarkTheme.autoSet();
    });
}
