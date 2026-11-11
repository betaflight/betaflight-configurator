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

import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { base64ToUint8Array, uint8ArrayToBase64 } from "../utils/bytes";
import { registerListeners } from "./capacitorListeners";
import { bracketHost, unbracketHost } from "../utils/host";

/**
 * The native BetaflightTcp Capacitor plugin (BetaflightTcpPlugin.java). A call that fails
 * rejects; a result only ever carries `success: true`.
 */
interface BetaflightTcpPlugin {
    addListener(eventName: "dataReceived", listener: (event: { data: string }) => void): Promise<PluginListenerHandle>;
    addListener(
        eventName: "dataReceivedError",
        listener: (event: { error: string }) => void,
    ): Promise<PluginListenerHandle>;
    addListener(
        eventName: "connectionClosed",
        listener: (event: { reason: string }) => void,
    ): Promise<PluginListenerHandle>;
    connect(options: { ip: string; port: number }): Promise<{ success?: boolean }>;
    send(options: { data: string }): Promise<{ success?: boolean }>;
    disconnect(): Promise<{ success?: boolean }>;
}

// `Capacitor.Plugins` is the legacy plugin registry, dropped from Capacitor's typings but
// still populated at runtime with every native plugin, which is where this one is read from.
const BetaflightTcp = (Capacitor as typeof Capacitor & { Plugins?: { BetaflightTcp?: BetaflightTcpPlugin } })?.Plugins
    ?.BetaflightTcp;

/** A port entry as this transport lists it; a TCP endpoint has no USB identity. */
export interface CapacitorTcpDevice {
    path: string;
    displayName: string;
    vendorId: number;
    productId: number;
    port: number;
}

/** `connect` carries the host:port it connected to, or `false` for a failed open. */
export type CapacitorTcpConnectDetail = string | false;

export interface CapacitorTcpSendResult {
    bytesSent: number;
}

class CapacitorTcp extends EventTarget {
    connected: boolean;
    // Never written by this transport; kept for parity with the other protocols.
    connectionInfo: null;
    bitrate: number;
    bytesSent: number;
    bytesReceived: number;
    failed: number;
    logHead: string;
    address: string;
    plugin: BetaflightTcpPlugin | undefined;
    /**
     * Settles once the native listeners are registered, and rejects if that failed.
     * connect() awaits it, so a transport that cannot hear the device never reports a
     * connection. Null when the plugin is missing.
     */
    _listening: Promise<void> | null;

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
        this._listening = null;

        this.connect = this.connect.bind(this);

        if (!this.plugin) {
            console.warn(`${this.logHead} Native BetaflightTcp plugin is not available`);
            return;
        }

        this._bootstrap(this.plugin);
    }

    // Kept out of the constructor body, which must not start async work (Sonar S7059).
    private _bootstrap(plugin: BetaflightTcpPlugin): void {
        this._listening = registerListeners([
            plugin.addListener("dataReceived", (ev) => {
                const bytes = base64ToUint8Array(ev.data);
                this.handleReceiveBytes({ detail: bytes });
                // Forward raw bytes as detail; Serial/port_usage consume TypedArray.byteLength.
                this.dispatchEvent(new CustomEvent<Uint8Array>("receive", { detail: bytes }));
            }),
            plugin.addListener("dataReceivedError", (ev) => {
                console.warn("TCP read error:", ev.error);
                this.handleDisconnect();
            }),
            plugin.addListener("connectionClosed", () => {
                console.log("TCP connection closed by peer");
                this.handleDisconnect();
            }),
        ]);
        // connect() awaits this and reports a failure as a failed connect. This handler only
        // keeps the rejection from going unhandled before then.
        this._listening.catch((error: unknown) =>
            console.error(`${this.logHead} Failed to register the native listeners:`, error),
        );
    }

    /**
     * The plugin, for the methods only reached where it exists. Without it a call throws a
     * TypeError, exactly as reading a method off the missing plugin did.
     */
    _native(): BetaflightTcpPlugin {
        return this.plugin!;
    }

    handleReceiveBytes(info: { detail: { byteLength: number } }): void {
        this.bytesReceived += info.detail.byteLength;
    }

    handleDisconnect(): void {
        void this.disconnect();
    }

    createPort(url: string): CapacitorTcpDevice {
        this.address = url;
        return {
            path: url,
            displayName: `Betaflight TCP`,
            vendorId: 0,
            productId: 0,
            port: 0,
        };
    }

    getConnectedDevice(): CapacitorTcpDevice {
        return {
            path: this.address,
            displayName: `Betaflight TCP`,
            vendorId: 0,
            productId: 0,
            port: 0,
        };
    }

    async getDevices(): Promise<CapacitorTcpDevice[]> /* NOSONAR: implements the async SerialProtocol interface */ {
        return [];
    }

    async connect(path: string, _options?: unknown): Promise<void> {
        try {
            await this._listening;
            const url = new URL(path);
            // The native plugin connects to a bare address.
            const host = unbracketHost(url.hostname);
            const port = Number.parseInt(url.port, 10) || 5761;

            console.log(`${this.logHead} Connecting to ${url}`);

            const result = await this._native().connect({ ip: host, port });
            if (result?.success) {
                // An IPv6 host gets its brackets again, so that host:port stays unambiguous.
                this.address = `${bracketHost(host)}:${port}`;
                this.connected = true;
            } else {
                throw new Error("Connect failed");
            }
            this.dispatchEvent(new CustomEvent<CapacitorTcpConnectDetail>("connect", { detail: this.address }));
        } catch (e) {
            console.error(`${this.logHead}Failed to connect to socket: ${e}`);
            this.connected = false;
            this.dispatchEvent(new CustomEvent<CapacitorTcpConnectDetail>("connect", { detail: false }));
        }
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        this.bytesReceived = 0;
        this.bytesSent = 0;

        try {
            const res = await this._native().disconnect();
            if (res.success) {
                this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            }
        } catch (e) {
            console.error(`${this.logHead}Failed to close connection: ${e}`);
            this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));
        }
    }

    async send(
        data: ArrayBuffer | ArrayLike<number>,
        cb?: (result: { error: unknown; bytesSent: number }) => void,
    ): Promise<CapacitorTcpSendResult> {
        let actualBytesSent = 0;
        if (this.connected) {
            const bytes = new Uint8Array(data);
            try {
                const payload = uint8ArrayToBase64(bytes);
                const res = await this._native().send({ data: payload });

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
