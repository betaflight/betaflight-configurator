import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { i18n } from "../localization";
import { gui_log } from "../gui_log";
import { bluetoothDevices } from "./devices";
import { androidScanNeedsLocation } from "../utils/checkCompatibility";

/**
 * Native BLE transport for the Tauri shells whose webview has no Web Bluetooth:
 * iOS and macOS (WKWebView) and Android (System WebView).
 *
 * Drives the Rust `ble_*` commands and receives notification bytes via the
 * `ble-data` / `ble-disconnected` events. Presents the same EventTarget interface
 * as `WebBluetooth`, so serial.js and serial_backend treat it identically.
 */
class TauriBle extends EventTarget {
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

    handleReceiveBytes(info) {
        this.bytesReceived += info.detail.byteLength;
    }

    handleDisconnect() {
        this.disconnect();
    }

    // Mirrors WebBluetooth/CapacitorBle: a stable `bluetooth_`-prefixed path keeps
    // serial.js selectProtocol routing to the BLE slot, and the id (a CoreBluetooth
    // UUID on Apple, a MAC address on Android) is stable across scans so a pinned
    // path re-resolves to the same device.
    createPort(device) {
        return {
            path: `bluetooth_${device.id}`,
            displayName: device.name || device.id,
            vendorId: "unknown",
            productId: device.id,
            port: device,
        };
    }

    getConnectedDevice() {
        return this._connectedDevice;
    }

    isBT11CorruptionPattern(expectedChecksum) {
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

    shouldBypassCrc(expectedChecksum) {
        if (this.isBT11CorruptionPattern(expectedChecksum)) {
            if (!this.bt11_crc_corruption_logged) {
                console.log(`${this.logHead} Detected BT-11/CC2541 CRC corruption (0xff), skipping CRC check`);
                this.bt11_crc_corruption_logged = true;
            }
            return true;
        }
        return false;
    }

    // A BLE scan doubles as the permission gate: it raises the iOS Bluetooth prompt on
    // first CoreBluetooth use, and the runtime scan/connect permission request on
    // Android. The picker renders whatever this returns.
    // The Rust side asks for the Bluetooth permissions, but the plugin only requests
    // location when told to scan for iBeacons, and its Rust wrapper never passes that
    // through. Older Android needs location regardless, so ask the plugin directly.
    async _requestScanLocationPermission() {
        try {
            await invoke("plugin:blec|check_permissions", { askIfDenied: true, allowIbeacons: true });
        } catch (e) {
            // Fall through and scan anyway: the permission may already be granted.
            console.error(`${this.logHead} Location permission request failed: ${e}`);
        }
    }

    async getDevices() {
        try {
            if (await androidScanNeedsLocation()) {
                await this._requestScanLocationPermission();
            }
            const found = await invoke("ble_scan");
            this.devices = found.map((device) => this.createPort(device));
        } catch (e) {
            console.error(`${this.logHead} Scan failed: ${e}`);
        }
        return this.devices;
    }

    // No OS device chooser on iOS — a scan surfaces the permission prompt and refreshes
    // the list. Return the first hit to mirror CapacitorBle's shape.
    async requestPermissionDevice() {
        const devices = await this.getDevices();
        return devices?.[0] ?? null;
    }

    async _teardownListeners() {
        for (const unlisten of this._unlisten) {
            try {
                await unlisten();
            } catch (e) {
                console.error(`${this.logHead} Failed to remove listener: ${e}`);
            }
        }
        this._unlisten = [];
    }

    async connect(path, _options) {
        try {
            const device = this.devices.find((d) => d.path === path);
            const id = device ? device.port.id : path.replace(/^bluetooth_/, "");

            // Drop listeners left over from a previous connection before re-registering,
            // otherwise reconnects leak listeners and duplicate receive/disconnect handling.
            await this._teardownListeners();

            const dataUnlisten = await listen("ble-data", (event) => {
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

            const result = await invoke("ble_connect", { id, devices: descriptors });

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

    _portInfo(id) {
        return { path: `bluetooth_${id}`, displayName: id, vendorId: "unknown", productId: id, port: { id } };
    }

    async disconnect() {
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

    async send(data, cb) {
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
