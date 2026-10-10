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

import { usbDevices, type UsbDeviceId } from "./devices";
import UsbDfuDescriptors from "./UsbDfuDescriptors.js";
import type { DfuControlSetup, DfuPort, DfuTransport } from "./usbdfu";

/** The W3C `USBDevice`, as far as this transport uses it. */
export interface WebUsbDevice {
    readonly vendorId: number;
    readonly productId: number;
    readonly serialNumber?: string;
    readonly productName?: string;
    readonly manufacturerName?: string;
    readonly deviceVersionMajor: number;
    readonly deviceVersionMinor: number;
    readonly deviceVersionSubminor: number;
    /** Null until a configuration is selected. */
    readonly configuration: unknown;
    open(): Promise<void>;
    close(): Promise<void>;
    reset(): Promise<void>;
    selectConfiguration(configurationValue: number): Promise<void>;
    claimInterface(interfaceNumber: number): Promise<void>;
    releaseInterface(interfaceNumber: number): Promise<void>;
    controlTransferIn(setup: DfuControlSetup, length: number): Promise<{ status: string; data?: DataView }>;
    controlTransferOut(setup: DfuControlSetup, data?: Uint8Array): Promise<{ status: string }>;
}

/** `navigator.usb`. Its connect and disconnect events carry the device. */
interface WebUsbApi extends EventTarget {
    getDevices(): Promise<WebUsbDevice[]>;
    requestDevice(options: { filters: UsbDeviceId[] }): Promise<WebUsbDevice>;
}

/** A `USBConnectionEvent`. */
interface WebUsbConnectionEvent extends Event {
    readonly device: WebUsbDevice;
}

/** A DFU device as this transport lists it: the port is the WebUSB device itself. */
export interface WebUsbDfuPort extends DfuPort {
    port: WebUsbDevice;
}

/** `navigator.usb`, absent where the browser has no WebUSB. */
function webUsb(): WebUsbApi | undefined {
    return (navigator as (Navigator & { usb?: WebUsbApi }) | undefined)?.usb;
}

/**
 * WebUSB transport for DFU protocol.
 * Wraps the browser's navigator.usb API to provide USB device access.
 *
 * Events: "addedDevice", "removedDevice"
 */
class WebUsbDfuTransport extends UsbDfuDescriptors implements DfuTransport {
    logHead: string;
    usbDevice: WebUsbDevice | null;

    constructor() {
        super();
        this.logHead = "[WebUSB Transport]";
        this.usbDevice = null;

        const usb = webUsb();
        if (!usb) {
            console.log(`${this.logHead} WebUSB API not supported`);
            return;
        }

        const isDfuDevice = (device: WebUsbDevice) =>
            (usbDevices?.filters || []).some((f) => device.vendorId === f.vendorId && device.productId === f.productId);

        usb.addEventListener("connect", (e) => {
            const { device } = e as WebUsbConnectionEvent;
            if (!isDfuDevice(device)) {
                return;
            }
            const port = this.createPort(device);
            this.dispatchEvent(new CustomEvent("addedDevice", { detail: port }));
        });

        usb.addEventListener("disconnect", (e) => {
            const { device } = e as WebUsbConnectionEvent;
            if (!isDfuDevice(device)) {
                return;
            }
            const port = this.createPort(device);
            if (this.usbDevice === device) {
                this.usbDevice = null;
                this._invalidateDescriptorCache();
            }
            this.dispatchEvent(new CustomEvent("removedDevice", { detail: port }));
        });
    }

    get available(): boolean {
        return !!webUsb();
    }

    createPort(device: WebUsbDevice): WebUsbDfuPort {
        const identifier = device.serialNumber ?? `${device.vendorId}_${device.productId}`;
        return {
            path: `usb_${identifier}`,
            displayName: `Betaflight ${device.productName}`,
            vendorId: device.vendorId,
            productId: device.productId,
            manufacturerName: device.manufacturerName,
            productName: device.productName,
            port: device,
        };
    }

    async getDevices(): Promise<WebUsbDfuPort[]> {
        const filters = usbDevices?.filters || [];
        const ports = await webUsb()!.getDevices();
        return ports
            .filter((port) => filters.some((f) => port.vendorId === f.vendorId && port.productId === f.productId))
            .map((port) => this.createPort(port));
    }

    async requestPermission(): Promise<WebUsbDfuPort> {
        const userSelectedPort = await webUsb()!.requestDevice(usbDevices);
        console.log(
            `${this.logHead} WebUSB Version: ${userSelectedPort.deviceVersionMajor}.${userSelectedPort.deviceVersionMinor}.${userSelectedPort.deviceVersionSubminor}`,
        );
        return this.createPort(userSelectedPort);
    }

    async waitForDfuDevice(timeout = 10000, interval = 500): Promise<WebUsbDfuPort | null> {
        const start = Date.now();
        const filters = usbDevices?.filters || [];
        const isDfuDevice = (device: WebUsbDevice) =>
            filters.some((f) => device.vendorId === f.vendorId && device.productId === f.productId);
        const getIdentifier = (device: WebUsbDevice) => device.serialNumber ?? `${device.vendorId}_${device.productId}`;

        // Snapshot already-connected DFU devices by count so we detect newly appeared
        // ones even when identical VID/PID boards lack serial numbers.
        const knownDevices = new Map<string, number>();
        for (const device of (await webUsb()!.getDevices()).filter(isDfuDevice)) {
            const id = getIdentifier(device);
            knownDevices.set(id, (knownDevices.get(id) ?? 0) + 1);
        }

        while (Date.now() - start < timeout) {
            try {
                const ports = await webUsb()!.getDevices();
                const seenNow = new Map<string, number>();
                const dfuPort = ports.find((p) => {
                    if (!isDfuDevice(p)) {
                        return false;
                    }
                    const id = getIdentifier(p);
                    const countNow = (seenNow.get(id) ?? 0) + 1;
                    seenNow.set(id, countNow);
                    return countNow > (knownDevices.get(id) ?? 0);
                });

                if (dfuPort) {
                    return this.createPort(dfuPort);
                }
            } catch (e) {
                console.warn(`${this.logHead} waitForDfuDevice getDevices failed:`, e);
            }

            await new Promise((r) => setTimeout(r, interval)); // NOSONAR: polls one attempt at a time by design
        }

        return null;
    }

    // ===== Device Lifecycle =====

    /** Opens one of this transport's own ports, whose `port` is the WebUSB device. */
    async open(devicePort: WebUsbDfuPort): Promise<void> {
        const device = devicePort.port;
        await device.open();
        if (device.configuration === null) {
            await device.selectConfiguration(1);
        }
        this._invalidateDescriptorCache();
        this.usbDevice = device;
        console.log(`${this.logHead} USB Device opened: ${this.usbDevice.productName}`);
    }

    /** Only called on an open device: usbdfu claims after open() resolves. */
    async claimInterface(interfaceNumber: number): Promise<void> {
        await this.usbDevice!.claimInterface(interfaceNumber);
        console.log(`${this.logHead} Claimed interface: ${interfaceNumber}`);
    }

    async releaseInterface(interfaceNumber: number): Promise<void> {
        // Cleanup after a failed open() runs the same teardown path, so there may be
        // no device to release. Nothing was claimed in that case.
        if (!this.usbDevice) {
            return;
        }
        await this.usbDevice.releaseInterface(interfaceNumber);
        console.log(`${this.logHead} Released interface: ${interfaceNumber}`);
    }

    async close(): Promise<void> {
        if (!this.usbDevice) {
            return;
        }

        const device = this.usbDevice;
        try {
            await device.close();
            console.log(`${this.logHead} DFU Device closed`);
        } finally {
            if (this.usbDevice === device) {
                this.usbDevice = null;
                this._invalidateDescriptorCache();
            }
        }
    }

    async reset(): Promise<void> {
        if (this.usbDevice) {
            await this.usbDevice.reset();
            console.log(`${this.logHead} Reset Device`);
        }
    }

    getConnectedDevice(): string | null {
        if (!this.usbDevice) {
            return null;
        }
        const identifier = this.usbDevice.serialNumber ?? `${this.usbDevice.vendorId}_${this.usbDevice.productId}`;
        return `usb_${identifier}`;
    }

    // ===== Control Transfers =====
    // Only called on an open device, hence the non-null assertions on usbDevice.

    /**
     * Perform a USB control transfer IN (device -> host), reporting the transfer status
     * rather than throwing, so the descriptor layer can decide what a stall means for a
     * given request (an unsupported LANGID read is recoverable; a truncated
     * configuration descriptor is not).
     * @param setup - The control transfer's setup packet.
     * @param length - Maximum bytes to read.
     */
    async _rawControlTransferIn(setup: DfuControlSetup, length: number): Promise<{ status: string; data: Uint8Array }> {
        const result = await this.usbDevice!.controlTransferIn(setup, length);
        const data = result.data
            ? new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength)
            : new Uint8Array(0);
        return { status: result.status, data };
    }

    /**
     * Perform a USB control transfer IN (device -> host), throwing on a failed transfer.
     * @param setup - The control transfer's setup packet.
     * @param length - Maximum bytes to read.
     */
    async controlTransferIn(setup: DfuControlSetup, length: number): Promise<{ status: string; data: Uint8Array }> {
        // Bound the DFU class requests the same way descriptor reads are
        // bounded (and the Tauri transport's native 5 s default), so a wedged
        // bootloader fails the flash instead of hanging it.
        const result = await this._withTimeout(
            this._rawControlTransferIn(setup, length),
            5000,
            `controlTransferIn(${setup.request})`,
        );
        if (result.status === "ok") {
            return result;
        }
        throw new Error(`USB controlTransferIn failed: ${result.status}`);
    }

    /**
     * Perform a USB control transfer OUT (host -> device).
     * @param setup - The control transfer's setup packet.
     * @param data - Payload to send; an empty transfer when omitted or 0.
     */
    async controlTransferOut(
        setup: DfuControlSetup,
        data?: ArrayBuffer | ArrayLike<number> | 0,
    ): Promise<{ status: string }> {
        const arrayBuf = data ? new Uint8Array(data) : new Uint8Array(0);
        const result = await this._withTimeout(
            this.usbDevice!.controlTransferOut(setup, arrayBuf),
            5000,
            `controlTransferOut(${setup.request})`,
        );
        if (result.status === "ok") {
            return { status: "ok" };
        }
        throw new Error(`USB controlTransferOut failed: ${result.status}`);
    }
}

export default WebUsbDfuTransport;
