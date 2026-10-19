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
import { CHANNEL_MIN, CHANNEL_MAX, clampChannel, channelPercent } from "../../../src/js/utils/rcChannel";

describe("rcChannel helpers", () => {
    describe("clampChannel", () => {
        it("returns the value when within range", () => {
            expect(clampChannel(1500)).toBe(1500);
        });

        it("clamps below CHANNEL_MIN", () => {
            expect(clampChannel(500)).toBe(CHANNEL_MIN);
        });

        it("clamps above CHANNEL_MAX", () => {
            expect(clampChannel(3000)).toBe(CHANNEL_MAX);
        });

        it("clamps one step past either end", () => {
            expect(clampChannel(CHANNEL_MIN - 1)).toBe(CHANNEL_MIN);
            expect(clampChannel(CHANNEL_MAX + 1)).toBe(CHANNEL_MAX);
        });

        it("falls back to the midpoint for NaN/undefined/null", () => {
            expect(clampChannel(NaN)).toBe(1500);
            expect(clampChannel(undefined)).toBe(1500);
            expect(clampChannel(null)).toBe(1500);
        });
    });

    describe("channelPercent", () => {
        it("returns 0 at CHANNEL_MIN and 100 at CHANNEL_MAX", () => {
            expect(channelPercent(CHANNEL_MIN)).toBe(0);
            expect(channelPercent(CHANNEL_MAX)).toBe(100);
        });

        it("returns 50 for the midpoint channel value", () => {
            expect(channelPercent(1500)).toBe(50);
        });

        it("returns 50 for a NaN fallback", () => {
            expect(channelPercent(NaN)).toBe(50);
        });
    });
});
