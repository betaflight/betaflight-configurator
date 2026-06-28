import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
    expectSupportsLinkEvents,
    expectNullTokenWhenDisconnected,
    expectTokenShape,
    expectResolveContract,
    expectClosedOnIntentionalDisconnect,
    expectLostOnUnsolicitedDrop,
} from "./helpers/linkEventContract.js";

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

// ---------------------------------------------------------------------------
// S6a — WebSerial LinkEvent adapter + reconnect-token contract.
//
// The transport now emits the normalized LinkEvent vocabulary
// (open/closed/lost/data/deviceArrived/deviceLeft) ALONGSIDE the legacy events,
// and exposes getReconnectToken()/resolveReconnectTarget() so the FSM (S2) can
// freeze a device identity and re-resolve it after a reboot without reading the
// live port picker.
// ---------------------------------------------------------------------------

// A port whose reader yields the given chunks then completes, so we can drive
// the read loop and observe `data` LinkEvents.
function makeStreamingPort(chunks, usbVendorId = 0x10c4, usbProductId = 0xea60) {
    let i = 0;
    const reader = {
        read: vi.fn(async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true })),
        cancel: vi.fn().mockResolvedValue(undefined),
        releaseLock: vi.fn(),
        locked: false,
    };
    return {
        getInfo: () => ({ usbVendorId, usbProductId }),
        open: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        get readable() {
            return { getReader: () => reader };
        },
        get writable() {
            return { getWriter: () => ({ write: vi.fn(), releaseLock: vi.fn() }) };
        },
    };
}

describe("S6a WebSerial LinkEvent adapter", () => {
    it("declares LinkEvent support", async () => {
        const WebSerial = await loadWebSerial();
        expectSupportsLinkEvents(new WebSerial());
    });

    it("emits deviceArrived on a new device and deviceLeft on removal", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();

        const arrived = [];
        const left = [];
        ws.addEventListener("deviceArrived", (e) => arrived.push(e.detail.path));
        ws.addEventListener("deviceLeft", (e) => left.push(e.detail?.path));

        const port = makeFakePort();
        const added = ws.handleNewDevice(port);
        expect(arrived).toEqual([added.path]);

        ws.handleRemovedDevice(port);
        expect(left).toEqual([added.path]);
    });

    it("emits open on a successful connect", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();
        ws.ports = [ws.createPort(makeFakePort())];

        let opened = false;
        ws.addEventListener("open", () => (opened = true));

        await ws.connect(ws.ports[0].path, { baudRate: 115200 });
        expect(opened).toBe(true);

        await ws.disconnect();
    });

    it("emits closed on an intentional disconnect", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();
        ws.ports = [ws.createPort(makeFakePort())];
        await ws.connect(ws.ports[0].path, { baudRate: 115200 });

        await expectClosedOnIntentionalDisconnect(ws, () => ws.disconnect());
    });

    it("emits lost (not closed) when the device disconnects externally", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();
        ws.ports = [ws.createPort(makeFakePort())];
        await ws.connect(ws.ports[0].path, { baudRate: 115200 });

        // Simulate the W3C 'disconnect' (cable pull / device reboot) path.
        await expectLostOnUnsolicitedDrop(ws, () => ws.handleDisconnect());
    });

    it("resets the lost flag so a later intentional close reads as closed", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();
        // Keep a handle to the port object; the constructor's async loadDevices()
        // may repopulate ws.ports, so we re-seed it before the reconnect.
        const port = makeFakePort();
        ws.ports = [ws.createPort(port)];
        const path = ws.ports[0].path;

        // First connection lost.
        await ws.connect(path, { baudRate: 115200 });
        ws.handleDisconnect();
        await vi.waitFor(() => expect(ws._linkLost).toBe(false));

        // Reconnect and close intentionally.
        ws.ports = [ws.createPort(port)];
        await ws.connect(path, { baudRate: 115200 });
        const events = [];
        ws.addEventListener("closed", () => events.push("closed"));
        ws.addEventListener("lost", () => events.push("lost"));
        await ws.disconnect();
        expect(events).toEqual(["closed"]);
    });

    it("emits data LinkEvents as the read loop yields chunks", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();
        const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])];
        const port = makeStreamingPort(chunks);
        ws.ports = [ws.createPort(port)];

        const received = [];
        ws.addEventListener("data", (e) => received.push(e.detail));

        await ws.connect(ws.ports[0].path, { baudRate: 115200 });
        await vi.waitFor(() => expect(received.length).toBe(chunks.length));
        expect(received).toEqual(chunks);

        await ws.disconnect();
    });
});

describe("S6a WebSerial reconnect-token contract", () => {
    it("getReconnectToken returns null when not connected", async () => {
        const WebSerial = await loadWebSerial();
        expectNullTokenWhenDisconnected(new WebSerial());
    });

    it("getReconnectToken freezes the stable id, baud and transport when connected", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();
        ws.ports = [ws.createPort(makeFakePort())];
        const path = ws.ports[0].path;

        await ws.connect(path, { baudRate: 230400 });
        expectTokenShape(ws, {
            transportType: "serial",
            opaqueId: path,
            baud: 230400,
            isVirtual: false,
        });

        await ws.disconnect();
    });

    it("resolveReconnectTarget returns the current path for a known token, null for unknown id / wrong transport", async () => {
        const WebSerial = await loadWebSerial();
        const ws = new WebSerial();
        const port = makeFakePort();
        ws.ports = [ws.createPort(port)];
        const path = ws.ports[0].path;

        // Simulate a re-enumeration: the browser hands back the SAME object, so
        // the stable id is preserved and the token still resolves.
        ws.ports = [ws.createPort(port)];

        expectResolveContract(ws, {
            token: { transportType: "serial", opaqueId: path },
            resolvesTo: path,
            unknownToken: { transportType: "serial", opaqueId: "serial_999" },
            wrongTransportToken: { transportType: "bluetooth", opaqueId: path },
        });
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

describe("S6a serial.js forwards LinkEvents and delegates the token contract", () => {
    // Exercises the REAL serial singleton: the WebSerial protocol opts into
    // LinkEvents, so serial.js must re-dispatch them with a `protocolType` tag.
    it("forwards open/closed/lost/deviceArrived/deviceLeft with protocolType", async () => {
        const { serial } = await import("../../src/js/serial.js");
        const ws = serial._protocols.find((p) => p.name === "serial").instance;

        for (const type of ["open", "closed", "lost", "deviceArrived", "deviceLeft"]) {
            let detail = null;
            const handler = (e) => (detail = e.detail);
            serial.addEventListener(type, handler);
            ws.dispatchEvent(new CustomEvent(type, { detail: { marker: type } }));
            serial.removeEventListener(type, handler);

            expect(detail).toEqual({ marker: type, protocolType: "serial" });
        }
    });

    it("re-wraps a `data` LinkEvent as { data, protocolType } like legacy receive", async () => {
        const { serial } = await import("../../src/js/serial.js");
        const ws = serial._protocols.find((p) => p.name === "serial").instance;

        let detail = null;
        const handler = (e) => (detail = e.detail);
        serial.addEventListener("data", handler);
        const chunk = new Uint8Array([9, 9]);
        ws.dispatchEvent(new CustomEvent("data", { detail: chunk }));
        serial.removeEventListener("data", handler);

        expect(detail).toEqual({ data: chunk, protocolType: "serial" });
    });

    it("delegates resolveReconnectTarget to the transport named by the token", async () => {
        const { serial } = await import("../../src/js/serial.js");
        const ws = serial._protocols.find((p) => p.name === "serial").instance;

        const port = makeFakePort();
        ws.ports = [ws.createPort(port)];
        const path = ws.ports[0].path;

        expect(serial.resolveReconnectTarget({ transportType: "serial", opaqueId: path })).toBe(path);
        expect(serial.resolveReconnectTarget({ transportType: "serial", opaqueId: "serial_999" })).toBeNull();
        expect(serial.resolveReconnectTarget(null)).toBeNull();
    });
});
