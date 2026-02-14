/**
 * Motor Configuration Tracking Composable
 * Watches all configuration changes and tracks them
 * Based on original motors.js disableHandler
 */

import { watch } from "vue";
import { useFlightControllerStore } from "@/stores/fc";

export function useMotorConfiguration(motorsState, motorsTestingEnabled, stopMotorTesting) {
    const fcStore = useFlightControllerStore();

    /**
     * Track a value change
     * @param {string} key - Configuration key
     * @param {any} newValue - New value
     * @param {any} oldValue - Old value
     */
    const handleChange = (key, newValue, oldValue) => {
        if (newValue !== oldValue) {
            motorsState.trackChange(key, newValue);

            // CRITICAL SAFETY: Stop motor testing if any config changes
            if (motorsTestingEnabled.value) {
                stopMotorTesting();
            }
        }
    };

    /**
     * Setup watchers for all configuration fields
     */
    const setupConfigWatchers = () => {
        // Mixer configuration
        watch(
            () => fcStore.mixerConfig.mixer,
            (newVal, oldVal) => handleChange("mixer", newVal, oldVal),
        );

        watch(
            () => fcStore.mixerConfig.reverseMotorDir,
            (newVal, oldVal) => handleChange("reverseMotorSwitch", newVal, oldVal),
        );

        // ESC Protocol
        watch(
            () => fcStore.pidAdvancedConfig.fast_pwm_protocol,
            (newVal, oldVal) => handleChange("escprotocol", newVal + 1, oldVal + 1),
        );

        // Features
        watch(
            () => fcStore.features?.features?.isEnabled?.("MOTOR_STOP") ?? false,
            (newVal, oldVal) => handleChange("feature4", newVal, oldVal),
        );

        watch(
            () => fcStore.features?.features?.isEnabled?.("3D") ?? false,
            (newVal, oldVal) => handleChange("feature12", newVal, oldVal),
        );

        // 3D Configuration
        watch(
            () => fcStore.motor3dConfig.deadband3d_low,
            (newVal, oldVal) => handleChange("_3ddeadbandlow", newVal, oldVal),
        );

        watch(
            () => fcStore.motor3dConfig.deadband3d_high,
            (newVal, oldVal) => handleChange("_3ddeadbandhigh", newVal, oldVal),
        );

        watch(
            () => fcStore.motor3dConfig.neutral,
            (newVal, oldVal) => handleChange("_3dneutral", newVal, oldVal),
        );

        // Motor throttle configuration
        watch(
            () => fcStore.motorConfig.minthrottle,
            (newVal, oldVal) => handleChange("minthrottle", newVal, oldVal),
        );

        watch(
            () => fcStore.motorConfig.maxthrottle,
            (newVal, oldVal) => handleChange("maxthrottle", newVal, oldVal),
        );

        watch(
            () => fcStore.motorConfig.mincommand,
            (newVal, oldVal) => handleChange("mincommand", newVal, oldVal),
        );

        watch(
            () => fcStore.motorConfig.motor_poles,
            (newVal, oldVal) => handleChange("motorPoles", newVal, oldVal),
        );

        // DShot bidirectional
        watch(
            () => fcStore.motorConfig.use_dshot_telemetry,
            (newVal, oldVal) => handleChange("dshotbidir", newVal, oldVal),
        );

        // ESC Sensor
        watch(
            () => fcStore.motorConfig.use_esc_sensor,
            (newVal, oldVal) => handleChange("ESC_SENSOR", newVal, oldVal),
        );

        // Unsynced PWM
        watch(
            () => fcStore.pidAdvancedConfig.use_unsyncedPwm,
            (newVal, oldVal) => handleChange("use_unsyncedPwm", newVal, oldVal),
        );

        // Motor PWM rate
        watch(
            () => fcStore.pidAdvancedConfig.motor_pwm_rate,
            (newVal, oldVal) => handleChange("motor_pwm_rate", newVal, oldVal),
        );

        // Motor idle percentage
        watch(
            () => fcStore.pidAdvancedConfig.motorIdle,
            (newVal, oldVal) => handleChange("motorIdle", newVal, oldVal),
        );

        // Idle min RPM
        watch(
            () => fcStore.advancedTuning.idleMinRpm,
            (newVal, oldVal) => handleChange("idleMinRpm", newVal, oldVal),
        );
    };

    return {
        setupConfigWatchers,
    };
}
