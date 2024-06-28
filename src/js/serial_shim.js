import CONFIGURATOR from "./data_storage";
import serialNWJS from "./serial.js";
import serialWeb from "./webSerial.js";
import BT from "./protocols/bluetooth.js";

export let serialShim = () => CONFIGURATOR.virtualMode ? serialNWJS : CONFIGURATOR.bluetoothMode ? BT : serialWeb;
