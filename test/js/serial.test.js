import { describe, expect, it, vi, beforeEach } from "vitest";

// Force the Tauri shell so the protocol list registers both the Rust-backed raw-TCP
// slot and the WebSocket slot — the case the ws/wss vs tcp routing fix is about.
// Mutable so a second block can pin the Tauri Android slot table.
const platform = vi.hoisted(() => ({ isTauriIOS: true, isTauriAndroid: false }));

vi.mock("../../src/js/utils/checkCompatibility.js", () => ({
    isAndroid: () => false,
    isTauri: () => true,
    isTauriIOS: () => platform.isTauriIOS,
    isTauriAndroid: () => platform.isTauriAndroid,
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
// The singleton builds its slot table at module load, so reset the registry to pick up
// a changed platform.
/** @returns {Promise<void>} */
async function loadSerial() {
    vi.resetModules();
    ({ serial } = await import("../../src/js/serial.js"));
}

describe("serial.selectProtocol — Tauri transport routing", () => {
    beforeEach(async () => {
        platform.isTauriIOS = true;
        platform.isTauriAndroid = false;
        await loadSerial();
    });

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
    beforeEach(async () => {
        platform.isTauriIOS = false;
        platform.isTauriAndroid = true;
        await loadSerial();
    });

    it("uses the native serial transport", () => {
        expect(serial.selectProtocol("/dev/bus/usb/001/002").constructor.name).toBe("TauriSerial");
    });

    it("keeps the Rust-backed TCP and WebSocket slots distinct", () => {
        expect(serial.selectProtocol("tcp://192.168.0.10:5761").constructor.name).toBe("TauriTcp");
        expect(serial.selectProtocol("manual").constructor.name).toBe("TauriTcp");
        expect(serial.selectProtocol("wss://example.com:5761").constructor.name).toBe("Websocket");
    });

    it("registers no bluetooth slot", () => {
        // The Android System WebView has no Web Bluetooth and there is no native transport
        // yet, so nothing must be registered rather than a dead WebBluetooth instance.
        expect(serial.selectProtocol("bluetooth-AA:BB:CC:DD:EE:FF")).toBeUndefined();
    });

    it("still registers the virtual transport", () => {
        expect(serial.selectProtocol("virtual").constructor.name).toBe("VirtualSerial");
    });
});
