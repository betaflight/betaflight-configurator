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

function normalizeToUint8Array(data) {
    if (data instanceof Uint8Array) {
        return data;
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    if (Array.isArray(data)) {
        return Uint8Array.from(data);
    }
    throw new TypeError("Unsupported data type for TCP send");
}

class CapacitorSocket extends EventTarget {
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

        this.socket = null;
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
            this.connected = false;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: this.address }));
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
        /*
          async connect(options) {
              const { host, port } = options;
              const res = await Capacitor.Plugins.BetaflightTcp.connect({ ip: host, port });
              if (res && res.success) this.connected = true;
              else throw new Error("Connect failed");
          }
        */

        if (!this.plugin) {
            console.warn(`${this.logHead} Cannot connect; native plugin unavailable`);
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return;
        }

        let host;
        let port;

        try {
            const normalizedPath = path.includes("://") ? path : `tcp://${path}`;
            const url = new URL(normalizedPath);
            host = url.hostname;
            const parsedPort = url.port ? Number.parseInt(url.port, 10) : Number.NaN;
            const fallbackPort = Number.isNaN(parsedPort) ? Number.parseInt(options?.port, 10) : parsedPort;
            if (Number.isNaN(fallbackPort)) {
                throw new Error(`Invalid port in path: ${path}`);
            }
            port = fallbackPort;

            console.log(`${this.logHead} Connecting to ${host}:${port}`);

            const result = await this.plugin.connect({ ip: host, port });
            if (result?.success) {
                this.address = `${host}:${port}`;
                this.connected = true;
            } else {
                throw new Error("Connect failed");
            }
            this.dispatchEvent(new CustomEvent("connect", { detail: this.address })); // TODO need to check result detail
        } catch (e) {
            console.error(`${this.logHead}Failed to connect to socket: ${e}`);
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
        }
    }

    async disconnect() {
        /*
        async disconnect() {
          if (!this.connected) return;
          const res = await Capacitor.Plugins.BetaflightTcp.disconnect();
          this.connected = !res.success ? this.connected : false;
        }
      */

        if (!this.plugin) {
            console.warn(`${this.logHead} Cannot disconnect; native plugin unavailable`);
            return;
        }

        if (this.connected) {
            try {
                const res = await this.plugin.disconnect();
                if (res.success) {
                    this.connected = false;
                }
                this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            } catch (e) {
                console.error(`${this.logHead}Failed to close socket: ${e}`);
                this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));
            }
        }

        this.connected = false;
        this.bytesReceived = 0;
        this.bytesSent = 0;
    }

    async send(data, cb) {
        /*
        async send(data) {
          if (!this.connected) throw new Error("Socket is not connected");
          const res = await Capacitor.Plugins.BetaflightTcp.send({ data });
          if (!res.success) throw new Error("Send failed");
        }
      */

        if (!this.plugin) {
            console.warn(`${this.logHead} Cannot send; native plugin unavailable`);
            return {
                bytesSent: 0,
            };
        }

        if (this.connected) {
            const bytes = normalizeToUint8Array(data);
            try {
                const payload = uint8ArrayToBase64(bytes);
                const res = await this.plugin.send({ data: payload });

                if (res.success) {
                    this.bytesSent += bytes.byteLength;
                    if (cb) {
                        cb({
                            error: null,
                            bytesSent: bytes.byteLength,
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
            bytesSent: 0,
        };
    }
}

export default CapacitorSocket;
