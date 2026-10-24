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

import "./vendor";

import { MapGrapher } from "./graph_map";
import { FlightLogGrapher } from "./grapher";
import { loadConfigurationFile, ConfigurationDefaults } from "./configuration";
import { GraphConfig, type GraphPanelConfig } from "./graph_config";
import { SeekBar } from "./seekbar";
import ctzsnoozeWorkspace from "./ws_ctzsnooze.json";
import supaflyWorkspace from "./ws_supafly.json";
import { FlightLog } from "./flightlog";
import { stringTimetoMsec, validate, mouseNotification } from "./tools";
import { restorePenDefaults, changePenSmoothing, changePenZoom, changePenExpo } from "./pen_adjustment";
import { createKeydownHandler, createDropdownSpaceGuard } from "./keyboard_handler";
import { upgradeWorkspaceFormat, saveWorkspaces, loadWorkspaces } from "./workspace_io";
import { exportCsv, exportGpx, exportSpectrumToCsv } from "./export_utils";
import { cancelActiveVideoExport } from "./video_export";
import {
    syncLogToVideo,
    setVideoOffset,
    setVideoTime,
    setVideoInTime,
    setVideoOutTime,
    loadVideo,
    reportVideoError,
} from "./video_handler";
import { renderLogFileInfo, renderSelectedLogInfo, setSeekBarMode } from "./log_lifecycle";
import {
    invalidateGraph,
    updateCanvasSize,
    setGraphState,
    setCurrentBlackboxTime,
    setPlaybackRate,
    setGraphZoom,
    showConfigFile,
    showValueTable,
    logJumpBack,
    logJumpForward,
    logJumpStart,
    logJumpEnd,
    logPlayPause,
    setMarker,
    logSyncHere,
    logSyncBack,
    logSyncForward,
    logSmartSync,
    videoLoaded,
} from "./playback_controls";
import { PrefStorage } from "./pref_storage";
import { ThemeColors } from "./theme_colors";
import { pinia } from "@/js/pinia_instance";
import { useLogStore } from "./stores/log";
import { useGraphStore } from "./stores/graph";
import { usePlaybackStore, GRAPH_STATE_PAUSED, type OffsetCacheEntry } from "./stores/playback";
import { useWorkspaceStore, type WorkspaceList } from "./stores/workspace";
import { useAppStore } from "./stores/app";
import { useSettingsStore } from "./stores/settings";
import { watch } from "vue";

type OverrideSetting = "graphSmoothOverride" | "graphExpoOverride" | "graphGridOverride";

/** The built-in workspaces, as JSON gives them; they are valid workspace lists. */
const DEFAULT_WORKSPACES = {
    ctzsnooze: ctzsnoozeWorkspace as WorkspaceList,
    supafly: supaflyWorkspace as WorkspaceList,
};

/** An element of the viewer's template; App.vue renders them all before bootstrapViewer() runs. */
function viewerElement<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

/**
 * Start the viewer in the mounted App.vue: create the renderers, register the store callbacks and
 * the document handlers. Returns the teardown, which undoes all of it so the tab can mount again.
 */
export function bootstrapViewer(): () => void {
    // Teardown callbacks, run in reverse on destroy to allow clean re-mount as a tab.
    const cleanupFns: (() => void)[] = [];

    function supportsRequiredAPIs() {
        return (
            globalThis.File &&
            globalThis.FileReader &&
            globalThis.FileList &&
            !!document.createElement("canvas").getContext
        );
    }

    if (!supportsRequiredAPIs()) {
        alert("Your browser does not support the APIs required for reading log files.");
    }

    let graph: FlightLogGrapher | null = null;
    const prefs = new PrefStorage();
    const configurationDefaults = new ConfigurationDefaults(prefs);
    const video = viewerElement<HTMLVideoElement>("logVideo");
    const canvas = viewerElement<HTMLCanvasElement>("graphCanvas");
    const analyserCanvas = viewerElement<HTMLCanvasElement>("analyserCanvas");
    const stickCanvas = viewerElement<HTMLCanvasElement>("stickCanvas");
    const craftCanvas = viewerElement<HTMLCanvasElement>("craftCanvas");
    const seekBarCanvas = viewerElement<HTMLCanvasElement>("seekbarCanvas");
    const seekBar = new SeekBar(seekBarCanvas);
    const mapGrapher = new MapGrapher();
    const activeGraphConfig = new GraphConfig();

    // --- Pinia store sync ---
    // Initialize stores outside Vue component context using the shared Pinia instance.
    // Legacy code remains the driver; we push state changes into stores so Vue components
    // can reactively consume them.
    const logStore = useLogStore(pinia);
    const graphStore = useGraphStore(pinia);
    const playbackStore = usePlaybackStore(pinia);
    const workspaceStore = useWorkspaceStore(pinia);
    const appStore = useAppStore(pinia);
    const settingsStore = useSettingsStore(pinia);
    const userSettings = settingsStore.userSettings;
    graphStore.activeGraphConfig = activeGraphConfig;
    graphStore.mapGrapher = mapGrapher;
    graphStore.seekBar = seekBar;
    graphStore.canvasRefs = { canvas, analyserCanvas, stickCanvas, craftCanvas };
    playbackStore.videoElement = video;

    // Reset transient log state so a re-mounted tab starts at the welcome page rather than
    // pointing at a graph whose canvases were destroyed with the previous mount.
    logStore.hasLog = false;
    logStore.hasVideo = false;
    logStore.flightLog = null;
    graphStore.graph = null;
    // A fresh mount lands on the welcome page, which has no toolbar to leave fullscreen with.
    graphStore.isFullscreen = false;

    graphStore.invalidateGraph = invalidateGraph;
    graphStore.updateCanvasSize = updateCanvasSize;

    // Only called once a log has been loaded into the store.
    function loadedFlightLog(): FlightLog {
        return logStore.flightLog!;
    }

    /**
     * Set the index of the log from the log file that should be viewed. Pass null as the index to open the first
     * available log.
     */
    function selectLog(logIndex: number | null) {
        const flightLog = loadedFlightLog();
        let success = false;

        try {
            if (logIndex === null) {
                for (let i = 0; i < flightLog.getLogCount(); i++) {
                    if (flightLog.openLog(i)) {
                        success = true;
                        playbackStore.currentOffsetCache.index = i;
                        break;
                    }
                }

                if (!success) {
                    throw new Error("No logs in this file could be parsed successfully");
                }
            } else {
                flightLog.openLog(logIndex);
                playbackStore.currentOffsetCache.index = logIndex;
            }
        } catch (e) {
            alert(`Error opening log: ${e}`);
            playbackStore.currentOffsetCache.index = null;
            return;
        }

        if (graph) {
            graph.destroy();
        }

        const sysConfig = flightLog.getSysConfig();
        if (
            sysConfig.looptime != null &&
            sysConfig.frameIntervalPNum != null &&
            sysConfig.frameIntervalPDenom != null
        ) {
            userSettings.analyserSampleRate =
                1000000 /
                ((sysConfig.looptime * validate(sysConfig.pid_process_denom, 1) * sysConfig.frameIntervalPDenom) /
                    sysConfig.frameIntervalPNum);
        }

        const newGraph = new FlightLogGrapher(
            flightLog,
            activeGraphConfig,
            canvas,
            stickCanvas,
            craftCanvas,
            analyserCanvas,
            userSettings,
        );
        graph = newGraph;
        graphStore.graph = newGraph;

        setVideoInTime(null);
        setVideoOutTime(null);

        // A log only loads once graphConfig holds the saved or the example graphs.
        activeGraphConfig.adaptGraphs(flightLog, graphStore.graphConfig!);

        newGraph.onSeek = function (offset) {
            //Seek faster
            offset *= 2;

            if (logStore.hasVideo) {
                setVideoTime(video.currentTime + offset / 1000000);
            } else {
                setCurrentBlackboxTime(logStore.currentBlackboxTime + offset);
            }
            invalidateGraph();
        };

        if (logStore.hasVideo) {
            syncLogToVideo();
        } else {
            // Start at beginning:
            logStore.currentBlackboxTime = flightLog.getMinTime();
        }

        renderSelectedLogInfo();

        updateCanvasSize();

        setGraphState(GRAPH_STATE_PAUSED);
        setGraphZoom(graphStore.graphZoom);
    }

    function loadFiles(files: FileList | File[]) {
        for (const file of files) {
            let isLog = /\.(BBL|TXT|CFL|BFL|LOG)$/i.test(file.name);
            let isVideo = /\.(AVI|MOV|MP4|MPEG)$/i.test(file.name);
            const isWorkspaces = /\.(JSON)$/i.test(file.name);

            if (!isLog && !isVideo && !isWorkspaces) {
                if (file.size < 10 * 1024 * 1024) {
                    isLog = true; //Assume small files are logs rather than videos
                } else {
                    isVideo = true;
                }
            }

            if (isLog) {
                loadLogFile(file);
            } else if (isVideo) {
                loadVideo(file);
            } else if (isWorkspaces) {
                void loadWorkspaces(file, workspaceStore, onSwitchWorkspace);
            }
        }

        // finally, see if there is an offsetCache value already, and auto set the offset
        for (const cachedOffset of playbackStore.offsetCache) {
            if (
                playbackStore.currentOffsetCache.log === cachedOffset.log &&
                playbackStore.currentOffsetCache.index === cachedOffset.index &&
                playbackStore.currentOffsetCache.video === cachedOffset.video
            ) {
                // A cached entry always has its offset; one without it seeks to NaN, as the JavaScript did.
                setVideoOffset(Number(cachedOffset.offset ?? undefined), true);
            }
        }
    }

    /** Parse a log already read into memory, and show its first log that opens. */
    function openLogData(data: Uint8Array, fileInfo: Pick<File, "name">) {
        logStore.flightLogDataArray = data;

        let flightLog: FlightLog;
        try {
            flightLog = new FlightLog(data);
        } catch (err) {
            alert(`Sorry, an error occurred while trying to open this log:\n\n${err}`);
            return;
        }
        logStore.flightLog = flightLog;

        graphStore.graphConfig ??= GraphConfig.getExampleGraphConfigs(flightLog, ["Motors", "Gyros"]);

        renderLogFileInfo(fileInfo);
        graphStore.seekBarMode = "avgThrottle";
        playbackStore.currentOffsetCache.log = fileInfo.name; // store the name of the loaded log file
        playbackStore.currentOffsetCache.index = null; // and clear the index

        logStore.hasLog = true;

        setTimeout(function () {
            globalThis.dispatchEvent(new Event("resize"));
        }, 500); // refresh the window size;

        selectLog(null);

        if (graph) {
            graph.setAnalyser(graphStore.hasAnalyserFullscreen);
        }
    }

    function loadLogFile(file: File) {
        const reader = new FileReader();

        reader.onload = function () {
            const bytes = reader.result as ArrayBuffer;

            // The first 100 bytes say whether it is a CLI dump; a shorter file is read whole.
            const fileContents = String.fromCodePoint(...new Uint8Array(bytes, 0, Math.min(100, bytes.byteLength)));

            if (/# dump|# diff/i.exec(fileContents)) {
                // this is actually a configuration file
                try {
                    // Firstly, is this a configuration defaults file
                    // (the filename contains the word 'default')

                    if (/default/i.exec(file.name)) {
                        configurationDefaults.loadFile(file);
                    } else {
                        loadConfigurationFile(file);
                        graphStore.hasConfig = true;
                    }
                } catch {
                    graphStore.hasConfig = false;
                }
                return;
            }

            openLogData(new Uint8Array(bytes), file);
        };

        reader.readAsArrayBuffer(file);
    }

    // Load a log directly from an in-memory buffer (e.g. pulled from a connected FC's
    // dataflash) rather than a File picked from disk. Mirrors loadLogFile's log branch.
    function loadLogBuffer(data: ArrayBuffer | Uint8Array, name?: string) {
        openLogData(data instanceof Uint8Array ? data : new Uint8Array(data), { name: name || "BLACKBOX_LOG.BBL" });
    }

    appStore.refreshGraph = () => {
        if (graph !== null) {
            ThemeColors.clearCache();
            graph.refreshTheme();
            invalidateGraph();
        }
        seekBar.refreshTheme();
    };

    function newGraphConfig(newConfig: GraphPanelConfig[], noRedraw?: boolean) {
        graphStore.lastGraphConfig = graphStore.graphConfig; // Remember the last configuration.
        graphStore.graphConfig = newConfig;
        activeGraphConfig.setRedrawChart(!noRedraw);
        activeGraphConfig.adaptGraphs(loadedFlightLog(), newConfig);

        prefs.set("graphConfig", newConfig);
    }

    // Store to local cache and update Workspace Selector control
    function onSwitchWorkspace(newWorkspaces: WorkspaceList, newActiveId: number) {
        prefs.set("activeWorkspace", newActiveId);
        prefs.set("workspaceGraphConfigs", newWorkspaces);
        workspaceStore.workspaceGraphConfigs = newWorkspaces || [];
        workspaceStore.activeWorkspace = newActiveId;
        const workspace = newWorkspaces[newActiveId];
        if (logStore.flightLog && workspace?.graphConfig) {
            newGraphConfig(workspace.graphConfig);
            graphStore.legendTitle = workspace.title;
        }
    }

    // Retitle a slot in place. Unlike onSaveWorkspace this keeps the stored graphConfig
    // instead of replacing it with whatever happens to be on screen, so renaming a
    // workspace never costs the user the setup they saved into it.
    function onRenameWorkspace(id: number, title: string) {
        const entry = workspaceStore.workspaceGraphConfigs[id];
        if (!entry) {
            return;
        }
        workspaceStore.workspaceGraphConfigs[id] = { ...entry, title };
        prefs.set("workspaceGraphConfigs", workspaceStore.workspaceGraphConfigs);
        if (id === workspaceStore.activeWorkspace) {
            graphStore.legendTitle = title;
        }
    }

    // Save current config
    function onSaveWorkspace(id: number, title: string) {
        workspaceStore.workspaceGraphConfigs[id] = {
            title: title,
            graphConfig: graphStore.graphConfig,
        };
        onSwitchWorkspace(workspaceStore.workspaceGraphConfigs, id);
    }

    activeGraphConfig.addListener(function () {
        graphStore.buildLegendGraphs();
        invalidateGraph();
    });

    // Initialize on DOM ready (modules are deferred, DOM is ready)
    {
        // Version information
        appStore.statusViewerVersion = `v${__APP_VERSION__}`;

        graphStore.buildLegendGraphs();

        // initial load of the configuration defaults if we have them
        prefs.get("workspaceGraphConfigs", function (item) {
            if (item) {
                workspaceStore.workspaceGraphConfigs = upgradeWorkspaceFormat(
                    item as Parameters<typeof upgradeWorkspaceFormat>[0],
                );
            } else {
                workspaceStore.workspaceGraphConfigs = structuredClone(DEFAULT_WORKSPACES.ctzsnooze);
            }
        });

        prefs.get("activeWorkspace", function (id) {
            if (id) {
                workspaceStore.activeWorkspace = id as number;
            } else {
                workspaceStore.activeWorkspace = 1;
            }
        });

        onSwitchWorkspace(workspaceStore.workspaceGraphConfigs, workspaceStore.activeWorkspace);

        prefs.get("log-legend-hidden", function (item) {
            if (item) {
                graphStore.legendVisible = false;
            }
        });

        graphStore.hasTableOverlay = false;

        // Reset the analyser window on application startup.
        graphStore.hasAnalyser = false;

        // The graph actions below come from the legend, which only shows once graphs are configured.
        const graphConfig = () => graphStore.graphConfig!;

        function expandGraphConfig(index: number) {
            // Put each of the fields into a separate graph

            const expandedGraphConfig: GraphPanelConfig[] = [];

            for (const field of graphConfig()[index].fields) {
                // Loop through each of the fields
                expandedGraphConfig.push({ fields: [field], label: field.name, height: 1 });
            }

            newGraphConfig(expandedGraphConfig);
            invalidateGraph();
        }

        function zoomGraphConfig(index: number) {
            // Put each of the fields onto one graph and clear the others

            if (graphConfig().length === 1) {
                // if there is only one graph, then return to previous configuration
                if (graphStore.lastGraphConfig != null) {
                    newGraphConfig(graphStore.lastGraphConfig);
                }
            } else {
                const singleGraph: GraphPanelConfig = { fields: [], label: "", height: 1 };

                for (const field of graphConfig()[index].fields) {
                    // Loop through each of the fields
                    singleGraph.fields.push(field);
                    singleGraph.label = graphConfig()[index].label;
                }

                newGraphConfig([singleGraph]);
            }
            invalidateGraph();
        }
        workspaceStore.gotoBookmark = (index) => {
            const bookmark = workspaceStore.bookmarkTimes?.[index];
            if (bookmark != null) {
                setCurrentBlackboxTime(bookmark);
                invalidateGraph();
            }
        };

        // Spectrum callbacks registered on graphStore. The analyser panel only shows with a graph.
        graphStore.spectrumExport = () => {
            void exportSpectrumToCsv(graph!.getAnalyser(), appStore.logFilename);
        };
        graphStore.spectrumImport = (files) => {
            // A file input's change event always has its list.
            if (files) {
                graph!.getAnalyser()?.importSpectrumFromCSV(files);
            }
        };
        graphStore.spectrumClear = () => graph!.getAnalyser()?.removeImportedSpectrums();

        const onWindowResize = () => updateCanvasSize();
        window.addEventListener("resize", onWindowResize);
        cleanupFns.push(() => window.removeEventListener("resize", onWindowResize));

        function toggleOverrideStatus(userSetting: OverrideSetting) {
            settingsStore.saveSetting(userSetting, !userSettings[userSetting]);
        }

        // Watch override settings and refresh graph when they change
        const stopOverrideWatch = watch(
            () => [userSettings.graphSmoothOverride, userSettings.graphExpoOverride, userSettings.graphGridOverride],
            () => {
                if (graph) {
                    graph.refreshOptions(userSettings);
                    graph.refreshGraphConfig();
                    invalidateGraph();
                }
            },
        );
        cleanupFns.push(stopOverrideWatch);

        // Watch drawSticks and update graph renderer
        const stopSticksWatch = watch(
            () => userSettings.drawSticks,
            (val) => {
                if (graph) {
                    graph.setDrawSticks(val);
                    invalidateGraph();
                }
            },
        );
        cleanupFns.push(stopSticksWatch);

        function handleGraphCanvasWheel(e: WheelEvent, delta: number) {
            const zoomStep = 10 + (e.altKey ? 15 : 0);
            if (delta < 0) {
                if (e.altKey || e.shiftKey) {
                    setGraphZoom(graphStore.graphZoom - zoomStep);
                } else {
                    logJumpBack(0.1);
                }
            } else if (e.altKey || e.shiftKey) {
                setGraphZoom(graphStore.graphZoom + zoomStep);
            } else {
                logJumpForward(0.1);
            }
            e.preventDefault();
        }

        function applyPenChange(refreshRequired: string | null) {
            if (refreshRequired) {
                graph!.refreshGraphConfig();
                invalidateGraph();
                mouseNotification.show(
                    document.getElementById("log-graph"),
                    null,
                    null,
                    refreshRequired,
                    750,
                    null,
                    "bottom-right",
                    0,
                );
            }
        }

        const onDocumentWheel = function (e: WheelEvent) {
            if (!appStore.viewerActive) {
                return;
            }
            // A wheel event on the document targets an element.
            const target = e.target as HTMLElement;
            if (target.classList.contains("no-wheel")) {
                e.preventDefault();
                return;
            }

            if (graph && !target.closest(".modal")) {
                let rawDelta = 0;
                if (e.deltaY < 0) {
                    rawDelta = 1;
                } else if (e.deltaY > 0) {
                    rawDelta = -1;
                }
                const delta = Math.max(-1, Math.min(1, rawDelta));
                if (delta !== 0 && target.id === "graphCanvas") {
                    handleGraphCanvasWheel(e, delta);
                }
            }
        };
        document.addEventListener("wheel", onDocumentWheel, { passive: false });
        cleanupFns.push(() => document.removeEventListener("wheel", onDocumentWheel));

        const keydownHandler = createKeydownHandler({
            hasGraph: () => graph != null,
            graphStore,
            logStore,
            playbackStore,
            workspaceStore,
            appStore,
            logPlayPause,
            logJumpBack,
            logJumpForward,
            logJumpStart,
            logJumpEnd,
            logSmartSync,
            setGraphZoom,
            setVideoInTime,
            setVideoOutTime,
            setMarker,
            setCurrentBlackboxTime,
            showValueTable,
            showConfigFile,
            newGraphConfig,
            toggleOverrideStatus,
            invalidateGraph,
            onSwitchWorkspace,
            onSaveWorkspace,
            lastGraphConfig: () => graphStore.lastGraphConfig,
        });
        document.addEventListener("keydown", keydownHandler);
        cleanupFns.push(() => document.removeEventListener("keydown", keydownHandler));

        // Runs in the capture phase so it can neutralise Space on a focused
        // dropdown trigger before reka-ui's own keydown handler toggles the menu.
        const dropdownSpaceGuard = createDropdownSpaceGuard({
            appStore,
            hasGraph: () => graph != null,
            logPlayPause,
        });
        document.addEventListener("keydown", dropdownSpaceGuard, true);
        cleanupFns.push(() => document.removeEventListener("keydown", dropdownSpaceGuard, true));

        video.addEventListener("loadedmetadata", updateCanvasSize);
        video.addEventListener("error", reportVideoError);
        video.addEventListener("loadeddata", videoLoaded);
        cleanupFns.push(() => {
            video.removeEventListener("loadedmetadata", updateCanvasSize);
            video.removeEventListener("error", reportVideoError);
            video.removeEventListener("loadeddata", videoLoaded);
        });

        seekBar.onSeek = setCurrentBlackboxTime;

        // The stored settings are what this viewer saved, so they have the shapes it saves.
        prefs.get("videoConfig", function (item) {
            if (item) {
                playbackStore.videoConfig = item as typeof playbackStore.videoConfig;
            } else {
                playbackStore.videoConfig = {
                    width: 1280,
                    height: 720,
                    frameRate: 30,
                    videoDim: 0.4,
                };
            }
        });

        prefs.get("graphConfig", function (item) {
            const saved = GraphConfig.load(item as GraphPanelConfig[] | null);
            if (saved) {
                graphStore.graphConfig = saved;
            }
        });

        // Get the offsetCache buffer
        prefs.get("offsetCache", function (item) {
            if (item) {
                playbackStore.offsetCache = item as OffsetCacheEntry[];
            }
        });

        graphStore.zoomGraphConfig = (gi) => zoomGraphConfig(gi);
        graphStore.expandGraphConfig = (gi) => expandGraphConfig(gi);
        graphStore.reorderGraphs = (newOrder) => {
            const oldGraphs = graphConfig();
            const newGraphs = newOrder.map((i) => oldGraphs[i]);
            newGraphConfig(newGraphs);
        };
        graphStore.resetPen = (gi, fi) => {
            const graphs = activeGraphConfig.getGraphs();
            const msg = restorePenDefaults(graphs, String(gi), fi == null ? null : String(fi));
            applyPenChange(msg);
        };
        graphStore.fieldWheel = (gi, fi, delta, shiftKey, altKey, ctrlKey) => {
            const graphs = activeGraphConfig.getGraphs();
            const g = gi == null ? gi : String(gi);
            const f = fi == null ? fi : String(fi);
            const increase = delta >= 0;
            let msg = null;
            if (shiftKey) {
                msg = changePenZoom(graphs, g, f, increase);
            } else if (altKey) {
                msg = changePenExpo(graphs, g, f, increase);
            } else if (ctrlKey) {
                msg = changePenSmoothing(graphs, g, f, increase);
            }
            if (msg) {
                activeGraphConfig.setGraphs(graphs);
                applyPenChange(msg);
            }
        };
        playbackStore.logSyncHere = logSyncHere;
        playbackStore.logSyncBack = logSyncBack;
        playbackStore.logSyncForward = logSyncForward;
        playbackStore.logSmartSync = logSmartSync;
        playbackStore.setVideoOffsetValue = (val) => {
            const offset = Number.parseFloat(String(val));
            if (!Number.isNaN(offset)) {
                setVideoOffset(offset, true);
            }
        };
        playbackStore.setGraphTime = (timeStr) => {
            let newTime = stringTimetoMsec(timeStr);
            if (!Number.isNaN(newTime)) {
                if (logStore.hasVideo) {
                    setVideoTime(newTime / 1000000 + playbackStore.videoOffset);
                } else {
                    newTime += logStore.flightLog?.getMinTime() ?? 0;
                    setCurrentBlackboxTime(newTime);
                }
                invalidateGraph();
            }
        };
        graphStore.setSeekBarMode = setSeekBarMode;
        graphStore.selectLogIndex = (index) => {
            selectLog(Number.parseInt(String(index), 10));
            if (graph) {
                graph.setAnalyser(graphStore.hasAnalyserFullscreen);
            }
        };
        workspaceStore.switchWorkspace = (id) => {
            if (workspaceStore.workspaceGraphConfigs[id] != null) {
                onSwitchWorkspace(workspaceStore.workspaceGraphConfigs, id);
            }
        };
        workspaceStore.saveWorkspace = (id, title) => onSaveWorkspace(id, title);
        workspaceStore.renameWorkspace = (id, title) => onRenameWorkspace(id, title);
        workspaceStore.applyDefaultWorkspace = (index) => {
            const presets = [
                null,
                structuredClone(DEFAULT_WORKSPACES.ctzsnooze),
                structuredClone(DEFAULT_WORKSPACES.supafly),
            ];
            const preset = presets[index];
            if (preset) {
                onSwitchWorkspace(preset, 1);
            }
        };
    }

    appStore.loadFiles = loadFiles;
    appStore.loadLogBuffer = loadLogBuffer;
    // Note: internal newGraphConfig takes `noRedraw` (inverted). Callers pass `redrawChart` (true = redraw).
    appStore.newGraphConfig = (newConfig, redrawChart) => newGraphConfig(newConfig, !redrawChart);
    appStore.exportCsv = () => {
        setGraphState(GRAPH_STATE_PAUSED);
        void exportCsv(loadedFlightLog(), appStore.logFilename);
    };
    appStore.exportGpx = () => {
        setGraphState(GRAPH_STATE_PAUSED);
        void exportGpx(loadedFlightLog(), appStore.logFilename);
    };
    appStore.exportWorkspaces = () => {
        setGraphState(GRAPH_STATE_PAUSED);
        void saveWorkspaces(workspaceStore.workspaceGraphConfigs);
    };
    appStore.saveUserSettings = (newSettings) => {
        settingsStore.saveAll(newSettings);
        // Theme is owned by the host configurator (see setBlackboxViewerDark); the viewer no
        // longer exposes or applies its own dark-mode setting, so nothing to do here for it.
        if (graph != null) {
            graph.refreshOptions(userSettings);
            graph.refreshLogo();
            graph.initializeCraftModel();
            updateCanvasSize();
        }
    };
    graphStore.applyGraphZoom = setGraphZoom;
    playbackStore.applyPlaybackRate = setPlaybackRate;
    playbackStore.logPlayPause = logPlayPause;
    playbackStore.logJumpBack = () => logJumpBack(null);
    playbackStore.logJumpForward = () => logJumpForward(null);
    playbackStore.logJumpStart = logJumpStart;
    playbackStore.logJumpEnd = logJumpEnd;
    playbackStore.videoJumpStart = () => {
        setVideoTime(0);
        setGraphState(GRAPH_STATE_PAUSED);
    };
    playbackStore.videoJumpEnd = () => {
        if (video.duration) {
            setVideoTime(video.duration);
            setGraphState(GRAPH_STATE_PAUSED);
        }
    };

    // Teardown: reverse every global side-effect so the tab can be re-mounted cleanly.
    return function teardown() {
        // Stop the export loop before the shared grapher and canvases are released.
        cancelActiveVideoExport();
        // Nulling the graph makes the requestAnimationFrame loop bail on its next tick.
        if (graph) {
            try {
                graph.destroy();
            } catch (e) {
                console.error("blackbox-viewer: graph.destroy failed", e);
            }
            graph = null;
        }
        graphStore.graph = null;

        try {
            mapGrapher?.destroy?.();
        } catch (e) {
            console.error("blackbox-viewer: mapGrapher.destroy failed", e);
        }
        try {
            seekBar?.destroy?.();
        } catch (e) {
            console.error("blackbox-viewer: seekBar.destroy failed", e);
        }

        for (const fn of cleanupFns.reverse()) {
            try {
                fn();
            } catch (e) {
                console.error("blackbox-viewer: cleanup failed", e);
            }
        }
    };
}
