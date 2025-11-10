import { Capacitor } from "@capacitor/core";

// Detects OS using modern userAgentData API with fallback to legacy platform
// Returns standardized OS name string or "unknown"
export function getOS() {
    let os = "unknown";
    const userAgent = window.navigator.userAgent;
    const platform = window.navigator?.userAgentData?.platform || window.navigator.platform;
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

export function checkCompatibility() {
    const hasSerialSupport = checkSerialSupport();
    const hasBluetoothSupport = checkBluetoothSupport();
    const hasUsbSupport = checkUsbSupport();
    const isChromium = isChromiumBrowser();

    const isNative = Capacitor.isNativePlatform();

    // Check if running in a test environment
    const isTestEnvironment =
        typeof process !== "undefined" && (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined);

    const compatible =
        isTestEnvironment || isNative || (isChromium && (hasSerialSupport || hasBluetoothSupport || hasUsbSupport));

    console.log("User Agent: ", navigator.userAgentData);
    console.log("Native: ", isNative);
    console.log("Chromium: ", isChromium);
    console.log("Serial: ", hasSerialSupport);
    console.log("Bluetooth: ", hasBluetoothSupport);
    console.log("USB: ", hasUsbSupport);
    console.log("OS: ", getOS());
    console.log("Android: ", isAndroid());
    console.log("iOS: ", isIOS());

    if (compatible) {
        return true;
    }

    let errorMessage = "";
    if (!isChromium) {
        errorMessage = "Betaflight app requires a Chromium based browser (Chrome, Chromium, Edge).<br/>";
    }

    if (!hasBluetoothSupport) {
        errorMessage += "<br/>- Web Bluetooth API support is disabled.";
    }

    if (!hasSerialSupport) {
        errorMessage += "<br/>- Serial API support is disabled.";
    }

    if (!hasUSBSupport) {
        errorMessage += "<br/>- Web USB API support is disabled.";
    }

    const newDiv = document.createElement("div");

    $("body")
        .empty()
        .css({
            height: "100%",
            display: "grid",
            "background-image": "url(../images/osd-bg-1.jpg)",
            "background-size": "cover",
            "background-repeat": "no-repeat",
        })
        .append(newDiv);

    $(newDiv).append(errorMessage).css({
        "font-size": "16px",
        "background-color": "var(--surface-200)",
        color: "var(--text)",
        padding: "1rem",
        margin: "auto",
        "border-radius": "0.75rem",
        border: "2px solid var(--surface-500)",
    });

    throw new Error("No compatible browser found.");
}

export function checkSerialSupport() {
    let result = false;
    if (isAndroid()) {
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
        // Not implemented yet
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
        // Not implemented yet
    } else if (navigator.usb) {
        result = true;
    } else if (isIOS()) {
        // Not implemented yet
    }
    return result;
}
