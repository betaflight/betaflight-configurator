import { createApp } from "vue";
import ui from "@nuxt/ui/vue-plugin";
import App from "./App.vue";
import pinia from "./pinia_instance.js";
import { getNuxtUiRouter } from "./nuxt_ui_router.js";
import { bootstrapViewer } from "./main.js";
import { useAppStore } from "./stores/app.js";
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

// Single live instance — the viewer tab mounts at most once at a time.
let current = null;

/**
 * Mount the blackbox log viewer inside the given root element. The root must contain the
 * viewer scaffold (the teleport-target divs + canvases) and a `#vue-app` mount point.
 * Returns nothing; pair every call with destroyBlackboxViewer() on unmount.
 */
export function initBlackboxViewer(rootEl, options = {}) {
    if (current) {
        return;
    }

    const app = createApp(App);
    // Provide the root so the viewer applies its state classes here instead of <html>.
    app.provide("bbvRoot", rootEl);
    // Provide the host-supplied FC dataflash pull capability (or null when unavailable).
    app.provide("bbvDataflash", options.dataflash ?? null);
    app.use(pinia);
    app.use(getNuxtUiRouter());
    app.use(ui);
    app.mount(rootEl.querySelector("#vue-app"));

    // Run the legacy imperative bootstrap (canvas wiring, store callbacks, listeners) and
    // keep its teardown handle for clean unmount.
    const teardown = bootstrapViewer();

    current = { app, teardown };
}

/** Reverse initBlackboxViewer: tear down listeners/loops/instances and unmount the app. */
export function destroyBlackboxViewer() {
    if (!current) {
        return;
    }

    const { app, teardown } = current;
    try {
        teardown?.();
    } catch (e) {
        console.error("blackbox-viewer: teardown failed", e);
    }
    try {
        app.unmount();
    } catch (e) {
        console.error("blackbox-viewer: unmount failed", e);
    }
    current = null;
}
