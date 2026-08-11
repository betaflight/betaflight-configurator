import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Exercises the real predicates rather than mocking them, by driving the inputs they
// read: the Tauri global, the user agent and touch points.

const TAURI = "__TAURI_INTERNALS__";

// jsdom leaves maxTouchPoints, userAgentData and bluetooth undefined, so they have to be
// defined rather than spied on. Recorded here so each test can drop them again.
const stubbed = new Set();

function stubNavigator(property, value) {
    Object.defineProperty(navigator, property, { value, configurable: true, writable: true });
    stubbed.add(property);
}

function restoreNavigator() {
    for (const property of stubbed) {
        delete navigator[property];
    }
    stubbed.clear();
}

function setUserAgent(userAgent, { maxTouchPoints = 0, platform, legacyPlatform } = {}) {
    stubNavigator("userAgent", userAgent);
    stubNavigator("maxTouchPoints", maxTouchPoints);
    // getOS() prefers userAgentData.platform when present, so pin it too.
    stubNavigator("userAgentData", platform ? { platform } : undefined);
    if (legacyPlatform !== undefined) {
        stubNavigator("platform", legacyPlatform);
    }
}

async function loadCompatibility() {
    vi.resetModules();
    return import("../../src/js/utils/checkCompatibility.js");
}

const UA = {
    android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
    linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
};

beforeEach(() => {
    delete globalThis[TAURI];
});

afterEach(() => {
    restoreNavigator();
    delete globalThis[TAURI];
});

describe("getOS", () => {
    // userAgentData is Chromium-only. WKWebView exposes navigator.platform alone, which is
    // the shape the Tauri macOS and iOS shells actually present.
    it("identifies a webview that exposes only the legacy platform", async () => {
        setUserAgent(UA.mac, { legacyPlatform: "MacIntel" });
        const { getOS } = await loadCompatibility();
        expect(getOS()).toBe("MacOS");

        restoreNavigator();
        setUserAgent(UA.iphone, { legacyPlatform: "iPhone" });
        expect(getOS()).toBe("iOS");
    });

    it("identifies ChromeOS from userAgentData and from the legacy shape", async () => {
        // A CrOS-free agent for the userAgentData cases, so they pass only on
        // the platform value and not through the user-agent token.
        const chromeUA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
        const crosUA = "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/120 Safari/537.36";
        const { getOS } = await loadCompatibility();

        for (const shape of [
            { platform: "Chrome OS" },
            { platform: "Chromium OS" },
            // No userAgentData: the legacy platform reports plain Linux and only
            // the user agent's CrOS token identifies ChromeOS.
            { legacyPlatform: "Linux x86_64" },
        ]) {
            setUserAgent(shape.legacyPlatform ? crosUA : chromeUA, shape);
            expect(getOS()).toBe("ChromeOS");
            restoreNavigator();
        }
    });
});

describe("isTauriAndroid", () => {
    it("is true only inside a Tauri shell on Android", async () => {
        setUserAgent(UA.android);
        const { isTauriAndroid } = await loadCompatibility();
        expect(isTauriAndroid()).toBe(false);

        globalThis[TAURI] = {};
        expect(isTauriAndroid()).toBe(true);
    });

    it("is false for a Tauri shell on another platform", async () => {
        globalThis[TAURI] = {};
        setUserAgent(UA.linux, { platform: "Linux" });
        const { isTauriAndroid } = await loadCompatibility();
        expect(isTauriAndroid()).toBe(false);
    });
});

describe("androidScanNeedsLocation", () => {
    const androidUA = (version) =>
        `Mozilla/5.0 (Linux; Android ${version}; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36`;

    /** Stubs the client hints an Android WebView answers with. */
    function setClientHints(platformVersion) {
        stubNavigator("userAgentData", {
            platform: "Android",
            getHighEntropyValues: async () => ({ platformVersion }),
        });
    }

    it("is true below Android 12, where a scan finds nothing without location", async () => {
        globalThis[TAURI] = {};
        for (const version of [8, 9, 10, 11]) {
            setUserAgent(androidUA(version));
            setClientHints(`${version}.0.0`);
            const { androidScanNeedsLocation } = await loadCompatibility();
            expect(await androidScanNeedsLocation()).toBe(true);
            restoreNavigator();
        }
    });

    it("is false from Android 12, where the scan permission stands alone", async () => {
        globalThis[TAURI] = {};
        for (const version of [12, 14, 16]) {
            setUserAgent(androidUA(version));
            setClientHints(`${version}.0.0`);
            const { androidScanNeedsLocation } = await loadCompatibility();
            expect(await androidScanNeedsLocation()).toBe(false);
            restoreNavigator();
        }
    });

    it("trusts client hints over a user agent frozen at Android 10", async () => {
        // Chrome's user-agent reduction reports "Android 10; K" on every modern release,
        // so the agent alone would drag a current device onto the legacy path.
        globalThis[TAURI] = {};
        setUserAgent("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36");
        setClientHints("15.0.0");

        const { androidScanNeedsLocation, getAndroidVersion } = await loadCompatibility();
        expect(getAndroidVersion()).toBe(10);
        expect(await androidScanNeedsLocation()).toBe(false);
    });

    it("falls back to the agent when client hints are unavailable", async () => {
        globalThis[TAURI] = {};
        setUserAgent(androidUA(13));
        const { androidScanNeedsLocation } = await loadCompatibility();
        expect(await androidScanNeedsLocation()).toBe(false);
    });

    it("assumes location is needed when the release can't be determined", async () => {
        globalThis[TAURI] = {};
        // A redundant prompt beats a scan that silently returns nothing.
        setUserAgent("Mozilla/5.0 (Linux; Android; Pixel) AppleWebKit/537.36 Mobile");
        const { androidScanNeedsLocation, getAndroidVersion } = await loadCompatibility();
        expect(getAndroidVersion()).toBeNull();
        expect(await androidScanNeedsLocation()).toBe(true);
    });

    it("is false off Android entirely", async () => {
        globalThis[TAURI] = {};
        setUserAgent(UA.mac, { legacyPlatform: "MacIntel" });
        const { androidScanNeedsLocation } = await loadCompatibility();
        expect(await androidScanNeedsLocation()).toBe(false);
    });
});

describe("isTauriMacOS", () => {
    it("is true for a Tauri shell on macOS", async () => {
        globalThis[TAURI] = {};
        setUserAgent(UA.mac, { platform: "macOS" });
        const { isTauriMacOS } = await loadCompatibility();
        expect(isTauriMacOS()).toBe(true);
    });

    it("is false outside Tauri", async () => {
        setUserAgent(UA.mac, { platform: "macOS" });
        const { isTauriMacOS } = await loadCompatibility();
        expect(isTauriMacOS()).toBe(false);
    });

    it("does not claim an iPad in desktop mode, which also reports Macintosh", async () => {
        globalThis[TAURI] = {};
        setUserAgent(UA.mac, { platform: "macOS", maxTouchPoints: 5 });
        const { isTauriMacOS, isTauriIOS } = await loadCompatibility();
        expect(isTauriIOS()).toBe(true);
        expect(isTauriMacOS()).toBe(false);
    });
});

describe("checkBluetoothSupport", () => {
    it("reports support on the native-BLE Tauri platforms", async () => {
        for (const [ua, extra] of [
            [UA.android, {}],
            [UA.iphone, {}],
            [UA.mac, { platform: "macOS" }],
            // The real WKWebView shell: no userAgentData at all.
            [UA.mac, { legacyPlatform: "MacIntel" }],
        ]) {
            globalThis[TAURI] = {};
            setUserAgent(ua, extra);
            const { checkBluetoothSupport } = await loadCompatibility();
            expect(checkBluetoothSupport()).toBe(true);
            restoreNavigator();
        }
    });

    it("falls back to the webview's Web Bluetooth on Tauri desktop", async () => {
        globalThis[TAURI] = {};
        setUserAgent(UA.linux, { platform: "Linux" });
        const { checkBluetoothSupport } = await loadCompatibility();

        // WebKitGTK exposes no navigator.bluetooth, so nothing claims support.
        expect(checkBluetoothSupport()).toBe(false);

        stubNavigator("bluetooth", {});
        expect(checkBluetoothSupport()).toBe(true);
    });
});
