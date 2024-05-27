import GUI from "./gui";
import FC from "./fc";
import { i18n } from "./localization";
import { get as getConfig } from "./ConfigStorage";
import { isWeb } from "./utils/isWeb";
import { usbDevices } from "./usb_devices";
import { serialShim } from "./serial_shim.js";
import { EventBus } from "../components/eventBus";

const serial = serialShim();

const DEFAULT_PORT = 'noselection';
const DEFAULT_BAUDS = 115200;

const PortHandler = new function () {
    this.currentPorts = [];
    this.initialPorts = false;
    this.portPicker = {
        selectedPort: DEFAULT_PORT,
        selectedBauds: DEFAULT_BAUDS,
        portOverride: "/dev/rfcomm0",
        virtualMspVersion: "1.46.0",
        autoConnect: getConfig('autoConnect').autoConnect,
    };
    this.portPickerDisabled = false;
    this.port_detected_callbacks = [];
    this.port_removed_callbacks = [];
    this.dfu_available = false;
    this.port_available = false;
    this.showAllSerialDevices = false;
    this.showVirtualMode = getConfig('showVirtualMode').showVirtualMode;
    this.showManualMode = getConfig('showManualMode').showManualMode;
};

PortHandler.initialize = function () {

    EventBus.$on('ports-input:request-permission', this.askPermissionPort.bind(this));
    EventBus.$on('ports-input:change', this.onChangeSelectedPort.bind(this));

    serial.addEventListener("addedDevice", this.check_serial_devices.bind(this));
    serial.addEventListener("removedDevice", this.check_serial_devices.bind(this));

    this.reinitialize();    // just to prevent code redundancy
};

PortHandler.setShowVirtualMode = function (showVirtualMode) {
    this.showVirtualMode = showVirtualMode;
    this.selectActivePort();
};

PortHandler.setShowManualMode = function (showManualMode) {
    this.showManualMode = showManualMode;
    this.selectActivePort();
};

PortHandler.reinitialize = function () {
    this.initialPorts = false;

    this.showAllSerialDevices = getConfig('showAllSerialDevices').showAllSerialDevices;

    this.check();   // start listening, check after TIMEOUT_CHECK ms
};

PortHandler.check = function () {
    const self = this;

    if (!self.port_available) {
        self.check_usb_devices();
    }

    if (!self.dfu_available) {
        self.check_serial_devices();
    }

};

PortHandler.check_serial_devices = function () {
    const self = this;

    const updatePorts = function(cp) {

        self.currentPorts = cp;

        // auto-select port (only during initialization)
        if (!self.initialPorts) {
            self.updatePortSelect(self.currentPorts);
            self.selectActivePort();
            self.initialPorts = {...self.currentPorts};
            GUI.updateManualPortVisibility();
            self.detectPort();
        } else {
            self.removePort();
            self.detectPort();
            // already done in detectPort
            // self.selectActivePort();
        }
    };


    serial.getDevices().then(updatePorts);
};

PortHandler.onChangeSelectedPort = function(port) {
    this.portPicker.selectedPort = port;
};

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
                self.dfu_available = true;
            }
        } else if (dfuElement.length) {
            dfuElement.remove();
            self.setPortsInputWidth();
            self.dfu_available = false;

            if ($('option:selected', self.portPickerElement).val() !== 'DFU') {
                if (!(GUI.connected_to || GUI.connect_lock)) {
                    FC.resetState();
                }

                if (self.dfu_available) {
                    self.portPickerElement.trigger('change');
                }
            }
        }

        if (callback) {
            callback(self.dfu_available);
        }
    });
};

PortHandler.removePort = function() {
    const self = this;
    const removePorts = self.array_difference(self.initialPorts, self.currentPorts);

    if (removePorts.length) {
        console.log(`PortHandler - Removed: ${JSON.stringify(removePorts)}`);
        self.port_available = false;
        // disconnect "UI" - routine can't fire during atmega32u4 reboot procedure !!!
        if (removePorts.some(port => port.path === GUI.connected_to)) {
            $('div.connect_controls a.connect').click();
            $('div.connect_controls a.connect.active').click();
        }
        // trigger callbacks (only after initialization)
        for (let i = (self.port_removed_callbacks.length - 1); i >= 0; i--) {
            const obj = self.port_removed_callbacks[i];

            // remove timeout
            clearTimeout(obj.timer);

            // trigger callback
            obj.code(removePorts);

            // remove object from array
            const index = self.port_removed_callbacks.indexOf(obj);
            if (index > -1) {
                self.port_removed_callbacks.splice(index, 1);
            }
        }
        for (const port of removePorts) {
            self.initialPorts.splice(self.initialPorts.indexOf(port, 1));
        }
        self.updatePortSelect(self.initialPorts);
    }
};

PortHandler.detectPort = function() {
    const self = this;
    const newPorts = self.array_difference(self.currentPorts, self.initialPorts);

    if (newPorts.length) {
        self.updatePortSelect(self.currentPorts);
        console.log(`PortHandler - Found: ${JSON.stringify(newPorts)}`);

        if (newPorts.length === 1) {
            this.portPicker.selectedPort = newPorts[0].path;
        } else {
            self.selectActivePort();
        }

        self.port_available = true;

        // auto-connect if enabled
        if (this.portPicker.autoConnect && !GUI.connecting_to && !GUI.connected_to && GUI.active_tab !== 'firmware_flasher') {
            // start connect procedure. We need firmware flasher protection over here
            $('div.connect_controls a.connect').click();
        }
        // trigger callbacks
        for (let i = (self.port_detected_callbacks.length - 1); i >= 0; i--) {
            const obj = self.port_detected_callbacks[i];

            // remove timeout
            clearTimeout(obj.timer);

            // trigger callback
            obj.code(newPorts);

            // remove object from array
            const index = self.port_detected_callbacks.indexOf(obj);
            if (index > -1) {
                self.port_detected_callbacks.splice(index, 1);
            }
        }
        self.initialPorts = self.currentPorts;
    }
};

PortHandler.sortPorts = function(ports) {
    return ports.sort(function(a, b) {
        return a.path.localeCompare(b.path, window.navigator.language, {
            numeric: true,
            sensitivity: 'base',
        });
    });
};

PortHandler.updatePortSelect = function (ports) {
    ports = this.sortPorts(ports);
    this.currentPorts = ports;
};

PortHandler.askPermissionPort = function() {
    serial.requestPermissionDevice().then(() => {
        this.check_serial_devices();
    }).catch(() => {
        // In the catch we call the check_serial_devices too to change the request permission option from the select for other
        this.check_serial_devices();
    });
};

PortHandler.selectActivePort = function() {

    let selectedPort;

    const deviceFilter = ['AT32', 'CP210', 'SPR', 'STM'];
    for (let port of this.currentPorts) {
        const portName = port.displayName;
        if (portName) {
            const pathSelect = port.path;
            const deviceRecognized = deviceFilter.some(device => portName.includes(device));
            const legacyDeviceRecognized = portName.includes('usb');
            if (deviceRecognized || legacyDeviceRecognized) {
                selectedPort = pathSelect;
                this.port_available = true;
                console.log(`Porthandler detected device ${portName} on port: ${pathSelect}`);
            }
        }
    }

    if (!selectedPort)  {
        if (this.showVirtualMode) {
            selectedPort = "virtual";
        } else if (this.showManualMode) {
            selectedPort = "manual";
        }
    }

    this.portPicker.selectedPort = selectedPort || DEFAULT_PORT;
    console.log(`Porthandler default device is '${this.portPicker.selectedPort}'`);
};

PortHandler.port_detected = function(name, code, timeout, ignore_timeout) {
    const self = this;
    const obj = {'name': name,
                 'code': code,
                 'timeout': (timeout) ? timeout : 10000,
                };

    if (!ignore_timeout) {
        obj.timer = setTimeout(function() {
            console.log(`PortHandler - timeout - ${obj.name}`);

            // trigger callback
            code(false);

            // remove object from array
            const index = self.port_detected_callbacks.indexOf(obj);
            if (index > -1) {
                self.port_detected_callbacks.splice(index, 1);
            }
        }, (timeout) ? timeout : 10000);
    } else {
        obj.timer = false;
        obj.timeout = false;
    }

    this.port_detected_callbacks.push(obj);

    return obj;
};

PortHandler.port_removed = function (name, code, timeout, ignore_timeout) {
    const self = this;
    const obj = {'name': name,
                 'code': code,
                 'timeout': (timeout) ? timeout : 10000,
                };

    if (!ignore_timeout) {
        obj.timer = setTimeout(function () {
            console.log(`PortHandler - timeout - ${obj.name}`);

            // trigger callback
            code(false);

            // remove object from array
            const index = self.port_removed_callbacks.indexOf(obj);
            if (index > -1) {
                self.port_removed_callbacks.splice(index, 1);
            }
        }, (timeout) ? timeout : 10000);
    } else {
        obj.timer = false;
        obj.timeout = false;
    }

    this.port_removed_callbacks.push(obj);

    return obj;
};

// accepting single level array with "value" as key
PortHandler.array_difference = function (firstArray, secondArray) {
    const cloneArray = [];

    // create hardcopy
    for (let i = 0; i < firstArray.length; i++) {
        cloneArray.push(firstArray[i]);
    }

    for (let i = 0; i < secondArray.length; i++) {
        const elementExists = cloneArray.findIndex(element => element.path === secondArray[i].path);
        if (elementExists !== -1) {
            cloneArray.splice(elementExists, 1);
        }
    }

    return cloneArray;
};

PortHandler.flush_callbacks = function () {
    let killed = 0;

    for (let i = this.port_detected_callbacks.length - 1; i >= 0; i--) {
        if (this.port_detected_callbacks[i].timer) {
            clearTimeout(this.port_detected_callbacks[i].timer);
        }
        this.port_detected_callbacks.splice(i, 1);

        killed++;
    }

    for (let i = this.port_removed_callbacks.length - 1; i >= 0; i--) {
        if (this.port_removed_callbacks[i].timer) {
            clearTimeout(this.port_removed_callbacks[i].timer);
        }
        this.port_removed_callbacks.splice(i, 1);

        killed++;
    }

    return killed;
};

// temp workaround till everything is in modules
window.PortHandler = PortHandler;
export default PortHandler;
