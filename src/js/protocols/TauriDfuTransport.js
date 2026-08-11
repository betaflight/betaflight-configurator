import { invoke } from "@tauri-apps/api/core";
import { usbDevices } from "./devices";
import UsbDfuDescriptors from "./UsbDfuDescriptors.js";

/**
 * Tauri Android transport for the DFU protocol, backed by tauri-plugin-dfu.
 *
 * Kotlin owns enumeration and the USB permission dialog; Rust owns the device
 * and performs all transfers. This class supplies the transport contract on
 * top of the shared descriptor layer, forwarding the full control-transfer
 * setup (requestType/recipient included) so descriptor reads work unchanged.
 *
 * Hotplug is poll-based (like TauriSerial): the plugin exposes no event
 * stream, and the DFU flow's waitForDfuDevice polls anyway.
 *
 * Events: "addedDevice", "removedDevice"
 */
class TauriDfuTransport extends UsbDfuDescriptors {
    constructor() {
        super();
        this.logHead = "[TAURI DFU]";
        this.ports = [];
        this.currentDeviceName = null;
        this.currentPortPath = null;

        this.deviceMonitorInterval = null;
        this.deviceCheckInFlight = false;

        this.startDeviceMonitoring();
    }

    /**
     * Invoke a plugin command, rethrowing rejections as Error objects: the
     * plugin serialises errors as bare strings, but consumers key behaviour
     * off error.message (usbdfu.js retries claims whose message says "busy").
     */
    async _invoke(cmd, args) {
        try {
            return await invoke(`plugin:dfu|${cmd}`, args);
        } catch (error) {
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    get available() {
        return true;
    }

    // requestPermission() dispatches addedDevice itself, so callers
    // (webstm32.js) must not dispatch a second one.
    get emitsAddedDeviceOnPermissionGrant() {
        return true;
    }

    createPort(device) {
        const identifier = device.serialNumber || device.deviceName;
        return {
            path: `usb_${identifier}`,
            displayName: `Betaflight ${device.productName || "DFU Device"}`,
            vendorId: device.vendorId,
            productId: device.productId,
            manufacturerName: device.manufacturerName,
            productName: device.productName,
            port: device,
        };
    }

    _matchesFilter(device) {
        return (usbDevices?.filters || []).some(
            (f) => device.vendorId === f.vendorId && device.productId === f.productId,
        );
    }

    /** All connected filter-matching devices, granted or not. */
    async _listMatchingDevices() {
        const devices = await this._invoke("list_devices");
        return devices.filter((device) => this._matchesFilter(device));
    }

    _grantedPorts(devices) {
        return devices.filter((device) => device.hasPermission).map((device) => this.createPort(device));
    }

    async getDevices() {
        try {
            return this._grantedPorts(await this._listMatchingDevices());
        } catch (error) {
            console.error(`${this.logHead} Error listing devices:`, error);
            return [];
        }
    }

    async requestPermission() {
        try {
            const devices = await this._listMatchingDevices();
            if (!devices.length) {
                console.log(`${this.logHead} No DFU device connected`);
                return null;
            }
            const target = devices.find((device) => !device.hasPermission) ?? devices[0];
            const granted =
                target.hasPermission || (await this._invoke("request_permission", { deviceName: target.deviceName }));
            if (!granted) {
                console.log(`${this.logHead} USB permission denied for ${target.deviceName}`);
                return null;
            }
            // Re-enumerate: the serial number is unreadable before the grant,
            // so a port built from the pre-grant snapshot would carry a
            // different path than getDevices() reports from now on.
            const fresh = (await this._listMatchingDevices()).find((d) => d.deviceName === target.deviceName);
            const port = this.createPort(fresh ?? { ...target, hasPermission: true });
            if (!this.ports.some((p) => p.path === port.path)) {
                this.ports.push(port);
                this.dispatchEvent(new CustomEvent("addedDevice", { detail: port }));
            }
            console.log(`${this.logHead} DFU permission granted for ${port.path}`);
            return port;
        } catch (error) {
            console.error(`${this.logHead} Error requesting DFU permission:`, error);
            return null;
        }
    }

    async waitForDfuDevice(timeout = 10000, interval = 500) {
        const start = Date.now();

        // Snapshot already-connected DFU devices by count so only a newly
        // appeared one is returned, even when identical boards lack serials.
        const knownDevices = new Map();
        for (const port of await this.getDevices()) {
            knownDevices.set(port.path, (knownDevices.get(port.path) ?? 0) + 1);
        }

        while (Date.now() - start < timeout) {
            try {
                const seenNow = new Map();
                const newPort = (await this.getDevices()).find((port) => {
                    const countNow = (seenNow.get(port.path) ?? 0) + 1;
                    seenNow.set(port.path, countNow);
                    return countNow > (knownDevices.get(port.path) ?? 0);
                });
                if (newPort) {
                    return newPort;
                }
            } catch (e) {
                console.warn(`${this.logHead} waitForDfuDevice failed:`, e);
            }
            await new Promise((r) => setTimeout(r, interval));
        }
        return null;
    }

    startDeviceMonitoring() {
        if (this.deviceMonitorInterval) {
            return;
        }
        this.deviceMonitorInterval = setInterval(async () => {
            if (this.deviceCheckInFlight) {
                return;
            }
            this.deviceCheckInFlight = true;
            try {
                await this._checkDeviceChanges();
            } finally {
                this.deviceCheckInFlight = false;
            }
        }, 1000);
    }

    stopDeviceMonitoring() {
        if (this.deviceMonitorInterval) {
            clearInterval(this.deviceMonitorInterval);
            this.deviceMonitorInterval = null;
        }
    }

    async _checkDeviceChanges() {
        let currentPorts;
        try {
            currentPorts = this._grantedPorts(await this._listMatchingDevices());
        } catch (error) {
            // A failed poll says nothing about the devices; diffing it as an
            // empty set would fire removedDevice for a board mid-flash.
            console.warn(`${this.logHead} Error checking device changes:`, error);
            return;
        }

        const removedPorts = this.ports.filter((old) => !currentPorts.some((p) => p.path === old.path));
        const addedPorts = currentPorts.filter((p) => !this.ports.some((old) => old.path === p.path));
        this.ports = currentPorts;

        for (const removed of removedPorts) {
            if (removed.port.deviceName === this.currentDeviceName) {
                this.currentDeviceName = null;
                this.currentPortPath = null;
                this._invalidateDescriptorCache();
            }
            this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
        }
        for (const added of addedPorts) {
            this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));
        }
    }

    // ===== Device Lifecycle =====

    async open(devicePort) {
        const deviceName = devicePort.port.deviceName;
        await this._invoke("open_device", { deviceName });
        this._invalidateDescriptorCache();
        this.currentDeviceName = deviceName;
        this.currentPortPath = devicePort.path;
        console.log(`${this.logHead} DFU device opened: ${devicePort.displayName}`);
    }

    async claimInterface(interfaceNumber) {
        await this._invoke("claim_interface", { interfaceNumber });
        console.log(`${this.logHead} Claimed interface: ${interfaceNumber}`);
    }

    async releaseInterface(interfaceNumber) {
        // Teardown after a failed open() runs the same path; nothing to release.
        if (!this.currentDeviceName) {
            return;
        }
        try {
            await this._invoke("release_interface", { interfaceNumber });
            console.log(`${this.logHead} Released interface: ${interfaceNumber}`);
        } catch (error) {
            console.warn(`${this.logHead} Error releasing interface:`, error);
        }
    }

    async close() {
        // Always tell Rust: the JS connection state may have been cleared by
        // the monitor (device detached) while Rust still holds the open
        // device; close_device is idempotent when nothing is open.
        try {
            await this._invoke("close_device");
            console.log(`${this.logHead} DFU device closed`);
        } catch (error) {
            console.warn(`${this.logHead} Error closing device:`, error);
        } finally {
            this.currentDeviceName = null;
            this.currentPortPath = null;
            this._invalidateDescriptorCache();
        }
    }

    getConnectedDevice() {
        return this.currentPortPath;
    }

    // ===== Control Transfers =====

    /**
     * Perform a USB control transfer IN (device -> host), reporting the
     * transfer status ("ok"/"stall") rather than throwing, so the descriptor
     * layer can decide what a stall means for a given request.
     * @param {{requestType: string, recipient: string, request: number, value: number, index: number}} setup
     * @param {number} length - Maximum bytes to read.
     * @returns {Promise<{status: string, data: Uint8Array}>}
     */
    async _rawControlTransferIn(setup, length) {
        const result = await this._invoke("control_transfer_in", {
            requestType: setup.requestType,
            recipient: setup.recipient,
            request: setup.request,
            value: setup.value,
            index: setup.index,
            length,
        });
        return { status: result.status, data: new Uint8Array(result.data) };
    }

    /**
     * Perform a USB control transfer IN (device -> host), throwing on a failed transfer.
     * @param {{requestType: string, recipient: string, request: number, value: number, index: number}} setup
     * @param {number} length - Maximum bytes to read.
     * @returns {Promise<{status: string, data: Uint8Array}>}
     */
    async controlTransferIn(setup, length) {
        const result = await this._rawControlTransferIn(setup, length);
        if (result.status === "ok") {
            return result;
        }
        throw new Error(`USB controlTransferIn failed: ${result.status}`);
    }

    /**
     * Perform a USB control transfer OUT (host -> device).
     * @param {{requestType: string, recipient: string, request: number, value: number, index: number}} setup
     * @param {ArrayBuffer|Uint8Array} [data] - Payload to send; an empty transfer when omitted.
     * @returns {Promise<{status: string}>}
     */
    async controlTransferOut(setup, data) {
        const result = await this._invoke("control_transfer_out", {
            requestType: setup.requestType,
            recipient: setup.recipient,
            request: setup.request,
            value: setup.value,
            index: setup.index,
            data: data ? Array.from(new Uint8Array(data)) : [],
        });
        if (result.status === "ok") {
            return { status: "ok" };
        }
        throw new Error(`USB controlTransferOut failed: ${result.status}`);
    }
}

export default TauriDfuTransport;
