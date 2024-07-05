import { i18n } from "../localization";
import { gui_log } from "../gui_log";

/*  Certain flags needs to be enabled in the browser to use BT
 *
 *  app.commandLine.appendSwitch('enable-web-bluetooth', "true");
 *  app.commandLine.appendSwitch('disable-hid-blocklist')
 *  app.commandLine.appendSwitch('enable-experimental-web-platform-features');
 *
 */

const bluetoothDevices = [
    { name: "CC2541",       serviceUuid: '0000ffe0-0000-1000-8000-00805f9b34fb', writeCharacteristic: '0000ffe1-0000-1000-8000-00805f9b34fb', readCharacteristic: '0000ffe1-0000-1000-8000-00805f9b34fb' },
    { name: "HC-05",        serviceUuid: '00001101-0000-1000-8000-00805f9b34fb', writeCharacteristic: '00001101-0000-1000-8000-00805f9b34fb', readCharacteristic: '00001101-0000-1000-8000-00805f9b34fb' },
    { name: "HM-10",        serviceUuid: '0000ffe1-0000-1000-8000-00805f9b34fb', writeCharacteristic: '0000ffe1-0000-1000-8000-00805f9b34fb', readCharacteristic: '0000ffe1-0000-1000-8000-00805f9b34fb' },
    { name: "HM-11",        serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', writeCharacteristic: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', readCharacteristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e' },
    { name: "Nordic NRF",   serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', writeCharacteristic: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', readCharacteristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e' },
    { name: "SpeedyBee V1", serviceUuid: '00001000-0000-1000-8000-00805f9b34fb', writeCharacteristic: '00001001-0000-1000-8000-00805f9b34fb', readCharacteristic: '00001002-0000-1000-8000-00805f9b34fb' },
    { name: "SpeedyBee V2", serviceUuid: '0000abf0-0000-1000-8000-00805f9b34fb', writeCharacteristic: '0000abf1-0000-1000-8000-00805f9b34fb', readCharacteristic: '0000abf2-0000-1000-8000-00805f9b34fb' },
];

class BT extends EventTarget {
    constructor() {
        super();

        if (!this.bluetooth && window && window.navigator && window.navigator.bluetooth) {
            this.bluetooth = navigator.bluetooth;
        } else {
            console.error(`${this.logHead} Bluetooth API not available`);
            return;
        }

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

        this.logHead = "[BLUETOOTH]";

        this.portCounter = 0;
        this.devices = [];
        this.device = null;

        this.connect = this.connect.bind(this);

        this.bluetooth.addEventListener("connect", e => this.handleNewDevice(e.target));
        this.bluetooth.addEventListener("disconnect", e => this.handleRemovedDevice(e.target));
        this.bluetooth.addEventListener("gatserverdisconnected", e => this.handleRemovedDevice(e.target));

        this.loadDevices();
    }

    handleNewDevice(device) {

        const added = this.createPort(device);
        this.devices.push(added);
        this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));

        return added;
    }

    handleRemovedDevice(device) {
        const removed = this.devices.find(port => port.port === device);
        this.devices = this.devices.filter(port => port.port !== device);
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
        const devices = await this.bluetooth.getDevices();

        this.portCounter = 1;
        this.devices = devices.map(device => this.createPort(device));
    }

    async requestPermissionDevice() {
        let newPermissionPort = null;

        const uuids = [];
        bluetoothDevices.forEach(device => {
            uuids.push(device.serviceUuid);
        });

        const options = { acceptAllDevices: true, optionalServices: uuids };

        try {
            const userSelectedPort = await this.bluetooth.requestDevice(options);
            newPermissionPort = this.devices.find(port => port.port === userSelectedPort);
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

        this.device = this.devices.find(device => device.path === path).port;

        console.log(`${this.logHead} Opening connection with ID: ${path}, Baud: ${options.baudRate}`);

        this.device.addEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));

        try {
            console.log(`${this.logHead} Connecting to GATT Server`);

            await this.gattConnect();

            gui_log(i18n.getMessage('bluetoothConnected', [this.device.name]));

            await this.getServices();
            await this.getCharacteristics();
            await this.startNotifications();
        } catch (error) {
            gui_log(i18n.getMessage('bluetoothConnectionError', [error]));
        }

        // Bluetooth API doesn't provide a way for getInfo() or similar to get the connection info
        const connectionInfo = this.device.gatt.connected;

        if (connectionInfo && !this.openCanceled) {
            this.connected = true;
            this.connectionId = this.device.port;
            this.bitrate = options.baudRate;
            this.bytesReceived = 0;
            this.bytesSent = 0;
            this.failed = 0;
            this.openRequested = false;

            this.device.addEventListener("disconnect", this.handleDisconnect.bind(this));
            this.addEventListener("receive", this.handleReceiveBytes);

            console.log(
                `${this.logHead} Connection opened with ID: ${this.connectionId}, Baud: ${options.baudRate}`,
            );

            this.dispatchEvent(
                new CustomEvent("connect", { detail: connectionInfo }),
            );
        } else if (connectionInfo && this.openCanceled) {
            this.connectionId = this.device.port;

            console.log(
                `${this.logHead} Connection opened with ID: ${connectionInfo.connectionId}, but request was canceled, disconnecting`,
            );
            // some bluetooth dongles/dongle drivers really doesn't like to be closed instantly, adding a small delay
            setTimeout(() => {
                this.openRequested = false;
                this.openCanceled = false;
                this.disconnect(() => {
                    this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                });
            }, 150);
        } else if (this.openCanceled) {
            console.log(
                `${this.logHead} Connection didn't open and request was canceled`,
            );
            this.openRequested = false;
            this.openCanceled = false;
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
        } else {
            this.openRequested = false;
            console.log(`${this.logHead} Failed to open bluetooth port`);
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
        }
    }

    async gattConnect() {
        this.server = await this.device.gatt?.connect();
    }

    async getServices() {
        console.log(`${this.logHead} Get primary services`);

        this.services = await this.server.getPrimaryServices();

        this.service = this.services.find(service => {
            this.deviceDescription = bluetoothDevices.find(device => device.serviceUuid == service.uuid);
            return this.deviceDescription;
        });

        if (!this.deviceDescription) {
            throw new Error("Unsupported device");
        }

        gui_log(i18n.getMessage('bluetoothConnectionType', [this.deviceDescription.name]));

        console.log(`${this.logHead} Connected to service:`, this.service.uuid);

        return this.service;
    }

    async getCharacteristics() {
        const characteristics = await this.service.getCharacteristics();

        characteristics.forEach(characteristic => {
            // console.log("Characteristic: ", characteristic);
            if (characteristic.uuid == this.deviceDescription.writeCharacteristic) {
                this.writeCharacteristic = characteristic;
            }

            if (characteristic.uuid == this.deviceDescription.readCharacteristic) {
                this.readCharacteristic = characteristic;
            }
            return this.writeCharacteristic && this.readCharacteristic;
        });

        if (!this.writeCharacteristic) {
            throw new Error("Unexpected write characteristic found - should be", this.deviceDescription.writeCharacteristic);
        }

        if (!this.readCharacteristic) {
            throw new Error("Unexpected read characteristic found - should be", this.deviceDescription.readCharacteristic);
        }

        this.readCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotification.bind(this));

        return await this.readCharacteristic.readValue();
    }

    handleNotification(event) {
        const buffer = new Uint8Array(event.target.value.byteLength);

        for (let i = 0; i < event.target.value.byteLength; i++) {
            buffer[i] = event.target.value.getUint8(i);
        }

        this.dispatchEvent(new CustomEvent("receive", { detail: buffer }));
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

        const doCleanup = async () => {
            this.removeEventListener('receive', this.handleReceiveBytes);

            if (this.device) {
                this.device.removeEventListener("disconnect", this.handleDisconnect.bind(this));
                this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect);
                this.readCharacteristic.removeEventListener('characteristicvaluechanged', this.handleNotification.bind(this));

                if (this.device.gatt.connected) {
                    this.device.gatt.disconnect();
                }

                this.writeCharacteristic = false;
                this.readCharacteristic = false;
                this.deviceDescription = false;
                this.device = null;
            }
        };

        try {
            await doCleanup();

            console.log(
                `${this.logHead} Connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`,
            );

            this.connectionId = false;
            this.bitrate = 0;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
        } catch (error) {
            console.error(error);
            console.error(
                `${this.logHead} Failed to close connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`,
            );
            this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));
        } finally {
            if (this.openCanceled) {
                this.openCanceled = false;
            }
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

export default new BT();
