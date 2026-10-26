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
import { hexStringToUint8Array, uint8ArrayToHexString } from "../utils/bytes";
import { registerListeners } from "./capacitorListeners";
import type { SerialConnectOptions } from "../serial";

/**
 * A USB device as the native plugin reports it (`createDeviceInfo` in
 * BetaflightSerialPlugin.java). The manufacturer and product names are absent when the
 * device has none.
 */
export interface NativeSerialDevice {
    /** "vendorId:productId:deviceNum", the plugin's key for the device. */
    deviceId: string;
    vendorId: number;
    productId: number;
    deviceName: string;
    deviceClass: number;
    deviceSubclass: number;
    manufacturer?: string | null;
    product?: string | null;
}

/** The native BetaflightSerial Capacitor plugin. A call that fails rejects with a message. */
interface BetaflightSerialPlugin {
    addListener(eventName: "dataReceived", listener: (event: { data: string }) => void): Promise<PluginListenerHandle>;
    addListener(
        eventName: "deviceAttached" | "deviceDetached",
        listener: (device: NativeSerialDevice) => void,
    ): Promise<PluginListenerHandle>;
    getDevices(): Promise<{ devices: NativeSerialDevice[] }>;
    requestPermission(): Promise<{ devices: NativeSerialDevice[] }>;
    connect(options: { deviceId: string; baudRate: number }): Promise<{ success: boolean; error?: string }>;
    disconnect(): Promise<{ success: boolean }>;
    write(options: { data: string }): Promise<{ bytesSent: number }>;
}

/** A port as this transport lists it; `device` is the native device info. */
export interface CapacitorSerialPort {
    path: string;
    displayName: string;
    vendorId: number;
    productId: number;
    device: NativeSerialDevice;
}

/** The `connect` detail on success, the shape WebSerial reports; `false` on failure. */
export interface CapacitorSerialConnectionInfo {
    usbVendorId: number;
    usbProductId: number;
}

export interface CapacitorSerialSendResult {
    bytesSent: number;
}

const logHead = "[CAPACITORSERIAL]";
// `Capacitor.Plugins` is the legacy plugin registry, dropped from Capacitor's typings but
// still populated at runtime with every native plugin, which is where this one is read from.
const BetaflightSerial = (Capacitor as typeof Capacitor & { Plugins?: { BetaflightSerial?: BetaflightSerialPlugin } })
    ?.Plugins?.BetaflightSerial;

/**
 * The plugin, for the methods only reached where it exists. Without it a call throws a
 * TypeError, exactly as reading a method off the missing plugin did.
 */
function nativeSerial(): BetaflightSerialPlugin {
    return BetaflightSerial!;
}

/**
 * Capacitor Serial protocol implementation for Android
 * Wraps the native BetaflightSerial plugin to provide serial communication
 * on Android devices using USB OTG
 */
class CapacitorSerial extends EventTarget {
    connected: boolean;
    openRequested: boolean;
    transmitting: boolean;
    connectionInfo: CapacitorSerialConnectionInfo | null;
    bitrate: number;
    bytesSent: number;
    bytesReceived: number;
    ports: CapacitorSerialPort[];
    currentDevice: CapacitorSerialPort | null;
    connectionId: string | null;
    /**
     * Settles once the native listeners are registered, and rejects if that failed.
     * connect() awaits it, so a transport that cannot hear the device never reports a
     * connection. Null when the plugin is missing.
     */
    _listening: Promise<void> | null;

    constructor() {
        super();

        // Set before the plugin check, so the fields hold their declared types even when
        // the plugin is missing and the constructor returns early.
        this.connected = false;
        this.openRequested = false;
        this.transmitting = false;
        this.connectionInfo = null;

        this.bitrate = 0;
        this.bytesSent = 0;
        this.bytesReceived = 0;

        this.ports = [];
        this.currentDevice = null;
        this.connectionId = null;
        this._listening = null;

        if (!BetaflightSerial) {
            console.error(`${logHead} Native BetaflightSerial plugin is not available`);
            return;
        }

        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.handleDataReceived = this.handleDataReceived.bind(this);
        this.handleDeviceAttached = this.handleDeviceAttached.bind(this);
        this.handleDeviceDetached = this.handleDeviceDetached.bind(this);

        this._bootstrap(BetaflightSerial);

        console.log(`${logHead} CapacitorSerial initialized`);
    }

    // Kept out of the constructor body, which must not start async work (Sonar S7059).
    private _bootstrap(plugin: BetaflightSerialPlugin): void {
        this._listening = registerListeners([
            // Listen for data received from native plugin
            plugin.addListener("dataReceived", this.handleDataReceived),
            // Listen for device attach/detach events
            plugin.addListener("deviceAttached", this.handleDeviceAttached),
            plugin.addListener("deviceDetached", this.handleDeviceDetached),
        ]);
        // connect() awaits this and reports a failure as a failed connect. This handler only
        // keeps the rejection from going unhandled before then.
        this._listening.catch((error: unknown) =>
            console.error(`${logHead} Failed to register the native listeners:`, error),
        );

        // Load initial device list. loadDevices() catches and logs its own failures.
        void this.loadDevices();
    }

    handleDataReceived(event: { data: string }): void {
        // Convert hex string to Uint8Array
        const data = hexStringToUint8Array(event.data);
        this.bytesReceived += data.length;

        // Dispatch receive event with the data
        this.dispatchEvent(new CustomEvent<Uint8Array>("receive", { detail: data }));
    }

    handleDeviceAttached(device: NativeSerialDevice): CapacitorSerialPort | undefined {
        const added = this.createPort(device);
        if (this.ports.some((port) => port.path === added.path)) {
            return;
        }
        this.ports.push(added);
        this.dispatchEvent(new CustomEvent<CapacitorSerialPort>("addedDevice", { detail: added }));
        console.log(`${logHead} Device attached:`, added.path);
        return added;
    }

    handleDeviceDetached(device: NativeSerialDevice): void {
        const deviceKey = this.getDeviceKey(device);
        const removed = this.ports.find((port) => port.path === deviceKey);

        if (removed) {
            // Check if this was the currently connected device
            const wasConnected = this.connected && this.currentDevice?.path === deviceKey;

            if (wasConnected) {
                console.warn(`${logHead} Currently connected device detached, cleaning up connection state`);

                // Clean up state without calling native disconnect (already done)
                this.cleanupConnectionState();

                // Dispatch disconnect event to notify the app. The connected
                // device vanished, so this is a LOST link, not an intentional close.
                this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            }

            // Remove from ports list
            this.ports = this.ports.filter((port) => port.path !== deviceKey);
            this.dispatchEvent(new CustomEvent<CapacitorSerialPort>("removedDevice", { detail: removed }));
            console.log(`${logHead} Device detached:`, removed.path);
        }
    }

    createPort(device: NativeSerialDevice): CapacitorSerialPort {
        const deviceKey = this.getDeviceKey(device);
        const displayName = this.getDisplayName(device);

        return {
            path: deviceKey,
            displayName: displayName,
            vendorId: device.vendorId,
            productId: device.productId,
            device: device,
        };
    }

    getDeviceKey(device: NativeSerialDevice): string {
        // Use the deviceId directly from native - it already contains the VID:PID:deviceNum format
        return `capacitor-${device.deviceId}`;
    }

    getDisplayName(device: NativeSerialDevice): string {
        // Try to get a friendly name from manufacturer/product
        if (device.product) {
            return `Betaflight ${device.product}`;
        }
        if (device.manufacturer) {
            return `Betaflight ${device.manufacturer}`;
        }
        // Fallback to VID:PID
        return `Betaflight VID:${device.vendorId} PID:${device.productId}`;
    }

    async loadDevices(): Promise<void> {
        try {
            const result = await nativeSerial().getDevices();
            this.ports = result.devices.map((device) => this.createPort(device));
            console.log(`${logHead} Loaded ${this.ports.length} devices`);
        } catch (error) {
            console.error(`${logHead} Error loading devices:`, error);
            this.ports = [];
        }
    }

    async requestPermissionDevice(): Promise<CapacitorSerialPort | null | undefined> {
        let newPermissionPort: CapacitorSerialPort | null | undefined = null;

        try {
            console.log(`${logHead} Requesting USB permissions...`);
            const userSelectedPort = await nativeSerial().requestPermission();
            if (userSelectedPort?.devices?.length === 0) {
                console.log(`${logHead} No device selected or permission denied`);
                return null;
            }
            newPermissionPort = this.handleDeviceAttached(userSelectedPort.devices[0]);
            console.log(`${logHead} Permission granted for ${newPermissionPort?.path}`);
        } catch (error) {
            console.error(`${logHead} Error requesting permission:`, error);
            return null;
        }
        return newPermissionPort;
    }

    async getDevices(): Promise<CapacitorSerialPort[]> {
        await this.loadDevices();
        return this.ports;
    }

    async connect(path: string, options?: SerialConnectOptions): Promise<boolean> {
        const baudRate = options?.baudRate ?? 115200;
        // Prevent double connections
        if (this.connected) {
            console.log(`${logHead} Already connected, not connecting again`);
            return true;
        }

        this.openRequested = true;

        try {
            await this._listening;

            const device = this.ports.find((port) => port.path === path);
            if (!device) {
                console.error(`${logHead} Device not found:`, path);
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }

            // Use the native deviceId directly from the device object
            // The deviceId from usb-serial-for-android is in format "vendorId:productId:deviceNum"
            const deviceId = device.device.deviceId;

            console.log(`${logHead} Connecting to device:`, deviceId, "at", baudRate, "baud");

            const result = await nativeSerial().connect({
                deviceId: deviceId,
                baudRate: baudRate,
            });

            if (result.success) {
                this.connected = true;
                this.connectionId = path;
                this.bitrate = baudRate;
                this.bytesReceived = 0;
                this.bytesSent = 0;
                this.openRequested = false;
                this.currentDevice = device;

                console.log(`${logHead} Connection opened with ID: ${this.connectionId}, Baud: ${baudRate}`);

                this.connectionInfo = {
                    usbVendorId: device.vendorId,
                    usbProductId: device.productId,
                };

                this.dispatchEvent(
                    new CustomEvent<CapacitorSerialConnectionInfo | false>("connect", { detail: this.connectionInfo }),
                );
                return true;
            } else {
                this.openRequested = false;
                console.error(`${logHead} Failed to connect:`, result.error);
                this.dispatchEvent(new CustomEvent("connect", { detail: false }));
                return false;
            }
        } catch (error) {
            console.error(`${logHead} Error connecting:`, error);
            this.openRequested = false;
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }
    }

    cleanupConnectionState(): void {
        // Clean up connection state (shared between disconnect and device removal)
        this.connected = false;
        this.transmitting = false;
        this.connectionId = null;
        this.bitrate = 0;
        this.connectionInfo = null;
        this.currentDevice = null;
        this.bytesSent = 0;
        this.bytesReceived = 0;
    }

    async disconnect(): Promise<boolean> {
        if (!this.connected) {
            return true;
        }

        try {
            await nativeSerial().disconnect();

            console.log(
                `${logHead} Connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`,
            );

            this.cleanupConnectionState();
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            return true;
        } catch (error) {
            console.error(`${logHead} Error disconnecting:`, error);
            this.cleanupConnectionState();
            this.dispatchEvent(new CustomEvent("disconnect", { detail: false }));
            return false;
        }
    }

    async send(
        data: ArrayBuffer | ArrayLike<number>,
        callback?: (result: CapacitorSerialSendResult) => void,
    ): Promise<CapacitorSerialSendResult> {
        if (!this.connected) {
            console.error(`${logHead} Failed to send data, not connected`);
            if (callback) {
                callback({ bytesSent: 0 });
            }
            return { bytesSent: 0 };
        }

        const bytes = new Uint8Array(data);

        try {
            // Convert Uint8Array to hex string
            const hexString = uint8ArrayToHexString(bytes);
            const result = await nativeSerial().write({ data: hexString });

            this.bytesSent += result.bytesSent;

            if (callback) {
                callback({ bytesSent: result.bytesSent });
            }
            return { bytesSent: result.bytesSent };
        } catch (error) {
            console.error(`${logHead} Error sending data:`, error);
            if (callback) {
                callback({ bytesSent: 0 });
            }
            return { bytesSent: 0 };
        }
    }

    getConnectedDevice(): CapacitorSerialPort | null {
        return this.currentDevice;
    }
}

export default CapacitorSerial;
