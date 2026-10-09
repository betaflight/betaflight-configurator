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

import CapacitorDfu, {
    type CapacitorDfuPort,
    type NativeDfuDevice,
    type NativeFunctionalDescriptor,
    type NativeInterfaceDescriptor,
} from "./CapacitorDfu";
import type { DfuControlSetup, DfuTransport } from "./usbdfu";

/**
 * Capacitor DFU transport for Android.
 * Wraps the CapacitorDfu native plugin adapter to provide the same
 * transport interface as WebUsbDfuTransport.
 *
 * Events: "addedDevice", "removedDevice"
 */
class CapacitorDfuTransport extends EventTarget implements DfuTransport {
    logHead: string;
    adapter: CapacitorDfu;
    currentDeviceId: string | null;
    currentPortPath: string | null;

    constructor() {
        super();
        this.logHead = "[Capacitor DFU Transport]";
        this.adapter = new CapacitorDfu();
        this.currentDeviceId = null;
        this.currentPortPath = null;

        // Forward device events from the adapter
        this.adapter.addEventListener("addedDevice", (e) => {
            this.dispatchEvent(new CustomEvent("addedDevice", { detail: (e as CustomEvent<CapacitorDfuPort>).detail }));
        });

        this.adapter.addEventListener("removedDevice", (e) => {
            this.dispatchEvent(
                new CustomEvent("removedDevice", { detail: (e as CustomEvent<CapacitorDfuPort>).detail }),
            );
        });
    }

    get available(): boolean {
        return !!this.adapter;
    }

    // CapacitorDfu.requestPermission() dispatches addedDevice internally
    // via handleDeviceAttached(), so callers must not dispatch again.
    get emitsAddedDeviceOnPermissionGrant(): boolean {
        return true;
    }

    createPort(device: NativeDfuDevice): CapacitorDfuPort {
        return this.adapter.createPort(device);
    }

    getDevices(): Promise<CapacitorDfuPort[]> {
        return this.adapter.getDevices();
    }

    requestPermission(): Promise<CapacitorDfuPort | null> {
        return this.adapter.requestPermission();
    }

    async waitForDfuDevice(timeout = 10000, interval = 500): Promise<CapacitorDfuPort | null> {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            try {
                const devices = await this.adapter.getDevices();
                if (devices.length > 0) {
                    // Dispatch addedDevice so the DeviceHandler event chain fires.
                    // The native USB_DEVICE_ATTACHED broadcast may have been
                    // consumed before Android granted permission, so the normal
                    // deviceAttached → addedDevice path can be missed.
                    this.dispatchEvent(new CustomEvent("addedDevice", { detail: devices[0] }));
                    return devices[0];
                }
            } catch (e) {
                console.warn(`${this.logHead} waitForDfuDevice failed:`, e);
            }

            await new Promise((r) => setTimeout(r, interval));
        }

        return null;
    }

    // ===== Device Lifecycle =====

    /** Opens one of the adapter's own ports, whose `port` is the native device info. */
    async open(devicePort: CapacitorDfuPort): Promise<void> {
        const nativeDevice = devicePort.port;
        this.currentDeviceId = nativeDevice.deviceId;
        this.currentPortPath = devicePort.path;
        const result = await this.adapter.openDevice(this.currentDeviceId);

        if (!result.success) {
            throw new Error("Failed to open DFU device");
        }

        console.log(`${this.logHead} DFU Device opened: ${result.productName}`);
    }

    async claimInterface(interfaceNumber: number): Promise<void> {
        const result = await this.adapter.claimInterface(interfaceNumber);
        if (!result.success) {
            throw new Error(`Failed to claim interface ${interfaceNumber}`);
        }
        console.log(`${this.logHead} Claimed interface: ${interfaceNumber}`);
    }

    async releaseInterface(interfaceNumber: number): Promise<void> {
        try {
            await this.adapter.releaseInterface(interfaceNumber);
            console.log(`${this.logHead} Released interface: ${interfaceNumber}`);
        } catch (error) {
            console.warn(`${this.logHead} Error releasing interface:`, error);
        }
    }

    async close(): Promise<void> {
        try {
            await this.adapter.closeDevice();
            console.log(`${this.logHead} DFU Device closed`);
        } catch (error) {
            console.warn(`${this.logHead} Error closing device:`, error);
        }
        this.currentDeviceId = null;
        this.currentPortPath = null;
    }

    async reset(): Promise<void> {
        try {
            await this.adapter.resetDevice();
            console.log(`${this.logHead} Reset Device`);
        } catch (error) {
            console.warn(`${this.logHead} Error resetting device:`, error);
        }
    }

    getConnectedDevice(): string | null {
        return this.currentPortPath;
    }

    // ===== Control Transfers =====

    /**
     * Perform a USB control transfer IN (device -> host).
     * Uses DFU class request type (class, recipient: interface).
     */
    async controlTransferIn(setup: DfuControlSetup, length: number): Promise<{ status: string; data: Uint8Array }> {
        const result = await this.adapter.controlTransferIn(setup.request, setup.value, setup.index, length);
        return { status: result.status, data: result.data };
    }

    /**
     * Perform a USB control transfer OUT (host -> device).
     * Uses DFU class request type (class, recipient: interface).
     */
    async controlTransferOut(
        setup: DfuControlSetup,
        data?: ArrayBuffer | ArrayLike<number> | 0,
    ): Promise<{ status: string }> {
        const result = await this.adapter.controlTransferOut(setup.request, setup.value, setup.index, data);
        return { status: result.status };
    }

    // ===== Descriptor Reading =====

    getString(index: number): Promise<string> {
        return this.adapter.getStringDescriptor(index);
    }

    getInterfaceDescriptor(interfaceIndex: number): Promise<NativeInterfaceDescriptor | null> {
        return this.adapter.getInterfaceDescriptor(interfaceIndex);
    }

    getInterfaceDescriptors(interfaceNum: number): Promise<string[]> {
        return this.adapter.getInterfaceDescriptors(interfaceNum);
    }

    getFunctionalDescriptor(): Promise<NativeFunctionalDescriptor | null> {
        return this.adapter.getFunctionalDescriptor();
    }
}

export default CapacitorDfuTransport;
