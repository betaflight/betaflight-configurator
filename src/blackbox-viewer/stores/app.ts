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
import type { GraphPanelConfig } from "./graph";
import type { defaultUserSettings } from "../user_settings_data.js";

export type UserSettings = typeof defaultUserSettings;

export const useAppStore = defineStore("app", () => {
    const legendHidden = ref(false);
    const viewVideo = ref(true);
    const darkThemeEnabled = ref(false);

    // True while the viewer is the visible tab. Embedded, the host tab flips this on
    // activate/deactivate so the viewer's document-level handlers (keyboard, wheel, drag) go
    // dormant behind other tabs. Defaults true so the standalone viewer is unaffected.
    const viewerActive = ref(true);

    // Filename of loaded log (pushed from legacy code)
    const logFilename = ref("");

    // Status bar display strings (pushed from legacy code)
    const statusVersion = ref("-");
    const statusCells = ref("");
    const statusLooptime = ref("-");
    const statusLograte = ref("-");
    const statusLograteWarning = ref<string | null>(null);
    const statusFlightMode = ref("-");
    const statusMarkerOffset = ref("00:00.000");
    const statusViewerVersion = ref("-");
    const graphTimeDisplay = ref("1.0");
    const videoOffsetDisplay = ref("+0.0");

    // Dialog open states (shared between legacy JS and Vue)
    const graphConfigDialogOpen = ref(false);
    const headerDialogOpen = ref(false);
    const settingsDialogOpen = ref(false);
    const keysDialogOpen = ref(false);
    const videoExportDialogOpen = ref(false);

    // Callbacks registered by main.js (closure-dependent operations)
    const loadFiles = shallowRef<((files: FileList | File[]) => void) | null>(null);
    const loadLogBuffer = shallowRef<((data: ArrayBuffer | Uint8Array, name?: string) => void) | null>(null);
    const newGraphConfig = shallowRef<((newConfig: GraphPanelConfig[], redrawChart: boolean) => void) | null>(null);
    const exportCsv = shallowRef<(() => void) | null>(null);
    const exportGpx = shallowRef<(() => void) | null>(null);
    const exportWorkspaces = shallowRef<(() => void) | null>(null);
    const saveUserSettings = shallowRef<((newSettings: Partial<UserSettings>) => void) | null>(null);
    const refreshGraph = shallowRef<(() => void) | null>(null);

    function setLegendHidden(hidden: boolean) {
        legendHidden.value = hidden;
    }

    function setViewVideo(visible: boolean) {
        viewVideo.value = visible;
    }

    return {
        legendHidden,
        viewVideo,
        darkThemeEnabled,
        viewerActive,
        logFilename,
        statusVersion,
        statusCells,
        statusLooptime,
        statusLograte,
        statusLograteWarning,
        statusFlightMode,
        statusMarkerOffset,
        statusViewerVersion,
        graphTimeDisplay,
        videoOffsetDisplay,
        graphConfigDialogOpen,
        headerDialogOpen,
        settingsDialogOpen,
        keysDialogOpen,
        videoExportDialogOpen,
        loadFiles,
        loadLogBuffer,
        newGraphConfig,
        exportCsv,
        exportGpx,
        exportWorkspaces,
        saveUserSettings,
        refreshGraph,
        setLegendHidden,
        setViewVideo,
    };
});
