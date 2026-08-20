<template>
    <div ref="containerRef" class="chart-container">
        <canvas ref="chartCanvas" :width="canvasWidth" :height="canvasHeight"></canvas>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from "vue";

const props = defineProps({
    showGrid: { type: Boolean, default: true },
    curveActive: { type: Boolean, default: true },
    maximalSpeed: { type: Number, default: 50 },
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

function getCssVar(varName, fallback = "#000000") {
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return value || fallback;
}

function scaleRange(value, fromMin, fromMax, toMin, toMax) {
    if (fromMax - fromMin === 0) {
        return (toMin + toMax) / 2;
    }
    return toMin + ((value - fromMin) * (toMax - toMin)) / (fromMax - fromMin);
}

// Hyperbolic curve definition
function generateHyperbolicCurve() {
    const steps = 100;
    const data = [];
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
            speed: x * props.maximalSpeed,
            multiplier: curveValue,
        });
    }
    return data;
}

// Define curve and add it into chartCurves list in drawChart()
const curveData = computed(() => generateHyperbolicCurve());

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

const pad = { top: 20, right: 20, bottom: 30, left: 40 };

// Draw axises
function drawAxes(ctx, plotWidth, plotHeight, colors) {
    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotHeight);
    ctx.lineTo(pad.left + plotWidth, pad.top + plotHeight);
    ctx.stroke();

    // The axises labels
    ctx.fillStyle = colors.axisLabel;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Speed (m/s)", pad.left + plotWidth / 2, pad.top + plotHeight + 12);
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("Gain", pad.left - 5, pad.top + 10);
}

function getStepAxisX(maxSpeed) {
    let step = 5;
    if (maxSpeed <= 1) {
        step = 0.2;
    } else if (maxSpeed <= 10) {
        step = 2;
    }
    return step;
}

// Draw axises ticks and grid
function drawAxisTicksAndGrid(ctx, plotWidth, plotHeight, xScale, yScale, maxSpeed, minMult, maxMult, colors) {
    const fontSize = 9;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = colors.tick;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // The axis X labels and ticks
    const xStep = getStepAxisX(maxSpeed);
    for (let v = 0; v <= maxSpeed; v += xStep) {
        if (v === 0) {
            continue;
        }
        const x = xScale(v);
        if (x < pad.left || x > pad.left + plotWidth) {
            continue;
        }
        ctx.fillText(v.toFixed(xStep < 1 ? 1 : 0), x, pad.top + plotHeight + 4);
        // The small tick
        ctx.beginPath();
        ctx.moveTo(x, pad.top + plotHeight);
        ctx.lineTo(x, pad.top + plotHeight + 3);
        ctx.strokeStyle = colors.axis;
        ctx.lineWidth = 1;
        ctx.stroke();

        // The vertical grid lines
        if (props.showGrid) {
            ctx.beginPath();
            ctx.moveTo(x, pad.top);
            ctx.lineTo(x, pad.top + plotHeight);
            ctx.strokeStyle = colors.grid;
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // The axis Y labels and ticks
    const yStep = 0.25;
    for (let m = Math.ceil(minMult / yStep) * yStep; m <= maxMult; m += yStep) {
        const y = yScale(m);
        if (y < pad.top || y > pad.top + plotHeight) {
            continue;
        }
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(m.toFixed(2), pad.left - 4, y);
        // The small tick
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left - 3, y);
        ctx.strokeStyle = colors.axis;
        ctx.lineWidth = 1;
        ctx.stroke();

        // The horizontal grid lines
        if (props.showGrid && m !== 0) {
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(pad.left + plotWidth, y);
            ctx.strokeStyle = colors.grid;
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}

// The curves drawing
function drawCurves(ctx, chartCurves, xScale, yScale, colors) {
    chartCurves.forEach((curve) => {
        if (!curve.data) {
            return;
        }
        ctx.beginPath();
        ctx.strokeStyle = curve.color || colors.curve;
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

    const colors = {
        axis: getCssVar("--chart-axis-color", "#555555"),
        axisLabel: getCssVar("--chart-axis-label-color", "#aaaaaa"),
        tick: getCssVar("--chart-tick-color", "#888888"),
        grid: getCssVar("--chart-grid-line-color", "#333333"),
        curve: getCssVar("--chart-curve-color", "#e24761"),
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const plotWidth = w - pad.left - pad.right;
    const plotHeight = h - pad.top - pad.bottom;
    if (plotWidth <= 0 || plotHeight <= 0) {
        return;
    }

    // The list of charts curves
    const chartCurves = [
        {
            data: curveData.value,
            color: colors.curve,
            active: props.curveActive,
        },
    ];

    // Collect Y values
    const allData = [];
    for (const curve of chartCurves) {
        if (curve.data) {
            allData.push(...curve.data);
        }
    }

    if (allData.length === 0) {
        return;
    }

    const maxMult = Math.max(...allData.map((d) => d.multiplier));
    const minMult = 0;
    const yRange = maxMult - minMult || 1;

    const maxSpeed = Math.max(...allData.map((d) => d.speed));
    if (maxSpeed <= 0) {
        return;
    }

    const xScale = (speed) => pad.left + (speed / maxSpeed) * plotWidth;
    const yScale = (mult) => pad.top + plotHeight - ((mult - minMult) / yRange) * plotHeight;

    // The axises
    drawAxes(ctx, plotWidth, plotHeight, colors);

    // The ticks, grid and labels
    drawAxisTicksAndGrid(ctx, plotWidth, plotHeight, xScale, yScale, maxSpeed, minMult, maxMult, colors);

    // The curves
    drawCurves(ctx, chartCurves, xScale, yScale, colors);
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
    () => [props.maximalSpeed, props.curveExpo, props.stallThrottle, props.pidStallThrottle, props.pidFullThrottle],
    () => nextTick(() => drawChart()),
    { deep: true },
);
</script>

<style scoped>
canvas {
    display: block;
    width: 100%;
    height: 100%;
}
.chart-container {
    width: 100%;
    height: 100%;
    min-height: 150px;
}
</style>
