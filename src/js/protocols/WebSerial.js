import { webSerialDevices, vendorIdNames } from "./devices";
import { checkBrowserCompatibility } from "../utils/checkBrowserCompatibilty";

const logHead = "[SERIAL]";

async function* streamAsyncIterable(reader, keepReadingFlag) {
    try {
        while (keepReadingFlag()) {
            try {
                const { done, value } = await reader.read();
                if (done) {
                    return;
                }
                yield value;
            } catch (error) {
                console.warn(`${logHead} Read error in streamAsyncIterable:`, error);
                break;
            }
        }
    } finally {
        // Only release the lock if we still have the reader and it hasn't been released
        try {
            // Always attempt once; spec allows releasing even if the stream
            // is already closed.  `locked` is the boolean we can trust.
            if (reader?.locked) {
                reader.releaseLock();
            }
        } catch (error) {
            console.warn(`${logHead} Error releasing reader lock:`, error);
        }
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
        console.log(`${logHead} Device disconnected externally`);
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
            console.error(`${logHead} Web Serial API not available`);
            return;
        }

        try {
            const ports = await navigator.serial.getPorts();
            this.portCounter = 1;
            this.ports = ports.map((port) => this.createPort(port));
        } catch (error) {
            console.error(`${logHead} Error loading devices:`, error);
        }
    }

    async requestPermissionDevice(showAllSerialDevices = false) {
        if (!navigator.serial) {
            console.error(`${logHead} Web Serial API not available`);
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
            console.info(`${logHead} User selected SERIAL device from permissions:`, newPermissionPort.path);
        } catch (error) {
            console.error(`${logHead} User didn't select any SERIAL device when requesting permission:`, error);
        }
        return newPermissionPort;
    }

    async getDevices() {
        return this.ports;
    }

    async connect(path, options = { baudRate: 115200 }) {
        // Prevent double connections
        if (this.connected) {
            console.log(`${logHead} Already connected, not connecting again`);
            return true;
        }

        this.openRequested = true;
        this.closeRequested = false;

        try {
            const device = this.ports.find((device) => device.path === path);
            if (!device) {
                console.error(`${logHead} Device not found:`, path);
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

                console.log(`${logHead} Connection opened with ID: ${this.connectionId}, Baud: ${options.baudRate}`);

                this.dispatchEvent(new CustomEvent("connect", { detail: connectionInfo }));

                // Start reading from the port
                this.reading = true;
                this.readLoop();

                return true;
            } else if (connectionInfo && this.openCanceled) {
                this.connectionId = path;

                console.log(`${logHead} Connection opened with ID: ${path}, but request was canceled, disconnecting`);
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
                console.log(`${logHead} Failed to open serial port`);
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }
        } catch (error) {
            console.error(`${logHead} Error connecting:`, error);
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
            console.error(`${logHead} Error reading:`, error);
            if (this.connected) {
                this.disconnect();
            }
        }
    }

    // Update disconnect method
    async disconnect() {
        // If already disconnected, just return
        if (!this.connected) {
            return true;
        }

        // Mark as disconnected immediately to prevent race conditions
        this.connected = false;
        this.transmitting = false;

        // Signal the read loop to stop BEFORE attempting cleanup
        this.reading = false;

        // If already closing, don't do it again
        if (this.closeRequested) {
            return true;
        }

        this.closeRequested = true;

        try {
            // Remove event listeners first
            this.removeEventListener("receive", this.handleReceiveBytes);

            // Small delay to allow ongoing operations to notice connection state change
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Cancel reader first if it exists - this doesn't release the lock
            if (this.reader) {
                try {
                    await this.reader.cancel();
                } catch (e) {
                    console.warn(`${logHead} Reader cancel error (can be ignored):`, e);
                }
            }

            // Don't try to release the reader lock - streamAsyncIterable will handle it
            this.reader = null;

            // Release writer lock if it exists
            if (this.writer) {
                try {
                    this.writer.releaseLock();
                } catch (e) {
                    console.warn(`${logHead} Writer release error (can be ignored):`, e);
                }
                this.writer = null;
            }

            // Close the port
            if (this.port) {
                this.port.removeEventListener("disconnect", this.handleDisconnect);
                try {
                    await this.port.close();
                } catch (e) {
                    console.warn(`${logHead} Port already closed or error during close:`, e);
                }
                this.port = null;
            }

            console.log(
                `${logHead} Connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`,
            );

            this.connectionId = false;
            this.bitrate = 0;
            this.closeRequested = false;

            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            return true;
        } catch (error) {
            console.error(`${logHead} Error disconnecting:`, error);
            this.closeRequested = false;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));
            return false;
        } finally {
            if (this.openCanceled) {
                this.openCanceled = false;
            }
        }
    }

    async send(data, callback) {
        if (!this.connected || !this.writer) {
            console.error(`${logHead} Failed to send data, serial port not open`);
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
            console.error(`${logHead} Error sending data:`, error);
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
