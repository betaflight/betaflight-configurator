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
import { i18n } from "../localization";
import { gui_log } from "../gui_log";
import { bluetoothDevices, type BluetoothDeviceProfile } from "./devices";

/** A peripheral as the Rust `ble_scan` command reports it (`ScannedDevice`). The name may be empty. */
interface BleScannedDevice {
    id: string;
    name?: string;
    services?: string[];
}

/** A Bluetooth device as this transport lists it. */
export interface TauriBlePort {
    path: string;
    displayName: string;
    vendorId: "unknown";
    /** The CoreBluetooth UUID, which is all there is to identify the peripheral by. */
    productId: string;
    port: BleScannedDevice;
}

/** What the Rust `ble_connect` command reports: the GATT service that matched. */
interface BleConnectResult {
    serviceUuid: string;
}

/** What `send` hands its callback. */
export interface TauriBleSendInfo {
    error: unknown;
    bytesSent: number;
}

/** The payloads `send` writes. */
export type TauriBlePayload = ArrayBuffer | ArrayLike<number>;

/**
 * Native BLE transport for the Tauri macOS shell, whose webview (WKWebView) has
 * no Web Bluetooth.
 *
 * Drives the Rust `ble_*` commands and receives notification bytes via the
 * `ble-data` / `ble-disconnected` events. Presents the same EventTarget interface
 * as `WebBluetooth`, so serial.js and serial_backend treat it identically.
 */
class TauriBle extends EventTarget {
    connected: boolean;
    connectionId: string | false;
    deviceDescription: BluetoothDeviceProfile | null;
    bitrate: number;
    bytesSent: number;
    bytesReceived: number;
    failed: number;
    devices: TauriBlePort[];
    _connectedDevice: TauriBlePort | null;
    _unlisten: UnlistenFn[];
    logHead: string;
    bt11_crc_corruption_logged: boolean;
    /** Never assigned here: the check that reads it is shared with WebBluetooth, where it is not set either. */
    message_checksum?: number;

    constructor() {
        super();

        this.connected = false;
        this.connectionId = false;
        this.deviceDescription = null;

        this.bitrate = 0;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.failed = 0;

        this.devices = [];
        this._connectedDevice = null;
        this._unlisten = [];

        this.logHead = "[BLE]";

        this.bt11_crc_corruption_logged = false;

        this.connect = this.connect.bind(this);
        this.handleDisconnect = this.handleDisconnect.bind(this);
    }

    /**
     * Counts received bytes. Called directly with the chunk, and registered as the
     * "receive" listener, whose CustomEvent carries the same chunk in `detail`.
     */
    handleReceiveBytes(info: Event | { detail: Uint8Array }): void {
        this.bytesReceived += (info as { detail: Uint8Array }).detail.byteLength;
    }

    handleDisconnect(): void {
        void this.disconnect();
    }

    // Mirrors WebBluetooth/CapacitorBle: a stable `bluetooth_`-prefixed path keeps
    // serial.js selectProtocol routing to the BLE slot, and the id (a CoreBluetooth
    // UUID) is stable across scans so a pinned path re-resolves to the same device.
    createPort(device: BleScannedDevice): TauriBlePort {
        return {
            path: `bluetooth_${device.id}`,
            displayName: device.name || device.id,
            vendorId: "unknown",
            productId: device.id,
            port: device,
        };
    }

    getConnectedDevice(): TauriBlePort | null {
        return this._connectedDevice;
    }

    isBT11CorruptionPattern(expectedChecksum: number): boolean {
        if (expectedChecksum !== 0xff || this.message_checksum === 0xff) {
            return false;
        }

        if (!this.connected) {
            return false;
        }

        if (!this.deviceDescription) {
            return false;
        }

        return this.deviceDescription?.susceptibleToCrcCorruption ?? false;
    }

    shouldBypassCrc(expectedChecksum: number): boolean {
        if (this.isBT11CorruptionPattern(expectedChecksum)) {
            if (!this.bt11_crc_corruption_logged) {
                console.log(`${this.logHead} Detected BT-11/CC2541 CRC corruption (0xff), skipping CRC check`);
                this.bt11_crc_corruption_logged = true;
            }
            return true;
        }
        return false;
    }

    // A BLE scan doubles as the permission gate: it raises the macOS Bluetooth prompt
    // on first CoreBluetooth use. The picker renders whatever this returns.
    async getDevices(): Promise<TauriBlePort[]> {
        try {
            const found = await invoke<BleScannedDevice[]>("ble_scan");
            this.devices = found.map((device) => this.createPort(device));
        } catch (e) {
            console.error(`${this.logHead} Scan failed: ${e}`);
        }
        return this.devices;
    }

    // No OS device chooser on macOS — a scan surfaces the permission prompt and refreshes
    // the list. Return the first hit to mirror CapacitorBle's shape.
    async requestPermissionDevice(): Promise<TauriBlePort | null> {
        const devices = await this.getDevices();
        return devices?.[0] ?? null;
    }

    async _teardownListeners(): Promise<void> {
        for (const unlisten of this._unlisten) {
            try {
                await unlisten();
            } catch (e) {
                console.error(`${this.logHead} Failed to remove listener: ${e}`);
            }
        }
        this._unlisten = [];
    }

    async connect(path: string, _options?: unknown): Promise<boolean> {
        try {
            const device = this.devices.find((d) => d.path === path);
            const id = device ? device.port.id : path.replace(/^bluetooth_/, "");

            // Drop listeners left over from a previous connection before re-registering,
            // otherwise reconnects leak listeners and duplicate receive/disconnect handling.
            await this._teardownListeners();

            const dataUnlisten = await listen<number[]>("ble-data", (event) => {
                const bytes = new Uint8Array(event.payload);
                this.handleReceiveBytes({ detail: bytes });
                this.dispatchEvent(new CustomEvent("receive", { detail: bytes }));
            });
            const closedUnlisten = await listen("ble-disconnected", () => {
                this.handleDisconnect();
            });
            this._unlisten = [dataUnlisten, closedUnlisten];

            // Hand the JS GATT table to Rust so UUID matching (and remote overrides) stay
            // authoritative here; Rust reports which service matched.
            const descriptors = bluetoothDevices.map((d) => ({
                name: d.name,
                serviceUuid: d.serviceUuid,
                writeCharacteristic: d.writeCharacteristic,
                readCharacteristic: d.readCharacteristic,
            }));

            const result = await invoke<BleConnectResult>("ble_connect", { id, devices: descriptors });

            this.deviceDescription = bluetoothDevices.find((d) => d.serviceUuid === result.serviceUuid) ?? null;
            this._connectedDevice = device ?? this._portInfo(id);
            this.connected = true;
            this.connectionId = path;
            this.bytesReceived = 0;
            this.bytesSent = 0;
            this.failed = 0;

            this.addEventListener("receive", this.handleReceiveBytes);

            gui_log(i18n.getMessage("bluetoothConnected", [this._connectedDevice.displayName]));
            this.dispatchEvent(new CustomEvent("connect", { detail: true }));
            return true;
        } catch (e) {
            console.error(`${this.logHead} Failed to connect: ${e}`);
            this.connected = false;
            await this._teardownListeners();
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }
    }

    _portInfo(id: string): TauriBlePort {
        return { path: `bluetooth_${id}`, displayName: id, vendorId: "unknown", productId: id, port: { id } };
    }

    async disconnect(): Promise<boolean> {
        this.connected = false;
        this.bytesReceived = 0;
        this.bytesSent = 0;

        try {
            await invoke("ble_disconnect");
            await this._teardownListeners();
            this.removeEventListener("receive", this.handleReceiveBytes);
            this.deviceDescription = null;
            this._connectedDevice = null;
            this.connectionId = false;
            this.bt11_crc_corruption_logged = false;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            return true;
        } catch (e) {
            console.error(`${this.logHead} Failed to close connection: ${e}`);
            await this._teardownListeners();
            this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));
            return false;
        }
    }

    async send(data: TauriBlePayload, cb?: (info: TauriBleSendInfo) => void): Promise<{ bytesSent: number }> {
        let actualBytesSent = 0;
        if (this.connected) {
            const bytes = new Uint8Array(data);
            try {
                await invoke("ble_send", { data: Array.from(bytes) });
                actualBytesSent = bytes.byteLength;
                this.bytesSent += actualBytesSent;
                cb?.({ error: null, bytesSent: actualBytesSent });
            } catch (e) {
                console.error(`${this.logHead} Failed to send data: ${e}`);
                cb?.({ error: e, bytesSent: 0 });
            }
        } else {
            cb?.({ error: "BLE peripheral is not connected", bytesSent: 0 });
        }

        return { bytesSent: actualBytesSent };
    }
}

export default TauriBle;
