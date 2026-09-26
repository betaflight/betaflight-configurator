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

import { reactive, onUnmounted } from "vue";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { useFlightControllerStore } from "@/stores/fc";

export function useAdjustmentsPolling() {
    const fcStore = useFlightControllerStore();
    const rcChannelData = reactive<Record<number, number | undefined>>({});

    let rcDataInterval: ReturnType<typeof setInterval> | null = null;

    const updateRcData = () => {
        const auxCount = fcStore.rc.active_channels - 4;
        for (let auxChannelIndex = 0; auxChannelIndex < auxCount; auxChannelIndex++) {
            rcChannelData[auxChannelIndex] = fcStore.rc.channels[auxChannelIndex + 4];
        }
    };

    const startRcDataPolling = () => {
        if (rcDataInterval) {
            updateRcData();
            return;
        }
        updateRcData();
        rcDataInterval = setInterval(() => {
            MSP.send_message(MSPCodes.MSP_RC, false, false, updateRcData);
        }, 50);
    };

    const stopRcDataPolling = () => {
        if (rcDataInterval) {
            clearInterval(rcDataInterval);
            rcDataInterval = null;
        }
    };

    onUnmounted(() => {
        stopRcDataPolling();
    });

    return { rcChannelData, startRcDataPolling, stopRcDataPolling };
}
