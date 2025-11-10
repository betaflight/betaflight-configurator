import { UsbSerial } from "capacitor-plugin-usb-serial";
import { serialDevices, vendorIdNames } from "./devices";

const logHead = "[Capacitor Serial]";

class CapacitorSerialProtocol extends EventTarget {
    constructor() {
        super();

        this.connected = false;
        this.connectionInfo = null;

        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.isOpen = false;
        this.port = null;
        this.ports = [];

        this.connectionId = null;
        this.reading = false;
        this.selectedDevice = null;

        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.handleReceiveBytes = this.handleReceiveBytes.bind(this);
        this.handleDataEvent = this.handleDataEvent.bind(this);
        this.handleConnectedEvent = this.handleConnectedEvent.bind(this);
        this.handleAttachedEvent = this.handleAttachedEvent.bind(this);
        this.handleDetachedEvent = this.handleDetachedEvent.bind(this);
        this.handleErrorEvent = this.handleErrorEvent.bind(this);

        // Set up plugin event listeners
        this.setupPluginListeners();
    }

    setupPluginListeners() {
        // Listen for data from the USB serial plugin
        UsbSerial.addListener("data", this.handleDataEvent);

        // Listen for connection events
        UsbSerial.addListener("connected", this.handleConnectedEvent);

        // Listen for device attach/detach
        UsbSerial.addListener("attached", this.handleAttachedEvent);
        UsbSerial.addListener("detached", this.handleDetachedEvent);

        // Listen for errors
        UsbSerial.addListener("error", this.handleErrorEvent);
    }

    handleDataEvent(event) {
        console.log(`${logHead} Data event received:`, event);
        if (event?.data) {
            console.log(`${logHead} Raw data from plugin:`, event.data, typeof event.data);
            // Convert hex string to Uint8Array (like WebSerial does)
            const uint8Array = this.hexStringToUint8Array(event.data);
            console.log(`${logHead} Received ${uint8Array.byteLength} bytes:`, uint8Array);
            this.bytesReceived += uint8Array.byteLength;
            this.dispatchEvent(new CustomEvent("receive", { detail: uint8Array }));
        } else {
            console.warn(`${logHead} Data event received but no data property:`, event);
        }
    }

    handleConnectedEvent(event) {
        console.log(`${logHead} Device connected:`, event);
        this.connected = true;
    }

    handleAttachedEvent(event) {
        console.log(`${logHead} Device attached:`, event);
        const added = this.handleNewDevice(event);
        this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));
    }

    handleDetachedEvent(event) {
        console.log(`${logHead} Device detached:`, event);
        this.handleDeviceRemoval(event);
    }

    handleErrorEvent(event) {
        console.error(`${logHead} Error:`, event.error);
        this.dispatchEvent(new CustomEvent("error", { detail: event.error }));
    }

    hexStringToArrayBuffer(hexString) {
        // Remove any spaces or non-hex characters
        const cleanHex = hexString.replace(/[^0-9A-Fa-f]/g, "");
        const length = cleanHex.length / 2;
        const buffer = new ArrayBuffer(length);
        const view = new Uint8Array(buffer);

        for (let i = 0; i < length; i++) {
            view[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
        }

        return buffer;
    }

    hexStringToUint8Array(hexString) {
        // Remove any spaces or non-hex characters
        const cleanHex = hexString.replace(/[^0-9A-Fa-f]/g, "");
        const length = cleanHex.length / 2;
        const uint8Array = new Uint8Array(length);

        for (let i = 0; i < length; i++) {
            uint8Array[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
        }

        return uint8Array;
    }

    arrayBufferToHexString(buffer) {
        // Handle both Uint8Array and ArrayBuffer
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

    handleReceiveBytes(info) {
        console.log(`${logHead} Received ${info.detail.byteLength} bytes`);
        this.bytesReceived += info.detail.byteLength;
    }

    getConnectedPort() {
        return this.connectionId;
    }

    handleNewDevice(device) {
        const added = this.createPort(device);
        if (added) {
            this.ports.push(added);
            this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));
        }
        return added;
    }

    createPort(device) {
        // Avoid duplicates
        if (this.ports.some((p) => p.vendorId === device.vendorId && p.productId === device.productId)) {
            return null;
        }
        const displayName = vendorIdNames[device.vendorId]
            ? vendorIdNames[device.vendorId]
            : `VID:${device.vendorId} PID:${device.productId}`;

        return {
            path: "serial",
            displayName: `Betaflight ${displayName}`,
            vendorId: device.vendorId,
            productId: device.productId,
            deviceId: device.deviceId,
        };
    }

    handleDeviceRemoval(device) {
        const index = this.ports.findIndex((p) => p.vendorId === device.vendorId && p.productId === device.productId);
        if (index !== -1) {
            const removed = this.ports.splice(index, 1)[0];
            this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
            console.log(`${logHead} Device removed: VID:${device.vendorId} PID:${device.productId}`);
        }
    }

    async loadDevices() {
        try {
            const result = await UsbSerial.connectedDevices();
            console.log(`${logHead} connectedDevices result:`, result);
            this.ports = [];

            if (result?.devices && Array.isArray(result.devices)) {
                for (const device of result.devices) {
                    const vid = device.device?.vendorId;
                    const pid = device.device?.productId;
                    const did = device.device?.deviceId;
                    const port = this.createPort(device.device);
                    if (port) {
                        this.ports.push(port);
                    }
                }
            }
            console.log(`${logHead} Loaded ${this.ports.length} devices`);
        } catch (error) {
            console.error(`${logHead} Error loading devices:`, error);
        }
    }

    async getDevices() {
        await this.loadDevices();
        return this.ports;
    }

    async connect(path, options = { baudRate: 115200 }) {
        try {
            /*
            if (!this.selectedDevice) {
                console.error(`${logHead} No device selected`);
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }

            const device = this.ports.find(p => p.deviceId === this.selectedDevice.deviceId);
            if (!device) {
                console.error(`${logHead} Device not found`);
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }
            */

            const device = this.ports.find((device) => device.path === path);

            if (!device) {
                console.error(`${logHead} Device not found`);
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }

            console.log(`${logHead} Connecting to device:`, device);
            // Open serial connection
            await UsbSerial.openSerial({
                deviceId: device.deviceId,
                portNum: 0,
                baudRate: options.baudRate || 115200,
                dataBits: 8,
                stopBits: 1,
                parity: 0,
                dtr: false,
                rts: false,
            });

            console.log(`${logHead} Serial connection opened with options:`, options);
            this.isOpen = true;
            this.connectionId = path;
            this.connected = true;
            this.port = device;

            this.addEventListener("receive", this.handleReceiveBytes);

            this.dispatchEvent(new CustomEvent("connect", { detail: true }));
            console.log(`${logHead} Connected to ${path}`);

            return true;
        } catch (error) {
            console.error(`${logHead} Error opening serial connection:`, error);
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }
    }

    /**
     * Request serial permissions for a device.
     * This will trigger Android's permission dialog.
     */
    async requestPermissionDevice() {
        try {
            // Reload devices to get the latest list
            await this.loadDevices();

            // Try to find a matching device from our known serial devices list
            for (const { vendorId, productId } of serialDevices) {
                const device = this.ports.find((p) => p.vendorId === vendorId && p.productId === productId);
                if (device) {
                    this.selectedDevice = device;
                    console.log(`${logHead} Selected device:`, device);
                    return device;
                }
            }

            // If no known device found, select the first available device
            if (this.ports.length > 0) {
                this.selectedDevice = this.ports[0];
                console.log(`${logHead} Selected first available device:`, this.selectedDevice);
                return this.selectedDevice;
            }

            console.warn(`${logHead} No compatible devices found`);
            return null;
        } catch (error) {
            console.error(`${logHead} Error requesting device permission:`, error);
            return null;
        }
    }

    async send(data, callback) {
        if (!this.isOpen) {
            console.error(`${logHead} Cannot send - not connected`);
            callback?.({ bytesSent: 0 });
            return false;
        }

        try {
            // Handle both Uint8Array and ArrayBuffer
            let uint8Array;
            if (data instanceof Uint8Array) {
                uint8Array = data;
            } else if (data instanceof ArrayBuffer) {
                uint8Array = new Uint8Array(data);
            } else {
                throw new Error("Data must be Uint8Array or ArrayBuffer");
            }

            // Convert to hex string for the plugin
            const hexString = this.arrayBufferToHexString(uint8Array.buffer);
            console.log(`${logHead} Sending data:`, data, "hex:", hexString);

            await UsbSerial.writeSerial({ data: hexString });

            const bytesSent = uint8Array.byteLength;
            this.bytesSent += bytesSent;
            console.log(`${logHead} Sent ${bytesSent} bytes`);

            callback?.({ bytesSent: bytesSent });
            return true;
        } catch (error) {
            console.error(`${logHead} Error sending data:`, error);
            callback?.({ bytesSent: 0 });
            return false;
        }
    }

    async disconnect(callback) {
        if (!this.isOpen) {
            callback?.(true);
            return;
        }

        this.reading = false;
        let closeError = null;

        try {
            await UsbSerial.closeSerial();
            console.log(`${logHead} Serial connection closed`);
        } catch (error) {
            console.error(`${logHead} Error closing serial connection:`, error);
            closeError = error;
        } finally {
            this.isOpen = false;
            this.connected = false;
            this.port = null;
            this.connectionId = null;
            this.removeEventListener("receive", this.handleReceiveBytes);
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
        }

        callback?.(closeError ? false : true);

        if (closeError) {
            throw new Error("Failed to close serial port", { cause: closeError });
        }
    }
}

export default CapacitorSerialProtocol;
