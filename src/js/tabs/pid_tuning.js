'use strict';

TABS.pid_tuning = {
    RATE_PROFILE_MASK: 128,
    showAllPids: false,
    updating: true,
    dirty: false,
    currentProfile: null,
    currentRateProfile: null,
    SETPOINT_WEIGHT_RANGE_LOW: 2.55,
    SETPOINT_WEIGHT_RANGE_HIGH: 20,
    SETPOINT_WEIGHT_RANGE_LEGACY: 2.54,
    activeSubtab: 'pid',
};

TABS.pid_tuning.initialize = function (callback) {

    var self = this;

    if (GUI.active_tab !== 'pid_tuning') {
        GUI.active_tab = 'pid_tuning';
        self.activeSubtab = 'pid';
    }

    // Update filtering defaults based on API version
    var FILTER_DEFAULT = FC.getFilterDefaults();

    // requesting MSP_STATUS manually because it contains CONFIG.profile
    MSP.promise(MSPCodes.MSP_STATUS).then(function() {
        if (semver.gte(CONFIG.apiVersion, CONFIGURATOR.pidControllerChangeMinApiVersion)) {
            return MSP.promise(MSPCodes.MSP_PID_CONTROLLER);
        }
    }).then(function() {
        return MSP.promise(MSPCodes.MSP_PIDNAMES)
    }).then(function() {
        return MSP.promise(MSPCodes.MSP_PID);
    }).then(function() {
        if (semver.gte(CONFIG.apiVersion, "1.16.0")) {
          return MSP.promise(MSPCodes.MSP_PID_ADVANCED);
        }
    }).then(function() {
        return MSP.promise(MSPCodes.MSP_RC_TUNING);
    }).then(function() {
        return MSP.promise(MSPCodes.MSP_FILTER_CONFIG);
    }).then(function() {
        return MSP.promise(MSPCodes.MSP_RC_DEADBAND);
    }).then(function() {
        return MSP.promise(MSPCodes.MSP_MOTOR_CONFIG);
    }).then(function() {
        MSP.send_message(MSPCodes.MSP_MIXER_CONFIG, false, false, load_html);
    });

    function load_html() {
        $('#content').load("./tabs/pid_tuning.html", process_html);        
    }

    function pid_and_rc_to_form() {
        self.setProfile();
        if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
            self.setRateProfile();
        }

        // Fill in the data from PIDs array

        // For each pid name
        PID_names.forEach(function(elementPid, indexPid) {

            // Look into the PID table to a row with the name of the pid
            var searchRow = $('.pid_tuning .' + elementPid + ' input');

            // Assign each value
            searchRow.each(function (indexInput) {
                if (PIDs[indexPid][indexInput] !== undefined) {
                    $(this).val(PIDs[indexPid][indexInput]);
                }
            });
        });

        // Fill in data from RC_tuning object
        $('.pid_tuning input[name="rc_rate"]').val(RC_tuning.RC_RATE.toFixed(2));
        $('.pid_tuning input[name="roll_pitch_rate"]').val(RC_tuning.roll_pitch_rate.toFixed(2));
        $('.pid_tuning input[name="roll_rate"]').val(RC_tuning.roll_rate.toFixed(2));
        $('.pid_tuning input[name="pitch_rate"]').val(RC_tuning.pitch_rate.toFixed(2));
        $('.pid_tuning input[name="yaw_rate"]').val(RC_tuning.yaw_rate.toFixed(2));
        $('.pid_tuning input[name="rc_expo"]').val(RC_tuning.RC_EXPO.toFixed(2));
        $('.pid_tuning input[name="rc_yaw_expo"]').val(RC_tuning.RC_YAW_EXPO.toFixed(2));

        $('.throttle input[name="mid"]').val(RC_tuning.throttle_MID.toFixed(2));
        $('.throttle input[name="expo"]').val(RC_tuning.throttle_EXPO.toFixed(2));

        $('.tpa input[name="tpa"]').val(RC_tuning.dynamic_THR_PID.toFixed(2));
        $('.tpa input[name="tpa-breakpoint"]').val(RC_tuning.dynamic_THR_breakpoint);

        if (semver.lt(CONFIG.apiVersion, "1.10.0")) {
            $('.pid_tuning input[name="rc_yaw_expo"]').hide();
            $('.pid_tuning input[name="rc_expo"]').attr("rowspan", "3");
        }

        if (semver.gte(CONFIG.apiVersion, "1.16.0")) {
            $('input[id="vbatpidcompensation"]').prop('checked', ADVANCED_TUNING.vbatPidCompensation !== 0);
        }

        if (semver.gte(CONFIG.apiVersion, "1.16.0")) {
            $('#pid-tuning .delta select').val(ADVANCED_TUNING.deltaMethod);
        }

        if (semver.gte(CONFIG.apiVersion, "1.16.0")) {
            $('.pid_tuning input[name="rc_rate_yaw"]').val(RC_tuning.rcYawRate.toFixed(2));
            $('.pid_filter input[name="gyroLowpassFrequency"]').val(FILTER_CONFIG.gyro_lowpass_hz);
            $('.pid_filter input[name="dtermLowpassFrequency"]').val(FILTER_CONFIG.dterm_lowpass_hz);
            $('.pid_filter input[name="yawLowpassFrequency"]').val(FILTER_CONFIG.yaw_lowpass_hz);
        } else {
            $('.tab-pid_tuning .subtab-filter').hide();
            $('.tab-pid_tuning .tab_container').hide();
            $('.pid_tuning input[name="rc_rate_yaw"]').hide();
        }

        if (semver.gte(CONFIG.apiVersion, "1.20.0")
            || semver.gte(CONFIG.apiVersion, "1.16.0") && FEATURE_CONFIG.features.isEnabled('SUPEREXPO_RATES')) {
            $('#pid-tuning .rate').text(i18n.getMessage("pidTuningSuperRate"));
        } else {
            $('#pid-tuning .rate').text(i18n.getMessage("pidTuningRate"));
        }

        if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
            $('.pid_filter input[name="gyroNotch1Frequency"]').val(FILTER_CONFIG.gyro_notch_hz);
            $('.pid_filter input[name="gyroNotch1Cutoff"]').val(FILTER_CONFIG.gyro_notch_cutoff);
            $('.pid_filter input[name="dTermNotchFrequency"]').val(FILTER_CONFIG.dterm_notch_hz);
            $('.pid_filter input[name="dTermNotchCutoff"]').val(FILTER_CONFIG.dterm_notch_cutoff);

            var dtermSetpointTransitionNumberElement = $('input[name="dtermSetpointTransition-number"]');
            if (semver.gte(CONFIG.apiVersion, "1.38.0")) {
                dtermSetpointTransitionNumberElement.attr('min', 0.00);
            } else {
                dtermSetpointTransitionNumberElement.attr('min', 0.01);
            }

            dtermSetpointTransitionNumberElement.val(ADVANCED_TUNING.dtermSetpointTransition / 100);

            $('input[name="dtermSetpoint-number"]').val(ADVANCED_TUNING.dtermSetpointWeight / 100);
        } else {
            $('.pid_filter .newFilter').hide();
        }

        if (semver.gte(CONFIG.apiVersion, "1.21.0")) {
            $('.pid_filter input[name="gyroNotch2Frequency"]').val(FILTER_CONFIG.gyro_notch2_hz);
            $('.pid_filter input[name="gyroNotch2Cutoff"]').val(FILTER_CONFIG.gyro_notch2_cutoff);
        } else {
            $('.pid_filter .gyroNotch2').hide();
        }

        if (semver.gte(CONFIG.apiVersion, "1.24.0")) {
            $('.pid_tuning input[name="angleLimit"]').val(ADVANCED_TUNING.levelAngleLimit);
            $('.pid_tuning input[name="sensitivity"]').val(ADVANCED_TUNING.levelSensitivity);
        } else {
            $('.pid_sensitivity').hide();
        }

        if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
            $('.pid_filter select[name="dtermLowpassType"]').val(FILTER_CONFIG.dterm_lowpass_type);
            $('.antigravity input[name="itermThrottleThreshold"]').val(ADVANCED_TUNING.itermThrottleThreshold);
            $('.antigravity input[name="itermAcceleratorGain"]').val(ADVANCED_TUNING.itermAcceleratorGain / 1000);

            if (FEATURE_CONFIG.features.isEnabled('ANTI_GRAVITY')) {
                $('.antigravity').show();
            } else {
                $('.antigravity').hide();
            }
            var antiGravitySwitch = $('#antiGravitySwitch');
            antiGravitySwitch.prop('checked', ADVANCED_TUNING.itermAcceleratorGain !== 1000);
            antiGravitySwitch.change(function() {
                var checked = $(this).is(':checked');
                if (checked) {
                    $('.antigravity input[name="itermAcceleratorGain"]').val(Math.max(ADVANCED_TUNING.itermAcceleratorGain / 1000, 1.1));
                    $('.antigravity .suboption').show();
                    if (ADVANCED_TUNING.antiGravityMode == 0) {
                        $('.antigravity .antiGravityThres').hide();
                    }
                    if (semver.gte(CONFIG.apiVersion, "1.40.0")) {
                        $('.antigravity .antiGravityMode').show();
                    } else {
                        $('.antigravity .antiGravityMode').hide();
                    }
                } else {
                    $('.antigravity select[id="antiGravityMode"]').val(0);
                    $('.antigravity input[name="itermAcceleratorGain"]').val(1);
                    $('.antigravity .suboption').hide();
                }
            });
            antiGravitySwitch.change();
        } else {
            $('.dtermLowpassType').hide();
            $('.antigravity').hide();
        }

        if (semver.gte(CONFIG.apiVersion, "1.37.0")) {
            $('.pid_tuning input[name="rc_rate_pitch"]').val(RC_tuning.rcPitchRate.toFixed(2));
            $('.pid_tuning input[name="rc_pitch_expo"]').val(RC_tuning.RC_PITCH_EXPO.toFixed(2));
        }

        if (semver.gte(CONFIG.apiVersion, "1.39.0")) {

            $('.pid_filter input[name="gyroLowpass2Frequency"]').val(FILTER_CONFIG.gyro_lowpass2_hz);
            $('.pid_filter select[name="gyroLowpassType"]').val(FILTER_CONFIG.gyro_lowpass_type);
            $('.pid_filter select[name="gyroLowpass2Type"]').val(FILTER_CONFIG.gyro_lowpass2_type);
            $('.pid_filter input[name="dtermLowpass2Frequency"]').val(FILTER_CONFIG.dterm_lowpass2_hz);

            // We load it again because the limits are now bigger than in 1.16.0
            $('.pid_filter input[name="gyroLowpassFrequency"]').attr("max","16000");
            $('.pid_filter input[name="gyroLowpassFrequency"]').val(FILTER_CONFIG.gyro_lowpass_hz);
            //removes 5th column which is Feedforward
            $('#pid_main .pid_titlebar2 th').attr('colspan', 4);
        } else {
            $('.gyroLowpass2').hide();
            $('.gyroLowpass2Type').hide();
            $('.dtermLowpass2').hide();
            $('#pid_main .pid_titlebar2 th').attr('colspan', 4);
        }

        if (semver.gte(CONFIG.apiVersion, "1.40.0")) {

            // I Term Rotation
            $('input[id="itermrotation"]').prop('checked', ADVANCED_TUNING.itermRotation !== 0);

             // Smart Feed Forward
            $('input[id="smartfeedforward"]').prop('checked', ADVANCED_TUNING.smartFeedforward !== 0);

            // I Term Relax
            var itermRelaxCheck = $('input[id="itermrelax"]');

            itermRelaxCheck.prop('checked', ADVANCED_TUNING.itermRelax !== 0);
            $('select[id="itermrelaxAxes"]').val(ADVANCED_TUNING.itermRelax > 0 ? ADVANCED_TUNING.itermRelax : 1);
            $('select[id="itermrelaxType"]').val(ADVANCED_TUNING.itermRelaxType);
            $('input[name="itermRelaxCutoff"]').val(ADVANCED_TUNING.itermRelaxCutoff);

            itermRelaxCheck.change(function() {
                var checked = $(this).is(':checked');

                if (checked) {
                    $('.itermrelax .suboption').show();
                    if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
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
            var absoluteControlGainNumberElement = $('input[name="absoluteControlGain-number"]');
            absoluteControlGainNumberElement.val(ADVANCED_TUNING.absoluteControlGain).trigger('input');

            // Throttle Boost
            var throttleBoostNumberElement = $('input[name="throttleBoost-number"]');
            throttleBoostNumberElement.val(ADVANCED_TUNING.throttleBoost).trigger('input');

            // Acro Trainer
            var acroTrainerAngleLimitNumberElement = $('input[name="acroTrainerAngleLimit-number"]');
            acroTrainerAngleLimitNumberElement.val(ADVANCED_TUNING.acroTrainerAngleLimit).trigger('input');

            // Yaw D
            $('.pid_tuning .YAW input[name="d"]').val(PIDs[2][2]); // PID Yaw D

            // Feedforward
            $('.pid_tuning .ROLL input[name="f"]').val(ADVANCED_TUNING.feedforwardRoll);
            $('.pid_tuning .PITCH input[name="f"]').val(ADVANCED_TUNING.feedforwardPitch);
            $('.pid_tuning .YAW input[name="f"]').val(ADVANCED_TUNING.feedforwardYaw);
            $('#pid_main .pid_titlebar2 th').attr('colspan', 5);

            var feedforwardTransitionNumberElement = $('input[name="feedforwardTransition-number"]');
            feedforwardTransitionNumberElement.val(ADVANCED_TUNING.feedforwardTransition / 100);

            // AntiGravity Mode
            var antiGravityModeSelect = $('.antigravity select[id="antiGravityMode"]');
            antiGravityModeSelect.change(function () {
                var antiGravityModeValue = $('.antigravity select[id="antiGravityMode"]').val();

                // Smooth removes threshold
                if (antiGravityModeValue == 0) {
                    $('.antiGravityThres').hide();
                } else {
                    $('.antiGravityThres').show();
                }
            });

            antiGravityModeSelect.val(ADVANCED_TUNING.antiGravityMode).change();

        } else {
            $('.itermrotation').hide();
            $('.smartfeedforward').hide();
            $('.itermrelax').hide();
            $('.absoluteControlGain').hide();
            $('.throttleBoost').hide();
            $('.acroTrainerAngleLimit').hide();

            $('.pid_tuning .YAW input[name="d"]').hide();

            // Feedforward column
            $('#pid_main tr :nth-child(6)').hide();

            $('#pid-tuning .feedforwardTransition').hide();
        }

        if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
            $('select[id="throttleLimitType"]').val(RC_tuning.throttleLimitType);
            $('.throttle_limit input[name="throttleLimitPercent"]').val(RC_tuning.throttleLimitPercent);

            $('.pid_filter select[name="dtermLowpass2Type"]').val(FILTER_CONFIG.dterm_lowpass2_type);
            $('.pid_filter input[name="gyroLowpassDynMinFrequency"]').val(FILTER_CONFIG.gyro_lowpass_dyn_min_hz);
            $('.pid_filter input[name="gyroLowpassDynMaxFrequency"]').val(FILTER_CONFIG.gyro_lowpass_dyn_max_hz);
            $('.pid_filter select[name="gyroLowpassDynType"]').val(FILTER_CONFIG.gyro_lowpass_type);
            $('.pid_filter input[name="dtermLowpassDynMinFrequency"]').val(FILTER_CONFIG.dterm_lowpass_dyn_min_hz);
            $('.pid_filter input[name="dtermLowpassDynMaxFrequency"]').val(FILTER_CONFIG.dterm_lowpass_dyn_max_hz);
            $('.pid_filter select[name="dtermLowpassDynType"]').val(FILTER_CONFIG.dterm_lowpass_type);

            $('.pid_tuning input[name="dMinRoll"]').val(ADVANCED_TUNING.dMinRoll);
            $('.pid_tuning input[name="dMinPitch"]').val(ADVANCED_TUNING.dMinPitch);
            $('.pid_tuning input[name="dMinYaw"]').val(ADVANCED_TUNING.dMinYaw);
            $('.dminGroup input[name="dMinGain"]').val(ADVANCED_TUNING.dMinGain);
            $('.dminGroup input[name="dMinAdvance"]').val(ADVANCED_TUNING.dMinAdvance);

            $('input[id="useIntegratedYaw"]').prop('checked', ADVANCED_TUNING.useIntegratedYaw !== 0);
            //dmin column
            $('#pid_main .pid_titlebar2 th').attr('colspan', 6);
        } else {
            $('.throttle_limit').hide();

            $('.gyroLowpassDyn').hide();
            $('.dtermLowpassDyn').hide();
            $('.dtermLowpass2TypeGroup').hide();

            $('.dminGroup').hide();
            $('.dMinDisabledNote').hide();
            //dmin column
            $('#pid_main tr :nth-child(5)').hide();

            $('.integratedYaw').hide();
        }

        if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
            $('.smartfeedforward').hide();

            if (FEATURE_CONFIG.features.isEnabled('DYNAMIC_FILTER')) {
                $('.dynamicNotch').show();
            } else {
                $('.dynamicNotch').hide();
            }
            $('.pid_filter select[name="dynamicNotchRange"]').val(FILTER_CONFIG.dyn_notch_range);
            $('.pid_filter input[name="dynamicNotchWidthPercent"]').val(FILTER_CONFIG.dyn_notch_width_percent);
            $('.pid_filter input[name="dynamicNotchQ"]').val(FILTER_CONFIG.dyn_notch_q);
            $('.pid_filter input[name="dynamicNotchMinHz"]').val(FILTER_CONFIG.dyn_notch_min_hz);

            $('.rpmFilter').toggle(MOTOR_CONFIG.use_dshot_telemetry);

            $('.pid_filter input[name="rpmFilterHarmonics"]').val(FILTER_CONFIG.gyro_rpm_notch_harmonics);
            $('.pid_filter input[name="rpmFilterMinHz"]').val(FILTER_CONFIG.gyro_rpm_notch_min_hz);

            $('.pid_filter #rpmFilterEnabled').change(function() {

                let harmonics = $('.pid_filter input[name="rpmFilterHarmonics"]').val();
                let checked = $(this).is(':checked') && harmonics != 0;

                $('.pid_filter input[name="rpmFilterHarmonics"]').attr('disabled', !checked);
                $('.pid_filter input[name="rpmFilterMinHz"]').attr('disabled', !checked);

                if (harmonics == 0) {
                    $('.pid_filter input[name="rpmFilterHarmonics"]').val(FILTER_DEFAULT.gyro_rpm_notch_harmonics);
                }
            }).prop('checked', FILTER_CONFIG.gyro_rpm_notch_harmonics != 0).change();


        } else {
            $('.itermRelaxCutoff').hide();
            $('.dynamicNotch').hide();
            $('.rpmFilter').hide();
        }

        $('input[id="useIntegratedYaw"]').change(function() {
            var checked = $(this).is(':checked');
            $('#pidTuningIntegratedYawCaution').toggle(checked);
        }).change();

        function adjustDMin(dElement, dMinElement) {
            var dValue = parseInt(dElement.val());
            var dMinValue = parseInt(dMinElement.val());

            var dMinLimit = Math.min(Math.max(dValue - 1, 0), 100);
            if (dMinValue > dMinLimit) {
                dMinElement.val(dMinLimit);
            }

            dMinElement.attr("max", dMinLimit);
        }

        $('.pid_tuning .ROLL input[name="d"]').change(function() {
            var dMinElement= $('.pid_tuning input[name="dMinRoll"]');
            adjustDMin($(this), dMinElement);
        }).change();

        $('.pid_tuning .PITCH input[name="d"]').change(function() {
            var dMinElement= $('.pid_tuning input[name="dMinPitch"]');
            adjustDMin($(this), dMinElement);
        }).change();

        $('.pid_tuning .YAW input[name="d"]').change(function() {
            var dMinElement= $('.pid_tuning input[name="dMinYaw"]');
            adjustDMin($(this), dMinElement);
        }).change();

        if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
            var dMinSwitch = $('#dMinSwitch');
            dMinSwitch.prop('checked', ADVANCED_TUNING.dMinRoll > 0 || ADVANCED_TUNING.dMinPitch > 0 || ADVANCED_TUNING.dMinYaw > 0);
            dMinSwitch.change(function() {
                var checked = $(this).is(':checked');
                if (checked) {
                    if ($('.pid_tuning input[name="dMinRoll"]').val() == 0 && $('.pid_tuning input[name="dMinPitch"]').val() == 0 && $('.pid_tuning input[name="dMinYaw"]').val() == 0) {
                        // when enabling dmin set its value based on 0.57x of actual dmax, dmin is limited to 100
                        $('.pid_tuning input[name="dMinRoll"]').val(Math.min(Math.round($('.pid_tuning .ROLL input[name="d"]').val() * 0.57), 100));
                        $('.pid_tuning input[name="dMinPitch"]').val(Math.min(Math.round($('.pid_tuning .PITCH input[name="d"]').val() * 0.57), 100));
                        $('.pid_tuning input[name="dMinYaw"]').val(Math.min(Math.round($('.pid_tuning .YAW input[name="d"]').val() * 0.57), 100));
                    } else {
                        $('.pid_tuning input[name="dMinRoll"]').val(ADVANCED_TUNING.dMinRoll);
                        $('.pid_tuning input[name="dMinPitch"]').val(ADVANCED_TUNING.dMinPitch);
                        $('.pid_tuning input[name="dMinYaw"]').val(ADVANCED_TUNING.dMinYaw);
                    }
                    $('.dMinDisabledNote').hide();
                    $('.dminGroup .suboption').show();
                    $('#pid_main tr :nth-child(5)').show();
                    $('#pid_main .pid_titlebar2 th').attr('colspan', 6);
                } else {
                    $('.pid_tuning input[name="dMinRoll"]').val(0);
                    $('.pid_tuning input[name="dMinPitch"]').val(0);
                    $('.pid_tuning input[name="dMinYaw"]').val(0);
                    $('.dMinDisabledNote').show();
                    $('.dminGroup .suboption').hide();
                    $('#pid_main tr :nth-child(5)').hide();
                    $('#pid_main .pid_titlebar2 th').attr('colspan', 5);
                }
            });
            dMinSwitch.change();
        }

        $('input[id="gyroNotch1Enabled"]').change(function() {
            var checked = $(this).is(':checked');
            var hz = FILTER_CONFIG.gyro_notch_hz > 0 ? FILTER_CONFIG.gyro_notch_hz : FILTER_DEFAULT.gyro_notch_hz;

            $('.pid_filter input[name="gyroNotch1Frequency"]').val(checked ? hz : 0).attr('disabled', !checked)
                    .attr("min", checked ? 1 : 0).change();
            $('.pid_filter input[name="gyroNotch1Cutoff"]').attr('disabled', !checked).change();
        });

        $('input[id="gyroNotch2Enabled"]').change(function() {
            var checked = $(this).is(':checked');
            var hz = FILTER_CONFIG.gyro_notch2_hz > 0 ? FILTER_CONFIG.gyro_notch2_hz : FILTER_DEFAULT.gyro_notch2_hz;

            $('.pid_filter input[name="gyroNotch2Frequency"]').val(checked ? hz : 0).attr('disabled', !checked)
                    .attr("min", checked ? 1 : 0).change();
            $('.pid_filter input[name="gyroNotch2Cutoff"]').attr('disabled', !checked).change();
        });

        $('input[id="dtermNotchEnabled"]').change(function() {
            var checked = $(this).is(':checked');
            var hz = FILTER_CONFIG.dterm_notch_hz > 0 ? FILTER_CONFIG.dterm_notch_hz : FILTER_DEFAULT.dterm_notch_hz;

            $('.pid_filter input[name="dTermNotchFrequency"]').val(checked ? hz : 0).attr('disabled', !checked)
                    .attr("min", checked ? 1 : 0).change();
            $('.pid_filter input[name="dTermNotchCutoff"]').attr('disabled', !checked).change();
        });

        $('input[id="gyroLowpassEnabled"]').change(function() {
            var checked = $(this).is(':checked');
            var disabledByDynamicLowpass = $('input[id="gyroLowpassDynEnabled"]').is(':checked');

            var cutoff = FILTER_CONFIG.gyro_lowpass_hz > 0 ? FILTER_CONFIG.gyro_lowpass_hz : FILTER_DEFAULT.gyro_lowpass_hz;
            var type = FILTER_CONFIG.gyro_lowpass_hz > 0 ? FILTER_CONFIG.gyro_lowpass_type : FILTER_DEFAULT.gyro_lowpass_type;

            $('.pid_filter input[name="gyroLowpassFrequency"]').val((checked || disabledByDynamicLowpass) ? cutoff : 0).attr('disabled', !checked);
            $('.pid_filter select[name="gyroLowpassType"]').val(type).attr('disabled', !checked);

            if (checked) {
                $('input[id="gyroLowpassDynEnabled"]').prop('checked', false).change();
            }
            self.updateFilterWarning();
        });

        $('input[id="gyroLowpassDynEnabled"]').change(function() {
            var checked = $(this).is(':checked');
            var cutoff_min = FILTER_DEFAULT.gyro_lowpass_dyn_min_hz;
            var type = FILTER_DEFAULT.gyro_lowpass_type;
            if (FILTER_CONFIG.gyro_lowpass_dyn_min_hz > 0 && FILTER_CONFIG.gyro_lowpass_dyn_min_hz < FILTER_CONFIG.gyro_lowpass_dyn_max_hz) {
                cutoff_min = FILTER_CONFIG.gyro_lowpass_dyn_min_hz;  
                type = FILTER_CONFIG.gyro_lowpass_type;
            } 

            $('.pid_filter input[name="gyroLowpassDynMinFrequency"]').val(checked ? cutoff_min : 0).attr('disabled', !checked);
            $('.pid_filter input[name="gyroLowpassDynMaxFrequency"]').attr('disabled', !checked);
            $('.pid_filter select[name="gyroLowpassDynType"]').val(type).attr('disabled', !checked);

            if (checked) {
                $('input[id="gyroLowpassEnabled"]').prop('checked', false).change();
            } else if (FILTER_CONFIG.gyro_lowpass_hz > 0 && !$('input[id="gyroLowpassEnabled"]').is(':checked')) {
                $('input[id="gyroLowpassEnabled"]').prop('checked', true).change();
            }
            self.updateFilterWarning();
        });

        $('input[id="gyroLowpass2Enabled"]').change(function() {
            var checked = $(this).is(':checked');
            var cutoff = FILTER_CONFIG.gyro_lowpass2_hz > 0 ? FILTER_CONFIG.gyro_lowpass2_hz : FILTER_DEFAULT.gyro_lowpass2_hz;
            var type = FILTER_CONFIG.gyro_lowpass2_hz > 0 ? FILTER_CONFIG.gyro_lowpass2_type : FILTER_DEFAULT.gyro_lowpass2_type;

            $('.pid_filter input[name="gyroLowpass2Frequency"]').val(checked ? cutoff : 0).attr('disabled', !checked);
            $('.pid_filter select[name="gyroLowpass2Type"]').val(type).attr('disabled', !checked);
        });

        $('input[id="dtermLowpassEnabled"]').change(function() {
            var checked = $(this).is(':checked');
            var disabledByDynamicLowpass = $('input[id="dtermLowpassDynEnabled"]').is(':checked');

            var cutoff = FILTER_CONFIG.dterm_lowpass_hz > 0 ? FILTER_CONFIG.dterm_lowpass_hz : FILTER_DEFAULT.dterm_lowpass_hz;
            var type = FILTER_CONFIG.dterm_lowpass_hz > 0 ? FILTER_CONFIG.dterm_lowpass_type : FILTER_DEFAULT.dterm_lowpass_type;

            $('.pid_filter input[name="dtermLowpassFrequency"]').val((checked || disabledByDynamicLowpass) ? cutoff : 0).attr('disabled', !checked);
            $('.pid_filter select[name="dtermLowpassType"]').val(type).attr('disabled', !checked);

            if (checked) {
                $('input[id="dtermLowpassDynEnabled"]').prop('checked', false).change();
            }
            self.updateFilterWarning();
        });

        $('input[id="dtermLowpassDynEnabled"]').change(function() {
            var checked = $(this).is(':checked');
            var cutoff_min = FILTER_DEFAULT.dterm_lowpass_dyn_min_hz;
            var type = FILTER_DEFAULT.dterm_lowpass_type;
            if (FILTER_CONFIG.dterm_lowpass_dyn_min_hz > 0 && FILTER_CONFIG.dterm_lowpass_dyn_min_hz < FILTER_CONFIG.dterm_lowpass_dyn_max_hz) {
                cutoff_min = FILTER_CONFIG.dterm_lowpass_dyn_min_hz;  
                type = FILTER_CONFIG.dterm_lowpass_type;
            } 

            $('.pid_filter input[name="dtermLowpassDynMinFrequency"]').val(checked ? cutoff_min : 0).attr('disabled', !checked);
            $('.pid_filter input[name="dtermLowpassDynMaxFrequency"]').attr('disabled', !checked);
            $('.pid_filter select[name="dtermLowpassDynType"]').val(type).attr('disabled', !checked);

            if (checked) {
                $('input[id="dtermLowpassEnabled"]').prop('checked', false).change();
            } else if (FILTER_CONFIG.dterm_lowpass_hz > 0 && !$('input[id="dtermLowpassEnabled"]').is(':checked')) {
                $('input[id="dtermLowpassEnabled"]').prop('checked', true).change();
            }
            self.updateFilterWarning();
        });

        $('input[id="dtermLowpass2Enabled"]').change(function() {
            var checked = $(this).is(':checked');
            var cutoff = FILTER_CONFIG.dterm_lowpass2_hz > 0 ? FILTER_CONFIG.dterm_lowpass2_hz : FILTER_DEFAULT.dterm_lowpass2_hz;
            var type = FILTER_CONFIG.dterm_lowpass2_hz > 0 ? FILTER_CONFIG.dterm_lowpass2_type : FILTER_DEFAULT.dterm_lowpass2_type;

            $('.pid_filter input[name="dtermLowpass2Frequency"]').val(checked ? cutoff : 0).attr('disabled', !checked);
            $('.pid_filter select[name="dtermLowpass2Type"]').val(type).attr('disabled', !checked);
        });

        $('input[id="yawLowpassEnabled"]').change(function() {
            var checked = $(this).is(':checked');
            var cutoff = FILTER_CONFIG.yaw_lowpass_hz > 0 ? FILTER_CONFIG.yaw_lowpass_hz : FILTER_DEFAULT.yaw_lowpass_hz;

            $('.pid_filter input[name="yawLowpassFrequency"]').val(checked ? cutoff : 0).attr('disabled', !checked);
        });

        // The notch cutoff must be smaller than the notch frecuency
        function adjustNotchCutoff(frequencyName, cutoffName) {
            var frecuency = parseInt($(".pid_filter input[name='" + frequencyName + "']").val());
            var cutoff = parseInt($(".pid_filter input[name='" + cutoffName + "']").val());

            // Change the max and refresh the value if needed
            var maxCutoff = frecuency == 0 ? 0 : frecuency - 1;
            $(".pid_filter input[name='" + cutoffName + "']").attr("max", maxCutoff);
            if (cutoff >= frecuency) {
                $(".pid_filter input[name='" + cutoffName + "']").val(maxCutoff);
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
        $('input[id="gyroNotch1Enabled"]').prop('checked', FILTER_CONFIG.gyro_notch_hz != 0).change();
        $('input[id="gyroNotch2Enabled"]').prop('checked', FILTER_CONFIG.gyro_notch2_hz != 0).change();
        $('input[id="dtermNotchEnabled"]').prop('checked', FILTER_CONFIG.dterm_notch_hz != 0).change();
        $('input[id="gyroLowpassEnabled"]').prop('checked', FILTER_CONFIG.gyro_lowpass_hz != 0).change();
        $('input[id="gyroLowpassDynEnabled"]').prop('checked', FILTER_CONFIG.gyro_lowpass_dyn_min_hz != 0 && FILTER_CONFIG.gyro_lowpass_dyn_min_hz < FILTER_CONFIG.gyro_lowpass_dyn_max_hz).change();
        $('input[id="gyroLowpass2Enabled"]').prop('checked', FILTER_CONFIG.gyro_lowpass2_hz != 0).change();
        $('input[id="dtermLowpassEnabled"]').prop('checked', FILTER_CONFIG.dterm_lowpass_hz != 0).change();
        $('input[id="dtermLowpassDynEnabled"]').prop('checked', FILTER_CONFIG.dterm_lowpass_dyn_min_hz != 0 && FILTER_CONFIG.dterm_lowpass_dyn_min_hz < FILTER_CONFIG.dterm_lowpass_dyn_max_hz).change();
        $('input[id="dtermLowpass2Enabled"]').prop('checked', FILTER_CONFIG.dterm_lowpass2_hz != 0).change();
        $('input[id="yawLowpassEnabled"]').prop('checked', FILTER_CONFIG.yaw_lowpass_hz != 0).change();
    }

    function form_to_pid_and_rc() {
        // Fill in the data from PIDs array
        // Catch all the changes and stuff the inside PIDs array

        // For each pid name
        PID_names.forEach(function(elementPid, indexPid) {

            // Look into the PID table to a row with the name of the pid
            var searchRow = $('.pid_tuning .' + elementPid + ' input');

            // Assign each value
            searchRow.each(function (indexInput) {
                if ($(this).val()) {
                    PIDs[indexPid][indexInput] = parseFloat($(this).val());
                }
            });
        });

        // catch RC_tuning changes
        RC_tuning.RC_RATE = parseFloat($('.pid_tuning input[name="rc_rate"]').val());
        RC_tuning.roll_pitch_rate = parseFloat($('.pid_tuning input[name="roll_pitch_rate"]').val());
        RC_tuning.roll_rate = parseFloat($('.pid_tuning input[name="roll_rate"]').val());
        RC_tuning.pitch_rate = parseFloat($('.pid_tuning input[name="pitch_rate"]').val());
        RC_tuning.yaw_rate = parseFloat($('.pid_tuning input[name="yaw_rate"]').val());
        RC_tuning.RC_EXPO = parseFloat($('.pid_tuning input[name="rc_expo"]').val());
        RC_tuning.RC_YAW_EXPO = parseFloat($('.pid_tuning input[name="rc_yaw_expo"]').val());
        RC_tuning.rcYawRate = parseFloat($('.pid_tuning input[name="rc_rate_yaw"]').val());
        RC_tuning.rcPitchRate = parseFloat($('.pid_tuning input[name="rc_rate_pitch"]').val());
        RC_tuning.RC_PITCH_EXPO = parseFloat($('.pid_tuning input[name="rc_pitch_expo"]').val());

        RC_tuning.throttle_MID = parseFloat($('.throttle input[name="mid"]').val());
        RC_tuning.throttle_EXPO = parseFloat($('.throttle input[name="expo"]').val());

        RC_tuning.dynamic_THR_PID = parseFloat($('.tpa input[name="tpa"]').val());
        RC_tuning.dynamic_THR_breakpoint = parseInt($('.tpa input[name="tpa-breakpoint"]').val());
        FILTER_CONFIG.gyro_lowpass_hz = parseInt($('.pid_filter input[name="gyroLowpassFrequency"]').val());        
        FILTER_CONFIG.dterm_lowpass_hz = parseInt($('.pid_filter input[name="dtermLowpassFrequency"]').val());
        FILTER_CONFIG.yaw_lowpass_hz = parseInt($('.pid_filter input[name="yawLowpassFrequency"]').val());

        if (semver.gte(CONFIG.apiVersion, "1.16.0") && !semver.gte(CONFIG.apiVersion, "1.20.0")) {
            FEATURE_CONFIG.features.updateData($('input[name="SUPEREXPO_RATES"]'));
        }

        if (semver.gte(CONFIG.apiVersion, "1.16.0")) {
            ADVANCED_TUNING.vbatPidCompensation = $('input[id="vbatpidcompensation"]').is(':checked') ? 1 : 0;
        }

        if (semver.gte(CONFIG.apiVersion, "1.16.0")) {
            ADVANCED_TUNING.deltaMethod = $('#pid-tuning .delta select').val();
        }

        if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
            ADVANCED_TUNING.dtermSetpointTransition = parseInt($('input[name="dtermSetpointTransition-number"]').val() * 100);
            ADVANCED_TUNING.dtermSetpointWeight = parseInt($('input[name="dtermSetpoint-number"]').val() * 100);

            FILTER_CONFIG.gyro_notch_hz = parseInt($('.pid_filter input[name="gyroNotch1Frequency"]').val());
            FILTER_CONFIG.gyro_notch_cutoff = parseInt($('.pid_filter input[name="gyroNotch1Cutoff"]').val());
            FILTER_CONFIG.dterm_notch_hz = parseInt($('.pid_filter input[name="dTermNotchFrequency"]').val());
            FILTER_CONFIG.dterm_notch_cutoff = parseInt($('.pid_filter input[name="dTermNotchCutoff"]').val());
            if (semver.gte(CONFIG.apiVersion, "1.21.0")) {
                FILTER_CONFIG.gyro_notch2_hz = parseInt($('.pid_filter input[name="gyroNotch2Frequency"]').val());
                FILTER_CONFIG.gyro_notch2_cutoff = parseInt($('.pid_filter input[name="gyroNotch2Cutoff"]').val());
            }
        }

        if (semver.gte(CONFIG.apiVersion, "1.24.0")) {
            ADVANCED_TUNING.levelAngleLimit = parseInt($('.pid_tuning input[name="angleLimit"]').val());
            ADVANCED_TUNING.levelSensitivity = parseInt($('.pid_tuning input[name="sensitivity"]').val());
        }

        if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
            FILTER_CONFIG.dterm_lowpass_type = $('.pid_filter select[name="dtermLowpassType"]').val();
            ADVANCED_TUNING.itermThrottleThreshold = parseInt($('.antigravity input[name="itermThrottleThreshold"]').val());
            ADVANCED_TUNING.itermAcceleratorGain = parseInt($('.antigravity input[name="itermAcceleratorGain"]').val() * 1000);
        }

        if (semver.gte(CONFIG.apiVersion, "1.39.0")) {
            FILTER_CONFIG.gyro_lowpass2_hz = parseInt($('.pid_filter input[name="gyroLowpass2Frequency"]').val());
            FILTER_CONFIG.gyro_lowpass_type = parseInt($('.pid_filter select[name="gyroLowpassType"]').val());
            FILTER_CONFIG.gyro_lowpass2_type = parseInt($('.pid_filter select[name="gyroLowpass2Type"]').val());
            FILTER_CONFIG.dterm_lowpass2_hz = parseInt($('.pid_filter input[name="dtermLowpass2Frequency"]').val());
        }

        if (semver.gte(CONFIG.apiVersion, "1.40.0")) {

            ADVANCED_TUNING.itermRotation = $('input[id="itermrotation"]').is(':checked') ? 1 : 0;
            ADVANCED_TUNING.smartFeedforward = $('input[id="smartfeedforward"]').is(':checked') ? 1 : 0;

            ADVANCED_TUNING.itermRelax = $('input[id="itermrelax"]').is(':checked') ? $('select[id="itermrelaxAxes"]').val() : 0;
            ADVANCED_TUNING.itermRelaxType = $('select[id="itermrelaxType"]').val();
            ADVANCED_TUNING.itermRelaxCutoff = parseInt($('input[name="itermRelaxCutoff"]').val());

            ADVANCED_TUNING.absoluteControlGain = $('input[name="absoluteControlGain-number"]').val();

            ADVANCED_TUNING.throttleBoost = $('input[name="throttleBoost-number"]').val();

            ADVANCED_TUNING.acroTrainerAngleLimit = $('input[name="acroTrainerAngleLimit-number"]').val();

            ADVANCED_TUNING.feedforwardRoll  = parseInt($('.pid_tuning .ROLL input[name="f"]').val());
            ADVANCED_TUNING.feedforwardPitch = parseInt($('.pid_tuning .PITCH input[name="f"]').val());
            ADVANCED_TUNING.feedforwardYaw   = parseInt($('.pid_tuning .YAW input[name="f"]').val());

            ADVANCED_TUNING.feedforwardTransition = parseInt($('input[name="feedforwardTransition-number"]').val() * 100);

            ADVANCED_TUNING.antiGravityMode = $('select[id="antiGravityMode"]').val();
        }

        if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
            RC_tuning.throttleLimitType = $('select[id="throttleLimitType"]').val();
            RC_tuning.throttleLimitPercent = parseInt($('.throttle_limit input[name="throttleLimitPercent"]').val());

            FILTER_CONFIG.dterm_lowpass2_type = $('.pid_filter select[name="dtermLowpass2Type"]').val();
            FILTER_CONFIG.gyro_lowpass_dyn_min_hz = parseInt($('.pid_filter input[name="gyroLowpassDynMinFrequency"]').val());
            FILTER_CONFIG.gyro_lowpass_dyn_max_hz = parseInt($('.pid_filter input[name="gyroLowpassDynMaxFrequency"]').val());
            FILTER_CONFIG.dterm_lowpass_dyn_min_hz = parseInt($('.pid_filter input[name="dtermLowpassDynMinFrequency"]').val());
            FILTER_CONFIG.dterm_lowpass_dyn_max_hz = parseInt($('.pid_filter input[name="dtermLowpassDynMaxFrequency"]').val());

            if (FILTER_CONFIG.gyro_lowpass_dyn_min_hz > 0 && FILTER_CONFIG.gyro_lowpass_dyn_min_hz < FILTER_CONFIG.gyro_lowpass_dyn_max_hz ) {
                FILTER_CONFIG.gyro_lowpass_type = $('.pid_filter select[name="gyroLowpassDynType"]').val();
            }
            if (FILTER_CONFIG.dterm_lowpass_dyn_min_hz > 0 && FILTER_CONFIG.dterm_lowpass_dyn_min_hz < FILTER_CONFIG.dterm_lowpass_dyn_max_hz ) {
                FILTER_CONFIG.dterm_lowpass_type = $('.pid_filter select[name="dtermLowpassDynType"]').val();
            }

            ADVANCED_TUNING.dMinRoll = parseInt($('.pid_tuning input[name="dMinRoll"]').val());
            ADVANCED_TUNING.dMinPitch = parseInt($('.pid_tuning input[name="dMinPitch"]').val());
            ADVANCED_TUNING.dMinYaw = parseInt($('.pid_tuning input[name="dMinYaw"]').val());
            ADVANCED_TUNING.dMinGain = parseInt($('.dminGroup input[name="dMinGain"]').val());
            ADVANCED_TUNING.dMinAdvance = parseInt($('.dminGroup input[name="dMinAdvance"]').val());

            ADVANCED_TUNING.useIntegratedYaw = $('input[id="useIntegratedYaw"]').is(':checked') ? 1 : 0;
        }

        if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
            FILTER_CONFIG.dyn_notch_range = parseInt($('.pid_filter select[name="dynamicNotchRange"]').val());
            FILTER_CONFIG.dyn_notch_width_percent = parseInt($('.pid_filter input[name="dynamicNotchWidthPercent"]').val());
            FILTER_CONFIG.dyn_notch_q = parseInt($('.pid_filter input[name="dynamicNotchQ"]').val());
            FILTER_CONFIG.dyn_notch_min_hz = parseInt($('.pid_filter input[name="dynamicNotchMinHz"]').val());

            let rpmFilterEnabled = $('.pid_filter #rpmFilterEnabled').is(':checked');
            FILTER_CONFIG.gyro_rpm_notch_harmonics = rpmFilterEnabled ? parseInt($('.pid_filter input[name="rpmFilterHarmonics"]').val()) : 0;
            FILTER_CONFIG.gyro_rpm_notch_min_hz = parseInt($('.pid_filter input[name="rpmFilterMinHz"]').val());
        }
    }

    function showAllPids() {

        // Hide all optional elements
        $('.pid_optional tr').hide(); // Hide all rows
        $('.pid_optional table').hide(); // Hide tables
        $('.pid_optional').hide(); // Hide general div

        // Only show rows supported by the firmware
        PID_names.forEach(function(elementPid) {
            // Show rows for the PID
            $('.pid_tuning .' + elementPid).show();

            // Show titles and other elements needed by the PID
            $('.needed_by_' + elementPid).show();
        });

        // Special case
        if (semver.lt(CONFIG.apiVersion, "1.24.0")) {
            $('#pid_sensitivity').hide();
        }

    }

    function hideUnusedPids() {

        if (!have_sensor(CONFIG.activeSensors, 'acc')) {
            $('#pid_accel').hide();
        }

        var hideSensorPid = function(element, sensorReady) {
            var isVisible = element.is(":visible");
            if (!isVisible || !sensorReady) {
                element.hide();
                isVisible = false;
            }

            return isVisible;
        }

        var isVisibleBaroMagGps = false;

        isVisibleBaroMagGps |= hideSensorPid($('#pid_baro'), have_sensor(CONFIG.activeSensors, 'baro') || have_sensor(CONFIG.activeSensors, 'sonar'));

        isVisibleBaroMagGps |= hideSensorPid($('#pid_mag'), have_sensor(CONFIG.activeSensors, 'mag'));

        isVisibleBaroMagGps |= hideSensorPid($('#pid_gps'), have_sensor(CONFIG.activeSensors, 'GPS'));

        if (!isVisibleBaroMagGps) {
            $('#pid_baro_mag_gps').hide();
        }
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
        var value = parseFloat(element.val());
        if (value < parseFloat(element.prop('min'))
            || value > parseFloat(element.prop('max'))) {
            value = undefined;
        }

        return value;
    }

    var useLegacyCurve = false;
    if (!semver.gte(CONFIG.apiVersion, "1.16.0")) {
        useLegacyCurve = true;
    }

    self.rateCurve = new RateCurve(useLegacyCurve);

    function printMaxAngularVel(rate, rcRate, rcExpo, useSuperExpo, deadband, limit, maxAngularVelElement) {
        var maxAngularVel = self.rateCurve.getMaxAngularVel(rate, rcRate, rcExpo, useSuperExpo, deadband, limit).toFixed(0);
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
        if (semver.gte(CONFIG.apiVersion, "1.16.0") && !semver.gte(CONFIG.apiVersion, "1.20.0")) {
            FEATURE_CONFIG.features.generateElements($('.tab-pid_tuning .features'));
        } else {
            $('.tab-pid_tuning .pidTuningFeatures').hide();
        }

        if (semver.lt(CONFIG.apiVersion, "1.39.0")) {
            $('input[name="dtermSetpoint-number"]').attr('max', self.SETPOINT_WEIGHT_RANGE_LEGACY);
        }

        // translate to user-selected language
        i18n.localizePage();

        // Local cache of current rates
        self.currentRates = {
            roll_rate:     RC_tuning.roll_rate,
            pitch_rate:    RC_tuning.pitch_rate,
            yaw_rate:      RC_tuning.yaw_rate,
            rc_rate:       RC_tuning.RC_RATE,
            rc_rate_yaw:   RC_tuning.rcYawRate,
            rc_expo:       RC_tuning.RC_EXPO,
            rc_yaw_expo:   RC_tuning.RC_YAW_EXPO,
            rc_rate_pitch: RC_tuning.rcPitchRate,
            rc_pitch_expo: RC_tuning.RC_PITCH_EXPO,
            superexpo:   FEATURE_CONFIG.features.isEnabled('SUPEREXPO_RATES'),
            deadband: RC_DEADBAND_CONFIG.deadband,
            yawDeadband: RC_DEADBAND_CONFIG.yaw_deadband,
            roll_rate_limit:   RC_tuning.roll_rate_limit,
            pitch_rate_limit:  RC_tuning.pitch_rate_limit,
            yaw_rate_limit:    RC_tuning.yaw_rate_limit
        };

        if (semver.lt(CONFIG.apiVersion, "1.7.0")) {
            self.currentRates.roll_rate = RC_tuning.roll_pitch_rate;
            self.currentRates.pitch_rate = RC_tuning.roll_pitch_rate;
        }

        if (semver.lt(CONFIG.apiVersion, "1.16.0")) {
            self.currentRates.rc_rate_yaw = self.currentRates.rc_rate;
        }

        if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
            self.currentRates.superexpo = true;
        }

        if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
            $('.pid_tuning input[name="sensitivity"]').hide();
            $('.pid_tuning .levelSensitivityHeader').empty();
        }

        if (semver.lt(CONFIG.apiVersion, "1.37.0")) {
            self.currentRates.rc_rate_pitch = self.currentRates.rc_rate;
            self.currentRates.rc_expo_pitch = self.currentRates.rc_expo;
        }

        function activateSubtab(subtabName) {
            const names = ['pid', 'rates', 'filter'];
            if (!names.includes(subtabName)) {
                console.debug('Invalid subtab name: "' + subtabName + '"');
                return;
            }
            for (name of names) {
                const el = $('.tab-pid_tuning .subtab-' + name);
                el[name == subtabName ? 'show' : 'hide']();
            }
            $('.tab-pid_tuning .tab_container td').removeClass('active');
            $('.tab-pid_tuning .tab_container .' + subtabName).addClass('active');
            self.activeSubtab = subtabName;
        }

        activateSubtab(self.activeSubtab);

        $('.tab-pid_tuning .tab_container .pid').on('click', () => activateSubtab('pid'));

        $('.tab-pid_tuning .tab_container .rates').on('click', () => activateSubtab('rates'));

        $('.tab-pid_tuning .tab_container .filter').on('click', () => activateSubtab('filter'));

        function loadProfilesList() {
            var numberOfProfiles = 3;
            if (semver.gte(CONFIG.apiVersion, "1.20.0")
                 && CONFIG.numProfiles === 2) {
                    numberOfProfiles = 2;
            }

            var profileElements = [];
            for (var i=0; i<numberOfProfiles; i++) {
                profileElements.push(i18n.getMessage("pidTuningProfileOption",[(i + 1)]));
            }
            return profileElements;
        }

        function loadRateProfilesList() {
            var numberOfRateProfiles = 6;
            if (semver.lt(CONFIG.apiVersion, "1.37.0")) {
                numberOfRateProfiles = 3;
            }

            var rateProfileElements = [];
            for (var i=0; i<numberOfRateProfiles; i++) {
                rateProfileElements.push(i18n.getMessage("pidTuningRateProfileOption",[(i + 1)]));
            }
            return rateProfileElements;
        }

        // This vars are used here for populate the profile (and rate profile) selector AND in the copy profile (and rate profile) window
        var selectRateProfileValues = loadRateProfilesList();
        var selectProfileValues = loadProfilesList();
        
        function populateProfilesSelector(selectProfileValues) {
            var profileSelect = $('select[name="profile"]');
            selectProfileValues.forEach(function(value, key) {
                profileSelect.append('<option value="' + key + '">' + value + '</option>');
            });
        }

        populateProfilesSelector(selectProfileValues);

        function populateRateProfilesSelector(selectRateProfileValues) {
            var rateProfileSelect = $('select[name="rate_profile"]');
            selectRateProfileValues.forEach(function(value, key) {
                rateProfileSelect.append('<option value="' + key + '">' + value + '</option>');
            });
        }

        populateRateProfilesSelector(selectRateProfileValues);

        var showAllButton = $('#showAllPids');

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

        showAllButton.on('click', function(){
            self.showAllPids = !self.showAllPids;

            updatePidDisplay();
        });

        $('#resetProfile').on('click', function(){
            self.updating = true;
            MSP.promise(MSPCodes.MSP_SET_RESET_CURR_PID).then(function () {
                self.refresh(function () {
                    self.updating = false;

                    GUI.log(i18n.getMessage('pidTuningProfileReset'));
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
                    CONFIG.profile = self.currentProfile;

                    GUI.log(i18n.getMessage('pidTuningLoadedProfile', [self.currentProfile + 1]));
                });
            });
        });

        if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
            $('.tab-pid_tuning select[name="rate_profile"]').change(function () {
                self.currentRateProfile = parseInt($(this).val());
                self.updating = true;
                $(this).prop('disabled', 'true');
                MSP.promise(MSPCodes.MSP_SELECT_SETTING, [self.currentRateProfile + self.RATE_PROFILE_MASK]).then(function () {
                    self.refresh(function () {
                        self.updating = false;

                        $('.tab-pid_tuning select[name="rate_profile"]').prop('disabled', 'false');
                        CONFIG.rateProfile = self.currentRateProfile;

                        GUI.log(i18n.getMessage('pidTuningLoadedRateProfile', [self.currentRateProfile + 1]));
                    });
                });
            });

            var dtermTransitionNumberElement = $('input[name="dtermSetpointTransition-number"]');
            var dtermTransitionWarningElement = $('#pid-tuning .dtermSetpointTransitionWarning');

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

        } else {
            $('.tab-pid_tuning .rate_profile').hide();

            $('#pid-tuning .dtermSetpointTransition').hide();
            $('#pid-tuning .dtermSetpoint').hide();
        }

        if (!semver.gte(CONFIG.apiVersion, "1.16.0")) {
            $('#pid-tuning .delta').hide();
            $('.tab-pid_tuning .note').hide();
		}

        // Add a name to each row of PIDs if empty
        $('.pid_tuning tr').each(function(){
            for(i = 0; i < PID_names.length; i++) {
                if($(this).hasClass(PID_names[i])) {
                    var firstColumn = $(this).find('td:first');
                    if (!firstColumn.text()) {
                        firstColumn.text(PID_names[i]);
                    }
                }
            }
        });


        // DTerm filter options
        function loadFilterTypeValues() {
            var filterTypeValues = [];
            filterTypeValues.push("PT1");
            filterTypeValues.push("BIQUAD");
            if (semver.lt(CONFIG.apiVersion, "1.39.0")) {
                filterTypeValues.push("FIR");
            }
            return filterTypeValues;
        }

        function populateFilterTypeSelector(name, selectDtermValues) {
            var dtermFilterSelect = $('select[name="' + name + '"]');
            selectDtermValues.forEach(function(value, key) {
                dtermFilterSelect.append('<option value="' + key + '">' + value + '</option>');
            });
        }
        // Added in API 1.42.0
        function loadDynamicNotchRangeValues() {
            var dynamicNotchRangeValues = [
                "HIGH", "MEDIUM", "LOW", "AUTO",
            ];
            return dynamicNotchRangeValues;
        }
        function populateDynamicNotchRangeSelect(selectDynamicNotchRangeValues) {
            var dynamicNotchRangeSelect = $('select[name="dynamicNotchRange"]');
            selectDynamicNotchRangeValues.forEach(function(value, key) {
                dynamicNotchRangeSelect.append('<option value="' + key + '">' + value + '</option>');
            });
        }
        if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
            populateDynamicNotchRangeSelect(loadDynamicNotchRangeValues());
        }

        populateFilterTypeSelector('gyroLowpassType', loadFilterTypeValues());
        populateFilterTypeSelector('gyroLowpassDynType', loadFilterTypeValues());
        populateFilterTypeSelector('gyroLowpass2Type', loadFilterTypeValues());
        populateFilterTypeSelector('dtermLowpassType', loadFilterTypeValues());
        populateFilterTypeSelector('dtermLowpass2Type', loadFilterTypeValues());
        populateFilterTypeSelector('dtermLowpassDynType', loadFilterTypeValues());

        pid_and_rc_to_form();

        var pidController_e = $('select[name="controller"]');

        if (semver.lt(CONFIG.apiVersion, "1.31.0")) {
            var pidControllerList;


            if (semver.lt(CONFIG.apiVersion, "1.14.0")) {
                pidControllerList = [
                    {name: "MultiWii (Old)"},
                    {name: "MultiWii (rewrite)"},
                    {name: "LuxFloat"},
                    {name: "MultiWii (2.3 - latest)"},
                    {name: "MultiWii (2.3 - hybrid)"},
                    {name: "Harakiri"}
                ]
            } else if (semver.lt(CONFIG.apiVersion, "1.20.0")) {
                pidControllerList = [
                    {name: ""},
                    {name: "Integer"},
                    {name: "Float"}
                ]
            } else {
                pidControllerList = [
                    {name: "Legacy"},
                    {name: "Betaflight"}
                ]
            }

            for (var i = 0; i < pidControllerList.length; i++) {
                pidController_e.append('<option value="' + (i) + '">' + pidControllerList[i].name + '</option>');
            }

            if (semver.gte(CONFIG.apiVersion, CONFIGURATOR.pidControllerChangeMinApiVersion)) {
                pidController_e.val(PID.controller);

                self.updatePidControllerParameters();
            } else {
                GUI.log(i18n.getMessage('pidTuningUpgradeFirmwareToChangePidController', [CONFIG.apiVersion, CONFIGURATOR.pidControllerChangeMinApiVersion]));

                pidController_e.empty();
                pidController_e.append('<option value="">Unknown</option>');

                pidController_e.prop('disabled', true);
            }
        } else {
            $('.tab-pid_tuning div.controller').hide();

            self.updatePidControllerParameters();
        }

        if (semver.lt(CONFIG.apiVersion, "1.7.0")) {
            $('.tpa .tpa-breakpoint').hide();

            $('.pid_tuning .roll_rate').hide();
            $('.pid_tuning .pitch_rate').hide();
        } else {
            $('.pid_tuning .roll_pitch_rate').hide();
        }

        if (semver.gte(CONFIG.apiVersion, "1.37.0")) {
            $('.pid_tuning .bracket').hide();
            $('.pid_tuning input[name=rc_rate]').parent().attr('class', 'pid_data');
            $('.pid_tuning input[name=rc_rate]').parent().attr('rowspan', 1);
            $('.pid_tuning input[name=rc_expo]').parent().attr('class', 'pid_data');
            $('.pid_tuning input[name=rc_expo]').parent().attr('rowspan', 1);
        } else {
            $('.pid_tuning input[name=rc_rate_pitch]').parent().hide();
            $('.pid_tuning input[name=rc_pitch_expo]').parent().hide();
        }

        if (useLegacyCurve) {
            $('.new_rates').hide();
        }

        // Getting the DOM elements for curve display
        var rcCurveElement              = $('.rate_curve canvas#rate_curve_layer0').get(0),
            curveContext                = rcCurveElement.getContext("2d"),
            updateNeeded                = true,
            maxAngularVel;

        // make these variables global scope so that they can be accessed by the updateRates function.
        self.maxAngularVelRollElement    = $('.pid_tuning .maxAngularVelRoll');
        self.maxAngularVelPitchElement   = $('.pid_tuning .maxAngularVelPitch');
        self.maxAngularVelYawElement     = $('.pid_tuning .maxAngularVelYaw');

        rcCurveElement.width = 1000;
        rcCurveElement.height = 1000;

        function updateRates (event) {
            setTimeout(function () { // let global validation trigger and adjust the values first
                if(event) { // if an event is passed, then use it
                    var targetElement = $(event.target),
                        targetValue = checkInput(targetElement);

                    if (self.currentRates.hasOwnProperty(targetElement.attr('name')) && targetValue !== undefined) {
                        self.currentRates[targetElement.attr('name')] = targetValue;

                        updateNeeded = true;
                    }

                    if (targetElement.attr('name') === 'rc_rate' && semver.lt(CONFIG.apiVersion, "1.16.0")) {
                        self.currentRates.rc_rate_yaw = targetValue;
                    }

                    if (targetElement.attr('name') === 'roll_pitch_rate' && semver.lt(CONFIG.apiVersion, "1.7.0")) {
                        self.currentRates.roll_rate = targetValue;
                        self.currentRates.pitch_rate = targetValue;

                        updateNeeded = true;
                    }

                    if (targetElement.attr('name') === 'SUPEREXPO_RATES') {
                        self.currentRates.superexpo = targetElement.is(':checked');

                        updateNeeded = true;
                    }

                    if (targetElement.attr('name') === 'rc_rate' && semver.lt(CONFIG.apiVersion, "1.37.0")) {
                        self.currentRates.rc_rate_pitch = targetValue;
                    }

                    if (targetElement.attr('name') === 'rc_expo' && semver.lt(CONFIG.apiVersion, "1.37.0")) {
                        self.currentRates.rc_pitch_expo = targetValue;
                    }
                } else { // no event was passed, just force a graph update
                    updateNeeded = true;
                }
                if (updateNeeded) {
                    var curveHeight = rcCurveElement.height;
                    var curveWidth = rcCurveElement.width;
                    var lineScale = curveContext.canvas.width / curveContext.canvas.clientWidth;

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
        $('input.feature').on('input change', updateRates);
        $('.pid_tuning').on('input change', updateRates).trigger('input');

        $('.throttle input').on('input change', function () {
            setTimeout(function () { // let global validation trigger and adjust the values first
                var throttleMidE = $('.throttle input[name="mid"]'),
                    throttleExpoE = $('.throttle input[name="expo"]'),
                    mid = parseFloat(throttleMidE.val()),
                    expo = parseFloat(throttleExpoE.val()),
                    throttleCurve = $('.throttle .throttle_curve canvas').get(0),
                    context = throttleCurve.getContext("2d");

                // local validation to deal with input event
                if (mid >= parseFloat(throttleMidE.prop('min')) &&
                    mid <= parseFloat(throttleMidE.prop('max')) &&
                    expo >= parseFloat(throttleExpoE.prop('min')) &&
                    expo <= parseFloat(throttleExpoE.prop('max'))) {
                    // continue
                } else {
                    return;
                }

                var canvasHeight = throttleCurve.height;
                var canvasWidth = throttleCurve.width;

                // math magic by englishman
                var midx = canvasWidth * mid,
                    midxl = midx * 0.5,
                    midxr = (((canvasWidth - midx) * 0.5) + midx),
                    midy = canvasHeight - (midx * (canvasHeight / canvasWidth)),
                    midyl = canvasHeight - ((canvasHeight - midy) * 0.5 *(expo + 1)),
                    midyr = (midy / 2) * (expo + 1);

                // draw
                context.clearRect(0, 0, canvasWidth, canvasHeight);
                context.beginPath();
                context.moveTo(0, canvasHeight);
                context.quadraticCurveTo(midxl, midyl, midx, midy);
                context.moveTo(midx, midy);
                context.quadraticCurveTo(midxr, midyr, canvasWidth, 0);
                context.lineWidth = 2;
                context.strokeStyle = '#ffbb00';
                context.stroke();
            }, 0);
        }).trigger('input');

        $('a.refresh').click(function () {
            self.refresh(function () {
                GUI.log(i18n.getMessage('pidTuningDataRefreshed'));
            });
        });

        $('#pid-tuning').find('input').each(function (k, item) {
            if ($(item).attr('class') !== "feature toggle"
                && $(item).attr('class') !== "nonProfile") {
                $(item).change(function () {
                    self.setDirty(true);
                });
            }
        });

        var dialogCopyProfile = $('.dialogCopyProfile')[0];
        var DIALOG_MODE_PROFILE = 0;
        var DIALOG_MODE_RATEPROFILE = 1;
        var dialogCopyProfileMode;

        if (semver.gte(CONFIG.apiVersion, "1.36.0")) {

            var selectProfile = $('.selectProfile');
            var selectRateProfile = $('.selectRateProfile');

            $.each(selectProfileValues, function(key, value) {
                if (key != CONFIG.profile)
                    selectProfile.append(new Option(value, key));
            });
            $.each(selectRateProfileValues, function(key, value) {
                if (key != CONFIG.rateProfile)
                    selectRateProfile.append(new Option(value, key));
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
                        COPY_PROFILE.type = DIALOG_MODE_PROFILE;    // 0 = pid profile
                        COPY_PROFILE.dstProfile = parseInt(selectProfile.val());
                        COPY_PROFILE.srcProfile = CONFIG.profile;

                        MSP.send_message(MSPCodes.MSP_COPY_PROFILE, mspHelper.crunch(MSPCodes.MSP_COPY_PROFILE), false, close_dialog);

                        break;
                    
                    case DIALOG_MODE_RATEPROFILE:
                        COPY_PROFILE.type = DIALOG_MODE_RATEPROFILE;    // 1 = rate profile
                        COPY_PROFILE.dstProfile = parseInt(selectRateProfile.val());
                        COPY_PROFILE.srcProfile = CONFIG.rateProfile;

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
        } else {
            $('.copyprofilebtn').hide();
            $('.copyrateprofilebtn').hide();
        }

        if (semver.gte(CONFIG.apiVersion, "1.42.0")) { 
            // filter and tuning sliders
            TuningSliders.initialize();

            $('#dMinSwitch').change(function() {
                TuningSliders.setDMinFeatureEnabled($(this).is(':checked'));
                // switch dmin and dmax values on dmin on/off if sliders available
                if (!TuningSliders.pidSlidersUnavailable) {
                    if (TuningSliders.dMinFeatureEnabled) {
                        ADVANCED_TUNING.dMinRoll = PIDs[0][2];
                        ADVANCED_TUNING.dMinPitch = PIDs[1][2];
                        ADVANCED_TUNING.dMinYaw = PIDs[2][2];
                    } else {
                        PIDs[0][2] = ADVANCED_TUNING.dMinRoll;
                        PIDs[1][2] = ADVANCED_TUNING.dMinPitch;
                        PIDs[2][2] = ADVANCED_TUNING.dMinYaw;
                    }
                    TuningSliders.calculateNewPids();
                }
            });
            // integrated yaw doesn't work with sliders therefore sliders are disabled
            $('input[id="useIntegratedYaw"]').change(() => TuningSliders.updatePidSlidersDisplay());

            // pid sliders inputs
            $('#tuningMasterSlider, #tuningPDRatioSlider, #tuningPDGainSlider, #tuningResponseSlider').on('input', function() {
                const slider = $(this);
                // adjust step for more smoothness above 1x
                if (slider.val() >= 1) {
                    slider.attr('step', 0.05);
                } else {
                    slider.attr('step', 0.1);
                }
                const scaledValue = TuningSliders.scaleSliderValue(slider.val());
                if (slider.is('#tuningMasterSlider')) {
                    TuningSliders.MasterSliderValue = scaledValue;
                } else if (slider.is('#tuningPDRatioSlider')) {
                    TuningSliders.PDRatioSliderValue = scaledValue;
                } else if (slider.is('#tuningPDGainSlider')) {
                    TuningSliders.PDGainSliderValue = scaledValue;
                } else if (slider.is('#tuningResponseSlider')) {
                    TuningSliders.ResponseSliderValue = scaledValue;
                }
                TuningSliders.calculateNewPids();
            });
            $('#tuningMasterSlider, #tuningPDRatioSlider, #tuningPDGainSlider, #tuningResponseSlider').mousedown(function() {
                // adjust step for more smoothness above 1x on mousedown
                const slider = $(this);
                if (slider.val() >= 1) {
                    slider.attr('step', 0.05);
                } else {
                    slider.attr('step', 0.1);
                }
            });
            $('#tuningMasterSlider, #tuningPDRatioSlider, #tuningPDGainSlider, #tuningResponseSlider').mouseup(function() {
                // readjust dmin maximums
                $('.pid_tuning .ROLL input[name="d"]').change();
                $('.pid_tuning .PITCH input[name="d"]').change();
                $('.pid_tuning .YAW input[name="d"]').change();
                TuningSliders.updatePidSlidersDisplay();
            });
            // reset to middle with double click
            $('#tuningMasterSlider, #tuningPDRatioSlider, #tuningPDGainSlider, #tuningResponseSlider').dblclick(function() {
                const slider = $(this);
                slider.val(1);
                if (slider.is('#tuningMasterSlider')) {
                    TuningSliders.MasterSliderValue = 1;
                } else if (slider.is('#tuningPDRatioSlider')) {
                    TuningSliders.PDRatioSliderValue = 1;
                } else if (slider.is('#tuningPDGainSlider')) {
                    TuningSliders.PDGainSliderValue = 1;
                } else if (slider.is('#tuningResponseSlider')) {
                    TuningSliders.ResponseSliderValue = 1;
                }
                TuningSliders.calculateNewPids();
                TuningSliders.updatePidSlidersDisplay();
            });
            // enable PID sliders button
            $('a.buttonPidTuningSliders').click(function() {
                // if values were previously changed manually and then sliders are reactivated, reset pids to previous valid values if available, else default
                TuningSliders.resetPidSliders();
                // disable integrated yaw when enabling sliders
                if ($('input[id="useIntegratedYaw"]').is(':checked')) {
                    $('input[id="useIntegratedYaw"]').prop('checked', true).click();
                }
            });

            // filter slider inputs
            $('#tuningGyroFilterSlider, #tuningDTermFilterSlider').on('input', function() {
                const slider = $(this);
                const scaledValue = TuningSliders.scaleSliderValue(slider.val());
                if (slider.is('#tuningGyroFilterSlider')) {
                    TuningSliders.gyroFilterSliderValue = scaledValue;
                    TuningSliders.calculateNewGyroFilters();
                } else if (slider.is('#tuningDTermFilterSlider')) {
                    TuningSliders.dtermFilterSliderValue = scaledValue;
                    TuningSliders.calculateNewDTermFilters();
                }
            });
            $('#tuningGyroFilterSlider, #tuningDTermFilterSlider').mouseup(function() {
                TuningSliders.updateFilterSlidersDisplay();
            });
            // reset to middle with double click
            $('#tuningGyroFilterSlider, #tuningDTermFilterSlider').dblclick(function() {
                const slider = $(this);
                slider.val(1);
                if (slider.is('#tuningGyroFilterSlider')) {
                    TuningSliders.gyroFilterSliderValue = 1;
                    TuningSliders.calculateNewGyroFilters();
                } else if (slider.is('#tuningDTermFilterSlider')) {
                    TuningSliders.dtermFilterSliderValue = 1;
                    TuningSliders.calculateNewDTermFilters();
                }
                TuningSliders.updateFilterSlidersDisplay();
            });
            // enable PID sliders button
            $('a.buttonFilterTuningSliders').click(function() {
                if (TuningSliders.filterGyroSliderUnavailable) {
                    // update switchery dynamically based on defaults
                    $('input[id="gyroLowpassDynEnabled"]').prop('checked', false).click();
                    $('input[id="gyroLowpassEnabled"]').prop('checked', true).click();
                    $('input[id="gyroLowpass2Enabled"]').prop('checked', false).click();
                    TuningSliders.resetGyroFilterSlider();
                }
                if (TuningSliders.filterDTermSliderUnavailable) {
                    $('input[id="dtermLowpassDynEnabled"]').prop('checked', false).click();
                    $('input[id="dtermLowpassEnabled"]').prop('checked', true).click();
                    $('input[id="dtermLowpass2Enabled"]').prop('checked', false).click();
                    TuningSliders.resetDTermFilterSlider();
                }
            });

            // update on pid table inputs
            $('#pid_main input').on('input', () => TuningSliders.updatePidSlidersDisplay());
            // update on filter value or type changes
            $('.pid_filter input, .pid_filter select').on('input', () => TuningSliders.updateFilterSlidersDisplay());
            // update on filter switch changes
            $('.inputSwitch input').change(() => TuningSliders.updateFilterSlidersDisplay());
        } else {
            $('.tuningPIDSliders').hide();
            $('.slidersDisabled').hide();
            $('.slidersHighWarning').hide();
            $('.tuningFilterSliders').hide();
            $('.slidersFilterDisabled').hide();
            $('.slidersFilterHighWarning').hide();
        }

        if (semver.gte(CONFIG.apiVersion, "1.16.0")) {
            $('#pid-tuning .delta select').change(function() {
                self.setDirty(true);
            });
        }

        if (semver.lt(CONFIG.apiVersion, "1.31.0")) {
            pidController_e.change(function () {
                self.setDirty(true);

                self.updatePidControllerParameters();
            });
        }

        // update == save.
        $('a.update').click(function () {
            form_to_pid_and_rc();

            self.updating = true;
            Promise.resolve(true)
            .then(function () {
                var promise;
                if (semver.gte(CONFIG.apiVersion, CONFIGURATOR.pidControllerChangeMinApiVersion) && semver.lt(CONFIG.apiVersion, "1.31.0")) {
                    PID.controller = pidController_e.val();
                    promise = MSP.promise(MSPCodes.MSP_SET_PID_CONTROLLER, mspHelper.crunch(MSPCodes.MSP_SET_PID_CONTROLLER));
                }
                return promise;
            }).then(function () {
                return MSP.promise(MSPCodes.MSP_SET_PID, mspHelper.crunch(MSPCodes.MSP_SET_PID));
            }).then(function () {
              return MSP.promise(MSPCodes.MSP_SET_PID_ADVANCED, mspHelper.crunch(MSPCodes.MSP_SET_PID_ADVANCED));
            }).then(function () {
                return MSP.promise(MSPCodes.MSP_SET_FILTER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FILTER_CONFIG));
            }).then(function () {
                return MSP.promise(MSPCodes.MSP_SET_RC_TUNING, mspHelper.crunch(MSPCodes.MSP_SET_RC_TUNING));
            }).then(function () {
                return MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
            }).then(function () {
                self.updating = false;
                self.setDirty(false);

                GUI.log(i18n.getMessage('pidTuningEepromSaved'));
            });
        });

        // Setup model for rates preview
        self.initRatesPreview();
        self.renderModel();

        self.updating = false;

        // enable RC data pulling for rates preview
        GUI.interval_add('receiver_pull', self.getRecieverData, true);

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function status_pull() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);

        GUI.content_ready(callback);
    }
};

TABS.pid_tuning.getRecieverData = function () {
    MSP.send_message(MSPCodes.MSP_RC, false, false);
};

TABS.pid_tuning.initRatesPreview = function () {
    this.keepRendering = true;
    this.model = new Model($('.rates_preview'), $('.rates_preview canvas'));

    $('.tab-pid_tuning .tab_container .rates').on('click', $.proxy(this.model.resize, this.model));
    $('.tab-pid_tuning .tab_container .rates').on('click', $.proxy(this.updateRatesLabels, this));

    $(window).on('resize', $.proxy(this.model.resize, this.model));
    $(window).on('resize', $.proxy(this.updateRatesLabels, this));
};

TABS.pid_tuning.renderModel = function () {
    if (this.keepRendering) { requestAnimationFrame(this.renderModel.bind(this)); }

    if (!this.clock) { this.clock = new THREE.Clock(); }

    if (RC.channels[0] && RC.channels[1] && RC.channels[2]) {
        var delta = this.clock.getDelta();

        var roll  = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(RC.channels[0], this.currentRates.roll_rate,  this.currentRates.rc_rate,       this.currentRates.rc_expo,       this.currentRates.superexpo, this.currentRates.deadband,    this.currentRates.roll_rate_limit),
            pitch = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(RC.channels[1], this.currentRates.pitch_rate, this.currentRates.rc_rate_pitch, this.currentRates.rc_pitch_expo, this.currentRates.superexpo, this.currentRates.deadband,    this.currentRates.pitch_rate_limit),
            yaw   = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(RC.channels[2], this.currentRates.yaw_rate,   this.currentRates.rc_rate_yaw,   this.currentRates.rc_yaw_expo,   this.currentRates.superexpo, this.currentRates.yawDeadband, this.currentRates.yaw_rate_limit);

        this.model.rotateBy(-degToRad(pitch), -degToRad(yaw), -degToRad(roll));

        if (this.checkRC()) this.updateRatesLabels(); // has the RC data changed ?

    }
};

TABS.pid_tuning.cleanup = function (callback) {
    var self = this;

    if (self.model) {
        $(window).off('resize', $.proxy(self.model.resize, self.model));
    }

    $(window).off('resize', $.proxy(this.updateRatesLabels, this));


    self.keepRendering = false;

    if (callback) callback();
};

TABS.pid_tuning.refresh = function (callback) {
    var self = this;

    GUI.tab_switch_cleanup(function () {
        self.initialize();

        self.setDirty(false);

        if (callback) {
            callback();
        }
    });
};

TABS.pid_tuning.setProfile = function () {
    var self = this;

    self.currentProfile = CONFIG.profile;
    $('.tab-pid_tuning select[name="profile"]').val(self.currentProfile);
};

TABS.pid_tuning.setRateProfile = function () {
    var self = this;

    self.currentRateProfile = CONFIG.rateProfile;
    $('.tab-pid_tuning select[name="rate_profile"]').val(self.currentRateProfile);
};

TABS.pid_tuning.setDirty = function (isDirty) {
    var self = this;

    self.dirty = isDirty;
    $('.tab-pid_tuning select[name="profile"]').prop('disabled', isDirty);
    if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
        $('.tab-pid_tuning select[name="rate_profile"]').prop('disabled', isDirty);
    }
};

TABS.pid_tuning.checkUpdateProfile = function (updateRateProfile) {
    var self = this;

    if (GUI.active_tab === 'pid_tuning') {

        if (!self.updating && !self.dirty) {
            var changedProfile = false;
            if (self.currentProfile !== CONFIG.profile) {
                self.setProfile();

                changedProfile = true;
            }

            var changedRateProfile = false;
            if (semver.gte(CONFIG.apiVersion, "1.20.0")
                && updateRateProfile
                && self.currentRateProfile !== CONFIG.rateProfile) {
                self.setRateProfile();

                changedRateProfile = true;
            }

            if (changedProfile || changedRateProfile) {
                self.refresh(function () {
                    if (changedProfile) {
                        GUI.log(i18n.getMessage('pidTuningReceivedProfile', [CONFIG.profile + 1]));
                        CONFIG.profile = self.currentProfile;
                    }

                    if (changedRateProfile) {
                        GUI.log(i18n.getMessage('pidTuningReceivedRateProfile', [CONFIG.rateProfile + 1]));
                        CONFIG.rateProfile = self.currentRateProfile
                    }
                });
            }
        }
    }
};

TABS.pid_tuning.checkRC = function() {
    // Function monitors for change in the primary axes rc received data and returns true if a change is detected.

    if (!this.oldRC) { this.oldRC = [RC.channels[0], RC.channels[1], RC.channels[2]]; }

    // Monitor RC.channels and detect change of value;
    var rateCurveUpdateRequired = false;
    for(var i=0; i<this.oldRC.length; i++) { // has the value changed ?
        if(this.oldRC[i] != RC.channels[i]) {
            this.oldRC[i] = RC.channels[i];
            rateCurveUpdateRequired = true;     // yes, then an update of the values displayed on the rate curve graph is required
        }
    }
    return rateCurveUpdateRequired;
};

TABS.pid_tuning.updatePidControllerParameters = function () {
    if (semver.gte(CONFIG.apiVersion, "1.20.0") && semver.lt(CONFIG.apiVersion, "1.31.0") && $('.tab-pid_tuning select[name="controller"]').val() === '0') {
        $('.pid_tuning .YAW_JUMP_PREVENTION').show();

        $('#pid-tuning .delta').show();

        $('#pid-tuning .dtermSetpointTransition').hide();
        $('#pid-tuning .dtermSetpoint').hide();
    } else {
        $('.pid_tuning .YAW_JUMP_PREVENTION').hide();

        if (semver.gte(CONFIG.apiVersion, "1.40.0")) {
            $('#pid-tuning .dtermSetpointTransition').hide();
            $('#pid-tuning .dtermSetpoint').hide();
        } else {
            $('#pid-tuning .dtermSetpointTransition').show();
            $('#pid-tuning .dtermSetpoint').show();
        }

        $('#pid-tuning .delta').hide();
    }
};

TABS.pid_tuning.updateRatesLabels = function() {
    var self = this;
    if (!self.rateCurve.useLegacyCurve && self.rateCurve.maxAngularVel) {

        var drawAxisLabel = function(context, axisLabel, x, y, align, color) {

            context.fillStyle = color || '#000000' ;
            context.textAlign = align || 'center';
            context.fillText(axisLabel, x, y);
        };

        var drawBalloonLabel = function(context, axisLabel, x, y, align, colors, dirty) {

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
            x += ((align=='right')?-(width + DEFAULT_OFFSET):0) + ((align=='left')?DEFAULT_OFFSET:0);
            y -= (height/2); if(y<0) y=0; else if(y>context.height) y=context.height; // prevent balloon from going out of canvas

            // check that the balloon does not already overlap
            for(var i=0; i<dirty.length; i++) {
                if((x>=dirty[i].left && x<=dirty[i].right) || (x+width>=dirty[i].left && x+width<=dirty[i].right)) { // does it overlap horizontally
                    if((y>=dirty[i].top && y<=dirty[i].bottom) || (y+height>=dirty[i].top && y+height<=dirty[i].bottom )) { // this overlaps another balloon
                        // snap above or snap below
                        if(y<=(dirty[i].bottom - dirty[i].top) / 2 && (dirty[i].top - height) > 0) {
                            y = dirty[i].top - height;
                        } else { // snap down
                            y = dirty[i].bottom;
                        }
                    }
                }
            }

            // Add the draw area to the dirty array
            dirty.push({left:x, right:x+width, top:y-DEFAULT_MARGIN, bottom:y+height+DEFAULT_MARGIN});


            var pointerLength =  (height - 2 * DEFAULT_RADIUS ) / 6;

            context.beginPath();
            context.moveTo(x + DEFAULT_RADIUS, y);
            context.lineTo(x + width - DEFAULT_RADIUS, y);
            context.quadraticCurveTo(x + width, y, x + width, y + DEFAULT_RADIUS);

            if(align=='right') { // point is to the right
                context.lineTo(x + width, y + DEFAULT_RADIUS + pointerLength);
                context.lineTo(x + width + DEFAULT_OFFSET, pointerY);  // point
                context.lineTo(x + width, y + height - DEFAULT_RADIUS - pointerLength);
            }
            context.lineTo(x + width, y + height - DEFAULT_RADIUS);

            context.quadraticCurveTo(x + width, y + height, x + width - DEFAULT_RADIUS, y + height);
            context.lineTo(x + DEFAULT_RADIUS, y + height);
            context.quadraticCurveTo(x, y + height, x, y + height - DEFAULT_RADIUS);

            if(align=='left') { // point is to the left
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
            yaw     : {color: 'rgba(128,128,255,0.4)', border: 'rgba(128,128,255,0.6)', text: '#000000'}
        };

        var rcStickElement = $('.rate_curve canvas#rate_curve_layer1').get(0);
        if(rcStickElement) {
            rcStickElement.width = 1000;
            rcStickElement.height = 1000;

            var stickContext = rcStickElement.getContext("2d");

            stickContext.save();

            var
                maxAngularVelRoll   = self.maxAngularVelRollElement.text()  + ' deg/s',
                maxAngularVelPitch  = self.maxAngularVelPitchElement.text() + ' deg/s',
                maxAngularVelYaw    = self.maxAngularVelYawElement.text()   + ' deg/s',
                currentValues       = [],
                balloonsDirty       = [],
                curveHeight         = rcStickElement.height,
                curveWidth          = rcStickElement.width,
                maxAngularVel       = self.rateCurve.maxAngularVel,
                windowScale         = (400 / stickContext.canvas.clientHeight),
                rateScale           = (curveHeight / 2) / maxAngularVel,
                lineScale           = stickContext.canvas.width / stickContext.canvas.clientWidth,
                textScale           = stickContext.canvas.clientHeight / stickContext.canvas.clientWidth;


            stickContext.clearRect(0, 0, curveWidth, curveHeight);

            // calculate the fontSize based upon window scaling
            if(windowScale <= 1) {
                stickContext.font = "24pt Verdana, Arial, sans-serif";
            } else {
                stickContext.font = (24 * windowScale) + "pt Verdana, Arial, sans-serif";
            }

            if(RC.channels[0] && RC.channels[1] && RC.channels[2]) {
                currentValues.push(self.rateCurve.drawStickPosition(RC.channels[0], self.currentRates.roll_rate, self.currentRates.rc_rate, self.currentRates.rc_expo, self.currentRates.superexpo, self.currentRates.deadband, self.currentRates.roll_rate_limit, maxAngularVel, stickContext, '#FF8080') + ' deg/s');
                currentValues.push(self.rateCurve.drawStickPosition(RC.channels[1], self.currentRates.pitch_rate, self.currentRates.rc_rate_pitch, self.currentRates.rc_pitch_expo, self.currentRates.superexpo, self.currentRates.deadband, self.currentRates.pitch_rate_limit, maxAngularVel, stickContext, '#80FF80') + ' deg/s');
                currentValues.push(self.rateCurve.drawStickPosition(RC.channels[2], self.currentRates.yaw_rate, self.currentRates.rc_rate_yaw, self.currentRates.rc_yaw_expo, self.currentRates.superexpo, self.currentRates.yawDeadband, self.currentRates.yaw_rate_limit, maxAngularVel, stickContext, '#8080FF') + ' deg/s');
            } else {
                currentValues = [];
            }

            stickContext.lineWidth = lineScale;

            // use a custom scale so that the text does not appear stretched
            stickContext.scale(textScale, 1);

            // add the maximum range label
            drawAxisLabel(stickContext, maxAngularVel.toFixed(0) + ' deg/s', ((curveWidth / 2) - 10) / textScale, parseInt(stickContext.font)*1.2, 'right');

            // and then the balloon labels.
            balloonsDirty = []; // reset the dirty balloon draw area (for overlap detection)
            // create an array of balloons to draw
            var balloons = [
                {value: parseInt(maxAngularVelRoll), balloon: function() {drawBalloonLabel(stickContext, maxAngularVelRoll,  curveWidth, rateScale * (maxAngularVel - parseInt(maxAngularVelRoll)),  'right', BALLOON_COLORS.roll, balloonsDirty);}},
                {value: parseInt(maxAngularVelPitch), balloon: function() {drawBalloonLabel(stickContext, maxAngularVelPitch, curveWidth, rateScale * (maxAngularVel - parseInt(maxAngularVelPitch)), 'right', BALLOON_COLORS.pitch, balloonsDirty);}},
                {value: parseInt(maxAngularVelYaw), balloon: function() {drawBalloonLabel(stickContext, maxAngularVelYaw,   curveWidth, rateScale * (maxAngularVel - parseInt(maxAngularVelYaw)),   'right', BALLOON_COLORS.yaw, balloonsDirty);}}
            ];
            // and sort them in descending order so the largest value is at the top always
            balloons.sort(function(a,b) {return (b.value - a.value)});

            // add the current rc values
            if(currentValues[0] && currentValues[1] && currentValues[2]) {
                balloons.push(
                    {value: parseInt(currentValues[0]), balloon: function() {drawBalloonLabel(stickContext, currentValues[0], 10, 150, 'none', BALLOON_COLORS.roll, balloonsDirty);}},
                    {value: parseInt(currentValues[1]), balloon: function() {drawBalloonLabel(stickContext, currentValues[1], 10, 250, 'none', BALLOON_COLORS.pitch, balloonsDirty);}},
                    {value: parseInt(currentValues[2]), balloon: function() {drawBalloonLabel(stickContext, currentValues[2], 10, 350,  'none', BALLOON_COLORS.yaw, balloonsDirty);}}
                );
            }
            // then display them on the chart
            for(var i=0; i<balloons.length; i++) balloons[i].balloon();

            stickContext.restore();
        }
    }
};

TABS.pid_tuning.updateFilterWarning = function() {
    var gyroDynamicLowpassEnabled = $('input[id="gyroLowpassDynEnabled"]').is(':checked');
    var gyroLowpass1Enabled = $('input[id="gyroLowpassEnabled"]').is(':checked');
    var dtermDynamicLowpassEnabled = $('input[id="dtermLowpassDynEnabled"]').is(':checked');
    var dtermLowpass1Enabled = $('input[id="dtermLowpassEnabled"]').is(':checked');
    var warning_e = $('#pid-tuning .filterWarning');
    var warningDynamicNotch_e = $('#pid-tuning .dynamicNotchWarning');
    if (!(gyroDynamicLowpassEnabled || gyroLowpass1Enabled) || !(dtermDynamicLowpassEnabled || dtermLowpass1Enabled)) {
        warning_e.show();
    } else {
        warning_e.hide();
    }
    if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
        if (FEATURE_CONFIG.features.isEnabled('DYNAMIC_FILTER')) {
            warningDynamicNotch_e.hide();
        } else {
            warningDynamicNotch_e.show();
        }
    } else {
        warningDynamicNotch_e.hide();
    }
}
