<template>
    <!-- Ported from src/tabs/setup.html -->
    <div class="tab-setup">
        <div class="content_wrapper">
            <!-- should be the first DIV on each tab -->
            <div class="tab_title" i18n="tabSetup">Setup</div>
            <div class="cf_doc_version_bt">
                <a id="button-documentation" href="" target="_blank"></a>
            </div>
            <div class="grid-row">
                <div class="grid-col col3">
                    <div class="default_btn">
                        <div id="accel_calib_rest">
                            <a
                                class="calibrateAccel"
                                id="default_btn green"
                                href="#"
                                i18n="initialSetupButtonCalibrateAccel"
                            ></a>
                        </div>
                        <div id="accel_calib_running">
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
                        <div id="mag_calib_rest">
                            <a class="calibrateMag" href="#" i18n="initialSetupButtonCalibrateMag"></a>
                        </div>
                        <div id="mag_calib_running">
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
                        <a class="resetSettings" href="#" i18n="initialSetupButtonReset"></a>
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
                        <a class="rebootBootloader" href="#" i18n="initialSetupButtonRebootBootloader"></a>
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
                        <div id="canvas_wrapper" class="background_paper">
                            <canvas id="canvas"></canvas>
                            <div class="attitude_info">
                                <dl>
                                    <dt i18n="initialSetupHeading"></dt>
                                    <dd class="heading">&nbsp;</dd>
                                    <dt i18n="initialSetupPitch"></dt>
                                    <dd class="pitch">&nbsp;</dd>
                                    <dt i18n="initialSetupRoll"></dt>
                                    <dd class="roll">&nbsp;</dd>
                                </dl>
                            </div>
                        </div>
                        <a class="reset sm-min" href="#" i18n="initialSetupButtonResetZaxis"></a>
                    </div>
                </div>
                <div class="col-span-1 grid-box col1">
                    <div class="gui_box grey instrumentsbox" align="center">
                        <div class="gui_box_titlebar" align="left">
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
                                        <td i18n="gps3dFix"></td>
                                        <td><span class="colorToggle" i18n="gpsFixFalse"></span></td>
                                    </tr>
                                    <tr>
                                        <td i18n="gpsSats"></td>
                                        <td class="gpsSats"></td>
                                    </tr>
                                    <tr>
                                        <td i18n="gpsLatitude"></td>
                                        <td class="latitude"><a href="#" target="_blank">0.0000 deg</a></td>
                                    </tr>
                                    <tr>
                                        <td i18n="gpsLongitude"></td>
                                        <td class="longitude"><a href="#" target="_blank">0.0000 deg</a></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="gui_box grey sonarBox">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" i18n="initialSetupSonarHead"></div>
                            <div class="helpicon cf_tip" i18n_title="initialSetupSonarHeadHelp"></div>
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
                                        <td id="sonarAltitude" i18n="initialSetupAltitudeSonar"></td>
                                        <td class="sonarAltitude">0.0 cm</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" i18n="initialSetupInfoHead"></div>
                            <div class="helpicon cf_tip" i18n_title="initialSetupInfoHeadHelp"></div>
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
                                            i18n="initialSetupArmingDisableFlags"
                                            class="cf_tip"
                                        ></td>
                                        <td class="arming-disable-flags"></td>
                                    </tr>
                                    <tr>
                                        <td i18n="initialSetupBattery"></td>
                                        <td class="bat-voltage">0 V</td>
                                    </tr>
                                    <tr>
                                        <td i18n="initialSetupDrawn"></td>
                                        <td class="bat-mah-drawn">0 mAh</td>
                                    </tr>
                                    <tr>
                                        <td i18n="initialSetupDrawing"></td>
                                        <td class="bat-mah-drawing">0.00 A</td>
                                    </tr>
                                    <tr class="noboarder">
                                        <td i18n="initialSetupRSSI"></td>
                                        <td class="rssi">0 %</td>
                                    </tr>
                                    <tr>
                                        <td id="mcu" i18n="initialSetupMCU"></td>
                                        <td class="mcu"></td>
                                    </tr>
                                    <tr>
                                        <td id="cpu-temp" i18n="initialSetupCpuTemp"></td>
                                        <td class="cpu-temp">0 &#8451;</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="gui_box grey" id="sensorInfoBox">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" i18n="initialSensorInfoHead"></div>
                            <div class="helpicon cf_tip" i18n_title="initialSensorInfoHeadHelp"></div>
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
                                        <td id="sensor_gyro_hw" i18n="initialSetupSensorGyro"></td>
                                        <td class="sensor_gyro_hw"></td>
                                    </tr>
                                    <tr>
                                        <td id="sensor_acc_hw" i18n="initialSetupSensorAcc"></td>
                                        <td class="sensor_acc_hw"></td>
                                    </tr>
                                    <tr>
                                        <td id="sensor-mag-hw" i18n="initialSetupSensorMag"></td>
                                        <td class="sensor_mag_hw"></td>
                                    </tr>
                                    <tr>
                                        <td id="sensor_baro_hw" i18n="initialSetupSensorBaro"></td>
                                        <td class="sensor_baro_hw"></td>
                                    </tr>
                                    <tr>
                                        <td id="sensor-sonar-hw" i18n="initialSetupSensorSonar"></td>
                                        <td class="sensor_sonar_hw"></td>
                                    </tr>
                                    <tr>
                                        <td id="sensor-opticalflow-hw" i18n="initialSetupSensorOpticalflow"></td>
                                        <td class="sensor_opticalflow_hw"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" i18n="initialSetupInfoBuild"></div>
                            <div class="helpicon cf_tip" i18n_title="initialSetupInfoFirmwareHelp"></div>
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
                                        <td id="api-version" i18n="initialSetupInfoAPIversion"></td>
                                        <td class="api-version"></td>
                                    </tr>
                                    <tr>
                                        <td id="build-date" i18n="initialSetupInfoBuildDate"></td>
                                        <td class="build-date"></td>
                                    </tr>
                                    <tr>
                                        <td id="build-type" i18n="initialSetupInfoBuildType"></td>
                                        <td class="build-type"></td>
                                    </tr>
                                    <tr>
                                        <td id="build-info" i18n="initialSetupInfoBuildInfo"></td>
                                        <td class="build-info"></td>
                                    </tr>
                                    <tr>
                                        <td id="build-firmware" i18n="initialSetupInfoBuildFirmware"></td>
                                        <td class="build-firmware"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" i18n="initialSetupNetworkInfo"></div>
                            <div class="helpicon cf_tip" i18n_title="initialSetupNetworkInfoHelp"></div>
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
                                        <td id="network-status" i18n="initialSetupNetworkInfoStatus"></td>
                                        <td class="network-status"></td>
                                    </tr>
                                    <tr>
                                        <td id="network-type" i18n="initialSetupNetworkType"></td>
                                        <td class="network-type"></td>
                                    </tr>
                                    <tr>
                                        <td id="network-downlink" i18n="initialSetupNetworkDownlink"></td>
                                        <td class="network-downlink"></td>
                                    </tr>
                                    <tr>
                                        <td id="network-rtt" i18n="initialSetupNetworkRtt"></td>
                                        <td class="network-rtt"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <dialog class="dialogConfirmReset">
            <h3 i18n="dialogConfirmResetTitle"></h3>
            <div class="content">
                <div i18n="dialogConfirmResetNote" style="margin-top: 10px"></div>
            </div>
            <div class="buttons">
                <a href="#" class="dialogConfirmReset-confirmbtn danger-button" i18n="dialogConfirmResetConfirm"></a>
                <a href="#" class="dialogConfirmReset-cancelbtn regular-button" i18n="dialogConfirmResetClose"></a>
            </div>
        </dialog>

        <dialog class="dialogBuildInfo">
            <div class="dialogBuildInfo-title"></div>
            <div class="contentBuildInfo">
                <div class="dialogBuildInfo-content" style="margin-top: 10px"></div>
            </div>
            <div class="dialogButtons">
                <a href="#" class="dialogBuildInfo-closebtn regular-button" i18n="close"></a>
            </div>
        </dialog>
    </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import { i18n } from "../../js/localization";
import semver from "semver";
import { isExpertModeEnabled } from "../../js/utils/isExpertModeEnabled";
import GUI, { TABS } from "../../js/gui";
import { have_sensor } from "../../js/sensor_helpers";
import { mspHelper } from "../../js/msp/MSPHelper";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import Model from "../../js/model";
import MSPCodes from "../../js/msp/MSPCodes";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "../../js/data_storage";
import { gui_log } from "../../js/gui_log";
import $ from "jquery";
import { ispConnected } from "../../js/utils/connection";
import { sensorTypes } from "../../js/sensor_types";
import { addArrayElementsAfter, replaceArrayElement } from "../../js/utils/array";

const yaw_fix = ref(0.0);

let modelInstance = null;

function initialize() {
    // follow legacy initialization chain
    function load_status() {
        MSP.send_message(MSPCodes.MSP_STATUS_EX, false, false, mcu_info);
    }

    function mcu_info() {
        MSP.send_message(MSPCodes.MSP2_MCU_INFO, false, false, load_mixer_config);
    }

    function load_mixer_config() {
        MSP.send_message(MSPCodes.MSP_MIXER_CONFIG, false, false, load_gyro_sensor);
    }

    function load_gyro_sensor() {
        MSP.send_message(MSPCodes.MSP_SENSOR_ALIGNMENT, false, false, load_html);
    }

    function load_html() {
        // For SFC we don't need to load HTML, just process it
        process_html();
    }

    MSP.send_message(MSPCodes.MSP_ACC_TRIM, false, false, load_status);
}

function process_html() {
    // translate to user-selected language
    i18n.localizePage();

    // initialize 3D Model
    initModel();

    $("span.roll").text(i18n.getMessage("initialSetupAttitude", [0]));
    $("span.pitch").text(i18n.getMessage("initialSetupAttitude", [0]));
    $("span.heading").text(i18n.getMessage("initialSetupAttitude", [0]));

    if (!have_sensor(FC.CONFIG.activeSensors, "acc")) {
        $("a.calibrateAccel").addClass("disabled");
        $("default_btn").addClass("disabled");
    }

    if (!have_sensor(FC.CONFIG.activeSensors, "mag")) {
        $("a.calibrateMag").addClass("disabled");
        $("default_btn").addClass("disabled");
    }

    initializeInstruments();

    $("#arming-disable-flag").attr("title", i18n.getMessage("initialSetupArmingDisableFlagsTooltip"));

    $(".initialSetupReset").toggle(isExpertModeEnabled());
    $(".initialSetupRebootBootloader").toggle(isExpertModeEnabled());

    $("a.rebootBootloader")
        .off("click")
        .on("click", function () {
            const buffer = [];
            buffer.push(
                FC.boardHasFlashBootloader()
                    ? mspHelper.REBOOT_TYPES.BOOTLOADER_FLASH
                    : mspHelper.REBOOT_TYPES.BOOTLOADER,
            );
            MSP.send_message(MSPCodes.MSP_SET_REBOOT, buffer, false);
        });

    // UI Hooks
    $("a.calibrateAccel")
        .off("click")
        .on("click", function () {
            const _self = $(this);

            if (!_self.hasClass("calibrating")) {
                _self.addClass("calibrating");
                GUI.interval_pause("setup_data_pull");
                MSP.send_message(MSPCodes.MSP_ACC_CALIBRATION, false, false, function () {
                    gui_log(i18n.getMessage("initialSetupAccelCalibStarted"));
                    $("#accel_calib_running").show();
                    $("#accel_calib_rest").hide();
                });

                GUI.timeout_add(
                    "button_reset",
                    function () {
                        GUI.interval_resume("setup_data_pull");

                        gui_log(i18n.getMessage("initialSetupAccelCalibEnded"));
                        _self.removeClass("calibrating");
                        $("#accel_calib_running").hide();
                        $("#accel_calib_rest").show();
                    },
                    2000,
                );
            }
        });

    $("a.calibrateMag")
        .off("click")
        .on("click", function () {
            const _self = $(this);

            if (!_self.hasClass("calibrating") && !_self.hasClass("disabled")) {
                _self.addClass("calibrating");

                MSP.send_message(MSPCodes.MSP_MAG_CALIBRATION, false, false, function () {
                    gui_log(i18n.getMessage("initialSetupMagCalibStarted"));
                    $("#mag_calib_running").show();
                    $("#mag_calib_rest").hide();
                });

                function magCalibResetButton() {
                    gui_log(i18n.getMessage("initialSetupMagCalibEnded"));
                    _self.removeClass("calibrating");
                    $("#mag_calib_running").hide();
                    $("#mag_calib_rest").show();
                }

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                    let cycle = 0;
                    const cycleMax = 45;
                    const interval = 1000;
                    const intervalId = setInterval(function () {
                        if (cycle >= cycleMax || (FC.CONFIG.armingDisableFlags & (1 << 12)) === 0) {
                            clearInterval(intervalId);
                            magCalibResetButton();
                        }
                        cycle++;
                    }, interval);
                } else {
                    GUI.timeout_add("button_reset", magCalibResetButton, 30000);
                }
            }
        });

    const dialogConfirmReset = $(".dialogConfirmReset")[0];

    $("a.resetSettings")
        .off("click")
        .on("click", function () {
            dialogConfirmReset.showModal();
        });

    $(".dialogConfirmReset-cancelbtn")
        .off("click")
        .on("click", function () {
            dialogConfirmReset.close();
        });

    $(".dialogConfirmReset-confirmbtn")
        .off("click")
        .on("click", function () {
            dialogConfirmReset.close();
            MSP.send_message(MSPCodes.MSP_RESET_CONF, false, false, function () {
                gui_log(i18n.getMessage("initialSetupSettingsRestored"));

                GUI.tab_switch_cleanup(function () {
                    // Reinitialize tab
                    if (TABS.setup) TABS.setup.initialize();
                });
            });
        });

    $("div#interactive_block > a.reset").text(i18n.getMessage("initialSetupButtonResetZaxisValue", [yaw_fix.value]));

    $("div#interactive_block > a.reset")
        .off("click")
        .on("click", function () {
            yaw_fix.value = FC.SENSOR_DATA.kinematics[2] * -1.0;
            $(this).text(i18n.getMessage("initialSetupButtonResetZaxisValue", [yaw_fix.value]));
            console.log(`YAW reset to 0 deg, fix: ${yaw_fix.value} deg`);
        });

    // cached elements
    const bat_voltage_e = $(".bat-voltage"),
        bat_mah_drawn_e = $(".bat-mah-drawn"),
        bat_mah_drawing_e = $(".bat-mah-drawing"),
        rssi_e = $(".rssi"),
        cputemp_e = $(".cpu-temp"),
        arming_disable_flags_e = $(".arming-disable-flags"),
        gpsFix_e = $(".GPS_info span.colorToggle"),
        gpsSats_e = $(".gpsSats"),
        roll_e = $("dd.roll"),
        pitch_e = $("dd.pitch"),
        heading_e = $("dd.heading"),
        sonar_e = $(".sonarAltitude"),
        mcu_e = $(".mcu"),
        sensor_gyro_e = $(".sensor_gyro_hw"),
        sensor_acc_e = $(".sensor_acc_hw"),
        sensor_mag_e = $(".sensor_mag_hw"),
        sensor_baro_e = $(".sensor_baro_hw"),
        sensor_sonar_e = $(".sensor_sonar_hw"),
        sensor_opticalflow_e = $(".sensor_opticalflow_hw"),
        msp_api_e = $(".api-version"),
        build_date_e = $(".build-date"),
        build_type_e = $(".build-type"),
        build_info_e = $(".build-info"),
        build_firmware_e = $(".build-firmware");

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

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            replaceArrayElement(disarmFlagElements, "RPMFILTER", "DSHOT_TELEM");
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            addArrayElementsAfter(disarmFlagElements, "MOTOR_PROTOCOL", ["CRASHFLIP", "ALTHOLD", "POSHOLD"]);
        }

        arming_disable_flags_e.append(
            '<span id="initialSetupArmingAllowed" i18n="initialSetupArmingAllowed" style="display: none;"></span>',
        );

        for (let i = 0; i < FC.CONFIG.armingDisableCount; i++) {
            if (i < disarmFlagElements.length - 1) {
                const messageKey = `initialSetupArmingDisableFlagsTooltip${disarmFlagElements[i]}`;
                arming_disable_flags_e.append(
                    `<span id="initialSetupArmingDisableFlags${i}" class="cf_tip disarm-flag" title="${i18n.getMessage(
                        messageKey,
                    )}" style="display: none;">${disarmFlagElements[i]}</span>`,
                );
            } else if (i == FC.CONFIG.armingDisableCount - 1) {
                arming_disable_flags_e.append(
                    `<span id="initialSetupArmingDisableFlags${i}" class="cf_tip disarm-flag" title="${i18n.getMessage(
                        "initialSetupArmingDisableFlagsTooltipARM_SWITCH",
                    )}" style="display: none;">ARM_SWITCH</span>`,
                );
            } else {
                arming_disable_flags_e.append(
                    `<span id="initialSetupArmingDisableFlags${i}" class="disarm-flag" style="display: none;">${
                        i + 1
                    }</span>`,
                );
            }
        }
    };

    const showSensorInfo = async function () {
        function addSensorInfo(sensor, sensorElement, sensorType, sensorElements) {
            if (sensor == 0xff) {
                sensorElement.text(i18n.getMessage("initialSetupNotInBuild"));
            } else if (have_sensor(FC.CONFIG.activeSensors, sensorType)) {
                sensorElement.text(sensorElements[sensor]);
            } else {
                sensorElement.text(i18n.getMessage("initialSetupNotDetected"));
            }
        }

        async function displaySensorInfo() {
            const types = await sensorTypes();

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                let gyroInfoList = [];
                for (let i = 0; i < FC.GYRO_SENSOR.gyro_count; i++) {
                    if ((FC.SENSOR_ALIGNMENT.gyro_enable_mask & (1 << i)) !== 0) {
                        gyroInfoList.push(types.gyro.elements[FC.GYRO_SENSOR.gyro_hardware[i]]);
                    }
                }
                sensor_gyro_e.html(gyroInfoList.join(" "));
            } else {
                addSensorInfo(FC.SENSOR_CONFIG_ACTIVE.gyro_hardware, sensor_gyro_e, "gyro", types.gyro.elements);
            }

            addSensorInfo(FC.SENSOR_CONFIG_ACTIVE.acc_hardware, sensor_acc_e, "acc", types.acc.elements);
            addSensorInfo(FC.SENSOR_CONFIG_ACTIVE.baro_hardware, sensor_baro_e, "baro", types.baro.elements);
            addSensorInfo(FC.SENSOR_CONFIG_ACTIVE.mag_hardware, sensor_mag_e, "mag", types.mag.elements);
            addSensorInfo(FC.SENSOR_CONFIG_ACTIVE.sonar_hardware, sensor_sonar_e, "sonar", types.sonar.elements);

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                addSensorInfo(
                    FC.SENSOR_CONFIG_ACTIVE.opticalflow_hardware,
                    sensor_opticalflow_e,
                    "opticalflow",
                    types.opticalflow.elements,
                );
            }
        }

        MSP.send_message(MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE, false, false, async function () {
            if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                await displaySensorInfo();
            } else {
                MSP.send_message(MSPCodes.MSP2_GYRO_SENSOR, false, false, async function () {
                    await displaySensorInfo();
                });
            }
        });
    };

    const hideSensorInfo = function () {
        $("#sensorInfoBox").hide();
    };

    const showBuildType = function () {
        build_type_e.html(
            FC.CONFIG.buildKey.length === 32
                ? i18n.getMessage("initialSetupInfoBuildCloud")
                : i18n.getMessage("initialSetupInfoBuildLocal"),
        );
    };

    const hideBuildType = function () {
        build_type_e.parent().hide();
    };

    function showDialogBuildInfo(title, message) {
        const dialog = $(".dialogBuildInfo")[0];

        $(".dialogBuildInfo-title").html(title);
        $(".dialogBuildInfo-content").html(message);

        if (!dialog.hasAttribute("open")) {
            dialog.showModal();
            $(".dialogBuildInfo-closebtn").on("click", function () {
                dialog.close();
            });
        }
    }

    const getBuildRootBaseUri = function () {
        return `https://build.betaflight.com/api/builds/${FC.CONFIG.buildKey}`;
    };

    const showBuildInfo = function () {
        const isIspConnected = ispConnected();
        const buildKeyValid = FC.CONFIG.buildKey.length === 32;

        if (buildKeyValid && isIspConnected) {
            const buildRoot = getBuildRootBaseUri();

            const buildConfig = `<span class="buildInfoBtn" title="${i18n.getMessage(
                "initialSetupInfoBuildConfig",
            )}: ${buildRoot}/json"><a href="${buildRoot}/json" target="_blank"><strong>${i18n.getMessage(
                "initialSetupInfoBuildConfig",
            )}</strong></a></span>`;

            const buildLog = `<span class="buildInfoBtn" title="${i18n.getMessage(
                "initialSetupInfoBuildLog",
            )}: ${buildRoot}/log"><a href="${buildRoot}/log" target="_blank"><strong>${i18n.getMessage(
                "initialSetupInfoBuildLog",
            )}</strong></a></span>`;

            build_info_e.html(`${buildConfig} ${buildLog}`);
        } else {
            build_info_e.html(
                isIspConnected ? i18n.getMessage("initialSetupNoBuildInfo") : i18n.getMessage("initialSetupNotOnline"),
            );
        }
    };

    const hideBuildInfo = function () {
        build_info_e.parent().hide();
    };

    const showBuildFirmware = function () {
        const isIspConnected = ispConnected();
        const buildOptionsValid =
            ((semver.eq(FC.CONFIG.apiVersion, API_VERSION_1_45) && isIspConnected) ||
                semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) &&
            FC.CONFIG.buildOptions.length;
        const buildKeyValid = FC.CONFIG.buildKey.length === 32;
        const buildRoot = getBuildRootBaseUri();

        if (buildOptionsValid || buildKeyValid) {
            const buildOptions = buildOptionsValid
                ? `<span class="buildInfoBtn" title="${i18n.getMessage("initialSetupInfoBuildOptionList")}"><a class="buildOptions" href="#"><strong>${i18n.getMessage(
                    "initialSetupInfoBuildOptions",
                )}</strong></a></span>`
                : "";

            const buildDownload = buildKeyValid
                ? `<span class="buildInfoBtn" title="${i18n.getMessage("initialSetupInfoBuildDownload")}: ${buildRoot}/hex"><a href="${buildRoot}/hex" target="_blank"><strong>${i18n.getMessage(
                    "initialSetupInfoBuildDownload",
                )}</strong></a></span>`
                : "";

            build_firmware_e.html(`${buildOptions} ${buildDownload}`);

            if (buildOptionsValid) {
                let buildOptionList = `<div class="dialogBuildInfoGrid-container">`;
                for (const buildOptionElement of FC.CONFIG.buildOptions) {
                    buildOptionList += `<div class="dialogBuildInfoGrid-item">${buildOptionElement}</div>`;
                }
                buildOptionList += `</div>`;

                $("a.buildOptions")
                    .off("click")
                    .on("click", async function () {
                        showDialogBuildInfo(
                            `<h3>${i18n.getMessage("initialSetupInfoBuildOptionList")}</h3>`,
                            buildOptionList,
                        );
                    });
            }
        } else {
            build_firmware_e.html(
                isIspConnected ? i18n.getMessage("initialSetupNoBuildInfo") : i18n.getMessage("initialSetupNotOnline"),
            );
        }
    };

    function showFirmwareInfo() {
        msp_api_e.text(FC.CONFIG.apiVersion);
        build_date_e.text(FC.CONFIG.buildInfo);

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            showBuildType();
            showBuildInfo();
            showBuildFirmware();
        } else {
            hideBuildType();
            hideBuildInfo();
            hideBuildFirmware();
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

        $(".network-status").text(statusText);
        $(".network-type").text(type);
        $(".network-downlink").text(`${downlink} Mbps`);
        $(".network-rtt").text(`${rtt} ms`);
    }

    prepareDisarmFlags();
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
        showSensorInfo();
    } else {
        hideSensorInfo();
    }
    showFirmwareInfo();
    showNetworkStatus();

    if (!have_sensor(FC.CONFIG.activeSensors, "sonar")) {
        $(".sonarBox").hide();
    }

    function get_slow_data() {
        $("#initialSetupArmingAllowed").toggle(FC.CONFIG.armingDisableFlags === 0);

        for (let i = 0; i < FC.CONFIG.armingDisableCount; i++) {
            $(`#initialSetupArmingDisableFlags${i}`).css(
                "display",
                (FC.CONFIG.armingDisableFlags & (1 << i)) === 0 ? "none" : "inline-block",
            );
        }

        bat_voltage_e.text(i18n.getMessage("initialSetupBatteryValue", [FC.ANALOG.voltage]));
        bat_mah_drawn_e.text(i18n.getMessage("initialSetupBatteryMahValue", [FC.ANALOG.mAhdrawn]));
        bat_mah_drawing_e.text(i18n.getMessage("initialSetupBatteryAValue", [FC.ANALOG.amperage.toFixed(2)]));
        rssi_e.text(i18n.getMessage("initialSetupRSSIValue", [((FC.ANALOG.rssi / 1023) * 100).toFixed(0)]));

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46) && FC.CONFIG.cpuTemp) {
            cputemp_e.html(`${FC.CONFIG.cpuTemp.toFixed(0)} &#8451;`);
        } else {
            cputemp_e.text(i18n.getMessage("initialSetupCpuTempNotSupported"));
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            mcu_e.text(FC.MCU_INFO.name);
        } else {
            mcu_e.parent().hide();
        }

        gpsFix_e.text(FC.GPS_DATA.fix ? i18n.getMessage("gpsFixTrue") : i18n.getMessage("gpsFixFalse"));
        gpsFix_e.toggleClass("ready", FC.GPS_DATA.fix != 0);
        gpsSats_e.text(FC.GPS_DATA.numSat);

        const latitude = FC.GPS_DATA.latitude / 10000000;
        const longitude = FC.GPS_DATA.longitude / 10000000;
        const url = `https://maps.google.com/?q=${latitude},${longitude}`;
        const gpsUnitText = i18n.getMessage("gpsPositionUnit");
        $(".GPS_info td.latitude a")
            .prop("href", url)
            .text(`${latitude.toFixed(4)} ${gpsUnitText}`);
        $(".GPS_info td.longitude a")
            .prop("href", url)
            .text(`${longitude.toFixed(4)} ${gpsUnitText}`);
    }

    function get_fast_data() {
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, function () {
            roll_e.text(i18n.getMessage("initialSetupAttitude", [FC.SENSOR_DATA.kinematics[0]]));
            pitch_e.text(i18n.getMessage("initialSetupAttitude", [FC.SENSOR_DATA.kinematics[1]]));
            heading_e.text(i18n.getMessage("initialSetupAttitude", [FC.SENSOR_DATA.kinematics[2]]));

            renderModel();
            // updateInstruments is defined in initializeInstruments
            if (typeof window.updateInstruments === "function") window.updateInstruments();
        });

        if (have_sensor(FC.CONFIG.activeSensors, "sonar")) {
            MSP.send_message(MSPCodes.MSP_SONAR, false, false, function () {
                sonar_e.text(`${FC.SENSOR_DATA.sonar.toFixed(1)} cm`);
            });
        }
    }

    GUI.interval_add("setup_data_pull_fast", get_fast_data, 33, true);
    GUI.interval_add("setup_data_pull_slow", get_slow_data, 250, true);

    // notify GUI that content is ready
    GUI.content_ready(() => {});
}

function initializeInstruments() {
    const options = { size: 90, showBox: false, img_directory: "images/flightindicators/" };
    const attitude = $.flightIndicator("#attitude", "attitude", options);
    const heading = $.flightIndicator("#heading", "heading", options);

    // expose update function similar to legacy behavior
    window.updateInstruments = function () {
        attitude.setRoll(FC.SENSOR_DATA.kinematics[0]);
        attitude.setPitch(FC.SENSOR_DATA.kinematics[1]);
        heading.setHeading(FC.SENSOR_DATA.kinematics[2]);
    };
}

function initModel() {
    modelInstance = new Model($(".model-and-info #canvas_wrapper"), $(".model-and-info #canvas"));
    $(window).on("resize", $.proxy(modelInstance.resize, modelInstance));
}

function renderModel() {
    if (!modelInstance) return;
    const x = FC.SENSOR_DATA.kinematics[1] * -1.0 * 0.017453292519943295;
    const y = (FC.SENSOR_DATA.kinematics[2] * -1.0 - yaw_fix.value) * 0.017453292519943295;
    const z = FC.SENSOR_DATA.kinematics[0] * -1.0 * 0.017453292519943295;
    modelInstance.rotateTo(x, y, z);
}

function cleanup() {
    if (modelInstance) {
        $(window).off("resize", $.proxy(modelInstance.resize, modelInstance));
        if (typeof modelInstance.dispose === "function") modelInstance.dispose();
        modelInstance = null;
    }
}

onMounted(() => {
    // start the MSP initialization chain
    initialize();
});

onBeforeUnmount(() => {
    cleanup();
    // clear intervals used by this tab
    GUI.interval_remove("setup_data_pull_fast");
    GUI.interval_remove("setup_data_pull_slow");
});
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
    display: none;
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
    display: none;
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

/* small local override */
.tab-setup {
    padding: 8px;
}
</style>
