import { webSerialDevices, vendorIdNames } from "./serial_devices";
import { checkBrowserCompatibility } from "./utils/checkBrowserCompatibilty";

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

class WebSerial extends EventTarget {
    constructor() {
        super();

        checkBrowserCompatibility();

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

        this.logHead = "[SERIAL] ";

        this.portCounter = 0;
        this.ports = [];
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.reading = false;

        this.connect = this.connect.bind(this);

        navigator.serial.addEventListener("connect", e => this.handleNewDevice(e.target));
        navigator.serial.addEventListener("disconnect", e => this.handleRemovedDevice(e.target));

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

    createPort(port) {
        const displayName = vendorIdNames[port.getInfo().usbVendorId] ? vendorIdNames[port.getInfo().usbVendorId] : `VID:${port.getInfo().usbVendorId} PID:${port.getInfo().usbProductId}`;
        return {
            path: `serial_${this.portCounter++}`,
            displayName: `Betaflight ${displayName}`,
            vendorId: port.getInfo().usbVendorId,
            productId: port.getInfo().usbProductId,
            port: port,
        };
    }

    async loadDevices() {
        const ports = await navigator.serial.getPorts();

        this.portCounter = 1;
        this.ports = ports.map(function (port) {
            return this.createPort(port);
        }, this);
    }

    async requestPermissionDevice(showAllSerialDevices = false) {
        let newPermissionPort = null;

        try {
            const options = showAllSerialDevices ? {} : { filters: webSerialDevices };
            const userSelectedPort = await navigator.serial.requestPort(options);

            newPermissionPort = this.ports.find(port => port.port === userSelectedPort);

            if (!newPermissionPort) {
                newPermissionPort = this.handleNewDevice(userSelectedPort);
            }
            console.info(`${this.logHead}User selected SERIAL device from permissions:`, newPermissionPort.path);
        } catch (error) {
            console.error(`${this.logHead}User didn't select any SERIAL device when requesting permission:`, error);
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

        await this.port.open(options);

        const connectionInfo = this.port.getInfo();
        this.connectionInfo = connectionInfo;
        this.writer = this.port.writable.getWriter();
        this.reader = this.port.readable.getReader();

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
            console.log(`${this.logHead} Failed to open serial port`);
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
        }
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
                await this.port.close();
                this.port = null;
            }
        };

        try {
            await doCleanup();

            console.log(
                `${this.logHead}Connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`,
            );

            this.connectionId = false;
            this.bitrate = 0;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
        } catch (error) {
            console.error(error);
            console.error(
                `${this.logHead}Failed to close connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`,
            );
            this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));
        } finally {
            if (this.openCanceled) {
                this.openCanceled = false;
            }
        }
    }

    async send(data) {
        // TODO: previous serial implementation had a buffer of 100, do we still need it with streams?
        if (this.writer) {
            await this.writer.write(data);
            this.bytesSent += data.byteLength;
        } else {
            console.error(
                `${this.logHead}Failed to send data, serial port not open`,
            );
        }
        return {
            bytesSent: data.byteLength,
        };
    }
}

export default new WebSerial();
