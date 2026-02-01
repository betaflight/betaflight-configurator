<template>
    <div class="tab-setup">
        <div class="content_wrapper">
            <div class="tab_title" i18n="tabSetup">Setup</div>
            <WikiButton docUrl="setup" />
            <div class="grid-row">
                <div class="grid-col col3">
                    <div class="default_btn">
                        <div id="accel_calib_rest" v-show="!state.calibratingAccel">
                            <a
                                class="calibrateAccel"
                                :class="{ disabled: state.disabledAccel, calibrating: state.calibratingAccel }"
                                href="#"
                                @click.prevent="onCalibrateAccel"
                                >{{ i18n.getMessage("initialSetupButtonCalibrateAccel") }}</a
                            >
                        </div>
                        <div id="accel_calib_running" v-show="state.calibratingAccel">
                            <div class="data-loading-setup">
                                <p i18n="initialSetupButtonCalibratingText"></p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="grid-col col9">
                    <div class="cell_setup">
                        <span i18n="initialSetupCalibrateAccelText"></span>
                    </div>
                </div>
            </div>
            <div class="grid-row">
                <div class="grid-col col3">
                    <div class="default_btn">
                        <div id="mag_calib_rest" v-show="!state.calibratingMag">
                            <a
                                class="calibrateMag"
                                :class="{ disabled: state.disabledMag, calibrating: state.calibratingMag }"
                                href="#"
                                @click.prevent="onCalibrateMag"
                                >{{ i18n.getMessage("initialSetupButtonCalibrateMag") }}</a
                            >
                        </div>
                        <div id="mag_calib_running" v-show="state.calibratingMag">
                            <div class="data-loading-setup">
                                <p i18n="initialSetupButtonCalibratingText"></p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="grid-col col9">
                    <div class="cell_setup">
                        <span i18n="initialSetupCalibrateMagText"></span>
                    </div>
                </div>
            </div>
            <div class="grid-row">
                <div class="grid-col col3">
                    <div class="default_btn initialSetupReset">
                        <a
                            class="resetSettings"
                            href="#"
                            @click.prevent="showConfirmReset"
                            i18n="initialSetupButtonReset"
                            >{{ i18n.getMessage("initialSetupButtonReset") }}</a
                        >
                    </div>
                </div>
                <div class="grid-col col9">
                    <div class="cell_setup initialSetupReset">
                        <span i18n="initialSetupResetText"></span>
                    </div>
                </div>
            </div>
            <div class="grid-row">
                <div class="grid-col col3">
                    <div class="default_btn initialSetupRebootBootloader">
                        <a
                            class="rebootBootloader"
                            href="#"
                            @click.prevent="onRebootBootloader"
                            i18n="initialSetupButtonRebootBootloader"
                            >{{ i18n.getMessage("initialSetupButtonRebootBootloader") }}</a
                        >
                    </div>
                </div>
                <div class="grid-col col9">
                    <div class="cell_setup initialSetupRebootBootloader">
                        <span i18n="initialSetupRebootBootloaderText"></span>
                    </div>
                </div>
            </div>
            <div class="modelwrapper"></div>
            <div class="grid-row grid-box col4">
                <div class="col-span-3 model-and-info">
                    <div id="interactive_block">
                        <div id="canvas_wrapper" class="background_paper" ref="canvasWrapper">
                            <canvas id="canvas" ref="canvas"></canvas>
                            <div class="attitude_info">
                                <dl>
                                    <dt i18n="initialSetupHeading"></dt>
                                    <dd class="heading">{{ state.attitude.heading }}</dd>
                                    <dt i18n="initialSetupPitch"></dt>
                                    <dd class="pitch">{{ state.attitude.pitch }}</dd>
                                    <dt i18n="initialSetupRoll"></dt>
                                    <dd class="roll">{{ state.attitude.roll }}</dd>
                                </dl>
                            </div>
                        </div>
                        <a
                            class="reset sm-min"
                            href="#"
                            i18n="initialSetupButtonResetZaxis"
                            @click.prevent="resetZaxis"
                            >{{ i18n.getMessage("initialSetupButtonResetZaxis") }}</a
                        >
                    </div>
                </div>
                <div class="col-span-1 grid-box col1">
                    <div class="gui_box grey instrumentsbox">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" i18n="initialSetupInstrumentsHead"></div>
                            <div class="helpicon cf_tip" i18n_title="initialSetupInstrumentsHeadHelp"></div>
                        </div>
                        <span id="attitude"></span> <span id="heading"></span>
                    </div>
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" i18n="initialSetupGPSHead"></div>
                            <div class="helpicon cf_tip" i18n_title="initialSetupGPSHeadHelp"></div>
                        </div>
                        <div class="spacer_box GPS_info">
                            <InfoGrid
                                :items="[
                                    { id: 'gps3dFix', i18n: 'gps3dFix', slotName: 'gps3dFix' },
                                    { id: 'gpsSats', i18n: 'gpsSats', value: state.gpsSats, class: 'gpsSats' },
                                    { id: 'gpsLatitude', i18n: 'gpsLatitude', slotName: 'gpsLatitude' },
                                    { id: 'gpsLongitude', i18n: 'gpsLongitude', slotName: 'gpsLongitude' },
                                ]"
                            >
                                <template #gps3dFix>
                                    <span class="colorToggle" :class="{ fix: state.gpsFix, 'no-fix': !state.gpsFix }">
                                        {{
                                            state.gpsFix
                                                ? i18n.getMessage("gpsFixTrue")
                                                : i18n.getMessage("gpsFixFalse")
                                        }}
                                    </span>
                                </template>
                                <template #gpsLatitude>
                                    <a :href="state.gpsUrl" target="_blank">{{ state.latitude }}</a>
                                </template>
                                <template #gpsLongitude>
                                    <a :href="state.gpsUrl" target="_blank">{{ state.longitude }}</a>
                                </template>
                            </InfoGrid>
                        </div>
                    </div>
                    <div class="gui_box grey sonarBox" v-show="state.showSonarBox">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" i18n="initialSetupSonarHead"></div>
                            <div class="helpicon cf_tip" i18n_title="initialSetupSonarHeadHelp"></div>
                        </div>
                        <div class="spacer_box">
                            <InfoGrid
                                :items="[
                                    {
                                        id: 'sonarAltitude',
                                        i18n: 'initialSetupAltitudeSonar',
                                        value: state.sonar,
                                        class: 'sonarAltitude',
                                    },
                                ]"
                            />
                        </div>
                    </div>
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" i18n="initialSetupInfoHead"></div>
                            <div class="helpicon cf_tip" i18n_title="initialSetupInfoHeadHelp"></div>
                        </div>
                        <div class="spacer_box">
                            <InfoGrid
                                :items="[
                                    {
                                        id: 'arming-disable-flag',
                                        i18n: 'initialSetupArmingDisableFlags',
                                        slotName: 'arming-disable-flag',
                                    },
                                    { i18n: 'initialSetupBattery', value: state.batVoltage, class: 'bat-voltage' },
                                    { i18n: 'initialSetupDrawn', value: state.batMahDrawn, class: 'bat-mah-drawn' },
                                    {
                                        i18n: 'initialSetupDrawing',
                                        value: state.batMahDrawing,
                                        class: 'bat-mah-drawing',
                                    },
                                    { i18n: 'initialSetupRSSI', value: state.rssi, class: 'rssi' },
                                    { id: 'mcu', i18n: 'initialSetupMCU', value: state.mcu, class: 'mcu' },
                                    {
                                        id: 'cpu-temp',
                                        i18n: 'initialSetupCpuTemp',
                                        value: state.cpuTemp,
                                        class: 'cpu-temp',
                                    },
                                ]"
                                gridClass="system_info"
                            >
                                <template #arming-disable-flag>
                                    <span
                                        v-for="(flag, idx) in state.armingFlags"
                                        :key="flag.id"
                                        v-show="flag.visible"
                                        class="cf_tip disarm-flag"
                                        :title="flag.tooltip"
                                        >{{ flag.name }}</span
                                    >
                                    <span v-show="state.armingAllowed" id="initialSetupArmingAllowed">{{
                                        i18n.getMessage("initialSetupArmingAllowed")
                                    }}</span>
                                </template>
                            </InfoGrid>
                        </div>
                    </div>
                    <div class="gui_box grey" id="sensorInfoBox">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" i18n="initialSensorInfoHead"></div>
                            <div class="helpicon cf_tip" i18n_title="initialSensorInfoHeadHelp"></div>
                        </div>
                        <div class="spacer_box">
                            <InfoGrid
                                :items="[
                                    {
                                        id: 'sensor_gyro_hw',
                                        i18n: 'initialSetupSensorGyro',
                                        value: state.sensorGyro,
                                        class: 'sensor_gyro_hw',
                                    },
                                    {
                                        id: 'sensor_acc_hw',
                                        i18n: 'initialSetupSensorAcc',
                                        value: state.sensorAcc,
                                        class: 'sensor_acc_hw',
                                    },
                                    {
                                        id: 'sensor-mag-hw',
                                        i18n: 'initialSetupSensorMag',
                                        value: state.sensorMag,
                                        class: 'sensor_mag_hw',
                                    },
                                    {
                                        id: 'sensor_baro_hw',
                                        i18n: 'initialSetupSensorBaro',
                                        value: state.sensorBaro,
                                        class: 'sensor_baro_hw',
                                    },
                                    {
                                        id: 'sensor-sonar-hw',
                                        i18n: 'initialSetupSensorSonar',
                                        value: state.sensorSonar,
                                        class: 'sensor_sonar_hw',
                                    },
                                    {
                                        id: 'sensor-opticalflow-hw',
                                        i18n: 'initialSetupSensorOpticalflow',
                                        value: state.sensorOpticalflow,
                                        class: 'sensor_opticalflow_hw',
                                    },
                                ]"
                            />
                        </div>
                    </div>
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" i18n="initialSetupInfoBuild"></div>
                            <div class="helpicon cf_tip" i18n_title="initialSetupInfoFirmwareHelp"></div>
                        </div>
                        <div class="spacer_box">
                            <InfoGrid
                                :items="[
                                    {
                                        id: 'api-version',
                                        i18n: 'initialSetupInfoAPIversion',
                                        value: state.apiVersion,
                                        class: 'api-version',
                                    },
                                    {
                                        id: 'build-date',
                                        i18n: 'initialSetupInfoBuildDate',
                                        value: state.buildDate,
                                        class: 'build-date',
                                    },
                                    {
                                        id: 'build-type',
                                        i18n: 'initialSetupInfoBuildType',
                                        value: state.buildType,
                                        class: 'build-type',
                                    },
                                    { id: 'build-info', i18n: 'initialSetupInfoBuildInfo', slotName: 'build-info' },
                                    {
                                        id: 'build-firmware',
                                        i18n: 'initialSetupInfoBuildFirmware',
                                        slotName: 'build-firmware',
                                    },
                                ]"
                            >
                                <template #build-info>
                                    <template v-if="state.buildInfoButtons && state.buildInfoButtons.length">
                                        <span
                                            v-for="btn in state.buildInfoButtons"
                                            :key="btn.type"
                                            class="buildInfoBtn"
                                        >
                                            <a :href="btn.href" target="_blank" :title="btn.title"
                                                ><strong>{{ btn.label }}</strong></a
                                            >
                                        </span>
                                    </template>
                                    <template v-else>
                                        <span v-html="state.buildInfoHtml"></span>
                                    </template>
                                </template>

                                <template #build-firmware>
                                    <span v-if="state.buildOptionsValid" class="buildInfoBtn">
                                        <a
                                            href="#"
                                            :title="i18n.getMessage('initialSetupInfoBuildOptionList')"
                                            @click.prevent="openBuildOptionsDialog"
                                            ><strong>{{ i18n.getMessage("initialSetupInfoBuildOptions") }}</strong></a
                                        >
                                    </span>
                                    <span v-if="state.buildKeyValid" class="buildInfoBtn">
                                        <a
                                            :href="state.buildRoot + '/hex'"
                                            target="_blank"
                                            :title="i18n.getMessage('initialSetupInfoBuildDownload')"
                                            ><strong>{{ i18n.getMessage("initialSetupInfoBuildDownload") }}</strong></a
                                        >
                                    </span>
                                </template>
                            </InfoGrid>
                        </div>
                    </div>
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" i18n="initialSetupNetworkInfo"></div>
                            <div class="helpicon cf_tip" i18n_title="initialSetupNetworkInfoHelp"></div>
                        </div>
                        <div class="spacer_box">
                            <InfoGrid
                                :items="[
                                    {
                                        id: 'network-status',
                                        i18n: 'initialSetupNetworkInfoStatus',
                                        value: state.networkStatus,
                                        class: 'network-status',
                                    },
                                    {
                                        id: 'network-type',
                                        i18n: 'initialSetupNetworkType',
                                        value: state.networkType,
                                        class: 'network-type',
                                    },
                                    {
                                        id: 'network-downlink',
                                        i18n: 'initialSetupNetworkDownlink',
                                        value: state.networkDownlink,
                                        class: 'network-downlink',
                                    },
                                    {
                                        id: 'network-rtt',
                                        i18n: 'initialSetupNetworkRtt',
                                        value: state.networkRtt,
                                        class: 'network-rtt',
                                    },
                                ]"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <dialog class="dialogConfirmReset" ref="dialogConfirmReset">
            <h3>{{ i18n.getMessage("dialogConfirmResetTitle") }}</h3>
            <div class="content">
                <div i18n="dialogConfirmResetNote" style="margin-top: 10px"></div>
            </div>
            <div class="buttons">
                <a
                    href="#"
                    class="dialogConfirmReset-confirmbtn danger-button"
                    @click.prevent="confirmReset"
                    i18n="dialogConfirmResetConfirm"
                    >{{ i18n.getMessage("dialogConfirmResetConfirm") }}</a
                >
                <a
                    href="#"
                    class="dialogConfirmReset-cancelbtn regular-button"
                    @click.prevent="cancelConfirmReset"
                    i18n="dialogConfirmResetClose"
                    >{{ i18n.getMessage("dialogConfirmResetClose") }}</a
                >
            </div>
        </dialog>

        <dialog class="dialogBuildInfo" ref="dialogBuildInfo">
            <div class="dialogBuildInfo-title"></div>
            <div class="contentBuildInfo">
                <div class="dialogBuildInfo-content" style="margin-top: 10px"></div>
            </div>
            <div class="dialogButtons">
                <a
                    href="#"
                    class="dialogBuildInfo-closebtn regular-button"
                    @click.prevent="closeBuildInfo"
                    i18n="close"
                    >{{ i18n.getMessage("close") }}</a
                >
            </div>
        </dialog>
    </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, reactive } from "vue";
import { i18n } from "../../js/localization";
import InfoGrid from "@/components/InfoGrid.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import semver from "semver";
import { useFlightControllerStore } from "../../stores/fc";
import { isExpertModeEnabled } from "../../js/utils/isExpertModeEnabled";
import GUI from "../../js/gui";
import { have_sensor } from "../../js/sensor_helpers";
import { mspHelper } from "../../js/msp/MSPHelper";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import Model from "../../js/model";
import MSPCodes from "../../js/msp/MSPCodes";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "../../js/data_storage";
import { gui_log } from "../../js/gui_log";
import { ispConnected } from "../../js/utils/connection";
import { sensorTypes } from "../../js/sensor_types";
import { addArrayElementsAfter, replaceArrayElement } from "../../js/utils/array";

const yaw_fix = ref(0);

let modelInstance = null;
// Local reactive state to replace jQuery DOM updates
const state = reactive({
    batVoltage: "0 V",
    batMahDrawn: "0 mAh",
    batMahDrawing: "0 A",
    rssi: "0 %",
    cpuTemp: "0 °C",
    armingAllowed: true,
    armingFlags: [],
    gpsFix: false,
    gpsSats: 0,
    latitude: "0",
    longitude: "0",
    sonar: "0 cm",
    mcu: "",
    sensorGyro: "",
    sensorAcc: "",
    sensorMag: "",
    sensorBaro: "",
    sensorSonar: "",
    sensorOpticalflow: "",
    apiVersion: "",
    buildDate: "",
    buildType: "",
    buildInfo: "",
    buildFirmware: "",
    networkStatus: "",
    networkType: "",
    networkDownlink: "",
    networkRtt: "",
    attitude: { roll: 0, pitch: 0, heading: 0 },
    calibratingAccel: false,
    calibratingMag: false,
    disabledAccel: false,
    disabledMag: false,
    showSonarBox: true,
    buildInfoHtml: "",
    buildOptionsValid: false,
    buildKeyValid: false,
    buildRoot: "",
    buildOptionsArray: [],
});

const fcStore = useFlightControllerStore();

const localIntervals = [];
function addLocalInterval(name, fn, period, first = false) {
    GUI.interval_add(name, fn, period, first);
    localIntervals.push(name);
}

let mountedFlag = true;
const isExpert = ref(isExpertModeEnabled());
const dialogConfirmReset = ref(null);
const dialogBuildInfo = ref(null);

function resetZaxis() {
    yaw_fix.value = fcStore.sensorData.kinematics[2] * -1;
    console.log(`YAW reset to 0 deg, fix: ${yaw_fix.value} deg`);
}

function onRebootBootloader() {
    const buffer = [];
    buffer.push(
        FC.boardHasFlashBootloader() ? mspHelper.REBOOT_TYPES.BOOTLOADER_FLASH : mspHelper.REBOOT_TYPES.BOOTLOADER,
    );
    MSP.send_message(MSPCodes.MSP_SET_REBOOT, buffer, false);
}

function onCalibrateAccel() {
    if (state.calibratingAccel || state.disabledAccel) {
        return;
    }
    state.calibratingAccel = true;
    // Pause both fast and slow setup data polling so calibration gets uninterrupted data
    GUI.interval_pause("setup_data_pull_fast");
    GUI.interval_pause("setup_data_pull_slow");
    MSP.send_message(MSPCodes.MSP_ACC_CALIBRATION, false, false, function () {
        if (!mountedFlag) {
            return;
        }
        gui_log(i18n.getMessage("initialSetupAccelCalibStarted"));
        state.calibratingAccel = true;
        state.accelRunning = true;
    });

    GUI.timeout_add(
        "button_reset",
        function () {
            // Resume both polling intervals after calibration completes
            GUI.interval_resume("setup_data_pull_fast");
            GUI.interval_resume("setup_data_pull_slow");
            gui_log(i18n.getMessage("initialSetupAccelCalibEnded"));
            state.calibratingAccel = false;
            state.accelRunning = false;
        },
        2000,
    );
}

function onCalibrateMag() {
    if (state.calibratingMag || state.disabledMag) {
        return;
    }
    state.calibratingMag = true;
    MSP.send_message(MSPCodes.MSP_MAG_CALIBRATION, false, false, function () {
        if (!mountedFlag) {
            return;
        }
        gui_log(i18n.getMessage("initialSetupMagCalibStarted"));
        state.calibratingMag = true;
        state.magRunning = true;
    });

    function magCalibResetButton() {
        // clear any running mag calibration timers
        if (magCalibInterval) {
            clearInterval(magCalibInterval);
            magCalibInterval = null;
        }
        if (magCalibTimeoutName) {
            GUI.timeout_remove(magCalibTimeoutName);
            magCalibTimeoutName = null;
        }

        gui_log(i18n.getMessage("initialSetupMagCalibEnded"));
        state.calibratingMag = false;
        state.magRunning = false;
    }

    if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
        let cycle = 0;
        const cycleMax = 45;
        const interval = 1000;
        // store the interval id so it can be cleared if the component unmounts
        magCalibInterval = setInterval(function () {
            if (cycle >= cycleMax || (fcStore.config.armingDisableFlags & (1 << 12)) === 0) {
                clearInterval(magCalibInterval);
                magCalibInterval = null;
                magCalibResetButton();
            }
            cycle++;
        }, interval);
    } else {
        // use a dedicated name so we can remove it safely on unmount
        magCalibTimeoutName = "mag_button_reset";
        GUI.timeout_add(magCalibTimeoutName, magCalibResetButton, 30000);
    }
}

function showConfirmReset() {
    if (dialogConfirmReset.value) dialogConfirmReset.value.showModal();
}

function cancelConfirmReset() {
    if (dialogConfirmReset.value) dialogConfirmReset.value.close();
}

function confirmReset() {
    if (dialogConfirmReset.value) dialogConfirmReset.value.close();
    MSP.send_message(MSPCodes.MSP_RESET_CONF, false, false, function () {
        gui_log(i18n.getMessage("initialSetupSettingsRestored"));
        GUI.tab_switch_cleanup(function () {
            // Re-initialize the Setup tab component directly (avoid legacy TABS reference)
            initialize();
        });
    });
}

function showDialogBuildInfo(title, message) {
    if (!dialogBuildInfo.value) {
        return;
    }
    const dialog = dialogBuildInfo.value;
    const titleEl = dialog.querySelector(".dialogBuildInfo-title");
    const contentEl = dialog.querySelector(".dialogBuildInfo-content");
    if (titleEl) titleEl.innerHTML = title;
    if (contentEl) contentEl.innerHTML = message;
    if (!dialog.hasAttribute("open")) dialog.showModal();
}

function closeBuildInfo() {
    if (dialogBuildInfo.value) dialogBuildInfo.value.close();
}
const canvasWrapper = ref(null);
const canvasEl = ref(null);
let boundModelResize = null;
// mag calibration timers (kept across handler scope so they can be cleared on unmount)
let magCalibInterval = null;
let magCalibTimeoutName = null;

async function initialize() {
    try {
        await MSP.promise(MSPCodes.MSP_ACC_TRIM, false);
        await MSP.promise(MSPCodes.MSP_STATUS_EX, false);
        await MSP.promise(MSPCodes.MSP2_MCU_INFO, false);
        await MSP.promise(MSPCodes.MSP_MIXER_CONFIG, false);
        await MSP.promise(MSPCodes.MSP_SENSOR_ALIGNMENT, false);
    } catch (e) {
        // preserve behavior but at least log unexpected errors
        console.warn("Error during Setup initialize sequence:", e);
    }

    // For SFC we don't need to load HTML, just process it
    process_html();
}

function process_html() {
    // translate to user-selected language
    i18n.localizePage();

    // initialize 3D Model
    initModel();

    state.attitude.roll = i18n.getMessage("initialSetupAttitude", [0]);
    state.attitude.pitch = i18n.getMessage("initialSetupAttitude", [0]);
    state.attitude.heading = i18n.getMessage("initialSetupAttitude", [0]);

    // set disabled state from sensors
    state.disabledAccel = !have_sensor(fcStore.config.activeSensors, "acc");
    state.disabledMag = !have_sensor(fcStore.config.activeSensors, "mag");

    initializeInstruments();

    // set expert mode visibility
    isExpert.value = isExpertModeEnabled();

    // no direct DOM dialog wiring here; dialogs use Vue refs and methods
    // set initial reset button label via reactive yaw value
    // reset button text will be rendered from template using `yaw_fix`

    // Using reactive state instead of cached jQuery elements

    const prepareDisarmFlags = function () {
        let disarmFlagElements = [
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

        const cfg = fcStore.config;
        if (semver.gte(cfg.apiVersion, API_VERSION_1_46)) {
            replaceArrayElement(disarmFlagElements, "RPMFILTER", "DSHOT_TELEM");
        }

        if (semver.gte(cfg.apiVersion, API_VERSION_1_47)) {
            addArrayElementsAfter(disarmFlagElements, "MOTOR_PROTOCOL", ["CRASHFLIP", "ALTHOLD", "POSHOLD"]);
        }

        // Build arming flags state instead of manipulating DOM
        state.armingFlags.length = 0;

        for (let i = 0; i < cfg.armingDisableCount; i++) {
            if (i < disarmFlagElements.length - 1) {
                const rawName = disarmFlagElements[i];
                const messageKey = `initialSetupArmingDisableFlagsTooltip${rawName}`;
                // display 'FAILSAFE MSP' for MSP flag to match desired label
                const displayName = rawName === "MSP" ? "FAILSAFE MSP" : rawName;
                state.armingFlags.push({
                    id: `initialSetupArmingDisableFlags${i}`,
                    name: displayName,
                    tooltip: i18n.getMessage(messageKey),
                    visible: false,
                });
            } else if (i == cfg.armingDisableCount - 1) {
                state.armingFlags.push({
                    id: `initialSetupArmingDisableFlags${i}`,
                    name: "ARM_SWITCH",
                    tooltip: i18n.getMessage("initialSetupArmingDisableFlagsTooltipARM_SWITCH"),
                    visible: false,
                });
            } else {
                state.armingFlags.push({ id: `initialSetupArmingDisableFlags${i}`, name: `${i + 1}`, visible: false });
            }
        }
    };

    const showSensorInfo = async function () {
        // follow legacy callback flow to request sensor config and gyro sensor when needed
        const displaySensorInfo = async function () {
            const types = await sensorTypes();

            if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
                let gyroInfoList = [];
                for (let i = 0; i < fcStore.gyroSensor.gyro_count; i++) {
                    if ((fcStore.sensorAlignment.gyro_enable_mask & (1 << i)) !== 0) {
                        gyroInfoList.push(types.gyro.elements[fcStore.gyroSensor.gyro_hardware[i]]);
                    }
                }
                state.sensorGyro = gyroInfoList.join(" ");
            } else {
                const g = fcStore.sensorConfigActive.gyro_hardware;
                state.sensorGyro =
                    g === 0xff
                        ? i18n.getMessage("initialSetupNotInBuild")
                        : have_sensor(fcStore.config.activeSensors, "gyro")
                            ? types.gyro.elements[g]
                            : i18n.getMessage("initialSetupNotDetected");
            }

            const a = fcStore.sensorConfigActive.acc_hardware;
            if (a === 0xff) {
                state.sensorAcc = i18n.getMessage("initialSetupNotInBuild");
            } else if (!have_sensor(fcStore.config.activeSensors, "acc")) {
                state.sensorAcc = i18n.getMessage("initialSetupNotDetected");
            } else {
                let name = types.acc.elements[a] || "AUTO";
                if (
                    (name === "AUTO" || name === "DEFAULT") &&
                    fcStore.sensorNames &&
                    fcStore.sensorNames.acc &&
                    fcStore.sensorNames.acc[a]
                ) {
                    name = fcStore.sensorNames.acc[a];
                }
                state.sensorAcc = name;
            }

            const b = fcStore.sensorConfigActive.baro_hardware;
            if (b === 0xff) {
                state.sensorBaro = i18n.getMessage("initialSetupNotInBuild");
            } else if (!have_sensor(fcStore.config.activeSensors, "baro")) {
                state.sensorBaro = i18n.getMessage("initialSetupNotDetected");
            } else {
                let nameB = types.baro.elements[b] || "DEFAULT";
                if (
                    (nameB === "AUTO" || nameB === "DEFAULT") &&
                    fcStore.sensorNames &&
                    fcStore.sensorNames.baro &&
                    fcStore.sensorNames.baro[b]
                ) {
                    nameB = fcStore.sensorNames.baro[b];
                }
                state.sensorBaro = nameB;
            }

            const m = fcStore.sensorConfigActive.mag_hardware;
            state.sensorMag =
                m === 0xff
                    ? i18n.getMessage("initialSetupNotInBuild")
                    : have_sensor(fcStore.config.activeSensors, "mag")
                        ? types.mag.elements[m]
                        : i18n.getMessage("initialSetupNotDetected");

            const s = fcStore.sensorConfigActive.sonar_hardware;
            state.sensorSonar =
                s === 0xff
                    ? i18n.getMessage("initialSetupNotInBuild")
                    : have_sensor(fcStore.config.activeSensors, "sonar")
                        ? types.sonar.elements[s]
                        : i18n.getMessage("initialSetupNotDetected");

            if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
                const o = fcStore.sensorConfigActive.opticalflow_hardware;
                state.sensorOpticalflow =
                    o === 0xff
                        ? i18n.getMessage("initialSetupNotInBuild")
                        : have_sensor(fcStore.config.activeSensors, "opticalflow")
                            ? types.opticalflow.elements[o]
                            : i18n.getMessage("initialSetupNotDetected");
            }
        };

        MSP.send_message(MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE, false, false, function () {
            if (semver.lt(fcStore.config.apiVersion, API_VERSION_1_47)) {
                displaySensorInfo();
            } else {
                MSP.send_message(MSPCodes.MSP2_GYRO_SENSOR, false, false, function () {
                    displaySensorInfo();
                });
            }
        });
    };

    const hideSensorInfo = function () {
        state.sensorGyro = i18n.getMessage("initialSetupNotInBuild");
        state.sensorAcc = i18n.getMessage("initialSetupNotInBuild");
        state.sensorBaro = i18n.getMessage("initialSetupNotInBuild");
        state.sensorMag = i18n.getMessage("initialSetupNotInBuild");
        state.sensorSonar = i18n.getMessage("initialSetupNotInBuild");
        state.sensorOpticalflow = i18n.getMessage("initialSetupNotInBuild");
    };

    const showBuildType = function () {
        state.buildType =
            fcStore.config.buildKey.length === 32
                ? i18n.getMessage("initialSetupInfoBuildCloud")
                : i18n.getMessage("initialSetupInfoBuildLocal");
    };

    const hideBuildType = function () {
        state.buildType = "";
    };

    const getBuildRootBaseUri = function () {
        return `https://build.betaflight.com/api/builds/${fcStore.config.buildKey}`;
    };

    const showBuildInfo = function () {
        const isIspConnected = ispConnected();
        const buildKeyValid = fcStore.config.buildKey.length === 32;
        const buildRoot = getBuildRootBaseUri();
        state.buildKeyValid = buildKeyValid;
        state.buildRoot = buildRoot;

        // prefer rendering buttons via Vue template to ensure styles apply
        if (buildKeyValid && isIspConnected) {
            state.buildInfoButtons = [
                {
                    type: "log",
                    href: `${buildRoot}/log`,
                    title: `${i18n.getMessage("initialSetupInfoBuildLog")}: ${buildRoot}/log`,
                    label: i18n.getMessage("initialSetupInfoBuildLog"),
                },
                {
                    type: "config",
                    href: `${buildRoot}/json`,
                    title: `${i18n.getMessage("initialSetupInfoBuildConfig")}: ${buildRoot}/json`,
                    label: i18n.getMessage("initialSetupInfoBuildConfig"),
                },
            ];
            state.buildInfoHtml = "";
        } else {
            state.buildInfoButtons = [];
            state.buildInfoHtml = isIspConnected
                ? i18n.getMessage("initialSetupNoBuildInfo")
                : i18n.getMessage("initialSetupNotOnline");
        }
    };

    // removed unused hideBuildInfo function to reduce unused code warnings
    // kept behavior inline where needed

    const showBuildFirmware = function () {
        const isIspConnected = ispConnected();
        const buildOptionsValid =
            ((semver.eq(fcStore.config.apiVersion, API_VERSION_1_45) && isIspConnected) ||
                semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) &&
            fcStore.config.buildOptions.length;
        const buildKeyValid = fcStore.config.buildKey.length === 32;
        const buildRoot = getBuildRootBaseUri();

        state.buildOptionsValid = !!buildOptionsValid;
        state.buildKeyValid = !!buildKeyValid;
        state.buildRoot = buildRoot;
        state.buildOptionsArray = buildOptionsValid ? fcStore.config.buildOptions : [];
    };

    function showFirmwareInfo() {
        state.apiVersion = fcStore.config.apiVersion;
        state.buildDate = fcStore.config.buildInfo;

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            showBuildType();
            showBuildInfo();
            showBuildFirmware();
        } else {
            hideBuildType();
            state.buildInfoHtml = "";
            state.buildOptionsValid = false;
            state.buildKeyValid = false;
        }
    }

    function showNetworkStatus() {
        const networkStatus = ispConnected();

        let statusText = "";

        const connection = navigator.connection;
        const type = connection?.effectiveType || "Unknown";
        const downlink = connection?.downlink || "Unknown";
        const rtt = connection?.rtt || "Unknown";

        if (!networkStatus || !navigator.onLine || type === "none") {
            statusText = i18n.getMessage("initialSetupNetworkInfoStatusOffline");
        } else if (type === "slow-2g" || type === "2g" || downlink < 0.115 || rtt > 1000) {
            statusText = i18n.getMessage("initialSetupNetworkInfoStatusSlow");
        } else {
            statusText = i18n.getMessage("initialSetupNetworkInfoStatusOnline");
        }

        state.networkStatus = statusText;
        state.networkType = type;
        state.networkDownlink = `${downlink} Mbps`;
        state.networkRtt = `${rtt} ms`;
    }

    prepareDisarmFlags();
    if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
        showSensorInfo();
    } else {
        hideSensorInfo();
    }
    showFirmwareInfo();
    showNetworkStatus();

    if (!have_sensor(fcStore.config.activeSensors, "sonar")) {
        state.showSonarBox = false;
    }

    function get_slow_data() {
        state.armingAllowed = fcStore.config.armingDisableFlags === 0;

        for (let i = 0; i < fcStore.config.armingDisableCount; i++) {
            if (state.armingFlags[i])
                state.armingFlags[i].visible = (fcStore.config.armingDisableFlags & (1 << i)) !== 0;
        }

        state.batVoltage = i18n.getMessage("initialSetupBatteryValue", [FC.ANALOG.voltage]);
        state.batMahDrawn = i18n.getMessage("initialSetupBatteryMahValue", [FC.ANALOG.mAhdrawn]);
        state.batMahDrawing = i18n.getMessage("initialSetupBatteryAValue", [FC.ANALOG.amperage.toFixed(2)]);
        state.rssi = i18n.getMessage("initialSetupRSSIValue", [((FC.ANALOG.rssi / 1023) * 100).toFixed(0)]);

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46) && fcStore.config.cpuTemp) {
            state.cpuTemp = `${fcStore.config.cpuTemp.toFixed(0)} \u2103`;
        } else {
            state.cpuTemp = i18n.getMessage("initialSetupCpuTempNotSupported");
        }

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            state.mcu = fcStore.mcuInfo.name;
        } else {
            state.mcu = "";
        }

        state.gpsFix = fcStore.gpsData.fix !== 0;
        state.gpsSats = fcStore.gpsData.numSat;

        const latitude = fcStore.gpsData.latitude / 10000000;
        const longitude = fcStore.gpsData.longitude / 10000000;
        const url = `https://maps.google.com/?q=${latitude},${longitude}`;
        const gpsUnitText = i18n.getMessage("gpsPositionUnit");
        state.latitude = `${latitude.toFixed(4)} ${gpsUnitText}`;
        state.longitude = `${longitude.toFixed(4)} ${gpsUnitText}`;
        state.gpsUrl = url;
    }

    function get_fast_data() {
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, function () {
            if (!mountedFlag) {
                return;
            }
            state.attitude.roll = i18n.getMessage("initialSetupAttitude", [fcStore.sensorData.kinematics[0]]);
            state.attitude.pitch = i18n.getMessage("initialSetupAttitude", [fcStore.sensorData.kinematics[1]]);
            state.attitude.heading = i18n.getMessage("initialSetupAttitude", [fcStore.sensorData.kinematics[2]]);

            renderModel();
            // updateInstruments is defined in initializeInstruments
            if (typeof window.updateInstruments === "function") window.updateInstruments();
        });

        if (have_sensor(fcStore.config.activeSensors, "sonar")) {
            MSP.send_message(MSPCodes.MSP_SONAR, false, false, function () {
                if (!mountedFlag) {
                    return;
                }
                state.sonar = `${fcStore.sensorData.sonar.toFixed(1)} cm`;
            });
        }
    }

    addLocalInterval("setup_data_pull_fast", get_fast_data, 33, true);
    addLocalInterval("setup_data_pull_slow", get_slow_data, 250, true);

    // notify GUI that content is ready
    GUI.content_ready(() => {});
}

function initializeInstruments() {
    const options = { size: 90, showBox: false, img_directory: "images/flightindicators/" };
    const attitude = $.flightIndicator("#attitude", "attitude", options);
    const heading = $.flightIndicator("#heading", "heading", options);

    // expose update function similar to legacy behavior
    window.updateInstruments = function () {
        attitude.setRoll(fcStore.sensorData.kinematics[0]);
        attitude.setPitch(fcStore.sensorData.kinematics[1]);
        heading.setHeading(fcStore.sensorData.kinematics[2]);
    };
}

function initModel() {
    // Use DOM refs for the model canvas and wrapper
    const wrapperDom = canvasWrapper.value || document.querySelector(".model-and-info #canvas_wrapper");
    const canvasDom = canvasEl.value || document.querySelector(".model-and-info #canvas");
    const wrapper = $(wrapperDom);
    const canvas = $(canvasDom);
    modelInstance = new Model(wrapper, canvas);
    boundModelResize = modelInstance.resize.bind(modelInstance);
    window.addEventListener("resize", boundModelResize);
}

function renderModel() {
    if (!modelInstance) {
        return;
    }
    const x = fcStore.sensorData.kinematics[1] * -1 * 0.017453292519943295;
    const y = (fcStore.sensorData.kinematics[2] * -1 - yaw_fix.value) * 0.017453292519943295;
    const z = fcStore.sensorData.kinematics[0] * -1 * 0.017453292519943295;
    modelInstance.rotateTo(x, y, z);
}

function cleanup() {
    if (modelInstance) {
        if (boundModelResize) {
            window.removeEventListener("resize", boundModelResize);
            boundModelResize = null;
        }
        if (typeof modelInstance.dispose === "function") modelInstance.dispose();
        modelInstance = null;
    }
}

onMounted(() => {
    // start the MSP initialization chain
    mountedFlag = true;
    initialize();
});

onBeforeUnmount(() => {
    mountedFlag = false;
    cleanup();
    // clear intervals used by this tab
    try {
        for (const name of localIntervals) {
            GUI.interval_remove(name);
        }
    } catch (e) {
        // preserve existing behavior but at least log unexpected errors
        console.warn("Error clearing local intervals:", e);
    }

    // ensure mag calibration timers are cleared to avoid callbacks after unmount
    if (magCalibInterval) {
        clearInterval(magCalibInterval);
        magCalibInterval = null;
    }
    if (magCalibTimeoutName) {
        GUI.timeout_remove(magCalibTimeoutName);
        magCalibTimeoutName = null;
    }
});

function openBuildOptionsDialog() {
    if (!state.buildOptionsArray || state.buildOptionsArray.length === 0) {
        return;
    }
    let buildOptionList = `<div class="dialogBuildInfoGrid-container">`;
    for (const buildOptionElement of state.buildOptionsArray) {
        buildOptionList += `<div class="dialogBuildInfoGrid-item">${buildOptionElement}</div>`;
    }
    buildOptionList += `</div>`;

    showDialogBuildInfo(`<h3>${i18n.getMessage("initialSetupInfoBuildOptionList")}</h3>`, buildOptionList);
}
</script>

<style lang="less" scoped>
.tab-setup {
    #interactive_block {
        position: relative;
        background-color: var(--surface-200);
        border-radius: 1rem;
        border: 2px solid var(--surface-400);
        a.reset {
            position: absolute;
            display: block;
            top: 1rem;
            right: 1rem;
            border-radius: 0.5rem;
            bottom: 10px;
            height: 28px;
            line-height: 28px;
            padding: 0 15px 0 15px;
            text-align: center;
            font-weight: bold;
            background-color: var(--surface-400);
            z-index: 100;
            &:hover {
                background-color: var(--surface-500);
            }
        }
    }
    .model-and-info {
        margin-top: 0.75rem;

        #canvas_wrapper {
            position: relative;
            width: 100%;
            height: 100%;
            max-height: 32rem;
            top: 0;
            left: 0;
            border-radius: 1rem;
        }
    }
    @media only screen and (max-width: 1055px) {
        .grid-box {
            grid-template-columns: 1fr !important;
        }
        .col-span-3 {
            display: grid !important;
            grid-column: span 1 !important;
        }
        .col-span-1 {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
        }
        #canvas_wrapper {
            max-height: 20rem !important;
        }
    }

    @media all and (max-width: 575px) {
        .grid-box {
            grid-template-columns: 1fr !important;
        }
    }
    .instrumentsbox {
        flex-direction: row;
        justify-content: center;
    }

    .system_info {
        td {
            width: 50%;
            vertical-align: baseline;
        }
    }
}
#accel_calib_running {
    width: 100%;
    position: relative;
    padding: 5px 0 5px 0;
    text-align: center;
    background-color: var(--surface-300);
    border-radius: 0.5rem;
    border: 1px solid var(--primary-500);
    color: var(--primary-500);
    font-weight: bold;
    font-size: 12px;
    line-height: 13px;
    transition: all ease 0.2s;
    text-decoration: none;
}
#mag_calib_running {
    width: 100%;
    position: relative;
    padding: 5px 0 5px 0;
    text-align: center;
    background-color: var(--surface-300);
    border-radius: 0.5rem;
    border: 1px solid var(--primary-500);
    color: var(--primary-500);
    font-weight: bold;
    font-size: 12px;
    line-height: 13px;
    transition: all ease 0.2s;
    text-decoration: none;
}
#canvas {
    width: 100% !important;
    height: 100% !important;
}
.attitude_info {
    position: absolute;
    top: 1rem;
    left: 1rem;
    margin: 0;
    font-weight: normal;
    color: var(--surface-950);
    dl {
        display: grid;
        grid-template-columns: 1fr 1fr;
    }
}
.dialogBuildInfo {
    transition: all 0.2s;
    overflow-x: hidden;
    overflow-y: auto;
    width: min-content;
    height: min-content;
}
.dialogBuildInfoGrid-container {
    display: grid;
    grid-template-columns: auto auto;
    grid-gap: 5px;
}
.dialogBuildInfoGrid-item {
    padding: 5px 5px 3px 5px;
    user-select: text;
}
.block.info {
    .fields {
        padding: 5px 5px 3px 5px;
    }
    dt {
        width: 99px;
        height: 20px;
        line-height: 20px;
    }
    dd {
        width: 76px;
        height: 20px;
        line-height: 20px;
        margin-left: 99px;
    }
}
.block.gps {
    width: 185px;
    margin-bottom: 10px;
    .fields {
        padding: 5px 5px 3px 5px;
    }
    dt {
        width: 85px;
        height: 20px;
        margin-bottom: 2px;
        line-height: 20px;
    }
}
.block.instruments {
    width: 285px;
    align-content: center;
    text-align: center;
}
.buttons {
    bottom: 20px;
}
.disarm-flag {
    padding-right: 5px;
}

/* semantic label/value grid used to replace layout tables for accessibility */
.cf-info-grid {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    align-items: center;
    width: 100%;
}
.cf-info-grid dt {
    font-weight: bold;
    margin: 0;
}
.cf-info-grid dd {
    margin: 0;
}
</style>
