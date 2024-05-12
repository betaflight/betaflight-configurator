import stm32usbdfu from "./protocols/stm32usbdfu.js";
import webusbdfu from "./protocols/webusbdfu.js";
import { isWeb } from "./utils/isWeb";

export let usbShim = () => isWeb() ? webusbdfu : stm32usbdfu;
