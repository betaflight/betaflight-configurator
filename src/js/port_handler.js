import { get as getConfig } from "./ConfigStorage";
import { EventBus } from "../components/eventBus";
import { serial } from "./serial.js";
import WEBUSBDFU from "./protocols/webusbdfu";
import { reactive } from "vue";
import {
    checkCompatibility,
    checkBluetoothSupport,
    checkSerialSupport,
    checkUsbSupport,
} from "./utils/checkCompatibility.js";

const DEFAULT_PORT = "noselection";
const DEFAULT_BAUDS = 115200;

const PortHandler = new (function () {
    this.logHead = "[PORTHANDLER]";

    this.currentSerialPorts = [];
    this.currentUsbPorts = [];
    this.currentBluetoothPorts = [];

    this.portPicker = {
        selectedPort: DEFAULT_PORT,
        selectedBauds: DEFAULT_BAUDS,
        portOverride: getConfig("portOverride", "/dev/rfcomm0").portOverride,
        virtualMspVersion: "1.46.0",
        autoConnect: getConfig("autoConnect", false).autoConnect,
    };

    this.portPickerDisabled = false;

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
})();

PortHandler.initialize = function () {
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
    WEBUSBDFU.addEventListener("addedDevice", (event) => this.addedUsbDevice(event.detail));
    WEBUSBDFU.addEventListener("removedDevice", (event) => this.removedUsbDevice(event.detail));

    // Initial device discovery using the serial facade
    this.refreshAllDeviceLists();
};

// Refactored refreshAllDeviceLists to use updateDeviceList
PortHandler.refreshAllDeviceLists = async function () {
    // Update all device lists in parallel
    return Promise.all([
        this.updateDeviceList("serial"),
        this.updateDeviceList("bluetooth"),
        this.updateDeviceList("usb"),
    ]).then(() => {
        this.selectActivePort();
    });
};

PortHandler.setShowVirtualMode = function (showVirtualMode) {
    this.showVirtualMode = showVirtualMode;
    this.selectActivePort();
};

PortHandler.setShowManualMode = function (showManualMode) {
    this.showManualMode = showManualMode;
    this.selectActivePort();
};

PortHandler.setShowAllSerialDevices = function (showAllSerialDevices) {
    this.showAllSerialDevices = showAllSerialDevices;
};

PortHandler.removedSerialDevice = function (device) {
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

    const wasSelectedPort = this.portPicker.selectedPort === devicePath;

    updatePromise.then(() => {
        if (wasSelectedPort) {
            this.selectActivePort();

            // Send event for UI components that might need to update
            EventBus.$emit("port-handler:device-removed", devicePath);
        }
    });
};

PortHandler.addedUsbDevice = function (device) {
    this.updateDeviceList("usb").then(() => {
        const selectedPort = this.selectActivePort(device);
        if (selectedPort === device?.path) {
            // Send event when the port handler auto selects a new USB device
            EventBus.$emit("port-handler:auto-select-usb-device", selectedPort);
        }
    });
};

PortHandler.removedUsbDevice = function (device) {
    console.log(`${this.logHead} USB device removal event received:`, device);

    const devicePath = device?.path || (typeof device === "string" ? device : null);

    if (!devicePath) {
        console.warn(`${this.logHead} USB device removal event missing path information`, device);
        this.updateDeviceList("usb").then(() => {
            this.selectActivePort();
        });
        return;
    }

    const wasSelectedPort = this.portPicker.selectedPort === devicePath;

    this.updateDeviceList("usb").then(() => {
        this.selectActivePort();

        if (wasSelectedPort) {
            EventBus.$emit("port-handler:device-removed", devicePath);
        }
    });
};

PortHandler.onChangeSelectedPort = function (port) {
    this.portPicker.selectedPort = port;
};

/**
 * Request permission for a device of the specified type
 * @param {string} deviceType - Type of device ('serial', 'bluetooth', 'usb')
 */
PortHandler.requestDevicePermission = async function (protocol) {
    try {
        const port = await (protocol === "usb"
            ? WEBUSBDFU.requestPermission()
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

PortHandler.sortPorts = function (ports) {
    return ports.sort(function (a, b) {
        const locale = typeof window !== "undefined" && window.navigator ? window.navigator.language : "en";

        return a.path.localeCompare(b.path, locale, {
            numeric: true,
            sensitivity: "base",
        });
    });
};

PortHandler.selectActivePort = function (suggestedDevice = false) {
    const deviceFilter = ["AT32", "CP210", "SPR", "STM"];
    let selectedPort;

    // First check for active connections
    if (serial.connected) {
        selectedPort = this.currentSerialPorts.find((device) => device === serial.getConnectedPort());
    }

    // Return the same that is connected to WEBUSBDFU (dfu mode)
    if (WEBUSBDFU.usbDevice) {
        selectedPort = this.currentUsbPorts.find((device) => device === WEBUSBDFU.getConnectedPort());
    }

    // If there is a connection, return it
    if (selectedPort) {
        console.log(`${this.logHead} Using connected device: ${selectedPort.path}`);
        selectedPort = selectedPort.path;
        return selectedPort;
    }

    // Return the suggested device (the new device that has been detected)
    if (!selectedPort && suggestedDevice) {
        selectedPort = suggestedDevice.path;
    }

    // Return some usb port that is recognized by the filter
    if (!selectedPort) {
        selectedPort = this.currentUsbPorts.find((device) =>
            deviceFilter.some((filter) => device.displayName.includes(filter)),
        );
        if (selectedPort) {
            selectedPort = selectedPort.path;
        }
    }

    // Return some serial port that is recognized by the filter
    if (!selectedPort) {
        selectedPort = this.currentSerialPorts.find((device) =>
            deviceFilter.some((filter) => device.displayName.includes(filter)),
        );
        if (selectedPort) {
            selectedPort = selectedPort.path;
        }
    }

    // Return some bluetooth port that is recognized by the filter
    if (!selectedPort) {
        selectedPort = this.currentBluetoothPorts.find((device) =>
            deviceFilter.some((filter) => device.displayName.includes(filter)),
        );
        if (selectedPort) {
            selectedPort = selectedPort.path;
        }
    }

    // Return the virtual port
    if (!selectedPort && this.showVirtualMode) {
        selectedPort = "virtual";
    }

    // Return the manual port
    if (!selectedPort && this.showManualMode) {
        selectedPort = "manual";
    }

    // Return the default port if no other port was selected
    this.portPicker.selectedPort = selectedPort || DEFAULT_PORT;

    console.log(
        `${this.logHead} Automatically selected device is '${this.portPicker.selectedPort}' - suggested:`,
        suggestedDevice,
    );

    return selectedPort;
};

// Create a unified handler for device addition
PortHandler.handleDeviceAdded = function (device, deviceType) {
    if (!device) {
        console.warn(`${this.logHead} Invalid ${deviceType} device added event`);
        return;
    }

    console.log(`${this.logHead} ${deviceType} device added:`, device);

    // Update the appropriate device list
    const updatePromise =
        deviceType === "bluetooth" ? this.updateDeviceList("bluetooth") : this.updateDeviceList("serial");

    updatePromise.then(() => {
        const selectedPort = this.selectActivePort(device);

        if (selectedPort === device.path) {
            EventBus.$emit(`port-handler:auto-select-serial-device`, selectedPort);
        }
    });
};

/**
 * Update device list with common implementation
 * @param {string} deviceType - Type of device ('serial', 'bluetooth', 'usb')
 * @returns {Promise} - Promise that resolves after updating the ports list
 */
PortHandler.updateDeviceList = async function (deviceType) {
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
                    ports = await WEBUSBDFU.getDevices();
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
export default reactive(PortHandler);
