import { Capacitor } from "@capacitor/core";

/**
 * Detect the host OS using the modern userAgentData API with a fallback to the
 * legacy navigator.platform / userAgent strings.
 *
 * @returns {string} Standardized OS name ("MacOS", "iOS", "Windows", "Android",
 * "Linux", "ChromeOS") or "unknown".
 */
export function getOS() {
    let os = "unknown";
    const userAgent = globalThis.navigator.userAgent;
    // userAgentData is Chromium-only: WKWebView (Tauri macOS/iOS) and Safari never
    // expose it, so fall back to the legacy navigator.platform ("MacIntel", "iPhone").
    const platform = globalThis.navigator?.userAgentData?.platform ?? globalThis.navigator?.platform;
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
 * @returns {boolean} Whether the current browser is Chromium-based (Chrome, Edge, …).
 */
export function isChromiumBrowser() {
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
 * @returns {boolean} Whether running as a Capacitor native build on Android.
 */
export function isAndroid() {
    if (Capacitor.isNativePlatform()) {
        return Capacitor.getPlatform() === "android";
    }
    return false;
}

/**
 * @returns {boolean} Whether running as a Capacitor native build on iOS.
 */
export function isIOS() {
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
 * @returns {boolean} Whether the WebSocket transport metadata is present.
 */
export function isEmbeddedDeployment() {
    return document.querySelector('meta[name="bf-transport"]')?.content === "websocket";
}

/**
 * @returns {boolean} Whether running inside a Tauri shell (desktop, Android or iOS).
 */
export function isTauri() {
    return typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis;
}

/**
 * @returns {boolean} Whether running inside a Tauri shell on iOS/iPadOS.
 */
export function isTauriIOS() {
    if (!isTauri()) {
        return false;
    }
    // The Tauri iOS webview is WKWebView: iPhone/iPod report directly, while an
    // iPad in desktop mode reports "Macintosh" but still exposes touch points.
    const ua = navigator.userAgent ?? "";
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * @returns {boolean} Whether running inside a Tauri shell on Android.
 */
export function isTauriAndroid() {
    return isTauri() && getOS() === "Android";
}

/**
 * The major Android release as it appears in the user agent.
 *
 * Unreliable on its own: Chrome's user-agent reduction pins this at "Android 10" on
 * every modern release, so treat it only as a fallback for `getAndroidRelease()`.
 *
 * @returns {number|null} The major version, or null when it can't be determined.
 */
export function getAndroidVersion() {
    const match = /Android\s+(\d+)/.exec(globalThis.navigator?.userAgent ?? "");
    return match ? Number(match[1]) : null;
}

/**
 * The real major Android release, preferring client hints over the frozen user agent.
 *
 * @returns {Promise<number|null>} The major version, or null when it can't be determined.
 */
export async function getAndroidRelease() {
    const uaData = globalThis.navigator?.userAgentData;
    if (uaData?.getHighEntropyValues) {
        try {
            const { platformVersion } = await uaData.getHighEntropyValues(["platformVersion"]);
            const major = Number.parseInt(platformVersion, 10);
            if (Number.isFinite(major)) {
                return major;
            }
        } catch (error) {
            console.warn("Could not read the platform version from client hints:", error);
        }
    }
    return getAndroidVersion();
}

/**
 * Android returns no BLE scan results unless location is granted, until Android 12
 * where the scan permission is declared neverForLocation and stands alone. Asking
 * only where it is required keeps the prompt away from everyone else.
 *
 * @returns {Promise<boolean>} Whether a BLE scan here needs location permission first.
 */
export async function androidScanNeedsLocation() {
    if (!isTauriAndroid()) {
        return false;
    }
    const release = await getAndroidRelease();
    // An indeterminate release is treated as old: a redundant prompt beats a scan that
    // silently finds nothing.
    return release === null || release < 12;
}

/**
 * @returns {boolean} Whether running inside a Tauri shell on macOS.
 */
export function isTauriMacOS() {
    // isTauriIOS() claims an iPad in desktop mode, which also reports "Macintosh".
    return isTauri() && !isTauriIOS() && getOS() === "MacOS";
}

/**
 * @returns {boolean} Whether running inside a Tauri shell on a desktop OS
 * (macOS, Linux or Windows) as opposed to Tauri's mobile targets.
 */
export function isTauriDesktop() {
    return isTauri() && !isTauriIOS() && !isTauriAndroid();
}

/**
 * True only when running as a genuine web/PWA build, i.e. not inside a natively
 * packaged shell (Capacitor Android/iOS, Tauri desktop/iOS) and not an embedded
 * deployment identified by the WebSocket transport metadata. Use this to gate
 * PWA-only behaviour such as service-worker registration and its update dialogs.
 *
 * @returns {boolean} Whether the runtime is a web/PWA context.
 */
export function isPwaContext() {
    return !Capacitor.isNativePlatform() && !isTauri() && !isEmbeddedDeployment();
}

/**
 * Verify the runtime can talk to a flight controller and, when it cannot,
 * replace the page body with an error message.
 *
 * @returns {boolean} True when a compatible transport (or native/Tauri shell,
 * or test environment) is available.
 * @throws {Error} When no compatible browser transport is found.
 */
export function checkCompatibility() {
    if (isEmbeddedDeployment()) {
        console.log("[COMPAT] Embedded deployment detected — skipping browser checks");
        return true;
    }

    const hasSerialSupport = checkSerialSupport();
    const hasBluetoothSupport = checkBluetoothSupport();
    const hasUsbSupport = checkUsbSupport();
    const hasWebTransport = hasSerialSupport || hasBluetoothSupport || hasUsbSupport;

    const isNative = Capacitor.isNativePlatform();
    const isTauriShell = isTauri();

    // Check if running in a test environment
    const isTestEnvironment =
        typeof process !== "undefined" && (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined);

    const compatible = isTestEnvironment || isNative || isTauriShell || hasWebTransport;

    console.log("User Agent: ", navigator.userAgentData);
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
        "Betaflight requires a browser with at least one of: Web Serial, Web Bluetooth, or Web USB.<br/>";

    if (!hasSerialSupport) {
        errorMessage += "<br/>- Serial API support is not available.";
    }

    if (!hasBluetoothSupport) {
        errorMessage += "<br/>- Bluetooth API support is not available.";
    }

    if (!hasUsbSupport) {
        errorMessage += "<br/>- USB API support is not available.";
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
 * @returns {boolean} Whether a serial transport is available on this platform.
 */
export function checkSerialSupport() {
    let result = false;
    // iOS (Capacitor or Tauri) has no USB serial API, so don't advertise it there.
    if (isAndroid() || (isTauri() && !isTauriIOS())) {
        result = true;
    } else if (navigator.serial) {
        result = true;
    } else if (isIOS()) {
        // Not implemented yet
    }

    return result;
}

/**
 * @returns {boolean} Whether a Bluetooth transport is available on this platform.
 */
export function checkBluetoothSupport() {
    let result = false;
    if (isAndroid()) {
        result = true;
    } else if (isTauriIOS() || isTauriMacOS() || isTauriAndroid()) {
        // Native BLE transport — neither WKWebView nor the Android System WebView
        // exposes navigator.bluetooth.
        result = true;
    } else if (navigator.bluetooth) {
        result = true;
    } else if (isIOS()) {
        // Not implemented yet
    }
    return result;
}

/**
 * @returns {boolean} Whether a USB transport is available on this platform.
 */
export function checkUsbSupport() {
    let result = false;
    if (isAndroid() || isTauriAndroid()) {
        // Native USB DFU in both Android shells; the system webview has no WebUSB.
        result = true;
    } else if (navigator.usb) {
        result = true;
    } else if (isIOS()) {
        // Not implemented yet
    }
    return result;
}
