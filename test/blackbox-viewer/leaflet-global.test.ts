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

import { describe, expect, it } from "vitest";
import Leaflet from "leaflet";

describe("leaflet-global", () => {
    it("publishes the pinned Leaflet as the global the plugins patch", async () => {
        Object.assign(globalThis, { L: { stale: true } });

        const { default: exported } = await import("../../src/blackbox-viewer/leaflet-global");

        expect(exported).toBe(Leaflet);
        expect((globalThis as { L?: unknown }).L).toBe(Leaflet);
    });

    it("loads the plugins onto that global", async () => {
        await import("../../src/blackbox-viewer/vendor");

        const plugins = Leaflet as unknown as Record<string, unknown>;
        expect(typeof plugins.rotatedMarker).toBe("function");
        expect(typeof plugins.multiOptionsPolyline).toBe("function");
    });
});
