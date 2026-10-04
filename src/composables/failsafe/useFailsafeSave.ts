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

import semver from "semver";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { API_VERSION_1_41 } from "../../js/data_storage";
import { useFlightControllerStore } from "@/stores/fc";
import { useSaving } from "@/composables/useSaving";
import { useReboot } from "@/composables/useReboot";

/**
 * Save path for the Failsafe tab: send the edited store sections to the FC, then save to
 * EEPROM and reboot.
 * @param initializeDefaults resets the tab's dirty baseline; runs once every write has been
 *   acknowledged, before the save-and-reboot
 */
export function useFailsafeSave(initializeDefaults: () => void) {
    const fcStore = useFlightControllerStore();
    const { isSaving, runSave } = useSaving();
    const { saveAndReboot } = useReboot();

    const saveConfig = () =>
        runSave(async () => {
            await MSP.promise(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG));
            await MSP.promise(MSPCodes.MSP_SET_FAILSAFE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FAILSAFE_CONFIG));

            await new Promise<void>((resolve) => {
                mspHelper.sendRxFailConfig(resolve);
            });

            await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));

            if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_41)) {
                await MSP.promise(MSPCodes.MSP_SET_GPS_RESCUE, mspHelper.crunch(MSPCodes.MSP_SET_GPS_RESCUE));
            }

            initializeDefaults();

            await saveAndReboot();
        });

    return { saveConfig, isSaving };
}
