class Websocket extends EventTarget {
    constructor() {
        super();

        this.connected = false;
        this.connectionInfo = null;

        this.bitrate = 0;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.failed = 0;

        this.logHead = "[WEBSOCKET]";

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

    async connect(path) {
        // This protocol fills the web shell's "tcp" slot, but a browser can only open
        // WebSockets — a raw tcp:// URL throws inside the WebSocket constructor. SITL
        // serves its serial bridge over WebSocket on the same port, so normalize the
        // scheme instead: tcp://host:port -> ws://host:port.
        this.address = path.replace(/^tcp:\/\//i, "ws://");
        console.log(`${this.logHead} Connecting to ${this.address}`);

        // A previous socket may still be pending or open (e.g. an attempt the reboot
        // retry loop abandoned). Detach its handlers and close it so its late events
        // cannot fire into the session this new attempt establishes.
        if (this.ws) {
            this.ws.onopen = this.ws.onclose = this.ws.onerror = this.ws.onmessage = null;
            try {
                this.ws.close();
            } catch (e) {
                console.error(`${this.logHead} Failed to close superseded socket: ${e}`);
            }
            this.ws = null;
        }

        // Capture this attempt's socket: every handler below must no-op once this.ws
        // has been replaced by a newer attempt, otherwise a stale onclose would run
        // disconnect() against — and close — the newer socket.
        let ws;
        try {
            ws = new WebSocket(this.address, ["binary", "wsSerial"]);
        } catch (e) {
            // Invalid URL/scheme. Signal a failed open so the connect flow (and the
            // reboot retry loop) recovers immediately instead of waiting for the
            // pre-open watchdog.
            console.error(`${this.logHead} Failed to open ${this.address}:`, e);
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return;
        }
        this.ws = ws;
        let socket = this;

        this.ws.onopen = function (e) {
            if (socket.ws !== ws) {
                return;
            }
            console.log(`${socket.logHead} Connected: `, e);
            socket.connected = true;
            socket.dispatchEvent(
                new CustomEvent("connect", {
                    detail: {
                        socketId: socket.address,
                    },
                }),
            );
        };

        this.ws.onclose = async function (e) {
            if (socket.ws !== ws) {
                return;
            }
            console.log(`${socket.logHead} Connection closed: `, e);

            await socket.disconnect();
            socket.dispatchEvent(new CustomEvent("disconnect", { detail: { socketId: socket.address } }));
        };

        this.ws.onerror = function (e) {
            console.error(`${socket.logHead} Connection error: `, e);
        };

        this.ws.onmessage = async function (msg) {
            if (socket.ws !== ws) {
                return;
            }
            let uint8Chunk = await socket.blob2uint(msg.data);
            socket.dispatchEvent(new CustomEvent("receive", { detail: uint8Chunk }));
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

                if (cb) {
                    cb({
                        error: null,
                        bytesSent: data.byteLength,
                    });
                }
            } catch (e) {
                console.error(`${this.logHead}Failed to send data e: ${e}`);

                if (cb) {
                    cb({
                        error: e,
                        bytesSent: 0,
                    });
                }
            }
        }

        return {
            bytesSent: data.byteLength,
        };
    }
}

export default Websocket;
