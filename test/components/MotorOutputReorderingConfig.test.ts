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
import MotorOutputReorderConfig from "../../src/components/MotorOutputReordering/MotorOutputReorderingConfig";

describe("MotorOutputReorderConfig", () => {
    it("orders Octo Flat + as diagonals then cardinals, and keeps the other frames", () => {
        const screenSize = 200;
        const config = new MotorOutputReorderConfig(screenSize);
        const motors = config.frames["Octo Flat +"].Motors;
        const radius = 0.35 * screenSize;
        const diagonal = radius * Math.SQRT1_2;

        // mixerOctoFlatP: front-left, front-right, rear-right, rear-left, front, right, rear, left.
        // Canvas +y is rear, so a swapped cardinal-first group fails these coordinates.
        const expected = [
            [-diagonal, -diagonal],
            [diagonal, -diagonal],
            [diagonal, diagonal],
            [-diagonal, diagonal],
            [0, -radius],
            [radius, 0],
            [0, radius],
            [-radius, 0],
        ];

        expect(motors).toHaveLength(expected.length);
        motors.forEach((motor, index) => {
            expect(motor.x, `M${index + 1} x`).toBeCloseTo(expected[index][0]);
            expect(motor.y, `M${index + 1} y`).toBeCloseTo(expected[index][1]);
        });

        expect(
            Object.fromEntries(Object.entries(config.frames).map(([name, frame]) => [name, frame.Motors.length])),
        ).toEqual({
            "Quad X": 4,
            "Quad X 1234": 4,
            "Quad +": 4,
            Tricopter: 3,
            "Hex +": 6,
            "Hex X": 6,
            "Octo Flat +": 8,
            "Octo Flat X": 8,
            "Octo X8": 8,
            Bicopter: 2,
            "V-tail Quad": 4,
            "A-tail Quad": 4,
            Y4: 4,
            Y6: 6,
        });
    });
});
