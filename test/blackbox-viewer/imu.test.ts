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
import { IMU } from "../../src/blackbox-viewer/imu";

// Reference values were captured from the JavaScript IMU before its conversion, so these pin
// parity with it rather than the maths in the abstract.
const ACC_1G = 512;
const GYRO_SCALE = 1e-6;

describe("blackbox IMU attitude estimate", () => {
    it("treats the first update as a one-microsecond step", () => {
        const imu = new IMU();

        expect(imu.previousTime).toBe(false);
        // 0.1 rad of yaw over one microsecond, not over the 5000 since time zero.
        const attitude = imu.updateEstimatedAttitude([0, 0, 100000], [0, 0, ACC_1G], 5000, ACC_1G, GYRO_SCALE);

        expect(attitude.roll).toBeCloseTo(0, 12);
        expect(attitude.pitch).toBeCloseTo(0, 12);
        expect(attitude.heading).toBeCloseTo(2 * Math.PI - 0.1, 12);
        expect(imu.previousTime).toBe(5000);
    });

    it("follows the gyro, and the accelerometer only inside its 0.85-1.15 G window", () => {
        const imu = new IMU();
        imu.updateEstimatedAttitude([0, 0, 0], [0, 0, ACC_1G], 1000, ACC_1G, GYRO_SCALE);

        const second = imu.updateEstimatedAttitude([200, -100, 50], [30, -20, 500], 2000, ACC_1G, GYRO_SCALE);
        expect(second.roll).toBeCloseTo(0.07888095391489991, 12);
        expect(second.pitch).toBeCloseTo(-0.08468891704433573, 12);
        expect(second.heading).toBeCloseTo(6.2414576026038535, 12);

        // 900 on one axis is well outside the window, so the accelerometer is ignored.
        const third = imu.updateEstimatedAttitude([200, -100, 50], [900, 0, 0], 3000, ACC_1G, GYRO_SCALE);
        expect(third.roll).toBeCloseTo(0.2734521006061766, 12);
        expect(third.pitch).toBeCloseTo(-0.19450579861085318, 12);
        expect(third.heading).toBeCloseTo(6.220459758670012, 12);
    });

    it("keeps the heading in [0, 2π) when it yaws the other way", () => {
        const imu = new IMU();

        const attitude = imu.updateEstimatedAttitude([0, 0, -100000], [0, 0, ACC_1G], 5000, ACC_1G, GYRO_SCALE);

        expect(attitude.heading).toBeCloseTo(0.1, 12);
    });

    it("copies the state it is constructed from, so the two estimates evolve independently", () => {
        const imu = new IMU();
        imu.updateEstimatedAttitude([0, 0, 0], [0, 0, ACC_1G], 1000, ACC_1G, GYRO_SCALE);
        imu.updateEstimatedAttitude([200, -100, 50], [30, -20, 500], 2000, ACC_1G, GYRO_SCALE);

        const copy = new IMU(imu);
        expect(copy.previousTime).toBe(2000);
        imu.updateEstimatedAttitude([200, -100, 50], [900, 0, 0], 3000, ACC_1G, GYRO_SCALE);

        const attitude = copy.updateEstimatedAttitude([0, 0, 0], [0, 0, ACC_1G], 3000, ACC_1G, GYRO_SCALE);
        expect(attitude.roll).toBeCloseTo(0.05217416795294888, 12);
        expect(attitude.pitch).toBeCloseTo(-0.056123800678834906, 12);
        expect(attitude.heading).toBeCloseTo(6.238667251998071, 12);
        expect(copy.EstN.X).toBeCloseTo(0.9937606691655042, 12);
    });

    it("resets to level with no previous time", () => {
        const imu = new IMU();
        imu.updateEstimatedAttitude([200, -100, 50], [30, -20, 500], 2000, ACC_1G, GYRO_SCALE);

        imu.reset();

        expect(imu.estimateGyro).toEqual({ X: 0, Y: 0, Z: 0 });
        expect(imu.EstN).toEqual({ X: 1, Y: 0, Z: 0 });
        expect(imu.previousTime).toBe(false);
    });
});
