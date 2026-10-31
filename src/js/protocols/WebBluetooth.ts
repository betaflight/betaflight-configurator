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

import { i18n } from "../localization";
import { gui_log } from "../gui_log";
import { bluetoothDevices, type BluetoothDeviceProfile } from "./devices";
import type { SerialConnectOptions, SerialPayload } from "../serial";

/** The W3C `BluetoothRemoteGATTCharacteristic`, as far as this transport uses it. */
interface BleCharacteristic extends EventTarget {
    readonly uuid: string;
    readonly properties: { readonly notify: boolean };
    /** The last value read or notified; unset before the first. */
    readonly value?: DataView;
    writeValue(value: Uint8Array<ArrayBuffer>): Promise<void>;
    startNotifications(): Promise<unknown>;
    stopNotifications(): Promise<unknown>;
}

/** The W3C `BluetoothRemoteGATTService`, as far as this transport uses it. */
interface BleService {
    readonly uuid: string;
    getCharacteristics(): Promise<BleCharacteristic[]>;
}

/** The W3C `BluetoothRemoteGATTServer`, as far as this transport uses it. */
interface BleServer {
    getPrimaryServices(): Promise<BleService[]>;
}

/** The W3C `BluetoothDevice`, as far as this transport uses it. */
export interface BleDevice extends EventTarget {
    /** The browser's persistent identifier for the device. */
    readonly id: string;
    /** Absent when the device advertises no name. */
    readonly name?: string;
    readonly gatt?: {
        readonly connected: boolean;
        connect(): Promise<BleServer>;
        disconnect(): void;
    };
}

/** `navigator.bluetooth`. Its connect and disconnect events have the device as their target. */
interface BluetoothApi extends EventTarget {
    getAvailability(): Promise<boolean>;
    requestDevice(options: { acceptAllDevices: boolean; optionalServices: string[] }): Promise<BleDevice>;
}

/** A device as this transport lists it. Bluetooth has no USB vendor id, so it reads "unknown". */
export interface WebBluetoothPort {
    path: string;
    displayName: string;
    vendorId: "unknown";
    productId: string;
    port: BleDevice;
}

type SendCallback = (result: { error: unknown; bytesSent: number }) => void;

/** Largest single write to a BLE-UART characteristic: ATT_MTU 23 minus the 3-byte header. */
const BLE_WRITE_CHUNK_BYTES = 20;

export interface WebBluetoothSendResult {
    bytesSent: number;
}

/*  Certain flags needs to be enabled in the browser to use BT
 *
 *  app.commandLine.appendSwitch('enable-web-bluetooth', "true");
 *  app.commandLine.appendSwitch('disable-hid-blocklist')
 *  app.commandLine.appendSwitch('enable-experimental-web-platform-features');
 *
 */

class WebBluetooth extends EventTarget {
    connected: boolean;
    openRequested: boolean;
    openCanceled: boolean;
    closeRequested: boolean;
    transmitting: boolean;
    // Never written by this transport; kept for parity with the other protocols.
    connectionInfo: null;
    lastWrite: null;
    bitrate: number | undefined;
    bytesSent: number;
    bytesReceived: number;
    failed: number;
    devices: WebBluetoothPort[];
    device: BleDevice | null;
    _teardown: Promise<boolean> | null;
    logHead: string;
    bluetooth: BluetoothApi | undefined;
    bt11_crc_corruption_logged: boolean;
    /** Unset until the first connect; a teardown resets it to false, not null. */
    connectionId?: string | false;
    /** Serialises writes; send() chains each write onto it. */
    writeQueue: Promise<void> = Promise.resolve();
    server: BleServer | undefined;
    services: BleService[] | undefined;
    service: BleService | undefined;
    deviceDescription: BluetoothDeviceProfile | null | undefined;
    writeCharacteristic: BleCharacteristic | null;
    readCharacteristic: BleCharacteristic | null;
    available?: boolean;

    constructor() {
        super();

        this.connected = false;
        this.openRequested = false;
        this.openCanceled = false;
        this.closeRequested = false;
        this.transmitting = false;
        this.connectionInfo = null;
        this.lastWrite = null;

        this.bitrate = 0;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.failed = 0;

        this.devices = [];
        this.device = null;
        // Resolved (never-rejecting) promise of an in-flight disconnect teardown;
        // connect() awaits it so open and close can never interleave.
        this._teardown = null;

        this.logHead = "[BLUETOOTH]";

        this.bluetooth = (navigator as (Navigator & { bluetooth?: BluetoothApi }) | undefined)?.bluetooth;

        this.writeCharacteristic = null;
        this.readCharacteristic = null;

        this.bt11_crc_corruption_logged = false;

        if (!this.bluetooth) {
            console.error(`${this.logHead} Web Bluetooth API not supported`);
            return;
        }

        this.connect = this.connect.bind(this);
        // Bind the device/characteristic event handlers ONCE so add/removeEventListener
        // share one reference. A fresh `.bind(this)` at each call site produces a new
        // function every time, so removeEventListener never matches and a gattserver-
        // disconnected/disconnect/notification listener leaks on every reconnect.
        this.handleDisconnect = this.handleDisconnect.bind(this);
        this.handleNotification = this.handleNotification.bind(this);

        this.bluetooth.addEventListener("connect", (e) => this.handleNewDevice(e.target as BleDevice));
        this.bluetooth.addEventListener("disconnect", (e) => this.handleRemovedDevice(e.target as BleDevice));
        this.bluetooth.addEventListener("gattserverdisconnected", (e) =>
            this.handleRemovedDevice(e.target as BleDevice),
        );

        this._bootstrap();
    }

    // Kept out of the constructor body, which must not start async work (Sonar S7059).
    private _bootstrap(): void {
        // loadDevices() catches and logs its own failures.
        void this.loadDevices();
    }

    handleNewDevice(device: BleDevice): WebBluetoothPort {
        const added = this.createPort(device);
        this.devices.push(added);
        this.dispatchEvent(new CustomEvent<WebBluetoothPort>("addedDevice", { detail: added }));

        return added;
    }

    handleRemovedDevice(device: BleDevice): void {
        const removed = this.devices.find((port) => port.port === device);

        // The list does not hold this device. Both `disconnect` and `gattserverdisconnected`
        // can report the same device, so the second event finds nothing. There is no device to
        // report.
        if (!removed) {
            return;
        }

        this.devices = this.devices.filter((port) => port.port !== device);
        this.dispatchEvent(new CustomEvent<WebBluetoothPort>("removedDevice", { detail: removed }));
    }

    // Added as a listener unbound: an EventTarget calls it with `this` set to the target.
    handleReceiveBytes(info: { detail: { byteLength: number } }): void {
        this.bytesReceived += info.detail.byteLength;
    }

    // Unsolicited disconnect (the device's gattserverdisconnected/disconnect event). Tear the
    // connection down so serial_backend returns to the landing tab. The guard skips the
    // re-entrant event our own gatt.disconnect() triggers. The device is intentionally NOT
    // removed from the list — BLE links drop transiently (reboot/boot bounce) and the paired
    // device can be reconnected by path, so removing it would only force needless re-discovery.
    handleDisconnect(): void {
        if (this.closeRequested) {
            return;
        }
        console.warn(`${this.logHead} Unsolicited GATT disconnect (device dropped the link) — tearing down`);
        void this.disconnect();
    }

    getConnectedDevice(): BleDevice | null {
        return this.device;
    }

    // Derive a stable path from the Web Bluetooth device.id. That id is the
    // browser's persistent per-device identifier, so the SAME device always
    // yields the SAME path across loadDevices()/refreshes — surviving an FC
    // reboot that rebuilds the device list. A bare counter (the old behaviour)
    // was an ordinal reassigned/reset on every rebuild, so a pinned path could
    // silently re-map to a different device. Mirrors CapacitorBle's
    // `bluetooth-${address}`; the `bluetooth` prefix keeps serial.js
    // selectProtocol routing to the BLE protocol.
    createPort(device: BleDevice): WebBluetoothPort {
        return {
            path: `bluetooth_${device.id}`,
            // A device may advertise no name. Fall back to its id, as CapacitorBle falls back to
            // the address, so the picker shows something and device_handler can match on it.
            displayName: device.name || device.id,
            vendorId: "unknown",
            productId: device.id,
            port: device,
        };
    }

    isBT11CorruptionPattern(expectedChecksum: number, computedChecksum: number): boolean {
        if (expectedChecksum !== 0xff || computedChecksum === 0xff) {
            return false;
        }

        if (!this.connected) {
            return false;
        }

        const deviceDescription = this.deviceDescription;
        if (!deviceDescription) {
            return false;
        }

        return deviceDescription?.susceptibleToCrcCorruption ?? false;
    }

    shouldBypassCrc(expectedChecksum: number, computedChecksum: number): boolean {
        // Special handling for specific BT-11/CC2541 checksum corruption
        // Only apply workaround for known problematic devices
        const isBT11Device = this.isBT11CorruptionPattern(expectedChecksum, computedChecksum);
        if (isBT11Device) {
            if (!this.bt11_crc_corruption_logged) {
                console.log(`${this.logHead} Detected BT-11/CC2541 CRC corruption (0xff), skipping CRC check`);
                this.bt11_crc_corruption_logged = true;
            }
            return true;
        }
        return false;
    }

    async loadDevices(): Promise<void> {
        try {
            const ports = await this.getDevices();

            // getDevices() returns the already-built port wrappers, so rebuild from
            // each wrapper's underlying Web Bluetooth device (port.port). Because the
            // path is derived from device.id, re-running loadDevices() is idempotent:
            // the same device keeps the same path across refreshes.
            this.devices = ports.map((wrapper) => this.createPort(wrapper.port));
        } catch (error) {
            console.error(`${this.logHead} Failed to load devices:`, error);
        }
    }

    async requestPermissionDevice(): Promise<WebBluetoothPort | null | undefined> {
        let newPermissionPort: WebBluetoothPort | null | undefined = null;

        const uuids: string[] = [];
        bluetoothDevices.forEach((device) => {
            uuids.push(device.serviceUuid);
        });

        const options = { acceptAllDevices: true, optionalServices: uuids };

        try {
            // Without Web Bluetooth this throws, and the catch below reports it.
            const userSelectedPort = await this.bluetooth!.requestDevice(options);
            newPermissionPort = this.devices.find((port) => port.port === userSelectedPort);
            newPermissionPort ??= this.handleNewDevice(userSelectedPort);
            console.info(`${this.logHead} User selected Bluetooth device from permissions:`, newPermissionPort.path);
        } catch (error) {
            console.error(`${this.logHead} User didn't select any Bluetooth device when requesting permission:`, error);
        }
        return newPermissionPort;
    }

    async getDevices(): Promise<WebBluetoothPort[]> /* NOSONAR: implements the async SerialProtocol interface */ {
        return this.devices;
    }

    getAvailability(): void {
        void this.bluetooth!.getAvailability().then((available) => {
            console.log(`${this.logHead} Bluetooth available:`, available);
            this.available = available;
            return available;
        });
    }

    async connect(path: string, options: SerialConnectOptions): Promise<void> {
        // Serialize behind an in-flight teardown: a connect started mid-teardown would
        // reset closeRequested under it and have its device/characteristics torn down
        // by the resumed cleanup. The teardown promise never rejects.
        if (this._teardown) {
            await this._teardown;
            this._teardown = null;
        }

        this.openRequested = true;
        this.closeRequested = false;

        // An unknown path throws here, and serial.connect() logs the rejection.
        this.device = this.devices.find((device) => device.path === path)!.port;

        console.log(`${this.logHead} Opening connection with ID: ${path}, Baud: ${options.baudRate}`);

        this.device.addEventListener("gattserverdisconnected", this.handleDisconnect);

        let setupComplete = false;
        try {
            console.log(`${this.logHead} Connecting to GATT Server`);

            await this.gattConnect();

            gui_log(i18n.getMessage("bluetoothConnected", [this.device.name ?? ""]));

            await this.getServices();
            await this.getCharacteristics();
            await this.startNotifications();
            setupComplete = true;
        } catch (error) {
            console.error(`${this.logHead} Connection setup failed:`, error);
            gui_log(i18n.getMessage("bluetoothConnectionError", [String(error)]));
        }

        // gatt can report connected while setup threw and left no usable characteristics,
        // so require setup to have completed. Optional-chained: an unsolicited disconnect
        // during setup nulls this.device.
        const connectionInfo = setupComplete && this.device?.gatt?.connected;

        if (connectionInfo && !this.openCanceled) {
            this.connected = true;
            this.connectionId = path;
            this.bitrate = options.baudRate;
            this.bytesReceived = 0;
            this.bytesSent = 0;
            this.failed = 0;
            this.openRequested = false;

            this.device!.addEventListener("disconnect", this.handleDisconnect);
            this.addEventListener("receive", this.handleReceiveBytes as unknown as EventListener);

            console.log(`${this.logHead} Connection opened with ID: ${this.connectionId}, Baud: ${options.baudRate}`);

            this.dispatchEvent(new CustomEvent<boolean>("connect", { detail: connectionInfo }));
        } else if (connectionInfo && this.openCanceled) {
            this.connectionId = path;

            console.log(`${this.logHead} Connection opened with ID: ${path}, but request was canceled, disconnecting`);
            // some bluetooth dongles/dongle drivers really doesn't like to be closed instantly, adding a small delay
            setTimeout(() => {
                this.openRequested = false;
                this.openCanceled = false;
                // disconnect() takes no callback, so this used to pass one that never ran and the
                // cancelled open never reported its result. Report it directly, as WebSerial does.
                void this.disconnect();
                this.dispatchEvent(new CustomEvent<boolean>("connect", { detail: false }));
            }, 150);
        } else if (this.openCanceled) {
            console.log(`${this.logHead} Connection didn't open and request was canceled`);
            this.openRequested = false;
            this.openCanceled = false;
            this.dispatchEvent(new CustomEvent<boolean>("connect", { detail: false }));
        } else {
            this.openRequested = false;
            console.log(`${this.logHead} Failed to open bluetooth port`);
            this.dispatchEvent(new CustomEvent<boolean>("connect", { detail: false }));
        }
    }

    async gattConnect(): Promise<void> {
        this.server = await this.device!.gatt?.connect();
    }

    async getServices(): Promise<BleService | undefined> {
        console.log(`${this.logHead} Get primary services`);

        // No server (a device without GATT) throws here, and connect() logs it as a failed setup.
        this.services = await this.server!.getPrimaryServices();

        this.service = this.services.find((service) => {
            this.deviceDescription = bluetoothDevices.find((device) => device.serviceUuid === service.uuid);
            return this.deviceDescription;
        });

        if (!this.deviceDescription) {
            throw new Error("Unsupported device");
        }

        gui_log(i18n.getMessage("bluetoothConnectionType", [this.deviceDescription.name]));

        console.log(`${this.logHead} Connected to service:`, this.service!.uuid);

        return this.service;
    }

    async getCharacteristics(): Promise<void> {
        // getServices() ran first and threw unless it found a service and its description.
        const description = this.deviceDescription!;
        const characteristics = await this.service!.getCharacteristics();

        for (const characteristic of characteristics) {
            if (characteristic.uuid === description.writeCharacteristic) {
                this.writeCharacteristic = characteristic;
            }

            if (characteristic.uuid === description.readCharacteristic) {
                this.readCharacteristic = characteristic;
            }
        }

        // The expected UUID used to go in Error's second argument, which takes an options
        // object, so it never reached the message.
        if (!this.writeCharacteristic) {
            throw new Error(`Unexpected write characteristic found - should be ${description.writeCharacteristic}`);
        }

        // Many CC2541 modules (HM-10 firmware, MLT-BT05, T-Motor's TMFC) share the FFE0 service with
        // the CC2541 profile but carry both directions on FFE1 and have no FFE2.
        if (!this.readCharacteristic && this.writeCharacteristic.properties?.notify) {
            this.readCharacteristic = this.writeCharacteristic;
        }

        if (!this.readCharacteristic) {
            throw new Error(`Unexpected read characteristic found - should be ${description.readCharacteristic}`);
        }

        this.readCharacteristic.addEventListener("characteristicvaluechanged", this.handleNotification);
    }

    handleNotification(event: Event): void {
        // Create a proper Uint8Array directly from the DataView buffer
        const dataView = (event.target as BleCharacteristic).value!;
        const buffer = new Uint8Array(
            dataView.buffer.slice(dataView.byteOffset, dataView.byteOffset + dataView.byteLength),
        );

        // Dispatch immediately instead of using setTimeout to avoid race conditions
        this.dispatchEvent(new CustomEvent<Uint8Array>("receive", { detail: buffer }));
    }

    startNotifications(): Promise<unknown> {
        if (!this.readCharacteristic) {
            throw new Error("No read characteristic");
        }

        if (!this.readCharacteristic.properties.notify) {
            throw new Error("Read characteristic unable to notify.");
        }

        return this.readCharacteristic.startNotifications();
    }

    async disconnect(): Promise<boolean> {
        // If a GATT connect is still in flight, signal cancellation so the
        // connect() coroutine tears down on completion instead of resurrecting a
        // closed session with a late `connect` event (mirrors TauriSerial). Do
        // this before any state mutation.
        if (this.openRequested && !this.connected) {
            console.log(`${this.logHead} Disconnect requested while a connect is in flight — cancelling the open`);
            this.openCanceled = true;
            // Cancellation was accepted — report success (mirrors TauriSerial), else
            // Serial.disconnect() coerces the undefined return to false.
            return true;
        }

        this.connected = false;
        this.transmitting = false;
        this.bytesReceived = 0;
        this.bytesSent = 0;

        // if we are already closing, don't do it again — the in-progress teardown owns
        // the outcome; report success so Serial.disconnect() doesn't coerce to false.
        if (this.closeRequested) {
            return true;
        }
        // Mark closing now — before the gatt.disconnect() below — so the gattserverdisconnected
        // event it triggers is recognized by handleDisconnect as our own teardown, not an unplug.
        this.closeRequested = true;

        // Publish the teardown so connect() can serialize behind it.
        this._teardown = this._performTeardown();
        return this._teardown;
    }

    async _performTeardown(): Promise<boolean> {
        const doCleanup = async (): Promise<void> => {
            this.removeEventListener("receive", this.handleReceiveBytes as unknown as EventListener);

            if (this.device) {
                this.device.removeEventListener("disconnect", this.handleDisconnect);
                this.device.removeEventListener("gattserverdisconnected", this.handleDisconnect);

                // readCharacteristic may already be null from a prior teardown — guard
                // before calling, or null.removeEventListener throws and aborts cleanup.
                if (this.readCharacteristic) {
                    this.readCharacteristic.removeEventListener("characteristicvaluechanged", this.handleNotification);

                    // Stop notifications while the link is still up (an unplug/unsolicited
                    // drop skips this): Chrome keeps the notify session marked active, and
                    // on Linux/BlueZ the next connection's startNotifications() can then
                    // resolve without re-arming the CCCD — subscribed but never receiving.
                    if (this.device.gatt?.connected) {
                        try {
                            await this.readCharacteristic.stopNotifications();
                        } catch (error) {
                            console.warn(`${this.logHead} Failed to stop notifications during teardown:`, error);
                        }
                    }
                }

                if (this.device.gatt?.connected) {
                    this.device.gatt.disconnect();
                }

                this.writeCharacteristic = null;
                this.readCharacteristic = null;
                this.deviceDescription = null;
                this.device = null;
                this.bt11_crc_corruption_logged = false;
            }
        };

        try {
            await doCleanup();

            console.log(
                `${this.logHead} Connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`,
            );

            this.connectionId = false;
            this.bitrate = 0;
            this.dispatchEvent(new CustomEvent<boolean>("disconnect", { detail: true }));
            // Report success explicitly — WebSerial/TauriSerial/VirtualSerial all return
            // true, and Serial.disconnect() coerces an undefined return to false.
            return true;
        } catch (error) {
            console.error(error);
            console.error(
                `${this.logHead} Failed to close connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`,
            );
            this.dispatchEvent(new CustomEvent<boolean>("disconnect", { detail: false }));
            return false;
        } finally {
            if (this.openCanceled) {
                this.openCanceled = false;
            }
        }
    }

    async send(data: SerialPayload, cb?: SendCallback): Promise<WebBluetoothSendResult> {
        if (!this.writeCharacteristic || typeof this.writeCharacteristic.writeValue !== "function") {
            if (cb) {
                cb({
                    error: "No write characteristic available or characteristic is invalid",
                    bytesSent: 0,
                });
            }
            console.error(`${this.logHead} No write characteristic available or characteristic is invalid`);
            return { bytesSent: 0 };
        }
        if (!this.device?.gatt?.connected) {
            if (cb) {
                cb({
                    error: "GATT Server is disconnected. Cannot perform GATT operations.",
                    bytesSent: 0,
                });
            }
            console.error(`${this.logHead} GATT Server is disconnected. Cannot perform GATT operations.`);
            return { bytesSent: 0 };
        }

        // There is no writable stream in the bluetooth API
        const dataBuffer = new Uint8Array(data);

        let bytesSent = 0;

        // Serialize writes to prevent concurrent access
        this.writeQueue = this.writeQueue
            .then(async () => {
                try {
                    // Checked above; a teardown during an earlier queued write nulls it, and the
                    // TypeError that follows lands in the catch below, as before.
                    // BLE-UART bridges take at most one ATT payload (20 bytes at the default MTU)
                    // per write and silently truncate anything longer, so frames bigger than
                    // that go out in pieces; the bridge's UART just concatenates them.
                    for (let offset = 0; offset < dataBuffer.byteLength; offset += BLE_WRITE_CHUNK_BYTES) {
                        await this.writeCharacteristic!.writeValue(
                            dataBuffer.slice(offset, offset + BLE_WRITE_CHUNK_BYTES),
                        );
                    }
                    this.bytesSent += data.byteLength;
                    bytesSent = data.byteLength;

                    if (cb) {
                        cb({
                            error: null,
                            bytesSent: data.byteLength,
                        });
                    }
                } catch (e) {
                    console.error(`${this.logHead} Failed to send data:`, e);
                    if (cb) {
                        cb({
                            error: e,
                            bytesSent: 0,
                        });
                    }
                    throw e; // re-throw to keep the queue in a rejected state
                }
            })
            .catch(() => {
                // swallow here so queue chain continues on next write
            });

        await this.writeQueue;
        return { bytesSent };
    }
}

export default WebBluetooth;
