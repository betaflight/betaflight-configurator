import { webSerialDevices, vendorIdNames } from "./devices";
import { checkBrowserCompatibility } from "../utils/checkBrowserCompatibilty";

async function* streamAsyncIterable(reader, keepReadingFlag) {
    try {
        while (keepReadingFlag()) {
            const { done, value } = await reader.read();
            if (done) {
                return;
            }
            yield value;
        }
    } finally {
        reader.releaseLock();
    }
}

/**
 * WebSerial protocol implementation for the Serial base class
 */
class WebSerial extends EventTarget {
    constructor() {
        super();

        checkBrowserCompatibility();

        this.connected = false;
        this.openRequested = false;
        this.openCanceled = false;
        this.closeRequested = false;
        this.transmitting = false;
        this.connectionInfo = null;

        this.bitrate = 0;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.failed = 0;

        this.logHead = "[SERIAL]";

        this.portCounter = 0;
        this.ports = [];
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.reading = false;

        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.handleDisconnect = this.handleDisconnect.bind(this);
        this.handleReceiveBytes = this.handleReceiveBytes.bind(this);

        // Initialize device connection/disconnection listeners
        if (navigator.serial) {
            navigator.serial.addEventListener("connect", (e) => this.handleNewDevice(e.target));
            navigator.serial.addEventListener("disconnect", (e) => this.handleRemovedDevice(e.target));
        }

        this.loadDevices();
    }

    handleNewDevice(device) {
        const added = this.createPort(device);
        this.ports.push(added);
        this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));

        return added;
    }

    handleRemovedDevice(device) {
        const removed = this.ports.find((port) => port.port === device);
        this.ports = this.ports.filter((port) => port.port !== device);
        this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
    }

    handleReceiveBytes(info) {
        this.bytesReceived += info.detail.byteLength;
    }

    handleDisconnect() {
        console.log(`${this.logHead} Device disconnected externally`);
        this.disconnect();
    }

    getConnectedPort() {
        return this.port;
    }

    createPort(port) {
        const portInfo = port.getInfo();
        const displayName = vendorIdNames[portInfo.usbVendorId]
            ? vendorIdNames[portInfo.usbVendorId]
            : `VID:${portInfo.usbVendorId} PID:${portInfo.usbProductId}`;
        return {
            path: `serial_${this.portCounter++}`,
            displayName: `Betaflight ${displayName}`,
            vendorId: portInfo.usbVendorId,
            productId: portInfo.usbProductId,
            port: port,
        };
    }

    async loadDevices() {
        if (!navigator.serial) {
            console.error(`${this.logHead} Web Serial API not available`);
            return;
        }

        try {
            const ports = await navigator.serial.getPorts();
            this.portCounter = 1;
            this.ports = ports.map((port) => this.createPort(port));
        } catch (error) {
            console.error(`${this.logHead} Error loading devices:`, error);
        }
    }

    async requestPermissionDevice(showAllSerialDevices = false) {
        if (!navigator.serial) {
            console.error(`${this.logHead} Web Serial API not available`);
            return null;
        }

        let newPermissionPort = null;

        try {
            const options = showAllSerialDevices ? {} : { filters: webSerialDevices };
            const userSelectedPort = await navigator.serial.requestPort(options);

            newPermissionPort = this.ports.find((port) => port.port === userSelectedPort);

            if (!newPermissionPort) {
                newPermissionPort = this.handleNewDevice(userSelectedPort);
            }
            console.info(`${this.logHead} User selected SERIAL device from permissions:`, newPermissionPort.path);
        } catch (error) {
            console.error(`${this.logHead} User didn't select any SERIAL device when requesting permission:`, error);
        }
        return newPermissionPort;
    }

    async getDevices() {
        return this.ports;
    }

    async connect(path, options = { baudRate: 115200 }) {
        // Prevent double connections
        if (this.connected) {
            console.log(`${this.logHead} Already connected, not connecting again`);
            return true;
        }

        this.openRequested = true;
        this.closeRequested = false;

        try {
            const device = this.ports.find((device) => device.path === path);
            if (!device) {
                console.error(`${this.logHead} Device not found:`, path);
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }

            this.port = device.port;

            await this.port.open(options);

            const connectionInfo = this.port.getInfo();
            this.connectionInfo = connectionInfo;
            this.writer = this.port.writable.getWriter();
            this.reader = this.port.readable.getReader();

            if (connectionInfo && !this.openCanceled) {
                this.connected = true;
                this.connectionId = path;
                this.bitrate = options.baudRate;
                this.bytesReceived = 0;
                this.bytesSent = 0;
                this.failed = 0;
                this.openRequested = false;

                this.port.addEventListener("disconnect", this.handleDisconnect);
                this.addEventListener("receive", this.handleReceiveBytes);

                console.log(
                    `${this.logHead} Connection opened with ID: ${this.connectionId}, Baud: ${options.baudRate}`,
                );

                this.dispatchEvent(new CustomEvent("connect", { detail: connectionInfo }));

                // Start reading from the port
                this.reading = true;
                this.readLoop();

                return true;
            } else if (connectionInfo && this.openCanceled) {
                this.connectionId = path;

                console.log(
                    `${this.logHead} Connection opened with ID: ${path}, but request was canceled, disconnecting`,
                );
                // some bluetooth dongles/dongle drivers really doesn't like to be closed instantly, adding a small delay
                setTimeout(() => {
                    this.openRequested = false;
                    this.openCanceled = false;
                    this.disconnect();
                    this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                }, 150);

                return false;
            } else {
                this.openRequested = false;
                console.log(`${this.logHead} Failed to open serial port`);
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }
        } catch (error) {
            console.error(`${this.logHead} Error connecting:`, error);
            this.openRequested = false;
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }
    }

    async readLoop() {
        try {
            for await (let value of streamAsyncIterable(this.reader, () => this.reading)) {
                this.dispatchEvent(new CustomEvent("receive", { detail: value }));
            }
        } catch (error) {
            console.error(`${this.logHead} Error reading:`, error);
            if (this.connected) {
                this.disconnect();
            }
        }
    }

    async disconnect(callback) {
        // If already disconnected, just call callback and return
        if (!this.connected) {
            if (callback) {
                try {
                    callback(true);
                } catch (error) {
                    console.error(`${this.logHead} Error calling disconnect callback:`, error);
                }
            }
            return true;
        }

        // Mark as disconnected immediately to prevent race conditions
        this.connected = false;
        this.transmitting = false;
        this.reading = false;

        // if we are already closing, don't do it again
        if (this.closeRequested) {
            if (callback) {
                try {
                    callback(true);
                } catch (error) {
                    console.error(`${this.logHead} Error calling disconnect callback:`, error);
                }
            }
            return true;
        }

        this.closeRequested = true;

        try {
            this.removeEventListener("receive", this.handleReceiveBytes);

            if (this.reader) {
                // removing this fixes a bug where the reader is not released when the port is closed
                // note this prevented DFU mode from working on some devices
                // await this.reader.cancel();
                await this.reader.releaseLock();
                this.reader = null;
            }

            if (this.writer) {
                await this.writer.releaseLock();
                this.writer = null;
            }

            if (this.port) {
                this.port.removeEventListener("disconnect", this.handleDisconnect);
                await this.port.close();
                this.port = null;
            }

            console.log(
                `${this.logHead} Connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`,
            );

            this.connectionId = false;
            this.bitrate = 0;
            this.closeRequested = false;

            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));

            if (callback) {
                try {
                    callback(true);
                } catch (error) {
                    console.error(`${this.logHead} Error calling disconnect callback:`, error);
                }
            }

            return true;
        } catch (error) {
            console.error(`${this.logHead} Error disconnecting:`, error);
            console.error(
                `${this.logHead} Failed to close connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`,
            );

            this.closeRequested = false;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));

            if (callback) {
                try {
                    callback(false);
                } catch (error) {
                    console.error(`${this.logHead} Error calling disconnect callback:`, error);
                }
            }

            return false;
        } finally {
            if (this.openCanceled) {
                this.openCanceled = false;
            }
        }
    }

    async send(data, callback) {
        if (!this.connected || !this.writer) {
            console.error(`${this.logHead} Failed to send data, serial port not open`);
            if (callback) {
                callback({ bytesSent: 0 });
            }
            return { bytesSent: 0 };
        }

        try {
            await this.writer.write(data);
            this.bytesSent += data.byteLength;

            const result = { bytesSent: data.byteLength };
            if (callback) {
                callback(result);
            }
            return result;
        } catch (error) {
            console.error(`${this.logHead} Error sending data:`, error);
            if (callback) {
                callback({ bytesSent: 0 });
            }
            return { bytesSent: 0 };
        }
    }

    /**
     * Clean up resources when the protocol is no longer needed
     */
    cleanup() {
        if (this.connected) {
            this.disconnect();
        }
    }
}

// Export the class itself, not an instance
export default WebSerial;
