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

/**
 * Motor Data Polling Composable
 * Handles 50ms polling for motor data and telemetry
 * Based on original motors.js interval polling
 */

import { ref, onMounted, onUnmounted, type Ref } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import GUI from "@/js/gui";
import type { MotorTelemetryData } from "@/stores/fc.types";

export function useMotorDataPolling(_motorsTestingEnabled: Ref<boolean>) {
    const fcStore = useFlightControllerStore();

    // Starts as an empty array and becomes the store's telemetry object after the first poll.
    const motorTelemetry = ref<MotorTelemetryData | never[]>([]);
    const powerStats = ref({
        mAhDrawn: 0,
        WhDrawn: 0,
    });

    let pollingIntervalId: ReturnType<typeof GUI.interval_add> | null = null;

    /**
     * Get motor data from FC
     */
    const getMotorData = () => {
        MSP.send_message(MSPCodes.MSP_MOTOR, false, false, getMotorTelemetryData);
    };

    /**
     * Get motor telemetry data (RPM, temp, voltage, current)
     */
    const getMotorTelemetryData = () => {
        if (fcStore.motorConfig.use_dshot_telemetry || fcStore.motorConfig.use_esc_sensor) {
            MSP.send_message(MSPCodes.MSP_MOTOR_TELEMETRY, false, false, updateUI);
        } else {
            updateUI();
        }
    };

    /**
     * Update UI with latest data
     */
    const updateUI = () => {
        // Motor telemetry data is in fcStore.motorTelemetryData
        // Update reactive ref for display
        if (fcStore.motorTelemetryData) {
            motorTelemetry.value = fcStore.motorTelemetryData;
        }

        // Update power statistics
        // This would need access to battery voltage and current data
        // Implementation depends on how power data is tracked in fcStore
    };

    /**
     * Start polling
     */
    const startPolling = () => {
        if (pollingIntervalId) {
            GUI.interval_remove("motor_and_status_pull");
        }

        // Poll every 50ms (20Hz) - matches original implementation
        pollingIntervalId = GUI.interval_add("motor_and_status_pull", getMotorData, 50, true);
    };

    /**
     * Stop polling
     */
    const stopPolling = () => {
        if (pollingIntervalId) {
            GUI.interval_remove("motor_and_status_pull");
            pollingIntervalId = null;
        }
    };

    // Start polling on mount
    onMounted(() => {
        startPolling();
    });

    // Stop polling on unmount
    onUnmounted(() => {
        stopPolling();
    });

    return {
        motorTelemetry,
        powerStats,
        startPolling,
        stopPolling,
    };
}
