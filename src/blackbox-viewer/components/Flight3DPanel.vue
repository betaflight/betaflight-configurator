<template>
    <div
        class="absolute z-[5] flex flex-col overflow-hidden rounded border border-(--surface-300) bg-(--graph-background) shadow-lg"
        :style="boxStyle"
    >
        <div
            class="flex h-7 shrink-0 cursor-move items-center gap-1 border-b border-(--surface-300) bg-(--surface-100) px-1 select-none"
            title="Drag to move"
            @pointerdown="startDrag($event, 'move')"
        >
            <UIcon name="i-lucide-grip-horizontal" class="text-(--text-secondary)" />
            <span class="text-xs font-medium">3D flight</span>
            <div v-if="track" class="ml-auto flex cursor-default items-center gap-1" @pointerdown.stop>
                <UButton
                    size="xs"
                    variant="soft"
                    :color="follow ? 'primary' : 'neutral'"
                    icon="i-lucide-crosshair"
                    :aria-pressed="follow"
                    aria-label="Follow craft"
                    title="Follow craft"
                    @click="toggleFollow"
                />
                <UButton
                    size="xs"
                    variant="soft"
                    :color="coloring === 'speed' ? 'primary' : 'neutral'"
                    icon="i-lucide-gauge"
                    :aria-pressed="coloring === 'speed'"
                    aria-label="Colour by speed"
                    :title="coloring === 'speed' ? 'Colour by altitude' : 'Colour by speed'"
                    @click="coloring = coloring === 'speed' ? 'altitude' : 'speed'"
                />
                <UButton
                    size="xs"
                    variant="soft"
                    :color="terrain ? 'primary' : 'neutral'"
                    icon="i-lucide-mountain"
                    :loading="terrainState === 'loading'"
                    :aria-pressed="terrain"
                    aria-label="Terrain"
                    :title="terrainTitle"
                    @click="terrain = !terrain"
                />
                <USelect v-model="groundSource" :items="groundItems" size="xs" class="w-28" aria-label="Ground layer" />
            </div>
        </div>

        <div ref="viewportRef" class="relative min-h-0 flex-1">
            <canvas
                ref="canvasRef"
                class="absolute inset-0 block h-full w-full"
                @pointerdown="onPointerDown"
                @pointerup="onPointerUp"
            ></canvas>
            <div
                v-if="!track"
                class="absolute inset-0 flex items-center justify-center text-sm text-(--text-secondary)"
            >
                {{ emptyMessage }}
            </div>
            <template v-else>
                <div
                    class="absolute top-1 left-1 flex items-center gap-1 rounded bg-(--surface-100)/80 px-1.5 py-0.5 text-[10px] tabular-nums"
                    data-testid="flight3d-legend"
                >
                    <span>{{ coloring === "speed" ? "Speed" : "Altitude" }} 0</span>
                    <span
                        class="h-2 w-16 rounded-sm"
                        :style="{ background: LEGEND_GRADIENT }"
                        aria-hidden="true"
                    ></span>
                    <span>{{ legendMax }}</span>
                </div>
                <div
                    class="absolute bottom-1 left-1 rounded bg-(--surface-100)/80 px-1.5 py-0.5 text-xs tabular-nums"
                    :title="hudTitle"
                >
                    {{ hud }}
                </div>
                <div v-if="attribution || terrainShown" class="absolute right-6 bottom-0.5 text-[10px] opacity-70">
                    <template v-if="attribution">{{ attribution }}</template>
                    <template v-if="attribution && terrainShown"> · </template>
                    <a
                        v-if="terrainShown"
                        :href="TERRAIN_SOURCE.attributionUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="underline"
                        >{{ TERRAIN_SOURCE.attribution }}</a
                    >
                </div>
            </template>
        </div>

        <div
            class="group absolute right-0 bottom-0 h-5 w-5 cursor-se-resize"
            title="Drag to resize"
            @pointerdown.stop="startDrag($event, 'resize')"
        >
            <div
                class="h-full w-full bg-(--surface-600) transition-colors [clip-path:polygon(100%_0,100%_100%,0_100%)] group-hover:bg-(--primary-500)"
            ></div>
            <svg viewBox="0 0 20 20" class="absolute inset-0 h-full w-full text-(--surface-50)" aria-hidden="true">
                <path d="M9 18 18 9M13 18l5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
        </div>
    </div>
</template>

<script setup lang="ts">
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

import { computed, onActivated, onDeactivated, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from "vue";
import { useGraphStore } from "../stores/graph";
import { useLogStore } from "../stores/log";
import { useSettingsStore } from "../stores/settings";
import { setCurrentBlackboxTime } from "../playback_controls";
import { FlightLogFieldPresenter, type PresentedFlightLog } from "../flightlog_fields_presenter";
import type { FlightLog } from "../flightlog";
import { buildFlightTrack, type FlightLogSource, type FlightTrack } from "../flight3d/flightTrack";
import { buildAttitudeTrack, type AttitudeTrack } from "../flight3d/fcAttitude";
import { FlightScene, type PathColoring, type TerrainState } from "../flight3d/flightScene";
import { ALTITUDE_TRAIL_COLORS } from "../graph_map";
import { TILE_SOURCES, type GroundSourceId } from "../flight3d/tileGround";
import { TERRAIN_SOURCE } from "../flight3d/terrain";

/** FlightLog members used here beyond what the track builder needs. */
type ViewerFlightLog = FlightLogSource & PresentedFlightLog & Pick<FlightLog, "getLogIndex" | "getCurrentFrameAtTime">;

interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

const MIN_WIDTH = 220;
const MIN_HEIGHT = 160;

const graphStore = useGraphStore();
const logStore = useLogStore();
const settingsStore = useSettingsStore();
const { userSettings } = settingsStore;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const viewportRef = ref<HTMLDivElement | null>(null);
const track = shallowRef<FlightTrack | null>(null);
const follow = ref(false);
const groundSource = ref<GroundSourceId>("map");
const groundItems = [
    { label: "Map", value: "map" },
    { label: "Satellite", value: "satellite" },
    { label: "None", value: "none" },
];
const coloring = ref<PathColoring>("altitude");
const legendMax = ref("");
// The scene's gradient, low to high; the hex alpha is dropped as the path draws it opaque.
const LEGEND_GRADIENT = `linear-gradient(90deg, ${ALTITUDE_TRAIL_COLORS.map(({ color }) => color.slice(0, 7)).join(", ")})`;
const terrain = ref(false);
const terrainState = ref<TerrainState>("off");
const terrainShown = computed(() => terrainState.value === "ready");
const box = ref<Box>({ left: 0, top: 0, width: 0, height: 0 });
const hud = ref("");
const emptyMessage = ref("No GPS data in this log");

let scene: FlightScene | null = null;
let flightLog: ViewerFlightLog | null = null;
let attitudeTrack: AttitudeTrack | null = null;
let fieldIndex: Record<string, number | undefined> = {};
let builtFor: { log: object; index: number } | null = null;
let pointerDownAt: { x: number; y: number } | null = null;
let container = { width: 0, height: 0 };
let drag: { mode: "move" | "resize"; x: number; y: number; start: Box } | null = null;
let viewportObserver: ResizeObserver | null = null;

const boxStyle = computed(() => ({
    left: `${box.value.left}px`,
    top: `${box.value.top}px`,
    width: `${box.value.width}px`,
    height: `${box.value.height}px`,
}));

const attribution = computed(() => (groundSource.value === "none" ? "" : TILE_SOURCES[groundSource.value].attribution));

const terrainTitle = computed(() => {
    switch (terrainState.value) {
        case "loading":
            return "Loading terrain…";
        case "failed":
            return "No terrain data for this area";
        default:
            return terrain.value ? "Hide terrain" : "Show terrain";
    }
});

const hudTitle = computed(() => {
    const from = track.value?.pinned === "none" ? "the first position" : "takeoff";
    return terrainShown.value
        ? `Altitude relative to ${from}; AGL above terrain data, which is coarser than the real ground`
        : `Altitude relative to ${from}; map is a flat reference, not terrain`;
});

/** Keep the panel inside the graph area and at least its minimum size. */
function fit(b: Box): Box {
    const width = Math.min(Math.max(b.width, MIN_WIDTH), container.width);
    const height = Math.min(Math.max(b.height, MIN_HEIGHT), container.height);
    return {
        width,
        height,
        left: Math.min(Math.max(b.left, 0), container.width - width),
        top: Math.min(Math.max(b.top, 0), container.height - height),
    };
}

/** Place the panel from its saved position, stored as percentages of the graph area. */
function resize(width: number, height: number) {
    container = { width, height };
    const saved = userSettings.flight3d;
    const percent = (value: string) => Number.parseFloat(value) / 100;
    box.value = fit({
        left: width * percent(saved.left),
        top: height * percent(saved.top),
        width: width * percent(saved.width),
        height: height * percent(saved.height),
    });
}

function startDrag(event: PointerEvent, mode: "move" | "resize") {
    if (event.button !== 0) {
        return;
    }
    event.preventDefault();
    drag = { mode, x: event.clientX, y: event.clientY, start: { ...box.value } };
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", endDrag, { once: true });
}

function onDragMove(event: PointerEvent) {
    if (!drag) {
        return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const { start } = drag;
    box.value =
        drag.mode === "move"
            ? fit({ ...start, left: start.left + dx, top: start.top + dy })
            : fit({ ...start, width: start.width + dx, height: start.height + dy });
}

function endDrag() {
    window.removeEventListener("pointermove", onDragMove);
    drag = null;
    if (!container.width || !container.height) {
        return;
    }
    const percent = (value: number, of: number) => `${((value / of) * 100).toFixed(2)}%`;
    settingsStore.saveSetting("flight3d", {
        left: percent(box.value.left, container.width),
        top: percent(box.value.top, container.height),
        width: percent(box.value.width, container.width),
        height: percent(box.value.height, container.height),
    });
}

function setFlightLog(log: ViewerFlightLog | null) {
    flightLog = log;
    const index = log?.getLogIndex() ?? -1;
    if (log && builtFor?.log === log && builtFor.index === index) {
        return;
    }
    builtFor = log ? { log, index } : null;
    track.value = log ? buildFlightTrack(log) : null;
    emptyMessage.value =
        log?.getMainFieldIndexByName("GPS_coord[0]") === undefined
            ? "No GPS data in this log"
            : "No usable GPS fix in this log";
    attitudeTrack = log && track.value ? buildAttitudeTrack(log) : null;
    fieldIndex = log
        ? {
              speed: log.getMainFieldIndexByName("GPS_speed"),
              distance: log.getMainFieldIndexByName("gpsDistance"),
          }
        : {};
    scene?.setTrack(track.value);
    setCurrentTime(logStore.currentBlackboxTime);
}

function setCurrentTime(tUs: number) {
    if (!scene || !flightLog || !track.value) {
        return;
    }
    const log = flightLog;
    const frameAtTime = log.getCurrentFrameAtTime(tUs);
    const frame = frameAtTime ? frameAtTime.current : null;
    const position = scene.setTime(tUs, attitudeTrack?.at(tUs) ?? null);

    // join() writes an undefined part as "", as it always did.
    const parts: (string | number | undefined)[] = [];
    if (position) {
        parts.push(
            `Alt ${FlightLogFieldPresenter.decodeCorrectAltitude(position.u - track.value.groundU, userSettings.altitudeUnits)}`,
        );
        if (scene.terrainShown) {
            const agl = position.u - scene.surfaceU(position.n, position.e);
            parts.push(`AGL ${FlightLogFieldPresenter.decodeCorrectAltitude(agl, userSettings.altitudeUnits)}`);
        }
    }
    // A GPS slot is null until the log's first GPS frame.
    const present = (field: string, value: number | null) =>
        FlightLogFieldPresenter.decodeFieldToFriendly(log, field, value, undefined);
    if (frame && fieldIndex.speed !== undefined) {
        parts.push(present("GPS_speed", frame[fieldIndex.speed]));
    }
    if (frame && fieldIndex.distance !== undefined) {
        parts.push(`Home ${present("gpsDistance", frame[fieldIndex.distance])}`);
    }
    hud.value = parts.join(" · ");
    updateLegend();
}

/** Top of the colour scale, in the user's units. */
function updateLegend() {
    if (!scene || !flightLog) {
        legendMax.value = "";
        return;
    }
    const { coloring: scale, max } = scene.colorScale;
    legendMax.value =
        scale === "speed"
            ? String(FlightLogFieldPresenter.decodeFieldToFriendly(flightLog, "GPS_speed", max * 100, undefined))
            : String(FlightLogFieldPresenter.decodeCorrectAltitude(max, userSettings.altitudeUnits));
}

function toggleFollow() {
    follow.value = !follow.value;
    scene?.setFollow(follow.value);
    setCurrentTime(logStore.currentBlackboxTime);
}

// A click (not a drag that orbits the camera) on the path seeks the log to that moment.
function onPointerDown(event: PointerEvent) {
    pointerDownAt = { x: event.clientX, y: event.clientY };
}

function onPointerUp(event: PointerEvent) {
    const start = pointerDownAt;
    pointerDownAt = null;
    if (!start || !scene || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) {
        return;
    }
    const tUs = scene.pickTime(event.clientX, event.clientY);
    if (tUs !== null) {
        setCurrentBlackboxTime(tUs);
    }
}

watch(groundSource, (source) => scene?.setGroundSource(source));
watch(terrain, (enabled) => scene?.setTerrain(enabled));
watch(coloring, (value) => {
    scene?.setColoring(value);
    updateLegend();
});
onActivated(() => {
    scene?.setActive(true);
    if (viewportRef.value) {
        scene?.resize(viewportRef.value.clientWidth, viewportRef.value.clientHeight);
    }
    setCurrentTime(logStore.currentBlackboxTime);
});
onDeactivated(() => scene?.setActive(false));

onMounted(() => {
    scene = new FlightScene(canvasRef.value!);
    scene.onTerrainState = (state) => {
        terrainState.value = state;
        setCurrentTime(logStore.currentBlackboxTime);
    };
    viewportObserver = new ResizeObserver(([entry]) => {
        scene?.resize(entry.contentRect.width, entry.contentRect.height);
    });
    viewportObserver.observe(viewportRef.value!);
    graphStore.flight3d = {
        setCurrentTime,
        resize,
        setFlightLog: (log: ViewerFlightLog) => setFlightLog(toRaw(log)),
    };
    const canvas = graphStore.canvasRefs?.canvas;
    if (canvas) {
        resize(canvas.clientWidth, canvas.clientHeight);
    }
    setFlightLog(logStore.hasLog ? toRaw(logStore.flightLog) : null);
});

// Dispose while the canvas is still in the page: OrbitControls removes its document keydown
// listener through the canvas, and a detached canvas cannot reach the document, so disposing after
// unmount would leak the whole scene on every close.
onBeforeUnmount(() => {
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", endDrag);
    viewportObserver?.disconnect();
    graphStore.flight3d = null;
    scene?.dispose();
    scene = null;
});
</script>
