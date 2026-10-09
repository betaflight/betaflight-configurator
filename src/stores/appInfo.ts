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
import { getOS } from "../js/utils/checkCompatibility";

/** Facts about the app and the machine it runs on, fixed for the whole session. */
export const useAppInfoStore = defineStore("appInfo", () => {
    /** "Windows", "MacOS", "Linux", "ChromeOS", "Android", "iOS" or "unknown" */
    const operatingSystem = ref(getOS());

    return {
        operatingSystem,
    };
});
