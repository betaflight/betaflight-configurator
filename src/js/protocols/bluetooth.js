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
    { name: "CC2541 based",             serviceUuid: '0000ffe0-0000-1000-8000-00805f9b34fb', writeCharateristic: '0000ffe1-0000-1000-8000-00805f9b34fb', readCharateristic: '0000ffe1-0000-1000-8000-00805f9b34fb', delay: 30 },
    { name: "Nordic Semiconductor NRF", serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', writeCharateristic: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', readCharateristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', delay: 30 },
    { name: "SpeedyBee Type 2",         serviceUuid: '0000abf0-0000-1000-8000-00805f9b34fb', writeCharateristic: '0000abf1-0000-1000-8000-00805f9b34fb', readCharateristic: '0000abf2-0000-1000-8000-00805f9b34fb', delay:  0 },
    { name: "SpeedyBee Type 1",         serviceUuid: '00001000-0000-1000-8000-00805f9b34fb', writeCharateristic: '00001001-0000-1000-8000-00805f9b34fb', readCharateristic: '00001002-0000-1000-8000-00805f9b34fb', delay:  0 },
];

const BT_WRITE_BUFFER_LENGTH = 20;

async function* streamAsyncIterable(reader, keepReadingFlag) {
    try {
        while (keepReadingFlag()) {
            const { done, value } = await reader.read();
            if (done) {
                return;
            }
            yield value;
        }
    } finally {
        reader.releaseLock();
    }
}

class BT extends EventTarget {
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

        this.logHead = "[BLUETOOTH]";

        this.portCounter = 0;
        this.ports = [];
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.reading = false;

        this.connect = this.connect.bind(this);

        navigator.bluetooth.addEventListener("connect", e => this.handleNewDevice(e.target));
        navigator.bluetooth.addEventListener("disconnect", e => this.handleRemovedDevice(e.target));

        this.loadDevices();
    }

    handleNewDevice(device) {

        const added = this.createPort(device);
        this.ports.push(added);
        this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));

        return added;
    }

    handleRemovedDevice(device) {
        const removed = this.ports.find(port => port.port === device);
        this.ports = this.ports.filter(port => port.port !== device);
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
        return this.port;
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
        const ports = await navigator.bluetooth.getDevices();

        this.portCounter = 1;
        this.ports = ports.map(function (port) {
            return this.createPort(port);
        }, this);
    }

    async requestPermissionDevice() {
        let newPermissionPort = null;

        const uuids = [];
        bluetoothDevices.forEach(device => {
            uuids.push(device.serviceUuid);
        });

        const options = { acceptAllDevices: true, optionalServices: uuids };

        try {
            const userSelectedPort = await navigator.bluetooth.requestDevice(options);
            newPermissionPort = this.ports.find(port => port.port === userSelectedPort);
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
        return this.ports;
    }

    async connect(path, options) {
        this.openRequested = true;
        this.closeRequested = false;

        this.port = this.ports.find(device => device.path === path).port;

        console.log(`${this.logHead} Opening connection with ID: ${path}, Baud: ${options.baudRate}`, this.port, options);

        this.port.addEventListener('gattserverdisconnected', this.handleDisconnect);

        try {
            console.log(`${this.logHead} Connecting to GATT Server`);

            await this.connectServer();

            gui_log(i18n.getMessage('bluetoothConnected', [this.port.name]));

            await this.getServices();
            await this.getCharacteristics();
            await this.startNotifications();
        } catch (error) {
            gui_log(i18n.getMessage('bluetoothConnectionError', [error]));
        }

        // Bluetooth API doesn't provide a way for getInfo() or similar to get the connection info
        // const connectionInfo = this.port.getInfo();

        // console.log(`${this.logHead}Connection info:`, connectionInfo);

        const connectionInfo = true;
        // this.writer = this.port.writable.getWriter();
        // this.reader = this.port.readable.getReader();

        if (connectionInfo && !this.openCanceled) {
            this.connected = true;
            this.connectionId = path;
            this.bitrate = options.baudRate;
            this.bytesReceived = 0;
            this.bytesSent = 0;
            this.failed = 0;
            this.openRequested = false;

            this.port.addEventListener("disconnect", this.handleDisconnect.bind(this));
            this.addEventListener("receive", this.handleReceiveBytes);

            console.log(
                `${this.logHead} Connection opened with ID: ${connectionInfo.connectionId}, Baud: ${options.baudRate}`,
            );

            this.dispatchEvent(
                new CustomEvent("connect", { detail: connectionInfo }),
            );
            // Check if we need the helper function or could polyfill
            // the stream async iterable interface:
            // https://web.dev/streams/#asynchronous-iteration


            this.reading = true;
            for await (let value of streamAsyncIterable(this.reader, () => this.reading)) {
                this.dispatchEvent(
                    new CustomEvent("receive", { detail: value }),
                );
            }
        } else if (connectionInfo && this.openCanceled) {
            this.connectionId = connectionInfo.connectionId;

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

    async connectServer() {
        this.server = await this.port.gatt?.connect();
    }

    async getService (service) {
        this.selectedService = await this.server.getPrimaryService(service);
        return this.selectedService;
    }

    async getServices() {
        console.log(`${this.logHead} Get primary services`);

        this.services = await this.server.getPrimaryServices();

        this.service = this.services.find(service => {
            this.deviceDescription = bluetoothDevices.find(device => device.serviceUuid == service.uuid);
            console.log(`${this.logHead} Device description`, this.deviceDescription);
            return this.deviceDescription;
        });

        if (!this.deviceDescription) {
            throw new Error("Unsupported device");
        }

        gui_log(i18n.getMessage('bluetoothConnectionType', [this.deviceDescription.name]));

        console.log(`${this.logHead} Connected to service:`, this.deviceDescription.name);
        console.log(`${this.logHead} Connected to service:`, this.service.uuid);

        return this.service;
    }

    async getCharacteristic (char) {
        this.characteristic = await this.selectedService.getCharacteristic(char);
        return this.characteristic;
    }

    async getCharacteristics(connectedService) {
        const characteristics = await connectedService.getCharacteristics();

        console.info(`${this.logHead} Found characteristics: ${characteristics}`);

        characteristics.forEach(characteristic => {
            console.log("Characteristic: ", characteristic);
            if (characteristic.uuid == this.deviceDescription.writeCharateristic) {
                this.writeCharacteristic = characteristic;
            }

            if (characteristic.uuid == this.deviceDescription.readCharateristic) {
                this.readCharacteristic = characteristic;
            }
            console.log("Characteristic found: ", characteristic.uuid, this.deviceDescription.writeCharateristic, this.deviceDescription.readCharateristic);
            return this.writeCharacteristic && this.readCharacteristic;
        });

        if (!this.writeCharacteristic) {
            throw new Error("Unexpected write charateristic found - should be", this.deviceDescription.writeCharateristic);
        }

        if (!this.readCharacteristic) {
            throw new Error("Unexpected read charateristic found - should be", this.deviceDescription.readCharateristic);
        }

        this.readCharacteristic.addEventListener('characteristicvaluechanged', this.handleOnCharateristicValueChanged.bind(this));

        return await this.readCharacteristic.readValue();
    }

    async handleDisconnect() {
        this.disconnect();
    }

    handleOnCharateristicValueChanged(event) {
        console.info(`${this.logHead} data bytes received: ${event.target.value.byteLength}`);

        const buffer = new Uint8Array(event.target.value.byteLength);

        for (let i = 0; i < event.target.value.byteLength; i++) {
            buffer[i] = event.target.value.getUint8(i);
        }

        console.info(`${this.logHead} data received: ${buffer}`);
    }

    startNotifications() {
        if (!this.readCharacteristic) {
            throw new Error("No read charateristic");
        }

        if (!this.readCharacteristic.properties.notify) {
            throw new Error("Read charateristic unable to notify.");
        }

        return this.readCharacteristic.startNotifications();
    }

    async disconnect() {
        this.connected = false;
        this.transmitting = false;
        this.reading = false;
        this.bytesReceived = 0;
        this.bytesSent = 0;

        // if we are already closing, don't do it again
        if (this.closeRequested) {
            return;
        }

        const doCleanup = async () => {
            this.removeEventListener('receive', this.handleReceiveBytes);
            if (this.reader) {
                this.reader.cancel();
                this.reader.releaseLock();
                this.reader = null;
            }
            if (this.writer) {
                await this.writer.releaseLock();
                this.writer = null;
            }
            if (this.port) {
                this.port.removeEventListener("disconnect", this.handleDisconnect.bind(this));
                // await this.port.close();
                this.port.removeEventListener('gattserverdisconnected', this.handleDisconnect);
                this.readCharacteristic.removeEventListener('characteristicvaluechanged', this.handleOnCharateristicValueChanged.bind(this));

                if (this.port.gatt.connected) {
                    this.port.gatt.disconnect();
                }

                this.writeCharacteristic = false;
                this.readCharacteristic = false;
                this.deviceDescription = false;
                this.port = null;
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
        if (this.writer) {
            await this.writer.write(data);
            this.bytesSent += data.byteLength;
        } else {
            console.error(
                `${this.logHead} Failed to send data, bluetooth port not open`,
            );
        }
        return {
            bytesSent: data.byteLength,
        };
    }

    async getValue () {
        this.currentValue = await this.characteristic.readValue();
        return this.currentValue;
      }

    async writeValue(data) {
        await this.characteristic.writeValue(data);
    }

    async ___send (data) {
        if (!this.writeCharacteristic) {
            return;
        }

        let sent = 0;
        const dataBuffer = new Uint8Array(data);

        for (let i = 0; i < dataBuffer.length; i += BT_WRITE_BUFFER_LENGTH) {
            let length = BT_WRITE_BUFFER_LENGTH;

            if (i + BT_WRITE_BUFFER_LENGTH > dataBuffer.length) {
                length = dataBuffer.length % BT_WRITE_BUFFER_LENGTH;
            }

            const outBuffer = dataBuffer.subarray(i, i + length);
            sent += outBuffer.length;

            console.log(`${this.logHead} Sending data: ${outBuffer}`);

            await this.writeCharacteristic.writeValue(outBuffer);
        }

        return {
            bytesSent: sent,
            resultCode: 0,
        };
    }
}

export default new BT();
