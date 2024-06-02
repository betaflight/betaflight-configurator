import CONFIGURATOR from "./data_storage";
import serialWeb from "./webSerial.js";
import virtualSerial from "./virtualSerial.js";

export let serialShim = () => CONFIGURATOR.virtualMode ? virtualSerial : serialWeb;
