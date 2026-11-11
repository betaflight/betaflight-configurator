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
import { useInterval } from "@/composables/useInterval";

/**
 * MSP traffic for the Modes (Auxiliary) tab: the initial load and the live RC / status polling.
 * The tab keeps only UI state and reads the results from the flightController store.
 */
export function useAuxiliaryData() {
    const { addInterval } = useInterval();

    /** Fetch everything the tab renders from; the replies land in the flightController store. */
    const loadAuxiliaryData = async () => {
        await MSP.promise(MSPCodes.MSP_BOXNAMES);
        await MSP.promise(MSPCodes.MSP_MODE_RANGES);
        await MSP.promise(MSPCodes.MSP_MODE_RANGES_EXTRA);
        await MSP.promise(MSPCodes.MSP_BOXIDS);
        await MSP.promise(MSPCodes.MSP_RSSI_CONFIG);
        await MSP.promise(MSPCodes.MSP_RC);
        await new Promise<void>((resolve) => mspHelper.loadSerialConfig(resolve));
    };

    /**
     * Poll RC channels (50 ms) and FC status (250 ms) until the tab unmounts.
     * @param onRcData called after each MSP_RC reply, once the store holds the new channels
     */
    const startPolling = (onRcData: () => void) => {
        addInterval("aux_data_pull", () => MSP.send_message(MSPCodes.MSP_RC, false, false, onRcData), 50);
        addInterval("status_pull", () => MSP.send_message(MSPCodes.MSP_STATUS), 250, true);
    };

    return { loadAuxiliaryData, startPolling };
}
