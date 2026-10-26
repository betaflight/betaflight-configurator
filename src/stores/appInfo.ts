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
import { computed, ref } from "vue";
import { getOS } from "../js/utils/checkCompatibility";

/** Facts about the app and the machine it runs on, fixed for the whole session. */
export const useAppInfoStore = defineStore("appInfo", () => {
    /** "Windows", "MacOS", "Linux", "ChromeOS", "Android", "iOS" or "unknown" */
    const operatingSystem = ref(getOS());

    // Injected by vite. The typeof checks keep the defaults for code run without vite's defines.
    const productName = ref(typeof __APP_PRODUCTNAME__ === "undefined" ? "Betaflight App" : __APP_PRODUCTNAME__);
    const version = ref(typeof __APP_VERSION__ === "undefined" ? "0.0.0" : __APP_VERSION__);
    const gitRevision = ref(typeof __APP_REVISION__ === "undefined" ? "unknown" : __APP_REVISION__);

    /** The version, with the git revision appended unless the version already contains it. */
    const displayVersion = computed(() =>
        version.value.includes(gitRevision.value) ? version.value : `${version.value} (${gitRevision.value})`,
    );

    return {
        operatingSystem,
        productName,
        version,
        gitRevision,
        displayVersion,
    };
});
