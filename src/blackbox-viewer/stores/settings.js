import { defineStore } from "pinia";
import { reactive, toRaw } from "vue";
import { defaultUserSettings } from "../user_settings_data.js";
import { PrefStorage } from "../pref_storage.js";

const prefs = new PrefStorage();

function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        const sv = source[key];
        if (sv && typeof sv === "object" && !Array.isArray(sv) && target[key] && typeof target[key] === "object") {
            Object.assign(target[key], sv);
        } else {
            target[key] = sv;
        }
    }
}

export const useSettingsStore = defineStore("settings", () => {
    const userSettings = reactive(structuredClone(defaultUserSettings));

    function load() {
        prefs.get("userSettings", (item) => {
            if (item) {
                const merged = structuredClone(defaultUserSettings);
                deepMerge(merged, item);
                Object.assign(userSettings, merged);
            }
        });
    }

    function saveAll(newSettings) {
        Object.assign(userSettings, newSettings);
        prefs.set("userSettings", toRaw(userSettings));
    }

    function saveSetting(key, value) {
        userSettings[key] = value;
        prefs.set("userSettings", { ...toRaw(userSettings) });
    }

    // Load persisted settings on creation
    load();

    return {
        userSettings,
        load,
        saveAll,
        saveSetting,
    };
});
