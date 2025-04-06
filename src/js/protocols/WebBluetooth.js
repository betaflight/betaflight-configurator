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

        this.device = this.devices.find((device) => device.path === path).port;

        console.log(`${this.logHead} Opening connection with ID: ${path}, Baud: ${options.baudRate}`);

        // Use bound method references
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

            // Connection is fully established only after all setup completes successfully
            this.connected = true;
            this.connectionId = this.device.port;
            this.bitrate = options.baudRate;
            this.bytesReceived = 0;
            this.bytesSent = 0;
            this.failed = 0;
            this.openRequested = false;

            // Use bound references here too
            this.device.addEventListener("disconnect", this.boundHandleDisconnect);
            this.addEventListener("receive", this.boundHandleReceiveBytes);

            console.log(`${this.logHead} Connection opened with ID: ${this.connectionId}, Baud: ${options.baudRate}`);

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
    }

    async gattConnect() {
        this.server = await this.device.gatt?.connect();
    }

    async getServices() {
        console.log(`${this.logHead} Get primary services`);

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
    }

    async getCharacteristics() {
        try {
            const characteristics = await this.service.getCharacteristics();

            if (!characteristics || characteristics.length === 0) {
                throw new Error("No characteristics found");
            }

            // Reset characteristics
            this.writeCharacteristic = null;
            this.readCharacteristic = null;

            // Collect all matching characteristics first without breaking early
            const writeMatches = [];
            const readMatches = [];

            for (const characteristic of characteristics) {
                if (characteristic.uuid === this.deviceDescription.writeCharacteristic) {
                    writeMatches.push(characteristic);
                }

                if (characteristic.uuid === this.deviceDescription.readCharacteristic) {
                    readMatches.push(characteristic);
                }
            }

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

            // Use the bound method for the event listener
            this.readCharacteristic.addEventListener("characteristicvaluechanged", this.boundHandleNotification);

            return await this.readCharacteristic.readValue();
        } catch (error) {
            console.error(`${this.logHead} Error getting characteristics:`, error);
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

    startNotifications() {
        if (!this.readCharacteristic) {
            throw new Error("No read characteristic");
        }

        if (!this.readCharacteristic.properties.notify) {
            throw new Error("Read characteristic unable to notify.");
        }

        return this.readCharacteristic.startNotifications();
    }

    async disconnect() {
        this.connected = false;
        this.transmitting = false;
        this.bytesReceived = 0;
        this.bytesSent = 0;

        // if we are already closing, don't do it again
        if (this.closeRequested) {
            return;
        }

        this.closeRequested = true; // Set this to prevent reentry

        try {
            this.removeEventListener("receive", this.boundHandleReceiveBytes);

            if (this.device) {
                // Use the properly bound references
                this.device.removeEventListener("disconnect", this.boundHandleDisconnect);
                this.device.removeEventListener("gattserverdisconnected", this.boundHandleDisconnect);

                if (this.readCharacteristic) {
                    try {
                        // Stop notifications first to avoid errors
                        await this.readCharacteristic.stopNotifications();
                        this.readCharacteristic.removeEventListener(
                            "characteristicvaluechanged",
                            this.boundHandleNotification,
                        );
                    } catch (err) {
                        console.warn(`${this.logHead} Error stopping notifications:`, err);
                    }
                }

                // Safely disconnect GATT
                if (this.device.gatt?.connected) {
                    await this.device.gatt.disconnect();
                }

                // Clear references
                this.writeCharacteristic = null;
                this.readCharacteristic = null;
                this.deviceDescription = null;
            }

            console.log(`${this.logHead} Connection closed successfully`);
            this.connectionId = false;
            this.bitrate = 0;
            this.device = null;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
        } catch (error) {
            console.error(`${this.logHead} Error during disconnect:`, error);
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
