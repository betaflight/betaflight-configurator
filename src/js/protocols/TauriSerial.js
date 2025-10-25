import { invoke } from "@tauri-apps/api/core";
import { serialDevices, vendorIdNames } from "./devices";

const logHead = "[TAURI SERIAL]";

/**
 * Detects Broken pipe/EPIPE errors across platforms.
 */
function isBrokenPipeError(error) {
    const s = typeof error === "string" ? error : error?.message || (error?.toString ? error.toString() : "") || "";
    return /broken pipe|EPIPE|os error 32|code:\s*32/i.test(s);
}

// Note: We avoid async generator + for-await-of to improve compatibility in some runtimes.

/**
 * TauriSerial protocol implementation using tauri-plugin-serialplugin
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

        // Detect if running on macOS with AT32 (needs batch writes)
        this.isNeedBatchWrite = false;

        // Device monitoring
        this.monitoringDevices = false;
        this.deviceMonitorInterval = null;

        this.loadDevices().then(() => this.startDeviceMonitoring());
    }

    handleReceiveBytes(info) {
        this.bytesReceived += info.detail.byteLength;
    }

    getConnectedPort() {
        return this.connectionId;
    }

    handleFatalSerialError(error) {
        // On fatal errors (broken pipe, etc.), just disconnect cleanly
        // Device monitoring will automatically detect the removal and emit removedDevice
        if (this.connected) {
            this.disconnect();
        }
    }

    startDeviceMonitoring() {
        if (this.monitoringDevices) {
            return;
        }

        this.monitoringDevices = true;
        // Check for device changes every 1 second
        this.deviceMonitorInterval = setInterval(async () => {
            await this.checkDeviceChanges();
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
     * Convert the raw portsMap from the plugin into our standardized port objects.
     * @private
     */
    _convertPortsMapToArray(portsMap) {
        return Object.entries(portsMap).map(([path, info]) => {
            let vendorId = undefined;
            let productId = undefined;

            if (info.vid) {
                vendorId = typeof info.vid === "number" ? info.vid : Number.parseInt(info.vid, 10);
            }
            if (info.pid) {
                productId = typeof info.pid === "number" ? info.pid : Number.parseInt(info.pid, 10);
            }

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
            // Only include ports with known vendor IDs (Betaflight-compatible devices)
            if (!port.vendorId || !port.productId) {
                return false;
            }
            // Check if this device is in our known devices list
            return serialDevices.some((d) => d.vendorId === port.vendorId && d.productId === port.productId);
        });
    }

    async checkDeviceChanges() {
        try {
            const portsMap = await invoke("plugin:serialplugin|available_ports");

            // Convert to our format
            const allPorts = this._convertPortsMapToArray(portsMap);

            // Filter to only known devices
            const currentPorts = this._filterToKnownDevices(allPorts);

            // Check for removed devices
            const removedPorts = this.ports.filter(
                (oldPort) => !currentPorts.find((newPort) => newPort.path === oldPort.path),
            );

            // Check for added devices
            const addedPorts = currentPorts.filter(
                (newPort) => !this.ports.find((oldPort) => oldPort.path === newPort.path),
            );

            // Emit events for removed devices
            for (const removed of removedPorts) {
                this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
                console.log(`${logHead} Device removed: ${removed.path}`);
            }

            // Emit events for added devices
            for (const added of addedPorts) {
                this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));
                console.log(`${logHead} Device added: ${added.path}`);
            }

            // Update our ports list
            this.ports = currentPorts;
        } catch (error) {
            console.warn(`${logHead} Error checking device changes:`, error);
        }
    }

    async loadDevices() {
        try {
            const portsMap = await invoke("plugin:serialplugin|available_ports");

            // Convert the object map to array
            const allPorts = this._convertPortsMapToArray(portsMap);

            // Filter to only known devices
            this.ports = this._filterToKnownDevices(allPorts);

            console.log(`${logHead} Found ${this.ports.length} serial ports (filtered from ${allPorts.length})`);
            return this.ports;
        } catch (error) {
            console.error(`${logHead} Error loading devices:`, error);
            return [];
        }
    }

    getDisplayName(path, vendorId, productId) {
        let displayName = path;

        if (vendorId && productId) {
            // Use vendor name if available, otherwise show as hex
            const vendorName = vendorIdNames[vendorId] || `VID:${vendorId} PID:${productId}`;
            displayName = `Betaflight ${vendorName}`;
        }

        return displayName;
    }

    async connect(path, options) {
        if (this.openRequested) {
            console.log(`${logHead} Connection already requested`);
            return false;
        }

        this.openRequested = true;

        try {
            const openOptions = {
                path,
                baudRate: options.baudRate || 115200,
            };

            console.log(`${logHead} Opening port ${path} at ${openOptions.baudRate} baud`);

            // Open the port
            const openResult = await invoke("plugin:serialplugin|open", openOptions);
            console.log(`${logHead} Open result:`, openResult);

            // Set a reasonable timeout for read/write operations (100ms)
            try {
                await invoke("plugin:serialplugin|set_timeout", {
                    path,
                    timeout: 100,
                });
            } catch (e) {
                console.debug(`${logHead} Could not set timeout:`, e);
            }

            // Connection successful
            this.connected = true;
            this.connectionId = path;
            this.bitrate = openOptions.baudRate;
            this.openRequested = false;

            this.connectionInfo = {
                connectionId: path,
                bitrate: this.bitrate,
            };

            this.addEventListener("receive", this.handleReceiveBytes);

            // Start reading
            this.reading = true;
            this.readLoop();

            this.dispatchEvent(new CustomEvent("connect", { detail: true }));
            console.log(`${logHead} Connected to ${path}`);
            return true;
        } catch (error) {
            console.error(`${logHead} Error connecting:`, error);
            this.openRequested = false;
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }
    }

    async readLoop() {
        try {
            while (this.reading) {
                try {
                    // Non-blocking read with short timeout
                    const result = await invoke("plugin:serialplugin|read_binary", {
                        path: this.connectionId,
                        size: 256,
                        timeout: 10,
                    });

                    if (result && result.length > 0) {
                        this.dispatchEvent(new CustomEvent("receive", { detail: new Uint8Array(result) }));
                    }

                    // Small delay between polls to avoid overwhelming the system
                    await new Promise((resolve) => setTimeout(resolve, 5));
                } catch (error) {
                    const msg = error?.message || (error?.toString ? error.toString() : "");
                    // Timeout is expected when no data available
                    if (msg && msg.toLowerCase().includes("no data received")) {
                        await new Promise((resolve) => setTimeout(resolve, 5));
                        continue;
                    }
                    if (isBrokenPipeError(msg)) {
                        console.error(`${logHead} Fatal poll error (broken pipe) on ${this.connectionId}:`, error);
                        throw error;
                    }
                    console.warn(`${logHead} Poll error:`, error);
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
            // Convert data to Uint8Array
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
                // Batch write for macOS AT32 compatibility
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
                // Treat as device removal to trigger reconnect flow
                this.handleFatalSerialError(error);
            }
            const res = { bytesSent: 0 };
            callback?.(res);
            return res;
        }
    }

    async disconnect() {
        if (!this.connected) {
            return true;
        }

        // Mark as disconnected immediately
        this.connected = false;
        this.transmitting = false;
        this.reading = false;

        if (this.closeRequested) {
            return true;
        }

        this.closeRequested = true;

        try {
            this.removeEventListener("receive", this.handleReceiveBytes);

            // Small delay to allow read loop to notice state change
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Close the port
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

    removePort(path) {
        const removed = this.ports.find((p) => p.path === path);
        this.ports = this.ports.filter((p) => p.path !== path);
        if (removed) {
            this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
        }
    }

    // Deprecated: addPort is no longer needed since monitoring handles this
    addPort(path) {
        // Device monitoring will automatically detect and emit addedDevice
        console.log(`${logHead} addPort called for ${path}, monitoring will handle detection`);
    }
}

export default TauriSerial;
