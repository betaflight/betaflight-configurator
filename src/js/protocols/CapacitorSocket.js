import { Capacitor } from "@capacitor/core";

function base64ToUint8Array(b64) {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.codePointAt(i); // was using charCodeAt
    }
    return bytes;
}

async function blob2uint(blob) {
    const buffer = await new Response(blob).arrayBuffer();
    return new Uint8Array(buffer);
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

        this.connect = this.connect.bind(this);

        Capacitor.Plugins.BetaflightTcp.addListener("dataReceived", (ev) => {
            const bytes = base64ToUint8Array(ev.data);
            console.log("TCP data chunk (bytes length):", bytes.length, "text:", text);
            this.dispatchEvent(new CustomEvent("receive", { detail: bytes })); // TODO check detail
        });

        Capacitor.Plugins.BetaflightTcp.addListener("dataReceivedError", (ev) => {
            console.warn("TCP read error:", ev.error);
        });

        Capacitor.Plugins.BetaflightTcp.addListener("connectionClosed", () => {
            console.log("TCP connection closed by peer");
            this.connected = false;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: { socketId: this.address } }));
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

        const { host, port } = options; // TODO Extract host and port from path

        this.address = path;
        console.log(`${this.logHead} Connecting to ${this.address}`);

        try {
            const result = await Capacitor.Plugins.BetaflightTcp.connect({ ip: host, port });
            if (result?.success) {
                this.connected = true;
            } else {
                throw new Error("Connect failed");
                throw new Error("Connect failed");
            }

            this.dispatchEvent(new CustomEvent("connect", { detail: this.connectionInfo })); // TODO need to check result detail
        } catch (e) {
            console.error(`${this.logHead}Failed to connect to socket: ${e}`);
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
        this.connected = false;
        this.bytesReceived = 0;
        this.bytesSent = 0;

        if (this.connected) {
            try {
                const res = await Capacitor.Plugins.BetaflightTcp.disconnect();
                this.connected = !res.success ? this.connected : false;
            } catch (e) {
                console.error(`${this.logHead}Failed to close socket: ${e}`);
            }
        }
    }

    async send(data, cb) {
        /*
        async send(data) {
          if (!this.connected) throw new Error("Socket is not connected");
          const res = await Capacitor.Plugins.BetaflightTcp.send({ data });
          if (!res.success) throw new Error("Send failed");
        }
      */

        if (this.connected) {
            try {
                const res = await Capacitor.Plugins.BetaflightTcp.send({ data });

                if (res.success) {
                    this.bytesSent += data.byteLength;
                    if (cb) {
                        cb({
                            error: null,
                            bytesSent: data.byteLength,
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
            bytesSent: data.byteLength,
        };
    }
}

export default CapacitorSocket;
