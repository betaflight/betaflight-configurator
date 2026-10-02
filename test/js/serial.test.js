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
const stub = (tag) =>
    ({
        [tag]: class extends EventTarget {},
    })[tag];

vi.mock("../../src/js/protocols/WebSerial.js", () => ({ default: stub("WebSerial") }));
vi.mock("../../src/js/protocols/WebBluetooth.js", () => ({ default: stub("WebBluetooth") }));
vi.mock("../../src/js/protocols/WebSocket.js", () => ({ default: stub("Websocket") }));
vi.mock("../../src/js/protocols/VirtualSerial.js", () => ({ default: stub("VirtualSerial") }));
vi.mock("../../src/js/protocols/CapacitorSerial.js", () => ({ default: stub("CapacitorSerial") }));
vi.mock("../../src/js/protocols/CapacitorBle.js", () => ({ default: stub("CapacitorBle") }));
vi.mock("../../src/js/protocols/CapacitorTcp.js", () => ({ default: stub("CapacitorTcp") }));
vi.mock("../../src/js/protocols/TauriSerial.js", () => ({ default: stub("TauriSerial") }));
vi.mock("../../src/js/protocols/TauriTcp.js", () => ({ default: stub("TauriTcp") }));
vi.mock("../../src/js/protocols/TauriBle.js", () => ({ default: stub("TauriBle") }));

let serial;

/**
 * Rebuilds the serial singleton on the given Tauri platform. It builds its slot table at
 * module load, so the registry has to be reset for a changed platform to take effect.
 * @param {{macos?: boolean, tauri?: boolean}} on - the
 *   platform to report; everything omitted is false, which is desktop Linux/Windows, except
 *   `tauri`, which defaults to true.
 * @returns {void}
 */
function usePlatform(on = {}) {
    beforeEach(async () => {
        platform.isTauri = on.tauri ?? true;
        platform.isTauriMacOS = on.macos ?? false;
        vi.resetModules();
        ({ serial } = await import("../../src/js/serial.js"));
    });
}

describe("serial.selectProtocol — Tauri transport routing", () => {
    usePlatform();

    it("routes wss:// to the WebSocket protocol, not raw TCP", () => {
        expect(serial.selectProtocol("wss://example.com:5761").constructor.name).toBe("Websocket");
    });

    it("routes ws:// to the WebSocket protocol", () => {
        expect(serial.selectProtocol("ws://10.1.1.208:5761").constructor.name).toBe("Websocket");
    });

    it("routes an mDNS host name that contains an underscore to the WebSocket protocol", () => {
        expect(serial.selectProtocol("ws://elrs_rx.local").constructor.name).toBe("Websocket");
        expect(serial.selectProtocol("ws://elrs_rx.local:81/serial").constructor.name).toBe("Websocket");
    });

    it("routes a bracketed IPv6 host to the WebSocket protocol", () => {
        expect(serial.selectProtocol("ws://[fe80::1]").constructor.name).toBe("Websocket");
        expect(serial.selectProtocol("ws://[fe80::1]:81/serial").constructor.name).toBe("Websocket");
    });

    it("routes raw tcp:// to the Rust-backed TauriTcp protocol", () => {
        expect(serial.selectProtocol("tcp://192.168.0.10:5761").constructor.name).toBe("TauriTcp");
        expect(serial.selectProtocol("tcp://elrs_rx.local:5761").constructor.name).toBe("TauriTcp");
        expect(serial.selectProtocol("tcp://[fe80::1]:5761").constructor.name).toBe("TauriTcp");
    });

    it("routes a bare 'manual' selection to the TCP slot", () => {
        expect(serial.selectProtocol("manual").constructor.name).toBe("TauriTcp");
    });

    it("routes a device path to the native serial transport", () => {
        expect(serial.selectProtocol("/dev/ttyACM0").constructor.name).toBe("TauriSerial");
    });
});

describe("serial protocol slots — Tauri macOS", () => {
    usePlatform({ macos: true });

    it("uses the native BLE transport, since WKWebView has no Web Bluetooth", () => {
        expect(serial.selectProtocol("bluetooth_1B2C3D4E").constructor.name).toBe("TauriBle");
    });

    it("keeps the native serial transport", () => {
        expect(serial.selectProtocol("/dev/cu.usbmodem1").constructor.name).toBe("TauriSerial");
    });
});

describe("serial protocol slots — Tauri desktop (Linux/Windows)", () => {
    usePlatform();

    it("keeps the webview's Web Bluetooth", () => {
        expect(serial.selectProtocol("bluetooth_AA:BB:CC:DD:EE:FF").constructor.name).toBe("WebBluetooth");
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
            expect(serial.canOpen(undefined)).toBe(true);
        });
    });

    describe("in a Tauri shell", () => {
        usePlatform();

        it("accepts a raw tcp:// target, which has a real transport here", () => {
            expect(serial.canOpen("tcp://192.168.4.1:5761")).toBe(true);
        });
    });
});
