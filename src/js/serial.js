import WebSerial from "./protocols/WebSerial.js";
import WebBluetooth from "./protocols/WebBluetooth.js";
import Websocket from "./protocols/WebSocket.js";
import VirtualSerial from "./protocols/VirtualSerial.js";
import { isAndroid, isTauri, isTauriAndroid, isTauriIOS, isTauriMacOS } from "./utils/checkCompatibility.js";
import CapacitorSerial from "./protocols/CapacitorSerial.js";
import CapacitorBle from "./protocols/CapacitorBle.js";
import CapacitorTcp from "./protocols/CapacitorTcp.js";
import TauriSerial from "./protocols/TauriSerial.js";
import TauriTcp from "./protocols/TauriTcp.js";
import TauriBle from "./protocols/TauriBle.js";
import { unbracketHost } from "./utils/host.js";

// A host name, an IPv4 address, or an IPv6 address in brackets, with an optional port.
// The pattern permits the underscore. mDNS host names can contain an underscore, for example
// elrs_rx.local. An IPv6 address must have brackets, as in a URL, for example [fe80::1]:5761.
const HOST = String.raw`(?:\[[0-9a-f:.]+\]|[a-z0-9._-]+)(?::\d+)?`;
/**
 * Makes a regular expression for "<scheme>://host[:port][/path]".
 * @param {string} scheme - one scheme, or an alternation of schemes, for example "wss?".
 * @returns {RegExp} the case-insensitive pattern for that scheme.
 */
const urlPattern = (scheme) => new RegExp(`^(?:${scheme})://${HOST}(?:/.*)?$`, "i");
const WEBSOCKET_URL = urlPattern("wss?");
const TCP_URL = urlPattern("tcp");
const BARE_HOST = new RegExp(`^${HOST}$`, "i");

/**
 * Base Serial class that manages all protocol implementations
 * and handles event forwarding.
 */
class Serial extends EventTarget {
    constructor() {
        super();
        this._protocol = null;
        this._eventHandlers = {};

        this.logHead = "[SERIAL]";

        // Initialize protocols with metadata for easier lookup

        if (isAndroid()) {
            this._protocols = [
                { name: "serial", instance: new CapacitorSerial() },
                { name: "bluetooth", instance: new CapacitorBle() },
                { name: "tcp", instance: new CapacitorTcp() },
            ];
        } else if (isTauri()) {
            // Tauri shell: raw TCP via the Rust tcp_* commands (so the Betaflight bridge
            // on 5761 works), and WebSocket (ws://, wss://) via the WebSocket API the webview
            // exposes — these are distinct transports, so they get distinct slots. Bluetooth
            // via the web API the webview exposes. Native serial (tauri-plugin-serialplugin)
            // is desktop + Android only — iOS has no USB serial.
            this._protocols = [
                ...(isTauriIOS() ? [] : [{ name: "serial", instance: new TauriSerial() }]),
                // Neither WKWebView (iOS, macOS) nor the Android System WebView exposes Web
                // Bluetooth, so those use the native transport; Linux and Windows keep the
                // webview's own Web Bluetooth.
                {
                    name: "bluetooth",
                    instance: isTauriIOS() || isTauriMacOS() || isTauriAndroid() ? new TauriBle() : new WebBluetooth(),
                },
                { name: "tcp", instance: new TauriTcp() },
                { name: "websocket", instance: new Websocket() },
            ];
        } else {
            this._protocols = [
                { name: "serial", instance: new WebSerial() },
                { name: "bluetooth", instance: new WebBluetooth() },
                { name: "tcp", instance: new Websocket() },
            ];
        }

        // Always add virtual protocol
        this._protocols.push({ name: "virtual", instance: new VirtualSerial() });

        // Forward events from all protocols to the Serial class
        this._setupEventForwarding();
    }

    /**
     * Set up event forwarding from all protocols to the Serial class
     */
    _setupEventForwarding() {
        // Device-enumeration events come from EVERY transport — device_handler builds
        // the combined device list from all of them.
        const deviceEvents = ["addedDevice", "removedDevice"];
        // Connection-lifecycle events must come ONLY from the active transport. A
        // transport we are no longer connected through can still emit a late event
        // (e.g. a BLE link's gattserverdisconnected firing after the user switched
        // to a serial FC); forwarding it would run onClosed/read_serial against the
        // wrong connection and corrupt the live one.
        const lifecycleEvents = new Set(["connect", "disconnect", "receive"]);

        for (const { name, instance } of this._protocols) {
            if (typeof instance?.addEventListener !== "function") {
                continue;
            }

            for (const eventType of [...deviceEvents, ...lifecycleEvents]) {
                instance.addEventListener(eventType, (event) => {
                    // Drop lifecycle events arriving from a non-active transport.
                    if (lifecycleEvents.has(eventType) && instance !== this._protocol) {
                        return;
                    }

                    this.dispatchEvent(
                        new CustomEvent(event.type, {
                            detail: this._tagDetail(event, name),
                            bubbles: event.bubbles,
                            cancelable: event.cancelable,
                        }),
                    );
                });
            }
        }
    }

    /**
     * Tag a forwarded event's detail with its originating protocol.
     * @param {Event} event - the source protocol event
     * @param {string} protocolType - the originating protocol name
     */
    _tagDetail(event, protocolType) {
        // 'receive' carries a raw data chunk; re-wrap as { data, protocolType }.
        if (event.type === "receive") {
            return { data: event.detail, protocolType };
        }
        // A PRIMITIVE detail (notably connect/disconnect dispatching `false` on a
        // failed open) is forwarded as-is — spreading `false` would turn it into a
        // truthy { protocolType }, so onOpen() would treat a failed open as success.
        if (event.detail !== null && typeof event.detail === "object") {
            return { ...event.detail, protocolType };
        }
        return event.detail;
    }

    /**
     * Finds a registered protocol instance by slot name.
     * @param {string|undefined} name - the slot name ("serial", "tcp", "websocket", ...).
     * @returns {EventTarget|undefined} The instance, or undefined when the platform does not
     *   register that slot.
     */
    _instance(name) {
        return this._protocols.find((p) => p.name === name)?.instance;
    }

    /**
     * Selects the appropriate protocol based on port path
     * @param {string|function|null} portPath - Port path or callback function for virtual mode
     * @returns {EventTarget|undefined} The matching protocol instance, or undefined when none applies.
     */
    selectProtocol(portPath) {
        // Determine which protocol to use based on port path
        const isFn = typeof portPath === "function";
        const s = typeof portPath === "string" ? portPath : "";
        // Default to serial for typical serial device identifiers.
        if (isFn || s === "virtual") {
            return this._instance("virtual");
        }
        // WebSocket endpoints (ws://, wss://) use the HTTP upgrade handshake. Thus they need the
        // WebSocket protocol, and not raw TCP. Tauri has two different slots: "websocket" and the
        // Rust "tcp" slot. If a platform registers only one slot, use "tcp". The web shell uses
        // WebSocket for its "tcp" slot.
        if (WEBSOCKET_URL.test(s)) {
            return this._instance("websocket") ?? this._instance("tcp");
        }
        if (s === "manual" || TCP_URL.test(s)) {
            return this._instance("tcp");
        }
        if (s.startsWith("bluetooth")) {
            return this._instance("bluetooth");
        }
        const serialInstance = this._instance("serial");
        // No native serial transport (iOS): a schemeless manual entry that looks like a network
        // host (an IP, a dotted hostname, [IPv6], or host:port — e.g. an ELRS Wi-Fi module at 10.0.0.1)
        // can only be a TCP endpoint, so route it to TCP rather than a serial slot that doesn't
        // exist. A device path (/dev/tty*, COM3) still resolves to no protocol, as before.
        if (!serialInstance && BARE_HOST.test(s) && (s.includes(".") || s.includes(":"))) {
            return this._instance("tcp");
        }
        return serialInstance;
    }

    /**
     * Classifies a manual target as a local-network address (RFC1918 / IPv4 & IPv6 link-local /
     * .local) — the range an ELRS Wi-Fi module sits in, and the range iOS Local Network gates.
     * @param {string} target - a manual connection target (URL or bare host[:port]).
     * @returns {boolean} true when it resolves to a local-network address.
     */
    isLocalNetworkAddress(target) {
        try {
            const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(target) ? target : `tcp://${target}`;
            // Strips IPv6 brackets so fe80::/10 link-local hosts can be matched.
            const host = unbracketHost(new URL(withScheme).hostname.toLowerCase());
            return (
                host.startsWith("10.") ||
                host.startsWith("192.168.") ||
                /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
                host.startsWith("169.254.") ||
                /^fe[89ab][0-9a-f]:/.test(host) ||
                host.endsWith(".local")
            );
        } catch {
            return false;
        }
    }

    /**
     * Connect to the specified port with options
     * @param {string|function} path - Port path or callback for virtual mode
     * @param {object} options - Connection options (baudRate, etc.)
     */
    async connect(path, options, callback) {
        // Select the appropriate protocol based directly on the port path
        let result = false;
        try {
            this._protocol = this.selectProtocol(path);
            result = await this._protocol.connect(path, options);
        } catch (error) {
            console.error(
                `${this.logHead} Error during connection to path '${path}' with protocol '${this._protocol?.constructor?.name || "undefined"}':`,
                error,
            );
        }
        callback?.(result);
        return result;
    }

    /**
     * Disconnect from the current connection
     * @param {function} [callback] - Optional callback for backward compatibility
     * @returns {Promise<boolean>} - Promise resolving to true if disconnection was successful
     */
    async disconnect(callback) {
        let result = false;
        try {
            result = (await this._protocol?.disconnect()) ?? false;
        } catch (error) {
            console.error(`${this.logHead} Error during disconnect:`, error);
        }
        callback?.(result);
        return result;
    }

    /**
     * Send data through the serial connection.
     *
     * The callback is invoked here and only here. Protocols must not be handed
     * it, or every transport that fires it internally would deliver it twice.
     */
    async send(data, callback) {
        let result;
        try {
            // Guard the method too: virtual mode has no send(), and that is a
            // normal path, not an error to log.
            result = (await this._protocol?.send?.(data)) ?? { bytesSent: 0 };
        } catch (error) {
            result = { bytesSent: 0 };
            console.error(`${this.logHead} Error sending data:`, error);
        }
        callback?.(result);
        return result;
    }

    /**
     * Get devices from a specific protocol type or current protocol
     * @param {string} protocolType - Optional protocol type ('serial', 'bluetooth', 'tcp', 'virtual')
     * @returns {Promise<Array>} - List of devices
     */
    async getDevices(protocolType = null) {
        try {
            // Get the appropriate protocol
            const targetProtocol = this._instance(protocolType?.toLowerCase());

            if (!targetProtocol) {
                console.warn(`${this.logHead} No valid protocol for getting devices`);
                return [];
            }

            if (typeof targetProtocol.getDevices !== "function") {
                console.error(`${this.logHead} Selected protocol does not implement getDevices`);
                return [];
            }

            const devices = await targetProtocol.getDevices?.();
            return devices ?? [];
        } catch (error) {
            console.error(`${this.logHead} Error getting devices:`, error);
            return [];
        }
    }

    /**
     * Request permission to access a device
     * @param {boolean} showAllDevices - Whether to show all devices or only those with filters
     * @param {string} protocolType - Optional protocol type ('serial', 'bluetooth', etc.)
     * @returns {Promise<Object>} - Promise resolving to the selected device
     */
    async requestPermissionDevice(showAllDevices = false, protocolType) {
        let result = false;
        try {
            const targetProtocol = this._instance(protocolType?.toLowerCase());
            result = await targetProtocol?.requestPermissionDevice(showAllDevices);
        } catch (error) {
            console.error(`${this.logHead} Error requesting device permission:`, error);
        }
        return result;
    }

    forceClose() {
        try {
            this._protocol?.forceClose?.();
        } catch (error) {
            console.error(`${this.logHead} Error during force close:`, error);
        }
    }

    /**
     * Get the currently connected device
     */
    getConnectedDevice() {
        return this._protocol?.getConnectedDevice() || null;
    }

    /**
     * Get connection status
     */
    get connected() {
        return this._protocol?.connected || false;
    }

    /**
     * Get connectionId
     */
    get connectionId() {
        return this._protocol?.connectionId || null;
    }

    /**
     * Get protocol
     */
    get protocol() {
        return this._protocol ? this._protocol.constructor.name.toLowerCase() : null;
    }
}

// Export a singleton instance
export const serial = new Serial();
