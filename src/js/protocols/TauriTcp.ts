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

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { bracketHost, unbracketHost } from "../utils/host";

/** A port entry as this transport lists it; a TCP endpoint has no USB identity. */
export interface TauriTcpDevice {
    path: string;
    displayName: string;
    vendorId: number;
    productId: number;
    port: number;
}

/** A bridge as `mdns_browse` reports it (see mdns.rs). */
interface MdnsBridge {
    name: string;
    addresses: string[];
    port: number;
}

/** `connect` carries the canonical tcp:// URL, or `false` for a failed open. */
export type TauriTcpConnectDetail = string | false;

export interface TauriTcpSendResult {
    bytesSent: number;
}

/**
 * Raw TCP transport for the Tauri desktop shell.
 *
 * The webview has no raw-socket API and the Betaflight bridge speaks plain TCP
 * (port 5761, not WebSocket), so this drives the Rust `tcp_*` commands and
 * receives bytes via the `tcp-data` / `tcp-closed` events.
 */
class TauriTcp extends EventTarget {
    connected: boolean;
    // Never written by this transport; kept for parity with the other protocols.
    connectionInfo: null;
    bitrate: number;
    bytesSent: number;
    bytesReceived: number;
    failed: number;
    logHead: string;
    address: string;
    _unlisten: UnlistenFn[];
    devices: TauriTcpDevice[];
    deviceMonitorInterval: ReturnType<typeof setInterval> | null;
    deviceCheckInFlight: boolean;

    constructor() {
        super();

        this.connected = false;
        this.connectionInfo = null;

        this.bitrate = 0;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.failed = 0;

        this.logHead = "[TCP]";

        this.address = "tcp://localhost:5761";

        this._unlisten = [];

        // Bridges found via mDNS (see mdns.rs); kept so a failed browse keeps the last list.
        this.devices = [];
        this.deviceMonitorInterval = null;
        this.deviceCheckInFlight = false;

        this.connect = this.connect.bind(this);

        this.startDeviceMonitoring();
    }

    handleReceiveBytes(info: { detail: { byteLength: number } }): void {
        this.bytesReceived += info.detail.byteLength;
    }

    handleDisconnect(): void {
        void this.disconnect();
    }

    _portInfo(path: string): TauriTcpDevice {
        return { path, displayName: "Betaflight TCP", vendorId: 0, productId: 0, port: 0 };
    }

    // Accept "tcp://host:port", "host:port" or a bare "host". The manual-entry box
    // (and ELRS users) routinely omit the scheme, and `new URL` rejects a schemeless
    // host, so prepend tcp:// before parsing. Defaults to the Betaflight bridge port.
    /**
     * @param path - "tcp://host:port", "host:port" or a bare "host".
     */
    _parseAddress(path: string): { host: string; port: number } {
        const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(path) ? path : `tcp://${path}`;
        const url = new URL(withScheme);
        // The Rust side gives the host to to_socket_addrs(), which accepts a bare address only.
        return { host: unbracketHost(url.hostname), port: Number.parseInt(url.port, 10) || 5761 };
    }

    createPort(url: string): TauriTcpDevice {
        this.address = url;
        return this._portInfo(url);
    }

    getConnectedDevice(): TauriTcpDevice {
        return this._portInfo(this.address);
    }

    /**
     * @returns a port entry for the picker, or null when the bridge has no address yet
     */
    _bridgePort(bridge: MdnsBridge): TauriTcpDevice | null {
        const address = bridge.addresses[0];
        if (!address) {
            return null;
        }
        return { ...this._portInfo(`tcp://${bracketHost(address)}:${bridge.port}`), displayName: bridge.name };
    }

    /**
     * Bridges currently announcing `_betaflight._tcp` on the local network.
     * @returns port entries, one per bridge
     */
    async getDevices(): Promise<TauriTcpDevice[]> {
        try {
            const bridges = await invoke<MdnsBridge[]>("mdns_browse");
            this.devices = bridges
                .map((bridge) => this._bridgePort(bridge))
                .filter((port): port is TauriTcpDevice => port !== null);
        } catch (e) {
            console.warn(`${this.logHead} mDNS browse failed:`, e);
        }
        return this.devices;
    }

    startDeviceMonitoring(): void {
        if (this.deviceMonitorInterval) {
            return;
        }
        this.deviceMonitorInterval = setInterval(async () => {
            if (this.deviceCheckInFlight || this.connected) {
                return;
            }
            this.deviceCheckInFlight = true;
            try {
                await this.checkDeviceChanges();
            } finally {
                this.deviceCheckInFlight = false;
            }
        }, 2000);
    }

    stopDeviceMonitoring(): void {
        if (this.deviceMonitorInterval) {
            clearInterval(this.deviceMonitorInterval);
            this.deviceMonitorInterval = null;
        }
    }

    async checkDeviceChanges(): Promise<void> {
        const previous = this.devices;
        const current = await this.getDevices();
        for (const removed of previous.filter((old) => !current.some((now) => now.path === old.path))) {
            this.dispatchEvent(new CustomEvent<TauriTcpDevice>("removedDevice", { detail: removed }));
        }
        for (const added of current.filter((now) => !previous.some((old) => old.path === now.path))) {
            this.dispatchEvent(new CustomEvent<TauriTcpDevice>("addedDevice", { detail: added }));
        }
    }

    async _teardownListeners(): Promise<void> {
        // The listeners are independent, so remove them together. listen() may resolve an
        // async unlisten, so wait for every removal to complete.
        await Promise.all(
            this._unlisten.map(async (unlisten) => {
                try {
                    await unlisten();
                } catch (e) {
                    console.error(`${this.logHead}Failed to remove listener: ${e}`);
                }
            }),
        );
        this._unlisten = [];
    }

    async connect(path: string, _options?: unknown): Promise<boolean> {
        try {
            const { host, port } = this._parseAddress(path);

            console.log(`${this.logHead} Connecting to ${host}:${port}`);

            // Drop any listeners left over from a previous connection before re-registering,
            // otherwise reconnects leak listeners and duplicate receive/disconnect handling.
            await this._teardownListeners();

            const dataUnlisten = await listen<number[]>("tcp-data", (event) => {
                const bytes = new Uint8Array(event.payload);
                this.handleReceiveBytes({ detail: bytes });
                this.dispatchEvent(new CustomEvent<Uint8Array>("receive", { detail: bytes }));
            });
            const closedUnlisten = await listen("tcp-closed", () => {
                this.handleDisconnect();
            });
            this._unlisten = [dataUnlisten, closedUnlisten];

            await invoke("tcp_connect", { ip: host, port });

            // Keep the canonical tcp:// URL so path-based protocol detection still matches.
            // An IPv6 host gets its brackets again, because a URL needs them.
            this.address = `tcp://${bracketHost(host)}:${port}`;
            this.connected = true;
            this.dispatchEvent(new CustomEvent<TauriTcpConnectDetail>("connect", { detail: this.address }));
            return true;
        } catch (e) {
            console.error(`${this.logHead}Failed to connect to socket: ${e}`);
            this.connected = false;
            await this._teardownListeners();
            this.dispatchEvent(new CustomEvent<TauriTcpConnectDetail>("connect", { detail: false }));
            return false;
        }
    }

    async disconnect(): Promise<boolean> {
        this.connected = false;
        this.bytesReceived = 0;
        this.bytesSent = 0;

        try {
            await invoke("tcp_disconnect");
            await this._teardownListeners();
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            return true;
        } catch (e) {
            console.error(`${this.logHead}Failed to close connection: ${e}`);
            await this._teardownListeners();
            this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));
            return false;
        }
    }

    async send(
        data: ArrayBuffer | ArrayLike<number>,
        cb?: (result: { error: unknown; bytesSent: number }) => void,
    ): Promise<TauriTcpSendResult> {
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
