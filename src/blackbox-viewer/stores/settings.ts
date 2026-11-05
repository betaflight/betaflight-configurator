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

import { defineStore } from "pinia";
import { reactive, toRaw } from "vue";
import { defaultUserSettings, type UserSettings } from "../user_settings_data";
import { PrefStorage } from "../pref_storage";

const prefs = new PrefStorage();

/** Copies source over target, merging (one level deep) where both hold an object. */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const key of Object.keys(source)) {
        const sv = source[key];
        const tv = target[key];
        if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object") {
            Object.assign(tv, sv);
        } else {
            target[key] = sv;
        }
    }
}

export const useSettingsStore = defineStore("settings", () => {
    const userSettings = reactive<UserSettings>(structuredClone(defaultUserSettings));

    function load(): void {
        prefs.get("userSettings", (item) => {
            if (item) {
                const merged = structuredClone(defaultUserSettings);
                // Whatever was stored, possibly by an older version, goes over the defaults as is.
                deepMerge(merged as unknown as Record<string, unknown>, item as Record<string, unknown>);
                Object.assign(userSettings, merged);
            }
        });
    }

    function saveAll(newSettings: Partial<UserSettings>): void {
        Object.assign(userSettings, newSettings);
        prefs.set("userSettings", toRaw(userSettings));
    }

    function saveSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
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
