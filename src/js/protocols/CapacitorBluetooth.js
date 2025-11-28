import { i18n } from "../localization";
import { gui_log } from "../gui_log";
import { bluetoothDevices } from "./devices";
import { Capacitor } from "@capacitor/core";

const BetaflightBluetooth = Capacitor.Plugins.BetaflightBluetooth;

const logHead = "[CAPACITOR-BLUETOOTH]";

const toLowerUuid = (uuid) => uuid?.toLowerCase?.() ?? uuid;

const GATT_PROPERTIES = {
    READ: 0x02,
    WRITE_NO_RESPONSE: 0x04,
    WRITE: 0x08,
    NOTIFY: 0x10,
    INDICATE: 0x20,
};

const toUint8Array = (data) => {
    if (data instanceof Uint8Array) {
        return data;
    }
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    if (Array.isArray(data)) {
        return Uint8Array.from(data);
    }
    throw new TypeError("Unsupported data type for BLE write operation");
};

const toBase64 = (buffer) => {
    if (typeof Buffer !== "undefined") {
        return Buffer.from(buffer).toString("base64");
    }
    let binary = "";
    for (let idx = 0; idx < buffer.length; idx += 1) {
        binary += String.fromCharCode(buffer[idx]);
    }
    return btoa(binary);
};

const fromBase64 = (value) => {
    if (!value) {
        return null;
    }
    if (typeof Buffer !== "undefined") {
        return Uint8Array.from(Buffer.from(value, "base64"));
    }
    const binary = atob(value);
    const buffer = new Uint8Array(binary.length);
    for (let idx = 0; idx < binary.length; idx += 1) {
        buffer[idx] = binary.charCodeAt(idx);
    }
    return buffer;
};

class CapacitorBluetooth extends EventTarget {
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
        this.message_checksum = 0;

        this.devices = [];
        this.device = null;

        this.logHead = logHead;

        this.bt11_crc_corruption_logged = false;

        this.writeQueue = Promise.resolve();
        this.bleInitialized = false;
        this.notificationActive = false;
        this.disconnectHandled = true;
        this.nativeListeners = [];
        this.nativeListenersReady = false;
        this.discoveredServices = new Map();
        this.pendingServiceResolvers = new Map();
        this.serviceResolutionTimeoutMs = 8000;

        this.handleNotification = this.handleNotification.bind(this);
        this.handleRemoteDisconnect = this.handleRemoteDisconnect.bind(this);

        this.attachNativeListeners();
    }

    handleNewDevice(devicePayload) {
        const resolvedDevice = devicePayload?.device ?? devicePayload;
        if (!resolvedDevice?.deviceId) {
            console.warn(`${this.logHead} Ignoring device without an ID`, devicePayload);
            return null;
        }

        const existing = this.devices.find((dev) => dev.device?.deviceId === resolvedDevice.deviceId);
        if (existing) {
            existing.device = resolvedDevice;
            return existing;
        }

        const added = this.createPort(resolvedDevice);
        this.devices.push(added);
        this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));
        return added;
    }

    handleRemovedDevice(deviceId) {
        const removed = this.devices.find((device) => device.device?.deviceId === deviceId);
        if (!removed) {
            return;
        }
        this.devices = this.devices.filter((device) => device.device?.deviceId !== deviceId);
        this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
    }

    getConnectedPort() {
        return this.device;
    }

    createPort(device) {
        return {
            path: "bluetooth",
            displayName: device.name,
            vendorId: "unknown",
            productId: device.deviceId,
            device: device,
        };
    }

    isBT11CorruptionPattern(expectedChecksum) {
        if (expectedChecksum !== 0xff || this.message_checksum === 0xff) {
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

    shouldBypassCrc(expectedChecksum) {
        // Special handling for specific BT-11/CC2541 checksum corruption
        // Only apply workaround for known problematic devices
        const isBT11Device = this.isBT11CorruptionPattern(expectedChecksum);
        if (isBT11Device) {
            if (!this.bt11_crc_corruption_logged) {
                console.log(`${this.logHead} Detected BT-11/CC2541 CRC corruption (0xff), skipping CRC check`);
                this.bt11_crc_corruption_logged = true;
            }
            return true;
        }
        return false;
    }

    async requestPermissionDevice() {
        let newPermissionDevice = null;
        const uuids = bluetoothDevices.map((device) => device.serviceUuid).filter(Boolean);

        try {
            await BetaflightBluetooth.requestPermissions(); // prompt once
        } catch (err) {
            console.error(`${logHead} Permission request failed`, err);
            gui_log(i18n.getMessage("bluetoothConnectionError", ["Permissions denied"]));
            return null;
        }

        try {
            // Update bluetoothDevices with the actual service UUID your hardware uses
            // (capture it with nRF Connect or the PWA’s device.uuids), then restore the filtered scan.

            // const options = {
            //     services: [...new Set(uuids)],
            //     optionalServices: uuids,
            //     acceptAllDevices: uuids.length === 0,
            // };
            const options = {};
            const userSelectedDevice = await BetaflightBluetooth.requestDevice(options);
            console.log(`${logHead} User selected Bluetooth device:`, userSelectedDevice);
            newPermissionDevice = this.handleNewDevice(userSelectedDevice);
            console.info(`${logHead} User selected Bluetooth device from permissions:`, newPermissionDevice.path);
        } catch (error) {
            console.error(`${logHead} User didn't select any Bluetooth device when requesting permission:`, error);
        }
        return newPermissionDevice;
    }

    async getDevices() {
        return this.devices;
    }

    async connect(path, options = {}) {
        this.openRequested = true;
        this.closeRequested = false;
        const requestedDevice = this.devices.find((device) => device.path === path);

        if (!requestedDevice) {
            console.error(`${logHead} Requested device ${path} not found`);
            this.openRequested = false;
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            return false;
        }

        this.device = requestedDevice;
        this.logHead = logHead;

        const deviceDescription = this.resolveDeviceDescription(requestedDevice.device) ?? null;
        if (!deviceDescription) {
            console.warn(
                `${logHead} No static profile for device ${requestedDevice.device?.name ?? requestedDevice.path}`,
            );
        }

        this.deviceDescription = deviceDescription;

        try {
            console.log(`${logHead} Connecting to device ${requestedDevice}`);

            console.log(`${logHead} Device Description:`, deviceDescription);
            console.log(`${logHead} Options:`, options);
            console.log(`${logHead} Device ID:`, requestedDevice.device.deviceId);

            await BetaflightBluetooth.connect({ deviceId: requestedDevice.device.deviceId }, (deviceId) => {
                void this.handleRemoteDisconnect(deviceId);
            });

            const effectiveDescription = await this.waitForDeviceCharacteristics(
                requestedDevice.device.deviceId,
                deviceDescription,
            );

            if (!this.hasCompleteCharacteristics(effectiveDescription)) {
                throw new Error("Unable to determine BLE service and characteristics for device");
            }

            this.deviceDescription = effectiveDescription;

            gui_log(i18n.getMessage("bluetoothConnected", [requestedDevice.device.name]));
            await this.startNotifications();

            this.connected = true;
            this.connectionId = path;
            const baudRate = options?.baudRate ?? 115200;
            this.bitrate = baudRate;
            this.bytesReceived = 0;
            this.bytesSent = 0;
            this.failed = 0;
            this.connectionInfo = { deviceId: requestedDevice.device.deviceId };
            this.openRequested = false;
            this.disconnectHandled = false;

            console.log(`${logHead} Connection opened with ID: ${this.connectionId}, Baud: ${baudRate}`);

            this.dispatchEvent(new CustomEvent("connect", { detail: this.connectionInfo }));
            return true;
        } catch (error) {
            console.error(`${logHead} Failed to open bluetooth device`, error);
            gui_log(i18n.getMessage("bluetoothConnectionError", [error]));
            this.openRequested = false;
            this.dispatchEvent(new CustomEvent("connect", { detail: false }));
            this.cleanupConnectionState(requestedDevice.device?.deviceId ?? null);
            return false;
        }
    }

    resolveDeviceDescription(device) {
        console.log(`${logHead} Resolving device description for device:`, device);
        const uuids = device?.uuids?.map((uuid) => toLowerUuid(uuid)) ?? [];
        console.log(`${logHead} Device UUIDs:`, uuids);
        let description = bluetoothDevices.find((candidate) => uuids.includes(toLowerUuid(candidate.serviceUuid)));

        if (!description && device?.name) {
            description = bluetoothDevices.find(
                (candidate) => candidate.name?.toLowerCase() === device.name.toLowerCase(),
            );
        }
        console.log(`${logHead} Resolved device description:`, description);
        return description;
    }

    handleNotification(value) {
        let buffer = value;
        if (!(buffer instanceof Uint8Array) && value?.buffer) {
            buffer = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
        }
        if (!(buffer instanceof Uint8Array)) {
            return;
        }
        this.bytesReceived += buffer.length;
        this.dispatchEvent(new CustomEvent("receive", { detail: buffer }));
    }

    async startNotifications() {
        if (!this.deviceDescription || !this.device) {
            throw new Error("Cannot start notifications without an active device");
        }

        if (this.notificationActive) {
            return;
        }

        await BetaflightBluetooth.startNotifications({
            deviceId: this.device.device.deviceId,
            service: this.deviceDescription.serviceUuid,
            characteristic: this.deviceDescription.readCharacteristic,
        });

        this.notificationActive = true;
    }

    async stopNotifications() {
        if (!this.notificationActive || !this.deviceDescription || !this.device) {
            return;
        }

        try {
            await BetaflightBluetooth.stopNotifications({
                deviceId: this.device.device.deviceId,
                service: this.deviceDescription.serviceUuid,
                characteristic: this.deviceDescription.readCharacteristic,
            });
        } catch (error) {
            console.warn(`${logHead} Failed to stop notifications`, error);
        } finally {
            this.notificationActive = false;
        }
    }

    async disconnect() {
        if (this.closeRequested) {
            return true;
        }

        this.closeRequested = true;

        const targetDeviceId = this.device?.device?.deviceId ?? this.connectionId ?? null;

        try {
            await this.stopNotifications();

            if (this.device?.device?.deviceId) {
                try {
                    await BetaflightBluetooth.disconnect(this.device.device.deviceId);
                } catch (error) {
                    console.warn(`${logHead} Disconnect call failed`, error);
                }
            }

            await this.handleRemoteDisconnect(targetDeviceId, true);
            return true;
        } catch (error) {
            console.error(`${logHead} Failed to close connection with ID: ${this.connectionId}`, error);
            await this.handleRemoteDisconnect(targetDeviceId, true);
            return false;
        } finally {
            this.closeRequested = false;
            if (this.openCanceled) {
                this.openCanceled = false;
            }
        }
    }

    async send(data, cb) {
        if (!this.connected || !this.deviceDescription || !this.device) {
            if (cb) {
                cb({
                    error: "No write characteristic available or device is disconnected",
                    bytesSent: 0,
                });
            }
            console.error(`${logHead} No write characteristic available or device is disconnected`);
            return { bytesSent: 0, error: "disconnected" };
        }

        const dataBuffer = toUint8Array(data);
        const payloadSize = dataBuffer.byteLength;
        const base64Value = toBase64(dataBuffer);

        const writeTask = this.writeQueue.then(async () => {
            await BetaflightBluetooth.write({
                deviceId: this.device.device.deviceId,
                service: this.deviceDescription.serviceUuid,
                characteristic: this.deviceDescription.writeCharacteristic,
                value: base64Value,
                encoding: "base64",
            });
            this.bytesSent += payloadSize;
        });

        this.writeQueue = writeTask.catch(() => {});

        try {
            await writeTask;
            const result = { bytesSent: payloadSize };
            cb?.({ error: null, bytesSent: payloadSize });
            return result;
        } catch (error) {
            console.error(`${logHead} Failed to send data:`, error);
            cb?.({ error, bytesSent: 0 });
            return { error, bytesSent: 0 };
        }
    }

    async handleRemoteDisconnect(deviceId, forced = false) {
        if (this.disconnectHandled && !forced) {
            return;
        }

        this.disconnectHandled = true;
        const activeDeviceId = deviceId ?? this.device?.device?.deviceId ?? null;

        console.warn(`${logHead} Device ${activeDeviceId ?? "unknown"} disconnected`);
        await this.stopNotifications();
        console.log(
            `${logHead} Connection with ID: ${this.connectionId} closed, Sent: ${this.bytesSent} bytes, Received: ${this.bytesReceived} bytes`,
        );
        this.cleanupConnectionState(activeDeviceId);
        this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
    }

    cleanupConnectionState(deviceId = null) {
        this.connected = false;
        this.connectionId = null;
        this.bitrate = 0;
        this.device = null;
        this.deviceDescription = null;
        this.notificationActive = false;
        this.writeCharacteristic = null;
        this.readCharacteristic = null;
        this.connectionInfo = null;
        this.bt11_crc_corruption_logged = false;
        this.writeQueue = Promise.resolve();
        this.transmitting = false;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.openRequested = false;
        this.closeRequested = false;
        this.disconnectHandled = true;
        if (deviceId) {
            this.clearPendingServiceResolver(deviceId);
        }
    }

    hasCompleteCharacteristics(description) {
        return Boolean(description?.serviceUuid && description?.writeCharacteristic && description?.readCharacteristic);
    }

    async waitForDeviceCharacteristics(deviceId, fallbackDescription) {
        if (!deviceId) {
            return fallbackDescription ?? null;
        }

        const cached = this.getCachedDeviceDescription(deviceId, fallbackDescription);
        if (this.hasCompleteCharacteristics(cached)) {
            return cached;
        }

        return this.createPendingServicePromise(deviceId, cached ?? fallbackDescription ?? null);
    }

    getCachedDeviceDescription(deviceId, fallbackDescription) {
        const services = this.discoveredServices.get(deviceId);
        if (!services) {
            return fallbackDescription ?? null;
        }
        const derived = this.buildDescriptionFromServices(services);
        if (!derived) {
            return fallbackDescription ?? null;
        }
        return this.mergeDeviceDescription(fallbackDescription, derived);
    }

    mergeDeviceDescription(baseDescription, overrideDescription) {
        if (!baseDescription) {
            return overrideDescription ? { ...overrideDescription } : null;
        }
        if (!overrideDescription) {
            return { ...baseDescription };
        }
        return { ...baseDescription, ...overrideDescription };
    }

    createPendingServicePromise(deviceId, fallbackDescription) {
        const existing = this.pendingServiceResolvers.get(deviceId);
        if (existing) {
            return existing.promise;
        }

        const pending = {
            fallback: fallbackDescription ? { ...fallbackDescription } : null,
        };
        pending.promise = new Promise((resolve) => {
            pending.resolve = (description) => {
                clearTimeout(pending.timeout);
                this.pendingServiceResolvers.delete(deviceId);
                if (description) {
                    resolve(description);
                } else {
                    resolve(pending.fallback);
                }
            };
        });
        pending.timeout = setTimeout(() => pending.resolve(null), this.serviceResolutionTimeoutMs);
        this.pendingServiceResolvers.set(deviceId, pending);
        return pending.promise;
    }

    buildDescriptionFromServices(services = []) {
        for (const service of services) {
            if (!service) {
                continue;
            }
            const serviceUuid = toLowerUuid(service.uuid ?? service.serviceUuid);
            if (!serviceUuid) {
                continue;
            }
            const characteristics = Array.isArray(service.characteristics) ? service.characteristics : [];
            if (characteristics.length === 0) {
                continue;
            }
            const writeCandidate = characteristics.find((characteristic) =>
                this.characteristicSupportsWrite(characteristic?.properties),
            );
            if (!writeCandidate?.uuid) {
                continue;
            }
            const notifyCandidate =
                characteristics.find((characteristic) =>
                    this.characteristicSupportsNotify(characteristic?.properties),
                ) || writeCandidate;
            if (!notifyCandidate?.uuid) {
                continue;
            }
            return {
                serviceUuid,
                writeCharacteristic: toLowerUuid(writeCandidate.uuid),
                readCharacteristic: toLowerUuid(notifyCandidate.uuid),
            };
        }
        return null;
    }

    characteristicSupportsWrite(properties = 0) {
        return (properties & (GATT_PROPERTIES.WRITE | GATT_PROPERTIES.WRITE_NO_RESPONSE)) !== 0;
    }

    characteristicSupportsNotify(properties = 0) {
        return (properties & (GATT_PROPERTIES.NOTIFY | GATT_PROPERTIES.INDICATE)) !== 0;
    }

    handleServicesEvent(event) {
        const deviceId = event?.deviceId;
        const services = event?.services;
        if (!deviceId || !Array.isArray(services)) {
            return;
        }

        this.discoveredServices.set(deviceId, services);
        const derived = this.buildDescriptionFromServices(services);
        const pending = this.pendingServiceResolvers.get(deviceId);
        if (pending) {
            pending.resolve(this.mergeDeviceDescription(pending.fallback, derived));
        }

        if (derived && this.device?.device?.deviceId === deviceId) {
            this.deviceDescription = this.mergeDeviceDescription(this.deviceDescription, derived);
        }
    }

    clearPendingServiceResolver(deviceId) {
        if (!deviceId) {
            return;
        }
        const pending = this.pendingServiceResolvers.get(deviceId);
        if (pending) {
            clearTimeout(pending.timeout);
            this.pendingServiceResolvers.delete(deviceId);
            pending.resolve(null);
        }
        this.discoveredServices.delete(deviceId);
    }

    attachNativeListeners() {
        if (this.nativeListenersReady || typeof BetaflightBluetooth?.addListener !== "function") {
            return;
        }

        this.nativeListenersReady = true;

        const registerListener = (eventName, callback) => {
            try {
                const handle = BetaflightBluetooth.addListener(eventName, callback);
                if (handle && typeof handle.then === "function") {
                    handle
                        .then((resolved) => {
                            if (resolved) {
                                this.nativeListeners.push(resolved);
                            }
                        })
                        .catch((error) =>
                            console.warn(`${this.logHead} Failed to attach ${eventName} listener`, error),
                        );
                } else if (handle && typeof handle.remove === "function") {
                    this.nativeListeners.push(handle);
                }
            } catch (error) {
                console.warn(`${this.logHead} Listener registration failed for ${eventName}`, error);
            }
        };

        registerListener("notification", (event) => {
            if (!event?.value) {
                return;
            }
            if (this.device?.device?.deviceId && event.deviceId && event.deviceId !== this.device.device.deviceId) {
                return;
            }
            const buffer = fromBase64(event.value);
            if (buffer) {
                this.handleNotification(buffer);
            }
        });

        registerListener("connectionState", (event) => {
            if (event?.connected === false) {
                void this.handleRemoteDisconnect(event.deviceId ?? null);
            }
        });

        registerListener("services", (event) => {
            this.handleServicesEvent(event);
        });
    }
}

export default CapacitorBluetooth;
