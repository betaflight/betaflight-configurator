/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import "../components/init";
import { gui_log } from "./gui_log";
import { i18n } from "./localization";
import { get as getConfig, set as setConfig } from "./ConfigStorage";
import { checkSetupAnalytics } from "./Analytics";
import { initializeSerialBackend } from "./serial_backend";
import CONFIGURATOR from "./data_storage";
import CliAutoComplete from "./CliAutoComplete";
import DarkTheme, { setDarkTheme } from "./DarkTheme";
import { loadUiScale } from "./UiScale";
import { applyExpertMode } from "./utils/applyExpertMode";
import { switchTab } from "./tab_switch";
import * as THREE from "three";
import NotificationManager from "./utils/notifications";
import { Capacitor } from "@capacitor/core";
import loginManager from "./LoginManager";
import { enableDevelopmentOptions } from "./utils/developmentOptions";
import { loadDeviceFilters } from "./protocols/devices";
import {
    checkBluetoothSupport,
    checkSerialSupport,
    checkUsbSupport,
    isAndroid,
    isNetworkOnlyBrowser,
} from "./utils/checkCompatibility";
import { pinia } from "./pinia_instance";
import { useNavigationStore } from "../stores/navigation";
import { useDialogStore } from "../stores/dialog";
import { MspCancelledError } from "./msp/mspErrors";
import { isDeleteAccountPath, requestDeleteAccountFocus } from "./utils/deleteAccountLink";
import { useAppInfoStore } from "../stores/appInfo";

window.addEventListener("unhandledrejection", (event) => {
    if (event.reason instanceof MspCancelledError) {
        event.preventDefault();
    }
});

// Silence Capacitor bridge debug spam on native platforms
if (Capacitor?.isNativePlatform?.() && typeof Capacitor.isLoggingEnabled === "boolean") {
    Capacitor.isLoggingEnabled = false;
}

if (import.meta.env.DEV) {
    import("./msp/debug/msp_debug_tools")
        .then(() => {
            console.log("🔧 MSP Debug Tools loaded for development environment");
            console.log("• Press Ctrl+Shift+M to toggle debug dashboard");
            console.log("• Use MSPTestRunner.help() for all commands");
        })
        .catch((err) => {
            console.warn("Failed to load MSP debug tools:", err);
        });
}

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

// Open OptionsDialog on first launch so new users can set language / theme
function openFirstRunOptions() {
    const firstRunCfg = getConfig("firstRun") ?? {};
    if (firstRunCfg.firstRun !== undefined) {
        return;
    }

    setConfig({ firstRun: true });
    setTimeout(() => {
        useNavigationStore(pinia).optionsDialogOpen = true;
    }, 100);
}

/**
 * Tell the user once that their browser can only reach a flight controller over the
 * network, naming the APIs it is missing. Acknowledging it runs `next`, so the
 * first-run options dialog does not stack on top of this one.
 *
 * @param next - called once the notice is dismissed, or immediately when
 * there is nothing to say.
 */
function showNetworkOnlyNotice(next: () => void): void {
    if (!isNetworkOnlyBrowser() || getConfig("networkOnlyNoticeShown").networkOnlyNoticeShown) {
        next();
        return;
    }

    const transports: [supported: boolean, messageKey: string][] = [
        [checkSerialSupport(), "networkOnlyBrowserNoSerial"],
        [checkBluetoothSupport(), "networkOnlyBrowserNoBluetooth"],
        [checkUsbSupport(), "networkOnlyBrowserNoUsb"],
    ];
    const missing = transports
        .filter(([supported]) => !supported)
        .map(([, key]) => `<li>${i18n.getMessage(key)}</li>`)
        .join("");

    const dialogStore = useDialogStore(pinia);
    dialogStore.open(
        "InformationDialog",
        {
            title: i18n.getMessage("networkOnlyBrowserTitle"),
            text: `${i18n.getMessage("networkOnlyBrowserText")}<ul>${missing}</ul>`,
            confirmText: i18n.getMessage("OK"),
        },
        {
            confirm: () => {
                setConfig({ networkOnlyNoticeShown: true });
                dialogStore.close();
                next();
            },
        },
    );
}

function appReady() {
    readConfiguratorVersionMetadata();

    cleanupLocalStorage();

    loadDeviceFilters().catch((err) => {
        console.warn("Failed to load device filters, using defaults:", err);
    });

    i18n.init(async function () {
        await startProcess();

        // Never null here: checkSetupAnalytics creates the tracker before calling back.
        checkSetupAnalytics(function (analyticsService) {
            analyticsService?.sendEvent(analyticsService.EVENT_CATEGORIES.APPLICATION, "AppStart", {
                sessionControl: "start",
                configuratorVersion: CONFIGURATOR.getDisplayVersion(),
                gitRevision: CONFIGURATOR.gitRevision,
                productName: CONFIGURATOR.productName,
                operatingSystem: useAppInfoStore().operatingSystem,
                language: i18n.selectedLanguage,
            });
        });

        initializeSerialBackend();

        showNetworkOnlyNotice(openFirstRunOptions);
    });

    const showNotifications = getConfig("showNotifications", false).showNotifications;
    if (showNotifications && NotificationManager.checkPermission() === "default") {
        void NotificationManager.requestPermission();
    }
}

async function openDeleteAccountFromLink() {
    try {
        window.history.replaceState(null, "", `/${window.location.search}${window.location.hash}`);
    } catch (error) {
        console.warn("Could not strip delete account link from URL:", error);
    }

    requestDeleteAccountFocus();
    switchTab("user_profile", { mode: "loggedin" });

    if (!(await loginManager.isUserLoggedIn())) {
        loginManager.showLoginDialog();
    }
}

//Process to execute to real start the app
async function startProcess() {
    // translate to user-selected language
    i18n.localizePage();

    // Initialize login manager
    await loginManager.initialize();

    gui_log(i18n.getMessage("infoVersionOs", { operatingSystem: useAppInfoStore().operatingSystem }));
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

    // Apply persisted UI scale before initial tab mount to avoid flicker.
    loadUiScale();

    // Kick off initial tab — sidebar handles subsequent clicks reactively.
    if (isDeleteAccountPath(window.location.pathname)) {
        openDeleteAccountFromLink().catch((err) => {
            console.warn("Failed to open account deletion from link:", err);
        });
    } else {
        switchTab("landing", { mode: "disconnected" });
    }

    // The phone/tablet shell only. A narrow desktop or browser window is still the desktop
    // experience, so width alone must not opt anything in here.
    document.body.classList.toggle("mobile-app-shell", isAndroid());

    // The on-screen keyboard leaves no room for the tab strip in the floating bar. Track focus
    // rather than viewport height: the layout viewport shrinks with the keyboard, so measuring
    // it cannot tell the two apart.
    document.addEventListener("focusin", (event) => {
        if (event.target instanceof Element && event.target.matches("input, textarea, [contenteditable]")) {
            document.body.classList.add("keyboard-visible");
        }
    });
    document.addEventListener("focusout", () => {
        document.body.classList.remove("keyboard-visible");
    });

    const compactHeaderLayoutMediaQuery = window.matchMedia(
        "(max-width: 575px), (max-width: 950px) and (max-height: 500px) and (orientation: landscape)",
    );
    const syncCompactHeaderLayout = () => {
        document.body.classList.toggle("compact-header-layout", compactHeaderLayoutMediaQuery.matches);
    };
    syncCompactHeaderLayout();
    compactHeaderLayoutMediaQuery.addEventListener("change", syncCompactHeaderLayout);

    window.addEventListener("resize", syncCompactHeaderLayout);

    applyExpertMode(Boolean(getConfig("expertMode").expertMode), { persist: false });

    const { cliAutoComplete } = getConfig<boolean | undefined>("cliAutoComplete");
    CliAutoComplete.setEnabled(cliAutoComplete === undefined || cliAutoComplete); // On by default

    const { darkTheme } = getConfig("darkTheme");
    if (darkTheme === undefined || typeof darkTheme !== "number") {
        // sets dark theme to auto if not manually changed
        setDarkTheme(2);
    } else {
        setDarkTheme(darkTheme);
    }

    // Apply color theme from config (default to "yellow")
    const colorTheme = getConfig<string | undefined>("colorTheme").colorTheme ?? "yellow";
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
