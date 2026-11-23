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
import { getModeHelpKey } from "../../src/js/modeHelpKey";

describe("getModeHelpKey", () => {
    it("derives the key from the firmware box name", () => {
        expect(getModeHelpKey(0, "ARM")).toBe("auxiliaryHelpMode_ARM");
        expect(getModeHelpKey(39, "VTX PIT MODE")).toBe("auxiliaryHelpMode_VTXPITMODE");
    });

    it("uses the USERn key for user modes with the default label", () => {
        expect(getModeHelpKey(40, "USER1")).toBe("auxiliaryHelpMode_USER1");
        expect(getModeHelpKey(43, "USER4")).toBe("auxiliaryHelpMode_USER4");
    });

    it("ignores board-defined user mode labels", () => {
        expect(getModeHelpKey(40, "VTX PWR")).toBe("auxiliaryHelpMode_USER1");
        expect(getModeHelpKey(41, "CAM SW")).toBe("auxiliaryHelpMode_USER2");
        expect(getModeHelpKey(40, "VTX POWER")).toBe("auxiliaryHelpMode_USER1");
    });
});
