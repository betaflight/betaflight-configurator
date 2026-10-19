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

import { Capacitor } from "@capacitor/core";

/**
 * The parts of `navigator` this module feature-detects. lib.dom has none of them: User-Agent
 * Client Hints are Chromium-only, and Web Serial, Web Bluetooth and WebUSB are not standard.
 * Only their presence is read here; the transports type the APIs themselves.
 */
interface DetectableNavigator extends Navigator {
    userAgentData?: { platform: string; brands: Array<{ brand: string; version: string }> };
    serial?: unknown;
    bluetooth?: unknown;
    usb?: unknown;
}

function detectableNavigator(): DetectableNavigator {
    return globalThis.navigator as DetectableNavigator;
}

/** What getOS() reports. */
export type OperatingSystem = "MacOS" | "iOS" | "Windows" | "Android" | "Linux" | "ChromeOS" | "unknown";

/**
 * Detect the host OS using the modern userAgentData API with a fallback to the
 * legacy navigator.platform / userAgent strings.
 *
 * @returns Standardized OS name ("MacOS", "iOS", "Windows", "Android",
 * "Linux", "ChromeOS") or "unknown".
 */
export function getOS(): OperatingSystem {
    let os: OperatingSystem = "unknown";
    const navigator = detectableNavigator();
    const userAgent = navigator.userAgent;
    // userAgentData is Chromium-only: WKWebView (Tauri macOS) and Safari never
    // expose it, so fall back to the legacy navigator.platform ("MacIntel", "iPhone").
    const platform = navigator?.userAgentData?.platform ?? navigator?.platform;
    const macosPlatforms = ["Macintosh", "MacIntel", "MacPPC", "Mac68K", "macOS"];
    const windowsPlatforms = ["Win32", "Win64", "Windows", "WinCE"];
    const iosPlatforms = ["iPhone", "iPad", "iPod"];

    if (macosPlatforms.includes(platform)) {
        os = "MacOS";
    } else if (iosPlatforms.includes(platform)) {
        os = "iOS";
    } else if (windowsPlatforms.includes(platform)) {
        os = "Windows";
    } else if (/Android/.test(userAgent)) {
        os = "Android";
    } else if (/CrOS/.test(userAgent) || /Chrom(e|ium) OS/.test(platform)) {
        // userAgentData.platform says "Chrome OS"/"Chromium OS"; only the user
        // agent carries the CrOS token, and the legacy platform reports plain
        // Linux, so ChromeOS has to be ruled out before the Linux fallback.
        os = "ChromeOS";
    } else if (/Linux/.test(platform)) {
        os = "Linux";
    }

    return os;
}

/**
 * @returns Whether the current browser is Chromium-based (Chrome, Edge, …).
 */
export function isChromiumBrowser(): boolean {
    const navigator = detectableNavigator();
    if (navigator.userAgentData) {
        return navigator.userAgentData.brands.some((brand) => {
            return brand.brand == "Chromium";
        });
    }

    // Fallback for older browsers/Android
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes("chrom") || ua.includes("edg");
}

/**
 * @returns Whether running as a Capacitor native build on Android.
 */
export function isAndroid(): boolean {
    if (Capacitor.isNativePlatform()) {
        return Capacitor.getPlatform() === "android";
    }
    return false;
}

/**
 * @returns Whether running as a Capacitor native build on iOS.
 */
export function isIOS(): boolean {
    if (Capacitor.isNativePlatform()) {
        return Capacitor.getPlatform() === "ios";
    }
    return false;
}

/**
 * Detect whether the configurator is running in an embedded deployment where
 * WebSocket is the only available transport (e.g. a WiFi bridge device).
 *
 * The host signals this by injecting a meta tag into the served HTML:
 *   <meta name="bf-transport" content="websocket">
 *
 * When present, Serial/Bluetooth/USB browser API checks are
 * irrelevant — only WebSocket transport is needed.
 *
 * @returns Whether the WebSocket transport metadata is present.
 */
export function isEmbeddedDeployment(): boolean {
    return document.querySelector<HTMLMetaElement>('meta[name="bf-transport"]')?.content === "websocket";
}

/**
 * @returns Whether running inside a Tauri desktop shell.
 */
export function isTauri(): boolean {
    return typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis;
}

/**
 * @returns Whether running inside a Tauri shell on macOS.
 */
export function isTauriMacOS(): boolean {
    return isTauri() && getOS() === "MacOS";
}

/**
 * @returns Whether running inside a Tauri desktop shell (macOS, Linux or Windows).
 */
export function isTauriDesktop(): boolean {
    return isTauri();
}

/**
 * True only when running as a genuine web/PWA build, i.e. not inside a natively
 * packaged shell (Capacitor Android/iOS, Tauri desktop) and not an embedded
 * deployment identified by the WebSocket transport metadata. Use this to gate
 * PWA-only behaviour such as service-worker registration and its update dialogs.
 *
 * @returns Whether the runtime is a web/PWA context.
 */
export function isPwaContext(): boolean {
    return !Capacitor.isNativePlatform() && !isTauri() && !isEmbeddedDeployment();
}

/**
 * A plain browser that exposes none of Web Serial, Web Bluetooth or WebUSB, so a
 * network endpoint (a Wi-Fi bridge, an ELRS module, SITL) is the only way it can
 * reach a flight controller. Safari and Firefox land here; the native shells and
 * the bridge's own embedded deployment never do.
 *
 * @returns Whether network is the only transport this runtime has.
 */
export function isNetworkOnlyBrowser(): boolean {
    // isTauri() is also covered by checkSerialSupport() below; it is kept so the native shells
    // read as one explicit exclusion.
    if (isEmbeddedDeployment() || Capacitor.isNativePlatform() || isTauri()) {
        return false;
    }

    if (typeof WebSocket === "undefined") {
        return false;
    }

    return !checkSerialSupport() && !checkBluetoothSupport() && !checkUsbSupport();
}

/**
 * Verify the runtime can talk to a flight controller and, when it cannot,
 * replace the page body with an error message.
 *
 * A browser without Serial/Bluetooth/USB is still compatible: it connects over the
 * network instead, and isNetworkOnlyBrowser() drives the notice that says so.
 *
 * @returns True when a compatible transport (or native/Tauri shell,
 * or test environment) is available.
 * @throws {Error} When no compatible browser transport is found.
 */
export function checkCompatibility(): boolean {
    if (isEmbeddedDeployment()) {
        console.log("[COMPAT] Embedded deployment detected — skipping browser checks");
        return true;
    }

    const hasSerialSupport = checkSerialSupport();
    const hasBluetoothSupport = checkBluetoothSupport();
    const hasUsbSupport = checkUsbSupport();
    // WebSocket is the floor: every browser has it, and it carries the network transport.
    const hasNetworkSupport = typeof WebSocket !== "undefined";
    const hasWebTransport = hasSerialSupport || hasBluetoothSupport || hasUsbSupport || hasNetworkSupport;

    const isNative = Capacitor.isNativePlatform();
    const isTauriShell = isTauri();

    // Check if running in a test environment
    const isTestEnvironment =
        typeof process !== "undefined" && (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined);

    const compatible = isTestEnvironment || isNative || isTauriShell || hasWebTransport;

    console.log("User Agent: ", detectableNavigator().userAgentData);
    console.log("Native: ", isNative);
    console.log("Chromium: ", isChromiumBrowser());
    console.log("Serial: ", hasSerialSupport);
    console.log("Bluetooth: ", hasBluetoothSupport);
    console.log("USB: ", hasUsbSupport);
    console.log("OS: ", getOS());
    console.log("Android: ", isAndroid());
    console.log("iOS: ", isIOS());
    console.log("Tauri: ", isTauriShell);

    if (compatible) {
        return true;
    }

    let errorMessage =
        "Betaflight requires a browser with at least one of: Web Serial, Web Bluetooth, Web USB, or WebSocket.<br/>";

    if (!hasSerialSupport) {
        errorMessage += "<br/>- Serial API support is not available.";
    }

    if (!hasBluetoothSupport) {
        errorMessage += "<br/>- Bluetooth API support is not available.";
    }

    if (!hasUsbSupport) {
        errorMessage += "<br/>- USB API support is not available.";
    }

    if (!hasNetworkSupport) {
        errorMessage += "<br/>- WebSocket API support is not available.";
    }

    const body = document.body;
    body.innerHTML = "";
    Object.assign(body.style, {
        height: "100%",
        display: "grid",
        backgroundImage: "url(/images/pattern_dark.png)",
        backgroundSize: "300px",
        backgroundRepeat: "repeat",
        backgroundColor: "var(--surface-500)",
    });

    const newDiv = document.createElement("div");
    newDiv.innerHTML = errorMessage;
    Object.assign(newDiv.style, {
        fontSize: "16px",
        backgroundColor: "var(--surface-200)",
        color: "var(--text)",
        padding: "1rem",
        margin: "auto",
        borderRadius: "0.75rem",
        border: "2px solid var(--surface-500)",
    });
    body.appendChild(newDiv);

    throw new Error("No compatible browser found.");
}

/**
 * @returns Whether a serial transport is available on this platform.
 */
export function checkSerialSupport(): boolean {
    let result = false;
    if (isAndroid() || isTauri()) {
        result = true;
    } else if (detectableNavigator().serial) {
        result = true;
    } else if (isIOS()) {
        // Not implemented yet
    }

    return result;
}

/**
 * @returns Whether a Bluetooth transport is available on this platform.
 */
export function checkBluetoothSupport(): boolean {
    let result = false;
    if (isAndroid()) {
        result = true;
    } else if (isTauriMacOS()) {
        // Native BLE transport, as WKWebView doesn't expose navigator.bluetooth.
        result = true;
    } else if (detectableNavigator().bluetooth) {
        result = true;
    } else if (isIOS()) {
        // Not implemented yet
    }
    return result;
}

/**
 * @returns Whether a USB transport is available on this platform.
 */
export function checkUsbSupport(): boolean {
    let result = false;
    if (isAndroid()) {
        // Native USB DFU, as the Android system webview has no WebUSB.
        result = true;
    } else if (detectableNavigator().usb) {
        result = true;
    } else if (isIOS()) {
        // Not implemented yet
    }
    return result;
}
