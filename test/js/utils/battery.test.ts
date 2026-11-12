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
import { estimateCellCount } from "../../../src/js/utils/battery";

describe("estimateCellCount", () => {
    it("returns 1 cell when voltage is 0", () => {
        expect(estimateCellCount(0, 4.2)).toBe(1);
    });

    it("estimates a single-cell pack", () => {
        expect(estimateCellCount(4.1, 4.2)).toBe(1);
    });

    it("estimates a multi-cell pack", () => {
        expect(estimateCellCount(16.4, 4.2)).toBe(4);
    });

    it("rounds down within a cell boundary", () => {
        expect(estimateCellCount(8.39, 4.2)).toBe(2);
    });

    it("does not overestimate at an exact cell boundary", () => {
        expect(estimateCellCount(8.4, 4.2)).toBe(2);
    });

    it("returns 1 cell when vbatmaxcellvoltage is unset", () => {
        expect(estimateCellCount(12.6, 0)).toBe(1);
    });

    it("counts every cell of a depleted pack", () => {
        // 3S at 3.3 V per cell: rounding to the nearest would report 2S
        expect(estimateCellCount(9.9, 4.2)).toBe(3);
    });

    it("returns 1 cell for a non-finite reading", () => {
        expect(estimateCellCount(Number.NaN, 4.2)).toBe(1);
        expect(estimateCellCount(12.6, Number.POSITIVE_INFINITY)).toBe(1);
    });
});
