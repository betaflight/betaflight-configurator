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

describe("useFlightPlanUnits", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("defaults to imperial and formats ft / kts / nm", async () => {
        const units = await loadUnits();

        expect(units.unitSystem.value).toBe("imperial");
        expect(units.formatAltitude(400)).toBe("400ft");
        expect(units.formatSpeed(10)).toBe("10kts");
        expect(units.formatDistance(1852)).toBe("1.00nm");
        expect(units.altitudeToDisplay(400)).toBe(400);
        expect(units.speedFromDisplay(10)).toBe(10);
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
});
