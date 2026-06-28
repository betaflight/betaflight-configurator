import WebSerial from "./protocols/WebSerial.js";
import WebBluetooth from "./protocols/WebBluetooth.js";
import Websocket from "./protocols/WebSocket.js";
import VirtualSerial from "./protocols/VirtualSerial.js";
import { isAndroid, isTauri, isTauriIOS } from "./utils/checkCompatibility.js";
import CapacitorSerial from "./protocols/CapacitorSerial.js";
import CapacitorBle from "./protocols/CapacitorBle.js";
import CapacitorTcp from "./protocols/CapacitorTcp.js";
import TauriSerial from "./protocols/TauriSerial.js";
import TauriTcp from "./protocols/TauriTcp.js";
import { LinkEvent, LINK_EVENTS } from "./protocols/LinkEvent.js";

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
                { name: "bluetooth", instance: new WebBluetooth() },
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
        const legacyEvents = ["addedDevice", "removedDevice", "connect", "disconnect", "receive"];
        // Normalized LinkEvent contract (S6). Forwarded only for transports that
        // opt in via `supportsLinkEvents`; others keep emitting only legacy names
        // and consumers fall back to those until S9 removes the legacy layer.
        const linkEvents = LINK_EVENTS;
        // Events whose detail is a raw data chunk rather than an object — these
        // are re-wrapped as `{ data, protocolType }`.
        const dataEvents = new Set(["receive", LinkEvent.DATA]);

        for (const { name, instance } of this._protocols) {
            if (typeof instance?.addEventListener !== "function") {
                continue;
            }

            const events = instance.supportsLinkEvents ? [...legacyEvents, ...linkEvents] : legacyEvents;

            for (const eventType of events) {
                instance.addEventListener(eventType, (event) => {
                    const newDetail = dataEvents.has(event.type)
                        ? { data: event.detail, protocolType: name }
                        : { ...event.detail, protocolType: name };

                    // Dispatch the event with the new detail
                    this.dispatchEvent(
                        new CustomEvent(event.type, {
                            detail: newDetail,
                            bubbles: event.bubbles,
                            cancelable: event.cancelable,
                        }),
                    );
                });
            }
        }
    }

    /**
     * Selects the appropriate protocol based on port path
     * @param {string|function|null} portPath - Port path or callback function for virtual mode
     */
    selectProtocol(portPath) {
        // Determine which protocol to use based on port path
        const isFn = typeof portPath === "function";
        const s = typeof portPath === "string" ? portPath : "";
        // Default to serial for typical serial device identifiers.
        if (isFn || s === "virtual") {
            return this._protocols.find((p) => p.name === "virtual")?.instance;
        }
        // WebSocket endpoints (ws://, wss://) speak the HTTP-upgrade handshake, so they need the
        // WebSocket protocol — not raw TCP. On Tauri these are separate slots ("websocket" vs the
        // Rust-backed "tcp"); fall back to "tcp" on platforms that register only one (the web shell
        // already uses WebSocket for its "tcp" slot).
        if (/^wss?:\/\/[a-z0-9.-]+(?::\d+)?(\/.*)?$/i.test(s)) {
            return (
                this._protocols.find((p) => p.name === "websocket")?.instance ??
                this._protocols.find((p) => p.name === "tcp")?.instance
            );
        }
        if (s === "manual" || /^tcp:\/\/[a-z0-9.-]+(?::\d+)?(\/.*)?$/i.test(s)) {
            return this._protocols.find((p) => p.name === "tcp")?.instance;
        }
        if (s.startsWith("bluetooth")) {
            return this._protocols.find((p) => p.name === "bluetooth")?.instance;
        }
        return this._protocols.find((p) => p.name === "serial")?.instance;
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
     * Send data through the serial connection
     */
    async send(data, callback) {
        let result;
        try {
            result = (await this._protocol?.send(data, callback)) ?? { bytesSent: 0 };
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
            const targetProtocol = this._protocols.find((p) => p.name === protocolType?.toLowerCase())?.instance;

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
            const targetProtocol = this._protocols.find((p) => p.name === protocolType?.toLowerCase())?.instance;
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
     * S6: capture a frozen reconnect token for the active connection, delegating
     * to the current transport. The token is transport-resolvable later via
     * resolveReconnectTarget() without reading the live port picker.
     * @returns {object|null} the token, or null if no transport/connection
     */
    getReconnectToken() {
        return this._protocol?.getReconnectToken?.() ?? null;
    }

    /**
     * S6: re-resolve a previously-captured token to the current device path on
     * its originating transport, or null if the device is no longer present.
     * Routes by `token.transportType` so the FSM never branches per transport.
     * @param {object} token - a token produced by getReconnectToken()
     * @returns {string|null}
     */
    resolveReconnectTarget(token) {
        if (!token) {
            return null;
        }
        const targetProtocol = this._protocols.find((p) => p.name === token.transportType)?.instance;
        return targetProtocol?.resolveReconnectTarget?.(token) ?? null;
    }

    /**
     * Get the currently connected port
     */
    getConnectedPort() {
        return this._protocol?.getConnectedPort() || null;
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
