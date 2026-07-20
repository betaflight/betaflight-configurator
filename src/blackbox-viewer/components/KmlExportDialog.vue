<template>
    <UModal v-model:open="open" :prevent-close="mode === 'progress'">
        <template #header>
            <h4 class="font-semibold">Generate KML</h4>
        </template>

        <template #body>
            <div class="flex flex-col gap-4 p-4">
                <!-- Settings mode -->
                <template v-if="mode === 'settings'">
                    <p class="text-xs text-dimmed">
                        See your flight in 3D in Google Earth with a body-axis triad (nose&nbsp;=&nbsp;red,
                        right&nbsp;=&nbsp;green, up&nbsp;=&nbsp;blue) drawn at each frame. Just import the exported .kml
                        file.
                    </p>

                    <!-- Log-capability checklist -->
                    <div class="border border-gray-200 rounded-md p-2">
                        <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                            <span :class="caps?.gyro ? 'text-green-600' : 'text-red-500'"
                                >{{ caps?.gyro ? "✓" : "✗" }} Gyro</span
                            >
                            <span :class="caps?.accel ? 'text-green-600' : 'text-red-500'"
                                >{{ caps?.accel ? "✓" : "✗" }} Accel</span
                            >
                            <span :class="caps?.mag ? 'text-green-600' : 'text-red-500'"
                                >{{ caps?.mag ? "✓" : "✗" }} Mag</span
                            >
                            <span :class="caps?.baro ? 'text-green-600' : 'text-red-500'"
                                >{{ caps?.baro ? "✓" : "✗" }} Baro</span
                            >
                            <span :class="caps?.gpsLockAtTakeoff ? 'text-green-600' : 'text-red-500'"
                                >{{ caps?.gpsLockAtTakeoff ? "✓" : "✗" }} GPS lock</span
                            >
                            <span :class="caps?.attitude ? 'text-green-600' : 'text-red-500'"
                                >{{ caps?.attitude ? "✓" : "✗" }} Att (2026.06+)</span
                            >
                        </div>
                        <p v-if="caps && !caps.canGenerate" class="text-xs text-red-500 mt-1">
                            Missing: {{ caps.missing.join(", ") }}
                        </p>
                    </div>

                    <!-- Mag optimization mode -->
                    <div class="flex items-center justify-between">
                        <label for="mag-mode-select" class="text-sm font-medium">Mag optimization</label>
                        <select
                            id="mag-mode-select"
                            v-model="magMode"
                            class="w-40 border border-gray-300 rounded px-2 py-1 text-sm"
                        >
                            <option value="auto">AUTO</option>
                            <option value="off">OFF</option>
                            <option value="manual">MANUAL</option>
                        </select>
                    </div>

                    <!-- Manual model input (shown only when MANUAL is selected) -->
                    <div v-if="magMode === 'manual'" class="flex flex-col gap-1">
                        <span class="text-xs text-dimmed"
                            >Load a characterization model (configurator bench cal or flight-exported JSON).</span
                        >
                        <div class="flex items-center gap-2">
                            <label for="mag-model-file-input" class="sr-only"
                                >Load mag characterization model JSON</label
                            >
                            <UInput
                                id="mag-model-file-input"
                                type="file"
                                accept=".json"
                                class="flex-1 text-xs"
                                @change="onModelFileSelected"
                            />
                            <span v-if="manualModelName" class="text-xs text-green-600">{{ manualModelName }}</span>
                            <span v-else class="text-xs text-dimmed">No model loaded</span>
                        </div>
                        <p v-if="manualModelError" class="text-xs text-red-500">{{ manualModelError }}</p>
                    </div>

                    <!-- Triads per second -->
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-medium">Triads per second</span>
                        <UInputNumber
                            v-model="triadsPerSecond"
                            :min="0.5"
                            :step="0.5"
                            :format-options="{ useGrouping: false }"
                            class="w-40"
                        />
                    </div>
                </template>

                <!-- Progress mode -->
                <template v-else-if="mode === 'progress'">
                    <UProgress :model-value="progressPercent" color="primary" size="sm" />
                    <p class="text-sm text-dimmed">{{ progressDetail }}</p>
                </template>

                <!-- Done mode -->
                <template v-else-if="mode === 'done'">
                    <p class="text-sm">{{ resultText }}</p>
                    <p v-if="calMessage" class="text-xs text-dimmed mt-1">{{ calMessage }}</p>
                    <template v-if="calCoverage">
                        <span v-if="calCoverage === 'good'" class="text-xs text-green-600">Coverage: good ✓</span>
                        <span v-else-if="calCoverage === 'marginal'" class="text-xs text-yellow-600"
                            >Coverage: marginal ⚠</span
                        >
                        <span v-else class="text-xs text-red-500">Coverage: insufficient ✗</span>
                    </template>
                    <!-- Save mag model button (shown only after successful AUTO) -->
                    <UButton
                        v-if="magModelForSave"
                        variant="outline"
                        color="neutral"
                        size="sm"
                        label="Save mag model"
                        class="mt-2"
                        @click="onSaveMagModel"
                    />
                </template>

                <!-- Error mode -->
                <template v-else>
                    <p class="text-sm text-red-500">{{ errorText }}</p>
                    <p v-if="errorHint" class="text-xs text-dimmed">{{ errorHint }}</p>
                </template>
            </div>
        </template>

        <template #footer>
            <div class="flex justify-end gap-2">
                <UButton
                    v-if="mode === 'settings' || mode === 'progress'"
                    variant="outline"
                    color="neutral"
                    label="Cancel"
                    @click="onCancel"
                />
                <UButton
                    v-if="mode === 'done' || mode === 'error'"
                    variant="outline"
                    color="neutral"
                    label="Close"
                    @click="open = false"
                />
                <UButton
                    v-if="mode === 'settings'"
                    color="primary"
                    icon="i-lucide-globe"
                    label="Generate KML"
                    :disabled="!flightLog || !caps?.canGenerate"
                    @click="onGenerate"
                />
                <p v-if="mode === 'settings' && caps && !caps.canGenerate" class="text-xs text-red-500">
                    Cannot generate: {{ caps.missing.join(", ") }}
                </p>
            </div>
        </template>
    </UModal>
</template>

<script setup lang="ts">
import { ref, watch, toRaw, onUnmounted } from "vue";
import type { PropType } from "vue";
import { generatePoseKml } from "../pose/poseKmlExport.js";
import { analyzeLogCapabilities } from "../pose/logCapabilities.js";
import type { FlightLogHandle, LogCapabilities } from "../pose/logCapabilities.js";
import type { ProgressEvent } from "../pose/poseKmlExport.js";

interface FlightLogWithMeta extends FlightLogHandle {
    name?: string;
}

const open = defineModel("open", { type: Boolean, default: false });

const props = defineProps({
    flightLog: { type: Object as PropType<FlightLogWithMeta | null>, default: null },
});

// Settings
const triadsPerSecond = ref(3);
const magMode = ref("auto");
const manualModelName = ref("");
const manualModelError = ref("");
const manualModelContent = ref<Record<string, unknown> | null>(null);
const caps = ref<LogCapabilities | null>(null);

// Done — cal reporting and export
const calMessage = ref<string | null>(null);
const calCoverage = ref<string | null>(null);
const magModelForSave = ref<Record<string, unknown> | null>(null);

// State machine: settings | progress | done | error
const mode = ref("settings");
const progressPercent = ref(0);
const progressDetail = ref("");
const resultText = ref("");
const errorText = ref("");
const errorHint = ref("");

let abortController: AbortController | null = null;

onUnmounted(() => {
    abortController?.abort();
});

// Coarse phase-weighted progress; refined once the real pipeline reports
// per-iteration fractions through onProgress.
const PHASE_BASE = { parsing: 0, estimating: 10, exporting: 90 };
const PHASE_SPAN = { parsing: 10, estimating: 80, exporting: 10 };

function onProgress(ev: ProgressEvent) {
    if (ev.detail) progressDetail.value = ev.detail;
    const base = PHASE_BASE[ev.phase] ?? 0;
    const span = PHASE_SPAN[ev.phase] ?? 0;
    progressPercent.value = Math.min(99, Math.round(base + span * (ev.fraction ?? 0)));
}

async function onModelFileSelected(ev: Event) {
    const target = ev.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) {
        manualModelName.value = "";
        manualModelContent.value = null;
        manualModelError.value = "";
        return;
    }
    manualModelName.value = file.name;
    manualModelError.value = "";
    try {
        const text = await file.text();
        const json = JSON.parse(text);
        if (!json || typeof json !== "object") throw new Error("Not a valid JSON object");
        manualModelContent.value = json;
        manualModelError.value = "";
    } catch (e: unknown) {
        manualModelError.value = "Invalid model file: " + ((e as Error).message ?? String(e));
        manualModelContent.value = null;
    }
}

function onSaveMagModel() {
    if (!magModelForSave.value) return;
    const json = JSON.stringify(magModelForSave.value, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flight_mag_model.json";
    a.click();
    URL.revokeObjectURL(url);
}

async function onGenerate() {
    mode.value = "progress";
    progressPercent.value = 0;
    progressDetail.value = "Starting…";
    abortController = new AbortController();
    try {
        const result = await generatePoseKml({
            // Detach from Vue reactivity: the flight log (store ref) and the loaded
            // mag model (ref) are reactive Proxies, and a Proxy cannot be cloned
            // across the Web Worker boundary. toRaw() hands over plain objects.
            flightLog: toRaw(props.flightLog),
            magModel: magMode.value === "manual" ? toRaw(manualModelContent.value) : null,
            magMode: magMode.value as "off" | "auto" | "manual",
            filename: (props.flightLog?.name ?? "track").replace(/\.\w+$/, "") + ".kml",
            triadsPerSecond: triadsPerSecond.value,
            onProgress,
            signal: abortController.signal,
        });
        downloadText(result.filename, result.kml, "application/vnd.google-earth.kml+xml");
        progressPercent.value = 100;
        resultText.value = `Saved ${result.filename}.`;
        calMessage.value = result.calMessage ?? null;
        calCoverage.value = result.coverage ?? null;
        magModelForSave.value = result.magModelForExport ?? null;
        mode.value = "done";
    } catch (err: unknown) {
        const e = err as Error & { code?: string };
        if (e.name === "AbortError") {
            open.value = false;
            return;
        }
        if (e.code === "NOT_IMPLEMENTED") {
            errorText.value = "Backend not available.";
            errorHint.value = e.message;
        } else {
            errorText.value = e.message ?? String(err);
            errorHint.value = "";
        }
        mode.value = "error";
    } finally {
        abortController = null;
    }
}

function downloadText(filename: string, text: string, mime: string) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function onCancel() {
    if (abortController) {
        abortController.abort();
        return;
    }
    open.value = false;
}

// Reset transient state each time the dialog opens.
watch(open, (val) => {
    if (val) {
        mode.value = "settings";
        progressPercent.value = 0;
        progressDetail.value = "";
        resultText.value = "";
        errorText.value = "";
        errorHint.value = "";
        calMessage.value = null;
        calCoverage.value = null;
        magModelForSave.value = null;
        // Probe log capabilities for the checklist
        try {
            caps.value = analyzeLogCapabilities(toRaw(props.flightLog) as FlightLogHandle | null);
        } catch {
            caps.value = null;
        }
    } else if (abortController) {
        abortController.abort();
    }
});
</script>
