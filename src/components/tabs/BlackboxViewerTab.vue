<template>
    <BaseTab tab-name="blackbox_viewer" extra-class="tab-blackbox-viewer-host">
        <!-- Vendored blackbox-log-viewer scaffold. The viewer's Vue app mounts into
             #vue-app and teleports its UI into the divs below; the legacy bootstrap wires
             the canvases by id. All styling is scoped under .blackbox-viewer-root. -->
        <div ref="rootRef" class="blackbox-viewer-root">
            <div id="vue-welcome"></div>
            <div id="vue-navbar" class="app-navbar" style="z-index: 100"></div>

            <div class="app-main-pane">
                <div class="video-top-controls pl-0">
                    <div id="vue-view-controls" style="display: contents"></div>
                    <div id="vue-playback" style="display: contents"></div>
                    <div id="vue-speed-panel" style="display: contents"></div>
                    <div id="vue-zoom-panel" style="display: contents"></div>
                    <div id="vue-time-panel" style="display: contents"></div>
                    <div id="vue-sync-panel" style="display: contents"></div>
                    <div id="vue-workspace-panel" style="display: contents"></div>
                    <div id="vue-log-panel" style="display: contents"></div>
                </div>
                <div id="screenshot-frame" class="graph-row">
                    <div id="log-graph" class="log-graph">
                        <video id="logVideo"></video>
                        <canvas width="200" height="100" id="graphCanvas"></canvas>
                        <canvas width="0" height="0" id="craftCanvas"></canvas>
                        <div id="vue-analyser" style="display: contents"></div>
                        <div id="mapContainer" class="map-container"></div>
                        <canvas width="0" height="0" id="stickCanvas"></canvas>
                    </div>
                    <div id="vue-legend-panel" style="display: contents"></div>
                    <div id="mouseNotification" class="mouseNotification"></div>
                </div>
            </div>

            <div id="log-seek-bar" class="log-seek-bar">
                <canvas id="seekbarCanvas" width="200" height="100"></canvas>
                <div id="vue-seekbar-toolbar" style="display: contents"></div>
            </div>

            <div id="vue-statusbar" class="vue-statusbar"></div>

            <!-- Viewer UI. Gated until the scaffold above is in the document, so its Teleports
                 resolve their targets (the #vue-* divs) instead of racing the same mount pass. -->
            <BlackboxViewerApp v-if="viewerReady" />
        </div>
    </BaseTab>
</template>

<script setup>
import { nextTick, onActivated, onDeactivated, onMounted, onBeforeUnmount, provide, ref, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import BlackboxViewerApp from "../../blackbox-viewer/App.vue";
import { bootstrapViewer } from "../../blackbox-viewer/main.js";
import { setBlackboxViewerDark, setViewerActive } from "../../blackbox-viewer/vue_init.js";
import { useGraphStore } from "../../blackbox-viewer/stores/graph.js";
import { useDataflashPull } from "../../composables/useDataflashPull";

// Named so <keep-alive :include> in App.vue can target this tab (and only this tab) for caching.
defineOptions({ name: "BlackboxViewerTab" });

const rootRef = ref(null);
const viewerReady = ref(false);
let themeObserver = null;
let teardownViewer = null;
const dataflash = useDataflashPull();
const graphStore = useGraphStore();

// Going fullscreen means painting over the configurator's own chrome, which is outside this
// tab: #content isolates its stacking context, so the viewer's z-index can never escape it.
// Marking the body lets the rule below lift #content itself instead. Only the class lives on
// the host document — the layout state stays on the viewer root (see App.vue).
const FULLSCREEN_BODY_CLASS = "blackbox-viewer-fullscreen";

function markHostFullscreen(on) {
    document.body.classList.toggle(FULLSCREEN_BODY_CLASS, on);
}

watch(() => graphStore.isFullscreen, markHostFullscreen);

// The viewer renders as a child of this tab, on the host's Vue app and pinia. Hand it the
// root element (for its scoped state classes) and the FC dataflash pull via provide/inject.
provide("bbvRoot", rootRef);
provide("bbvDataflash", dataflash);

// The configurator drives dark mode by toggling `.dark` on <html>; mirror it into the viewer.
function hostIsDark() {
    return document.documentElement.classList.contains("dark");
}

onMounted(async () => {
    // Scaffold divs are now in the document; render the viewer so its Teleports find them.
    await nextTick();
    viewerReady.value = true;
    // Let the viewer mount, then run the legacy imperative bootstrap (canvas wiring, store
    // callbacks, listeners) and keep its teardown handle.
    await nextTick();
    teardownViewer = bootstrapViewer();
    setBlackboxViewerDark(hostIsDark());

    // Keep the viewer theme in sync if the host theme changes while the tab is open.
    themeObserver = new MutationObserver(() => setBlackboxViewerDark(hostIsDark()));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    GUI.content_ready();
});

// Kept alive across tab switches: pause/resume instead of unmounting so the loaded log survives.
// The fullscreen mode is part of that surviving state, but the class that widens #content must
// not outlive the tab being on screen.
onActivated(() => {
    setViewerActive(true);
    markHostFullscreen(graphStore.isFullscreen);
});
onDeactivated(() => {
    setViewerActive(false);
    markHostFullscreen(false);
});

onBeforeUnmount(() => {
    markHostFullscreen(false);
    themeObserver?.disconnect();
    themeObserver = null;
    try {
        teardownViewer?.();
    } catch (e) {
        console.error("blackbox-viewer: teardown failed", e);
    }
    teardownViewer = null;
});
</script>

<style scoped>
.tab-blackbox-viewer-host {
    height: 100%;
}

.blackbox-viewer-root {
    position: relative;
    height: 100%;
    width: 100%;
    overflow: hidden;
    /* The vendored viewer was a full-page app and lays out with position: fixed. A transform
       on this root makes those fixed descendants resolve against the tab pane instead of the
       window, so the viewer stays inside the content area and never covers the sidebar. */
    transform: translateZ(0);
}

/* Fullscreen: the viewer covers the sidebar menu and the status bar. Everything inside it
   already lays out with `position: fixed` against this root (see the transform above), so
   pinning the root to #main-wrapper's box is all it takes to grow the whole viewer with it.
   Gated on a log being open: the welcome page has no toolbar to leave fullscreen from. */
.blackbox-viewer-root.is-fullscreen:is(.has-log, .has-video) {
    position: fixed;
    inset: 0;
    background-color: var(--surface-100);
}

/* The mobile top bar paints above the viewer, so keep the toolbar clear of it. */
@media all and (max-width: 575px), all and (max-width: 950px) and (max-height: 500px) and (orientation: landscape) {
    .blackbox-viewer-root.is-fullscreen:is(.has-log, .has-video) {
        top: calc(3rem + var(--bf-inset-top));
    }
}
</style>

<style>
/* Host-side half of the viewer's fullscreen mode (see the tab's own styles above). #content
   is `isolation: isolate`, so lift #content itself to let the viewer paint over the sidebar
   and the status bar. Kept well below the Nuxt UI portal layer rooted at #main-wrapper, so
   dialogs, dropdowns and the mobile sidebar still land on top of the viewer. */
body.blackbox-viewer-fullscreen #content {
    z-index: 40;
}
</style>
