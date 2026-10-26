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

export const CHANNEL_MIN = 900;
export const CHANNEL_MAX = 2100;
const CHANNEL_MID = 1500;

export function clampChannel(value: number | null | undefined): number {
    if (value === undefined || value === null || Number.isNaN(value)) {
        return CHANNEL_MID;
    }
    if (value < CHANNEL_MIN) {
        return CHANNEL_MIN;
    }
    if (value > CHANNEL_MAX) {
        return CHANNEL_MAX;
    }
    return value;
}

export function channelPercent(value: number | null | undefined): number {
    const clamped = clampChannel(value);
    return ((clamped - CHANNEL_MIN) / (CHANNEL_MAX - CHANNEL_MIN)) * 100;
}
