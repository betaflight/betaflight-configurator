import { Capacitor } from "@capacitor/core";

const logHead = "[CAPACITOR DFU]";
const BetaflightDfu = Capacitor?.Plugins?.BetaflightDfu;

/**
 * Capacitor DFU protocol adapter for Android.
 * Wraps the native BetaflightDfu plugin to provide USB DFU communication
 * on Android devices using USB OTG.
 *
 * This class implements the same public interface as UsbDfuProtocol
 * (from usbdfu.js) so it can be used as a drop-in replacement on Android.
 * The DFU protocol state machine logic is shared via the transport abstraction.
 */
class CapacitorDfu extends EventTarget {
    constructor() {
        super();

        if (!BetaflightDfu) {
            console.error(`${logHead} Native BetaflightDfu plugin is not available`);
            return;
        }

        this.ports = [];

        BetaflightDfu.addListener("deviceAttached", this.handleDeviceAttached.bind(this));
        BetaflightDfu.addListener("deviceDetached", this.handleDeviceDetached.bind(this));

        this.loadDevices();

        console.log(`${logHead} CapacitorDfu initialized`);
    }

    handleDeviceAttached(device) {
        const added = this.createPort(device);
        if (this.ports.some((port) => port.path === added.path)) {
            return;
        }
        this.ports.push(added);
        this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));
        console.log(`${logHead} DFU device attached:`, added.path);
        return added;
    }

    handleDeviceDetached(device) {
        const devicePath = `usb_${device.serialNumber || device.deviceId}`;
        const removed = this.ports.find((port) => port.path === devicePath);

        if (removed) {
            this.ports = this.ports.filter((port) => port.path !== devicePath);
            this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
            console.log(`${logHead} DFU device detached:`, removed.path);
        }
    }

    createPort(device) {
        const serialNumber = device.serialNumber || device.deviceId;
        return {
            path: `usb_${serialNumber}`,
            displayName: `Betaflight ${device.productName || "DFU Device"}`,
            vendorId: device.vendorId,
            productId: device.productId,
            manufacturerName: device.manufacturerName,
            productName: device.productName,
            port: device,
        };
    }

    async loadDevices() {
        try {
            const result = await BetaflightDfu.getDevices();
            this.ports = result.devices.map((device) => this.createPort(device));
            console.log(`${logHead} Loaded ${this.ports.length} DFU devices`);
        } catch (error) {
            console.error(`${logHead} Error loading DFU devices:`, error);
            this.ports = [];
        }
    }

    async getDevices() {
        await this.loadDevices();
        return this.ports;
    }

    async requestPermission() {
        let newPermissionPort = null;

        try {
            console.log(`${logHead} Requesting DFU USB permissions...`);
            const result = await BetaflightDfu.requestPermission();

            if (!result?.devices?.length) {
                console.log(`${logHead} No DFU device found or permission denied`);
                return null;
            }

            const requestedPort = this.createPort(result.devices[0]);
            newPermissionPort =
                this.handleDeviceAttached(result.devices[0]) ??
                this.ports.find((port) => port.path === requestedPort.path) ??
                requestedPort;
            console.log(`${logHead} DFU permission granted for ${newPermissionPort?.path}`);
        } catch (error) {
            console.error(`${logHead} Error requesting DFU permission:`, error);
            return null;
        }
        return newPermissionPort;
    }

    // ===== Native USB operations (called by transport layer) =====

    openDevice(deviceId) {
        return BetaflightDfu.openDevice({ deviceId });
    }

    claimInterface(interfaceNumber) {
        return BetaflightDfu.claimInterface({ interfaceNumber });
    }

    releaseInterface(interfaceNumber) {
        return BetaflightDfu.releaseInterface({ interfaceNumber });
    }

    closeDevice() {
        return BetaflightDfu.closeDevice();
    }

    resetDevice() {
        return BetaflightDfu.resetDevice();
    }

    async controlTransferIn(request, value, index, length, timeout) {
        const result = await BetaflightDfu.controlTransferIn({
            request,
            value,
            index,
            length,
            timeout,
        });

        if (result.status === "ok" && result.data) {
            // Convert hex string to Uint8Array
            const data = this.hexStringToUint8Array(result.data);
            return { status: "ok", data };
        }

        return { status: result.status, data: new Uint8Array(0) };
    }

    async controlTransferOut(request, value, index, data, timeout) {
        const hexData = data ? this.uint8ArrayToHexString(new Uint8Array(data)) : "";
        return BetaflightDfu.controlTransferOut({
            request,
            value,
            index,
            data: hexData,
            timeout,
        });
    }

    async getStringDescriptor(descriptorIndex) {
        const result = await BetaflightDfu.getStringDescriptor({ index: descriptorIndex });
        if (result.status === "ok") {
            return result.descriptor;
        }
        return "";
    }

    async getInterfaceDescriptor(interfaceIndex) {
        const result = await BetaflightDfu.getInterfaceDescriptor({ interfaceIndex });
        if (result.status === "ok") {
            return result.descriptor;
        }
        return null;
    }

    async getInterfaceDescriptors(interfaceNumber) {
        const result = await BetaflightDfu.getInterfaceDescriptors({ interfaceNumber });
        if (result.status === "ok") {
            return result.descriptors;
        }
        return [];
    }

    async getFunctionalDescriptor() {
        const result = await BetaflightDfu.getFunctionalDescriptor();
        if (result.status === "ok") {
            return result.descriptor;
        }
        return null;
    }

    // ===== Hex conversion helpers =====

    hexStringToUint8Array(hexString) {
        if (!hexString || hexString.length === 0) {
            return new Uint8Array(0);
        }
        const bytes = new Uint8Array(hexString.length / 2);
        for (let i = 0; i < hexString.length; i += 2) {
            bytes[i / 2] = Number.parseInt(hexString.substring(i, i + 2), 16);
        }
        return bytes;
    }

    uint8ArrayToHexString(uint8Array) {
        return Array.from(uint8Array)
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
    }
}

export default CapacitorDfu;
