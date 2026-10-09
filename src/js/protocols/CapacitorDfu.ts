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

import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { hexStringToUint8Array, uint8ArrayToHexString } from "../utils/bytes";
import type { DfuPort } from "./usbdfu";

/**
 * A DFU device as the native plugin reports it (`createDeviceInfo` in
 * BetaflightDfuPlugin.java). The plugin omits a name or serial number the device lacks.
 */
export interface NativeDfuDevice {
    /** "vendorId:productId:deviceId", the plugin's key for the device. */
    deviceId: string;
    vendorId: number;
    productId: number;
    deviceName?: string;
    serialNumber?: string;
    productName?: string;
    manufacturerName?: string;
}

/** A DFU device as this adapter lists it: the port is the native device info. */
export interface CapacitorDfuPort extends DfuPort {
    port: NativeDfuDevice;
}

/** What `openDevice` reports. A failed open rejects rather than resolving `success: false`. */
export interface NativeOpenResult {
    success: boolean;
    productName?: string;
    manufacturerName?: string;
    serialNumber?: string;
    deviceVersionMajor?: string;
    interfaceCount?: number;
    configurationCount?: number;
    configurationValue?: number;
}

/** A standard interface descriptor, field by field. */
export type NativeInterfaceDescriptor = {
    bLength: number;
    bDescriptorType: number;
    bInterfaceNumber: number;
    bAlternateSetting: number;
    bNumEndpoints: number;
    bInterfaceClass: number;
    bInterfaceSubclass: number;
    bInterfaceProtocol: number;
    iInterface: number;
};

/** The DFU functional descriptor. bcdDFUVersion is absent when the device returns only 7 bytes. */
export interface NativeFunctionalDescriptor {
    bLength: number;
    bDescriptorType: number;
    bmAttributes: number;
    wDetachTimeOut: number;
    wTransferSize: number;
    bcdDFUVersion?: number;
}

/** A plugin result that carries `value` under `key` only when the status is "ok". */
type NativeResult<K extends string, V> = ({ status: "ok" } & Record<K, V>) | { status: "error" };

/** The native BetaflightDfu Capacitor plugin. Every call rejects with a message on failure. */
interface BetaflightDfuPlugin {
    addListener(
        eventName: "deviceAttached" | "deviceDetached",
        listener: (device: NativeDfuDevice) => void,
    ): Promise<PluginListenerHandle>;
    getDevices(): Promise<{ devices: NativeDfuDevice[] }>;
    requestPermission(): Promise<{ devices?: NativeDfuDevice[] }>;
    openDevice(options: { deviceId: string }): Promise<NativeOpenResult>;
    claimInterface(options: { interfaceNumber: number }): Promise<{ success: boolean }>;
    releaseInterface(options: { interfaceNumber: number }): Promise<{ success: boolean }>;
    closeDevice(): Promise<{ success: boolean }>;
    resetDevice(): Promise<{ success: boolean }>;
    controlTransferIn(options: {
        request: number;
        value: number;
        index: number;
        length: number;
        timeout?: number;
    }): Promise<{ status: string; data?: string; length?: number }>;
    controlTransferOut(options: {
        request: number;
        value: number;
        index: number;
        data: string;
        timeout?: number;
    }): Promise<{ status: string; length?: number }>;
    getStringDescriptor(options: { index: number }): Promise<{ status: string; descriptor: string }>;
    getInterfaceDescriptor(options: {
        interfaceIndex: number;
    }): Promise<NativeResult<"descriptor", NativeInterfaceDescriptor>>;
    getInterfaceDescriptors(options: { interfaceNumber: number }): Promise<NativeResult<"descriptors", string[]>>;
    getFunctionalDescriptor(): Promise<NativeResult<"descriptor", NativeFunctionalDescriptor>>;
}

const logHead = "[CAPACITOR DFU]";
// `Capacitor.Plugins` is the legacy plugin registry, dropped from Capacitor's typings but
// still populated at runtime with every native plugin, which is where this one is read from.
const BetaflightDfu = (Capacitor as typeof Capacitor & { Plugins?: { BetaflightDfu?: BetaflightDfuPlugin } })?.Plugins
    ?.BetaflightDfu;

/**
 * The plugin, for the methods only reached where it exists. Without it a call throws a
 * TypeError, exactly as reading a method off the missing plugin did.
 */
function nativeDfu(): BetaflightDfuPlugin {
    return BetaflightDfu!;
}

/**
 * Capacitor DFU protocol adapter for Android.
 * Wraps the native BetaflightDfu plugin to provide USB DFU communication
 * on Android devices using USB OTG.
 *
 * CapacitorDfuTransport wraps this adapter to give UsbDfuProtocol (usbdfu.ts) the same
 * DfuTransport interface WebUsbDfuTransport has, so the DFU protocol state machine is
 * shared between the platforms.
 */
class CapacitorDfu extends EventTarget {
    /** Unset when the native plugin is missing: the constructor returns before assigning it. */
    ports!: CapacitorDfuPort[];

    constructor() {
        super();

        if (!BetaflightDfu) {
            console.error(`${logHead} Native BetaflightDfu plugin is not available`);
            return;
        }

        this.ports = [];

        void BetaflightDfu.addListener("deviceAttached", this.handleDeviceAttached.bind(this));
        void BetaflightDfu.addListener("deviceDetached", this.handleDeviceDetached.bind(this));

        void this.loadDevices();

        console.log(`${logHead} CapacitorDfu initialized`);
    }

    /** Lists a newly attached device, and returns it; undefined when it was already listed. */
    handleDeviceAttached(device: NativeDfuDevice): CapacitorDfuPort | undefined {
        const added = this.createPort(device);
        if (this.ports.some((port) => port.path === added.path)) {
            return undefined;
        }
        this.ports.push(added);
        this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));
        console.log(`${logHead} DFU device attached:`, added.path);
        return added;
    }

    handleDeviceDetached(device: NativeDfuDevice): void {
        const devicePath = `usb_${device.serialNumber || device.deviceId}`;
        const removed = this.ports.find((port) => port.path === devicePath);

        if (removed) {
            this.ports = this.ports.filter((port) => port.path !== devicePath);
            this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
            console.log(`${logHead} DFU device detached:`, removed.path);
        }
    }

    createPort(device: NativeDfuDevice): CapacitorDfuPort {
        const serialNumber = device.serialNumber || device.deviceId;
        return {
            path: `usb_${serialNumber}`,
            displayName: `Betaflight ${device.productName || "DFU Device"}`,
            vendorId: device.vendorId,
            productId: device.productId,
            manufacturerName: device.manufacturerName,
            productName: device.productName,
            port: device,
        };
    }

    async loadDevices(): Promise<void> {
        try {
            const result = await nativeDfu().getDevices();
            this.ports = result.devices.map((device) => this.createPort(device));
            console.log(`${logHead} Loaded ${this.ports.length} DFU devices`);
        } catch (error) {
            console.error(`${logHead} Error loading DFU devices:`, error);
            this.ports = [];
        }
    }

    async getDevices(): Promise<CapacitorDfuPort[]> {
        await this.loadDevices();
        return this.ports;
    }

    async requestPermission(): Promise<CapacitorDfuPort | null> {
        let newPermissionPort: CapacitorDfuPort | null = null;

        try {
            console.log(`${logHead} Requesting DFU USB permissions...`);
            const result = await nativeDfu().requestPermission();

            if (!result?.devices?.length) {
                console.log(`${logHead} No DFU device found or permission denied`);
                return null;
            }

            const requestedPort = this.createPort(result.devices[0]);
            newPermissionPort =
                this.handleDeviceAttached(result.devices[0]) ??
                this.ports.find((port) => port.path === requestedPort.path) ??
                requestedPort;
            console.log(`${logHead} DFU permission granted for ${newPermissionPort?.path}`);
        } catch (error) {
            console.error(`${logHead} Error requesting DFU permission:`, error);
            return null;
        }
        return newPermissionPort;
    }

    // ===== Native USB operations (called by transport layer) =====

    openDevice(deviceId: string): Promise<NativeOpenResult> {
        return nativeDfu().openDevice({ deviceId });
    }

    claimInterface(interfaceNumber: number): Promise<{ success: boolean }> {
        return nativeDfu().claimInterface({ interfaceNumber });
    }

    releaseInterface(interfaceNumber: number): Promise<{ success: boolean }> {
        return nativeDfu().releaseInterface({ interfaceNumber });
    }

    closeDevice(): Promise<{ success: boolean }> {
        return nativeDfu().closeDevice();
    }

    resetDevice(): Promise<{ success: boolean }> {
        return nativeDfu().resetDevice();
    }

    /** Reads up to `length` bytes; a failed transfer reports its status with no data. */
    async controlTransferIn(
        request: number,
        value: number,
        index: number,
        length: number,
        timeout?: number,
    ): Promise<{ status: string; data: Uint8Array }> {
        const result = await nativeDfu().controlTransferIn({
            request,
            value,
            index,
            length,
            timeout,
        });

        if (result.status === "ok" && result.data) {
            // Convert hex string to Uint8Array
            const data = hexStringToUint8Array(result.data);
            return { status: "ok", data };
        }

        return { status: result.status, data: new Uint8Array(0) };
    }

    /** Sends `data`, or a zero-length transfer when it is omitted or 0. */
    async controlTransferOut(
        request: number,
        value: number,
        index: number,
        data?: ArrayBuffer | ArrayLike<number> | 0,
        timeout?: number,
    ): Promise<{ status: string; length?: number }> {
        const hexData = data ? uint8ArrayToHexString(new Uint8Array(data)) : "";
        return nativeDfu().controlTransferOut({
            request,
            value,
            index,
            data: hexData,
            timeout,
        });
    }

    async getStringDescriptor(descriptorIndex: number): Promise<string> {
        const result = await nativeDfu().getStringDescriptor({ index: descriptorIndex });
        if (result.status === "ok") {
            return result.descriptor;
        }
        return "";
    }

    async getInterfaceDescriptor(interfaceIndex: number): Promise<NativeInterfaceDescriptor | null> {
        const result = await nativeDfu().getInterfaceDescriptor({ interfaceIndex });
        if (result.status === "ok") {
            return result.descriptor;
        }
        return null;
    }

    async getInterfaceDescriptors(interfaceNumber: number): Promise<string[]> {
        const result = await nativeDfu().getInterfaceDescriptors({ interfaceNumber });
        if (result.status === "ok") {
            return result.descriptors;
        }
        return [];
    }

    /** The functional descriptor, or null when the device has none the plugin can find. */
    async getFunctionalDescriptor(): Promise<NativeFunctionalDescriptor | null> {
        const result = await nativeDfu().getFunctionalDescriptor();
        if (result.status === "ok") {
            return result.descriptor;
        }
        return null;
    }
}

export default CapacitorDfu;
