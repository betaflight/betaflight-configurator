import CONFIGURATOR from "./data_storage";
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

        // Initialize the available protocols
        this._webSerial = new WebSerial();
        this._bluetooth = new WebBluetooth();
        this._websocket = new Websocket();
        this._virtual = new VirtualSerial();

        // Update protocol map to use consistent naming
        this._protocolMap = {
            serial: this._webSerial, // TODO: should be 'webserial'
            bluetooth: this._bluetooth, // TODO: should be 'webbluetooth'
            websocket: this._websocket,
            virtual: this._virtual,
        };

        // Initialize with default protocol
        this.selectProtocol(false);

        // Forward events from all protocols to the Serial class
        this._setupEventForwarding();
    }

    // Add a getter method to safely access the protocol map
    _getProtocolByType(type) {
        if (!type) {
            return this._protocol;
        }

        const protocol = this._protocolMap[type.toLowerCase()];

        if (!protocol) {
            console.warn(`${this.logHead} Unknown protocol type: ${type}`);
        }

        return protocol || null;
    }

    /**
     * Get the protocol type as a string
     * @param {Object} protocol - Protocol instance
     * @returns {string} - Protocol type name
     */
    _getProtocolType(protocol) {
        if (protocol === this._webSerial) {
            return "webserial";
        }
        if (protocol === this._bluetooth) {
            return "webbluetooth";
        }
        if (protocol === this._websocket) {
            return "websocket";
        }
        if (protocol === this._virtual) {
            return "virtual";
        }
        return "unknown";
    }

    /**
     * Set up event forwarding from all protocols to the Serial class
     */
    _setupEventForwarding() {
        const protocols = [this._webSerial, this._bluetooth, this._websocket, this._virtual];
        const events = ["addedDevice", "removedDevice", "connect", "disconnect", "receive"];

        protocols.forEach((protocol) => {
            if (protocol && typeof protocol.addEventListener === "function") {
                events.forEach((eventType) => {
                    protocol.addEventListener(eventType, (event) => {
                        let newDetail;
                        if (event.type === "receive") {
                            // For 'receive' events, we need to handle the data differently
                            newDetail = {
                                data: event.detail,
                                protocolType: this._getProtocolType(protocol),
                            };
                        } else {
                            // For other events, we can use the detail directly
                            newDetail = {
                                ...event.detail,
                                protocolType: this._getProtocolType(protocol),
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
                });
            }
        });
    }

    /**
     * Selects the appropriate protocol based on port path or CONFIGURATOR settings
     * @param {string|null} portPath - Optional port path to determine protocol
     * @param {boolean} forceDisconnect - Whether to force disconnect from current protocol
     */
    selectProtocol(portPath = null, forceDisconnect = true) {
        // Determine which protocol to use based on port path first, then fall back to CONFIGURATOR
        let newProtocol;

        if (portPath) {
            // Select protocol based on port path
            if (portPath === "virtual") {
                console.log(`${this.logHead} Using virtual protocol (based on port path)`);
                newProtocol = this._virtual;
                // Update CONFIGURATOR flags for consistency
                CONFIGURATOR.virtualMode = true;
                CONFIGURATOR.bluetoothMode = false;
                CONFIGURATOR.manualMode = false;
            } else if (portPath === "manual") {
                console.log(`${this.logHead} Using websocket protocol (based on port path)`);
                newProtocol = this._websocket;
                // Update CONFIGURATOR flags for consistency
                CONFIGURATOR.virtualMode = false;
                CONFIGURATOR.bluetoothMode = false;
                CONFIGURATOR.manualMode = true;
            } else if (portPath.startsWith("bluetooth")) {
                console.log(`${this.logHead} Using bluetooth protocol (based on port path: ${portPath})`);
                newProtocol = this._bluetooth;
                // Update CONFIGURATOR flags for consistency
                CONFIGURATOR.virtualMode = false;
                CONFIGURATOR.bluetoothMode = true;
                CONFIGURATOR.manualMode = false;
            } else {
                console.log(`${this.logHead} Using web serial protocol (based on port path: ${portPath})`);
                newProtocol = this._webSerial;
                // Update CONFIGURATOR flags for consistency
                CONFIGURATOR.virtualMode = false;
                CONFIGURATOR.bluetoothMode = false;
                CONFIGURATOR.manualMode = false;
            }
        } else {
            // Fall back to CONFIGURATOR flags if no port path is provided
            if (CONFIGURATOR.virtualMode) {
                console.log(`${this.logHead} Using virtual protocol (based on CONFIGURATOR flags)`);
                newProtocol = this._virtual;
            } else if (CONFIGURATOR.manualMode) {
                console.log(`${this.logHead} Using websocket protocol (based on CONFIGURATOR flags)`);
                newProtocol = this._websocket;
            } else if (CONFIGURATOR.bluetoothMode) {
                console.log(`${this.logHead} Using bluetooth protocol (based on CONFIGURATOR flags)`);
                newProtocol = this._bluetooth;
            } else {
                console.log(`${this.logHead} Using web serial protocol (based on CONFIGURATOR flags)`);
                newProtocol = this._webSerial;
            }
        }

        // If we're switching to a different protocol
        if (this._protocol !== newProtocol) {
            // Clean up previous protocol if exists
            if (this._protocol && forceDisconnect) {
                // Disconnect if connected
                if (this._protocol.connected) {
                    console.log(`${this.logHead} Disconnecting from current protocol before switching`);
                    this._protocol.disconnect();
                }
            }

            // Set new protocol
            this._protocol = newProtocol;
            console.log(`${this.logHead} Protocol switched successfully to:`, this._protocol);
        } else {
            console.log(`${this.logHead} Same protocol selected, no switch needed`);
        }

        return this._protocol;
    }

    /**
     * Connect to the specified port with options
     * @param {string|function} path - Port path or callback for virtual mode
     * @param {object} options - Connection options (baudRate, etc.)
     */
    async connect(path, options) {
        if (!this._protocol) {
            console.error(`${this.logHead} No protocol selected, cannot connect`);
            return false;
        }

        // If path is a function, it's a callback for virtual mode
        const isCallback = typeof path === "function";

        // In virtual mode, a callback is passed as the first parameter
        if (isCallback && CONFIGURATOR.virtualMode) {
            console.log(`${this.logHead} Connecting in virtual mode`);
            return this._protocol.connect(path);
        }

        // Check if already connected
        if (this._protocol.connected) {
            console.warn(`${this.logHead} Protocol already connected, not connecting again`);

            // If we're already connected to the requested port, return success
            const connectedPort = this._protocol.getConnectedPort?.();
            if (connectedPort && connectedPort.path === path) {
                console.log(`${this.logHead} Already connected to the requested port`);
                return true;
            }

            // If we're connected to a different port, disconnect first
            console.log(`${this.logHead} Connected to a different port, disconnecting first`);
            const success = await this.disconnect();
            if (!success) {
                console.error(`${this.logHead} Failed to disconnect before reconnecting`);
                return false;
            }

            console.log(`${this.logHead} Reconnecting to new port:`, path);
            return this._protocol.connect(path, options);
        }

        console.log(`${this.logHead} Connecting to port:`, path, "with options:", options);
        return this._protocol.connect(path, options);
    }

    /**
     * Disconnect from the current connection
     * @param {function} [callback] - Optional callback for backward compatibility
     * @returns {Promise<boolean>} - Promise resolving to true if disconnection was successful
     */
    async disconnect(callback) {
        // Return immediately if no protocol is selected
        if (!this._protocol) {
            console.warn(`${this.logHead} No protocol selected, nothing to disconnect`);
            if (callback) callback(false);
            return false;
        }

        console.log(`${this.logHead} Disconnecting from current protocol`, this._protocol);

        try {
            // Handle case where we're already disconnected
            if (!this._protocol.connected) {
                console.log(`${this.logHead} Already disconnected, performing cleanup`);
                if (callback) {
                    callback(true);
                }
                return true;
            }

            // Create a promise that will resolve/reject based on the protocol's disconnect result
            const success = await this._protocol.disconnect();

            if (callback) callback(success);
            return success;
        } catch (error) {
            console.error(`${this.logHead} Error during disconnect:`, error);
            if (callback) {
                callback(false);
            }
            return Promise.resolve(false);
        }
    }

    /**
     * Send data through the serial connection
     */
    send(data, callback) {
        if (!this._protocol || !this._protocol.connected) {
            console.warn(`${this.logHead} Cannot send data - not connected`);
            if (callback) callback({ bytesSent: 0 });
            return { bytesSent: 0 };
        }

        return this._protocol.send(data, callback);
    }

    /**
     * Get devices from a specific protocol type or current protocol
     * @param {string} protocolType - Optional protocol type ('serial', 'bluetooth', 'websocket', 'virtual')
     * @returns {Promise<Array>} - List of devices
     */
    async getDevices(protocolType = null) {
        try {
            // Get the appropriate protocol
            const targetProtocol = this._getProtocolByType(protocolType);

            if (!targetProtocol) {
                console.warn(`${this.logHead} No valid protocol for getting devices`);
                return [];
            }

            if (typeof targetProtocol.getDevices !== "function") {
                console.error(`${this.logHead} Selected protocol does not implement getDevices`);
                return [];
            }

            return targetProtocol.getDevices() || [];
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
    async requestPermissionDevice(showAllDevices = false, protocolType = null) {
        try {
            // Get the appropriate protocol
            const targetProtocol = this._getProtocolByType(protocolType);

            if (!targetProtocol) {
                console.warn(`${this.logHead} No valid protocol for permission request`);
                return null;
            }

            if (typeof targetProtocol.requestPermissionDevice !== "function") {
                console.error(`${this.logHead} Selected protocol does not support permission requests`);
                return null;
            }

            return targetProtocol.requestPermissionDevice(showAllDevices);
        } catch (error) {
            console.error(`${this.logHead} Error requesting device permission:`, error);
            return null;
        }
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
        return this._protocol ? this._protocol.connected : false;
    }
}

// Export a singleton instance
export const serial = new Serial();
