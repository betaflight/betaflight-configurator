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

// Common refresh rate options used across all sensors
export const REFRESH_RATE_OPTIONS = [
    { value: 10, label: "10 ms" },
    { value: 20, label: "20 ms" },
    { value: 30, label: "30 ms" },
    { value: 40, label: "40 ms" },
    { value: 50, label: "50 ms" },
    { value: 100, label: "100 ms" },
    { value: 250, label: "250 ms" },
    { value: 500, label: "500 ms" },
    { value: 1000, label: "1000 ms" },
];

// Scale options for each sensor type
export const GYRO_SCALE_OPTIONS = [1, 2, 3, 4, 5, 10, 25, 50, 100, 200, 300, 400, 500, 1000, 2000];
export const ACCEL_SCALE_OPTIONS = [0.5, 1, 2];
export const MAG_SCALE_OPTIONS = [100, 200, 500, 1000, 2000, 5000, 10000];
export const PITOT_SCALE_OPTIONS = [10, 100, 1000, 5000];

// Debug scale options. A value of 0 means "Auto": the Y-axis follows the data
// range (the 2025.12-maintenance behaviour). Any other value fixes the axis to
// the symmetric range [-value, value].
export const DEBUG_SCALE_AUTO = 0;
export const DEBUG_SCALE_OPTIONS = [DEBUG_SCALE_AUTO, 50, 100, 250, 500, 1000, 2000, 5000, 10000];
