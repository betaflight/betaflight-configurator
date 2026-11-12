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
import { withInTime, withOutTime } from "../../src/blackbox-viewer/marked_range";

describe("withInTime", () => {
    it("sets the in point and keeps a later out point", () => {
        expect(withInTime({ in: null, out: 9 }, 5)).toEqual({ in: 5, out: 9 });
    });

    it("clears an out point at or before the new in point", () => {
        expect(withInTime({ in: null, out: 5 }, 5)).toEqual({ in: 5, out: null });
        expect(withInTime({ in: null, out: 3 }, 5)).toEqual({ in: 5, out: null });
    });

    it("clearing the in point keeps the out point", () => {
        expect(withInTime({ in: 5, out: 9 }, null)).toEqual({ in: null, out: 9 });
        expect(withInTime({ in: 5, out: 0 }, null)).toEqual({ in: null, out: 0 });
    });
});

describe("withOutTime", () => {
    it("sets the out point and keeps an earlier in point", () => {
        expect(withOutTime({ in: 5, out: null }, 9)).toEqual({ in: 5, out: 9 });
    });

    it("clears an in point at or after the new out point", () => {
        expect(withOutTime({ in: 9, out: null }, 9)).toEqual({ in: null, out: 9 });
        expect(withOutTime({ in: 12, out: null }, 9)).toEqual({ in: null, out: 9 });
    });

    it("clearing the out point keeps the in point", () => {
        expect(withOutTime({ in: 5, out: 9 }, null)).toEqual({ in: 5, out: null });
    });

    it("keeps an in point at time zero", () => {
        expect(withOutTime({ in: 0, out: null }, 9)).toEqual({ in: 0, out: 9 });
    });
});
