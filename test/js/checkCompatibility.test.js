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

function setUserAgent(userAgent, { maxTouchPoints = 0, platform } = {}) {
    stubNavigator("userAgent", userAgent);
    stubNavigator("maxTouchPoints", maxTouchPoints);
    // getOS() prefers userAgentData.platform when present, so pin it too.
    stubNavigator("userAgentData", platform ? { platform } : undefined);
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
