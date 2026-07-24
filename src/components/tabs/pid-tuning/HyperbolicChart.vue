<template>
    <div ref="containerRef" class="w-full h-full">
        <canvas ref="chartCanvas" :width="canvasWidth" :height="canvasHeight"></canvas>
        <div v-if="showLegend" class="flex flex-wrap justify-center gap-4 mt-1 text-xs">
            <span v-if="showMain"
                ><span
                    class="inline-block w-3 h-0.5 align-middle mr-1"
                    :style="{ backgroundColor: mainColor, opacity: mainActive ? 1 : 0.4 }"
                ></span>
                Main</span
            >
            <span v-if="showStick"
                ><span
                    class="inline-block w-3 h-0.5 align-middle mr-1"
                    :style="{ backgroundColor: stickColor, opacity: stickActive ? 1 : 0.4 }"
                ></span>
                Stick (all)</span
            >
            <span v-if="showRollStick"
                ><span
                    class="inline-block w-3 h-0.5 align-middle mr-1"
                    :style="{ backgroundColor: rollStickColor, opacity: rollStickActive ? 1 : 0.4 }"
                ></span>
                Roll Stick</span
            >
            <span
                ><span class="inline-block w-3 h-0.5 border border-white bg-transparent align-middle mr-1"></span>
                Vref</span
            >
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from "vue";

const props = defineProps({
    vRef: { type: Number, default: 20 },
    maxSpeed: { type: Number, default: 50 },
    mainPower: { type: Number, default: 2.0 },
    mainMin: { type: Number, default: 0.2 },
    mainMax: { type: Number, default: 3.0 },
    stickPower: { type: Number, default: 2.0 },
    stickMin: { type: Number, default: 0.3 },
    stickMax: { type: Number, default: 2.5 },
    rollStickPower: { type: Number, default: 1.0 },
    showMain: { type: Boolean, default: true },
    mainActive: { type: Boolean, default: true },
    showStick: { type: Boolean, default: true },
    stickActive: { type: Boolean, default: true },
    showRollStick: { type: Boolean, default: true },
    rollStickActive: { type: Boolean, default: true },
    showLegend: { type: Boolean, default: true },
    showGrid: { type: Boolean, default: true },
});

const containerRef = ref(null);
const chartCanvas = ref(null);
const canvasWidth = ref(0);
const canvasHeight = ref(0);
const dpr = window.devicePixelRatio || 1;
let resizeObserver = null;

const mainColor = "#e24761";
const stickColor = "#f9a825";
const rollStickColor = "#42a5f5";

function generateCurve(power, minLimit, maxLimit) {
    const steps = 100;
    const data = [];
    for (let i = 0; i <= steps; i++) {
        const v = 1 + (props.maxSpeed - 1) * (i / steps);
        let ratio = props.vRef / v;
        let multiplier = Math.pow(ratio, power);
        multiplier = Math.min(Math.max(multiplier, minLimit || 0), maxLimit || 10);
        data.push({ speed: v, multiplier });
    }
    return data;
}

const mainData = computed(() => (props.showMain ? generateCurve(props.mainPower, props.mainMin, props.mainMax) : null));
const stickData = computed(() =>
    props.showStick ? generateCurve(props.stickPower, props.stickMin, props.stickMax) : null,
);
const rollStickData = computed(() =>
    props.showRollStick ? generateCurve(props.rollStickPower, props.stickMin, props.stickMax) : null,
);

function resizeCanvas() {
    const container = containerRef.value;
    if (!container) {
        return;
    }
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        return;
    }
    canvasWidth.value = rect.width * dpr;
    canvasHeight.value = rect.height * dpr;
    const canvas = chartCanvas.value;
    if (canvas) {
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
    }
    drawChart();
}

// Draw axises
function drawAxes(ctx, pad, plotWidth, plotHeight) {
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotHeight);
    ctx.lineTo(pad.left + plotWidth, pad.top + plotHeight);
    ctx.stroke();
}

// Draw axises ticks and grid
function drawAxisTicks(ctx, pad, plotWidth, plotHeight, xScale, yScale, minMult, maxMult) {
    const fontSize = 9;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = "#888";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // The axis X labels and ticks
    const xStep = Math.ceil(props.maxSpeed / 5 / 5) * 5;
    for (let v = 0; v <= props.maxSpeed; v += xStep) {
        if (v === 0) {
            continue;
        }
        const x = xScale(v);
        if (x < pad.left || x > pad.left + plotWidth) {
            continue;
        }
        ctx.fillText(v, x, pad.top + plotHeight + 4);
        // The small tick
        ctx.beginPath();
        ctx.moveTo(x, pad.top + plotHeight);
        ctx.lineTo(x, pad.top + plotHeight + 3);
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // The axis Y labels and ticks
    const yStep = 1;
    for (let m = Math.ceil(minMult / yStep) * yStep; m <= maxMult; m += yStep) {
        const y = yScale(m);
        if (y < pad.top || y > pad.top + plotHeight) {
            continue;
        }
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(m.toFixed(1), pad.left - 4, y);
        // The small tick
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left - 3, y);
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1;
        ctx.stroke();

        // The horizontal grid lines
        if (props.showGrid && m !== 0) {
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(pad.left + plotWidth, y);
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // The vertical grid lines
    if (props.showGrid) {
        for (let v = xStep; v <= props.maxSpeed; v += xStep) {
            const x = xScale(v);
            if (x < pad.left || x > pad.left + plotWidth) {
                continue;
            }
            ctx.beginPath();
            ctx.moveTo(x, pad.top);
            ctx.lineTo(x, pad.top + plotHeight);
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}

// The curves drawing
function drawCurves(ctx, curves, xScale, yScale) {
    curves.forEach((curve) => {
        if (!curve.data) {
            return;
        }
        ctx.beginPath();
        ctx.strokeStyle = curve.color;
        ctx.lineWidth = curve.active ? 2 : 1.5;
        ctx.globalAlpha = curve.active ? 1.0 : 0.35;
        curve.data.forEach((point, index) => {
            const x = xScale(point.speed);
            const y = yScale(point.multiplier);
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    });
}

// The reference point drawing
function drawReferencePoint(ctx, xScale, yScale, pad, plotWidth, plotHeight) {
    const vrefX = xScale(props.vRef);
    const vrefY = yScale(1.0);

    if (vrefX < pad.left || vrefX > pad.left + plotWidth || vrefY < pad.top || vrefY > pad.top + plotHeight) {
        return;
    }

    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;

    ctx.beginPath();
    ctx.moveTo(vrefX, pad.top + plotHeight);
    ctx.lineTo(vrefX, vrefY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pad.left, vrefY);
    ctx.lineTo(vrefX, vrefY);
    ctx.stroke();

    ctx.restore();

    ctx.beginPath();
    ctx.arc(vrefX, vrefY, 4, 0, 2 * Math.PI);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#e24761";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Vref", vrefX + 6, vrefY - 2);
}

function drawChart() {
    const canvas = chartCanvas.value;
    if (!canvas) {
        return;
    }
    const ctx = canvas.getContext("2d");
    const w = canvasWidth.value / dpr;
    const h = canvasHeight.value / dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const pad = { top: 20, right: 20, bottom: 30, left: 40 };
    const plotWidth = w - pad.left - pad.right;
    const plotHeight = h - pad.top - pad.bottom;
    if (plotWidth <= 0 || plotHeight <= 0) {
        return;
    }

    // Collect Y values
    const allData = [];
    if (mainData.value) {
        allData.push(...mainData.value);
    }
    if (stickData.value) {
        allData.push(...stickData.value);
    }
    if (rollStickData.value) {
        allData.push(...rollStickData.value);
    }
    if (allData.length === 0) {
        return;
    }

    const maxMult = Math.max(...allData.map((d) => d.multiplier));
    const minMult = 0;
    const yRange = maxMult - minMult || 1;

    const xScale = (speed) => pad.left + ((speed - 1) / (props.maxSpeed - 1)) * plotWidth;
    const yScale = (mult) => pad.top + plotHeight - ((mult - minMult) / yRange) * plotHeight;

    // The axises
    drawAxes(ctx, pad, plotWidth, plotHeight);

    // The grid and labels
    drawAxisTicks(ctx, pad, plotWidth, plotHeight, xScale, yScale, minMult, maxMult);

    // The curves
    const curves = [
        { data: mainData.value, color: mainColor, active: props.mainActive },
        { data: stickData.value, color: stickColor, active: props.stickActive },
        { data: rollStickData.value, color: rollStickColor, active: props.rollStickActive },
    ];
    drawCurves(ctx, curves, xScale, yScale);

    // The reference point
    drawReferencePoint(ctx, xScale, yScale, pad, plotWidth, plotHeight);

    // The common labels
    ctx.fillStyle = "#aaa";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Speed (m/s)", pad.left + plotWidth / 2, pad.top + plotHeight + 12);
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("Gain", pad.left - 5, pad.top + 10);
}

onMounted(() => {
    nextTick(() => {
        resizeCanvas();
        resizeObserver = new ResizeObserver(() => resizeCanvas());
        if (containerRef.value) {
            resizeObserver.observe(containerRef.value);
        }
        window.addEventListener("resize", resizeCanvas);
    });
});

onUnmounted(() => {
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    window.removeEventListener("resize", resizeCanvas);
});

watch(
    () => [
        props.vRef,
        props.maxSpeed,
        props.mainPower,
        props.mainMin,
        props.mainMax,
        props.stickPower,
        props.stickMin,
        props.stickMax,
        props.rollStickPower,
        props.showMain,
        props.showStick,
        props.showRollStick,
        props.mainActive,
        props.stickActive,
        props.rollStickActive,
        props.showGrid,
    ],
    () => nextTick(() => drawChart()),
    { deep: true },
);
</script>

<style scoped>
div {
    width: 100%;
    height: 100%;
    min-height: 150px;
}
canvas {
    display: block;
    width: 100%;
    height: 100%;
}
</style>
