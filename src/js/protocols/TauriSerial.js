import { invoke } from "@tauri-apps/api/core";
import { serialDevices, vendorIdNames } from "./devices";

const logHead = "[TAURI SERIAL]";

/**
 * Async generator that polls the serial port for incoming data
 * Similar to streamAsyncIterable in WebSerial but uses polling instead of streams
 */
async function* pollSerialData(path, keepReadingFlag) {
    try {
        while (keepReadingFlag()) {
            try {
                // Non-blocking read with short timeout
                const result = await invoke("plugin:serialplugin|read_binary", {
                    path,
                    size: 256,
                    timeout: 10,
                });

                if (result && result.length > 0) {
                    yield new Uint8Array(result);
                }

                // Small delay between polls to avoid overwhelming the system
                await new Promise((resolve) => setTimeout(resolve, 5));
            } catch (error) {
                // Timeout is expected when no data available
                if (!error.toString().includes("no data received")) {
                    console.warn(`${logHead} Poll error:`, error);
                }
                // Continue polling
                await new Promise((resolve) => setTimeout(resolve, 5));
            }
        }
    } finally {
        console.log(`${logHead} Polling stopped for ${path}`);
    }
}

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

        this.loadDevices();
    }

    handleReceiveBytes(info) {
        this.bytesReceived += info.detail.byteLength;
    }

    getConnectedPort() {
        return this.connectionId;
    }

    async loadDevices() {
        try {
            const portsMap = await invoke("plugin:serialplugin|available_ports");

            // Convert the object map to array
            const allPorts = Object.entries(portsMap).map(([path, info]) => {
                // The plugin returns vid/pid as decimal strings like "1155", "22336"
                let vendorId = undefined;
                let productId = undefined;

                if (info.vid) {
                    vendorId = typeof info.vid === "number" ? info.vid : parseInt(info.vid, 10);
                }
                if (info.pid) {
                    productId = typeof info.pid === "number" ? info.pid : parseInt(info.pid, 10);
                }

                return {
                    path,
                    displayName: this.getDisplayName(path, vendorId, productId),
                    vendorId,
                    productId,
                    serialNumber: info.serial_number,
                };
            });

            // Filter to only known devices
            this.ports = allPorts.filter((port) => {
                // Only include ports with known vendor IDs (Betaflight-compatible devices)
                if (!port.vendorId || !port.productId) {
                    return false;
                }
                // Check if this device is in our known devices list
                return serialDevices.some((d) => d.vendorId === port.vendorId && d.productId === port.productId);
            });

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
            for await (let value of pollSerialData(this.connectionId, () => this.reading)) {
                this.dispatchEvent(new CustomEvent("receive", { detail: value }));
            }
        } catch (error) {
            console.error(`${logHead} Error in read loop:`, error);
            if (this.connected) {
                this.disconnect();
            }
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

    addPort(path) {
        // Reload devices to get updated port info
        this.loadDevices().then(() => {
            const added = this.ports.find((p) => p.path === path);
            if (added) {
                this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));
            }
        });
    }
}

export default TauriSerial;
