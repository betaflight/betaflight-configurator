import { invoke } from "@tauri-apps/api/core";
import { serialDevices, vendorIdNames } from "./devices";
import GUI from "../gui";

const logHead = "[TAURI SERIAL]";

/**
 * Extract a best-effort message string from an error value of unknown shape
 * (string | Error | plugin-returned object). Flattened from a nested ternary
 * so the sequence is easier to follow.
 */
function extractErrorMessage(error) {
    if (typeof error === "string") {
        return error;
    }
    if (error?.message) {
        return error.message;
    }
    if (error?.toString) {
        return error.toString();
    }
    return "";
}

/**
 * Detects Broken pipe/EPIPE errors across platforms.
 */
function isBrokenPipeError(error) {
    return /broken pipe|EPIPE|os error 32|code:\s*32/i.test(extractErrorMessage(error));
}

/**
 * Parse a vendor/product ID from the plugin response (may arrive as number or
 * string depending on OS backend).
 */
function parseId(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    return typeof value === "number" ? value : Number.parseInt(value, 10);
}

/**
 * TauriSerial protocol implementation using tauri-plugin-serialplugin.
 *
 * Used on desktop (Linux/macOS/Windows) when the frontend is wrapped in a
 * Tauri shell. The plugin exposes a stable command interface via `invoke`.
 */
class TauriSerial extends EventTarget {
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
        this.connectionId = null;
        this.reading = false;

        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.handleReceiveBytes = this.handleReceiveBytes.bind(this);

        // macOS AT32 batch-write workaround flag (driver quirk).
        this.isNeedBatchWrite = false;

        // Device hotplug monitoring — poll-based since the plugin doesn't
        // expose a native event stream.
        this.monitoringDevices = false;
        this.deviceMonitorInterval = null;
        this.deviceCheckInFlight = false;

        // Fire-and-forget init; wrapped in a sync helper so the constructor
        // body contains no async operation (Sonar S7059). The promise
        // chain lives inside `_bootstrap`, not here.
        this._bootstrap();
    }

    _bootstrap() {
        this.loadDevices()
            .then(() => this.startDeviceMonitoring())
            .catch((error) => console.error(`${logHead} Bootstrap failed:`, error));
    }

    handleReceiveBytes(info) {
        this.bytesReceived += info.detail.byteLength;
    }

    getConnectedPort() {
        return this.connectionId;
    }

    handleFatalSerialError() {
        // On fatal errors (broken pipe, etc.) just disconnect cleanly.
        // The monitor loop will surface the removal as a removedDevice event.
        if (this.connected) {
            this.disconnect();
        }
    }

    startDeviceMonitoring() {
        if (this.monitoringDevices) {
            return;
        }

        this.monitoringDevices = true;
        // Reentrancy-guarded poll: skip the tick if the previous check hasn't
        // returned yet, so overlapping runs can't race on `this.ports` and
        // emit duplicate/missed hotplug events.
        this.deviceMonitorInterval = setInterval(async () => {
            if (this.deviceCheckInFlight) {
                return;
            }
            this.deviceCheckInFlight = true;
            try {
                await this.checkDeviceChanges();
            } finally {
                this.deviceCheckInFlight = false;
            }
        }, 1000);

        console.log(`${logHead} Device monitoring started`);
    }

    stopDeviceMonitoring() {
        if (this.deviceMonitorInterval) {
            clearInterval(this.deviceMonitorInterval);
            this.deviceMonitorInterval = null;
        }
        this.monitoringDevices = false;
        console.log(`${logHead} Device monitoring stopped`);
    }

    /**
     * Convert the raw portsMap from the plugin into our standardized port
     * objects.
     * @private
     */
    _convertPortsMapToArray(portsMap) {
        return Object.entries(portsMap).map(([path, info]) => {
            const vendorId = parseId(info.vid);
            const productId = parseId(info.pid);

            return {
                path,
                displayName: this.getDisplayName(path, vendorId, productId),
                vendorId,
                productId,
                serialNumber: info.serial_number,
            };
        });
    }

    /**
     * Filter ports to only include known Betaflight-compatible devices.
     * @private
     */
    _filterToKnownDevices(ports) {
        return ports.filter((port) => {
            if (!port.vendorId || !port.productId) {
                return false;
            }
            return serialDevices.some((d) => d.vendorId === port.vendorId && d.productId === port.productId);
        });
    }

    async checkDeviceChanges() {
        try {
            const portsMap = await invoke("plugin:serialplugin|available_ports");
            const allPorts = this._convertPortsMapToArray(portsMap);
            const currentPorts = this._filterToKnownDevices(allPorts);

            const removedPorts = this.ports.filter(
                (oldPort) => !currentPorts.some((newPort) => newPort.path === oldPort.path),
            );
            const addedPorts = currentPorts.filter(
                (newPort) => !this.ports.some((oldPort) => oldPort.path === newPort.path),
            );

            for (const removed of removedPorts) {
                this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
                console.log(`${logHead} Device removed: ${removed.path}`);
            }

            for (const added of addedPorts) {
                this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));
                console.log(`${logHead} Device added: ${added.path}`);
            }

            this.ports = currentPorts;
        } catch (error) {
            console.warn(`${logHead} Error checking device changes:`, error);
        }
    }

    async loadDevices() {
        try {
            const portsMap = await invoke("plugin:serialplugin|available_ports");
            const allPorts = this._convertPortsMapToArray(portsMap);
            this.ports = this._filterToKnownDevices(allPorts);

            console.log(`${logHead} Found ${this.ports.length} serial ports (filtered from ${allPorts.length})`);
            return this.ports;
        } catch (error) {
            console.error(`${logHead} Error loading devices:`, error);
            return [];
        }
    }

    getDisplayName(path, vendorId, productId) {
        if (vendorId && productId) {
            const vendorName = vendorIdNames[vendorId] || `VID:${vendorId} PID:${productId}`;
            return `Betaflight ${vendorName}`;
        }
        return path;
    }

    async connect(path, { baudRate = 115200, dataBits, parityBit, parity, stopBits, flowControl } = {}) {
        if (this.openRequested) {
            console.log(`${logHead} Connection already requested`);
            return false;
        }

        this.openRequested = true;
        this.openCanceled = false;

        try {
            const openOptions = { path, baudRate };
            // Forward optional serial settings when callers supply them (e.g.
            // the flasher uses parity / stopBits for STM32 bootloader comms).
            if (dataBits != null) {
                openOptions.dataBits = dataBits;
            }
            if (parityBit != null || parity != null) {
                openOptions.parity = parityBit ?? parity;
            }
            if (stopBits != null) {
                openOptions.stopBits = stopBits;
            }
            if (flowControl != null) {
                openOptions.flowControl = flowControl;
            }

            console.log(`${logHead} Opening port ${path} at ${baudRate} baud`);

            const openResult = await invoke("plugin:serialplugin|open", openOptions);
            console.log(`${logHead} Open result:`, openResult);

            // If disconnect() fired during the open await, abandon now and
            // close the port we just opened so it doesn't linger.
            if (this.openCanceled) {
                return await this._abortOpen(path);
            }

            try {
                await invoke("plugin:serialplugin|set_timeout", {
                    path,
                    timeout: 100,
                });
            } catch (e) {
                console.debug(`${logHead} Could not set timeout:`, e);
            }

            if (this.openCanceled) {
                return await this._abortOpen(path);
            }

            const activePort = this.ports.find((p) => p.path === path);
            this.connected = true;
            this.connectionId = path;
            this.bitrate = baudRate;
            this.openRequested = false;

            this.connectionInfo = {
                connectionId: path,
                bitrate: this.bitrate,
                vendorId: activePort?.vendorId,
                productId: activePort?.productId,
            };

            this.isNeedBatchWrite = this.checkIsNeedBatchWrite();
            if (this.isNeedBatchWrite) {
                console.log(`${logHead} Enabling batch write mode for AT32 on macOS`);
            }

            this.addEventListener("receive", this.handleReceiveBytes);

            this.reading = true;
            this.readLoop();

            this.dispatchEvent(new CustomEvent("connect", { detail: true }));
            console.log(`${logHead} Connected to ${path}`);
            return true;
        } catch (error) {
            console.error(`${logHead} Error connecting:`, error);
            this.openRequested = false;
            this.openCanceled = false;
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }
    }

    /**
     * Abandon an open that was cancelled mid-flight by a concurrent
     * disconnect(). Closes the port we just opened and clears pending flags.
     * @private
     */
    async _abortOpen(path) {
        console.log(`${logHead} Open cancelled for ${path}, closing`);
        try {
            await invoke("plugin:serialplugin|close", { path });
        } catch (e) {
            console.debug(`${logHead} Close after cancel failed:`, e);
        }
        this.openRequested = false;
        this.openCanceled = false;
        this.dispatchEvent(new CustomEvent("connect", { detail: false }));
        return false;
    }

    checkIsNeedBatchWrite() {
        const isMac = GUI.operating_system === "MacOS";
        const vendorId = this.connectionInfo?.vendorId;
        return isMac && vendorId != null && vendorIdNames[vendorId] === "AT32";
    }

    /**
     * Tauri doesn't surface a browser-style permission prompt — the plugin
     * enumerates ports directly. Behave as a manual refresh for parity with
     * WebSerial.requestPermissionDevice: re-scan and return the first known
     * port (or null if none).
     */
    async requestPermissionDevice() {
        await this.loadDevices();
        const port = this.ports[0] ?? null;
        if (port) {
            console.info(`${logHead} Selected port from refresh:`, port.path);
        }
        return port;
    }

    /**
     * Classify a read error as fatal (rethrow and tear the loop down) or
     * transient (log + continue). Extracted from readLoop to keep its
     * cognitive complexity under the Sonar limit.
     * @private
     */
    _classifyReadError(error) {
        const msg = extractErrorMessage(error).toLowerCase();
        if (msg.includes("no data received")) {
            return "continue";
        }
        if (isBrokenPipeError(error)) {
            console.error(`${logHead} Fatal poll error (broken pipe) on ${this.connectionId}:`, error);
            return "fatal";
        }
        console.warn(`${logHead} Poll error:`, error);
        return "continue";
    }

    async readLoop() {
        try {
            while (this.reading) {
                try {
                    const result = await invoke("plugin:serialplugin|read_binary", {
                        path: this.connectionId,
                        size: 256,
                        timeout: 10,
                    });

                    if (result && result.length > 0) {
                        this.dispatchEvent(new CustomEvent("receive", { detail: new Uint8Array(result) }));
                    }

                    await new Promise((resolve) => setTimeout(resolve, 5));
                } catch (error) {
                    if (this._classifyReadError(error) === "fatal") {
                        throw error;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 5));
                }
            }
        } catch (error) {
            console.error(`${logHead} Error in read loop:`, error);
            this.handleFatalSerialError(error);
        } finally {
            console.log(`${logHead} Polling stopped for ${this.connectionId || "<no-port>"}`);
        }
    }

    async send(data, callback) {
        if (!this.connected) {
            console.error(`${logHead} Cannot send: port not connected`);
            const res = { bytesSent: 0 };
            callback?.(res);
            return res;
        }

        try {
            let dataArray;
            if (data instanceof ArrayBuffer) {
                dataArray = new Uint8Array(data);
            } else if (data instanceof Uint8Array) {
                dataArray = data;
            } else if (Array.isArray(data)) {
                dataArray = new Uint8Array(data);
            } else {
                console.error(`${logHead} Unsupported data type:`, data?.constructor?.name);
                const res = { bytesSent: 0 };
                callback?.(res);
                return res;
            }

            this.transmitting = true;

            const writeChunk = async (chunk) => {
                await invoke("plugin:serialplugin|write_binary", {
                    path: this.connectionId,
                    value: Array.from(chunk),
                });
            };

            if (this.isNeedBatchWrite) {
                const batchSize = 63;
                for (let offset = 0; offset < dataArray.length; offset += batchSize) {
                    const chunk = dataArray.slice(offset, offset + batchSize);
                    await writeChunk(chunk);
                }
            } else {
                await writeChunk(dataArray);
            }

            this.transmitting = false;
            this.bytesSent += dataArray.length;

            const res = { bytesSent: dataArray.length };
            callback?.(res);
            return res;
        } catch (error) {
            console.error(`${logHead} Error sending data:`, error);
            this.transmitting = false;
            if (isBrokenPipeError(error)) {
                this.handleFatalSerialError(error);
            }
            const res = { bytesSent: 0 };
            callback?.(res);
            return res;
        }
    }

    async disconnect() {
        // If an open is in flight (still awaiting the plugin), signal
        // cancellation so the connect() coroutine aborts after its current
        // await and closes the port it just opened — rather than letting it
        // race past us and leave a stale connection behind.
        if (this.openRequested && !this.connected) {
            this.openCanceled = true;
            return true;
        }

        if (!this.connected) {
            return true;
        }

        // Guard against a concurrent disconnect before mutating state, so
        // the second caller doesn't see half-applied teardown.
        if (this.closeRequested) {
            return true;
        }

        this.closeRequested = true;
        this.connected = false;
        this.transmitting = false;
        this.reading = false;

        try {
            this.removeEventListener("receive", this.handleReceiveBytes);

            // Small delay to allow read loop to notice the state change.
            await new Promise((resolve) => setTimeout(resolve, 50));

            if (this.connectionId) {
                try {
                    await invoke("plugin:serialplugin|close", { path: this.connectionId });
                    console.log(`${logHead} Port closed`);
                } catch (error) {
                    console.warn(`${logHead} Error closing port:`, error);
                }
            }

            this.connectionId = null;
            this.bitrate = 0;
            this.connectionInfo = null;
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

    async getDevices() {
        await this.loadDevices();
        return this.ports;
    }
}

export default TauriSerial;
