import { describe, expect, it, vi, beforeEach } from "vitest";

// Force the Tauri shell so the protocol list registers both the Rust-backed raw-TCP
// slot and the WebSocket slot — the case the ws/wss vs tcp routing fix is about.
// Mutable so a second block can pin the Tauri Android slot table.
const platform = vi.hoisted(() => ({ isTauriIOS: true, isTauriAndroid: false, isTauriMacOS: false }));

vi.mock("../../src/js/utils/checkCompatibility.js", () => ({
    isAndroid: () => false,
    isTauri: () => true,
    isTauriIOS: () => platform.isTauriIOS,
    isTauriAndroid: () => platform.isTauriAndroid,
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
 * @param {{ios?: boolean, android?: boolean, macos?: boolean}} on - the platform to report;
 *   everything omitted is false, which is desktop Linux/Windows.
 * @returns {void}
 */
function usePlatform(on = {}) {
    beforeEach(async () => {
        platform.isTauriIOS = on.ios ?? false;
        platform.isTauriAndroid = on.android ?? false;
        platform.isTauriMacOS = on.macos ?? false;
        vi.resetModules();
        ({ serial } = await import("../../src/js/serial.js"));
    });
}

describe("serial.selectProtocol — Tauri transport routing", () => {
    usePlatform({ ios: true });

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

    it("does not register a USB serial slot on iOS", () => {
        // isTauriIOS() is true, so serial is excluded; a serial path resolves to undefined.
        expect(serial.selectProtocol("/dev/ttyACM0")).toBeUndefined();
    });

    it("routes a schemeless network host to the TCP slot when there is no serial transport (iOS)", () => {
        // A bare ELRS/bridge IP has no serial slot to fall back to on iOS, so it must reach TCP.
        expect(serial.selectProtocol("10.0.0.1").constructor.name).toBe("TauriTcp");
        expect(serial.selectProtocol("10.0.0.1:5761").constructor.name).toBe("TauriTcp");
        expect(serial.selectProtocol("elrs_rx.local:5761").constructor.name).toBe("TauriTcp");
        expect(serial.selectProtocol("[fe80::1]").constructor.name).toBe("TauriTcp");
        expect(serial.selectProtocol("[fe80::1]:5761").constructor.name).toBe("TauriTcp");
    });
});

describe("serial protocol slots — Tauri Android", () => {
    usePlatform({ android: true });

    it("uses the native serial transport", () => {
        expect(serial.selectProtocol("/dev/bus/usb/001/002").constructor.name).toBe("TauriSerial");
    });

    it("keeps the Rust-backed TCP and WebSocket slots distinct", () => {
        expect(serial.selectProtocol("tcp://192.168.0.10:5761").constructor.name).toBe("TauriTcp");
        expect(serial.selectProtocol("manual").constructor.name).toBe("TauriTcp");
        expect(serial.selectProtocol("wss://example.com:5761").constructor.name).toBe("Websocket");
    });

    it("uses the native BLE transport", () => {
        // The Android System WebView has no navigator.bluetooth, so WebBluetooth would be inert.
        expect(serial.selectProtocol("bluetooth_AA:BB:CC:DD:EE:FF").constructor.name).toBe("TauriBle");
    });

    it("still registers the virtual transport", () => {
        expect(serial.selectProtocol("virtual").constructor.name).toBe("VirtualSerial");
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
