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

import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { useInterval } from "@/composables/useInterval";

/**
 * MSP traffic for the Servos tab: the initial load and the live servo / status polling.
 * The tab keeps only UI state and reads the results from FC.
 */
export function useServosData() {
    const { addInterval } = useInterval();

    /** Fetch everything the tab renders from; the replies land in FC. */
    const loadServoConfigs = async () => {
        await MSP.promise(MSPCodes.MSP_SERVO_CONFIGURATIONS);
        await MSP.promise(MSPCodes.MSP_SERVO_MIX_RULES);
        await MSP.promise(MSPCodes.MSP_RC);
        await MSP.promise(MSPCodes.MSP_BOXNAMES);
    };

    /**
     * Poll servo outputs (50 ms) and FC status (250 ms) until the tab unmounts.
     * @param onServoData called after each MSP_SERVO reply, once FC.SERVO_DATA holds the new values
     */
    const startPolling = (onServoData: () => void) => {
        addInterval("servo_data_pull", () => MSP.send_message(MSPCodes.MSP_SERVO, false, false, onServoData), 50);
        addInterval("status_pull", () => MSP.send_message(MSPCodes.MSP_STATUS), 250, true);
    };

    return { loadServoConfigs, startPolling };
}
