'use strict';

TABS.configuration = {
    DSHOT_PROTOCOL_MIN_VALUE: 5,
    SHOW_OLD_BATTERY_CONFIG: false,
    analyticsChanges: {},
};

TABS.configuration.initialize = function (callback, scrollPosition) {
    var self = this;

    if (GUI.active_tab != 'configuration') {
        GUI.active_tab = 'configuration';
        GUI.configuration_loaded = true;
    }

    if (semver.lt(CONFIG.apiVersion, "1.36.0")) {
        //Show old battery configuration for pre-BF-3.2
        self.SHOW_OLD_BATTERY_CONFIG = true;
    } else {
        self.SHOW_OLD_BATTERY_CONFIG = false;
    }

    function load_config() {
        MSP.send_message(MSPCodes.MSP_FEATURE_CONFIG, false, false, load_beeper_config);
    }

    function load_beeper_config() {
        var next_callback = load_serial_config;
        if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
            MSP.send_message(MSPCodes.MSP_BEEPER_CONFIG, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function load_serial_config() {
        MSP.send_message(MSPCodes.MSP_CF_SERIAL_CONFIG, false, false, load_board_alignment_config);
    }

    function load_board_alignment_config() {
        MSP.send_message(MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG, false, false, load_rc_map);
    }

    function load_rc_map() {
        MSP.send_message(MSPCodes.MSP_RX_MAP, false, false, load_mixer_config);
    }

    function load_mixer_config() {
        MSP.send_message(MSPCodes.MSP_MIXER_CONFIG, false, false, load_rssi_config);
    }

    function load_rssi_config() {
        MSP.send_message(MSPCodes.MSP_RSSI_CONFIG, false, false, load_motor_config);
    }

    function load_motor_config() {
        var next_callback = load_compass_config;
        if(semver.gte(CONFIG.apiVersion, "1.33.0")) {
            MSP.send_message(MSPCodes.MSP_MOTOR_CONFIG, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function load_compass_config() {
        var next_callback = load_gps_config;
        if(semver.gte(CONFIG.apiVersion, "1.33.0")) {
            MSP.send_message(MSPCodes.MSP_COMPASS_CONFIG, false, false, load_gps_config);
        } else {
            next_callback();
        }
    }

    function load_gps_config() {
        var next_callback = load_acc_trim;
        if(semver.gte(CONFIG.apiVersion, "1.33.0")) {
            MSP.send_message(MSPCodes.MSP_GPS_CONFIG, false, false, load_acc_trim);
        } else {
            next_callback();
        }
    }

    function load_acc_trim() {
        MSP.send_message(MSPCodes.MSP_ACC_TRIM, false, false, load_misc);
    }

    function load_misc() {
        var next_callback = load_arming_config;
        if (semver.lt(CONFIG.apiVersion, "1.33.0")) {
            MSP.send_message(MSPCodes.MSP_MISC, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function load_arming_config() {
        var next_callback = load_3d;
        if (semver.gte(CONFIG.apiVersion, "1.8.0")) {
            MSP.send_message(MSPCodes.MSP_ARMING_CONFIG, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function load_3d() {
        var next_callback = load_rc_deadband;
        if (semver.gte(CONFIG.apiVersion, "1.14.0")) {
            MSP.send_message(MSPCodes.MSP_MOTOR_3D_CONFIG, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function load_rc_deadband() {
        var next_callback = esc_protocol;
        if (semver.gte(CONFIG.apiVersion, "1.17.0")) {
            MSP.send_message(MSPCodes.MSP_RC_DEADBAND, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function esc_protocol() {
        var next_callback = sensor_config;
        if (semver.gte(CONFIG.apiVersion, "1.16.0")) {
            MSP.send_message(MSPCodes.MSP_ADVANCED_CONFIG, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function sensor_config() {
        var next_callback = load_sensor_alignment;
        if (semver.gte(CONFIG.apiVersion, "1.16.0")) {
            MSP.send_message(MSPCodes.MSP_SENSOR_CONFIG, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function load_sensor_alignment() {
        var next_callback = load_name;
        if (semver.gte(CONFIG.apiVersion, "1.15.0")) {
            MSP.send_message(MSPCodes.MSP_SENSOR_ALIGNMENT, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function load_name() {
        var next_callback = load_rx_config;

        if (self.SHOW_OLD_BATTERY_CONFIG) {
            next_callback = load_battery;
        }

        if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
            MSP.send_message(MSPCodes.MSP_NAME, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function load_battery() {
        var next_callback = load_current;
        if (semver.gte(CONFIG.flightControllerVersion, "3.1.0")) {
            MSP.send_message(MSPCodes.MSP_VOLTAGE_METER_CONFIG, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function load_current() {
        var next_callback = load_rx_config;
        if (semver.gte(CONFIG.flightControllerVersion, "3.1.0")) {
            MSP.send_message(MSPCodes.MSP_CURRENT_METER_CONFIG, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function load_rx_config() {
        var next_callback = load_html;
        if (semver.gte(CONFIG.apiVersion, "1.31.0")) {
            MSP.send_message(MSPCodes.MSP_RX_CONFIG, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function load_html() {
        $('#content').load("./tabs/configuration.html", process_html);
    }

    load_config();

    function process_html() {
        self.analyticsChanges = {};

        var mixer_list_e = $('select.mixerList');
        for (var selectIndex = 0; selectIndex < mixerList.length; selectIndex++) {
            mixerList.forEach(function (mixerEntry, mixerIndex) {
                if (mixerEntry.pos === selectIndex) {
                    mixer_list_e.append('<option value="' + (mixerIndex + 1) + '">' + mixerEntry.name + '</option>');
                }
            });
        }

        function refreshMixerPreview() {
            var mixer = MIXER_CONFIG.mixer
            var reverse = "";

            if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                reverse = MIXER_CONFIG.reverseMotorDir ? "_reversed" : "";
            }

            $('.mixerPreview img').attr('src', './resources/motor_order/' + mixerList[mixer - 1].image + reverse + '.svg');
        };

        var reverseMotorSwitch_e = $('#reverseMotorSwitch');
        var reverseMotor_e = $('.reverseMotor');

        reverseMotorSwitch_e.change(function() {
            MIXER_CONFIG.reverseMotorDir = $(this).prop('checked') ? 1 : 0;
            refreshMixerPreview();
        });
        reverseMotorSwitch_e.prop('checked', MIXER_CONFIG.reverseMotorDir != 0).change();

        mixer_list_e.change(function () {
            var mixerValue = parseInt($(this).val());

            var newValue;
            if (mixerValue !== MIXER_CONFIG.mixer) {
                newValue = $(this).find('option:selected').text();
            }
            self.analyticsChanges['Mixer'] = newValue;

            MIXER_CONFIG.mixer = mixerValue;
            refreshMixerPreview();
        });

        // select current mixer configuration
        mixer_list_e.val(MIXER_CONFIG.mixer).change();

        var features_e = $('.tab-configuration .features');

        FEATURE_CONFIG.features.generateElements(features_e);

        // Dshot Beeper
        var dshotBeeper_e = $('.tab-configuration .dshotbeeper');
        var dshotBeacon_e = $('.tab-configuration .dshotbeacon');
        var dshotBeeperSwitch = $('#dshotBeeperSwitch');
        var dshotBeeperBeaconTone = $('select.dshotBeeperBeaconTone');
        var dshotBeaconCondition_e = $('tbody.dshotBeaconConditions');
        var dshotBeaconSwitch_e = $('tr.dshotBeaconSwitch');

        if (semver.gte(CONFIG.apiVersion, "1.37.0")) {
            for (var i = 1; i <= 5; i++) {
                dshotBeeperBeaconTone.append('<option value="' + (i) + '">'+ (i) + '</option>');
            }
            dshotBeeper_e.show();
        } else {
            dshotBeeper_e.hide();
        }

        dshotBeeperBeaconTone.change(function() {
            BEEPER_CONFIG.dshotBeaconTone = dshotBeeperBeaconTone.val();
        });

        dshotBeeperBeaconTone.val(BEEPER_CONFIG.dshotBeaconTone);

        var template = $('.beepers .beeper-template');
        if (semver.gte(CONFIG.apiVersion, "1.39.0")) {
            dshotBeaconSwitch_e.hide();
            BEEPER_CONFIG.dshotBeaconConditions.generateElements(template, dshotBeaconCondition_e);

            $('input.condition', dshotBeaconCondition_e).change(function () {
                var element = $(this);
                BEEPER_CONFIG.dshotBeaconConditions.updateData(element);
            });
        } else {
            dshotBeaconCondition_e.hide();

            dshotBeeperSwitch.change(function() {
                if ($(this).is(':checked')) {
                    dshotBeacon_e.show();
                    if (dshotBeeperBeaconTone.val() == 0) {
                        dshotBeeperBeaconTone.val(1).change();
                    }
                } else {
                    dshotBeeperBeaconTone.val(0).change();
                    dshotBeacon_e.hide();
                }
            });

            dshotBeeperSwitch.prop('checked', BEEPER_CONFIG.dshotBeaconTone !== 0).change();
        }

        // Analog Beeper
        var destination = $('.beepers .beeper-configuration');
        var beeper_e = $('.tab-configuration .beepers');

        if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
            BEEPER_CONFIG.beepers.generateElements(template, destination);
        } else {
            beeper_e.hide();
            reverseMotor_e.hide();
        }

        // translate to user-selected language
        i18n.localizePage();

        var alignments = [
            'CW 0°',
            'CW 90°',
            'CW 180°',
            'CW 270°',
            'CW 0° flip',
            'CW 90° flip',
            'CW 180° flip',
            'CW 270° flip'
        ];

        if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
            alignments.push('Custom');
        }

        var gyro_align_content_e = $('.tab-configuration .gyro_align_content');
        var legacy_gyro_alignment_e = $('.tab-configuration .legacy_gyro_alignment');
        var legacy_accel_alignment_e = $('.tab-configuration .legacy_accel_alignment');

        var orientation_gyro_e = $('select.gyroalign');
        var orientation_acc_e = $('select.accalign');
        var orientation_mag_e = $('select.magalign');

        var orientation_gyro_to_use_e = $('select.gyro_to_use');
        var orientation_gyro_1_align_e = $('select.gyro_1_align');
        var orientation_gyro_2_align_e = $('select.gyro_2_align');

        gyro_align_content_e.hide(); // default value
        if (semver.lt(CONFIG.apiVersion, "1.15.0")) {
            $('.tab-configuration .sensoralignment').hide();
        } else {

            for (var i = 0; i < alignments.length; i++) {
                orientation_gyro_e.append('<option value="' + (i+1) + '">'+ alignments[i] + '</option>');
                orientation_acc_e.append('<option value="' + (i+1) + '">'+ alignments[i] + '</option>');
                orientation_mag_e.append('<option value="' + (i+1) + '">'+ alignments[i] + '</option>');
            }

            orientation_gyro_e.val(SENSOR_ALIGNMENT.align_gyro);
            orientation_acc_e.val(SENSOR_ALIGNMENT.align_acc);
            orientation_mag_e.val(SENSOR_ALIGNMENT.align_mag);

            // Multi gyro config
            if (semver.gte(CONFIG.apiVersion, "1.41.0")) {

                gyro_align_content_e.show();
                legacy_gyro_alignment_e.hide();
                legacy_accel_alignment_e.hide();

                const GYRO_DETECTION_FLAGS = {
                        DETECTED_GYRO_1:      (1 << 0), 
                        DETECTED_GYRO_2:      (1 << 1),
                        DETECTED_DUAL_GYROS:  (1 << 7)
                };

                var detected_gyro_1 = (SENSOR_ALIGNMENT.gyro_detection_flags & GYRO_DETECTION_FLAGS.DETECTED_GYRO_1) != 0;
                var detected_gyro_2 = (SENSOR_ALIGNMENT.gyro_detection_flags & GYRO_DETECTION_FLAGS.DETECTED_GYRO_2) != 0;
                var detected_dual_gyros = (SENSOR_ALIGNMENT.gyro_detection_flags & GYRO_DETECTION_FLAGS.DETECTED_DUAL_GYROS) != 0;

                if (detected_gyro_1) {
                    orientation_gyro_to_use_e.append('<option value="0">'+ i18n.getMessage('configurationSensorGyroToUseFirst') + '</option>');
                }
                if (detected_gyro_2) {
                    orientation_gyro_to_use_e.append('<option value="1">'+ i18n.getMessage('configurationSensorGyroToUseSecond') + '</option>');
                }
                if (detected_dual_gyros) {
                    orientation_gyro_to_use_e.append('<option value="2">'+ i18n.getMessage('configurationSensorGyroToUseBoth') + '</option>');
                }

                for (var i = 0; i < alignments.length; i++) {
                    orientation_gyro_1_align_e.append('<option value="' + (i+1) + '">'+ alignments[i] + '</option>');
                    orientation_gyro_2_align_e.append('<option value="' + (i+1) + '">'+ alignments[i] + '</option>');
                }

                orientation_gyro_to_use_e.val(SENSOR_ALIGNMENT.gyro_to_use);
                orientation_gyro_1_align_e.val(SENSOR_ALIGNMENT.gyro_1_align);
                orientation_gyro_2_align_e.val(SENSOR_ALIGNMENT.gyro_2_align);

                $('.gyro_alignment_inputs_first').toggle(detected_gyro_1);
                $('.gyro_alignment_inputs_second').toggle(detected_gyro_2);
                $('.gyro_alignment_inputs_selection').toggle(detected_gyro_1 || detected_gyro_2);
                $('.gyro_alignment_inputs_notfound').toggle(!detected_gyro_1 && !detected_gyro_2);
            }
        }

        // ESC protocols
        var escprotocols = [
            'PWM',
            'ONESHOT125',
            'ONESHOT42',
            'MULTISHOT'
        ];

        if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
            escprotocols.push('BRUSHED');
        }

        if (semver.gte(CONFIG.apiVersion, "1.31.0")) {
            escprotocols.push('DSHOT150');
            escprotocols.push('DSHOT300');
            escprotocols.push('DSHOT600');
            if (semver.lt(CONFIG.apiVersion, "1.42.0")) {
                escprotocols.push('DSHOT1200');
            }
            if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                escprotocols.push('PROSHOT1000');
            }
        }

        var esc_protocol_e = $('select.escprotocol');

        for (var i = 0; i < escprotocols.length; i++) {
            esc_protocol_e.append('<option value="' + (i + 1) + '">'+ escprotocols[i] + '</option>');
        }

        $("input[id='unsyncedPWMSwitch']").change(function() {
            if ($(this).is(':checked')) {
                $('div.unsyncedpwmfreq').show();
            } else {
                $('div.unsyncedpwmfreq').hide();
            }
        });

        $('input[id="unsyncedPWMSwitch"]').prop('checked', PID_ADVANCED_CONFIG.use_unsyncedPwm !== 0).change();
        $('input[name="unsyncedpwmfreq"]').val(PID_ADVANCED_CONFIG.motor_pwm_rate);
        $('input[name="digitalIdlePercent"]').val(PID_ADVANCED_CONFIG.digitalIdlePercent);
        $('input[id="dshotBidir"]').prop('checked', MOTOR_CONFIG.use_dshot_telemetry).change();
        $('input[name="motorPoles"]').val(MOTOR_CONFIG.motor_poles);

        esc_protocol_e.val(PID_ADVANCED_CONFIG.fast_pwm_protocol + 1);
        esc_protocol_e.change(function () {
            var escProtocolValue = parseInt($(this).val()) - 1;

            var newValue;
            if (escProtocolValue !== PID_ADVANCED_CONFIG.fast_pwm_protocol) {
                newValue = $(this).find('option:selected').text();
            }
            self.analyticsChanges['EscProtocol'] = newValue;

            //hide not used setting for DSHOT protocol
            let digitalProtocol = (escProtocolValue >= self.DSHOT_PROTOCOL_MIN_VALUE);

            $('div.minthrottle').toggle(!digitalProtocol);
            $('div.maxthrottle').toggle(!digitalProtocol);
            $('div.mincommand').toggle(!digitalProtocol);
            $('div.checkboxPwm').toggle(!digitalProtocol);
            $('div.unsyncedpwmfreq').toggle(!digitalProtocol);

            $('div.digitalIdlePercent').toggle(digitalProtocol);

            $('div.checkboxDshotBidir').toggle(semver.gte(CONFIG.apiVersion, "1.42.0") && digitalProtocol);
            $('div.motorPoles').toggle(semver.gte(CONFIG.apiVersion, "1.42.0"));

            //trigger change unsyncedPWMSwitch to show/hide Motor PWM freq input
            $("input[id='unsyncedPWMSwitch']").change();

        }).change();


        // Gyro and PID update
        var gyroUse32kHz_e = $('input[id="gyroUse32kHz"]');
        var gyro_select_e = $('select.gyroSyncDenom');
        var pid_select_e = $('select.pidProcessDenom');

         function addDenomOption(element, denom, baseFreq) {
            element.append('<option value="' + denom + '">' + ((baseFreq / denom * 100).toFixed(0) / 100) + ' kHz</option>');
        }

        var updateGyroDenom = function (gyroBaseFreq) {
            var originalGyroDenom = gyro_select_e.val();

            gyro_select_e.empty();

            var denom = 1;
            while (denom <= 8) {
                addDenomOption(gyro_select_e, denom, gyroBaseFreq);
                denom ++;
            }

            if (semver.gte(CONFIG.apiVersion, "1.25.0")) {
                while (denom <= 32) {
                     addDenomOption(gyro_select_e, denom, gyroBaseFreq);

                     denom ++;
                }
            }

            gyro_select_e.val(originalGyroDenom);

            gyro_select_e.change();
        };

        if (semver.gte(CONFIG.apiVersion, "1.25.0") && semver.lt(CONFIG.apiVersion, "1.41.0")) {
            gyroUse32kHz_e.prop('checked', PID_ADVANCED_CONFIG.gyroUse32kHz !== 0);

            gyroUse32kHz_e.change(function () {
                var gyroBaseFreq;
                if ($(this).is(':checked')) {
                    gyroBaseFreq = 32;
                } else {
                    gyroBaseFreq = 8;
                }

                updateGyroDenom(gyroBaseFreq);
            }).change();
        } else {
            $('div.gyroUse32kHz').hide();

            updateGyroDenom(8);
        }


        if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
            $('.systemconfigNote').html(i18n.getMessage('configurationLoopTimeNo32KhzHelp'));
        } else {
            $('.systemconfigNote').html(i18n.getMessage('configurationLoopTimeHelp'));
        }

        gyro_select_e.val(PID_ADVANCED_CONFIG.gyro_sync_denom);

        gyro_select_e.change(function () {
            var originalPidDenom = pid_select_e.val();

            var pidBaseFreq = 8;
            if (semver.gte(CONFIG.apiVersion, "1.25.0") && semver.lt(CONFIG.apiVersion, "1.41.0") && gyroUse32kHz_e.is(':checked')) {
                pidBaseFreq = 32;
            }

            pidBaseFreq = pidBaseFreq / parseInt($(this).val());

            pid_select_e.empty();

            var denom = 1;

            while (denom <= 8) {
                addDenomOption(pid_select_e, denom, pidBaseFreq);
                denom ++;
            }

            if (semver.gte(CONFIG.apiVersion, "1.24.0")) {
                while (denom <= 16) {
                    addDenomOption(pid_select_e, denom, pidBaseFreq);

                    denom ++;
                }
            }

            pid_select_e.val(originalPidDenom);
        }).change();

        pid_select_e.val(PID_ADVANCED_CONFIG.pid_process_denom);

        $('input[id="accHardwareSwitch"]').prop('checked', SENSOR_CONFIG.acc_hardware !== 1);
        $('input[id="baroHardwareSwitch"]').prop('checked', SENSOR_CONFIG.baro_hardware !== 1);
        $('input[id="magHardwareSwitch"]').prop('checked', SENSOR_CONFIG.mag_hardware !== 1);

        // Only show these sections for supported FW
        if (semver.lt(CONFIG.apiVersion, "1.16.0")) {
            $('.selectProtocol').hide();
            $('.checkboxPwm').hide();
            $('.selectPidProcessDenom').hide();
        }

        if (semver.lt(CONFIG.apiVersion, "1.16.0")) {
            $('.hardwareSelection').hide();
        }

        $('input[name="craftName"]').val(CONFIG.name);

        if (semver.gte(CONFIG.apiVersion, "1.31.0")) {
            $('input[name="fpvCamAngleDegrees"]').val(RX_CONFIG.fpvCamAngleDegrees);
            if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                $('input[name="fpvCamAngleDegrees"]').attr("max", 90);
            }
        } else {
            $('div.fpvCamAngleDegrees').hide();
        }

        if (semver.lt(CONFIG.apiVersion, "1.20.0")) {
            $('.miscSettings').hide();
        }

        // generate GPS
        var gpsProtocols = [
            'NMEA',
            'UBLOX'
        ];
        if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
            gpsProtocols.push('MSP');
        }

        var gpsBaudRates = [
            '115200',
            '57600',
            '38400',
            '19200',
            '9600'
        ];

        var gpsSbas = [
            'Auto-detect',
            'European EGNOS',
            'North American WAAS',
            'Japanese MSAS',
            'Indian GAGAN'
        ];

        var gps_protocol_e = $('select.gps_protocol');
        for (var i = 0; i < gpsProtocols.length; i++) {
            gps_protocol_e.append('<option value="' + i + '">' + gpsProtocols[i] + '</option>');
        }

        gps_protocol_e.change(function () {
            GPS_CONFIG.provider = parseInt($(this).val());
        });

        gps_protocol_e.val(GPS_CONFIG.provider);

        $('input[name="gps_auto_baud"]').prop('checked', GPS_CONFIG.auto_baud == 1);
        $('input[name="gps_auto_config"]').prop('checked', GPS_CONFIG.auto_config == 1);
        if (semver.gte(CONFIG.apiVersion, "1.34.0")) {
            $('.select.gps_auto_baud').show();
            $('.select.gps_auto_config').show();
        } else {
            $('.select.gps_auto_baud').hide();
            $('.select.gps_auto_config').hide();
        }

        var gps_baudrate_e = $('select.gps_baudrate');
        for (var i = 0; i < gpsBaudRates.length; i++) {
            gps_baudrate_e.append('<option value="' + gpsBaudRates[i] + '">' + gpsBaudRates[i] + '</option>');
        }

        if (semver.lt(CONFIG.apiVersion, "1.6.0")) {
            gps_baudrate_e.change(function () {
                SERIAL_CONFIG.gpsBaudRate = parseInt($(this).val());
            });
            gps_baudrate_e.val(SERIAL_CONFIG.gpsBaudRate);
        } else {
            gps_baudrate_e.prop("disabled", true);
            gps_baudrate_e.parent().hide();
        }


        var gps_ubx_sbas_e = $('select.gps_ubx_sbas');
        for (var i = 0; i < gpsSbas.length; i++) {
            gps_ubx_sbas_e.append('<option value="' + i + '">' + gpsSbas[i] + '</option>');
        }

        gps_ubx_sbas_e.change(function () {
            GPS_CONFIG.ublox_sbas = parseInt($(this).val());
        });

        gps_ubx_sbas_e.val(GPS_CONFIG.ublox_sbas);


        // generate serial RX
        var serialRXtypes = [
            'SPEKTRUM1024',
            'SPEKTRUM2048',
            'SBUS',
            'SUMD',
            'SUMH',
            'XBUS_MODE_B',
            'XBUS_MODE_B_RJ01'
        ];

        if (semver.gte(CONFIG.apiVersion, "1.15.0")) {
            serialRXtypes.push('IBUS');
        }

        if ((CONFIG.flightControllerIdentifier === 'BTFL' && semver.gte(CONFIG.flightControllerVersion, "2.6.0")) ||
            (CONFIG.flightControllerIdentifier === 'CLFL' && semver.gte(CONFIG.apiVersion, "1.31.0"))) {
            serialRXtypes.push('JETIEXBUS');
        }

        if (semver.gte(CONFIG.apiVersion, "1.31.0"))  {
            serialRXtypes.push('CRSF');
        }

        if (semver.gte(CONFIG.apiVersion, "1.24.0"))  {
            serialRXtypes.push('SPEKTRUM2048/SRXL');
        }

        if (semver.gte(CONFIG.apiVersion, "1.35.0"))  {
            serialRXtypes.push('TARGET_CUSTOM');
        }

        if (semver.gte(CONFIG.apiVersion, "1.37.0"))  {
            serialRXtypes.push('FrSky FPort');
        }

        if (semver.gte(CONFIG.apiVersion, "1.42.0"))  {
            serialRXtypes.push('SPEKTRUM SRXL2');
        }

        var serialRX_e = $('select.serialRX');
        for (var i = 0; i < serialRXtypes.length; i++) {
            serialRX_e.append('<option value="' + i + '">' + serialRXtypes[i] + '</option>');
        }

        serialRX_e.change(function () {
            var serialRxValue = parseInt($(this).val());

            var newValue;
            if (serialRxValue !== RX_CONFIG.serialrx_provider) {
                newValue = $(this).find('option:selected').text();
            }
            self.analyticsChanges['SerialRx'] = newValue;

            RX_CONFIG.serialrx_provider = serialRxValue;
        });

        // select current serial RX type
        serialRX_e.val(RX_CONFIG.serialrx_provider);

        if (semver.gte(CONFIG.apiVersion, "1.31.0")) {
            var spiRxTypes = [
                'NRF24_V202_250K',
                'NRF24_V202_1M',
                'NRF24_SYMA_X',
                'NRF24_SYMA_X5C',
                'NRF24_CX10',
                'CX10A',
                'NRF24_H8_3D',
                'NRF24_INAV',
                'FRSKY_D'
            ];

            if (semver.gte(CONFIG.apiVersion, "1.37.0")) {
                spiRxTypes.push(
                    'FRSKY_X',
                    'A7105_FLYSKY',
                    'A7105_FLYSKY_2A',
                    'NRF24_KN'
                );
            }

            if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                spiRxTypes.push(
                    'SFHSS',
                    'SPEKTRUM',
                    'FRSKY_X_LBT'
                );
            }

            var spiRx_e = $('select.spiRx');
            for (var i = 0; i < spiRxTypes.length; i++) {
                spiRx_e.append('<option value="' + i + '">' + spiRxTypes[i] + '</option>');
            }

            spiRx_e.change(function () {
                RX_CONFIG.rxSpiProtocol = parseInt($(this).val());
            });

            // select current serial RX type
            spiRx_e.val(RX_CONFIG.rxSpiProtocol);
            }

        // for some odd reason chrome 38+ changes scroll according to the touched select element
        // i am guessing this is a bug, since this wasn't happening on 37
        // code below is a temporary fix, which we will be able to remove in the future (hopefully)
        $('#content').scrollTop((scrollPosition) ? scrollPosition : 0);

        // fill board alignment
        $('input[name="board_align_roll"]').val(BOARD_ALIGNMENT_CONFIG.roll);
        $('input[name="board_align_pitch"]').val(BOARD_ALIGNMENT_CONFIG.pitch);
        $('input[name="board_align_yaw"]').val(BOARD_ALIGNMENT_CONFIG.yaw);

        // fill accel trims
        $('input[name="roll"]').val(CONFIG.accelerometerTrims[1]);
        $('input[name="pitch"]').val(CONFIG.accelerometerTrims[0]);

        // fill magnetometer
        $('input[name="mag_declination"]').val(COMPASS_CONFIG.mag_declination.toFixed(2));

        //fill motor disarm params and FC loop time
        if(semver.gte(CONFIG.apiVersion, "1.8.0")) {
            $('input[name="autodisarmdelay"]').val(ARMING_CONFIG.auto_disarm_delay);
            $('input[id="disarmkillswitch"]').prop('checked', ARMING_CONFIG.disarm_kill_switch !== 0);
            $('div.disarm').show();

            $('div.cycles').show();
        }

        if(semver.gte(CONFIG.apiVersion, "1.37.0") || !isExpertModeEnabled()) {
            $('input[id="disarmkillswitch"]').prop('checked', true);
            $('div.disarm').hide();
        }

        $('._smallAngle').hide();
        if(semver.gte(CONFIG.apiVersion, "1.37.0")) {
            $('input[id="configurationSmallAngle"]').val(ARMING_CONFIG.small_angle);
            if (SENSOR_CONFIG.acc_hardware !== 1) {
              $('._smallAngle').show();
            }
        }

        // fill throttle
        $('input[name="minthrottle"]').val(MOTOR_CONFIG.minthrottle);
        $('input[name="maxthrottle"]').val(MOTOR_CONFIG.maxthrottle);
        $('input[name="mincommand"]').val(MOTOR_CONFIG.mincommand);

        // fill battery
        if (self.SHOW_OLD_BATTERY_CONFIG) {
            if (semver.gte(CONFIG.flightControllerVersion, "3.1.0")) {
                var batteryMeterTypes = [
                    'Onboard ADC',
                    'ESC Sensor'
                ];

                var batteryMeterType_e = $('select.batterymetertype');
                for (i = 0; i < batteryMeterTypes.length; i++) {
                    batteryMeterType_e.append('<option value="' + i + '">' + batteryMeterTypes[i] + '</option>');
                }

                batteryMeterType_e.change(function () {
                    MISC.batterymetertype = parseInt($(this).val());
                    checkUpdateVbatControls();
                });
                batteryMeterType_e.val(MISC.batterymetertype).change();
            } else {
                $('div.batterymetertype').hide();
            }

            if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                $('input[name="mincellvoltage"]').prop('step','0.01');
                $('input[name="maxcellvoltage"]').prop('step','0.01');
                $('input[name="warningcellvoltage"]').prop('step','0.01');
            }

            $('input[name="mincellvoltage"]').val(MISC.vbatmincellvoltage);
            $('input[name="maxcellvoltage"]').val(MISC.vbatmaxcellvoltage);
            $('input[name="warningcellvoltage"]').val(MISC.vbatwarningcellvoltage);
            $('input[name="voltagescale"]').val(MISC.vbatscale);

            // fill current
            var currentMeterTypes = [
                'None',
                'Onboard ADC',
                'Virtual'
            ];

            if (semver.gte(CONFIG.flightControllerVersion, "3.1.0")) {
                currentMeterTypes.push('ESC Sensor');
            }

            var currentMeterType_e = $('select.currentmetertype');
            for (i = 0; i < currentMeterTypes.length; i++) {
                currentMeterType_e.append('<option value="' + i + '">' + currentMeterTypes[i] + '</option>');
            }

            currentMeterType_e.change(function () {
                BF_CONFIG.currentmetertype = parseInt($(this).val());
                checkUpdateCurrentControls();
            });
            currentMeterType_e.val(BF_CONFIG.currentmetertype).change();

            $('input[name="currentscale"]').val(BF_CONFIG.currentscale);
            $('input[name="currentoffset"]').val(BF_CONFIG.currentoffset);
            $('input[name="multiwiicurrentoutput"]').prop('checked', MISC.multiwiicurrentoutput !== 0);
        } else {
            $('.oldBatteryConfig').hide();
        }

        function checkUpdateVbatControls() {
            if (FEATURE_CONFIG.features.isEnabled('VBAT')) {
                $('.vbatmonitoring').show();

                if (semver.gte(CONFIG.flightControllerVersion, "3.1.0")) {
                     $('select.batterymetertype').show();

                    if (MISC.batterymetertype !== 0) {
                        $('.vbatCalibration').hide();
                     }
                } else {
                    $('select.batterymetertype').hide();
                }
            } else {
                $('.vbatmonitoring').hide();
            }
        }

        function checkUpdateCurrentControls() {
            if (FEATURE_CONFIG.features.isEnabled('CURRENT_METER')) {
                $('.currentMonitoring').show();

                switch(BF_CONFIG.currentmetertype) {
                    case 0:
                        $('.currentCalibration').hide();
                        $('.currentOutput').hide();

                        break;
                    case 3:
                        $('.currentCalibration').hide();
                }

                if (BF_CONFIG.currentmetertype !== 1 && BF_CONFIG.currentmetertype !== 2) {
                    $('.currentCalibration').hide();
                }
            } else {
                $('.currentMonitoring').hide();
            }
        }

        //fill 3D
        if (semver.lt(CONFIG.apiVersion, "1.14.0")) {
            $('.tab-configuration ._3d').hide();
        } else {
            $('input[name="3ddeadbandlow"]').val(MOTOR_3D_CONFIG.deadband3d_low);
            $('input[name="3ddeadbandhigh"]').val(MOTOR_3D_CONFIG.deadband3d_high);
            $('input[name="3dneutral"]').val(MOTOR_3D_CONFIG.neutral);
        }

        // UI hooks
        function checkShowDisarmDelay() {
            if (FEATURE_CONFIG.features.isEnabled('MOTOR_STOP')) {
                $('div.disarmdelay').show();
            } else {
                $('div.disarmdelay').hide();
            }
        }

        function checkShowSerialRxBox() {
            if (FEATURE_CONFIG.features.isEnabled('RX_SERIAL')) {
                $('div.serialRXBox').show();
            } else {
                $('div.serialRXBox').hide();
            }
        }

        function checkShowSpiRxBox() {
            if (FEATURE_CONFIG.features.isEnabled('RX_SPI')) {
                $('div.spiRxBox').show();
            } else {
                $('div.spiRxBox').hide();
            }
        }

        function checkUpdateGpsControls() {
            if (FEATURE_CONFIG.features.isEnabled('GPS')) {
                $('.gpsSettings').show();
            } else {
                $('.gpsSettings').hide();
            }
        }

        function checkUpdate3dControls() {
            if (FEATURE_CONFIG.features.isEnabled('3D')) {
                $('._3dSettings').show();
            } else {
                $('._3dSettings').hide();
            }
        }

        $('input.feature', features_e).change(function () {
            var element = $(this);

            FEATURE_CONFIG.features.updateData(element);
            updateTabList(FEATURE_CONFIG.features);

            switch (element.attr('name')) {
                case 'MOTOR_STOP':
                    checkShowDisarmDelay();
                    break;

                case 'VBAT':
                    if (self.SHOW_OLD_BATTERY_CONFIG) {
                        checkUpdateVbatControls();
                    }

                    break;
                case 'CURRENT_METER':
                    if (self.SHOW_OLD_BATTERY_CONFIG) {
                        checkUpdateCurrentControls();
                    }

                case 'GPS':
                    checkUpdateGpsControls();
                    break;

                case '3D':
                    checkUpdate3dControls();
                    break;

                default:
                    break;
            }
        });

        $('input[id="accHardwareSwitch"]').change(function() {
            if(semver.gte(CONFIG.apiVersion, "1.37.0")) {
              var checked = $(this).is(':checked');
              if (checked) {
                $('._smallAngle').show()
              } else {
                $('._smallAngle').hide()
              }
            }
        });

        $(features_e).filter('select').change(function () {
            var element = $(this);

            FEATURE_CONFIG.features.updateData(element);
            updateTabList(FEATURE_CONFIG.features);

            switch (element.attr('name')) {
                case 'rxMode':
                    checkShowSerialRxBox();
                    checkShowSpiRxBox();

                    break;
                default:
                    break;
            }
        });

        $('input.condition', beeper_e).change(function () {
            var element = $(this);
            BEEPER_CONFIG.beepers.updateData(element);
        });

        checkShowDisarmDelay();
        checkShowSerialRxBox();
        checkShowSpiRxBox();
        checkUpdateGpsControls();
        checkUpdate3dControls();

        if (self.SHOW_OLD_BATTERY_CONFIG) {
            checkUpdateVbatControls();
            checkUpdateCurrentControls();
        }

        $('a.save').click(function () {
            // gather data that doesn't have automatic change event bound
            BOARD_ALIGNMENT_CONFIG.roll = parseInt($('input[name="board_align_roll"]').val());
            BOARD_ALIGNMENT_CONFIG.pitch = parseInt($('input[name="board_align_pitch"]').val());
            BOARD_ALIGNMENT_CONFIG.yaw = parseInt($('input[name="board_align_yaw"]').val());

            CONFIG.accelerometerTrims[1] = parseInt($('input[name="roll"]').val());
            CONFIG.accelerometerTrims[0] = parseInt($('input[name="pitch"]').val());
            COMPASS_CONFIG.mag_declination = parseFloat($('input[name="mag_declination"]').val());

            // motor disarm
            if(semver.gte(CONFIG.apiVersion, "1.8.0")) {
                ARMING_CONFIG.auto_disarm_delay = parseInt($('input[name="autodisarmdelay"]').val());
                ARMING_CONFIG.disarm_kill_switch = $('input[id="disarmkillswitch"]').is(':checked') ? 1 : 0;
            }
            if(semver.gte(CONFIG.apiVersion, "1.37.0")) {
                ARMING_CONFIG.small_angle = parseInt($('input[id="configurationSmallAngle"]').val());
            }

            MOTOR_CONFIG.minthrottle = parseInt($('input[name="minthrottle"]').val());
            MOTOR_CONFIG.maxthrottle = parseInt($('input[name="maxthrottle"]').val());
            MOTOR_CONFIG.mincommand = parseInt($('input[name="mincommand"]').val());
            if(semver.gte(CONFIG.apiVersion, "1.42.0")) {
                MOTOR_CONFIG.motor_poles = parseInt($('input[name="motorPoles"]').val());
                MOTOR_CONFIG.use_dshot_telemetry = $('input[id="dshotBidir"]').prop('checked'); 
            }

            if(self.SHOW_OLD_BATTERY_CONFIG) {
                MISC.vbatmincellvoltage = parseFloat($('input[name="mincellvoltage"]').val());
                MISC.vbatmaxcellvoltage = parseFloat($('input[name="maxcellvoltage"]').val());
                MISC.vbatwarningcellvoltage = parseFloat($('input[name="warningcellvoltage"]').val());
                MISC.vbatscale = parseInt($('input[name="voltagescale"]').val());

                BF_CONFIG.currentscale = parseInt($('input[name="currentscale"]').val());
                BF_CONFIG.currentoffset = parseInt($('input[name="currentoffset"]').val());
                MISC.multiwiicurrentoutput = $('input[name="multiwiicurrentoutput"]').is(':checked') ? 1 : 0;
            }

            if(semver.gte(CONFIG.apiVersion, "1.14.0")) {
                MOTOR_3D_CONFIG.deadband3d_low = parseInt($('input[name="3ddeadbandlow"]').val());
                MOTOR_3D_CONFIG.deadband3d_high = parseInt($('input[name="3ddeadbandhigh"]').val());
                MOTOR_3D_CONFIG.neutral = parseInt($('input[name="3dneutral"]').val());
            }

            SENSOR_ALIGNMENT.align_gyro = parseInt(orientation_gyro_e.val());
            SENSOR_ALIGNMENT.align_acc = parseInt(orientation_acc_e.val());
            SENSOR_ALIGNMENT.align_mag = parseInt(orientation_mag_e.val());
            if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                SENSOR_ALIGNMENT.gyro_to_use = parseInt(orientation_gyro_to_use_e.val());
                SENSOR_ALIGNMENT.gyro_1_align = parseInt(orientation_gyro_1_align_e.val());
                SENSOR_ALIGNMENT.gyro_2_align = parseInt(orientation_gyro_2_align_e.val());
            }

            PID_ADVANCED_CONFIG.fast_pwm_protocol = parseInt(esc_protocol_e.val()-1);
            PID_ADVANCED_CONFIG.use_unsyncedPwm = $('input[id="unsyncedPWMSwitch"]').is(':checked') ? 1 : 0;
            PID_ADVANCED_CONFIG.motor_pwm_rate = parseInt($('input[name="unsyncedpwmfreq"]').val());
            PID_ADVANCED_CONFIG.gyro_sync_denom = parseInt(gyro_select_e.val());
            PID_ADVANCED_CONFIG.pid_process_denom = parseInt(pid_select_e.val());
            PID_ADVANCED_CONFIG.digitalIdlePercent = parseFloat($('input[name="digitalIdlePercent"]').val());
            if (semver.gte(CONFIG.apiVersion, "1.25.0") && semver.lt(CONFIG.apiVersion, "1.41.0")) {
                PID_ADVANCED_CONFIG.gyroUse32kHz = $('input[id="gyroUse32kHz"]').is(':checked') ? 1 : 0;
            }

            if (semver.gte(CONFIG.apiVersion, "1.31.0")) {
                RX_CONFIG.fpvCamAngleDegrees = parseInt($('input[name="fpvCamAngleDegrees"]').val());
            }

            analytics.sendChangeEvents(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, self.analyticsChanges);
            self.analyticsChanges = {};

            function save_serial_config() {
                var next_callback = save_feature_config;
                MSP.send_message(MSPCodes.MSP_SET_CF_SERIAL_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_CF_SERIAL_CONFIG), false, next_callback);
            }

            function save_feature_config() {
                var next_callback = save_beeper_config;
                MSP.send_message(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG), false, next_callback);
            }

            function save_beeper_config() {
                var next_callback = save_misc;
                if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                    MSP.send_message(MSPCodes.MSP_SET_BEEPER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BEEPER_CONFIG), false, next_callback);
                } else {
                    next_callback();
                }
            }

            function save_misc() {
                var next_callback = save_mixer_config;
                if(semver.lt(CONFIG.apiVersion, "1.33.0")) {
                    MSP.send_message(MSPCodes.MSP_SET_MISC, mspHelper.crunch(MSPCodes.MSP_SET_MISC), false, next_callback);
                } else {
                    next_callback();
                }
            }

            function save_mixer_config() {
                var next_callback = save_board_alignment_config;
                MSP.send_message(MSPCodes.MSP_SET_MIXER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MIXER_CONFIG), false, next_callback);
            }

            function save_board_alignment_config() {
                var next_callback = save_motor_config;
                MSP.send_message(MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG), false, next_callback);
            }

            function save_motor_config() {
                var next_callback = save_gps_config;
                if(semver.gte(CONFIG.apiVersion, "1.33.0")) {
                    MSP.send_message(MSPCodes.MSP_SET_MOTOR_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MOTOR_CONFIG), false, next_callback);
                } else {
                    next_callback();
                }
            }

            function save_gps_config() {
                if (semver.gte(CONFIG.apiVersion, "1.34.0")) {
                    GPS_CONFIG.auto_baud = $('input[name="gps_auto_baud"]').is(':checked') ? 1 : 0;
                    GPS_CONFIG.auto_config = $('input[name="gps_auto_config"]').is(':checked') ? 1 : 0;
                }

                var next_callback = save_compass_config;
                if(semver.gte(CONFIG.apiVersion, "1.33.0")) {
                    MSP.send_message(MSPCodes.MSP_SET_GPS_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_GPS_CONFIG), false, next_callback);
                } else {
                    next_callback();
                }
            }

            function save_compass_config() {
                var next_callback = save_motor_3d_config;
                if(semver.gte(CONFIG.apiVersion, "1.33.0")) {
                    MSP.send_message(MSPCodes.MSP_SET_COMPASS_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_COMPASS_CONFIG), false, next_callback);
                } else {
                    next_callback();
                }
            }

            function save_motor_3d_config() {
                var next_callback = save_rc_deadband;
                MSP.send_message(MSPCodes.MSP_SET_MOTOR_3D_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MOTOR_3D_CONFIG), false, next_callback);
            }

            function save_rc_deadband() {
                var next_callback = save_sensor_alignment;
                MSP.send_message(MSPCodes.MSP_SET_RC_DEADBAND, mspHelper.crunch(MSPCodes.MSP_SET_RC_DEADBAND), false, next_callback);
            }

            function save_sensor_alignment() {
                var next_callback = save_esc_protocol;
                MSP.send_message(MSPCodes.MSP_SET_SENSOR_ALIGNMENT, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_ALIGNMENT), false, next_callback);
            }
            function save_esc_protocol() {
                var next_callback = save_acc_trim;
                MSP.send_message(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG), false, next_callback);
            }

            function save_acc_trim() {
                var next_callback = save_arming_config;
                MSP.send_message(MSPCodes.MSP_SET_ACC_TRIM, mspHelper.crunch(MSPCodes.MSP_SET_ACC_TRIM), false, next_callback);
            }

            function save_arming_config() {
                MSP.send_message(MSPCodes.MSP_SET_ARMING_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ARMING_CONFIG), false, save_sensor_config);
            }

            function save_sensor_config() {
                SENSOR_CONFIG.acc_hardware = $('input[id="accHardwareSwitch"]').is(':checked') ? 0 : 1;
                SENSOR_CONFIG.baro_hardware = $('input[id="baroHardwareSwitch"]').is(':checked') ? 0 : 1;
                SENSOR_CONFIG.mag_hardware = $('input[id="magHardwareSwitch"]').is(':checked') ? 0 : 1;

                var next_callback = save_name;
                MSP.send_message(MSPCodes.MSP_SET_SENSOR_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_CONFIG), false, next_callback);
            }

            function save_name() {
                var next_callback = save_rx_config;

                if(self.SHOW_OLD_BATTERY_CONFIG) {
                    next_callback = save_battery;
                }

                CONFIG.name = $.trim($('input[name="craftName"]').val());
                MSP.send_message(MSPCodes.MSP_SET_NAME, mspHelper.crunch(MSPCodes.MSP_SET_NAME), false, next_callback);
            }

            function save_battery() {
                var next_callback = save_current;
                if (semver.gte(CONFIG.flightControllerVersion, "3.1.0")) {
                    MSP.send_message(MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG), false, next_callback);
                } else {
                    next_callback();
                }
            }

            function save_current() {
                var next_callback = save_rx_config;
                if (semver.gte(CONFIG.flightControllerVersion, "3.1.0")) {
                    MSP.send_message(MSPCodes.MSP_SET_CURRENT_METER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_CURRENT_METER_CONFIG), false, next_callback);
                } else {
                    next_callback();
                }
            }

            function save_rx_config() {
                var next_callback = save_to_eeprom;
                if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
                    MSP.send_message(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG), false, next_callback);
                } else {
                    next_callback();
                }
            }

            function save_to_eeprom() {
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, reboot);
            }

            function reboot() {
                GUI.log(i18n.getMessage('configurationEepromSaved'));

                GUI.tab_switch_cleanup(function() {
                    MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false);
                    reinitialiseConnection(self);
                });
            }

            save_serial_config();
        });

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function status_pull() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);
        GUI.content_ready(callback);
    }
};

TABS.configuration.cleanup = function (callback) {
    if (callback) callback();
};
