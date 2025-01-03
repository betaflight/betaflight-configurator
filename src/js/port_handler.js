import { get as getConfig } from "./ConfigStorage";
import { EventBus } from "../components/eventBus";
import serial from "./webSerial";
import usb from "./protocols/webusbdfu";
import BT from "./protocols/bluetooth";

const DEFAULT_PORT = 'noselection';
const DEFAULT_BAUDS = 115200;

const PortHandler = new function () {
    this.currentSerialPorts = [];
    this.currentUsbPorts = [];
    this.currentBluetoothPorts = [];

    this.portPicker = {
        selectedPort: DEFAULT_PORT,
        selectedBauds: DEFAULT_BAUDS,
        portOverride: getConfig('portOverride', '/dev/rfcomm0').portOverride,
        virtualMspVersion: "1.46.0",
        autoConnect: getConfig('autoConnect', false).autoConnect,
    };

    this.portPickerDisabled = false;

    this.bluetoothAvailable = false;
    this.dfuAvailable = false;
    this.portAvailable = false;
    this.showAllSerialDevices = false;
    this.showVirtualMode = getConfig('showVirtualMode', false).showVirtualMode;
    this.showManualMode = getConfig('showManualMode', false).showManualMode;
    this.showAllSerialDevices = getConfig('showAllSerialDevices', false).showAllSerialDevices;
};

PortHandler.initialize = function () {

    EventBus.$on('ports-input:request-permission-bluetooth', this.askBluetoothPermissionPort.bind(this));
    EventBus.$on('ports-input:request-permission', this.askSerialPermissionPort.bind(this));
    EventBus.$on('ports-input:change', this.onChangeSelectedPort.bind(this));

    BT.addEventListener("addedDevice", (event) => this.addedBluetoothDevice(event.detail));
    BT.addEventListener("removedDevice", (event) => this.addedBluetoothDevice(event.detail));

    serial.addEventListener("addedDevice", (event) => this.addedSerialDevice(event.detail));
    serial.addEventListener("removedDevice", (event) => this.removedSerialDevice(event.detail));

    usb.addEventListener("addedDevice", (event) => this.addedUsbDevice(event.detail));

    this.addedBluetoothDevice();
    this.addedSerialDevice();
    this.addedUsbDevice();
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

PortHandler.addedBluetoothDevice = function (device) {
    this.updateCurrentBluetoothPortsList()
    .then(() => {
        const selectedPort = this.selectActivePort(device);
        if (!device || selectedPort === device.path) {
            // Send this event when the port handler auto selects a new device
            EventBus.$emit('port-handler:auto-select-bluetooth-device', selectedPort);
        }
    });
};

PortHandler.removedBluetoothDevice = function (device) {
    this.updateCurrentBluetoothPortsList()
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

PortHandler.updateCurrentSerialPortsList = async function () {
    const ports = await serial.getDevices();
    const orderedPorts = this.sortPorts(ports);
    this.portAvailable = orderedPorts.length > 0;
    this.currentSerialPorts = orderedPorts;
};

PortHandler.updateCurrentUsbPortsList = async function () {
    const ports = await usb.getDevices();
    const orderedPorts = this.sortPorts(ports);
    this.dfuAvailable = orderedPorts.length > 0;
    this.currentUsbPorts = orderedPorts;
};

PortHandler.updateCurrentBluetoothPortsList = async function () {
    if (BT.bluetooth) {
        const ports = await BT.getDevices();
        const orderedPorts = this.sortPorts(ports);
        this.bluetoothAvailable = orderedPorts.length > 0;
        this.currentBluetoothPorts = orderedPorts;
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

PortHandler.askBluetoothPermissionPort = function() {
    if (BT.bluetooth) {
        BT.requestPermissionDevice()
        .then((port) => {
            // When giving permission to a new device, the port is selected in the handleNewDevice method, but if the user
            // selects a device that had already permission, or cancels the permission request, we need to select the port
            // so do it here too
            this.selectActivePort(port);
        });
    }
};

PortHandler.askSerialPermissionPort = function() {
    serial.requestPermissionDevice(this.showAllSerialDevices)
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
        selectedPort = this.currentSerialPorts.find(device => device === serial.getConnectedPort());
    }

    // Return the same that is connected to usb (dfu mode)
    if (usb.usbDevice) {
        selectedPort = this.currentUsbPorts.find(device => device === usb.getConnectedPort());
    }

    // Return the same that is connected to bluetooth
    if (BT.device) {
        selectedPort = this.currentBluetoothPorts.find(device => device === BT.getConnectedPort());
    }

    // Return the suggested device (the new device that has been detected)
    if (!selectedPort && suggestedDevice) {
        selectedPort = suggestedDevice.path;
    }

    // Return some usb port that is recognized by the filter
    if (!selectedPort) {
        selectedPort = this.currentUsbPorts.find(device => deviceFilter.some(filter => device.displayName.includes(filter)));
        if (selectedPort) {
            selectedPort = selectedPort.path;
        }
    }

    // Return some serial port that is recognized by the filter
    if (!selectedPort) {
        selectedPort = this.currentSerialPorts.find(device => deviceFilter.some(filter => device.displayName.includes(filter)));
        if (selectedPort) {
            selectedPort = selectedPort.path;
        }
    }

    // Return some bluetooth port that is recognized by the filter
    if (!selectedPort) {
        selectedPort = this.currentBluetoothPorts.find(device => deviceFilter.some(filter => device.displayName.includes(filter)));
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

    console.log(`[PORTHANDLER] automatically selected device is '${this.portPicker.selectedPort}'`);

    // hack to update Vue component
    const p = document.getElementById('port');
    p.value = this.portPicker.selectedPort;

    return selectedPort;
};

export default PortHandler;
