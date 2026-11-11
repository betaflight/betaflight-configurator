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

/**
 * Display units for the Flight Plan tab.
 *
 * Waypoints are always stored in feet / knots (that is what the CLI round-trip in
 * useFlightPlan converts from), so this is a pure presentation layer: values are
 * converted on the way into the UI and back on the way out of the editor.
 */
export type FlightPlanUnitSystem = "imperial" | "metric";

const STORAGE_KEY = "flightPlanUnits";

const FEET_TO_METERS = 0.3048;
const KNOTS_TO_KMH = 1.852;
const METERS_TO_NAUTICAL_MILES = 1 / 1852;

function isUnitSystem(value: unknown): value is FlightPlanUnitSystem {
    return value === "imperial" || value === "metric";
}

function loadUnitSystem(): FlightPlanUnitSystem {
    try {
        const stored = getConfig<unknown>(STORAGE_KEY)[STORAGE_KEY];
        return isUnitSystem(stored) ? stored : "imperial";
    } catch {
        return "imperial";
    }
}

// Shared across every Flight Plan component, like the waypoint state.
const unitSystem = ref<FlightPlanUnitSystem>(loadUnitSystem());

const isMetric = computed(() => unitSystem.value === "metric");
const altitudeUnit = computed(() => (isMetric.value ? "m" : "ft"));
const speedUnit = computed(() => (isMetric.value ? "km/h" : "kts"));

/** Accepts unknown so it can be bound straight to a select's update event; invalid values are ignored. */
function setUnitSystem(value: unknown) {
    if (!isUnitSystem(value)) {
        return;
    }
    unitSystem.value = value;
    setConfig({ [STORAGE_KEY]: value });
}

/** Stored feet → value in the selected unit. */
function altitudeToDisplay(feet: number): number {
    return isMetric.value ? feet * FEET_TO_METERS : feet;
}

/** Value in the selected unit → stored feet. */
function altitudeFromDisplay(value: number): number {
    return isMetric.value ? value / FEET_TO_METERS : value;
}

/** Stored knots → value in the selected unit. */
function speedToDisplay(knots: number): number {
    return isMetric.value ? knots * KNOTS_TO_KMH : knots;
}

/** Value in the selected unit → stored knots. */
function speedFromDisplay(value: number): number {
    return isMetric.value ? value / KNOTS_TO_KMH : value;
}

/** Feet → rounded altitude string with unit, e.g. "400ft" or "122m". */
function formatAltitude(feet: number): string {
    return `${Math.round(altitudeToDisplay(feet))}${altitudeUnit.value}`;
}

/** Knots → speed string with unit, e.g. "10kts" or "18.5km/h". */
function formatSpeed(knots: number): string {
    return `${Number(speedToDisplay(knots).toFixed(1))}${speedUnit.value}`;
}

/** Meters → distance string: nautical miles for imperial, m/km for metric. */
function formatDistance(meters: number): string {
    if (!isMetric.value) {
        return `${(meters * METERS_TO_NAUTICAL_MILES).toFixed(2)}nm`;
    }
    if (meters < 1000) {
        return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(2)}km`;
}

export function useFlightPlanUnits() {
    return {
        unitSystem,
        isMetric,
        altitudeUnit,
        speedUnit,
        setUnitSystem,
        altitudeToDisplay,
        altitudeFromDisplay,
        speedToDisplay,
        speedFromDisplay,
        formatAltitude,
        formatSpeed,
        formatDistance,
    };
}
