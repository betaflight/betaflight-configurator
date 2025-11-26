import { Capacitor } from "@capacitor/core";

const logHead = "[CAPACITORTCP]";
const BetaflightTcp = Capacitor.Plugins.BetaflightTcp;

function base64ToUint8Array(b64) {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

class CapacitorSocket extends EventTarget {
    constructor() {
        super();
        this.connected = false;

        BetaflightTcp.addListener("dataReceived", (ev) => {
            const bytes = base64ToUint8Array(ev.data);
            // Optional: decode to UTF-8 string if the protocol is text-based
            let text;
            try {
                text = new TextDecoder().decode(bytes);
            } catch {
                text = null;
            }
            console.log("TCP data chunk (bytes length):", bytes.length, "text:", text);
            // You can dispatch a custom event or callback here.
        });

        BetaflightTcp.addListener("dataReceivedError", (ev) => {
            console.warn("TCP read error:", ev.error);
        });

        BetaflightTcp.addListener("connectionClosed", () => {
            console.log("TCP connection closed by peer");
            this.connected = false;
        });
    }

    async connect(options) {
        const { host, port } = options;
        const res = await BetaflightTcp.connect({ ip: host, port });
        if (res && res.success) this.connected = true;
        else throw new Error("Connect failed");
    }

    async send(data) {
        if (!this.connected) throw new Error("Socket is not connected");
        const res = await BetaflightTcp.send({ data });
        if (!res.success) throw new Error("Send failed");
    }

    async disconnect() {
        if (!this.connected) return;
        const res = await BetaflightTcp.disconnect();
        this.connected = !res.success ? this.connected : false;
    }
}

export default CapacitorSocket;
