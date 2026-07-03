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

            <!-- Mount point for the viewer's Vue app -->
            <div id="vue-app"></div>
        </div>
    </BaseTab>
</template>

<script setup>
import { nextTick, onMounted, onBeforeUnmount, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import { initBlackboxViewer, destroyBlackboxViewer, setBlackboxViewerDark } from "../../blackbox-viewer/vue_init.js";
import { useDataflashPull } from "../../composables/useDataflashPull";

const rootRef = ref(null);
let themeObserver = null;
const dataflash = useDataflashPull();

// The configurator drives dark mode by toggling `.dark` on <html>; mirror it into the viewer.
function hostIsDark() {
    return document.documentElement.classList.contains("dark");
}

onMounted(async () => {
    // Scaffold DOM is in place; mount the viewer into it.
    await nextTick();
    initBlackboxViewer(rootRef.value, { dataflash });
    setBlackboxViewerDark(hostIsDark());

    // Keep the viewer theme in sync if the host theme changes while the tab is open.
    themeObserver = new MutationObserver(() => setBlackboxViewerDark(hostIsDark()));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    GUI.content_ready();
});

onBeforeUnmount(() => {
    themeObserver?.disconnect();
    themeObserver = null;
    destroyBlackboxViewer();
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
</style>
