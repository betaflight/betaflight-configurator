import { describe, expect, it, vi, beforeEach } from "vitest";

// Force the Tauri shell so the protocol list registers both the Rust-backed raw-TCP
// slot and the WebSocket slot — the case the ws/wss vs tcp routing fix is about.
vi.mock("../../src/js/utils/checkCompatibility.js", () => ({
    isAndroid: () => false,
    isTauri: () => true,
    isTauriIOS: () => true,
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

let serial;
beforeEach(async () => {
    ({ serial } = await import("../../src/js/serial.js"));
});

describe("serial.selectProtocol — Tauri transport routing", () => {
    it("routes wss:// to the WebSocket protocol, not raw TCP", () => {
        expect(serial.selectProtocol("wss://example.com:5761").constructor.name).toBe("Websocket");
    });

    it("routes ws:// to the WebSocket protocol", () => {
        expect(serial.selectProtocol("ws://10.1.1.208:5761").constructor.name).toBe("Websocket");
    });

    it("routes raw tcp:// to the Rust-backed TauriTcp protocol", () => {
        expect(serial.selectProtocol("tcp://192.168.0.10:5761").constructor.name).toBe("TauriTcp");
    });

    it("routes a bare 'manual' selection to the TCP slot", () => {
        expect(serial.selectProtocol("manual").constructor.name).toBe("TauriTcp");
    });

    it("does not register a USB serial slot on iOS", () => {
        // isTauriIOS() is true, so serial is excluded; a serial path resolves to undefined.
        expect(serial.selectProtocol("/dev/ttyACM0")).toBeUndefined();
    });
});
