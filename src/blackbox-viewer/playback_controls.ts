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

import { throttle } from "throttle-debounce";
import { pinia } from "@/js/pinia_instance";
import { useLogStore } from "./stores/log";
import { useGraphStore, GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM } from "./stores/graph";
import {
    usePlaybackStore,
    GRAPH_STATE_PAUSED,
    GRAPH_STATE_PLAY,
    PLAYBACK_MIN_RATE,
    PLAYBACK_MAX_RATE,
} from "./stores/playback";
import { useAppStore } from "./stores/app";
import { useSettingsStore } from "./stores/settings";
import { FlightLogParser } from "./flightlog_parser";
import { blackboxTimeFromVideoTime, syncLogToVideo, setVideoTime, setVideoOffset } from "./video_handler";
import { updateValuesChart } from "./values_display";

const SMALL_JUMP_TIME = 100 * 1000;

let lastRenderTime: number | false = false;
let animationFrameIsQueued = false;
let updateValuesRateLimited: (() => void) | null = null;
let seekBarRepaintRateLimited: (() => void) | null = null;

// Playback only runs once main.ts has registered the renderers and a log is loaded, so these
// read them without a null check, as the JavaScript did: a missing one throws a TypeError.
function loadedFlightLog() {
    return useLogStore(pinia).flightLog!;
}

function videoElement() {
    return usePlaybackStore(pinia).videoElement!;
}

function ensureThrottles(): void {
    if (!updateValuesRateLimited) {
        const logStore = useLogStore(pinia);
        const graphStore = useGraphStore(pinia);
        const appStore = useAppStore(pinia);
        const settingsStore = useSettingsStore(pinia);
        updateValuesRateLimited = throttle(250, () =>
            updateValuesChart(logStore, graphStore, appStore, settingsStore.userSettings),
        );
        seekBarRepaintRateLimited = throttle(200, () => graphStore.seekBar!.repaint());
    }
}

// While a blackbox video export is borrowing the live grapher offscreen,
// window resizes and stray re-renders must not resize or repaint it mid-frame
// (that would letterbox exported frames); see video_export.ts and #5396.
let exportInProgress = false;
export function setExportInProgress(value: boolean): void {
    exportInProgress = Boolean(value);
}

export function isExportInProgress(): boolean {
    return exportInProgress;
}

export function getGraphState(): number {
    return usePlaybackStore(pinia).graphState;
}

export function animationLoop(): void {
    if (exportInProgress) {
        // invalidateGraph() set this before queuing us. Clear it even though no
        // frame is drawn so the post-export redraw can schedule a fresh rAF.
        animationFrameIsQueued = false;
        return;
    }
    ensureThrottles();
    const now = Date.now();
    const graphStore = useGraphStore(pinia);
    const logStore = useLogStore(pinia);
    const playbackStore = usePlaybackStore(pinia);

    const graph = graphStore.graph;
    if (!graph) {
        animationFrameIsQueued = false;
        return;
    }
    const flightLog = loadedFlightLog();
    const seekBar = graphStore.seekBar!;

    if (logStore.hasVideo) {
        logStore.currentBlackboxTime = blackboxTimeFromVideoTime();
    } else if (playbackStore.graphState === GRAPH_STATE_PLAY) {
        let delta;

        if (lastRenderTime === false) {
            delta = 0;
        } else {
            delta = Math.floor(((now - lastRenderTime) * 1000 * playbackStore.playbackRate) / 100);
        }

        logStore.currentBlackboxTime += delta;

        if (logStore.currentBlackboxTime > flightLog.getMaxTime()) {
            logStore.currentBlackboxTime = flightLog.getMaxTime();
            setGraphState(GRAPH_STATE_PAUSED);
        }
    }

    graph.render(logStore.currentBlackboxTime);

    seekBar.setCurrentTime(logStore.currentBlackboxTime);
    seekBar.setWindow(graph.getWindowWidthTime());

    if (flightLog.hasGpsData()) {
        graphStore.mapGrapher!.setCurrentTime(logStore.currentBlackboxTime);
    }
    graphStore.flight3d?.setCurrentTime(logStore.currentBlackboxTime);

    updateValuesRateLimited!();

    if (playbackStore.graphState === GRAPH_STATE_PLAY) {
        lastRenderTime = now;

        seekBarRepaintRateLimited!();

        animationFrameIsQueued = true;
        requestAnimationFrame(animationLoop);
    } else {
        seekBar.repaint();

        animationFrameIsQueued = false;
    }
}

export function invalidateGraph(): void {
    if (!animationFrameIsQueued) {
        animationFrameIsQueued = true;
        requestAnimationFrame(animationLoop);
    }
}

export function updateCanvasSize(): void {
    if (exportInProgress) {
        return;
    }
    const graphStore = useGraphStore(pinia);
    const canvas = graphStore.canvasRefs?.canvas;

    if (graphStore.graph && canvas) {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        graphStore.graph.resize(width, height);
        graphStore.seekBar!.resize(canvas.offsetWidth, 50);
        if (loadedFlightLog().hasGpsData()) {
            graphStore.mapGrapher!.resize(width, height);
        }
        graphStore.flight3d?.resize(width, height);

        invalidateGraph();
    }
}

export function setGraphState(newState: number): void {
    const playbackStore = usePlaybackStore(pinia);
    const logStore = useLogStore(pinia);

    playbackStore.graphState = newState;
    lastRenderTime = false;

    switch (newState) {
        case GRAPH_STATE_PLAY:
            if (logStore.hasVideo) {
                // A play() the browser refuses rejects; the JavaScript never handled it either.
                void videoElement().play();
            }
            break;
        case GRAPH_STATE_PAUSED:
            if (logStore.hasVideo) {
                videoElement().pause();
            }
            break;
    }

    invalidateGraph();
}

export function setCurrentBlackboxTime(newTime: number): void {
    const logStore = useLogStore(pinia);
    const playbackStore = usePlaybackStore(pinia);

    if (logStore.hasVideo) {
        videoElement().currentTime = (newTime - loadedFlightLog().getMinTime()) / 1000000 + playbackStore.videoOffset;

        syncLogToVideo();
    } else {
        logStore.currentBlackboxTime = newTime;
    }

    invalidateGraph();
}

export function setPlaybackRate(rate: number): void {
    const playbackStore = usePlaybackStore(pinia);
    if (rate >= PLAYBACK_MIN_RATE && rate <= PLAYBACK_MAX_RATE) {
        playbackStore.playbackRate = rate;

        if (playbackStore.videoElement) {
            playbackStore.videoElement.playbackRate = rate / 100;
        }
    }
}

/** Zoom the graph to a percentage, or back to the zoom before the last change when none is given. */
export function setGraphZoom(zoom?: number | null): void {
    const graphStore = useGraphStore(pinia);
    zoom ??= graphStore.lastGraphZoom;
    if (zoom >= GRAPH_MIN_ZOOM && zoom <= GRAPH_MAX_ZOOM) {
        graphStore.lastGraphZoom = graphStore.graphZoom;
        graphStore.graphZoom = zoom;

        if (graphStore.graph) {
            graphStore.graph.setGraphZoom(zoom / 100);
            invalidateGraph();
        }
    }
}

/** Show or hide the config file overlay, or toggle it when no state is given. */
export function showConfigFile(state?: boolean | null): void {
    const graphStore = useGraphStore(pinia);
    if (graphStore.hasConfig) {
        if (state == null) {
            graphStore.hasConfigOverlay = !graphStore.hasConfigOverlay;
        } else {
            graphStore.hasConfigOverlay = !!state;
        }
    }
}

/** Show or hide the field value table, or toggle it when no state is given. */
export function showValueTable(state?: boolean | null): void {
    const graphStore = useGraphStore(pinia);
    const logStore = useLogStore(pinia);
    const appStore = useAppStore(pinia);
    const settingsStore = useSettingsStore(pinia);

    if (state == null) {
        graphStore.hasTableOverlay = !graphStore.hasTableOverlay;
    } else {
        graphStore.hasTableOverlay = !!state;
    }
    updateValuesChart(logStore, graphStore, appStore, settingsStore.userSettings);
}

/** 100 ms, or `fast` window widths when given and non-zero. */
function jumpTime(fast: number | null | undefined): number {
    if (fast == null || fast === 0) {
        return SMALL_JUMP_TIME;
    }
    return useGraphStore(pinia).graph!.getWindowWidthTime() * fast;
}

/** The time of the log frame before or after the current one, or null at either end. */
function neighbourFrameTime(direction: 1 | -1): number | null {
    const currentFrame = loadedFlightLog().getCurrentFrameAtTime(useLogStore(pinia).currentBlackboxTime);
    if (!currentFrame) {
        return null;
    }
    const neighbour = direction < 0 ? currentFrame.previous : currentFrame.next;
    return neighbour ? neighbour[FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME] : null;
}

/**
 * Jump by 100 ms, or by `fast` window widths when given and non-zero. With `slow`, step one
 * frame of the log, or a 60th of a second of the video.
 */
function logJump(direction: 1 | -1, fast: number | null | undefined, slow: boolean | undefined): void {
    const logStore = useLogStore(pinia);

    if (logStore.hasVideo) {
        const scrollTime = slow ? (1 / 60) * 1000000 : jumpTime(fast);
        setVideoTime(videoElement().currentTime + (direction * scrollTime) / 1000000);
    } else {
        const frameTime = slow ? neighbourFrameTime(direction) : null;
        setCurrentBlackboxTime(frameTime ?? logStore.currentBlackboxTime + direction * jumpTime(fast));
    }

    setGraphState(GRAPH_STATE_PAUSED);
}

export function logJumpBack(fast?: number | null, slow?: boolean): void {
    logJump(-1, fast, slow);
}

export function logJumpForward(fast?: number | null, slow?: boolean): void {
    logJump(1, fast, slow);
}

export function logJumpStart(): void {
    setCurrentBlackboxTime(loadedFlightLog().getMinTime());
    setGraphState(GRAPH_STATE_PAUSED);
}

export function logJumpEnd(): void {
    setCurrentBlackboxTime(loadedFlightLog().getMaxTime());
    setGraphState(GRAPH_STATE_PAUSED);
}

export function logPlayPause(): void {
    const playbackStore = usePlaybackStore(pinia);
    if (playbackStore.graphState === GRAPH_STATE_PAUSED) {
        setGraphState(GRAPH_STATE_PLAY);
    } else {
        setGraphState(GRAPH_STATE_PAUSED);
    }
}

export function logSyncHere(): void {
    setVideoOffset(videoElement().currentTime, true);
}

export function logSyncBack(): void {
    const playbackStore = usePlaybackStore(pinia);
    setVideoOffset(playbackStore.videoOffset - 1 / 15, true);
}

export function logSyncForward(): void {
    const playbackStore = usePlaybackStore(pinia);
    setVideoOffset(playbackStore.videoOffset + 1 / 15, true);
}

export function setMarker(state: boolean): void {
    const graphStore = useGraphStore(pinia);
    graphStore.hasMarker = state;
}

export function logSmartSync(): void {
    const logStore = useLogStore(pinia);
    const playbackStore = usePlaybackStore(pinia);
    const graphStore = useGraphStore(pinia);

    if (graphStore.hasMarker && logStore.hasVideo && logStore.hasLog) {
        try {
            setVideoOffset(
                playbackStore.videoOffset + (logStore.currentBlackboxTime - graphStore.markerTime) / 1000000,
                true,
            );
        } catch {
            console.log("Failed to set video offset");
        }
    }
    setMarker(!graphStore.hasMarker);
    invalidateGraph();
}

export function videoLoaded(): void {
    const logStore = useLogStore(pinia);
    logStore.hasVideo = true;
    setGraphState(GRAPH_STATE_PAUSED);
    invalidateGraph();
}
