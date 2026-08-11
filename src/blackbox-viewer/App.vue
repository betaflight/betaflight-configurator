<template>
    <div id="blackbox-app">
        <!-- Teleported into legacy DOM layout -->
        <Teleport to="#vue-welcome">
            <WelcomePage @files-selected="onFilesSelected" />
        </Teleport>
        <Teleport to="#vue-navbar">
            <AppToolbar
                @files-selected="onFilesSelected"
                @open-settings="onOpenSettings"
                @open-keys="onOpenKeys"
                @export-csv="onExportCsv"
                @export-gpx="onExportGpx"
                @export-workspaces="onExportWorkspaces"
            />
        </Teleport>
        <Teleport to="#vue-statusbar">
            <StatusBar @goto-bookmark="onGotoBookmark" />
        </Teleport>

        <Teleport to="#vue-view-controls">
            <ViewControls
                :header-active="appStore.headerDialogOpen"
                :table-active="graphStore.hasTableOverlay"
                :video-active="appStore.viewVideo"
                :craft-active="graphStore.hasCraft"
                :sticks-active="graphStore.hasSticks"
                :analyser-active="graphStore.hasAnalyser"
                :map-active="graphStore.hasMap"
                @view-config="onViewConfig"
                @toggle-header="onToggleHeader"
                @toggle-table="onToggleTable"
                @toggle-video="onToggleVideo"
                @toggle-craft="onToggleCraft"
                @toggle-sticks="onToggleSticks"
                @toggle-analyser="onToggleAnalyser"
                @toggle-map="onToggleMap"
            />
        </Teleport>
        <Teleport to="#vue-playback">
            <PlaybackControls
                @jump-start="onJumpStart"
                @jump-end="onJumpEnd"
                @step-back="onStepBack"
                @step-forward="onStepForward"
                @play-pause="onPlayPause"
                @video-jump-start="onVideoJumpStart"
                @video-jump-end="onVideoJumpEnd"
            />
        </Teleport>

        <Teleport to="#vue-speed-panel">
            <SpeedPanel @rate-change="onRateChange" />
        </Teleport>
        <Teleport to="#vue-zoom-panel">
            <ZoomPanel @zoom-change="onZoomChange" />
        </Teleport>
        <Teleport to="#vue-time-panel">
            <TimePanel @time-change="onTimeChange" />
        </Teleport>
        <Teleport to="#vue-sync-panel">
            <SyncPanel
                @sync-back="onSyncBack"
                @sync-forward="onSyncForward"
                @sync-here="onSyncHere"
                @smart-sync="onSmartSync"
                @offset-change="onOffsetChange"
            />
        </Teleport>
        <Teleport to="#vue-workspace-panel">
            <WorkspacePanel
                @switch-workspace="onSwitchWorkspace"
                @save-workspace="onSaveWorkspace"
                @rename-workspace="onRenameWorkspace"
                @apply-default="onApplyDefaultWorkspace"
            />
        </Teleport>
        <Teleport to="#vue-log-panel">
            <LogPanel />
        </Teleport>

        <Teleport to="#vue-analyser">
            <SpectrumAnalyser />
        </Teleport>
        <Teleport to="#vue-legend-panel">
            <LegendPanel />
        </Teleport>
        <FieldValuesPanel />
        <ConfigurationPanel />
        <Teleport to="#vue-seekbar-toolbar">
            <SeekBarToolbar />
        </Teleport>

        <!-- Dialogs -->
        <KeysDialog v-model:open="appStore.keysDialogOpen" />
        <UserSettingsDialog v-model:open="appStore.settingsDialogOpen" @save="onSaveSettings" />
        <GraphConfigDialog
            v-model:open="appStore.graphConfigDialogOpen"
            :flightLog="logStore.flightLog"
            :graphConfig="graphStore.activeGraphConfig"
            :grapher="graphStore.graph"
            @save="onGraphConfigSave"
            @update="onGraphConfigUpdate"
        />
        <HeaderDialog v-model:open="appStore.headerDialogOpen" :sysConfig="sysConfig" />
    </div>
</template>

<script setup>
import { computed, watchEffect, onMounted, onUnmounted, inject, unref } from "vue";
import { useGraphStore } from "./stores/graph.js";
import { useAppStore } from "./stores/app.js";
import { useLogStore, FIRMWARE_CLASSES } from "./stores/log.js";
import { usePlaybackStore } from "./stores/playback.js";
import { useSettingsStore } from "./stores/settings.js";
import { useWorkspaceStore } from "./stores/workspace.js";
import AppToolbar from "./components/AppToolbar.vue";
import WelcomePage from "./components/WelcomePage.vue";
import ViewControls from "./components/ViewControls.vue";
import PlaybackControls from "./components/PlaybackControls.vue";
import TimePanel from "./components/TimePanel.vue";
import SpeedPanel from "./components/SpeedPanel.vue";
import ZoomPanel from "./components/ZoomPanel.vue";
import SyncPanel from "./components/SyncPanel.vue";
import WorkspacePanel from "./components/WorkspacePanel.vue";
import LogPanel from "./components/LogPanel.vue";
import StatusBar from "./components/StatusBar.vue";
import KeysDialog from "./components/KeysDialog.vue";
import UserSettingsDialog from "./components/UserSettingsDialog.vue";
import GraphConfigDialog from "./components/GraphConfigDialog.vue";
import HeaderDialog from "./components/HeaderDialog.vue";
import SpectrumAnalyser from "./components/SpectrumAnalyser.vue";
import LegendPanel from "./components/LegendPanel.vue";
import FieldValuesPanel from "./components/FieldValuesPanel.vue";
import ConfigurationPanel from "./components/ConfigurationPanel.vue";
import SeekBarToolbar from "./components/SeekBarToolbar.vue";

const graphStore = useGraphStore();
const appStore = useAppStore();
const logStore = useLogStore();
const playbackStore = usePlaybackStore();
const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();

// State classes are applied to the viewer root element (provided by the embedding tab) so
// they stay scoped to the viewer subtree and never leak onto the host configurator's <html>.
// Embedded: a ref to the tab root, null until the tab mounts. Standalone: nothing injected.
const injectedRoot = inject("bbvRoot", null);

// Centralized CSS class binding — replaces 27 imperative html.classList calls in main.js
watchEffect(() => {
    // Only fall back to <html> when running standalone (no root injected); when embedded, wait
    // for the ref to resolve rather than toggling classes onto the host document.
    const el = injectedRoot === null ? document.documentElement : unref(injectedRoot);
    if (!el) {
        return;
    }
    const cl = el.classList;
    cl.toggle("has-log", logStore.hasLog);
    cl.toggle("has-video", logStore.hasVideo);
    cl.toggle("has-gps", logStore.hasGps);
    cl.toggle("has-craft", graphStore.hasCraft);
    cl.toggle("has-sticks", graphStore.hasSticks);
    cl.toggle("has-analyser", graphStore.hasAnalyser);
    cl.toggle("has-analyser-fullscreen", graphStore.hasAnalyserFullscreen);
    cl.toggle("has-map", graphStore.hasMap);
    cl.toggle("has-marker", graphStore.hasMarker);
    cl.toggle("is-fullscreen", graphStore.isFullscreen);
    cl.toggle("video-hidden", !appStore.viewVideo);
    cl.toggle("has-expo-override", !!settingsStore.userSettings.graphExpoOverride);
    cl.toggle("has-smoothing-override", !!settingsStore.userSettings.graphSmoothOverride);
    cl.toggle("has-grid-override", !!settingsStore.userSettings.graphGridOverride);
    // Dark theme
    cl.toggle("dark", appStore.darkThemeEnabled);
    // Firmware type (map icon color filters)
    const fwClass = logStore.firmwareClass;
    for (const c of FIRMWARE_CLASSES) {
        cl.toggle(c, c === fwClass);
    }
});

// Derived state from stores
const sysConfig = computed(() => {
    // Read activeLogIndex so this re-evaluates when the active log changes: parser.sysConfig
    // is replaced per log, but logStore.flightLog keeps the same reference across logs in a
    // multi-log file.
    const activeLogIndex = logStore.activeLogIndex;
    return activeLogIndex >= 0 ? (logStore.flightLog?.getSysConfig?.() ?? null) : null;
});

function onFilesSelected(files) {
    appStore.loadFiles?.(files);
}

function onOpenSettings() {
    appStore.settingsDialogOpen = true;
}

function onOpenKeys() {
    appStore.keysDialogOpen = true;
}

function onExportCsv() {
    appStore.exportCsv?.();
}

function onExportGpx() {
    appStore.exportGpx?.();
}

function onExportWorkspaces() {
    appStore.exportWorkspaces?.();
}

function onViewConfig() {
    appStore.headerDialogOpen = false;
    graphStore.hasTableOverlay = false;
    graphStore.hasConfigOverlay = false;
}

function onToggleHeader() {
    if (!appStore.headerDialogOpen) {
        graphStore.hasTableOverlay = false;
        graphStore.hasConfigOverlay = false;
    }
    appStore.headerDialogOpen = !appStore.headerDialogOpen;
}

function onToggleTable() {
    appStore.headerDialogOpen = false;
    graphStore.hasTableOverlay = !graphStore.hasTableOverlay;
    graphStore.hasConfigOverlay = false;
    graphStore.invalidateGraph?.();
}

function onToggleVideo() {
    appStore.viewVideo = !appStore.viewVideo;
}

function onToggleCraft() {
    settingsStore.saveSetting("drawCraft", !settingsStore.userSettings.drawCraft);
}

function onToggleSticks() {
    settingsStore.saveSetting("drawSticks", !settingsStore.userSettings.drawSticks);
}

function onToggleAnalyser() {
    graphStore.toggleAnalyser();
}

function onToggleMap() {
    graphStore.toggleMap();
}

function onRateChange(rate) {
    playbackStore.applyPlaybackRate?.(rate);
}

function onZoomChange(zoom) {
    graphStore.applyGraphZoom?.(zoom);
}

function onSyncBack() {
    playbackStore.logSyncBack?.();
}

function onSyncForward() {
    playbackStore.logSyncForward?.();
}

function onSyncHere() {
    playbackStore.logSyncHere?.();
}

function onSmartSync() {
    playbackStore.logSmartSync?.();
}

function onOffsetChange(val) {
    playbackStore.setVideoOffsetValue?.(val);
}

function onTimeChange(timeStr) {
    playbackStore.setGraphTime?.(timeStr);
}

function onPlayPause() {
    playbackStore.logPlayPause?.();
}

function onJumpStart() {
    playbackStore.logJumpStart?.();
}

function onJumpEnd() {
    playbackStore.logJumpEnd?.();
}

function onStepBack() {
    playbackStore.logJumpBack?.();
}

function onStepForward() {
    playbackStore.logJumpForward?.();
}

function onVideoJumpStart() {
    playbackStore.videoJumpStart?.();
}

function onVideoJumpEnd() {
    playbackStore.videoJumpEnd?.();
}

function onSaveSettings(newSettings) {
    appStore.saveUserSettings?.(newSettings);
}

function onGraphConfigSave(newConfig) {
    appStore.newGraphConfig?.(newConfig, true);
}

function onGraphConfigUpdate(newConfig) {
    appStore.newGraphConfig?.(newConfig, true);
}

function onSwitchWorkspace(id) {
    workspaceStore.switchWorkspace?.(id);
}

function onSaveWorkspace(id, title) {
    workspaceStore.saveWorkspace?.(id, title);
}

function onRenameWorkspace(id, title) {
    workspaceStore.renameWorkspace?.(id, title);
}

function onApplyDefaultWorkspace(index) {
    workspaceStore.applyDefaultWorkspace?.(index);
}

function onGotoBookmark(index) {
    workspaceStore.gotoBookmark?.(index + 1);
}

// Drag-and-drop file loading (window-level)
function onDragOver(e) {
    // Always swallow the browser default so a stray file drop never navigates away, even while
    // the viewer is kept alive behind another tab; only the copy affordance is viewer-specific.
    e.preventDefault();
    if (!appStore.viewerActive) {
        return;
    }
    e.dataTransfer.dropEffect = "copy";
}
function onDrop(e) {
    e.preventDefault();
    if (!appStore.viewerActive) {
        return;
    }
    const file = e.dataTransfer.files?.[0];
    if (!file) {
        return;
    }
    // Skip directory drops where the webview can tell us; not every webview implements
    // webkitGetAsEntry, so a null entry must not block loading the file.
    const entry = e.dataTransfer.items?.[0]?.webkitGetAsEntry?.();
    if (entry && !entry.isFile) {
        return;
    }
    appStore.loadFiles?.([file]);
}
onMounted(() => {
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
});
onUnmounted(() => {
    document.removeEventListener("dragover", onDragOver);
    document.removeEventListener("drop", onDrop);
});
</script>
