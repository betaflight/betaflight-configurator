import CONFIGURATOR from "./data_storage";
import serialWeb from "./webSerial.js";
import BT from "./protocols/bluetooth.js";
import virtualSerial from "./virtualSerial.js";

export let serialShim = () => CONFIGURATOR.virtualMode ? virtualSerial: CONFIGURATOR.bluetoothMode ? BT : serialWeb;
