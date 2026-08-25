<script setup>
import { computed, ref, watch } from "vue";
import { useLogStore } from "../stores/log.js";
import { usePlaybackStore } from "../stores/playback.js";
import { useAppStore } from "../stores/app.js";
import { useGraphStore } from "../stores/graph.js";
import {
    estimateFrameCount,
    estimateOutputBytes,
    probeVideoExport,
    runVideoExport,
    suggestedName,
} from "../video_export.js";

const appStore = useAppStore();
const logStore = useLogStore();
const playbackStore = usePlaybackStore();

const FRAMERATES = [30, 50, 60];
const RESOLUTIONS = [
    { label: "720p", width: 1280, height: 720 },
    { label: "1080p", width: 1920, height: 1080 },
];

const mode = ref("settings"); // settings | rendering | done | error
const frameRate = ref(30);
const resolution = ref(RESOLUTIONS[0]);
const probeResult = ref(null);
const progress = ref({ frame: 0, totalFrames: 0, bytesWritten: 0, etaSecs: 0 });
const resultInfo = ref(null);
const errorMessage = ref("");
let cancelRequested = false;

const open = computed({
    get: () => appStore.videoExportDialogOpen,
    set: (value) => {
        appStore.videoExportDialogOpen = value;
    },
});

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

const bufferedWarning = computed(() => probeResult.value?.saveMode === "buffered");

watch(open, async (isOpen) => {
    if (isOpen) {
        cancelRequested = false;
        mode.value = "settings";
        errorMessage.value = "";
        probeResult.value = await probeVideoExport({
            width: resolution.value.width,
            height: resolution.value.height,
        });
    }
});

function onResolutionChange(option) {
    resolution.value = option;
    probeVideoExport({
        width: option.width,
        height: option.height,
    }).then((result) => {
        probeResult.value = result;
    });
}

function humanSize(bytes) {
    if (!bytes) return "0 MB";
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

async function startExport() {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = resolution.value.width;
    exportCanvas.height = resolution.value.height;

    const fileName = suggestedName(logStore.getFilename?.() || "blackbox", probeResult.value.extension);

    let file;
    try {
        file = await window.FileSystem.pickSaveFile(
            fileName,
            probeResult.value.description,
            `.${probeResult.value.extension}`,
        );
        if (!file) {
            return; // user dismissed the dialog; stay in settings
        }
    } catch (error) {
        if (error?.name === "AbortError") return;
        throw error;
    }

    mode.value = "rendering";
    cancelRequested = false;

    try {
        // The engine borrows the live grapher and blocks resize/rAF traffic.
        const graphStore = useGraphStore();
        const outcome = await runVideoExport({
            canvas: exportCanvas,
            graph: graphStore.graph,
            log: logStore.flightLog,
            renderFrame: (timeMicros) => {
                graphStore.graph.draw(timeMicros, true);
                // Composite craft + sticks + analyser exactly as the live view.
                graphStore.graph.renderOverlay?.(exportCanvas.getContext("2d"));
            },
            inTime: playbackStore.videoExportInTime,
            outTime: playbackStore.videoExportOutTime,
            frameRate: frameRate.value,
            width: resolution.value.width,
            height: resolution.value.height,
            file,
            shouldCancel: () => cancelRequested,
            onProgress: (value) => {
                progress.value = value;
            },
        });

        if (outcome.cancelled) {
            mode.value = "done";
            resultInfo.value = {
                cancelled: true,
                frames: outcome.frames,
                bytes: outcome.bytes,
                name: fileName,
            };
        } else {
            await window.FileSystem.closeFile(file);
            mode.value = "done";
            resultInfo.value = {
                cancelled: false,
                frames: outcome.frames,
                bytes: outcome.bytes,
                name: fileName,
            };
        }
    } catch (error) {
        errorMessage.value = error?.message ?? String(error);
        mode.value = "error";
    }
}

function cancelExport() {
    cancelRequested = true;
}
</script>

<template>
    <UModal v-model:open="open" :title="'Export Video'" :dismissible="mode !== 'rendering'">
        <template #body>
            <div v-if="mode === 'settings'" class="flex flex-col gap-3">
                <p class="text-sm">
                    Renders the marked range (set with <kbd>I</kbd> / <kbd>O</kbd>) offscreen, frame by frame, exactly
                    as shown in the viewer.
                </p>
                <div v-if="probeResult && !probeResult.canEncode" role="alert">
                    {{ probeResult.reason }}
                </div>
                <div v-else class="grid grid-cols-2 gap-3">
                    <label class="flex flex-col gap-1 text-sm">
                        Framerate
                        <USelect v-model.number="frameRate" :items="FRAMERATES" />
                    </label>
                    <label class="flex flex-col gap-1 text-sm">
                        Resolution
                        <USelect :items="RESOLUTIONS" :value="resolution" @change="onResolutionChange" />
                    </label>
                </div>
                <p v-if="probeResult?.canEncode" class="text-sm">
                    {{ estimatedFrames }} frames, about {{ humanSize(estimatedBytes) }}.
                </p>
                <UAlert
                    v-if="bufferedWarning && probeResult?.canEncode"
                    color="warning"
                    variant="subtle"
                    title="This browser cannot save directly to disk."
                    :description="
                        'The whole video (' +
                        humanSize(estimatedBytes) +
                        ') is held in memory until the export finishes. Keep the export short.'
                    "
                />
            </div>

            <div v-else-if="mode === 'rendering'" class="flex flex-col gap-3">
                <p class="text-sm">Rendering frame {{ progress.frame }} of {{ progress.totalFrames }}...</p>
                <span>{{ humanSize(progress.bytesWritten) }} written</span>
                <span>ETA {{ Math.ceil(progress.etaSecs) }}s</span>
                <UButton variant="outline" label="Cancel" @click="cancelExport" />
            </div>

            <div v-else-if="mode === 'done'" class="flex flex-col gap-3">
                <template v-if="resultInfo?.cancelled">
                    <p class="text-sm">
                        Export cancelled after {{ resultInfo.frames }} frames. The partly-written file was left on disk,
                        may be unplayable, and can be deleted.
                    </p>
                </template>
                <template v-else>
                    <p class="text-sm">
                        Saved {{ resultInfo?.name }} ({{ resultInfo?.frames }} frames,
                        {{ humanSize(resultInfo?.bytes) }}).
                    </p>
                </template>
                <UButton label="Close" @click="open = false" />
            </div>

            <div v-else class="flex flex-col gap-3">
                <p class="text-sm text-(--ui-error)">The export failed: {{ errorMessage }}</p>
                <UButton label="Close" @click="open = false" />
            </div>
        </template>
        <template #footer>
            <div v-if="mode === 'settings'" class="flex w-full justify-end gap-2">
                <UButton variant="outline" label="Cancel" :disabled="!probeResult?.canEncode" @click="open = false" />
                <UButton label="Start Export" :disabled="!probeResult?.canEncode" @click="startExport" />
            </div>
        </template>
    </UModal>
</template>
