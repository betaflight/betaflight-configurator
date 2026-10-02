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
 * Motors Tab State Management Composable
 * Central state management for the Motors tab
 * Based on original motors.js implementation
 */

import { ref, computed } from "vue";
import { useFlightControllerStore } from "@/stores/fc";

/**
 * Snapshot of the motor settings the Motors tab tracks for change detection.
 * Keys are the legacy motors.js item names, not the FC store field names.
 */
export interface MotorDefaults {
    mixer: number;
    reverseMotorSwitch: number;
    escprotocol: number;
    feature4: boolean;
    feature12: boolean;
    _3ddeadbandlow: number;
    _3ddeadbandhigh: number;
    _3dneutral: number;
    minthrottle: number;
    maxthrottle: number;
    mincommand: number;
    motorPoles: number;
    dshotbidir: boolean;
    ESC_SENSOR: boolean;
    use_unsyncedPwm: number;
    motor_pwm_rate: number;
    motorIdle: number;
    idleMinRpm: number;
    motor_kv: number;
}

export type MotorConfigKey = keyof MotorDefaults;

export function useMotorsState() {
    const fcStore = useFlightControllerStore();

    // Core state tracking (matching original motors object)
    const previousDshotBidir = ref<boolean | null>(null);
    const previousFilterDynQ = ref<number | null>(null);
    const previousFilterDynCount = ref<number | null>(null);
    const analyticsChanges = ref<Record<string, unknown>>({});
    const configChanges = ref<Partial<MotorDefaults>>({});
    const feature3DEnabled = ref(false);
    const armed = ref(false);
    const numberOfValidOutputs = ref(0);

    // Default configuration snapshot (taken on mount); empty until initializeDefaults() runs
    const defaultConfiguration = ref<Partial<MotorDefaults>>({});

    // Configuration has changed flag (derived from configChanges)
    const configHasChanged = computed(() => {
        return Object.keys(configChanges.value).length > 0;
    });

    /**
     * Initialize default configuration snapshot
     * Must be called when FC data is loaded: it reads FEATURE_CONFIG without a null guard,
     * so calling it before MSP_FEATURE_CONFIG has resolved throws.
     */
    const initializeDefaults = () => {
        defaultConfiguration.value = {
            mixer: fcStore.mixerConfig.mixer,
            reverseMotorSwitch: fcStore.mixerConfig.reverseMotorDir,
            escprotocol: fcStore.pidAdvancedConfig.fast_pwm_protocol + 1,
            feature4: fcStore.features.features!.isEnabled("MOTOR_STOP"),
            feature12: fcStore.features.features!.isEnabled("3D"),
            _3ddeadbandlow: fcStore.motor3dConfig.deadband3d_low,
            _3ddeadbandhigh: fcStore.motor3dConfig.deadband3d_high,
            _3dneutral: fcStore.motor3dConfig.neutral,
            minthrottle: fcStore.motorConfig.minthrottle,
            maxthrottle: fcStore.motorConfig.maxthrottle,
            mincommand: fcStore.motorConfig.mincommand,
            motorPoles: fcStore.motorConfig.motor_poles,
            dshotbidir: fcStore.motorConfig.use_dshot_telemetry,
            ESC_SENSOR: fcStore.features.features!.isEnabled("ESC_SENSOR"),
            use_unsyncedPwm: fcStore.pidAdvancedConfig.use_unsyncedPwm,
            motor_pwm_rate: fcStore.pidAdvancedConfig.motor_pwm_rate,
            motorIdle: fcStore.pidAdvancedConfig.motorIdle,
            idleMinRpm: fcStore.advancedTuning.idleMinRpm,
            motor_kv: fcStore.motorConfig.motor_kv,
        };

        // Store previous values for comparison
        previousDshotBidir.value = fcStore.motorConfig.use_dshot_telemetry;
        previousFilterDynQ.value = fcStore.filterConfig.dyn_notch_q;
        previousFilterDynCount.value = fcStore.filterConfig.dyn_notch_count;
        feature3DEnabled.value = fcStore.features.features!.isEnabled("3D");
    };

    /**
     * Track a configuration change
     * The unknown-item branch is reached when a change arrives before initializeDefaults()
     * has taken the snapshot; the change is still recorded so it is not lost.
     * @param item - Configuration item name
     * @param value - New value
     */
    const trackChange = <K extends MotorConfigKey>(item: K, value: MotorDefaults[K]) => {
        if (item in defaultConfiguration.value) {
            if (value === defaultConfiguration.value[item]) {
                delete configChanges.value[item];
            } else {
                configChanges.value[item] = value;
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
     * @param key - Analytics key
     * @param value - Value to track
     */
    const trackAnalytics = (key: string, value: unknown) => {
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

export type MotorsState = ReturnType<typeof useMotorsState>;
