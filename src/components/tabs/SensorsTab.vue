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
                        <input
                            type="checkbox"
                            v-model="checkboxes[5]"
                            :disabled="!hasDebug"
                            @change="onCheckboxChange"
                        />
                        <span v-html="$t('sensorsDebugSelect')"></span>
                    </div>
                </div>
            </div>

            <!-- Sensors -->
            <SensorGraph
                v-for="sensor in sensorConfigs"
                :key="sensor.type"
                :ref="(el) => setSensorRef(sensor.type, el)"
                :sensor-type="sensor.type"
                :svg-id="sensor.type"
                :visible="checkboxes[sensor.checkboxIndex]"
                :title="$t(sensor.titleKey)"
                :hint="sensor.hintKey ? $t(sensor.hintKey) : null"
                :rate="rates[sensor.type]"
                @update:rate="updateRate(sensor.type, $event)"
                :scale="sensor.hasScale ? scales[sensor.type] : null"
                @update:scale="sensor.hasScale ? updateScale(sensor.type, $event) : null"
                :scale-options="sensor.scaleOptions"
                :display-values="sensor.getDisplayValues()"
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
import { ref, reactive, computed, onMounted, nextTick } from "vue";
import { storeToRefs } from "pinia";
import { useFlightControllerStore } from "@/stores/fc";
import { useDebugStore } from "@/stores/debug";
import { useSensorsStore } from "@/stores/sensors";
import { useSensorGraph } from "@/composables/useSensorGraph";
import { useInterval } from "../../composables/useInterval";
import { have_sensor } from "../../js/sensor_helpers";
import { GYRO_SCALE_OPTIONS, ACCEL_SCALE_OPTIONS, MAG_SCALE_OPTIONS } from "./sensors/constants";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import SensorGraph from "./sensors/SensorGraph.vue";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import semver from "semver";
import { API_VERSION_1_46 } from "../../js/data_storage";

const fcStore = useFlightControllerStore();
const debugStore = useDebugStore();
const sensorsStore = useSensorsStore();
const { addInterval, removeInterval } = useInterval();

// Get reactive refs from store
const { checkboxes, rates, scales, debugColumns } = storeToRefs(sensorsStore);

// Initialize composable for graph management
const {
    addGyroSample,
    addAccelSample,
    addMagSample,
    addAltitudeSample,
    addSonarSample,
    addDebugSample,
    incrementDebugCounter,
    updateScales: updateGraphScales,
    updateGraphs,
    initializeGraphs,
} = useSensorGraph();

// SVG refs
const gyroSvg = ref(null);
const accelSvg = ref(null);
const magSvg = ref(null);
const altitudeSvg = ref(null);
const sonarSvg = ref(null);
const debugSvgs = ref([]);

const setSensorRef = (type, el) => {
    switch (type) {
        case "gyro":
            gyroSvg.value = el;
            break;
        case "accel":
            accelSvg.value = el;
            break;
        case "mag":
            magSvg.value = el;
            break;
        case "altitude":
            altitudeSvg.value = el;
            break;
        case "sonar":
            sonarSvg.value = el;
            break;
    }
};

// Display values
const gyroDisplay = reactive({ x: "0", y: "0", z: "0" });
const accelDisplay = reactive({ x: "0", y: "0", z: "0" });
const magDisplay = reactive({ x: "0", y: "0", z: "0" });
const altitudeDisplay = ref("0");
const sonarDisplay = ref("0");
const debugDisplay = ref(new Array(8).fill("0"));

// Sensor configuration array to eliminate template duplication
const sensorConfigs = [
    {
        type: "gyro",
        checkboxIndex: 0,
        titleKey: "sensorsGyroTitle",
        hasScale: true,
        scaleOptions: GYRO_SCALE_OPTIONS,
        getDisplayValues: () => [gyroDisplay.x, gyroDisplay.y, gyroDisplay.z],
    },
    {
        type: "accel",
        checkboxIndex: 1,
        titleKey: "sensorsAccelTitle",
        hasScale: true,
        scaleOptions: ACCEL_SCALE_OPTIONS,
        getDisplayValues: () => [accelDisplay.x, accelDisplay.y, accelDisplay.z],
    },
    {
        type: "mag",
        checkboxIndex: 2,
        titleKey: "sensorsMagTitle",
        hasScale: true,
        scaleOptions: MAG_SCALE_OPTIONS,
        getDisplayValues: () => [magDisplay.x, magDisplay.y, magDisplay.z],
    },
    {
        type: "altitude",
        checkboxIndex: 3,
        titleKey: "sensorsAltitudeTitle",
        hintKey: "sensorsAltitudeHint",
        hasScale: false,
        getDisplayValues: () => [altitudeDisplay.value],
    },
    {
        type: "sonar",
        checkboxIndex: 4,
        titleKey: "sensorsSonarTitle",
        hasScale: false,
        getDisplayValues: () => [sonarDisplay.value],
    },
];

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

const hasDebug = computed(() => {
    return fcStore.pidAdvancedConfig.debugMode !== 0;
});

// Debug titles
const debugTitles = ref(new Array(8).fill("").map((_, i) => `Debug ${i}`));

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

function initializeTimers() {
    // Remove sensor-specific intervals before re-adding with updated rates
    removeInterval("IMU_pull");
    removeInterval("altitude_pull");
    removeInterval("sonar_pull");
    removeInterval("debug_pull");

    const fastest = Math.max(rates.value.gyro, rates.value.accel, rates.value.mag);

    // IMU data (gyro, accel, mag)
    if (checkboxes.value[0] || checkboxes.value[1] || checkboxes.value[2]) {
        addInterval(
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
        addInterval(
            "altitude_pull",
            () => {
                MSP.send_message(MSPCodes.MSP_ALTITUDE, false, false, update_altitude_graph);
            },
            rates.value.altitude,
            true,
        );
    }

    // Sonar
    if (checkboxes.value[4]) {
        addInterval(
            "sonar_pull",
            () => {
                MSP.send_message(MSPCodes.MSP_SONAR, false, false, update_sonar_graphs);
            },
            rates.value.sonar,
            true,
        );
    }

    // Debug
    if (checkboxes.value[5]) {
        addInterval(
            "debug_pull",
            () => {
                MSP.send_message(MSPCodes.MSP_DEBUG, false, false, update_debug_graphs);
            },
            rates.value.debug,
            true,
        );
    }
}

function update_imu_graphs() {
    if (checkboxes.value[0]) {
        addGyroSample(fcStore.sensorData.gyroscope);
        gyroDisplay.x = fcStore.sensorData.gyroscope[0].toFixed(2);
        gyroDisplay.y = fcStore.sensorData.gyroscope[1].toFixed(2);
        gyroDisplay.z = fcStore.sensorData.gyroscope[2].toFixed(2);
    }

    if (checkboxes.value[1]) {
        addAccelSample(fcStore.sensorData.accelerometer);

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

    if (checkboxes.value[2]) {
        addMagSample(fcStore.sensorData.magnetometer);
        magDisplay.x = fcStore.sensorData.magnetometer[0].toFixed(0);
        magDisplay.y = fcStore.sensorData.magnetometer[1].toFixed(0);
        magDisplay.z = fcStore.sensorData.magnetometer[2].toFixed(0);
    }

    updateGraphs();
}

function update_altitude_graph() {
    addAltitudeSample([fcStore.sensorData.altitude]);
    altitudeDisplay.value = fcStore.sensorData.altitude.toFixed(2);
    updateGraphs();
}

function update_sonar_graphs() {
    addSonarSample([fcStore.sensorData.sonar]);
    sonarDisplay.value = fcStore.sensorData.sonar.toFixed(2);
    updateGraphs();
}

function update_debug_graphs() {
    for (let i = 0; i < debugColumns.value; i++) {
        addDebugSample(i, [fcStore.sensorData.debug[i]]);
        debugDisplay.value[i] = fcStore.sensorData.debug[i].toString();
    }
    incrementDebugCounter();
    updateGraphs();
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

function onCheckboxChange() {
    sensorsStore.saveToConfig();
    initializeTimers();
}

function updateRate(sensor, value) {
    sensorsStore.updateRate(sensor, value);
    initializeTimers();
}

function updateScale(sensor, value) {
    sensorsStore.updateScale(sensor, value);
    updateGraphScales(scales.value);
    initializeTimers();
}

onMounted(async () => {
    // Load sensor configuration from store
    sensorsStore.loadFromConfig();

    // Initialize sensor data
    initSensorData();

    // Determine debug columns based on API version
    if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
        sensorsStore.debugColumns = 8;
        await MSP.send_message(MSPCodes.MSP_ADVANCED_CONFIG, false, false, displayDebugColumnNames);
    } else {
        sensorsStore.debugColumns = 4;
    }

    // Disable checkboxes for unavailable sensors; if none remain, enable all available as defaults
    const sensorAvailability = [
        hasGyro.value,
        hasAccel.value,
        hasMag.value,
        hasAltitude.value,
        hasSonar.value,
        hasDebug.value,
    ];
    for (let i = 0; i < sensorAvailability.length; i++) {
        checkboxes.value[i] = Boolean(checkboxes.value[i]) && sensorAvailability[i];
    }

    if (!checkboxes.value.some(Boolean)) {
        for (let i = 0; i < sensorAvailability.length; i++) {
            checkboxes.value[i] = sensorAvailability[i];
        }
    }

    // Initialize graph helpers - wait for next tick to ensure refs are set
    await nextTick();

    initializeGraphs(null, debugColumns.value);

    // Set initial scales from store
    updateGraphScales(scales.value);

    // Start polling
    initializeTimers();

    // Status polling
    addInterval(
        "status_pull",
        () => {
            MSP.send_message(MSPCodes.MSP_STATUS);
        },
        250,
        true,
    );
});

// Interval cleanup is handled automatically by the useInterval composable on unmount
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
