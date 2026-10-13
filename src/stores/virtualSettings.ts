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
import { ref } from "vue";
import semver from "semver";
import { useConnectionStore } from "./connection";
import { API_VERSION_1_46 } from "../js/data_storage";
import type { SettingInfo } from "../composables/useMspSetting";

const MIXER_TYPES = ["LEGACY", "LINEAR", "DYNAMIC", "EZLANDING"];

/**
 * VirtualFC resets its demo MSP data on reconnect. Named settings deliberately survive those
 * reconnects for the app session so simulated Save and Reboot can be reviewed; a page reload
 * starts them from defaults again.
 */
export const useVirtualSettingsStore = defineStore("virtualSettings", () => {
    const mixerType = ref("LEGACY");

    function supports(setting: string): boolean {
        return setting === "mixer_type" && semver.gte(useConnectionStore().virtualApiVersion, API_VERSION_1_46);
    }

    function getSetting(setting: string): string | null {
        return supports(setting) ? mixerType.value : null;
    }

    function getSettingInfo(setting: string): SettingInfo | null {
        return supports(setting) ? { type: "lookup", min: null, max: null, values: [...MIXER_TYPES] } : null;
    }

    function setSetting(setting: string, value: string | number): string {
        const selected = String(value).toUpperCase();
        if (!supports(setting) || !MIXER_TYPES.includes(selected)) {
            throw new Error(`The virtual flight controller refused ${setting} = ${value}`);
        }
        mixerType.value = selected;
        return selected;
    }

    return { mixerType, getSetting, getSettingInfo, setSetting };
});
