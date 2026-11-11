/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

/** The device record this transport reports; a SITL endpoint has no USB identity. */
export interface WebsocketDevice {
    path: string;
    displayName: string;
    vendorId: number;
    productId: number;
    port: number;
}

/** `connect` carries `false` for a failed open, so serial_backend can tell it from success. */
export type WebsocketConnectDetail = false | { socketId: string };

export interface WebsocketSendResult {
    bytesSent: number;
}

/** Same payloads `WebSocket.send` accepts, minus the string and Blob forms, which carry no `byteLength`. */
export type WebsocketPayload = ArrayBuffer | ArrayBufferView<ArrayBuffer>;

class Websocket extends EventTarget {
    connected: boolean;
    // Never written by this transport; kept for parity with the other protocols.
    connectionInfo: null;
    bitrate: number;
    bytesSent: number;
    bytesReceived: number;
    failed: number;
    logHead: string;
    address: string;
    ws: WebSocket | null;

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

    handleReceiveBytes(info: { detail: { byteLength: number } }): void {
        this.bytesReceived += info.detail.byteLength;
    }

    handleDisconnect(): void {
        void this.disconnect();
    }

    createPort(url: string): WebsocketDevice {
        this.address = url;
        return {
            path: url,
            displayName: `Betaflight SITL`,
            vendorId: 0,
            productId: 0,
            port: 0,
        };
    }

    getConnectedDevice(): WebsocketDevice {
        return {
            path: this.address,
            displayName: `Betaflight SITL`,
            vendorId: 0,
            productId: 0,
            port: 0,
        };
    }

    async getDevices(): Promise<WebsocketDevice[]> /* NOSONAR: implements the async SerialProtocol interface */ {
        return [];
    }

    async blob2uint(blob: Blob): Promise<Uint8Array> {
        const buffer = await new Response(blob).arrayBuffer();
        return new Uint8Array(buffer);
    }

    async connect(path: string): Promise<void> /* NOSONAR: implements the async SerialProtocol interface */ {
        this.address = path;
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
        let ws: WebSocket;
        try {
            ws = new WebSocket(this.address, ["binary"]);
        } catch (e) {
            // Invalid URL/scheme, e.g. a raw tcp:// manual override, which a browser
            // cannot open (raw TCP needs the desktop app's native transport).
            console.error(`${this.logHead} Failed to open ${this.address}:`, e);
            this.dispatchEvent(new CustomEvent<WebsocketConnectDetail>("connect", { detail: false }));
            return;
        }
        this.ws = ws;
        this.ws.onopen = (e: Event) => {
            if (this.ws !== ws) {
                return;
            }
            console.log(`${this.logHead} Connected: `, e);
            this.connected = true;
            this.dispatchEvent(
                new CustomEvent<WebsocketConnectDetail>("connect", {
                    detail: {
                        socketId: this.address,
                    },
                }),
            );
        };

        this.ws.onclose = async (e: CloseEvent) => {
            if (this.ws !== ws) {
                return;
            }
            console.log(`${this.logHead} Connection closed: `, e);

            await this.disconnect();
            this.dispatchEvent(new CustomEvent("disconnect", { detail: { socketId: this.address } }));
        };

        this.ws.onerror = (e: Event) => {
            console.error(`${this.logHead} Connection error: `, e);
        };

        this.ws.onmessage = async (msg: MessageEvent<Blob>) => {
            if (this.ws !== ws) {
                return;
            }
            const uint8Chunk = await this.blob2uint(msg.data);
            // Re-check after the await: the socket may have been superseded while the
            // blob decoded, and stale bytes must not leak into the new session's stream.
            if (this.ws !== ws) {
                return;
            }
            this.handleReceiveBytes({ detail: uint8Chunk });
            this.dispatchEvent(new CustomEvent<Uint8Array>("receive", { detail: uint8Chunk }));
        };
    }

    async disconnect(): Promise<void> /* NOSONAR: implements the async SerialProtocol interface */ {
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

    async /* NOSONAR: implements the async SerialProtocol interface */ send(
        data: WebsocketPayload,
        cb?: (result: { error: unknown; bytesSent: number }) => void,
    ): Promise<WebsocketSendResult> {
        // Report only what was written: MSP fires its sent-callback when bytesSent
        // equals the frame length, so a failed or socketless send must report 0.
        let bytesSent = 0;
        if (this.ws) {
            try {
                // A closing or closed socket discards sent data without throwing, and
                // disconnect() leaves this.ws set, so check before claiming the bytes.
                if (this.ws.readyState === WebSocket.CLOSING || this.ws.readyState === WebSocket.CLOSED) {
                    cb?.({ error: null, bytesSent: 0 });
                    return { bytesSent: 0 };
                }

                this.ws.send(data);
                this.bytesSent += data.byteLength;
                bytesSent = data.byteLength;

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

        return { bytesSent };
    }
}

export default Websocket;
