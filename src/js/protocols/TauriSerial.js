import { SerialPort } from "tauri-plugin-serialplugin-api";
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
        this.handleDisconnect = this.handleDisconnect.bind(this);

        // Detect if running on macOS with AT32 (needs batch writes)
        this.isNeedBatchWrite = false;

        // Device monitoring
        this.monitoringDevices = false;
        this.deviceMonitorInterval = null;

        // this.loadDevices().then(() => this.startDeviceMonitoring());
        this.loadDevices();
    }

    handleReceiveBytes(info) {
        this.bytesReceived += info.detail.byteLength;
    }

    handleDisconnect() {
        // Handle unexpected disconnections (e.g., device unplugged)
        if (this.connected) {
            console.log(`${logHead} Unexpected disconnect detected`);
            this.disconnect();
        }
    }

    getConnectedPort() {
        return this.port;
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
     * Usage: await tauriserial.requestPermissionDevice(path)
     */
    async requestPermissionDevice() {
        try {
            console.log(`${logHead} Requesting USB permission for Android device`);
            return true;
        } catch (error) {
            console.error(`${logHead} Error requesting USB permission:`, error);
            return false;
        }
    }

    /**
     * Filter ports to only include known Betaflight-compatible devices.
     * @private
     */
    _filterToKnownDevices(ports) {
        // Set to true to enable debug logs
        const DEBUG = false;
        if (DEBUG) {
            console.log(`${logHead} Filtering ${ports.length} ports`);
        }
        const filtered = ports.filter((port) => {
            if (!port.vendorId || !port.productId) {
                if (DEBUG) console.log(`${logHead} FILTERED OUT (no VID/PID): ${port.path}`);
                return false;
            }
            const isKnown = serialDevices.some((d) => d.vendorId === port.vendorId && d.productId === port.productId);
            if (!isKnown && DEBUG) {
                console.log(
                    `${logHead} FILTERED OUT (unknown device): ${port.path} VID:${port.vendorId} PID:${port.productId}`,
                );
            }
            return isKnown;
        });
        if (DEBUG) {
            console.log(`${logHead} Returning ${filtered.length} filtered ports`);
        }
        return filtered;
    }

    async checkDeviceChanges() {
        try {
            const portsMap = await SerialPort.available_ports();

            // Convert to our format
            const allPorts = this._convertPortsMapToArray(portsMap);

            // Filter to only known devices
            const currentPorts = this._filterToKnownDevices(allPorts);

            // Check for removed devices
            const removedPorts = this.ports.filter(
                (oldPort) => !currentPorts.some((newPort) => newPort.path === oldPort.path),
            );

            // Emit events for removed devices
            for (const removed of removedPorts) {
                this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
                console.log(`${logHead} Device removed: ${removed.path}`);
            }

            // Check for added devices
            const addedPorts = currentPorts.filter(
                (newPort) => !this.ports.some((oldPort) => oldPort.path === newPort.path),
            );

            // Emit events for added devices
            for (const added of addedPorts) {
                this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));
                console.log(`${logHead} Device added: ${added.path}`);
            }

            // Update our ports list
            console.log(`${logHead} Device check complete. Current ports:`, currentPorts, this.ports);
            this.ports = currentPorts;
        } catch (error) {
            console.warn(`${logHead} Error checking device changes:`, error);
        }
    }

    createPort(port) {
        const displayName = vendorIdNames[port.vendorId]
            ? vendorIdNames[port.vendorId]
            : `VID:${port.vendorId} PID:${port.productId}`;
        return {
            path: port.path,
            displayName: `Betaflight ${displayName}`,
            vendorId: port.vendorId,
            productId: port.productId,
            port: port,
        };
    }

    async loadDevices() {
        try {
            let newPorts = await SerialPort.available_ports();
            console.log(`${logHead} Loaded devices:`, newPorts);

            // ANDROID FIX: Check if result is a string (Android deserialization issue)
            if (typeof newPorts === "string") {
                console.log(`${logHead} Result is a string, attempting to parse...`);
                try {
                    // The Android plugin returns a string like: "{/dev/bus/usb/002/002={type=USB, vid=1155, ...}}"
                    // We need to convert this to proper JSON
                    newPorts = this._parseAndroidPortsResponse(newPorts);
                    console.log(`${logHead} Parsed ports:`, newPorts);
                } catch (parseError) {
                    console.error(`${logHead} Failed to parse string response:`, parseError);
                    return [];
                }
            }

            const allPorts = this._convertPortsMapToArray(newPorts);
            this.ports = allPorts.map((port) => this.createPort(port));
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

        const port = {
            path: path,
            baudRate: options.baudRate || 115200,
        };

        try {
            console.log(`${logHead} Connecting to ${path} with options:`, port);
            this.port = new SerialPort(port);
            const openResult = await this.port.open();
            console.log(`${logHead} Port opened successfully!`, openResult);
        } catch (error) {
            console.error(`${logHead} Error connecting:`, error);
        }

        // Connection successful
        this.connected = true;
        this.connectionId = path;
        this.bitrate = port.baudRate;
        this.openRequested = false;

        this.connectionInfo = {
            connectionId: path,
            bitrate: this.bitrate,
        };

        this.addEventListener("receive", this.handleReceiveBytes);
        // should we add disconnect handler here ?
        this.addEventListener("disconnect", this.handleDisconnect);

        // Start port listening
        // await this.port.listen(data => {
        //     this.dispatchEvent(new CustomEvent("receive", { detail: new Uint8Array.from(data) }));
        // });

        // Start reading
        this.reading = true;
        this.readLoop();

        this.dispatchEvent(new CustomEvent("connect", { detail: true }));
        console.log(`${logHead} Connected to ${path}`);
        return true;
    }
    catch(error) {
        console.error(`${logHead} Error connecting:`, error);

        this.openRequested = false;
        this.dispatchEvent(new CustomEvent("connect", { detail: false }));
        return false;
    }

    async readLoop() {
        try {
            while (this.reading) {
                try {
                    // Non-blocking read with short timeout
                    const result = await SerialPort.read({ timeout: 100 });

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
            this.transmitting = true;

            const dataArray = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
            this.bytesSent += await this.port.writeBinary(dataArray);
            this.transmitting = false;

            const res = { bytesSent: this.bytesSent };
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
        let result = false;

        try {
            this.removeEventListener("receive", this.handleReceiveBytes);

            // Small delay to allow read loop to notice state change
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Close the port
            if (this.port) {
                await this.port.cancelListen();
                await this.port.close();
                console.log(`${logHead} Port closed`);
            }

            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            result = true;
        } catch (error) {
            console.error(`${logHead} Error disconnecting:`, error);
            this.closeRequested = false;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));
            result = false;
        } finally {
            this.connectionId = null;
            this.bitrate = 0;
            this.connectionInfo = null;
            this.closeRequested = false;
            this.openCanceled = false;
        }

        return result;
    }

    async getDevices() {
        await this.loadDevices();
        return this.ports;
    }
}

export default TauriSerial;
