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

import { beforeEach, describe, expect, it, vi } from "vitest";

// The unit system is module-scope shared state read from storage on import, so every test gets a fresh module.
async function loadUnits() {
    vi.resetModules();
    const module = await import("../../src/composables/useFlightPlanUnits");
    return module.useFlightPlanUnits();
}

async function loadDisplayUnits() {
    vi.resetModules();
    return (await import("../../src/composables/useDisplayUnits")).useDisplayUnits();
}

describe("useFlightPlanUnits", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("defaults to imperial and formats ft / mph / miles", async () => {
        const units = await loadUnits();

        expect(units.unitSystem.value).toBe("imperial");
        expect(units.formatAltitude(400)).toBe("400ft");
        expect(units.formatSpeed(10)).toBe("11.5mph");
        expect(units.formatDistance(1852)).toBe("1.15mi");
        expect(units.altitudeToDisplay(400)).toBe(400);
        expect(units.speedFromDisplay(10)).toBeCloseTo(8.68976, 4);
    });

    it("formats m / km/h / m-or-km in metric", async () => {
        const units = await loadUnits();
        units.setUnitSystem("metric");

        expect(units.altitudeUnit.value).toBe("m");
        expect(units.speedUnit.value).toBe("km/h");
        expect(units.formatAltitude(400)).toBe("122m");
        expect(units.formatSpeed(10)).toBe("18.5km/h");
        expect(units.formatDistance(389)).toBe("389m");
        expect(units.formatDistance(2500)).toBe("2.50km");
    });

    it("uses metres, kilometres and mph for British units and persists the selection", async () => {
        const units = await loadUnits();
        units.setUnitSystem("british");
        expect(units.formatAltitude(400)).toBe("122m");
        expect(units.formatSpeed(10)).toBe("11.5mph");
        expect(units.formatDistance(2500)).toBe("2.50km");
        expect(units.speedFromDisplay(units.speedToDisplay(10))).toBeCloseTo(10, 9);
        expect(units.altitudeFromDisplay(units.altitudeToDisplay(400))).toBeCloseTo(400, 9);
        expect((await loadUnits()).unitSystem.value).toBe("british");
    });

    it("round-trips display values back to stored feet and knots", async () => {
        const units = await loadUnits();
        units.setUnitSystem("metric");

        expect(units.altitudeFromDisplay(120)).toBeCloseTo(393.7, 1);
        expect(units.altitudeToDisplay(units.altitudeFromDisplay(120))).toBeCloseTo(120, 9);
        expect(units.speedFromDisplay(1.852)).toBeCloseTo(1, 9);
    });

    it("persists the selection across reloads", async () => {
        const first = await loadUnits();
        first.setUnitSystem("metric");

        const second = await loadUnits();
        expect(second.unitSystem.value).toBe("metric");
    });

    it("ignores invalid stored or requested values", async () => {
        localStorage.setItem("flightPlanUnits", JSON.stringify({ flightPlanUnits: "furlongs" }));
        const units = await loadUnits();
        expect(units.unitSystem.value).toBe("imperial");

        units.setUnitSystem("furlongs");
        expect(units.unitSystem.value).toBe("imperial");
    });

    it("uses the existing Flight Plan preference and lets the new preference take precedence", async () => {
        localStorage.setItem("flightPlanUnits", JSON.stringify({ flightPlanUnits: "metric" }));
        const units = await loadDisplayUnits();
        expect(units.unitSystem.value).toBe("metric");
        units.setUnitSystem("imperial");
        expect((await loadDisplayUnits()).unitSystem.value).toBe("imperial");
    });

    it("shares the selection with Flight Plan", async () => {
        const units = await loadDisplayUnits();
        const flightPlan = (await import("../../src/composables/useFlightPlanUnits")).useFlightPlanUnits();
        units.setUnitSystem("metric");
        expect(flightPlan.formatSpeed(10)).toBe("18.5km/h");
        flightPlan.setUnitSystem("imperial");
        expect(units.formatTemperature(0)).toBe("32°F");
    });

    it("formats weather and elevation consistently while preserving zero and missing readings", async () => {
        const units = await loadDisplayUnits();
        expect(units.formatTemperature(0)).toBe("32°F");
        expect(units.formatTemperature(-40)).toBe("-40°F");
        expect(units.formatTemperature(null)).toBe("-");
        expect(units.formatWind(10)).toBe("22.4");
        expect(units.windUnit.value).toBe("mph");
        expect(units.formatVisibility(1609.344)).toBe("1.0 mi");
        expect(units.formatPrecipitation(25.4)).toBe("1.00 in");
        expect(units.formatPressure(1013.25)).toBe("29.92 inHg");
        expect(units.formatElevation(304.8)).toBe("1000 ft");
        units.setUnitSystem("metric");
        expect(units.formatTemperature(0)).toBe("0°C");
        expect(units.formatWind(10)).toBe("10.0");
        expect(units.windUnit.value).toBe("m/s");
        expect(units.formatVisibility(999)).toBe("999 m");
        expect(units.formatVisibility(1000)).toBe("1.0 km");
        expect(units.formatElevation(304.8)).toBe("305 m");
        units.setUnitSystem("british");
        expect(units.formatTemperature(0)).toBe("0°C");
        expect(units.formatGroundSpeed(1000)).toBe("22.4 mph");
        expect(units.formatVisibility(1000)).toBe("1.0 km");
    });
});
