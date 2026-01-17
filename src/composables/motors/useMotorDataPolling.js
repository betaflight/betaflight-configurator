/**
 * Motor Data Polling Composable
 * Handles 50ms polling for motor data and telemetry
 * Based on original motors.js interval polling
 */

import { ref, onMounted, onUnmounted } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import GUI from "@/js/gui";

export function useMotorDataPolling(motorsTestingEnabled) {
    const fcStore = useFlightControllerStore();

    const motorTelemetry = ref([]);
    const powerStats = ref({
        mAhDrawn: 0,
        WhDrawn: 0,
    });

    let pollingIntervalId = null;

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
