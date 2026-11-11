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
import { useInterval } from "@/composables/useInterval";

/**
 * MSP reads for the Receiver tab: the initial load and the live RC polling that feeds the
 * model preview and the RC plot. Replies land in the flightController store. Every interval
 * started here is removed when the owning component unmounts.
 */
export function useReceiverData() {
    const { addInterval, removeInterval } = useInterval();

    /** Fetch the MSP state the tab renders from, in order. The serial ports load separately. */
    const loadReceiverData = async () => {
        await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
        await MSP.promise(MSPCodes.MSP_RC);
        await MSP.promise(MSPCodes.MSP_MODE_RANGES);
        await MSP.promise(MSPCodes.MSP_MODE_RANGES_EXTRA);
        await MSP.promise(MSPCodes.MSP_RSSI_CONFIG);
        await MSP.promise(MSPCodes.MSP_RC_TUNING);
        await MSP.promise(MSPCodes.MSP_RX_MAP);
        await MSP.promise(MSPCodes.MSP_RC_DEADBAND);
        await MSP.promise(MSPCodes.MSP_RX_CONFIG);
        await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
        await MSP.promise(MSPCodes.MSP_MOTOR_CONFIG);
    };

    /** Keep the store's RC channels fresh for the model preview, every 33 ms. */
    const startModelPreviewPolling = () => {
        addInterval(
            "receiver_pull_for_model_preview",
            () => {
                MSP.send_message(MSPCodes.MSP_RC, false, false);
            },
            33,
            false,
        );
    };

    /**
     * Poll RC channels for the plot, running the first request immediately.
     * @param rate polling period in ms
     * @param onRcData called after each MSP_RC reply, once the store holds the new channels
     */
    const startRcPolling = (rate: number, onRcData: () => void) => {
        addInterval("receiver_pull", () => MSP.send_message(MSPCodes.MSP_RC, false, false, onRcData), rate, true);
    };

    /**
     * Replace the plot's RC polling with one at a new period.
     * @param rate polling period in ms
     * @param onRcData called after each MSP_RC reply
     */
    const restartRcPolling = (rate: number, onRcData: () => void) => {
        removeInterval("receiver_pull");
        startRcPolling(rate, onRcData);
    };

    return { loadReceiverData, startModelPreviewPolling, startRcPolling, restartRcPolling };
}
