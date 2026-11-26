<template>
    <!-- Single top bar: open file + current log name on the left; exports + settings on the right -->
    <div class="toolbar-bar">
        <div class="toolbar-group toolbar-group--start">
            <LogFileInput size="xs" label="Open log file" @files-selected="$emit('files-selected', $event)" />
            <UTooltip :text="downloadTooltip">
                <UButton
                    size="xs"
                    color="primary"
                    variant="soft"
                    icon="i-lucide-download"
                    :loading="pulling"
                    :disabled="!downloadAvailable || pulling"
                    :label="downloadLabel"
                    :ui="{ label: 'max-[900px]:sr-only' }"
                    @click="$emit('download-from-fc')"
                />
            </UTooltip>
            <span v-if="appStore.logFilename" class="toolbar-filename" :title="appStore.logFilename">
                {{ appStore.logFilename }}
            </span>
        </div>

        <div class="toolbar-group toolbar-group--wide-actions">
            <template v-for="action in exportActions" :key="action.key">
                <UTooltip v-if="action.key === 'video'" :text="action.hint" :delay-duration="300">
                    <span
                        data-testid="video-export-capability"
                        class="inline-flex"
                        :role="action.disabled ? 'group' : undefined"
                        :aria-disabled="action.disabled || undefined"
                        :aria-label="action.disabled ? `Export Video unavailable: ${action.hint}` : undefined"
                        :tabindex="action.disabled ? 0 : undefined"
                    >
                        <UButton
                            variant="ghost"
                            color="neutral"
                            :label="action.short || action.label"
                            :icon="action.icon"
                            size="xs"
                            :disabled="action.disabled"
                            :class="{ 'pointer-events-none': action.disabled }"
                            @click="action.onSelect()"
                        />
                    </span>
                </UTooltip>
                <UButton
                    v-else
                    variant="ghost"
                    color="neutral"
                    :label="action.short || action.label"
                    :icon="action.icon"
                    size="xs"
                    :title="action.hint"
                    @click="action.onSelect()"
                />
            </template>
            <USeparator v-if="exportActions.length" orientation="vertical" class="h-4" />
            <UButton
                v-for="action in utilityActions"
                :key="action.key"
                variant="ghost"
                color="neutral"
                :icon="action.icon"
                size="xs"
                :title="action.kbds?.length ? `${action.label} (${action.kbds.join(', ')})` : action.label"
                :aria-pressed="action.key === 'fullscreen' ? graphStore.isFullscreen : undefined"
                @click="action.onSelect()"
            />
        </div>
        <div class="toolbar-group toolbar-group--compact-actions">
            <UDropdownMenu :items="compactActions" :content="{ align: 'end' }">
                <UButton
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-ellipsis"
                    label="Actions"
                    size="xs"
                    aria-label="Blackbox Viewer actions"
                    data-testid="blackbox-compact-actions"
                />
            </UDropdownMenu>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import type { DataflashHost } from "../host_capabilities";
import { useLogStore } from "../stores/log";
import { useAppStore } from "../stores/app";
import { useGraphStore } from "../stores/graph";
import { probeVideoExport } from "../video_export";
import LogFileInput from "./LogFileInput.vue";

const emit = defineEmits([
    "files-selected",
    "download-from-fc",
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
/** Result of probing for video-encoding support; null until the probe resolves. */
const videoCapability = ref<{ canEncode: boolean; reason?: string } | null>(null);
let probeGeneration = 0;

const videoExportDisabled = computed(() => !videoCapability.value?.canEncode);

const videoExportTitle = computed(() => {
    if (!videoCapability.value) {
        return "Checking video export support…";
    }
    return videoCapability.value.canEncode ? "Render the marked range to a video file" : videoCapability.value.reason;
});

interface ToolbarAction {
    key: string;
    label: string;
    icon: string;
    onSelect: () => void;
    short?: string;
    disabled?: boolean;
    hint?: string;
    kbds?: string[];
}

const exportActions = computed<ToolbarAction[]>(() =>
    logStore.hasLog
        ? [
              {
                  key: "csv",
                  label: "Export CSV",
                  short: "CSV",
                  icon: "i-lucide-file-spreadsheet",
                  onSelect: () => emit("export-csv"),
              },
              {
                  key: "gpx",
                  label: "Export GPX",
                  short: "GPX",
                  icon: "i-lucide-map-pin",
                  onSelect: () => emit("export-gpx"),
              },
              {
                  key: "workspaces",
                  label: "Export Workspaces",
                  icon: "i-lucide-file-json",
                  hint: "Export your workspace configurations to file",
                  onSelect: () => emit("export-workspaces"),
              },
              {
                  key: "video",
                  label: "Export Video",
                  icon: "i-lucide-video",
                  disabled: videoExportDisabled.value,
                  hint: videoExportTitle.value,
                  onSelect: () => emit("export-video"),
              },
          ]
        : [],
);

const utilityActions = computed<ToolbarAction[]>(() => [
    {
        key: "settings",
        label: "User Settings",
        icon: "i-lucide-settings",
        onSelect: () => emit("open-settings"),
    },
    {
        key: "keys",
        label: "Keyboard Shortcuts",
        icon: "i-lucide-keyboard",
        onSelect: () => emit("open-keys"),
    },
    {
        key: "fullscreen",
        label: graphStore.isFullscreen ? "Exit Full Screen" : "Full Screen",
        icon: graphStore.isFullscreen ? "i-lucide-minimize" : "i-lucide-maximize",
        kbds: ["F"],
        onSelect: () => emit("toggle-fullscreen"),
    },
]);

const compactActions = computed(() =>
    [exportActions.value, utilityActions.value]
        .filter((group) => group.length)
        .map((group) =>
            group.map((action) => ({
                label: action.label,
                icon: action.icon,
                disabled: action.disabled,
                description: action.disabled ? action.hint : undefined,
                kbds: action.kbds,
                onSelect: action.onSelect,
            })),
        ),
);

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
                reason: `Video capability detection failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
        if (generation === probeGeneration) {
            videoCapability.value = result;
        }
    },
    { immediate: true },
);

// Host-provided FC dataflash pull capability (null when not embedded / unavailable). Shared
// with WelcomePage.vue via the same injection so both surfaces reflect one source of truth.
const dataflash = inject<DataflashHost | null>("bbvDataflash", null);
const downloadAvailable = computed(() => !!dataflash?.available?.value);
const downloadTooltip = computed(() =>
    downloadAvailable.value
        ? "Download the onboard log from the connected flight controller"
        : "Connect a flight controller that has a recorded log",
);
const pulling = computed(() => !!dataflash?.pulling?.value);
const downloadLabel = computed(() =>
    pulling.value ? `Downloading… ${Math.round(progress.value)}%` : "Download from FC",
);
const progress = computed(() => dataflash?.progress?.value ?? 0);
</script>

<style lang="less">
.toolbar-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.3rem 0.75rem;
    background: var(--surface-100);
    border-bottom: 1px solid var(--surface-300);

    .toolbar-group {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }

    .toolbar-group--start {
        min-width: 0;
    }

    .toolbar-group--compact-actions {
        display: none;
    }

    .toolbar-filename {
        font-size: 0.75rem;
        color: var(--text-secondary);
        max-width: 360px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}
@media (max-width: 900px) {
    .toolbar-bar {
        gap: 0.4rem;
        padding-inline: 0.4rem;

        .toolbar-group--wide-actions,
        .toolbar-filename {
            display: none;
        }

        .toolbar-group--compact-actions {
            display: flex;
            flex-shrink: 0;
        }
    }
}
</style>
