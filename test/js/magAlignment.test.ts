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
import { ALIGNMENT_LABELS, ALIGNMENT_MATRICES, eulerToMatrix } from "../../src/js/utils/magAlignment";

// The firmware's standard alignments: presets 1-4 turn CW by 0/90/180/270 degrees, and
// 5-8 do the same after flipping the board over (pitch 180). eulerToMatrix is CCW-positive,
// so the CW yaw goes in negated.
const PRESETS = [1, 2, 3, 4, 5, 6, 7, 8].map((alignment) => ({
    alignment,
    yaw: 90 * ((alignment - 1) % 4),
    flipped: alignment > 4,
}));

describe("ALIGNMENT_MATRICES", () => {
    it.each(PRESETS)("preset $alignment is CW $yaw°, flipped: $flipped", ({ alignment, yaw, flipped }) => {
        const expected = eulerToMatrix(0, flipped ? 180 : 0, -yaw);
        ALIGNMENT_MATRICES[alignment].forEach((row, i) =>
            row.forEach((value, j) => expect(value).toBeCloseTo(expected[i][j], 12)),
        );
    });
});

describe("ALIGNMENT_LABELS", () => {
    it.each(PRESETS)("labels preset $alignment", ({ alignment, yaw, flipped }) => {
        expect(ALIGNMENT_LABELS[alignment]).toBe(`CW ${yaw}°${flipped ? " flip" : ""}`);
    });
});
