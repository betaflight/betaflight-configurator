import { LinkEvent } from "./LinkEvent.js";

class Websocket extends EventTarget {
    // S6b: emits the normalized LinkEvent contract alongside legacy events.
    supportsLinkEvents = true;

    constructor() {
        super();

        this.connected = false;
        this.connectionInfo = null;
        // S6b: true while an intentional disconnect() is closing the socket, so
        // the onclose handler emits CLOSED rather than LOST. A peer-initiated
        // close (server gone) leaves it false → LOST.
        this._closing = false;

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
        this.address = path;
        console.log(`${this.logHead} Connecting to ${this.address}`);

        this.ws = new WebSocket(this.address, ["binary", "wsSerial"]);
        let socket = this;

        this.ws.onopen = function (e) {
            console.log(`${socket.logHead} Connected: `, e);
            socket.connected = true;
            socket.dispatchEvent(
                new CustomEvent("connect", {
                    detail: {
                        socketId: socket.address,
                    },
                }),
            );
            socket.dispatchEvent(new CustomEvent(LinkEvent.OPEN, { detail: { socketId: socket.address } }));
        };

        this.ws.onclose = async function (e) {
            console.log(`${socket.logHead} Connection closed: `, e);

            // An onclose we did not initiate (server vanished, network drop) is a
            // LOST link; one driven by disconnect() is an intentional CLOSED.
            const lost = !socket._closing;
            await socket.disconnect();
            socket.dispatchEvent(new CustomEvent("disconnect", { detail: { socketId: socket.address } }));
            socket.dispatchEvent(new CustomEvent(lost ? LinkEvent.LOST : LinkEvent.CLOSED, { detail: true }));
            socket._closing = false;
        };

        this.ws.onerror = function (e) {
            console.error(`${socket.logHead} Connection error: `, e);
        };

        this.ws.onmessage = async function (msg) {
            let uint8Chunk = await socket.blob2uint(msg.data);
            socket.dispatchEvent(new CustomEvent("receive", { detail: uint8Chunk }));
            socket.dispatchEvent(new CustomEvent(LinkEvent.DATA, { detail: uint8Chunk }));
        };
    }

    /**
     * S6b: reconnect token for the TCP/WebSocket endpoint. Identity is the
     * address — a TCP endpoint does not change across an FC reboot, so
     * resolveReconnectTarget just returns it unchanged.
     */
    getReconnectToken() {
        if (!this.connected || !this.address) {
            return null;
        }
        return { transportType: "tcp", opaqueId: this.address, baud: 0, isVirtual: false };
    }

    resolveReconnectTarget(token) {
        if (!token || token.transportType !== "tcp") {
            return null;
        }
        return token.opaqueId ?? null;
    }

    async disconnect() {
        this.connected = false;
        this.bytesReceived = 0;
        this.bytesSent = 0;
        // Mark the close intentional so onclose emits CLOSED, not LOST.
        this._closing = true;

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
