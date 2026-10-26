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
import type { CapacitorDfuPort } from "../../src/js/protocols/CapacitorDfu";

/** Stands in for the CapacitorDfu adapter, so no native plugin is needed. */
class FakeAdapter extends EventTarget {
    getDevices = vi.fn(async (): Promise<CapacitorDfuPort[]> => []);
    openDevice = vi.fn(async (_deviceId: string) => ({ success: true, productName: "STM32 BOOTLOADER" }));
    claimInterface = vi.fn(async (_interfaceNumber: number) => ({ success: true }));
    releaseInterface = vi.fn(async (_interfaceNumber: number) => ({ success: true }));
    closeDevice = vi.fn(async () => ({ success: true }));
    resetDevice = vi.fn(async () => ({ success: true }));
    controlTransferIn = vi.fn(async (_request: number, _value: number, _index: number, _length: number) => ({
        status: "ok",
        data: new Uint8Array([1, 2]),
    }));
    controlTransferOut = vi.fn(async (_request: number, _value: number, _index: number, _data?: unknown) => ({
        status: "ok",
        length: 0,
    }));
}

vi.mock("../../src/js/protocols/CapacitorDfu", () => ({ default: FakeAdapter }));

const { default: CapacitorDfuTransport } = await import("../../src/js/protocols/CapacitorDfuTransport");

const PORT: CapacitorDfuPort = {
    path: "usb_3276",
    displayName: "Betaflight STM32 BOOTLOADER",
    port: { deviceId: "1155:57105:1003", vendorId: 0x0483, productId: 0xdf11, serialNumber: "3276" },
};
const SETUP = { requestType: "class", recipient: "interface", request: 3, value: 7, index: 0 };

function eventDetails(target: EventTarget, type: string): unknown[] {
    const details: unknown[] = [];
    target.addEventListener(type, (e) => details.push((e as CustomEvent).detail));
    return details;
}

let transport: InstanceType<typeof CapacitorDfuTransport>;
let adapter: FakeAdapter;

beforeEach(() => {
    transport = new CapacitorDfuTransport();
    adapter = transport.adapter as unknown as FakeAdapter;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("CapacitorDfuTransport events", () => {
    it("forwards the adapter's device events", () => {
        const added = eventDetails(transport, "addedDevice");
        const removed = eventDetails(transport, "removedDevice");

        adapter.dispatchEvent(new CustomEvent("addedDevice", { detail: PORT }));
        adapter.dispatchEvent(new CustomEvent("removedDevice", { detail: PORT }));

        expect(added).toEqual([PORT]);
        expect(removed).toEqual([PORT]);
    });

    it("tells usbdfu that a permission grant already announces the device", () => {
        expect(transport.emitsAddedDeviceOnPermissionGrant).toBe(true);
    });
});

describe("CapacitorDfuTransport.waitForDfuDevice", () => {
    it("returns the first device and announces it", async () => {
        adapter.getDevices.mockResolvedValue([PORT]);
        const added = eventDetails(transport, "addedDevice");

        expect(await transport.waitForDfuDevice(1000, 1)).toBe(PORT);
        expect(added).toEqual([PORT]);
    });

    it("keeps polling through failures and gives up with null", async () => {
        adapter.getDevices.mockRejectedValueOnce(new Error("usb service gone")).mockResolvedValue([]);

        expect(await transport.waitForDfuDevice(20, 1)).toBeNull();
        expect(adapter.getDevices.mock.calls.length).toBeGreaterThan(1);
    });
});

describe("CapacitorDfuTransport lifecycle", () => {
    it("opens the device by its native id and reports the port as connected", async () => {
        await transport.open(PORT);

        expect(adapter.openDevice).toHaveBeenCalledWith("1155:57105:1003");
        expect(transport.getConnectedDevice()).toBe("usb_3276");
    });

    it("throws when the device does not open", async () => {
        adapter.openDevice.mockResolvedValue({ success: false, productName: "" });

        await expect(transport.open(PORT)).rejects.toThrow("Failed to open DFU device");
    });

    it("throws when the interface cannot be claimed", async () => {
        adapter.claimInterface.mockResolvedValue({ success: false });

        await expect(transport.claimInterface(0)).rejects.toThrow("Failed to claim interface 0");
    });

    it("tolerates release, close and reset failures, and forgets the device on close", async () => {
        await transport.open(PORT);
        adapter.releaseInterface.mockRejectedValue(new Error("gone"));
        adapter.closeDevice.mockRejectedValue(new Error("gone"));
        adapter.resetDevice.mockRejectedValue(new Error("gone"));

        await expect(transport.releaseInterface(0)).resolves.toBeUndefined();
        await expect(transport.reset()).resolves.toBeUndefined();
        await expect(transport.close()).resolves.toBeUndefined();

        expect(transport.getConnectedDevice()).toBeNull();
        expect(transport.currentDeviceId).toBeNull();
    });
});

describe("CapacitorDfuTransport control transfers", () => {
    it("passes the setup fields and length through on IN", async () => {
        expect(await transport.controlTransferIn(SETUP, 6)).toEqual({ status: "ok", data: new Uint8Array([1, 2]) });
        expect(adapter.controlTransferIn).toHaveBeenCalledWith(3, 7, 0, 6);
    });

    it("passes the setup fields and payload through on OUT, and reports only the status", async () => {
        expect(await transport.controlTransferOut(SETUP, [0x21])).toEqual({ status: "ok" });
        expect(adapter.controlTransferOut).toHaveBeenCalledWith(3, 7, 0, [0x21]);
    });
});
