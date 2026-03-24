<template>
    <div class="filter-response-container gui_box grey">
        <div class="chart-header">
            <span class="chart-title">Filter Frequency Response</span>
            <span class="chart-subtitle">0 – 1000 Hz</span>
        </div>
        <div ref="chartContainer" class="chart-wrapper">
            <svg ref="chartSvg" class="filter-chart"></svg>
        </div>
    </div>
</template>

<script setup>
import { ref, watchPostEffect, onBeforeUnmount, nextTick } from "vue";
import * as d3 from "d3";
import FC from "@/js/fc";

const chartContainer = ref(null);
const chartSvg = ref(null);

const FREQ_MAX = 1000;
const DB_MIN = -40;
const DB_MAX = 2;
const N_POINTS = 800;
const CHART_HEIGHT = 260;

// ─── DSP math helpers ────────────────────────────────────────────────────────

function pt1Mag(f, fc) {
    if (fc <= 0 || f === 0) return 1;
    return 1 / Math.sqrt(1 + (f / fc) ** 2);
}

/** PT2: cascade of two PT1 stages (amplitude = pt1²) */
function pt2Mag(f, fc) {
    if (fc <= 0 || f === 0) return 1;
    const r = f / fc;
    return 1 / (1 + r * r);
}

/** PT3: cascade of three PT1 stages */
function pt3Mag(f, fc) {
    if (fc <= 0 || f === 0) return 1;
    const r = f / fc;
    return Math.pow(1 / (1 + r * r), 1.5);
}

/** BIQUAD: 2nd-order Butterworth lowpass |H|² = 1/(1 + (f/fc)⁴) */
function biquadMag(f, fc) {
    if (fc <= 0 || f === 0) return 1;
    const r = f / fc;
    return 1 / Math.sqrt(1 + r ** 4);
}

function lpfMag(f, fc, type) {
    switch (type) {
        case 0:
            return pt1Mag(f, fc); // PT1
        case 1:
            return biquadMag(f, fc); // BIQUAD
        case 2:
            return pt2Mag(f, fc); // PT2
        case 3:
            return pt3Mag(f, fc); // PT3
        default:
            return pt1Mag(f, fc);
    }
}

/**
 * Notch filter magnitude using center freq + Q factor.
 * H(f) = |fn² – f²| / √((fn²–f²)² + (fn·f/Q)²)
 */
function notchMagQ(f, fcenter, Q) {
    if (fcenter <= 0 || Q <= 0) return 1;
    if (f === 0) return 1;
    const fn2 = fcenter * fcenter;
    const f2 = f * f;
    const diff = fn2 - f2;
    const num = Math.abs(diff);
    const denom = Math.sqrt(diff * diff + ((fcenter * f) / Q) ** 2);
    return denom > 1e-12 ? num / denom : 0;
}

/**
 * Notch filter magnitude using center + cutoff frequency.
 * Q is derived as: Q = fcenter / (2·(fcenter − fcutoff))
 */
function notchMagCutoff(f, fcenter, fcutoff) {
    if (fcenter <= 0 || fcutoff <= 0 || fcutoff >= fcenter) return 1;
    const Q = fcenter / (2 * (fcenter - fcutoff));
    return notchMagQ(f, fcenter, Q);
}

function toDb(mag) {
    if (mag <= 0) return DB_MIN;
    const db = 20 * Math.log10(Math.max(mag, 1e-10));
    return Math.max(DB_MIN, Math.min(DB_MAX, db));
}

// ─── Frequency axis ───────────────────────────────────────────────────────────

function buildFreqArray() {
    return Array.from({ length: N_POINTS + 1 }, (_, i) => (i / N_POINTS) * FREQ_MAX);
}

// ─── Curve computation ────────────────────────────────────────────────────────

function computeCurves(state) {
    const freqs = buildFreqArray();
    const curves = [];

    // Helper: build points array
    const pts = (magFn) => freqs.map((f) => [f, toDb(magFn(f))]);

    // ── Gyro LPF1 ────────────────────────────────────────────────
    if (state.gyroLpf1DynMin > 0) {
        // Dynamic mode: draw min cutoff (dashed, darker) and max cutoff (solid, brighter)
        curves.push({
            id: "gyro-lpf1-min",
            label: `Gyro LPF1 dyn min ${state.gyroLpf1DynMin}Hz`,
            color: "#3366ee",
            dash: "5,4",
            points: pts((f) => lpfMag(f, state.gyroLpf1DynMin, state.gyroLpf1Type)),
        });
        curves.push({
            id: "gyro-lpf1-max",
            label: `Gyro LPF1 dyn max ${state.gyroLpf1DynMax}Hz`,
            color: "#5599ff",
            dash: null,
            points: pts((f) => lpfMag(f, state.gyroLpf1DynMax, state.gyroLpf1Type)),
        });
    } else if (state.gyroLpf1Hz > 0) {
        curves.push({
            id: "gyro-lpf1",
            label: `Gyro LPF1 ${state.gyroLpf1Hz}Hz`,
            color: "#5599ff",
            dash: null,
            points: pts((f) => lpfMag(f, state.gyroLpf1Hz, state.gyroLpf1Type)),
        });
    }

    // ── Gyro LPF2 ────────────────────────────────────────────────
    if (state.gyroLpf2Hz > 0) {
        curves.push({
            id: "gyro-lpf2",
            label: `Gyro LPF2 ${state.gyroLpf2Hz}Hz`,
            color: "#00dddd",
            dash: null,
            points: pts((f) => lpfMag(f, state.gyroLpf2Hz, state.gyroLpf2Type)),
        });
    }

    // ── D-term LPF1 ──────────────────────────────────────────────
    if (state.dtermLpf1DynMin > 0) {
        curves.push({
            id: "dterm-lpf1-min",
            label: `D-Term LPF1 dyn min ${state.dtermLpf1DynMin}Hz`,
            color: "#cc6600",
            dash: "5,4",
            points: pts((f) => lpfMag(f, state.dtermLpf1DynMin, state.dtermLpf1Type)),
        });
        curves.push({
            id: "dterm-lpf1-max",
            label: `D-Term LPF1 dyn max ${state.dtermLpf1DynMax}Hz`,
            color: "#ff9922",
            dash: null,
            points: pts((f) => lpfMag(f, state.dtermLpf1DynMax, state.dtermLpf1Type)),
        });
    } else if (state.dtermLpf1Hz > 0) {
        curves.push({
            id: "dterm-lpf1",
            label: `D-Term LPF1 ${state.dtermLpf1Hz}Hz`,
            color: "#ff9922",
            dash: null,
            points: pts((f) => lpfMag(f, state.dtermLpf1Hz, state.dtermLpf1Type)),
        });
    }

    // ── D-term LPF2 ──────────────────────────────────────────────
    if (state.dtermLpf2Hz > 0) {
        curves.push({
            id: "dterm-lpf2",
            label: `D-Term LPF2 ${state.dtermLpf2Hz}Hz`,
            color: "#eecc00",
            dash: null,
            points: pts((f) => lpfMag(f, state.dtermLpf2Hz, state.dtermLpf2Type)),
        });
    }

    // ── Dynamic Notch filters ────────────────────────────────────
    if (state.dynNotchCount > 0) {
        const Q = Math.max((state.dynNotchQ || 120) / 100, 0.5);
        const minHz = state.dynNotchMinHz || 150;
        const maxHz = state.dynNotchMaxHz || 600;
        const count = state.dynNotchCount;

        for (let i = 0; i < count; i++) {
            const spacing = count > 1 ? (maxHz - minHz) / (count - 1) : 0;
            const center = minHz + i * spacing;
            if (center > 0 && center <= FREQ_MAX) {
                curves.push({
                    id: `dyn-notch-${i}`,
                    label: i === 0 ? `Dyn Notch ×${count} (Q=${Q.toFixed(1)}, ${minHz}–${maxHz}Hz)` : null,
                    color: "#ff4444",
                    dash: null,
                    points: pts((f) => notchMagQ(f, center, Q)),
                });
            }
        }
    }

    // ── RPM filter harmonics ─────────────────────────────────────
    if (state.dshotTelemetry && state.rpmHarmonics > 0) {
        const minHz = state.rpmMinHz || 100;
        const RPM_Q = 25; // representative narrow notch
        let labeled = false;

        for (let h = 1; h <= state.rpmHarmonics; h++) {
            const center = minHz * h;
            if (center <= FREQ_MAX) {
                curves.push({
                    id: `rpm-${h}`,
                    label: !labeled ? `RPM Filter ×${state.rpmHarmonics} (min ${minHz}Hz)` : null,
                    color: "#44ee88",
                    dash: null,
                    points: pts((f) => notchMagQ(f, center, RPM_Q)),
                });
                labeled = true;
            }
        }
    }

    return curves;
}

// ─── D3 rendering ─────────────────────────────────────────────────────────────

function renderChart(state) {
    if (!chartSvg.value || !chartContainer.value) return;

    const containerWidth = chartContainer.value.clientWidth || 800;
    if (containerWidth < 10) return;

    const margin = { top: 28, right: 24, bottom: 52, left: 62 };
    const width = containerWidth - margin.left - margin.right;
    const height = CHART_HEIGHT - margin.top - margin.bottom;

    const svg = d3.select(chartSvg.value);
    svg.selectAll("*").remove();
    svg.attr("width", containerWidth).attr("height", CHART_HEIGHT);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Clip path so curves don't bleed outside axes
    const clipId = "filter-chart-clip";
    g.append("defs").append("clipPath").attr("id", clipId).append("rect").attr("width", width).attr("height", height);

    const xScale = d3.scaleLinear().domain([0, FREQ_MAX]).range([0, width]);
    const yScale = d3.scaleLinear().domain([DB_MIN, DB_MAX]).range([height, 0]);

    // ── Background ──
    g.append("rect").attr("width", width).attr("height", height).attr("fill", "rgba(0,0,0,0.25)").attr("rx", 2);

    // ── Grid lines ──
    g.append("g")
        .attr("class", "x-grid")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).ticks(10).tickSize(-height).tickFormat(""));

    g.append("g").attr("class", "y-grid").call(d3.axisLeft(yScale).ticks(8).tickSize(-width).tickFormat(""));

    // ── 0 dB reference line ──
    g.append("line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", yScale(0))
        .attr("y2", yScale(0))
        .attr("class", "ref-zero");

    // ── Nyquist / loop-rate marker ──
    const gyroSyncDenom = Math.max(state.gyroSyncDenom, 1);
    const pidDenom = Math.max(state.pidProcessDenom, 1);
    const gyroRate = 8000 / gyroSyncDenom;
    const nyquist = gyroRate / (pidDenom * 2);

    if (nyquist > 0 && nyquist <= FREQ_MAX) {
        const nx = xScale(nyquist);
        g.append("line").attr("x1", nx).attr("x2", nx).attr("y1", 0).attr("y2", height).attr("class", "nyquist-line");
        g.append("text")
            .attr("x", nx + 4)
            .attr("y", 13)
            .attr("class", "nyquist-label")
            .text(`Nyquist ${Math.round(nyquist)}Hz`);
    }

    const curves = computeCurves(state);
    const clipAttr = `url(#${clipId})`;

    // ── Sweep bands (rendered behind curves) ──

    // Dynamic notch sweep band: vertical stripe showing the Hz range the notch travels
    if (state.dynNotchCount > 0) {
        const minHz = state.dynNotchMinHz || 150;
        const maxHz = state.dynNotchMaxHz || 600;
        if (minHz < maxHz) {
            g.append("rect")
                .attr("x", xScale(minHz))
                .attr("y", 0)
                .attr("width", xScale(maxHz) - xScale(minHz))
                .attr("height", height)
                .attr("clip-path", clipAttr)
                .attr("fill", "rgba(255,68,68,0.08)")
                .attr("stroke", "none");

            // Subtle border lines at the edges of the sweep range
            [minHz, maxHz].forEach((hz) => {
                g.append("line")
                    .attr("x1", xScale(hz))
                    .attr("x2", xScale(hz))
                    .attr("y1", 0)
                    .attr("y2", height)
                    .attr("clip-path", clipAttr)
                    .style("stroke", "rgba(255,68,68,0.35)")
                    .style("stroke-width", 1)
                    .style("stroke-dasharray", "3,3");
            });
        }
    }

    // D-Term LPF1 dynamic sweep band: area between the min-Hz and max-Hz response curves
    if (state.dtermLpf1DynMin > 0) {
        const freqs = buildFreqArray();
        const areaData = freqs.map((f) => ({
            f,
            yLow: toDb(lpfMag(f, state.dtermLpf1DynMin, state.dtermLpf1Type)),
            yHigh: toDb(lpfMag(f, state.dtermLpf1DynMax, state.dtermLpf1Type)),
        }));

        const areaGen = d3
            .area()
            .x((d) => xScale(d.f))
            .y0((d) => yScale(d.yLow))
            .y1((d) => yScale(d.yHigh))
            .defined((d) => isFinite(d.yLow) && isFinite(d.yHigh) && d.yLow >= DB_MIN);

        g.append("path")
            .datum(areaData)
            .attr("d", areaGen)
            .attr("clip-path", clipAttr)
            .attr("fill", "rgba(255,153,34,0.13)")
            .attr("stroke", "none");
    }

    // ── Filter curves ──
    const lineGen = d3
        .line()
        .x((d) => xScale(d[0]))
        .y((d) => yScale(d[1]))
        .defined((d) => isFinite(d[1]) && d[1] >= DB_MIN);

    curves.forEach((curve) => {
        const path = g
            .append("path")
            .datum(curve.points)
            .attr("d", lineGen)
            .attr("clip-path", clipAttr)
            .attr("class", "filter-curve")
            .style("stroke", curve.color)
            .style("stroke-width", 1.8)
            .style("fill", "none");

        if (curve.dash) {
            path.style("stroke-dasharray", curve.dash);
        }
    });

    // ── X Axis ──
    g.append("g")
        .attr("class", "axis x-axis")
        .attr("transform", `translate(0,${height})`)
        .call(
            d3
                .axisBottom(xScale)
                .ticks(10)
                .tickFormat((d) => `${d}`),
        );

    // ── Y Axis ──
    g.append("g")
        .attr("class", "axis y-axis")
        .call(
            d3
                .axisLeft(yScale)
                .ticks(8)
                .tickFormat((d) => `${d}dB`),
        );

    // ── Axis labels ──
    g.append("text")
        .attr("class", "axis-label")
        .attr("x", width / 2)
        .attr("y", height + 44)
        .style("text-anchor", "middle")
        .text("Frequency (Hz)");

    g.append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -(height / 2))
        .attr("y", -52)
        .style("text-anchor", "middle")
        .text("Attenuation (dB)");

    // ── Legend ──
    const legendItems = curves.filter((c) => c.label);
    if (legendItems.length === 0) return;

    const LEGEND_ITEM_H = 17;
    const LEGEND_W = 210;
    const legendX = width - LEGEND_W - 2;
    const legendY = 4;
    const legendH = legendItems.length * LEGEND_ITEM_H + 8;

    const legendG = g.append("g").attr("class", "legend").attr("transform", `translate(${legendX},${legendY})`);

    legendG.append("rect").attr("width", LEGEND_W).attr("height", legendH).attr("class", "legend-bg").attr("rx", 3);

    legendItems.forEach((item, idx) => {
        const ly = 8 + idx * LEGEND_ITEM_H;
        legendG
            .append("line")
            .attr("x1", 8)
            .attr("x2", 26)
            .attr("y1", ly + 5)
            .attr("y2", ly + 5)
            .style("stroke", item.color)
            .style("stroke-width", 2)
            .style("stroke-dasharray", item.dash || null);

        legendG
            .append("text")
            .attr("x", 32)
            .attr("y", ly + 9)
            .attr("class", "legend-text")
            .text(item.label);
    });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

let resizeObserver = null;

// watchPostEffect runs after DOM updates and re-runs on any accessed reactive dep change
watchPostEffect(() => {
    const cfg = FC.FILTER_CONFIG;
    const adv = FC.PID_ADVANCED_CONFIG;
    const motor = FC.MOTOR_CONFIG;

    // Reading each property here registers it as a reactive dependency
    const state = {
        gyroLpf1Hz: cfg.gyro_lowpass_hz,
        gyroLpf1Type: cfg.gyro_lowpass_type,
        gyroLpf1DynMin: cfg.gyro_lowpass_dyn_min_hz,
        gyroLpf1DynMax: cfg.gyro_lowpass_dyn_max_hz,
        gyroLpf2Hz: cfg.gyro_lowpass2_hz,
        gyroLpf2Type: cfg.gyro_lowpass2_type,
        dynNotchCount: cfg.dyn_notch_count,
        dynNotchQ: cfg.dyn_notch_q,
        dynNotchMinHz: cfg.dyn_notch_min_hz,
        dynNotchMaxHz: cfg.dyn_notch_max_hz,
        dtermLpf1Hz: cfg.dterm_lowpass_hz,
        dtermLpf1Type: cfg.dterm_lowpass_type,
        dtermLpf1DynMin: cfg.dterm_lowpass_dyn_min_hz,
        dtermLpf1DynMax: cfg.dterm_lowpass_dyn_max_hz,
        dtermLpf2Hz: cfg.dterm_lowpass2_hz,
        dtermLpf2Type: cfg.dterm_lowpass2_type,
        rpmHarmonics: cfg.gyro_rpm_notch_harmonics,
        rpmMinHz: cfg.gyro_rpm_notch_min_hz,
        dshotTelemetry: motor?.use_dshot_telemetry ?? false,
        gyroSyncDenom: adv.gyro_sync_denom || 1,
        pidProcessDenom: adv.pid_process_denom || 1,
    };

    if (chartSvg.value && chartContainer.value) {
        renderChart(state);
    }
});

// Redraw on container resize
const startResizeObserver = () => {
    if (!chartContainer.value || !window.ResizeObserver) return;
    resizeObserver = new ResizeObserver(() => {
        nextTick(() => {
            if (chartSvg.value && chartContainer.value) {
                // Re-read state snapshot and redraw
                const cfg = FC.FILTER_CONFIG;
                const adv = FC.PID_ADVANCED_CONFIG;
                const motor = FC.MOTOR_CONFIG;
                renderChart({
                    gyroLpf1Hz: cfg.gyro_lowpass_hz,
                    gyroLpf1Type: cfg.gyro_lowpass_type,
                    gyroLpf1DynMin: cfg.gyro_lowpass_dyn_min_hz,
                    gyroLpf1DynMax: cfg.gyro_lowpass_dyn_max_hz,
                    gyroLpf2Hz: cfg.gyro_lowpass2_hz,
                    gyroLpf2Type: cfg.gyro_lowpass2_type,
                    dynNotchCount: cfg.dyn_notch_count,
                    dynNotchQ: cfg.dyn_notch_q,
                    dynNotchMinHz: cfg.dyn_notch_min_hz,
                    dynNotchMaxHz: cfg.dyn_notch_max_hz,
                    dtermLpf1Hz: cfg.dterm_lowpass_hz,
                    dtermLpf1Type: cfg.dterm_lowpass_type,
                    dtermLpf1DynMin: cfg.dterm_lowpass_dyn_min_hz,
                    dtermLpf1DynMax: cfg.dterm_lowpass_dyn_max_hz,
                    dtermLpf2Hz: cfg.dterm_lowpass2_hz,
                    dtermLpf2Type: cfg.dterm_lowpass2_type,
                    rpmHarmonics: cfg.gyro_rpm_notch_harmonics,
                    rpmMinHz: cfg.gyro_rpm_notch_min_hz,
                    dshotTelemetry: motor?.use_dshot_telemetry ?? false,
                    gyroSyncDenom: adv.gyro_sync_denom || 1,
                    pidProcessDenom: adv.pid_process_denom || 1,
                });
            }
        });
    });
    resizeObserver.observe(chartContainer.value);
};

// Use a MutationObserver-safe way to start the ResizeObserver after mount
watchPostEffect(() => {
    if (chartContainer.value && !resizeObserver) {
        startResizeObserver();
    }
});

onBeforeUnmount(() => {
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
});
</script>

<style scoped>
.filter-response-container {
    border: 1px solid var(--surface-300);
    border-radius: 4px;
    padding: 12px 16px 16px;
    background: var(--surface-50);
}

.chart-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 8px;
}

.chart-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #ccc);
    letter-spacing: 0.03em;
    text-transform: uppercase;
}

.chart-subtitle {
    font-size: 11px;
    color: var(--text-secondary, #888);
}

.chart-wrapper {
    width: 100%;
}

.filter-chart {
    display: block;
    width: 100%;
}

/* ─── SVG element styles via :deep() so they reach D3-generated elements ─── */

.filter-chart :deep(.x-grid line),
.filter-chart :deep(.y-grid line) {
    stroke: rgba(255, 255, 255, 0.07);
    stroke-width: 1;
}

.filter-chart :deep(.x-grid path),
.filter-chart :deep(.y-grid path) {
    stroke: none;
}

.filter-chart :deep(.axis text) {
    fill: #aaaaaa;
    font-size: 10px;
}

.filter-chart :deep(.axis path),
.filter-chart :deep(.axis line) {
    stroke: #555555;
}

.filter-chart :deep(.axis-label) {
    fill: #999999;
    font-size: 11px;
}

.filter-chart :deep(.ref-zero) {
    stroke: rgba(255, 255, 255, 0.2);
    stroke-width: 1;
    stroke-dasharray: 4, 4;
}

.filter-chart :deep(.nyquist-line) {
    stroke: #888888;
    stroke-width: 1.5;
    stroke-dasharray: 7, 5;
}

.filter-chart :deep(.nyquist-label) {
    fill: #888888;
    font-size: 10px;
}

.filter-chart :deep(.legend-bg) {
    fill: rgba(0, 0, 0, 0.55);
    stroke: rgba(255, 255, 255, 0.1);
    stroke-width: 1;
}

.filter-chart :deep(.legend-text) {
    fill: #cccccc;
    font-size: 10px;
}
</style>
