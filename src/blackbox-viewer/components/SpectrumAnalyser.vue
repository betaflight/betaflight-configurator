<template>
    <div id="analyser" class="analyser">
        <canvas width="0" height="0" id="analyserCanvas"></canvas>

        <span id="spectrumToolbar" :class="{ 'non-shift': !graphStore.spectrumShiftActive }">
            <div id="spectrumType" title="Type of Spectrum">
                <USelect
                    v-model="spectrumType"
                    :items="spectrumTypeOptions"
                    size="xs"
                    class="w-full"
                    :ui="{ base: 'bg-neutral-800 text-white border-neutral-600' }"
                />
            </div>

            <div v-show="showOverdrawSelect" id="overdrawSpectrumType" title="Show Filters">
                <USelect
                    v-model="overdrawType"
                    :items="overdrawOptions"
                    size="xs"
                    class="w-full"
                    :ui="{ base: 'bg-neutral-800 text-white border-neutral-600' }"
                />
            </div>

            <div v-show="showComparisonPanel" id="spectrumComparison" class="spectrum-actions">
                <UDropdownMenu :items="spectrumMenuItems">
                    <UButton
                        size="xs"
                        variant="outline"
                        color="neutral"
                        icon="i-lucide-ellipsis"
                        title="Spectrum actions"
                        :ui="{ base: 'bg-neutral-800 text-white border-neutral-600' }"
                    />
                </UDropdownMenu>
                <input
                    ref="importInput"
                    type="file"
                    accept=".csv,.CSV"
                    class="hidden"
                    multiple
                    @change="onImportChange"
                />
            </div>

            <div id="spectrumButtons" class="spectrum-buttons" :style="buttonsStyle">
                <div class="view-analyser-fullscreen flex items-center" @click="toggleFullscreen">
                    <UButton
                        variant="outline"
                        color="neutral"
                        size="xs"
                        class="icon-resize-full"
                        icon="i-lucide-maximize-2"
                        title="Maximize analyser"
                        :ui="{ base: 'bg-neutral-800 text-white border-neutral-600' }"
                    />
                    <UButton
                        variant="outline"
                        color="neutral"
                        size="xs"
                        class="icon-resize-small"
                        icon="i-lucide-minimize-2"
                        title="Minimize analyser"
                        :ui="{ base: 'bg-neutral-800 text-white border-neutral-600' }"
                    />
                </div>
            </div>
        </span>

        <!-- Zoom sliders (fullscreen only) -->
        <div v-show="isFullscreen" class="analyser-slider-x" :style="zoomXStyle">
            <USlider v-model="zoomX" :min="100" :max="500" :step="10" class="w-24" @dblclick="resetZoomX" />
        </div>
        <div v-show="isFullscreen && !zoomYException" class="analyser-slider-y" :style="zoomYStyle">
            <USlider v-model="zoomY" :min="10" :max="1000" :step="10" orientation="vertical" @dblclick="resetZoomY" />
        </div>

        <!-- PSD heatmap inputs (fullscreen only, PSD heatmap types) -->
        <input
            v-show="isFullscreen && showPsdHeatmap"
            v-model.number="maxPSD"
            type="number"
            :min="minPSD + 5"
            max="100"
            step="5"
            class="analyser-psd-input text-xs"
            :style="psdInputStyle(30)"
            @dblclick.ctrl="resetMaxPSD"
        />
        <label
            v-show="isFullscreen && showPsdHeatmap"
            class="analyser-psd-label text-xs text-dimmed"
            :style="psdLabelStyle(30)"
        >
            Max&nbsp;dBm
        </label>
        <input
            v-show="isFullscreen && showPsdHeatmap"
            v-model.number="minPSD"
            type="number"
            min="-100"
            :max="maxPSD - 5"
            step="5"
            class="analyser-psd-input text-xs"
            :style="psdInputStyle(55)"
            @dblclick.ctrl="resetMinPSD"
        />
        <label
            v-show="isFullscreen && showPsdHeatmap"
            class="analyser-psd-label text-xs text-dimmed"
            :style="psdLabelStyle(55)"
        >
            Min&nbsp;dBm
        </label>
        <input
            v-show="isFullscreen && showPsdHeatmap"
            v-model.number="lowLevelPSD"
            type="number"
            :min="minPSD"
            :max="maxPSD"
            step="5"
            class="analyser-psd-input text-xs"
            :style="psdInputStyle(80)"
            @dblclick.ctrl="resetLowLevelPSD"
        />
        <label
            v-show="isFullscreen && showPsdHeatmap"
            class="analyser-psd-label text-xs text-dimmed"
            :style="psdLowLevelLabelStyle"
        >
            Limit&nbsp;dBm
        </label>

        <!-- PSD curve inputs (fullscreen only, PSD curve type) -->
        <input
            v-show="isFullscreen && showPsdCurve"
            v-model.number="segmentLength"
            type="number"
            min="6"
            :max="graphStore.segmentLengthMax"
            step="1"
            class="analyser-psd-input text-xs"
            :style="segmentInputStyle"
            @dblclick.ctrl="resetSegmentLength"
        />
        <label
            v-show="isFullscreen && showPsdCurve"
            class="analyser-psd-label text-xs text-dimmed"
            :style="segmentLabelStyle"
        >
            Segment&nbsp;length&nbsp;<br />power&nbsp;at&nbsp;2:
        </label>
    </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useGraphStore } from "../stores/graph.js";
import { useSettingsStore } from "../stores/settings.js";
import { SPECTRUM_TYPE } from "../graph_spectrum_plot";

const graphStore = useGraphStore();
const { userSettings } = useSettingsStore();

const importInput = ref(null);

const spectrumTypeOptions = [
    { label: "Frequency", value: "0" },
    { label: "Freq. vs Throttle", value: "1" },
    { label: "Freq. vs RPM", value: "2" },
    { label: "Power Spectral Density", value: "3" },
    { label: "PSD vs Throttle", value: "4" },
    { label: "PSD vs RPM", value: "5" },
    { label: "Error vs Setpoint", value: "6" },
];

const overdrawOptions = [
    { label: "Show all filters", value: "0" },
    { label: "Show only Gyro filters", value: "1" },
    { label: "Show only D-Term filters", value: "2" },
    { label: "Show only Yaw filters", value: "3" },
    { label: "Hide all filters", value: "4" },
    { label: "Auto", value: "5" },
];

// --- Local state synced with analyser ---
const spectrumType = ref(String(userSettings.spectrumType || 0));
const overdrawType = ref(String(userSettings.overdrawSpectrumType || 0));
const zoomX = ref(100);
const zoomY = ref(100);
const minPSD = ref(userSettings.psdHeatmapMin ?? -40);
const maxPSD = ref(userSettings.psdHeatmapMax ?? 10);
const lowLevelPSD = ref(userSettings.psdHeatmapMin ?? -40);
const segmentLength = ref(9);

function getAnalyser() {
    return graphStore.graph?.getAnalyser?.();
}

// --- Watchers: push changes to analyser ---
watch(spectrumType, (val) => getAnalyser()?.setSpectrumType(val));
watch(overdrawType, (val) => getAnalyser()?.setOverdrawType(val));
watch(zoomX, (val) => getAnalyser()?.setZoomX(val));
watch(zoomY, (val) => getAnalyser()?.setZoomY(val));
watch(minPSD, (val) => {
    getAnalyser()?.setMinPSD(val);
    if (lowLevelPSD.value < val) {
        lowLevelPSD.value = val;
    }
});
watch(maxPSD, (val) => {
    getAnalyser()?.setMaxPSD(val);
    if (lowLevelPSD.value > val) {
        lowLevelPSD.value = val;
    }
});
watch(lowLevelPSD, (val) => getAnalyser()?.setLowLevelPSD(val));
watch(segmentLength, (val) => getAnalyser()?.setSegmentLength(val));

// --- Computed visibility based on spectrum type ---
const spectrumTypeNum = computed(() => Number.parseInt(spectrumType.value, 10));
const isFullscreen = computed(() => graphStore.hasAnalyserFullscreen);

const showOverdrawSelect = computed(() => spectrumTypeNum.value !== SPECTRUM_TYPE.PIDERROR_VS_SETPOINT);
const showComparisonPanel = computed(
    () =>
        spectrumTypeNum.value === SPECTRUM_TYPE.FREQUENCY ||
        spectrumTypeNum.value === SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY,
);
const zoomYException = computed(() => {
    const t = spectrumTypeNum.value;
    return (
        t === SPECTRUM_TYPE.PIDERROR_VS_SETPOINT ||
        t === SPECTRUM_TYPE.PSD_VS_THROTTLE ||
        t === SPECTRUM_TYPE.PSD_VS_RPM ||
        t === SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY
    );
});
const showPsdHeatmap = computed(() => {
    const t = spectrumTypeNum.value;
    return t === SPECTRUM_TYPE.PSD_VS_THROTTLE || t === SPECTRUM_TYPE.PSD_VS_RPM;
});
const showPsdCurve = computed(() => spectrumTypeNum.value === SPECTRUM_TYPE.POWER_SPECTRAL_DENSITY);

// --- Computed positioning from analyser layout ---
const layout = computed(() => graphStore.analyserLayout);

const buttonsStyle = computed(() => ({
    left: `${layout.value.width - 30}px`,
}));

const zoomXStyle = computed(() => ({
    left: `${layout.value.width - 130}px`,
    top: "5px",
}));

const zoomYStyle = computed(() => ({
    left: `${layout.value.width - 20}px`,
    top: "30px",
    height: `${Math.min(layout.value.height - 60, 100)}px`,
}));

function psdInputStyle(topPx) {
    return { left: `${layout.value.width - 90}px`, top: `${topPx}px` };
}
function psdLabelStyle(topPx) {
    return { left: `${layout.value.width - 150}px`, top: `${topPx}px` };
}
const psdLowLevelLabelStyle = computed(() => ({
    left: `${layout.value.width - 155}px`,
    top: "80px",
}));
const segmentInputStyle = computed(() => ({
    left: `${layout.value.width - 57}px`,
    top: "42px",
}));
const segmentLabelStyle = computed(() => ({
    left: `${layout.value.width - 135}px`,
    top: "20px",
}));

// --- Reset handlers (ctrl+dblclick) ---
function resetZoomX() {
    zoomX.value = 100;
    getAnalyser()?.resetZoomX();
}
function resetZoomY() {
    zoomY.value = 100;
    getAnalyser()?.resetZoomY();
}
function resetMinPSD() {
    minPSD.value = userSettings.psdHeatmapMin;
    getAnalyser()?.resetMinPSD();
}
function resetMaxPSD() {
    maxPSD.value = userSettings.psdHeatmapMax;
    getAnalyser()?.resetMaxPSD();
}
function resetLowLevelPSD() {
    lowLevelPSD.value = minPSD.value;
    getAnalyser()?.resetLowLevelPSD(minPSD.value);
}
function resetSegmentLength() {
    segmentLength.value = 9;
    getAnalyser()?.resetSegmentLength();
}

// --- Spectrum actions ---
const spectrumMenuItems = [
    [
        { label: "Export CSV", icon: "i-lucide-download", onSelect: () => graphStore.spectrumExport?.() },
        { label: "Import CSV", icon: "i-lucide-upload", onSelect: () => importInput.value?.click() },
        { label: "Clear imported", icon: "i-lucide-trash-2", onSelect: () => graphStore.spectrumClear?.() },
    ],
];

function onImportChange(e) {
    graphStore.spectrumImport?.(e.target.files);
    e.target.value = "";
}

function toggleFullscreen() {
    graphStore.toggleAnalyserFullscreen();
}
</script>
