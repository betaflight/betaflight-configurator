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
import { ref, watch } from "vue";
import { useConnectionStore } from "./connection";

/** Keep mixer recovery state across tab changes, without carrying it onto another connection. */
export const useMixerSaveStore = defineStore("mixerSave", () => {
    const loadedMixerType = ref<string | null>(null);
    const controllerMixerType = ref<string | null>(null);
    const mixerNeedsSave = ref(false);
    const mixerPersistenceUncertain = ref(false);

    const connection = useConnectionStore();
    watch(
        () => connection.connectedTo,
        () => {
            loadedMixerType.value = null;
            controllerMixerType.value = null;
            mixerNeedsSave.value = false;
            mixerPersistenceUncertain.value = false;
        },
        { flush: "sync" },
    );

    return { loadedMixerType, controllerMixerType, mixerNeedsSave, mixerPersistenceUncertain };
});
