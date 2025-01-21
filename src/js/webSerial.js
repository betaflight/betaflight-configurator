import { webSerialDevices, vendorIdNames } from "./serial_devices";
import { checkBrowserCompatibility } from "./utils/checkBrowserCompatibility";

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

        navigator.serial.addEventListener("connect", (e) => this.handleNewDevice(e.target));
        navigator.serial.addEventListener("disconnect", (e) => this.handleRemovedDevice(e.target));

        this.loadDevices();
    }

    handleNewDevice(device) {
        const added = this.createPort(device);
        this.ports.push(added);
        this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));
        return added;
    }

    handleRemovedDevice(device) {
        const removed = this.ports.find((port) => port.port === device);
        if (removed) {
            this.ports = this.ports.filter((port) => port.port !== device);
            this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
        }
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
        const info = port.getInfo();
        const displayName = vendorIdNames[info.usbVendorId] 
            ? vendorIdNames[info.usbVendorId] 
            : `VID:${info.usbVendorId} PID:${info.usbProductId}`;
        return {
            path: `serial_${this.portCounter++}`,
            displayName: `Betaflight ${displayName}`,
            vendorId: info.usbVendorId,
            productId: info.usbProductId,
            port: port,
        };
    }

    async loadDevices() {
        const ports = await navigator.serial.getPorts();
        this.portCounter = 1;
        this.ports = ports.map(port => this.createPort(port));
    }

    async requestPermissionDevice(showAllSerialDevices = false) {
        let newPermissionPort = null;
        try {
            const options = showAllSerialDevices ? {} : { filters: webSerialDevices };
            const userSelectedPort = await navigator.serial.requestPort(options);
            newPermissionPort = this.ports.find(port => port.port === userSelectedPort) || 
                                this.handleNewDevice(userSelectedPort);
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
        this.port = this.ports.find(device => device.path === path)?.port;

        if (this.port) {
            try {
                await this.port.open(options);
                const connectionInfo = this.port.getInfo();
                this.connectionInfo = connectionInfo;
                this.writer = this.port.writable.getWriter();
                this.reader = this.port.readable.getReader();

                if (connectionInfo && !this.openCanceled) {
                    this.setConnectedState(true, path, options.baudRate);
                    this.setupEventListeners();
                    this.startReading();
                } else if (connectionInfo && this.openCanceled) {
                    this.handleCanceledConnection(connectionInfo);
                } else {
                    this.handleConnectionFailure();
                }
            } catch (error) {
                console.error(`${this.logHead}Failed to open serial port:`, error);
                this.handleConnectionFailure();
            }
        } else {
            console.error(`${this.logHead}No port found for path: ${path}`);
            this.handleConnectionFailure();
        }
    }

    setConnectedState(connected, path, baudRate) {
        this.connected = connected;
        this.connectionId = path;
        this.bitrate = baudRate;
        this.bytesReceived = this.bytesSent = this.failed = 0;
        this.openRequested = false;
        console.log(`${this.logHead}Connection opened with ID: ${path}, Baud: ${baudRate}`);
        this.dispatchEvent(new CustomEvent("connect", { detail: this.connectionInfo }));
    }

    setupEventListeners() {
        this.port.addEventListener("disconnect", this.handleDisconnect.bind(this));
        this.addEventListener("receive", this.handleReceiveBytes);
    }

    startReading() {
        this.reading = true;
        (async () => {
            for await (let value of streamAsyncIterable(this.reader, () => this.reading)) {
                this.dispatchEvent(new CustomEvent("receive", { detail: value }));
            }
        })();
    }

    handleCanceledConnection(connectionInfo) {
        this.connectionId = connectionInfo.connectionId;
        console.log(`${this.logHead}Connection opened but request was canceled, disconnecting`);
        setTimeout(() => {
            this.openRequested = this.openCanceled = false;
            this.disconnect(() => this.dispatchEvent(new CustomEvent("connect", { detail: false })));
        }, 150);
    }

    handleConnectionFailure() {
        this.openRequested = false;
        console.log(`${this.logHead}Failed to open serial port`);
        this.dispatchEvent(new CustomEvent("connect", { detail: false }));
    }

    async disconnect() {
        if (this.closeRequested) return;

        this.connected = this.transmitting = this.reading = false;
        this.bytesReceived = this.bytesSent = 0;

        await this.cleanupResources();

        console.log(`${this.logHead}Connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`);
        
        this.connectionId = false;
        this.bitrate = 0;
        this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
    }

    async cleanupResources() {
        this.removeEventListener("receive", this.handleReceiveBytes);
        if (this.reader) {
            await this.reader.cancel();
            this.reader.releaseLock();
            this.reader = null;
        }
        if (this.writer) {
            await this.writer.close();
            this.writer = null;
        }
        if (this.port) {
            this.port.removeEventListener("disconnect", this.handleDisconnect.bind(this));
            await this.port.close();
            this.port = null;
        }
    }

    async send(data) {
        if (this.writer) {
            await this.writer.write(data);
            this.bytesSent += data.byteLength;
            return { bytesSent: data.byteLength };
        } else {
            console.error(`${this.logHead}Failed to send data, serial port not open`);
        }
    }
}

export default new WebSerial();
