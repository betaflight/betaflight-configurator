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
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { useFlightControllerStore } from "@/stores/fc";

/**
 * MSP writes for the Blackbox (onboard logging) tab's save. The tab keeps the rest of the
 * sequence (port conflicts, the blackbox port write, the persist and the dirty baseline),
 * because those steps belong to composables the tab already holds.
 */
export function useOnboardLoggingSave() {
    const fcStore = useFlightControllerStore();

    /**
     * Send the blackbox config, already copied into the store by the tab, then put the debug
     * mode into the store and send the advanced config, each write awaited.
     * @param debugMode the selected debug mode; read once the blackbox config has been sent, so
     *   a change made while that write is in flight is the one that is saved
     */
    const sendLoggingConfig = async (debugMode: Readonly<Ref<number>>) => {
        await MSP.promise(MSPCodes.MSP_SET_BLACKBOX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BLACKBOX_CONFIG));

        fcStore.pidAdvancedConfig.debugMode = debugMode.value;
        await MSP.promise(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG));
    };

    return { sendLoggingConfig };
}
