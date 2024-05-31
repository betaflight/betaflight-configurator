import GUI from "./gui";
import FC from "./fc";
import { i18n } from "./localization";
import { get as getConfig } from "./ConfigStorage";
import { isWeb } from "./utils/isWeb";
import { usbDevices } from "./usb_devices";
import { serialShim } from "./serial_shim.js";
import { usbShim } from "./usb_shim.js";
import { EventBus } from "../components/eventBus";

const serial = serialShim();
const usb = usbShim();

const DEFAULT_PORT = 'noselection';
const DEFAULT_BAUDS = 115200;

const PortHandler = new function () {
    this.currentSerialPorts = [];
    this.currentUsbPorts = [];
    this.portPicker = {
        selectedPort: DEFAULT_PORT,
        selectedBauds: DEFAULT_BAUDS,
        portOverride: "/dev/rfcomm0",
        virtualMspVersion: "1.46.0",
        autoConnect: getConfig('autoConnect').autoConnect,
    };
    this.portPickerDisabled = false;
    this.dfuAvailable = false;
    this.portAvailable = false;
    this.showAllSerialDevices = false;
    this.showVirtualMode = getConfig('showVirtualMode').showVirtualMode;
    this.showManualMode = getConfig('showManualMode').showManualMode;
    this.showAllSerialDevices = getConfig('showAllSerialDevices').showAllSerialDevices;
};

PortHandler.initialize = function () {

    EventBus.$on('ports-input:request-permission', this.askSerialPermissionPort.bind(this));
    EventBus.$on('ports-input:change', this.onChangeSelectedPort.bind(this));

    serial.addEventListener("addedDevice", (event) => this.addedSerialDevice(event.detail));
    serial.addEventListener("removedDevice", (event) => this.removedSerialDevice(event.detail));

    usb.addEventListener("addedDevice", (event) => this.addedUsbDevice(event.detail));

    this.addedUsbDevice();
    this.addedSerialDevice();
};

PortHandler.setShowVirtualMode = function (showVirtualMode) {
    this.showVirtualMode = showVirtualMode;
    this.selectActivePort();
};

PortHandler.setShowManualMode = function (showManualMode) {
    this.showManualMode = showManualMode;
    this.selectActivePort();
};

PortHandler.addedSerialDevice = function (device) {
    this.updateCurrentSerialPortsList()
    .then(() => {
        const selectedPort = this.selectActivePort(device);
        if (!device || selectedPort === device.path) {
            // Send this event when the port handler auto selects a new device
            EventBus.$emit('port-handler:auto-select-serial-device', selectedPort);
        }
    });
};

PortHandler.removedSerialDevice = function (device) {
    this.updateCurrentSerialPortsList()
    .then(() => {
        if (this.portPicker.selectedPort === device.path) {
            this.selectActivePort();
        }
    });
};

PortHandler.addedUsbDevice = function (device) {
    this.updateCurrentUsbPortsList()
    .then(() => {
        const selectedPort = this.selectActivePort(device);
        if (!device || selectedPort === device.path) {
            // Send this event when the port handler auto selects a new device
            EventBus.$emit('port-handler:auto-select-usb-device', selectedPort);
        }
    });
};

PortHandler.onChangeSelectedPort = function(port) {
    this.portPicker.selectedPort = port;
};

PortHandler.updateCurrentSerialPortsList = function () {
    return serial.getDevices()
    .then((ports) => {
        const orderedPorts = this.sortPorts(ports);
        this.portAvailable = orderedPorts.length > 0;
        this.currentSerialPorts = orderedPorts;
    });
};

PortHandler.updateCurrentUsbPortsList = function () {
    return usb.getDevices()
    .then((ports) => {
        const orderedPorts = this.sortPorts(ports);
        this.dfuAvailable = orderedPorts.length > 0;
        this.currentUsbPorts = orderedPorts;
    });
};

PortHandler.sortPorts = function(ports) {
    return ports.sort(function(a, b) {
        return a.path.localeCompare(b.path, window.navigator.language, {
            numeric: true,
            sensitivity: 'base',
        });
    });
};

PortHandler.askSerialPermissionPort = function() {
    serial.requestPermissionDevice()
    .then((port) => {
        // When giving permission to a new device, the port is selected in the handleNewDevice method, but if the user
        // selects a device that had already permission, or cancels the permission request, we need to select the port
        // so do it here too
        this.selectActivePort(port);
    });
};

PortHandler.selectActivePort = function(suggestedDevice) {

    const deviceFilter = ['AT32', 'CP210', 'SPR', 'STM'];
    let selectedPort;

    // Return the same that is connected to serial
    if (serial.connected) {
        selectedPort = serial.getConnectedPort();
    }

    // Return the same that is connected to usb (dfu mode)
    if (usb.usbDevice) {
        selectedPort = usb.getConnectedPort();
    }

    // Return the suggested device (the new device that has been detected)
    if (!selectedPort && suggestedDevice) {
        selectedPort = suggestedDevice.path;
    }

    // Return some serial port that is recognized by the filter
    if (!selectedPort) {
        selectedPort = this.currentUsbPorts.find(device => deviceFilter.some(filter => device.displayName.includes(filter)));
        if (selectedPort) {
            selectedPort = selectedPort.path;
        }
    }

    // Return some usb port that is recognized by the filter
    if (!selectedPort) {
        selectedPort = this.currentSerialPorts.find(device => deviceFilter.some(filter => device.displayName.includes(filter)));
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

    console.log(`Porthandler automatically selected device is '${this.portPicker.selectedPort}'`);
    return selectedPort;
};

/************************************
// TODO all the methods from here need to be refactored or removed
************************************/

PortHandler.check_usb_devices = function (callback) {

    // TODO needs USB code refactor for web
    if (isWeb()) {
        return;
    }

    const self = this;

    chrome.usb.getDevices(usbDevices, function (result) {

        const dfuElement = self.portPickerElement.children("[value='DFU']");
        if (result.length) {
            // Found device in DFU mode, add it to the list
            if (!dfuElement.length) {
                self.portPickerElement.empty();

                const productName = result[0].productName;
                const usbText = productName ? `DFU - ${productName}` : 'DFU';

                self.portPickerElement.append($('<option/>', {
                    value: "DFU",
                    text: usbText,
                    /**
                     * @deprecated please avoid using `isDFU` and friends for new code.
                     */
                    data: {isDFU: true},
                }));

                self.portPickerElement.append($('<option/>', {
                    value: DEFAULT_PORT,
                    text: i18n.getMessage('portsSelectManual'),
                    /**
                     * @deprecated please avoid using `isDFU` and friends for new code.
                     */
                    data: {isManual: true},
                }));

                self.portPickerElement.val('DFU').trigger('change');
                self.setPortsInputWidth();
                self.dfuAvailable = true;
            }
        } else if (dfuElement.length) {
            dfuElement.remove();
            self.setPortsInputWidth();
            self.dfuAvailable = false;

            if ($('option:selected', self.portPickerElement).val() !== 'DFU') {
                if (!(GUI.connected_to || GUI.connect_lock)) {
                    FC.resetState();
                }

                if (self.dfuAvailable) {
                    self.portPickerElement.trigger('change');
                }
            }
        }

        if (callback) {
            callback(self.dfuAvailable);
        }
    });
};

PortHandler.flush_callbacks = function () {
    let killed = 0;

    for (let i = this.port_detected_callbacks?.length - 1; i >= 0; i--) {
        if (this.port_detected_callbacks[i].timer) {
            clearTimeout(this.port_detected_callbacks[i].timer);
        }
        this.port_detected_callbacks.splice(i, 1);

        killed++;
    }

    for (let i = this.port_removed_callbacks?.length - 1; i >= 0; i--) {
        if (this.port_removed_callbacks[i].timer) {
            clearTimeout(this.port_removed_callbacks[i].timer);
        }
        this.port_removed_callbacks.splice(i, 1);

        killed++;
    }

    return killed;
};

export default PortHandler;
