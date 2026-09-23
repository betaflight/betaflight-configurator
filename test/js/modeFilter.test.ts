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
import { filterModes } from "../../src/js/utils/modeFilter";

const modes = [
    { id: 0, displayName: "ARM", entries: [{ kind: "range" }] },
    { id: 1, displayName: "ANGLE", entries: [] },
    { id: 2, displayName: "HORIZON", entries: [] },
    { id: 28, displayName: "PREARM", entries: [{ kind: "link" }] },
    { id: 6, displayName: "CAMSTAB", entries: [] },
    { id: 27, displayName: "CAMERA CONTROL 1", entries: [] },
];

describe("Modes tab filters", () => {
    it.each(["", "a", "  ", " a "])("does not search before two trimmed characters: %j", (query) => {
        expect(filterModes(modes, query, false)).toEqual(modes);
    });

    it("matches inside displayed names, ignoring case and surrounding whitespace", () => {
        expect(filterModes(modes, " Ar ", false)).toEqual([modes[0], modes[3]]);
        expect(filterModes(modes, "IZ", false)).toEqual([modes[2]]);
    });

    it("preserves the existing order instead of sorting matches alphabetically", () => {
        expect(filterModes(modes, "am", false)).toEqual([modes[4], modes[5]]);
    });

    it("combines search with the unused-mode toggle for ranges and links", () => {
        expect(filterModes(modes, "", true)).toEqual([modes[0], modes[3]]);
        expect(filterModes(modes, "pr", true)).toEqual([modes[3]]);
        expect(filterModes(modes, "angle", true)).toEqual([]);
    });

    it("keeps unconfigured modes searchable when no mode is used", () => {
        const unusedModes = modes.map((mode) => ({ ...mode, entries: [] }));
        expect(filterModes(unusedModes, "", true)).toEqual(unusedModes);
        expect(filterModes(unusedModes, "angle", true)).toEqual([unusedModes[1]]);
    });

    it("returns no matches for missing names and treats punctuation literally", () => {
        expect(filterModes(modes, "missing", false)).toEqual([]);
        expect(filterModes(modes, ".*", false)).toEqual([]);
        expect(filterModes([], "ar", false)).toEqual([]);
    });

    it("restores the list without losing configuration when search is shortened or cleared", () => {
        const snapshot = JSON.stringify(modes);
        filterModes(modes, "ar", false);
        expect(filterModes(modes, "a", false)).toEqual(modes);
        expect(filterModes(modes, "", false)).toEqual(modes);
        expect(JSON.stringify(modes)).toBe(snapshot);
        expect(filterModes(modes, "ar", false)[0]).toBe(modes[0]);
    });
});
