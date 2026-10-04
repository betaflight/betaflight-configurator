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

import { onScopeDispose } from "vue";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";

/** How often the Rates sub-tab asks for live stick data: 10 times per second. */
export const RATES_RC_POLL_MS = 100;

/**
 * Live stick data for the Rates sub-tab: polls MSP_RC so the rate curve labels and the throttle
 * curve follow the sticks. The timer is a plain setInterval (not a GUI interval, so it does not
 * show up in GUI's registry) and is cleared when the owning component unmounts.
 */
export function useRatesRcPolling() {
    let rcUpdateInterval: ReturnType<typeof setInterval> | null = null;

    const stopRcPolling = () => {
        if (rcUpdateInterval) {
            clearInterval(rcUpdateInterval);
            rcUpdateInterval = null;
        }
    };

    /**
     * Start polling MSP_RC.
     * @param onRcData called after each MSP_RC reply, once the store holds the new channels
     */
    const startRcPolling = (onRcData: () => void) => {
        rcUpdateInterval = setInterval(() => {
            MSP.send_message(MSPCodes.MSP_RC, false, false, onRcData);
        }, RATES_RC_POLL_MS);
    };

    onScopeDispose(stopRcPolling);

    return { startRcPolling };
}
