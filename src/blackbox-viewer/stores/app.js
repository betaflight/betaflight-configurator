import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

export const useAppStore = defineStore("app", () => {
    const legendHidden = ref(false);
    const viewVideo = ref(true);
    const darkThemeEnabled = ref(false);

    // Filename of loaded log (pushed from legacy code)
    const logFilename = ref("");

    // Status bar display strings (pushed from legacy code)
    const statusVersion = ref("-");
    const statusCells = ref("");
    const statusLooptime = ref("-");
    const statusLograte = ref("-");
    const statusLograteWarning = ref(null);
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

    // Callbacks registered by main.js (closure-dependent operations)
    const loadFiles = shallowRef(null);
    const newGraphConfig = shallowRef(null);
    const exportCsv = shallowRef(null);
    const exportGpx = shallowRef(null);
    const exportWorkspaces = shallowRef(null);
    const saveUserSettings = shallowRef(null);
    const refreshGraph = shallowRef(null);

    function setLegendHidden(hidden) {
        legendHidden.value = hidden;
    }

    function setViewVideo(visible) {
        viewVideo.value = visible;
    }

    return {
        legendHidden,
        viewVideo,
        darkThemeEnabled,
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
        loadFiles,
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
