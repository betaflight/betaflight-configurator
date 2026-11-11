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
import { useFlightControllerStore } from "@/stores/fc";

/**
 * MSP reads for the Motors tab: the initial load and the IMU sample behind the sensor graph.
 * Motor / telemetry polling lives in useMotorDataPolling; the tab reads the results from the
 * flightController store.
 */
export function useMotorsData() {
    const fcStore = useFlightControllerStore();

    /**
     * Fetch everything the tab renders from, one request at a time.
     * @param onAdvancedConfig runs as soon as MSP_ADVANCED_CONFIG has landed, before the filter
     * and arming config are requested: the ESC protocol (fast_pwm_protocol) comes from that reply,
     * so this is the earliest point the tab can snapshot the motor stop state.
     */
    const loadMotorsData = async (onAdvancedConfig: () => void) => {
        await MSP.promise(MSPCodes.MSP_PID_ADVANCED);
        await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
        await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
        await MSP.promise(MSPCodes.MSP_MOTOR_CONFIG);
        // Decided on the MSP_MOTOR_CONFIG reply just received.
        if (fcStore.motorConfig.use_dshot_telemetry || fcStore.motorConfig.use_esc_sensor) {
            await MSP.promise(MSPCodes.MSP_MOTOR_TELEMETRY);
        }
        await MSP.promise(MSPCodes.MSP_MOTOR_3D_CONFIG);
        await MSP.promise(MSPCodes.MSP2_MOTOR_OUTPUT_REORDERING);
        await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);
        onAdvancedConfig();
        await MSP.promise(MSPCodes.MSP_FILTER_CONFIG);
        await MSP.promise(MSPCodes.MSP_ARMING_CONFIG);
    };

    /**
     * Request one IMU sample for the sensor graph.
     * @param onData called after the MSP_RAW_IMU reply, once the store holds the new sample
     */
    const requestRawImu = (onData: () => void) => {
        MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, onData);
    };

    return { loadMotorsData, requestRawImu };
}
