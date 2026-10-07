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

import { beforeEach, describe, expect, it, vi } from "vitest";

type Devices = typeof import("../../src/js/protocols/devices");

const STORAGE_KEY = "device-filters";

/** A fresh copy of the module, since its lists are module-level state that loadDeviceFilters mutates. */
async function freshDevices(): Promise<Devices> {
    vi.resetModules();
    return import("../../src/js/protocols/devices");
}

function buildApiReturning(payload: unknown) {
    return { loadDeviceFilters: vi.fn().mockResolvedValue(payload) };
}

function cache(payload: unknown) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function cached(): unknown {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
}

const SERIAL = { vendorId: 0x1234, productId: 0x5678 };
const BLE = {
    name: "Test BLE",
    serviceUuid: "0000aaaa-0000-1000-8000-00805f9b34fb",
    writeCharacteristic: "w",
    readCharacteristic: "r",
};

describe("devices", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe("defaults", () => {
        it("derives the Web Serial filters from the serial device list", async () => {
            const devices = await freshDevices();

            expect(devices.webSerialDevices).toEqual(
                devices.serialDevices.map(({ vendorId, productId }) => ({
                    usbVendorId: vendorId,
                    usbProductId: productId,
                })),
            );
        });

        it("expands 16-bit Bluetooth ids against the SIG base UUID and keeps Nordic UART's own", async () => {
            const { bluetoothDevices } = await freshDevices();
            const cc2541 = bluetoothDevices.find((d) => d.name === "CC2541")!;
            const nordic = bluetoothDevices.find((d) => d.name === "Nordic NRF")!;

            expect(cc2541).toEqual({
                name: "CC2541",
                serviceUuid: "0000ffe0-0000-1000-8000-00805f9b34fb",
                writeCharacteristic: "0000ffe1-0000-1000-8000-00805f9b34fb",
                readCharacteristic: "0000ffe2-0000-1000-8000-00805f9b34fb",
                susceptibleToCrcCorruption: true,
            });
            // Pins the configuration as shipped: write 0003, read 0002.
            expect(nordic.writeCharacteristic).toBe("6e400003-b5a3-f393-e0a9-e50e24dcca9e");
            expect(nordic.readCharacteristic).toBe("6e400002-b5a3-f393-e0a9-e50e24dcca9e");
        });
    });

    describe("loadDeviceFilters", () => {
        it("applies the build server's lists in place and caches them", async () => {
            const devices = await freshDevices();
            const { bluetoothDevices, serialDevices, usbDevices, vendorIdNames, webSerialDevices } = devices;
            const remote = {
                bluetoothDevices: [BLE],
                serialDevices: [SERIAL],
                usbDevices: { filters: [{ vendorId: 1, productId: 2 }] },
                vendorIdNames: { 4660: "Test Vendor" },
            };

            await devices.loadDeviceFilters(buildApiReturning(remote));

            // Same objects as before: the transports imported these references at startup.
            expect(devices.bluetoothDevices).toBe(bluetoothDevices);
            expect(devices.vendorIdNames).toBe(vendorIdNames);
            expect(bluetoothDevices).toEqual([BLE]);
            expect(serialDevices).toEqual([SERIAL]);
            expect(webSerialDevices).toEqual([{ usbVendorId: 0x1234, usbProductId: 0x5678 }]);
            expect(usbDevices.filters).toEqual([{ vendorId: 1, productId: 2 }]);
            expect(vendorIdNames).toEqual({ 4660: "Test Vendor" });
            expect(cached()).toEqual({ [STORAGE_KEY]: remote });
        });

        it("replaces only the lists the payload carries", async () => {
            const devices = await freshDevices();
            const defaultBle = [...devices.bluetoothDevices];
            const defaultNames = { ...devices.vendorIdNames };

            await devices.loadDeviceFilters(buildApiReturning({ serialDevices: [SERIAL] }));

            expect(devices.serialDevices).toEqual([SERIAL]);
            expect(devices.bluetoothDevices).toEqual(defaultBle);
            expect(devices.vendorIdNames).toEqual(defaultNames);
        });

        it("drops malformed entries", async () => {
            const devices = await freshDevices();

            await devices.loadDeviceFilters(
                buildApiReturning({
                    bluetoothDevices: [BLE, { name: "no uuid" }, null, "HM-10", [BLE]],
                    serialDevices: [SERIAL, { vendorId: "1234", productId: 1 }, { vendorId: 1 }, null],
                    usbDevices: { filters: [{ vendorId: 1, productId: 2 }, { productId: 2 }] },
                }),
            );

            expect(devices.bluetoothDevices).toEqual([BLE]);
            expect(devices.serialDevices).toEqual([SERIAL]);
            expect(devices.webSerialDevices).toEqual([{ usbVendorId: 0x1234, usbProductId: 0x5678 }]);
            expect(devices.usbDevices.filters).toEqual([{ vendorId: 1, productId: 2 }]);
        });

        it("keeps prototype keys and non-string names out of the vendor names", async () => {
            const devices = await freshDevices();
            // JSON.parse makes "__proto__" an own key, as it would arrive from the server.
            const vendorIdNames = JSON.parse('{"__proto__": "x", "constructor": "y", "1": "One", "2": 2}');

            await devices.loadDeviceFilters(buildApiReturning({ vendorIdNames }));

            expect(devices.vendorIdNames).toEqual({ 1: "One" });
            expect(Object.getPrototypeOf(devices.vendorIdNames)).toBe(Object.prototype);
        });

        it.each([
            ["offline", null],
            ["not an object", "devices"],
            ["no list it knows", { somethingElse: [] }],
        ])("falls back to the cached lists when the server's answer is unusable (%s)", async (_case, remote) => {
            cache({ [STORAGE_KEY]: { serialDevices: [SERIAL] } });
            const devices = await freshDevices();

            await devices.loadDeviceFilters(buildApiReturning(remote));

            expect(devices.serialDevices).toEqual([SERIAL]);
            expect(cached()).toEqual({ [STORAGE_KEY]: { serialDevices: [SERIAL] } });
        });

        it("keeps the defaults when offline with nothing cached", async () => {
            const devices = await freshDevices();
            const defaults = [...devices.serialDevices];

            await devices.loadDeviceFilters(buildApiReturning(null));

            expect(devices.serialDevices).toEqual(defaults);
            expect(cached()).toBeNull();
        });

        it("ignores a corrupt cache", async () => {
            cache({ [STORAGE_KEY]: "garbage" });
            const devices = await freshDevices();
            const defaults = [...devices.serialDevices];

            await expect(devices.loadDeviceFilters(buildApiReturning(null))).resolves.toBeUndefined();

            expect(devices.serialDevices).toEqual(defaults);
        });
    });
});
