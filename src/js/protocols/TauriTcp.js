import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LinkEvent } from "./LinkEvent.js";

/**
 * Raw TCP transport for the Tauri shell (desktop and Android).
 *
 * The webview has no raw-socket API and the Betaflight bridge speaks plain TCP
 * (port 5761, not WebSocket), so this drives the Rust `tcp_*` commands and
 * receives bytes via the `tcp-data` / `tcp-closed` events.
 */
class TauriTcp extends EventTarget {
    // S6b: emits the normalized LinkEvent contract alongside legacy events.
    supportsLinkEvents = true;

    constructor() {
        super();

        this.connected = false;
        this.connectionInfo = null;
        // S6b: set by handleDisconnect (tcp-closed) so disconnect() emits LOST.
        this._linkLost = false;

        this.bitrate = 0;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.failed = 0;

        this.logHead = "[TCP]";

        this.address = "tcp://localhost:5761";

        this._unlisten = [];

        this.connect = this.connect.bind(this);
    }

    handleReceiveBytes(info) {
        this.bytesReceived += info.detail.byteLength;
    }

    handleDisconnect() {
        // Peer-initiated close (tcp-closed) → the link was lost, not closed.
        this._linkLost = true;
        this.disconnect();
    }

    _portInfo(path) {
        return { path, displayName: "Betaflight TCP", vendorId: 0, productId: 0, port: 0 };
    }

    /**
     * S6b: reconnect token for the TCP endpoint (identity = address; stable
     * across an FC reboot).
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

    createPort(url) {
        this.address = url;
        return this._portInfo(url);
    }

    getConnectedPort() {
        return this._portInfo(this.address);
    }

    async getDevices() {
        return [];
    }

    async _teardownListeners() {
        for (const unlisten of this._unlisten) {
            try {
                // listen() may resolve an async unlisten — await so removal completes.
                await unlisten();
            } catch (e) {
                console.error(`${this.logHead}Failed to remove listener: ${e}`);
            }
        }
        this._unlisten = [];
    }

    async connect(path, _options) {
        try {
            const url = new URL(path);
            const host = url.hostname;
            const port = Number.parseInt(url.port, 10) || 5761;

            console.log(`${this.logHead} Connecting to ${url}`);

            // Drop any listeners left over from a previous connection before re-registering,
            // otherwise reconnects leak listeners and duplicate receive/disconnect handling.
            await this._teardownListeners();

            const dataUnlisten = await listen("tcp-data", (event) => {
                const bytes = new Uint8Array(event.payload);
                this.handleReceiveBytes({ detail: bytes });
                this.dispatchEvent(new CustomEvent("receive", { detail: bytes }));
                this.dispatchEvent(new CustomEvent(LinkEvent.DATA, { detail: bytes }));
            });
            const closedUnlisten = await listen("tcp-closed", () => {
                this.handleDisconnect();
            });
            this._unlisten = [dataUnlisten, closedUnlisten];

            await invoke("tcp_connect", { ip: host, port });

            // Keep the canonical tcp:// URL so path-based protocol detection still matches.
            this.address = `tcp://${host}:${port}`;
            this.connected = true;
            this.dispatchEvent(new CustomEvent("connect", { detail: this.address }));
            this.dispatchEvent(new CustomEvent(LinkEvent.OPEN, { detail: this.address }));
            return true;
        } catch (e) {
            console.error(`${this.logHead}Failed to connect to socket: ${e}`);
            this.connected = false;
            await this._teardownListeners();
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }
    }

    async disconnect() {
        this.connected = false;
        this.bytesReceived = 0;
        this.bytesSent = 0;
        const lost = this._linkLost;
        this._linkLost = false;

        try {
            await invoke("tcp_disconnect");
            await this._teardownListeners();
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            this.dispatchEvent(new CustomEvent(lost ? LinkEvent.LOST : LinkEvent.CLOSED, { detail: true }));
            return true;
        } catch (e) {
            console.error(`${this.logHead}Failed to close connection: ${e}`);
            await this._teardownListeners();
            this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));
            this.dispatchEvent(new CustomEvent(lost ? LinkEvent.LOST : LinkEvent.CLOSED, { detail: false }));
            return false;
        }
    }

    async send(data, cb) {
        let actualBytesSent = 0;
        if (this.connected) {
            const bytes = new Uint8Array(data);
            try {
                await invoke("tcp_send", { data: Array.from(bytes) });
                actualBytesSent = bytes.byteLength;
                this.bytesSent += actualBytesSent;
                if (cb) {
                    cb({
                        error: null,
                        bytesSent: actualBytesSent,
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
            bytesSent: actualBytesSent,
        };
    }
}

export default TauriTcp;
