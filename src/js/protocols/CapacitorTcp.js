import { Capacitor } from "@capacitor/core";

const BetaflightTcp = Capacitor?.Plugins?.BetaflightTcp;

function base64ToUint8Array(b64) {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        // The atob() function returns a binary string where each character represents a single byte (0–255).
        // codePointAt() is designed for Unicode code points and can return values greater than 255, which will overflow Uint8Array slots and corrupt received data.
        // Use charCodeAt(i) to safely extract byte values.
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function uint8ArrayToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

class CapacitorTcp extends EventTarget {
    constructor() {
        super();

        this.connected = false;
        this.connectionInfo = null;

        this.bitrate = 0;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.failed = 0;

        this.logHead = "[TCP]";

        this.address = "http://localhost:5761";

        this.plugin = BetaflightTcp;

        this.connect = this.connect.bind(this);

        if (!this.plugin) {
            console.warn(`${this.logHead} Native BetaflightTcp plugin is not available`);
            return;
        }

        this.plugin.addListener("dataReceived", (ev) => {
            const bytes = base64ToUint8Array(ev.data);
            this.handleReceiveBytes({ detail: bytes });
            // Forward raw bytes as detail; Serial/port_usage consume TypedArray.byteLength.
            this.dispatchEvent(new CustomEvent("receive", { detail: bytes }));
        });

        this.plugin.addListener("dataReceivedError", (ev) => {
            console.warn("TCP read error:", ev.error);
            this.handleDisconnect();
        });

        this.plugin.addListener("connectionClosed", () => {
            console.log("TCP connection closed by peer");
            this.handleDisconnect();
        });
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
            displayName: `Betaflight TCP`,
            vendorId: 0,
            productId: 0,
            port: 0,
        };
    }

    getConnectedPort() {
        return {
            path: this.address,
            displayName: `Betaflight TCP`,
            vendorId: 0,
            productId: 0,
            port: 0,
        };
    }

    async getDevices() {
        return [];
    }

    async connect(path, options) {
        try {
            const url = new URL(path);
            const host = url.hostname;
            const port = Number.parseInt(url.port, 10) || 5761;

            console.log(`${this.logHead} Connecting to ${url}`);

            const result = await this.plugin.connect({ ip: host, port });
            if (result?.success) {
                this.address = `${host}:${port}`;
                this.connected = true;
            } else {
                throw new Error("Connect failed");
            }
            this.dispatchEvent(new CustomEvent("connect", { detail: this.address }));
        } catch (e) {
            console.error(`${this.logHead}Failed to connect to socket: ${e}`);
            this.connected = false;
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
        }
    }

    async disconnect() {
        this.connected = false;
        this.bytesReceived = 0;
        this.bytesSent = 0;

        try {
            const res = await this.plugin.disconnect();
            if (res.success) {
                this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            }
        } catch (e) {
            console.error(`${this.logHead}Failed to close connection: ${e}`);
            this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));
        }
    }

    async send(data, cb) {
        let actualBytesSent = 0;
        if (this.connected) {
            const bytes = new Uint8Array(data);
            try {
                const payload = uint8ArrayToBase64(bytes);
                const res = await this.plugin.send({ data: payload });

                if (res.success) {
                    actualBytesSent = bytes.byteLength;
                    this.bytesSent += actualBytesSent;
                    if (cb) {
                        cb({
                            error: null,
                            bytesSent: actualBytesSent,
                        });
                    }
                } else {
                    throw new Error("Send failed");
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
            bytesSent: actualBytesSent,
        };
    }
}

export default CapacitorTcp;
