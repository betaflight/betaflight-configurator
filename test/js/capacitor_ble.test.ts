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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BluetoothDeviceProfile } from "../../src/js/protocols/devices";

// CapacitorBle bails out in its constructor without the native plugin, so provide a stub.
const { plugin, listeners, profiles } = vi.hoisted(() => {
    const listeners: Record<string, (event: never) => void> = {};
    const profiles: BluetoothDeviceProfile[] = [
        {
            name: "CC2541",
            serviceUuid: "ffe0",
            writeCharacteristic: "ffe1",
            readCharacteristic: "ffe2",
            susceptibleToCrcCorruption: true,
        },
        { name: "HM-10", serviceUuid: "ffe1", writeCharacteristic: "ffe1", readCharacteristic: "ffe1" },
    ];
    return {
        listeners,
        profiles,
        plugin: {
            addListener: vi.fn(async (name: string, listener: (event: never) => void) => {
                listeners[name] = listener;
                return { remove: vi.fn() };
            }),
            getDevices: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            send: vi.fn(),
        },
    };
});
vi.mock("@capacitor/core", () => ({ Capacitor: { Plugins: { BetaflightBle: plugin } } }));
vi.mock("../../src/js/protocols/devices", () => ({ bluetoothDevices: profiles }));

const { default: CapacitorBle } = await import("../../src/js/protocols/CapacitorBle");

const [CC2541, HM10] = profiles;
const scanned = {
    address: "AA:BB:CC:DD:EE:FF",
    name: "SpeedyBee",
    rssi: -60,
    serviceUuid: "ffe0",
    writeCharacteristic: "ffe1",
    notifyCharacteristic: "ffe2",
};
const PATH = "bluetooth-AA:BB:CC:DD:EE:FF";

afterEach(() => {
    vi.clearAllMocks();
    for (const mock of [plugin.getDevices, plugin.connect, plugin.disconnect, plugin.send]) {
        mock.mockReset();
    }
});

describe("CapacitorBle.shouldBypassCrc", () => {
    function susceptible() {
        const ble = new CapacitorBle();
        ble.deviceDescription = CC2541;
        return ble;
    }

    it("bypasses a received 0xff checksum when the computed one differs", () => {
        expect(susceptible().shouldBypassCrc(0xff, 0x12)).toBe(true);
    });

    it("does not bypass when the computed checksum is 0xff too, or the received one is not 0xff", () => {
        const ble = susceptible();

        expect(ble.shouldBypassCrc(0xff, 0xff)).toBe(false);
        expect(ble.shouldBypassCrc(0x12, 0x34)).toBe(false);
    });

    it("never bypasses for a module that is not susceptible", () => {
        const ble = new CapacitorBle();
        ble.deviceDescription = HM10;

        expect(ble.shouldBypassCrc(0xff, 0x12)).toBe(false);
    });
});

describe("CapacitorBle transport", () => {
    let ble: InstanceType<typeof CapacitorBle>;

    beforeEach(() => {
        plugin.getDevices.mockResolvedValue({ devices: [scanned] });
        plugin.connect.mockResolvedValue({ success: true });
        plugin.disconnect.mockResolvedValue({ success: true });
        ble = new CapacitorBle();
    });

    it("scans for every known service and lists each device by address", async () => {
        const devices = await ble.getDevices();

        expect(plugin.getDevices).toHaveBeenCalledWith({ serviceUuids: ["ffe0", "ffe1"] });
        expect(devices).toEqual([
            {
                path: PATH,
                displayName: "SpeedyBee",
                vendorId: 0,
                productId: 0,
                address: scanned.address,
                serviceUuid: "ffe0",
                writeCharacteristic: "ffe1",
                notifyCharacteristic: "ffe2",
                rssi: -60,
            },
        ]);
    });

    it("names an unnamed device after its address", async () => {
        plugin.getDevices.mockResolvedValue({ devices: [{ ...scanned, name: null }] });

        expect((await ble.getDevices())[0].displayName).toBe(scanned.address);
    });

    it("connects with the scanned characteristics and picks the matching profile", async () => {
        const connected = vi.fn();
        ble.addEventListener("connect", connected);

        expect(await ble.connect(PATH, { baudRate: 57600 })).toBe(true);

        expect(plugin.connect).toHaveBeenCalledWith({
            address: scanned.address,
            serviceUuid: "ffe0",
            writeCharacteristic: "ffe1",
            notifyCharacteristic: "ffe2",
        });
        expect(ble.connectionId).toBe(PATH);
        expect(ble.bitrate).toBe(57600);
        expect(ble.deviceDescription).toBe(CC2541);
        expect(ble.getConnectedDevice()?.path).toBe(PATH);
        expect(connected.mock.calls[0][0].detail).toBe(true);
    });

    it("reports an unknown path or a refused connect as false", async () => {
        const connected = vi.fn();
        ble.addEventListener("connect", connected);

        expect(await ble.connect("bluetooth-nope")).toBe(false);
        plugin.connect.mockResolvedValue({});
        expect(await ble.connect(PATH)).toBe(false);

        expect(ble.connected).toBe(false);
        expect(ble.connectionId).toBeNull();
        expect(connected.mock.calls.map(([event]) => event.detail)).toEqual([false, false]);
    });

    it("decodes received base64 into bytes and counts them", () => {
        const received = vi.fn();
        ble.addEventListener("receive", received);

        listeners.dataReceived({ data: btoa("\x24\x4d") } as never);

        expect(received.mock.calls[0][0].detail).toEqual(new Uint8Array([0x24, 0x4d]));
        expect(ble.bytesReceived).toBe(2);
    });

    it("sends nothing while disconnected", async () => {
        const callback = vi.fn();

        expect(await ble.send(new Uint8Array([1]), callback)).toEqual({ bytesSent: 0 });

        expect(plugin.send).not.toHaveBeenCalled();
        expect(callback).toHaveBeenCalledWith({ bytesSent: 0 });
    });

    it("sends base64, trusting the plugin's count and falling back to the length", async () => {
        await ble.connect(PATH);
        plugin.send.mockResolvedValueOnce({ bytesSent: 1 }).mockResolvedValueOnce({});

        expect(await ble.send(new Uint8Array([1, 2, 3]).buffer)).toEqual({ bytesSent: 1 });
        expect(await ble.send(new Uint8Array([1, 2, 3]))).toEqual({ bytesSent: 3 });

        expect(plugin.send).toHaveBeenCalledWith({ data: btoa("\x01\x02\x03") });
        expect(ble.bytesSent).toBe(4);
    });

    it("reports a link the native side lost as a disconnect", async () => {
        await ble.connect(PATH);
        const disconnected = vi.fn();
        ble.addEventListener("disconnect", disconnected);

        listeners.disconnected({ address: scanned.address, reason: "timeout" } as never);

        expect(ble.connected).toBe(false);
        expect(ble.connectionId).toBeNull();
        expect(disconnected.mock.calls[0][0].detail).toBe(true);
    });

    it("reports a failed connect when the native listeners could not be registered", async () => {
        const failure = new Error("bridge not ready");
        plugin.addListener.mockRejectedValueOnce(failure);
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        const unheard = new CapacitorBle();
        const connected = vi.fn();
        unheard.addEventListener("connect", connected);

        expect(await unheard.connect(PATH)).toBe(false);

        expect(plugin.connect).not.toHaveBeenCalled();
        expect(unheard.connectionId).toBeNull();
        expect(connected.mock.calls[0][0].detail).toBe(false);
        expect(logged).toHaveBeenCalledWith("[CAPACITORBLE] Failed to register the native listeners:", failure);
        logged.mockRestore();
    });
});
