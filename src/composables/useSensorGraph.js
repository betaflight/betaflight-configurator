import { ref } from "vue";
import * as d3 from "d3";

export function useSensorGraph() {
    const margin = { top: 20, right: 10, bottom: 10, left: 40 };

    // Data arrays
    const gyro_data = ref([]);
    const accel_data = ref([]);
    const mag_data = ref([]);
    const altitude_data = ref([]);
    const sonar_data = ref([]);
    const debug_data = ref([]);

    // Sample counters and dirty flags
    let samples_gyro_i = 0;
    let samples_accel_i = 0;
    let samples_mag_i = 0;
    let samples_altitude_i = 0;
    let samples_sonar_i = 0;
    let samples_debug_i = 0;
    let dirty_gyro = false;
    let dirty_accel = false;
    let dirty_mag = false;
    let dirty_altitude = false;
    let dirty_sonar = false;
    let dirty_debug = false;

    // Graph helpers storage
    let gyroHelpers = null;
    let accelHelpers = null;
    let magHelpers = null;
    let altitudeHelpers = null;
    let sonarHelpers = null;
    let debugHelpers = [];

    function initDataArray(length) {
        const data = new Array(length);
        for (let i = 0; i < length; i++) {
            data[i] = [];
            data[i].min = -1;
            data[i].max = 1;
        }
        return data;
    }

    function addSampleToData(data, sampleNumber, sensorData) {
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

    function measureGraphSize(helpers) {
        const node = d3.select(helpers.selector).node();
        if (!node) {
            return;
        }
        const rect = node.getBoundingClientRect();
        helpers.width = Math.max(0, rect.width - margin.left - margin.right);
        helpers.height = Math.max(0, rect.height - margin.top - margin.bottom);
    }

    function updateGraphHelperSize(helpers) {
        measureGraphSize(helpers);

        // Always initialize scales to prevent undefined errors
        helpers.scaleX = d3.scaleLinear().domain([0, 300]).range([0, helpers.width]);
        helpers.scaleY = d3.scaleLinear().range([helpers.height, 0]);

        helpers.clipId = `${helpers.selector.replace("#", "")}_clip`;

        // Only create clipPath rect if dimensions are valid
        if (helpers.width > 0 && helpers.height > 0) {
            const element = d3.select(helpers.selector);
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

    function initGraph(selector, sampleCount, heightRef, dataRef) {
        const helpers = {
            selector,
            data: dataRef,
            scaleYMax: heightRef,
        };
        updateGraphHelperSize(helpers);
        const element = d3.select(helpers.selector);
        element.selectAll("defs").data([0]).join("defs");
        const xAxis = d3
            .axisBottom()
            .scale(helpers.scaleX)
            .tickFormat((d) => d);
        const yAxis = d3
            .axisLeft()
            .scale(helpers.scaleY)
            .tickFormat((d) => d);
        const xGrid = d3.axisBottom().scale(helpers.scaleX).tickFormat("").tickSize(-helpers.height, 0, 0);
        const yGrid = d3.axisLeft().scale(helpers.scaleY).tickFormat("").tickSize(-helpers.width, 0, 0);
        element.select(".grid.x").call(xGrid).selectAll("line").attr("clip-path", `url(#${helpers.clipId})`);
        element.select(".grid.y").call(yGrid).selectAll("line").attr("clip-path", `url(#${helpers.clipId})`);
        element.select(".axis.x").call(xAxis);
        element.select(".axis.y").call(yAxis);
        const line = d3
            .line()
            .x((d) => helpers.scaleX(d[0]))
            .y((d) => helpers.scaleY(d[1]));
        element
            .select(".data")
            .selectAll(".line")
            .data(helpers.data)
            .join("path")
            .attr("class", "line")
            .attr("clip-path", `url(#${helpers.clipId})`)
            .attr("d", line);
        return helpers;
    }

    function drawGraph(helpers, sampleNumber) {
        // Skip if dimensions are not yet available (e.g. SVG not laid out)
        if (!helpers.width || !helpers.height) {
            return;
        }

        // Update scales with current dimensions
        helpers.scaleX.domain([sampleNumber - 299, sampleNumber]).range([0, helpers.width]);
        helpers.scaleY.domain([-helpers.scaleYMax.value, helpers.scaleYMax.value]).range([helpers.height, 0]);

        const element = d3.select(helpers.selector);

        const xAxis = d3
            .axisBottom()
            .scale(helpers.scaleX)
            .ticks(5)
            .tickFormat((d) => d);

        const yAxis = d3
            .axisLeft()
            .scale(helpers.scaleY)
            .ticks(5)
            .tickFormat((d) => d);

        const xGrid = d3.axisBottom().scale(helpers.scaleX).ticks(5).tickFormat("").tickSize(-helpers.height, 0, 0);

        const yGrid = d3.axisLeft().scale(helpers.scaleY).ticks(5).tickFormat("").tickSize(-helpers.width, 0, 0);

        element.select(".grid.x").call(xGrid);
        element.select(".grid.y").call(yGrid);
        element.select(".axis.x").call(xAxis);
        element.select(".axis.y").call(yAxis);

        const line = d3
            .line()
            .x((d) => helpers.scaleX(d[0]))
            .y((d) => helpers.scaleY(d[1]));

        element.select(".data").selectAll(".line").attr("d", line);
    }

    function initializeGraphs(refs, debugColumns) {
        gyro_data.value = initDataArray(3);
        accel_data.value = initDataArray(3);
        mag_data.value = initDataArray(3);
        altitude_data.value = initDataArray(1);
        sonar_data.value = initDataArray(1);

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

        debugHelpers = [];
        for (let i = 0; i < debugColumns; i++) {
            debugHelpers.push(initGraph(`#debug${i}`, 1, ref(500), debug_data.value[i]));
        }
    }

    function updateScales(scales) {
        if (gyroHelpers) {
            gyroHelpers.scaleYMax.value = scales.gyro;
        }
        if (accelHelpers) {
            accelHelpers.scaleYMax.value = scales.accel;
        }
        if (magHelpers) {
            magHelpers.scaleYMax.value = scales.mag;
        }
    }

    function updateGraphs() {
        if (gyroHelpers && dirty_gyro) {
            drawGraph(gyroHelpers, samples_gyro_i);
            dirty_gyro = false;
        }
        if (accelHelpers && dirty_accel) {
            drawGraph(accelHelpers, samples_accel_i);
            dirty_accel = false;
        }
        if (magHelpers && dirty_mag) {
            drawGraph(magHelpers, samples_mag_i);
            dirty_mag = false;
        }
        if (altitudeHelpers && dirty_altitude) {
            drawGraph(altitudeHelpers, samples_altitude_i);
            dirty_altitude = false;
        }
        if (sonarHelpers && dirty_sonar) {
            drawGraph(sonarHelpers, samples_sonar_i);
            dirty_sonar = false;
        }
        if (dirty_debug) {
            debugHelpers.forEach((helper) => drawGraph(helper, samples_debug_i));
            dirty_debug = false;
        }
    }

    function addGyroSample(data) {
        samples_gyro_i = addSampleToData(gyro_data.value, samples_gyro_i, data);
        dirty_gyro = true;
    }

    function addAccelSample(data) {
        samples_accel_i = addSampleToData(accel_data.value, samples_accel_i, data);
        dirty_accel = true;
    }

    function addMagSample(data) {
        samples_mag_i = addSampleToData(mag_data.value, samples_mag_i, data);
        dirty_mag = true;
    }

    function addAltitudeSample(data) {
        samples_altitude_i = addSampleToData(altitude_data.value, samples_altitude_i, data);
        dirty_altitude = true;
    }

    function addSonarSample(data) {
        samples_sonar_i = addSampleToData(sonar_data.value, samples_sonar_i, data);
        dirty_sonar = true;
    }

    function addDebugSample(index, data) {
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
        debug_data,
        initializeGraphs,
        updateScales,
        updateGraphs,
        addGyroSample,
        addAccelSample,
        addMagSample,
        addAltitudeSample,
        addSonarSample,
        addDebugSample,
        incrementDebugCounter,
    };
}
