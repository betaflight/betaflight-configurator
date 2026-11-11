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
import { ALIGNMENT_MATRICES, eulerToMatrix, type Mat3 } from "../../src/js/utils/magAlignment";
import { matrixToEuler, snapToPreset } from "../../src/js/utils/magCharacterization";

function expectMatrixClose(got: Mat3, expected: Mat3): void {
    got.forEach((row, i) => row.forEach((value, j) => expect(value).toBeCloseTo(expected[i][j], 9)));
}

describe("matrixToEuler", () => {
    it.each([
        [10, -20, 30],
        [-45, 60, -150],
        [170, -5, 95],
    ])("inverts eulerToMatrix(%i, %i, %i)", (roll, pitch, yaw) => {
        const euler = matrixToEuler(eulerToMatrix(roll, pitch, yaw));
        expect(euler.roll).toBeCloseTo(roll, 9);
        expect(euler.pitch).toBeCloseTo(pitch, 9);
        expect(euler.yaw).toBeCloseTo(yaw, 9);
    });

    // At pitch ±90 only roll - yaw (or roll + yaw) is defined; roll is pinned to 0 and the
    // yaw that still reproduces the rotation is returned.
    it.each([90, -90])("returns angles that rebuild the matrix at pitch %i (gimbal lock)", (pitch) => {
        const m = eulerToMatrix(25, pitch, 40);
        const euler = matrixToEuler(m);

        expect(euler.roll).toBe(0);
        expect(euler.pitch).toBeCloseTo(pitch, 6);
        expectMatrixClose(eulerToMatrix(euler.roll, euler.pitch, euler.yaw), m);
    });
});

describe("snapToPreset", () => {
    it("snaps a near-preset rotation to that preset, without custom angles", () => {
        const nearCw90Flip = eulerToMatrix(0, 180.5, -90);
        expect(snapToPreset(nearCw90Flip)).toEqual({ alignment: 6, frobNorm: expect.any(Number) });
    });

    it("returns custom alignment 9 with the rotation's angles when no preset is close", () => {
        const m = eulerToMatrix(0, 0, -20);
        const snap = snapToPreset(m);

        expect(snap.alignment).toBe(9);
        expect(snap.customAngles?.yaw).toBeCloseTo(-20, 9);
        expect(snap.frobNorm).toBeGreaterThan(0.1);
    });

    it("matches every standard preset exactly", () => {
        for (const [alignment, matrix] of Object.entries(ALIGNMENT_MATRICES)) {
            expect(snapToPreset(matrix)).toEqual({ alignment: Number(alignment), frobNorm: 0 });
        }
    });
});
