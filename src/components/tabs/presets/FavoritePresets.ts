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

import { get as getConfig, set as setConfig } from "../../../js/ConfigStorage";
import type { Preset, PresetLinkSource } from "../../../stores/presets_helpers";

const s_maxFavoritePresetsCount = 50;
const s_favoritePresetsListConfigStorageName = "FavoritePresetsList";

/** One favourite as persisted: plain JSON, so entries read back from storage are not class instances. */
interface FavoritePresetEntry {
    presetPath: string;
    lastPickDate: number;
}

class FavoritePreset implements FavoritePresetEntry {
    presetPath: string;
    lastPickDate: number;

    constructor(presetPath: string) {
        this.presetPath = presetPath;
        this.lastPickDate = Date.now();
    }
}

class FavoritePresetsData {
    _favoritePresetsList: FavoritePresetEntry[];

    constructor() {
        this._favoritePresetsList = [];
    }

    _sort(): void {
        this._favoritePresetsList.sort((a, b) => a.lastPickDate - b.lastPickDate);
    }

    _purgeOldPresets(): void {
        this._favoritePresetsList.splice(s_maxFavoritePresetsCount + 1, this._favoritePresetsList.length);
    }

    loadFromStorage(): void {
        this._favoritePresetsList = [];
        const obj = getConfig<FavoritePresetEntry[]>(s_favoritePresetsListConfigStorageName);

        if (obj[s_favoritePresetsListConfigStorageName]) {
            this._favoritePresetsList = obj[s_favoritePresetsListConfigStorageName];
        }
    }

    saveToStorage(): void {
        const obj: Record<string, FavoritePresetEntry[]> = {};
        obj[s_favoritePresetsListConfigStorageName] = this._favoritePresetsList;
        setConfig(obj);
    }

    add(presetPath: string): FavoritePresetEntry {
        let preset = this.findPreset(presetPath);

        if (!preset) {
            preset = new FavoritePreset(presetPath);
            this._favoritePresetsList.push(preset);
        }

        preset.lastPickDate = Date.now();
        this._sort();
        this._purgeOldPresets();

        return preset;
    }

    delete(presetPath: string): void {
        const index = this._favoritePresetsList.findIndex((preset) => preset.presetPath === presetPath);

        if (index >= 0) {
            this._favoritePresetsList.splice(index, 1);
            this._sort();
            this._purgeOldPresets();
        }
    }

    findPreset(presetPath: string): FavoritePresetEntry | undefined {
        return this._favoritePresetsList.find((preset) => preset.presetPath === presetPath);
    }
}

/** Favourite presets, keyed by their online link so the same preset is recognised across sessions. */
class FavoritePresetsClass {
    _favoritePresetsData: FavoritePresetsData;

    constructor() {
        this._favoritePresetsData = new FavoritePresetsData();
    }

    /** Marks the preset as a favourite picked now, and returns that pick date. */
    add(preset: Preset, repo: PresetLinkSource): number {
        return this._favoritePresetsData.add(repo.getPresetOnlineLink(preset)).lastPickDate;
    }

    delete(preset: Preset, repo: PresetLinkSource): void {
        this._favoritePresetsData.delete(repo.getPresetOnlineLink(preset));
    }

    getLastPickDate(preset: Preset, repo: PresetLinkSource): number | undefined {
        return this._favoritePresetsData.findPreset(repo.getPresetOnlineLink(preset))?.lastPickDate;
    }

    saveToStorage(): void {
        this._favoritePresetsData.saveToStorage();
    }

    loadFromStorage(): void {
        this._favoritePresetsData.loadFromStorage();
    }
}

const favoritePresets = new FavoritePresetsClass();
favoritePresets.loadFromStorage();

export { favoritePresets };
