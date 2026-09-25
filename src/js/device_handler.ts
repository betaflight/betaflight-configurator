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

import { get as getConfig } from "./ConfigStorage";
import { EventBus } from "../components/eventBus";
import { serial } from "./serial.js";
import { getConnectionState } from "./connection_state.js";
import defaultDfu, { UsbDfuProtocol } from "./protocols/usbdfu";
import CapacitorDfuTransport from "./protocols/CapacitorDfuTransport";
import TauriDfuTransport from "./protocols/TauriDfuTransport";
import { isExpertModeEnabled } from "./utils/isExpertModeEnabled";
import { reactive } from "vue";
import {
    checkCompatibility,
    checkBluetoothSupport,
    checkSerialSupport,
    checkUsbSupport,
    isAndroid,
    isNetworkOnlyBrowser,
    isTauri,
    isTauriAndroid,
} from "./utils/checkCompatibility.js";

const DEFAULT_PORT = "noselection";
const DEFAULT_BAUDS = 115200;
// Where a network-only browser starts looking. A browser has no raw sockets, so it reaches
// SITL through the websockify proxy's own port rather than the raw 5761 — the same address
// the seeded SITL bookmark uses, see sitlBookmark() in stores/connectionBookmarks.js.
const DEFAULT_NETWORK_TARGET = "ws://127.0.0.1:6761";

const networkOnly = isNetworkOnlyBrowser();

// Create the platform-appropriate DFU protocol instance.
// On Android, use the native transport for the shell we run in (Tauri or
// Capacitor). On desktop, use the default WEBUSBDFU singleton (WebUSB).
function createDfuProtocol() {
    if (isTauriAndroid()) {
        return new UsbDfuProtocol(new TauriDfuTransport());
    }
    if (isAndroid()) {
        return new UsbDfuProtocol(new CapacitorDfuTransport());
    }
    return defaultDfu;
}

const dfuProtocol = createDfuProtocol();

/** A listed port, as the serial facade and the DFU protocol report it. */
export interface PortDevice {
    path: string;
    displayName: string;
    vendorId?: unknown;
    productId?: unknown;
}

/** From describeDevice(): the USB ids let a rebooted device be matched under a new path. */
export interface DeviceDescriptor {
    path: string;
    vendorId: unknown;
    productId: unknown;
}

export type DeviceType = "serial" | "bluetooth" | "usb" | "tcp";

function deviceTypeForPath(path: string): DeviceType {
    if (path.startsWith("bluetooth")) {
        return "bluetooth";
    }
    if (path.startsWith("tcp://")) {
        return "tcp";
    }
    return "serial";
}

/** True when both lists hold the same paths in the same order. */
// The serial facade and the DFU protocol announce devices as CustomEvents carrying the device.
function eventDetail<T>(event: Event): T {
    return (event as CustomEvent<T>).detail;
}

function samePaths(a: PortDevice[], b: PortDevice[]) {
    return a.length === b.length && a.every((device, index) => device.path === b[index].path);
}

class DeviceHandler {
    logHead = "[DEVICEHANDLER]";

    currentSerialPorts: PortDevice[] = [];
    currentUsbPorts: PortDevice[] = [];
    currentBluetoothPorts: PortDevice[] = [];
    currentTcpPorts: PortDevice[] = [];

    // "Reconnect in progress" is the connection state being in REBOOTING/RECONNECTING,
    // read in selectActivePort() via getConnectionState().isReconnecting; the
    // previously-selected port stays put as the reconnect target.

    devicePicker = {
        selectedDevice: DEFAULT_PORT as string,
        selectedBauds: DEFAULT_BAUDS,
        portOverride: getConfig("portOverride", networkOnly ? DEFAULT_NETWORK_TARGET : "/dev/rfcomm0").portOverride,
        virtualMspVersion: getConfig("virtualMspVersion", "1.46.0").virtualMspVersion,
        autoConnect: getConfig("autoConnect", false).autoConnect,
    };

    devicePickerDisabled = false;

    bluetoothAvailable = false;
    dfuAvailable = false;
    portAvailable = false;
    tcpAvailable = false;

    showBluetoothOption: boolean;
    showSerialOption: boolean;
    showUsbOption: boolean;
    showTcpOption: boolean;

    showVirtualMode: boolean;
    showManualMode: boolean;
    showAllSerialDevices: boolean;

    // Expose the DFU protocol instance for other modules
    dfuProtocol = dfuProtocol;

    constructor() {
        checkCompatibility();

        this.showBluetoothOption = checkBluetoothSupport();
        this.showSerialOption = checkSerialSupport();
        this.showUsbOption = checkUsbSupport();
        this.showTcpOption = isTauri();

        console.log(`${this.logHead} Bluetooth available: ${this.showBluetoothOption}`);
        console.log(`${this.logHead} Serial available: ${this.showSerialOption}`);
        console.log(`${this.logHead} DFU available: ${this.showUsbOption}`);

        this.showVirtualMode = getConfig("showVirtualMode", false).showVirtualMode;
        this.showManualMode = getConfig("showManualMode", false).showManualMode;
        this.showAllSerialDevices = getConfig("showAllSerialDevices", false).showAllSerialDevices;
    }

    initialize() {
        EventBus.$on("ports-input:request-permission-bluetooth", () => this.requestDevicePermission("bluetooth"));
        EventBus.$on("ports-input:request-permission-serial", () => this.requestDevicePermission("serial"));
        EventBus.$on("ports-input:request-permission-usb", () => this.requestDevicePermission("usb"));
        EventBus.$on("ports-input:change", this.onChangeSelectedPort.bind(this));

        // Use serial for all protocol events
        serial.addEventListener("addedDevice", (event) => {
            const detail = eventDetail<PortDevice | undefined>(event);

            if (detail?.path?.startsWith("bluetooth")) {
                this.handleDeviceAdded(detail, "bluetooth");
            } else if (detail?.path?.startsWith("tcp://")) {
                this.handleDeviceAdded(detail, "tcp");
            } else {
                this.handleDeviceAdded(detail, "serial");
            }
        });

        serial.addEventListener("removedDevice", (event) => {
            this.removedSerialDevice(eventDetail(event));
        });

        // Keep USB listener separate as it's not part of the serial protocols
        dfuProtocol.addEventListener("addedDevice", (event) => this.addedUsbDevice(eventDetail(event)));
        dfuProtocol.addEventListener("removedDevice", (event) => this.removedUsbDevice(eventDetail(event)));

        // Initial device discovery using the serial facade
        this.refreshAllDeviceLists();
    }

    // Refactored refreshAllDeviceLists to use updateDeviceList
    async refreshAllDeviceLists() {
        // Update all device lists in parallel
        return Promise.all([
            this.updateDeviceList("serial"),
            this.updateDeviceList("bluetooth"),
            this.updateDeviceList("usb"),
            this.updateDeviceList("tcp"),
        ]).then(() => {
            this.selectActivePort();
        });
    }

    setShowVirtualMode(showVirtualMode: boolean) {
        this.showVirtualMode = showVirtualMode;
        this.selectActivePort();
    }

    setShowManualMode(showManualMode: boolean) {
        this.showManualMode = showManualMode;
        this.selectActivePort();
    }

    /**
     * The manual entry is a development option behind expert mode, except on a network-only
     * browser. There it is the only way to reach a flight controller, so neither expert mode nor
     * a development-option reset may take it away.
     *
     * @returns {boolean} Whether to offer manual/network targets in the UI.
     */
    manualModeAvailable(): boolean {
        return networkOnly || (this.showManualMode && isExpertModeEnabled());
    }

    setShowAllSerialDevices(showAllSerialDevices: boolean) {
        this.showAllSerialDevices = showAllSerialDevices;
        this.selectActivePort();
    }

    removedSerialDevice(device: { path?: string } | string | null | undefined) {
        console.log(`${this.logHead} Device removal event received:`, device);

        // Get device path safely
        const devicePath = (typeof device === "string" ? device : device?.path) || null;

        if (!devicePath) {
            console.warn(`${this.logHead} Device removal event missing path information`, device);
            // Still update ports, but don't try to use the undefined path
            this.updateDeviceList("serial").then(() => {
                this.selectActivePort();
            });
            return;
        }

        // Update the appropriate ports list based on the device type
        const updatePromise = this.updateDeviceList(deviceTypeForPath(devicePath));

        const wasSelectedPort = this.devicePicker.selectedDevice === devicePath;

        updatePromise.then(() => {
            if (wasSelectedPort) {
                this.selectActivePort();

                // Send event for UI components that might need to update
                EventBus.$emit("device-handler:device-removed", devicePath);
            }
        });
    }

    addedUsbDevice(device: PortDevice | null | undefined) {
        this.updateDeviceList("usb").then(() => {
            const selectedDevice = this.selectActivePort(device);
            if (selectedDevice === device?.path) {
                // Send event when the port handler auto selects a new USB device
                EventBus.$emit("device-handler:auto-select-usb-device", selectedDevice);
            }
        });
    }

    removedUsbDevice(device: { path?: string } | string | null | undefined) {
        console.log(`${this.logHead} USB device removal event received:`, device);

        const devicePath = (typeof device === "string" ? device : device?.path) || null;

        if (!devicePath) {
            console.warn(`${this.logHead} USB device removal event missing path information`, device);
            this.updateDeviceList("usb").then(() => {
                this.selectActivePort();
            });
            return;
        }

        const wasSelectedPort = this.devicePicker.selectedDevice === devicePath;

        this.updateDeviceList("usb").then(() => {
            this.selectActivePort();

            if (wasSelectedPort) {
                EventBus.$emit("device-handler:device-removed", devicePath);
            }
        });
    }

    onChangeSelectedPort(port: string) {
        this.devicePicker.selectedDevice = port;
    }

    /**
     * Request permission for a device of the specified type
     * @param {string} deviceType - Type of device ('serial', 'bluetooth', 'usb')
     */
    async requestDevicePermission(protocol: "serial" | "bluetooth" | "usb") {
        try {
            const port = await (protocol === "usb"
                ? dfuProtocol.requestPermission()
                : serial.requestPermissionDevice(this.showAllSerialDevices, protocol));

            if (port) {
                console.log(`${this.logHead} Permission granted for ${protocol} device:`, port);

                await this.updateDeviceList(protocol);

                this.selectActivePort(port);
            } else {
                console.log(`${this.logHead} Permission request cancelled or failed for ${protocol} device`);
            }
        } catch (error) {
            console.error(`${this.logHead} Error requesting permission for ${protocol} device:`, error);
        }
    }

    sortPorts(ports: PortDevice[]) {
        return ports.sort(function (a, b) {
            const locale = typeof window !== "undefined" && window.navigator ? window.navigator.language : "en";

            return a.path.localeCompare(b.path, locale, {
                numeric: true,
                sensitivity: "base",
            });
        });
    }

    /**
     * Describe a listed device well enough to recognise it after a reboot. A re-enumerating
     * device usually comes back under a NEW path (the browser mints a fresh SerialPort object),
     * so the USB ids travel with it.
     * @param {string} path - a device path
     * @returns {?{path: string, vendorId: *, productId: *}} null when the path is not listed
     */
    describeDevice(path: string): DeviceDescriptor | null {
        const device = [...this.currentSerialPorts, ...this.currentBluetoothPorts].find((port) => port.path === path);

        return device ? { path: device.path, vendorId: device.vendorId, productId: device.productId } : null;
    }

    /**
     * The listed device matching a descriptor: the same path if it came back as itself, otherwise
     * the same make. Undefined while it is away.
     *
     * The make comparison needs both ids: SerialPortInfo carries usbVendorId/usbProductId for USB
     * ports only, so a platform-native port (a built-in COM port, a Bluetooth SPP one) has neither
     * and `undefined === undefined` would match it to any other port without ids.
     * @param {?{path: string, vendorId: *, productId: *}} target - from describeDevice()
     * @returns {object|undefined} the device wrapper
     */
    findDescribedDevice(target: DeviceDescriptor | null | undefined): PortDevice | undefined {
        if (!target) {
            return undefined;
        }

        const devices = [...this.currentSerialPorts, ...this.currentBluetoothPorts];
        const byPath = devices.find((device) => device.path === target.path);

        if (byPath || target.vendorId === undefined || target.productId === undefined) {
            return byPath;
        }

        return devices.find((device) => device.vendorId === target.vendorId && device.productId === target.productId);
    }

    /**
     * @param {string} path - a device path
     * @returns {boolean} true when the serial, Bluetooth or USB list holds this path
     */
    isKnownDevicePath(path: string | null | undefined): boolean {
        if (!path) {
            return false;
        }

        return [this.currentSerialPorts, this.currentBluetoothPorts, this.currentUsbPorts, this.currentTcpPorts].some(
            (devices) => devices.some((device) => device.path === path),
        );
    }

    selectActivePort(suggestedDevice: { path: string } | false | null | undefined = false): string | undefined {
        const deviceFilter = ["AT32", "CP210", "SPR", "STM"];
        let selectedDevice;

        // First check for active connections. Match on the stable connectionId (which every
        // serial/BLE transport sets to the device path on connect) rather than object identity —
        // getConnectedDevice() returns transport-specific values (raw handles, strings) that never
        // equal the wrapper objects held in the device lists. Search both the serial and Bluetooth
        // lists so a BLE-connected device is selected too (BLE paths live in currentBluetoothPorts).
        if (serial.connected) {
            selectedDevice =
                this.currentSerialPorts.find((device) => device.path === serial.connectionId) ||
                this.currentBluetoothPorts.find((device) => device.path === serial.connectionId) ||
                this.currentTcpPorts.find((device) => device.path === serial.connectionId);
        }

        // Return the same that is connected to DFU
        if (dfuProtocol.usbDevice) {
            const connectedPortPath = dfuProtocol.getConnectedDevice();
            selectedDevice = this.currentUsbPorts.find((device) => device.path === connectedPortPath);
        }

        // If there is a connection, return it
        if (selectedDevice) {
            console.log(`${this.logHead} Using connected device: ${selectedDevice.path}`);
            selectedDevice = selectedDevice.path;
            return selectedDevice;
        }

        // Mid-reboot, prefer the device that was rebooted. A plug-in raises a burst of events and
        // another device can be added while the FC is away; without this the selection follows
        // whichever event arrived last, and the reconnect aims at a device nobody asked for.
        // A preference, not a restriction: if the rebooted device is not back, the rules below
        // still apply, so a board that returns as something else is not locked out.
        if (!selectedDevice) {
            selectedDevice = this.findDescribedDevice(getConnectionState().rebootTarget)?.path;
        }

        // The code reads suggestedDevice from an addedDevice event. updateDeviceList() reads the
        // transport again after that. The device can be absent at this point. On Linux, udev and
        // ModemManager remove a CDC-ACM node and add it again while they examine it. Auto-connect
        // fails if the selection holds a path that the transport does not list.
        if (!selectedDevice && suggestedDevice && this.isKnownDevicePath(suggestedDevice.path)) {
            selectedDevice = suggestedDevice.path;
        }

        // Return some usb port that is recognized by the filter
        if (!selectedDevice) {
            selectedDevice = this.currentUsbPorts.find((device) =>
                deviceFilter.some((filter) => device.displayName.includes(filter)),
            );
            if (selectedDevice) {
                selectedDevice = selectedDevice.path;
            }
        }

        // Return some serial port that is recognized by the filter
        if (!selectedDevice) {
            selectedDevice = this.currentSerialPorts.find((device) =>
                deviceFilter.some((filter) => device.displayName.includes(filter)),
            );
            if (selectedDevice) {
                selectedDevice = selectedDevice.path;
            }
        }

        // Return some bluetooth port that is recognized by the filter
        if (!selectedDevice) {
            selectedDevice = this.currentBluetoothPorts.find((device) =>
                deviceFilter.some((filter) => device.displayName.includes(filter)),
            );
            if (selectedDevice) {
                selectedDevice = selectedDevice.path;
            }
        }

        // Expert-only fallbacks: only surface virtual/manual when expert mode is on.
        // While a reboot/reconnect is in progress the rebooting device is only
        // transiently absent from the lists — it will re-enumerate and re-select
        // itself. Do NOT assign the virtual/manual fallback in that window, or it
        // would hijack the selection mid-reboot and leave the configurator pointed at
        // the wrong "device".
        const expertMode = isExpertModeEnabled();
        const reconnectInProgress = getConnectionState().isReconnecting;

        if (!selectedDevice && !reconnectInProgress && expertMode && this.showVirtualMode) {
            selectedDevice = "virtual";
        }

        if (!selectedDevice && !reconnectInProgress && this.manualModeAvailable()) {
            selectedDevice = "manual";
        }

        // During a reconnect, keep the device from the last selection. Do not change it to
        // "noselection". The device is absent for a short time only. If it comes back with a new
        // id, the addedDevice event selects it again. Do not use virtual or manual here.
        if (!selectedDevice && reconnectInProgress) {
            selectedDevice = this.devicePicker.selectedDevice;
        }

        // Return the default port if no other port was selected
        const previousDevice = this.devicePicker.selectedDevice;
        this.devicePicker.selectedDevice = selectedDevice || DEFAULT_PORT;

        // One plug-in gives a burst of device events. Each event runs this function and gets the
        // same result. Log the selection only when it changes.
        if (this.devicePicker.selectedDevice !== previousDevice) {
            console.log(
                `${this.logHead} Automatically selected device is '${this.devicePicker.selectedDevice}' - suggested:`,
                suggestedDevice,
            );
        }

        return selectedDevice;
    }

    // Create a unified handler for device addition
    handleDeviceAdded(device: PortDevice | null | undefined, deviceType: DeviceType) {
        if (!device) {
            console.warn(`${this.logHead} Invalid ${deviceType} device added event`);
            return;
        }

        console.log(`${this.logHead} ${deviceType} device added:`, device);

        // Update the appropriate device list
        const updatePromise = this.updateDeviceList(deviceType);

        updatePromise.then(() => {
            const selectedDevice = this.selectActivePort(device);

            if (selectedDevice === device.path) {
                EventBus.$emit(`device-handler:auto-select-serial-device`, selectedDevice);
            }
        });
    }

    /**
     * Update device list with common implementation
     * @param {string} deviceType - Type of device ('serial', 'bluetooth', 'usb')
     * @returns {Promise} - Promise that resolves after updating the ports list
     */
    async updateDeviceList(deviceType: DeviceType): Promise<PortDevice[]> {
        let ports = [];

        try {
            switch (deviceType) {
                case "bluetooth":
                    if (this.showBluetoothOption) {
                        ports = await serial.getDevices("bluetooth");
                    }
                    break;
                case "usb":
                    if (this.showUsbOption) {
                        ports = await dfuProtocol.getDevices();
                    }
                    break;
                case "serial":
                    if (this.showSerialOption) {
                        ports = await serial.getDevices("serial");
                    }
                    break;
                case "tcp":
                    if (this.showTcpOption) {
                        ports = await serial.getDevices("tcp");
                    }
                    break;
                default:
                    console.warn(`${this.logHead} Unknown device type: ${deviceType}`);
                    return [];
            }

            // Sort the ports
            const orderedPorts = this.sortPorts(ports);

            // Update the appropriate properties based on device type
            let previousPorts;
            let label;

            switch (deviceType) {
                case "bluetooth":
                    previousPorts = this.currentBluetoothPorts;
                    label = "bluetooth";
                    this.bluetoothAvailable = orderedPorts.length > 0;
                    this.currentBluetoothPorts = [...orderedPorts];
                    break;
                case "usb":
                    previousPorts = this.currentUsbPorts;
                    label = "DFU";
                    this.dfuAvailable = orderedPorts.length > 0;
                    this.currentUsbPorts = [...orderedPorts];
                    break;
                case "serial":
                    previousPorts = this.currentSerialPorts;
                    label = "serial";
                    this.portAvailable = orderedPorts.length > 0;
                    this.currentSerialPorts = [...orderedPorts];
                    break;
                case "tcp":
                    previousPorts = this.currentTcpPorts;
                    label = "bridge";
                    this.tcpAvailable = orderedPorts.length > 0;
                    this.currentTcpPorts = [...orderedPorts];
                    break;
                default:
                    console.warn(`${this.logHead} Unknown device type for updating ports: ${deviceType}`);
                    return [];
            }

            // A burst of device events refreshes the same list many times. Log it only on a change.
            if (!samePaths(orderedPorts, previousPorts)) {
                console.log(`${this.logHead} Found ${label} port(s)`, orderedPorts);
            }

            return orderedPorts;
        } catch (error) {
            console.error(`${this.logHead} Error updating ${deviceType} devices:`, error);
            return [];
        }
    }
}

// We need to explicit make it reactive. If not, Vue3 does not detect correctly changes in array properties
// like currentSerialPorts, currentUsbPorts, currentBluetoothPorts
export default reactive(new DeviceHandler());
