import { usbDevices } from "./devices";

/**
 * WebUSB transport for DFU protocol.
 * Wraps the browser's navigator.usb API to provide USB device access.
 *
 * Events: "addedDevice", "removedDevice"
 */
class WebUsbDfuTransport extends EventTarget {
    constructor() {
        super();
        this.logHead = "[WebUSB Transport]";
        this.usbDevice = null;

        if (!navigator?.usb) {
            console.error(`${this.logHead} WebUSB API not supported`);
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
            this.dispatchEvent(new CustomEvent("removedDevice", { detail: port }));
        });
    }

    get available() {
        return !!navigator?.usb;
    }

    createPort(device) {
        return {
            path: `usb_${device.serialNumber}`,
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

        while (Date.now() - start < timeout) {
            try {
                const ports = await navigator.usb.getDevices();
                const dfuPort = ports.find((p) =>
                    filters.some((f) => p.vendorId === f.vendorId && p.productId === f.productId),
                );

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
        this.usbDevice = devicePort.port;
        await this.usbDevice.open();
        console.log(`${this.logHead} USB Device opened: ${this.usbDevice.productName}`);

        if (this.usbDevice.configuration === null) {
            await this.usbDevice.selectConfiguration(1);
        }
    }

    async claimInterface(interfaceNumber) {
        await this.usbDevice.claimInterface(interfaceNumber);
        console.log(`${this.logHead} Claimed interface: ${interfaceNumber}`);
    }

    async releaseInterface(interfaceNumber) {
        await this.usbDevice.releaseInterface(interfaceNumber);
        console.log(`${this.logHead} Released interface: ${interfaceNumber}`);
    }

    async close() {
        if (this.usbDevice) {
            await this.usbDevice.close();
            console.log(`${this.logHead} DFU Device closed`);
            this.usbDevice = null;
        }
    }

    async reset() {
        if (this.usbDevice) {
            await this.usbDevice.reset();
            console.log(`${this.logHead} Reset Device`);
        }
    }

    getConnectedPort() {
        return this.usbDevice ? `usb_${this.usbDevice.serialNumber}` : null;
    }

    // ===== Control Transfers =====

    /**
     * Perform a USB control transfer IN (device -> host).
     * @returns {Promise<{status: string, data: Uint8Array}>}
     */
    async controlTransferIn(setup, length) {
        const result = await this.usbDevice.controlTransferIn(setup, length);
        if (result.status === "ok") {
            return { status: "ok", data: new Uint8Array(result.data.buffer) };
        }
        throw new Error(`USB controlTransferIn failed: ${result.status}`);
    }

    /**
     * Perform a USB control transfer OUT (host -> device).
     * @returns {Promise<{status: string}>}
     */
    async controlTransferOut(setup, data) {
        const arrayBuf = data ? new Uint8Array(data) : new Uint8Array(0);
        const result = await this.usbDevice.controlTransferOut(setup, arrayBuf);
        if (result.status === "ok") {
            return { status: "ok" };
        }
        throw new Error(`USB controlTransferOut failed: ${result.status}`);
    }

    // ===== Descriptor Reading =====

    async getString(index) {
        const setup = {
            requestType: "standard",
            recipient: "device",
            request: 6,
            value: 0x300 | index,
            index: 0,
        };

        const result = await this.usbDevice.controlTransferIn(setup, 255);
        if (result.status === "ok") {
            const _length = result.data.getUint8(0);
            let descriptor = "";
            for (let i = 2; i < _length; i += 2) {
                const charCode = result.data.getUint16(i, true);
                descriptor += String.fromCharCode(charCode);
            }
            return descriptor;
        }
        throw new Error(`USB getString failed: ${result.status}`);
    }

    async getInterfaceDescriptor(interfaceIndex) {
        const setup = {
            requestType: "standard",
            recipient: "device",
            request: 6,
            value: 0x200,
            index: 0,
        };

        const result = await this.usbDevice.controlTransferIn(setup, 18 + interfaceIndex * 9);
        if (result.status === "ok") {
            const buf = new Uint8Array(result.data.buffer, 9 + interfaceIndex * 9);
            return {
                bLength: buf[0],
                bDescriptorType: buf[1],
                bInterfaceNumber: buf[2],
                bAlternateSetting: buf[3],
                bNumEndpoints: buf[4],
                bInterfaceClass: buf[5],
                bInterfaceSubclass: buf[6],
                bInterfaceProtocol: buf[7],
                iInterface: buf[8],
            };
        }
        throw new Error(`USB getInterfaceDescriptor failed: ${result.status}`);
    }

    /**
     * Read all interface descriptor strings for a given interface number.
     * @returns {Promise<string[]>}
     */
    async getInterfaceDescriptors(interfaceNum) {
        const descriptorStringArray = [];
        const interfaceCount = this.usbDevice.configuration.interfaces.length;
        let descriptorCount = 0;

        if (interfaceCount === 0) {
            return [];
        } else if (interfaceCount === 1) {
            descriptorCount = this.usbDevice.configuration.interfaces[0].alternates.length;
        } else {
            descriptorCount = interfaceCount;
        }

        for (let i = 0; i < descriptorCount; i++) {
            try {
                const descriptor = await this.getInterfaceDescriptor(i);
                if (descriptor.bInterfaceNumber === interfaceNum) {
                    const str = await this.getString(descriptor.iInterface);
                    descriptorStringArray.push(str);
                }
            } catch (error) {
                console.warn(`${this.logHead} Error reading interface descriptor ${i}:`, error);
                break;
            }
        }

        return descriptorStringArray;
    }

    async getFunctionalDescriptor() {
        const setup = {
            requestType: "standard",
            recipient: "interface",
            request: 6,
            value: 0x2100,
            index: 0,
        };

        const result = await this.usbDevice.controlTransferIn(setup, 255);
        if (result.status === "ok") {
            const buf = new Uint8Array(result.data.buffer);
            return {
                bLength: buf[0],
                bDescriptorType: buf[1],
                bmAttributes: buf[2],
                wDetachTimeOut: (buf[4] << 8) | buf[3],
                wTransferSize: (buf[6] << 8) | buf[5],
                bcdDFUVersion: (buf[8] << 8) | buf[7],
            };
        }
        throw new Error(`USB getFunctionalDescriptor failed: ${result.status}`);
    }
}

export default WebUsbDfuTransport;
