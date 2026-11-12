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

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Exercises the real predicates rather than mocking them, by driving the inputs they
// read: the Tauri global and the user agent.

const TAURI = "__TAURI_INTERNALS__";

// Globals the tests add and remove: the Tauri marker, and WebSocket for the no-transport case.
const globals = globalThis as unknown as Record<string, unknown>;

// jsdom leaves userAgentData and bluetooth undefined, so they have to be
// defined rather than spied on. Recorded here so each test can drop them again.
const stubbed = new Set<string>();

function stubNavigator(property: string, value: unknown) {
    Object.defineProperty(navigator, property, { value, configurable: true, writable: true });
    stubbed.add(property);
}

function restoreNavigator() {
    for (const property of stubbed) {
        delete (navigator as unknown as Record<string, unknown>)[property];
    }
    stubbed.clear();
}

function setUserAgent(
    userAgent: string,
    { platform, legacyPlatform }: { platform?: string; legacyPlatform?: string } = {},
) {
    stubNavigator("userAgent", userAgent);
    // getOS() prefers userAgentData.platform when present, so pin it too.
    stubNavigator("userAgentData", platform ? { platform } : undefined);
    if (legacyPlatform !== undefined) {
        stubNavigator("platform", legacyPlatform);
    }
}

async function loadCompatibility() {
    vi.resetModules();
    return import("../../src/js/utils/checkCompatibility");
}

const UA = {
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
    linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
};

beforeEach(() => {
    delete globals[TAURI];
});

afterEach(() => {
    restoreNavigator();
    delete globals[TAURI];
});

describe("getOS", () => {
    // userAgentData is Chromium-only. WKWebView exposes navigator.platform alone, which is
    // the shape the Tauri macOS shell and Safari actually present.
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

describe("isTauriMacOS", () => {
    it("is true for a Tauri shell on macOS", async () => {
        globals[TAURI] = {};
        setUserAgent(UA.mac, { platform: "macOS" });
        const { isTauriMacOS } = await loadCompatibility();
        expect(isTauriMacOS()).toBe(true);
    });

    it("is false outside Tauri", async () => {
        setUserAgent(UA.mac, { platform: "macOS" });
        const { isTauriMacOS } = await loadCompatibility();
        expect(isTauriMacOS()).toBe(false);
    });
});

describe("checkBluetoothSupport", () => {
    it("reports support on Tauri macOS, which has native BLE", async () => {
        for (const [ua, extra] of [
            [UA.mac, { platform: "macOS" }],
            // The real WKWebView shell: no userAgentData at all.
            [UA.mac, { legacyPlatform: "MacIntel" }],
        ] as const) {
            globals[TAURI] = {};
            setUserAgent(ua, extra);
            const { checkBluetoothSupport } = await loadCompatibility();
            expect(checkBluetoothSupport()).toBe(true);
            restoreNavigator();
        }
    });

    it("falls back to the webview's Web Bluetooth on Tauri desktop", async () => {
        globals[TAURI] = {};
        setUserAgent(UA.linux, { platform: "Linux" });
        const { checkBluetoothSupport } = await loadCompatibility();

        // WebKitGTK exposes no navigator.bluetooth, so nothing claims support.
        expect(checkBluetoothSupport()).toBe(false);

        stubNavigator("bluetooth", {});
        expect(checkBluetoothSupport()).toBe(true);
    });
});

describe("isNetworkOnlyBrowser", () => {
    // Safari and Firefox: no Web Serial, no Web Bluetooth, no WebUSB, no native shell.
    it("claims a browser with none of serial, Bluetooth or USB", async () => {
        setUserAgent(UA.mac, { legacyPlatform: "MacIntel" });
        const { isNetworkOnlyBrowser } = await loadCompatibility();
        expect(isNetworkOnlyBrowser()).toBe(true);
    });

    it("leaves a browser alone once any one API is present", async () => {
        setUserAgent(UA.linux, { platform: "Linux" });
        const { isNetworkOnlyBrowser } = await loadCompatibility();

        for (const api of ["serial", "bluetooth", "usb"]) {
            stubNavigator(api, {});
            expect(isNetworkOnlyBrowser()).toBe(false);
            restoreNavigator();
            setUserAgent(UA.linux, { platform: "Linux" });
        }
    });

    // The predicate promises a network transport, so a runtime without even WebSocket is
    // not network-only — it is the no-transport case checkCompatibility() rejects.
    it("is false when there is no WebSocket either", async () => {
        setUserAgent(UA.mac, { legacyPlatform: "MacIntel" });
        const { isNetworkOnlyBrowser } = await loadCompatibility();
        const websocket = globals.WebSocket;
        delete globals.WebSocket;

        try {
            expect(isNetworkOnlyBrowser()).toBe(false);
        } finally {
            globals.WebSocket = websocket;
        }
    });

    it("is false inside a Tauri shell, which has its own transports", async () => {
        globals[TAURI] = {};
        setUserAgent(UA.mac, { legacyPlatform: "MacIntel" });
        const { isNetworkOnlyBrowser } = await loadCompatibility();
        expect(isNetworkOnlyBrowser()).toBe(false);
    });
});

describe("checkSerialSupport", () => {
    it("reports support inside a Tauri shell, which has a native serial transport", async () => {
        globals[TAURI] = {};
        setUserAgent(UA.linux, { platform: "Linux" });
        const { checkSerialSupport } = await loadCompatibility();
        expect(checkSerialSupport()).toBe(true);
    });
});

describe("isEmbeddedDeployment", () => {
    afterEach(() => {
        document.head.innerHTML = "";
    });

    it("is true only when the host injects the WebSocket transport tag", async () => {
        const { isEmbeddedDeployment } = await loadCompatibility();
        expect(isEmbeddedDeployment()).toBe(false);

        document.head.innerHTML = '<meta name="bf-transport" content="websocket">';
        expect(isEmbeddedDeployment()).toBe(true);

        document.head.innerHTML = '<meta name="bf-transport" content="serial">';
        expect(isEmbeddedDeployment()).toBe(false);
    });
});

describe("checkCompatibility", () => {
    // The test-environment short circuit would make every assertion below vacuous.
    const asProduction = async (run: () => Promise<void>) => {
        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        try {
            await run();
        } finally {
            process.env.NODE_ENV = previous;
        }
    };

    it("passes a serial-less browser, which still has the network", async () => {
        await asProduction(async () => {
            setUserAgent(UA.mac, { legacyPlatform: "MacIntel" });
            const { checkCompatibility } = await loadCompatibility();
            const body = document.body.innerHTML;

            expect(checkCompatibility()).toBe(true);
            // The error card replaces the whole body, so an untouched body means it ran.
            expect(document.body.innerHTML).toBe(body);
        });
    });

    it("still fails a runtime with no transport at all", async () => {
        await asProduction(async () => {
            setUserAgent(UA.mac, { legacyPlatform: "MacIntel" });
            const { checkCompatibility } = await loadCompatibility();
            const websocket = globals.WebSocket;
            delete globals.WebSocket;

            try {
                expect(() => checkCompatibility()).toThrow("No compatible browser found.");
            } finally {
                globals.WebSocket = websocket;
                document.body.innerHTML = "";
                document.body.removeAttribute("style");
            }
        });
    });
});
