import { i18n } from "./localization";
import FC from "./fc";

// return true if user has choose a special peripheral
function isPeripheralSelected(peripheralName) {
    for (let portIndex = 0; portIndex < FC.SERIAL_CONFIG.ports.length; portIndex++) {
        const serialPort = FC.SERIAL_CONFIG.ports[portIndex];
        if (serialPort.functions.indexOf(peripheralName) >= 0) {
            return true;
        }
    }

    return false;
}

// Adjust the real name for a modeId. Useful if it belongs to a peripheral
function adjustBoxNameIfPeripheralWithModeID(modeId, defaultName) {
    if (isPeripheralSelected("RUNCAM_DEVICE_CONTROL")) {
        switch (modeId) {
            case 32: // BOXCAMERA1
                return i18n.getMessage("modeCameraWifi");
            case 33: // BOXCAMERA2
                return i18n.getMessage("modeCameraPower");
            case 34: // BOXCAMERA3
                return i18n.getMessage("modeCameraChangeMode");
            default:
                return defaultName;
        }
    }

    return defaultName;
}

export default adjustBoxNameIfPeripheralWithModeID;
