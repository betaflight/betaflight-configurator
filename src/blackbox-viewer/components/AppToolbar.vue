<template>
    <!-- Single top bar: open file + current log name on the left; exports + settings on the right -->
    <div class="toolbar-bar">
        <div class="toolbar-group toolbar-group--start">
            <LogFileInput size="xs" label="Open log file" @files-selected="$emit('files-selected', $event)" />
            <span v-if="appStore.logFilename" class="toolbar-filename" :title="appStore.logFilename">
                {{ appStore.logFilename }}
            </span>
        </div>

        <div class="toolbar-group">
            <template v-if="logStore.hasLog">
                <UButton
                    variant="ghost"
                    color="neutral"
                    label="CSV"
                    icon="i-lucide-file-spreadsheet"
                    size="xs"
                    @click="$emit('export-csv')"
                />
                <UButton
                    variant="ghost"
                    color="neutral"
                    label="GPX"
                    icon="i-lucide-map-pin"
                    size="xs"
                    @click="$emit('export-gpx')"
                />
                <UButton
                    variant="ghost"
                    color="neutral"
                    label="Export Workspaces"
                    icon="i-lucide-file-json"
                    size="xs"
                    title="Export your workspace configurations to file"
                    @click="$emit('export-workspaces')"
                />
                <UButton
                    variant="ghost"
                    color="neutral"
                    label="Export Video"
                    icon="i-lucide-video"
                    size="xs"
                    :disabled="!videoCapability?.canEncode"
                    :title="videoExportTitle"
                    @click="$emit('export-video')"
                />
                <USeparator orientation="vertical" class="h-4" />
            </template>
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-settings"
                size="xs"
                title="User Settings"
                @click="$emit('open-settings')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-keyboard"
                size="xs"
                title="Keyboard Shortcuts"
                @click="$emit('open-keys')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                :icon="graphStore.isFullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'"
                size="xs"
                :title="graphStore.isFullscreen ? 'Exit Full Screen (F)' : 'Full Screen (F)'"
                :aria-pressed="graphStore.isFullscreen"
                @click="$emit('toggle-fullscreen')"
            />
        </div>
    </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useLogStore } from "../stores/log.js";
import { useAppStore } from "../stores/app.js";
import { useGraphStore } from "../stores/graph.js";
import { probeVideoExport } from "../video_export.js";
import LogFileInput from "./LogFileInput.vue";

defineEmits([
    "files-selected",
    "export-csv",
    "export-gpx",
    "export-workspaces",
    "export-video",
    "open-settings",
    "open-keys",
    "toggle-fullscreen",
]);

const logStore = useLogStore();
const appStore = useAppStore();
const graphStore = useGraphStore();
const videoCapability = ref(null);
let probeGeneration = 0;

const videoExportTitle = computed(() => {
    if (!videoCapability.value) {
        return "Checking video export support…";
    }
    return videoCapability.value.canEncode ? "Render the marked range to a video file" : videoCapability.value.reason;
});

watch(
    () => logStore.hasLog,
    async (hasLog) => {
        const generation = ++probeGeneration;
        videoCapability.value = null;
        if (!hasLog) {
            return;
        }
        let result;
        try {
            result = await probeVideoExport({ width: 1280, height: 720 });
        } catch (error) {
            result = {
                canEncode: false,
                reason: `Video capability detection failed: ${error?.message ?? String(error)}`,
            };
        }
        if (generation === probeGeneration) {
            videoCapability.value = result;
        }
    },
    { immediate: true },
);
</script>

<style scoped>
.toolbar-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.3rem 0.75rem;
    background: var(--surface-100);
    border-bottom: 1px solid var(--surface-300);
}

.toolbar-group {
    display: flex;
    align-items: center;
    gap: 0.4rem;
}

.toolbar-group--start {
    min-width: 0;
}

.toolbar-filename {
    font-size: 0.75rem;
    color: var(--text-secondary);
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
