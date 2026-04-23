<template>
    <BaseTab tab-name="setup">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabSetup") }}</div>
            <WikiButton docUrl="setup" />
            <!-- Top: 3D Model + Instruments & Calibration side-by-side -->
            <div class="setup-top">
                <div class="model-and-info">
                    <div id="interactive_block">
                        <div id="canvas_wrapper" class="background_paper" ref="canvasWrapper">
                            <canvas id="canvas" ref="canvasEl"></canvas>
                            <div class="attitude_info">
                                <dl>
                                    <dt>{{ $t("initialSetupHeading") }}</dt>
                                    <dd class="heading">{{ state.attitude.heading }}</dd>
                                    <dt>{{ $t("initialSetupPitch") }}</dt>
                                    <dd class="pitch">{{ state.attitude.pitch }}</dd>
                                    <dt>{{ $t("initialSetupRoll") }}</dt>
                                    <dd class="roll">{{ state.attitude.roll }}</dd>
                                </dl>
                            </div>
                        </div>
                        <UButton
                            class="reset-zaxis sm-min"
                            :label="$t('initialSetupButtonResetZaxisValue', { 1: yaw_fix })"
                            color="neutral"
                            variant="subtle"
                            @click="resetZaxis"
                        />
                    </div>
                </div>
                <div class="setup-sidebar">
                    <UiBox
                        :title="$t('initialSetupInstrumentsHead')"
                        :help="$t('initialSetupInstrumentsHeadHelp')"
                        type="neutral"
                    >
                        <div class="flex flex-row justify-center gap-2">
                            <span id="attitude"></span>
                            <span id="heading"></span>
                        </div>
                    </UiBox>
                    <div class="flex flex-col gap-2">
                        <UButton
                            :label="
                                state.calibratingAccel
                                    ? $t('initialSetupButtonCalibratingText')
                                    : $t('initialSetupButtonCalibrateAccel')
                            "
                            :disabled="state.disabledAccel"
                            :loading="state.calibratingAccel"
                            class="w-full justify-center"
                            @click="onCalibrateAccel"
                        >
                            <template #trailing>
                                <HelpIcon :text="$t('initialSetupCalibrateAccelText')" />
                            </template>
                        </UButton>
                        <UButton
                            :label="
                                state.calibratingMag
                                    ? $t('initialSetupButtonCalibratingText')
                                    : $t('initialSetupButtonCalibrateMag')
                            "
                            :disabled="state.disabledMag"
                            :loading="state.calibratingMag"
                            class="w-full justify-center"
                            @click="onCalibrateMag"
                        >
                            <template #trailing>
                                <HelpIcon :text="$t('initialSetupCalibrateMagText')" />
                            </template>
                        </UButton>
                        <div v-show="isExpert">
                            <UButton
                                :label="$t('initialSetupButtonReset')"
                                color="error"
                                class="w-full justify-center"
                                @click="showConfirmReset"
                            >
                                <template #trailing>
                                    <HelpIcon :text="$t('initialSetupResetText')" />
                                </template>
                            </UButton>
                        </div>
                        <div v-show="isExpert">
                            <UButton
                                :label="$t('initialSetupButtonRebootBootloader')"
                                color="error"
                                class="w-full justify-center"
                                @click="onRebootBootloader"
                            >
                                <template #trailing>
                                    <HelpIcon :text="$t('initialSetupRebootBootloaderText')" />
                                </template>
                            </UButton>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Info panels in responsive multi-column grid -->
            <div class="setup-info-grid">
                <UiBox :title="$t('initialSetupInfoHead')" :help="$t('initialSetupInfoHeadHelp')" type="neutral">
                    <InfoGrid
                        :items="[
                            {
                                id: 'arming-disable-flag',
                                i18n: 'initialSetupArmingDisableFlags',
                                slotName: 'arming-disable-flag',
                            },
                            {
                                i18n: 'initialSetupBattery',
                                value: state.batVoltage,
                                class: 'bat-voltage',
                            },
                            {
                                i18n: 'initialSetupDrawn',
                                value: state.batMahDrawn,
                                class: 'bat-mah-drawn',
                            },
                            {
                                i18n: 'initialSetupDrawing',
                                value: state.batMahDrawing,
                                class: 'bat-mah-drawing',
                            },
                            { i18n: 'initialSetupRSSI', value: state.rssi, class: 'rssi' },
                            {
                                id: 'mcu',
                                i18n: 'initialSetupMCU',
                                value: state.mcu,
                                class: 'mcu',
                            },
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
                            <template v-for="flag in fcStore.armingFlags" :key="flag.id">
                                <UTooltip v-if="flag.visible" :text="flag.tooltip">
                                    <span class="disarm-flag">{{ flag.name }}</span>
                                </UTooltip>
                            </template>
                            <span v-show="fcStore.isReadyToArm" id="initialSetupArmingAllowed">{{
                                $t("initialSetupArmingAllowed")
                            }}</span>
                        </template>
                    </InfoGrid>
                </UiBox>
                <UiBox
                    :title="$t('initialSensorInfoHead')"
                    :help="$t('initialSensorInfoHeadHelp')"
                    type="neutral"
                    id="sensorInfoBox"
                >
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
                </UiBox>
                <UiBox :title="$t('initialSetupGPSHead')" :help="$t('initialSetupGPSHeadHelp')" type="neutral">
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
                                {{ state.gpsFix ? $t("gpsFixTrue") : $t("gpsFixFalse") }}
                            </span>
                        </template>
                        <template #gpsLatitude>
                            <a :href="state.gpsUrl" target="_blank">{{ state.latitude }}</a>
                        </template>
                        <template #gpsLongitude>
                            <a :href="state.gpsUrl" target="_blank">{{ state.longitude }}</a>
                        </template>
                    </InfoGrid>
                </UiBox>
                <UiBox :title="$t('initialSetupInfoBuild')" :help="$t('initialSetupInfoFirmwareHelp')" type="neutral">
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
                            {
                                id: 'build-info',
                                i18n: 'initialSetupInfoBuildInfo',
                                slotName: 'build-info',
                            },
                            {
                                id: 'build-firmware',
                                i18n: 'initialSetupInfoBuildFirmware',
                                slotName: 'build-firmware',
                            },
                        ]"
                    >
                        <template #build-info>
                            <template v-if="state.buildInfoButtons && state.buildInfoButtons.length">
                                <span v-for="btn in state.buildInfoButtons" :key="btn.type" class="buildInfoBtn">
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
                                    :title="$t('initialSetupInfoBuildOptionList')"
                                    @click.prevent="openBuildOptionsDialog"
                                    ><strong>{{ $t("initialSetupInfoBuildOptions") }}</strong></a
                                >
                            </span>
                            <span v-if="state.buildKeyValid" class="buildInfoBtn">
                                <a
                                    :href="state.buildRoot + '/hex'"
                                    target="_blank"
                                    :title="$t('initialSetupInfoBuildDownload')"
                                    ><strong>{{ $t("initialSetupInfoBuildDownload") }}</strong></a
                                >
                            </span>
                        </template>
                    </InfoGrid>
                </UiBox>
                <UiBox
                    v-show="state.showSonarBox"
                    :title="$t('initialSetupSonarHead')"
                    :help="$t('initialSetupSonarHeadHelp')"
                    type="neutral"
                >
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
                </UiBox>
            </div>
        </div>

        <dialog class="dialogConfirmReset" ref="dialogConfirmReset">
            <h3>{{ $t("dialogConfirmResetTitle") }}</h3>
            <div class="content">
                <div style="margin-top: 10px">{{ $t("dialogConfirmResetNote") }}</div>
            </div>
            <div class="buttons">
                <UButton :label="$t('dialogConfirmResetConfirm')" color="error" @click="confirmReset" />
                <UButton
                    :label="$t('dialogConfirmResetClose')"
                    color="neutral"
                    variant="outline"
                    @click="cancelConfirmReset"
                />
            </div>
        </dialog>

        <dialog class="dialogBuildInfo" ref="dialogBuildInfo">
            <h3>{{ state.buildInfoDialogTitle }}</h3>
            <div class="contentBuildInfo">
                <div class="dialogBuildInfoGrid-container" style="margin-top: 10px">
                    <div v-for="option in state.sortedBuildOptions" :key="option" class="dialogBuildInfoGrid-item">
                        {{ option }}
                    </div>
                </div>
            </div>
            <div class="dialogButtons">
                <UButton :label="$t('close')" color="neutral" variant="outline" @click="closeBuildInfo" />
            </div>
        </dialog>
    </BaseTab>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, reactive, watch } from "vue";
import { useTranslation } from "i18next-vue";
import { i18n } from "../../js/localization";
import BaseTab from "./BaseTab.vue";
import UiBox from "../elements/UiBox.vue";
import InfoGrid from "@/components/InfoGrid.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import HelpIcon from "@/components/elements/HelpIcon.vue";
import semver from "semver";
import { useFlightControllerStore } from "../../stores/fc";
import { isExpertModeEnabled } from "../../js/utils/isExpertModeEnabled";
import { EventBus } from "@/components/eventBus";
import GUI from "../../js/gui";
import { useInterval } from "../../composables/useInterval";
import { useTimeout } from "../../composables/useTimeout";
import { have_sensor } from "../../js/sensor_helpers";
import { mspHelper } from "../../js/msp/MSPHelper";
import MSP from "../../js/msp";
import Model from "../../js/model";
import MSPCodes from "../../js/msp/MSPCodes";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "../../js/data_storage";
import { gui_log } from "../../js/gui_log";
import { ispConnected } from "../../js/utils/connection";
import { sensorTypes } from "../../js/sensor_types";
import { addArrayElementsAfter, replaceArrayElement } from "../../js/utils/array";
import { flightIndicator } from "../../../libraries/flightIndicators";

const { t } = useTranslation();

const yaw_fix = ref(0);

let modelInstance = null;
// Local reactive state to replace jQuery DOM updates
const state = reactive({
    batVoltage: "0 V",
    batMahDrawn: "0 mAh",
    batMahDrawing: "0 A",
    rssi: "0 %",
    cpuTemp: "0 °C",
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
    buildInfoDialogTitle: "",
    sortedBuildOptions: [],
});

const fcStore = useFlightControllerStore();

const disarmFlagElements = [
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

const prepareDisarmFlags = function () {
    const cfg = fcStore.config;
    const elements = [...disarmFlagElements];

    if (semver.gte(cfg.apiVersion, API_VERSION_1_46)) {
        replaceArrayElement(elements, "RPMFILTER", "DSHOT_TELEM");
    }

    if (semver.gte(cfg.apiVersion, API_VERSION_1_47)) {
        addArrayElementsAfter(elements, "MOTOR_PROTOCOL", ["CRASHFLIP", "ALTHOLD", "POSHOLD"]);
    }

    // Build arming flags state instead of manipulating DOM
    const flags = Array.from({ length: cfg.armingDisableCount }, (_, i) => {
        const isLastBit = i === cfg.armingDisableCount - 1;
        const knownName = elements[i];

        // 1. Determine the raw name and whether it is a fallback numeric ID
        // We prioritize the "ARM_SWITCH" for the last bit, then known elements, then numeric fallback.
        let rawName;
        let isFallback = false;

        if (isLastBit) {
            rawName = "ARM_SWITCH";
        } else if (knownName) {
            rawName = knownName;
        } else {
            rawName = `${i + 1}`;
            isFallback = true;
        }

        // 2. Handle display name overrides (e.g., RX_FAILSAFE -> RXLOSS)
        const nameMap = { RX_FAILSAFE: "RXLOSS", NOT_DISARMED: "BAD_RX_RECOVERY" };
        const displayName = nameMap[rawName] || rawName;

        // 3. Construct tooltip, if it's a fallback, we use the base key; otherwise, we append the rawName.
        const messageKey = isFallback
            ? "initialSetupArmingDisableFlagsTooltip"
            : `initialSetupArmingDisableFlagsTooltip${rawName}`;

        return reactive({
            id: `initialSetupArmingDisableFlags${i}`,
            name: displayName,
            tooltip: t(messageKey),
            visible: false,
        });
    });

    fcStore.setArmingFlags(flags);

    // Initial update
    fcStore.updateArmingFlags(cfg.armingDisableFlags);
};

// Watch for armingDisableCount changes to rebuild the arming flags array
const stopArmingCount = watch(
    () => fcStore.config.armingDisableCount,
    (newCount) => {
        if (newCount > 0) {
            prepareDisarmFlags();
        }
    },
);

const stopArmingFlags = watch(
    () => fcStore.config.armingDisableFlags,
    (newVal) => {
        fcStore.updateArmingFlags(newVal);
    },
);

if (fcStore.config.armingDisableCount > 0) {
    prepareDisarmFlags();
}

const { addInterval, removeAllIntervals } = useInterval();
const { addTimeout, removeTimeout } = useTimeout();

const updateExpertMode = (enabled) => {
    isExpert.value = enabled;
};

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
        fcStore.boardHasFlashBootloader() ? mspHelper.REBOOT_TYPES.BOOTLOADER_FLASH : mspHelper.REBOOT_TYPES.BOOTLOADER,
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
        if (mountedFlag) {
            gui_log(t("initialSetupAccelCalibStarted"));
            state.calibratingAccel = true;
            state.accelRunning = true;
        }
    });

    addTimeout(
        "button_reset",
        function () {
            if (mountedFlag) {
                // Resume both polling intervals after calibration completes
                GUI.interval_resume("setup_data_pull_fast");
                GUI.interval_resume("setup_data_pull_slow");
                gui_log(t("initialSetupAccelCalibEnded"));
                state.calibratingAccel = false;
                state.accelRunning = false;
            }
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
        if (mountedFlag) {
            gui_log(t("initialSetupMagCalibStarted"));
            state.calibratingMag = true;
            state.magRunning = true;
        }
    });

    function magCalibResetButton() {
        // clear any running mag calibration timers
        if (magCalibInterval) {
            clearInterval(magCalibInterval);
            magCalibInterval = null;
        }
        if (magCalibTimeoutName) {
            removeTimeout(magCalibTimeoutName);
            magCalibTimeoutName = null;
        }

        gui_log(t("initialSetupMagCalibEnded"));
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
        addTimeout(magCalibTimeoutName, magCalibResetButton, 30000);
    }
}

function showConfirmReset() {
    if (dialogConfirmReset.value) {
        dialogConfirmReset.value.showModal();
    }
}

function cancelConfirmReset() {
    if (dialogConfirmReset.value) {
        dialogConfirmReset.value.close();
    }
}

function confirmReset() {
    if (dialogConfirmReset.value) {
        dialogConfirmReset.value.close();
    }
    MSP.send_message(MSPCodes.MSP_RESET_CONF, false, false, function () {
        gui_log(t("initialSetupSettingsRestored"));
        GUI.tab_switch_cleanup(function () {
            // Re-initialize the Setup tab component directly (avoid legacy TABS reference)
            initialize();
        });
    });
}

function closeBuildInfo() {
    if (dialogBuildInfo.value) {
        dialogBuildInfo.value.close();
    }
}

const canvasWrapper = ref(null);
const canvasEl = ref(null);
let boundModelResize = null;
// mag calibration timers (kept across handler scope so they can be cleared on unmount)
let magCalibInterval = null;
let magCalibTimeoutName = null;

async function initialize() {
    cleanup();
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

    state.attitude.roll = t("initialSetupAttitude", { 1: (0).toFixed(1) });
    state.attitude.pitch = t("initialSetupAttitude", { 1: (0).toFixed(1) });
    state.attitude.heading = t("initialSetupAttitude", { 1: (0).toFixed(1) });

    // set disabled state from sensors
    state.disabledAccel = !have_sensor(fcStore.config.activeSensors, "acc");
    state.disabledMag = !have_sensor(fcStore.config.activeSensors, "mag");

    initializeInstruments();

    // set expert mode visibility
    isExpert.value = isExpertModeEnabled();

    // no direct DOM dialog wiring here; dialogs use Vue refs and methods

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
                    ? t("initialSetupNotInBuild")
                    : have_sensor(fcStore.config.activeSensors, "gyro")
                        ? types.gyro.elements[g]
                        : t("initialSetupNotDetected");
        }

        const a = fcStore.sensorConfigActive.acc_hardware;
        if (a === 0xff) {
            state.sensorAcc = t("initialSetupNotInBuild");
        } else if (!have_sensor(fcStore.config.activeSensors, "acc")) {
            state.sensorAcc = t("initialSetupNotDetected");
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
            state.sensorBaro = t("initialSetupNotInBuild");
        } else if (!have_sensor(fcStore.config.activeSensors, "baro")) {
            state.sensorBaro = t("initialSetupNotDetected");
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
                ? t("initialSetupNotInBuild")
                : have_sensor(fcStore.config.activeSensors, "mag")
                    ? types.mag.elements[m]
                    : t("initialSetupNotDetected");

        const s = fcStore.sensorConfigActive.sonar_hardware;
        state.sensorSonar =
            s === 0xff
                ? t("initialSetupNotInBuild")
                : have_sensor(fcStore.config.activeSensors, "sonar")
                    ? types.sonar.elements[s]
                    : t("initialSetupNotDetected");

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            const o = fcStore.sensorConfigActive.opticalflow_hardware;
            state.sensorOpticalflow =
                o === 0xff
                    ? t("initialSetupNotInBuild")
                    : have_sensor(fcStore.config.activeSensors, "opticalflow")
                        ? types.opticalflow.elements[o]
                        : t("initialSetupNotDetected");
        } else {
            state.sensorOpticalflow = t("initialSetupNotInBuild");
        }
    };

    const showSensorInfo = async function () {
        await MSP.promise(MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE, false);
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            await MSP.promise(MSPCodes.MSP2_GYRO_SENSOR, false);
        }
        await displaySensorInfo();
    };

    const hideSensorInfo = function () {
        state.sensorGyro = t("initialSetupNotInBuild");
        state.sensorAcc = t("initialSetupNotInBuild");
        state.sensorBaro = t("initialSetupNotInBuild");
        state.sensorMag = t("initialSetupNotInBuild");
        state.sensorSonar = t("initialSetupNotInBuild");
        state.sensorOpticalflow = t("initialSetupNotInBuild");
    };

    const showBuildType = function () {
        state.buildType =
            fcStore.config.buildKey.length === 32 ? t("initialSetupInfoBuildCloud") : t("initialSetupInfoBuildLocal");
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
                    title: `${t("initialSetupInfoBuildLog")}: ${buildRoot}/log`,
                    label: t("initialSetupInfoBuildLog"),
                },
                {
                    type: "config",
                    href: `${buildRoot}/json`,
                    title: `${t("initialSetupInfoBuildConfig")}: ${buildRoot}/json`,
                    label: t("initialSetupInfoBuildConfig"),
                },
            ];
            state.buildInfoHtml = "";
        } else {
            state.buildInfoButtons = [];
            state.buildInfoHtml = isIspConnected ? t("initialSetupNoBuildInfo") : t("initialSetupNotOnline");
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

    prepareDisarmFlags();
    if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
        showSensorInfo();
    } else {
        hideSensorInfo();
    }
    showFirmwareInfo();

    if (!have_sensor(fcStore.config.activeSensors, "sonar")) {
        state.showSonarBox = false;
    }

    function get_slow_data() {
        fcStore.updateArmingFlags(fcStore.config.armingDisableFlags);

        state.batVoltage = t("initialSetupBatteryValue", { 1: fcStore.analogData.voltage });
        state.batMahDrawn = t("initialSetupBatteryMahValue", { 1: fcStore.analogData.mAhdrawn });
        state.batMahDrawing = t("initialSetupBatteryAValue", { 1: fcStore.analogData.amperage.toFixed(2) });
        state.rssi = t("initialSetupRSSIValue", { 1: ((fcStore.analogData.rssi / 1023) * 100).toFixed(0) });

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46) && fcStore.config.cpuTemp) {
            state.cpuTemp = `${fcStore.config.cpuTemp.toFixed(0)} \u2103`;
        } else {
            state.cpuTemp = t("initialSetupCpuTempNotSupported");
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
        const gpsUnitText = t("gpsPositionUnit");
        state.latitude = `${latitude.toFixed(4)} ${gpsUnitText}`;
        state.longitude = `${longitude.toFixed(4)} ${gpsUnitText}`;
        state.gpsUrl = url;
    }

    function get_fast_data() {
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, function () {
            if (mountedFlag) {
                const formatAttitude = (val) => {
                    const fixed = val.toFixed(1);
                    return Number.parseFloat(fixed) >= 0 ? ` ${fixed}` : fixed;
                };
                state.attitude.roll = t("initialSetupAttitude", {
                    1: formatAttitude(fcStore.sensorData.kinematics[0]),
                });
                state.attitude.pitch = t("initialSetupAttitude", {
                    1: formatAttitude(fcStore.sensorData.kinematics[1]),
                });
                state.attitude.heading = t("initialSetupAttitude", {
                    1: formatAttitude(fcStore.sensorData.kinematics[2]),
                });

                renderModel();
                // updateInstruments is defined in initializeInstruments
                globalThis.updateInstruments();
            }
        });

        if (have_sensor(fcStore.config.activeSensors, "sonar")) {
            MSP.send_message(MSPCodes.MSP_SONAR, false, false, function () {
                if (mountedFlag) {
                    state.sonar = `${fcStore.sensorData.sonar.toFixed(1)} cm`;
                }
            });
        }
    }

    addInterval("setup_data_pull_fast", get_fast_data, 33, true);
    addInterval("setup_data_pull_slow", get_slow_data, 250, true);

    // notify GUI that content is ready
    GUI.content_ready(() => {});
}

function initializeInstruments() {
    const options = { size: 90, showBox: false, img_directory: "images/flightindicators/" };
    const attitude = flightIndicator("#attitude", "attitude", options);
    const heading = flightIndicator("#heading", "heading", options);

    // expose update function similar to legacy behavior
    globalThis.updateInstruments = function () {
        attitude.setRoll(fcStore.sensorData.kinematics[0]);
        attitude.setPitch(fcStore.sensorData.kinematics[1]);
        heading.setHeading(fcStore.sensorData.kinematics[2]);
    };
}

function initModel() {
    // Use template refs for the model canvas and wrapper (no querySelector fallback)
    const wrapperDom = canvasWrapper.value;
    const canvasDom = canvasEl.value;
    if (!wrapperDom || !canvasDom) {
        console.warn("Model canvas or wrapper not found; skipping model initialization.");
        return;
    }
    modelInstance = new Model(wrapperDom, canvasDom);
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

function cleanup(callback) {
    if (modelInstance) {
        if (boundModelResize) {
            window.removeEventListener("resize", boundModelResize);
            boundModelResize = null;
        }
        if (typeof modelInstance.dispose === "function") {
            modelInstance.dispose();
        }
        modelInstance = null;
    }

    // clear intervals used by this tab
    removeAllIntervals();

    // clear accel calibration timeout to prevent it firing after unmount
    removeTimeout("button_reset");

    // ensure mag calibration timers are cleared to avoid callbacks after unmount
    if (magCalibInterval) {
        clearInterval(magCalibInterval);
        magCalibInterval = null;
    }
    if (magCalibTimeoutName) {
        removeTimeout(magCalibTimeoutName);
        magCalibTimeoutName = null;
    }

    callback?.();
}

defineExpose({ cleanup });

onMounted(() => {
    // start the MSP initialization chain
    mountedFlag = true;
    EventBus.$on("expert-mode-change", updateExpertMode);
    initialize();
});

onBeforeUnmount(() => {
    mountedFlag = false;
    stopArmingCount();
    stopArmingFlags();
    EventBus.$off("expert-mode-change", updateExpertMode);
    cleanup();
});

function openBuildOptionsDialog() {
    if (!state.buildOptionsArray || state.buildOptionsArray.length === 0) {
        return;
    }

    state.sortedBuildOptions = [...state.buildOptionsArray].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );
    state.buildInfoDialogTitle = t("initialSetupInfoBuildOptionList");

    if (dialogBuildInfo.value && !dialogBuildInfo.value.hasAttribute("open")) {
        dialogBuildInfo.value.showModal();
    }
}
</script>

<style lang="less" scoped>
.tab-setup {
    #interactive_block {
        position: relative;
        background-color: var(--surface-200);
        border-radius: 1rem;
        border: 2px solid var(--surface-400);
        .reset-zaxis {
            position: absolute;
            top: 1rem;
            right: 1rem;
            z-index: 100;
        }
    }
    .setup-top {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 1rem;
        margin-top: 0.75rem;
    }
    .model-and-info {
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
    .setup-sidebar {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .setup-info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
    }
    @media only screen and (max-width: 1055px) {
        .setup-top {
            grid-template-columns: 1fr;
        }
        .setup-info-grid {
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        }
        #canvas_wrapper {
            max-height: 20rem !important;
        }
    }

    @media all and (max-width: 575px) {
        .setup-info-grid {
            grid-template-columns: 1fr;
        }
    }
    .system_info {
        td {
            width: 50%;
            vertical-align: baseline;
        }
    }
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
    dd {
        white-space: pre;
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
.buttons {
    bottom: 20px;
}
.disarm-flag {
    padding-right: 5px;
    display: inline-block;
}

/* semantic label/value grid used to replace layout tables for accessibility */
.cf-info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem 1rem;
    align-items: baseline;
    width: 100%;
}
.cf-info-grid dt {
    font-weight: bold;
    margin: 0;
}
.cf-info-grid dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: break-word;
}
</style>
