import { pinia } from "@/js/pinia_instance.js";
import { useAppStore } from "./stores/app.js";
import { usePlaybackStore, GRAPH_STATE_PLAY, GRAPH_STATE_PAUSED } from "./stores/playback.js";
import { setGraphState, updateCanvasSize } from "./playback_controls.js";
import { DarkTheme } from "./dark_theme.js";
import "./css/main.css";

/**
 * Force the embedded viewer's theme to follow the host configurator instead of its own
 * auto/prefers-color-scheme logic. Sets the mode away from AUTO so the matchMedia listener
 * can't override the host, and drives appStore.darkThemeEnabled (which toggles .dark on the
 * viewer root via App.vue's watchEffect).
 */
export function setBlackboxViewerDark(enabled) {
    DarkTheme.currentMode = enabled ? DarkTheme.modes.ON : DarkTheme.modes.OFF;
    useAppStore(pinia).darkThemeEnabled = enabled;
}

/**
 * Track whether the viewer tab is the visible one. Kept alive across tab switches, the viewer
 * must go dormant when hidden: its document-level handlers gate on appStore.viewerActive, its
 * render loop is paused, and on return the canvases (detached while cached) are re-measured.
 */
export function setViewerActive(active) {
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
