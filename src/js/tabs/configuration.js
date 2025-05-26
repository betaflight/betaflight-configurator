import semver from "semver";
import { i18n } from "../localization";
import GUI, { TABS } from "../gui";
import { tracking } from "../Analytics";
import { mspHelper } from "../msp/MSPHelper";
import FC from "../fc";
import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "../data_storage";
import { updateTabList } from "../utils/updateTabList";
import $ from "jquery";
import { have_sensor } from "../sensor_helpers";
import { sensorTypes } from "../sensor_types";
import { gui_log } from "../gui_log";

const configuration = {
    analyticsChanges: {},
};

const SENSOR_ALIGNMENTS = [
    "CW 0°",
    "CW 90°",
    "CW 180°",
    "CW 270°",
    "CW 0° flip",
    "CW 90° flip",
    "CW 180° flip",
    "CW 270° flip",
    "Custom",
];

const MAX_GYROS = 8; // Maximum number of gyros supported

configuration.initialize = function (callback) {
    const self = this;

    if (GUI.active_tab != "configuration") {
        GUI.active_tab = "configuration";
        GUI.configuration_loaded = true;
    }

    function load_serial_config() {
        mspHelper.loadSerialConfig(load_config);
    }

    function load_config() {
        Promise.resolve(true)
            .then(() => MSP.promise(MSPCodes.MSP_FEATURE_CONFIG))
            .then(() => MSP.promise(MSPCodes.MSP_BEEPER_CONFIG))
            .then(() => MSP.promise(MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG))
            .then(() => MSP.promise(MSPCodes.MSP_ACC_TRIM))
            .then(() => MSP.promise(MSPCodes.MSP_ARMING_CONFIG))
            .then(() => MSP.promise(MSPCodes.MSP_RC_DEADBAND))
            .then(() => MSP.promise(MSPCodes.MSP_SENSOR_CONFIG))
            .then(() => MSP.promise(MSPCodes.MSP_SENSOR_ALIGNMENT))
            .then(() =>
                semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_45)
                    ? MSP.promise(MSPCodes.MSP_NAME)
                    : Promise.resolve(true),
            )
            .then(() =>
                semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)
                    ? MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.CRAFT_NAME))
                    : Promise.resolve(true),
            )
            .then(() => MSP.promise(MSPCodes.MSP_RX_CONFIG))
            .then(() =>
                semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)
                    ? MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.PILOT_NAME))
                    : Promise.resolve(true),
            )
            .then(() => MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG))
            .then(() =>
                semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)
                    ? MSP.promise(MSPCodes.MSP_COMPASS_CONFIG)
                    : Promise.resolve(true),
            )
            .then(() => load_html());
    }

    function load_html() {
        $("#content").load("./tabs/configuration.html", process_html);
    }

    load_serial_config();

    function process_html() {
        self.analyticsChanges = {};

        const features_e = $(".tab-configuration .features");

        FC.FEATURE_CONFIG.features.generateElements(features_e);

        // Dshot Beeper
        const dshotBeeper_e = $(".tab-configuration .dshotbeeper");
        const dshotBeeperBeaconTone = $("select.dshotBeeperBeaconTone");
        const dshotBeaconCondition_e = $("tbody.dshotBeaconConditions");
        const dshotBeaconSwitch_e = $("tr.dshotBeaconSwitch");

        for (let i = 1; i <= 5; i++) {
            dshotBeeperBeaconTone.append(`<option value="${i}">${i}</option>`);
        }
        dshotBeeper_e.show();

        dshotBeeperBeaconTone.change(function () {
            FC.BEEPER_CONFIG.dshotBeaconTone = dshotBeeperBeaconTone.val();
        });

        dshotBeeperBeaconTone.val(FC.BEEPER_CONFIG.dshotBeaconTone);

        const template = $(".beepers .beeper-template");
        dshotBeaconSwitch_e.hide();
        FC.BEEPER_CONFIG.dshotBeaconConditions.generateElements(template, dshotBeaconCondition_e);

        $("input.condition", dshotBeaconCondition_e).change(function () {
            const element = $(this);
            FC.BEEPER_CONFIG.dshotBeaconConditions.updateData(element);
        });

        // Analog Beeper
        const destination = $(".beepers .beeper-configuration");
        const beeper_e = $(".tab-configuration .beepers");

        FC.BEEPER_CONFIG.beepers.generateElements(template, destination);

        // translate to user-selected language
        i18n.localizePage();

        // Gyro and PID update
        const gyroTextElement = $("input.gyroFrequency");
        const gyroSelectElement = $("select.gyroSyncDenom");
        const pidSelectElement = $("select.pidProcessDenom");

        function addDenomOption(element, denom, baseFreq) {
            let denomDescription;
            if (baseFreq === 0) {
                denomDescription = i18n.getMessage("configurationSpeedPidNoGyro", { value: denom });
            } else {
                denomDescription = i18n.getMessage("configurationKHzUnitLabel", {
                    value: (baseFreq / denom).toFixed(2),
                });
            }
            element.append(`<option value="${denom}">${denomDescription}</option>`);
        }

        const updateGyroDenomReadOnly = function (gyroFrequency) {
            gyroSelectElement.hide();

            let gyroContent;
            if (gyroFrequency === 0) {
                gyroContent = i18n.getMessage("configurationSpeedGyroNoGyro");
            } else {
                gyroContent = i18n.getMessage("configurationKHzUnitLabel", {
                    value: (gyroFrequency / 1000).toFixed(2),
                });
            }
            gyroTextElement.val(gyroContent);
        };

        $("div.gyroUse32kHz").hide();

        updateGyroDenomReadOnly(FC.CONFIG.sampleRateHz);

        gyroSelectElement.val(FC.PID_ADVANCED_CONFIG.gyro_sync_denom);

        $(".systemconfigNote").html(i18n.getMessage("configurationLoopTimeHelp"));

        gyroSelectElement
            .change(function () {
                const originalPidDenom = parseInt(pidSelectElement.val());
                const pidBaseFreq = FC.CONFIG.sampleRateHz / 1000;
                const MAX_DENOM = 8;

                pidSelectElement.empty();

                for (let denom = 1; denom <= MAX_DENOM; denom++) {
                    addDenomOption(pidSelectElement, denom, pidBaseFreq);
                }

                pidSelectElement.val(originalPidDenom);
            })
            .change();

        pidSelectElement.val(FC.PID_ADVANCED_CONFIG.pid_process_denom);

        $('input[id="accHardwareSwitch"]').prop("checked", FC.SENSOR_CONFIG.acc_hardware !== 1);
        $('input[id="baroHardwareSwitch"]').prop("checked", FC.SENSOR_CONFIG.baro_hardware !== 1);
        $('input[id="magHardwareSwitch"]').prop("checked", FC.SENSOR_CONFIG.mag_hardware !== 1);

        // Only show these sections for supported FW
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            $('input[name="craftName"]').val(FC.CONFIG.craftName);
            $('input[name="pilotName"]').val(FC.CONFIG.pilotName);
        } else {
            $('input[name="craftName"]').val(FC.CONFIG.name);
            $(".pilotName").hide();
        }

        $('input[name="fpvCamAngleDegrees"]').val(FC.RX_CONFIG.fpvCamAngleDegrees);

        // fill board alignment
        $('input[name="board_align_roll"]').val(FC.BOARD_ALIGNMENT_CONFIG.roll);
        $('input[name="board_align_pitch"]').val(FC.BOARD_ALIGNMENT_CONFIG.pitch);
        $('input[name="board_align_yaw"]').val(FC.BOARD_ALIGNMENT_CONFIG.yaw);

        // fill accel trims
        $('input[name="roll"]').val(FC.CONFIG.accelerometerTrims[1]);
        $('input[name="pitch"]').val(FC.CONFIG.accelerometerTrims[0]);

        $('input[id="configurationSmallAngle"]').val(FC.ARMING_CONFIG.small_angle);

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            $('input[id="configurationGyroCalOnFirstArm"]').prop(
                "checked",
                FC.ARMING_CONFIG.gyro_cal_on_first_arm === 1,
            );

            if (FC.FEATURE_CONFIG.features.isEnabled("MOTOR_STOP")) {
                $('input[id="configurationAutoDisarmDelay"]').val(FC.ARMING_CONFIG.auto_disarm_delay);
            } else {
                $('input[id="configurationAutoDisarmDelay"]').parent().hide();
            }
        } else {
            $('input[id="configurationGyroCalOnFirstArm"]').parent().parent().hide();
            $('input[id="configurationAutoDisarmDelay"]').parent().parent().hide();
        }

        const gyro_align_elements = [];

        // Multi gyro handling for newer firmware
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            // Define gyro detection flags
            const GYRO_DETECTION_FLAGS = { DETECTED_DUAL_GYROS: 1 << 7 };
            for (let i = 0; i < MAX_GYROS; i++) {
                GYRO_DETECTION_FLAGS[`DETECTED_GYRO_${i + 1}`] = 1 << i;
            }

            // Initialize gyro_enable_mask if needed
            if (FC.SENSOR_ALIGNMENT.gyro_enable_mask === undefined) {
                FC.SENSOR_ALIGNMENT.gyro_enable_mask = (1 << MAX_GYROS) - 1; // All enabled by default
            } else if (FC.SENSOR_ALIGNMENT.gyro_enable_mask === 0) {
                // Safety check: if somehow all gyros are disabled, enable the first one
                FC.SENSOR_ALIGNMENT.gyro_enable_mask = 1;
            }

            // Use the specific gyro container (not the general sensor_align_content)
            const gyroContainer = $(".sensor_align_content .gyro_align_box");

            // Hide the gyro selector (not used in new firmware)
            $(".gyro_alignment_inputs_selection").hide();

            // Hide unused legacy elements
            $(".gyro_alignment_inputs_first").hide();
            $(".gyro_alignment_inputs_second").hide();

            // Track which gyros are detected
            const detected_gyros = [];

            // Make the gyro container visible
            gyroContainer.show();

            // Clear any existing content in the gyro container
            gyroContainer.empty();

            function createGyroAlignmentUI(gyroIndex, container) {
                // Create a new gyro alignment div
                const gyroBox = $(`<div class="gyro_box" id="gyro_box_${gyroIndex + 1}"></div>`);

                // Create a combined row for alignment and enable/disable
                const combinedRow = $(`<div class="gyro_row"></div>`);
                const alignmentLabel = $(`<span>${i18n.getMessage("configurationSensorAlignment")}</span>`);
                const alignmentSelect = $(`<select class="gyro_${gyroIndex + 1}_align"></select>`);

                // Add all alignment options
                for (let j = 0; j < SENSOR_ALIGNMENTS.length; j++) {
                    alignmentSelect.append(`<option value="${j + 1}">${SENSOR_ALIGNMENTS[j]}</option>`);
                }

                // Create enable/disable checkbox
                const enableCheck = $(`<div class="checkbox enable-checkbox">
                    <label>
                        <input type="checkbox" class="toggle" id="gyro_${gyroIndex + 1}_enable">
                        <span>${i18n.getMessage("configurationSensorGyroEnable")} ${gyroIndex + 1}</span>
                    </label>
                </div>`);

                // Add both elements to the combined row
                const alignmentContainer = $(`<div class="alignment-container"></div>`);
                alignmentContainer.append(alignmentLabel, alignmentSelect);

                // First the checkbox, then the alignment dropdown
                combinedRow.append(enableCheck, alignmentContainer);

                // Create custom alignment section
                const customAlignSection = $(
                    `<div id="custom_align_gyro_${gyroIndex + 1}" class="custom_alignment"></div>`,
                );

                // Create a single row for all alignment inputs
                const customAlignRow = $(`<div class="alignment_inputs_row"></div>`);

                // Create the roll input
                const rollInput = $(`<div class="alignment_input_cell">
                    <div class="alignment_label">
                        <div class="alignicon roll"></div>
                        <span>${i18n.getMessage("configurationGyroAlignmentRoll")}</span>
                    </div>
                    <input type="number" class="gyro_${gyroIndex + 1}_align_roll" min="-180" max="360" step="1" value="0" />
                </div>`);

                // Create the pitch input
                const pitchInput = $(`<div class="alignment_input_cell">
                    <div class="alignment_label">
                        <div class="alignicon pitch"></div>
                        <span>${i18n.getMessage("configurationGyroAlignmentPitch")}</span>
                    </div>
                    <input type="number" class="gyro_${gyroIndex + 1}_align_pitch" min="-180" max="360" step="1" value="0" />
                </div>`);

                // Create the yaw input
                const yawInput = $(`<div class="alignment_input_cell">
                    <div class="alignment_label">
                        <div class="alignicon yaw"></div>
                        <span>${i18n.getMessage("configurationGyroAlignmentYaw")}</span>
                    </div>
                    <input type="number" class="gyro_${gyroIndex + 1}_align_yaw" min="-180" max="360" step="1" value="0" />
                </div>`);

                // Initialize custom alignment values
                if (FC.SENSOR_ALIGNMENT.gyro_align_roll[gyroIndex] !== undefined) {
                    rollInput.find("input").val(FC.SENSOR_ALIGNMENT.gyro_align_roll[gyroIndex]);
                    pitchInput.find("input").val(FC.SENSOR_ALIGNMENT.gyro_align_pitch[gyroIndex]);
                    yawInput.find("input").val(FC.SENSOR_ALIGNMENT.gyro_align_yaw[gyroIndex]);
                } else {
                    FC.SENSOR_ALIGNMENT.gyro_align_roll[gyroIndex] = 0;
                    FC.SENSOR_ALIGNMENT.gyro_align_pitch[gyroIndex] = 0;
                    FC.SENSOR_ALIGNMENT.gyro_align_yaw[gyroIndex] = 0;
                }

                // Add custom alignment inputs to row
                customAlignRow.append(rollInput, pitchInput, yawInput);

                // Add row to custom alignment section
                customAlignSection.append(customAlignRow);

                // Assemble the box
                gyroBox.append(combinedRow);
                gyroBox.append(customAlignSection);

                // Add the box to the container
                container.append(gyroBox);

                // Store reference to alignment element
                gyro_align_elements[gyroIndex] = alignmentSelect;

                // Initialize alignment dropdown with current value
                if (FC.SENSOR_ALIGNMENT.gyro_align[gyroIndex] !== undefined) {
                    alignmentSelect.val(FC.SENSOR_ALIGNMENT.gyro_align[gyroIndex]);
                }

                // Initialize the enable checkbox
                enableCheck
                    .find("input")
                    .prop("checked", (FC.SENSOR_ALIGNMENT.gyro_enable_mask & (1 << gyroIndex)) !== 0);

                // Toggle custom alignment visibility based on current value
                const isCustom = parseInt(FC.SENSOR_ALIGNMENT.gyro_align[gyroIndex]) === SENSOR_ALIGNMENTS.length;
                customAlignSection.toggle(isCustom);

                // Add change handler for alignment
                alignmentSelect.on("change", function () {
                    const value = parseInt($(this).val());

                    if (value !== FC.SENSOR_ALIGNMENT.gyro_align[gyroIndex]) {
                        const newValue = $(this).find("option:selected").text();
                        self.analyticsChanges[`Gyro${gyroIndex + 1}Alignment`] = newValue;
                    }

                    FC.SENSOR_ALIGNMENT.gyro_align[gyroIndex] = value;

                    // Toggle custom alignment
                    customAlignSection.toggle(value === SENSOR_ALIGNMENTS.length);

                    // If custom alignment is selected, ensure the custom values are initialized
                    if (value === SENSOR_ALIGNMENTS.length) {
                        if (FC.SENSOR_ALIGNMENT.gyro_align_roll[gyroIndex] === undefined) {
                            FC.SENSOR_ALIGNMENT.gyro_align_roll[gyroIndex] = 0;
                            FC.SENSOR_ALIGNMENT.gyro_align_pitch[gyroIndex] = 0;
                            FC.SENSOR_ALIGNMENT.gyro_align_yaw[gyroIndex] = 0;

                            rollInput.find("input").val(0);
                            pitchInput.find("input").val(0);
                            yawInput.find("input").val(0);
                        }
                    }
                });

                // Add change handlers for custom alignment inputs
                rollInput.find("input").on("change", function () {
                    const value = parseInt($(this).val());
                    const min = parseInt($(this).attr("min"));
                    const max = parseInt($(this).attr("max"));
                    FC.SENSOR_ALIGNMENT.gyro_align_roll[gyroIndex] = Math.max(min, Math.min(max, value || 0));
                });
                pitchInput.find("input").on("change", function () {
                    const value = parseInt($(this).val());
                    const min = parseInt($(this).attr("min"));
                    const max = parseInt($(this).attr("max"));
                    FC.SENSOR_ALIGNMENT.gyro_align_pitch[gyroIndex] = Math.max(min, Math.min(max, value || 0));
                });
                yawInput.find("input").on("change", function () {
                    const value = parseInt($(this).val());
                    const min = parseInt($(this).attr("min"));
                    const max = parseInt($(this).attr("max"));
                    FC.SENSOR_ALIGNMENT.gyro_align_yaw[gyroIndex] = Math.max(min, Math.min(max, value || 0));
                });
                // Add handler for enable/disable checkbox
                enableCheck.find("input").change(function () {
                    const checked = $(this).is(":checked");

                    if (checked) {
                        // Enabling a gyro is always fine
                        FC.SENSOR_ALIGNMENT.gyro_enable_mask |= 1 << gyroIndex;
                    } else {
                        // Safety check: prevent disabling all gyros
                        const newMask = FC.SENSOR_ALIGNMENT.gyro_enable_mask & ~(1 << gyroIndex);
                        if (newMask === 0) {
                            // Prevent the action - keep the checkbox checked
                            $(this).prop("checked", true);

                            // Show an error message to the user
                            gui_log(i18n.getMessage("configurationGyroRequiredWarning"));
                            return;
                        }

                        // It's safe to disable this gyro
                        FC.SENSOR_ALIGNMENT.gyro_enable_mask = newMask;
                    }

                    self.analyticsChanges[`Gyro${gyroIndex + 1}Enable`] = checked;
                });
            }

            // For each possible gyro
            for (let i = 0; i < MAX_GYROS; i++) {
                detected_gyros[i] =
                    (FC.SENSOR_ALIGNMENT.gyro_detection_flags & GYRO_DETECTION_FLAGS[`DETECTED_GYRO_${i + 1}`]) != 0;

                // If gyro is detected, create UI for it
                if (detected_gyros[i]) {
                    createGyroAlignmentUI(i, gyroContainer);
                }
            }

            // Only show not found message if no gyros are detected
            $(".gyro_alignment_inputs_notfound").toggle(!detected_gyros.some((detected) => detected));
        } else {
            // Original code for older firmware versions remains unchanged
            const orientation_gyro_to_use_e = $("select.gyro_to_use");
            const orientation_gyro_1_align_e = $("select.gyro_1_align");
            const orientation_gyro_2_align_e = $("select.gyro_2_align");

            const GYRO_DETECTION_FLAGS = {
                DETECTED_GYRO_1: 1 << 0,
                DETECTED_GYRO_2: 1 << 1,
                DETECTED_DUAL_GYROS: 1 << 7,
            };

            const detected_gyro_1 =
                (FC.SENSOR_ALIGNMENT.gyro_detection_flags & GYRO_DETECTION_FLAGS.DETECTED_GYRO_1) != 0;
            const detected_gyro_2 =
                (FC.SENSOR_ALIGNMENT.gyro_detection_flags & GYRO_DETECTION_FLAGS.DETECTED_GYRO_2) != 0;
            const detected_dual_gyros =
                (FC.SENSOR_ALIGNMENT.gyro_detection_flags & GYRO_DETECTION_FLAGS.DETECTED_DUAL_GYROS) != 0;

            if (detected_gyro_1) {
                orientation_gyro_to_use_e.append(
                    `<option value="0">${i18n.getMessage("configurationSensorGyroToUseFirst")}</option>`,
                );
            }
            if (detected_gyro_2) {
                orientation_gyro_to_use_e.append(
                    `<option value="1">${i18n.getMessage("configurationSensorGyroToUseSecond")}</option>`,
                );
            }
            if (detected_dual_gyros) {
                orientation_gyro_to_use_e.append(
                    `<option value="2">${i18n.getMessage("configurationSensorGyroToUseBoth")}</option>`,
                );
            }

            for (let i = 0; i < SENSOR_ALIGNMENTS.length; i++) {
                orientation_gyro_1_align_e.append(`<option value="${i + 1}">${SENSOR_ALIGNMENTS[i]}</option>`);
                orientation_gyro_2_align_e.append(`<option value="${i + 1}">${SENSOR_ALIGNMENTS[i]}</option>`);
            }

            orientation_gyro_to_use_e.val(FC.SENSOR_ALIGNMENT.gyro_to_use);
            orientation_gyro_1_align_e.val(FC.SENSOR_ALIGNMENT.gyro_1_align);
            orientation_gyro_2_align_e.val(FC.SENSOR_ALIGNMENT.gyro_2_align);

            $(".gyro_alignment_inputs_first").toggle(detected_gyro_1);
            $(".gyro_alignment_inputs_second").toggle(detected_gyro_2);
            $(".gyro_alignment_inputs_selection").toggle(detected_gyro_1 || detected_gyro_2);
            $(".gyro_alignment_inputs_notfound").toggle(!detected_gyro_1 && !detected_gyro_2);

            // Keep original handlers
            orientation_gyro_1_align_e.on("change", function () {
                const value = parseInt($(this).val());

                if (value !== FC.SENSOR_ALIGNMENT.gyro_1_align) {
                    const newValue = $(this).find("option:selected").text();
                    self.analyticsChanges["Gyro1Alignment"] = newValue;
                }
                FC.SENSOR_ALIGNMENT.gyro_1_align = value;
            });

            orientation_gyro_2_align_e.on("change", function () {
                const value = parseInt($(this).val());

                if (value !== FC.SENSOR_ALIGNMENT.gyro_2_align) {
                    const newValue = $(this).find("option:selected").text();
                    self.analyticsChanges["Gyro2Alignment"] = newValue;
                }
                FC.SENSOR_ALIGNMENT.gyro_2_align = value;
            });
        }

        function toggleMagCustomAlignmentInputs() {
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                $('input[name="mag_align_roll"]').attr(
                    "disabled",
                    FC.SENSOR_ALIGNMENT.align_mag !== SENSOR_ALIGNMENTS.length,
                );
                $('input[name="mag_align_pitch"]').attr(
                    "disabled",
                    FC.SENSOR_ALIGNMENT.align_mag !== SENSOR_ALIGNMENTS.length,
                );
                $('input[name="mag_align_yaw"]').attr(
                    "disabled",
                    FC.SENSOR_ALIGNMENT.align_mag !== SENSOR_ALIGNMENTS.length,
                );
            }
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            $('input[name="mag_align_roll"]').val(FC.SENSOR_ALIGNMENT.mag_align_roll);
            $('input[name="mag_align_pitch"]').val(FC.SENSOR_ALIGNMENT.mag_align_pitch);
            $('input[name="mag_align_yaw"]').val(FC.SENSOR_ALIGNMENT.mag_align_yaw);

            toggleMagCustomAlignmentInputs();
        } else {
            $(".tab-configuration .gyro_align_box").hide();
            $(".tab-configuration .mag_align_box").hide();
        }

        // Magnetometer
        const orientation_mag_e = $("select.mag_align");

        const hasMag =
            have_sensor(FC.CONFIG.activeSensors, "mag") && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46);

        if (hasMag) {
            $('input[name="mag_declination"]').val(FC.COMPASS_CONFIG.mag_declination.toFixed(1));
        } else {
            $("div.mag_declination").parent().parent().hide();
        }

        for (let i = 0; i < SENSOR_ALIGNMENTS.length; i++) {
            orientation_mag_e.append(`<option value="${i + 1}">${SENSOR_ALIGNMENTS[i]}</option>`);
        }

        orientation_mag_e.val(FC.SENSOR_ALIGNMENT.align_mag);

        orientation_mag_e.change(function () {
            let value = parseInt($(this).val());

            let newValue = undefined;
            if (value !== FC.SENSOR_ALIGNMENT.align_mag) {
                newValue = $(this).find("option:selected").text();
            }
            self.analyticsChanges["MagAlignment"] = newValue;

            FC.SENSOR_ALIGNMENT.align_mag = value;

            toggleMagCustomAlignmentInputs();
        });

        // Range finder
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            const rangeFinderType_e = $("select.rangefinderType");
            const sonarElements = sensorTypes().sonar.elements;

            for (let i = 0; i < sonarElements.length; i++) {
                rangeFinderType_e.append(`<option value="${i}">${sonarElements[i]}</option>`);
            }

            rangeFinderType_e.val(FC.SENSOR_CONFIG.sonar_hardware);
        } else {
            $(".tab-configuration .rangefinder").parent().hide();
        }

        // Optical flow sensor
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            const opticalflowType_e = $("select.opticalflowType");
            const opticalflowElements = sensorTypes().opticalflow.elements;

            for (let i = 0; i < opticalflowElements.length; i++) {
                opticalflowType_e.append(`<option value="${i}">${opticalflowElements[i]}</option>`);
            }

            opticalflowType_e.val(FC.SENSOR_CONFIG.opticalflow_hardware);
        } else {
            $(".tab-configuration .opticalflow").parent().hide();
        }

        // UI hooks

        $("input.feature", features_e).change(function () {
            const element = $(this);

            FC.FEATURE_CONFIG.features.updateData(element);
            updateTabList(FC.FEATURE_CONFIG.features);
        });

        $('input[id="accHardwareSwitch"]')
            .change(function () {
                const checked = $(this).is(":checked");
                $(".accelNeeded").toggle(checked);
            })
            .change();

        $(features_e)
            .filter("select")
            .change(function () {
                const element = $(this);

                FC.FEATURE_CONFIG.features.updateData(element);
                updateTabList(FC.FEATURE_CONFIG.features);
            });

        $("input.condition", beeper_e).change(function () {
            const element = $(this);
            FC.BEEPER_CONFIG.beepers.updateData(element);
        });

        function save_config() {
            // Define all configuration operations to execute
            const saveOperations = [
                { code: MSPCodes.MSP_SET_FEATURE_CONFIG },
                { code: MSPCodes.MSP_SET_BEEPER_CONFIG },
                { code: MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG },
                { code: MSPCodes.MSP_SET_RC_DEADBAND },
                { code: MSPCodes.MSP_SET_SENSOR_ALIGNMENT },
                { code: MSPCodes.MSP_SET_ADVANCED_CONFIG },
                { code: MSPCodes.MSP_SET_ACC_TRIM },
                { code: MSPCodes.MSP_SET_ARMING_CONFIG },
                { code: MSPCodes.MSP_SET_SENSOR_CONFIG },
                {
                    condition: () => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45),
                    code: MSPCodes.MSP2_SET_TEXT,
                    extraParams: MSPCodes.CRAFT_NAME,
                    fallback: { code: MSPCodes.MSP_SET_NAME },
                },
                {
                    condition: () => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45),
                    code: MSPCodes.MSP2_SET_TEXT,
                    extraParams: MSPCodes.PILOT_NAME,
                },
                { code: MSPCodes.MSP_SET_RX_CONFIG },
                {
                    condition: () => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46),
                    code: MSPCodes.MSP_SET_COMPASS_CONFIG,
                },
            ];

            // Start with a resolved promise
            let saveChain = Promise.resolve(true);

            // Build the promise chain
            saveOperations.forEach((operation) => {
                saveChain = saveChain.then(() => {
                    // Skip if operation has a condition that returns false
                    if (operation.condition && !operation.condition()) {
                        if (operation.fallback) {
                            // Use fallback operation if provided
                            return MSP.promise(
                                operation.fallback.code,
                                operation.fallback.extraParams
                                    ? mspHelper.crunch(operation.fallback.code, operation.fallback.extraParams)
                                    : mspHelper.crunch(operation.fallback.code),
                            );
                        }
                        return Promise.resolve(true);
                    }

                    // Execute the operation
                    return MSP.promise(
                        operation.code,
                        operation.extraParams
                            ? mspHelper.crunch(operation.code, operation.extraParams)
                            : mspHelper.crunch(operation.code),
                    );
                });
            });

            // Complete the chain with final write
            return saveChain.then(() => mspHelper.writeConfiguration(true));
        }

        $("a.save").on("click", function () {
            // gather data that doesn't have automatic change event bound
            FC.BOARD_ALIGNMENT_CONFIG.roll = parseInt($('input[name="board_align_roll"]').val());
            FC.BOARD_ALIGNMENT_CONFIG.pitch = parseInt($('input[name="board_align_pitch"]').val());
            FC.BOARD_ALIGNMENT_CONFIG.yaw = parseInt($('input[name="board_align_yaw"]').val());

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                // Initialize arrays if they don't exist
                if (!Array.isArray(FC.SENSOR_ALIGNMENT.gyro_align_roll)) {
                    FC.SENSOR_ALIGNMENT.gyro_align = new Array(MAX_GYROS).fill(1);
                    FC.SENSOR_ALIGNMENT.gyro_align_roll = new Array(MAX_GYROS).fill(0);
                    FC.SENSOR_ALIGNMENT.gyro_align_pitch = new Array(MAX_GYROS).fill(0);
                    FC.SENSOR_ALIGNMENT.gyro_align_yaw = new Array(MAX_GYROS).fill(0);
                }

                FC.SENSOR_ALIGNMENT.gyro_enable_mask = 0;

                // Gather the enable/disable state for all gyros
                for (let i = 0; i < MAX_GYROS; i++) {
                    // Check if the checkbox is checked for this gyro
                    if ($(`#gyro_${i + 1}_enable`).is(":checked")) {
                        // Set the bit in the mask
                        FC.SENSOR_ALIGNMENT.gyro_enable_mask |= 1 << i;
                    }
                    // If not checked, the bit stays 0 as we initialized the mask to 0

                    // Use stored reference for more reliable access
                    FC.SENSOR_ALIGNMENT.gyro_align[i] = gyro_align_elements[i]
                        ? parseInt(gyro_align_elements[i].val())
                        : 0;
                }

                // Gather custom alignment values for all detected gyros
                for (let i = 0; i < MAX_GYROS; i++) {
                    // Get the values from the inputs and store in the arrays
                    FC.SENSOR_ALIGNMENT.gyro_align_roll[i] = parseInt($(`.gyro_${i + 1}_align_roll`).val()) || 0;
                    FC.SENSOR_ALIGNMENT.gyro_align_pitch[i] = parseInt($(`.gyro_${i + 1}_align_pitch`).val()) || 0;
                    FC.SENSOR_ALIGNMENT.gyro_align_yaw[i] = parseInt($(`.gyro_${i + 1}_align_yaw`).val()) || 0;
                }

                FC.SENSOR_ALIGNMENT.mag_align_roll = parseInt($('input[name="mag_align_roll"]').val());
                FC.SENSOR_ALIGNMENT.mag_align_pitch = parseInt($('input[name="mag_align_pitch"]').val());
                FC.SENSOR_ALIGNMENT.mag_align_yaw = parseInt($('input[name="mag_align_yaw"]').val());
            } else {
                FC.SENSOR_ALIGNMENT.gyro_1_align = parseInt($("select.gyro_1_align").val());
                FC.SENSOR_ALIGNMENT.gyro_2_align = parseInt($("select.gyro_2_align").val());
                FC.SENSOR_ALIGNMENT.gyro_to_use = parseInt($("select.gyro_to_use").val());
            }

            FC.CONFIG.accelerometerTrims[1] = parseInt($('input[name="roll"]').val());
            FC.CONFIG.accelerometerTrims[0] = parseInt($('input[name="pitch"]').val());

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                FC.ARMING_CONFIG.gyro_cal_on_first_arm = $('input[id="configurationGyroCalOnFirstArm"]').is(":checked")
                    ? 1
                    : 0;
                // only update auto_disarm_delay if MOTOR_STOP is enabled
                if (FC.FEATURE_CONFIG.features.isEnabled("MOTOR_STOP")) {
                    FC.ARMING_CONFIG.auto_disarm_delay = parseInt($('input[id="configurationAutoDisarmDelay"]').val());
                }
            }

            // declination added first in #3676
            if (hasMag) {
                FC.COMPASS_CONFIG.mag_declination = $('input[name="mag_declination"]').val();
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                FC.SENSOR_CONFIG.sonar_hardware = $("select.rangefinderType").val();
                FC.SENSOR_CONFIG.opticalflow_hardware = $("select.opticalflowType").val();
            }

            FC.ARMING_CONFIG.small_angle = parseInt($('input[id="configurationSmallAngle"]').val());

            FC.PID_ADVANCED_CONFIG.gyro_sync_denom = parseInt(gyroSelectElement.val());

            const value = parseInt(pidSelectElement.val());

            if (value !== FC.PID_ADVANCED_CONFIG.pid_process_denom) {
                const newFrequency = pidSelectElement.find("option:selected").text();
                self.analyticsChanges["PIDLoopSettings"] = `denominator: ${value} | frequency: ${newFrequency}`;
            } else {
                self.analyticsChanges["PIDLoopSettings"] = undefined;
            }

            FC.PID_ADVANCED_CONFIG.pid_process_denom = value;

            FC.RX_CONFIG.fpvCamAngleDegrees = parseInt($('input[name="fpvCamAngleDegrees"]').val());

            tracking.sendSaveAndChangeEvents(
                tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER,
                self.analyticsChanges,
                "configuration",
            );
            self.analyticsChanges = {};

            // fill some data
            FC.SENSOR_CONFIG.acc_hardware = $('input[id="accHardwareSwitch"]').is(":checked") ? 0 : 1;
            FC.SENSOR_CONFIG.baro_hardware = $('input[id="baroHardwareSwitch"]').is(":checked") ? 0 : 1;
            FC.SENSOR_CONFIG.mag_hardware = $('input[id="magHardwareSwitch"]').is(":checked") ? 0 : 1;

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                FC.CONFIG.craftName = $('input[name="craftName"]').val().trim();
                FC.CONFIG.pilotName = $('input[name="pilotName"]').val().trim();
            } else {
                FC.CONFIG.name = $('input[name="craftName"]').val().trim();
            }

            mspHelper.sendSerialConfig(save_config);
        });

        // status data pulled via separate timer with static speed
        GUI.interval_add(
            "status_pull",
            function () {
                MSP.send_message(MSPCodes.MSP_STATUS);
            },
            250,
            true,
        );
        GUI.content_ready(callback);
    }
};

configuration.cleanup = function (callback) {
    if (callback) callback();
};

TABS.configuration = configuration;
export { configuration };
