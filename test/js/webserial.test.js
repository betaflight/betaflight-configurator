import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// WebSerial device identity.
//
// A path is the id of one SerialPort object. The id stays the same while the browser gives
// back the same object. The id changes if the device disconnects and connects again, because
// Chrome makes a new object. These tests show:
//   (a) the same SerialPort object gives the same path for each
//       createPort/loadDevices call (stability),
//   (b) two different SerialPort objects get different paths,
//   (c) the removal of device A does not disconnect device B,
//   (d) selectProtocol sends the new "serial_N" id to WebSerial.
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

        // The browser gives back the same object.
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

    // A plug-in gives a burst of connect events, and loadDevices() keeps only the port that
    // getPorts() reports. The other ports send a disconnect event later. The list does not hold
    // them, so an event for them carries no device. Such an event makes the listeners refresh
    // the list and warn for nothing.
    it("sends no removedDevice event for a port that is not in the list", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();

        const listed = makeFakePort();
        ws.ports = [ws.createPort(listed)];

        const removed = [];
        ws.addEventListener("removedDevice", (e) => removed.push(e.detail));

        ws.handleRemovedDevice(makeFakePort());

        expect(removed).toEqual([]);
        expect(ws.ports).toHaveLength(1);
    });

    // A burst of device events starts several refreshes at once. getPorts() gives no order
    // guarantee, so an older call can finish last and put a list back that no longer applies.
    it("does not let a slow refresh replace a newer device list", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const older = makeFakePort();
        const newer = makeFakePort();
        let resolveSlow;
        navigator.serial.getPorts
            .mockImplementationOnce(() => new Promise((resolve) => (resolveSlow = resolve)))
            .mockImplementationOnce(async () => [newer]);

        const slow = ws.loadDevices();
        await ws.loadDevices();

        expect(ws.ports.map((device) => device.port)).toEqual([newer]);

        resolveSlow([older]);
        await slow;

        expect(ws.ports.map((device) => device.port)).toEqual([newer]);
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

describe("(d) selectProtocol routes the stable serial id to WebSerial", () => {
    // Exercises the REAL serial.selectProtocol on the exported singleton, proving
    // "serial_N" falls through to the WebSerial protocol (not virtual/tcp/bt).
    it("routes serial_0 / serial_42 to the WebSerial protocol", async () => {
        const { serial } = await import("../../src/js/serial.js");

        expect(serial.selectProtocol("serial_0").constructor.name).toBe("WebSerial");
        expect(serial.selectProtocol("serial_42").constructor.name).toBe("WebSerial");
    });

    it("still routes the other id shapes to their protocols", async () => {
        const { serial } = await import("../../src/js/serial.js");

        expect(serial.selectProtocol("virtual").constructor.name).toBe("VirtualSerial");
        expect(serial.selectProtocol("bluetooth-abc").constructor.name).toBe("WebBluetooth");
        expect(serial.selectProtocol("tcp://127.0.0.1:5761").constructor.name).toBe("Websocket");
        expect(serial.selectProtocol("manual").constructor.name).toBe("Websocket");
    });

    it("routes the function/callback (virtual) form via the isFn branch", async () => {
        const { serial } = await import("../../src/js/serial.js");

        // The omitted-in-copy branch: a function argument must select VirtualSerial.
        expect(serial.selectProtocol(() => {}).constructor.name).toBe("VirtualSerial");
    });
});
