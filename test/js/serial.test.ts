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

import { describe, expect, it, vi, beforeEach } from "vitest";

// Force the Tauri shell so the protocol list registers both the Rust-backed raw-TCP
// slot and the WebSocket slot — the case the ws/wss vs tcp routing fix is about.
// Mutable so later blocks can pin other platforms' slot tables.
const platform = vi.hoisted(() => ({
    isTauri: true,
    isTauriMacOS: false,
}));

vi.mock("../../src/js/utils/checkCompatibility.js", () => ({
    isAndroid: () => false,
    isTauri: () => platform.isTauri,
    isTauriMacOS: () => platform.isTauriMacOS,
}));

// Replace each protocol with a tiny EventTarget stub so construction is side-effect free
// and instances are identifiable by class name.
const stub = (tag: string) =>
    ({
        [tag]: class extends EventTarget {},
    })[tag];

vi.mock("../../src/js/protocols/WebSerial", () => ({ default: stub("WebSerial") }));
vi.mock("../../src/js/protocols/WebBluetooth.js", () => ({ default: stub("WebBluetooth") }));
vi.mock("../../src/js/protocols/WebSocket", () => ({ default: stub("Websocket") }));
vi.mock("../../src/js/protocols/VirtualSerial", () => ({ default: stub("VirtualSerial") }));
vi.mock("../../src/js/protocols/CapacitorSerial", () => ({ default: stub("CapacitorSerial") }));
vi.mock("../../src/js/protocols/CapacitorBle.js", () => ({ default: stub("CapacitorBle") }));
vi.mock("../../src/js/protocols/CapacitorTcp", () => ({ default: stub("CapacitorTcp") }));
vi.mock("../../src/js/protocols/TauriSerial", () => ({ default: stub("TauriSerial") }));
vi.mock("../../src/js/protocols/TauriTcp", () => ({ default: stub("TauriTcp") }));
vi.mock("../../src/js/protocols/TauriBle", () => ({ default: stub("TauriBle") }));

let serial: typeof import("../../src/js/serial").serial;

/** The class name of the transport a path routes to, or undefined for a missing slot. */
const slot = (path: string): string | undefined => serial.selectProtocol(path)?.constructor.name;

/**
 * Rebuilds the serial singleton on the given Tauri platform. It builds its slot table at
 * module load, so the registry has to be reset for a changed platform to take effect.
 * @param {{macos?: boolean, tauri?: boolean}} on - the
 *   platform to report; everything omitted is false, which is desktop Linux/Windows, except
 *   `tauri`, which defaults to true.
 * @returns {void}
 */
function usePlatform(on: { macos?: boolean; tauri?: boolean } = {}): void {
    beforeEach(async () => {
        platform.isTauri = on.tauri ?? true;
        platform.isTauriMacOS = on.macos ?? false;
        vi.resetModules();
        ({ serial } = await import("../../src/js/serial"));
    });
}

describe("serial.selectProtocol — Tauri transport routing", () => {
    usePlatform();

    it("routes wss:// to the WebSocket protocol, not raw TCP", () => {
        expect(slot("wss://example.com:5761")).toBe("Websocket");
    });

    it("routes ws:// to the WebSocket protocol", () => {
        expect(slot("ws://10.1.1.208:5761")).toBe("Websocket");
    });

    it("routes an mDNS host name that contains an underscore to the WebSocket protocol", () => {
        expect(slot("ws://elrs_rx.local")).toBe("Websocket");
        expect(slot("ws://elrs_rx.local:81/serial")).toBe("Websocket");
    });

    it("routes a bracketed IPv6 host to the WebSocket protocol", () => {
        expect(slot("ws://[fe80::1]")).toBe("Websocket");
        expect(slot("ws://[fe80::1]:81/serial")).toBe("Websocket");
    });

    it("routes raw tcp:// to the Rust-backed TauriTcp protocol", () => {
        expect(slot("tcp://192.168.0.10:5761")).toBe("TauriTcp");
        expect(slot("tcp://elrs_rx.local:5761")).toBe("TauriTcp");
        expect(slot("tcp://[fe80::1]:5761")).toBe("TauriTcp");
    });

    it("routes a bare 'manual' selection to the TCP slot", () => {
        expect(slot("manual")).toBe("TauriTcp");
    });

    it("routes a device path to the native serial transport", () => {
        expect(slot("/dev/ttyACM0")).toBe("TauriSerial");
    });
});

describe("serial protocol slots — Tauri macOS", () => {
    usePlatform({ macos: true });

    it("uses the native BLE transport, since WKWebView has no Web Bluetooth", () => {
        expect(slot("bluetooth_1B2C3D4E")).toBe("TauriBle");
    });

    it("keeps the native serial transport", () => {
        expect(slot("/dev/cu.usbmodem1")).toBe("TauriSerial");
    });
});

describe("serial protocol slots — Tauri desktop (Linux/Windows)", () => {
    usePlatform();

    it("keeps the webview's Web Bluetooth", () => {
        expect(slot("bluetooth_AA:BB:CC:DD:EE:FF")).toBe("WebBluetooth");
    });
});

describe("serial.canOpen — which manual targets a platform understands", () => {
    describe("in a browser", () => {
        usePlatform({ tauri: false });

        // The web shell's "tcp" slot is a WebSocket, which rejects the scheme outright, so
        // offering a saved tcp:// target would only ever produce a failed connection.
        it("rejects a raw tcp:// target, whatever case it is written in", () => {
            expect(serial.canOpen("tcp://192.168.4.1:5761")).toBe(false);
            expect(serial.canOpen("TCP://192.168.4.1:5761")).toBe(false);
        });

        it("accepts ws://, wss:// and the addresses that route to serial", () => {
            expect(serial.canOpen("ws://127.0.0.1:6761")).toBe(true);
            expect(serial.canOpen("wss://quad.local")).toBe(true);
            expect(serial.canOpen("/dev/ttyUSB0")).toBe(true);
        });

        it("treats a missing or non-string target as nothing to reject", () => {
            expect(serial.canOpen("")).toBe(true);
            // A caller in JavaScript can still pass undefined.
            expect(serial.canOpen(undefined as unknown as string)).toBe(true);
        });
    });

    describe("in a Tauri shell", () => {
        usePlatform();

        it("accepts a raw tcp:// target, which has a real transport here", () => {
            expect(serial.canOpen("tcp://192.168.4.1:5761")).toBe(true);
        });
    });
});
