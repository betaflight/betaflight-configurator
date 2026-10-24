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
import { bit_set } from "../../../src/js/bit";
import { isDshotBitbangBlocked, DSHOT_BITBANG_BIT } from "../../../src/stores/fc.js";

// LedStripTab.vue shows a warning from `fcStore.dshotBitbangBlocked`, which reads the DSHOT_BITBANG arming
// disable flag (firmware ARMING_DISABLED_DSHOT_BITBANG = 1 << 22). The constant is a bit position, like the
// failsafe ones, so a mask value here would silently break the warning.

describe("LedStripTab DShot bitbang warning", () => {
    it("uses bit position 22", () => {
        expect(DSHOT_BITBANG_BIT).toBe(22);
    });

    it("is shown when the flag is set, with or without other flags", () => {
        expect(isDshotBitbangBlocked(1 << 22)).toBe(true);
        expect(isDshotBitbangBlocked(bit_set(bit_set(0, DSHOT_BITBANG_BIT), 13))).toBe(true);
    });

    it("is hidden without the flag, for neighbouring flags, and for missing flags", () => {
        expect(isDshotBitbangBlocked(0)).toBe(false);
        expect(isDshotBitbangBlocked(1 << 21)).toBe(false);
        expect(isDshotBitbangBlocked(1 << 23)).toBe(false);
        expect(isDshotBitbangBlocked()).toBe(false);
    });
});
