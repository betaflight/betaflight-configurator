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

import type { Ref } from "vue";
import semver from "semver";
import MSP from "../../js/msp";
import MSPCodes, { MSP2TextType } from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { API_VERSION_1_45 } from "../../js/data_storage";
import { useFlightControllerStore } from "@/stores/fc";

/**
 * MSP traffic for the Configuration tab: the initial load and the save writes.
 * The tab keeps the UI state and moves it in and out of the flightController store.
 */
export function useConfigurationData() {
    const fcStore = useFlightControllerStore();

    /**
     * Fetch everything the tab renders from; the replies land in the flightController store.
     * Stops between groups of requests once the tab has unmounted.
     * @param isMounted the tab's mounted state
     * @returns false if the tab unmounted before the load finished
     */
    const loadConfigurationData = async (isMounted: Ref<boolean>): Promise<boolean> => {
        if (!isMounted.value) return false;
        await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
        await MSP.promise(MSPCodes.MSP_BEEPER_CONFIG);
        await MSP.promise(MSPCodes.MSP_ARMING_CONFIG);
        await MSP.promise(MSPCodes.MSP_SENSOR_CONFIG);

        if (!isMounted.value) return false;

        if (semver.lt(fcStore.config.apiVersion, API_VERSION_1_45)) {
            await MSP.promise(MSPCodes.MSP_NAME);
        }

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            await MSP.promise(
                MSPCodes.MSP2_GET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSP2TextType.CRAFT_NAME),
            );
        }

        await MSP.promise(MSPCodes.MSP_RX_CONFIG);

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            await MSP.promise(
                MSPCodes.MSP2_GET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSP2TextType.PILOT_NAME),
            );
        }

        if (!isMounted.value) return false;

        await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);

        return isMounted.value;
    };

    /**
     * Send the tab's settings to the FC from the flightController store. The caller writes the
     * edited values into the store first, and persists (EEPROM / reboot) afterwards.
     */
    const sendConfigurationData = async () => {
        await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));

        if (fcStore.beepers) {
            await MSP.promise(MSPCodes.MSP_SET_BEEPER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BEEPER_CONFIG));
        }

        await MSP.promise(MSPCodes.MSP_SET_ARMING_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ARMING_CONFIG));

        if (semver.lt(fcStore.config.apiVersion, API_VERSION_1_45)) {
            await MSP.promise(MSPCodes.MSP_SET_NAME, mspHelper.crunch(MSPCodes.MSP_SET_NAME));
        } else {
            await MSP.promise(
                MSPCodes.MSP2_SET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSP2TextType.CRAFT_NAME),
            );
            await MSP.promise(
                MSPCodes.MSP2_SET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSP2TextType.PILOT_NAME),
            );
        }

        await MSP.promise(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG));
    };

    return { loadConfigurationData, sendConfigurationData };
}
