import { webSerialDevices, vendorIdNames } from "./devices";
import GUI from "../gui";
import logger from "../logger";

const logHead = "[WEBSERIAL]";

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

        this.ports = [];
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.reading = false;

        if (!navigator?.serial) {
            logger.error(`${logHead} Web Serial API not supported`);
            return;
        }

        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.handleDisconnect = this.handleDisconnect.bind(this);
        this.handleReceiveBytes = this.handleReceiveBytes.bind(this);

        // Initialize device connection/disconnection listeners
        navigator.serial.addEventListener("connect", (e) => this.handleNewDevice(e.target));
        navigator.serial.addEventListener("disconnect", (e) => this.handleRemovedDevice(e.target));

        this.isNeedBatchWrite = false;
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
        logger.info(`${logHead} Device disconnected externally`);
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
            path: "serial",
            displayName: `Betaflight ${displayName}`,
            vendorId: portInfo.usbVendorId,
            productId: portInfo.usbProductId,
            port: port,
        };
    }

    async loadDevices() {
        try {
            const ports = await navigator.serial.getPorts();
            this.ports = ports.map((port) => this.createPort(port));
        } catch (error) {
            logger.error(`${logHead} Error loading devices:`, error);
        }
    }

    async requestPermissionDevice(showAllSerialDevices = false) {
        let newPermissionPort = null;

        try {
            const options = showAllSerialDevices ? {} : { filters: webSerialDevices };
            const userSelectedPort = await navigator.serial.requestPort(options);

            newPermissionPort = this.ports.find((port) => port.port === userSelectedPort);

            if (!newPermissionPort) {
                newPermissionPort = this.handleNewDevice(userSelectedPort);
            }
            logger.info(`${logHead} User selected SERIAL device from permissions:`, newPermissionPort.path);
        } catch (error) {
            logger.error(`${logHead} User didn't select any SERIAL device when requesting permission:`, error);
        }
        return newPermissionPort;
    }

    async getDevices() {
        await this.loadDevices();
        return this.ports;
    }

    async connect(path, options = { baudRate: 115200 }) {
        // Prevent double connections
        if (this.connected) {
            logger.info(`${logHead} Already connected, not connecting again`);
            return true;
        }

        this.openRequested = true;
        this.closeRequested = false;

        try {
            const device = this.ports.find((device) => device.path === path);
            if (!device) {
                logger.error(`${logHead} Device not found:`, path);
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }

            this.port = device.port;

            await this.port.open(options);

            const connectionInfo = this.port.getInfo();
            this.connectionInfo = connectionInfo;
            this.isNeedBatchWrite = this.checkIsNeedBatchWrite();
            if (this.isNeedBatchWrite) {
                logger.info(`${logHead} Enabling batch write mode for AT32 on macOS`);
            }
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

                logger.info(`${logHead} Connection opened with ID: ${this.connectionId}, Baud: ${options.baudRate}`);

                this.dispatchEvent(new CustomEvent("connect", { detail: connectionInfo }));

                // Start reading from the port
                this.reading = true;
                this.readLoop();

                return true;
            } else if (connectionInfo && this.openCanceled) {
                this.connectionId = path;

                logger.info(`${logHead} Connection opened with ID: ${path}, but request was canceled, disconnecting`);
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
                logger.warn(`${logHead} Failed to open serial port`);
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }
        } catch (error) {
            logger.error(`${logHead} Error connecting:`, error);

            // If the port is already open (InvalidStateError) we can attempt to
            // recover by attaching to the already-open port. Some browser
            // implementations throw when open() is called concurrently but the
            // underlying port is already usable. Try to initialize reader/writer
            // and proceed as a successful connection.
            if (
                error &&
                (error.name === "InvalidStateError" ||
                    (typeof error.message === "string" && error.message.includes("already open")))
            ) {
                // NOTE: Some browser implementations throw InvalidStateError when
                // open() is called concurrently while the underlying port is
                // already open. In those cases, we try to attach to the already-
                // open port by obtaining the reader/writer objects. If we can
                // obtain both reader and writer we treat the port as successfully
                // recovered; otherwise we perform a graceful failure path below.
                try {
                    const connectionInfo = this.port?.getInfo ? this.port.getInfo() : null;
                    this.connectionInfo = connectionInfo;
                    this.isNeedBatchWrite = connectionInfo ? this.checkIsNeedBatchWrite() : false;
                    // Attempt to obtain writer/reader if available
                    try {
                        if (this.port?.writable && !this.writer) {
                            this.writer = this.port.writable.getWriter();
                        }
                    } catch (e) {
                        logger.warn(`${logHead} Could not get writer from already-open port:`, e);
                    }

                    try {
                        if (this.port?.readable && !this.reader) {
                            this.reader = this.port.readable.getReader();
                        }
                    } catch (e) {
                        logger.warn(`${logHead} Could not get reader from already-open port:`, e);
                    }

                    if (connectionInfo) {
                        if (!this.writer || !this.reader) {
                            logger.warn(`${logHead} Recovered port missing reader/writer`);
                            // Release partial writer/reader locks before aborting recovery
                            if (this.writer) {
                                try {
                                    this.writer.releaseLock();
                                } catch (releaseErr) {
                                    logger.warn(`${logHead} Failed to release partial writer lock:`, releaseErr);
                                }
                                this.writer = null;
                            }
                            if (this.reader) {
                                try {
                                    this.reader.releaseLock?.();
                                } catch (releaseErr) {
                                    logger.warn(`${logHead} Failed to release partial reader lock:`, releaseErr);
                                }
                                this.reader = null;
                            }
                            // Reset request state and signal failure to callers instead of throwing
                            this.openRequested = false;
                            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                            return false;
                        }
                        this.connected = true;
                        this.connectionId = path;
                        this.bitrate = options.baudRate;
                        this.bytesReceived = 0;
                        this.bytesSent = 0;
                        this.failed = 0;
                        this.openRequested = false;

                        this.port.addEventListener("disconnect", this.handleDisconnect);
                        this.addEventListener("receive", this.handleReceiveBytes);

                        logger.info(`${logHead} Recovered already-open serial port, ID: ${this.connectionId}`);
                        this.dispatchEvent(new CustomEvent("connect", { detail: connectionInfo }));

                        // Start read loop if not already running
                        if (!this.reading) {
                            this.reading = true;
                            this.readLoop();
                        }

                        return true;
                    }
                } catch (e) {
                    logger.warn(`${logHead} Failed to recover already-open port:`, e);
                }
            }

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
            logger.error(`${logHead} Error reading:`, error);
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
                    logger.warn(`${logHead} Reader cancel error (can be ignored):`, e);
                }
            }

            // Don't try to release the reader lock - streamAsyncIterable will handle it
            this.reader = null;

            // Release writer lock if it exists
            if (this.writer) {
                try {
                    this.writer.releaseLock();
                } catch (e) {
                    logger.warn(`${logHead} Writer release error (can be ignored):`, e);
                }
                this.writer = null;
            }

            // Close the port
            if (this.port) {
                this.port.removeEventListener("disconnect", this.handleDisconnect);
                try {
                    await this.port.close();
                } catch (e) {
                    logger.warn(`${logHead} Port already closed or error during close:`, e);
                }
                this.port = null;
            }

            logger.info(
                `${logHead} Connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`,
            );

            this.connectionId = false;
            this.bitrate = 0;
            this.connectionInfo = null; // Reset connectionInfo
            this.closeRequested = false;

            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            return true;
        } catch (error) {
            logger.error(`${logHead} Error disconnecting:`, error);
            this.closeRequested = false;
            // Ensure connectionInfo is reset even on error if port was potentially open
            this.connectionInfo = null;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));
            return false;
        } finally {
            if (this.openCanceled) {
                this.openCanceled = false;
            }
        }
    }

    checkIsNeedBatchWrite() {
        const isMac = GUI.operating_system === "MacOS";
        return isMac && vendorIdNames[this.connectionInfo.usbVendorId] === "AT32";
    }

    async batchWrite(data) {
        // AT32 on macOS requires smaller chunks (63 bytes) to work correctly due to
        // USB buffer size limitations in the macOS implementation
        const batchWriteSize = 63;
        let remainingData = data;
        while (remainingData.byteLength > batchWriteSize) {
            const sliceData = remainingData.slice(0, batchWriteSize);
            remainingData = remainingData.slice(batchWriteSize);
            try {
                await this.writer.write(sliceData);
            } catch (error) {
                logger.error(`${logHead} Error writing batch chunk:`, error);
                throw error; // Re-throw to be caught by the send method
            }
        }
        await this.writer.write(remainingData);
    }

    async send(data, callback) {
        if (!this.connected || !this.writer) {
            logger.error(`${logHead} Failed to send data, serial port not open`);
            if (callback) {
                callback({ bytesSent: 0 });
            }
            return { bytesSent: 0 };
        }

        try {
            if (this.isNeedBatchWrite) {
                await this.batchWrite(data);
            } else {
                await this.writer.write(data);
            }
            this.bytesSent += data.byteLength;

            const result = { bytesSent: data.byteLength };
            if (callback) {
                callback(result);
            }
            return result;
        } catch (error) {
            logger.error(`${logHead} Error sending data:`, error);
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
