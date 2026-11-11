/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { i18n } from "./localization";
import { useFlightControllerStore } from "../stores/fc";

// return true if user has choose a special peripheral
function isPeripheralSelected(peripheralName: string): boolean {
    const fcStore = useFlightControllerStore();
    for (const serialPort of fcStore.serialConfig.ports) {
        if (serialPort.functions.includes(peripheralName)) {
            return true;
        }
    }

    return false;
}

// Adjust the real name for a modeId. Useful if it belongs to a peripheral
function adjustBoxNameIfPeripheralWithModeID(modeId: number, defaultName: string): string {
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
