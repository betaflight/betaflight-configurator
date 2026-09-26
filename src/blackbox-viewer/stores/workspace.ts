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
import { ref, shallowRef } from "vue";

export const useWorkspaceStore = defineStore("workspace", () => {
    const workspaceGraphConfigs = ref<Array<{ title: string; [key: string]: unknown } | undefined>>([]);
    const activeWorkspace = ref(1);
    const bookmarkTimes = ref<Array<number | null | undefined>>([]);

    function setActiveWorkspace(id: number) {
        activeWorkspace.value = id;
    }

    function setWorkspaceGraphConfigs(configs: Array<{ title: string; [key: string]: unknown } | undefined>) {
        workspaceGraphConfigs.value = configs;
    }

    const showDefaultMenu = ref(false);

    // Callbacks registered by main.js
    const switchWorkspace = shallowRef<((id: number) => void) | null>(null);
    const saveWorkspace = shallowRef<((id: number, title: string) => void) | null>(null);
    const renameWorkspace = shallowRef<((id: number, title: string) => void) | null>(null);
    const applyDefaultWorkspace = shallowRef<((index: number) => void) | null>(null);
    const gotoBookmark = shallowRef<((index: number) => void) | null>(null);

    /** Get title for a workspace slot (1-9, 0) */
    function getTitle(id: number) {
        const entry = workspaceGraphConfigs.value[id];
        return entry ? entry.title : null;
    }

    /** Check if a workspace slot has data */
    function hasWorkspace(id: number) {
        return workspaceGraphConfigs.value[id] != null;
    }

    return {
        workspaceGraphConfigs,
        activeWorkspace,
        bookmarkTimes,
        setActiveWorkspace,
        setWorkspaceGraphConfigs,
        showDefaultMenu,
        switchWorkspace,
        saveWorkspace,
        renameWorkspace,
        applyDefaultWorkspace,
        gotoBookmark,
        getTitle,
        hasWorkspace,
    };
});
