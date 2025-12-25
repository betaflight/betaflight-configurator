import { Capacitor } from "@capacitor/core";
import { bluetoothDevices } from "./devices";

const logHead = "[CAPACITORBLE]";
const plugin = Capacitor?.Plugins?.BetaflightBle;

const base64ToUint8Array = (b64) => {
    if (!b64) return new Uint8Array(0);
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

const uint8ArrayToBase64 = (bytes) => {
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

class CapacitorBle extends EventTarget {
    constructor() {
        super();

        if (!plugin) {
            console.warn(`${logHead} Native BetaflightBle plugin is not available`);
            return;
        }

        this.connected = false;
        this.connectionId = null;
        this.devices = [];
        this.bitrate = 115200;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.deviceDescription = null;

        plugin.addListener("dataReceived", (event) => {
            const data = base64ToUint8Array(event?.data);
            this.bytesReceived += data.byteLength;
            this.dispatchEvent(new CustomEvent("receive", { detail: data }));
        });

        plugin.addListener("disconnected", () => {
            this.connected = false;
            this.connectionId = null;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
        });
    }

    getConnectedPort() {
        return this.devices.find((d) => d.path === this.connectionId) || null;
    }

    async getDevices() {
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

    async requestPermissionDevice() {
        const devices = await this.getDevices();
        return devices[0] || null;
    }

    async connect(path, options) {
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

            this.dispatchEvent(new CustomEvent("connect", { detail: success }));
            return success;
        } catch (error) {
            console.error(`${logHead} Failed to connect`, error);
            this.connected = false;
            this.connectionId = null;
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }
    }

    async disconnect() {
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

    shouldBypassCrc(expectedChecksum) {
        const deviceDescription = this.deviceDescription;
        if (!deviceDescription) return false;

        const isBT11 = deviceDescription?.susceptibleToCrcCorruption ?? false;
        return isBT11 && expectedChecksum === 0xff;
    }

    async send(data, callback) {
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
