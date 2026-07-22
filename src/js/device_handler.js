import { get as getConfig } from "./ConfigStorage";
import { EventBus } from "../components/eventBus";
import { serial } from "./serial.js";
import { getConnectionState } from "./connection_state.js";
import defaultDfu, { UsbDfuProtocol } from "./protocols/usbdfu";
import CapacitorDfuTransport from "./protocols/CapacitorDfuTransport";
import { isExpertModeEnabled } from "./utils/isExpertModeEnabled";
import { reactive } from "vue";
import {
    checkCompatibility,
    checkBluetoothSupport,
    checkSerialSupport,
    checkUsbSupport,
    isAndroid,
} from "./utils/checkCompatibility.js";

const DEFAULT_PORT = "noselection";
const DEFAULT_BAUDS = 115200;

// Create the platform-appropriate DFU protocol instance.
// On Android, use the Capacitor DFU transport with the native plugin.
// On desktop, use the default WEBUSBDFU singleton (WebUSB transport).
function createDfuProtocol() {
    if (isAndroid()) {
        return new UsbDfuProtocol(new CapacitorDfuTransport());
    }
    return defaultDfu;
}

const dfuProtocol = createDfuProtocol();

const DeviceHandler = new (function () {
    this.logHead = "[DEVICEHANDLER]";

    this.currentSerialPorts = [];
    this.currentUsbPorts = [];
    this.currentBluetoothPorts = [];

    // "Reconnect in progress" is the connection state being in REBOOTING/RECONNECTING,
    // read in selectActivePort() via getConnectionState().isReconnecting; the
    // previously-selected port stays put as the reconnect target.

    this.devicePicker = {
        selectedDevice: DEFAULT_PORT,
        selectedBauds: DEFAULT_BAUDS,
        portOverride: getConfig("portOverride", "/dev/rfcomm0").portOverride,
        virtualMspVersion: getConfig("virtualMspVersion", "1.46.0").virtualMspVersion,
        autoConnect: getConfig("autoConnect", false).autoConnect,
    };

    this.devicePickerDisabled = false;

    this.bluetoothAvailable = false;
    this.dfuAvailable = false;
    this.portAvailable = false;

    checkCompatibility();

    this.showBluetoothOption = checkBluetoothSupport();
    this.showSerialOption = checkSerialSupport();
    this.showUsbOption = checkUsbSupport();

    console.log(`${this.logHead} Bluetooth available: ${this.showBluetoothOption}`);
    console.log(`${this.logHead} Serial available: ${this.showSerialOption}`);
    console.log(`${this.logHead} DFU available: ${this.showUsbOption}`);

    this.showVirtualMode = getConfig("showVirtualMode", false).showVirtualMode;
    this.showManualMode = getConfig("showManualMode", false).showManualMode;
    this.showAllSerialDevices = getConfig("showAllSerialDevices", false).showAllSerialDevices;

    // Expose the DFU protocol instance for other modules
    this.dfuProtocol = dfuProtocol;
})();

DeviceHandler.initialize = function () {
    EventBus.$on("ports-input:request-permission-bluetooth", () => this.requestDevicePermission("bluetooth"));
    EventBus.$on("ports-input:request-permission-serial", () => this.requestDevicePermission("serial"));
    EventBus.$on("ports-input:request-permission-usb", () => this.requestDevicePermission("usb"));
    EventBus.$on("ports-input:change", this.onChangeSelectedPort.bind(this));

    // Use serial for all protocol events
    serial.addEventListener("addedDevice", (event) => {
        const detail = event.detail;

        if (detail?.path?.startsWith("bluetooth")) {
            this.handleDeviceAdded(detail, "bluetooth");
        } else {
            this.handleDeviceAdded(detail, "serial");
        }
    });

    serial.addEventListener("removedDevice", (event) => {
        this.removedSerialDevice(event.detail);
    });

    // Keep USB listener separate as it's not part of the serial protocols
    dfuProtocol.addEventListener("addedDevice", (event) => this.addedUsbDevice(event.detail));
    dfuProtocol.addEventListener("removedDevice", (event) => this.removedUsbDevice(event.detail));

    // Initial device discovery using the serial facade
    this.refreshAllDeviceLists();
};

// Refactored refreshAllDeviceLists to use updateDeviceList
DeviceHandler.refreshAllDeviceLists = async function () {
    // Update all device lists in parallel
    return Promise.all([
        this.updateDeviceList("serial"),
        this.updateDeviceList("bluetooth"),
        this.updateDeviceList("usb"),
    ]).then(() => {
        this.selectActivePort();
    });
};

DeviceHandler.setShowVirtualMode = function (showVirtualMode) {
    this.showVirtualMode = showVirtualMode;
    this.selectActivePort();
};

DeviceHandler.setShowManualMode = function (showManualMode) {
    this.showManualMode = showManualMode;
    this.selectActivePort();
};

DeviceHandler.setShowAllSerialDevices = function (showAllSerialDevices) {
    this.showAllSerialDevices = showAllSerialDevices;
    this.selectActivePort();
};

DeviceHandler.removedSerialDevice = function (device) {
    console.log(`${this.logHead} Device removal event received:`, device);

    // Get device path safely
    const devicePath = device?.path || (typeof device === "string" ? device : null);

    if (!devicePath) {
        console.warn(`${this.logHead} Device removal event missing path information`, device);
        // Still update ports, but don't try to use the undefined path
        this.updateDeviceList("serial").then(() => {
            this.selectActivePort();
        });
        return;
    }

    // Update the appropriate ports list based on the device type
    const updatePromise = devicePath.startsWith("bluetooth")
        ? this.updateDeviceList("bluetooth")
        : this.updateDeviceList("serial");

    const wasSelectedPort = this.devicePicker.selectedDevice === devicePath;

    updatePromise.then(() => {
        if (wasSelectedPort) {
            this.selectActivePort();

            // Send event for UI components that might need to update
            EventBus.$emit("device-handler:device-removed", devicePath);
        }
    });
};

DeviceHandler.addedUsbDevice = function (device) {
    this.updateDeviceList("usb").then(() => {
        const selectedDevice = this.selectActivePort(device);
        if (selectedDevice === device?.path) {
            // Send event when the port handler auto selects a new USB device
            EventBus.$emit("device-handler:auto-select-usb-device", selectedDevice);
        }
    });
};

DeviceHandler.removedUsbDevice = function (device) {
    console.log(`${this.logHead} USB device removal event received:`, device);

    const devicePath = device?.path || (typeof device === "string" ? device : null);

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
};

DeviceHandler.onChangeSelectedPort = function (port) {
    this.devicePicker.selectedDevice = port;
};

/**
 * Request permission for a device of the specified type
 * @param {string} deviceType - Type of device ('serial', 'bluetooth', 'usb')
 */
DeviceHandler.requestDevicePermission = async function (protocol) {
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
};

DeviceHandler.sortPorts = function (ports) {
    return ports.sort(function (a, b) {
        const locale = typeof window !== "undefined" && window.navigator ? window.navigator.language : "en";

        return a.path.localeCompare(b.path, locale, {
            numeric: true,
            sensitivity: "base",
        });
    });
};

DeviceHandler.selectActivePort = function (suggestedDevice = false) {
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
            this.currentBluetoothPorts.find((device) => device.path === serial.connectionId);
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

    // Return the suggested device (the new device that has been detected)
    if (!selectedDevice && suggestedDevice) {
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

    if (!selectedDevice && !reconnectInProgress && expertMode && this.showManualMode) {
        selectedDevice = "manual";
    }

    // While reconnecting, keep the previously-selected device rather than dropping
    // to "noselection": it re-enumerates with the same stable id, so the existing
    // selection is still the right target. Never virtual/manual.
    if (!selectedDevice && reconnectInProgress) {
        selectedDevice = this.devicePicker.selectedDevice;
    }

    // Return the default port if no other port was selected
    this.devicePicker.selectedDevice = selectedDevice || DEFAULT_PORT;

    console.log(
        `${this.logHead} Automatically selected device is '${this.devicePicker.selectedDevice}' - suggested:`,
        suggestedDevice,
    );

    return selectedDevice;
};

// Create a unified handler for device addition
DeviceHandler.handleDeviceAdded = function (device, deviceType) {
    if (!device) {
        console.warn(`${this.logHead} Invalid ${deviceType} device added event`);
        return;
    }

    console.log(`${this.logHead} ${deviceType} device added:`, device);

    // Update the appropriate device list
    const updatePromise =
        deviceType === "bluetooth" ? this.updateDeviceList("bluetooth") : this.updateDeviceList("serial");

    updatePromise.then(() => {
        const selectedDevice = this.selectActivePort(device);

        if (selectedDevice === device.path) {
            EventBus.$emit(`device-handler:auto-select-serial-device`, selectedDevice);
        }
    });
};

/**
 * Update device list with common implementation
 * @param {string} deviceType - Type of device ('serial', 'bluetooth', 'usb')
 * @returns {Promise} - Promise that resolves after updating the ports list
 */
DeviceHandler.updateDeviceList = async function (deviceType) {
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
            default:
                console.warn(`${this.logHead} Unknown device type: ${deviceType}`);
                return [];
        }

        // Sort the ports
        const orderedPorts = this.sortPorts(ports);

        // Update the appropriate properties based on device type
        switch (deviceType) {
            case "bluetooth":
                this.bluetoothAvailable = orderedPorts.length > 0;
                this.currentBluetoothPorts = [...orderedPorts];
                console.log(`${this.logHead} Found bluetooth port(s)`, orderedPorts);
                break;
            case "usb":
                this.dfuAvailable = orderedPorts.length > 0;
                this.currentUsbPorts = [...orderedPorts];
                console.log(`${this.logHead} Found DFU port(s)`, orderedPorts);
                break;
            case "serial":
                this.portAvailable = orderedPorts.length > 0;
                this.currentSerialPorts = [...orderedPorts];
                console.log(`${this.logHead} Found serial port(s)`, orderedPorts);
                break;
            default:
                console.warn(`${this.logHead} Unknown device type for updating ports: ${deviceType}`);
                return [];
        }

        return orderedPorts;
    } catch (error) {
        console.error(`${this.logHead} Error updating ${deviceType} devices:`, error);
        return [];
    }
};

// We need to explicit make it reactive. If not, Vue3 does not detect correctly changes in array properties
// like currentSerialPorts, currentUsbPorts, currentBluetoothPorts
export default reactive(DeviceHandler);
