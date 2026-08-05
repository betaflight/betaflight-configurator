import { defineStore } from "pinia";
import { ref, shallowRef, computed } from "vue";
import { useSettingsStore } from "./settings.js";
import { useLogStore } from "./log.js";
import { PrefStorage } from "../pref_storage.js";

export const GRAPH_MIN_ZOOM = 1;
export const GRAPH_MAX_ZOOM = 1000;
export const GRAPH_DEFAULT_ZOOM = 100;

export const useGraphStore = defineStore("graph", () => {
    const prefs = new PrefStorage();

    // Renderer instances — registered by main.js after creation
    const graph = shallowRef(null);
    const mapGrapher = shallowRef(null);
    const seekBar = shallowRef(null);

    // Canvas DOM refs — registered by main.js
    const canvasRefs = shallowRef(null);

    const graphConfig = ref(null);
    const activeGraphConfig = shallowRef(null);
    const lastGraphConfig = ref(null);
    const graphZoom = ref(GRAPH_DEFAULT_ZOOM);
    const lastGraphZoom = ref(GRAPH_DEFAULT_ZOOM);

    const hasTableOverlay = ref(false);
    const hasAnalyser = ref(false);
    const hasAnalyserFullscreen = ref(false);
    const hasAnalyserSticks = ref(false);
    const settingsStore = useSettingsStore();
    const hasCraft = computed(() => !!settingsStore.userSettings.drawCraft);
    const hasSticks = computed(() => !!settingsStore.userSettings.drawSticks);
    const hasMap = ref(false);
    const hasMarker = ref(false);
    const hasConfig = ref(false);
    const hasConfigOverlay = ref(false);
    const configFileName = ref("");
    const configLines = shallowRef([]);

    // Legend
    const legendVisible = ref(true);
    const legendTitle = ref("Legend");
    const legendGraphs = shallowRef([]);
    // Each: { label, fields: [{ name, friendlyName, color, hidden }] }
    const legendValues = shallowRef({});
    // Map of fieldName → { value, settings }

    // Analyser
    const analyserLayout = shallowRef({ width: 0, height: 0, left: 0, top: 0 });
    const spectrumShiftActive = ref(false);
    const segmentLengthMax = ref(20);

    const isFullscreen = ref(false);
    const markerTime = ref(0);
    const seekBarMode = ref("avgThrottle");

    // Callbacks registered by main.js
    const invalidateGraph = shallowRef(null);
    const updateCanvasSize = shallowRef(null);
    const zoomGraphConfig = shallowRef(null);
    const expandGraphConfig = shallowRef(null);
    const reorderGraphs = shallowRef(null);
    const resetPen = shallowRef(null);
    const fieldWheel = shallowRef(null);
    const spectrumExport = shallowRef(null);
    const spectrumImport = shallowRef(null);
    const spectrumClear = shallowRef(null);
    const applyGraphZoom = shallowRef(null);
    const selectLogIndex = shallowRef(null);
    const setSeekBarMode = shallowRef(null);

    // --- Legend actions ---

    function buildLegendGraphs() {
        const graphs = activeGraphConfig.value?.getGraphs() ?? [];
        legendGraphs.value = graphs.map((g, gi) => ({
            label: g.label,
            fields: g.fields.map((f, fi) => ({
                name: f.name,
                friendlyName: f.friendlyName,
                color: f.color,
                hidden: activeGraphConfig.value.isGraphFieldHidden(gi, fi),
            })),
        }));
    }

    function highlightLegendField(gi, fi) {
        if (!activeGraphConfig.value) {
            return;
        }
        activeGraphConfig.value.highlightGraphIndex = gi;
        activeGraphConfig.value.highlightFieldIndex = fi;
        invalidateGraph.value?.();
    }

    function selectLegendField(gi, fi, fieldName, ctrlKey) {
        if (!activeGraphConfig.value) {
            return;
        }
        const toggleAnalizer = activeGraphConfig.value.selectedFieldName === fieldName;
        const lockAnalyserHide = ctrlKey || graph.value?.hasMultiSpectrumAnalyser();
        if (toggleAnalizer) {
            hasAnalyser.value = lockAnalyserHide ? true : !hasAnalyser.value;
        } else {
            activeGraphConfig.value.selectedFieldName = fieldName;
            activeGraphConfig.value.selectedGraphIndex = gi;
            activeGraphConfig.value.selectedFieldIndex = fi;
            hasAnalyser.value = true;
        }
        graph.value?.setDrawAnalyser(hasAnalyser.value, ctrlKey);
        prefs.set("hasAnalyser", hasAnalyser.value);
        invalidateGraph.value?.();
    }

    function toggleLegendField(gi, fi) {
        if (!activeGraphConfig.value) {
            return;
        }
        activeGraphConfig.value.toggleGraphField(gi, fi);
        buildLegendGraphs();
        invalidateGraph.value?.();
    }

    function legendVisibilityChange(hidden) {
        prefs.set("log-legend-hidden", hidden);
        updateCanvasSize.value?.();
    }

    function toggleAnalyser() {
        if (activeGraphConfig.value?.selectedFieldName == null) {
            const graphs = activeGraphConfig.value?.getGraphs() ?? [];
            if (graphs.length === 0 || graphs[0].fields.length === 0) {
                hasAnalyser.value = false;
            } else {
                activeGraphConfig.value.selectedFieldName = graphs[0].fields[0].friendlyName;
                activeGraphConfig.value.selectedGraphIndex = 0;
                activeGraphConfig.value.selectedFieldIndex = 0;
                hasAnalyser.value = true;
            }
        } else {
            hasAnalyser.value = !hasAnalyser.value;
        }
        if (!hasAnalyser.value) {
            hasAnalyserFullscreen.value = false;
            graph.value?.setAnalyser(false);
        }
        graph.value?.setDrawAnalyser(hasAnalyser.value);
        prefs.set("hasAnalyser", hasAnalyser.value);
        invalidateGraph.value?.();
    }

    function toggleAnalyserFullscreen() {
        hasAnalyserFullscreen.value = hasAnalyser.value ? !hasAnalyserFullscreen.value : false;
        graph.value?.setAnalyser(hasAnalyserFullscreen.value);
        invalidateGraph.value?.();
    }

    function toggleMap() {
        hasMap.value = !hasMap.value;
        prefs.set("hasMap", hasMap.value);
        const logStore = useLogStore();
        if (logStore.flightLog?.hasGpsData()) {
            mapGrapher.value?.initialize();
        }
    }

    function setGraphZoom(zoom) {
        graphZoom.value = Math.max(GRAPH_MIN_ZOOM, Math.min(GRAPH_MAX_ZOOM, zoom));
    }

    function quickZoomToggle(newZoom) {
        if (graphZoom.value === newZoom) {
            setGraphZoom(lastGraphZoom.value);
        } else {
            lastGraphZoom.value = graphZoom.value;
            setGraphZoom(newZoom);
        }
    }

    return {
        graph,
        mapGrapher,
        seekBar,
        canvasRefs,
        graphConfig,
        activeGraphConfig,
        lastGraphConfig,
        graphZoom,
        lastGraphZoom,
        hasTableOverlay,
        hasAnalyser,
        hasAnalyserFullscreen,
        hasAnalyserSticks,
        hasCraft,
        hasSticks,
        hasMap,
        hasMarker,
        hasConfig,
        hasConfigOverlay,
        configFileName,
        configLines,
        legendVisible,
        legendTitle,
        legendGraphs,
        legendValues,
        analyserLayout,
        spectrumShiftActive,
        segmentLengthMax,
        isFullscreen,
        markerTime,
        seekBarMode,
        invalidateGraph,
        updateCanvasSize,
        zoomGraphConfig,
        expandGraphConfig,
        reorderGraphs,
        resetPen,
        fieldWheel,
        spectrumExport,
        spectrumImport,
        spectrumClear,
        applyGraphZoom,
        selectLogIndex,
        setSeekBarMode,
        buildLegendGraphs,
        highlightLegendField,
        selectLegendField,
        toggleLegendField,
        legendVisibilityChange,
        toggleAnalyser,
        toggleAnalyserFullscreen,
        toggleMap,
        setGraphZoom,
        quickZoomToggle,
    };
});
