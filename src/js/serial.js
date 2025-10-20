import WebSerial from "./protocols/WebSerial.js";
import WebBluetooth from "./protocols/WebBluetooth.js";
import Websocket from "./protocols/WebSocket.js";
import VirtualSerial from "./protocols/VirtualSerial.js";

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
        this._protocols = [
            { name: "webserial", instance: new WebSerial() },
            { name: "webbluetooth", instance: new WebBluetooth() },
            { name: "websocket", instance: new Websocket() },
            { name: "virtual", instance: new VirtualSerial() },
        ];

        // Forward events from all protocols to the Serial class
        this._setupEventForwarding();
    }

    /**
     * Set up event forwarding from all protocols to the Serial class
     */
    _setupEventForwarding() {
        const events = ["addedDevice", "removedDevice", "connect", "disconnect", "receive"];

        for (const { name, instance } of this._protocols) {
            if (typeof instance?.addEventListener === "function") {
                for (const eventType of events) {
                    instance.addEventListener(eventType, (event) => {
                        let newDetail;
                        if (event.type === "receive") {
                            // For 'receive' events, we need to handle the data differently
                            newDetail = {
                                data: event.detail,
                                protocolType: name,
                            };
                        } else {
                            // For other events, we can use the detail directly
                            newDetail = {
                                ...event.detail,
                                protocolType: name,
                            };
                        }

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
    }

    /**
     * Selects the appropriate protocol based on port path
     * @param {string|function|null} portPath - Port path or callback function for virtual mode
     */
    selectProtocol(portPath) {
        // Determine which protocol to use based on port path
        const isFn = typeof portPath === "function";
        const s = typeof portPath === "string" ? portPath : "";
        // Default to webserial for typical serial device identifiers.
        if (isFn || s === "virtual") {
            return this._protocols.find((p) => p.name === "virtual")?.instance;
        }
        if (s === "manual" || /^(tcp|ws|wss):\/\/[A-Za-z0-9.-]+(?::\d+)?(\/.*)?$/.test(s)) {
            return this._protocols.find((p) => p.name === "websocket")?.instance;
        }
        if (s.startsWith("bluetooth")) {
            return this._protocols.find((p) => p.name === "webbluetooth")?.instance;
        }
        return this._protocols.find((p) => p.name === "webserial")?.instance;
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
     * @param {string} protocolType - Optional protocol type ('webserial', 'webbluetooth', 'websocket', 'virtual')
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

            return targetProtocol.getDevices?.() || [];
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
