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
import type { NativeDfuDevice } from "../../src/js/protocols/CapacitorDfu";

/** The native plugin double. CapacitorDfu reads it once, when the module loads. */
function makePlugin() {
    return {
        addListener: vi.fn(async (_eventName: string, _listener: unknown) => ({ remove: vi.fn() })),
        getDevices: vi.fn(async () => ({ devices: [] as NativeDfuDevice[] })),
        requestPermission: vi.fn(async (): Promise<{ devices?: NativeDfuDevice[] }> => ({ devices: [] })),
        openDevice: vi.fn(async () => ({ success: true })),
        claimInterface: vi.fn(async () => ({ success: true })),
        releaseInterface: vi.fn(async () => ({ success: true })),
        closeDevice: vi.fn(async () => ({ success: true })),
        resetDevice: vi.fn(async () => ({ success: true })),
        controlTransferIn: vi.fn(async (): Promise<{ status: string; data?: string }> => ({ status: "ok", data: "" })),
        controlTransferOut: vi.fn(async (_options: object) => ({ status: "ok", length: 0 })),
        getStringDescriptor: vi.fn(async () => ({ status: "ok", descriptor: "" })),
        getInterfaceDescriptor: vi.fn(async (): Promise<object> => ({ status: "error" })),
        getInterfaceDescriptors: vi.fn(async (): Promise<object> => ({ status: "error" })),
        getFunctionalDescriptor: vi.fn(async (): Promise<object> => ({ status: "error" })),
    };
}

const native = vi.hoisted(() => ({ plugin: undefined as ReturnType<typeof makePlugin> | undefined }));

vi.mock("@capacitor/core", () => ({
    Capacitor: {
        get Plugins() {
            return { BetaflightDfu: native.plugin };
        },
    },
}));

const DEVICE: NativeDfuDevice = {
    deviceId: "1155:57105:1003",
    vendorId: 0x0483,
    productId: 0xdf11,
    serialNumber: "3276",
    productName: "STM32 BOOTLOADER",
    manufacturerName: "STMicroelectronics",
};

/** Loads a fresh CapacitorDfu module against `plugin` (undefined: the plugin is missing). */
async function loadAdapter(plugin: ReturnType<typeof makePlugin> | undefined) {
    native.plugin = plugin;
    vi.resetModules();
    const { default: CapacitorDfu } = await import("../../src/js/protocols/CapacitorDfu");
    const adapter = new CapacitorDfu();
    await Promise.resolve(); // let the constructor's loadDevices settle
    await Promise.resolve();
    return adapter;
}

function eventDetails(target: EventTarget, type: string): unknown[] {
    const details: unknown[] = [];
    target.addEventListener(type, (e) => details.push((e as CustomEvent).detail));
    return details;
}

let plugin: ReturnType<typeof makePlugin>;

beforeEach(() => {
    plugin = makePlugin();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("CapacitorDfu construction", () => {
    it("listens for attach and detach and loads the device list", async () => {
        plugin.getDevices.mockResolvedValue({ devices: [DEVICE] });

        const adapter = await loadAdapter(plugin);

        expect(plugin.addListener.mock.calls.map(([name]) => name)).toEqual(["deviceAttached", "deviceDetached"]);
        expect(adapter.ports.map((p) => p.path)).toEqual(["usb_3276"]);
    });

    it("does nothing without the native plugin", async () => {
        const adapter = await loadAdapter(undefined);

        expect(adapter.ports).toBeUndefined();
        expect(console.error).toHaveBeenCalledWith("[CAPACITOR DFU] Native BetaflightDfu plugin is not available");
    });
});

describe("CapacitorDfu.createPort", () => {
    it("names the port by serial number, falling back to the device id and a generic name", async () => {
        const adapter = await loadAdapter(plugin);

        expect(adapter.createPort(DEVICE)).toEqual({
            path: "usb_3276",
            displayName: "Betaflight STM32 BOOTLOADER",
            vendorId: 0x0483,
            productId: 0xdf11,
            manufacturerName: "STMicroelectronics",
            productName: "STM32 BOOTLOADER",
            port: DEVICE,
        });
        const bare = adapter.createPort({ deviceId: "1:2:3", vendorId: 1, productId: 2 });
        expect([bare.path, bare.displayName]).toEqual(["usb_1:2:3", "Betaflight DFU Device"]);
    });
});

describe("CapacitorDfu attach and detach", () => {
    it("lists an attached device once and announces it", async () => {
        const adapter = await loadAdapter(plugin);
        const added = eventDetails(adapter, "addedDevice");

        const port = adapter.handleDeviceAttached(DEVICE);
        const again = adapter.handleDeviceAttached(DEVICE);

        expect(port?.path).toBe("usb_3276");
        expect(again).toBeUndefined();
        expect(adapter.ports).toHaveLength(1);
        expect(added).toEqual([port]);
    });

    it("drops a detached device and announces the listed port", async () => {
        const adapter = await loadAdapter(plugin);
        const port = adapter.handleDeviceAttached(DEVICE);
        const removed = eventDetails(adapter, "removedDevice");

        adapter.handleDeviceDetached({ deviceId: "9:9:9", vendorId: 9, productId: 9 });
        expect(removed).toEqual([]);

        adapter.handleDeviceDetached(DEVICE);
        expect(adapter.ports).toEqual([]);
        expect(removed).toEqual([port]);
    });

    it("clears the list when loading fails", async () => {
        const adapter = await loadAdapter(plugin);
        adapter.handleDeviceAttached(DEVICE);
        plugin.getDevices.mockRejectedValue(new Error("usb service gone"));

        expect(await adapter.getDevices()).toEqual([]);
    });
});

describe("CapacitorDfu.requestPermission", () => {
    it("returns null when nothing was granted, or the request failed", async () => {
        const adapter = await loadAdapter(plugin);

        expect(await adapter.requestPermission()).toBeNull();
        expect(console.error).not.toHaveBeenCalled(); // an empty grant is not an error

        plugin.requestPermission.mockRejectedValue(new Error("busy"));
        expect(await adapter.requestPermission()).toBeNull();
    });

    it("lists and announces a newly granted device", async () => {
        const adapter = await loadAdapter(plugin);
        plugin.requestPermission.mockResolvedValue({ devices: [DEVICE] });
        const added = eventDetails(adapter, "addedDevice");

        const port = await adapter.requestPermission();

        expect(port?.path).toBe("usb_3276");
        expect(adapter.ports).toEqual([port]);
        expect(added).toEqual([port]);
    });

    it("returns the already listed port for a device it knows, without announcing it again", async () => {
        const adapter = await loadAdapter(plugin);
        const listed = adapter.handleDeviceAttached(DEVICE);
        plugin.requestPermission.mockResolvedValue({ devices: [DEVICE] });
        const added = eventDetails(adapter, "addedDevice");

        expect(await adapter.requestPermission()).toBe(listed);
        expect(added).toEqual([]);
    });
});

describe("CapacitorDfu native calls", () => {
    it("passes the device and interface numbers to the plugin", async () => {
        const adapter = await loadAdapter(plugin);

        await adapter.openDevice("1:2:3");
        await adapter.claimInterface(0);
        await adapter.releaseInterface(1);

        expect(plugin.openDevice).toHaveBeenCalledWith({ deviceId: "1:2:3" });
        expect(plugin.claimInterface).toHaveBeenCalledWith({ interfaceNumber: 0 });
        expect(plugin.releaseInterface).toHaveBeenCalledWith({ interfaceNumber: 1 });
    });

    it("decodes the hex a control transfer IN returns", async () => {
        const adapter = await loadAdapter(plugin);
        plugin.controlTransferIn.mockResolvedValue({ status: "ok", data: "0a0bff" });

        expect(await adapter.controlTransferIn(3, 0, 0, 6, 500)).toEqual({
            status: "ok",
            data: new Uint8Array([0x0a, 0x0b, 0xff]),
        });
        expect(plugin.controlTransferIn).toHaveBeenCalledWith({
            request: 3,
            value: 0,
            index: 0,
            length: 6,
            timeout: 500,
        });
    });

    it("reports a failed control transfer IN with no data", async () => {
        const adapter = await loadAdapter(plugin);
        plugin.controlTransferIn.mockResolvedValue({ status: "error", data: "" });

        expect(await adapter.controlTransferIn(3, 0, 0, 6)).toEqual({ status: "error", data: new Uint8Array(0) });
    });

    it("sends a control transfer OUT as hex, and nothing for an omitted or 0 payload", async () => {
        const adapter = await loadAdapter(plugin);

        await adapter.controlTransferOut(1, 2, 0, [0x21, 0x00, 0x08]);
        await adapter.controlTransferOut(1, 0, 0, 0);
        await adapter.controlTransferOut(1, 0, 0);

        expect(plugin.controlTransferOut.mock.calls.map(([options]) => options)).toEqual([
            { request: 1, value: 2, index: 0, data: "210008", timeout: undefined },
            { request: 1, value: 0, index: 0, data: "", timeout: undefined },
            { request: 1, value: 0, index: 0, data: "", timeout: undefined },
        ]);
    });
});

describe("CapacitorDfu descriptors", () => {
    const INTERFACE = {
        bLength: 9,
        bDescriptorType: 4,
        bInterfaceNumber: 0,
        bAlternateSetting: 0,
        bNumEndpoints: 0,
        bInterfaceClass: 0xfe,
        bInterfaceSubclass: 1,
        bInterfaceProtocol: 2,
        iInterface: 4,
    };
    const FUNCTIONAL = {
        bLength: 9,
        bDescriptorType: 0x21,
        bmAttributes: 11,
        wDetachTimeOut: 255,
        wTransferSize: 2048,
    };

    it("returns each descriptor the plugin read", async () => {
        const adapter = await loadAdapter(plugin);
        plugin.getStringDescriptor.mockResolvedValue({ status: "ok", descriptor: "@Internal Flash" });
        plugin.getInterfaceDescriptor.mockResolvedValue({ status: "ok", descriptor: INTERFACE });
        plugin.getInterfaceDescriptors.mockResolvedValue({ status: "ok", descriptors: ["@Internal Flash"] });
        plugin.getFunctionalDescriptor.mockResolvedValue({ status: "ok", descriptor: FUNCTIONAL });

        expect(await adapter.getStringDescriptor(4)).toBe("@Internal Flash");
        expect(await adapter.getInterfaceDescriptor(0)).toEqual(INTERFACE);
        expect(await adapter.getInterfaceDescriptors(0)).toEqual(["@Internal Flash"]);
        expect(await adapter.getFunctionalDescriptor()).toEqual(FUNCTIONAL);
        expect(plugin.getStringDescriptor).toHaveBeenCalledWith({ index: 4 });
        expect(plugin.getInterfaceDescriptor).toHaveBeenCalledWith({ interfaceIndex: 0 });
        expect(plugin.getInterfaceDescriptors).toHaveBeenCalledWith({ interfaceNumber: 0 });
    });

    it("falls back to an empty value when the plugin could not read one", async () => {
        const adapter = await loadAdapter(plugin);
        plugin.getStringDescriptor.mockResolvedValue({ status: "error", descriptor: "" });

        expect(await adapter.getStringDescriptor(4)).toBe("");
        expect(await adapter.getInterfaceDescriptor(0)).toBeNull();
        expect(await adapter.getInterfaceDescriptors(0)).toEqual([]);
        expect(await adapter.getFunctionalDescriptor()).toBeNull();
    });
});
