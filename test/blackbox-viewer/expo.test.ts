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
import { ExpoCurve } from "../../src/blackbox-viewer/expo";

// Expected values were captured from the JavaScript ExpoCurve before its conversion.

describe("ExpoCurve", () => {
    it("defaults to 12 steps and reports the settings it was built with", () => {
        expect(new ExpoCurve(0, 0.7, 500, 100).getCurve()).toEqual({
            offset: 0,
            power: 0.7,
            inputRange: 500,
            outputRange: 100,
            steps: 12,
        });
    });

    it("interpolates the power curve, symmetrically about zero", () => {
        const curve = new ExpoCurve(0, 0.7, 500, 100);

        expect(curve.lookup(1)).toBeCloseTo(0.4106272827317689, 12);
        expect(curve.lookup(250)).toBeCloseTo(61.5036928135395, 12);
        expect(curve.lookup(-250)).toBeCloseTo(-61.5036928135395, 12);
        expect(curve.lookup(499)).toBeCloseTo(99.85801151884219, 12);
    });

    it("reaches the output range at the edge of the input range, and extrapolates past it", () => {
        const curve = new ExpoCurve(0, 0.7, 500, 100);

        expect(curve.lookup(500)).toBeCloseTo(100, 12);
        expect(curve.lookup(750)).toBeCloseTo(135.49712028945248, 12);
    });

    it("applies the offset before the curve, and honours the step count", () => {
        const curve = new ExpoCurve(-5, 2, 300, 80, 20);

        expect(curve.lookup(1)).toBeCloseTo(-0.05614035087719298, 12);
        expect(curve.lookup(250)).toBeCloseTo(53.410895660203145, 12);
        expect(curve.lookup(750)).toBeCloseTo(311.08771929824616, 12);
    });

    it("is a straight line for a power of 1 or two steps or fewer", () => {
        const linear = new ExpoCurve(0, 1, 500, 100);
        expect(linear.lookup(250)).toBe(50);
        expect(linear.lookup(750)).toBe(150);

        const twoSteps = new ExpoCurve(10, 0.5, 400, 50, 2);
        expect(twoSteps.lookup(1)).toBe(1.375);
        expect(twoSteps.lookup(-250)).toBe(-30);
    });

    it("maps raw values straight onto the output range, whatever the power", () => {
        const curve = new ExpoCurve(-5, 2, 300, 80, 20);

        expect(curve.lookupRaw(250)).toBeCloseTo(65.33333333333333, 12);
        expect(curve.lookupRaw(-250)).toBe(-68);
    });
});
