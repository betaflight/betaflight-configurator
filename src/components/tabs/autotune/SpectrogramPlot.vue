<template>
    <UiBox :title="$t('autotuneSpectrogramTitle')">
        <div ref="container" class="w-full flex flex-col gap-3">
            <div v-for="axis in visibleAxes" :key="axis.key">
                <span class="text-xs font-bold" :style="{ color: axis.color }">
                    {{ $t(axis.labelKey) }}
                </span>
                <canvas
                    :ref="(el) => setCanvasRef(axis.key, el)"
                    class="block w-full"
                    style="image-rendering: pixelated"
                ></canvas>
            </div>
        </div>
    </UiBox>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useAutotuneStore } from "@/stores/autotune";
import UiBox from "../../elements/UiBox.vue";
import * as d3 from "d3";

const store = useAutotuneStore();
const container = ref(null);
const canvasRefs = {};

const AXIS_DEFS = [
    { key: "roll", labelKey: "autotuneAxisRoll", color: "#e74c3c" },
    { key: "pitch", labelKey: "autotuneAxisPitch", color: "#2ecc71" },
    { key: "yaw", labelKey: "autotuneAxisYaw", color: "#3498db" },
];

const MARGIN = { top: 4, right: 10, bottom: 24, left: 55 };
const PLOT_HEIGHT = 160;
const MAX_DISPLAY_FREQ = 500;
const LUT_STEPS = 256;

// Pre-build colour lookup table from d3 inferno
const COLOR_LUT = buildColorLUT();

function buildColorLUT() {
    const lut = new Uint8Array(LUT_STEPS * 3);
    for (let i = 0; i < LUT_STEPS; i++) {
        const c = d3.color(d3.interpolateInferno(i / (LUT_STEPS - 1)));
        lut[i * 3] = c.r;
        lut[i * 3 + 1] = c.g;
        lut[i * 3 + 2] = c.b;
    }
    return lut;
}

const visibleAxes = ref([]);

function setCanvasRef(key, el) {
    if (el) {
        canvasRefs[key] = el;
    } else {
        delete canvasRefs[key];
    }
}

let resizeObserver = null;

onMounted(() => {
    resizeObserver = new ResizeObserver(() => drawAll());
    if (container.value) {
        resizeObserver.observe(container.value);
    }
});
onUnmounted(() => resizeObserver?.disconnect());

watch(
    () => [store.visibleAxes.roll, store.visibleAxes.pitch, store.visibleAxes.yaw, store.analysisResult],
    () => {
        updateVisibleAxes();
        nextTick(() => drawAll());
    },
    { deep: true, immediate: true },
);

function updateVisibleAxes() {
    const axes = store.analysisResult?.axes;
    if (!axes) {
        visibleAxes.value = [];
        return;
    }
    visibleAxes.value = AXIS_DEFS.filter((a) => axes[a.key]?.spectrogram && store.visibleAxes[a.key]);
}

function drawAll() {
    for (const axis of visibleAxes.value) {
        const canvas = canvasRefs[axis.key];
        const spec = store.analysisResult?.axes?.[axis.key]?.spectrogram;
        if (!canvas || !spec || spec.numSegments === 0) {
            continue;
        }
        drawSpectrogram(canvas, spec, axis.color);
    }
}

function drawSpectrogram(canvas, spec, axisColor) {
    const containerWidth = container.value?.clientWidth || 700;
    const totalHeight = PLOT_HEIGHT;
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${totalHeight}px`;
    canvas.width = containerWidth * dpr;
    canvas.height = totalHeight * dpr;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, containerWidth, totalHeight);

    const plotW = containerWidth - MARGIN.left - MARGIN.right;
    const plotH = totalHeight - MARGIN.top - MARGIN.bottom;
    if (plotW <= 0 || plotH <= 0) {
        return;
    }

    const maxFreq = Math.min(MAX_DISPLAY_FREQ, spec.freqHz[spec.numBins - 1]);
    const maxBin = findBinForFreq(spec.freqHz, spec.numBins, maxFreq);
    const { pMin, pMax } = powerRange(spec, maxBin);

    renderHeatmap(ctx, spec, maxBin, pMin, pMax, plotW, plotH);
    drawChirpMarkers(ctx, maxFreq, plotW, plotH, axisColor);
    drawAxes(ctx, spec, maxFreq, plotW, plotH);
}

function powerRange(spec, maxBin) {
    let pMin = Infinity;
    let pMax = -Infinity;
    for (let s = 0; s < spec.numSegments; s++) {
        const row = s * spec.numBins;
        for (let k = 1; k <= maxBin; k++) {
            const v = spec.power[row + k];
            if (v < pMin) {
                pMin = v;
            }
            if (v > pMax) {
                pMax = v;
            }
        }
    }
    return { pMin, pMax: pMax > pMin ? pMax : pMin + 1 };
}

function renderHeatmap(ctx, spec, maxBin, pMin, pMax, plotW, plotH) {
    const heatW = spec.numSegments;
    const heatH = maxBin;
    const imgData = new ImageData(heatW, heatH);
    const pRange = pMax - pMin;

    for (let y = 0; y < heatH; y++) {
        const freqBin = heatH - y;
        for (let x = 0; x < heatW; x++) {
            const val = spec.power[x * spec.numBins + freqBin];
            const t = Math.max(0, Math.min(1, (val - pMin) / pRange));
            const lutIdx = Math.round(t * (LUT_STEPS - 1));
            const px = (y * heatW + x) * 4;
            imgData.data[px] = COLOR_LUT[lutIdx * 3];
            imgData.data[px + 1] = COLOR_LUT[lutIdx * 3 + 1];
            imgData.data[px + 2] = COLOR_LUT[lutIdx * 3 + 2];
            imgData.data[px + 3] = 255;
        }
    }

    const offscreen = new OffscreenCanvas(heatW, heatH);
    offscreen.getContext("2d").putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, MARGIN.left, MARGIN.top, plotW, plotH);
}

function drawChirpMarkers(ctx, maxFreq, plotW, plotH, axisColor) {
    const sc = store.analysisResult?.sysConfig;
    if (!sc) {
        return;
    }
    const fStart = sc.chirp_frequency_start_deci_hz / 10;
    const fEnd = sc.chirp_frequency_end_deci_hz / 10;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = axisColor;
    for (const freq of [fStart, fEnd]) {
        if (freq > 0 && freq <= maxFreq) {
            const y = MARGIN.top + plotH * (1 - freq / maxFreq);
            ctx.beginPath();
            ctx.moveTo(MARGIN.left, y);
            ctx.lineTo(MARGIN.left + plotW, y);
            ctx.stroke();
        }
    }
    ctx.setLineDash([]);
}

function drawAxes(ctx, spec, maxFreq, plotW, plotH) {
    const style = getComputedStyle(document.documentElement);
    const textColor = style.getPropertyValue("--surface-600").trim() || "#888";
    const lineColor = style.getPropertyValue("--surface-400").trim() || "#ccc";

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;

    // Plot border
    ctx.strokeRect(MARGIN.left, MARGIN.top, plotW, plotH);

    ctx.fillStyle = textColor;
    ctx.font = "10px sans-serif";

    // X axis — time
    const tMin = spec.timeMs[0];
    const tMax = spec.timeMs[spec.numSegments - 1];
    const tRange = tMax - tMin;
    const xTicks = niceTicksLinear(tMin, tMax, 8);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const t of xTicks) {
        const x = MARGIN.left + ((t - tMin) / tRange) * plotW;
        ctx.beginPath();
        ctx.moveTo(x, MARGIN.top + plotH);
        ctx.lineTo(x, MARGIN.top + plotH + 4);
        ctx.stroke();
        ctx.fillText(formatTickMs(t), x, MARGIN.top + plotH + 5);
    }

    // X label
    ctx.font = "11px sans-serif";
    ctx.fillText("Time (s)", MARGIN.left + plotW / 2, MARGIN.top + plotH + 14);

    // Y axis — frequency
    const yTicks = niceTicksLinear(0, maxFreq, 6);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "10px sans-serif";
    for (const f of yTicks) {
        const y = MARGIN.top + plotH * (1 - f / maxFreq);
        ctx.beginPath();
        ctx.moveTo(MARGIN.left - 4, y);
        ctx.lineTo(MARGIN.left, y);
        ctx.stroke();
        ctx.fillText(`${Math.round(f)}`, MARGIN.left - 6, y);
    }

    // Y label
    ctx.save();
    ctx.translate(14, MARGIN.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.font = "11px sans-serif";
    ctx.fillText("Frequency (Hz)", 0, 0);
    ctx.restore();
}

function findBinForFreq(freqHz, numBins, freq) {
    for (let k = 0; k < numBins; k++) {
        if (freqHz[k] >= freq) {
            return k;
        }
    }
    return numBins - 1;
}

function formatTickMs(ms) {
    return (ms / 1000).toFixed(1);
}

function niceTicksLinear(min, max, count) {
    const range = max - min;
    if (range <= 0) {
        return [min];
    }
    const rawStep = range / count;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    let step = mag;
    if (rawStep / mag > 5) {
        step = mag * 10;
    } else if (rawStep / mag > 2) {
        step = mag * 5;
    } else if (rawStep / mag > 1) {
        step = mag * 2;
    }
    const ticks = [];
    let t = Math.ceil(min / step) * step;
    while (t <= max) {
        ticks.push(t);
        t += step;
    }
    return ticks;
}
</script>
