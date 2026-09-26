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
import { ref, shallowRef, computed, nextTick } from "vue";
import { useSettingsStore } from "./settings.js";
import { useLogStore } from "./log";
import { PrefStorage } from "../pref_storage.js";
import type { FlightLogGrapher } from "../grapher.js";
import type { GraphConfig } from "../graph_config.js";
import type { MapGrapher } from "../graph_map.js";
import type { SeekBar } from "../seekbar.js";

export type GrapherInstance = InstanceType<typeof FlightLogGrapher>;
export type GraphConfigInstance = InstanceType<typeof GraphConfig>;

/** A field of a graph panel, as saved and as GraphConfig.getGraphs() returns it. */
export interface GraphFieldConfig {
    name: string;
    friendlyName?: string;
    smoothing?: number;
    curve?: {
        power?: number;
        MinMax?: { min?: number; max?: number };
        highPrecise?: boolean;
    };
    default?: { smoothing?: number; power?: number; MinMax?: { min?: number; max?: number } };
    /** A palette colour, or -1 for "assign one from the palette" (see GraphConfig.extendFields). */
    color?: string | -1;
    lineWidth?: number;
}

/** A graph panel, as saved and as GraphConfig.getGraphs() returns it. */
export interface GraphPanelConfig {
    label: string;
    height?: number;
    fields: GraphFieldConfig[];
}

export interface LegendField {
    name: string;
    friendlyName: string;
    color: string;
    hidden: boolean;
}

export interface LegendGraph {
    label: string;
    fields: LegendField[];
}

export interface CanvasRefs {
    canvas: HTMLCanvasElement;
    analyserCanvas: HTMLCanvasElement;
    stickCanvas: HTMLCanvasElement;
    craftCanvas: HTMLCanvasElement;
}

type Action = () => void;

export const GRAPH_MIN_ZOOM = 1;
export const GRAPH_MAX_ZOOM = 1000;
export const GRAPH_DEFAULT_ZOOM = 100;

export const useGraphStore = defineStore("graph", () => {
    const prefs = new PrefStorage();

    // Renderer instances — registered by main.js after creation
    const graph = shallowRef<GrapherInstance | null>(null);
    const mapGrapher = shallowRef<InstanceType<typeof MapGrapher> | null>(null);
    const seekBar = shallowRef<InstanceType<typeof SeekBar> | null>(null);

    // Canvas DOM refs — registered by main.js
    const canvasRefs = shallowRef<CanvasRefs | null>(null);

    const graphConfig = ref<GraphPanelConfig[] | null>(null);
    const activeGraphConfig = shallowRef<GraphConfigInstance | null>(null);
    const lastGraphConfig = ref<GraphPanelConfig[] | null>(null);
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
    const configLines = shallowRef<string[]>([]);

    // Legend
    const legendVisible = ref(true);
    const legendTitle = ref("Legend");
    const legendGraphs = shallowRef<LegendGraph[]>([]);
    const legendValues = shallowRef<Record<string, { value: string | number; settings: string } | undefined>>({});

    // Analyser
    const analyserLayout = shallowRef({ width: 0, height: 0, left: 0, top: 0 });
    const spectrumShiftActive = ref(false);
    const segmentLengthMax = ref(20);

    const isFullscreen = ref(false);
    const markerTime = ref(0);
    const seekBarMode = ref("avgThrottle");

    // Callbacks registered by main.js
    const invalidateGraph = shallowRef<Action | null>(null);
    const updateCanvasSize = shallowRef<Action | null>(null);
    const zoomGraphConfig = shallowRef<((graphIndex: number) => void) | null>(null);
    const expandGraphConfig = shallowRef<((graphIndex: number) => void) | null>(null);
    const reorderGraphs = shallowRef<((newOrder: number[]) => void) | null>(null);
    const resetPen = shallowRef<((graphIndex: number, fieldIndex: number | null) => void) | null>(null);
    const fieldWheel = shallowRef<
        | ((
              graphIndex: number,
              fieldIndex: number | null,
              delta: number,
              shiftKey: boolean,
              altKey: boolean,
              ctrlKey: boolean,
          ) => void)
        | null
    >(null);
    const spectrumExport = shallowRef<Action | null>(null);
    const spectrumImport = shallowRef<((files: FileList | null) => void) | null>(null);
    const spectrumClear = shallowRef<Action | null>(null);
    const applyGraphZoom = shallowRef<((zoom: number) => void) | null>(null);
    const selectLogIndex = shallowRef<((index: number) => void) | null>(null);
    const setSeekBarMode = shallowRef<((mode: string) => void) | null>(null);

    // --- Legend actions ---

    function buildLegendGraphs() {
        const config = activeGraphConfig.value;
        if (!config) {
            legendGraphs.value = [];
            return;
        }
        const graphs = config.getGraphs();
        legendGraphs.value = graphs.map((g: GraphPanelConfig, gi: number) => ({
            label: g.label,
            fields: g.fields.map((f, fi) => ({
                name: f.name,
                friendlyName: f.friendlyName,
                color: f.color,
                hidden: config.isGraphFieldHidden(gi, fi),
            })),
        }));
    }

    function highlightLegendField(gi: number | null, fi: number | null) {
        if (!activeGraphConfig.value) {
            return;
        }
        activeGraphConfig.value.highlightGraphIndex = gi;
        activeGraphConfig.value.highlightFieldIndex = fi;
        invalidateGraph.value?.();
    }

    function selectLegendField(gi: number, fi: number, fieldName: string, ctrlKey: boolean) {
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

    function toggleLegendField(gi: number, fi: number) {
        if (!activeGraphConfig.value) {
            return;
        }
        activeGraphConfig.value.toggleGraphField(gi, fi);
        buildLegendGraphs();
        invalidateGraph.value?.();
    }

    function legendVisibilityChange(hidden: boolean) {
        prefs.set("log-legend-hidden", hidden);
        updateCanvasSize.value?.();
    }

    function toggleAnalyser() {
        const config = activeGraphConfig.value;
        if (config?.selectedFieldName == null) {
            const graphs = config?.getGraphs() ?? [];
            if (!config || graphs.length === 0 || graphs[0].fields.length === 0) {
                hasAnalyser.value = false;
            } else {
                config.selectedFieldName = graphs[0].fields[0].friendlyName;
                config.selectedGraphIndex = 0;
                config.selectedFieldIndex = 0;
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

    /**
     * Grow the viewer over the host configurator's chrome (sidebar menu and status bar).
     * The `is-fullscreen` class that drives the layout is applied by App.vue on the next
     * flush, so the canvases can only be re-measured once that has landed and the browser
     * has laid the enlarged viewer out.
     */
    function toggleFullscreen() {
        isFullscreen.value = !isFullscreen.value;
        nextTick(() => requestAnimationFrame(() => updateCanvasSize.value?.()));
    }

    function toggleMap() {
        hasMap.value = !hasMap.value;
        prefs.set("hasMap", hasMap.value);
        const logStore = useLogStore();
        if (logStore.flightLog?.hasGpsData()) {
            mapGrapher.value?.initialize();
        }
    }

    function setGraphZoom(zoom: number) {
        graphZoom.value = Math.max(GRAPH_MIN_ZOOM, Math.min(GRAPH_MAX_ZOOM, zoom));
    }

    function quickZoomToggle(newZoom: number) {
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
        toggleFullscreen,
        toggleMap,
        setGraphZoom,
        quickZoomToggle,
    };
});
