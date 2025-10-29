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

    handleFatalSerialError() {
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
            const vendorId = info.vid
                ? typeof info.vid === "number"
                    ? info.vid
                    : Number.parseInt(info.vid, 10)
                : undefined;
            const productId = info.pid
                ? typeof info.pid === "number"
                    ? info.pid
                    : Number.parseInt(info.pid, 10)
                : undefined;

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
     * Request USB permission for a device path (Android only).
     * This triggers the permission dialog by attempting a dummy open.
     * Usage: await tauriserial.requestUsbPermission(path)
     */
    async requestUsbPermission(path) {
        try {
            console.log(`${logHead} Requesting USB permission for ${path} (Android)`);
            // Use a dummy baud rate and catch errors
            await invoke("plugin:serialplugin|open", { path, baudRate: 9600 });
            // If permission is granted, this will succeed (or fail for other reasons)
            console.log(`${logHead} USB permission granted for ${path}`);
            // Immediately close if opened
            await invoke("plugin:serialplugin|close", { path });
            return true;
        } catch (error) {
            const errorStr = error?.toString() || error?.message || "";
            if (errorStr.includes("permission") || errorStr.includes("Permission")) {
                console.warn(`${logHead} USB permission denied for ${path}`);
                return false;
            }
            // Other errors
            console.error(`${logHead} Error requesting USB permission:`, error);
            return false;
        }
    }

    /**
     * Filter ports to only include known Betaflight-compatible devices.
     * @private
     */
    _filterToKnownDevices(ports) {
        // TEMPORARY DEBUG: Disable filtering to see ALL USB devices
        console.log(`${logHead} === DEBUG: Filtering ${ports.length} ports ===`);

        const filtered = ports.filter((port) => {
            // Only include ports with known vendor IDs (Betaflight-compatible devices)
            if (!port.vendorId || !port.productId) {
                console.log(`${logHead}   FILTERED OUT (no VID/PID): ${port.path}`);
                return false;
            }
            // Check if this device is in our known devices list
            const isKnown = serialDevices.some((d) => d.vendorId === port.vendorId && d.productId === port.productId);
            if (!isKnown) {
                console.log(
                    `${logHead}   FILTERED OUT (unknown device): ${port.path} VID:${port.vendorId} PID:${port.productId}`,
                );
            }
            return isKnown;
        });

        // TEMPORARY: Return ALL ports regardless of filter for debugging
        console.log(
            `${logHead} === DEBUG: TEMPORARILY RETURNING ALL PORTS (${ports.length}) INSTEAD OF FILTERED (${filtered.length}) ===`,
        );
        return ports; // Return all ports for now to debug
        // return filtered; // Restore this later
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
                (oldPort) => !currentPorts.some((newPort) => newPort.path === oldPort.path),
            );

            // Check for added devices
            const addedPorts = currentPorts.filter(
                (newPort) => !this.ports.some((oldPort) => oldPort.path === newPort.path),
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
            let portsMap = await invoke("plugin:serialplugin|available_ports");

            // ANDROID FIX: Check if result is a string (Android deserialization issue)
            if (typeof portsMap === "string") {
                console.log(`${logHead} Result is a string, attempting to parse...`);
                try {
                    // The Android plugin returns a string like: "{/dev/bus/usb/002/002={type=USB, vid=1155, ...}}"
                    // We need to convert this to proper JSON
                    portsMap = this._parseAndroidPortsResponse(portsMap);
                    console.log(`${logHead} Parsed portsMap:`, portsMap);
                } catch (parseError) {
                    console.error(`${logHead} Failed to parse string response:`, parseError);
                    return [];
                }
            }

            // Convert the object map to array
            const allPorts = this._convertPortsMapToArray(portsMap);

            // DEBUG: Log all detected ports before filtering
            console.log(`${logHead} === DEBUG: All detected ports BEFORE filtering ===`);
            console.log(`${logHead} Raw portsMap from plugin:`, portsMap);
            console.log(`${logHead} Total ports detected: ${allPorts.length}`);
            allPorts.forEach((port, index) => {
                console.log(
                    `${logHead}   [${index}] path: ${port.path}, VID: ${port.vendorId}, PID: ${port.productId}, displayName: ${port.displayName}`,
                );
            });

            // Filter to only known devices
            this.ports = this._filterToKnownDevices(allPorts);

            console.log(`${logHead} === DEBUG: After filtering ===`);
            console.log(`${logHead} Found ${this.ports.length} serial ports (filtered from ${allPorts.length})`);
            this.ports.forEach((port, index) => {
                console.log(`${logHead}   [${index}] KEPT: ${port.path} (${port.displayName})`);
            });

            return this.ports;
        } catch (error) {
            console.error(`${logHead} Error loading devices:`, error);
            return [];
        }
    }

    /**
     * Parse Android plugin's string response to JSON
     * Input: "{/dev/bus/usb/002/002={type=USB, vid=1155, pid=22336, manufacturer=Betaflight, ...}}"
     * Output: {"/dev/bus/usb/002/002": {type: "USB", vid: "1155", ...}}
     * @private
     */
    _parseAndroidPortsResponse(responseStr) {
        // Remove outer braces
        let inner = responseStr.trim();
        if (inner.startsWith("{") && inner.endsWith("}")) {
            inner = inner.slice(1, -1);
        }

        const ports = {};

        // Split by port entries (look for pattern: path={...})
        // This regex finds: /dev/bus/usb/XXX/XXX={...}
        const portPattern = /(\/dev\/[^=]+)=\{([^}]+)\}/g;
        let match;

        while ((match = portPattern.exec(inner)) !== null) {
            const path = match[1];
            const propsStr = match[2];

            // Parse properties: "type=USB, vid=1155, pid=22336, ..."
            const props = {};
            const propPairs = propsStr.split(",").map((s) => s.trim());

            for (const pair of propPairs) {
                const [key, value] = pair.split("=").map((s) => s.trim());
                if (key && value) {
                    props[key] = value;
                }
            }

            ports[path] = props;
        }

        return ports;
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
            console.log(`${logHead} Note: On Android, this will trigger a USB permission request dialog`);

            // Open the port - On Android, this automatically requests USB permission
            const openResult = await invoke("plugin:serialplugin|open", openOptions);
            console.log(`${logHead} Open result:`, openResult);
            console.log(`${logHead} USB permission granted and port opened successfully!`);

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
            console.error(`${logHead} Error details:`, {
                message: error?.message,
                stack: error?.stack,
                type: typeof error,
                stringValue: error?.toString(),
            });

            // Check if it's a permission error
            const errorStr = error?.toString() || error?.message || "";
            if (errorStr.includes("permission") || errorStr.includes("Permission")) {
                console.error(`${logHead} USB PERMISSION DENIED! User must grant permission in the Android dialog.`);
                console.error(`${logHead} Please check if the permission dialog appeared and was dismissed.`);
            }

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
                    if (msg?.toLowerCase().includes("no data received")) {
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
}

export default TauriSerial;
