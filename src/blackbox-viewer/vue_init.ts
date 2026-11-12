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
import { useAppStore } from "./stores/app";
import { usePlaybackStore, GRAPH_STATE_PLAY, GRAPH_STATE_PAUSED } from "./stores/playback";
import { setGraphState, updateCanvasSize } from "./playback_controls";
import "./css/main.css";

/**
 * The embedded viewer's theme follows the host configurator: this drives
 * appStore.darkThemeEnabled, which toggles .dark on the viewer root via App.vue's watchEffect.
 */
export function setBlackboxViewerDark(enabled: boolean): void {
    useAppStore(pinia).darkThemeEnabled = enabled;
}

/**
 * Track whether the viewer tab is the visible one. Kept alive across tab switches, the viewer
 * must go dormant when hidden: its document-level handlers gate on appStore.viewerActive, its
 * render loop is paused, and on return the canvases (detached while cached) are re-measured.
 */
export function setViewerActive(active: boolean): void {
    const appStore = useAppStore(pinia);
    appStore.viewerActive = active;

    if (active) {
        // Cached canvases lost their layout while detached; resize to the live box and repaint.
        updateCanvasSize();
    } else {
        // Stop the background render loop rather than animate an off-screen graph.
        const playbackStore = usePlaybackStore(pinia);
        if (playbackStore.graphState === GRAPH_STATE_PLAY) {
            setGraphState(GRAPH_STATE_PAUSED);
        }
    }
}
