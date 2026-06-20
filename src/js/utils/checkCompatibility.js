import { Capacitor } from "@capacitor/core";

// Detects OS using modern userAgentData API with fallback to legacy platform
// Returns standardized OS name string or "unknown"
export function getOS() {
    let os = "unknown";
    const userAgent = globalThis.navigator.userAgent;
    const platform = globalThis.navigator?.userAgentData?.platform;
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
    } else if (/Linux/.test(platform)) {
        os = "Linux";
    } else if (/CrOS/.test(platform)) {
        os = "ChromeOS";
    }

    return os;
}

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

export function isAndroid() {
    if (Capacitor.isNativePlatform()) {
        return Capacitor.getPlatform() === "android";
    }
    return false;
}

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
 */
export function isEmbeddedDeployment() {
    return document.querySelector('meta[name="bf-transport"]')?.content === "websocket";
}

export function isTauri() {
    return typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis;
}

export function isTauriIOS() {
    if (!isTauri()) {
        return false;
    }
    // The Tauri iOS webview is WKWebView: iPhone/iPod report directly, while an
    // iPad in desktop mode reports "Macintosh" but still exposes touch points.
    const ua = navigator.userAgent ?? "";
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

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

export function checkBluetoothSupport() {
    let result = false;
    if (isAndroid()) {
        result = true;
    } else if (navigator.bluetooth) {
        result = true;
    } else if (isIOS()) {
        // Not implemented yet
    }
    return result;
}

export function checkUsbSupport() {
    let result = false;
    if (isAndroid()) {
        result = true;
    } else if (navigator.usb) {
        result = true;
    } else if (isIOS()) {
        // Not implemented yet
    }
    return result;
}
