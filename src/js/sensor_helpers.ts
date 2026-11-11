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

import { bit_check } from "./bit";

/** The sensors in the MSP_STATUS sensor mask, in bit order. */
export type SensorCode = "acc" | "baro" | "mag" | "gps" | "sonar" | "gyro" | "opticalflow" | "pitot";

/** Whether `sensor_code`'s bit is set in a sensor mask such as `fcStore.config.activeSensors`. */
export function have_sensor(sensors_detected: number, sensor_code: SensorCode): boolean {
    switch (sensor_code) {
        case "acc":
            return bit_check(sensors_detected, 0);
        case "baro":
            return bit_check(sensors_detected, 1);
        case "mag":
            return bit_check(sensors_detected, 2);
        case "gps":
            return bit_check(sensors_detected, 3);
        case "sonar":
            return bit_check(sensors_detected, 4);
        case "gyro":
            return bit_check(sensors_detected, 5);
        case "opticalflow":
            return bit_check(sensors_detected, 6);
        case "pitot":
            return bit_check(sensors_detected, 7);
    }
    return false;
}
