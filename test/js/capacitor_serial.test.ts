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

const { plugin, listeners } = vi.hoisted(() => {
    const listeners: Record<string, (event: never) => void> = {};
    return {
        listeners,
        plugin: {
            addListener: vi.fn(async (name: string, listener: (event: never) => void) => {
                listeners[name] = listener;
                return { remove: vi.fn() };
            }),
            getDevices: vi.fn(),
            requestPermission: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            write: vi.fn(),
        },
    };
});
vi.mock("@capacitor/core", () => ({ Capacitor: { Plugins: { BetaflightSerial: plugin } } }));

const { default: CapacitorSerial } = await import("../../src/js/protocols/CapacitorSerial");

const device = {
    deviceId: "1155:22336:1002",
    vendorId: 1155,
    productId: 22336,
    deviceName: "/dev/bus/usb/001/002",
    deviceClass: 2,
    deviceSubclass: 0,
    product: "STM32 VCP",
};
const PATH = "capacitor-1155:22336:1002";

describe("CapacitorSerial", () => {
    let serial: InstanceType<typeof CapacitorSerial>;

    beforeEach(async () => {
        plugin.getDevices.mockResolvedValue({ devices: [device] });
        plugin.connect.mockResolvedValue({ success: true });
        plugin.disconnect.mockResolvedValue({ success: true });
        plugin.write.mockImplementation(async ({ data }: { data: string }) => ({ bytesSent: data.length / 2 }));
        serial = new CapacitorSerial();
        await serial.getDevices();
    });

    afterEach(() => {
        vi.clearAllMocks();
        for (const mock of Object.values(plugin)) {
            mock.mockReset();
        }
    });

    it("lists a device under its native key, named after the product", () => {
        expect(serial.ports).toEqual([
            { path: PATH, displayName: "Betaflight STM32 VCP", vendorId: 1155, productId: 22336, device },
        ]);
    });

    it.each([
        [{ manufacturer: "STMicroelectronics" }, "Betaflight STMicroelectronics"],
        [{}, "Betaflight VID:1155 PID:22336"],
    ])("falls back to the manufacturer, then the ids, for a nameless device", (names, displayName) => {
        const { product: _product, ...nameless } = device;

        expect(serial.getDisplayName({ ...nameless, ...names })).toBe(displayName);
    });

    it("adds an attached device once", () => {
        const added = vi.fn();
        serial.addEventListener("addedDevice", added);
        const other = { ...device, deviceId: "1:2:3" };

        listeners.deviceAttached(other as never);
        listeners.deviceAttached(other as never);
        listeners.deviceAttached(device as never);

        expect(added).toHaveBeenCalledTimes(1);
        expect(serial.ports.map((port) => port.path)).toEqual([PATH, "capacitor-1:2:3"]);
    });

    it("connects with the native device id and reports the USB ids", async () => {
        const connected = vi.fn();
        serial.addEventListener("connect", connected);

        expect(await serial.connect(PATH, { baudRate: 57600 })).toBe(true);

        expect(plugin.connect).toHaveBeenCalledWith({ deviceId: device.deviceId, baudRate: 57600 });
        expect(serial.connectionId).toBe(PATH);
        expect(serial.bitrate).toBe(57600);
        expect(connected.mock.calls[0][0].detail).toEqual({ usbVendorId: 1155, usbProductId: 22336 });
    });

    it("defaults to 115200 baud", async () => {
        await serial.connect(PATH);

        expect(plugin.connect).toHaveBeenCalledWith({ deviceId: device.deviceId, baudRate: 115200 });
    });

    it("fails to connect to an unknown path or when the plugin reports failure", async () => {
        const connected = vi.fn();
        serial.addEventListener("connect", connected);

        expect(await serial.connect("capacitor-nope")).toBe(false);
        plugin.connect.mockResolvedValue({ success: false, error: "busy" });
        expect(await serial.connect(PATH)).toBe(false);

        expect(serial.connected).toBe(false);
        expect(connected.mock.calls.map(([event]) => event.detail)).toEqual([false, false]);
    });

    it("decodes received hex and counts the bytes", () => {
        const received = vi.fn();
        serial.addEventListener("receive", received);

        listeners.dataReceived({ data: "0a0bff" } as never);

        expect(received.mock.calls[0][0].detail).toEqual(new Uint8Array([0x0a, 0x0b, 0xff]));
        expect(serial.bytesReceived).toBe(3);
    });

    it("sends nothing while disconnected", async () => {
        const callback = vi.fn();

        expect(await serial.send(new Uint8Array([1]), callback)).toEqual({ bytesSent: 0 });

        expect(plugin.write).not.toHaveBeenCalled();
        expect(callback).toHaveBeenCalledWith({ bytesSent: 0 });
    });

    it("writes hex and reports the bytes the plugin wrote", async () => {
        await serial.connect(PATH);
        const callback = vi.fn();

        expect(await serial.send(new Uint8Array([0x24, 0x4d]).buffer, callback)).toEqual({ bytesSent: 2 });

        expect(plugin.write).toHaveBeenCalledWith({ data: "244d" });
        expect(callback).toHaveBeenCalledWith({ bytesSent: 2 });
        expect(serial.bytesSent).toBe(2);
    });

    it("drops the connection when the connected device is detached", async () => {
        await serial.connect(PATH);
        const disconnected = vi.fn();
        const removed = vi.fn();
        serial.addEventListener("disconnect", disconnected);
        serial.addEventListener("removedDevice", removed);

        listeners.deviceDetached(device as never);

        expect(serial.connected).toBe(false);
        expect(serial.currentDevice).toBeNull();
        expect(serial.ports).toEqual([]);
        expect(disconnected.mock.calls[0][0].detail).toBe(true);
        expect(removed.mock.calls[0][0].detail.path).toBe(PATH);
        expect(plugin.disconnect).not.toHaveBeenCalled();
    });
});
