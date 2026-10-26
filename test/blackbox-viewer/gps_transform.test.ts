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
import { GpsTransform } from "../../src/blackbox-viewer/gps_transform";

// Reference values were captured from the JavaScript transform before its conversion.
const ORIGIN = [52.1, 5.2, 10] as const;

describe("blackbox GpsTransform", () => {
    it("puts the origin at zero", () => {
        const p = new GpsTransform(...ORIGIN, 0).WGS_BS(...ORIGIN);

        expect(p.x).toBeCloseTo(0, 9);
        expect(p.y).toBeCloseTo(0, 9);
        expect(p.z).toBeCloseTo(0, 9);
    });

    it("maps north to x, up to y and east to z at heading 0", () => {
        const transform = new GpsTransform(...ORIGIN, 0);

        const north = transform.WGS_BS(52.101, 5.2, 10);
        expect(north.x).toBeCloseTo(111.26943653492377, 6);
        expect(north.y).toBeCloseTo(-0.000971007459725115, 9);

        const east = transform.WGS_BS(52.1, 5.201, 10);
        expect(east.z).toBeCloseTo(68.52498747945903, 6);
        expect(east.x).toBeCloseTo(0.0004718670008392323, 9);

        expect(transform.WGS_BS(52.1, 5.2, 60).y).toBeCloseTo(50, 6);

        const p = transform.WGS_BS(52.1005, 5.2007, 23);
        expect(p.x).toBeCloseTo(55.63506055543462, 6);
        expect(p.y).toBeCloseTo(12.999577252238627, 6);
        expect(p.z).toBeCloseTo(47.967052452471634, 6);
    });

    it("rotates the horizontal axes by the heading", () => {
        const p = new GpsTransform(...ORIGIN, 90).WGS_BS(52.1005, 5.2007, 23);

        expect(p.x).toBeCloseTo(47.967052452471634, 6);
        expect(p.y).toBeCloseTo(12.999577252238627, 6);
        expect(p.z).toBeCloseTo(-55.63506055543462, 6);
    });
});
