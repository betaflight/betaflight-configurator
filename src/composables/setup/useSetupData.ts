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

import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { isMspCancelled } from "../../js/msp/mspErrors";
import { useFlightControllerStore } from "@/stores/fc";

/**
 * MSP traffic for the Setup tab: the initial load, the live attitude / sonar requests, and the
 * reboot-to-bootloader and reset-settings commands. The tab owns the intervals and the rendering;
 * every reply lands in the flightController store.
 */
export function useSetupData() {
    const fcStore = useFlightControllerStore();

    /**
     * Fetch everything the tab renders from. A failed request is logged and the rest are skipped,
     * but the tab still renders with what it has.
     * @returns false when the load was cancelled because the tab is being torn down
     */
    const loadSetupData = async (): Promise<boolean> => {
        try {
            await MSP.promise(MSPCodes.MSP_ACC_TRIM, false);
            await MSP.promise(MSPCodes.MSP_STATUS_EX, false);
            await MSP.promise(MSPCodes.MSP2_MCU_INFO, false);
            await MSP.promise(MSPCodes.MSP_MIXER_CONFIG, false);
            // motor_count drives resolveMixerModelFile() for Custom mmix (e.g. 4 → quad_x).
            await MSP.promise(MSPCodes.MSP_MOTOR_CONFIG, false);
            await MSP.promise(MSPCodes.MSP_SENSOR_ALIGNMENT, false);
            await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG, false);
        } catch (e) {
            // Switching away mid-sequence clears the MSP queue and cancels these requests. The tab
            // is being torn down, so there is nothing left to render and nothing to report — going
            // on to render would only warn that the canvas it wants is already gone.
            if (isMspCancelled(e)) {
                return false;
            }
            console.warn("Error during Setup initialize sequence:", e);
        }
        return true;
    };

    /** Reboot the FC into its bootloader, the flash bootloader when the board has one. */
    const rebootToBootloader = () => {
        const buffer = [];
        buffer.push(
            fcStore.boardHasFlashBootloader()
                ? mspHelper.REBOOT_TYPES.BOOTLOADER_FLASH
                : mspHelper.REBOOT_TYPES.BOOTLOADER,
        );
        MSP.send_message(MSPCodes.MSP_SET_REBOOT, buffer, false);
    };

    /**
     * Restore the FC's default settings.
     * @param onReset called once the FC has acknowledged the reset
     */
    const resetSettings = (onReset: () => void) => {
        MSP.send_message(MSPCodes.MSP_RESET_CONF, false, false, onReset);
    };

    /** @param onData called once the store holds the new attitude */
    const requestAttitude = (onData: () => void) => {
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, onData);
    };

    /** @param onData called once the store holds the new sonar reading */
    const requestSonar = (onData: () => void) => {
        MSP.send_message(MSPCodes.MSP_SONAR, false, false, onData);
    };

    return { loadSetupData, rebootToBootloader, resetSettings, requestAttitude, requestSonar };
}
