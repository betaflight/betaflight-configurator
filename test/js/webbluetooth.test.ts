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

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { BleDevice } from "../../src/js/protocols/WebBluetooth";
import type { BluetoothDeviceProfile } from "../../src/js/protocols/devices";

// ---------------------------------------------------------------------------
// WebBluetooth stable device identity.
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
            // Matches the real CC2541 profile in devices.ts.
            readCharacteristic: "0000ffe2-0000-1000-8000-00805f9b34fb",
        },
    ],
}));

vi.mock("../../src/js/localization", () => ({
    i18n: { getMessage: (k: string) => k },
}));

vi.mock("../../src/js/gui_log", () => ({
    gui_log: vi.fn(),
}));

// A minimal fake Web Bluetooth device. `id` is the browser's stable per-device
// identifier — the value the path must key off.
function makeFakeDevice(id = "abc123", name = "Speedybee", services: unknown[] = []) {
    const listeners: Record<string, unknown> = {};
    const fake = {
        id,
        name,
        gatt: {
            connected: true,
            connect: vi.fn(async function () {
                return {
                    getPrimaryServices: vi.fn(async () => services),
                };
            }),
            disconnect: vi.fn(),
        },
        addEventListener: vi.fn((t: string, h: unknown) => {
            listeners[t] = h;
        }),
        removeEventListener: vi.fn(),
    };
    // A partial fake: the transport never calls dispatchEvent on a device.
    return fake as typeof fake & BleDevice;
}

/** A CustomEvent's detail, read off the plain Event a listener is typed with. */
const detail = <T>(event: Event): T => (event as CustomEvent<T>).detail;

beforeEach(() => {
    // Provide a navigator.bluetooth so the WebBluetooth constructor proceeds past
    // its feature-detection guard.
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
    const mod = await import("../../src/js/protocols/WebBluetooth");
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

        const removed: (string | undefined)[] = [];
        bt.addEventListener("removedDevice", (e) => removed.push(detail<{ path: string } | undefined>(e)?.path));

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
        bt.gattConnect = vi.fn(async () => undefined);
        bt.getServices = vi.fn(async () => undefined);
        bt.getCharacteristics = vi.fn(async () => undefined);
        bt.startNotifications = vi.fn(async () => undefined);

        await bt.connect(pathB, { baudRate: 115200 });

        expect(bt.device).toBe(deviceB);
        expect(bt.connectionId).toBe(pathB);
        expect(bt.connected).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// WebBluetooth openCanceled abort contract.
// ---------------------------------------------------------------------------

describe("WebBluetooth openCanceled abort contract", () => {
    it("disconnect() during an in-flight open signals openCanceled without tearing down", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();

        // Simulate an open in flight: requested but not yet connected.
        bt.openRequested = true;
        bt.connected = false;

        const events: unknown[] = [];
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

        // Cancel mid-open: set openCanceled during the gatt pipeline. The GATT link
        // did not establish (canceled), so gatt.connected stays false — the
        // synchronous abort branch that emits connect:false.
        bt.gattConnect = vi.fn(async () => {
            bt.openCanceled = true;
            (bt.device!.gatt as { connected: boolean }).connected = false;
        });
        bt.getServices = vi.fn(async () => undefined);
        bt.getCharacteristics = vi.fn(async () => undefined);
        bt.startNotifications = vi.fn(async () => undefined);

        const results: unknown[] = [];
        bt.addEventListener("connect", (e) => results.push(detail(e)));

        await bt.connect(bt.devices[0].path, { baudRate: 115200 });

        // The connected branch must NOT have been taken...
        expect(bt.connected).toBe(false);
        // ...and the abort must emit connect:false explicitly, so serial_backend runs
        // its failed-open teardown rather than a silent no-event regression slipping by.
        expect(results).toContain(false);
    });

    it("disconnect() on a clean close resolves true (not coerced to false like the other transports)", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();

        const events: unknown[] = [];
        bt.addEventListener("disconnect", (e) => events.push(detail(e)));

        // Normal teardown path (no in-flight open, nothing already closing). Serial.disconnect()
        // does `(await protocol.disconnect()) ?? false`, so an undefined return would report a
        // successful BLE disconnect as a failure — this pins the explicit true.
        const result = await bt.disconnect();

        expect(result).toBe(true);
        expect(events).toEqual([true]);
    });
});

describe("WebBluetooth notification teardown (deaf-session prevention)", () => {
    // Chrome keeps a notify session marked active per characteristic; if it is not
    // explicitly stopped before gatt.disconnect(), startNotifications() on the NEXT
    // connection can resolve without re-arming the CCCD on Linux/BlueZ — a session
    // that looks subscribed but never receives, breaking plain disconnect/connect.
    function makeReadCharacteristic() {
        return {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            stopNotifications: vi.fn(async () => undefined),
            properties: { notify: true },
        };
    }

    it("stops notifications before dropping a still-connected GATT link", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();
        const device = makeFakeDevice("dev-notify");
        bt.devices = [bt.createPort(device)];
        bt.device = device;
        const characteristic = makeReadCharacteristic();
        // A partial fake: teardown only removes its listener and stops notifications.
        bt.readCharacteristic = characteristic as unknown as NonNullable<typeof bt.readCharacteristic>;

        await bt.disconnect();

        expect(characteristic.stopNotifications).toHaveBeenCalledTimes(1);
        expect(bt.readCharacteristic).toBeNull(); // teardown completed
        expect(device.gatt.disconnect).toHaveBeenCalled();
        // Order is the regression: notifications must stop BEFORE the link drops, or the
        // next connection's startNotifications() can no-op on BlueZ (deaf session).
        expect(characteristic.stopNotifications.mock.invocationCallOrder[0]).toBeLessThan(
            device.gatt.disconnect.mock.invocationCallOrder[0],
        );
    });
});

describe("WebBluetooth listener hygiene (no leak across reconnects)", () => {
    it("removes the gattserverdisconnected/disconnect listeners with the same bound reference they were added with", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();
        const device = makeFakeDevice("dev-leak");
        bt.devices = [bt.createPort(device)];

        // Drive connect() to the "connected" branch (both device listeners get added).
        bt.gattConnect = vi.fn(async () => undefined);
        bt.getServices = vi.fn(async () => undefined);
        bt.getCharacteristics = vi.fn(async () => undefined);
        bt.startNotifications = vi.fn(async () => undefined);

        await bt.connect("bluetooth_dev-leak", { baudRate: 115200 });
        await bt.disconnect();

        const deviceEvents = ["gattserverdisconnected", "disconnect"];
        const added = device.addEventListener.mock.calls.filter(([t]) => deviceEvents.includes(t));
        const removed = device.removeEventListener.mock.calls.filter(([t]) => deviceEvents.includes(t));

        // Every listener is added AND removed using the one constructor-bound reference; a
        // fresh `.bind(this)` per call would make removeEventListener a no-op and leak a
        // listener on every reconnect.
        expect(added.length).toBeGreaterThan(0);
        expect(removed).toHaveLength(added.length);
        for (const [, handler] of [...added, ...removed]) {
            expect(handler).toBe(bt.handleDisconnect);
        }
    });
});

describe("WebBluetooth characteristic selection on the FFE0 service", () => {
    const FFE0 = "0000ffe0-0000-1000-8000-00805f9b34fb";
    const FFE1 = "0000ffe1-0000-1000-8000-00805f9b34fb";
    const FFE2 = "0000ffe2-0000-1000-8000-00805f9b34fb";
    const GAP = "00001800-0000-1000-8000-00805f9b34fb";

    type ValueChangedHandler = (event: { target: { value: DataView } }) => void;

    function makeCharacteristic(
        uuid: string,
        properties: { write?: boolean; writeWithoutResponse?: boolean; notify?: boolean },
    ) {
        let onValueChanged: ValueChangedHandler | undefined;
        return {
            uuid,
            properties,
            addEventListener: vi.fn((type: string, handler: ValueChangedHandler) => {
                if (type === "characteristicvaluechanged") {
                    onValueChanged = handler;
                }
            }),
            removeEventListener: vi.fn(),
            startNotifications: vi.fn(async () => undefined),
            stopNotifications: vi.fn(async () => undefined),
            writeValue: vi.fn(async () => undefined),
            emit(bytes: number[]) {
                const value = new DataView(new Uint8Array(bytes).buffer);
                onValueChanged?.({ target: { value } });
            },
        };
    }

    type FakeCharacteristic = ReturnType<typeof makeCharacteristic>;

    async function connectTo(characteristics: FakeCharacteristic[]) {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();
        // FFE0 sits behind an unrelated service so service discovery has to pick it.
        const device = makeFakeDevice("dev-ffe0", "TMOTORFC_009U9", [
            { uuid: GAP, getCharacteristics: vi.fn(async () => []) },
            { uuid: FFE0, getCharacteristics: vi.fn(async () => characteristics) },
        ]);
        bt.devices = [bt.createPort(device)];
        const results: unknown[] = [];
        bt.addEventListener("connect", (e) => results.push(detail(e)));
        await bt.connect("bluetooth_dev-ffe0", { baudRate: 115200 });
        return { bt, results };
    }

    // Measured on a T-Motor Velox F7 SE: FFE0 holds FFE1 (write, notify), FF02 (write) and
    // FF03 (write, notify, the module's AT channel). The FC answers MSP on FFE1.
    function tmotorModule() {
        const ffe1 = makeCharacteristic(FFE1, { write: true, writeWithoutResponse: true, notify: true });
        const characteristics = [
            makeCharacteristic("0000ff03-0000-1000-8000-00805f9b34fb", {
                write: true,
                writeWithoutResponse: true,
                notify: true,
            }),
            makeCharacteristic("0000ff02-0000-1000-8000-00805f9b34fb", { write: true, writeWithoutResponse: true }),
            ffe1,
        ];
        return { ffe1, characteristics };
    }

    it("connects to a module that carries both directions on FFE1 and has no FFE2", async () => {
        const { ffe1, characteristics } = tmotorModule();
        const { bt, results } = await connectTo(characteristics);

        expect(results).toEqual([true]);
        expect(bt.connected).toBe(true);
        expect(bt.writeCharacteristic).toBe(ffe1);
        expect(bt.readCharacteristic).toBe(ffe1);
        expect(ffe1.startNotifications).toHaveBeenCalledTimes(1);
    });

    it("delivers bytes notified on FFE1 as a receive event", async () => {
        const { ffe1, characteristics } = tmotorModule();
        const { bt } = await connectTo(characteristics);
        const received: number[][] = [];
        bt.addEventListener("receive", (e) => received.push(Array.from(detail<Uint8Array>(e))));

        // MSP_API_VERSION reply: protocol 0, API 1.48.
        ffe1.emit([0x24, 0x4d, 0x3e, 0x03, 0x01, 0x00, 0x01, 0x30, 0x33]);

        expect(received).toEqual([[0x24, 0x4d, 0x3e, 0x03, 0x01, 0x00, 0x01, 0x30, 0x33]]);
    });

    it("does not use a write characteristic that cannot notify as the read characteristic", async () => {
        const { bt, results } = await connectTo([makeCharacteristic(FFE1, { write: true })]);

        expect(results).toEqual([false]);
        expect(bt.connected).toBe(false);
    });

    it("still reads from FFE2 when the module has it", async () => {
        const ffe1 = makeCharacteristic(FFE1, { write: true, notify: true });
        const ffe2 = makeCharacteristic(FFE2, { notify: true });

        const { bt, results } = await connectTo([ffe1, ffe2]);

        expect(results).toEqual([true]);
        expect(bt.writeCharacteristic).toBe(ffe1);
        expect(bt.readCharacteristic).toBe(ffe2);
        expect(ffe1.startNotifications).not.toHaveBeenCalled();
    });

    it("stops notifications once on disconnect when one characteristic serves both directions", async () => {
        const { ffe1, characteristics } = tmotorModule();
        const { bt } = await connectTo(characteristics);

        await bt.disconnect();

        expect(ffe1.stopNotifications).toHaveBeenCalledTimes(1);
        expect(bt.readCharacteristic).toBeNull();
        expect(bt.writeCharacteristic).toBeNull();
    });
});

describe("(c) selectProtocol routes the stable bluetooth path to the BLE protocol", () => {
    // Exercises the REAL serial.selectProtocol on the exported singleton, proving
    // the new "bluetooth_<id>" path falls through to the WebBluetooth protocol.
    it("routes bluetooth_<id> to the WebBluetooth protocol", async () => {
        const { serial } = await import("../../src/js/serial");

        expect(serial.selectProtocol("bluetooth_dev-aaaa")?.constructor.name).toBe("WebBluetooth");
        expect(serial.selectProtocol("bluetooth_abc123")?.constructor.name).toBe("WebBluetooth");
    });

    it("does not misroute it to serial/virtual/tcp", async () => {
        const { serial } = await import("../../src/js/serial");

        expect(serial.selectProtocol("bluetooth_dev-aaaa")?.constructor.name).not.toBe("WebSerial");
        expect(serial.selectProtocol("serial_0")?.constructor.name).toBe("WebSerial");
        expect(serial.selectProtocol("virtual")?.constructor.name).toBe("VirtualSerial");
        expect(serial.selectProtocol("tcp://127.0.0.1:5761")?.constructor.name).toBe("Websocket");
    });
});

describe("WebBluetooth.shouldBypassCrc", () => {
    async function connectedSusceptible() {
        const WebBluetooth = await loadWebBluetooth();
        const ble = new WebBluetooth();
        ble.connected = true;
        ble.deviceDescription = { name: "CC2541", susceptibleToCrcCorruption: true } as BluetoothDeviceProfile;
        return ble;
    }

    it("bypasses a received 0xff checksum when the computed one differs", async () => {
        const ble = await connectedSusceptible();

        expect(ble.shouldBypassCrc(0xff, 0x12)).toBe(true);
    });

    it("does not bypass when the computed checksum is 0xff too, or the received one is not 0xff", async () => {
        const ble = await connectedSusceptible();

        expect(ble.shouldBypassCrc(0xff, 0xff)).toBe(false);
        expect(ble.shouldBypassCrc(0x12, 0x34)).toBe(false);
    });
});

describe("WebBluetooth fixes surfaced by the TypeScript conversion", () => {
    it("a cancelled open whose GATT link came up reports connect:false after closing it", async () => {
        vi.useFakeTimers();
        try {
            const WebBluetooth = await loadWebBluetooth();
            const bt = new WebBluetooth();
            const device = makeFakeDevice("dev-late");
            bt.devices = [bt.createPort(device)];
            // The link comes up (gatt.connected stays true) but the open was cancelled meanwhile.
            bt.gattConnect = vi.fn(async () => {
                bt.openCanceled = true;
            });
            bt.getServices = vi.fn(async () => undefined);
            bt.getCharacteristics = vi.fn(async () => undefined);
            bt.startNotifications = vi.fn(async () => undefined);
            const results: unknown[] = [];
            bt.addEventListener("connect", (e) => results.push(detail(e)));

            await bt.connect("bluetooth_dev-late", { baudRate: 115200 });
            expect(results).toEqual([]);

            await vi.advanceTimersByTimeAsync(150);

            expect(results).toEqual([false]);
            expect(bt.connected).toBe(false);
            expect(device.gatt.disconnect).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("names a device that advertises no name after its id", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();
        const device = makeFakeDevice("dev-nameless", "");

        expect(bt.createPort(device).displayName).toBe("dev-nameless");
    });

    it("names the expected characteristic when the service lacks it", async () => {
        const WebBluetooth = await loadWebBluetooth();
        const bt = new WebBluetooth();
        bt.deviceDescription = {
            name: "CC2541",
            serviceUuid: "ffe0",
            writeCharacteristic: "ffe1",
            readCharacteristic: "ffe2",
        };
        bt.service = { uuid: "ffe0", getCharacteristics: vi.fn(async () => []) };

        await expect(bt.getCharacteristics()).rejects.toThrow("should be ffe1");
    });
});
