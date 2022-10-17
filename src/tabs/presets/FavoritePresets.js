
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
        const obj = ConfigStorage.get(s_favoritePresetsListConfigStorageName);

        if (obj[s_favoritePresetsListConfigStorageName]) {
            this._favoritePresetsList = obj[s_favoritePresetsListConfigStorageName];
        }
    }

    saveToStorage() {
        const obj = {};
        obj[s_favoritePresetsListConfigStorageName] = this._favoritePresetsList;
        ConfigStorage.set(obj);
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

    add(preset) {
        const favoritePreset = this._favoritePresetsData.add(preset.fullPath);
        preset.lastPickDate = favoritePreset.lastPickDate;
    }

    delete(preset) {
        this._favoritePresetsData.delete(preset.fullPath);
        preset.lastPickDate = undefined;
    }

    addLastPickDate(presets) {
        for (let preset of presets) {
            let favoritePreset = this._favoritePresetsData.findPreset(preset.fullPath);

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
