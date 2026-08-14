<template>
    <div ref="containerRef" class="w-full h-full">
        <canvas ref="chartCanvas" :width="canvasWidth" :height="canvasHeight"></canvas>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from "vue";

const props = defineProps({
    showGrid: { type: Boolean, default: true },
    isAdvancedMode: { type: Boolean, default: false },
    propPitch: { type: Number, default: 3.7 },
    craftMass: { type: Number, default: 1 },
    dragCoef: { type: Number, default: 0.01 },
    motorThrust: { type: Number, default: 2 },
    maxVoltage: { type: Number, default: 25.2 },
    motorKv: { type: Number, default: 0 },
    curveExpo: { type: Number, default: 2 },
    stallThrottle: { type: Number, default: 0.3 },
    pidStallThrottle: { type: Number, default: 2 },
    pidFullThrottle: { type: Number, default: 0.7 },
});

const containerRef = ref(null);
const chartCanvas = ref(null);
const canvasWidth = ref(0);
const canvasHeight = ref(0);
const dpr = window.devicePixelRatio || 1;
let resizeObserver = null;
let maxSpeed = 0;
const curveColor = "#e24761";

function getWingMaximalSpeed() {
    const G_ACCELERATION = 9.80665;

    const maxFallSpeed = Math.sqrt((props.craftMass * G_ACCELERATION) / props.dragCoef);

    const propMaxSpeed = (2.54 / 100 / 60) * props.propPitch * props.motorKv * props.maxVoltage;
    const inversePropMaxSpeed = propMaxSpeed > 0 ? 1 / propMaxSpeed : 0;

    const twr = props.motorThrust / props.craftMass;
    const a = props.dragCoef;
    const b = props.craftMass * twr * G_ACCELERATION * inversePropMaxSpeed;
    const c = -props.craftMass * (twr + 1) * G_ACCELERATION;

    const D = b * b - 4 * a * c;
    const maxDiveSpeed = D >= 0 ? (-b + Math.sqrt(D)) / (2 * a) : 0;

    return Math.max(Math.max(maxFallSpeed, maxDiveSpeed), 1);
}

function scaleRange(value, fromMin, fromMax, toMin, toMax) {
    return toMin + ((value - fromMin) * (toMax - toMin)) / (fromMax - fromMin);
}

function generateCurve() {
    const steps = 100;
    const data = [];
    maxSpeed = props.isAdvancedMode ? getWingMaximalSpeed() : 1;
    for (let i = 0; i <= steps; i++) {
        const x = i / steps;
        let curveValue;
        if (x < props.stallThrottle) {
            curveValue = props.pidStallThrottle;
        } else {
            const expoDivider = props.curveExpo - 1;
            const expo = Math.abs(expoDivider) > 1e-3 ? 1 / expoDivider : 1e3;
            const xShifted = scaleRange(x, props.stallThrottle, 1, 0, 1);
            const base = 1 + (Math.pow(props.pidStallThrottle / props.pidFullThrottle, 1 / expo) - 1) * xShifted;
            const divisor = Math.pow(base, expo);
            curveValue = props.pidStallThrottle / divisor;
        }
        data.push({
            speed: x * maxSpeed,
            multiplier: curveValue,
        });
    }
    return data;
}

const mainData = computed(() => generateCurve());

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
    const xStep = Math.ceil(maxSpeed / 5 / 5) * 5;
    for (let v = 0; v <= maxSpeed; v += xStep) {
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
        for (let v = xStep; v <= maxSpeed; v += xStep) {
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

    if (allData.length === 0) {
        return;
    }

    const maxMult = Math.max(...allData.map((d) => d.multiplier));
    const minMult = 0;
    const yRange = maxMult - minMult || 1;

    const xScale = (speed) => pad.left + (speed / maxSpeed) * plotWidth;
    const yScale = (mult) => pad.top + plotHeight - ((mult - minMult) / yRange) * plotHeight;

    // The axises
    drawAxes(ctx, pad, plotWidth, plotHeight);

    // The grid and labels
    drawAxisTicks(ctx, pad, plotWidth, plotHeight, xScale, yScale, minMult, maxMult);

    // The curves
    const curves = [{ data: mainData.value, color: curveColor, active: true }];
    drawCurves(ctx, curves, xScale, yScale);

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
        props.isAdvancedMode,
        props.propPitch,
        props.craftMass,
        props.dragCoef,
        props.motorThrust,
        props.maxVoltage,
        props.motorKv,
        props.curveExpo,
        props.stallThrottle,
        props.pidStallThrottle,
        props.pidFullThrottle,
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
