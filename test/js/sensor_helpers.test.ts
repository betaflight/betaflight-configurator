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
import { have_sensor, type SensorCode } from "../../src/js/sensor_helpers";

const SENSOR_BITS: Array<[SensorCode, number]> = [
    ["acc", 0],
    ["baro", 1],
    ["mag", 2],
    ["gps", 3],
    ["sonar", 4],
    ["gyro", 5],
    ["opticalflow", 6],
    ["pitot", 7],
];

describe("have_sensor", () => {
    it.each(SENSOR_BITS)("reads %s from bit %i", (code, bit) => {
        expect(have_sensor(1 << bit, code)).toBe(true);
    });

    it.each(SENSOR_BITS)("ignores every other bit for %s", (code, bit) => {
        expect(have_sensor(0xff & ~(1 << bit), code)).toBe(false);
    });

    it("reports nothing for an empty mask", () => {
        expect(SENSOR_BITS.every(([code]) => !have_sensor(0, code))).toBe(true);
    });

    it("reports false for a code outside the mask, as JavaScript callers could pass", () => {
        expect(have_sensor(0xff, "lidar" as SensorCode)).toBe(false);
    });
});
