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

import { computed } from "vue";
import { useDisplayUnits, type DisplayUnitSystem } from "./useDisplayUnits";

export type FlightPlanUnitSystem = DisplayUnitSystem;
const { unitSystem, usesMetricLength, isMetric, setUnitSystem } = useDisplayUnits();
const FEET_TO_METERS = 0.3048;
const KNOTS_TO_KMH = 1.852;
const KNOTS_TO_MPH = 1.150779448;

const altitudeUnit = computed(() => (usesMetricLength.value ? "m" : "ft"));
const speedUnit = computed(() => (isMetric.value ? "km/h" : "mph"));

export function altitudeToUnit(feet: number, system: DisplayUnitSystem): number {
    return system === "imperial" ? feet : feet * FEET_TO_METERS;
}

export function altitudeFromUnit(value: number, system: DisplayUnitSystem): number {
    return system === "imperial" ? value : value / FEET_TO_METERS;
}

export function speedToUnit(knots: number, system: DisplayUnitSystem): number {
    return knots * (system === "metric" ? KNOTS_TO_KMH : KNOTS_TO_MPH);
}

export function speedFromUnit(value: number, system: DisplayUnitSystem): number {
    return value / (system === "metric" ? KNOTS_TO_KMH : KNOTS_TO_MPH);
}

function altitudeToDisplay(feet: number): number {
    return altitudeToUnit(feet, unitSystem.value);
}

function altitudeFromDisplay(value: number): number {
    return altitudeFromUnit(value, unitSystem.value);
}

function speedToDisplay(knots: number): number {
    return speedToUnit(knots, unitSystem.value);
}

function speedFromDisplay(value: number): number {
    return speedFromUnit(value, unitSystem.value);
}

function formatAltitude(feet: number): string {
    return `${Math.round(altitudeToDisplay(feet))}${altitudeUnit.value}`;
}

function formatSpeed(knots: number): string {
    return `${Number(speedToDisplay(knots).toFixed(1))}${speedUnit.value}`;
}

function formatDistance(meters: number): string {
    if (!usesMetricLength.value) {
        const feet = meters / FEET_TO_METERS;
        return feet < 5280 ? `${Math.round(feet)}ft` : `${(meters / 1609.344).toFixed(2)}mi`;
    }
    if (meters < 1000) return `${Math.round(meters)}m`;
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
