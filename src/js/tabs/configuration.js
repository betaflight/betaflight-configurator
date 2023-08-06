import semver from 'semver';
import { i18n } from '../localization';
import GUI, { TABS } from '../gui';
import { tracking } from "../Analytics";
import { mspHelper } from '../msp/MSPHelper';
import FC from '../fc';
import MSP from '../msp';
import MSPCodes from '../msp/MSPCodes';
import { API_VERSION_1_42, API_VERSION_1_43, API_VERSION_1_45 } from '../data_storage';
import { updateTabList } from '../utils/updateTabList';
import $ from 'jquery';

const configuration = {
    analyticsChanges: {},
};

configuration.initialize = function (callback) {
    const self = this;

    if (GUI.active_tab != 'configuration') {
        GUI.active_tab = 'configuration';
        GUI.configuration_loaded = true;
    }

    function load_serial_config() {
        mspHelper.loadSerialConfig(load_config);
    }

    function load_config() {
        Promise
        .resolve(true)
        .then(() => MSP.promise(MSPCodes.MSP_FEATURE_CONFIG))
        .then(() => MSP.promise(MSPCodes.MSP_BEEPER_CONFIG))
        .then(() => MSP.promise(MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG))
        .then(() => MSP.promise(MSPCodes.MSP_ACC_TRIM))
        .then(() => MSP.promise(MSPCodes.MSP_ARMING_CONFIG))
        .then(() => MSP.promise(MSPCodes.MSP_RC_DEADBAND))
        .then(() => MSP.promise(MSPCodes.MSP_SENSOR_CONFIG))
        .then(() => MSP.promise(MSPCodes.MSP_SENSOR_ALIGNMENT))
        .then(() => semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_45)
            ? MSP.promise(MSPCodes.MSP_NAME)
            : Promise.resolve(true))
        .then(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)
            ? MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.CRAFT_NAME))
            : Promise.resolve(true))
        .then(() => MSP.promise(MSPCodes.MSP_RX_CONFIG))
        .then(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)
            ? MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.PILOT_NAME)) : Promise.resolve(true))
        .then(() => MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG))
        .then(() => load_html());
    }

    function load_html() {
        $('#content').load("./tabs/configuration.html", process_html);
    }

    load_serial_config();

    function process_html() {
        self.analyticsChanges = {};

        const features_e = $('.tab-configuration .features');

        FC.FEATURE_CONFIG.features.generateElements(features_e);

        // Dshot Beeper
        const dshotBeeper_e = $('.tab-configuration .dshotbeeper');
        const dshotBeeperBeaconTone = $('select.dshotBeeperBeaconTone');
        const dshotBeaconCondition_e = $('tbody.dshotBeaconConditions');
        const dshotBeaconSwitch_e = $('tr.dshotBeaconSwitch');

        for (let i = 1; i <= 5; i++) {
            dshotBeeperBeaconTone.append(`<option value="${(i)}">${(i)}</option>`);
        }
        dshotBeeper_e.show();

        dshotBeeperBeaconTone.change(function() {
            FC.BEEPER_CONFIG.dshotBeaconTone = dshotBeeperBeaconTone.val();
        });

        dshotBeeperBeaconTone.val(FC.BEEPER_CONFIG.dshotBeaconTone);

        const template = $('.beepers .beeper-template');
        dshotBeaconSwitch_e.hide();
        FC.BEEPER_CONFIG.dshotBeaconConditions.generateElements(template, dshotBeaconCondition_e);

        $('input.condition', dshotBeaconCondition_e).change(function () {
            const element = $(this);
            FC.BEEPER_CONFIG.dshotBeaconConditions.updateData(element);
        });

        // Analog Beeper
        const destination = $('.beepers .beeper-configuration');
        const beeper_e = $('.tab-configuration .beepers');

        FC.BEEPER_CONFIG.beepers.generateElements(template, destination);

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

        // Gyro and PID update
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

            const MAX_DENOM = 8;

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

        $('div.gyroUse32kHz').hide();

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            updateGyroDenomReadOnly(FC.CONFIG.sampleRateHz);
        } else {
            updateGyroDenom(8);
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
                pidBaseFreq /= parseInt($(this).val());
            }

            pidSelectElement.empty();

            const MAX_DENOM = 8;

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
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            $('input[name="craftName"]').val(FC.CONFIG.craftName);
            $('input[name="pilotName"]').val(FC.CONFIG.pilotName);
        } else {
            $('input[name="craftName"]').val(FC.CONFIG.name);
            $('.pilotName').hide();
        }

        $('input[name="fpvCamAngleDegrees"]').val(FC.RX_CONFIG.fpvCamAngleDegrees);
        $('input[name="fpvCamAngleDegrees"]').attr("max", 90);

        // fill board alignment
        $('input[name="board_align_roll"]').val(FC.BOARD_ALIGNMENT_CONFIG.roll);
        $('input[name="board_align_pitch"]').val(FC.BOARD_ALIGNMENT_CONFIG.pitch);
        $('input[name="board_align_yaw"]').val(FC.BOARD_ALIGNMENT_CONFIG.yaw);

        // fill accel trims
        $('input[name="roll"]').val(FC.CONFIG.accelerometerTrims[1]);
        $('input[name="pitch"]').val(FC.CONFIG.accelerometerTrims[0]);

        $('._smallAngle').show();
        $('input[id="configurationSmallAngle"]').val(FC.ARMING_CONFIG.small_angle);

        // UI hooks

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
            const checked = $(this).is(':checked');
            $('.accelNeeded').toggle(checked);
        }).change();

        $(features_e).filter('select').change(function () {
            const element = $(this);

            FC.FEATURE_CONFIG.features.updateData(element);
            updateTabList(FC.FEATURE_CONFIG.features);
        });

        $('input.condition', beeper_e).change(function () {
            const element = $(this);
            FC.BEEPER_CONFIG.beepers.updateData(element);
        });

        checkUpdateGpsControls();

        $('a.save').on('click', function() {
            // gather data that doesn't have automatic change event bound
            FC.BOARD_ALIGNMENT_CONFIG.roll = parseInt($('input[name="board_align_roll"]').val());
            FC.BOARD_ALIGNMENT_CONFIG.pitch = parseInt($('input[name="board_align_pitch"]').val());
            FC.BOARD_ALIGNMENT_CONFIG.yaw = parseInt($('input[name="board_align_yaw"]').val());

            FC.CONFIG.accelerometerTrims[1] = parseInt($('input[name="roll"]').val());
            FC.CONFIG.accelerometerTrims[0] = parseInt($('input[name="pitch"]').val());

            // small angle configuration
            FC.ARMING_CONFIG.small_angle = parseInt($('input[id="configurationSmallAngle"]').val());

            FC.SENSOR_ALIGNMENT.gyro_to_use = parseInt(orientation_gyro_to_use_e.val());

            FC.PID_ADVANCED_CONFIG.gyro_sync_denom = parseInt(gyroSelectElement.val());

            const value = parseInt(pidSelectElement.val());

            if (value !== FC.PID_ADVANCED_CONFIG.pid_process_denom) {
                const newFrequency = pidSelectElement.find('option:selected').text();
                self.analyticsChanges['PIDLoopSettings'] = `denominator: ${value} | frequency: ${newFrequency}`;
            } else {
                self.analyticsChanges['PIDLoopSettings'] = undefined;
            }

            FC.PID_ADVANCED_CONFIG.pid_process_denom = value;

            FC.RX_CONFIG.fpvCamAngleDegrees = parseInt($('input[name="fpvCamAngleDegrees"]').val());

            tracking.sendSaveAndChangeEvents(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, self.analyticsChanges, 'configuration');
            self.analyticsChanges = {};

            // fill some data
            FC.SENSOR_CONFIG.acc_hardware = $('input[id="accHardwareSwitch"]').is(':checked') ? 0 : 1;
            FC.SENSOR_CONFIG.baro_hardware = $('input[id="baroHardwareSwitch"]').is(':checked') ? 0 : 1;
            FC.SENSOR_CONFIG.mag_hardware = $('input[id="magHardwareSwitch"]').is(':checked') ? 0 : 1;

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                FC.CONFIG.craftName = $('input[name="craftName"]').val().trim();
                FC.CONFIG.pilotName = $('input[name="pilotName"]').val().trim();
            } else {
                FC.CONFIG.name = $('input[name="craftName"]').val().trim();
            }

            function save_config() {
                Promise
                .resolve(true)
                .then(() => MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG)))
                .then(() => MSP.promise(MSPCodes.MSP_SET_BEEPER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BEEPER_CONFIG)))
                .then(() => MSP.promise(MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG)))
                .then(() => MSP.promise(MSPCodes.MSP_SET_RC_DEADBAND, mspHelper.crunch(MSPCodes.MSP_SET_RC_DEADBAND)))
                .then(() => MSP.promise(MSPCodes.MSP_SET_SENSOR_ALIGNMENT, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_ALIGNMENT)))
                .then(() => MSP.promise(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG)))
                .then(() => MSP.promise(MSPCodes.MSP_SET_ACC_TRIM, mspHelper.crunch(MSPCodes.MSP_SET_ACC_TRIM)))
                .then(() => MSP.promise(MSPCodes.MSP_SET_ARMING_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ARMING_CONFIG)))
                .then(() => MSP.promise(MSPCodes.MSP_SET_SENSOR_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_CONFIG)))
                .then(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)
                    ? MSP.promise(MSPCodes.MSP2_SET_TEXT, mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSPCodes.CRAFT_NAME))
                    : MSP.promise(MSPCodes.MSP_SET_NAME, mspHelper.crunch(MSPCodes.MSP_SET_NAME)))
                .then(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) ?
                    MSP.promise(MSPCodes.MSP2_SET_TEXT, mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSPCodes.PILOT_NAME)) : Promise.resolve(true))
                .then(() => MSP.promise(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG)))
                .then(() => mspHelper.writeConfiguration(true));
            }

            mspHelper.sendSerialConfig(save_config);
        });

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);
        GUI.content_ready(callback);
    }
};

configuration.cleanup = function (callback) {
    if (callback) callback();
};

TABS.configuration = configuration;
export { configuration };
