class WebsocketSerial extends EventTarget {
    constructor() {
        super();

        this.connected = false;
        this.connectionInfo = null;

        this.bitrate = 0;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.failed = 0;

        this.logHead = "[WEBSOCKET] ";

        this.address = "ws://localhost:5761";

        this.ws = null;

        this.connect = this.connect.bind(this);
    }

    handleReceiveBytes(info) {
        this.bytesReceived += info.detail.byteLength;
    }

    handleDisconnect() {
        this.disconnect();
    }

    createPort(url) {
        this.address = url;
        return {
            path: url,
            displayName: `Betaflight SITL`,
            vendorId: 0,
            productId: 0,
            port: 0,
        };
    }

    getConnectedPort() {
        return {
            path: this.address,
            displayName: `Betaflight SITL`,
            vendorId: 0,
            productId: 0,
            port: 0,
        };
    }

    async getDevices() {
        return [];
    }

    async blob2uint(blob) {
        const buffer = await new Response(blob).arrayBuffer();
        return new Uint8Array(buffer);
    }

    async connect(path, options) {
        this.address = path;
        console.log(`${this.logHead} Connecting to ${this.address}`);

        this.ws = new WebSocket(this.address, "wsSerial");
        let socket = this;

        this.ws.onopen = function(e) {
            console.log(`${socket.logHead} Connected: `, e);
            socket.connected = true;
            socket.dispatchEvent(
                new CustomEvent("connect", { detail: {
                    socketId: socket.address,
                }}),
            );
        };

        this.ws.onclose = function(e) {
            console.log(`${socket.logHead} Connection closed: `, e);

            socket.disconnect(() => {
                socket.dispatchEvent(new CustomEvent("disconnect", this.disconnect.bind(this)));
            });
        };

        this.ws.onerror = function(e) {
            console.error(`${socket.logHead} Connection error: `, e);

            socket.disconnect(() => {
                socket.dispatchEvent(new CustomEvent("disconnect", this.disconnect.bind(this)));
            });
        };

        this.ws.onmessage = async function(msg) {
            let uint8Chunk = await socket.blob2uint(msg.data);
            socket.dispatchEvent(
                new CustomEvent("receive", { detail: uint8Chunk }),
            );
        };
    }

    async disconnect() {
        this.connected = false;
        this.bytesReceived = 0;
        this.bytesSent = 0;

        if (this.ws) {
            try {
                this.ws.close();
            } catch (e) {
                console.error(`${this.logHead}Failed to close socket: ${e}`);
            }
        }
    }

    async send(data, cb) {
        if (this.ws) {
            try {
                this.ws.send(data);
                this.bytesSent += data.byteLength;
            }
            catch(e) {
                console.error(`${this.logHead}Failed to send data e: ${e}`);
            }
        }

        return {
            bytesSent: data.byteLength,
        };
    }
}

export default new WebsocketSerial();
