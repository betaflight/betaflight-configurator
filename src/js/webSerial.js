import { webSerialDevices } from "./serial_devices";

async function* streamAsyncIterable(stream) {
    const reader = stream.getReader();
    try {
        while (true) {
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
        this.connected = false;
        this.openRequested = false;
        this.openCanceled = false;
        this.transmitting = false;
        this.connectionInfo = null;

        this.bitrate = 0;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.failed = 0;

        this.logHead = "SERIAL: ";

        this.port = null;
        this.reader = null;
        this.writer = null;

        this.connect = this.connect.bind(this);
    }

    async connect(options) {
        this.openRequested = true;
        this.port = await navigator.serial.requestPort({
            filters: webSerialDevices,
        });

        await this.port.open(options);
        const connectionInfo = this.port.getInfo();
        this.connectionInfo = connectionInfo;
        this.writer = this.port.writable.getWriter();

        if (connectionInfo && !this.openCanceled) {
            this.connected = true;
            this.connectionId = connectionInfo.connectionId;
            this.bitrate = options.baudrate;
            this.bytesReceived = 0;
            this.bytesSent = 0;
            this.failed = 0;
            this.openRequested = false;

            this.addEventListener("receive", (info) => {
                this.bytesReceived += info.detail.byteLength;
            });

            console.log(
                `${this.logHead} Connection opened with ID: ${connectionInfo.connectionId}, Baud: ${options.baudRate}`,
            );

            this.dispatchEvent(
                new CustomEvent("connect", { detail: connectionInfo }),
            );
            // Check if we need the helper function or could polyfill
            // the stream async iterable interface:
            // https://web.dev/streams/#asynchronous-iteration

            for await (let value of streamAsyncIterable(this.port.readable)) {
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

        if (this.port) {
            this.transmitting = false;
            if (this.writer) {
                await this.writer.close();
                this.writer = null;
            }
            try {
                await this.port.close();
                this.port = null;

                console.log(
                    `${this.logHead}Connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`,
                );

                this.connectionId = false;
                this.bitrate = 0;
                this.dispatchEvent(new CustomEvent("disconnect"));
            } catch (error) {
                console.error(error);
                console.error(
                    `${this.logHead}Failed to close connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`,
                );
            }
        } else {
            this.openCanceled = true;
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
            bytesSent: this.bytesSent,
        };
    }
}

export default new WebSerial();
