/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { ref, type Ref } from "vue";
import * as d3 from "d3";
import type { SensorScales } from "@/stores/sensors";

/** A sample: [sample number, value]. */
type Point = [number, number];

/** One plotted line: its recent samples, plus the extremes seen so far for auto-scaling. */
export type Series = Point[] & { min: number; max: number };

interface GraphHelpers {
    selector: string;
    data: Series[];
    scaleYMax: Ref<number>;
    // When dynamic, the Y-axis follows the data range instead of the
    // fixed symmetric [-scaleYMax, scaleYMax] domain.
    dynamic: boolean;
    // NaN until the SVG has been measured, so the first measurement always counts as a change.
    width: number;
    height: number;
    scaleX: d3.ScaleLinear<number, number>;
    scaleY: d3.ScaleLinear<number, number>;
    clipId: string;
}

export function useSensorGraph() {
    // `bottom` is the gutter that holds the x-axis tick labels, `top` the gap above
    // the plot.  The axis groups are positioned from these values at draw time
    // (see applyGraphTransforms) — never hardcode them in the SVG template, or the
    // horizontal scale drifts off the bottom of the plot when the SVG is resized.
    const margin = { top: 10, right: 10, bottom: 20, left: 40 };

    // Data arrays
    const gyro_data = ref<Series[]>([]);
    const accel_data = ref<Series[]>([]);
    const mag_data = ref<Series[]>([]);
    const altitude_data = ref<Series[]>([]);
    const sonar_data = ref<Series[]>([]);
    const pitot_data = ref<Series[]>([]);
    const debug_data = ref<Series[][]>([]);

    // Sample counters and dirty flags
    let samples_gyro_i = 0;
    let samples_accel_i = 0;
    let samples_mag_i = 0;
    let samples_altitude_i = 0;
    let samples_sonar_i = 0;
    let samples_pitot_i = 0;
    let samples_debug_i = 0;
    let dirty_gyro = false;
    let dirty_accel = false;
    let dirty_mag = false;
    let dirty_altitude = false;
    let dirty_sonar = false;
    let dirty_pitot = false;
    let dirty_debug = false;

    // Graph helpers storage
    let gyroHelpers: GraphHelpers | null = null;
    let accelHelpers: GraphHelpers | null = null;
    let magHelpers: GraphHelpers | null = null;
    let altitudeHelpers: GraphHelpers | null = null;
    let sonarHelpers: GraphHelpers | null = null;
    let pitotHelpers: GraphHelpers | null = null;
    let debugHelpers: GraphHelpers[] = [];

    function initDataArray(length: number): Series[] {
        const data: Series[] = new Array(length);
        for (let i = 0; i < length; i++) {
            data[i] = Object.assign([], { min: -1, max: 1 });
        }
        return data;
    }

    function addSampleToData(data: Series[], sampleNumber: number, sensorData: number[]): number {
        for (let i = 0; i < data.length; i++) {
            const dataPoint = sensorData[i];
            data[i].push([sampleNumber, dataPoint]);
            if (dataPoint < data[i].min) {
                data[i].min = dataPoint;
            }
            if (dataPoint > data[i].max) {
                data[i].max = dataPoint;
            }
        }
        while (data[0].length > 300) {
            for (let i = 0; i < data.length; i++) {
                data[i].shift();
            }
        }
        return sampleNumber + 1;
    }

    function selectGraph(helpers: GraphHelpers) {
        return d3.select<SVGSVGElement, unknown>(helpers.selector);
    }

    // Returns true when the measured plot area changed, so callers can skip the
    // expensive scale/clip-path rebuild while the SVG keeps its size.
    function measureGraphSize(helpers: GraphHelpers): boolean {
        const node = selectGraph(helpers).node();
        if (!node) {
            return false;
        }
        const rect = node.getBoundingClientRect();
        const width = Math.max(0, rect.width - margin.left - margin.right);
        const height = Math.max(0, rect.height - margin.top - margin.bottom);
        if (width === helpers.width && height === helpers.height) {
            return false;
        }
        helpers.width = width;
        helpers.height = height;
        return true;
    }

    // Place the axis, grid and data groups for the measured plot area: the y groups
    // at the top-left corner of the plot, the x groups on its baseline so the
    // horizontal scale always sits directly below the vertical one.
    function applyGraphTransforms(helpers: GraphHelpers) {
        const element = selectGraph(helpers);
        const topLeft = `translate(${margin.left}, ${margin.top})`;
        const baseline = `translate(${margin.left}, ${margin.top + helpers.height})`;

        element.select(".grid.y").attr("transform", topLeft);
        element.select(".axis.y").attr("transform", topLeft);
        element.select(".data").attr("transform", topLeft);
        element.select(".grid.x").attr("transform", baseline);
        element.select(".axis.x").attr("transform", baseline);
    }

    function updateGraphHelperSize(helpers: GraphHelpers) {
        measureGraphSize(helpers);
        applyGraphTransforms(helpers);

        // Always initialize scales to prevent undefined errors
        helpers.scaleX = d3.scaleLinear().domain([0, 300]).range([0, helpers.width]);
        helpers.scaleY = d3.scaleLinear().range([helpers.height, 0]);

        helpers.clipId = `${helpers.selector.replace("#", "")}_clip`;

        // Only create clipPath rect if dimensions are valid
        if (helpers.width > 0 && helpers.height > 0) {
            const element = selectGraph(helpers);
            element
                .selectAll("defs")
                .data([0])
                .join("defs")
                .selectAll(`#${helpers.clipId}`)
                .data([0])
                .join("clipPath")
                .attr("id", helpers.clipId)
                .selectAll("rect")
                .data([0])
                .join("rect")
                .attr("width", helpers.width)
                .attr("height", helpers.height);
        }
    }

    function lineFor(helpers: GraphHelpers) {
        return d3
            .line<Point>()
            .x((d) => helpers.scaleX(d[0]))
            .y((d) => helpers.scaleY(d[1]));
    }

    function initGraph(
        selector: string,
        sampleCount: number,
        heightRef: Ref<number>,
        dataRef: Series[],
        dynamic = false,
    ): GraphHelpers {
        const helpers: GraphHelpers = {
            selector,
            data: dataRef,
            scaleYMax: heightRef,
            dynamic,
            width: Number.NaN,
            height: Number.NaN,
            // Placeholders; updateGraphHelperSize builds the real ones from the measured size.
            scaleX: d3.scaleLinear(),
            scaleY: d3.scaleLinear(),
            clipId: "",
        };
        updateGraphHelperSize(helpers);
        const element = selectGraph(helpers);
        element.selectAll("defs").data([0]).join("defs");
        const xAxis = d3.axisBottom(helpers.scaleX).tickFormat((d) => String(d));
        const yAxis = d3.axisLeft(helpers.scaleY).tickFormat((d) => String(d));
        const xGrid = d3
            .axisBottom(helpers.scaleX)
            .tickFormat(() => "")
            .tickSize(-helpers.height);
        const yGrid = d3
            .axisLeft(helpers.scaleY)
            .tickFormat(() => "")
            .tickSize(-helpers.width);
        element
            .select<SVGGElement>(".grid.x")
            .call(xGrid)
            .selectAll("line")
            .attr("clip-path", `url(#${helpers.clipId})`);
        element
            .select<SVGGElement>(".grid.y")
            .call(yGrid)
            .selectAll("line")
            .attr("clip-path", `url(#${helpers.clipId})`);
        element.select<SVGGElement>(".axis.x").call(xAxis);
        element.select<SVGGElement>(".axis.y").call(yAxis);
        element
            .select(".data")
            .selectAll<SVGPathElement, Series>(".line")
            .data(helpers.data)
            .join("path")
            .attr("class", "line")
            .attr("clip-path", `url(#${helpers.clipId})`)
            .attr("d", lineFor(helpers));
        return helpers;
    }

    function drawGraph(helpers: GraphHelpers, sampleNumber: number): boolean | undefined {
        // Re-measure every frame: the SVG may have been hidden via v-show when the
        // graph was created, and it stretches with the window.  updateGraphHelperSize
        // only rebuilds the scales and clip path when the size actually changed.
        if (measureGraphSize(helpers) || !helpers.width || !helpers.height) {
            updateGraphHelperSize(helpers);
            if (!helpers.width || !helpers.height) {
                return false;
            }
        }

        // Update scales with current dimensions
        helpers.scaleX.domain([sampleNumber - 299, sampleNumber]).range([0, helpers.width]);
        if (helpers.dynamic) {
            // Follow the data range (matches 2025.12-maintenance debug graphs).
            const limits: number[] = [];
            for (const series of helpers.data) {
                limits.push(series.min, series.max);
            }
            const [min, max] = d3.extent(limits);
            helpers.scaleY.domain([min ?? -1, max ?? 1]).range([helpers.height, 0]);
        } else {
            helpers.scaleY.domain([-helpers.scaleYMax.value, helpers.scaleYMax.value]).range([helpers.height, 0]);
        }

        const element = selectGraph(helpers);

        const xAxis = d3
            .axisBottom(helpers.scaleX)
            .ticks(5)
            .tickFormat((d) => String(d));

        const yAxis = d3
            .axisLeft(helpers.scaleY)
            .ticks(5)
            .tickFormat((d) => String(d));

        const xGrid = d3
            .axisBottom(helpers.scaleX)
            .ticks(5)
            .tickFormat(() => "")
            .tickSize(-helpers.height);

        const yGrid = d3
            .axisLeft(helpers.scaleY)
            .ticks(5)
            .tickFormat(() => "")
            .tickSize(-helpers.width);

        element.select<SVGGElement>(".grid.x").call(xGrid);
        element.select<SVGGElement>(".grid.y").call(yGrid);
        element.select<SVGGElement>(".axis.x").call(xAxis);
        element.select<SVGGElement>(".axis.y").call(yAxis);

        element.select(".data").selectAll<SVGPathElement, Series>(".line").attr("d", lineFor(helpers));
    }

    // The first argument is unused; callers still pass one.
    function initializeGraphs(_refs: unknown, debugColumns: number) {
        gyro_data.value = initDataArray(3);
        accel_data.value = initDataArray(3);
        mag_data.value = initDataArray(3);
        altitude_data.value = initDataArray(1);
        sonar_data.value = initDataArray(1);
        pitot_data.value = initDataArray(1);

        // Initialize debug data - array of data arrays
        debug_data.value = [];
        for (let i = 0; i < debugColumns; i++) {
            debug_data.value.push(initDataArray(1));
        }

        gyroHelpers = initGraph("#gyro", 3, ref(2000), gyro_data.value);
        accelHelpers = initGraph("#accel", 3, ref(2), accel_data.value);
        magHelpers = initGraph("#mag", 3, ref(2000), mag_data.value);
        altitudeHelpers = initGraph("#altitude", 1, ref(5), altitude_data.value);
        sonarHelpers = initGraph("#sonar", 1, ref(400), sonar_data.value);
        pitotHelpers = initGraph("#pitot", 1, ref(10), pitot_data.value);

        debugHelpers = [];
        for (let i = 0; i < debugColumns; i++) {
            // Default to dynamic (Auto) scaling, restoring the legacy behaviour.
            debugHelpers.push(initGraph(`#debug${i}`, 1, ref(500), debug_data.value[i], true));
        }
    }

    function updateScales(scales: SensorScales) {
        if (gyroHelpers) {
            gyroHelpers.scaleYMax.value = scales.gyro;
        }
        if (accelHelpers) {
            accelHelpers.scaleYMax.value = scales.accel;
        }
        if (magHelpers) {
            magHelpers.scaleYMax.value = scales.mag;
        }
        if (pitotHelpers) {
            pitotHelpers.scaleYMax.value = scales.pitot;
        }
    }

    /** @param debugScales one per debug column; 0 (or missing) means Auto. */
    function setDebugScales(debugScales: number[] | null | undefined) {
        for (let i = 0; i < debugHelpers.length; i++) {
            const helper = debugHelpers[i];
            const scale = debugScales?.[i] ?? 0;
            if (scale > 0) {
                helper.dynamic = false;
                helper.scaleYMax.value = scale;
            } else {
                helper.dynamic = true;
            }
        }
    }

    function drawIfDirty(helpers: GraphHelpers | null, sampleIndex: number): boolean {
        if (!helpers) {
            return false;
        }
        return drawGraph(helpers, sampleIndex) !== false;
    }

    function updateGraphs() {
        if (dirty_gyro && drawIfDirty(gyroHelpers, samples_gyro_i)) {
            dirty_gyro = false;
        }
        if (dirty_accel && drawIfDirty(accelHelpers, samples_accel_i)) {
            dirty_accel = false;
        }
        if (dirty_mag && drawIfDirty(magHelpers, samples_mag_i)) {
            dirty_mag = false;
        }
        if (dirty_altitude && drawIfDirty(altitudeHelpers, samples_altitude_i)) {
            dirty_altitude = false;
        }
        if (dirty_sonar && drawIfDirty(sonarHelpers, samples_sonar_i)) {
            dirty_sonar = false;
        }
        if (dirty_pitot && drawIfDirty(pitotHelpers, samples_pitot_i)) {
            dirty_pitot = false;
        }
        if (dirty_debug) {
            for (const helper of debugHelpers) {
                drawGraph(helper, samples_debug_i);
            }
            dirty_debug = false;
        }
    }

    function addGyroSample(data: number[]) {
        samples_gyro_i = addSampleToData(gyro_data.value, samples_gyro_i, data);
        dirty_gyro = true;
    }

    function addAccelSample(data: number[]) {
        samples_accel_i = addSampleToData(accel_data.value, samples_accel_i, data);
        dirty_accel = true;
    }

    function addMagSample(data: number[]) {
        samples_mag_i = addSampleToData(mag_data.value, samples_mag_i, data);
        dirty_mag = true;
    }

    function addAltitudeSample(data: number[]) {
        samples_altitude_i = addSampleToData(altitude_data.value, samples_altitude_i, data);
        dirty_altitude = true;
    }

    function addSonarSample(data: number[]) {
        samples_sonar_i = addSampleToData(sonar_data.value, samples_sonar_i, data);
        dirty_sonar = true;
    }

    function addPitotSample(data: number[]) {
        samples_pitot_i = addSampleToData(pitot_data.value, samples_pitot_i, data);
        dirty_pitot = true;
    }

    function addDebugSample(index: number, data: number[]) {
        if (!debug_data.value[index]) {
            return;
        }
        // Don't increment counter here - will be done once after all columns are updated
        addSampleToData(debug_data.value[index], samples_debug_i, data);
        dirty_debug = true;
    }

    function incrementDebugCounter() {
        samples_debug_i++;
    }

    return {
        gyro_data,
        accel_data,
        mag_data,
        altitude_data,
        sonar_data,
        pitot_data,
        debug_data,
        initializeGraphs,
        updateScales,
        setDebugScales,
        updateGraphs,
        addGyroSample,
        addAccelSample,
        addMagSample,
        addAltitudeSample,
        addSonarSample,
        addPitotSample,
        addDebugSample,
        incrementDebugCounter,
    };
}
