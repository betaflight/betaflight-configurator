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
                        <label>
                            <input
                                type="checkbox"
                                v-model="checkboxes[0]"
                                :disabled="!hasGyro"
                                class="first"
                                @change="onCheckboxChange"
                            />
                            <span v-html="$t('sensorsGyroSelect')"></span>
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                v-model="checkboxes[1]"
                                :disabled="!hasAccel"
                                @change="onCheckboxChange"
                            />
                            <span v-html="$t('sensorsAccelSelect')"></span>
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                v-model="checkboxes[2]"
                                :disabled="!hasMag"
                                @change="onCheckboxChange"
                            />
                            <span v-html="$t('sensorsMagSelect')"></span>
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                v-model="checkboxes[3]"
                                :disabled="!hasAltitude"
                                @change="onCheckboxChange"
                            />
                            <span v-html="$t('sensorsAltitudeSelect')"></span>
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                v-model="checkboxes[4]"
                                :disabled="!hasSonar"
                                @change="onCheckboxChange"
                            />
                            <span v-html="$t('sensorsSonarSelect')"></span>
                        </label>
                        <label>
                            <input type="checkbox" v-model="checkboxes[5]" @change="onCheckboxChange" />
                            <span v-html="$t('sensorsDebugSelect')"></span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- Gyroscope -->
            <div class="wrapper gyro" v-show="checkboxes[0]">
                <div class="gui_box grey">
                    <div class="graph-grid">
                        <svg id="gyro" ref="gyroSvg" class="sensor-graph">
                            <g class="grid x" transform="translate(40, 120)"></g>
                            <g class="grid y" transform="translate(40, 10)"></g>
                            <g class="data" transform="translate(41, 10)"></g>
                            <g class="axis x" transform="translate(40, 120)"></g>
                            <g class="axis y" transform="translate(40, 10)"></g>
                        </svg>
                        <div class="plot_control">
                            <div class="title" v-html="$t('sensorsGyroTitle')"></div>
                            <dl>
                                <dt v-html="$t('sensorsRefresh')"></dt>
                                <dd class="rate">
                                    <select v-model.number="rates.gyro" @change="onRateScaleChange">
                                        <option :value="10">10 ms</option>
                                        <option :value="20">20 ms</option>
                                        <option :value="30">30 ms</option>
                                        <option :value="40">40 ms</option>
                                        <option :value="50">50 ms</option>
                                        <option :value="100">100 ms</option>
                                        <option :value="250">250 ms</option>
                                        <option :value="500">500 ms</option>
                                        <option :value="1000">1000 ms</option>
                                    </select>
                                </dd>
                                <dt v-html="$t('sensorsScale')"></dt>
                                <dd class="scale">
                                    <select v-model.number="scales.gyro" @change="onRateScaleChange">
                                        <option :value="1">1</option>
                                        <option :value="2">2</option>
                                        <option :value="3">3</option>
                                        <option :value="4">4</option>
                                        <option :value="5">5</option>
                                        <option :value="10">10</option>
                                        <option :value="25">25</option>
                                        <option :value="50">50</option>
                                        <option :value="100">100</option>
                                        <option :value="200">200</option>
                                        <option :value="300">300</option>
                                        <option :value="400">400</option>
                                        <option :value="500">500</option>
                                        <option :value="1000">1000</option>
                                        <option :value="2000">2000</option>
                                    </select>
                                </dd>
                                <dt>X:</dt>
                                <dd class="x">{{ gyroDisplay.x }}</dd>
                                <dt>Y:</dt>
                                <dd class="y">{{ gyroDisplay.y }}</dd>
                                <dt>Z:</dt>
                                <dd class="z">{{ gyroDisplay.z }}</dd>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Accelerometer -->
            <div class="wrapper accel" v-show="checkboxes[1]">
                <div class="gui_box grey">
                    <div class="graph-grid">
                        <svg id="accel" ref="accelSvg" class="sensor-graph">
                            <g class="grid x" transform="translate(40, 120)"></g>
                            <g class="grid y" transform="translate(40, 10)"></g>
                            <g class="data" transform="translate(41, 10)"></g>
                            <g class="axis x" transform="translate(40, 120)"></g>
                            <g class="axis y" transform="translate(40, 10)"></g>
                        </svg>
                        <div class="plot_control">
                            <div class="title" v-html="$t('sensorsAccelTitle')"></div>
                            <dl>
                                <dt v-html="$t('sensorsRefresh')"></dt>
                                <dd class="rate">
                                    <select v-model.number="rates.accel" @change="onRateScaleChange">
                                        <option :value="10">10 ms</option>
                                        <option :value="20">20 ms</option>
                                        <option :value="30">30 ms</option>
                                        <option :value="40">40 ms</option>
                                        <option :value="50">50 ms</option>
                                        <option :value="100">100 ms</option>
                                        <option :value="250">250 ms</option>
                                        <option :value="500">500 ms</option>
                                        <option :value="1000">1000 ms</option>
                                    </select>
                                </dd>
                                <dt v-html="$t('sensorsScale')"></dt>
                                <dd class="scale">
                                    <select v-model.number="scales.accel" @change="onRateScaleChange">
                                        <option :value="0.5">0.5</option>
                                        <option :value="1">1</option>
                                        <option :value="2">2</option>
                                    </select>
                                </dd>
                                <dt>X:</dt>
                                <dd class="x">{{ accelDisplay.x }}</dd>
                                <dt>Y:</dt>
                                <dd class="y">{{ accelDisplay.y }}</dd>
                                <dt>Z:</dt>
                                <dd class="z">{{ accelDisplay.z }}</dd>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Magnetometer -->
            <div class="wrapper mag" v-show="checkboxes[2]">
                <div class="gui_box grey">
                    <div class="graph-grid">
                        <svg id="mag" ref="magSvg" class="sensor-graph">
                            <g class="grid x" transform="translate(40, 120)"></g>
                            <g class="grid y" transform="translate(40, 10)"></g>
                            <g class="data" transform="translate(41, 10)"></g>
                            <g class="axis x" transform="translate(40, 120)"></g>
                            <g class="axis y" transform="translate(40, 10)"></g>
                        </svg>
                        <div class="plot_control">
                            <div class="title" v-html="$t('sensorsMagTitle')"></div>
                            <dl>
                                <dt v-html="$t('sensorsRefresh')"></dt>
                                <dd class="rate">
                                    <select v-model.number="rates.mag" @change="onRateScaleChange">
                                        <option :value="10">10 ms</option>
                                        <option :value="20">20 ms</option>
                                        <option :value="30">30 ms</option>
                                        <option :value="40">40 ms</option>
                                        <option :value="50">50 ms</option>
                                        <option :value="100">100 ms</option>
                                        <option :value="250">250 ms</option>
                                        <option :value="500">500 ms</option>
                                        <option :value="1000">1000 ms</option>
                                    </select>
                                </dd>
                                <dt v-html="$t('sensorsScale')"></dt>
                                <dd class="scale">
                                    <select v-model.number="scales.mag" @change="onRateScaleChange">
                                        <option :value="100">100</option>
                                        <option :value="200">200</option>
                                        <option :value="500">500</option>
                                        <option :value="1000">1000</option>
                                        <option :value="2000">2000</option>
                                        <option :value="5000">5000</option>
                                        <option :value="10000">10000</option>
                                    </select>
                                </dd>
                                <dt>X:</dt>
                                <dd class="x">{{ magDisplay.x }}</dd>
                                <dt>Y:</dt>
                                <dd class="y">{{ magDisplay.y }}</dd>
                                <dt>Z:</dt>
                                <dd class="z">{{ magDisplay.z }}</dd>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Altitude -->
            <div class="wrapper altitude" v-show="checkboxes[3]">
                <div class="gui_box grey">
                    <div class="graph-grid">
                        <svg id="altitude" ref="altitudeSvg" class="sensor-graph">
                            <g class="grid x" transform="translate(40, 120)"></g>
                            <g class="grid y" transform="translate(40, 10)"></g>
                            <g class="data" transform="translate(41, 10)"></g>
                            <g class="axis x" transform="translate(40, 120)"></g>
                            <g class="axis y" transform="translate(40, 10)"></g>
                        </svg>
                        <div class="plot_control">
                            <div class="title">
                                <span v-html="$t('sensorsAltitudeTitle')"></span>
                                <div class="helpicon cf_tip" :title="$t('sensorsAltitudeHint')"></div>
                            </div>
                            <dl>
                                <dt v-html="$t('sensorsRefresh')"></dt>
                                <dd class="rate">
                                    <select v-model.number="rates.altitude" @change="onRateScaleChange">
                                        <option :value="10">10 ms</option>
                                        <option :value="20">20 ms</option>
                                        <option :value="30">30 ms</option>
                                        <option :value="40">40 ms</option>
                                        <option :value="50">50 ms</option>
                                        <option :value="100">100 ms</option>
                                        <option :value="250">250 ms</option>
                                        <option :value="500">500 ms</option>
                                        <option :value="1000">1000 ms</option>
                                    </select>
                                </dd>
                                <dt>X:</dt>
                                <dd class="x">{{ altitudeDisplay }}</dd>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sonar -->
            <div class="wrapper sonar" v-show="checkboxes[4]">
                <div class="gui_box grey">
                    <div class="graph-grid">
                        <svg id="sonar" ref="sonarSvg" class="sensor-graph">
                            <g class="grid x" transform="translate(40, 120)"></g>
                            <g class="grid y" transform="translate(40, 10)"></g>
                            <g class="data" transform="translate(41, 10)"></g>
                            <g class="axis x" transform="translate(40, 120)"></g>
                            <g class="axis y" transform="translate(40, 10)"></g>
                        </svg>
                        <div class="plot_control">
                            <div class="title" v-html="$t('sensorsSonarTitle')"></div>
                            <dl>
                                <dt v-html="$t('sensorsRefresh')"></dt>
                                <dd class="rate">
                                    <select v-model.number="rates.sonar" @change="onRateScaleChange">
                                        <option :value="10">10 ms</option>
                                        <option :value="20">20 ms</option>
                                        <option :value="30">30 ms</option>
                                        <option :value="40">40 ms</option>
                                        <option :value="50">50 ms</option>
                                        <option :value="100">100 ms</option>
                                        <option :value="250">250 ms</option>
                                        <option :value="500">500 ms</option>
                                        <option :value="1000">1000 ms</option>
                                    </select>
                                </dd>
                                <dt>X:</dt>
                                <dd class="x">{{ sonarDisplay }}</dd>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Debug -->
            <div class="wrapper debug" v-show="checkboxes[5]">
                <div class="gui_box grey">
                    <div class="graph-grid">
                        <template v-for="i in debugColumns" :key="i">
                            <div class="debug-item">
                                <svg
                                    :id="`debug${i - 1}`"
                                    :ref="
                                        (el) => {
                                            if (el) debugSvgs[i - 1] = el;
                                        }
                                    "
                                    class="sensor-graph"
                                >
                                    <g class="grid x" transform="translate(40, 120)"></g>
                                    <g class="grid y" transform="translate(40, 10)"></g>
                                    <g class="data" transform="translate(41, 10)"></g>
                                    <g class="axis x" transform="translate(40, 120)"></g>
                                    <g class="axis y" transform="translate(40, 10)"></g>
                                </svg>
                                <div class="plot_control" :class="`debug${i - 1}`">
                                    <div class="title">
                                        {{ debugTitles[i - 1] }}
                                    </div>
                                    <dl v-if="i === 1">
                                        <dt v-html="$t('sensorsRefresh')"></dt>
                                        <dd class="rate">
                                            <select v-model.number="rates.debug" @change="onRateScaleChange">
                                                <option :value="10">10 ms</option>
                                                <option :value="20">20 ms</option>
                                                <option :value="30">30 ms</option>
                                                <option :value="40">40 ms</option>
                                                <option :value="50">50 ms</option>
                                                <option :value="100">100 ms</option>
                                                <option :value="250">250 ms</option>
                                                <option :value="500">500 ms</option>
                                                <option :value="1000">1000 ms</option>
                                            </select>
                                        </dd>
                                        <dt>X:</dt>
                                        <dd class="x">{{ debugDisplay[i - 1] }}</dd>
                                    </dl>
                                    <dl v-else>
                                        <dt>X:</dt>
                                        <dd class="x">{{ debugDisplay[i - 1] }}</dd>
                                    </dl>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import { useDebugStore } from "@/stores/debug";
import { get as getConfig, set as setConfig } from "../../js/ConfigStorage";
import { have_sensor } from "../../js/sensor_helpers";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
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
    setTimeout(() => {
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
    }, 100);

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

.info .first {
    margin: 0 5px 0 0;
}

.wrapper {
    /* v-show will handle visibility */
}

.wrapper .gui_box {
    display: flex;
    flex-direction: row-reverse;
}

.graph-grid {
    display: flex;
    flex-wrap: wrap;
    width: 100%;
}

.debug .graph-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    width: 100%;
}

.debug-item {
    display: flex;
    flex-direction: row;
    gap: 10px;
}

.plot_control {
    width: fit-content;
    min-width: 200px;
    flex-shrink: 0;
}

.plot_control .title {
    font-weight: bold;
    margin-bottom: 0.75rem;
}

.plot_control .helpicon {
    margin: 2px 4px;
}

.plot_control dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
}

.plot_control dt,
.plot_control dd {
    display: flex;
    align-items: center;
}

.plot_control dt {
    font-weight: bold;
}

.plot_control select {
    min-width: 100%;
}

.plot_control .x,
.plot_control .y,
.plot_control .z {
    border-radius: 0.25rem;
    padding: 0.25rem;
    text-align: center;
}

.sensor-graph {
    width: 100%;
    height: 140px;
    flex: 1;
}

.debug .sensor-graph {
    grid-column: span 1;
    flex: 1;
}

.debug .plot_control {
    grid-column: span 1;
}

:deep(.grid .tick) {
    stroke: silver;
    stroke-width: 1px;
    shape-rendering: crispEdges;
}

:deep(.grid path) {
    stroke-width: 0;
}

:deep(.data .line) {
    stroke-width: 2px;
    fill: none;
}

:deep(text) {
    stroke: none;
    fill: var(--text);
    font-size: 10px;
}

:deep(.line:nth-child(4)) {
    stroke: #4da74d;
}
</style>
