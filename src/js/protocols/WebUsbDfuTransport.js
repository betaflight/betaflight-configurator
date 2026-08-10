import { usbDevices } from "./devices";
import UsbDfuDescriptors from "./UsbDfuDescriptors.js";

/**
 * WebUSB transport for DFU protocol.
 * Wraps the browser's navigator.usb API to provide USB device access.
 *
 * Events: "addedDevice", "removedDevice"
 */
class WebUsbDfuTransport extends UsbDfuDescriptors {
    constructor() {
        super();
        this.logHead = "[WebUSB Transport]";
        this.usbDevice = null;

        if (!navigator?.usb) {
            console.log(`${this.logHead} WebUSB API not supported`);
            return;
        }

        const isDfuDevice = (device) =>
            (usbDevices?.filters || []).some((f) => device.vendorId === f.vendorId && device.productId === f.productId);

        navigator.usb.addEventListener("connect", (e) => {
            if (!isDfuDevice(e.device)) {
                return;
            }
            const port = this.createPort(e.device);
            this.dispatchEvent(new CustomEvent("addedDevice", { detail: port }));
        });

        navigator.usb.addEventListener("disconnect", (e) => {
            if (!isDfuDevice(e.device)) {
                return;
            }
            const port = this.createPort(e.device);
            if (this.usbDevice === e.device) {
                this.usbDevice = null;
                this._invalidateDescriptorCache();
            }
            this.dispatchEvent(new CustomEvent("removedDevice", { detail: port }));
        });
    }

    get available() {
        return !!navigator?.usb;
    }

    createPort(device) {
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

    async getDevices() {
        const filters = usbDevices?.filters || [];
        const ports = await navigator.usb.getDevices();
        return ports
            .filter((port) => filters.some((f) => port.vendorId === f.vendorId && port.productId === f.productId))
            .map((port) => this.createPort(port));
    }

    async requestPermission() {
        const userSelectedPort = await navigator.usb.requestDevice(usbDevices);
        console.log(
            `${this.logHead} WebUSB Version: ${userSelectedPort.deviceVersionMajor}.${userSelectedPort.deviceVersionMinor}.${userSelectedPort.deviceVersionSubminor}`,
        );
        return this.createPort(userSelectedPort);
    }

    async waitForDfuDevice(timeout = 10000, interval = 500) {
        const start = Date.now();
        const filters = usbDevices?.filters || [];
        const isDfuDevice = (device) =>
            filters.some((f) => device.vendorId === f.vendorId && device.productId === f.productId);
        const getIdentifier = (device) => device.serialNumber ?? `${device.vendorId}_${device.productId}`;

        // Snapshot already-connected DFU devices by count so we detect newly appeared
        // ones even when identical VID/PID boards lack serial numbers.
        const knownDevices = new Map();
        for (const device of (await navigator.usb.getDevices()).filter(isDfuDevice)) {
            const id = getIdentifier(device);
            knownDevices.set(id, (knownDevices.get(id) ?? 0) + 1);
        }

        while (Date.now() - start < timeout) {
            try {
                const ports = await navigator.usb.getDevices();
                const seenNow = new Map();
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

            await new Promise((r) => setTimeout(r, interval));
        }

        return null;
    }

    // ===== Device Lifecycle =====

    async open(devicePort) {
        const device = devicePort.port;
        await device.open();
        if (device.configuration === null) {
            await device.selectConfiguration(1);
        }
        this._invalidateDescriptorCache();
        this.usbDevice = device;
        console.log(`${this.logHead} USB Device opened: ${this.usbDevice.productName}`);
    }

    async claimInterface(interfaceNumber) {
        await this.usbDevice.claimInterface(interfaceNumber);
        console.log(`${this.logHead} Claimed interface: ${interfaceNumber}`);
    }

    async releaseInterface(interfaceNumber) {
        // Cleanup after a failed open() runs the same teardown path, so there may be
        // no device to release. Nothing was claimed in that case.
        if (!this.usbDevice) {
            return;
        }
        await this.usbDevice.releaseInterface(interfaceNumber);
        console.log(`${this.logHead} Released interface: ${interfaceNumber}`);
    }

    async close() {
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

    async reset() {
        if (this.usbDevice) {
            await this.usbDevice.reset();
            console.log(`${this.logHead} Reset Device`);
        }
    }

    getConnectedDevice() {
        if (!this.usbDevice) {
            return null;
        }
        const identifier = this.usbDevice.serialNumber ?? `${this.usbDevice.vendorId}_${this.usbDevice.productId}`;
        return `usb_${identifier}`;
    }

    // ===== Control Transfers =====

    /**
     * Perform a USB control transfer IN (device -> host), reporting the transfer status
     * rather than throwing, so the descriptor layer can decide what a stall means for a
     * given request (an unsupported LANGID read is recoverable; a truncated
     * configuration descriptor is not).
     * @param {{requestType: string, recipient: string, request: number, value: number, index: number}} setup
     * @param {number} length - Maximum bytes to read.
     * @returns {Promise<{status: string, data: Uint8Array}>}
     */
    async _rawControlTransferIn(setup, length) {
        const result = await this.usbDevice.controlTransferIn(setup, length);
        const data = result.data
            ? new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength)
            : new Uint8Array(0);
        return { status: result.status, data };
    }

    /**
     * Perform a USB control transfer IN (device -> host), throwing on a failed transfer.
     * @param {{requestType: string, recipient: string, request: number, value: number, index: number}} setup
     * @param {number} length - Maximum bytes to read.
     * @returns {Promise<{status: string, data: Uint8Array}>}
     */
    async controlTransferIn(setup, length) {
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
     * @param {{requestType: string, recipient: string, request: number, value: number, index: number}} setup
     * @param {ArrayBuffer|Uint8Array} [data] - Payload to send; an empty transfer when omitted.
     * @returns {Promise<{status: string}>}
     */
    async controlTransferOut(setup, data) {
        const arrayBuf = data ? new Uint8Array(data) : new Uint8Array(0);
        const result = await this._withTimeout(
            this.usbDevice.controlTransferOut(setup, arrayBuf),
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
