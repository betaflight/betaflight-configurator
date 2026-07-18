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
            if (this.usbDevice === e.device) {
                this.usbDevice = null;
                this._langId = undefined;
                this._configDescriptor = undefined;
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
        this._langId = undefined;
        this._configDescriptor = undefined;
        this.usbDevice = device;
        console.log(`${this.logHead} USB Device opened: ${this.usbDevice.productName}`);
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
                this._langId = undefined;
                this._configDescriptor = undefined;
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

    /**
     * Race a USB operation against a timeout so a device that never answers a
     * descriptor request (seen on some brand-new ST ROM bootloaders) surfaces as an
     * error instead of hanging the flash forever. WebUSB control transfers normally
     * complete in milliseconds, so this never fires during healthy operation.
     * @template T
     * @param {Promise<T>} promise - The USB operation to guard.
     * @param {number} timeoutMs - Timeout in milliseconds.
     * @param {string} label - Human-readable operation name for the timeout error.
     * @returns {Promise<T>} Resolves with the operation result, or rejects on timeout.
     */
    _withTimeout(promise, timeoutMs, label) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`${this.logHead} USB ${label} timed out after ${timeoutMs}ms`)),
                timeoutMs,
            );
        });
        // Promise.race already attaches a rejection reaction to `promise`, so a late USB
        // rejection (after the timeout won) is technically "handled" and won't surface as an
        // unhandledrejection. This explicit no-op catch documents that intent and keeps the
        // guarantee independent of Promise.race internals.
        promise.catch(() => {});
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    // ===== Control Transfers =====

    /**
     * Perform a USB control transfer IN (device -> host).
     * @returns {Promise<{status: string, data: Uint8Array}>}
     */
    async controlTransferIn(setup, length) {
        const result = await this.usbDevice.controlTransferIn(setup, length);
        if (result.status === "ok") {
            return {
                status: "ok",
                data: new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength),
            };
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

    /**
     * Fetch the first supported LANGID from string descriptor 0.
     * Cached after the first successful read.
     * Falls back to 0x0409 (English US) on failure.
     */
    async getLangId() {
        if (this._langId !== undefined) {
            return this._langId;
        }

        try {
            const setup = {
                requestType: "standard",
                recipient: "device",
                request: 6,
                value: 0x300,
                index: 0,
            };

            const result = await this._withTimeout(this.usbDevice.controlTransferIn(setup, 255), 5000, "getLangId");
            if (result.status === "ok" && result.data.byteLength >= 4) {
                this._langId = result.data.getUint16(2, true);
                return this._langId;
            }
        } catch (error) {
            console.warn(`${this.logHead} Failed to read LANGID, falling back to 0x0409:`, error);
        }

        this._langId = 0x0409;
        return this._langId;
    }

    async getString(index) {
        if (index === 0) {
            return "";
        }

        const langId = await this.getLangId();
        const setup = {
            requestType: "standard",
            recipient: "device",
            request: 6,
            value: 0x300 | index,
            index: langId,
        };

        const result = await this._withTimeout(
            this.usbDevice.controlTransferIn(setup, 255),
            5000,
            `getString(${index})`,
        );
        if (result.status === "ok") {
            const length = Math.min(result.data.getUint8(0), result.data.byteLength);
            let descriptor = "";
            for (let i = 2; i + 1 < length; i += 2) {
                const charCode = result.data.getUint16(i, true);
                descriptor += String.fromCodePoint(charCode);
            }
            return descriptor;
        }
        throw new Error(`USB getString failed: ${result.status}`);
    }

    /**
     * Fetch the full configuration descriptor blob.
     * Cached for the lifetime of the current device connection.
     */
    async getConfigDescriptor() {
        if (this._configDescriptor) {
            return this._configDescriptor;
        }

        const setup = {
            requestType: "standard",
            recipient: "device",
            request: 6,
            value: 0x200,
            index: 0,
        };

        // First read the 9-byte config header to learn the total length
        const header = await this._withTimeout(
            this.usbDevice.controlTransferIn(setup, 9),
            5000,
            "getConfigDescriptor(header)",
        );
        if (header.status !== "ok") {
            throw new Error(`USB getConfigDescriptor failed: ${header.status}`);
        }

        const totalLength = header.data.getUint16(2, true);

        // Now fetch the entire configuration descriptor blob
        const result = await this._withTimeout(
            this.usbDevice.controlTransferIn(setup, totalLength),
            5000,
            "getConfigDescriptor",
        );
        if (result.status !== "ok") {
            throw new Error(`USB getConfigDescriptor failed: ${result.status}`);
        }

        this._configDescriptor = new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
        return this._configDescriptor;
    }

    async getInterfaceDescriptor(interfaceIndex) {
        const buf = await this.getConfigDescriptor();

        // Walk the descriptor chain looking for the Nth interface descriptor (type 4)
        let offset = 9; // skip the 9-byte configuration descriptor header
        let seenInterfaces = 0;

        while (offset + 1 < buf.length) {
            const bLength = buf[offset];
            const bDescriptorType = buf[offset + 1];

            if (bDescriptorType === 4) {
                if (seenInterfaces === interfaceIndex) {
                    return {
                        bLength: buf[offset],
                        bDescriptorType: buf[offset + 1],
                        bInterfaceNumber: buf[offset + 2],
                        bAlternateSetting: buf[offset + 3],
                        bNumEndpoints: buf[offset + 4],
                        bInterfaceClass: buf[offset + 5],
                        bInterfaceSubclass: buf[offset + 6],
                        bInterfaceProtocol: buf[offset + 7],
                        iInterface: buf[offset + 8],
                    };
                }
                seenInterfaces++;
            }

            offset += bLength || 1; // guard against zero-length descriptors
        }

        throw new Error(`USB interface descriptor ${interfaceIndex} not found`);
    }

    /**
     * Read all interface descriptor strings for a given interface number.
     * @returns {Promise<string[]>}
     */
    async getInterfaceDescriptors(interfaceNum) {
        const descriptorStringArray = [];
        const interfaces = this.usbDevice.configuration.interfaces;

        if (interfaces.length === 0) {
            return [];
        }

        const descriptorCount = interfaces.reduce((count, iface) => count + iface.alternates.length, 0);

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

    // DFU functional descriptor bDescriptorType. NOTE: 0x21 is shared with the HID
    // descriptor type, so a bare type match is ambiguous on composite devices — it must
    // be qualified by a preceding DFU interface descriptor (see getFunctionalDescriptor).
    static get DFU_FUNCTIONAL_DESCRIPTOR_TYPE() {
        return 0x21;
    }

    /**
     * Decode a DFU functional descriptor from `buf` at `offset`.
     * @param {Uint8Array} buf - Buffer containing the descriptor.
     * @param {number} [offset=0] - Byte offset of the descriptor's bLength field.
     * @returns {{bLength:number,bDescriptorType:number,bmAttributes:number,wDetachTimeOut:number,wTransferSize:number,bcdDFUVersion:number}}
     */
    _parseFunctionalDescriptor(buf, offset = 0) {
        return {
            bLength: buf[offset],
            bDescriptorType: buf[offset + 1],
            bmAttributes: buf[offset + 2],
            wDetachTimeOut: (buf[offset + 4] << 8) | buf[offset + 3],
            wTransferSize: (buf[offset + 6] << 8) | buf[offset + 5],
            bcdDFUVersion: (buf[offset + 8] << 8) | buf[offset + 7],
        };
    }

    /**
     * True if `buf` at `offset` is a complete (9-byte) DFU functional descriptor with a
     * usable, non-zero wTransferSize. Rejects HID descriptors (same 0x21 type) that are
     * shorter or that decode to a zero transfer size.
     * @param {Uint8Array} buf
     * @param {number} offset
     * @returns {boolean}
     */
    _isValidFunctionalDescriptor(buf, offset) {
        const DFU = WebUsbDfuTransport.DFU_FUNCTIONAL_DESCRIPTOR_TYPE;
        if (buf[offset + 1] !== DFU) {
            return false;
        }
        // DFU functional descriptor is exactly 9 bytes.
        if (buf[offset] < 9 || offset + 9 > buf.length) {
            return false;
        }
        const wTransferSize = (buf[offset + 6] << 8) | buf[offset + 5];
        return wTransferSize > 0;
    }

    /**
     * Read the DFU functional descriptor.
     *
     * The descriptor (bDescriptorType 0x21) is embedded in the configuration descriptor,
     * so we parse it from the blob we already fetched. Some ST ROM bootloaders (confirmed
     * on the STM32C5) never answer a standalone GET_DESCRIPTOR for it and the request
     * hangs indefinitely; reading it from the config descriptor avoids that request and
     * yields the real wTransferSize.
     *
     * Because 0x21 is also the HID descriptor type, a match is only accepted when it sits
     * inside a DFU interface (bInterfaceClass 0xFE / bInterfaceSubClass 0x01) and is a
     * complete 9-byte descriptor with a non-zero wTransferSize.
     * @returns {Promise<{bLength:number,bDescriptorType:number,bmAttributes:number,wDetachTimeOut:number,wTransferSize:number,bcdDFUVersion:number}>}
     */
    async getFunctionalDescriptor() {
        try {
            const buf = await this.getConfigDescriptor();
            let offset = 0;
            let inDfuInterface = false;
            while (offset + 1 < buf.length) {
                const bLength = buf[offset];
                const bDescriptorType = buf[offset + 1];

                if (bDescriptorType === 4 && offset + 9 <= buf.length) {
                    // Interface descriptor: Application-Specific class 0xFE, DFU subclass 0x01.
                    inDfuInterface = buf[offset + 5] === 0xfe && buf[offset + 6] === 0x01;
                } else if (
                    inDfuInterface &&
                    bDescriptorType === WebUsbDfuTransport.DFU_FUNCTIONAL_DESCRIPTOR_TYPE &&
                    this._isValidFunctionalDescriptor(buf, offset)
                ) {
                    const descriptor = this._parseFunctionalDescriptor(buf, offset);
                    console.log(
                        `${this.logHead} DFU functional descriptor from config: wTransferSize=${descriptor.wTransferSize}`,
                    );
                    return descriptor;
                }
                offset += bLength || 1;
            }
            console.warn(`${this.logHead} DFU functional descriptor not in config blob; trying standalone request`);
        } catch (error) {
            console.warn(`${this.logHead} Could not read config descriptor for functional descriptor: ${error}`);
        }

        // Fallback: request it directly (works on classic ST/AT32/GD32 bootloaders).
        const setup = {
            requestType: "standard",
            recipient: "interface",
            request: 6,
            value: 0x2100,
            index: 0,
        };

        const result = await this._withTimeout(
            this.usbDevice.controlTransferIn(setup, 255),
            5000,
            "getFunctionalDescriptor",
        );
        if (result.status === "ok") {
            const buf = new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
            if (!this._isValidFunctionalDescriptor(buf, 0)) {
                throw new Error(`${this.logHead} Invalid DFU functional descriptor in standalone response`);
            }
            return this._parseFunctionalDescriptor(buf, 0);
        }
        throw new Error(`USB getFunctionalDescriptor failed: ${result.status}`);
    }
}

export default WebUsbDfuTransport;
