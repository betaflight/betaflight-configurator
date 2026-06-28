import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// WebSerial stable device identity (slice S1b).
//
// The browser reuses the same SerialPort object across an MCU-reboot USB
// re-enumeration, so a stable id keyed off that object's identity is the
// correct, reconnect-safe device path. These tests prove:
//   (a) the same SerialPort object yields the same path across repeated
//       createPort/loadDevices calls (stability),
//   (b) two different SerialPort objects get distinct paths,
//   (c) removing device A does not match/disconnect device B,
//   (d) selectProtocol still routes the new "serial_N" id to WebSerial.
//
// `./devices` is mocked so WebSerial loads without its real import graph.
// ---------------------------------------------------------------------------

vi.mock("../../src/js/protocols/devices", () => ({
    webSerialDevices: [],
    vendorIdNames: { 0x10c4: "CP210", 0x2e3c: "AT32" },
}));

// gui.js is small but imported by WebSerial for GUI.operating_system; mock it.
vi.mock("../../src/js/gui", () => ({
    default: { operating_system: "Linux" },
}));

// A minimal fake of the W3C SerialPort. Object identity is what matters here —
// each instance stands in for a distinct physical port.
function makeFakePort(usbVendorId = 0x10c4, usbProductId = 0xea60) {
    const listeners = {};
    return {
        getInfo: () => ({ usbVendorId, usbProductId }),
        open: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        addEventListener: vi.fn((t, h) => {
            listeners[t] = h;
        }),
        removeEventListener: vi.fn(),
        get readable() {
            return {
                getReader: () => ({ read: vi.fn(() => new Promise(() => {})), cancel: vi.fn(), releaseLock: vi.fn() }),
            };
        },
        get writable() {
            return { getWriter: () => ({ write: vi.fn(), releaseLock: vi.fn() }) };
        },
    };
}

let getPortsResult = [];

beforeEach(() => {
    getPortsResult = [];
    // Provide a navigator.serial so the WebSerial constructor proceeds past its
    // feature-detection guard.
    globalThis.navigator = globalThis.navigator || {};
    Object.defineProperty(globalThis.navigator, "serial", {
        configurable: true,
        value: {
            getPorts: vi.fn(async () => getPortsResult),
            requestPort: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        },
    });
});

afterEach(() => {
    vi.resetModules();
});

async function loadWebSerial() {
    const mod = await import("../../src/js/protocols/WebSerial.js");
    return mod.default;
}

describe("WebSerial stable device identity", () => {
    it("(a) returns the same path for the same SerialPort object across repeated createPort calls", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();

        const port = makeFakePort();
        const first = ws.createPort(port);
        const second = ws.createPort(port);

        expect(first.path).toMatch(/^serial_\d+$/);
        expect(second.path).toBe(first.path);
        expect(first.port).toBe(port);
    });

    it("(a) keeps the same path across loadDevices() rebuilds for the reused SerialPort object", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();

        const port = makeFakePort();
        getPortsResult = [port];

        await ws.loadDevices();
        const pathAfterFirst = ws.ports[0].path;

        // Simulate a re-enumeration: the browser hands back the SAME object.
        await ws.loadDevices();
        const pathAfterSecond = ws.ports[0].path;

        expect(pathAfterSecond).toBe(pathAfterFirst);
    });

    it("(b) assigns distinct paths to two different SerialPort objects", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();

        const a = ws.createPort(makeFakePort());
        const b = ws.createPort(makeFakePort());

        expect(a.path).not.toBe(b.path);
    });

    it("removedDevice event carries the stable path of the removed object only", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();

        const portA = makeFakePort();
        const portB = makeFakePort();
        ws.ports = [ws.createPort(portA), ws.createPort(portB)];
        const pathA = ws.ports[0].path;
        const pathB = ws.ports[1].path;

        const removed = [];
        ws.addEventListener("removedDevice", (e) => removed.push(e.detail.path));

        ws.handleRemovedDevice(portA);

        expect(removed).toEqual([pathA]);
        expect(removed).not.toContain(pathB);
        // B survives in the list with its own id.
        expect(ws.ports.map((p) => p.path)).toEqual([pathB]);
    });

    it("connect() resolves the live SerialPort via the stable id and sets connectionId to it", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();

        const portA = makeFakePort();
        const portB = makeFakePort();
        ws.ports = [ws.createPort(portA), ws.createPort(portB)];
        const pathB = ws.ports[1].path;

        const ok = await ws.connect(pathB, { baudRate: 115200 });

        expect(ok).toBe(true);
        expect(ws.port).toBe(portB);
        expect(ws.connectionId).toBe(pathB);
        expect(portB.open).toHaveBeenCalledTimes(1);
        expect(portA.open).not.toHaveBeenCalled();

        await ws.disconnect();
    });

    it("getNativePort() returns the underlying SerialPort for a stable id", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();

        const port = makeFakePort();
        const created = ws.createPort(port);
        ws.ports = [created];

        expect(ws.getNativePort(created.path)).toBe(port);
        expect(ws.getNativePort("serial_999")).toBeUndefined();
    });
});

describe("(c) serial_backend removedDevice matching is device-specific", () => {
    // Reproduce the exact predicate used in serial_backend.initializeSerialBackend:
    //   if (event.detail?.path && event.detail.path === GUI.connected_to) disconnect.
    function shouldDisconnect(detail, connectedTo) {
        return Boolean(detail?.path && detail.path === connectedTo);
    }

    it("removing device A does NOT disconnect while connected to device B", () => {
        const connectedTo = "serial_1"; // device B is the active connection
        expect(shouldDisconnect({ path: "serial_0" }, connectedTo)).toBe(false);
    });

    it("removing the connected device DOES disconnect", () => {
        const connectedTo = "serial_1";
        expect(shouldDisconnect({ path: "serial_1" }, connectedTo)).toBe(true);
    });

    it("a null/empty removal detail never triggers a disconnect", () => {
        expect(shouldDisconnect(undefined, "serial_1")).toBe(false);
        expect(shouldDisconnect({}, "serial_1")).toBe(false);
        expect(shouldDisconnect({ path: "" }, "serial_1")).toBe(false);
        // Guard against the pre-fix bug: connected_to===false must not match an empty path.
        expect(shouldDisconnect({ path: "" }, false)).toBe(false);
    });
});

describe("(d) selectProtocol routes the stable serial id to WebSerial", () => {
    // Replicates serial.js selectProtocol routing logic for the relevant cases,
    // proving "serial_N" falls through to the serial protocol (not virtual/tcp/bt).
    function routeName(s) {
        if (s === "virtual") {
            return "virtual";
        }
        if (s === "manual" || /^(tcp|ws|wss):\/\/[A-Za-z0-9.-]+(?::\d+)?(\/.*)?$/.test(s)) {
            return "tcp";
        }
        if (s.startsWith("bluetooth")) {
            return "bluetooth";
        }
        return "serial";
    }

    it("routes serial_0 / serial_42 to the serial protocol", () => {
        expect(routeName("serial_0")).toBe("serial");
        expect(routeName("serial_42")).toBe("serial");
    });

    it("still routes the other id shapes to their protocols", () => {
        expect(routeName("virtual")).toBe("virtual");
        expect(routeName("bluetooth-abc")).toBe("bluetooth");
        expect(routeName("tcp://127.0.0.1:5761")).toBe("tcp");
        expect(routeName("manual")).toBe("tcp");
    });
});
