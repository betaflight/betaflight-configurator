'use strict';

const TIMEOUT_CHECK = 500; // With 250 it seems that it produces a memory leak and slowdown in some versions, reason unknown

const usbDevices = { filters: [
    {'vendorId': 1155, 'productId': 57105},
    {'vendorId': 10473, 'productId': 393},
] };

const PortHandler = new function () {
    this.initial_ports = false;
    this.port_detected_callbacks = [];
    this.port_removed_callbacks = [];
    this.dfu_available = false;
};

PortHandler.initialize = function () {

    this.portPickerElement = $('div#port-picker #port');

    // start listening, check after TIMEOUT_CHECK ms
    this.check();
};

PortHandler.check = function () {

    const self = this;

    self.check_serial_devices();
    self.check_usb_devices();

    GUI.updateManualPortVisibility();

    setTimeout(function () {
        self.check();
    }, TIMEOUT_CHECK);

};

PortHandler.check_serial_devices = function () {
    const self = this;

    serial.getDevices(function(current_ports) {
        // port got removed or initial_ports wasn't initialized yet
        if (self.array_difference(self.initial_ports, current_ports).length > 0 || !self.initial_ports) {
            const removedPorts = self.array_difference(self.initial_ports, current_ports);

            if (self.initial_ports !== false && removedPorts.length > 0) {
                console.log(`PortHandler - Removed: ${JSON.stringify(removedPorts)}`);
            }

            // disconnect "UI" if necessary
            // Keep in mind that this routine can not fire during atmega32u4 reboot procedure !!!
            if (GUI.connected_to) {
                for (let i = 0; i < removedPorts.length; i++) {
                    if (removedPorts[i] === GUI.connected_to) {
                        $('div#header_btns a.connect').click();
                    }
                }
            }

            self.update_port_select(current_ports);

            // trigger callbacks (only after initialization)
            if (self.initial_ports) {
                for (let i = (self.port_removed_callbacks.length - 1); i >= 0; i--) {
                    const obj = self.port_removed_callbacks[i];

                    // remove timeout
                    clearTimeout(obj.timer);

                    // trigger callback
                    obj.code(removedPorts);

                    // remove object from array
                    const index = self.port_removed_callbacks.indexOf(obj);
                    if (index > -1) {
                        self.port_removed_callbacks.splice(index, 1);
                    }
                }
            }

            // auto-select last used port (only during initialization)
            if (!self.initial_ports) {
                ConfigStorage.get('last_used_port', function (result) {
                    // if last_used_port was set, we try to select it
                    if (result.last_used_port) {
                        current_ports.forEach(function(port) {
                            if (port === result.last_used_port) {
                                console.log(`Selecting last used port: ${result.last_used_port}`);

                                self.portPickerElement.val(result.last_used_port);
                            }
                        });
                    } else {
                        console.log('Last used port wasn\'t saved "yet", auto-select disabled.');
                    }
                });
            }

            if (!self.initial_ports) {
                // initialize
                self.initial_ports = current_ports;
            } else {
                for (let i = 0; i < removedPorts.length; i++) {
                    self.initial_ports.splice(self.initial_ports.indexOf(removedPorts[i]), 1);
                }
            }
        }

        // new port detected
        const newPorts = self.array_difference(current_ports, self.initial_ports);

        if (newPorts.length) {
            if (newPorts.length > 0) {
                console.log(`PortHandler - Found: ${JSON.stringify(newPorts)}`);
            }

            self.update_port_select(current_ports);

            // select / highlight new port, if connected -> select connected port
            if (!GUI.connected_to) {
                self.portPickerElement.val(newPorts[0].path);
            } else {
                self.portPickerElement.val(GUI.connected_to);
            }

            // start connect procedure (if statement is valid)
            if (GUI.active_tab !== 'firmware_flasher' && GUI.auto_connect && !GUI.connecting_to && !GUI.connected_to) {
                // we need firmware flasher protection over here
                GUI.timeout_add('auto-connect_timeout', function () {
                    $('div#header_btns a.connect').click();
                }, 100); // timeout so bus have time to initialize after being detected by the system
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

            self.initial_ports = current_ports;
        }
    });

};

PortHandler.check_usb_devices = function (callback) {
    const self = this;
    chrome.usb.getDevices(usbDevices, function (result) {

        const dfuElement = self.portPickerElement.children("[value='DFU']");
        if (result.length) {
            if (!dfuElement.length) {
                let usbText;
                if (result[0].productName) {
                    usbText = (`DFU - ${result[0].productName}`);
                } else {
                    usbText = "DFU";
                }

                self.portPickerElement.append($('<option/>', {
                    value: "DFU",
                    text: usbText,
                    data: {isDFU: true},
                }));
                self.portPickerElement.val('DFU').change();
            }
            self.dfu_available = true;
        } else {
            if (dfuElement.length) {
               dfuElement.remove();
            }
            self.dfu_available = false;
        }
        if(callback) {
            callback(self.dfu_available);
        }

        if (!$('option:selected', self.portPickerElement).data().isDFU) {
            self.portPickerElement.trigger('change');
        }
    });
};

PortHandler.update_port_select = function (ports) {

    this.portPickerElement.empty();

    for (let i = 0; i < ports.length; i++) {
        let portText;
        if (ports[i].displayName) {
            portText = (`${ports[i].path} - ${ports[i].displayName}`);
        } else {
            portText = ports[i].path;
        }

        this.portPickerElement.append($("<option/>", {
            value: ports[i].path,
            text: portText,
            data: {isManual: false},
        }));
    }

    this.portPickerElement.append($("<option/>", {
        value: 'manual',
        i18n: 'portsSelectManual',
        data: {isManual: true},
    }));
    i18n.localizePage();
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
