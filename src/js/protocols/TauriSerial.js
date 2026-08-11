import { invoke } from "@tauri-apps/api/core";
import { serialDevices, vendorIdNames } from "./devices";
import GUI from "../gui";

const logHead = "[TAURI SERIAL]";

/**
 * Bytes to request per `read_binary` poll.
 *
 * This is a correctness bound, not a tuning knob. The plugin's RX hub reads the
 * port into a 1024-byte buffer and hands the whole chunk to the pending read
 * slot, which keeps only what fits in the requested size and DROPS the rest —
 * the remainder is not pushed back onto its idle buffer. Asking for less than a
 * hub chunk therefore silently loses the tail of every burst above that size,
 * which corrupts any MSP response longer than the request (MSP_BOXNAMES fails
 * its CRC first) and then desynchronises the stream.
 *
 * Staying well above the 1024-byte chunk keeps a poll that arrives mid-burst
 * from ever being the shorter side, and staying under the hub's 64 KiB idle cap
 * keeps the "idle already full" fast path reachable while a CLI dump streams.
 */
const READ_CHUNK_SIZE = 16384;

/**
 * Timeout handed to `read_binary`, in milliseconds.
 *
 * Zero, so the call returns whatever the RX hub has already buffered instead of
 * waiting for more. Any non-zero value is a wait held *inside* the plugin, and
 * on Android that wait is not free: wry bridges the webview to Rust through a
 * synchronous JavascriptInterface, so a command blocks the webview's JavaScript
 * thread for its whole duration. Polling with a 10 ms wait sixty times a second
 * parked that thread for most of every second, starving rendering and input.
 *
 * The loop paces itself with its own sleep instead, which yields to the event
 * loop rather than blocking it.
 */
const READ_TIMEOUT_MS = 0;

/**
 * Pause between read polls, in milliseconds.
 *
 * With a non-blocking read the loop sets its own pace, and on Android every poll
 * is a round trip across the synchronous webview bridge, so the pace is a real
 * cost rather than a free spin. 20 ms keeps receive latency far inside the MSP
 * status cadence while asking roughly a third as many round trips per second as
 * the 5 ms spin this replaced.
 */
const READ_POLL_INTERVAL_MS = 20;

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
 * Detects the plugin having dropped the port from its registry, which it does
 * as soon as the device leaves the bus.
 *
 * A flight controller re-enumerates on every reboot — "Save and Reboot", exiting
 * the bootloader — and on Android the port path is the USB device node, so the
 * old path is gone for good rather than reappearing. Treating this as fatal
 * stops the read loop and the MSP queue from hammering a dead path for the
 * second or so it takes the hotplug poll to notice.
 * @param {unknown} error - Rejection value from the plugin (string, Error or object).
 * @returns {boolean} Whether the port no longer exists.
 */
function isPortGoneError(error) {
    return /not found|is not open|disconnected|detached/i.test(extractErrorMessage(error));
}

/**
 * Detects a lost race for the port lock against the plugin's RX hub thread.
 * The plugin returns this before touching the port, so no bytes reached the
 * device and the chunk is safe to resend.
 * @param {unknown} error - Rejection value from the plugin (string, Error or object).
 * @returns {boolean} Whether the write failed on the port lock without transmitting.
 */
function isLockTimeoutError(error) {
    return /lock timeout/i.test(extractErrorMessage(error));
}

/**
 * Parse a vendor/product ID from the plugin response. The shape depends on the
 * backend: the desktop serialport enumerator stringifies the numbers as decimal
 * ("1155"), while the Android USB bridge formats them as hex ("0x0483"). Ports
 * with no USB descriptor report the literal "Unknown".
 * @param {unknown} value - Raw `vid`/`pid` field from `available_ports`.
 * @returns {number|undefined} The numeric ID, or undefined when absent/unparseable.
 */
function parseId(value) {
    if (typeof value === "number") {
        return value;
    }
    // Anything that is not a string cannot be an ID from either backend, and
    // stringifying it would only produce "[object Object]" to fail on below.
    if (typeof value !== "string") {
        return undefined;
    }
    const text = value.trim();
    // Match the whole string, because parseInt stops at the first invalid
    // character: "1155unknown" would otherwise read as 1155 and promote an
    // unrecognised device into the known-device list.
    if (!/^(?:0x[\da-f]+|\d+)$/i.test(text)) {
        return undefined;
    }
    return Number.parseInt(text, /^0x/i.test(text) ? 16 : 10);
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

    getConnectedDevice() {
        return this.connectionId;
    }

    handleFatalSerialError() {
        // On fatal errors (broken pipe, port gone) just disconnect cleanly. The
        // monitor loop resumes once we are disconnected and surfaces the removal
        // as a removedDevice event, which is what the reconnect cycle waits for.
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
            // Enumeration is for finding a device to connect to, so it has no job
            // while one is open — and on Android it is actively harmful there.
            // `available_ports` crosses into Kotlin and queries the USB service on
            // a single-threaded executor with an unbounded wait, over the same
            // synchronous bridge the reads and writes use. Running it once a second
            // underneath a live MSP session is what wedged that bridge and froze
            // the app. Loss of the device is noticed by the read/write path
            // instead, which is both safe and an order of magnitude quicker.
            if (this.connected || this.openRequested) {
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

    /**
     * Whether the transport still enumerates `path`, asked fresh rather than read
     * from the cached list.
     *
     * Opening a path that has gone away is not a harmless failure on Android. The
     * plugin's Kotlin bridge throws `device not found` for a vanished USB node,
     * and its JNI wrapper leaks that exception: `with_env` only clears a pending
     * exception after the call succeeds, so a throw returns early and leaves the
     * exception set on the thread. Every later call over that bridge is then
     * undefined — in practice the webview's JavaScript thread blocks inside
     * `postMessage` and never comes back, which reads as the whole app freezing.
     *
     * This matters most straight after "Save and Reboot": the flight controller
     * re-enumerates under a new device node, so the remembered path is dead while
     * the reconnect cycle is retrying against it.
     *
     * Checked against the raw port map, not the known-device list, so this only
     * ever answers "does this path exist".
     * @param {string} path - Port path about to be opened.
     * @returns {Promise<boolean>} Whether the transport still lists it.
     * @private
     */
    async _portExists(path) {
        try {
            const portsMap = await invoke("plugin:serialplugin|available_ports");
            return Object.hasOwn(portsMap ?? {}, path);
        } catch (error) {
            // An enumeration failure is not evidence the port is gone; let the
            // open proceed and report the real error.
            console.warn(`${logHead} Could not verify port ${path}:`, error);
            return true;
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

        // Never hand the plugin a path it no longer enumerates — see _portExists.
        if (!(await this._portExists(path))) {
            console.log(`${logHead} Port ${path} is no longer present, not opening`);
            this.openRequested = false;
            this.openCanceled = false;
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }

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
                serialNumber: activePort?.serialNumber,
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
        if (isBrokenPipeError(error) || isPortGoneError(error)) {
            console.error(`${logHead} Fatal poll error on ${this.connectionId}:`, error);
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
                        size: READ_CHUNK_SIZE,
                        timeout: READ_TIMEOUT_MS,
                    });

                    if (result && result.length > 0) {
                        const bytes = new Uint8Array(result);
                        this.dispatchEvent(new CustomEvent("receive", { detail: bytes }));
                    }

                    await new Promise((resolve) => setTimeout(resolve, READ_POLL_INTERVAL_MS));
                } catch (error) {
                    if (this._classifyReadError(error) === "fatal") {
                        throw error;
                    }
                    await new Promise((resolve) => setTimeout(resolve, READ_POLL_INTERVAL_MS));
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
                const value = Array.from(chunk);
                const path = this.connectionId;
                const session = this.connectionInfo;
                try {
                    await invoke("plugin:serialplugin|write_binary", { path, value });
                } catch (error) {
                    if (!isLockTimeoutError(error)) {
                        throw error;
                    }
                    // A disconnect (even one followed by a reconnect to the
                    // same path) while the plugin held the write means this
                    // chunk belongs to a dead session; resending would inject
                    // it into the new one. connect() builds a fresh
                    // connectionInfo per session, so identity is the check.
                    if (this.connectionInfo !== session) {
                        throw error;
                    }
                    console.warn(`${logHead} Write lock timeout, resending chunk`);
                    await invoke("plugin:serialplugin|write_binary", { path, value });
                }
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
            if (isBrokenPipeError(error) || isPortGoneError(error)) {
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
