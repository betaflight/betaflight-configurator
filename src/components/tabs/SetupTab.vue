<template>
    <BaseTab tab-name="setup">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabSetup')"></div>
            <WikiButton docUrl="setup" />

            <!-- Calibration Buttons -->
            <div class="grid-row">
                <div class="grid-col col3">
                    <div class="default_btn">
                        <div v-show="!accelCalibrating" id="accel_calib_rest">
                            <a
                                class="calibrateAccel"
                                :class="{ disabled: !hasAccelSensor }"
                                href="#"
                                @click.prevent="calibrateAccel"
                                v-html="$t('initialSetupButtonCalibrateAccel')"
                            ></a>
                        </div>
                        <div v-show="accelCalibrating" id="accel_calib_running">
                            <div class="data-loading-setup">
                                <p v-html="$t('initialSetupButtonCalibratingText')"></p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="grid-col col9">
                    <div class="cell_setup">
                        <span v-html="$t('initialSetupCalibrateAccelText')"></span>
                    </div>
                </div>
            </div>

            <div class="grid-row">
                <div class="grid-col col3">
                    <div class="default_btn">
                        <div v-show="!magCalibrating" id="mag_calib_rest">
                            <a
                                class="calibrateMag"
                                :class="{ disabled: !hasMagSensor }"
                                href="#"
                                @click.prevent="calibrateMag"
                                v-html="$t('initialSetupButtonCalibrateMag')"
                            ></a>
                        </div>
                        <div v-show="magCalibrating" id="mag_calib_running">
                            <div class="data-loading-setup">
                                <p v-html="$t('initialSetupButtonCalibratingText')"></p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="grid-col col9">
                    <div class="cell_setup">
                        <span v-html="$t('initialSetupCalibrateMagText')"></span>
                    </div>
                </div>
            </div>

            <!-- Reset Settings (Expert Mode) -->
            <div v-show="isExpertMode" class="grid-row">
                <div class="grid-col col3">
                    <div class="default_btn">
                        <a
                            class="resetSettings"
                            href="#"
                            @click.prevent="showResetDialog"
                            v-html="$t('initialSetupButtonReset')"
                        ></a>
                    </div>
                </div>
                <div class="grid-col col9">
                    <div class="cell_setup">
                        <span v-html="$t('initialSetupResetText')"></span>
                    </div>
                </div>
            </div>

            <!-- Reboot Bootloader (Expert Mode) -->
            <div v-show="isExpertMode" class="grid-row">
                <div class="grid-col col3">
                    <div class="default_btn">
                        <a
                            class="rebootBootloader"
                            href="#"
                            @click.prevent="rebootBootloader"
                            v-html="$t('initialSetupButtonRebootBootloader')"
                        ></a>
                    </div>
                </div>
                <div class="grid-col col9">
                    <div class="cell_setup">
                        <span v-html="$t('initialSetupRebootBootloaderText')"></span>
                    </div>
                </div>
            </div>

            <div class="modelwrapper"></div>

            <div class="grid-row grid-box col4">
                <div class="col-span-3 model-and-info">
                    <div id="interactive_block">
                        <div id="canvas_wrapper" class="background_paper">
                            <canvas id="canvas"></canvas>
                            <div class="attitude_info">
                                <dl>
                                    <dt v-html="$t('initialSetupHeading')"></dt>
                                    <dd class="heading">{{ headingDisplay }}</dd>
                                    <dt v-html="$t('initialSetupPitch')"></dt>
                                    <dd class="pitch">{{ pitchDisplay }}</dd>
                                    <dt v-html="$t('initialSetupRoll')"></dt>
                                    <dd class="roll">{{ rollDisplay }}</dd>
                                </dl>
                            </div>
                        </div>
                        <a
                            class="reset sm-min"
                            href="#"
                            @click.prevent="resetYaw"
                            v-html="$t('initialSetupButtonResetZaxis')"
                        ></a>
                    </div>
                </div>

                <div class="col-span-1 grid-box col1">
                    <!-- Instruments -->
                    <div class="gui_box grey instrumentsbox" align="center">
                        <div class="gui_box_titlebar" align="left">
                            <div class="spacer_box_title" v-html="$t('initialSetupInstrumentsHead')"></div>
                            <div class="helpicon cf_tip" :title="$t('initialSetupInstrumentsHeadHelp')"></div>
                        </div>
                        <span id="attitude"></span> <span id="heading"></span>
                    </div>

                    <!-- GPS Info -->
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('initialSetupGPSHead')"></div>
                            <div class="helpicon cf_tip" :title="$t('initialSetupGPSHeadHelp')"></div>
                        </div>
                        <div class="spacer_box GPS_info">
                            <table
                                width="100%"
                                border="0"
                                cellpadding="0"
                                cellspacing="0"
                                class="cf_table"
                                role="presentation"
                            >
                                <tbody>
                                    <tr>
                                        <td v-html="$t('gps3dFix')"></td>
                                        <td>
                                            <span
                                                class="colorToggle"
                                                :class="{ ready: gpsFix }"
                                                v-html="gpsFix ? $t('gpsFixTrue') : $t('gpsFixFalse')"
                                            ></span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td v-html="$t('gpsSats')"></td>
                                        <td class="gpsSats">{{ gpsSats }}</td>
                                    </tr>
                                    <tr>
                                        <td v-html="$t('gpsLatitude')"></td>
                                        <td class="latitude">
                                            <a :href="gpsMapUrl" target="_blank">{{ latitudeDisplay }}</a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td v-html="$t('gpsLongitude')"></td>
                                        <td class="longitude">
                                            <a :href="gpsMapUrl" target="_blank">{{ longitudeDisplay }}</a>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Sonar Info -->
                    <div v-show="hasSonarSensor" class="gui_box grey sonarBox">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('initialSetupSonarHead')"></div>
                            <div class="helpicon cf_tip" :title="$t('initialSetupSonarHeadHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <table
                                width="100%"
                                border="0"
                                cellpadding="0"
                                cellspacing="0"
                                class="cf_table"
                                role="presentation"
                            >
                                <tbody>
                                    <tr>
                                        <td id="sonarAltitude" v-html="$t('initialSetupAltitudeSonar')"></td>
                                        <td class="sonarAltitude">{{ sonarAltitude }} cm</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- System Info -->
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('initialSetupInfoHead')"></div>
                            <div class="helpicon cf_tip" :title="$t('initialSetupInfoHeadHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <table
                                width="100%"
                                border="0"
                                cellpadding="0"
                                cellspacing="0"
                                class="cf_table system_info"
                                role="presentation"
                            >
                                <tbody>
                                    <tr>
                                        <td
                                            id="arming-disable-flag"
                                            class="cf_tip"
                                            :title="$t('initialSetupArmingDisableFlagsTooltip')"
                                            v-html="$t('initialSetupArmingDisableFlags')"
                                        ></td>
                                        <td class="arming-disable-flags">
                                            <span
                                                v-if="armingDisableFlags === 0"
                                                id="initialSetupArmingAllowed"
                                                v-html="$t('initialSetupArmingAllowed')"
                                            ></span>
                                            <span
                                                v-for="flag in disarmFlags"
                                                :key="flag.index"
                                                :id="'initialSetupArmingDisableFlags' + flag.index"
                                                class="cf_tip disarm-flag"
                                                :title="flag.tooltip"
                                                v-show="(armingDisableFlags & (1 << flag.index)) !== 0"
                                                >{{ flag.name }}</span
                                            >
                                        </td>
                                    </tr>
                                    <tr>
                                        <td v-html="$t('initialSetupBattery')"></td>
                                        <td class="bat-voltage">{{ batteryVoltage }}</td>
                                    </tr>
                                    <tr>
                                        <td v-html="$t('initialSetupDrawn')"></td>
                                        <td class="bat-mah-drawn">{{ batteryMahDrawn }}</td>
                                    </tr>
                                    <tr>
                                        <td v-html="$t('initialSetupDrawing')"></td>
                                        <td class="bat-mah-drawing">{{ batteryAmperage }}</td>
                                    </tr>
                                    <tr class="noboarder">
                                        <td v-html="$t('initialSetupRSSI')"></td>
                                        <td class="rssi">{{ rssiPercent }}</td>
                                    </tr>
                                    <tr v-if="semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)">
                                        <td id="mcu" v-html="$t('initialSetupMCU')"></td>
                                        <td class="mcu">{{ mcuName }}</td>
                                    </tr>
                                    <tr v-if="fcStore.config.cpuTemp">
                                        <td id="cpu-temp" v-html="$t('initialSetupCpuTemp')"></td>
                                        <td class="cpu-temp">{{ cpuTemp }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Sensor Info -->
                    <div
                        v-show="semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)"
                        class="gui_box grey"
                        id="sensorInfoBox"
                    >
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('initialSensorInfoHead')"></div>
                            <div class="helpicon cf_tip" :title="$t('initialSensorInfoHeadHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <table
                                width="100%"
                                border="0"
                                cellpadding="0"
                                cellspacing="0"
                                class="cf_table"
                                role="presentation"
                            >
                                <tbody>
                                    <tr>
                                        <td id="sensor_gyro_hw" v-html="$t('initialSetupSensorGyro')"></td>
                                        <td class="sensor_gyro_hw">{{ gyroSensorInfo }}</td>
                                    </tr>
                                    <tr>
                                        <td id="sensor_acc_hw" v-html="$t('initialSetupSensorAcc')"></td>
                                        <td class="sensor_acc_hw">{{ accSensorInfo }}</td>
                                    </tr>
                                    <tr>
                                        <td id="sensor-mag-hw" v-html="$t('initialSetupSensorMag')"></td>
                                        <td class="sensor_mag_hw">{{ magSensorInfo }}</td>
                                    </tr>
                                    <tr>
                                        <td id="sensor_baro_hw" v-html="$t('initialSetupSensorBaro')"></td>
                                        <td class="sensor_baro_hw">{{ baroSensorInfo }}</td>
                                    </tr>
                                    <tr>
                                        <td id="sensor-sonar-hw" v-html="$t('initialSetupSensorSonar')"></td>
                                        <td class="sensor_sonar_hw">{{ sonarSensorInfo }}</td>
                                    </tr>
                                    <tr v-if="semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)">
                                        <td
                                            id="sensor-opticalflow-hw"
                                            v-html="$t('initialSetupSensorOpticalflow')"
                                        ></td>
                                        <td class="sensor_opticalflow_hw">{{ opticalflowSensorInfo }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Firmware Info -->
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('initialSetupInfoBuild')"></div>
                            <div class="helpicon cf_tip" :title="$t('initialSetupInfoFirmwareHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <table
                                width="100%"
                                border="0"
                                cellpadding="0"
                                cellspacing="0"
                                class="cf_table"
                                role="presentation"
                            >
                                <tbody>
                                    <tr>
                                        <td id="api-version" v-html="$t('initialSetupInfoAPIversion')"></td>
                                        <td class="api-version">{{ fcStore.config.apiVersion }}</td>
                                    </tr>
                                    <tr>
                                        <td id="build-date" v-html="$t('initialSetupInfoBuildDate')"></td>
                                        <td class="build-date">{{ fcStore.config.buildInfo }}</td>
                                    </tr>
                                    <tr v-if="semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)">
                                        <td id="build-type" v-html="$t('initialSetupInfoBuildType')"></td>
                                        <td class="build-type">{{ buildType }}</td>
                                    </tr>
                                    <tr v-if="semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)">
                                        <td id="build-info" v-html="$t('initialSetupInfoBuildInfo')"></td>
                                        <td class="build-info" v-html="buildInfo"></td>
                                    </tr>
                                    <tr v-if="semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)">
                                        <td id="build-firmware" v-html="$t('initialSetupInfoBuildFirmware')"></td>
                                        <td class="build-firmware" v-html="buildFirmware"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Network Info -->
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('initialSetupNetworkInfo')"></div>
                            <div class="helpicon cf_tip" :title="$t('initialSetupNetworkInfoHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <table
                                width="100%"
                                border="0"
                                cellpadding="0"
                                cellspacing="0"
                                class="cf_table"
                                role="presentation"
                            >
                                <tbody>
                                    <tr>
                                        <td id="network-status" v-html="$t('initialSetupNetworkInfoStatus')"></td>
                                        <td class="network-status">{{ networkStatus }}</td>
                                    </tr>
                                    <tr>
                                        <td id="network-type" v-html="$t('initialSetupNetworkType')"></td>
                                        <td class="network-type">{{ networkType }}</td>
                                    </tr>
                                    <tr>
                                        <td id="network-downlink" v-html="$t('initialSetupNetworkDownlink')"></td>
                                        <td class="network-downlink">{{ networkDownlink }}</td>
                                    </tr>
                                    <tr>
                                        <td id="network-rtt" v-html="$t('initialSetupNetworkRtt')"></td>
                                        <td class="network-rtt">{{ networkRtt }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Reset Confirmation Dialog -->
        <dialog ref="resetDialog" class="dialogConfirmReset">
            <h3 v-html="$t('dialogConfirmResetTitle')"></h3>
            <div class="content">
                <div v-html="$t('dialogConfirmResetNote')" style="margin-top: 10px"></div>
            </div>
            <div class="buttons">
                <a
                    href="#"
                    class="dialogConfirmReset-confirmbtn danger-button"
                    @click.prevent="confirmReset"
                    v-html="$t('dialogConfirmResetConfirm')"
                ></a>
                <a
                    href="#"
                    class="dialogConfirmReset-cancelbtn regular-button"
                    @click.prevent="cancelReset"
                    v-html="$t('dialogConfirmResetClose')"
                ></a>
            </div>
        </dialog>

        <!-- Build Info Dialog -->
        <dialog ref="buildInfoDialog" class="dialogBuildInfo">
            <div class="dialogBuildInfo-title" v-html="buildInfoDialogTitle"></div>
            <div class="contentBuildInfo">
                <div class="dialogBuildInfo-content" style="margin-top: 10px" v-html="buildInfoDialogContent"></div>
            </div>
            <div class="dialogButtons">
                <a
                    href="#"
                    class="dialogBuildInfo-closebtn regular-button"
                    @click.prevent="closeBuildInfoDialog"
                    v-html="$t('close')"
                ></a>
            </div>
        </dialog>
    </BaseTab>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import { isExpertModeEnabled } from "@/js/utils/isExpertModeEnabled";
import { have_sensor } from "@/js/sensor_helpers";
import { mspHelper } from "@/js/msp/MSPHelper";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { gui_log } from "@/js/gui_log";
import { sensorTypes } from "@/js/sensor_types";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "@/js/data_storage";
import Model from "@/js/model";
import $ from "jquery";
import GUI from "@/js/gui";
import { i18n } from "@/js/localization";

const fcStore = useFlightControllerStore();
const connectionStore = useConnectionStore();

// Reactive state
const yawFix = ref(0.0);
const accelCalibrating = ref(false);
const magCalibrating = ref(false);
const resetDialog = ref(null);
const buildInfoDialog = ref(null);
const buildInfoDialogTitle = ref("");
const buildInfoDialogContent = ref("");
const sensorTypesData = ref(null);

// Model and instruments
let model = null;
let attitudeIndicator = null;
let headingIndicator = null;

// Intervals
let fastDataInterval = null;
let slowDataInterval = null;

// Computed properties
const isExpertMode = computed(() => isExpertModeEnabled());

const hasAccelSensor = computed(() => have_sensor(fcStore.config.activeSensors, "acc"));
const hasMagSensor = computed(() => have_sensor(fcStore.config.activeSensors, "mag"));
const hasSonarSensor = computed(() => have_sensor(fcStore.config.activeSensors, "sonar"));

const headingDisplay = computed(() => {
    const heading = fcStore.sensorData.kinematics[2];
    return i18n.getMessage("initialSetupAttitude", [heading]);
});

const pitchDisplay = computed(() => {
    const pitch = fcStore.sensorData.kinematics[1];
    return i18n.getMessage("initialSetupAttitude", [pitch]);
});

const rollDisplay = computed(() => {
    const roll = fcStore.sensorData.kinematics[0];
    return i18n.getMessage("initialSetupAttitude", [roll]);
});

const gpsFix = computed(() => fcStore.gpsData.fix);
const gpsSats = computed(() => fcStore.gpsData.numSat);
const latitude = computed(() => fcStore.gpsData.latitude / 10000000);
const longitude = computed(() => fcStore.gpsData.longitude / 10000000);
const gpsMapUrl = computed(() => `https://maps.google.com/?q=${latitude.value},${longitude.value}`);
const latitudeDisplay = computed(() => `${latitude.value.toFixed(4)} ${i18n.getMessage("gpsPositionUnit")}`);
const longitudeDisplay = computed(() => `${longitude.value.toFixed(4)} ${i18n.getMessage("gpsPositionUnit")}`);

const sonarAltitude = computed(() => fcStore.sensorData.sonar.toFixed(1));

const armingDisableFlags = computed(() => fcStore.config.armingDisableFlags);

const disarmFlags = computed(() => {
    const flags = [];
    const flagNames = [
        "NO_GYRO",
        "FAILSAFE",
        "RX_FAILSAFE",
        "NOT_DISARMED",
        "BOXFAILSAFE",
        "RUNAWAY_TAKEOFF",
        "CRASH_DETECTED",
        "THROTTLE",
        "ANGLE",
        "BOOT_GRACE_TIME",
        "NOPREARM",
        "LOAD",
        "CALIBRATING",
        "CLI",
        "CMS_MENU",
        "BST",
        "MSP",
        "PARALYZE",
        "GPS",
        "RESC",
        "RPMFILTER",
        "REBOOT_REQUIRED",
        "DSHOT_BITBANG",
        "ACC_CALIBRATION",
        "MOTOR_PROTOCOL",
    ];

    if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
        flagNames.splice(flagNames.indexOf("RPMFILTER"), 1, "DSHOT_TELEM");
    }

    if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
        flagNames.splice(flagNames.indexOf("MOTOR_PROTOCOL") + 1, 0, "CRASHFLIP", "ALTHOLD", "POSHOLD");
    }

    for (let i = 0; i < fcStore.config.armingDisableCount; i++) {
        if (i < flagNames.length) {
            flags.push({
                index: i,
                name: flagNames[i],
                tooltip: i18n.getMessage(`initialSetupArmingDisableFlagsTooltip${flagNames[i]}`),
            });
        } else {
            flags.push({
                index: i,
                name: i + 1,
                tooltip: "",
            });
        }
    }
    return flags;
});

const batteryVoltage = computed(() => i18n.getMessage("initialSetupBatteryValue", [fcStore.analogData.voltage]));
const batteryMahDrawn = computed(() => i18n.getMessage("initialSetupBatteryMahValue", [fcStore.analogData.mAhdrawn]));
const batteryAmperage = computed(() =>
    i18n.getMessage("initialSetupBatteryAValue", [fcStore.analogData.amperage.toFixed(2)]),
);
const rssiPercent = computed(() =>
    i18n.getMessage("initialSetupRSSIValue", [((fcStore.analogData.rssi / 1023) * 100).toFixed(0)]),
);

const mcuName = computed(() => fcStore.mcuInfo.name);

const cpuTemp = computed(() => {
    if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46) && fcStore.config.cpuTemp) {
        return `${fcStore.config.cpuTemp.toFixed(0)} °C`;
    }
    return i18n.getMessage("initialSetupCpuTempNotSupported");
});

// Sensor info
const gyroSensorInfo = computed(() => {
    if (!sensorTypesData.value) return "";
    if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
        let gyroInfoList = [];
        for (let i = 0; i < fcStore.gyroSensor.gyro_count; i++) {
            if ((fcStore.sensorAlignment.gyro_enable_mask & (1 << i)) !== 0) {
                gyroInfoList.push(sensorTypesData.value.gyro.elements[fcStore.gyroSensor.gyro_hardware[i]]);
            }
        }
        return gyroInfoList.join(" ");
    } else {
        const sensor = fcStore.sensorConfigActive.gyro_hardware;
        if (sensor === 0xff) {
            return i18n.getMessage("initialSetupNotInBuild");
        } else if (have_sensor(fcStore.config.activeSensors, "gyro")) {
            return sensorTypesData.value.gyro.elements[sensor];
        } else {
            return i18n.getMessage("initialSetupNotDetected");
        }
    }
});

const accSensorInfo = computed(() => {
    if (!sensorTypesData.value) return "";
    const sensor = fcStore.sensorConfigActive.acc_hardware;
    if (sensor === 0xff) {
        return i18n.getMessage("initialSetupNotInBuild");
    } else if (have_sensor(fcStore.config.activeSensors, "acc")) {
        return sensorTypesData.value.acc.elements[sensor];
    } else {
        return i18n.getMessage("initialSetupNotDetected");
    }
});

const magSensorInfo = computed(() => {
    if (!sensorTypesData.value) return "";
    const sensor = fcStore.sensorConfigActive.mag_hardware;
    if (sensor === 0xff) {
        return i18n.getMessage("initialSetupNotInBuild");
    } else if (have_sensor(fcStore.config.activeSensors, "mag")) {
        return sensorTypesData.value.mag.elements[sensor];
    } else {
        return i18n.getMessage("initialSetupNotDetected");
    }
});

const baroSensorInfo = computed(() => {
    if (!sensorTypesData.value) return "";
    const sensor = fcStore.sensorConfigActive.baro_hardware;
    if (sensor === 0xff) {
        return i18n.getMessage("initialSetupNotInBuild");
    } else if (have_sensor(fcStore.config.activeSensors, "baro")) {
        return sensorTypesData.value.baro.elements[sensor];
    } else {
        return i18n.getMessage("initialSetupNotDetected");
    }
});

const sonarSensorInfo = computed(() => {
    if (!sensorTypesData.value) return "";
    const sensor = fcStore.sensorConfigActive.sonar_hardware;
    if (sensor === 0xff) {
        return i18n.getMessage("initialSetupNotInBuild");
    } else if (have_sensor(fcStore.config.activeSensors, "sonar")) {
        return sensorTypesData.value.sonar.elements[sensor];
    } else {
        return i18n.getMessage("initialSetupNotDetected");
    }
});

const opticalflowSensorInfo = computed(() => {
    if (!sensorTypesData.value) return "";
    if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
        const sensor = fcStore.sensorConfigActive.opticalflow_hardware;
        if (sensor === 0xff) {
            return i18n.getMessage("initialSetupNotInBuild");
        } else if (have_sensor(fcStore.config.activeSensors, "opticalflow")) {
            return sensorTypesData.value.opticalflow.elements[sensor];
        } else {
            return i18n.getMessage("initialSetupNotDetected");
        }
    }
    return "";
});

// Build info
const buildType = computed(() => {
    return fcStore.config.buildKey.length === 32
        ? i18n.getMessage("initialSetupInfoBuildCloud")
        : i18n.getMessage("initialSetupInfoBuildLocal");
});

const buildInfo = computed(() => {
    const isIspConnected = ispConnected();
    const buildKeyValid = fcStore.config.buildKey.length === 32;

    if (buildKeyValid && isIspConnected) {
        const buildRoot = `https://build.betaflight.com/api/builds/${fcStore.config.buildKey}`;
        const buildConfig = `<span class="buildInfoBtn" title="${i18n.getMessage("initialSetupInfoBuildConfig")}: ${buildRoot}/json">
            <a href="${buildRoot}/json" target="_blank"><strong>${i18n.getMessage("initialSetupInfoBuildConfig")}</strong></a></span>`;
        const buildLog = `<span class="buildInfoBtn" title="${i18n.getMessage("initialSetupInfoBuildLog")}: ${buildRoot}/log">
            <a href="${buildRoot}/log" target="_blank"><strong>${i18n.getMessage("initialSetupInfoBuildLog")}</strong></a></span>`;
        return `${buildConfig} ${buildLog}`;
    } else {
        return isIspConnected ? i18n.getMessage("initialSetupNoBuildInfo") : i18n.getMessage("initialSetupNotOnline");
    }
});

const buildFirmware = computed(() => {
    const isIspConnected = ispConnected();
    const buildOptionsValid =
        ((semver.eq(fcStore.config.apiVersion, API_VERSION_1_45) && isIspConnected) ||
            semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) &&
        fcStore.config.buildOptions.length;
    const buildKeyValid = fcStore.config.buildKey.length === 32;
    const buildRoot = `https://build.betaflight.com/api/builds/${fcStore.config.buildKey}`;

    if (buildOptionsValid || buildKeyValid) {
        const buildOptions = buildOptionsValid
            ? `<span class="buildInfoBtn" title="${i18n.getMessage("initialSetupInfoBuildOptionList")}">
                <a class="buildOptions" href="#" @click.prevent="showBuildOptions"><strong>${i18n.getMessage("initialSetupInfoBuildOptions")}</strong></a></span>`
            : "";

        const buildDownload = buildKeyValid
            ? `<span class="buildInfoBtn" title="${i18n.getMessage("initialSetupInfoBuildDownload")}: ${buildRoot}/hex">
                <a href="${buildRoot}/hex" target="_blank"><strong>${i18n.getMessage("initialSetupInfoBuildDownload")}</strong></a></span>`
            : "";

        return `${buildOptions} ${buildDownload}`;
    } else {
        return isIspConnected ? i18n.getMessage("initialSetupNoBuildInfo") : i18n.getMessage("initialSetupNotOnline");
    }
});

// Network info
const networkStatus = computed(() => {
    const isOnline = navigator.onLine;
    const connection = navigator.connection;
    const type = connection?.effectiveType || "Unknown";
    const downlink = connection?.downlink || 0;
    const rtt = connection?.rtt || 0;

    if (!ispConnected() || !isOnline || type === "none") {
        return i18n.getMessage("initialSetupNetworkInfoStatusOffline");
    } else if (type === "slow-2g" || type === "2g" || downlink < 0.115 || rtt > 1000) {
        return i18n.getMessage("initialSetupNetworkInfoStatusSlow");
    } else {
        return i18n.getMessage("initialSetupNetworkInfoStatusOnline");
    }
});

const networkType = computed(() => navigator.connection?.effectiveType || "Unknown");
const networkDownlink = computed(() => `${navigator.connection?.downlink || 0} Mbps`);
const networkRtt = computed(() => `${navigator.connection?.rtt || 0} ms`);

// Methods
const calibrateAccel = () => {
    if (!hasAccelSensor.value) return;

    accelCalibrating.value = true;
    GUI.interval_pause("setup_data_pull");

    MSP.send_message(MSPCodes.MSP_ACC_CALIBRATION, false, false, () => {
        gui_log(i18n.getMessage("initialSetupAccelCalibStarted"));
    });

    GUI.timeout_add(
        "button_reset",
        () => {
            GUI.interval_resume("setup_data_pull");
            gui_log(i18n.getMessage("initialSetupAccelCalibEnded"));
            accelCalibrating.value = false;
        },
        2000,
    );
};

const calibrateMag = () => {
    if (!hasMagSensor.value) return;

    magCalibrating.value = true;

    MSP.send_message(MSPCodes.MSP_MAG_CALIBRATION, false, false, () => {
        gui_log(i18n.getMessage("initialSetupMagCalibStarted"));
    });

    if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
        let cycle = 0;
        const cycleMax = 45;
        const interval = 1000;
        const intervalId = setInterval(() => {
            if (cycle >= cycleMax || (fcStore.config.armingDisableFlags & (1 << 12)) === 0) {
                clearInterval(intervalId);
                magCalibrating.value = false;
                gui_log(i18n.getMessage("initialSetupMagCalibEnded"));
            }
            cycle++;
        }, interval);
    } else {
        GUI.timeout_add(
            "button_reset",
            () => {
                magCalibrating.value = false;
                gui_log(i18n.getMessage("initialSetupMagCalibEnded"));
            },
            30000,
        );
    }
};

const showResetDialog = () => {
    resetDialog.value.showModal();
};

const confirmReset = () => {
    resetDialog.value.close();
    MSP.send_message(MSPCodes.MSP_RESET_CONF, false, false, () => {
        gui_log(i18n.getMessage("initialSetupSettingsRestored"));
        // Refresh the page to reinitialize
        window.location.reload();
    });
};

const cancelReset = () => {
    resetDialog.value.close();
};

const rebootBootloader = () => {
    const buffer = [];
    buffer.push(
        fcStore.config.boardHasFlashBootloader()
            ? mspHelper.REBOOT_TYPES.BOOTLOADER_FLASH
            : mspHelper.REBOOT_TYPES.BOOTLOADER,
    );
    MSP.send_message(MSPCodes.MSP_SET_REBOOT, buffer, false);
};

const resetYaw = () => {
    yawFix.value = fcStore.sensorData.kinematics[2] * -1.0;
    console.log(`YAW reset to 0 deg, fix: ${yawFix.value} deg`);
};

const showBuildOptions = () => {
    buildInfoDialogTitle.value = `<h3>${i18n.getMessage("initialSetupInfoBuildOptionList")}</h3>`;
    let buildOptionList = `<div class="dialogBuildInfoGrid-container">`;
    for (const buildOption of fcStore.config.buildOptions) {
        buildOptionList += `<div class="dialogBuildInfoGrid-item">${buildOption}</div>`;
    }
    buildOptionList += `</div>`;
    buildInfoDialogContent.value = buildOptionList;
    buildInfoDialog.value.showModal();
};

const closeBuildInfoDialog = () => {
    buildInfoDialog.value.close();
};

const initializeInstruments = () => {
    const options = { size: 90, showBox: false, img_directory: "images/flightindicators/" };
    attitudeIndicator = $.flightIndicator("#attitude", "attitude", options);
    headingIndicator = $.flightIndicator("#heading", "heading", options);
};

const updateInstruments = () => {
    if (attitudeIndicator) {
        attitudeIndicator.setRoll(fcStore.sensorData.kinematics[0]);
        attitudeIndicator.setPitch(fcStore.sensorData.kinematics[1]);
    }
    if (headingIndicator) {
        headingIndicator.setHeading(fcStore.sensorData.kinematics[2]);
    }
};

const initModel = () => {
    model = new Model($(".model-and-info #canvas_wrapper"), $(".model-and-info #canvas"));
    $(window).on("resize", $.proxy(model.resize, model));
};

const renderModel = () => {
    if (model) {
        const x = fcStore.sensorData.kinematics[1] * -1.0 * 0.017453292519943295;
        const y = (fcStore.sensorData.kinematics[2] * -1.0 - yawFix.value) * 0.017453292519943295;
        const z = fcStore.sensorData.kinematics[0] * -1.0 * 0.017453292519943295;
        model.rotateTo(x, y, z);
    }
};

const getFastData = () => {
    MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, () => {
        renderModel();
        updateInstruments();
    });

    if (hasSonarSensor.value) {
        MSP.send_message(MSPCodes.MSP_SONAR, false, false, () => {
            // Sonar data updated via computed property
        });
    }
};

const getSlowData = () => {
    // Data is updated via computed properties from stores
};

onMounted(async () => {
    // Initialize MSP data
    MSP.send_message(MSPCodes.MSP_ACC_TRIM, false, false, () => {
        MSP.send_message(MSPCodes.MSP_STATUS_EX, false, false, () => {
            MSP.send_message(MSPCodes.MSP2_MCU_INFO, false, false, () => {
                MSP.send_message(MSPCodes.MSP_MIXER_CONFIG, false, false, () => {
                    MSP.send_message(MSPCodes.MSP_SENSOR_ALIGNMENT, false, false, () => {
                        // Fetch sensor types after basic data is loaded
                        sensorTypes().then((types) => {
                            sensorTypesData.value = types;
                        });
                    });
                });
            });
        });
    });

    // Initialize 3D model
    initModel();

    // Initialize instruments
    initializeInstruments();

    // Start data polling
    fastDataInterval = GUI.interval_add("setup_data_pull_fast", getFastData, 33, true);
    slowDataInterval = GUI.interval_add("setup_data_pull_slow", getSlowData, 250, true);
});

onUnmounted(() => {
    // Clean up intervals
    if (fastDataInterval) GUI.interval_remove("setup_data_pull_fast");
    if (slowDataInterval) GUI.interval_remove("setup_data_pull_slow");

    // Clean up model
    if (model) {
        $(window).off("resize", $.proxy(model.resize, model));
        model.dispose();
    }
});
</script>

<style scoped>
/* Tab-specific styles can be added here */
</style>
