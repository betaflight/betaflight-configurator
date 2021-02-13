'use strict';

TABS.configuration = {
    analyticsChanges: {},
};

TABS.configuration.initialize = function (callback, scrollPosition) {
    const self = this;

    if (GUI.active_tab != 'configuration') {
        GUI.active_tab = 'configuration';
        GUI.configuration_loaded = true;
    }

    function load_config() {
        MSP.send_message(MSPCodes.MSP_FEATURE_CONFIG, false, false, load_beeper_config);
    }

    function load_beeper_config() {
        const nextCallBack = load_serial_config;
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
            MSP.send_message(MSPCodes.MSP_BEEPER_CONFIG, false, false, nextCallBack);
        } else {
            nextCallBack();
        }
    }

    function load_serial_config() {
        mspHelper.loadSerialConfig(load_board_alignment_config);
    }

    function load_board_alignment_config() {
        MSP.send_message(MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG, false, false, load_rx_map);
    }

    function load_rx_map() {
        MSP.send_message(MSPCodes.MSP_RX_MAP, false, false, load_rssi_config);
    }

    function load_rssi_config() {
        MSP.send_message(MSPCodes.MSP_RSSI_CONFIG, false, false, load_gps_config);
    }

    function load_gps_config() {
        const nextCallBack = load_acc_trim;
        if(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_33)) {
            MSP.send_message(MSPCodes.MSP_GPS_CONFIG, false, false, load_acc_trim);
        } else {
            nextCallBack();
        }
    }

    function load_acc_trim() {
        MSP.send_message(MSPCodes.MSP_ACC_TRIM, false, false, load_misc);
    }

    function load_misc() {
        const nextCallBack = load_arming_config;
        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_33)) {
            MSP.send_message(MSPCodes.MSP_MISC, false, false, nextCallBack);
        } else {
            nextCallBack();
        }
    }

    function load_arming_config() {
        const nextCallBack = load_rc_deadband;
        if (semver.gte(FC.CONFIG.apiVersion, "1.8.0")) {
            MSP.send_message(MSPCodes.MSP_ARMING_CONFIG, false, false, nextCallBack);
        } else {
            nextCallBack();
        }
    }

    function load_rc_deadband() {
        const nextCallBack = load_sensor_config;
        if (semver.gte(FC.CONFIG.apiVersion, "1.17.0")) {
            MSP.send_message(MSPCodes.MSP_RC_DEADBAND, false, false, nextCallBack);
        } else {
            nextCallBack();
        }
    }

    function load_sensor_config() {
        const nextCallBack = load_sensor_alignment;
        if (semver.gte(FC.CONFIG.apiVersion, "1.16.0")) {
            MSP.send_message(MSPCodes.MSP_SENSOR_CONFIG, false, false, nextCallBack);
        } else {
            nextCallBack();
        }
    }

    function load_sensor_alignment() {
        const nextCallBack = load_name;
        if (semver.gte(FC.CONFIG.apiVersion, "1.15.0")) {
            MSP.send_message(MSPCodes.MSP_SENSOR_ALIGNMENT, false, false, nextCallBack);
        } else {
            nextCallBack();
        }
    }

    function load_name() {
        const nextCallBack = load_rx_config;
        if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
            MSP.send_message(MSPCodes.MSP_NAME, false, false, nextCallBack);
        } else {
            nextCallBack();
        }
    }

    function load_rx_config() {
        const nextCallBack = load_filter_config;
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_31)) {
            MSP.send_message(MSPCodes.MSP_RX_CONFIG, false, false, nextCallBack);
        } else {
            nextCallBack();
        }
    }

    function load_filter_config() {
        const nextCallBack = load_advanced_config;
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
            MSP.send_message(MSPCodes.MSP_FILTER_CONFIG, false, false, nextCallBack);
        } else {
            nextCallBack();
        }
    }

    function load_advanced_config() {
        MSP.send_message(MSPCodes.MSP_ADVANCED_CONFIG, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/configuration.html", process_html);
    }

    load_config();

    function process_html() {
        self.analyticsChanges = {};

        const features_e = $('.tab-configuration .features');

        FC.FEATURE_CONFIG.features.generateElements(features_e);

        // Dshot Beeper
        const dshotBeeper_e = $('.tab-configuration .dshotbeeper');
        const dshotBeacon_e = $('.tab-configuration .dshotbeacon');
        const dshotBeeperSwitch = $('#dshotBeeperSwitch');
        const dshotBeeperBeaconTone = $('select.dshotBeeperBeaconTone');
        const dshotBeaconCondition_e = $('tbody.dshotBeaconConditions');
        const dshotBeaconSwitch_e = $('tr.dshotBeaconSwitch');

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_37)) {
            for (let i = 1; i <= 5; i++) {
                dshotBeeperBeaconTone.append(`<option value="${(i)}">${(i)}</option>`);
            }
            dshotBeeper_e.show();
        } else {
            dshotBeeper_e.hide();
        }

        dshotBeeperBeaconTone.change(function() {
            FC.BEEPER_CONFIG.dshotBeaconTone = dshotBeeperBeaconTone.val();
        });

        dshotBeeperBeaconTone.val(FC.BEEPER_CONFIG.dshotBeaconTone);

        const template = $('.beepers .beeper-template');
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_39)) {
            dshotBeaconSwitch_e.hide();
            FC.BEEPER_CONFIG.dshotBeaconConditions.generateElements(template, dshotBeaconCondition_e);

            $('input.condition', dshotBeaconCondition_e).change(function () {
                const element = $(this);
                FC.BEEPER_CONFIG.dshotBeaconConditions.updateData(element);
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

            dshotBeeperSwitch.prop('checked', FC.BEEPER_CONFIG.dshotBeaconTone !== 0).change();
        }

        // Analog Beeper
        const destination = $('.beepers .beeper-configuration');
        const beeper_e = $('.tab-configuration .beepers');

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
            FC.BEEPER_CONFIG.beepers.generateElements(template, destination);
        } else {
            beeper_e.hide();
        }

        // translate to user-selected language
        i18n.localizePage();

        const alignments = [
            'CW 0°',
            'CW 90°',
            'CW 180°',
            'CW 270°',
            'CW 0° flip',
            'CW 90° flip',
            'CW 180° flip',
            'CW 270° flip',
        ];

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
            alignments.push('Custom');
        }

        const gyro_align_content_e = $('.tab-configuration .gyro_align_content');
        const legacy_gyro_alignment_e = $('.tab-configuration .legacy_gyro_alignment');
        const legacy_accel_alignment_e = $('.tab-configuration .legacy_accel_alignment');

        const orientation_gyro_e = $('select.gyroalign');
        const orientation_acc_e = $('select.accalign');
        const orientation_mag_e = $('select.magalign');

        const orientation_gyro_to_use_e = $('select.gyro_to_use');
        const orientation_gyro_1_align_e = $('select.gyro_1_align');
        const orientation_gyro_2_align_e = $('select.gyro_2_align');

        gyro_align_content_e.hide(); // default value
        if (semver.lt(FC.CONFIG.apiVersion, "1.15.0")) {
            $('.tab-configuration .sensoralignment').hide();
        } else {

            for (let i = 0; i < alignments.length; i++) {
                orientation_gyro_e.append(`<option value="${(i+1)}">${alignments[i]}</option>`);
                orientation_acc_e.append(`<option value="${(i+1)}">${alignments[i]}</option>`);
                orientation_mag_e.append(`<option value="${(i+1)}">${alignments[i]}</option>`);
            }

            orientation_gyro_e.val(FC.SENSOR_ALIGNMENT.align_gyro);
            orientation_acc_e.val(FC.SENSOR_ALIGNMENT.align_acc);
            orientation_mag_e.val(FC.SENSOR_ALIGNMENT.align_mag);

            orientation_gyro_e.change(function () {
                let value = parseInt($(this).val());

                let newValue = undefined;
                if (value !== FC.SENSOR_ALIGNMENT.align_gyro) {
                    newValue = $(this).find('option:selected').text();
                }
                self.analyticsChanges['GyroAlignment'] = newValue;

                FC.SENSOR_ALIGNMENT.align_gyro = value;
            });

            orientation_acc_e.change(function () {
                let value = parseInt($(this).val());

                let newValue = undefined;
                if (value !== FC.SENSOR_ALIGNMENT.align_acc) {
                    newValue = $(this).find('option:selected').text();
                }
                self.analyticsChanges['AccAlignment'] = newValue;

                FC.SENSOR_ALIGNMENT.align_acc = value;
            });

            orientation_mag_e.change(function () {
                let value = parseInt($(this).val());

                let newValue = undefined;
                if (value !== FC.SENSOR_ALIGNMENT.align_mag) {
                    newValue = $(this).find('option:selected').text();
                }
                self.analyticsChanges['MagAlignment'] = newValue;

                FC.SENSOR_ALIGNMENT.align_mag = value;
            });

            // Multi gyro config
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {

                gyro_align_content_e.show();
                legacy_gyro_alignment_e.hide();
                legacy_accel_alignment_e.hide();

                const GYRO_DETECTION_FLAGS = {
                        DETECTED_GYRO_1:      (1 << 0),
                        DETECTED_GYRO_2:      (1 << 1),
                        DETECTED_DUAL_GYROS:  (1 << 7),
                };

                const detected_gyro_1 = (FC.SENSOR_ALIGNMENT.gyro_detection_flags & GYRO_DETECTION_FLAGS.DETECTED_GYRO_1) != 0;
                const detected_gyro_2 = (FC.SENSOR_ALIGNMENT.gyro_detection_flags & GYRO_DETECTION_FLAGS.DETECTED_GYRO_2) != 0;
                const detected_dual_gyros = (FC.SENSOR_ALIGNMENT.gyro_detection_flags & GYRO_DETECTION_FLAGS.DETECTED_DUAL_GYROS) != 0;

                if (detected_gyro_1) {
                    orientation_gyro_to_use_e.append(`<option value="0">${i18n.getMessage('configurationSensorGyroToUseFirst')}</option>`);
                }
                if (detected_gyro_2) {
                    orientation_gyro_to_use_e.append(`<option value="1">${i18n.getMessage('configurationSensorGyroToUseSecond')}</option>`);
                }
                if (detected_dual_gyros) {
                    orientation_gyro_to_use_e.append(`<option value="2">${i18n.getMessage('configurationSensorGyroToUseBoth')}</option>`);
                }

                for (let i = 0; i < alignments.length; i++) {
                    orientation_gyro_1_align_e.append(`<option value="${(i+1)}">${alignments[i]}</option>`);
                    orientation_gyro_2_align_e.append(`<option value="${(i+1)}">${alignments[i]}</option>`);
                }

                orientation_gyro_to_use_e.val(FC.SENSOR_ALIGNMENT.gyro_to_use);
                orientation_gyro_1_align_e.val(FC.SENSOR_ALIGNMENT.gyro_1_align);
                orientation_gyro_2_align_e.val(FC.SENSOR_ALIGNMENT.gyro_2_align);

                $('.gyro_alignment_inputs_first').toggle(detected_gyro_1);
                $('.gyro_alignment_inputs_second').toggle(detected_gyro_2);
                $('.gyro_alignment_inputs_selection').toggle(detected_gyro_1 || detected_gyro_2);
                $('.gyro_alignment_inputs_notfound').toggle(!detected_gyro_1 && !detected_gyro_2);

                orientation_gyro_1_align_e.change(function () {
                    let value = parseInt($(this).val());

                    let newValue = undefined;
                    if (value !== FC.SENSOR_ALIGNMENT.gyro_1_align) {
                        newValue = $(this).find('option:selected').text();
                    }
                    self.analyticsChanges['Gyro1Alignment'] = newValue;

                    FC.SENSOR_ALIGNMENT.gyro_1_align = value;
                });

                orientation_gyro_2_align_e.change(function () {
                    let value = parseInt($(this).val());

                    let newValue = undefined;
                    if (value !== FC.SENSOR_ALIGNMENT.gyro_2_align) {
                        newValue = $(this).find('option:selected').text();
                    }
                    self.analyticsChanges['Gyro2Alignment'] = newValue;

                    FC.SENSOR_ALIGNMENT.gyro_2_align = value;
                });
            }
        }

        // Gyro and PID update
        const gyroUse32kHzElement = $('input[id="gyroUse32kHz"]');
        const gyroTextElement = $('input.gyroFrequency');
        const gyroSelectElement = $('select.gyroSyncDenom');
        const pidSelectElement = $('select.pidProcessDenom');

        function addDenomOption(element, denom, baseFreq) {
            let denomDescription;
            if (baseFreq === 0) {
                denomDescription = i18n.getMessage('configurationSpeedPidNoGyro', {'value' : denom});
            } else {
                denomDescription = i18n.getMessage('configurationKHzUnitLabel', { 'value' : (baseFreq / denom).toFixed(2)});
            }
            element.append(`<option value="${denom}">${denomDescription}</option>`);
        }

        const updateGyroDenom = function (gyroBaseFreq) {

            gyroTextElement.hide();

            const originalGyroDenom = gyroSelectElement.val();

            gyroSelectElement.empty();

            const MAX_DENOM = semver.gte(FC.CONFIG.apiVersion, "1.25.0") && semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_41) ? 32 : 8;

            for (let denom = 1; denom <= MAX_DENOM; denom++) {
                addDenomOption(gyroSelectElement, denom, gyroBaseFreq);
            }

            gyroSelectElement.val(originalGyroDenom);

            gyroSelectElement.change();
         };

         const updateGyroDenomReadOnly = function (gyroFrequency) {
             gyroSelectElement.hide();

             let gyroContent;
             if (gyroFrequency === 0) {
                gyroContent = i18n.getMessage('configurationSpeedGyroNoGyro');
             } else {
                gyroContent = i18n.getMessage('configurationKHzUnitLabel', { 'value' : (gyroFrequency / 1000).toFixed(2)});
             }
             gyroTextElement.val(gyroContent);
         };

         if (semver.gte(FC.CONFIG.apiVersion, "1.25.0") && semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
             gyroUse32kHzElement.prop('checked', FC.PID_ADVANCED_CONFIG.gyroUse32kHz !== 0);

             gyroUse32kHzElement.change(function () {
                 const gyroBaseFreq = ($(this).is(':checked'))? 32 : 8;

                 updateGyroDenom(gyroBaseFreq);
             }).change();

         } else {

             $('div.gyroUse32kHz').hide();

             if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                 updateGyroDenomReadOnly(FC.CONFIG.sampleRateHz);
             } else {
                 updateGyroDenom(8);
             }
        }

        gyroSelectElement.val(FC.PID_ADVANCED_CONFIG.gyro_sync_denom);

        $('.systemconfigNote').html(i18n.getMessage('configurationLoopTimeHelp'));

        gyroSelectElement.change(function () {
            const originalPidDenom = parseInt(pidSelectElement.val());

            let pidBaseFreq;
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                pidBaseFreq = FC.CONFIG.sampleRateHz / 1000;
            } else {
                pidBaseFreq = 8;
                if (semver.gte(FC.CONFIG.apiVersion, "1.25.0") && semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_41) && gyroUse32kHzElement.is(':checked')) {
                    pidBaseFreq = 32;
                }
                pidBaseFreq = pidBaseFreq / parseInt($(this).val());
            }

            pidSelectElement.empty();

            const MAX_DENOM = semver.gte(FC.CONFIG.apiVersion, "1.24.0") ? 16 : 8;

            for (let denom = 1; denom <= MAX_DENOM; denom++) {
                addDenomOption(pidSelectElement, denom, pidBaseFreq);
            }

            pidSelectElement.val(originalPidDenom);
        }).change();

        pidSelectElement.val(FC.PID_ADVANCED_CONFIG.pid_process_denom);

        $('input[id="accHardwareSwitch"]').prop('checked', FC.SENSOR_CONFIG.acc_hardware !== 1);
        $('input[id="baroHardwareSwitch"]').prop('checked', FC.SENSOR_CONFIG.baro_hardware !== 1);
        $('input[id="magHardwareSwitch"]').prop('checked', FC.SENSOR_CONFIG.mag_hardware !== 1);

        // Only show these sections for supported FW
        if (semver.lt(FC.CONFIG.apiVersion, "1.16.0")) {
            $('.selectProtocol').hide();
            $('.checkboxPwm').hide();
            $('.selectPidProcessDenom').hide();
        }

        if (semver.lt(FC.CONFIG.apiVersion, "1.16.0")) {
            $('.hardwareSelection').hide();
        }

        $('input[name="craftName"]').val(FC.CONFIG.name);

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_31)) {
            $('input[name="fpvCamAngleDegrees"]').val(FC.RX_CONFIG.fpvCamAngleDegrees);
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
                $('input[name="fpvCamAngleDegrees"]').attr("max", 90);
            }
        } else {
            $('div.fpvCamAngleDegrees').hide();
        }

        if (semver.lt(FC.CONFIG.apiVersion, "1.20.0")) {
            $('.miscSettings').hide();
        }

        // generate GPS
        const gpsProtocols = [
            'NMEA',
            'UBLOX',
        ];
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
            gpsProtocols.push('MSP');
        }

        const gpsBaudRates = [
            '115200',
            '57600',
            '38400',
            '19200',
            '9600',
        ];

        const gpsSbas = [
            i18n.getMessage('gpsSbasAutoDetect'),
            i18n.getMessage('gpsSbasEuropeanEGNOS'),
            i18n.getMessage('gpsSbasNorthAmericanWAAS'),
            i18n.getMessage('gpsSbasJapaneseMSAS'),
            i18n.getMessage('gpsSbasIndianGAGAN'),
        ];
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            gpsSbas.push(i18n.getMessage('gpsSbasNone'));
        }

        const gpsProtocolElement = $('select.gps_protocol');
        const gpsAutoBaudElement = $('input[name="gps_auto_baud"]');
        const gpsAutoBaudGroup = $('.gps_auto_baud');
        const gpsAutoConfigElement = $('input[name="gps_auto_config"]');
        const gpsAutoConfigGroup = $('.gps_auto_config');
        const gpsUbloxGalileoElement = $('input[name="gps_ublox_galileo"]');
        const gpsUbloxGalileoGroup = $('.gps_ublox_galileo');
        const gpsUbloxSbasElement = $('select.gps_ubx_sbas');
        const gpsUbloxSbasGroup = $('.gps_ubx_sbas');
        const gpsHomeOnceElement = $('input[name="gps_home_once"]');
        const gpsBaudrateElement = $('select.gps_baudrate');


        for (let protocolIndex = 0; protocolIndex < gpsProtocols.length; protocolIndex++) {
            gpsProtocolElement.append(`<option value="${protocolIndex}">${gpsProtocols[protocolIndex]}</option>`);
        }

        gpsProtocolElement.change(function () {
            FC.GPS_CONFIG.provider = parseInt($(this).val());

            // Call this to enable or disable auto config elements depending on the protocol
            gpsAutoConfigElement.change();

        }).val(FC.GPS_CONFIG.provider).change();

        gpsAutoBaudElement.prop('checked', FC.GPS_CONFIG.auto_baud === 1);

        gpsAutoConfigElement.change(function () {
            const checked = $(this).is(":checked");

            const ubloxSelected = FC.GPS_CONFIG.provider === gpsProtocols.indexOf('UBLOX');

            const enableGalileoVisible = checked && ubloxSelected && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43);
            gpsUbloxGalileoGroup.toggle(enableGalileoVisible);

            const enableSbasVisible = checked && ubloxSelected;
            gpsUbloxSbasGroup.toggle(enableSbasVisible);

        }).prop('checked', FC.GPS_CONFIG.auto_config === 1).change();

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_34)) {
            gpsAutoBaudGroup.show();
            gpsAutoConfigGroup.show();
        } else {
            gpsAutoBaudGroup.hide();
            gpsAutoConfigGroup.hide();
        }

        gpsUbloxGalileoElement.change(function() {
            FC.GPS_CONFIG.ublox_use_galileo = $(this).is(':checked') ? 1 : 0;
        }).prop('checked', FC.GPS_CONFIG.ublox_use_galileo > 0).change();

        for (let sbasIndex = 0; sbasIndex < gpsSbas.length; sbasIndex++) {
            gpsUbloxSbasElement.append(`<option value="${sbasIndex}">${gpsSbas[sbasIndex]}</option>`);
        }

        gpsUbloxSbasElement.change(function () {
            FC.GPS_CONFIG.ublox_sbas = parseInt($(this).val());
        }).val(FC.GPS_CONFIG.ublox_sbas);

        $('.gps_home_once').toggle(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43));
        gpsHomeOnceElement.change(function() {
            FC.GPS_CONFIG.home_point_once = $(this).is(':checked') ? 1 : 0;
        }).prop('checked', FC.GPS_CONFIG.home_point_once > 0).change();

        for (let baudRateIndex = 0; baudRateIndex < gpsBaudRates.length; baudRateIndex++) {
            gpsBaudrateElement.append(`<option value="${gpsBaudRates[baudRateIndex]}">${gpsBaudRates[baudRateIndex]}</option>`);
        }

        if (semver.lt(FC.CONFIG.apiVersion, "1.6.0")) {
            gpsBaudrateElement.change(function () {
                FC.SERIAL_CONFIG.gpsBaudRate = parseInt($(this).val());
            });
            gpsBaudrateElement.val(FC.SERIAL_CONFIG.gpsBaudRate);
        } else {
            gpsBaudrateElement.prop("disabled", true);
            gpsBaudrateElement.parent().hide();
        }

        const serialRXSelectEl = $('select.serialRX');
        FC.getSerialRxTypes().forEach(function(serialRxType, index) {
            serialRXSelectEl.append(`<option value="${index}">${serialRxType}</option>`);
        });

        serialRXSelectEl.change(function () {
            const serialRxValue = parseInt($(this).val());

            let newValue;
            if (serialRxValue !== FC.RX_CONFIG.serialrx_provider) {
                newValue = $(this).find('option:selected').text();
            }
            self.analyticsChanges['SerialRx'] = newValue;

            FC.RX_CONFIG.serialrx_provider = serialRxValue;
        });

        // select current serial RX type
        serialRXSelectEl.val(FC.RX_CONFIG.serialrx_provider);
        const spiRxTypes = [];

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_31)) {
            spiRxTypes.push(
                'NRF24_V202_250K',
                'NRF24_V202_1M',
                'NRF24_SYMA_X',
                'NRF24_SYMA_X5C',
                'NRF24_CX10',
                'CX10A',
                'NRF24_H8_3D',
                'NRF24_INAV',
                'FRSKY_D'
            );

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_37)) {
                spiRxTypes.push(
                    'FRSKY_X',
                    'A7105_FLYSKY',
                    'A7105_FLYSKY_2A',
                    'NRF24_KN',
                );
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
                spiRxTypes.push(
                    'SFHSS',
                    'SPEKTRUM',
                    'FRSKY_X_LBT',
                );
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                spiRxTypes.push(
                    'REDPINE',
                );
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                spiRxTypes.push(
                    'FRSKY_X_V2',
                    'FRSKY_X_LBT_V2',
                );
            }

            const spiRx_e = $('select.spiRx');
            for (let i = 0; i < spiRxTypes.length; i++) {
                spiRx_e.append(`<option value="${i}">${spiRxTypes[i]}</option>`);
            }

            spiRx_e.change(function () {
                const value = parseInt($(this).val());

                let newValue = undefined;
                if (value !== FC.RX_CONFIG.rxSpiProtocol) {
                    newValue = $(this).find('option:selected').text();
                }
                self.analyticsChanges['SPIRXProtocol'] = newValue;

                FC.RX_CONFIG.rxSpiProtocol = value;
            });

            // select current serial RX type
            spiRx_e.val(FC.RX_CONFIG.rxSpiProtocol);
            }

        // for some odd reason chrome 38+ changes scroll according to the touched select element
        // i am guessing this is a bug, since this wasn't happening on 37
        // code below is a temporary fix, which we will be able to remove in the future (hopefully)
        $('#content').scrollTop((scrollPosition) ? scrollPosition : 0);

        // fill board alignment
        $('input[name="board_align_roll"]').val(FC.BOARD_ALIGNMENT_CONFIG.roll);
        $('input[name="board_align_pitch"]').val(FC.BOARD_ALIGNMENT_CONFIG.pitch);
        $('input[name="board_align_yaw"]').val(FC.BOARD_ALIGNMENT_CONFIG.yaw);

        // fill accel trims
        $('input[name="roll"]').val(FC.CONFIG.accelerometerTrims[1]);
        $('input[name="pitch"]').val(FC.CONFIG.accelerometerTrims[0]);

        $('._smallAngle').toggle(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_37));
        if(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_37)) {
            $('input[id="configurationSmallAngle"]').val(FC.ARMING_CONFIG.small_angle);
        }

        // UI hooks
        function checkShowSerialRxBox() {
            if (FC.FEATURE_CONFIG.features.isEnabled('RX_SERIAL')) {
                $('div.serialRXBox').show();
            } else {
                $('div.serialRXBox').hide();
            }
        }

        function checkShowSpiRxBox() {
            if (FC.FEATURE_CONFIG.features.isEnabled('RX_SPI')) {
                $('div.spiRxBox').show();
            } else {
                $('div.spiRxBox').hide();
            }
        }

        function checkUpdateGpsControls() {
            if (FC.FEATURE_CONFIG.features.isEnabled('GPS')) {
                $('.gpsSettings').show();
            } else {
                $('.gpsSettings').hide();
            }
        }

        $('input.feature', features_e).change(function () {
            const element = $(this);

            FC.FEATURE_CONFIG.features.updateData(element);
            updateTabList(FC.FEATURE_CONFIG.features);

            if (element.attr('name') === 'GPS') {
                checkUpdateGpsControls();
            }
        });

        $('input[id="accHardwareSwitch"]').change(function() {
            if(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_37)) {
              const checked = $(this).is(':checked');
              $('.accelNeeded').toggle(checked);
            }
        }).change();

        $(features_e).filter('select').change(function () {
            const element = $(this);

            FC.FEATURE_CONFIG.features.updateData(element);
            updateTabList(FC.FEATURE_CONFIG.features);

            if (element.attr('name') === 'rxMode') {
                    checkShowSerialRxBox();
                    checkShowSpiRxBox();
            }
        });

        $('input.condition', beeper_e).change(function () {
            const element = $(this);
            FC.BEEPER_CONFIG.beepers.updateData(element);
        });

        checkShowSerialRxBox();
        checkShowSpiRxBox();
        checkUpdateGpsControls();

        $('a.save').on('click', function() {
            // gather data that doesn't have automatic change event bound
            FC.BOARD_ALIGNMENT_CONFIG.roll = parseInt($('input[name="board_align_roll"]').val());
            FC.BOARD_ALIGNMENT_CONFIG.pitch = parseInt($('input[name="board_align_pitch"]').val());
            FC.BOARD_ALIGNMENT_CONFIG.yaw = parseInt($('input[name="board_align_yaw"]').val());

            FC.CONFIG.accelerometerTrims[1] = parseInt($('input[name="roll"]').val());
            FC.CONFIG.accelerometerTrims[0] = parseInt($('input[name="pitch"]').val());

            // small angle configuration
            if(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_37)) {
                FC.ARMING_CONFIG.small_angle = parseInt($('input[id="configurationSmallAngle"]').val());
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
                FC.SENSOR_ALIGNMENT.gyro_to_use = parseInt(orientation_gyro_to_use_e.val());
            }

            FC.PID_ADVANCED_CONFIG.gyro_sync_denom = parseInt(gyroSelectElement.val());

            const value = parseInt(pidSelectElement.val());

            if (value !== FC.PID_ADVANCED_CONFIG.pid_process_denom) {
                const newFrequency = pidSelectElement.find('option:selected').text();
                self.analyticsChanges['PIDLoopSettings'] = `denominator: ${value} | frequency: ${newFrequency}`;
            } else {
                self.analyticsChanges['PIDLoopSettings'] = undefined;
            }

            FC.PID_ADVANCED_CONFIG.pid_process_denom = value;
            if (semver.gte(FC.CONFIG.apiVersion, "1.25.0") && semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
                FC.PID_ADVANCED_CONFIG.gyroUse32kHz = $('input[id="gyroUse32kHz"]').is(':checked') ? 1 : 0;
            }

            FC.RX_CONFIG.fpvCamAngleDegrees = parseInt($('input[name="fpvCamAngleDegrees"]').val());

            analytics.sendChangeEvents(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, self.analyticsChanges);
            self.analyticsChanges = {};

            // fill some data
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_34)) {
                FC.GPS_CONFIG.auto_baud = $('input[name="gps_auto_baud"]').is(':checked') ? 1 : 0;
                FC.GPS_CONFIG.auto_config = $('input[name="gps_auto_config"]').is(':checked') ? 1 : 0;
            }

            FC.SENSOR_CONFIG.acc_hardware = $('input[id="accHardwareSwitch"]').is(':checked') ? 0 : 1;
            FC.SENSOR_CONFIG.baro_hardware = $('input[id="baroHardwareSwitch"]').is(':checked') ? 0 : 1;
            FC.SENSOR_CONFIG.mag_hardware = $('input[id="magHardwareSwitch"]').is(':checked') ? 0 : 1;
            FC.CONFIG.name = $.trim($('input[name="craftName"]').val());

            function save_serial_config() {
                const nextCallBack = save_feature_config;
                mspHelper.sendSerialConfig(nextCallBack);
            }

            function save_feature_config() {
                const nextCallBack = save_beeper_config;
                MSP.send_message(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG), false, nextCallBack);
            }

            function save_beeper_config() {
                const nextCallBack = save_misc;
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
                    MSP.send_message(MSPCodes.MSP_SET_BEEPER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BEEPER_CONFIG), false, nextCallBack);
                } else {
                    nextCallBack();
                }
            }

            function save_misc() {
                const nextCallBack = save_board_alignment_config;
                if(semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_33)) {
                    MSP.send_message(MSPCodes.MSP_SET_MISC, mspHelper.crunch(MSPCodes.MSP_SET_MISC), false, nextCallBack);
                } else {
                    nextCallBack();
                }
            }

            function save_board_alignment_config() {
                const nextCallBack = save_gps_config;
                MSP.send_message(MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG), false, nextCallBack);
            }


            function save_gps_config() {
                const nextCallBack = save_rc_deadband;
                if(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_33)) {
                    MSP.send_message(MSPCodes.MSP_SET_GPS_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_GPS_CONFIG), false, nextCallBack);
                } else {
                    nextCallBack();
                }
            }

            function save_rc_deadband() {
                MSP.send_message(MSPCodes.MSP_SET_RC_DEADBAND, mspHelper.crunch(MSPCodes.MSP_SET_RC_DEADBAND), false, save_sensor_alignment);
            }

            function save_sensor_alignment() {
                MSP.send_message(MSPCodes.MSP_SET_SENSOR_ALIGNMENT, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_ALIGNMENT), false, save_esc_protocol);
            }

            function save_esc_protocol() {
                MSP.send_message(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG), false, save_acc_trim);
            }

            function save_acc_trim() {
                MSP.send_message(MSPCodes.MSP_SET_ACC_TRIM, mspHelper.crunch(MSPCodes.MSP_SET_ACC_TRIM), false, save_arming_config);
            }

            function save_arming_config() {
                MSP.send_message(MSPCodes.MSP_SET_ARMING_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ARMING_CONFIG), false, save_sensor_config);
            }

            function save_sensor_config() {
                MSP.send_message(MSPCodes.MSP_SET_SENSOR_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_CONFIG), false, save_name);
            }

            function save_name() {
                MSP.send_message(MSPCodes.MSP_SET_NAME, mspHelper.crunch(MSPCodes.MSP_SET_NAME), false, save_rx_config);
            }

            function save_rx_config() {
                const nextCallBack = save_filter_config;
                if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
                    MSP.send_message(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG), false, nextCallBack);
                } else {
                    nextCallBack();
                }
            }

            function save_filter_config() {
                const nextCallBack = save_to_eeprom;
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
                    MSP.send_message(MSPCodes.MSP_SET_FILTER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FILTER_CONFIG), false, nextCallBack);
                } else {
                    nextCallBack();
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
        GUI.interval_add('status_pull', function() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);
        GUI.content_ready(callback);
    }
};

TABS.configuration.cleanup = function (callback) {
    if (callback) callback();
};
