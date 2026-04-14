import CapacitorDfu from "./CapacitorDfu";

/**
 * Capacitor DFU transport for Android.
 * Wraps the CapacitorDfu native plugin adapter to provide the same
 * transport interface as WebUsbDfuTransport.
 *
 * Events: "addedDevice", "removedDevice"
 */
class CapacitorDfuTransport extends EventTarget {
    constructor() {
        super();
        this.logHead = "[Capacitor DFU Transport]";
        this.adapter = new CapacitorDfu();
        this.currentDeviceId = null;
        this.currentPortPath = null;

        // Forward device events from the adapter
        this.adapter.addEventListener("addedDevice", (e) => {
            this.dispatchEvent(new CustomEvent("addedDevice", { detail: e.detail }));
        });

        this.adapter.addEventListener("removedDevice", (e) => {
            this.dispatchEvent(new CustomEvent("removedDevice", { detail: e.detail }));
        });
    }

    get available() {
        return !!this.adapter;
    }

    // CapacitorDfu.requestPermission() dispatches addedDevice internally
    // via handleDeviceAttached(), so callers must not dispatch again.
    get emitsAddedDeviceOnPermissionGrant() {
        return true;
    }

    createPort(device) {
        return this.adapter.createPort(device);
    }

    getDevices() {
        return this.adapter.getDevices();
    }

    requestPermission() {
        return this.adapter.requestPermission();
    }

    async waitForDfuDevice(timeout = 10000, interval = 500) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            try {
                const devices = await this.adapter.getDevices();
                if (devices.length > 0) {
                    // Dispatch addedDevice so the PortHandler event chain fires.
                    // The native USB_DEVICE_ATTACHED broadcast may have been
                    // consumed before Android granted permission, so the normal
                    // deviceAttached → addedDevice path can be missed.
                    this.dispatchEvent(new CustomEvent("addedDevice", { detail: devices[0] }));
                    return devices[0];
                }
            } catch (e) {
                console.warn(`${this.logHead} waitForDfuDevice failed:`, e);
            }

            await new Promise((r) => setTimeout(r, interval));
        }

        return null;
    }

    // ===== Device Lifecycle =====

    async open(devicePort) {
        // devicePort.port contains the native device info
        const nativeDevice = devicePort.port;
        this.currentDeviceId = nativeDevice.deviceId;
        this.currentPortPath = devicePort.path;
        const result = await this.adapter.openDevice(this.currentDeviceId);

        if (!result.success) {
            throw new Error("Failed to open DFU device");
        }

        console.log(`${this.logHead} DFU Device opened: ${result.productName}`);
    }

    async claimInterface(interfaceNumber) {
        const result = await this.adapter.claimInterface(interfaceNumber);
        if (!result.success) {
            throw new Error(`Failed to claim interface ${interfaceNumber}`);
        }
        console.log(`${this.logHead} Claimed interface: ${interfaceNumber}`);
    }

    async releaseInterface(interfaceNumber) {
        try {
            await this.adapter.releaseInterface(interfaceNumber);
            console.log(`${this.logHead} Released interface: ${interfaceNumber}`);
        } catch (error) {
            console.warn(`${this.logHead} Error releasing interface:`, error);
        }
    }

    async close() {
        try {
            await this.adapter.closeDevice();
            console.log(`${this.logHead} DFU Device closed`);
        } catch (error) {
            console.warn(`${this.logHead} Error closing device:`, error);
        }
        this.currentDeviceId = null;
        this.currentPortPath = null;
    }

    async reset() {
        try {
            await this.adapter.resetDevice();
            console.log(`${this.logHead} Reset Device`);
        } catch (error) {
            console.warn(`${this.logHead} Error resetting device:`, error);
        }
    }

    getConnectedPort() {
        return this.currentPortPath;
    }

    // ===== Control Transfers =====

    /**
     * Perform a USB control transfer IN (device -> host).
     * Uses DFU class request type (class, recipient: interface).
     * @returns {Promise<{status: string, data: Uint8Array}>}
     */
    async controlTransferIn(setup, length) {
        const result = await this.adapter.controlTransferIn(setup.request, setup.value, setup.index, length);
        return { status: result.status, data: result.data };
    }

    /**
     * Perform a USB control transfer OUT (host -> device).
     * Uses DFU class request type (class, recipient: interface).
     * @returns {Promise<{status: string}>}
     */
    async controlTransferOut(setup, data) {
        const result = await this.adapter.controlTransferOut(setup.request, setup.value, setup.index, data);
        return { status: result.status };
    }

    // ===== Descriptor Reading =====

    getString(index) {
        return this.adapter.getStringDescriptor(index);
    }

    getInterfaceDescriptor(interfaceIndex) {
        return this.adapter.getInterfaceDescriptor(interfaceIndex);
    }

    getInterfaceDescriptors(interfaceNum) {
        return this.adapter.getInterfaceDescriptors(interfaceNum);
    }

    getFunctionalDescriptor() {
        return this.adapter.getFunctionalDescriptor();
    }
}

export default CapacitorDfuTransport;
