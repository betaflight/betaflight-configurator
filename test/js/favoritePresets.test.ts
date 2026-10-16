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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Preset } from "../../src/stores/presets_helpers";

const STORAGE_KEY = "FavoritePresetsList";
const repo = { getPresetOnlineLink: (preset: Preset) => `https://example.com/${preset.fullPath}` };
const presetA: Preset = { fullPath: "a.txt" };
const presetB: Preset = { fullPath: "b.txt" };

// The module loads its singleton from storage at import, so each test imports it afresh.
async function loadFavoritePresets() {
    vi.resetModules();
    const { favoritePresets } = await import("../../src/components/tabs/presets/FavoritePresets");
    return favoritePresets;
}

function storedList(): { presetPath: string; lastPickDate: number }[] {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")[STORAGE_KEY];
}

describe("favoritePresets", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
        vi.setSystemTime(1000);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("starts empty when nothing is stored", async () => {
        const favoritePresets = await loadFavoritePresets();

        expect(favoritePresets.getLastPickDate(presetA, repo)).toBeUndefined();
    });

    it("returns the pick date from add and finds the preset by its online link", async () => {
        const favoritePresets = await loadFavoritePresets();

        expect(favoritePresets.add(presetA, repo)).toBe(1000);
        expect(favoritePresets.getLastPickDate(presetA, repo)).toBe(1000);
        expect(favoritePresets.getLastPickDate({ fullPath: "a.txt" }, repo)).toBe(1000);
        expect(favoritePresets.getLastPickDate(presetB, repo)).toBeUndefined();
    });

    it("updates the pick date when a favourite is added again, without duplicating it", async () => {
        const favoritePresets = await loadFavoritePresets();
        favoritePresets.add(presetA, repo);

        vi.setSystemTime(2000);
        expect(favoritePresets.add(presetA, repo)).toBe(2000);

        favoritePresets.saveToStorage();
        expect(storedList()).toEqual([{ presetPath: "https://example.com/a.txt", lastPickDate: 2000 }]);
    });

    it("deletes only the given preset", async () => {
        const favoritePresets = await loadFavoritePresets();
        favoritePresets.add(presetA, repo);
        favoritePresets.add(presetB, repo);

        favoritePresets.delete(presetB, repo);

        expect(favoritePresets.getLastPickDate(presetA, repo)).toBe(1000);
        expect(favoritePresets.getLastPickDate(presetB, repo)).toBeUndefined();

        favoritePresets.delete(presetA, repo);
        expect(favoritePresets.getLastPickDate(presetA, repo)).toBeUndefined();
    });

    it("saves oldest pick first and restores the list on the next import", async () => {
        const favoritePresets = await loadFavoritePresets();
        vi.setSystemTime(3000);
        favoritePresets.add(presetB, repo);
        vi.setSystemTime(2000);
        favoritePresets.add(presetA, repo);
        favoritePresets.saveToStorage();

        expect(storedList().map((entry) => entry.lastPickDate)).toEqual([2000, 3000]);

        const reloaded = await loadFavoritePresets();
        expect(reloaded.getLastPickDate(presetA, repo)).toBe(2000);
        expect(reloaded.getLastPickDate(presetB, repo)).toBe(3000);
    });

    it("clears unsaved favourites when reloading with nothing stored", async () => {
        const favoritePresets = await loadFavoritePresets();
        favoritePresets.add(presetA, repo);

        favoritePresets.loadFromStorage();

        expect(favoritePresets.getLastPickDate(presetA, repo)).toBeUndefined();
    });

    it("drops unsaved favourites when reloading from storage", async () => {
        const favoritePresets = await loadFavoritePresets();
        favoritePresets.add(presetA, repo);
        favoritePresets.saveToStorage();
        favoritePresets.add(presetB, repo);

        favoritePresets.loadFromStorage();

        expect(favoritePresets.getLastPickDate(presetA, repo)).toBe(1000);
        expect(favoritePresets.getLastPickDate(presetB, repo)).toBeUndefined();
    });
});
