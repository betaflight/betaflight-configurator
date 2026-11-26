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

import { pinia } from "@/js/pinia_instance";
import type { FlightLog } from "./flightlog";
import type { FlightLogGrapher } from "./grapher";
import { setCurrentBlackboxTime, setGraphState, setGraphZoom } from "./playback_controls";
import { GRAPH_MAX_ZOOM, GRAPH_MIN_ZOOM, useGraphStore } from "./stores/graph";
import { useLogStore } from "./stores/log";
import { GRAPH_STATE_PAUSED } from "./stores/playback";
import { constrain } from "./tools";

export function bindGraphTouch(canvas: HTMLCanvasElement, graph: FlightLogGrapher, flightLog: FlightLog) {
    const graphStore = useGraphStore(pinia);
    const logStore = useLogStore(pinia);
    let active = false;
    let firstLift: Touch | undefined;
    let dragX: number | undefined;
    let pinch: { distance: number; zoom: number; anchorTime: number } | undefined;

    function pinchPosition(a: Touch, b: Touch) {
        const { left, width } = canvas.getBoundingClientRect();
        if (!width) {
            return;
        }
        return {
            distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
            // The playhead sits halfway across the visible time window.
            offset: ((a.clientX + b.clientX) / 2 - left) / width - 0.5,
        };
    }

    function rebase({ targetTouches }: TouchEvent) {
        dragX = targetTouches.length === 1 ? targetTouches[0].clientX : undefined;
        pinch = undefined;
        firstLift = undefined;
        if (targetTouches.length === 2) {
            const position = pinchPosition(targetTouches[0], targetTouches[1]);
            if (position) {
                setGraphState(GRAPH_STATE_PAUSED);
                pinch = {
                    distance: position.distance,
                    zoom: graphStore.graphZoom,
                    anchorTime: logStore.currentBlackboxTime + position.offset * graph.getWindowWidthTime(),
                };
            }
        }
    }

    function start(event: TouchEvent) {
        // Suppress the compatibility mousedown that would also start a mouse drag.
        event.preventDefault();
        if (!active && event.targetTouches.length !== event.changedTouches.length) {
            return;
        }
        active = true;
        rebase(event);
    }

    function updatePinch(a: Touch, b: Touch) {
        const position = pinchPosition(a, b);
        if (!pinch || !position || pinch.distance === 0) {
            return;
        }
        const scaled = Math.round((pinch.zoom * position.distance) / pinch.distance);
        const zoom = constrain(scaled, GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM);
        if (zoom !== graphStore.graphZoom) {
            setGraphZoom(zoom, pinch.zoom);
        }
        const center = pinch.anchorTime - position.offset * graph.getWindowWidthTime();
        const time = constrain(Math.round(center), flightLog.getMinTime(), flightLog.getMaxTime());
        if (time !== logStore.currentBlackboxTime) {
            setCurrentBlackboxTime(time);
        }
    }

    function move(event: TouchEvent) {
        const touches = event.targetTouches;
        if (touches.length === 1 && dragX !== undefined && canvas.clientWidth) {
            const x = touches[0].clientX;
            if (firstLift) {
                // The remaining touch in touchend can have stale coordinates.
                pinch = undefined;
                firstLift = undefined;
                dragX = x;
                return;
            }
            pinch = undefined;
            graph.onSeek?.(((dragX - x) / canvas.clientWidth) * graph.getWindowWidthTime());
            dragX = x;
        } else if (touches.length === 2) {
            if (pinch?.distance === 0) {
                rebase(event);
            } else {
                updatePinch(touches[0], touches[1]);
            }
        }
    }

    function end(event: TouchEvent) {
        if (!active) {
            return;
        }
        const remaining = event.targetTouches;
        const lifted = event.changedTouches;
        // The final positions may arrive in separate touchend events.
        if (pinch && lifted.length === 1 && remaining.length === 1) {
            firstLift = lifted[0];
            dragX = remaining[0].clientX;
            return;
        }
        if (pinch && remaining.length === 0) {
            const other = firstLift ?? lifted[1];
            if (other && lifted[0]) {
                updatePinch(lifted[0], other);
            }
        }
        rebase(event);
        active = remaining.length > 0;
    }

    function cancel(event: TouchEvent) {
        if (active) {
            rebase(event);
            active = event.targetTouches.length > 0;
        }
    }

    // Touches keep their original target when a finger moves beyond the canvas.
    const controller = new AbortController();
    const { signal } = controller;
    canvas.addEventListener("touchstart", start, { signal, passive: false });
    canvas.addEventListener("touchmove", move, { signal, passive: true });
    canvas.addEventListener("touchend", end, { signal });
    canvas.addEventListener("touchcancel", cancel, { signal });
    return () => controller.abort();
}
