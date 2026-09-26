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

import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";

export interface SensorRates {
    gyro: number;
    accel: number;
    mag: number;
    altitude: number;
    sonar: number;
    pitot: number;
    debug: number;
}

export interface SensorScales {
    gyro: number;
    accel: number;
    mag: number;
    pitot: number;
}

export type RatedSensor = keyof SensorRates;
export type ScaledSensor = keyof SensorScales;

/** What saveToConfig() writes; older saves may lack any field, or carry six checkboxes. */
interface SavedSensorsTab {
    checkboxes?: boolean[];
    globalRate?: number;
    rates?: Partial<SensorRates>;
    scales?: Partial<SensorScales>;
    debugScales?: number[];
    debugColumns?: number;
}

export const useSensorsStore = defineStore("sensors", () => {
    // Sensor visibility checkboxes
    const checkboxes = ref([false, false, false, false, false, false, false]);

    // Global refresh rate (ms). Setting it applies the same rate to every graph
    // so they stay in sync; individual graphs can still be tuned afterwards.
    const globalRate = ref(50);

    // Per-graph refresh rates (ms)
    const rates = reactive<SensorRates>({
        gyro: 50,
        accel: 50,
        mag: 50,
        altitude: 100,
        sonar: 100,
        pitot: 100,
        debug: 500,
    });

    // Scale values
    const scales = reactive<SensorScales>({
        gyro: 2000,
        accel: 2,
        mag: 2000,
        pitot: 100,
    });

    // Per-column debug scales (0 = Auto / dynamic). Indexed by debug column.
    const debugScales = ref<number[]>(new Array(8).fill(0));

    // Debug columns
    const debugColumns = ref(4);

    function restoreCheckboxes(saved: boolean[]) {
        // Saved checkbox array migration from previous version
        if (saved.length === 6) {
            saved.splice(5, 0, false);
        }
        checkboxes.value = saved;
    }

    function restoreRates(config: SavedSensorsTab) {
        if (config.rates) {
            Object.assign(rates, config.rates);
        }
        if (typeof config.globalRate === "number") {
            globalRate.value = config.globalRate;
        } else if (config.rates) {
            // Seed the global control from the fastest saved per-sensor rate.
            const legacy = Object.values(config.rates).filter((v): v is number => typeof v === "number");
            if (legacy.length) {
                globalRate.value = Math.min(...legacy);
            }
        }
    }

    function restoreDebugScales(saved: SavedSensorsTab["debugScales"]) {
        if (!Array.isArray(saved)) {
            return;
        }
        for (let i = 0; i < debugScales.value.length; i++) {
            debugScales.value[i] = saved[i] ?? 0;
        }
    }

    function loadFromConfig() {
        // ConfigStorage wraps each value under its own key: { sensors_tab: { ... } }.
        const config = getConfig<SavedSensorsTab | undefined>("sensors_tab").sensors_tab;
        if (!config) {
            return;
        }
        if (config.checkboxes) {
            restoreCheckboxes(config.checkboxes);
        }
        restoreRates(config);
        if (config.scales) {
            Object.assign(scales, config.scales);
        }
        restoreDebugScales(config.debugScales);
        if (config.debugColumns) {
            debugColumns.value = config.debugColumns;
        }
    }

    function saveToConfig() {
        setConfig({
            sensors_tab: {
                checkboxes: checkboxes.value,
                globalRate: globalRate.value,
                rates,
                scales,
                debugScales: debugScales.value,
                debugColumns: debugColumns.value,
            },
        });
    }

    function updateRate(sensor: RatedSensor, value: number) {
        rates[sensor] = value;
        saveToConfig();
    }

    function updateGlobalRate(value: number) {
        globalRate.value = value;
        // Apply the global rate to every graph so they stay in sync.
        for (const sensor of Object.keys(rates) as RatedSensor[]) {
            rates[sensor] = value;
        }
        saveToConfig();
    }

    function updateScale(sensor: ScaledSensor, value: number) {
        scales[sensor] = value;
        saveToConfig();
    }

    function updateDebugScale(index: number, value: number) {
        debugScales.value[index] = value;
        saveToConfig();
    }

    function updateCheckbox(index: number, value: boolean) {
        checkboxes.value[index] = value;
        saveToConfig();
    }

    return {
        checkboxes,
        globalRate,
        rates,
        scales,
        debugScales,
        debugColumns,
        loadFromConfig,
        saveToConfig,
        updateRate,
        updateGlobalRate,
        updateScale,
        updateDebugScale,
        updateCheckbox,
    };
});
