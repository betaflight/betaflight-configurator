import { Channel, invoke } from "@tauri-apps/api/core";
import { serialDevices, vendorIdNames } from "./devices";
import GUI from "../gui";

const logHead = "[TAURI SERIAL]";

/**
 * Options handed to the plugin's `watch` command.
 *
 * `raw` is a correctness requirement, not a tuning knob. Without it the plugin
 * routes every chunk through its AT line router, which decodes the bytes as
 * UTF-8, splits them on newlines, trims each line and can reclassify one as an
 * out-of-band `urc` event. MSP is binary: that path replaces every non-UTF-8
 * byte, eats 0x09/0x0A/0x0D/0x20 payload bytes and silently drops whole frames.
 *
 * `serialDataFlushIntervalMs` of 0 makes the hub flush its batch buffer on every
 * pass of its read loop, so a frame is dispatched as soon as the OS hands it
 * over rather than waiting out a batching window.
 *
 * `size` is only the hub thread's read buffer. Unlike the `read_binary` path it
 * cannot truncate: the watch route appends whole chunks, so a burst larger than
 * this arrives as consecutive events instead of losing its tail.
 */
const WATCH_OPTIONS = {
    size: 4096,
    serialDataFlushIntervalMs: 0,
    raw: true,
};

/**
 * Poll interval for the plugin's port-list monitor, in milliseconds.
 *
 * The monitor runs on a Rust thread rather than over the webview bridge, so this
 * is not a cost paid on the JavaScript thread. It matches the cadence of the
 * hotplug poll it replaces.
 */
const PORT_LIST_POLL_INTERVAL_MS = 1000;

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

        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.handleReceiveBytes = this.handleReceiveBytes.bind(this);

        // macOS AT32 batch-write workaround flag (driver quirk).
        this.isNeedBatchWrite = false;

        // Channel ids for the plugin's two push streams: received bytes for the
        // open port, and port-list changes for hotplug.
        this.dataChannelId = null;
        this.portListChannelId = null;
        this.portListChannel = null;
        this.monitoringDevices = false;
        this.portListSubscription = null;

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

    /**
     * Subscribe to the plugin's port-list monitor.
     *
     * The monitor enumerates on its own Rust thread and pushes only the changes,
     * so unlike the `available_ports` poll this replaces, nothing is spent on the
     * JavaScript thread between events.
     */
    async startDeviceMonitoring() {
        if (this.monitoringDevices) {
            return;
        }

        this.monitoringDevices = true;
        const channel = new Channel();
        this.portListChannel = channel;
        channel.onmessage = (event) => {
            if (this.portListChannel !== channel) {
                return;
            }
            this._handlePortListEvent(event);
        };

        this.portListSubscription = invoke("plugin:serialplugin|watch_ports", {
            options: { pollIntervalMs: PORT_LIST_POLL_INTERVAL_MS },
            channel,
        })
            .then((channelId) => {
                this.portListChannelId = channelId;
                console.log(`${logHead} Device monitoring started`);
            })
            .catch((error) => {
                this.monitoringDevices = false;
                this.portListChannel = null;
                console.error(`${logHead} Could not start device monitoring:`, error);
            });

        await this.portListSubscription;
    }

    async stopDeviceMonitoring() {
        // A subscribe still in flight would otherwise store its channel id after
        // this teardown had read it, leaving the monitor running for the whole
        // connection — the very thing connect() stops it to avoid.
        await this.portListSubscription;

        this.monitoringDevices = false;
        this.portListChannel = null;
        const channelId = this.portListChannelId;
        this.portListChannelId = null;
        if (channelId === null) {
            return;
        }

        try {
            await invoke("plugin:serialplugin|unwatch_ports", { channelId });
            console.log(`${logHead} Device monitoring stopped`);
        } catch (error) {
            console.warn(`${logHead} Error stopping device monitoring:`, error);
        }
    }

    /**
     * Apply one `PortListEvent` from the monitor.
     *
     * Only the current subscription's events are applied: a channel already in
     * flight when `stopDeviceMonitoring` unsubscribed would otherwise report a
     * device removal underneath an open port, which the reconnect cycle acts on.
     *
     * A `snapshot` is a full reconciliation, not just an initial state: the
     * monitor sends one on every subscribe, and this transport unsubscribes for
     * the duration of a connection, so the snapshot that arrives on reconnect is
     * what reports a device that vanished while the port was open.
     * @param {{kind: string, ports?: object, path?: string, info?: object}} event - Event from the monitor.
     * @private
     */
    _handlePortListEvent(event) {
        switch (event?.kind) {
            case "snapshot":
                this._reconcilePorts(this._filterToKnownDevices(this._convertPortsMapToArray(event.ports ?? {})));
                break;
            case "added":
                this._reconcilePorts([
                    ...this.ports.filter((port) => port.path !== event.path),
                    ...this._filterToKnownDevices(this._convertPortsMapToArray({ [event.path]: event.info ?? {} })),
                ]);
                break;
            case "removed":
                this._reconcilePorts(this.ports.filter((port) => port.path !== event.path));
                break;
            default:
                console.warn(`${logHead} Unknown port list event:`, event);
        }
    }

    /**
     * Diff `currentPorts` against the cached list and emit the difference.
     *
     * Kept as a diff rather than trusting each event verbatim so a duplicate
     * `added` or a `removed` for a path already gone stays silent.
     * @param {Array<object>} currentPorts - The known-device ports as they now stand.
     * @private
     */
    _reconcilePorts(currentPorts) {
        const removedPorts = this.ports.filter(
            (oldPort) => !currentPorts.some((newPort) => newPort.path === oldPort.path),
        );
        const addedPorts = currentPorts.filter((newPort) => !this.ports.some((old) => old.path === newPort.path));

        this.ports = currentPorts;

        for (const removed of removedPorts) {
            this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
            console.log(`${logHead} Device removed: ${removed.path}`);
        }

        for (const added of addedPorts) {
            this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));
            console.log(`${logHead} Device added: ${added.path}`);
        }
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

            // Enumeration has no job while a port is open, and on Android it is
            // actively harmful: `available_ports` crosses into Kotlin and queries
            // the USB service on a single-threaded executor with an unbounded
            // wait. Running that underneath a live MSP session is what wedged the
            // bridge and froze the app. Loss of the device is noticed by the read
            // and write paths instead, which is both safe and quicker.
            await this.stopDeviceMonitoring();

            // Nothing reads the port without the watch, so a failure here is a
            // failed connection rather than a degraded one.
            if (!(await this._startWatch(path))) {
                return await this._abortConnect(path);
            }

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

    /**
     * Undo a connection whose port opened but whose byte stream would not start.
     * Mirrors `_abortOpen`, plus the state `connect` had already committed.
     * @param {string} path - The port to close again.
     * @private
     */
    async _abortConnect(path) {
        this.removeEventListener("receive", this.handleReceiveBytes);
        this.connected = false;
        this.connectionId = null;
        this.connectionInfo = null;
        this.bitrate = 0;
        await this._abortOpen(path);
        await this.startDeviceMonitoring();
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
     * Subscribe to the open port's byte stream.
     *
     * The plugin's RX hub thread is the sole reader of the fd either way; this
     * asks it to push what it reads instead of holding it in an idle buffer for
     * the next poll to collect. A failure here is fatal to the connection: the
     * port would be open with nothing reading it.
     * @param {string} path - The open port's path.
     * @private
     */
    async _startWatch(path) {
        const channel = new Channel();
        channel.onmessage = (event) => this._handleSerialEvent(event);

        try {
            this.dataChannelId = await invoke("plugin:serialplugin|watch", {
                path,
                options: WATCH_OPTIONS,
                channel,
            });
            return true;
        } catch (error) {
            console.error(`${logHead} Could not watch ${path}:`, error);
            return false;
        }
    }

    async _stopWatch() {
        const channelId = this.dataChannelId;
        this.dataChannelId = null;
        if (channelId === null) {
            return;
        }

        try {
            await invoke("plugin:serialplugin|unwatch", { channelId });
        } catch (error) {
            // `close` also drops every watch registered for the path, so losing
            // the race with it leaves nothing to report.
            console.debug(`${logHead} Unwatch failed:`, error);
        }
    }

    /**
     * Apply one `SerialEvent` from the open port.
     *
     * Late events are dropped rather than dispatched: a channel already in flight
     * when the port closed would otherwise inject bytes into whatever session
     * comes next.
     * @param {{kind: string, data?: Array<number>, reason?: string, message?: string}} event - Event from the plugin.
     * @private
     */
    _handleSerialEvent(event) {
        if (!this.connected) {
            return;
        }

        switch (event?.kind) {
            case "data":
                this.dispatchEvent(new CustomEvent("receive", { detail: new Uint8Array(event.data) }));
                break;
            case "disconnect":
                console.error(`${logHead} Port ${this.connectionId} disconnected: ${event.reason}`);
                this.handleFatalSerialError(event.reason);
                break;
            case "error":
                console.warn(`${logHead} Read error on ${this.connectionId}: ${event.message}`);
                break;
            default:
                console.warn(`${logHead} Unknown serial event:`, event);
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

        try {
            this.removeEventListener("receive", this.handleReceiveBytes);

            await this._stopWatch();

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

            // Resume hotplug monitoring, which connect() suspended. The snapshot
            // the monitor sends on subscribe is what reports a device that went
            // away while the port was open, and the reconnect cycle waits on the
            // removedDevice event that comes out of it.
            await this.startDeviceMonitoring();

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
