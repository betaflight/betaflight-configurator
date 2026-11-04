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

import { computed, ref } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";

export type DisplayUnitSystem = "imperial" | "metric" | "british";

const STORAGE_KEY = "displayUnits";
const LEGACY_STORAGE_KEY = "flightPlanUnits";

function isUnitSystem(value: unknown): value is DisplayUnitSystem {
    return value === "imperial" || value === "metric" || value === "british";
}

function loadUnitSystem(): DisplayUnitSystem {
    try {
        const stored = getConfig<unknown>(STORAGE_KEY)[STORAGE_KEY];
        if (isUnitSystem(stored)) return stored;
        const legacy = getConfig<unknown>(LEGACY_STORAGE_KEY)[LEGACY_STORAGE_KEY];
        return isUnitSystem(legacy) ? legacy : "imperial";
    } catch {
        return "imperial";
    }
}

const unitSystem = ref<DisplayUnitSystem>(loadUnitSystem());

const isMetric = computed(() => unitSystem.value === "metric");
const usesMetricLength = computed(() => unitSystem.value !== "imperial");

/** Accepts unknown so it can be bound straight to a select's update event; invalid values are ignored. */
function setUnitSystem(value: unknown) {
    if (!isUnitSystem(value)) {
        return;
    }
    unitSystem.value = value;
    setConfig({ [STORAGE_KEY]: value });
}

const windUnit = computed(() => (isMetric.value ? "m/s" : "mph"));

function formatTemperature(value: number | null | undefined): string {
    return value == null
        ? "-"
        : `${Number((usesMetricLength.value ? value : (value * 9) / 5 + 32).toFixed(1))}°${usesMetricLength.value ? "C" : "F"}`;
}

function formatWind(value: number | null | undefined): string {
    return value == null ? "-" : (value * (isMetric.value ? 1 : 2.2369362921)).toFixed(1);
}

function formatVisibility(meters: number): string {
    if (!usesMetricLength.value) return `${(meters / 1609.344).toFixed(1)} mi`;
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

function formatElevation(meters: number): string {
    return usesMetricLength.value ? `${Math.round(meters)} m` : `${Math.round(meters / 0.3048)} ft`;
}

function formatGroundSpeed(cmPerSecond: number): string {
    const converted = (cmPerSecond / 100) * (isMetric.value ? 3.6 : 2.2369362921);
    return `${Number(converted.toFixed(1))} ${isMetric.value ? "km/h" : "mph"}`;
}

function formatShortDistance(meters: number): string {
    const converted = usesMetricLength.value ? meters : meters / 0.3048;
    return `${Number(converted.toFixed(2))} ${usesMetricLength.value ? "m" : "ft"}`;
}

function formatPrecipitation(mm: number): string {
    return usesMetricLength.value ? `${mm} mm` : `${(mm / 25.4).toFixed(2)} in`;
}

function formatPressure(hpa: number): string {
    return usesMetricLength.value ? `${hpa} hPa` : `${(hpa * 0.0295299831).toFixed(2)} inHg`;
}

export function useDisplayUnits() {
    return {
        unitSystem,
        isMetric,
        usesMetricLength,
        setUnitSystem,
        windUnit,
        formatTemperature,
        formatWind,
        formatVisibility,
        formatElevation,
        formatGroundSpeed,
        formatShortDistance,
        formatPrecipitation,
        formatPressure,
    };
}
