import { i18n } from "../localization";
import { gui_log } from "../gui_log";
import { bluetoothDevices } from "./devices";

/*  Certain flags needs to be enabled in the browser to use BT
 *
 *  app.commandLine.appendSwitch('enable-web-bluetooth', "true");
 *  app.commandLine.appendSwitch('disable-hid-blocklist')
 *  app.commandLine.appendSwitch('enable-experimental-web-platform-features');
 *
 */

class WebBluetooth extends EventTarget {
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

        this.portCounter = 0;
        this.devices = [];
        this.device = null;

        this.logHead = "[BLUETOOTH]";

        if (!this.bluetooth && window && window.navigator && window.navigator.bluetooth) {
            this.bluetooth = navigator.bluetooth;
        } else {
            console.error(`${this.logHead} Bluetooth API not available`);
            return;
        }

        this.connect = this.connect.bind(this);

        this.bluetooth.addEventListener("connect", (e) => this.handleNewDevice(e.target));
        this.bluetooth.addEventListener("disconnect", (e) => this.handleRemovedDevice(e.target));
        this.bluetooth.addEventListener("gattserverdisconnected", (e) => this.handleRemovedDevice(e.target));

        this.loadDevices();

        // Properly bind all event handlers ONCE
        this.boundHandleDisconnect = this.handleDisconnect.bind(this);
        this.boundHandleNotification = this.handleNotification.bind(this);
        this.boundHandleReceiveBytes = this.handleReceiveBytes.bind(this);

        this.lastDisconnectTime = 0;

        // Add connection state tracking
        this.connectionInProgress = false;
        this.deviceBackupRef = null;
    }

    handleNewDevice(device) {
        const added = this.createPort(device);
        this.devices.push(added);
        this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));

        return added;
    }

    handleRemovedDevice(device) {
        const removed = this.devices.find((port) => port.port === device);
        this.devices = this.devices.filter((port) => port.port !== device);
        this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
    }

    handleReceiveBytes(info) {
        this.bytesReceived += info.detail.byteLength;
    }

    handleDisconnect() {
        this.disconnect();
        this.closeRequested = true;
    }

    getConnectedPort() {
        return this.device;
    }

    createPort(device) {
        return {
            path: `bluetooth_${this.portCounter++}`,
            displayName: device.name,
            vendorId: "unknown",
            productId: device.id,
            port: device,
        };
    }

    async loadDevices() {
        const devices = await this.getDevices();

        this.portCounter = 1;
        this.devices = devices.map((device) => this.createPort(device));
    }

    async requestPermissionDevice() {
        let newPermissionPort = null;

        const uuids = [];
        bluetoothDevices.forEach((device) => {
            uuids.push(device.serviceUuid);
        });

        const options = { acceptAllDevices: true, optionalServices: uuids };

        try {
            const userSelectedPort = await this.bluetooth.requestDevice(options);
            newPermissionPort = this.devices.find((port) => port.port === userSelectedPort);
            if (!newPermissionPort) {
                newPermissionPort = this.handleNewDevice(userSelectedPort);
            }
            console.info(`${this.logHead} User selected Bluetooth device from permissions:`, newPermissionPort.path);
        } catch (error) {
            console.error(`${this.logHead} User didn't select any Bluetooth device when requesting permission:`, error);
        }
        return newPermissionPort;
    }

    async getDevices() {
        return this.devices;
    }

    getAvailability() {
        this.bluetooth.getAvailability().then((available) => {
            console.log(`${this.logHead} Bluetooth available:`, available);
            this.available = available;
            return available;
        });
    }

    async connect(path, options) {
        this.openRequested = true;
        this.closeRequested = false;
        this.connectionInProgress = true; // Mark connection as in progress

        try {
            // Find the device from the path
            const deviceEntry = this.devices.find((device) => device.path === path);
            if (!deviceEntry) {
                console.error(`${this.logHead} Device not found for path: ${path}`);
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }

            // Ensure device entry has a valid port
            if (!deviceEntry.port) {
                console.error(`${this.logHead} Device entry has no port: ${path}`);
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }

            // Store backup reference
            const originalPort = deviceEntry.port;
            this.deviceBackupRef = originalPort;

            // Clean up any existing connection before starting a new one
            if (this.device && this.device !== deviceEntry.port) {
                await this.disconnect(true); // Pass flag to indicate we're reconnecting
                // Add additional delay after disconnecting before connecting to a different device
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }

            this.device = deviceEntry.port;
            console.log(
                `${this.logHead} Opening connection with ID: ${path}, Baud: ${options.baudRate}, Device: ${this.device?.name || "Unknown"}`,
            );

            // Ensure device is valid before proceeding
            if (!this.device) {
                console.error(`${this.logHead} Device is null after assignment`);
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }

            // Use bound method references - ONLY REGISTER ONCE
            this.device.addEventListener("gattserverdisconnected", this.boundHandleDisconnect);

            try {
                console.log(`${this.logHead} Connecting to GATT Server`);

                await this.gattConnect();

                // Check if the GATT connection was successful before proceeding
                if (!this.device.gatt?.connected) {
                    throw new Error("GATT server connection failed");
                }

                gui_log(i18n.getMessage("bluetoothConnected", [this.device.name]));

                await this.getServices();
                await this.getCharacteristics();
                await this.startNotifications();
                console.log(`${this.logHead} Notifications started`);

                // Connection is fully established only after all setup completes successfully
                this.connected = true;
                this.connectionId = path; // Use the path parameter instead of device.port
                this.bitrate = options.baudRate;
                this.bytesReceived = 0;
                this.bytesSent = 0;
                this.failed = 0;
                this.openRequested = false;
                console.log(`${this.logHead} Connection established`);

                // Add disconnect event listener - NOTE: we only need one of these
                this.device.addEventListener("disconnect", this.boundHandleDisconnect);
                console.log(`${this.logHead} Event listeners registered`);
                this.addEventListener("receive", this.boundHandleReceiveBytes);

                console.log(
                    `${this.logHead} Connection opened with ID: ${this.connectionId}, Baud: ${options.baudRate}`,
                );

                this.dispatchEvent(new CustomEvent("connect", { detail: true }));
                return true;
            } catch (error) {
                console.error(`${this.logHead} Connection error:`, error);
                gui_log(i18n.getMessage("bluetoothConnectionError", [error]));

                // Clean up any partial connection state
                this.openRequested = false;
                this.openCanceled = false;

                // Signal connection failure
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }
        } catch (error) {
            console.error(`${this.logHead} Connection error:`, error);
            gui_log(i18n.getMessage("bluetoothConnectionError", [error]));

            // Clean up any partial connection state
            this.openRequested = false;
            this.openCanceled = false;

            // Signal connection failure
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        } finally {
            this.connectionInProgress = false; // Always reset connection in progress flag
        }
    }

    async gattConnect() {
        // Check if device is null and try to restore from backup if we're in a connection process
        if (!this.device && this.deviceBackupRef && this.connectionInProgress) {
            console.warn(`${this.logHead} Device is null when attempting GATT connection, restoring from backup`);
            this.device = this.deviceBackupRef;
        }

        // Safety check to ensure device is available
        if (!this.device) {
            console.error(`${this.logHead} Device is null when attempting GATT connection`);
            throw new Error("Cannot connect to GATT: device is null");
        }

        const timeSinceDisconnect = Date.now() - this.lastDisconnectTime;
        const reconnectDelay = 2000; // Increased to 2 seconds

        // Only delay if we're reconnecting within 5 seconds of disconnecting
        if (this.lastDisconnectTime > 0 && timeSinceDisconnect < 5000) {
            const waitTime = Math.max(0, reconnectDelay - timeSinceDisconnect);
            if (waitTime > 0) {
                console.log(`${this.logHead} Waiting ${waitTime}ms before reconnecting...`);
                await new Promise((resolve) => setTimeout(resolve, waitTime));

                // Check again after waiting to ensure device is still available
                if (!this.device && this.deviceBackupRef) {
                    console.warn(`${this.logHead} Device became null during reconnect delay, restoring from backup`);
                    this.device = this.deviceBackupRef;
                } else if (!this.device) {
                    console.error(`${this.logHead} Device became null during reconnect delay`);
                    throw new Error("Cannot connect to GATT: device became null during delay");
                }
            }
        }

        // Add retry logic with exponential backoff
        let attempts = 0;
        const maxAttempts = 3;
        const baseDelay = 2000; // 2 seconds base delay

        while (attempts < maxAttempts) {
            try {
                console.log(`${this.logHead} Connecting to GATT server... (attempt ${attempts + 1}/${maxAttempts})`);

                // Store a reference to the device before connection attempt
                const deviceRef = this.device;

                // Verify device is still valid before checking connection status
                if (!this.device?.gatt) {
                    if (this.deviceBackupRef) {
                        console.warn(`${this.logHead} Device or GATT became unavailable, restoring from backup`);
                        this.device = this.deviceBackupRef;
                    } else {
                        console.error(
                            `${this.logHead} Device or GATT became unavailable before connection attempt ${attempts + 1}`,
                        );
                        throw new Error("Device became unavailable");
                    }
                }

                // Check if already connected
                if (this.device.gatt?.connected) {
                    console.log(`${this.logHead} Device already connected, using existing connection`);
                    this.server = this.device.gatt;
                    return;
                }

                // Connect with inner retry loop for stabilization issues
                let stabilizationAttempt = 0;
                const maxStabilizationAttempts = 2;
                let connectionSuccess = false;

                while (stabilizationAttempt < maxStabilizationAttempts && !connectionSuccess) {
                    try {
                        // Connect to GATT server
                        this.server = await this.device.gatt?.connect();

                        // Before stabilization delay, mark as in progress again to prevent device nullification
                        this.connectionInProgress = true;

                        // Progressive stabilization delay that increases with each attempt
                        const stabilizationDelay = 1000 + stabilizationAttempt * 500;
                        console.log(`${this.logHead} Waiting ${stabilizationDelay}ms for connection to stabilize...`);

                        // Use a flag to track disconnection during stabilization
                        this.disconnectedDuringStabilization = false;

                        // Add a disconnect listener just for the stabilization period
                        const stabilizationDisconnectHandler = () => {
                            console.warn(`${this.logHead} Device disconnected during stabilization!`);
                            this.disconnectedDuringStabilization = true;
                        };

                        // Add the temporary listener
                        this.device.addEventListener("gattserverdisconnected", stabilizationDisconnectHandler);

                        // Wait for stabilization
                        await new Promise((resolve) => setTimeout(resolve, stabilizationDelay));

                        // Remove the temporary listener
                        this.device.removeEventListener("gattserverdisconnected", stabilizationDisconnectHandler);

                        // Check if disconnection happened during stabilization
                        if (this.disconnectedDuringStabilization) {
                            console.warn(`${this.logHead} Connection was lost during stabilization period`);

                            // Restore device reference if needed
                            if (!this.device && deviceRef) {
                                console.log(`${this.logHead} Restoring device reference after disconnection`);
                                this.device = deviceRef;
                            } else if (!this.device && this.deviceBackupRef) {
                                console.log(`${this.logHead} Restoring device from backup after disconnection`);
                                this.device = this.deviceBackupRef;
                            }

                            if (stabilizationAttempt < maxStabilizationAttempts - 1) {
                                console.warn(`${this.logHead} GATT connection lost during stabilization, retrying...`);
                                stabilizationAttempt++;
                                continue;
                            }
                            throw new Error("GATT connection lost immediately after connecting");
                        }

                        // Verify the connection is still active
                        if (!this.device) {
                            console.warn(`${this.logHead} Device reference lost during stabilization, restoring`);
                            if (deviceRef) {
                                this.device = deviceRef;
                            } else if (this.deviceBackupRef) {
                                this.device = this.deviceBackupRef;
                            } else {
                                throw new Error("Device reference was lost and cannot be restored");
                            }
                        }

                        if (!this.device.gatt?.connected) {
                            if (stabilizationAttempt < maxStabilizationAttempts - 1) {
                                console.warn(`${this.logHead} GATT connection lost during stabilization, retrying...`);
                                stabilizationAttempt++;
                                continue;
                            }
                            throw new Error("GATT connection lost immediately after connecting");
                        }

                        connectionSuccess = true;
                    } catch (stabilizationError) {
                        stabilizationAttempt++;
                        if (stabilizationAttempt >= maxStabilizationAttempts) {
                            throw stabilizationError;
                        }

                        // Restore device if it was nullified
                        if (!this.device) {
                            if (deviceRef) {
                                console.log(`${this.logHead} Restoring device reference after stabilization error`);
                                this.device = deviceRef;
                            } else if (this.deviceBackupRef) {
                                console.log(`${this.logHead} Restoring device from backup after stabilization error`);
                                this.device = this.deviceBackupRef;
                            } else {
                                throw new Error("Device reference was lost and cannot be restored");
                            }
                        }

                        console.warn(
                            `${this.logHead} Connection stabilization failed, retrying (${stabilizationAttempt}/${maxStabilizationAttempts})...`,
                        );
                        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait before next stabilization attempt
                    }
                }

                console.log(`${this.logHead} GATT connection established successfully`);
                return; // Success
            } catch (error) {
                attempts++;
                if (
                    (error.name === "NotSupportedError" ||
                        error.name === "NetworkError" ||
                        error.message.includes("GATT connection lost")) &&
                    attempts < maxAttempts
                ) {
                    const retryDelay = baseDelay * Math.pow(2, attempts - 1); // Exponential backoff
                    console.warn(
                        `${this.logHead} GATT connection failed with ${error.name || error.message}, retrying in ${retryDelay}ms...`,
                    );
                    await new Promise((resolve) => setTimeout(resolve, retryDelay));

                    // Check if device is still available after delay
                    if (!this.device) {
                        console.error(`${this.logHead} Device became null during retry delay`);
                        throw new Error("Cannot connect to GATT: device became null during retry");
                    }
                } else if (attempts >= maxAttempts) {
                    console.error(`${this.logHead} Failed to connect after ${maxAttempts} attempts`);
                    throw error; // Re-throw the last error after max attempts
                } else {
                    throw error; // Re-throw other errors immediately
                }
            }
        }
    }

    async getServices() {
        console.log(`${this.logHead} Get primary services`);

        // Check if device is null and try to restore from backup
        if (!this.device && this.deviceBackupRef) {
            console.warn(`${this.logHead} Device is null in getServices(), restoring from backup`);
            this.device = this.deviceBackupRef;
        }

        // Check if still connected before proceeding
        if (!this.device?.gatt?.connected) {
            console.warn(
                `${this.logHead} GATT server disconnected before getting services, attempting to reconnect...`,
            );
            await this.gattConnect();
        }

        // Add a small delay to stabilize connection before requesting services
        await new Promise((resolve) => setTimeout(resolve, 500));

        try {
            // Ensure device and server references are still valid
            if (!this.device) {
                throw new Error("Device reference lost before getting services");
            }

            if (!this.server || !this.device.gatt?.connected) {
                console.warn(`${this.logHead} Server reference invalid or disconnected, reconnecting...`);
                await this.gattConnect();
            }

            // Final check before proceeding
            if (!this.device || !this.server) {
                throw new Error("Device or server reference lost after reconnection attempt");
            }

            this.services = await this.server.getPrimaryServices();

            this.service = this.services.find((service) => {
                this.deviceDescription = bluetoothDevices.find((device) => device.serviceUuid == service.uuid);
                return this.deviceDescription;
            });

            if (!this.deviceDescription) {
                throw new Error("Unsupported device");
            }

            gui_log(i18n.getMessage("bluetoothConnectionType", [this.deviceDescription.name]));
            console.log(`${this.logHead} Connected to service:`, this.service.uuid);
            return this.service;
        } catch (error) {
            console.error(`${this.logHead} Error getting services:`, error);

            // Try reconnecting if it's a network error, but only once
            if (error.name === "NetworkError" && !this.reconnectAttempted) {
                console.warn(`${this.logHead} Network error during service discovery, attempting to reconnect...`);
                this.reconnectAttempted = true;

                // Restore device reference if it was lost
                if (!this.device && originalDevice) {
                    console.warn(`${this.logHead} Restoring device reference before reconnection`);
                    this.device = originalDevice;
                }

                // Only try reconnecting if we have a device reference
                if (this.device) {
                    await this.gattConnect();
                    // Try again after reconnecting
                    return this.getServices();
                } else {
                    console.error(`${this.logHead} Cannot reconnect - no device reference available`);
                    throw new Error("Device reference lost during reconnection");
                }
            }

            throw error;
        } finally {
            // Reset reconnection flag after attempt (successful or not)
            if (this.reconnectAttempted) {
                this.reconnectAttempted = false;
            }
        }
    }

    async getCharacteristics() {
        try {
            console.log(`${this.logHead} Discovering characteristics for service: ${this.service.uuid}`);

            // Check connection status and reconnect if needed before getting characteristics
            if (!this.device.gatt?.connected) {
                console.warn(
                    `${this.logHead} GATT server disconnected before getting characteristics, attempting to reconnect...`,
                );
                await this.gattConnect();
                // Need to refresh the service reference after reconnect
                await this.getServices();
            }

            // Increase delay before characteristic discovery
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Wrap characteristic discovery in retry logic
            let characteristics;
            let retries = 0;
            const maxRetries = 3;

            while (retries < maxRetries) {
                try {
                    // Verify connection before each attempt
                    if (!this.device.gatt?.connected) {
                        console.warn(
                            `${this.logHead} GATT connection lost during retry ${retries + 1}, reconnecting...`,
                        );
                        await this.gattConnect();
                        await this.getServices(); // Refresh service reference
                    }

                    console.log(`${this.logHead} Getting characteristics (attempt ${retries + 1}/${maxRetries})...`);
                    characteristics = await this.service.getCharacteristics();

                    if (characteristics && characteristics.length > 0) {
                        console.log(`${this.logHead} Successfully retrieved ${characteristics.length} characteristics`);
                        break; // Success
                    }

                    retries++;
                    await new Promise((resolve) => setTimeout(resolve, 1000 * retries)); // Increasing delay
                } catch (e) {
                    console.error(`${this.logHead} Error in getCharacteristics() attempt ${retries + 1}:`, e);
                    retries++;

                    // Specific handling for NetworkError
                    if (e.name === "NetworkError" && retries < maxRetries) {
                        console.warn(`${this.logHead} NetworkError: GATT Server disconnected, reconnecting...`);
                        await new Promise((resolve) => setTimeout(resolve, 1000 * retries)); // Increasing wait
                        await this.gattConnect();
                        await this.getServices(); // Refresh service reference
                    } else if (retries >= maxRetries) {
                        throw e;
                    } else {
                        await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
                    }
                }
            }

            // Rest of your existing implementation...
            if (!characteristics || characteristics.length === 0) {
                throw new Error("No characteristics found");
            }

            // Reset characteristics
            this.writeCharacteristic = null;
            this.readCharacteristic = null;

            // Collect all matching characteristics first without breaking early
            const writeMatches = [];
            const readMatches = [];

            // Log all found characteristics for debugging
            characteristics.forEach((characteristic) => {
                console.log(
                    `${this.logHead} Found characteristic: ${characteristic.uuid}, properties:`,
                    Object.keys(characteristic.properties)
                        .filter((p) => characteristic.properties[p])
                        .join(", "),
                );

                if (characteristic.uuid === this.deviceDescription.writeCharacteristic) {
                    writeMatches.push(characteristic);
                }

                if (characteristic.uuid === this.deviceDescription.readCharacteristic) {
                    readMatches.push(characteristic);
                }
            });

            // Select the first match of each type
            if (writeMatches.length > 0) {
                this.writeCharacteristic = writeMatches[0];
                if (writeMatches.length > 1) {
                    console.warn(`${this.logHead} Multiple write characteristics found, using first match`);
                }
            }

            if (readMatches.length > 0) {
                this.readCharacteristic = readMatches[0];
                if (readMatches.length > 1) {
                    console.warn(`${this.logHead} Multiple read characteristics found, using first match`);
                }
            }

            if (!this.writeCharacteristic) {
                throw new Error(`Write characteristic not found: ${this.deviceDescription.writeCharacteristic}`);
            }

            if (!this.readCharacteristic) {
                throw new Error(`Read characteristic not found: ${this.deviceDescription.readCharacteristic}`);
            }

            // Add delay before setting up event listener to ensure device is ready
            await new Promise((resolve) => setTimeout(resolve, 300));

            // Use the bound method for the event listener
            this.readCharacteristic.addEventListener("characteristicvaluechanged", this.boundHandleNotification);

            // Add delay before reading value to ensure listener is registered
            await new Promise((resolve) => setTimeout(resolve, 300));

            return await this.readCharacteristic.readValue();
        } catch (error) {
            console.error(`${this.logHead} Error getting characteristics:`, error);

            // More specific error handling
            if (error.name === "NotSupportedError") {
                console.error(`${this.logHead} GATT operation not supported by this device or adapter.`);
                gui_log(i18n.getMessage("bluetoothDeviceNotSupported", [this.device.name || "Unknown"]));
            } else if (error.name === "NetworkError") {
                console.error(`${this.logHead} GATT server disconnected during operation.`);
                gui_log(i18n.getMessage("bluetoothConnectionLost"));
            } else if (error.name === "SecurityError") {
                console.error(`${this.logHead} GATT operation not permitted.`);
                gui_log(i18n.getMessage("bluetoothSecurityError"));
            }

            // Always rethrow to allow proper connection failure handling
            throw error;
        }
    }

    handleNotification(event) {
        try {
            if (!event.target.value) {
                console.warn(`${this.logHead} Empty notification received`);
                return;
            }

            const buffer = new Uint8Array(event.target.value.byteLength);

            // Copy data with validation
            for (let i = 0; i < event.target.value.byteLength; i++) {
                buffer[i] = event.target.value.getUint8(i);
            }

            if (buffer.length) {
                this.dispatchEvent(new CustomEvent("receive", { detail: buffer }));
            }
        } catch (error) {
            console.error(`${this.logHead} Error handling notification:`, error);
        }
    }

    async startNotifications() {
        if (!this.readCharacteristic) {
            throw new Error("No read characteristic");
        }

        if (!this.readCharacteristic.properties.notify) {
            throw new Error("Read characteristic unable to notify.");
        }

        // Add retry logic for starting notifications
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                console.log(`${this.logHead} Starting notifications (attempt ${attempts + 1}/${maxAttempts})...`);
                await this.readCharacteristic.startNotifications();
                console.log(`${this.logHead} Notifications started successfully`);
                return;
            } catch (error) {
                attempts++;
                if (error.name === "NotSupportedError" && attempts < maxAttempts) {
                    const retryDelay = 1000 * Math.pow(2, attempts - 1); // Exponential backoff
                    console.warn(`${this.logHead} Failed to start notifications, retrying in ${retryDelay}ms...`);
                    await new Promise((resolve) => setTimeout(resolve, retryDelay));
                } else if (attempts >= maxAttempts) {
                    console.error(`${this.logHead} Failed to start notifications after ${maxAttempts} attempts`);
                    throw error;
                } else {
                    throw error;
                }
            }
        }
    }

    async disconnect(isReconnecting = false) {
        // If we're reconnecting during a connection process, don't fully reset the device
        const preserveDevice = this.connectionInProgress && isReconnecting;

        this.connected = false;
        this.transmitting = false;
        this.bytesReceived = 0;
        this.bytesSent = 0;

        // if we are already closing, don't do it again
        if (this.closeRequested) {
            return;
        }

        this.closeRequested = true; // Set this to prevent reentry

        // Store device reference in case we need to restore it
        const deviceRef = this.device;

        try {
            this.removeEventListener("receive", this.boundHandleReceiveBytes);

            if (this.device) {
                // Always remove event listeners
                this.device.removeEventListener("disconnect", this.boundHandleDisconnect);
                this.device.removeEventListener("gattserverdisconnected", this.boundHandleDisconnect);

                // Double check for both GATT availability and connection status
                const isGattConnected =
                    this.device.gatt && typeof this.device.gatt.connected === "boolean" && this.device.gatt.connected;

                // Handle read characteristic cleanup
                if (this.readCharacteristic) {
                    try {
                        // Only attempt to stop notifications if GATT is still connected
                        if (isGattConnected) {
                            console.log(`${this.logHead} Stopping notifications on connected device`);
                            await this.readCharacteristic.stopNotifications();
                        } else {
                            console.log(`${this.logHead} GATT not connected, skipping stopNotifications`);
                        }

                        // Always remove the event listener
                        this.readCharacteristic.removeEventListener(
                            "characteristicvaluechanged",
                            this.boundHandleNotification,
                        );
                    } catch (err) {
                        console.warn(`${this.logHead} Error during read characteristic cleanup:`, err);
                    }
                }

                // Safely disconnect GATT if still connected
                if (isGattConnected) {
                    try {
                        console.log(`${this.logHead} Disconnecting GATT server`);
                        await this.device.gatt.disconnect();
                    } catch (err) {
                        console.warn(`${this.logHead} Error disconnecting GATT:`, err);
                    }
                }

                // Clear references
                this.writeCharacteristic = null;
                this.readCharacteristic = null;
                this.deviceDescription = null;
            }

            // Track disconnect time
            this.lastDisconnectTime = Date.now();

            console.log(`${this.logHead} Connection closed successfully`);
            this.connectionId = false;
            this.bitrate = 0;

            // Only nullify the device if we're not in reconnection mode
            if (!preserveDevice) {
                this.device = null;
            } else {
                console.log(`${this.logHead} Preserving device reference during reconnection`);
            }

            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
        } catch (error) {
            console.error(`${this.logHead} Error during disconnect:`, error);

            // If there was an error and we were preserving the device, restore it
            if (preserveDevice && !this.device && deviceRef) {
                console.log(`${this.logHead} Restoring device reference after disconnect error`);
                this.device = deviceRef;
            }

            this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));
        } finally {
            this.closeRequested = false;
            this.openCanceled = false;
        }
    }

    async send(data) {
        if (!this.writeCharacteristic) {
            return;
        }

        // There is no writable stream in the bluetooth API
        this.bytesSent += data.byteLength;

        const dataBuffer = new Uint8Array(data);

        await this.writeCharacteristic.writeValue(dataBuffer);

        return {
            bytesSent: data.byteLength,
            resultCode: 0,
        };
    }
}

export default WebBluetooth;
