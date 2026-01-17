/**
 * Motors Tab State Management Composable
 * Central state management for the Motors tab
 * Based on original motors.js implementation
 */

import { ref, computed } from "vue";
import { useFlightControllerStore } from "@/stores/fc";

export function useMotorsState() {
    const fcStore = useFlightControllerStore();

    // Core state tracking (matching original motors object)
    const previousDshotBidir = ref(null);
    const previousFilterDynQ = ref(null);
    const previousFilterDynCount = ref(null);
    const analyticsChanges = ref({});
    const configChanges = ref({});
    const feature3DEnabled = ref(false);
    const armed = ref(false);
    const numberOfValidOutputs = ref(0);

    // Default configuration snapshot (taken on mount)
    const defaultConfiguration = ref({});

    // Configuration has changed flag (derived from configChanges)
    const configHasChanged = computed(() => {
        return Object.keys(configChanges.value).length > 0;
    });

    /**
     * Initialize default configuration snapshot
     * Must be called when FC data is loaded
     */
    const initializeDefaults = () => {
        defaultConfiguration.value = {
            mixer: fcStore.mixerConfig.mixer,
            reverseMotorSwitch: fcStore.mixerConfig.reverseMotorDir,
            escprotocol: fcStore.pidAdvancedConfig.fast_pwm_protocol + 1,
            feature4: fcStore.features.features.isEnabled("MOTOR_STOP"),
            feature12: fcStore.features.features.isEnabled("3D"),
            _3ddeadbandlow: fcStore.motor3dConfig.deadband3d_low,
            _3ddeadbandhigh: fcStore.motor3dConfig.deadband3d_high,
            _3dneutral: fcStore.motor3dConfig.neutral,
            minthrottle: fcStore.motorConfig.minthrottle,
            maxthrottle: fcStore.motorConfig.maxthrottle,
            mincommand: fcStore.motorConfig.mincommand,
            motorPoles: fcStore.motorConfig.motor_poles,
            dshotbidir: fcStore.motorConfig.use_dshot_telemetry,
            ESC_SENSOR: fcStore.motorConfig.use_esc_sensor,
        };

        // Store previous values for comparison
        previousDshotBidir.value = fcStore.motorConfig.use_dshot_telemetry;
        previousFilterDynQ.value = fcStore.filterConfig.dyn_notch_q;
        previousFilterDynCount.value = fcStore.filterConfig.dyn_notch_count;
        feature3DEnabled.value = fcStore.features.features.isEnabled("3D");
    };

    /**
     * Track a configuration change
     * @param {string} item - Configuration item name
     * @param {any} value - New value
     */
    const trackChange = (item, value) => {
        if (item in defaultConfiguration.value) {
            if (value !== defaultConfiguration.value[item]) {
                configChanges.value[item] = value;
            } else {
                // Value reverted to default, remove from changes
                delete configChanges.value[item];
            }
        } else {
            console.warn(`Unknown config item tracked: ${item}`);
            configChanges.value[item] = value;
        }
    };

    /**
     * Reset configuration changes (after save)
     */
    const resetChanges = () => {
        configChanges.value = {};
        analyticsChanges.value = {};

        // Update defaults to current values
        initializeDefaults();
    };

    /**
     * Track analytics change
     * @param {string} key - Analytics key
     * @param {any} value - Value to track
     */
    const trackAnalytics = (key, value) => {
        analyticsChanges.value[key] = value;
    };

    return {
        // State
        previousDshotBidir,
        previousFilterDynQ,
        previousFilterDynCount,
        analyticsChanges,
        configChanges,
        configHasChanged,
        feature3DEnabled,
        armed,
        numberOfValidOutputs,
        defaultConfiguration,

        // Methods
        initializeDefaults,
        trackChange,
        resetChanges,
        trackAnalytics,
    };
}
