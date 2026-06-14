<template>
    <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
            <USwitch
                v-model="checkboxes[0]"
                :disabled="!hasGyro"
                size="sm"
                :label="$t('sensorsGyroSelect')"
                @update:model-value="onCheckboxChange"
            />
            <USwitch
                v-model="checkboxes[1]"
                :disabled="!hasAccel"
                size="sm"
                :label="$t('sensorsAccelSelect')"
                @update:model-value="onCheckboxChange"
            />
            <USwitch
                v-model="checkboxes[2]"
                :disabled="!hasMag"
                size="sm"
                :label="$t('sensorsMagSelect')"
                @update:model-value="onCheckboxChange"
            />
            <USwitch
                v-model="checkboxes[3]"
                :disabled="!hasAltitude"
                size="sm"
                :label="$t('sensorsAltitudeSelect')"
                @update:model-value="onCheckboxChange"
            />
            <USwitch
                v-model="checkboxes[4]"
                :disabled="!hasSonar"
                size="sm"
                :label="$t('sensorsSonarSelect')"
                @update:model-value="onCheckboxChange"
            />
            <div class="flex items-center gap-2">
                <USwitch
                    v-model="checkboxes[5]"
                    :disabled="!hasDebug"
                    size="sm"
                    :label="$t('sensorsDebugSelect')"
                    @update:model-value="onCheckboxChange"
                />
                <UInput v-show="checkboxes[5]" :model-value="debugModeName" size="xs" disabled class="w-40 font-mono" />
            </div>

            <div class="flex items-center gap-2 ml-auto text-[10px] [&_[data-slot=base]]:text-[10px]!">
                <span v-html="$t('sensorsGlobalRefresh')"></span>
                <USelect
                    :model-value="globalRate"
                    :items="refreshRateItems"
                    @update:model-value="updateGlobalRate(Number($event))"
                    class="min-w-24"
                    size="xs"
                />
            </div>
        </div>

        <SensorGraph
            v-for="sensor in sensorConfigs"
            :key="sensor.type"
            :sensor-type="sensor.type"
            :svg-id="sensor.type"
            :visible="checkboxes[sensor.checkboxIndex]"
            :title="$t(sensor.titleKey)"
            :hint="sensor.hintKey ? $t(sensor.hintKey) : null"
            :rate="rates[sensor.type]"
            :scale="sensor.hasScale ? scales[sensor.type] : null"
            :scale-options="sensor.scaleOptions"
            :display-values="sensor.getDisplayValues()"
            @update:rate="updateRate(sensor.type, $event)"
            @update:scale="sensor.hasScale ? updateScale(sensor.type, $event) : null"
        />

        <div v-show="checkboxes[5]" class="flex flex-col gap-2.5">
            <SensorGraph
                v-for="i in debugColumns"
                :key="i"
                sensor-type="debug"
                :svg-id="`debug${i - 1}`"
                :visible="true"
                :title="debugTitles[i - 1]"
                :show-refresh-rate="i === 1"
                :rate="rates.debug"
                :scale="debugScales[i - 1]"
                :scale-options="DEBUG_SCALE_OPTIONS"
                :display-values="[debugDisplay[i - 1]]"
                :is-debug="true"
                @update:rate="updateRate('debug', $event)"
                @update:scale="updateDebugScale(i - 1, $event)"
            />
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from "vue";
import { storeToRefs } from "pinia";
import { useFlightControllerStore } from "@/stores/fc";
import { useDebugStore } from "@/stores/debug";
import { decodeDebugFieldToFriendly } from "@/js/utils/debugModes";
import { useSensorsStore } from "@/stores/sensors";
import { useSensorGraph } from "@/composables/useSensorGraph";
import { useInterval } from "../../../composables/useInterval";
import { have_sensor } from "../../../js/sensor_helpers";
import {
    GYRO_SCALE_OPTIONS,
    ACCEL_SCALE_OPTIONS,
    MAG_SCALE_OPTIONS,
    DEBUG_SCALE_OPTIONS,
    REFRESH_RATE_OPTIONS,
} from "./constants";
import SensorGraph from "./SensorGraph.vue";
import MSP from "../../../js/msp";
import MSPCodes from "../../../js/msp/MSPCodes";
import semver from "semver";
import { API_VERSION_1_46 } from "../../../js/data_storage";

const fcStore = useFlightControllerStore();
const debugStore = useDebugStore();
const sensorsStore = useSensorsStore();
const { addInterval, removeInterval } = useInterval();

const { checkboxes, globalRate, rates, scales, debugScales, debugColumns } = storeToRefs(sensorsStore);

const refreshRateItems = REFRESH_RATE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

const {
    addGyroSample,
    addAccelSample,
    addMagSample,
    addAltitudeSample,
    addSonarSample,
    addDebugSample,
    incrementDebugCounter,
    updateScales: updateGraphScales,
    setDebugScales: updateGraphDebugScales,
    updateGraphs,
    initializeGraphs,
} = useSensorGraph();

// Display values
const gyroDisplay = reactive({ x: "0", y: "0", z: "0" });
const accelDisplay = reactive({ x: "0", y: "0", z: "0" });
const magDisplay = reactive({ x: "0", y: "0", z: "0" });
const altitudeDisplay = ref("0");
const sonarDisplay = ref("0");
const debugDisplay = ref(new Array(8).fill("0"));

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
const isFcBoard = computed(() => fcStore.config.boardType === 0 || fcStore.config.boardType === 2);
const hasGyro = isFcBoard;
const hasAccel = computed(() => isFcBoard.value && have_sensor(fcStore.config.activeSensors, "acc"));
const hasMag = computed(() => isFcBoard.value && have_sensor(fcStore.config.activeSensors, "mag"));
const hasAltitude = computed(
    () =>
        isFcBoard.value &&
        (have_sensor(fcStore.config.activeSensors, "baro") || have_sensor(fcStore.config.activeSensors, "gps")),
);
const hasSonar = computed(() => isFcBoard.value && have_sensor(fcStore.config.activeSensors, "sonar"));

const hasDebug = computed(() => fcStore.pidAdvancedConfig.debugMode !== 0);
const debugModeName = computed(() => debugStore.modes[fcStore.pidAdvancedConfig.debugMode] ?? "DISABLED");

// Debug titles
const debugTitles = ref(new Array(8).fill("").map((_, i) => `Debug (${i})`));

function initSensorData() {
    for (let i = 0; i < 3; i++) {
        fcStore.sensorData.accelerometer[i] = 0;
        fcStore.sensorData.gyroscope[i] = 0;
        fcStore.sensorData.magnetometer[i] = 0;
    }
    fcStore.sensorData.sonar = 0;
    fcStore.sensorData.altitude = 0;
    for (let i = 0; i < debugColumns.value; i++) {
        fcStore.sensorData.debug[i] = 0;
    }
}

function initializeTimers() {
    removeInterval("IMU_pull");
    removeInterval("altitude_pull");
    removeInterval("sonar_pull");
    removeInterval("debug_pull");

    // Gyro/accel/mag share one MSP_RAW_IMU pull, so use the fastest of the three.
    const fastest = Math.min(rates.value.gyro, rates.value.accel, rates.value.mag);

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
        const ax = fcStore.sensorData.accelerometer[0];
        const ay = fcStore.sensorData.accelerometer[1];
        const az = fcStore.sensorData.accelerometer[2];
        const rollACC = Math.round(Math.atan2(ay, Math.hypot(ax, az)) * (180 / Math.PI));
        const pitchACC = Math.round(Math.atan2(ax, Math.hypot(ay, az)) * (180 / Math.PI));
        accelDisplay.x = `${ax.toFixed(2)} (${rollACC})`;
        accelDisplay.y = `${ay.toFixed(2)} (${pitchACC})`;
        accelDisplay.z = az.toFixed(2);
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

/**
 * Hardware-scaling context for the shared debug decode helper, built from the
 * connected FC. Mirrors the fixed scaling MSPHelper applies to the live main
 * gyro/acc display (no per-FC gyroScale/acc_1G exists), plus motor config for
 * throttle/RPM modes.
 */
function liveDebugContext() {
    const minThrottle = fcStore.motorConfig?.minthrottle ?? 1000;
    const maxThrottle = fcStore.motorConfig?.maxthrottle ?? 2000;
    return {
        apiVersion: fcStore.config?.apiVersion,
        // `|| 1` (not `??`) so an unloaded 0 can't divide-by-zero in RPM modes.
        motorPoles: fcStore.motorConfig?.motor_poles || 1,
        gyroRawToDegreesPerSecond: (v) => v * (4 / 16.4),
        accRawToGs: (v) => v / 2048,
        rcCommandRawToThrottle: (v) =>
            Math.min(Math.max(((v - minThrottle) / (maxThrottle - minThrottle)) * 100, 0), 100),
        throttleToRcCommandRaw: (v) => (v / 100) * (maxThrottle - minThrottle) + minThrottle,
    };
}

function update_debug_graphs() {
    const modeName = debugStore.modes[fcStore.pidAdvancedConfig.debugMode];
    const ctx = liveDebugContext();
    for (let i = 0; i < debugColumns.value; i++) {
        const raw = fcStore.sensorData.debug[i];
        addDebugSample(i, [raw]);
        debugDisplay.value[i] = decodeDebugFieldToFriendly(modeName, `debug[${i}]`, raw, ctx);
    }
    incrementDebugCounter();
    updateGraphs();
}

function displayDebugColumnNames() {
    const debugModeName = debugStore.modes[fcStore.pidAdvancedConfig.debugMode];
    const debugFields = debugStore.fieldNames[debugModeName];

    for (let i = 0; i < debugColumns.value; i++) {
        let msg = `Unknown (${i})`;
        if (debugFields) {
            const fieldName = debugFields[`debug[${i}]`];
            msg = fieldName ? `${fieldName} (${i})` : `Not used (${i})`;
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

function updateGlobalRate(value) {
    sensorsStore.updateGlobalRate(value);
    initializeTimers();
}

function updateScale(sensor, value) {
    sensorsStore.updateScale(sensor, value);
    updateGraphScales(scales.value);
}

function updateDebugScale(index, value) {
    sensorsStore.updateDebugScale(index, value);
    updateGraphDebugScales(debugScales.value);
}

onMounted(async () => {
    sensorsStore.loadFromConfig();

    // Needed for DSHOT_RPM_TELEMETRY debug decoding (motor_poles); other tabs
    // load it on mount too, and it isn't fetched at connection time.
    await MSP.promise(MSPCodes.MSP_MOTOR_CONFIG);

    if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
        sensorsStore.debugColumns = 8;
        await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);
        displayDebugColumnNames();
    } else {
        sensorsStore.debugColumns = 4;
    }

    initSensorData();

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

    await nextTick();
    initializeGraphs(null, debugColumns.value);
    updateGraphScales(scales.value);
    updateGraphDebugScales(debugScales.value);
    initializeTimers();
});
</script>
