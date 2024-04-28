import CONFIGURATOR from "./data_storage";
import serialNWJS from "./serial.js";
import serialWeb from "./webSerial.js";
import { isWeb } from "./utils/isWeb";

export let serialShim = () => CONFIGURATOR.virtualMode ? serialNWJS : isWeb() ? serialWeb : serialNWJS;
