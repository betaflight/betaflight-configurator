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
import { bluetoothDevices, type BluetoothDeviceProfile } from "./devices";
import { base64ToUint8Array, uint8ArrayToBase64 } from "../utils/bytes";
import type { SerialConnectOptions } from "../serial";

/** A scanned device as the native plugin reports it (`getDevices` in BetaflightBlePlugin.java). */
export interface NativeBleDevice {
    address: string;
    /** Null when the device advertises no name. */
    name: string | null;
    rssi: number;
    serviceUuid: string;
    writeCharacteristic: string;
    notifyCharacteristic: string;
}

/** The native BetaflightBle Capacitor plugin. A call that fails rejects with a message. */
interface BetaflightBlePlugin {
    addListener(eventName: "dataReceived", listener: (event: { data: string }) => void): Promise<PluginListenerHandle>;
    addListener(
        eventName: "disconnected",
        listener: (event: { address: string; reason: string }) => void,
    ): Promise<PluginListenerHandle>;
    getDevices(options: { serviceUuids: string[] }): Promise<{ devices?: NativeBleDevice[] }>;
    connect(options: {
        address: string;
        serviceUuid: string;
        writeCharacteristic: string;
        notifyCharacteristic: string;
    }): Promise<{ success?: boolean }>;
    disconnect(): Promise<{ success?: boolean }>;
    send(options: { data: string }): Promise<{ bytesSent?: number }>;
}

/** A device as this transport lists it. */
export interface CapacitorBleDevice {
    path: string;
    displayName: string;
    vendorId: number;
    productId: number;
    address: string;
    serviceUuid: string;
    writeCharacteristic: string;
    notifyCharacteristic: string;
    rssi: number;
}

export interface CapacitorBleSendResult {
    bytesSent: number;
}

const logHead = "[CAPACITORBLE]";
// `Capacitor.Plugins` is the legacy plugin registry, dropped from Capacitor's typings but
// still populated at runtime with every native plugin, which is where this one is read from.
const plugin = (Capacitor as typeof Capacitor & { Plugins?: { BetaflightBle?: BetaflightBlePlugin } })?.Plugins
    ?.BetaflightBle;

class CapacitorBle extends EventTarget {
    connected: boolean;
    connectionId: string | null;
    devices: CapacitorBleDevice[];
    bitrate: number;
    bytesSent: number;
    bytesReceived: number;
    deviceDescription: BluetoothDeviceProfile | null;

    constructor() {
        super();

        // Set before the plugin check, so the fields hold their declared types even when
        // the plugin is missing and the constructor returns early.
        this.connected = false;
        this.connectionId = null;
        this.devices = [];
        this.bitrate = 115200;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.deviceDescription = null;

        if (!plugin) {
            console.warn(`${logHead} Native BetaflightBle plugin is not available`);
            return;
        }

        void plugin.addListener("dataReceived", (event) => {
            const data = base64ToUint8Array(event?.data);
            this.bytesReceived += data.byteLength;
            this.dispatchEvent(new CustomEvent<Uint8Array>("receive", { detail: data }));
        });

        void plugin.addListener("disconnected", () => {
            this.connected = false;
            this.connectionId = null;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
        });
    }

    getConnectedDevice(): CapacitorBleDevice | null {
        return this.devices.find((d) => d.path === this.connectionId) || null;
    }

    async getDevices(): Promise<CapacitorBleDevice[]> {
        if (!plugin) return [];

        try {
            const serviceUuids = bluetoothDevices.map((d) => d.serviceUuid);
            const result = await plugin.getDevices({ serviceUuids });
            const devices = result?.devices || [];

            this.devices = devices.map((d) => {
                return {
                    path: `bluetooth-${d.address}`,
                    displayName: d.name || d.address,
                    vendorId: 0,
                    productId: 0,
                    address: d.address,
                    serviceUuid: d.serviceUuid,
                    writeCharacteristic: d.writeCharacteristic,
                    notifyCharacteristic: d.notifyCharacteristic,
                    rssi: d.rssi,
                };
            });

            return this.devices;
        } catch (error) {
            console.error(`${logHead} Failed to get BLE devices`, error);
            this.devices = [];
            return [];
        }
    }

    async requestPermissionDevice(): Promise<CapacitorBleDevice | null> {
        const devices = await this.getDevices();
        return devices[0] || null;
    }

    async connect(path: string, options?: SerialConnectOptions): Promise<boolean> {
        if (!plugin) return false;

        // Ensure latest device list
        if (!this.devices.length) {
            await this.getDevices();
        }

        const device = this.devices.find((d) => d.path === path);
        if (!device) {
            console.error(`${logHead} Device not found for path ${path}`);
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }

        this.deviceDescription = bluetoothDevices.find((d) => d.serviceUuid === device.serviceUuid) || null;

        try {
            const result = await plugin.connect({
                address: device.address,
                serviceUuid: device.serviceUuid,
                writeCharacteristic: device.writeCharacteristic,
                notifyCharacteristic: device.notifyCharacteristic,
            });

            const success = !!result?.success;
            this.connected = success;
            this.connectionId = success ? device.path : null;
            this.bytesSent = 0;
            this.bytesReceived = 0;
            this.bitrate = options?.baudRate ?? 115200;

            this.dispatchEvent(new CustomEvent<boolean>("connect", { detail: success }));
            return success;
        } catch (error) {
            console.error(`${logHead} Failed to connect`, error);
            this.connected = false;
            this.connectionId = null;
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }
    }

    async disconnect(): Promise<boolean> {
        if (!plugin) return false;
        if (!this.connected) return true;

        try {
            const result = await plugin.disconnect();
            const success = !!result?.success;
            this.connected = false;
            this.connectionId = null;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: success }));
            return success;
        } catch (error) {
            console.error(`${logHead} Failed to disconnect`, error);
            this.connected = false;
            this.connectionId = null;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));
            return false;
        }
    }

    shouldBypassCrc(expectedChecksum: number, computedChecksum: number): boolean {
        const deviceDescription = this.deviceDescription;
        if (!deviceDescription) return false;

        const isBT11 = deviceDescription?.susceptibleToCrcCorruption ?? false;
        return isBT11 && expectedChecksum === 0xff && computedChecksum !== 0xff;
    }

    async send(
        data: ArrayBuffer | ArrayLike<number>,
        callback?: (result: CapacitorBleSendResult) => void,
    ): Promise<CapacitorBleSendResult> {
        if (!plugin || !this.connected) {
            callback?.({ bytesSent: 0 });
            return { bytesSent: 0 };
        }

        const bytes = new Uint8Array(data);
        const payload = uint8ArrayToBase64(bytes);

        try {
            const result = await plugin.send({ data: payload });
            const bytesSent = result?.bytesSent ?? bytes.byteLength;
            this.bytesSent += bytesSent;
            callback?.({ bytesSent });
            return { bytesSent };
        } catch (error) {
            console.error(`${logHead} Failed to send data`, error);
            callback?.({ bytesSent: 0 });
            return { bytesSent: 0 };
        }
    }
}

export default CapacitorBle;
