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

import { webSerialDevices, vendorIdNames } from "./devices";
import { useAppInfoStore } from "../../stores/appInfo";

const logHead = "[WEBSERIAL]";

// TypeScript's DOM library does not declare the Web Serial API (it is Chromium only), and
// @types/w3c-web-serial is not a dependency. These are the parts of it this transport uses,
// named apart from the W3C names so they cannot clash with those typings if they are added.

/** `SerialPort.getInfo()`. Both ids are absent for a port that is not a USB device. */
export interface WebSerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
}

/** `SerialOptions`, as handed to `SerialPort.open()`. */
export interface WebSerialOptions {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    bufferSize?: number;
    flowControl?: string;
}

/** The payloads this transport writes. */
export type WebSerialPayload = ArrayBuffer | Uint8Array<ArrayBuffer>;

/** The W3C `SerialPort`. */
export interface WebSerialPort extends EventTarget {
    // Null in the spec while the port is closed. This transport reads them only after
    // open() resolves, so they are declared as the open port has them.
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<WebSerialPayload>;
    getInfo(): WebSerialPortInfo;
    open(options: WebSerialOptions): Promise<void>;
    close(): Promise<void>;
}

/** `navigator.serial`. Its connect and disconnect events have the port as their target. */
interface WebSerialApi extends EventTarget {
    getPorts(): Promise<WebSerialPort[]>;
    requestPort(options?: { filters?: { usbVendorId?: number; usbProductId?: number }[] }): Promise<WebSerialPort>;
}

/** `navigator.serial`, absent where the browser has no Web Serial. */
function webSerialApi(): WebSerialApi | undefined {
    return (navigator as (Navigator & { serial?: WebSerialApi }) | undefined)?.serial;
}

/** A port as this transport reports it to serial.js and the port picker. */
export interface WebSerialDevice {
    path: string;
    displayName: string;
    vendorId: number | undefined;
    productId: number | undefined;
    port: WebSerialPort;
}

/** What `send` reports, both as its result and to the callback. */
export interface WebSerialSendResult {
    bytesSent: number;
}

/** The options `connect` opens with when the caller gives none. Read, never written. */
const DEFAULT_CONNECT_OPTIONS: Readonly<WebSerialOptions> = Object.freeze({ baudRate: 115200 });

async function* streamAsyncIterable(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    keepReadingFlag: () => boolean,
): AsyncGenerator<Uint8Array, void> {
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
        // A reader has no `locked` flag (that lives on the stream), so release unconditionally.
        // The spec makes releaseLock() a no-op on a reader that was already released.
        try {
            reader.releaseLock();
        } catch (error) {
            console.warn(`${logHead} Error releasing reader lock:`, error);
        }
    }
}

/**
 * WebSerial protocol implementation for the Serial base class
 */
class WebSerial extends EventTarget {
    // Each SerialPort object has its own id. The id stays the same when the code builds the
    // device list again. A counter alone would give a different number each time.
    // But the id changes if the device disconnects and then connects again, because Chrome
    // makes a new SerialPort object for it. Do not keep a path. Read the path from the
    // current list. The WeakMap lets the browser release the entry with the SerialPort.
    readonly #portIds = new WeakMap<WebSerialPort, string>();
    #nextPortId = 0;
    #loadGeneration = 0;

    connected: boolean;
    openRequested: boolean;
    openCanceled: boolean;
    closeRequested: boolean;
    transmitting: boolean;
    connectionInfo: WebSerialPortInfo | null;
    // Unset until the first connect; disconnect() resets it to false, not null.
    connectionId?: string | false;

    bitrate: number;
    bytesSent: number;
    bytesReceived: number;
    failed: number;

    ports: WebSerialDevice[];
    port: WebSerialPort | null;
    reader: ReadableStreamDefaultReader<Uint8Array> | null;
    writer: WritableStreamDefaultWriter<WebSerialPayload> | null;
    reading: boolean;

    isNeedBatchWrite = false;

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

        const serial = webSerialApi();
        if (!serial) {
            console.error(`${logHead} Web Serial API not supported`);
            return;
        }

        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.handleDisconnect = this.handleDisconnect.bind(this);
        this.handleReceiveBytes = this.handleReceiveBytes.bind(this);

        // Initialize device connection/disconnection listeners
        serial.addEventListener("connect", (e) => this.handleNewDevice(e.target as WebSerialPort));
        serial.addEventListener("disconnect", (e) => this.handleRemovedDevice(e.target as WebSerialPort));

        this.isNeedBatchWrite = false;
        // Fire-and-forget load, kept out of the constructor body (Sonar S7059).
        this._bootstrap();
    }

    private _bootstrap(): void {
        // loadDevices() catches and logs its own failures.
        void this.loadDevices();
    }

    handleNewDevice(device: WebSerialPort): WebSerialDevice {
        const added = this.createPort(device);
        this.ports.push(added);
        this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));
        return added;
    }

    handleRemovedDevice(device: WebSerialPort): void {
        const removed = this.ports.find((port) => port.port === device);

        // The list does not hold this port, because loadDevices() removed it before. There is
        // no device to report. An event with no detail only makes the listeners refresh the
        // list again for nothing.
        if (!removed) {
            return;
        }

        this.ports = this.ports.filter((port) => port.port !== device);
        this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
    }

    handleReceiveBytes(info: Event): void {
        // Registered only for this transport's own "receive" events, which carry the bytes.
        this.bytesReceived += (info as CustomEvent<Uint8Array>).detail.byteLength;
    }

    handleDisconnect(): void {
        console.log(`${logHead} Device disconnected externally`);
        // disconnect() catches its own failures and reports them as a "disconnect" event.
        void this.disconnect();
    }

    getConnectedDevice(): WebSerialPort | null {
        return this.port;
    }

    /**
     * Return the raw W3C SerialPort for a given path, so callers that need direct
     * port access (e.g. esptool-js for ESP32 flashing) can own open/close and signals.
     * @param path - port path (e.g. "serial")
     */
    getNativePort(path: string): WebSerialPort | undefined {
        return this.ports.find((device) => device.path === path)?.port;
    }

    /**
     * Get the id of a SerialPort object. Make a new id if the object is new.
     * @returns the id, for example "serial_0"
     */
    #getStablePortId(port: WebSerialPort): string {
        let id = this.#portIds.get(port);
        if (id === undefined) {
            id = `serial_${this.#nextPortId++}`;
            this.#portIds.set(port, id);
        }
        return id;
    }

    createPort(port: WebSerialPort): WebSerialDevice {
        const portInfo = port.getInfo();
        const vendorName = portInfo.usbVendorId === undefined ? undefined : vendorIdNames[portInfo.usbVendorId];
        const displayName = vendorName || `VID:${portInfo.usbVendorId} PID:${portInfo.usbProductId}`;
        return {
            path: this.#getStablePortId(port),
            displayName: `Betaflight ${displayName}`,
            vendorId: portInfo.usbVendorId,
            productId: portInfo.usbProductId,
            port: port,
        };
    }

    async loadDevices(): Promise<void> {
        const generation = ++this.#loadGeneration;

        try {
            // Throws inside the try where Web Serial is missing, as `navigator.serial.getPorts()` did.
            const ports = await (webSerialApi() as WebSerialApi).getPorts();

            // A burst of device events starts several refreshes at once, and getPorts() gives
            // no order guarantee. An older call that finishes last must not put its list back.
            // getDevices() reads this.ports after the await, so it still returns the newest.
            if (generation !== this.#loadGeneration) {
                return;
            }
            this.ports = ports.map((port) => this.createPort(port));
        } catch (error) {
            console.error(`${logHead} Error loading devices:`, error);
        }
    }

    async requestPermissionDevice(showAllSerialDevices = false): Promise<WebSerialDevice | null> {
        let newPermissionPort: WebSerialDevice | null = null;

        try {
            const options = showAllSerialDevices ? {} : { filters: webSerialDevices };
            // Throws inside the try where Web Serial is missing, as `navigator.serial.requestPort()` did.
            const userSelectedPort = await (webSerialApi() as WebSerialApi).requestPort(options);

            newPermissionPort =
                this.ports.find((port) => port.port === userSelectedPort) ?? this.handleNewDevice(userSelectedPort);
            console.info(`${logHead} User selected SERIAL device from permissions:`, newPermissionPort.path);
        } catch (error) {
            console.error(`${logHead} User didn't select any SERIAL device when requesting permission:`, error);
        }
        return newPermissionPort;
    }

    async getDevices(): Promise<WebSerialDevice[]> {
        await this.loadDevices();
        return this.ports;
    }

    async connect(path: string, options: WebSerialOptions = DEFAULT_CONNECT_OPTIONS): Promise<boolean> {
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
            this.isNeedBatchWrite = this.checkIsNeedBatchWrite();
            if (this.isNeedBatchWrite) {
                console.log(`${logHead} Enabling batch write mode for AT32 on macOS`);
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

                console.log(`${logHead} Connection opened with ID: ${this.connectionId}, Baud: ${options.baudRate}`);

                this.dispatchEvent(new CustomEvent("connect", { detail: connectionInfo }));

                // Start reading from the port. readLoop() catches its own failures.
                this.reading = true;
                void this.readLoop();

                return true;
            } else if (connectionInfo && this.openCanceled) {
                this.connectionId = path;

                console.log(`${logHead} Connection opened with ID: ${path}, but request was canceled, disconnecting`);
                // some bluetooth dongles/dongle drivers really doesn't like to be closed instantly, adding a small delay
                setTimeout(() => {
                    this.openRequested = false;
                    this.openCanceled = false;
                    void this.disconnect();
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

    async readLoop(): Promise<void> {
        // connect() sets the reader immediately before it starts this loop.
        const reader = this.reader as ReadableStreamDefaultReader<Uint8Array>;
        try {
            for await (const value of streamAsyncIterable(reader, () => this.reading)) {
                this.dispatchEvent(new CustomEvent("receive", { detail: value }));
            }
        } catch (error) {
            console.error(`${logHead} Error reading:`, error);
            if (this.connected) {
                void this.disconnect();
            }
        }
    }

    // Update disconnect method
    async disconnect(): Promise<boolean> {
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
            this.connectionInfo = null; // Reset connectionInfo
            this.closeRequested = false;

            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            return true;
        } catch (error) {
            console.error(`${logHead} Error disconnecting:`, error);
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

    forceClose(): void {
        // Best-effort teardown for page-unload (pagehide / beforeunload).
        // Instance refs are nulled immediately so the rest of the class sees a
        // disconnected state; the actual async teardown runs in a Promise chain
        // that Chrome typically drains before destroying the JS context.
        if (!this.port && !this.reader && !this.writer) {
            return;
        }

        this.connected = false;
        this.transmitting = false;
        this.reading = false;

        this.removeEventListener("receive", this.handleReceiveBytes);

        const reader = this.reader;
        const writer = this.writer;
        const port = this.port;
        this.reader = null;
        this.writer = null;
        this.port = null;

        if (port) {
            port.removeEventListener("disconnect", this.handleDisconnect);
        }

        // Mirrors the disconnect() sequence but without awaiting at call-site.
        // Every step catches its own failure, so the chain never rejects.
        void (async () => {
            // 1. Cancel reader — resolves the pending read in streamAsyncIterable,
            //    whose finally block will call releaseLock() on the readable side.
            if (reader) {
                try {
                    await reader.cancel();
                } catch (error) {
                    console.debug(`${logHead} forceClose: reader.cancel() failed during unload`, error);
                }
            }

            if (writer) {
                try {
                    writer.releaseLock();
                } catch (error) {
                    console.debug(`${logHead} forceClose: writer.releaseLock() failed during unload`, error);
                }
            }

            // Close port — Chrome allows this after reader.cancel() even if the
            // reader lock is still technically held (streamAsyncIterable cleans up).
            if (port) {
                try {
                    await port.close();
                } catch (error) {
                    console.debug(`${logHead} forceClose: port.close() failed during unload`, error);
                }
            }
        })();

        this.closeRequested = false;
        this.connectionInfo = null;
        this.connectionId = false;
    }

    checkIsNeedBatchWrite(): boolean {
        const isMac = useAppInfoStore().operatingSystem === "MacOS";
        const vendorId = this.connectionInfo?.usbVendorId;
        return isMac && vendorId !== undefined && vendorIdNames[vendorId] === "AT32";
    }

    async batchWrite(data: WebSerialPayload): Promise<void> {
        // send() only calls this with a writer. this.writer is read per chunk, not captured,
        // so a disconnect mid-frame fails the next chunk rather than writing to a released lock.
        // AT32 on macOS requires smaller chunks (63 bytes) to work correctly due to
        // USB buffer size limitations in the macOS implementation
        const batchWriteSize = 63;
        let remainingData = data;
        while (remainingData.byteLength > batchWriteSize) {
            const sliceData = remainingData.slice(0, batchWriteSize);
            remainingData = remainingData.slice(batchWriteSize);
            try {
                // The chunks are one frame, so they must reach the port in order.
                await this.writer!.write(sliceData); // NOSONAR: sequential by design
            } catch (error) {
                console.error(`${logHead} Error writing batch chunk:`, error);
                throw error; // Re-throw to be caught by the send method
            }
        }
        await this.writer!.write(remainingData);
    }

    async send(data: WebSerialPayload, callback?: (result: WebSerialSendResult) => void): Promise<WebSerialSendResult> {
        if (!this.connected || !this.writer) {
            console.error(`${logHead} Failed to send data, serial port not open`);
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
            console.error(`${logHead} Error sending data:`, error);
            if (callback) {
                callback({ bytesSent: 0 });
            }
            return { bytesSent: 0 };
        }
    }
}

// Export the class itself, not an instance
export default WebSerial;
