<script setup>
import { computed, onUnmounted, ref, toRaw, watch } from "vue";
import FileSystem from "@/js/FileSystem.js";
import { useLogStore } from "../stores/log.js";
import { usePlaybackStore } from "../stores/playback.js";
import { useAppStore } from "../stores/app.js";
import { useGraphStore } from "../stores/graph.js";
import { useSettingsStore } from "../stores/settings.js";
import { PrefStorage } from "../pref_storage.js";
import {
    cancelActiveVideoExport,
    estimateFrameCount,
    estimateOutputBytes,
    probeVideoExport,
    runVideoExport,
    suggestedName,
} from "../video_export.js";

const FRAMERATES = [30, 50, 60];
const RESOLUTIONS = [
    { label: "720p (1280 × 720)", value: "1280x720", width: 1280, height: 720 },
    { label: "1080p (1920 × 1080)", value: "1920x1080", width: 1920, height: 1080 },
];

const open = defineModel("open", { type: Boolean, default: false });
const appStore = useAppStore();
const logStore = useLogStore();
const playbackStore = usePlaybackStore();
const graphStore = useGraphStore();
const settingsStore = useSettingsStore();
const prefs = new PrefStorage();

const mode = ref("settings");
const phase = ref("rendering");
const frameRate = ref(30);
const resolutionValue = ref(RESOLUTIONS[0].value);
const probes = ref({});
const probesLoading = ref(false);
const progress = ref({ frame: 0, totalFrames: 0, bytesWritten: 0, etaSecs: 0 });
const resultInfo = ref(null);
const errorMessage = ref("");
let cancelRequested = false;

const resolution = computed(() => RESOLUTIONS.find((item) => item.value === resolutionValue.value) ?? RESOLUTIONS[0]);
const probeResult = computed(() => probes.value[resolution.value.value] ?? null);
const estimatedFrames = computed(() =>
    estimateFrameCount({
        inTime: playbackStore.videoExportInTime,
        outTime: playbackStore.videoExportOutTime,
        frameRate: frameRate.value,
        getMinTime: () => logStore.flightLog?.getMinTime?.() ?? 0,
        getMaxTime: () => logStore.flightLog?.getMaxTime?.() ?? 0,
    }),
);
const estimatedBytes = computed(() =>
    estimateOutputBytes({
        frameCount: estimatedFrames.value,
        width: resolution.value.width,
        height: resolution.value.height,
        codec: probeResult.value?.codec,
    }),
);
const progressPercent = computed(() =>
    progress.value.totalFrames > 0 ? Math.round((progress.value.frame / progress.value.totalFrames) * 100) : 0,
);
const canStart = computed(
    () =>
        !probesLoading.value && probeResult.value?.canEncode && estimatedFrames.value > 0 && mode.value === "settings",
);

async function warmAllProbes() {
    probesLoading.value = true;
    try {
        const results = await Promise.all(
            RESOLUTIONS.map(async (item) => [
                item.value,
                await probeVideoExport({ width: item.width, height: item.height }),
            ]),
        );
        probes.value = Object.fromEntries(results);
    } catch (error) {
        const failure = {
            canEncode: false,
            reason: `Video capability detection failed: ${error?.message ?? String(error)}`,
        };
        probes.value = Object.fromEntries(RESOLUTIONS.map((item) => [item.value, failure]));
    } finally {
        probesLoading.value = false;
    }
}

function seedForm() {
    const config = playbackStore.videoConfig ?? {};
    const savedResolution = `${config.width}x${config.height}`;
    resolutionValue.value = RESOLUTIONS.some((item) => item.value === savedResolution)
        ? savedResolution
        : RESOLUTIONS[0].value;
    frameRate.value = FRAMERATES.includes(Number(config.frameRate)) ? Number(config.frameRate) : 30;
}

watch(open, (isOpen) => {
    if (isOpen) {
        cancelRequested = false;
        mode.value = "settings";
        phase.value = "rendering";
        resultInfo.value = null;
        errorMessage.value = "";
        progress.value = { frame: 0, totalFrames: estimatedFrames.value, bytesWritten: 0, etaSecs: 0 };
        seedForm();
        void warmAllProbes();
    } else if (mode.value === "rendering") {
        cancelExport();
    }
});

watch(
    () => appStore.viewerActive,
    (viewerActive) => {
        if (!viewerActive) {
            cancelExport();
        }
    },
);

function humanSize(bytes) {
    if (!bytes) return "0 MB";
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function humanTime(seconds) {
    const total = Math.max(0, Math.ceil(seconds || 0));
    const minutes = Math.floor(total / 60);
    return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

async function startExport() {
    if (!canStart.value) return;

    const selectedProbe = probeResult.value;
    const fileName = suggestedName(appStore.logFilename || "blackbox", selectedProbe.extension);
    let file;
    try {
        file = await FileSystem.pickSaveFile(fileName, selectedProbe.description, `.${selectedProbe.extension}`);
        if (!file) return;
    } catch (error) {
        if (error?.name === "AbortError") return;
        errorMessage.value = error?.message ?? String(error);
        mode.value = "error";
        return;
    }

    playbackStore.videoConfig = {
        ...playbackStore.videoConfig,
        width: resolution.value.width,
        height: resolution.value.height,
        frameRate: frameRate.value,
    };
    prefs.set("videoConfig", playbackStore.videoConfig);

    const exportCanvas = document.createElement("canvas");
    mode.value = "rendering";
    phase.value = graphStore.hasAnalyser ? "preparing" : "rendering";
    cancelRequested = false;
    progress.value = { frame: 0, totalFrames: estimatedFrames.value, bytesWritten: 0, etaSecs: 0 };

    try {
        const outcome = await runVideoExport({
            canvas: exportCanvas,
            canvasRefs: graphStore.canvasRefs,
            graph: graphStore.graph,
            log: logStore.flightLog,
            userSettings: toRaw(settingsStore.userSettings),
            includeSticks: graphStore.hasSticks,
            includeCraft: graphStore.hasCraft,
            includeAnalyser: graphStore.hasAnalyser,
            getAnalyserLayout: () => graphStore.analyserLayout,
            restoreCanvasSize: graphStore.updateCanvasSize,
            invalidateGraph: graphStore.invalidateGraph,
            inTime: playbackStore.videoExportInTime,
            outTime: playbackStore.videoExportOutTime,
            frameRate: frameRate.value,
            width: resolution.value.width,
            height: resolution.value.height,
            file,
            shouldCancel: () => cancelRequested,
            onPhase: (value) => {
                phase.value = value;
            },
            onProgress: (value) => {
                progress.value = value;
            },
        });

        resultInfo.value = { ...outcome, name: fileName };
        mode.value = "done";
    } catch (error) {
        errorMessage.value = error?.message ?? String(error);
        mode.value = "error";
    }
}

function cancelExport() {
    cancelRequested = true;
    cancelActiveVideoExport();
}

onUnmounted(cancelExport);
</script>

<template>
    <UModal
        v-model:open="open"
        title="Export Video"
        :close="mode !== 'rendering'"
        :dismissible="mode !== 'rendering'"
        :ui="{ content: 'sm:max-w-xl' }"
    >
        <template #body>
            <div v-if="mode === 'settings'" class="flex flex-col gap-4">
                <p class="text-sm">
                    Exports the range marked with <kbd>I</kbd> and <kbd>O</kbd>. With no markers, the whole log is used.
                </p>

                <UAlert
                    v-if="logStore.hasVideo"
                    color="neutral"
                    variant="subtle"
                    title="The background flight video is not included in this export."
                />
                <UAlert
                    v-if="probeResult && !probeResult.canEncode"
                    color="error"
                    variant="subtle"
                    title="Video export is unavailable"
                    :description="probeResult.reason"
                />

                <div class="grid grid-cols-2 gap-3">
                    <UFormField label="Framerate">
                        <USelect v-model="frameRate" :items="FRAMERATES" class="w-full" />
                    </UFormField>
                    <UFormField label="Resolution">
                        <USelect v-model="resolutionValue" :items="RESOLUTIONS" class="w-full" />
                    </UFormField>
                </div>

                <p class="text-sm text-muted">
                    {{ estimatedFrames }} frames · estimated {{ humanSize(estimatedBytes) }}
                </p>
                <UAlert
                    v-if="probeResult?.saveMode === 'buffered'"
                    color="warning"
                    variant="subtle"
                    title="This browser cannot stream the video directly to disk."
                    :description="`The complete file (about ${humanSize(estimatedBytes)}) is held until export finishes. Keep the export short.`"
                />
                <UAlert
                    v-if="probeResult?.androidBridge"
                    color="warning"
                    variant="subtle"
                    title="Video export can be slow on Android."
                    description="Keep the app in the foreground and start with a short 720p export."
                />
            </div>

            <div v-else-if="mode === 'rendering'" class="flex flex-col gap-3">
                <p class="text-sm">
                    {{
                        phase === "preparing"
                            ? "Preparing analyser…"
                            : `Rendering frame ${progress.frame} of ${progress.totalFrames}`
                    }}
                </p>
                <UProgress :model-value="progressPercent" />
                <div class="flex justify-between text-sm text-muted">
                    <span>{{ progressPercent }}% · {{ humanSize(progress.bytesWritten) }} written</span>
                    <span v-if="phase === 'rendering'">About {{ humanTime(progress.etaSecs) }} remaining</span>
                </div>
            </div>

            <div v-else-if="mode === 'done'" class="flex flex-col gap-3">
                <UAlert
                    v-if="resultInfo?.cancelled"
                    color="warning"
                    variant="subtle"
                    title="Export cancelled"
                    description="A partly-written file may remain on disk. It may be unplayable and can be deleted."
                />
                <p v-else class="text-sm">
                    Saved {{ resultInfo?.name }} — {{ resultInfo?.frames }} frames, {{ humanSize(resultInfo?.bytes) }}.
                </p>
            </div>

            <UAlert v-else color="error" variant="subtle" title="Video export failed" :description="errorMessage" />
        </template>

        <template #footer>
            <div class="flex w-full justify-end gap-2">
                <template v-if="mode === 'settings'">
                    <UButton color="neutral" variant="outline" label="Cancel" @click="open = false" />
                    <UButton label="Start Export" :loading="probesLoading" :disabled="!canStart" @click="startExport" />
                </template>
                <UButton
                    v-else-if="mode === 'rendering'"
                    color="neutral"
                    variant="outline"
                    label="Cancel export"
                    @click="cancelExport"
                />
                <UButton v-else label="Close" @click="open = false" />
            </div>
        </template>
    </UModal>
</template>
