<template>
    <BaseTab tab-name="sensors">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabRawSensorData')"></div>
            <WikiButton docUrl="sensors" />

            <div class="note">
                <p v-html="$t('sensorsInfo')"></p>
            </div>
            <div class="gui_box">
                <div class="info">
                    <div class="checkboxes">
                        <input
                            type="checkbox"
                            v-model="checkboxes[0]"
                            :disabled="!hasGyro"
                            class="first"
                            @change="onCheckboxChange"
                        />
                        <span v-html="$t('sensorsGyroSelect')"></span>
                        <input
                            type="checkbox"
                            v-model="checkboxes[1]"
                            :disabled="!hasAccel"
                            @change="onCheckboxChange"
                        />
                        <span v-html="$t('sensorsAccelSelect')"></span>
                        <input type="checkbox" v-model="checkboxes[2]" :disabled="!hasMag" @change="onCheckboxChange" />
                        <span v-html="$t('sensorsMagSelect')"></span>
                        <input
                            type="checkbox"
                            v-model="checkboxes[3]"
                            :disabled="!hasAltitude"
                            @change="onCheckboxChange"
                        />
                        <span v-html="$t('sensorsAltitudeSelect')"></span>
                        <input
                            type="checkbox"
                            v-model="checkboxes[4]"
                            :disabled="!hasSonar"
                            @change="onCheckboxChange"
                        />
                        <span v-html="$t('sensorsSonarSelect')"></span>
                        <input type="checkbox" v-model="checkboxes[5]" @change="onCheckboxChange" />
                        <span v-html="$t('sensorsDebugSelect')"></span>
                    </div>
                </div>
            </div>

            <!-- Gyroscope -->
            <SensorGraph
                ref="gyroSvg"
                sensor-type="gyro"
                svg-id="gyro"
                :visible="checkboxes[0]"
                :title="$t('sensorsGyroTitle')"
                :rate="rates.gyro"
                @update:rate="updateRate('gyro', $event)"
                :scale="scales.gyro"
                @update:scale="updateScale('gyro', $event)"
                :scale-options="GYRO_SCALE_OPTIONS"
                :display-values="[gyroDisplay.x, gyroDisplay.y, gyroDisplay.z]"
            />

            <!-- Accelerometer -->
            <SensorGraph
                ref="accelSvg"
                sensor-type="accel"
                svg-id="accel"
                :visible="checkboxes[1]"
                :title="$t('sensorsAccelTitle')"
                :rate="rates.accel"
                @update:rate="updateRate('accel', $event)"
                :scale="scales.accel"
                @update:scale="updateScale('accel', $event)"
                :scale-options="ACCEL_SCALE_OPTIONS"
                :display-values="[accelDisplay.x, accelDisplay.y, accelDisplay.z]"
            />

            <!-- Magnetometer -->
            <SensorGraph
                ref="magSvg"
                sensor-type="mag"
                svg-id="mag"
                :visible="checkboxes[2]"
                :title="$t('sensorsMagTitle')"
                :rate="rates.mag"
                @update:rate="updateRate('mag', $event)"
                :scale="scales.mag"
                @update:scale="updateScale('mag', $event)"
                :scale-options="MAG_SCALE_OPTIONS"
                :display-values="[magDisplay.x, magDisplay.y, magDisplay.z]"
            />

            <!-- Altitude -->
            <SensorGraph
                ref="altitudeSvg"
                sensor-type="altitude"
                svg-id="altitude"
                :visible="checkboxes[3]"
                :title="$t('sensorsAltitudeTitle')"
                :hint="$t('sensorsAltitudeHint')"
                :rate="rates.altitude"
                @update:rate="updateRate('altitude', $event)"
                :display-values="[altitudeDisplay]"
            />

            <!-- Sonar -->
            <SensorGraph
                ref="sonarSvg"
                sensor-type="sonar"
                svg-id="sonar"
                :visible="checkboxes[4]"
                :title="$t('sensorsSonarTitle')"
                :rate="rates.sonar"
                @update:rate="updateRate('sonar', $event)"
                :display-values="[sonarDisplay]"
            />

            <!-- Debug -->
            <div class="wrapper debug" v-show="checkboxes[5]">
                <div class="gui_box grey">
                    <div class="graph-grid">
                        <SensorGraph
                            v-for="i in debugColumns"
                            :key="i"
                            :ref="
                                (el) => {
                                    if (el) debugSvgs[i - 1] = el;
                                }
                            "
                            sensor-type="debug"
                            :svg-id="`debug${i - 1}`"
                            :visible="true"
                            :title="debugTitles[i - 1]"
                            :show-refresh-rate="i === 1"
                            :rate="rates.debug"
                            @update:rate="updateRate('debug', $event)"
                            :display-values="[debugDisplay[i - 1]]"
                            :is-debug="true"
                        />
                    </div>
                </div>
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import { useDebugStore } from "@/stores/debug";
import { get as getConfig, set as setConfig } from "../../js/ConfigStorage";
import { have_sensor } from "../../js/sensor_helpers";
import { GYRO_SCALE_OPTIONS, ACCEL_SCALE_OPTIONS, MAG_SCALE_OPTIONS } from "./sensors/constants";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import SensorGraph from "./SensorGraph.vue";
import GUI from "../../js/gui";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import * as d3 from "d3";
import semver from "semver";
import { API_VERSION_1_46 } from "../../js/data_storage";

const fcStore = useFlightControllerStore();
const debugStore = useDebugStore();

// Sensor availability
const hasGyro = computed(() => {
    return fcStore.config.boardType === 0 || fcStore.config.boardType === 2;
});

const hasAccel = computed(() => {
    return (
        (fcStore.config.boardType === 0 || fcStore.config.boardType === 2) &&
        have_sensor(fcStore.config.activeSensors, "acc")
    );
});

const hasMag = computed(() => {
    return (
        (fcStore.config.boardType === 0 || fcStore.config.boardType === 2) &&
        have_sensor(fcStore.config.activeSensors, "mag")
    );
});

const hasAltitude = computed(() => {
    return (
        (fcStore.config.boardType === 0 || fcStore.config.boardType === 2) &&
        (have_sensor(fcStore.config.activeSensors, "baro") || have_sensor(fcStore.config.activeSensors, "gps"))
    );
});

const hasSonar = computed(() => {
    return (
        (fcStore.config.boardType === 0 || fcStore.config.boardType === 2) &&
        have_sensor(fcStore.config.activeSensors, "sonar")
    );
});

// Checkbox states
const checkboxes = ref([false, false, false, false, false, false]);

// Rates and scales
const rates = reactive({
    gyro: 50,
    accel: 50,
    mag: 50,
    altitude: 100,
    sonar: 100,
    debug: 500,
});

const scales = reactive({
    gyro: 2000,
    accel: 2,
    mag: 2000,
});

// Debug columns
const debugColumns = ref(4);

// Display values
const gyroDisplay = reactive({ x: "0", y: "0", z: "0" });
const accelDisplay = reactive({ x: "0", y: "0", z: "0" });
const magDisplay = reactive({ x: "0", y: "0", z: "0" });
const altitudeDisplay = ref("0");
const sonarDisplay = ref("0");
const debugDisplay = ref(Array(8).fill("0"));
const debugTitles = ref(
    Array(8)
        .fill("")
        .map((_, i) => `Debug ${i}`),
);

// SVG refs
const gyroSvg = ref(null);
const accelSvg = ref(null);
const magSvg = ref(null);
const altitudeSvg = ref(null);
const sonarSvg = ref(null);
const debugSvgs = ref([]);

// Graph data
let samples_gyro_i = 0;
let samples_accel_i = 0;
let samples_mag_i = 0;
let samples_altitude_i = 0;
let samples_sonar_i = 0;
let samples_debug_i = 0;

let gyro_data = [];
let accel_data = [];
let mag_data = [];
let altitude_data = [];
let sonar_data = [];
let debug_data = [];

let gyroHelpers = null;
let accelHelpers = null;
let magHelpers = null;
let altitudeHelpers = null;
let sonarHelpers = null;
let debugHelpers = [];

const margin = { top: 20, right: 10, bottom: 10, left: 40 };

function initSensorData() {
    for (let i = 0; i < 3; i++) {
        fcStore.sensorData.accelerometer[i] = 0;
        fcStore.sensorData.gyroscope[i] = 0;
        fcStore.sensorData.magnetometer[i] = 0;
        fcStore.sensorData.sonar = 0;
        fcStore.sensorData.altitude = 0;
    }

    for (let i = 0; i < debugColumns.value; i++) {
        fcStore.sensorData.debug[i] = 0;
    }
}

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

function updateGraphHelperSize(helpers) {
    const element = d3.select(helpers.selector);
    const node = element.node();
    if (!node) return;

    const rect = node.getBoundingClientRect();
    helpers.width = rect.width - margin.left - margin.right;
    helpers.height = rect.height - margin.top - margin.bottom;

    helpers.widthScale.range([0, helpers.width]);
    helpers.heightScale.range([helpers.height, 0]);

    helpers.xGrid.tickSize(-helpers.height, 0, 0);
    helpers.yGrid.tickSize(-helpers.width, 0, 0);
}

function initGraphHelpers(selector, sampleNumber, heightDomain) {
    const helpers = {
        selector: selector,
        dynamicHeightDomain: !heightDomain,
    };

    helpers.widthScale = d3
        .scaleLinear()
        .clamp(true)
        .domain([sampleNumber - 299, sampleNumber]);

    helpers.heightScale = d3
        .scaleLinear()
        .clamp(true)
        .domain(heightDomain || [1, -1]);

    helpers.xGrid = d3.axisBottom();
    helpers.yGrid = d3.axisLeft();

    helpers.width = 0;
    helpers.height = 0;

    helpers.xGrid.scale(helpers.widthScale).ticks(5).tickFormat("");
    helpers.yGrid.scale(helpers.heightScale).ticks(5).tickFormat("");

    helpers.xAxis = d3
        .axisBottom()
        .scale(helpers.widthScale)
        .ticks(5)
        .tickFormat((d) => d);

    helpers.yAxis = d3
        .axisLeft()
        .scale(helpers.heightScale)
        .ticks(5)
        .tickFormat((d) => d);

    helpers.line = d3
        .line()
        .x((d) => helpers.widthScale(d[0]))
        .y((d) => helpers.heightScale(d[1]));

    return helpers;
}

function drawGraph(graphHelpers, data, sampleNumber) {
    const svg = d3.select(graphHelpers.selector);
    if (!svg.node()) return;

    if (graphHelpers.dynamicHeightDomain) {
        const limits = [];
        data.forEach((datum) => {
            limits.push(datum.min);
            limits.push(datum.max);
        });
        graphHelpers.heightScale.domain(d3.extent(limits));
    }
    graphHelpers.widthScale.domain([sampleNumber - 299, sampleNumber]);

    svg.select(".x.grid").call(graphHelpers.xGrid);
    svg.select(".y.grid").call(graphHelpers.yGrid);
    svg.select(".x.axis").call(graphHelpers.xAxis);
    svg.select(".y.axis").call(graphHelpers.yAxis);

    const group = svg.select("g.data");
    const lines = group.selectAll("path").data(data, (d, i) => i);
    lines.enter().append("path").attr("class", "line");
    lines.attr("d", graphHelpers.line);
}

function displayDebugColumnNames() {
    const debugModeName = debugStore.modes[fcStore.pidAdvancedConfig.debugMode];
    const debugFields = debugStore.fieldNames[debugModeName];

    for (let i = 0; i < debugColumns.value; i++) {
        let msg = `Debug ${i} unknown`;
        if (debugFields) {
            msg = debugFields[`debug[${i}]`] ?? `Debug ${i} not used`;
        }

        debugTitles.value[i] = msg;
        debugDisplay.value[i] = "0";
    }
}

function initializeTimers() {
    GUI.interval_kill_all(["status_pull"]);

    const fastest = Math.max(rates.gyro, rates.accel, rates.mag);

    // IMU data (gyro, accel, mag)
    if (checkboxes.value[0] || checkboxes.value[1] || checkboxes.value[2]) {
        GUI.interval_add(
            "IMU_pull",
            () => {
                MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, update_imu_graphs);
            },
            fastest,
            true,
        );
    }

    // Altitude
    if (checkboxes.value[3]) {
        GUI.interval_add(
            "altitude_pull",
            () => {
                MSP.send_message(MSPCodes.MSP_ALTITUDE, false, false, update_altitude_graph);
            },
            rates.altitude,
            true,
        );
    }

    // Sonar
    if (checkboxes.value[4]) {
        GUI.interval_add(
            "sonar_pull",
            () => {
                MSP.send_message(MSPCodes.MSP_SONAR, false, false, update_sonar_graphs);
            },
            rates.sonar,
            true,
        );
    }

    // Debug
    if (checkboxes.value[5]) {
        GUI.interval_add(
            "debug_pull",
            () => {
                MSP.send_message(MSPCodes.MSP_DEBUG, false, false, update_debug_graphs);
            },
            rates.debug,
            true,
        );
    }
}

function update_imu_graphs() {
    if (checkboxes.value[0] && gyroHelpers) {
        updateGraphHelperSize(gyroHelpers);
        samples_gyro_i = addSampleToData(gyro_data, samples_gyro_i, fcStore.sensorData.gyroscope);
        drawGraph(gyroHelpers, gyro_data, samples_gyro_i);
        gyroDisplay.x = fcStore.sensorData.gyroscope[0].toFixed(2);
        gyroDisplay.y = fcStore.sensorData.gyroscope[1].toFixed(2);
        gyroDisplay.z = fcStore.sensorData.gyroscope[2].toFixed(2);
    }

    if (checkboxes.value[1] && accelHelpers) {
        updateGraphHelperSize(accelHelpers);
        samples_accel_i = addSampleToData(accel_data, samples_accel_i, fcStore.sensorData.accelerometer);
        drawGraph(accelHelpers, accel_data, samples_accel_i);

        const x = fcStore.sensorData.accelerometer[0].toFixed(2);
        const y = fcStore.sensorData.accelerometer[1].toFixed(2);
        const z = fcStore.sensorData.accelerometer[2].toFixed(2);
        const pi = Math.PI;
        const rollACC = Math.round(Math.atan(y / (Math.sqrt(Math.pow(x, 2)) + Math.pow(z, 2))) * (180 / pi));
        const pitchACC = Math.round(Math.atan(x / (Math.sqrt(Math.pow(y, 2)) + Math.pow(z, 2))) * (180 / pi));
        accelDisplay.x = `${x} (${rollACC})`;
        accelDisplay.y = `${y} (${pitchACC})`;
        accelDisplay.z = `${z}`;
    }

    if (checkboxes.value[2] && magHelpers) {
        updateGraphHelperSize(magHelpers);
        samples_mag_i = addSampleToData(mag_data, samples_mag_i, fcStore.sensorData.magnetometer);
        drawGraph(magHelpers, mag_data, samples_mag_i);
        magDisplay.x = fcStore.sensorData.magnetometer[0].toFixed(0);
        magDisplay.y = fcStore.sensorData.magnetometer[1].toFixed(0);
        magDisplay.z = fcStore.sensorData.magnetometer[2].toFixed(0);
    }
}

function update_altitude_graph() {
    if (!altitudeHelpers) return;
    updateGraphHelperSize(altitudeHelpers);
    samples_altitude_i = addSampleToData(altitude_data, samples_altitude_i, [fcStore.sensorData.altitude]);
    drawGraph(altitudeHelpers, altitude_data, samples_altitude_i);
    altitudeDisplay.value = fcStore.sensorData.altitude.toFixed(2);
}

function update_sonar_graphs() {
    if (!sonarHelpers) return;
    updateGraphHelperSize(sonarHelpers);
    samples_sonar_i = addSampleToData(sonar_data, samples_sonar_i, [fcStore.sensorData.sonar]);
    drawGraph(sonarHelpers, sonar_data, samples_sonar_i);
    sonarDisplay.value = fcStore.sensorData.sonar.toFixed(2);
}

function update_debug_graphs() {
    for (let i = 0; i < debugColumns.value; i++) {
        if (!debugHelpers[i]) continue;
        updateGraphHelperSize(debugHelpers[i]);
        addSampleToData(debug_data[i], samples_debug_i, [fcStore.sensorData.debug[i]]);
        drawGraph(debugHelpers[i], debug_data[i], samples_debug_i);
        debugDisplay.value[i] = fcStore.sensorData.debug[i].toString();
    }
    samples_debug_i++;
}

function onCheckboxChange() {
    setConfig({ graphs_enabled: [...checkboxes.value] });
    initializeTimers();
}

function updateRate(sensor, value) {
    rates[sensor] = value;
    onRateScaleChange();
}

function updateScale(sensor, value) {
    scales[sensor] = value;
    onRateScaleChange();
}

function onRateScaleChange() {
    setConfig({
        sensor_settings: {
            rates: { ...rates },
            scales: { ...scales },
        },
    });

    // Re-initialize graph helpers with new scales
    gyroHelpers = initGraphHelpers("#gyro", samples_gyro_i, [-scales.gyro, scales.gyro]);
    accelHelpers = initGraphHelpers("#accel", samples_accel_i, [-scales.accel, scales.accel]);
    magHelpers = initGraphHelpers("#mag", samples_mag_i, [-scales.mag, scales.mag]);

    initializeTimers();
}

onMounted(async () => {
    // Initialize sensor data
    initSensorData();

    // Determine debug columns based on API version
    if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
        debugColumns.value = 8;
        await MSP.send_message(MSPCodes.MSP_ADVANCED_CONFIG, false, false, displayDebugColumnNames);
    } else {
        debugColumns.value = 4;
    }

    // Initialize data arrays
    gyro_data = initDataArray(3);
    accel_data = initDataArray(3);
    mag_data = initDataArray(3);
    altitude_data = initDataArray(1);
    sonar_data = initDataArray(1);
    debug_data = [];
    for (let i = 0; i < debugColumns.value; i++) {
        debug_data.push(initDataArray(1));
    }

    // Load saved settings
    const result = getConfig("sensor_settings");
    if (result.sensor_settings) {
        rates.gyro = result.sensor_settings.rates.gyro;
        rates.accel = result.sensor_settings.rates.accel;
        rates.mag = result.sensor_settings.rates.mag;
        rates.altitude = result.sensor_settings.rates.altitude;
        rates.sonar = result.sensor_settings.rates.sonar;
        rates.debug = result.sensor_settings.rates.debug;

        scales.gyro = result.sensor_settings.scales.gyro;
        scales.accel = result.sensor_settings.scales.accel;
        scales.mag = result.sensor_settings.scales.mag;
    }

    // Load saved checkbox states
    const resultGraphs = getConfig("graphs_enabled");
    if (resultGraphs.graphs_enabled) {
        for (let i = 0; i < resultGraphs.graphs_enabled.length; i++) {
            checkboxes.value[i] = resultGraphs.graphs_enabled[i];
        }
    } else {
        // Default: enable first 4 graphs if sensors are available
        if (hasGyro.value) checkboxes.value[0] = true;
        if (hasAccel.value) checkboxes.value[1] = true;
        if (hasMag.value) checkboxes.value[2] = true;
        if (hasAltitude.value) checkboxes.value[3] = true;
    }

    // Initialize graph helpers - wait for next tick to ensure refs are set
    await nextTick();

    gyroHelpers = initGraphHelpers("#gyro", samples_gyro_i, [-scales.gyro, scales.gyro]);
    accelHelpers = initGraphHelpers("#accel", samples_accel_i, [-scales.accel, scales.accel]);
    magHelpers = initGraphHelpers("#mag", samples_mag_i, [-scales.mag, scales.mag]);
    altitudeHelpers = initGraphHelpers("#altitude", samples_altitude_i);
    sonarHelpers = initGraphHelpers("#sonar", samples_sonar_i);

    debugHelpers = [];

    for (let i = 0; i < debugColumns.value; i++) {
        debugHelpers.push(initGraphHelpers(`#debug${i}`, samples_debug_i));
    }

    // Start polling
    initializeTimers();

    // Status polling
    GUI.interval_add(
        "status_pull",
        () => {
            MSP.send_message(MSPCodes.MSP_STATUS);
        },
        250,
        true,
    );
});

onBeforeUnmount(() => {
    GUI.interval_kill_all(["status_pull", "IMU_pull", "altitude_pull", "sonar_pull", "debug_pull"]);
});
</script>

<style scoped>
.info {
    margin-bottom: 10px;
    margin-top: 8px;
    margin-left: 10px;
}

.info input {
    vertical-align: middle;
    margin: 0 5px 0 15px;
    width: 18px;
    height: 18px;
}

.debug .graph-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    width: 100%;
}
</style>
