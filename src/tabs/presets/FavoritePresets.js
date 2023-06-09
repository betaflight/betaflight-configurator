import { get as getConfig, set as setConfig } from "../../js/ConfigStorage";

const s_maxFavoritePresetsCount = 50;
const s_favoritePresetsListConfigStorageName = "FavoritePresetsList";

class FavoritePreset {
    constructor(presetPath){
        this.presetPath = presetPath;
        this.lastPickDate = Date.now();
    }
}


class FavoritePresetsData {
    constructor() {
        this._favoritePresetsList = [];
    }

    _sort() {
        this._favoritePresetsList.sort((a, b) => (a.lastPickDate - b.lastPickDate));
    }

    _purgeOldPresets() {
        this._favoritePresetsList.splice(s_maxFavoritePresetsCount + 1, this._favoritePresetsList.length);
    }

    loadFromStorage() {
        this._favoritePresetsList = [];
        const obj = getConfig(s_favoritePresetsListConfigStorageName);

        if (obj[s_favoritePresetsListConfigStorageName]) {
            this._favoritePresetsList = obj[s_favoritePresetsListConfigStorageName];
        }
    }

    saveToStorage() {
        const obj = {};
        obj[s_favoritePresetsListConfigStorageName] = this._favoritePresetsList;
        setConfig(obj);
    }

    add(presetPath) {
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

    delete(presetPath) {
        const index = this._favoritePresetsList.findIndex((preset) => preset.presetPath === presetPath);

        if (index >= 0) {
            this._favoritePresetsList.splice(index, 1);
            this._sort();
            this._purgeOldPresets();
        }
    }

    findPreset(presetPath) {
        return this._favoritePresetsList.find((preset) => preset.presetPath === presetPath);
    }
}


class FavoritePresetsClass {
    constructor() {
        this._favoritePresetsData = new FavoritePresetsData();
    }

    add(preset, repo) {
        const favoritePreset = this._favoritePresetsData.add(repo.getPresetOnlineLink(preset));
        preset.lastPickDate = favoritePreset.lastPickDate;
    }

    delete(preset, repo) {
        this._favoritePresetsData.delete(repo.getPresetOnlineLink(preset));
        preset.lastPickDate = undefined;
    }

    addLastPickDate(presets, repo) {
        for (let preset of presets) {
            let favoritePreset = this._favoritePresetsData.findPreset(repo.getPresetOnlineLink(preset));

            if (favoritePreset) {
                preset.lastPickDate = favoritePreset.lastPickDate;
            }
        }
    }

    saveToStorage() {
        this._favoritePresetsData.saveToStorage();
    }

    loadFromStorage() {
        this._favoritePresetsData.loadFromStorage();
    }
}


let favoritePresets; // for export as singleton

if (!favoritePresets) {
    favoritePresets = new FavoritePresetsClass();
    favoritePresets.loadFromStorage();
}

export { favoritePresets };
