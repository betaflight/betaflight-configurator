<template>
    <div class="gps-accuracy-plot" ref="containerRef">
        <svg ref="svgRef"></svg>
    </div>
</template>

<script>
import { defineComponent, ref, watch, onMounted, onUnmounted } from "vue";
import * as d3 from "d3";

export default defineComponent({
    name: "GpsAccuracyPlot",
    props: {
        fixes: {
            type: Array,
            default: () => [],
            // Each item: { lat: Number (decimal degrees), lon: Number (decimal degrees), t: Number (ms timestamp) }
        },
    },
    setup(props) {
        const svgRef = ref(null);
        const containerRef = ref(null);
        let rafId = null;

        // Empirical percentile from a pre-sorted array (ascending).
        // p in [0, 1]. Returns the value at the p-th fractile.
        function percentile(sorted, p) {
            if (sorted.length === 0) return 0;
            const idx = Math.max(0, Math.ceil(sorted.length * p) - 1);
            return sorted[Math.min(idx, sorted.length - 1)];
        }

        const scheduleDraw = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                draw();
            });
        };

        const draw = () => {
            if (!svgRef.value || !containerRef.value) return;

            const svg = d3.select(svgRef.value);
            svg.selectAll("*").remove();

            const W = containerRef.value.clientWidth || 260;
            const H = W; // square plot
            svg.attr("width", W).attr("height", H);

            const PAD = 30; // padding from SVG edge to plot circle edge
            const cx = W / 2;
            const cy = H / 2;
            const plotR = W / 2 - PAD; // plot radius in pixels

            // Background
            svg.append("rect").attr("width", W).attr("height", H).attr("fill", "#0c1117").attr("rx", 4);

            const fixes = props.fixes;

            if (fixes.length < 2) {
                svg.append("text")
                    .attr("x", cx)
                    .attr("y", cy)
                    .attr("text-anchor", "middle")
                    .attr("dominant-baseline", "middle")
                    .attr("fill", "#4a5568")
                    .attr("font-size", "12px")
                    .text(fixes.length === 0 ? "Waiting for GPS fix…" : "Accumulating fixes…");
                return;
            }

            // ── Mean centre (running mean of all accumulated fixes) ─────────
            const meanLat = fixes.reduce((s, f) => s + f.lat, 0) / fixes.length;
            const meanLon = fixes.reduce((s, f) => s + f.lon, 0) / fixes.length;
            const cosLat = Math.cos((meanLat * Math.PI) / 180);
            const LAT_M = 111320; // metres per degree latitude

            // Metre offsets from mean (x = East, y = North)
            const pts = fixes.map((f) => ({
                x: (f.lon - meanLon) * LAT_M * cosLat,
                y: (f.lat - meanLat) * LAT_M,
                t: f.t,
            }));

            // ── Accuracy statistics (empirical percentiles) ────────────────
            const radii = pts.map((p) => Math.sqrt(p.x * p.x + p.y * p.y)).sort((a, b) => a - b);

            const cep50 = percentile(radii, 0.5); // 50th %ile — CEP 50%
            const cep95 = percentile(radii, 0.95); // 95th %ile — CEP 95%  (= 2σ display)
            const sig1 = percentile(radii, 0.6827); // 1σ ≈ 68.27% containment
            const sig2 = percentile(radii, 0.9545); // 2σ ≈ 95.45% containment

            // ── Axis scaling — fit all points with 30% headroom ────────────
            const maxR = radii[radii.length - 1] || 0.1;
            const axisM = maxR * 1.3; // metres from centre to edge of plot
            const scale = plotR / axisM; // pixels per metre

            const toSVG = (mx, my) => [cx + mx * scale, cy - my * scale];

            // ── Crosshair axes ─────────────────────────────────────────────
            const AXIS_COLOR = "#1a2535";
            svg.append("line")
                .attr("x1", cx)
                .attr("x2", cx)
                .attr("y1", PAD)
                .attr("y2", H - PAD)
                .attr("stroke", AXIS_COLOR)
                .attr("stroke-width", 1);
            svg.append("line")
                .attr("x1", PAD)
                .attr("x2", W - PAD)
                .attr("y1", cy)
                .attr("y2", cy)
                .attr("stroke", AXIS_COLOR)
                .attr("stroke-width", 1);

            // Cardinal labels (N/S/E/W)
            const CARDINAL_COLOR = "#253347";
            [
                { t: "N", x: cx, y: PAD - 8, a: "middle", b: "auto" },
                { t: "S", x: cx, y: H - PAD + 14, a: "middle", b: "auto" },
                { t: "E", x: W - PAD + 12, y: cy, a: "middle", b: "middle" },
                { t: "W", x: PAD - 12, y: cy, a: "middle", b: "middle" },
            ].forEach(({ t, x, y, a, b }) => {
                svg.append("text")
                    .attr("x", x)
                    .attr("y", y)
                    .attr("text-anchor", a)
                    .attr("dominant-baseline", b)
                    .attr("fill", CARDINAL_COLOR)
                    .attr("font-size", "10px")
                    .attr("font-weight", "bold")
                    .text(t);
            });

            // ── CEP rings ─────────────────────────────────────────────────
            if (fixes.length >= 5) {
                const ringDefs = [
                    {
                        r: cep50,
                        color: "#3a85e8",
                        dash: "5,3",
                        // label at ~35° east of north so it clears the N cardinal
                        labelAngle: -(Math.PI / 2 - Math.PI / 5),
                    },
                    {
                        r: cep95,
                        color: "#e8703a",
                        dash: "7,3",
                        // label further round to avoid overlap with CEP50 label
                        labelAngle: -(Math.PI / 2 - Math.PI / 3),
                    },
                ];

                ringDefs.forEach(({ r, color, dash, labelAngle }) => {
                    const rPx = r * scale;
                    if (rPx < 1) return;

                    svg.append("circle")
                        .attr("cx", cx)
                        .attr("cy", cy)
                        .attr("r", rPx)
                        .attr("fill", "none")
                        .attr("stroke", color)
                        .attr("stroke-width", 1.2)
                        .attr("stroke-dasharray", dash)
                        .attr("opacity", 0.65);

                    // Radius label placed on the ring itself
                    const labelText = `${r.toFixed(r < 10 ? 1 : 0)}m`;
                    const lx = cx + (rPx + 2) * Math.cos(labelAngle);
                    const ly = cy + (rPx + 2) * Math.sin(labelAngle);
                    svg.append("text")
                        .attr("x", lx)
                        .attr("y", ly)
                        .attr("text-anchor", "start")
                        .attr("dominant-baseline", "middle")
                        .attr("fill", color)
                        .attr("font-size", "9px")
                        .attr("opacity", 0.9)
                        .text(labelText);
                });
            }

            // ── Scatter dots — coloured by freshness (newest = bright cyan) ──
            const tMin = d3.min(pts, (p) => p.t);
            const tMax = d3.max(pts, (p) => p.t);
            const tSpan = Math.max(tMax - tMin, 1);

            const colorNewest = "#00e5ff"; // bright cyan
            const colorOldest = "#0d2030"; // near-black dark blue
            const colorByAge = d3.interpolateRgb(colorOldest, colorNewest);

            pts.forEach((p) => {
                const freshness = (p.t - tMin) / tSpan; // 0 = oldest, 1 = newest
                const [sx, sy] = toSVG(p.x, p.y);
                svg.append("circle")
                    .attr("cx", sx)
                    .attr("cy", sy)
                    .attr("r", 2.5)
                    .attr("fill", colorByAge(freshness))
                    .attr("opacity", 0.15 + freshness * 0.85);
            });

            // ── Mean centre mark ───────────────────────────────────────────
            svg.append("circle")
                .attr("cx", cx)
                .attr("cy", cy)
                .attr("r", 4)
                .attr("fill", "none")
                .attr("stroke", "#ffffff")
                .attr("stroke-width", 1)
                .attr("opacity", 0.4);
            svg.append("circle")
                .attr("cx", cx)
                .attr("cy", cy)
                .attr("r", 1.5)
                .attr("fill", "#ffffff")
                .attr("opacity", 0.8);

            // ── σ accuracy labels (top-left and top-right) ────────────────
            const STAT_Y = PAD - 12;
            svg.append("text")
                .attr("x", PAD + 2)
                .attr("y", STAT_Y)
                .attr("dominant-baseline", "hanging")
                .attr("fill", "#d0d8e4")
                .attr("font-size", "11px")
                .attr("font-weight", "bold")
                .text(`1σ: ${sig1.toFixed(sig1 < 10 ? 1 : 0)}m`);

            svg.append("text")
                .attr("x", W - PAD - 2)
                .attr("y", STAT_Y)
                .attr("text-anchor", "end")
                .attr("dominant-baseline", "hanging")
                .attr("fill", "#d0d8e4")
                .attr("font-size", "11px")
                .attr("font-weight", "bold")
                .text(`2σ: ${sig2.toFixed(sig2 < 10 ? 1 : 0)}m`);

            // ── Bottom info: fix count + scale ─────────────────────────────
            const halfRangeStr = axisM < 1 ? axisM.toFixed(2) : axisM < 10 ? axisM.toFixed(1) : axisM.toFixed(0);

            svg.append("text")
                .attr("x", cx)
                .attr("y", H - 6)
                .attr("text-anchor", "middle")
                .attr("fill", "#2e4058")
                .attr("font-size", "9px")
                .text(`${fixes.length} fixes  ·  ±${halfRangeStr}m`);
        };

        let ro;
        onMounted(() => {
            scheduleDraw();
            ro = new ResizeObserver(scheduleDraw);
            if (containerRef.value) ro.observe(containerRef.value);
        });
        onUnmounted(() => {
            ro?.disconnect();
            if (rafId !== null) cancelAnimationFrame(rafId);
        });

        // Fires on every push/splice — watches the array length, not deep content.
        watch(() => props.fixes.length, scheduleDraw);

        return { svgRef, containerRef };
    },
});
</script>

<style scoped>
.gps-accuracy-plot {
    width: 100%;
    overflow: hidden;
}
</style>
