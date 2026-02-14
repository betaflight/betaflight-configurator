import "./jqueryPlugins";
import $ from "jquery";
import "../components/init.js";
import { gui_log } from "./gui_log.js";
import { i18n } from "./localization.js";
import GUI, { TABS } from "./gui.js";
import { get as getConfig, set as setConfig } from "./ConfigStorage.js";
import { checkSetupAnalytics } from "./Analytics.js";
import { initializeSerialBackend } from "./serial_backend.js";
import FC from "./fc.js";
import CONFIGURATOR from "./data_storage.js";
import CliAutoComplete from "./CliAutoComplete.js";
import DarkTheme, { setDarkTheme } from "./DarkTheme.js";
import { isExpertModeEnabled } from "./utils/isExpertModeEnabled.js";
import { updateTabList } from "./utils/updateTabList.js";
import { mountVueTab, unmountVueTab } from "./vue_tab_mounter.js";
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

$(document).ready(function () {
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

        $("a.connection_button__link").removeClass("disabled");
        $("a.firmware_flasher_button__link").removeClass("disabled");

        initializeSerialBackend();
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

    $("a.connection_button__link").removeClass("disabled");
    // with Vue reactive system we don't need to call these,
    // our view is reactive to model changes
    // updateTopBarVersion();

    // log webgl capability
    // it would seem the webgl "enabling" through advanced settings will be ignored in the future
    // and webgl will be supported if gpu supports it by default (canary 40.0.2175.0), keep an eye on this one
    document.createElement("canvas");

    // log library versions in console to make version tracking easier
    console.log(`Libraries: jQuery - ${$.fn.jquery}, three.js - ${THREE.REVISION}`);

    // Check if this is the first visit
    const firstRunCfg = getConfig("firstRun") ?? {};
    if (firstRunCfg.firstRun === undefined) {
        setConfig({ firstRun: true });
        import("./tabs/static_tab.js").then(({ staticTab }) => {
            staticTab.initialize("options", () => {
                setTimeout(() => {
                    // Open the options tab after a delay
                    $("#tabs .tab_options a").click();
                }, 100);
            });
        });
    }

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
    $("#tabs ul.mode-connected li").click(function () {
        // store the first class of the current tab (omit things like ".active")
        const tabName = $(this).attr("class").split(" ")[0];

        const tabNameWithoutPrefix = tabName.substring(4);
        if (tabNameWithoutPrefix !== "cli") {
            // Don't store 'cli' otherwise you can never connect to another tab.
            setConfig({ lastTab: tabName });
        }
    });

    $("a.firmware_flasher_button__link").on("click", function () {
        if (
            $("a.firmware_flasher_button__label").hasClass("active") &&
            $("a.firmware_flasher_button__link").hasClass("active")
        ) {
            $("a.firmware_flasher_button__label").removeClass("active");
            $("a.firmware_flasher_button__link").removeClass("active");
            $("#tabs ul.mode-disconnected .tab_landing a").click();
        } else {
            $("#tabs ul.mode-disconnected .tab_firmware_flasher a").click();
            $("a.firmware_flasher_button__label").addClass("active");
            $("a.firmware_flasher_button__link").addClass("active");
        }
    });

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

    const handleDisallowedTab = (tab, tabName, self) => {
        if (tab !== "firmware_flasher") {
            gui_log(i18n.getMessage("tabSwitchUpgradeRequired", [tabName]));
            return false;
        }

        // Special handling for firmware flasher tab
        if (GUI.connected_to || GUI.connecting_to) {
            $("a.connection_button__link").trigger("click");
        }
        $("a.firmware_flasher_button__link").trigger("click");
        return true;
    };

    const ui_tabs = $("#tabs > ul");
    $("a", "#tabs > ul").click(function () {
        if ($(this).parent().hasClass("active") || GUI.tab_switch_in_progress) {
            return;
        }

        // only initialize when the tab isn't already active
        const self = this;
        const tabClass = $(self).parent().prop("class");
        const tabRequiresConnection = $(self).closest("ul").hasClass("mode-connected");
        const tab = tabClass.substring(4);
        const tabName = $(self).text();

        if (!canSwitchTab(tabRequiresConnection)) {
            return;
        }

        // Check if tab is allowed
        const isLoginSectionTab = $(self).closest("ul").hasClass("mode-loggedin");
        const isTabAllowed = GUI.allowedTabs.includes(tab) || isLoginSectionTab;

        if (!isTabAllowed && !handleDisallowedTab(tab, tabName, self)) {
            return;
        }

        GUI.tab_switch_in_progress = true;

        GUI.tab_switch_cleanup(function () {
            // disable active firmware flasher if it was active
            if (
                $("a.firmware_flasher_button__label").hasClass("active") &&
                $("a.firmware_flasher_button__link").hasClass("active")
            ) {
                $("a.firmware_flasher_button__label").removeClass("active");
                $("a.firmware_flasher_button__link").removeClass("active");
            }
            // disable previously active tab highlight
            $("li", ui_tabs).removeClass("active");

            // Highlight selected tab
            $(self).parent().addClass("active");

            // detach listeners and remove element data
            const content = $("#content");
            unmountVueTab();
            content.empty();

            // display loading screen
            $("#cache .data-loading").clone().appendTo(content);

            function content_ready() {
                GUI.tab_switch_in_progress = false;
            }

            checkSetupAnalytics(function (analyticsService) {
                analyticsService.sendAppView(tab);
            });

            switch (tab) {
                case "landing":
                    // Vue tab - use mountVueTab instead of jQuery load
                    mountVueTab("landing", content_ready);
                    break;
                case "options":
                    // Vue tab - use mountVueTab instead of jQuery load
                    mountVueTab("options", content_ready);
                    break;
                case "firmware_flasher":
                    // Vue tab - use mountVueTab instead of jQuery load
                    mountVueTab("firmware_flasher", content_ready);
                    break;
                case "help":
                    // Vue tab - use mountVueTab instead of jQuery load
                    mountVueTab("help", content_ready);
                    break;
                case "auxiliary":
                    mountVueTab("auxiliary", content_ready);
                    break;
                case "adjustments":
                    mountVueTab("adjustments", content_ready);
                    break;
                case "ports":
                    mountVueTab("ports", content_ready);
                    break;
                case "led_strip":
                    import("./tabs/led_strip").then(({ led_strip }) => led_strip.initialize(content_ready));
                    break;
                case "failsafe":
                    mountVueTab("failsafe", content_ready);
                    break;
                case "transponder":
                    import("./tabs/transponder").then(({ transponder }) => transponder.initialize(content_ready));
                    break;
                case "osd":
                    mountVueTab("osd", content_ready);
                    break;
                case "vtx":
                    import("./tabs/vtx").then(({ vtx }) => vtx.initialize(content_ready));
                    break;
                case "power":
                    mountVueTab("power", content_ready);
                    break;
                case "setup":
                    import("./tabs/setup").then(({ setup }) => setup.initialize(content_ready));
                    break;
                case "setup_osd":
                    import("./tabs/setup_osd").then(({ setup_osd }) => setup_osd.initialize(content_ready));
                    break;
                case "configuration":
                    mountVueTab("configuration", content_ready);
                    break;
                case "pid_tuning":
                    import("./tabs/pid_tuning").then(({ pid_tuning }) => pid_tuning.initialize(content_ready));
                    break;
                case "receiver":
                    mountVueTab("receiver", content_ready);
                    break;
                case "servos":
                    // Vue tab - use mountVueTab instead of jQuery load
                    mountVueTab("servos", content_ready);
                    break;
                case "gps":
                    mountVueTab("gps", content_ready);
                    break;
                case "motors":
                    mountVueTab("motors", content_ready);
                    break;
                case "sensors":
                    mountVueTab("sensors", content_ready);
                    break;
                case "logging":
                    mountVueTab("logging", content_ready);
                    break;
                case "onboard_logging":
                    mountVueTab("onboard_logging", content_ready);
                    break;
                case "cli":
                    mountVueTab("cli", content_ready);
                    break;
                case "presets":
                    import("../tabs/presets/presets").then(({ presets }) => presets.initialize(content_ready));
                    break;
                case "user_profile":
                    // Vue tab - use mountVueTab instead of jQuery load
                    mountVueTab("user_profile", content_ready);
                    break;
                case "backups":
                    // Vue tab - use mountVueTab instead of jQuery load
                    mountVueTab("backups", content_ready);
                    break;
                default:
                    console.log(`Tab not found: ${tab}`);
            }
        });
    });

    $("#tabs ul.mode-disconnected li a:first").click();

    $("#menu_btn").on("click", function () {
        $(".tab_container").toggleClass("reveal");
        $("#background").toggle();
    });

    $("#background").on("click", function () {
        $(".tab_container").removeClass("reveal");
        $("#background").hide();
    });

    $("#reveal_btn").on("click", function () {
        $(".headerbar").toggleClass("expand");
    });

    $(window).on("resize", function () {
        // 575px is the mobile breakpoint defined in CSS
        if (window.innerWidth > 575) {
            $(".tab_container").removeClass("reveal");
            $("#background").hide();
        }
    });

    // listen to all input change events and adjust the value within limits if necessary
    $("#content").on("focus", 'input[type="number"]', function () {
        const element = $(this);
        const val = element.val();

        if (!isNaN(val)) {
            element.data("previousValue", parseFloat(val));
        }
    });

    $("#content").on("change", 'input[type="number"]', function () {
        const element = $(this);
        const min = parseFloat(element.prop("min"));
        const max = parseFloat(element.prop("max"));
        const step = parseFloat(element.prop("step"));

        let val = parseFloat(element.val());

        // only adjust minimal end if bound is set
        if (element.prop("min") && val < min) {
            element.val(min);
            val = min;
        }

        // only adjust maximal end if bound is set
        if (element.prop("max") && val > max) {
            element.val(max);
            val = max;
        }

        // if entered value is illegal use previous value instead
        if (isNaN(val)) {
            element.val(element.data("previousValue"));
            val = element.data("previousValue");
        }

        // if step is not set or step is int and value is float use previous value instead
        if ((isNaN(step) || step % 1 === 0) && val % 1 !== 0) {
            element.val(element.data("previousValue"));
            val = element.data("previousValue");
        }

        // if step is set and is float and value is int, convert to float, keep decimal places in float according to step *experimental*
        if (!isNaN(step) && step % 1 !== 0) {
            const decimal_places = String(step).split(".")[1].length;

            if (val % 1 === 0 || String(val).split(".")[1].length !== decimal_places) {
                element.val(val.toFixed(decimal_places));
            }
        }
    });

    $("#showlog").on("click", function () {
        let state = $(this).data("state");
        if (state) {
            setTimeout(function () {
                const command_log = $("div#log");
                command_log.scrollTop($("div.wrapper", command_log).height());
            }, 200);
            $("#log").removeClass("active");
            $("#tab-content-container").removeClass("logopen");
            $("#scrollicon").removeClass("active");
            setConfig({ logopen: false });

            state = false;
        } else {
            $("#log").addClass("active");
            $("#tab-content-container").addClass("logopen");
            $("#scrollicon").addClass("active");
            setConfig({ logopen: true });

            state = true;
        }
        $(this).text(state ? i18n.getMessage("logActionHide") : i18n.getMessage("logActionShow"));
        $(this).data("state", state);
    });

    let result = getConfig("logopen");
    if (result.logopen) {
        $("#showlog").trigger("click");
    }

    result = getConfig("expertMode").expertMode ?? false;

    const expertModeCheckbox = $('input[name="expertModeCheckbox"]');
    expertModeCheckbox.prop("checked", result).trigger("change");

    expertModeCheckbox.on("change", () => {
        const checked = expertModeCheckbox.is(":checked");

        checkSetupAnalytics(function (analyticsService) {
            analyticsService.sendEvent(analyticsService.EVENT_CATEGORIES.APPLICATION, "ExpertMode", {
                status: checked ? "On" : "Off",
            });
        });

        if (FC.FEATURE_CONFIG && FC.FEATURE_CONFIG.features !== 0) {
            updateTabList(FC.FEATURE_CONFIG.features);
        }

        if (GUI.active_tab) {
            TABS[GUI.active_tab]?.expertModeChanged?.(checked);
        }

        setConfig({ expertMode: checked });
    });

    result = getConfig("cliAutoComplete");
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

window.isExpertModeEnabled = isExpertModeEnabled;
window.appReady = appReady;
