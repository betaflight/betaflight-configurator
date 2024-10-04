import CONFIGURATOR from "./data_storage";
import serialWeb from "./webSerial.js";
import BT from "./protocols/bluetooth.js";
import websocketSerial from "./protocols/websocket.js";
import virtualSerial from "./virtualSerial.js";

export const serialShim = () => {
    if (CONFIGURATOR.virtualMode) {
        return virtualSerial;
    }
    if (CONFIGURATOR.manualMode) {
        return websocketSerial;
    }
    if (CONFIGURATOR.bluetoothMode) {
        return BT;
    }
    return serialWeb;
};
