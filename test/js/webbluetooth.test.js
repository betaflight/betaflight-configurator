import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
    expectNullTokenWhenDisconnected,
    expectTokenShape,
    expectResolveContract,
} from "./helpers/linkEventContract.js";

// ---------------------------------------------------------------------------
// WebBluetooth stable device identity (slice S1b-BLE).
//
// The old createPort() assigned `path: bluetooth_${portCounter++}` and
// loadDevices() reset the counter on every rebuild, so the path was an ordinal
// that could re-map to a different device across an FC-reboot device-list
// refresh. The stable identifier is the Web Bluetooth `device.id`. These tests
// prove:
//   (a) the same device.id yields the same path across repeated createPort and
//       across loadDevices() rebuilds (stability — the core bug),
//   (b) two different device.ids get distinct paths,
//   (c) the path still starts with "bluetooth" and selectProtocol routes it to
//       the BLE protocol,
//   (d) connect() resolves the right device by the stable path.
//
// `./devices`, localization and gui_log are mocked so WebBluetooth loads
// without its real import graph.
// ---------------------------------------------------------------------------

vi.mock("../../src/js/protocols/devices", () => ({
    bluetoothDevices: [
        {
            name: "CC2541",
            serviceUuid: "0000ffe0-0000-1000-8000-00805f9b34fb",
            writeCharacteristic: "0000ffe1-0000-1000-8000-00805f9b34fb",
            readCharacteristic: "0000ffe1-0000-1000-8000-00805f9b34fb",
        },
    ],
}));

vi.mock("../../src/js/localization", () => ({
    i18n: { getMessage: (k) => k },
}));

vi.mock("../../src/js/gui_log", () => ({
    gui_log: vi.fn(),
}));

// A minimal fake Web Bluetooth device. `id` is the browser's stable per-device
// identifier — the value the path must key off.
function makeFakeDevice(id = "abc123", name = "Speedybee") {
    const listeners = {};
    return {
        id,
        name,
        gatt: {
            connected: true,
            connect: vi.fn(async function () {
                return {
                    getPrimaryServices: vi.fn(async () => []),
                };
            }),
            disconnect: vi.fn(),
        },
        addEventListener: vi.fn((t, h) => {
            listeners[t] = h;
        }),
        removeEventListener: vi.fn(),
    };
}

beforeEach(() => {
    // Provide a navigator.bluetooth so the WebBluetooth constructor proceeds past
    // its feature-detection guard.
    globalThis.navigator = globalThis.navigator || {};
    Object.defineProperty(globalThis.navigator, "bluetooth", {
        configurable: true,
        value: {
            getAvailability: vi.fn(async () => true),
            requestDevice: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        },
    });
});

afterEach(() => {
    vi.resetModules();
});

async function loadWebBluetooth() {
    const mod = await import("../../src/js/protocols/WebBluetooth.js");
    return mod.default;
}

describe("WebBluetooth stable device identity", () => {
    it("(a) returns the same path for the same device.id across repeated createPort calls", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();

        const device = makeFakeDevice("dev-aaaa");
        const first = bt.createPort(device);
        const second = bt.createPort(device);

        expect(first.path).toBe("bluetooth_dev-aaaa");
        expect(second.path).toBe(first.path);
        expect(first.port).toBe(device);
    });

    it("(a) keeps the same path across loadDevices() rebuilds for the same device", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();

        const device = makeFakeDevice("dev-stable");
        // Seed the list as if the device had been discovered/paired.
        bt.devices = [bt.createPort(device)];
        const pathAfterFirst = bt.devices[0].path;

        // Simulate an FC-reboot refresh that rebuilds the device list.
        await bt.loadDevices();
        const pathAfterSecond = bt.devices[0].path;

        await bt.loadDevices();
        const pathAfterThird = bt.devices[0].path;

        expect(pathAfterSecond).toBe(pathAfterFirst);
        expect(pathAfterThird).toBe(pathAfterFirst);
        expect(bt.devices[0].port).toBe(device);
    });

    it("(b) assigns distinct paths to two different device.ids", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();

        const a = bt.createPort(makeFakeDevice("dev-1"));
        const b = bt.createPort(makeFakeDevice("dev-2"));

        expect(a.path).not.toBe(b.path);
        expect(a.path).toBe("bluetooth_dev-1");
        expect(b.path).toBe("bluetooth_dev-2");
    });

    it("(b) two devices sharing an id (paired again) collapse to the same stable path", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();

        // Across a reboot the browser hands back a fresh device object, but with
        // the same persistent id — the path must follow the id, not the object.
        const before = bt.createPort(makeFakeDevice("dev-same"));
        const after = bt.createPort(makeFakeDevice("dev-same"));

        expect(after.path).toBe(before.path);
    });

    it("(c) the path starts with 'bluetooth'", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();

        const { path } = bt.createPort(makeFakeDevice("dev-prefix"));
        expect(path.startsWith("bluetooth")).toBe(true);
    });

    it("removedDevice event carries the stable path of the removed device only", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();

        const deviceA = makeFakeDevice("dev-a");
        const deviceB = makeFakeDevice("dev-b");
        bt.devices = [bt.createPort(deviceA), bt.createPort(deviceB)];
        const pathA = bt.devices[0].path;
        const pathB = bt.devices[1].path;

        const removed = [];
        bt.addEventListener("removedDevice", (e) => removed.push(e.detail?.path));

        bt.handleRemovedDevice(deviceA);

        expect(removed).toEqual([pathA]);
        expect(removed).not.toContain(pathB);
        // B survives with its own stable path.
        expect(bt.devices.map((p) => p.path)).toEqual([pathB]);
    });

    it("(d) connect() resolves the right device by the stable path and sets connectionId to it", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();

        const deviceA = makeFakeDevice("dev-a");
        const deviceB = makeFakeDevice("dev-b");
        bt.devices = [bt.createPort(deviceA), bt.createPort(deviceB)];
        const pathB = bt.devices[1].path;

        // Stub the gatt/notification pipeline so connect() reaches the success path
        // without exercising the (unchanged) characteristic logic.
        bt.gattConnect = vi.fn(async () => {});
        bt.getServices = vi.fn(async () => {});
        bt.getCharacteristics = vi.fn(async () => {});
        bt.startNotifications = vi.fn(async () => {});

        await bt.connect(pathB, { baudRate: 115200 });

        expect(bt.device).toBe(deviceB);
        expect(bt.connectionId).toBe(pathB);
        expect(bt.connected).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// S6c — WebBluetooth openCanceled abort contract + token.
// ---------------------------------------------------------------------------

async function connectStubbed(bt, path) {
    // Stub the gatt/notification pipeline so connect() reaches the success path.
    bt.gattConnect = vi.fn(async () => {});
    bt.getServices = vi.fn(async () => {});
    bt.getCharacteristics = vi.fn(async () => {});
    bt.startNotifications = vi.fn(async () => {});
    await bt.connect(path, { baudRate: 115200 });
}

describe("S6c WebBluetooth openCanceled abort contract", () => {
    it("disconnect() during an in-flight open signals openCanceled without tearing down", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();

        // Simulate an open in flight: requested but not yet connected.
        bt.openRequested = true;
        bt.connected = false;

        const events = [];
        bt.addEventListener("disconnect", () => events.push("disconnect"));

        await bt.disconnect();

        expect(bt.openCanceled).toBe(true);
        // No teardown/disconnect emitted — the connect() coroutine handles abort.
        expect(events).toEqual([]);
    });

    it("a connect whose openCanceled was set resolves to connect:false, not connected", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();
        bt.devices = [bt.createPort(makeFakeDevice("dev-abort"))];

        // Cancel mid-open: set openCanceled during the gatt pipeline.
        bt.gattConnect = vi.fn(async () => {
            bt.openCanceled = true;
        });
        bt.getServices = vi.fn(async () => {});
        bt.getCharacteristics = vi.fn(async () => {});
        bt.startNotifications = vi.fn(async () => {});

        const results = [];
        bt.addEventListener("connect", (e) => results.push(e.detail));

        await bt.connect(bt.devices[0].path, { baudRate: 115200 });

        // The connected branch must NOT have been taken.
        expect(bt.connected).toBe(false);
    });
});

describe("S6c WebBluetooth reconnect-token contract", () => {
    it("returns null token when not connected", async () => {
        const WebBluetooth = await loadWebBluetooth();
        expectNullTokenWhenDisconnected(new WebBluetooth());
    });

    it("freezes the bluetooth path, baud and transport when connected", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();
        bt.devices = [bt.createPort(makeFakeDevice("dev-tok"))];
        const path = bt.devices[0].path;
        await connectStubbed(bt, path);

        expectTokenShape(bt, {
            transportType: "bluetooth",
            opaqueId: path,
            baud: 115200,
            isVirtual: false,
        });
    });

    it("resolveReconnectTarget matches a present device, null when gone or wrong transport", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();
        bt.devices = [bt.createPort(makeFakeDevice("dev-res"))];
        const path = bt.devices[0].path;

        expectResolveContract(bt, {
            token: { transportType: "bluetooth", opaqueId: path },
            resolvesTo: path,
            unknownToken: { transportType: "bluetooth", opaqueId: "bluetooth_gone" },
            wrongTransportToken: { transportType: "serial", opaqueId: path },
            expectNullToken: false,
        });
    });
});

describe("(c) selectProtocol routes the stable bluetooth path to the BLE protocol", () => {
    // Exercises the REAL serial.selectProtocol on the exported singleton, proving
    // the new "bluetooth_<id>" path falls through to the WebBluetooth protocol.
    it("routes bluetooth_<id> to the WebBluetooth protocol", async () => {
        const { serial } = await import("../../src/js/serial.js");

        expect(serial.selectProtocol("bluetooth_dev-aaaa").constructor.name).toBe("WebBluetooth");
        expect(serial.selectProtocol("bluetooth_abc123").constructor.name).toBe("WebBluetooth");
    });

    it("does not misroute it to serial/virtual/tcp", async () => {
        const { serial } = await import("../../src/js/serial.js");

        expect(serial.selectProtocol("bluetooth_dev-aaaa").constructor.name).not.toBe("WebSerial");
        expect(serial.selectProtocol("serial_0").constructor.name).toBe("WebSerial");
        expect(serial.selectProtocol("virtual").constructor.name).toBe("VirtualSerial");
        expect(serial.selectProtocol("tcp://127.0.0.1:5761").constructor.name).toBe("Websocket");
    });
});
