import { i18n } from "../localization";
import { colorTables, getColorForPercentage } from '../utils/css.js';
import GUI, { TABS } from '../gui';
import { tracking } from "../Analytics";
import { have_sensor } from "../sensor_helpers";
import { mspHelper } from "../msp/MSPHelper";
import FC from "../fc";
import MSP from "../msp";
import TuningSliders from "../TuningSliders";
import Model from "../model";
import RateCurve from "../RateCurve";
import MSPCodes from "../msp/MSPCodes";
import { API_VERSION_1_42, API_VERSION_1_43, API_VERSION_1_44, API_VERSION_1_45 } from "../data_storage";
import { gui_log } from "../gui_log";
import { degToRad, isInt } from "../utils/common";
import semver from "semver";
import * as THREE from "three";
import $ from 'jquery';

const pid_tuning = {
    RATE_PROFILE_MASK: 128,
    showAllPids: false,
    updating: true,
    dirty: false,
    previousFilterDynQ: null,
    previousFilterDynCount: null,
    currentProfile: null,
    currentRateProfile: null,
    currentRatesType: null,
    previousRatesType: null,
    SETPOINT_WEIGHT_RANGE_LOW: 2.55,
    SETPOINT_WEIGHT_RANGE_HIGH: 20,
    SETPOINT_WEIGHT_RANGE_LEGACY: 2.54,
    activeSubtab: 'pid',
    analyticsChanges: {},

    CONFIGURATOR_PIDS: [],
    CONFIGURATOR_ADVANCED_TUNING: {},
    CONFIGURATOR_FILTER_CONFIG: {},
    CONFIGURATOR_RC_TUNING: {},
    CONFIGURATOR_FEATURE_CONFIG: {},
    CONFIGURATOR_TUNING_SLIDERS: {},
};

pid_tuning.initialize = function (callback) {

    const self = this;

    if (GUI.active_tab !== 'pid_tuning') {
        GUI.active_tab = 'pid_tuning';
        self.activeSubtab = 'pid';
    }

    // Update filtering and pid defaults based on API version
    const FILTER_DEFAULT = FC.getFilterDefaults();
    const PID_DEFAULT = FC.getPidDefaults();

    MSP.promise(MSPCodes.MSP_PID_CONTROLLER)
        .then(() => MSP.promise(MSPCodes.MSP_PIDNAMES))
        .then(() => MSP.promise(MSPCodes.MSP_PID))
        .then(() => MSP.promise(MSPCodes.MSP_PID_ADVANCED))
        .then(() => MSP.promise(MSPCodes.MSP_RC_TUNING))
        .then(() => MSP.promise(MSPCodes.MSP_FILTER_CONFIG))
        .then(() => MSP.promise(MSPCodes.MSP_RC_DEADBAND))
        .then(() => MSP.promise(MSPCodes.MSP_MOTOR_CONFIG))
        .then(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) ? MSP.promise(MSPCodes.MSP2_GET_TEXT,
            mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.PID_PROFILE_NAME)) : true)
        .then(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) ? MSP.promise(MSPCodes.MSP2_GET_TEXT,
            mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.RATE_PROFILE_NAME)) : true)
        .then(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44) ? MSP.promise(MSPCodes.MSP_SIMPLIFIED_TUNING) : true)
        .then(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44) ? MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG) : true)
        .then(() => MSP.send_message(MSPCodes.MSP_MIXER_CONFIG, false, false, load_html));

    function load_html() {
        $('#content').load("./tabs/pid_tuning.html", process_html);
    }

    const vbatpidcompensationIsUsed = semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44);

    function pid_and_rc_to_form() {
        self.setProfile();
        self.setRateProfile();

        // Profile names
        if (semver.gte(FC.CONFIG.apiVersion, "1.45.0")) {
            $('input[name="pidProfileName"]').val(FC.CONFIG.pidProfileNames[FC.CONFIG.profile]);
            $('input[name="rateProfileName"]').val(FC.CONFIG.rateProfileNames[FC.CONFIG.rateProfile]);
        } else {
            $('.profile_name').hide();
        }

        // Fill in the data from PIDs array for each pid name
        FC.PID_NAMES.forEach(function(elementPid, indexPid) {

            // Look into the PID table to a row with the name of the pid
            const searchRow = $(`.pid_tuning .${elementPid} input`);

            // Assign each value
            searchRow.each((indexInput, element) => {
                if (FC.PIDS[indexPid][indexInput] !== undefined) {
                    $(element).val(FC.PIDS_ACTIVE[indexPid][indexInput]);
                }
            });
        });

        // Fill in data from RC_tuning object
        $('.pid_tuning input[name="rc_rate"]').val(FC.RC_TUNING.RC_RATE.toFixed(2));
        $('.pid_tuning input[name="roll_pitch_rate"]').val(FC.RC_TUNING.roll_pitch_rate.toFixed(2));
        $('.pid_tuning input[name="roll_rate"]').val(FC.RC_TUNING.roll_rate.toFixed(2));
        $('.pid_tuning input[name="pitch_rate"]').val(FC.RC_TUNING.pitch_rate.toFixed(2));
        $('.pid_tuning input[name="yaw_rate"]').val(FC.RC_TUNING.yaw_rate.toFixed(2));
        $('.pid_tuning input[name="rc_expo"]').val(FC.RC_TUNING.RC_EXPO.toFixed(2));
        $('.pid_tuning input[name="rc_yaw_expo"]').val(FC.RC_TUNING.RC_YAW_EXPO.toFixed(2));

        $('.throttle input[name="mid"]').val(FC.RC_TUNING.throttle_MID.toFixed(2));
        $('.throttle input[name="expo"]').val(FC.RC_TUNING.throttle_EXPO.toFixed(2));

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            // Moved tpa to profile
            $('select[id="tpaMode"]').val(FC.ADVANCED_TUNING.tpaMode);
            $('input[id="tpaRate"]').val(FC.ADVANCED_TUNING.tpaRate * 100);
            $('input[id="tpaBreakpoint"]').val(FC.ADVANCED_TUNING.tpaBreakpoint);
        } else {
            $('.tpa-old input[name="tpa"]').val(FC.RC_TUNING.dynamic_THR_PID.toFixed(2));
            $('.tpa-old input[name="tpa-breakpoint"]').val(FC.RC_TUNING.dynamic_THR_breakpoint);
        }

        $('.vbatpidcompensation').toggle(vbatpidcompensationIsUsed);
        $('input[id="vbatpidcompensation"]').prop('checked', FC.ADVANCED_TUNING.vbatPidCompensation !== 0);

        $('#pid-tuning .delta select').val(FC.ADVANCED_TUNING.deltaMethod);

        $('.pid_tuning input[name="rc_rate_yaw"]').val(FC.RC_TUNING.rcYawRate.toFixed(2));
        $('.pid_filter input[name="gyroLowpassFrequency"]').val(FC.FILTER_CONFIG.gyro_lowpass_hz);
        $('.pid_filter input[name="dtermLowpassFrequency"]').val(FC.FILTER_CONFIG.dterm_lowpass_hz);
        $('.pid_filter input[name="yawLowpassFrequency"]').val(FC.FILTER_CONFIG.yaw_lowpass_hz);

        $('#pid-tuning .rate').text(i18n.getMessage("pidTuningSuperRate"));

        $('.pid_filter input[name="gyroNotch1Frequency"]').val(FC.FILTER_CONFIG.gyro_notch_hz);
        $('.pid_filter input[name="gyroNotch1Cutoff"]').val(FC.FILTER_CONFIG.gyro_notch_cutoff);
        $('.pid_filter input[name="dTermNotchFrequency"]').val(FC.FILTER_CONFIG.dterm_notch_hz);
        $('.pid_filter input[name="dTermNotchCutoff"]').val(FC.FILTER_CONFIG.dterm_notch_cutoff);

        const dtermSetpointTransitionNumberElement = $('input[name="dtermSetpointTransition-number"]');
        dtermSetpointTransitionNumberElement.attr('min', 0.00);
        dtermSetpointTransitionNumberElement.val(FC.ADVANCED_TUNING.dtermSetpointTransition / 100);

        $('input[name="dtermSetpoint-number"]').val(FC.ADVANCED_TUNING.dtermSetpointWeight / 100);

        $('.pid_filter input[name="gyroNotch2Frequency"]').val(FC.FILTER_CONFIG.gyro_notch2_hz);
        $('.pid_filter input[name="gyroNotch2Cutoff"]').val(FC.FILTER_CONFIG.gyro_notch2_cutoff);

        $('.pid_tuning input[name="angleLimit"]').val(FC.ADVANCED_TUNING.levelAngleLimit);

        $('.pid_tuning input[name="sensitivity"]').hide();
        $('.pid_tuning .levelSensitivityHeader').empty();

        const antiGravitySwitch = $('#antiGravitySwitch');
        const antiGravityGain = $('.antigravity input[name="itermAcceleratorGain"]');

        $('.pid_filter select[name="dtermLowpassType"]').val(FC.FILTER_CONFIG.dterm_lowpass_type);

        const ITERM_ACCELERATOR_GAIN_OFF = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44) ? 0 : 1000;

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            // we keep the same name in html - just switching variable.
            antiGravityGain.val(FC.ADVANCED_TUNING.antiGravityGain / 10);
            antiGravitySwitch.prop('checked', FC.ADVANCED_TUNING.antiGravityGain !== ITERM_ACCELERATOR_GAIN_OFF);
        } else {
            $('.antigravity input[name="itermThrottleThreshold"]').val(FC.ADVANCED_TUNING.itermThrottleThreshold);
            antiGravityGain.val(FC.ADVANCED_TUNING.itermAcceleratorGain / 1000);
            antiGravitySwitch.prop('checked', FC.ADVANCED_TUNING.itermAcceleratorGain !== ITERM_ACCELERATOR_GAIN_OFF);
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
            antiGravityGain.attr("min", "0.1");
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                antiGravityGain.attr({ "min": "0.1", "max": "25.0", "step": "0.1" });
            }
        }

        antiGravitySwitch.on("change", function() {
            if (antiGravitySwitch.is(':checked')) {
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                    antiGravityGain.val(Number.parseFloat(FC.ADVANCED_TUNING.antiGravityGain / 10 || 8).toFixed(1));
                } else {
                    const DEFAULT_ACCELERATOR_GAIN = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43) ? 3.5 : 1.1;

                    if (FC.ADVANCED_TUNING.itermAcceleratorGain === ITERM_ACCELERATOR_GAIN_OFF) {
                        antiGravityGain.val(DEFAULT_ACCELERATOR_GAIN);
                    } else {
                        const itermAcceleratorGain = (FC.ADVANCED_TUNING.itermAcceleratorGain / 1000);
                        antiGravityGain.val(itermAcceleratorGain);
                    }
                }

                $('.antigravity .suboption').show();
                $('.antigravity .antiGravityThres').toggle(semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_45) && FC.ADVANCED_TUNING.itermAcceleratorGain === 0);
                $('.antigravity .antiGravityMode').toggle(semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_45));
            } else {
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                    antiGravityGain.val(ITERM_ACCELERATOR_GAIN_OFF / 1000);
                } else {
                    $('.antigravity select[id="antiGravityMode"]').val(0);
                    antiGravityGain.val(ITERM_ACCELERATOR_GAIN_OFF);
                }

                $('.antigravity .suboption').hide();
            }
        });
        antiGravitySwitch.trigger("change");

        $('.pid_tuning input[name="rc_rate_pitch"]').val(FC.RC_TUNING.rcPitchRate.toFixed(2));
        $('.pid_tuning input[name="rc_pitch_expo"]').val(FC.RC_TUNING.RC_PITCH_EXPO.toFixed(2));


        $('.pid_filter input[name="gyroLowpass2Frequency"]').val(FC.FILTER_CONFIG.gyro_lowpass2_hz);
        $('.pid_filter select[name="gyroLowpassType"]').val(FC.FILTER_CONFIG.gyro_lowpass_type);
        $('.pid_filter select[name="gyroLowpass2Type"]').val(FC.FILTER_CONFIG.gyro_lowpass2_type);
        $('.pid_filter input[name="dtermLowpass2Frequency"]').val(FC.FILTER_CONFIG.dterm_lowpass2_hz);
        $('.pid_filter select[name="dtermLowpass2Type"]').val(FC.FILTER_CONFIG.dterm_lowpass2_type);

        // We load it again because the limits are now bigger than in 1.16.0
        $('.pid_filter input[name="gyroLowpassFrequency"]').attr("max","16000");
        $('.pid_filter input[name="gyroLowpassFrequency"]').val(FC.FILTER_CONFIG.gyro_lowpass_hz);
        //removes 5th column which is Feedforward
        $('#pid_main .pid_titlebar2 th').attr('colspan', 4);

        // I Term Rotation
        $('input[id="itermrotation"]').prop('checked', FC.ADVANCED_TUNING.itermRotation !== 0);

            // Smart Feed Forward
        $('input[id="smartfeedforward"]').prop('checked', FC.ADVANCED_TUNING.smartFeedforward !== 0);

        // I Term Relax
        const itermRelaxCheck = $('input[id="itermrelax"]');

        itermRelaxCheck.prop('checked', FC.ADVANCED_TUNING.itermRelax !== 0);
        $('select[id="itermrelaxAxes"]').val(FC.ADVANCED_TUNING.itermRelax > 0 ? FC.ADVANCED_TUNING.itermRelax : 1);
        $('select[id="itermrelaxType"]').val(FC.ADVANCED_TUNING.itermRelaxType);
        $('input[name="itermRelaxCutoff"]').val(FC.ADVANCED_TUNING.itermRelaxCutoff);

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            $('.itermrelax input[name="itermRelaxCutoff"]').attr("max","50");
        }

        itermRelaxCheck.change(function() {
            const checked = $(this).is(':checked');

            if (checked) {
                $('.itermrelax .suboption').show();
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
                    $('.itermRelaxCutoff').show();
                } else {
                    $('.itermRelaxCutoff').hide();
                }
            } else {
                $('.itermrelax .suboption').hide();
            }
        });
        itermRelaxCheck.change();

        // Absolute Control
        const absoluteControlGainNumberElement = $('input[name="absoluteControlGain-number"]');
        absoluteControlGainNumberElement.val(FC.ADVANCED_TUNING.absoluteControlGain).trigger('input');

        // Throttle Boost
        const throttleBoostNumberElement = $('input[name="throttleBoost-number"]');
        throttleBoostNumberElement.val(FC.ADVANCED_TUNING.throttleBoost).trigger('input');

        // Acro Trainer
        const acroTrainerAngleLimitNumberElement = $('input[name="acroTrainerAngleLimit-number"]');
        acroTrainerAngleLimitNumberElement.val(FC.ADVANCED_TUNING.acroTrainerAngleLimit).trigger('input');

        // Yaw D
        $('.pid_tuning .YAW input[name="d"]').val(FC.PIDS[2][2]); // PID Yaw D

        // Feedforward
        $('.pid_tuning .ROLL input[name="f"]').val(FC.ADVANCED_TUNING.feedforwardRoll);
        $('.pid_tuning .PITCH input[name="f"]').val(FC.ADVANCED_TUNING.feedforwardPitch);
        $('.pid_tuning .YAW input[name="f"]').val(FC.ADVANCED_TUNING.feedforwardYaw);
        $('#pid_main .pid_titlebar2 th').attr('colspan', 5);

        const feedforwardTransitionNumberElement = $('input[name="feedforwardTransition-number"]');
        feedforwardTransitionNumberElement.val(Number.parseFloat(FC.ADVANCED_TUNING.feedforwardTransition / 100).toFixed(2));

        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            // AntiGravity Mode
            const antiGravityModeSelect = $('.antigravity select[id="antiGravityMode"]');

            antiGravityModeSelect.on('change', function () {
                const antiGravityModeValue = antiGravityModeSelect.val();

                // Smooth removes threshold
                $('.antiGravityThres').toggle(antiGravityModeValue !== 0);
            });

            antiGravityModeSelect.val(FC.ADVANCED_TUNING.antiGravityMode).trigger('change');
        }

        $('select[id="throttleLimitType"]').val(FC.RC_TUNING.throttleLimitType);
        $('.throttle_limit input[name="throttleLimitPercent"]').val(FC.RC_TUNING.throttleLimitPercent);

        $('.pid_filter input[name="gyroLowpassDynMinFrequency"]').val(FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz);
        $('.pid_filter input[name="gyroLowpassDynMaxFrequency"]').val(FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz);
        $('.pid_filter select[name="gyroLowpassDynType"]').val(FC.FILTER_CONFIG.gyro_lowpass_type);

        $('.pid_filter input[name="dtermLowpassDynMinFrequency"]').val(FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz);
        $('.pid_filter input[name="dtermLowpassDynMaxFrequency"]').val(FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz);
        $('.pid_filter select[name="dtermLowpassDynType"]').val(FC.FILTER_CONFIG.dterm_lowpass_type);

        $('.pid_tuning input[name="dMinRoll"]').val(FC.ADVANCED_TUNING.dMinRoll);
        $('.pid_tuning input[name="dMinPitch"]').val(FC.ADVANCED_TUNING.dMinPitch);
        $('.pid_tuning input[name="dMinYaw"]').val(FC.ADVANCED_TUNING.dMinYaw);
        $('.dminGroup input[name="dMinGain"]').val(FC.ADVANCED_TUNING.dMinGain);
        $('.dminGroup input[name="dMinAdvance"]').val(FC.ADVANCED_TUNING.dMinAdvance);

        $('input[id="useIntegratedYaw"]').prop('checked', FC.ADVANCED_TUNING.useIntegratedYaw !== 0);
        //dmin column
        $('#pid_main .pid_titlebar2 th').attr('colspan', 6);

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {

            $('.smartfeedforward').hide();

            // Dynamic Notch Filter
            const sampleRateHz = FC.CONFIG.sampleRateHz / FC.PID_ADVANCED_CONFIG.pid_process_denom;

            let isDynamicNotchActive = FC.FEATURE_CONFIG.features.isEnabled('DYNAMIC_FILTER');
            isDynamicNotchActive = isDynamicNotchActive || FC.FILTER_CONFIG.dyn_notch_count !== 0;
            isDynamicNotchActive = isDynamicNotchActive && sampleRateHz >= 2000;

            if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                if (isDynamicNotchActive) {
                    $('.dynamicNotch span.inputSwitch').hide();
                } else {
                    $('.dynamicNotch').hide();
                }
            }

            const dynamicNotchRange_e = $('.pid_filter select[name="dynamicNotchRange"]');
            const dynamicNotchWidthPercent_e = $('.pid_filter input[name="dynamicNotchWidthPercent"]');
            const dynamicNotchCount_e = $('.pid_filter input[name="dynamicNotchCount"]');
            const dynamicNotchQ_e = $('.pid_filter input[name="dynamicNotchQ"]');
            const dynamicNotchMinHz_e = $('.pid_filter input[name="dynamicNotchMinHz"]');
            const dynamicNotchMaxHz_e = $('.pid_filter input[name="dynamicNotchMaxHz"]');

            dynamicNotchRange_e.val(FC.FILTER_CONFIG.dyn_notch_range);
            dynamicNotchWidthPercent_e.val(FC.FILTER_CONFIG.dyn_notch_width_percent);
            dynamicNotchCount_e.val(FC.FILTER_CONFIG.dyn_notch_count);
            dynamicNotchQ_e.val(FC.FILTER_CONFIG.dyn_notch_q);
            dynamicNotchMinHz_e.val(FC.FILTER_CONFIG.dyn_notch_min_hz);
            dynamicNotchMaxHz_e.val(FC.FILTER_CONFIG.dyn_notch_max_hz);

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                dynamicNotchMinHz_e.attr("max","250");
            } else {
                $('.dynamicNotchMaxHz').hide();
            }

            $('.pid_filter input[id="dynamicNotchEnabled"]').on('change', function() {

                const count = parseInt(dynamicNotchCount_e.val());
                const checked = $(this).is(':checked');

                if (checked && !count) {
                    dynamicNotchCount_e.val(FILTER_DEFAULT.dyn_notch_count);
                }

                $('.dynamicNotch span.suboption').toggle(checked);
                $('.dynamicNotchRange').toggle(semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_43) && checked);
                $('.dynamicNotchMaxHz').toggle(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43) && checked);
                $('.dynamicNotchWidthPercent').toggle(semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44) && checked);
                $('.dynamicNotchCount').toggle(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44) && checked);

            }).prop('checked', isDynamicNotchActive).trigger('change');

            // RPM Filter
            $('.rpmFilter').toggle(FC.MOTOR_CONFIG.use_dshot_telemetry);

            const rpmFilterHarmonics_e = $('.pid_filter input[name="rpmFilterHarmonics"]');
            const rpmFilterMinHz_e = $('.pid_filter input[name="rpmFilterMinHz"]');

            rpmFilterHarmonics_e.val(FC.FILTER_CONFIG.gyro_rpm_notch_harmonics);
            rpmFilterMinHz_e.val(FC.FILTER_CONFIG.gyro_rpm_notch_min_hz);

            $('.pid_filter #rpmFilterEnabled').on('change', function() {

                const harmonics = rpmFilterHarmonics_e.val();
                const checked = $(this).is(':checked') && harmonics !== 0;

                rpmFilterHarmonics_e.attr('disabled', !checked);
                rpmFilterMinHz_e.attr('disabled', !checked);
                self.previousFilterDynQ = FC.FILTER_CONFIG.dyn_notch_q;
                self.previousFilterDynCount = FC.FILTER_CONFIG.dyn_notch_count;

                if (harmonics == 0) {
                    rpmFilterHarmonics_e.val(FILTER_DEFAULT.gyro_rpm_notch_harmonics);
                }

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                    const dialogDynFilterSettings = {
                        title: i18n.getMessage("dialogDynFiltersChangeTitle"),
                        text: i18n.getMessage("dialogDynFiltersChangeNote"),
                        buttonYesText: i18n.getMessage("presetsWarningDialogYesButton"),
                        buttonNoText: i18n.getMessage("presetsWarningDialogNoButton"),
                        buttonYesCallback: () => _dynFilterChange(),
                        buttonNoCallback: null,
                    };

                    const _dynFilterChange = function() {
                        if (checked) {
                            dynamicNotchCount_e.val(FILTER_DEFAULT.dyn_notch_count_rpm);
                            dynamicNotchQ_e.val(FILTER_DEFAULT.dyn_notch_q_rpm);
                        } else {
                            dynamicNotchCount_e.val(FILTER_DEFAULT.dyn_notch_count);
                            dynamicNotchQ_e.val(FILTER_DEFAULT.dyn_notch_q);
                        }
                    };

                    if (checked !== (FC.FILTER_CONFIG.gyro_rpm_notch_harmonics !== 0)) {
                        GUI.showYesNoDialog(dialogDynFilterSettings);
                    } else {
                        dynamicNotchCount_e.val(self.previousFilterDynCount);
                        dynamicNotchQ_e.val(self.previousFilterDynQ);
                    }
                }

                $('.rpmFilter span.suboption').toggle(checked);

            }).prop('checked', FC.FILTER_CONFIG.gyro_rpm_notch_harmonics !== 0).trigger('change');

        } else {
            $('.itermRelaxCutoff').hide();
            $('.dynamicNotch').hide();
            $('.rpmFilter').hide();
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            $('input[name="idleMinRpm-number"]').attr("max", 200);
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            $('.tab-pid_tuning input[name="motorLimit"]').val(FC.ADVANCED_TUNING.motorOutputLimit);
            $('.tab-pid_tuning select[name="cellCount"]').val(FC.ADVANCED_TUNING.autoProfileCellCount);
            $('input[name="idleMinRpm-number"]').val(FC.ADVANCED_TUNING.idleMinRpm).prop('disabled', !FC.MOTOR_CONFIG.use_dshot_telemetry);

            if (FC.MOTOR_CONFIG.use_dshot_telemetry) {
                $('span.pidTuningIdleMinRpmDisabled').text(i18n.getMessage('pidTuningIdleMinRpm'));
            } else {
                $('span.pidTuningIdleMinRpmDisabled').text(i18n.getMessage('pidTuningIdleMinRpmDisabled'));
            }
        } else {
            $('.motorOutputLimit').hide();
            $('.idleMinRpm').hide();
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            const ratesTypeListElement = $('select[id="ratesType"]'); // generates list
            const ratesList = [
                {name: "Betaflight"},
                {name: "Raceflight"},
                {name: "KISS"},
                {name: "Actual"},
                {name: "QuickRates"},
            ];
            // add future rates types here with FC.CONFIG.apiVersion check
            for (let i = 0; i < ratesList.length; i++) {
                ratesTypeListElement.append(`<option value="${i}">${ratesList[i].name}</option>`);
            }

            self.currentRatesType = FC.RC_TUNING.rates_type;
            self.previousRatesType = null;
            ratesTypeListElement.val(self.currentRatesType);

            self.changeRatesType(self.currentRatesType); // update rate type code when updating the tab

        } else {
            self.currentRatesType = null;
            self.previousRatesType = null;
            $('.rates_type').hide();
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
            // hide legacy filter switches
            $('.gyroLowpassLegacy').hide();
            $('.gyroLowpassDynLegacy').hide();
            $('.dtermLowpassLegacy').hide();
            $('.dtermLowpassDynLegacy').hide();

            $('.pid_filter input[name="dtermLowpassExpo"]').val(FC.FILTER_CONFIG.dyn_lpf_curve_expo);
        } else {
            // hide firmware filter switches
            $('.gyroLowpass').hide();
            $('.dtermLowpass').hide();

            // Previous html attributes for legacy sliders
            $('.pid_tuning .ROLL input[name="p"]').attr("max", "200");
            $('.pid_tuning .ROLL input[name="i"]').attr("max", "200");
            $('.pid_tuning .ROLL input[name="d"]').attr("max", "200");
            $('.pid_tuning .ROLL input[name="dMinPitch"]').attr("max", "100");
            $('.pid_tuning .PITCH input[name="p"]').attr("max", "200");
            $('.pid_tuning .PITCH input[name="i"]').attr("max", "200");
            $('.pid_tuning .PITCH input[name="d"]').attr("max", "200");
            $('.pid_tuning .PITCH input[name="dMinPitch"]').attr("max", "100");
            $('.pid_tuning .YAW input[name="p"]').attr("max", "200");
            $('.pid_tuning .YAW input[name="i"]').attr("max", "200");
            $('.pid_tuning .YAW input[name="d"]').attr("max", "200");
            $('.pid_tuning .YAW input[name="dMinPitch"]').attr("max", "100");
        }

        // Feedforward
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
            $('select[id="feedforwardAveraging"]').val(FC.ADVANCED_TUNING.feedforward_averaging);
            $('input[name="feedforwardSmoothFactor"]').val(FC.ADVANCED_TUNING.feedforward_smooth_factor);
            $('input[name="feedforwardBoost"]').val(FC.ADVANCED_TUNING.feedforward_boost);
            $('input[name="feedforwardMaxRateLimit"]').val(FC.ADVANCED_TUNING.feedforward_max_rate_limit);
            $('input[name="feedforwardJitterFactor"]').val(FC.ADVANCED_TUNING.feedforward_jitter_factor);

            // Vbat Sag Compensation
            const vbatSagCompensationCheck = $('input[id="vbatSagCompensation"]');

            vbatSagCompensationCheck.prop('checked', FC.ADVANCED_TUNING.vbat_sag_compensation !== 0);
            $('input[name="vbatSagValue"]').val(FC.ADVANCED_TUNING.vbat_sag_compensation > 0 ? FC.ADVANCED_TUNING.vbat_sag_compensation : 100);

            vbatSagCompensationCheck.change(function() {
                const checked = $(this).is(':checked');
                $('.vbatSagCompensation .suboption').toggle(checked);
            }).change();

            // Thrust Linearization
            const thrustLinearizationCheck = $('input[id="thrustLinearization"]');

            thrustLinearizationCheck.prop('checked', FC.ADVANCED_TUNING.thrustLinearization !== 0);
            $('input[name="thrustLinearValue"]').val(FC.ADVANCED_TUNING.thrustLinearization > 0 ? FC.ADVANCED_TUNING.thrustLinearization : 20);

            thrustLinearizationCheck.change(function() {
                const checked = $(this).is(':checked');
                $('.thrustLinearization .suboption').toggle(checked);
            }).change();
        } else {
            $('.vbatSagCompensation').hide();
            $('.thrustLinearization').hide();

            $('.pid_tuning .ROLL input[name="f"]').val(FC.ADVANCED_TUNING.feedforwardRoll > 0 ? FC.ADVANCED_TUNING.feedforwardRoll : PID_DEFAULT[4]);
            $('.pid_tuning .PITCH input[name="f"]').val(FC.ADVANCED_TUNING.feedforwardPitch > 0 ? FC.ADVANCED_TUNING.feedforwardPitch : PID_DEFAULT[9]);
            $('.pid_tuning .YAW input[name="f"]').val(FC.ADVANCED_TUNING.feedforwardYaw > 0 ? FC.ADVANCED_TUNING.feedforwardYaw : PID_DEFAULT[14]);
            $('span.feedforwardOption').hide();
        }

        $('input[id="useIntegratedYaw"]').change(function() {
            const checked = $(this).is(':checked');
            // 4.3 firmware has RP mode.
            $('#pidTuningIntegratedYawCaution').toggle(checked);
        }).change();

        // if user decreases Dmax, don't allow Dmin above Dmax
        function adjustDMin(dElement, dMinElement) {
            const dValue = parseInt(dElement.val());
            const dMinValue = parseInt(dMinElement.val());
            let dMinLimit = Math.min(Math.max(dValue - 1, 0), 100);
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
               dMinLimit = Math.min(Math.max(dValue, 0), 250);
            } else {
                dMinElement.attr("max", dMinLimit);
            }
            if (dMinValue > dMinLimit) {
                dMinElement.val(dMinLimit);
            }
        }

        $('.pid_tuning .ROLL input[name="d"]').change(function() {
            const dMinElement= $('.pid_tuning input[name="dMinRoll"]');
            adjustDMin($(this), dMinElement);
        }).change();

        $('.pid_tuning .PITCH input[name="d"]').change(function() {
            const dMinElement= $('.pid_tuning input[name="dMinPitch"]');
            adjustDMin($(this), dMinElement);
        }).change();

        $('.pid_tuning .YAW input[name="d"]').change(function() {
            const dMinElement= $('.pid_tuning input[name="dMinYaw"]');
            adjustDMin($(this), dMinElement);
        }).change();

        // if user increases Dmin, don't allow Dmax below Dmin
        function adjustD(dMinElement, dElement) {
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                const dValue2 = parseInt(dElement.val());
                const dMinValue2 = parseInt(dMinElement.val());
                const dLimit = Math.min(Math.max(dMinValue2, 0), 250);
                if (dValue2 < dLimit) {
                    dElement.val(dLimit);
                }
            }
        }

        $('.pid_tuning input[name="dMinRoll"]').change(function() {
        const dElement= $('.pid_tuning .ROLL input[name="d"]');
        adjustD($(this), dElement);
        }).change();

        $('.pid_tuning input[name="dMinPitch"]').change(function() {
        const dElement= $('.pid_tuning .PITCH input[name="d"]');
        adjustD($(this), dElement);
        }).change();

        $('.pid_tuning input[name="dMinYaw"]').change(function() {
        const dElement= $('.pid_tuning .YAW input[name="d"]');
        adjustD($(this), dElement);
        }).change();

        $('.pid_tuning .ROLL input[name="d"]').change(function() {
            const dMinElement= $('.pid_tuning input[name="dMinRoll"]');
            adjustDMin($(this), dMinElement);
        }).change();

        $('.pid_tuning .PITCH input[name="d"]').change(function() {
            const dMinElement= $('.pid_tuning input[name="dMinPitch"]');
            adjustDMin($(this), dMinElement);
        }).change();

        $('.pid_tuning .YAW input[name="d"]').change(function() {
            const dMinElement= $('.pid_tuning input[name="dMinYaw"]');
            adjustDMin($(this), dMinElement);
        }).change();

        // dMinSwitch toggle - renamed to Dynamic Damping and disabled in 4.3
        const dMinSwitch = $('#dMinSwitch');

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
            const box = document.getElementById('dMinSwitch');
            if (box.parentNode) {
                box.parentNode.removeChild(box);
            }
            $('.dMinDisabledNote').hide();
        } else {
            dMinSwitch.prop('checked', FC.ADVANCED_TUNING.dMinRoll > 0 || FC.ADVANCED_TUNING.dMinPitch > 0 || FC.ADVANCED_TUNING.dMinYaw > 0);

            dMinSwitch.on('change', function() {
                const checked = $(this).is(':checked');

                if (checked) {
                    if ($('.pid_tuning input[name="dMinRoll"]').val() == 0 && $('.pid_tuning input[name="dMinPitch"]').val() == 0 && $('.pid_tuning input[name="dMinYaw"]').val() == 0) {
                        // when enabling dmin set its value based on 0.57x of actual dmax, dmin is limited to 100
                        $('.pid_tuning input[name="dMinRoll"]').val(Math.min(Math.round($('.pid_tuning .ROLL input[name="d"]').val() * 0.57), 100));
                        $('.pid_tuning input[name="dMinPitch"]').val(Math.min(Math.round($('.pid_tuning .PITCH input[name="d"]').val() * 0.57), 100));
                        $('.pid_tuning input[name="dMinYaw"]').val(Math.min(Math.round($('.pid_tuning .YAW input[name="d"]').val() * 0.57), 100));
                        if (semver.eq(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                            $('.pid_tuning input[name="dMinRoll"]').val(Math.min(Math.round($('.pid_tuning .ROLL input[name="d"]').val() * 0.65), 100));
                            $('.pid_tuning input[name="dMinPitch"]').val(Math.min(Math.round($('.pid_tuning .PITCH input[name="d"]').val() * 0.65), 100));
                            $('.pid_tuning input[name="dMinYaw"]').val(Math.min(Math.round($('.pid_tuning .YAW input[name="d"]').val() * 0.65), 100));
                        }
                    } else {
                        $('.pid_tuning input[name="dMinRoll"]').val(FC.ADVANCED_TUNING.dMinRoll);
                        $('.pid_tuning input[name="dMinPitch"]').val(FC.ADVANCED_TUNING.dMinPitch);
                        $('.pid_tuning input[name="dMinYaw"]').val(FC.ADVANCED_TUNING.dMinYaw);
                    }
                    $('.dMinDisabledNote').hide();
                    $('.dminGroup .suboption').show();
                    $('#pid_main tr :nth-child(5)').show();
                    $('#pid_main .pid_titlebar2 th').attr('colspan', 6);
                    $('.derivativeText').text(i18n.getMessage("pidTuningDMax"));
                } else {
                    $('.dMinDisabledNote').show();
                    $('.dminGroup .suboption').hide();
                    $('#pid_main tr :nth-child(5)').hide();
                    $('#pid_main .pid_titlebar2 th').attr('colspan', 5);
                    $('.derivativeText').text(i18n.getMessage("pidTuningDerivative"));
                    $('.pid_tuning input[name="dMinRoll"]').val(0);
                    $('.pid_tuning input[name="dMinPitch"]').val(0);
                    $('.pid_tuning input[name="dMinYaw"]').val(0);
                }
            }).trigger('change');
        }

        $('input[id="gyroNotch1Enabled"]').change(function() {
            const checked = $(this).is(':checked');
            const hz = FC.FILTER_CONFIG.gyro_notch_hz > 0 ? FC.FILTER_CONFIG.gyro_notch_hz : FILTER_DEFAULT.gyro_notch_hz;

            $('.pid_filter input[name="gyroNotch1Frequency"]').val(checked ? hz : 0).attr('disabled', !checked)
                    .attr("min", checked ? 1 : 0).change();
            $('.pid_filter input[name="gyroNotch1Cutoff"]').attr('disabled', !checked).change();

            $('.gyroNotch1 span.suboption').toggle(checked);
        });

        $('input[id="gyroNotch2Enabled"]').change(function() {
            const checked = $(this).is(':checked');
            const hz = FC.FILTER_CONFIG.gyro_notch2_hz > 0 ? FC.FILTER_CONFIG.gyro_notch2_hz : FILTER_DEFAULT.gyro_notch2_hz;

            $('.pid_filter input[name="gyroNotch2Frequency"]').val(checked ? hz : 0).attr('disabled', !checked)
                    .attr("min", checked ? 1 : 0).change();
            $('.pid_filter input[name="gyroNotch2Cutoff"]').attr('disabled', !checked).change();

            $('.gyroNotch2 span.suboption').toggle(checked);
        });

        $('input[id="dtermNotchEnabled"]').change(function() {
            const checked = $(this).is(':checked');
            const hz = FC.FILTER_CONFIG.dterm_notch_hz > 0 ? FC.FILTER_CONFIG.dterm_notch_hz : FILTER_DEFAULT.dterm_notch_hz;

            $('.pid_filter input[name="dTermNotchFrequency"]').val(checked ? hz : 0).attr('disabled', !checked)
                    .attr("min", checked ? 1 : 0).change();
            $('.pid_filter input[name="dTermNotchCutoff"]').attr('disabled', !checked).change();

            $('.dtermNotch span.suboption').toggle(checked);
        });

        // gyro filter selectors
        const gyroLowpassDynMinFrequency = $('.pid_filter input[name="gyroLowpassDynMinFrequency"]');
        const gyroLowpassDynMaxFrequency = $('.pid_filter input[name="gyroLowpassDynMaxFrequency"]');
        const gyroLowpassFrequency = $('.pid_filter input[name="gyroLowpassFrequency"]');
        const gyroLowpass2Frequency = $('.pid_filter input[name="gyroLowpass2Frequency"]');
        const gyroLowpassType = $('.pid_filter select[name="gyroLowpassType"]');
        const gyroLowpass2Type = $('.pid_filter select[name="gyroLowpass2Type"]');
        const gyroLowpassDynType = $('.pid_filter select[name="gyroLowpassDynType"]');

        const gyroLowpassDynEnabled = $('.pid_filter input[id="gyroLowpassDynEnabled"]');
        const gyroLowpassEnabled = $('.pid_filter input[id="gyroLowpassEnabled"]');
        const gyroLowpass2Enabled = $('.pid_filter input[id="gyroLowpass2Enabled"]');

        const gyroLowpassOption = $('.gyroLowpass span.suboption');
        const gyroLowpassOptionStatic = $('.gyroLowpass span.suboption.static');
        const gyroLowpassOptionDynamic = $('.gyroLowpass span.suboption.dynamic');
        const gyroLowpass2Option = $('.gyroLowpass2 span.suboption');

        const gyroLowpassFilterMode = $('.pid_filter select[name="gyroLowpassFilterMode"]');

        // dterm filter selectors
        const dtermLowpassDynMinFrequency = $('.pid_filter input[name="dtermLowpassDynMinFrequency"]');
        const dtermLowpassDynMaxFrequency = $('.pid_filter input[name="dtermLowpassDynMaxFrequency"]');
        const dtermLowpassFrequency = $('.pid_filter input[name="dtermLowpassFrequency"]');
        const dtermLowpass2Frequency = $('.pid_filter input[name="dtermLowpass2Frequency"]');
        const dtermLowpassType = $('.pid_filter select[name="dtermLowpassType"]');
        const dtermLowpass2Type = $('.pid_filter select[name="dtermLowpass2Type"]');
        const dtermLowpassDynType = $('.pid_filter select[name="dtermLowpassDynType"]');

        const dtermLowpassDynEnabled = $('.pid_filter input[id="dtermLowpassDynEnabled"]');
        const dtermLowpassEnabled = $('input[id="dtermLowpassEnabled"]');
        const dtermLowpass2Enabled = $('input[id="dtermLowpass2Enabled"]');

        const dtermLowpassOption = $('.dtermLowpass span.suboption');
        const dtermLowpassOptionStatic = $('.dtermLowpass span.suboption.static');
        const dtermLowpassOptionDynamic = $('.dtermLowpass span.suboption.dynamic');
        const dtermLowpass2Option = $('.dtermLowpass2 span.suboption');

        const dtermLowpassFilterMode = $('.pid_filter select[name="dtermLowpassFilterMode"]');

        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {

            // Legacy filter selectors for lowpass 1 and 2
            gyroLowpassEnabled.change(function() {
                const checked = $(this).is(':checked');
                const disabledByDynamicLowpass = gyroLowpassDynEnabled.is(':checked');

                const cutoff = FC.FILTER_CONFIG.gyro_lowpass_hz > 0 ? FC.FILTER_CONFIG.gyro_lowpass_hz : FILTER_DEFAULT.gyro_lowpass_hz;
                const type = FC.FILTER_CONFIG.gyro_lowpass_hz > 0 ? FC.FILTER_CONFIG.gyro_lowpass_type : FILTER_DEFAULT.gyro_lowpass_type;

                gyroLowpassFrequency.val((checked || disabledByDynamicLowpass) ? cutoff : 0).attr('disabled', !checked);
                gyroLowpassType.each((i, el) => $(el).val(type).attr('disabled', !checked));

                if (checked) {
                    gyroLowpassDynEnabled.prop('checked', false).change();
                }
                self.updateFilterWarning();
            });

            gyroLowpassDynEnabled.change(function() {
                const checked = $(this).is(':checked');
                let cutoff_min = FILTER_DEFAULT.gyro_lowpass_dyn_min_hz;
                let type = FILTER_DEFAULT.gyro_lowpass_type;
                if (FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz > 0 && FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz < FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz) {
                    cutoff_min = FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz;
                    type = FC.FILTER_CONFIG.gyro_lowpass_type;
                }

                gyroLowpassDynMinFrequency.val(checked ? cutoff_min : 0).attr('disabled', !checked);
                gyroLowpassDynMaxFrequency.attr('disabled', !checked);
                gyroLowpassDynType.each((i, el) => $(el).val(type).attr('disabled', !checked));

                if (checked) {
                    gyroLowpassEnabled.prop('checked', false).change();
                } else if (FC.FILTER_CONFIG.gyro_lowpass_hz > 0 && !gyroLowpassEnabled.is(':checked')) {
                    gyroLowpassEnabled.prop('checked', true).change();
                }
                self.updateFilterWarning();
            });

            gyroLowpass2Enabled.change(function() {
                const checked = $(this).is(':checked');
                const cutoff = FC.FILTER_CONFIG.gyro_lowpass2_hz > 0 ? FC.FILTER_CONFIG.gyro_lowpass2_hz : FILTER_DEFAULT.gyro_lowpass2_hz;
                const type = FC.FILTER_CONFIG.gyro_lowpass2_hz > 0 ? FC.FILTER_CONFIG.gyro_lowpass2_type : FILTER_DEFAULT.gyro_lowpass2_type;

                gyroLowpass2Frequency.val(checked ? cutoff : 0).attr('disabled', !checked);
                gyroLowpass2Type.each((i, el) => $(el).val(type).attr('disabled', !checked));
            });

            dtermLowpassEnabled.change(function() {
                const checked = $(this).is(':checked');
                const disabledByDynamicLowpass = dtermLowpassDynEnabled.is(':checked');

                const cutoff = FC.FILTER_CONFIG.dterm_lowpass_hz > 0 ? FC.FILTER_CONFIG.dterm_lowpass_hz : FILTER_DEFAULT.dterm_lowpass_hz;
                const type = FC.FILTER_CONFIG.dterm_lowpass_hz > 0 ? FC.FILTER_CONFIG.dterm_lowpass_type : FILTER_DEFAULT.dterm_lowpass_type;

                dtermLowpassFrequency.val((checked || disabledByDynamicLowpass) ? cutoff : 0).attr('disabled', !checked);
                dtermLowpassType.each((i, el) => $(el).val(type).attr('disabled', !checked));

                if (checked) {
                    dtermLowpassDynEnabled.prop('checked', false).change();
                }
                self.updateFilterWarning();
            });

            dtermLowpassDynEnabled.change(function() {
                const checked = $(this).is(':checked');
                let cutoff_min = FILTER_DEFAULT.dterm_lowpass_dyn_min_hz;
                let type = FILTER_DEFAULT.dterm_lowpass_type;
                if (FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz > 0 && FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz < FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz) {
                    cutoff_min = FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz;
                    type = FC.FILTER_CONFIG.dterm_lowpass_type;
                }

                dtermLowpassDynMinFrequency.val(checked ? cutoff_min : 0).attr('disabled', !checked);
                dtermLowpassDynMaxFrequency.attr('disabled', !checked);
                dtermLowpassDynType.each((i, el) => $(el).val(type).attr('disabled', !checked));

                if (checked) {
                    dtermLowpassEnabled.prop('checked', false).change();
                } else if (FC.FILTER_CONFIG.dterm_lowpass_hz > 0 && !dtermLowpassEnabled.is(':checked')) {
                    dtermLowpassEnabled.prop('checked', true).change();
                }
                self.updateFilterWarning();
            });

            dtermLowpass2Enabled.change(function() {
                const checked = $(this).is(':checked');
                const cutoff = FC.FILTER_CONFIG.dterm_lowpass2_hz > 0 ? FC.FILTER_CONFIG.dterm_lowpass2_hz : FILTER_DEFAULT.dterm_lowpass2_hz;
                const type = FC.FILTER_CONFIG.dterm_lowpass2_hz > 0 ? FC.FILTER_CONFIG.dterm_lowpass2_type : FILTER_DEFAULT.dterm_lowpass2_type;

                dtermLowpass2Frequency.val(checked ? cutoff : 0).attr('disabled', !checked);
                dtermLowpass2Type.each((i, el) => $(el).val(type).attr('disabled', !checked));
            });

        } else {

            // firmware 4.3 filter selectors for lowpass 1 and 2; sliders are not yet initialized here
            gyroLowpassEnabled.change(function() {
                const checked = $(this).is(':checked');

                if (checked) {
                    if (FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz > 0 || FC.FILTER_CONFIG.gyro_lowpass_hz > 0) {
                    // lowpass1 is enabled, set the master switch on, show the label, mode selector and type fields
                        gyroLowpassFilterMode.val(FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz > 0 ? 1 : 0).change();
                    } else {
                        // lowpass 1 is disabled, set the master switch off, only show label
                        // user is trying to enable the lowpass filter, but it was off (both cutoffs are zero)
                        // initialise in dynamic mode with values at sliders, or use defaults
                        gyroLowpassFilterMode.val(1).change();
                    }
                } else {
                    // the user is disabling Lowpass 1 so set everything to zero
                    gyroLowpassDynMinFrequency.val(0);
                    gyroLowpassDynMaxFrequency.val(0);
                    gyroLowpassFrequency.val(0);

                    self.calculateNewGyroFilters();
                }

                gyroLowpassOption.toggle(checked);
                gyroLowpassOptionStatic.toggle(checked && FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz === 0);
                gyroLowpassOptionDynamic.toggle(checked && FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz !== 0);
            });

            gyroLowpassFilterMode.change(function() {
                const dynMode = parseInt($(this).val());

                const cutoff = FC.FILTER_CONFIG.gyro_lowpass_hz > 0 ? FC.FILTER_CONFIG.gyro_lowpass_hz : FILTER_DEFAULT.gyro_lowpass_hz;
                const cutoffMin = FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz > 0 ? FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz : FILTER_DEFAULT.gyro_lowpass_dyn_min_hz;
                const cutoffMax = FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz > 0 ? FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz : FILTER_DEFAULT.gyro_lowpass_dyn_max_hz;

                gyroLowpassFrequency.val(dynMode ? 0 : cutoff);
                gyroLowpassDynMinFrequency.val(dynMode ? cutoffMin : 0);
                gyroLowpassDynMaxFrequency.val(dynMode ? cutoffMax : 0);

                self.calculateNewGyroFilters();

                gyroLowpassOptionStatic.toggle(!dynMode);
                gyroLowpassOptionDynamic.toggle(!!dynMode);
            });

            // switch gyro lpf2
            gyroLowpass2Enabled.change(function() {
                const checked = $(this).is(':checked');
                const cutoff = FC.FILTER_CONFIG.gyro_lowpass2_hz > 0 ? FC.FILTER_CONFIG.gyro_lowpass2_hz : FILTER_DEFAULT.gyro_lowpass2_hz;

                gyroLowpass2Frequency.val(checked ? cutoff : 0).attr('disabled', !checked);

                self.calculateNewGyroFilters();

                gyroLowpass2Option.toggle(checked);
                self.updateFilterWarning();
            });

            dtermLowpassEnabled.change(function() {
                const checked = $(this).is(':checked');

                if (checked) {
                    if (FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz > 0 || FC.FILTER_CONFIG.dterm_lowpass_hz > 0) {
                        // lowpass1 is enabled, set the master switch on, show the label, mode selector and type fields
                        dtermLowpassFilterMode.val(FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz > 0 ? 1 : 0).change();
                    } else {
                        // lowpass 1 is disabled, set the master switch off, only show label
                        // user is trying to enable the lowpass filter, but it was off (both cutoffs are zero)
                        // initialise in dynamic mode with values at sliders, or use defaults
                        dtermLowpassFilterMode.val(1).change();
                    }
                } else {
                    // the user is disabling Lowpass 1 so set everything to zero
                    dtermLowpassDynMinFrequency.val(0);
                    dtermLowpassDynMaxFrequency.val(0);
                    dtermLowpassFrequency.val(0);

                    self.calculateNewDTermFilters();
                }

                dtermLowpassOption.toggle(checked);
                dtermLowpassOptionStatic.toggle(checked && FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz === 0);
                dtermLowpassOptionDynamic.toggle(checked && FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz !== 0);
            });

            dtermLowpassFilterMode.change(function() {
                const dynMode = parseInt($(this).val());

                const cutoff = FC.FILTER_CONFIG.dterm_lowpass_hz > 0 ? FC.FILTER_CONFIG.dterm_lowpass_hz : FILTER_DEFAULT.dterm_lowpass_hz;
                const cutoffMin = FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz > 0 ? FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz : FILTER_DEFAULT.dterm_lowpass_dyn_min_hz;
                const cutoffMax = FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz > 0 ? FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz : FILTER_DEFAULT.dterm_lowpass_dyn_max_hz;

                dtermLowpassFrequency.val(dynMode ? 0 : cutoff);
                dtermLowpassDynMinFrequency.val(dynMode ? cutoffMin : 0);
                dtermLowpassDynMaxFrequency.val(dynMode ? cutoffMax : 0);

                self.calculateNewDTermFilters();

                dtermLowpassOptionStatic.toggle(!dynMode);
                dtermLowpassOptionDynamic.toggle(!!dynMode);
            });

            dtermLowpass2Enabled.change(function() {
                const checked = $(this).is(':checked');
                const cutoff = FC.FILTER_CONFIG.dterm_lowpass2_hz > 0 ? FC.FILTER_CONFIG.dterm_lowpass2_hz : FILTER_DEFAULT.dterm_lowpass2_hz;

                dtermLowpass2Frequency.val(checked ? cutoff : 0).attr('disabled', !checked);

                self.calculateNewDTermFilters();

                dtermLowpass2Option.toggle(checked);
                self.updateFilterWarning();
            });
        }

        $('input[id="yawLowpassEnabled"]').change(function() {
            const checked = $(this).is(':checked');
            const cutoff = FC.FILTER_CONFIG.yaw_lowpass_hz > 0 ? FC.FILTER_CONFIG.yaw_lowpass_hz : FILTER_DEFAULT.yaw_lowpass_hz;

            $('.pid_filter input[name="yawLowpassFrequency"]').val(checked ? cutoff : 0).attr('disabled', !checked);
            $('.yawLowpass span.suboption').toggle(checked);
        });

        // The notch cutoff must be smaller than the notch frecuency
        function adjustNotchCutoff(frequencyName, cutoffName) {
            const frecuency = parseInt($(`.pid_filter input[name='${frequencyName}']`).val());
            const cutoff = parseInt($(`.pid_filter input[name='${cutoffName}']`).val());

            // Change the max and refresh the value if needed
            const maxCutoff = frecuency == 0 ? 0 : frecuency - 1;
            $(`.pid_filter input[name='${cutoffName}']`).attr("max", maxCutoff);
            if (cutoff >= frecuency) {
                $(`.pid_filter input[name='${cutoffName}']`).val(maxCutoff);
            }
        }

        $('input[name="gyroNotch1Frequency"]').change(function() {
            adjustNotchCutoff("gyroNotch1Frequency", "gyroNotch1Cutoff");
        }).change();

        $('input[name="gyroNotch2Frequency"]').change(function() {
            adjustNotchCutoff("gyroNotch2Frequency", "gyroNotch2Cutoff");
        }).change();

        $('input[name="dTermNotchFrequency"]').change(function() {
            adjustNotchCutoff("dTermNotchFrequency", "dTermNotchCutoff");
        }).change();

        // Initial state of the filters: enabled or disabled
        $('input[id="gyroNotch1Enabled"]').prop('checked', FC.FILTER_CONFIG.gyro_notch_hz !== 0).change();
        $('input[id="gyroNotch2Enabled"]').prop('checked', FC.FILTER_CONFIG.gyro_notch2_hz !== 0).change();
        $('input[id="dtermNotchEnabled"]').prop('checked', FC.FILTER_CONFIG.dterm_notch_hz !== 0).change();

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
            gyroLowpassEnabled.prop('checked', FC.FILTER_CONFIG.gyro_lowpass_hz !== 0 || FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz !== 0).change();
            dtermLowpassEnabled.prop('checked', FC.FILTER_CONFIG.dterm_lowpass_hz !== 0 || FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz !== 0).change();
        } else {
            gyroLowpassEnabled.prop('checked', FC.FILTER_CONFIG.gyro_lowpass_hz !== 0).change();
            gyroLowpassDynEnabled.prop('checked', FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz !== 0 &&
                FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz < FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz).change();
            dtermLowpassEnabled.prop('checked', FC.FILTER_CONFIG.dterm_lowpass_hz !== 0).change();
            dtermLowpassDynEnabled.prop('checked', FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz !== 0 &&
                FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz < FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz).change();
        }

        gyroLowpass2Enabled.prop('checked', FC.FILTER_CONFIG.gyro_lowpass2_hz !== 0).change();
        dtermLowpass2Enabled.prop('checked', FC.FILTER_CONFIG.dterm_lowpass2_hz !== 0).change();
        $('input[id="yawLowpassEnabled"]').prop('checked', FC.FILTER_CONFIG.yaw_lowpass_hz !== 0).change();

        self.updatePIDColors();
    }

    function form_to_pid_and_rc() {
        // Fill in the data from PIDs array
        // Catch all the changes and stuff the inside PIDs array

        // Profile names
        if (semver.gte(FC.CONFIG.apiVersion, "1.45.0")) {
            FC.CONFIG.pidProfileNames[FC.CONFIG.profile] = $('input[name="pidProfileName"]').val().trim();
            FC.CONFIG.rateProfileNames[FC.CONFIG.rateProfile] = $('input[name="rateProfileName"]').val().trim();
        }

        // For each pid name
        FC.PID_NAMES.forEach(function(elementPid, indexPid) {

            // Look into the PID table to a row with the name of the pid
            const searchRow = $(`.pid_tuning .${elementPid} input`);

            // Assign each value
            searchRow.each(function (indexInput) {
                if ($(this).val()) {
                    FC.PIDS[indexPid][indexInput] = parseInt($(this).val());
                }
            });
        });

        // catch RC_tuning changes
        const pitch_rate_e = $('.pid_tuning input[name="pitch_rate"]');
        const roll_rate_e = $('.pid_tuning input[name="roll_rate"]');
        const yaw_rate_e = $('.pid_tuning input[name="yaw_rate"]');
        const rc_rate_pitch_e = $('.pid_tuning input[name="rc_rate_pitch"]');
        const rc_rate_e = $('.pid_tuning input[name="rc_rate"]');
        const rc_rate_yaw_e = $('.pid_tuning input[name="rc_rate_yaw"]');
        const rc_pitch_expo_e = $('.pid_tuning input[name="rc_pitch_expo"]');
        const rc_expo_e = $('.pid_tuning input[name="rc_expo"]');
        const rc_yaw_expo_e = $('.pid_tuning input[name="rc_yaw_expo"]');

        FC.RC_TUNING.roll_pitch_rate = parseFloat($('.pid_tuning input[name="roll_pitch_rate"]').val());
        FC.RC_TUNING.RC_RATE = parseFloat(rc_rate_e.val());
        FC.RC_TUNING.roll_rate = parseFloat(roll_rate_e.val());
        FC.RC_TUNING.pitch_rate = parseFloat(pitch_rate_e.val());
        FC.RC_TUNING.yaw_rate = parseFloat(yaw_rate_e.val());
        FC.RC_TUNING.RC_EXPO = parseFloat(rc_expo_e.val());
        FC.RC_TUNING.RC_YAW_EXPO = parseFloat(rc_yaw_expo_e.val());
        FC.RC_TUNING.rcYawRate = parseFloat(rc_rate_yaw_e.val());
        FC.RC_TUNING.rcPitchRate = parseFloat(rc_rate_pitch_e.val());
        FC.RC_TUNING.RC_PITCH_EXPO = parseFloat(rc_pitch_expo_e.val());

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            switch (self.currentRatesType) {
                case FC.RATES_TYPE.RACEFLIGHT:
                    FC.RC_TUNING.pitch_rate = parseFloat(pitch_rate_e.val()) / 100;
                    FC.RC_TUNING.roll_rate = parseFloat(roll_rate_e.val()) / 100;
                    FC.RC_TUNING.yaw_rate = parseFloat(yaw_rate_e.val()) / 100;
                    FC.RC_TUNING.rcPitchRate = parseFloat(rc_rate_pitch_e.val()) / 1000;
                    FC.RC_TUNING.RC_RATE = parseFloat(rc_rate_e.val()) / 1000;
                    FC.RC_TUNING.rcYawRate = parseFloat(rc_rate_yaw_e.val()) / 1000;
                    FC.RC_TUNING.RC_PITCH_EXPO = parseFloat(rc_pitch_expo_e.val()) / 100;
                    FC.RC_TUNING.RC_EXPO = parseFloat(rc_expo_e.val()) / 100;
                    FC.RC_TUNING.RC_YAW_EXPO = parseFloat(rc_yaw_expo_e.val()) / 100;

                    break;

                case FC.RATES_TYPE.ACTUAL:
                    FC.RC_TUNING.pitch_rate = parseFloat(pitch_rate_e.val()) / 1000;
                    FC.RC_TUNING.roll_rate = parseFloat(roll_rate_e.val()) / 1000;
                    FC.RC_TUNING.yaw_rate = parseFloat(yaw_rate_e.val()) / 1000;
                    FC.RC_TUNING.rcPitchRate = parseFloat(rc_rate_pitch_e.val()) / 1000;
                    FC.RC_TUNING.RC_RATE = parseFloat(rc_rate_e.val()) / 1000;
                    FC.RC_TUNING.rcYawRate = parseFloat(rc_rate_yaw_e.val()) / 1000;

                    break;

                case FC.RATES_TYPE.QUICKRATES:
                    FC.RC_TUNING.pitch_rate = parseFloat(pitch_rate_e.val()) / 1000;
                    FC.RC_TUNING.roll_rate = parseFloat(roll_rate_e.val()) / 1000;
                    FC.RC_TUNING.yaw_rate = parseFloat(yaw_rate_e.val()) / 1000;

                    break;

                // add future rates types here
                default: // BetaFlight

                    break;
            }
        }

        FC.RC_TUNING.throttle_MID = parseFloat($('.throttle input[name="mid"]').val());
        FC.RC_TUNING.throttle_EXPO = parseFloat($('.throttle input[name="expo"]').val());

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            FC.ADVANCED_TUNING.tpaMode = $('select[id="tpaMode"]').val();
            FC.ADVANCED_TUNING.tpaRate = parseInt($('input[id="tpaRate"]').val()) / 100;
            FC.ADVANCED_TUNING.tpaBreakpoint = parseInt($('input[id="tpaBreakpoint"]').val());
        } else {
            FC.RC_TUNING.dynamic_THR_PID = parseFloat($('.tpa-old input[name="tpa"]').val());
            FC.RC_TUNING.dynamic_THR_breakpoint = parseInt($('.tpa-old input[name="tpa-breakpoint"]').val());
        }

        FC.FILTER_CONFIG.gyro_lowpass_hz = parseInt($('.pid_filter input[name="gyroLowpassFrequency"]').val());
        FC.FILTER_CONFIG.dterm_lowpass_hz = parseInt($('.pid_filter input[name="dtermLowpassFrequency"]').val());
        FC.FILTER_CONFIG.yaw_lowpass_hz = parseInt($('.pid_filter input[name="yawLowpassFrequency"]').val());

        if (vbatpidcompensationIsUsed) {
            const element = $('input[id="vbatpidcompensation"]');
            const value = element.is(':checked') ? 1 : 0;
            let analyticsValue = undefined;
            if (value !== FC.ADVANCED_TUNING.vbatPidCompensation) {
                analyticsValue = element.is(':checked');
            }
            self.analyticsChanges['VbatPidCompensation'] = analyticsValue;

            FC.ADVANCED_TUNING.vbatPidCompensation = value;
        }

        FC.ADVANCED_TUNING.deltaMethod = $('#pid-tuning .delta select').val();

        FC.ADVANCED_TUNING.dtermSetpointTransition = parseInt($('input[name="dtermSetpointTransition-number"]').val() * 100);
        FC.ADVANCED_TUNING.dtermSetpointWeight = parseInt($('input[name="dtermSetpoint-number"]').val() * 100);

        FC.FILTER_CONFIG.gyro_notch_hz = parseInt($('.pid_filter input[name="gyroNotch1Frequency"]').val());
        FC.FILTER_CONFIG.gyro_notch_cutoff = parseInt($('.pid_filter input[name="gyroNotch1Cutoff"]').val());
        FC.FILTER_CONFIG.dterm_notch_hz = parseInt($('.pid_filter input[name="dTermNotchFrequency"]').val());
        FC.FILTER_CONFIG.dterm_notch_cutoff = parseInt($('.pid_filter input[name="dTermNotchCutoff"]').val());
        FC.FILTER_CONFIG.gyro_notch2_hz = parseInt($('.pid_filter input[name="gyroNotch2Frequency"]').val());
        FC.FILTER_CONFIG.gyro_notch2_cutoff = parseInt($('.pid_filter input[name="gyroNotch2Cutoff"]').val());

        FC.ADVANCED_TUNING.levelAngleLimit = parseInt($('.pid_tuning input[name="angleLimit"]').val());

        const antiGravityGain = $('.antigravity input[name="itermAcceleratorGain"]');

        FC.FILTER_CONFIG.dterm_lowpass_type = parseInt($('.pid_filter select[name="dtermLowpassType"]').val());
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            FC.ADVANCED_TUNING.antiGravityGain = parseInt(antiGravityGain.val() * 10);
        } else {
            FC.ADVANCED_TUNING.itermThrottleThreshold = parseInt($('.antigravity input[name="itermThrottleThreshold"]').val());
            FC.ADVANCED_TUNING.itermAcceleratorGain = parseInt(antiGravityGain.val() * 1000);
        }

        FC.FILTER_CONFIG.gyro_lowpass2_hz = parseInt($('.pid_filter input[name="gyroLowpass2Frequency"]').val());
        FC.FILTER_CONFIG.gyro_lowpass_type = parseInt($('.pid_filter select[name="gyroLowpassType"]').val());
        FC.FILTER_CONFIG.gyro_lowpass2_type = parseInt($('.pid_filter select[name="gyroLowpass2Type"]').val());
        FC.FILTER_CONFIG.dterm_lowpass2_hz = parseInt($('.pid_filter input[name="dtermLowpass2Frequency"]').val());
        FC.FILTER_CONFIG.dterm_lowpass2_type = parseInt($('.pid_filter select[name="dtermLowpass2Type"]').val());

        FC.ADVANCED_TUNING.itermRotation = $('input[id="itermrotation"]').is(':checked') ? 1 : 0;
        FC.ADVANCED_TUNING.smartFeedforward = $('input[id="smartfeedforward"]').is(':checked') ? 1 : 0;

        FC.ADVANCED_TUNING.itermRelax = $('input[id="itermrelax"]').is(':checked') ? $('select[id="itermrelaxAxes"]').val() : 0;
        FC.ADVANCED_TUNING.itermRelaxType = $('select[id="itermrelaxType"]').val();
        FC.ADVANCED_TUNING.itermRelaxCutoff = parseInt($('input[name="itermRelaxCutoff"]').val());

        FC.ADVANCED_TUNING.absoluteControlGain = $('input[name="absoluteControlGain-number"]').val();

        FC.ADVANCED_TUNING.throttleBoost = $('input[name="throttleBoost-number"]').val();

        FC.ADVANCED_TUNING.acroTrainerAngleLimit = $('input[name="acroTrainerAngleLimit-number"]').val();

        FC.ADVANCED_TUNING.feedforwardRoll  = parseInt($('.pid_tuning .ROLL input[name="f"]').val());
        FC.ADVANCED_TUNING.feedforwardPitch = parseInt($('.pid_tuning .PITCH input[name="f"]').val());
        FC.ADVANCED_TUNING.feedforwardYaw   = parseInt($('.pid_tuning .YAW input[name="f"]').val());

        FC.ADVANCED_TUNING.feedforwardTransition = parseInt($('input[name="feedforwardTransition-number"]').val() * 100);

        FC.ADVANCED_TUNING.antiGravityMode = semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_45) ? $('select[id="antiGravityMode"]').val() : 0;

        FC.RC_TUNING.throttleLimitType = $('select[id="throttleLimitType"]').val();
        FC.RC_TUNING.throttleLimitPercent = parseInt($('.throttle_limit input[name="throttleLimitPercent"]').val());

        FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = parseInt($('.pid_filter input[name="gyroLowpassDynMinFrequency"]').val());
        FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = parseInt($('.pid_filter input[name="gyroLowpassDynMaxFrequency"]').val());
        FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = parseInt($('.pid_filter input[name="dtermLowpassDynMinFrequency"]').val());
        FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz = parseInt($('.pid_filter input[name="dtermLowpassDynMaxFrequency"]').val());

        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
            if (FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz > 0 && FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz < FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz ) {
                FC.FILTER_CONFIG.gyro_lowpass_type = $('.pid_filter select[name="gyroLowpassDynType"]').val();
            }
            if (FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz > 0 && FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz < FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz ) {
                FC.FILTER_CONFIG.dterm_lowpass_type = $('.pid_filter select[name="dtermLowpassDynType"]').val();
            }
        }

        FC.ADVANCED_TUNING.dMinRoll = parseInt($('.pid_tuning input[name="dMinRoll"]').val());
        FC.ADVANCED_TUNING.dMinPitch = parseInt($('.pid_tuning input[name="dMinPitch"]').val());
        FC.ADVANCED_TUNING.dMinYaw = parseInt($('.pid_tuning input[name="dMinYaw"]').val());
        FC.ADVANCED_TUNING.dMinGain = parseInt($('.dminGroup input[name="dMinGain"]').val());
        FC.ADVANCED_TUNING.dMinAdvance = parseInt($('.dminGroup input[name="dMinAdvance"]').val());

        FC.ADVANCED_TUNING.useIntegratedYaw = $('input[id="useIntegratedYaw"]').is(':checked') ? 1 : 0;

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
            FC.FILTER_CONFIG.dyn_notch_range = parseInt($('.pid_filter select[name="dynamicNotchRange"]').val());
            FC.FILTER_CONFIG.dyn_notch_width_percent = parseInt($('.pid_filter input[name="dynamicNotchWidthPercent"]').val());
            FC.FILTER_CONFIG.dyn_notch_q = parseInt($('.pid_filter input[name="dynamicNotchQ"]').val());
            FC.FILTER_CONFIG.dyn_notch_min_hz = parseInt($('.pid_filter input[name="dynamicNotchMinHz"]').val());

            const rpmFilterEnabled = $('.pid_filter #rpmFilterEnabled').is(':checked');
            FC.FILTER_CONFIG.gyro_rpm_notch_harmonics = rpmFilterEnabled ? parseInt($('.pid_filter input[name="rpmFilterHarmonics"]').val()) : 0;
            FC.FILTER_CONFIG.gyro_rpm_notch_min_hz = parseInt($('.pid_filter input[name="rpmFilterMinHz"]').val());
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            FC.FILTER_CONFIG.dyn_notch_max_hz = parseInt($('.pid_filter input[name="dynamicNotchMaxHz"]').val());
            FC.ADVANCED_TUNING.motorOutputLimit = parseInt($('.tab-pid_tuning input[name="motorLimit"]').val());
            FC.ADVANCED_TUNING.autoProfileCellCount = parseInt($('.tab-pid_tuning select[name="cellCount"]').val());
            FC.ADVANCED_TUNING.idleMinRpm = parseInt($('input[name="idleMinRpm-number"]').val());

            const selectedRatesType = $('select[id="ratesType"]').val(); // send analytics for rates type
            let selectedRatesTypeName = undefined;
            if (selectedRatesType !== FC.RC_TUNING.rates_type) {
                selectedRatesTypeName = $('select[id="ratesType"]').find('option:selected').text();
            }
            self.analyticsChanges['RatesType'] = selectedRatesTypeName;

            FC.RC_TUNING.rates_type = selectedRatesType;
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
            FC.ADVANCED_TUNING.feedforward_averaging = $('select[id="feedforwardAveraging"]').val();
            FC.ADVANCED_TUNING.feedforward_smooth_factor = parseInt($('input[name="feedforwardSmoothFactor"]').val());
            FC.ADVANCED_TUNING.feedforward_boost = parseInt($('input[name="feedforwardBoost"]').val());
            FC.ADVANCED_TUNING.feedforward_max_rate_limit = parseInt($('input[name="feedforwardMaxRateLimit"]').val());
            FC.ADVANCED_TUNING.feedforward_jitter_factor = parseInt($('input[name="feedforwardJitterFactor"]').val());
            FC.FILTER_CONFIG.dyn_lpf_curve_expo = parseInt($('.pid_filter input[name="dtermLowpassDynExpo"]').val());
            FC.ADVANCED_TUNING.vbat_sag_compensation = $('input[id="vbatSagCompensation"]').is(':checked') ? parseInt($('input[name="vbatSagValue"]').val()) : 0;
            FC.ADVANCED_TUNING.thrustLinearization = $('input[id="thrustLinearization"]').is(':checked') ? parseInt($('input[name="thrustLinearValue"]').val()) : 0;
            FC.FILTER_CONFIG.dyn_lpf_curve_expo = parseInt($('.pid_filter input[name="dtermLowpassExpo"]').val());

            const dynamicNotchEnabled = $('.pid_filter input[id="dynamicNotchEnabled"]').is(':checked');
            FC.FILTER_CONFIG.dyn_notch_count = dynamicNotchEnabled ? parseInt($('.pid_filter input[name="dynamicNotchCount"]').val()) : 0;

            FC.TUNING_SLIDERS.slider_pids_mode = TuningSliders.sliderPidsMode;
            //round slider values to nearest multiple of 5 and passes to the FW. Avoid dividing calc by (* x 100)/5 = 20
            FC.TUNING_SLIDERS.slider_master_multiplier = Math.round(TuningSliders.sliderMasterMultiplier * 20) * 5;
            FC.TUNING_SLIDERS.slider_d_gain = Math.round(TuningSliders.sliderDGain * 20) * 5;
            FC.TUNING_SLIDERS.slider_pi_gain = Math.round(TuningSliders.sliderPIGain * 20) * 5;
            FC.TUNING_SLIDERS.slider_feedforward_gain = Math.round(TuningSliders.sliderFeedforwardGain * 20) * 5;
            FC.TUNING_SLIDERS.slider_i_gain = Math.round(TuningSliders.sliderIGain * 20) * 5;
            FC.TUNING_SLIDERS.slider_dmax_gain = Math.round(TuningSliders.sliderDMaxGain * 20) * 5;
            FC.TUNING_SLIDERS.slider_roll_pitch_ratio = Math.round(TuningSliders.sliderRollPitchRatio * 20) * 5;
            FC.TUNING_SLIDERS.slider_pitch_pi_gain = Math.round(TuningSliders.sliderPitchPIGain * 20) * 5;

            FC.TUNING_SLIDERS.slider_dterm_filter = TuningSliders.sliderDTermFilter;
            FC.TUNING_SLIDERS.slider_dterm_filter_multiplier = Math.round(TuningSliders.sliderDTermFilterMultiplier * 20) * 5;
            FC.TUNING_SLIDERS.slider_gyro_filter = TuningSliders.sliderGyroFilter;
            FC.TUNING_SLIDERS.slider_gyro_filter_multiplier = Math.round(TuningSliders.sliderGyroFilterMultiplier * 20) * 5;
        }
    }

    function showAllPids() {

        // Hide all optional elements
        $('.pid_optional tr').hide(); // Hide all rows
        $('.pid_optional table').hide(); // Hide tables
        $('.pid_optional').hide(); // Hide general div

        // Only show rows supported by the firmware
        FC.PID_NAMES.forEach(function(elementPid) {
            // Show rows for the PID
            $(`.pid_tuning .${elementPid}`).show();

            // Show titles and other elements needed by the PID
            $(`.needed_by_${elementPid}`).show();
        });
    }

    function hideUnusedPids() {

        if (!have_sensor(FC.CONFIG.activeSensors, 'acc')) {
            $('#pid_accel').hide();
            $('.acroTrainerAngleLimit').hide();
        }

        // Hide all optional elements
        $('#pid_baro_mag_gps').hide();
    }

    function drawAxes(curveContext, width, height) {
        curveContext.strokeStyle = '#000000';
        curveContext.lineWidth = 4;

        // Horizontal
        curveContext.beginPath();
        curveContext.moveTo(0, height / 2);
        curveContext.lineTo(width, height / 2);
        curveContext.stroke();

        // Vertical
        curveContext.beginPath();
        curveContext.moveTo(width / 2, 0);
        curveContext.lineTo(width / 2, height);
        curveContext.stroke();

    }


    function checkInput(element) {
        let value = parseFloat(element.val());
        if (value < parseFloat(element.prop('min'))
            || value > parseFloat(element.prop('max'))) {
            value = undefined;
        }

        return value;
    }

    const useLegacyCurve = false;

    self.rateCurve = new RateCurve(useLegacyCurve);

    $('.pid_tuning input[name="sensitivity"]').hide();
    $('.pid_tuning .levelSensitivityHeader').empty();

    function printMaxAngularVel(rate, rcRate, rcExpo, useSuperExpo, deadband, limit, maxAngularVelElement) {
        const maxAngularVel = self.rateCurve.getMaxAngularVel(rate, rcRate, rcExpo, useSuperExpo, deadband, limit).toFixed(0);
        maxAngularVelElement.text(maxAngularVel);

        return maxAngularVel;
    }

    function drawCurve(rate, rcRate, rcExpo, useSuperExpo, deadband, limit, maxAngularVel, colour, yOffset, context) {
        context.save();
        context.strokeStyle = colour;
        context.translate(0, yOffset);
        self.rateCurve.draw(rate, rcRate, rcExpo, useSuperExpo, deadband, limit, maxAngularVel, context);
        context.restore();
    }

    function process_html() {
        TABS.pid_tuning.isHtmlProcessing = true;
        FC.FEATURE_CONFIG.features.generateElements($('.tab-pid_tuning .features'));

        $('.tab-pid_tuning .pidTuningSuperexpoRates').hide();

        // translate to user-selected language
        i18n.localizePage();

        self.currentRates = self.rateCurve.getCurrentRates();

        $('.tab-pid_tuning .tab-container .pid').on('click', () => activateSubtab('pid'));

        $('.tab-pid_tuning .tab-container .rates').on('click', () => activateSubtab('rates'));

        $('.tab-pid_tuning .tab-container .filter').on('click', () => activateSubtab('filter'));

        function loadProfilesList() {
            const numberOfProfiles = FC.CONFIG.numProfiles;

            const profileElements = [];
            for (let i = 0; i < numberOfProfiles; i++) {
                profileElements.push(i18n.getMessage("pidTuningProfileOption",[(i + 1)]));
            }
            return profileElements;
        }

        function loadRateProfilesList() {
            let numberOfRateProfiles = 6;

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                numberOfRateProfiles = 4;
            }

            const rateProfileElements = [];
            for (let i = 0; i < numberOfRateProfiles; i++) {
                rateProfileElements.push(i18n.getMessage("pidTuningRateProfileOption",[(i + 1)]));
            }
            return rateProfileElements;
        }

        // This vars are used here for populate the profile (and rate profile) selector AND in the copy profile (and rate profile) window
        const selectRateProfileValues = loadRateProfilesList();
        const selectProfileValues = loadProfilesList();

        function populateProfilesSelector(_selectProfileValues) {
            const profileSelect = $('select[name="profile"]');
            _selectProfileValues.forEach(function(value, key) {
                profileSelect.append(`<option value="${key}">${value}</option>`);
            });
        }

        populateProfilesSelector(selectProfileValues);

        function populateRateProfilesSelector(_selectRateProfileValues) {
            const rateProfileSelect = $('select[name="rate_profile"]');
            _selectRateProfileValues.forEach(function(value, key) {
                rateProfileSelect.append(`<option value="${key}">${value}</option>`);
            });
        }

        populateRateProfilesSelector(selectRateProfileValues);

        const showAllButton = $('#showAllPids');

        function updatePidDisplay() {
            if (!self.showAllPids) {
                hideUnusedPids();

                showAllButton.text(i18n.getMessage("pidTuningShowAllPids"));
            } else {
                showAllPids();

                showAllButton.text(i18n.getMessage("pidTuningHideUnusedPids"));
            }
        }

        showAllPids();
        updatePidDisplay();

        showAllButton.on('click', function() {
            self.showAllPids = !self.showAllPids;

            updatePidDisplay();
        });

        $('#resetPidProfile').on('click', function(){
            self.updating = true;

            MSP.promise(MSPCodes.MSP_SET_RESET_CURR_PID).then(function () {
                self.refresh(function () {
                    self.updating = false;

                    gui_log(i18n.getMessage('pidTuningPidProfileReset'));
                });
            });
        });

        $('.tab-pid_tuning select[name="profile"]').change(function () {
            self.currentProfile = parseInt($(this).val());
            self.updating = true;
            $(this).prop('disabled', 'true');
            MSP.promise(MSPCodes.MSP_SELECT_SETTING, [self.currentProfile]).then(function () {
                self.refresh(function () {
                    self.updating = false;

                    $('.tab-pid_tuning select[name="profile"]').prop('disabled', 'false');
                    FC.CONFIG.profile = self.currentProfile;

                    gui_log(i18n.getMessage('pidTuningLoadedProfile', [self.currentProfile + 1]));
                });
            });
        });

        $('.tab-pid_tuning select[name="rate_profile"]').change(function () {
            self.currentRateProfile = parseInt($(this).val());
            self.updating = true;
            $(this).prop('disabled', 'true');
            MSP.promise(MSPCodes.MSP_SELECT_SETTING, [self.currentRateProfile + self.RATE_PROFILE_MASK]).then(function () {
                self.refresh(function () {
                    self.updating = false;

                    $('.tab-pid_tuning select[name="rate_profile"]').prop('disabled', 'false');
                    FC.CONFIG.rateProfile = self.currentRateProfile;
                    self.currentRates = self.rateCurve.getCurrentRates();

                    gui_log(i18n.getMessage('pidTuningLoadedRateProfile', [self.currentRateProfile + 1]));
                });
            });
        });

        const dtermTransitionNumberElement = $('input[name="dtermSetpointTransition-number"]');
        const dtermTransitionWarningElement = $('#pid-tuning .dtermSetpointTransitionWarning');

        function checkUpdateDtermTransitionWarning(value) {
            if (value > 0 && value < 0.1) {
                dtermTransitionWarningElement.show();
            } else {
                dtermTransitionWarningElement.hide();
            }
        }
        checkUpdateDtermTransitionWarning(dtermTransitionNumberElement.val());

        //Use 'input' event for coupled controls to allow synchronized update
        dtermTransitionNumberElement.on('input', function () {
            checkUpdateDtermTransitionWarning($(this).val());
        });

        $('#pid-tuning .delta').hide();
        $('.tab-pid_tuning .note').hide();

        // Add a name to each row of PIDs if empty
        $('.pid_tuning tr').each(function() {
            for (const pidName of FC.PID_NAMES) {
                if ($(this).hasClass(pidName)) {
                    const firstColumn = $(this).find('td:first');
                    if (!firstColumn.text()) {
                        firstColumn.text(pidName);
                    }
                }
            }
        });

        // DTerm filter options
        function loadFilterTypeValues() {
            const filterTypeValues = [];
            filterTypeValues.push("PT1");
            filterTypeValues.push("BIQUAD");

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                filterTypeValues.push("PT2");
                filterTypeValues.push("PT3");
            }

            return filterTypeValues;
        }

        function populateFilterTypeSelector(name, selectDtermValues) {
            const dtermFilterSelect = $(`select[name="${name}"]`);
            selectDtermValues.forEach(function(value, key) {
                dtermFilterSelect.append(`<option value="${key}">${value}</option>`);
            });
        }
        // Added in API 1.42.0
        function loadDynamicNotchRangeValues() {
            return [ "HIGH", "MEDIUM", "LOW", "AUTO" ];
        }
        function populateDynamicNotchRangeSelect(selectDynamicNotchRangeValues) {
            const dynamicNotchRangeSelect = $('select[name="dynamicNotchRange"]');
            selectDynamicNotchRangeValues.forEach(function(value, key) {
                dynamicNotchRangeSelect.append(`<option value="${key}">${value}</option>`);
            });
        }
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
            populateDynamicNotchRangeSelect(loadDynamicNotchRangeValues());
        }

        populateFilterTypeSelector('gyroLowpassType', loadFilterTypeValues());
        populateFilterTypeSelector('gyroLowpass2Type', loadFilterTypeValues());
        populateFilterTypeSelector('dtermLowpassType', loadFilterTypeValues());
        populateFilterTypeSelector('dtermLowpass2Type', loadFilterTypeValues());

        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
            populateFilterTypeSelector('gyroLowpassDynType', loadFilterTypeValues());
            populateFilterTypeSelector('dtermLowpassDynType', loadFilterTypeValues());
        }

        pid_and_rc_to_form();

        function activateSubtab(subtabName) {
            const names = ['pid', 'rates', 'filter'];
            if (!names.includes(subtabName)) {
                console.debug(`Invalid subtab name: "${subtabName}"`);
                return;
            }
            for (const tabname of names) {
                const el = $(`.tab-pid_tuning .subtab-${tabname}`);
                el[tabname === subtabName ? 'show' : 'hide']();
            }
            $('.tab-pid_tuning .tab-container .tab').removeClass('active');
            $(`.tab-pid_tuning .tab-container .${subtabName}`).addClass('active');
            self.activeSubtab = subtabName;
            if (subtabName === 'rates') {
                // force drawing of throttle curve once the throttle curve container element is available
                // deferring drawing like this is needed to acquire the exact pixel size of the canvas
                redrawThrottleCurve(true);
                self.throttleDrawInterval = setInterval(redrawThrottleCurve, 100);
            } else if (self.throttleDrawInterval) {
                clearInterval(self.throttleDrawInterval);
                self.throttleDrawInterval = null;
            }
        }

        activateSubtab(self.activeSubtab);

        $('.tab-pid_tuning div.controller').hide();

        self.updatePidControllerParameters();

        $('.pid_tuning .roll_pitch_rate').hide();

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            $('.tpa-old').hide();
        } else {
            $('.tpa').hide();
        }

        $('.pid_tuning .bracket').hide();
        $('.pid_tuning input[name=rc_rate]').parent().attr('class', 'pid_data');
        $('.pid_tuning input[name=rc_rate]').parent().attr('rowspan', 1);
        $('.pid_tuning input[name=rc_expo]').parent().attr('class', 'pid_data');
        $('.pid_tuning input[name=rc_expo]').parent().attr('rowspan', 1);

        if (useLegacyCurve) {
            $('.new_rates').hide();
        }

        // Getting the DOM elements for curve display
        const rcCurveElement = $('.rate_curve canvas#rate_curve_layer0').get(0);
        const curveContext = rcCurveElement.getContext("2d");
        let updateNeeded = true;
        let maxAngularVel;

        // make these variables global scope so that they can be accessed by the updateRates function.
        self.maxAngularVelRollElement    = $('.pid_tuning .maxAngularVelRoll');
        self.maxAngularVelPitchElement   = $('.pid_tuning .maxAngularVelPitch');
        self.maxAngularVelYawElement     = $('.pid_tuning .maxAngularVelYaw');

        rcCurveElement.width = 1000;
        rcCurveElement.height = 1000;

        function updateRates (event) {
            setTimeout(function () { // let global validation trigger and adjust the values first
                if (event) { // if an event is passed, then use it
                    const targetElement = $(event.target);
                    let targetValue = checkInput(targetElement);

                    if (self.currentRates.hasOwnProperty(targetElement.attr('name')) && targetValue !== undefined) {
                        const stepValue = parseFloat(targetElement.prop('step')); // adjust value to match step (change only the result, not the the actual value)
                        if (stepValue != null) {
                            targetValue = Math.round(targetValue / stepValue) * stepValue;
                        }

                        self.currentRates[targetElement.attr('name')] = targetValue;

                        updateNeeded = true;
                    }

                    if (targetElement.attr('name') === 'SUPEREXPO_RATES') {
                        self.currentRates.superexpo = targetElement.is(':checked');

                        updateNeeded = true;
                    }

                    if (targetElement.attr('id') === 'ratesType' && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                        self.changeRatesType(targetValue);

                        updateNeeded = true;
                    }
                } else { // no event was passed, just force a graph update
                    updateNeeded = true;
                }
                if (updateNeeded) {
                    const curveHeight = rcCurveElement.height;
                    const curveWidth = rcCurveElement.width;
                    const lineScale = curveContext.canvas.width / curveContext.canvas.clientWidth;

                    curveContext.clearRect(0, 0, curveWidth, curveHeight);

                    if (!useLegacyCurve) {
                        maxAngularVel = Math.max(
                            printMaxAngularVel(self.currentRates.roll_rate, self.currentRates.rc_rate, self.currentRates.rc_expo, self.currentRates.superexpo, self.currentRates.deadband, self.currentRates.roll_rate_limit, self.maxAngularVelRollElement),
                            printMaxAngularVel(self.currentRates.pitch_rate, self.currentRates.rc_rate_pitch, self.currentRates.rc_pitch_expo, self.currentRates.superexpo, self.currentRates.deadband, self.currentRates.pitch_rate_limit, self.maxAngularVelPitchElement),
                            printMaxAngularVel(self.currentRates.yaw_rate, self.currentRates.rc_rate_yaw, self.currentRates.rc_yaw_expo, self.currentRates.superexpo, self.currentRates.yawDeadband, self.currentRates.yaw_rate_limit, self.maxAngularVelYawElement));

                        // make maxAngularVel multiple of 200deg/s so that the auto-scale doesn't keep changing for small changes of the maximum curve
                        maxAngularVel = self.rateCurve.setMaxAngularVel(maxAngularVel);

                        drawAxes(curveContext, curveWidth, curveHeight);

                    } else {
                        maxAngularVel = 0;
                    }

                    curveContext.lineWidth = 2 * lineScale;
                    drawCurve(self.currentRates.roll_rate, self.currentRates.rc_rate, self.currentRates.rc_expo, self.currentRates.superexpo, self.currentRates.deadband, self.currentRates.roll_rate_limit, maxAngularVel, '#ff0000', 0, curveContext);
                    drawCurve(self.currentRates.pitch_rate, self.currentRates.rc_rate_pitch, self.currentRates.rc_pitch_expo, self.currentRates.superexpo, self.currentRates.deadband, self.currentRates.pitch_rate_limit, maxAngularVel, '#00ff00', -4, curveContext);
                    drawCurve(self.currentRates.yaw_rate, self.currentRates.rc_rate_yaw, self.currentRates.rc_yaw_expo, self.currentRates.superexpo, self.currentRates.yawDeadband, self.currentRates.yaw_rate_limit, maxAngularVel, '#0000ff', 4, curveContext);

                    self.updateRatesLabels();

                    updateNeeded = false;
                }
            }, 0);
        }

        // UI Hooks
        // curves
        $('input.feature').on('input change', function () {
            const element = $(this);

            FC.FEATURE_CONFIG.features.updateData(element);

            updateRates();
        });

        $('.pid_tuning').on('input change', updateRates).trigger('input');

        function redrawThrottleCurve(forced = false) {
            if (!forced && !self.checkThrottle()) {
                return;
            }

            /*
            Quadratic curve formula taken from:
                https://stackoverflow.com/a/9195706/176210
            */

            function getQBezierValue(t, p1, p2, p3) {
                const iT = 1 - t;
                return iT * iT * p1 + 2 * iT * t * p2 + t * t * p3;
            }

            function getQuadraticCurvePoint(startX, startY, cpX, cpY, endX, endY, position) {
                return {
                    x:  getQBezierValue(position, startX, cpX, endX),
                    y:  getQBezierValue(position, startY, cpY, endY),
                };
            }

            /*
            Maths from: https://stackoverflow.com/questions/40918569/quadratic-bezier-curve-calculate-x-for-any-given-y
            */
            function getPosfromYBezier(y, startY, cpY, endY) {
            // y = (1-t)^2 * p0 + 2 * (1-t)*t*p1 + t^2 * p2
            // y = (p2+p0-2p1)x^2 + 2(p1 - p0)x + p0
            // 0 = (p2+p0-2p1)x^2 + 2(p1 - p0)x + (p0 - y)
                const a = startY + endY - 2 * cpY;
                const b = 2 * (cpY - startY);
                const c = startY - y;
                return a == 0 ? -c / b : ( -b - Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
            }

            const THROTTLE_LIMIT_TYPES = {
                OFF: 0,
                SCALE: 1,
                CLIP: 2,
            };
            // let global validation trigger and adjust the values first
            const throttleMidE = $('.throttle input[name="mid"]');
            const throttleExpoE = $('.throttle input[name="expo"]');
            const throttleLimitPercentE = $('.throttle_limit input[name="throttleLimitPercent"]');
            const throttleLimitTypeE = $('.throttle_limit select[id="throttleLimitType"]');
            const mid = parseFloat(throttleMidE.val());
            const expo = parseFloat(throttleExpoE.val());
            const throttleLimitPercent = parseInt(throttleLimitPercentE.val()) / 100;
            const throttleLimitType = parseInt(throttleLimitTypeE.val());
            const throttleCurve = $('.throttle .throttle_curve canvas').get(0);
            const context = throttleCurve.getContext("2d");

            // local validation to deal with input event
            if (mid >= parseFloat(throttleMidE.prop('min')) &&
                mid <= parseFloat(throttleMidE.prop('max')) &&
                expo >= parseFloat(throttleExpoE.prop('min')) &&
                expo <= parseFloat(throttleExpoE.prop('max'))) {
                // continue
            } else {
                return;
            }

            throttleCurve.width = throttleCurve.height *
                (throttleCurve.clientWidth / throttleCurve.clientHeight);

            const throttleScale = throttleLimitType === THROTTLE_LIMIT_TYPES.SCALE ? throttleLimitPercent : 1;
            const canvasHeight = throttleCurve.height;
            const canvasWidth = throttleCurve.width;

            // math magic by englishman
            const topY = canvasHeight * (1 - throttleScale);
            const midX = canvasWidth * mid;
            const midXl = midX * 0.5;
            const midXr = (((canvasWidth - midX) * 0.5) + midX);
            const midY = (canvasHeight - throttleScale * (midX * (canvasHeight / canvasWidth)));
            const midYl = (canvasHeight - ((canvasHeight - midY) * 0.5 * (expo + 1)));
            const midYr = (topY + ((midY - topY) * 0.5 *(expo + 1)));

            let thrPercent = (FC.RC.channels[3] - 1000) / 1000,
                thrpos = thrPercent <= mid
                    ? getQuadraticCurvePoint(0, canvasHeight, midXl, midYl, midX, midY, thrPercent * (1.0 / mid))
                    : getQuadraticCurvePoint(midX, midY, midXr, midYr, canvasWidth, topY, (thrPercent - mid) * (1.0 / (1.0 - mid)));

            // draw
            context.clearRect(0, 0, canvasWidth, canvasHeight);
            context.beginPath();
            context.moveTo(0, canvasHeight);
            if (throttleLimitType === THROTTLE_LIMIT_TYPES.CLIP) {
                const throttleClipY = canvasHeight * (1 - throttleLimitPercent);
                thrpos.y = thrpos.y < throttleClipY ? throttleClipY : thrpos.y;
                const clipPos = throttleLimitPercent <= mid
                    ? getPosfromYBezier(throttleClipY,canvasHeight,midYl, midY)
                    : getPosfromYBezier(throttleClipY,midY, midYr, topY);
                let curveClip = getQuadraticCurvePoint(0, canvasHeight, midXl, midYl, midX, midY, clipPos);
                let ctrlX = curveClip.x / 2;
                let ctrlY = midYl + (canvasHeight - midYl) * (midX - curveClip.x) / midX;
                if (throttleLimitPercent > mid) {
                    context.quadraticCurveTo(midXl, midYl, midX, midY);
                    context.moveTo(midX, midY);
                    curveClip = getQuadraticCurvePoint(midX, midY, midXr, midYr, canvasWidth, topY, clipPos);
                    ctrlX = midX + (curveClip.x - midX) / 2;
                    ctrlY = midYr + (midY - midYr) * (canvasWidth - curveClip.x) / (canvasWidth - midX);
                }
                context.quadraticCurveTo(ctrlX, ctrlY, curveClip.x, curveClip.y);
                context.moveTo(curveClip.x, curveClip.y);
                context.lineTo(canvasWidth, curveClip.y);
            } else {
                context.quadraticCurveTo(midXl, midYl, midX, midY);
                context.moveTo(midX, midY);
                context.quadraticCurveTo(midXr, midYr, canvasWidth, topY);
            }
            context.lineWidth = 2;
            context.strokeStyle = '#ffbb00';
            context.stroke();
            context.beginPath();
            context.arc(thrpos.x, thrpos.y, 4, 0, 2 * Math.PI);
            context.fillStyle = context.strokeStyle;
            context.fill();
            context.save();
            let fontSize = 10;
            context.font = `${fontSize}pt Verdana, Arial, sans-serif`;
            let realthr = thrPercent * 100.0,
                expothr = 100 - (thrpos.y / canvasHeight) * 100.0,
                thrlabel = `${Math.round(thrPercent <= 0 ? 0 : realthr)}%` +
                    ` = ${Math.round(thrPercent <= 0 ? 0 : expothr)}%`,
                textWidth = context.measureText(thrlabel);
            context.fillStyle = '#000';
            context.scale(textWidth / throttleCurve.clientWidth, 1);
            context.fillText(thrlabel, 5, 5 + fontSize);
            context.restore();
        }

        $('.throttle input, .throttle_limit input, .throttle_limit select')
            .on('change', () => setTimeout(() => redrawThrottleCurve(true), 0));

        $('a.refresh').click(function () {
            self.refresh(function () {
                gui_log(i18n.getMessage('pidTuningDataRefreshed'));
            });
        });

        // exclude integratedYaw from setDirty for 4.3 as it uses RP mode.
        $('#pid-tuning').find('input').each(function (k, item) {
            if ($(item).attr('class') !== "feature toggle" && $(item).attr('class') !== "nonProfile") {
                $(item).change(function () {
                    self.setDirty(true);
                });
            }
        });

        const dialogCopyProfile = $('.dialogCopyProfile')[0];
        const DIALOG_MODE_PROFILE = 0;
        const DIALOG_MODE_RATEPROFILE = 1;
        let dialogCopyProfileMode;

        const selectProfile = $('.selectProfile');
        const selectRateProfile = $('.selectRateProfile');

        $.each(selectProfileValues, function(key, value) {
            if (key !== FC.CONFIG.profile) {
                selectProfile.append(new Option(value, key));
            }
        });
        $.each(selectRateProfileValues, function(key, value) {
            if (key !== FC.CONFIG.rateProfile) {
                selectRateProfile.append(new Option(value, key));
            }
        });

        $('.copyprofilebtn').click(function() {
            $('.dialogCopyProfile').find('.contentProfile').show();
            $('.dialogCopyProfile').find('.contentRateProfile').hide();
            dialogCopyProfileMode = DIALOG_MODE_PROFILE;
            dialogCopyProfile.showModal();
        });

        $('.copyrateprofilebtn').click(function() {
            $('.dialogCopyProfile').find('.contentProfile').hide();
            $('.dialogCopyProfile').find('.contentRateProfile').show();
            dialogCopyProfileMode = DIALOG_MODE_RATEPROFILE;
            dialogCopyProfile.showModal();
        });

        $('.dialogCopyProfile-cancelbtn').click(function() {
            dialogCopyProfile.close();
        });

        $('.dialogCopyProfile-confirmbtn').click(function() {
            switch(dialogCopyProfileMode) {
                case DIALOG_MODE_PROFILE:
                    FC.COPY_PROFILE.type = DIALOG_MODE_PROFILE;    // 0 = pid profile
                    FC.COPY_PROFILE.dstProfile = parseInt(selectProfile.val());
                    FC.COPY_PROFILE.srcProfile = FC.CONFIG.profile;

                    MSP.send_message(MSPCodes.MSP_COPY_PROFILE, mspHelper.crunch(MSPCodes.MSP_COPY_PROFILE), false, close_dialog);

                    break;

                case DIALOG_MODE_RATEPROFILE:
                    FC.COPY_PROFILE.type = DIALOG_MODE_RATEPROFILE;    // 1 = rate profile
                    FC.COPY_PROFILE.dstProfile = parseInt(selectRateProfile.val());
                    FC.COPY_PROFILE.srcProfile = FC.CONFIG.rateProfile;

                    MSP.send_message(MSPCodes.MSP_COPY_PROFILE, mspHelper.crunch(MSPCodes.MSP_COPY_PROFILE), false, close_dialog);

                    break;

                default:
                    close_dialog();
                    break;
            }

            function close_dialog() {
                dialogCopyProfile.close();
            }
        });

        /*
         *  TuningSliders
        */

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
            // filter and tuning sliders
            TuningSliders.initialize();

            // UNSCALED non expert slider constrain values
            const NON_EXPERT_SLIDER_MAX = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44) ? 1.4 : 1.25;
            const NON_EXPERT_SLIDER_MIN = 0.7;

            const SLIDER_STEP_LOWER = 0.05;
            const SLIDER_STEP_UPPER = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44) ? 0.05 : 0.1;

            const sliderPidsModeSelect = $('#sliderPidsModeSelect');
            const sliderGyroFilterModeSelect = $('#sliderGyroFilterModeSelect');
            const sliderDTermFilterModeSelect = $('#sliderDTermFilterModeSelect');

            const useIntegratedYaw = $('input[id="useIntegratedYaw"]');

            useIntegratedYaw.on('change', () => {
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                    // set slider to RP mode if Integrated Yaw is enabled and sliders are enabled
                    if (useIntegratedYaw.is(':checked') && TuningSliders.sliderPidsMode) {
                        sliderPidsModeSelect.val(1).trigger('change');
                    }
                } else {
                    // disable sliders if Integrated Yaw is enabled or Slider PID mode is set to OFF
                    TuningSliders.updatePidSlidersDisplay();
                }
            });

            // trigger Slider Display update when PID / Filter mode is changed
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {

                sliderPidsModeSelect.on('change', function () {
                    const setMode = parseInt($(this).val());

                    TuningSliders.sliderPidsMode = setMode;

                    TuningSliders.calculateNewPids();
                    TuningSliders.updatePidSlidersDisplay();

                    // disable Integrated Yaw when going into RPY mode
                    if (setMode === 2) {
                        useIntegratedYaw.prop('checked', false).trigger('change');
                    }
                });

                sliderGyroFilterModeSelect.change(function() {
                    const mode = parseInt($(this).find(':selected').val());

                    if (mode === 1) {
                        TuningSliders.gyroFilterSliderEnable();
                    } else {
                        TuningSliders.gyroFilterSliderDisable();
                    }
                });

                sliderDTermFilterModeSelect.change(function() {
                    const mode = parseInt($(this).find(':selected').val());

                    if (mode !== 0) {
                        TuningSliders.dtermFilterSliderEnable();
                    } else {
                        TuningSliders.dtermFilterSliderDisable();
                    }
                });
            }

            let allPidTuningSliders;
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                allPidTuningSliders = $('#sliderMasterMultiplier, #sliderDGain, #sliderPIGain, #sliderFeedforwardGain, #sliderIGain, #sliderDMaxGain, #sliderRollPitchRatio, #sliderPitchPIGain');
                $('.tab-pid-tuning .legacySlider').hide();
            } else {
                allPidTuningSliders = $('#sliderMasterMultiplierLegacy, #sliderPDRatio, #sliderPDGain, #sliderFeedforwardGainLegacy');
                $('.tab-pid_tuning .advancedSlider').hide();
                $('.tab-pid-tuning .baseSlider').hide();
                $('.tab-pid_tuning .sliderMode').hide();
            }

            allPidTuningSliders.on('input mouseup', function() {
                const slider = $(this);

                if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                    if (slider.val() >= 1) {
                        slider.attr('step', SLIDER_STEP_LOWER);
                    } else {
                        slider.attr('step', SLIDER_STEP_UPPER);
                    }
                }

                if (!TuningSliders.expertMode) {
                    if (slider.val() > NON_EXPERT_SLIDER_MAX) {
                        slider.val(NON_EXPERT_SLIDER_MAX);
                    } else if (slider.val() < NON_EXPERT_SLIDER_MIN) {
                        slider.val(NON_EXPERT_SLIDER_MIN);
                    }
                }

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                    const sliderValue = isInt(slider.val()) ? parseInt(slider.val()) : parseFloat(slider.val());
                    if (slider.is('#sliderDGain')) {
                        TuningSliders.sliderDGain = sliderValue;
                    } else if (slider.is('#sliderPIGain')) {
                        TuningSliders.sliderPIGain = sliderValue;
                    } else if (slider.is('#sliderFeedforwardGain')) {
                        TuningSliders.sliderFeedforwardGain = sliderValue;
                    } else if (slider.is('#sliderDMaxGain')) {
                        TuningSliders.sliderDMaxGain = sliderValue;
                    } else if (slider.is('#sliderIGain')) {
                        TuningSliders.sliderIGain = sliderValue;
                    } else if (slider.is('#sliderRollPitchRatio')) {
                        TuningSliders.sliderRollPitchRatio = sliderValue;
                    } else if (slider.is('#sliderPitchPIGain')) {
                        TuningSliders.sliderPitchPIGain = sliderValue;
                    } else if (slider.is('#sliderMasterMultiplier')) {
                        TuningSliders.sliderMasterMultiplier = sliderValue;
                    }
                } else {
                    const sliderValue = TuningSliders.scaleSliderValue(slider.val());
                    if (slider.is('#sliderMasterMultiplierLegacy')) {
                        TuningSliders.sliderMasterMultiplierLegacy = sliderValue;
                    } else if (slider.is('#sliderPDRatio')) {
                        TuningSliders.sliderPDRatio = sliderValue;
                    } else if (slider.is('#sliderPDGain')) {
                        TuningSliders.sliderPDGain = sliderValue;
                    } else if (slider.is('#sliderFeedforwardGainLegacy')) {
                        TuningSliders.sliderFeedforwardGainLegacy = sliderValue;
                    }
                }

                self.calculateNewPids();
                self.analyticsChanges['PidTuningSliders'] = "On";
            });

            allPidTuningSliders.each(function (i) {
               self.sliderOnScroll($(this));
            });

            // reset to middle with double click
            allPidTuningSliders.dblclick(function() {
                const slider = $(this);
                let value;

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                    if (slider.is('#sliderDGain')) {
                        value = FC.DEFAULT_TUNING_SLIDERS.slider_d_gain / 100;
                        TuningSliders.sliderDGain = value;
                    } else if (slider.is('#sliderPIGain')) {
                        value = FC.DEFAULT_TUNING_SLIDERS.slider_pi_gain / 100;
                        TuningSliders.sliderPIGain = value;
                    } else if (slider.is('#sliderFeedforwardGain')) {
                        value = FC.DEFAULT_TUNING_SLIDERS.slider_feedforward_gain / 100;
                        TuningSliders.sliderFeedforwardGain = value;
                    } else if (slider.is('#sliderDMaxGain')) {
                        value = FC.DEFAULT_TUNING_SLIDERS.slider_dmax_gain / 100;
                        TuningSliders.sliderDMaxGain = value;
                    } else if (slider.is('#sliderIGain')) {
                        value = FC.DEFAULT_TUNING_SLIDERS.slider_i_gain / 100;
                        TuningSliders.sliderIGain = value;
                    } else if (slider.is('#sliderRollPitchRatio')) {
                        value = FC.DEFAULT_TUNING_SLIDERS.slider_roll_pitch_ratio / 100;
                        TuningSliders.sliderRollPitchRatio = value;
                    } else if (slider.is('#sliderPitchPIGain')) {
                        value = FC.DEFAULT_TUNING_SLIDERS.slider_pitch_pi_gain / 100;
                        TuningSliders.sliderPitchPIGain = value;
                    } else if (slider.is('#sliderMasterMultiplier')) {
                        value = FC.DEFAULT_TUNING_SLIDERS.slider_master_multiplier / 100;
                        TuningSliders.sliderMasterMultiplier = value;
                    }
                } else {
                    value = 1;
                    if (slider.is('#sliderMasterMultiplierLegacy')) {
                        TuningSliders.sliderMasterMultiplierLegacy = 1;
                    } else if (slider.is('#sliderPDRatio')) {
                        TuningSliders.sliderPDRatio = 1;
                    } else if (slider.is('#sliderPDGain')) {
                        TuningSliders.sliderPDGain = 1;
                    } else if (slider.is('#sliderFeedforwardGainLegacy')) {
                        TuningSliders.sliderFeedforwardGainLegacy = 1;
                    }
                }
                slider.val(value);
                self.calculateNewPids();
            });

            // enable filter sliders inputs
            const allFilterTuningSliders = $('#sliderGyroFilterMultiplier, #sliderDTermFilterMultiplier');
            allFilterTuningSliders.on('input mouseup', function() {
                const slider = $(this);

                if (!TuningSliders.expertMode) {
                    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                        const NON_EXPERT_SLIDER_MIN_GYRO = 0.5;
                        const NON_EXPERT_SLIDER_MAX_GYRO = 1.5;
                        const NON_EXPERT_SLIDER_MIN_DTERM = 0.8;
                        const NON_EXPERT_SLIDER_MAX_DTERM = 1.2;

                        if (slider.is('#sliderGyroFilterMultiplier')) {
                            if (slider.val() > NON_EXPERT_SLIDER_MAX_GYRO) {
                                slider.val(NON_EXPERT_SLIDER_MAX_GYRO);
                            } else if (slider.val() < NON_EXPERT_SLIDER_MIN_GYRO) {
                                slider.val(NON_EXPERT_SLIDER_MIN_GYRO);
                            }
                        } else if (slider.is('#sliderDTermFilterMultiplier')) {
                            if (slider.val() > NON_EXPERT_SLIDER_MAX_DTERM) {
                                slider.val(NON_EXPERT_SLIDER_MAX_DTERM);
                            } else if (slider.val() < NON_EXPERT_SLIDER_MIN_DTERM) {
                                slider.val(NON_EXPERT_SLIDER_MIN_DTERM);
                            }
                        }
                    } else {
                        if (slider.val() > NON_EXPERT_SLIDER_MAX) {
                            slider.val(NON_EXPERT_SLIDER_MAX);
                        } else if (slider.val() < NON_EXPERT_SLIDER_MIN) {
                            slider.val(NON_EXPERT_SLIDER_MIN);
                        }
                    }
                }

                let sliderValue = isInt(slider.val()) ? parseInt(slider.val()) : parseFloat(slider.val());
                if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                    sliderValue = TuningSliders.scaleSliderValue(slider.val());
                }

                if (slider.is('#sliderGyroFilterMultiplier')) {
                    TuningSliders.sliderGyroFilterMultiplier = sliderValue;
                    self.calculateNewGyroFilters();
                    self.analyticsChanges['GyroFilterTuningSlider'] = "On";
                } else if (slider.is('#sliderDTermFilterMultiplier')) {
                    TuningSliders.sliderDTermFilterMultiplier = sliderValue;
                    self.calculateNewDTermFilters();
                    self.analyticsChanges['DTermFilterTuningSlider'] = "On";
                }
            });

            allFilterTuningSliders.each(function() {
               self.sliderOnScroll($(this));
            });

            // reset to middle with double click
            allFilterTuningSliders.dblclick(function() {
                const slider = $(this);
                slider.val(1);
                if (slider.is('#sliderGyroFilterMultiplier')) {
                    TuningSliders.sliderGyroFilterMultiplier = 1;
                    self.calculateNewGyroFilters();
                } else if (slider.is('#sliderDTermFilterMultiplier')) {
                    TuningSliders.sliderDTermFilterMultiplier = 1;
                    self.calculateNewDTermFilters();
                }
            });

            // update on filter value or type changes
            $('.pid_filter tr:not(.newFilter) input, .pid_filter tr:not(.newFilter) select').on('input', function(e) {
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                    // because legacy / firmware slider inputs for lowpass1 are duplicate the value isn't updated so set it here.
                    if (e.target.type === 'number') {
                        $(`.pid_filter input[name="${e.target.name}"]`).val(e.target.value);
                    } else if (e.target.type === 'select-one') {
                        $(`.pid_filter select[name="${e.target.name}"]`).val(e.target.value);
                    }
                } else {
                    TuningSliders.updateFilterSlidersDisplay();
                }

                if (TuningSliders.GyroSliderUnavailable) {
                    self.analyticsChanges['GyroFilterTuningSlider'] = "Off";
                }
                if (TuningSliders.DTermSliderUnavailable) {
                    self.analyticsChanges['DTermFilterTuningSlider'] = "Off";
                }
            });

            // update on filter switch changes
            $('.pid_filter tr:not(.newFilter) .inputSwitch input').change(() => {
                $('.pid_filter input').triggerHandler('input');
                self.setDirty(true);
            });

            $('.tuningHelp').hide();

            // LEGACY SLIDERS CODE
            if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                $('#dMinSwitch').change(function() {
                    TuningSliders.setDMinFeatureEnabled($(this).is(':checked'));
                    // switch dmin and dmax values on dmin on/off if sliders available
                    if (!TuningSliders.pidSlidersUnavailable) {
                        if (TuningSliders.dMinFeatureEnabled) {
                            FC.ADVANCED_TUNING.dMinRoll = FC.PIDS[0][2];
                            FC.ADVANCED_TUNING.dMinPitch = FC.PIDS[1][2];
                            FC.ADVANCED_TUNING.dMinYaw = FC.PIDS[2][2];
                        } else {
                            FC.PIDS[0][2] = FC.ADVANCED_TUNING.dMinRoll;
                            FC.PIDS[1][2] = FC.ADVANCED_TUNING.dMinPitch;
                            FC.PIDS[2][2] = FC.ADVANCED_TUNING.dMinYaw;
                        }
                        TuningSliders.calculateNewPids();
                    }
                });

                allPidTuningSliders.mouseup(function() {
                    // readjust dmin maximums
                    $('.pid_tuning .ROLL input[name="d"]').change();
                    $('.pid_tuning .PITCH input[name="d"]').change();
                    $('.pid_tuning .YAW input[name="d"]').change();
                });

                // enable PID sliders button (legacy)
                $('a.buttonPidTuningSliders').click(function() {
                    // if values were previously changed manually and then sliders are reactivated, reset pids to previous valid values if available, else default
                    TuningSliders.resetPidSliders();
                    TuningSliders.updatePidSlidersDisplay();

                    // disable integrated yaw when enabling sliders
                    if ($('input[id="useIntegratedYaw"]').is(':checked')) {
                        $('input[id="useIntegratedYaw"]').prop('checked', true).click();
                    }

                    self.analyticsChanges['PidTuningSliders'] = "On";
                });

                // enable Filter sliders button (legacy sliders)
                $('a.buttonFilterTuningSliders').click(function() {
                    if (TuningSliders.GyroSliderUnavailable) {
                        // update switchery dynamically based on defaults
                        $('input[id="gyroLowpassDynEnabled"]').prop('checked', false).click();
                        $('input[id="gyroLowpassEnabled"]').prop('checked', true).click();
                        $('input[id="gyroLowpass2Enabled"]').prop('checked', false).click();
                        TuningSliders.resetGyroFilterSlider();

                        self.analyticsChanges['GyroFilterTuningSlider'] = "On";
                    }
                    if (TuningSliders.DTermSliderUnavailable) {
                        $('input[id="dtermLowpassDynEnabled"]').prop('checked', false).click();
                        $('input[id="dtermLowpassEnabled"]').prop('checked', true).click();
                        $('input[id="dtermLowpass2Enabled"]').prop('checked', false).click();
                        TuningSliders.resetDTermFilterSlider();

                        self.analyticsChanges['DTermFilterTuningSlider'] = "On";
                    }
                });

                // update on pid table inputs
                $('#pid_main input').on('input', function() {
                    TuningSliders.updatePidSlidersDisplay();
                    self.analyticsChanges['PidTuningSliders'] = "Off";
                });
            }

        } else {
            // semver.lt API_VERSION_1_42
            $('.tuningPIDSliders').hide();
            $('.tuningFilterSliders').hide();
            $('.slidersDisabled').hide();
            $('.slidersWarning').hide();
            $('.nonExpertModeSlidersNote').hide();
            $('.tuningHelpSliders').hide();
        }

        $('#pid-tuning .delta select').change(function() {
            self.setDirty(true);
        });

        // update == save.
        $('a.update').click(function () {
            form_to_pid_and_rc();
            self.updating = true;

            MSP.promise(MSPCodes.MSP_SET_PID, mspHelper.crunch(MSPCodes.MSP_SET_PID))
            .then(() => MSP.promise(MSPCodes.MSP_SET_PID_ADVANCED, mspHelper.crunch(MSPCodes.MSP_SET_PID_ADVANCED)))
            .then(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) ? MSP.promise(MSPCodes.MSP2_SET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSPCodes.PID_PROFILE_NAME)) : true)
            .then(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) ? MSP.promise(MSPCodes.MSP2_SET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSPCodes.RATE_PROFILE_NAME)) : true)
            .then(() => {
                self.updatePIDColors();
                return MSP.promise(MSPCodes.MSP_SET_FILTER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FILTER_CONFIG));
            })
            .then(() => MSP.promise(MSPCodes.MSP_SET_RC_TUNING, mspHelper.crunch(MSPCodes.MSP_SET_RC_TUNING)))
            .then(() => MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG)))
            .then(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44) ? MSP.promise(MSPCodes.MSP_SET_SIMPLIFIED_TUNING, mspHelper.crunch(MSPCodes.MSP_SET_SIMPLIFIED_TUNING)) : true)
            .then(() => MSP.promise(MSPCodes.MSP_EEPROM_WRITE))
            .then(() => {
                self.updating = false;

                self.setDirty(false);

                gui_log(i18n.getMessage('pidTuningEepromSaved'));

                self.refresh();
            });

            tracking.sendSaveAndChangeEvents(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, self.analyticsChanges, 'pid_tuning');
            self.analyticsChanges = {};
        });

        // Setup model for rates preview
        self.initRatesPreview();
        self.renderModel();

        self.updating = false;

        // enable RC data pulling for rates preview
        GUI.interval_add('receiver_pull', self.getReceiverData, 250, true);

        // status data pulled via separate timer with static speed
        GUI.interval_add('update_profile', function update_profile() {
            self.checkUpdateProfile(true);
        }, 500, true);

        self.analyticsChanges = {};

        GUI.content_ready(callback);
        TABS.pid_tuning.isHtmlProcessing = false;
    }
};

pid_tuning.getReceiverData = function () {
    MSP.send_message(MSPCodes.MSP_RC, false, false);
};

pid_tuning.initRatesPreview = function () {
    this.keepRendering = true;
    this.model = new Model($('.rates_preview'), $('.rates_preview canvas'));

    $('.tab-pid_tuning .tab-container .rates').on('click', $.proxy(this.model.resize, this.model));
    $('.tab-pid_tuning .tab-container .rates').on('click', $.proxy(this.updateRatesLabels, this));

    $(window).on('resize', $.proxy(this.model.resize, this.model));
    $(window).on('resize', $.proxy(this.updateRatesLabels, this));
};

pid_tuning.renderModel = function () {
    if (!this.keepRendering) {
        return;
    }
    requestAnimationFrame(this.renderModel.bind(this));

    if (!this.clock) { this.clock = new THREE.Clock(); }

    if (FC.RC.channels[0] && FC.RC.channels[1] && FC.RC.channels[2]) {
        const delta = this.clock.getDelta();

        const roll = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(
            FC.RC.channels[0],
            this.currentRates.roll_rate,
            this.currentRates.rc_rate,
            this.currentRates.rc_expo,
            this.currentRates.superexpo,
            this.currentRates.deadband,
            this.currentRates.roll_rate_limit,
        );
        const pitch = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(
            FC.RC.channels[1],
            this.currentRates.pitch_rate,
            this.currentRates.rc_rate_pitch,
            this.currentRates.rc_pitch_expo,
            this.currentRates.superexpo,
            this.currentRates.deadband,
            this.currentRates.pitch_rate_limit,
        );
        const yaw = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(
            FC.RC.channels[2],
            this.currentRates.yaw_rate,
            this.currentRates.rc_rate_yaw,
            this.currentRates.rc_yaw_expo,
            this.currentRates.superexpo,
            this.currentRates.yawDeadband,
            this.currentRates.yaw_rate_limit,
        );

        this.model.rotateBy(-degToRad(pitch), -degToRad(yaw), -degToRad(roll));

        if (this.checkRC()) this.updateRatesLabels(); // has the RC data changed ?

    }
};

pid_tuning.cleanup = function (callback) {
    const self = this;

    self.keepRendering = false;

    if (self.model) {
        $(window).off('resize', $.proxy(self.model.resize, self.model));
        self.model.dispose();
    }

    $(window).off('resize', $.proxy(this.updateRatesLabels, this));

    if (self.throttleDrawInterval) {
        clearInterval(self.throttleDrawInterval);
    }

    if (callback) callback();
};

pid_tuning.refresh = function (callback) {
    const self = this;

    GUI.tab_switch_cleanup(function () {
        self.initialize();

        self.setDirty(false);

        if (callback) {
            callback();
        }
    });
};

pid_tuning.setProfile = function () {
    const self = this;

    self.currentProfile = FC.CONFIG.profile;
    $('.tab-pid_tuning select[name="profile"]').val(self.currentProfile);
};

pid_tuning.setRateProfile = function () {
    const self = this;

    self.currentRateProfile = FC.CONFIG.rateProfile;
    $('.tab-pid_tuning select[name="rate_profile"]').val(self.currentRateProfile);
};

pid_tuning.setDirty = function (isDirty) {
    const self = this;

    self.dirty = isDirty;
    $('.tab-pid_tuning select[name="profile"]').prop('disabled', isDirty);
    $('.tab-pid_tuning select[name="rate_profile"]').prop('disabled', isDirty);
};

pid_tuning.checkUpdateProfile = function (updateRateProfile) {
    const self = this;

    if (GUI.active_tab === 'pid_tuning') {

        if (!self.updating && !self.dirty) {
            let changedProfile = false;
            if (self.currentProfile !== FC.CONFIG.profile) {
                self.setProfile();

                changedProfile = true;
            }

            let changedRateProfile = false;
            if (updateRateProfile && self.currentRateProfile !== FC.CONFIG.rateProfile) {
                self.setRateProfile();

                changedRateProfile = true;
            }

            if (changedProfile || changedRateProfile) {
                self.updating = true;
                self.refresh(function () {
                    self.updating = false;
                    if (changedProfile) {
                        gui_log(i18n.getMessage('pidTuningReceivedProfile', [FC.CONFIG.profile + 1]));
                        FC.CONFIG.profile = self.currentProfile;
                    }

                    if (changedRateProfile) {
                        gui_log(i18n.getMessage('pidTuningReceivedRateProfile', [FC.CONFIG.rateProfile + 1]));
                        FC.CONFIG.rateProfile = self.currentRateProfile;
                    }
                });
            }
        }
    }
};

pid_tuning.checkRC = function() {
    // Function monitors for change in the primary axes rc received data and returns true if a change is detected.

    if (!this.oldRC) { this.oldRC = [FC.RC.channels[0], FC.RC.channels[1], FC.RC.channels[2]]; }

    // Monitor FC.RC.channels and detect change of value;
    let rateCurveUpdateRequired = false;
    for (let i = 0; i < this.oldRC.length; i++) { // has the value changed ?
        if (this.oldRC[i] !== FC.RC.channels[i]) {
            this.oldRC[i] = FC.RC.channels[i];
            rateCurveUpdateRequired = true;     // yes, then an update of the values displayed on the rate curve graph is required
        }
    }
    return rateCurveUpdateRequired;
};

pid_tuning.checkThrottle = function() {
    // Function monitors for change in the received rc throttle data and returns true if a change is detected.
    if (!this.oldThrottle) {
        this.oldThrottle = FC.RC.channels[3];
        return true;
    }
    const updateRequired = this.oldThrottle !== FC.RC.channels[3];
    this.oldThrottle = FC.RC.channels[3];
    return updateRequired;
};

pid_tuning.updatePidControllerParameters = function () {
    $('.pid_tuning .YAW_JUMP_PREVENTION').hide();
    $('#pid-tuning .dtermSetpointTransition').hide();
    $('#pid-tuning .dtermSetpoint').hide();
    $('#pid-tuning .delta').hide();
};

pid_tuning.updateRatesLabels = function() {
    const self = this;
    if (!self.rateCurve.useLegacyCurve && self.rateCurve.maxAngularVel) {

        const drawAxisLabel = function(context, axisLabel, x, y, align, color) {

            context.fillStyle = color || '#000000' ;
            context.textAlign = align || 'center';
            context.fillText(axisLabel, x, y);
        };

        const drawBalloonLabel = function(context, axisLabel, x, y, align, colors, dirty) {

            /**
             * curveContext is the canvas to draw on
             * axisLabel is the string to display in the center of the balloon
             * x, y are the coordinates of the point of the balloon
             * align is whether the balloon appears to the left (align 'right') or right (align left) of the x,y coordinates
             * colors is an object defining color, border and text are the fill color, border color and text color of the balloon
             */

            const DEFAULT_OFFSET        = 125; // in canvas scale; this is the horizontal length of the pointer
            const DEFAULT_RADIUS        = 10; // in canvas scale, this is the radius around the balloon
            const DEFAULT_MARGIN        = 5;  // in canvas scale, this is the margin around the balloon when it overlaps

            const fontSize = parseInt(context.font);

            // calculate the width and height required for the balloon
            const width = (context.measureText(axisLabel).width * 1.2);
            const height = fontSize * 1.5; // the balloon is bigger than the text height
            const pointerY = y; // always point to the required Y
            // coordinate, even if we move the balloon itself to keep it on the canvas

            // setup balloon background
            context.fillStyle   = colors.color   || '#ffffff' ;
            context.strokeStyle = colors.border  || '#000000' ;

            // correct x position to account for window scaling
            x *= context.canvas.clientWidth/context.canvas.clientHeight;

            // adjust the coordinates for determine where the balloon background should be drawn
            x += ((align=='right') ? -(width + DEFAULT_OFFSET) : 0) + ((align=='left') ? DEFAULT_OFFSET : 0);
            y -= (height / 2); if (y < 0) y = 0; else if (y > context.height) y = context.height; // prevent balloon from going out of canvas

            // check that the balloon does not already overlap
            for (let i = 0; i < dirty.length; i++) {
                if ((x >= dirty[i].left && x <= dirty[i].right) || (x + width >= dirty[i].left && x + width <= dirty[i].right)) { // does it overlap horizontally
                    if ((y >= dirty[i].top && y<= dirty[i].bottom) || (y + height >= dirty[i].top && y + height <= dirty[i].bottom )) { // this overlaps another balloon
                        // snap above or snap below
                        if (y <= (dirty[i].bottom - dirty[i].top) / 2 && (dirty[i].top - height) > 0) {
                            y = dirty[i].top - height;
                        } else { // snap down
                            y = dirty[i].bottom;
                        }
                    }
                }
            }

            // Add the draw area to the dirty array
            dirty.push({left:x, right:x+width, top:y-DEFAULT_MARGIN, bottom:y+height+DEFAULT_MARGIN});


            const pointerLength =  (height - 2 * DEFAULT_RADIUS ) / 6;

            context.beginPath();
            context.moveTo(x + DEFAULT_RADIUS, y);
            context.lineTo(x + width - DEFAULT_RADIUS, y);
            context.quadraticCurveTo(x + width, y, x + width, y + DEFAULT_RADIUS);

            if (align === 'right') { // point is to the right
                context.lineTo(x + width, y + DEFAULT_RADIUS + pointerLength);
                context.lineTo(x + width + DEFAULT_OFFSET, pointerY);  // point
                context.lineTo(x + width, y + height - DEFAULT_RADIUS - pointerLength);
            }
            context.lineTo(x + width, y + height - DEFAULT_RADIUS);

            context.quadraticCurveTo(x + width, y + height, x + width - DEFAULT_RADIUS, y + height);
            context.lineTo(x + DEFAULT_RADIUS, y + height);
            context.quadraticCurveTo(x, y + height, x, y + height - DEFAULT_RADIUS);

            if (align === 'left') { // point is to the left
                context.lineTo(x, y + height - DEFAULT_RADIUS - pointerLength);
                context.lineTo(x - DEFAULT_OFFSET, pointerY); // point
                context.lineTo(x, y + DEFAULT_RADIUS - pointerLength);
            }
            context.lineTo(x, y + DEFAULT_RADIUS);

            context.quadraticCurveTo(x, y, x + DEFAULT_RADIUS, y);
            context.closePath();

            // fill in the balloon background
            context.fill();
            context.stroke();

            // and add the label
            drawAxisLabel(context, axisLabel, x + (width/2), y + (height + fontSize)/2 - 4, 'center', colors.text);

        };

        const BALLOON_COLORS = {
            roll    : {color: 'rgba(255,128,128,0.4)', border: 'rgba(255,128,128,0.6)', text: '#000000'},
            pitch   : {color: 'rgba(128,255,128,0.4)', border: 'rgba(128,255,128,0.6)', text: '#000000'},
            yaw     : {color: 'rgba(128,128,255,0.4)', border: 'rgba(128,128,255,0.6)', text: '#000000'},
        };

        const rcStickElement = $('.rate_curve canvas#rate_curve_layer1').get(0);
        if (rcStickElement) {
            rcStickElement.width = 1000;
            rcStickElement.height = 1000;

            const stickContext = rcStickElement.getContext("2d");

            stickContext.save();

            const maxAngularVelRoll   = `${self.maxAngularVelRollElement.text()} deg/s`;
            const maxAngularVelPitch  = `${self.maxAngularVelPitchElement.text()} deg/s`;
            const maxAngularVelYaw    = `${self.maxAngularVelYawElement.text()} deg/s`;
            let currentValues         = [];
            let balloonsDirty         = [];
            const curveHeight         = rcStickElement.height;
            const curveWidth          = rcStickElement.width;
            const maxAngularVel       = self.rateCurve.maxAngularVel;
            const windowScale         = (400 / stickContext.canvas.clientHeight);
            const rateScale           = (curveHeight / 2) / maxAngularVel;
            const lineScale           = stickContext.canvas.width / stickContext.canvas.clientWidth;
            const textScale           = stickContext.canvas.clientHeight / stickContext.canvas.clientWidth;

            stickContext.clearRect(0, 0, curveWidth, curveHeight);

            // calculate the fontSize based upon window scaling
            if (windowScale <= 1) {
                stickContext.font = "24pt Verdana, Arial, sans-serif";
            } else {
                stickContext.font = `${24 * windowScale}pt Verdana, Arial, sans-serif`;
            }

            if (FC.RC.channels[0] && FC.RC.channels[1] && FC.RC.channels[2]) {
                currentValues.push(`${self.rateCurve.drawStickPosition(FC.RC.channels[0], self.currentRates.roll_rate, self.currentRates.rc_rate, self.currentRates.rc_expo, self.currentRates.superexpo, self.currentRates.deadband, self.currentRates.roll_rate_limit, maxAngularVel, stickContext, '#FF8080')} deg/s`);
                currentValues.push(`${self.rateCurve.drawStickPosition(FC.RC.channels[1], self.currentRates.pitch_rate, self.currentRates.rc_rate_pitch, self.currentRates.rc_pitch_expo, self.currentRates.superexpo, self.currentRates.deadband, self.currentRates.pitch_rate_limit, maxAngularVel, stickContext, '#80FF80')} deg/s`);
                currentValues.push(`${self.rateCurve.drawStickPosition(FC.RC.channels[2], self.currentRates.yaw_rate, self.currentRates.rc_rate_yaw, self.currentRates.rc_yaw_expo, self.currentRates.superexpo, self.currentRates.yawDeadband, self.currentRates.yaw_rate_limit, maxAngularVel, stickContext, '#8080FF')} deg/s`);
            } else {
                currentValues = [];
            }

            stickContext.lineWidth = lineScale;

            // use a custom scale so that the text does not appear stretched
            stickContext.scale(textScale, 1);

            // add the maximum range label
            drawAxisLabel(stickContext, `${maxAngularVel.toFixed(0)} deg/s`, ((curveWidth / 2) - 10) / textScale, parseInt(stickContext.font)*1.2, 'right');

            // and then the balloon labels.
            balloonsDirty = []; // reset the dirty balloon draw area (for overlap detection)
            // create an array of balloons to draw
            const balloons = [
                {value: parseInt(maxAngularVelRoll), balloon: function() {drawBalloonLabel(stickContext, maxAngularVelRoll, curveWidth, rateScale * (maxAngularVel - parseInt(maxAngularVelRoll)), 'right', BALLOON_COLORS.roll, balloonsDirty);}},
                {value: parseInt(maxAngularVelPitch), balloon: function() {drawBalloonLabel(stickContext, maxAngularVelPitch, curveWidth, rateScale * (maxAngularVel - parseInt(maxAngularVelPitch)), 'right', BALLOON_COLORS.pitch, balloonsDirty);}},
                {value: parseInt(maxAngularVelYaw), balloon: function() {drawBalloonLabel(stickContext, maxAngularVelYaw, curveWidth, rateScale * (maxAngularVel - parseInt(maxAngularVelYaw)), 'right', BALLOON_COLORS.yaw, balloonsDirty);}},
            ];
            // show warning message if any axis angular velocity exceeds 1800d/s
            const MAX_RATE_WARNING = 1800;
            const warningRates = (parseInt(maxAngularVelRoll) > MAX_RATE_WARNING || parseInt(maxAngularVelPitch) > MAX_RATE_WARNING
                || parseInt(maxAngularVelYaw) > MAX_RATE_WARNING);
            $('.maxRateWarning').toggle(warningRates);

            // and sort them in descending order so the largest value is at the top always
            balloons.sort(function(a,b) {return (b.value - a.value);});

            // add the current rc values
            if (currentValues[0] && currentValues[1] && currentValues[2]) {
                balloons.push(
                    {value: parseInt(currentValues[0]), balloon: function() {drawBalloonLabel(stickContext, currentValues[0], 10, 150, 'none', BALLOON_COLORS.roll, balloonsDirty);}},
                    {value: parseInt(currentValues[1]), balloon: function() {drawBalloonLabel(stickContext, currentValues[1], 10, 250, 'none', BALLOON_COLORS.pitch, balloonsDirty);}},
                    {value: parseInt(currentValues[2]), balloon: function() {drawBalloonLabel(stickContext, currentValues[2], 10, 350, 'none', BALLOON_COLORS.yaw, balloonsDirty);}},
                );
            }
            // then display them on the chart
            for (const balloon of balloons) {
                balloon.balloon();
            }

            stickContext.restore();
        }
    }
};

pid_tuning.calculateNewPids = function() {
    if (!TABS.pid_tuning.isHtmlProcessing) {
        TuningSliders.calculateNewPids();
    }
};

pid_tuning.calculateNewGyroFilters = function() {
    if (!TABS.pid_tuning.isHtmlProcessing) {
        if (TuningSliders.sliderGyroFilter) {
            TuningSliders.calculateNewGyroFilters();
        }
    }
};

pid_tuning.calculateNewDTermFilters = function() {
    if (!TABS.pid_tuning.isHtmlProcessing) {
        if (TuningSliders.sliderDTermFilter) {
            TuningSliders.calculateNewDTermFilters();
        }
    }
};

pid_tuning.updateFilterWarning = function() {
    const gyroLowpassFilterMode = parseInt($('.pid_filter select[name="gyroLowpassFilterMode"]').val());
    const gyroDynamicLowpassEnabled = gyroLowpassFilterMode === 1;
    const gyroLowpass1Enabled = !gyroLowpassFilterMode;
    const dtermLowpassFilterMode = parseInt($('.pid_filter select[name="dtermLowpassFilterMode"]').val());
    const dtermDynamicLowpassEnabled = dtermLowpassFilterMode === 1;
    const dtermLowpass1Enabled = !dtermLowpassFilterMode;
    const warningE = $('#pid-tuning .filterWarning');
    const warningDynamicNotchE = $('#pid-tuning .dynamicNotchWarning');
    const warningDynamicNotchNyquistE = $('#pid-tuning .dynamicNotchNyquistWarningNote');

    warningE.toggle(!(gyroDynamicLowpassEnabled || gyroLowpass1Enabled) || !(dtermDynamicLowpassEnabled || dtermLowpass1Enabled));
    warningDynamicNotchNyquistE.toggle(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44) && (FC.CONFIG.sampleRateHz / FC.PID_ADVANCED_CONFIG.pid_process_denom < 2000));
    warningDynamicNotchE.toggle(FC.FEATURE_CONFIG.features.isEnabled('DYNAMIC_FILTER') && (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42) && semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)));
};

pid_tuning.updatePIDColors = function(clear = false) {
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        return;
    }

    const setTuningElementColor = function(element, mspValue, currentValue) {
        if (clear) {
            element.css({ "background-color": "transparent" });
            return;
        }

        if (currentValue === undefined || mspValue === undefined) {
            return;
        }

        const change = (currentValue - mspValue) / 50;
        element.css({ "background-color": getColorForPercentage(change, colorTables.pidSlider) });
    };

    FC.PID_NAMES.forEach(function(elementPid, indexPid) {
        $(`.pid_tuning .${elementPid} input`).each(function(indexInput) {
            setTuningElementColor($(this), FC.PIDS_ACTIVE[indexPid][indexInput], FC.PIDS[indexPid][indexInput]);
        });
    });

    setTuningElementColor($('.pid_tuning input[name="dMinRoll"]'), FC.ADVANCED_TUNING_ACTIVE.dMinRoll, FC.ADVANCED_TUNING.dMinRoll);
    setTuningElementColor($('.pid_tuning input[name="dMinPitch"]'), FC.ADVANCED_TUNING_ACTIVE.dMinPitch, FC.ADVANCED_TUNING.dMinPitch);
    setTuningElementColor($('.pid_tuning input[name="dMinYaw"]'), FC.ADVANCED_TUNING_ACTIVE.dMinYaw, FC.ADVANCED_TUNING.dMinYaw);
    setTuningElementColor($('.pid_tuning .ROLL input[name="f"]'), FC.ADVANCED_TUNING_ACTIVE.feedforwardRoll, FC.ADVANCED_TUNING.feedforwardRoll);
    setTuningElementColor($('.pid_tuning .PITCH input[name="f"]'), FC.ADVANCED_TUNING_ACTIVE.feedforwardPitch, FC.ADVANCED_TUNING.feedforwardPitch);
    setTuningElementColor($('.pid_tuning .YAW input[name="f"]'), FC.ADVANCED_TUNING_ACTIVE.feedforwardYaw, FC.ADVANCED_TUNING.feedforwardYaw);
};

pid_tuning.changeRatesType = function(rateTypeID) {
    const self = this;
    const dialogRatesType = $('.dialogRatesType')[0];

    if (self.previousRatesType == null) {
        self.currentRatesType = rateTypeID;
        self.changeRatesTypeLogo();
        self.changeRatesSystem(true);
        self.previousRatesType = self.currentRatesType;
        return;
    }

    if (!dialogRatesType.hasAttribute('open')) {
        dialogRatesType.showModal();

        $('.dialogRatesType-cancelbtn').click(function() {
            $('.rates_type select[id="ratesType"]').val(self.currentRatesType);
            self.previousRatesType = self.currentRatesType;
            dialogRatesType.close();
        });

        $('.dialogRatesType-confirmbtn').click(function() {
            self.currentRatesType = rateTypeID;
            self.changeRatesTypeLogo();
            self.changeRatesSystem(false);
            self.previousRatesType = self.currentRatesType;
            dialogRatesType.close();

            FC.RC_TUNING.rates_type = self.currentRatesType;
            self.currentRates = self.rateCurve.getCurrentRates();

        });
    }

};

pid_tuning.changeRatesSystem = function(sameType) {
    const self = this;

    let rcRateMax = 2.55, rcRateMin = 0.01, rcRateStep = 0.01;
    let rateMax = 1.0, rateStep = 0.01;
    let expoMax = 1.0, expoStep = 0.01;
    let rateMin = 0;
    const expoMin = 0;

    const pitch_rate_e = $('.pid_tuning input[name="pitch_rate"]');
    const roll_rate_e = $('.pid_tuning input[name="roll_rate"]');
    const yaw_rate_e = $('.pid_tuning input[name="yaw_rate"]');
    const rc_rate_pitch_e = $('.pid_tuning input[name="rc_rate_pitch"]');
    const rc_rate_e = $('.pid_tuning input[name="rc_rate"]');
    const rc_rate_yaw_e = $('.pid_tuning input[name="rc_rate_yaw"]');
    const rc_pitch_expo_e = $('.pid_tuning input[name="rc_pitch_expo"]');
    const rc_expo_e = $('.pid_tuning input[name="rc_expo"]');
    const rc_yaw_expo_e = $('.pid_tuning input[name="rc_yaw_expo"]');

    const rcRateLabel = $('#pid-tuning .pid_titlebar .rc_rate');
    const rateLabel = $('#pid-tuning .pid_titlebar .rate');
    const rcExpoLabel = $('#pid-tuning .pid_titlebar .rc_expo');

    // default values for betaflight curve. all the default values produce the same betaflight default curve (or at least near enough)
    let rcRateDefault = (1).toFixed(2), rateDefault = (0.7).toFixed(2), expoDefault = (0).toFixed(2);

    if (sameType) { // if selected rates type is different from the saved one, set values to default instead of reading
        pitch_rate_e.val(FC.RC_TUNING.pitch_rate.toFixed(2));
        roll_rate_e.val(FC.RC_TUNING.roll_rate.toFixed(2));
        yaw_rate_e.val(FC.RC_TUNING.yaw_rate.toFixed(2));
        rc_rate_pitch_e.val(FC.RC_TUNING.rcPitchRate.toFixed(2));
        rc_rate_e.val(FC.RC_TUNING.RC_RATE.toFixed(2));
        rc_rate_yaw_e.val(FC.RC_TUNING.rcYawRate.toFixed(2));
        rc_pitch_expo_e.val(FC.RC_TUNING.RC_PITCH_EXPO.toFixed(2));
        rc_expo_e.val(FC.RC_TUNING.RC_EXPO.toFixed(2));
        rc_yaw_expo_e.val(FC.RC_TUNING.RC_YAW_EXPO.toFixed(2));
    }

    switch (self.currentRatesType) {
        case FC.RATES_TYPE.RACEFLIGHT:
            rcRateLabel.text(i18n.getMessage("pidTuningRcRateRaceflight"));
            rateLabel.text(i18n.getMessage("pidTuningRateRaceflight"));
            rcExpoLabel.text(i18n.getMessage("pidTuningRcExpoRaceflight"));

            rcRateMax = 2000;
            rcRateMin = 10;
            rcRateStep = 10;
            rateMax = 255;
            rateStep = 1;
            expoMax = 100;
            expoStep = 1;

            if (sameType) {
                pitch_rate_e.val((FC.RC_TUNING.pitch_rate * 100).toFixed(0));
                roll_rate_e.val((FC.RC_TUNING.roll_rate * 100).toFixed(0));
                yaw_rate_e.val((FC.RC_TUNING.yaw_rate * 100).toFixed(0));
                rc_rate_pitch_e.val((FC.RC_TUNING.rcPitchRate * 1000).toFixed(0));
                rc_rate_e.val((FC.RC_TUNING.RC_RATE * 1000).toFixed(0));
                rc_rate_yaw_e.val((FC.RC_TUNING.rcYawRate * 1000).toFixed(0));
                rc_pitch_expo_e.val((FC.RC_TUNING.RC_PITCH_EXPO * 100).toFixed(0));
                rc_expo_e.val((FC.RC_TUNING.RC_EXPO * 100).toFixed(0));
                rc_yaw_expo_e.val((FC.RC_TUNING.RC_YAW_EXPO * 100).toFixed(0));
            } else {
                rcRateDefault = (370).toFixed(0);
                rateDefault = (80).toFixed(0);
                expoDefault = (50).toFixed(0);
            }

            break;

        case FC.RATES_TYPE.KISS:
            rcRateLabel.text(i18n.getMessage("pidTuningRcRate"));
            rateLabel.text(i18n.getMessage("pidTuningRcRateRaceflight"));
            rcExpoLabel.text(i18n.getMessage("pidTuningRcExpoKISS"));

            rateMax = 0.99;

            break;

        case FC.RATES_TYPE.ACTUAL:
            rcRateLabel.text(i18n.getMessage("pidTuningRcRateActual"));
            rateLabel.text(i18n.getMessage("pidTuningRateQuickRates"));
            rcExpoLabel.text(i18n.getMessage("pidTuningRcExpoRaceflight"));

            rateMin = 10;
            rateMax = 2000;
            rateStep = 10;
            rcRateMax = 2000;
            rcRateMin = 10;
            rcRateStep = 10;

            if (sameType) {
                pitch_rate_e.val((FC.RC_TUNING.pitch_rate * 1000).toFixed(0));
                roll_rate_e.val((FC.RC_TUNING.roll_rate * 1000).toFixed(0));
                yaw_rate_e.val((FC.RC_TUNING.yaw_rate * 1000).toFixed(0));
                rc_rate_pitch_e.val((FC.RC_TUNING.rcPitchRate * 1000).toFixed(0));
                rc_rate_e.val((FC.RC_TUNING.RC_RATE * 1000).toFixed(0));
                rc_rate_yaw_e.val((FC.RC_TUNING.rcYawRate * 1000).toFixed(0));
            } else if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                rcRateDefault = (70).toFixed(0);
                rateDefault = (670).toFixed(0);
                expoDefault = (0).toFixed(2);
            } else {
                rcRateDefault = (200).toFixed(0);
                rateDefault = (670).toFixed(0);
                expoDefault = (0.54).toFixed(2);
            }

            break;

        case FC.RATES_TYPE.QUICKRATES:
            rcRateLabel.text(i18n.getMessage("pidTuningRcRate"));
            rateLabel.text(i18n.getMessage("pidTuningRateQuickRates"));
            rcExpoLabel.text(i18n.getMessage("pidTuningRcExpoRaceflight"));

            rateMin = 10;
            rateMax = 2000;
            rateStep = 10;

            if (sameType) {
                pitch_rate_e.val((FC.RC_TUNING.pitch_rate * 1000).toFixed(0));
                roll_rate_e.val((FC.RC_TUNING.roll_rate * 1000).toFixed(0));
                yaw_rate_e.val((FC.RC_TUNING.yaw_rate * 1000).toFixed(0));
            } else {
                rateDefault = (670).toFixed(0);
            }

            break;

        // add future rates types here
        default: // BetaFlight
            rcRateLabel.text(i18n.getMessage("pidTuningRcRate"));
            rateLabel.text(i18n.getMessage("pidTuningRate"));
            rcExpoLabel.text(i18n.getMessage("pidTuningRcExpo"));

            break;
    }

    const rc_rate_input_c = $('#pid-tuning input[class="rc_rate_input"]');
    const rate_input_c = $('#pid-tuning input[class="rate_input"]');
    const expo_input_c = $('#pid-tuning input[class="expo_input"]');

    if (!sameType) {
        rate_input_c.val(rateDefault);
        rc_rate_input_c.val(rcRateDefault);
        expo_input_c.val(expoDefault);
    }

    rc_rate_input_c.attr({"max":rcRateMax, "min":rcRateMin, "step":rcRateStep}).change();
    rate_input_c.attr({"max":rateMax, "min":rateMin, "step":rateStep}).change();
    expo_input_c.attr({"max":expoMax, "min":expoMin, "step":expoStep}).change();

    if (sameType) {
        self.setDirty(false);
    }
};

pid_tuning.changeRatesTypeLogo = function() {
    const self = this;

    const ratesLogoElement = $('.rates_type img[id="ratesLogo"]');

    switch (self.currentRatesType) {
        case FC.RATES_TYPE.RACEFLIGHT:
            ratesLogoElement.attr("src", "./images/rate_logos/raceflight.svg");

            break;

        case FC.RATES_TYPE.KISS:
            ratesLogoElement.attr("src", "./images/rate_logos/kiss.svg");

            break;

        case FC.RATES_TYPE.ACTUAL:
            ratesLogoElement.attr("src", "./images/rate_logos/actual.svg");

            break;

        case FC.RATES_TYPE.QUICKRATES:
            ratesLogoElement.attr("src", "./images/rate_logos/quickrates.svg");

            break;

        // add future rates types here
        default: // BetaFlight
            ratesLogoElement.attr("src", "./images/rate_logos/betaflight.svg");

            break;
    }
};


pid_tuning.expertModeChanged = function(expertModeEnabled) {
    TuningSliders.setExpertMode(expertModeEnabled);
};

pid_tuning.sliderOnScroll = function(slider, e) {
    slider.parent().on('input wheel', function(e) {
        if (slider.prop('disabled')) {
            return;
        }

        if (!(e.originalEvent?.deltaY && e.originalEvent?.altKey)) {
            return;
        }

        e.preventDefault();

        const step = parseFloat(slider.attr('step'));
        const delta = e.originalEvent.deltaY > 0 ? -step : step;
        const preScrollSliderValue = isInt(slider.val()) ? parseInt(slider.val()) : parseFloat(slider.val());
        const sliderValue =  (Math.floor(preScrollSliderValue * 100) + Math.floor(delta * 100)) / 100;

        slider.val(sliderValue);
        slider.trigger('input');
        slider.trigger('change');
    });
};

TABS.pid_tuning = pid_tuning;
export {
    pid_tuning,
};
