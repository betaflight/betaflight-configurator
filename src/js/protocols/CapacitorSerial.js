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

    cleanup() {
        UsbSerial.removeAllListeners("data");
        UsbSerial.removeAllListeners("connected");
        UsbSerial.removeAllListeners("attached");
        UsbSerial.removeAllListeners("detached");
        UsbSerial.removeAllListeners("error");
    }

    handleDataEvent(event) {
        if (event?.data) {
            // Convert hex string from plugin to Uint8Array
            const uint8Array = this.hexStringToUint8Array(event.data);
            this.bytesReceived += uint8Array.byteLength;
            this.dispatchEvent(new CustomEvent("receive", { detail: uint8Array }));
        }
    }

    handleConnectedEvent(event) {
        this.connected = true;
    }

    handleAttachedEvent(event) {
        this.handleNewDevice(event);
    }

    handleDetachedEvent(event) {
        this.handleDeviceRemoval(event);
    }

    handleErrorEvent(event) {
        console.error(`${logHead} Error:`, event.error);
        this.dispatchEvent(new CustomEvent("error", { detail: event.error }));
    }

    hexStringToUint8Array(hexString) {
        const length = hexString.length / 2;
        const uint8Array = new Uint8Array(length);

        for (let i = 0; i < length; i++) {
            uint8Array[i] = Number.parseInt(hexString.slice(i * 2, i * 2 + 2), 16);
        }

        return uint8Array;
    }

    arrayBufferToHexString(buffer) {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

    getConnectedPort() {
        return this.connectionId;
    }

    handleNewDevice(device) {
        const added = this.createPort(device);
        if (added) {
            this.ports.push(added);
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
        }
    }

    async loadDevices() {
        try {
            const result = await UsbSerial.connectedDevices();
            this.ports = [];

            if (result?.devices && Array.isArray(result.devices)) {
                for (const device of result.devices) {
                    const port = this.createPort(device.device);
                    if (port) {
                        this.ports.push(port);
                    }
                }
            }
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
            const device = this.ports.find((device) => device.path === path);

            if (!device) {
                console.error(`${logHead} Device not found`);
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }

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

            this.isOpen = true;
            this.connectionId = path;
            this.connected = true;
            this.port = device;

            this.dispatchEvent(new CustomEvent("connect", { detail: true }));

            return true;
        } catch (error) {
            console.error(`${logHead} Error opening serial connection:`, error);
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }
    }

    async requestPermissionDevice() {
        try {
            await this.loadDevices();

            // Try to find a matching device from our known serial devices list
            for (const { vendorId, productId } of serialDevices) {
                const device = this.ports.find((p) => p.vendorId === vendorId && p.productId === productId);
                if (device) {
                    this.selectedDevice = device;
                    return device;
                }
            }

            // If no known device found, select the first available device
            if (this.ports.length > 0) {
                this.selectedDevice = this.ports[0];
                return this.selectedDevice;
            }

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
            const uint8Array = data instanceof Uint8Array ? data : new Uint8Array(data);

            // Convert to hex string for the plugin
            const hexString = this.arrayBufferToHexString(uint8Array);

            await UsbSerial.writeSerial({ data: hexString });

            const bytesSent = uint8Array.byteLength;
            this.bytesSent += bytesSent;

            callback?.({ bytesSent });
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
        } catch (error) {
            console.error(`${logHead} Error closing serial connection:`, error);
            closeError = error;
        } finally {
            this.cleanup();
            this.isOpen = false;
            this.connected = false;
            this.port = null;
            this.connectionId = null;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
        }

        callback?.(!closeError);

        if (closeError) {
            throw new Error("Failed to close serial port", { cause: closeError });
        }
    }
}

export default CapacitorSerialProtocol;
