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
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Browser_detection_using_the_user_agent
    if (!navigator.userAgentData) {
        console.log(navigator.userAgent);
        return false;
    }

    // https://learn.microsoft.com/en-us/microsoft-edge/web-platform/user-agent-guidance
    return navigator.userAgentData.brands.some((brand) => {
        return brand.brand == "Chromium";
    });
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

export function isCapacitorWeb() {
    if (Capacitor.isNativePlatform()) {
        return Capacitor.getPlatform() === "web";
    }
    return false;
}

export function checkBrowserCompatibility() {
    const isWebSerial = checkWebSerialSupport();
    const isBluetooth = checkWebBluetoothSupport();
    const isUSB = checkWebUSBSupport();
    const isChromium = isChromiumBrowser();

    const isNative = Capacitor.isNativePlatform();

    // const compatible = isNative || (webSerial && isChromium);
    const compatible = isChromium
        && (isWebSerial || isBluetooth || isUSB);

    console.log("User Agent: ", navigator.userAgentData);
    console.log("Native: ", isNative);
    console.log("Chromium: ", isChromium);
    console.log("Web Serial: ", isWebSerial);
    console.log("OS: ", getOS());

    console.log("Android: ", isAndroid());
    console.log("iOS: ", isIOS());
    console.log("Capacitor web: ", isCapacitorWeb());

    if (compatible) {
        return true;
    }

    let errorMessage = "";
    if (!isChromium) {
        errorMessage = "Betaflight app requires a Chromium based browser (Chrome, Chromium, Edge).";
    }

    if (!isWebSerial) {
        errorMessage += " Web Serial API support is disabled.";
    }

    if (!isBluetooth) {
        errorMessage += " Web Bluetooth API support is disabled.";
    }

    if (!isUSB) {
        errorMessage += " Web USB API support is disabled.";
    }

    const newDiv = document.createElement("div");

    $("body")
        .empty()
        .css({
            height: "100%",
            display: "grid",
            "background-image": "url(../images/osd-bg-1.jpg",
            "background-size": "cover",
            "background-repeat": "no-repeat",
        })
        .append(newDiv);

    $("div").append(errorMessage).css({
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

export function checkWebSerialSupport() {
    if (!navigator.serial) {
        console.error("Web Serial API is not supported in this browser.");
        return false;
    }

    if (isIOS()) {
        console.error("Web Serial API is not supported on iOS.");
        return false;
    }

    return true;
}

export function checkWebBluetoothSupport() {
    if (!navigator.bluetooth) {
        console.error("Web Bluetooth API is not supported in this browser.");
        return false;
    }

    if (isIOS()) {
        console.error("Web Bluetooth API is not supported on iOS.");
        return false;
    }

    return true;
}

export function checkWebUSBSupport() {
    if (!navigator.usb) {
        console.error("Web USB API is not supported in this browser.");
        return false;
    }

    if (isIOS()) {
        console.error("Web USB API is not supported on iOS.");
        return false;
    }

    return true;
}
