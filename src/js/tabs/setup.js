import { i18n } from "../localization";
import semver from "semver";
import { isExpertModeEnabled } from "../utils/isExpertModeEnabled";
import GUI, { TABS } from "../gui";
import { have_sensor } from "../sensor_helpers";
import { mspHelper } from "../msp/MSPHelper";
import FC from "../fc";
import MSP from "../msp";
import Model from "../model";
import MSPCodes from "../msp/MSPCodes";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "../data_storage";
import { gui_log } from "../gui_log";
import $ from "jquery";
import { ispConnected } from "../utils/connection";
import { sensorTypes } from "../sensor_types";
import { addArrayElementsAfter, replaceArrayElement } from "../utils/array";

const setup = {
    yaw_fix: 0.0,
};

setup.initialize = function (callback) {
    const self = this;

    if (GUI.active_tab != "setup") {
        GUI.active_tab = "setup";
    }

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
        $("#content").load("./tabs/setup.html", process_html);
    }

    MSP.send_message(MSPCodes.MSP_ACC_TRIM, false, false, load_status);

    function process_html() {
        // translate to user-selected language
        i18n.localizePage();

        // initialize 3D Model
        self.initModel();

        // set roll in interactive block
        $("span.roll").text(i18n.getMessage("initialSetupAttitude", [0]));
        // set pitch in interactive block
        $("span.pitch").text(i18n.getMessage("initialSetupAttitude", [0]));
        // set heading in interactive block
        $("span.heading").text(i18n.getMessage("initialSetupAttitude", [0]));

        // check if we have accelerometer and magnetometer
        if (!have_sensor(FC.CONFIG.activeSensors, "acc")) {
            $("a.calibrateAccel").addClass("disabled");
            $("default_btn").addClass("disabled");
        }

        if (!have_sensor(FC.CONFIG.activeSensors, "mag")) {
            $("a.calibrateMag").addClass("disabled");
            $("default_btn").addClass("disabled");
        }

        self.initializeInstruments();

        $("#arming-disable-flag").attr("title", i18n.getMessage("initialSetupArmingDisableFlagsTooltip"));

        $(".initialSetupReset").toggle(isExpertModeEnabled());
        $(".initialSetupRebootBootloader").toggle(isExpertModeEnabled());

        $("a.rebootBootloader").click(function () {
            const buffer = [];
            buffer.push(
                FC.boardHasFlashBootloader()
                    ? mspHelper.REBOOT_TYPES.BOOTLOADER_FLASH
                    : mspHelper.REBOOT_TYPES.BOOTLOADER,
            );
            MSP.send_message(MSPCodes.MSP_SET_REBOOT, buffer, false);
        });

        // UI Hooks
        $("a.calibrateAccel").click(function () {
            const _self = $(this);

            if (!_self.hasClass("calibrating")) {
                _self.addClass("calibrating");

                // During this period MCU won't be able to process any serial commands because its locked in a for/while loop
                // until this operation finishes, sending more commands through data_poll() will result in serial buffer overflow
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

        $("a.calibrateMag").click(function () {
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

        $("a.resetSettings").click(function () {
            dialogConfirmReset.showModal();
        });

        $(".dialogConfirmReset-cancelbtn").click(function () {
            dialogConfirmReset.close();
        });

        $(".dialogConfirmReset-confirmbtn").click(function () {
            dialogConfirmReset.close();
            MSP.send_message(MSPCodes.MSP_RESET_CONF, false, false, function () {
                gui_log(i18n.getMessage("initialSetupSettingsRestored"));

                GUI.tab_switch_cleanup(function () {
                    TABS.setup.initialize();
                });
            });
        });

        // display current yaw fix value (important during tab re-initialization)
        $("div#interactive_block > a.reset").text(i18n.getMessage("initialSetupButtonResetZaxisValue", [self.yaw_fix]));

        // reset yaw button hook
        $("div#interactive_block > a.reset").click(function () {
            self.yaw_fix = FC.SENSOR_DATA.kinematics[2] * -1.0;
            $(this).text(i18n.getMessage("initialSetupButtonResetZaxisValue", [self.yaw_fix]));

            console.log(`YAW reset to 0 deg, fix: ${self.yaw_fix} deg`);
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
            // MCU info
            mcu_e = $(".mcu"),
            // Sensor info
            sensor_gyro_e = $(".sensor_gyro_hw"),
            sensor_acc_e = $(".sensor_acc_hw"),
            sensor_mag_e = $(".sensor_mag_hw"),
            sensor_baro_e = $(".sensor_baro_hw"),
            sensor_sonar_e = $(".sensor_sonar_hw"),
            sensor_opticalflow_e = $(".sensor_opticalflow_hw"),
            // Firmware info
            msp_api_e = $(".api-version"),
            build_date_e = $(".build-date"),
            build_type_e = $(".build-type"),
            build_info_e = $(".build-info"),
            build_firmware_e = $(".build-firmware");

        // DISARM FLAGS
        // We add all the arming/disarming flags available, and show/hide them if needed.
        // align with betaflight runtime_config.h armingDisableFlags_e
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
                // Introduced in 1.42
                "REBOOT_REQUIRED",
                "DSHOT_BITBANG",
                // Introduced in 1.43
                "ACC_CALIBRATION",
                "MOTOR_PROTOCOL",
                // 'ARM_SWITCH',           // Needs to be the last element, since it's always activated if one of the others is active when arming
            ];

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                replaceArrayElement(disarmFlagElements, "RPMFILTER", "DSHOT_TELEM");
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                addArrayElementsAfter(disarmFlagElements, "MOTOR_PROTOCOL", ["CRASHFLIP", "ALTHOLD", "POSHOLD"]);
            }

            // Arming allowed flag
            arming_disable_flags_e.append(
                '<span id="initialSetupArmingAllowed" i18n="initialSetupArmingAllowed" style="display: none;"></span>',
            );

            // Arming disabled flags
            for (let i = 0; i < FC.CONFIG.armingDisableCount; i++) {
                // All the known elements but the ARM_SWITCH (it must be always the last element)
                if (i < disarmFlagElements.length - 1) {
                    const messageKey = `initialSetupArmingDisableFlagsTooltip${disarmFlagElements[i]}`;
                    arming_disable_flags_e.append(
                        `<span id="initialSetupArmingDisableFlags${i}" class="cf_tip disarm-flag" title="${i18n.getMessage(
                            messageKey,
                        )}" style="display: none;">${disarmFlagElements[i]}</span>`,
                    );

                    // The ARM_SWITCH, always the last element
                } else if (i == FC.CONFIG.armingDisableCount - 1) {
                    arming_disable_flags_e.append(
                        `<span id="initialSetupArmingDisableFlags${i}" class="cf_tip disarm-flag" title="${i18n.getMessage(
                            "initialSetupArmingDisableFlagsTooltipARM_SWITCH",
                        )}" style="display: none;">ARM_SWITCH</span>`,
                    );

                    // Unknown disarm flags
                } else {
                    arming_disable_flags_e.append(
                        `<span id="initialSetupArmingDisableFlags${i}" class="disarm-flag" style="display: none;">${
                            i + 1
                        }</span>`,
                    );
                }
            }
        };

        const showSensorInfo = function () {
            // Add sensor info to the sensor info box
            function addSensorInfo(sensor, sensorElement, sensorType, sensorElements) {
                if (sensor == 0xff) {
                    sensorElement.text(i18n.getMessage("initialSetupNotInBuild"));
                } else if (have_sensor(FC.CONFIG.activeSensors, sensorType)) {
                    sensorElement.text(sensorElements[sensor]);
                } else {
                    sensorElement.text(i18n.getMessage("initialSetupNotDetected"));
                }
            }

            MSP.send_message(MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE, false, false, function () {
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                    MSP.send_message(MSPCodes.MSP2_GYRO_SENSOR, false, false, function () {
                        let gyroInfoList = [];
                        for (let i = 0; i < FC.GYRO_SENSOR.gyro_count; i++) {
                            if ((FC.SENSOR_ALIGNMENT.gyro_enable_mask & (1 << i)) !== 0) {
                                gyroInfoList.push(sensorTypes().gyro.elements[FC.GYRO_SENSOR.gyro_hardware[i]]);
                            }
                        }
                        sensor_gyro_e.html(gyroInfoList.join(" "));
                    });
                } else {
                    addSensorInfo(
                        FC.SENSOR_CONFIG_ACTIVE.gyro_hardware,
                        sensor_gyro_e,
                        "gyro",
                        sensorTypes().gyro.elements,
                    );
                }

                addSensorInfo(FC.SENSOR_CONFIG_ACTIVE.acc_hardware, sensor_acc_e, "acc", sensorTypes().acc.elements);
                addSensorInfo(
                    FC.SENSOR_CONFIG_ACTIVE.baro_hardware,
                    sensor_baro_e,
                    "baro",
                    sensorTypes().baro.elements,
                );
                addSensorInfo(FC.SENSOR_CONFIG_ACTIVE.mag_hardware, sensor_mag_e, "mag", sensorTypes().mag.elements);
                addSensorInfo(
                    FC.SENSOR_CONFIG_ACTIVE.sonar_hardware,
                    sensor_sonar_e,
                    "sonar",
                    sensorTypes().sonar.elements,
                );

                // opticalflow sensor is available since 1.47
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                    addSensorInfo(
                        FC.SENSOR_CONFIG_ACTIVE.opticalflow_hardware,
                        sensor_opticalflow_e,
                        "opticalflow",
                        sensorTypes().opticalflow.elements,
                    );
                }
            });
        };

        const hideSensorInfo = function () {
            $("#sensorInfoBox").hide();
        };

        // Fills in the "Build type" part of the "Firmware info" box
        const showBuildType = function () {
            build_type_e.html(
                FC.CONFIG.buildKey.length === 32
                    ? i18n.getMessage("initialSetupInfoBuildCloud")
                    : i18n.getMessage("initialSetupInfoBuildLocal"),
            );
        };

        // Hides the "Build type" part of the "Firmware info" box
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

        // Gets the build root base URI for build.betaflight.com
        const getBuildRootBaseUri = function () {
            return `https://build.betaflight.com/api/builds/${FC.CONFIG.buildKey}`;
        };

        // Fills in the "Build info" part of the "Firmware info" box
        const showBuildInfo = function () {
            const isIspConnected = ispConnected();
            const buildKeyValid = FC.CONFIG.buildKey.length === 32;

            if (buildKeyValid && isIspConnected) {
                const buildRoot = getBuildRootBaseUri();

                // Creates the "Config" button
                const buildConfig = `<span class="buildInfoBtn" title="${i18n.getMessage(
                    "initialSetupInfoBuildConfig",
                )}: ${buildRoot}/json">
                    <a href="${buildRoot}/json" target="_blank"><strong>${i18n.getMessage(
    "initialSetupInfoBuildConfig",
)}</strong></a></span>`;

                // Creates the "Log" button
                const buildLog = `<span class="buildInfoBtn" title="${i18n.getMessage(
                    "initialSetupInfoBuildLog",
                )}: ${buildRoot}/log">
                    <a href="${buildRoot}/log" target="_blank"><strong>${i18n.getMessage(
    "initialSetupInfoBuildLog",
)}</strong></a></span>`;

                // Shows the "Config" and "Log" buttons
                build_info_e.html(`${buildConfig} ${buildLog}`);
            } else {
                build_info_e.html(
                    isIspConnected
                        ? i18n.getMessage("initialSetupNoBuildInfo")
                        : i18n.getMessage("initialSetupNotOnline"),
                );
            }
        };

        // Hides the "Build info" part of the "Firmware info" box
        const hideBuildInfo = function () {
            build_info_e.parent().hide();
        };

        // Fills in the "Firmware" part of the "Firmware info" box
        const showBuildFirmware = function () {
            const isIspConnected = ispConnected();
            const buildOptionsValid =
                ((semver.eq(FC.CONFIG.apiVersion, API_VERSION_1_45) && isIspConnected) ||
                    semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) &&
                FC.CONFIG.buildOptions.length;
            const buildKeyValid = FC.CONFIG.buildKey.length === 32;
            const buildRoot = getBuildRootBaseUri();

            if (buildOptionsValid || buildKeyValid) {
                // Creates the "Options" button (if possible)
                const buildOptions = buildOptionsValid
                    ? `<span class="buildInfoBtn" title="${i18n.getMessage("initialSetupInfoBuildOptionList")}">
                    <a class="buildOptions" href="#"><strong>${i18n.getMessage(
        "initialSetupInfoBuildOptions",
    )}</strong></a></span>`
                    : "";

                // Creates the "Download" button (if possible)
                const buildDownload = buildKeyValid
                    ? `<span class="buildInfoBtn" title="${i18n.getMessage(
                        "initialSetupInfoBuildDownload",
                    )}: ${buildRoot}/hex">
                    <a href="${buildRoot}/hex" target="_blank"><strong>${i18n.getMessage(
    "initialSetupInfoBuildDownload",
)}</strong></a></span>`
                    : "";

                // Shows the "Options" and/or "Download" buttons
                build_firmware_e.html(`${buildOptions} ${buildDownload}`);

                if (buildOptionsValid) {
                    // Creates and attaches the "Options" dialog
                    let buildOptionList = `<div class="dialogBuildInfoGrid-container">`;
                    for (const buildOptionElement of FC.CONFIG.buildOptions) {
                        buildOptionList += `<div class="dialogBuildInfoGrid-item">${buildOptionElement}</div>`;
                    }
                    buildOptionList += `</div>`;

                    $("a.buildOptions").on("click", async function () {
                        showDialogBuildInfo(
                            `<h3>${i18n.getMessage("initialSetupInfoBuildOptionList")}</h3>`,
                            buildOptionList,
                        );
                    });
                }
            } else {
                build_firmware_e.html(
                    isIspConnected
                        ? i18n.getMessage("initialSetupNoBuildInfo")
                        : i18n.getMessage("initialSetupNotOnline"),
                );
            }
        };

        // Hides the "Firmware" part of the "Firmware info" box
        const hideBuildFirmware = function () {
            build_firmware_e.parent().hide();
        };

        // Fills in the "Firmware info" box
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

        // Show Sonar info box if sensor exist
        if (!have_sensor(FC.CONFIG.activeSensors, "sonar")) {
            $(".sonarBox").hide();
        }

        function get_slow_data() {
            // Status info is acquired in the background using update_live_status() in serial_backend.js

            $("#initialSetupArmingAllowed").toggle(FC.CONFIG.armingDisableFlags === 0);

            for (let i = 0; i < FC.CONFIG.armingDisableCount; i++) {
                $(`#initialSetupArmingDisableFlags${i}`).css(
                    "display",
                    (FC.CONFIG.armingDisableFlags & (1 << i)) === 0 ? "none" : "inline-block",
                );
            }

            // System info is acquired in the background using update_live_status() in serial_backend.js

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

            // GPS info is acquired in the background using update_live_status() in serial_backend.js
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

                self.renderModel();
                self.updateInstruments();
            });
            // get Sonar altitude if sensor exist
            if (have_sensor(FC.CONFIG.activeSensors, "sonar")) {
                MSP.send_message(MSPCodes.MSP_SONAR, false, false, function () {
                    sonar_e.text(`${FC.SENSOR_DATA.sonar.toFixed(1)} cm`);
                });
            }
        }

        GUI.interval_add("setup_data_pull_fast", get_fast_data, 33, true); // 30 fps
        GUI.interval_add("setup_data_pull_slow", get_slow_data, 250, true); // 4 fps

        GUI.content_ready(callback);
    }
};

setup.initializeInstruments = function () {
    const options = { size: 90, showBox: false, img_directory: "images/flightindicators/" };
    const attitude = $.flightIndicator("#attitude", "attitude", options);
    const heading = $.flightIndicator("#heading", "heading", options);

    this.updateInstruments = function () {
        attitude.setRoll(FC.SENSOR_DATA.kinematics[0]);
        attitude.setPitch(FC.SENSOR_DATA.kinematics[1]);
        heading.setHeading(FC.SENSOR_DATA.kinematics[2]);
    };
};

setup.initModel = function () {
    this.model = new Model($(".model-and-info #canvas_wrapper"), $(".model-and-info #canvas"));

    $(window).on("resize", $.proxy(this.model.resize, this.model));
};

setup.renderModel = function () {
    const x = FC.SENSOR_DATA.kinematics[1] * -1.0 * 0.017453292519943295,
        y = (FC.SENSOR_DATA.kinematics[2] * -1.0 - this.yaw_fix) * 0.017453292519943295,
        z = FC.SENSOR_DATA.kinematics[0] * -1.0 * 0.017453292519943295;

    this.model.rotateTo(x, y, z);
};

setup.cleanup = function (callback) {
    if (this.model) {
        $(window).off("resize", $.proxy(this.model.resize, this.model));
        this.model.dispose();
    }

    if (callback) callback();
};

setup.expertModeChanged = function () {
    this.refresh();
};

setup.refresh = function () {
    const self = this;

    GUI.tab_switch_cleanup(function () {
        self.initialize();
    });
};

TABS.setup = setup;

export { setup };
