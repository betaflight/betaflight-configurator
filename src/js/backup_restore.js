import { reinitializeConnection } from "./serial_backend";
import { update_dataflash_global } from "./update_dataflash_global";
import { sensor_status } from "./sensor_helpers.js";
import GUI from "./gui";
import Features from "./Features";
import { i18n } from "./localization";
import Beepers from "./Beepers";
import FC from "./fc";
import { mspHelper } from "./msp/MSPHelper";
import MSP from "./msp";
import MSPCodes from "./msp/MSPCodes";
import CONFIGURATOR, { API_VERSION_1_41, API_VERSION_1_45, API_VERSION_1_46 } from "./data_storage";
import { gui_log } from './gui_log';
import { generateFilename } from "./utils/generate_filename";
import semver from "semver";
import { tracking } from "./Analytics";
import { checkChromeRuntimeError } from "./utils/common";

// code below is highly experimental, although it runs fine on latest firmware
// the data inside nested objects needs to be verified if deep copy works properly
export function configuration_backup(callback) {
    let activeProfile = null;

    let version = CONFIGURATOR.version;

    if (version.indexOf(".") === -1) {
        version = `${version}.0.0`;
    }

    const configuration = {
        'generatedBy': version,
        'apiVersion': FC.CONFIG.apiVersion,
        'profiles': [],
    };

    const profileSpecificData = [
        MSPCodes.MSP_PID_CONTROLLER,
        MSPCodes.MSP_PID,
        MSPCodes.MSP_RC_TUNING,
        MSPCodes.MSP_ACC_TRIM,
        MSPCodes.MSP_SERVO_CONFIGURATIONS,
        MSPCodes.MSP_MODE_RANGES,
        MSPCodes.MSP_ADJUSTMENT_RANGES,
        MSPCodes.MSP_SERVO_MIX_RULES,
        MSPCodes.MSP_RC_DEADBAND,
    ];

    MSP.send_message(MSPCodes.MSP_STATUS, false, false, function () {
        activeProfile = FC.CONFIG.profile;
        select_profile();
    });

    function select_profile() {
        if (activeProfile > 0) {
            MSP.send_message(MSPCodes.MSP_SELECT_SETTING, [0], false, fetch_specific_data);
        } else {
            fetch_specific_data();
        }
    }

    function fetch_specific_data() {
        let fetchingProfile = 0;
        let codeKey = 0;

        function fetch_specific_data_item() {
            if (fetchingProfile < FC.CONFIG.numProfiles) {
                MSP.send_message(profileSpecificData[codeKey], false, false, function () {
                    codeKey++;

                    if (codeKey < profileSpecificData.length) {
                        fetch_specific_data_item();
                    } else {
                        configuration.profiles.push({
                            'PID': jQuery.extend(true, {}, FC.PID),
                            'PIDs': jQuery.extend(true, [], FC.PIDS),
                            'RC': jQuery.extend(true, {}, FC.RC_TUNING),
                            'AccTrim': jQuery.extend(true, [], FC.CONFIG.accelerometerTrims),
                            'ServoConfig': jQuery.extend(true, [], FC.SERVO_CONFIG),
                            'ServoRules': jQuery.extend(true, [], FC.SERVO_RULES),
                            'ModeRanges': jQuery.extend(true, [], FC.MODE_RANGES),
                            'AdjustmentRanges': jQuery.extend(true, [], FC.ADJUSTMENT_RANGES),
                        });

                        configuration.profiles[fetchingProfile].RCdeadband = jQuery.extend(true, {}, FC.RC_DEADBAND_CONFIG);

                        codeKey = 0;
                        fetchingProfile++;

                        MSP.send_message(MSPCodes.MSP_SELECT_SETTING, [fetchingProfile], false, fetch_specific_data_item);
                    }
                });
            } else {
                MSP.send_message(MSPCodes.MSP_SELECT_SETTING, [activeProfile], false, fetch_unique_data);
            }
        }

        // start fetching
        fetch_specific_data_item();
    }

    const uniqueData = [
        MSPCodes.MSP_RX_MAP,
        MSPCodes.MSP_CF_SERIAL_CONFIG,
        MSPCodes.MSP_LED_STRIP_CONFIG,
        MSPCodes.MSP_LED_COLORS,
    ];

    function update_unique_data_list() {
        uniqueData.push(MSPCodes.MSP_LOOP_TIME);
        uniqueData.push(MSPCodes.MSP_ARMING_CONFIG);
        uniqueData.push(MSPCodes.MSP_MOTOR_3D_CONFIG);
        uniqueData.push(MSPCodes.MSP_SENSOR_ALIGNMENT);
        uniqueData.push(MSPCodes.MSP_RX_CONFIG);
        uniqueData.push(MSPCodes.MSP_FAILSAFE_CONFIG);
        uniqueData.push(MSPCodes.MSP_RXFAIL_CONFIG);
        uniqueData.push(MSPCodes.MSP_LED_STRIP_MODECOLOR);
        uniqueData.push(MSPCodes.MSP_MOTOR_CONFIG);
        uniqueData.push(MSPCodes.MSP_RSSI_CONFIG);
        uniqueData.push(MSPCodes.MSP_GPS_CONFIG);
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            uniqueData.push(MSPCodes.MSP_COMPASS_CONFIG);
        }
        uniqueData.push(MSPCodes.MSP_FEATURE_CONFIG);
        uniqueData.push(MSPCodes.MSP_MODE_RANGES_EXTRA);
    }

    update_unique_data_list();

    function fetch_unique_data() {
        let codeKey = 0;

        function fetch_unique_data_item() {
            if (codeKey < uniqueData.length) {
                MSP.send_message(uniqueData[codeKey], false, false, function () {
                    codeKey++;
                    fetch_unique_data_item();
                });
            } else {
                configuration.RCMAP = jQuery.extend(true, [], FC.RC_MAP);
                configuration.SERIAL_CONFIG = jQuery.extend(true, {}, FC.SERIAL_CONFIG);
                configuration.LED_STRIP = jQuery.extend(true, [], FC.LED_STRIP);
                configuration.LED_COLORS = jQuery.extend(true, [], FC.LED_COLORS);
                configuration.BOARD_ALIGNMENT_CONFIG = jQuery.extend(true, {}, FC.BOARD_ALIGNMENT_CONFIG);
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                    configuration.CRAFT_NAME = FC.CONFIG.craftName;
                    configuration.PILOT_NAME = FC.CONFIG.pilotName;
                } else {
                    configuration.CRAFT_NAME = FC.CONFIG.name;
                    configuration.DISPLAY_NAME = FC.CONFIG.displayName;
                }
                configuration.MIXER_CONFIG = jQuery.extend(true, {}, FC.MIXER_CONFIG);
                configuration.SENSOR_CONFIG = jQuery.extend(true, {}, FC.SENSOR_CONFIG);
                configuration.PID_ADVANCED_CONFIG = jQuery.extend(true, {}, FC.PID_ADVANCED_CONFIG);

                configuration.LED_MODE_COLORS = jQuery.extend(true, [], FC.LED_MODE_COLORS);
                configuration.FC_CONFIG = jQuery.extend(true, {}, FC.FC_CONFIG);
                configuration.ARMING_CONFIG = jQuery.extend(true, {}, FC.ARMING_CONFIG);
                configuration.MOTOR_3D_CONFIG = jQuery.extend(true, {}, FC.MOTOR_3D_CONFIG);
                configuration.SENSOR_ALIGNMENT = jQuery.extend(true, {}, FC.SENSOR_ALIGNMENT);
                configuration.RX_CONFIG = jQuery.extend(true, {}, FC.RX_CONFIG);
                configuration.FAILSAFE_CONFIG = jQuery.extend(true, {}, FC.FAILSAFE_CONFIG);
                configuration.RXFAIL_CONFIG = jQuery.extend(true, [], FC.RXFAIL_CONFIG);
                configuration.RSSI_CONFIG = jQuery.extend(true, {}, FC.RSSI_CONFIG);
                configuration.FEATURE_CONFIG = jQuery.extend(true, {}, FC.FEATURE_CONFIG);
                configuration.MOTOR_CONFIG = jQuery.extend(true, {}, FC.MOTOR_CONFIG);
                configuration.GPS_CONFIG = jQuery.extend(true, {}, FC.GPS_CONFIG);
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                    configuration.COMPASS_CONFIG = jQuery.extend(true, {}, FC.COMPASS_CONFIG);
                }
                configuration.BEEPER_CONFIG = jQuery.extend(true, {}, FC.BEEPER_CONFIG);
                configuration.MODE_RANGES_EXTRA = jQuery.extend(true, [], FC.MODE_RANGES_EXTRA);

                save();
            }
        }

        if (GUI.configuration_loaded === true) {
            return fetch_unique_data_item();
        }

        MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG)
        .then(() => MSP.promise(MSPCodes.MSP_SENSOR_CONFIG))
        .then(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)
                ? MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.CRAFT_NAME))
                : MSP.promise(MSPCodes.MSP_NAME))
        .then(() => semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)
                ? MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.PILOT_NAME)) : Promise.resolve(true))
        .then(() => MSP.promise(MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG))
        .then(() => MSP.promise(MSPCodes.MSP_MIXER_CONFIG))
        .then(() => MSP.promise(MSPCodes.MSP_BEEPER_CONFIG))
        .then(() => fetch_unique_data_item());
    }

    function save() {
        let chosenFileEntry = null;

        const prefix = 'backup';
        const suffix = 'json';

        const filename = generateFilename(prefix, suffix);

        const accepts = [{
            description: `${suffix.toUpperCase()} files`, extensions: [suffix],
        }];

        // create or load the file
        chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: filename, accepts: accepts}, function (fileEntry) {
            if (checkChromeRuntimeError()) {
                return;
            }

            if (!fileEntry) {
                console.log('No file selected, backup aborted.');
                return;
            }

            chosenFileEntry = fileEntry;

            // echo/console log path specified
            chrome.fileSystem.getDisplayPath(chosenFileEntry, function (path) {
                console.log(`Backup file path: ${path}`);
            });

            // change file entry from read only to read/write
            chrome.fileSystem.getWritableEntry(chosenFileEntry, function (fileEntryWritable) {
                // check if file is writable
                chrome.fileSystem.isWritableEntry(fileEntryWritable, function (isWritable) {
                    if (isWritable) {
                        chosenFileEntry = fileEntryWritable;

                        // crunch the config object
                        const serializedConfigObject = JSON.stringify(configuration, null, '\t');
                        const blob = new Blob([serializedConfigObject], {type: 'text/plain'}); // first parameter for Blob needs to be an array

                        chosenFileEntry.createWriter(function (writer) {
                            writer.onerror = function (e) {
                                console.error(e);
                            };

                            let truncated = false;
                            writer.onwriteend = function () {
                                if (!truncated) {
                                    // onwriteend will be fired again when truncation is finished
                                    truncated = true;
                                    writer.truncate(blob.size);

                                    return;
                                }

                                tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'Backup');
                                console.log('Write SUCCESSFUL');
                                if (callback) callback();
                            };

                            writer.write(blob);
                        }, function (e) {
                            console.error(e);
                        });
                    } else {
                        // Something went wrong or file is set to read only and cannot be changed
                        console.log('File appears to be read only, sorry.');
                    }
                });
            });
        });
    }

}

export function configuration_restore(callback) {
    let chosenFileEntry = null;

    const accepts = [{
        description: 'JSON files', extensions: ['json'],
    }];

    // load up the file
    chrome.fileSystem.chooseEntry({type: 'openFile', accepts: accepts}, function (fileEntry) {
        if (checkChromeRuntimeError()) {
            return;
        }

        if (!fileEntry) {
            console.log('No file selected, restore aborted.');
            return;
        }

        chosenFileEntry = fileEntry;

        // echo/console log path specified
        chrome.fileSystem.getDisplayPath(chosenFileEntry, function (path) {
            console.log(`Restore file path: ${path}`);
        });

        // read contents into variable
        chosenFileEntry.file(function (file) {
            const reader = new FileReader();

            reader.onprogress = function (e) {
                if (e.total > 1048576) { // 1 MB
                    // dont allow reading files bigger then 1 MB
                    console.log('File limit (1 MB) exceeded, aborting');
                    reader.abort();
                }
            };

            reader.onloadend = function (e) {
                if ((e.total != 0 && e.total == e.loaded) || GUI.isCordova()) {
                    // Cordova: Ignore verification : seem to have a bug with progressEvent returned
                    console.log('Read SUCCESSFUL');
                    let configuration;
                    try { // check if string provided is a valid JSON
                        configuration = JSON.parse(e.target.result);
                    } catch (err) {
                        // data provided != valid json object
                        console.log(`Data provided != valid JSON string, restore aborted: ${err}`);

                        return;
                    }

                    // validate
                    if (typeof configuration.generatedBy !== 'undefined' && compareVersions(configuration.generatedBy, CONFIGURATOR.BACKUP_FILE_VERSION_MIN_SUPPORTED)) {
                        if (!compareVersions(configuration.generatedBy, "1.14.0") && !migrate(configuration)) {
                            gui_log(i18n.getMessage('backupFileUnmigratable'));
                            return;
                        }
                        if (configuration.FEATURE_CONFIG.features._featureMask) {
                            const features = new Features(FC.CONFIG);
                            features.setMask(configuration.FEATURE_CONFIG.features._featureMask);
                            configuration.FEATURE_CONFIG.features = features;
                        }

                        tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'Restore');

                        configuration_upload(configuration, callback);
                    } else {
                        gui_log(i18n.getMessage('backupFileIncompatible'));
                    }
                }
            };

            reader.readAsText(file);
        });
    });

    function compareVersions(generated, required) {
        if (generated == undefined) {
            return false;
        }
        return semver.gte(generated, required);
    }


    function migrate(configuration) {
        let appliedMigrationsCount = 0;
        let migratedVersion = configuration.generatedBy;
        gui_log(i18n.getMessage('configMigrationFrom', [migratedVersion]));

        if (!compareVersions(migratedVersion, '0.59.1')) {

            // variable was renamed
            configuration.RSSI_CONFIG.channel = configuration.MISC.rssi_aux_channel;
            configuration.MISC.rssi_aux_channel = undefined;

            migratedVersion = '0.59.1';
            gui_log(i18n.getMessage('configMigratedTo', [migratedVersion]));
            appliedMigrationsCount++;
        }

        if (!compareVersions(migratedVersion, '0.60.1')) {

            // LED_STRIP support was added.
            if (!configuration.LED_STRIP) {
                configuration.LED_STRIP = [];
            }

            migratedVersion = '0.60.1';
            gui_log(i18n.getMessage('configMigratedTo', [migratedVersion]));
            appliedMigrationsCount++;
        }

        if (!compareVersions(migratedVersion, '0.61.0')) {

            // Changing PID controller via UI was added.
            if (!configuration.PIDs && configuration.PID) {
                configuration.PIDs = configuration.PID;
                configuration.PID = {
                    controller: 0, // assume pid controller 0 was used.
                };
            }

            migratedVersion = '0.61.0';
            gui_log(i18n.getMessage('configMigratedTo', [migratedVersion]));
            appliedMigrationsCount++;
        }

        if (!compareVersions(migratedVersion, '0.63.0')) {

            // LED Strip was saved as object instead of array.
            if (typeof(configuration.LED_STRIP) == 'object') {
                const fixedLedStrip = [];

                let index = 0;
                while (configuration.LED_STRIP[index]) {
                    fixedLedStrip.push(configuration.LED_STRIP[index++]);
                }
                configuration.LED_STRIP = fixedLedStrip;
            }

            for (let profileIndex = 0; profileIndex < 3; profileIndex++) {
                const RC = configuration.profiles[profileIndex].RC;
                // TPA breakpoint was added
                if (!RC.dynamic_THR_breakpoint) {
                    RC.dynamic_THR_breakpoint = 1500; // firmware default
                }

                // Roll and pitch rates were split
                RC.roll_rate = RC.roll_pitch_rate;
                RC.pitch_rate = RC.roll_pitch_rate;
            }

            migratedVersion = '0.63.0';
            gui_log(i18n.getMessage('configMigratedTo', [migratedVersion]));
            appliedMigrationsCount++;
        }

        if (configuration.apiVersion == undefined) {
            configuration.apiVersion = "1.0.0"; // a guess that will satisfy the rest of the code
        }
        // apiVersion previously stored without patchlevel
        if (!semver.parse(configuration.apiVersion)) {
            configuration.apiVersion += ".0";
            if (!semver.parse(configuration.apiVersion)) {
                return false;
            }
        }
        if (compareVersions(migratedVersion, '0.63.0') && !compareVersions(configuration.apiVersion, '1.7.0')) {
            // Serial configuation redesigned, 0.63.0 saves old and new configurations.
            const ports = [];
            for (const port of configuration.SERIAL_CONFIG.ports) {
                const oldPort = port;

                const newPort = {
                    identifier: oldPort.identifier,
                    functions: [],
                    msp_baudrate: String(configuration.SERIAL_CONFIG.mspBaudRate),
                    gps_baudrate: String(configuration.SERIAL_CONFIG.gpsBaudRate),
                    telemetry_baudrate: 'AUTO',
                    blackbox_baudrate: '115200',
                };

                switch(oldPort.scenario) {
                    case 1: // MSP, CLI, TELEMETRY, SMARTPORT TELEMETRY, GPS-PASSTHROUGH
                    case 5: // MSP, CLI, GPS-PASSTHROUGH
                    case 8: // MSP ONLY
                        newPort.functions.push('MSP');
                        break;
                    case 2: // GPS
                        newPort.functions.push('GPS');
                        break;
                    case 3: // RX_SERIAL
                        newPort.functions.push('RX_SERIAL');
                        break;
                    case 10: // BLACKBOX ONLY
                        newPort.functions.push('BLACKBOX');
                        break;
                    case 11: // MSP, CLI, BLACKBOX, GPS-PASSTHROUGH
                        newPort.functions.push('MSP');
                        newPort.functions.push('BLACKBOX');
                        break;
                }

                ports.push(newPort);
            }
            configuration.SERIAL_CONFIG = {
                ports: ports,
            };

            gui_log(i18n.getMessage('configMigratedTo', [migratedVersion]));
            appliedMigrationsCount++;
        }

        if (compareVersions(migratedVersion, '0.63.0') && !compareVersions(configuration.apiVersion, '1.8.0')) {
            // api 1.8 exposes looptime and arming config

            if (configuration.FC_CONFIG == undefined) {
                configuration.FC_CONFIG = {
                    loopTime: 3500,
                };
            }

            if (configuration.ARMING_CONFIG == undefined) {
                configuration.ARMING_CONFIG = {
                    auto_disarm_delay:      5,
                    disarm_kill_switch:     1,
                };
            }

            gui_log(i18n.getMessage('configMigratedTo', [migratedVersion]));
            appliedMigrationsCount++;
        }

        if (compareVersions(migratedVersion, '0.63.0')) {
            // backups created with 0.63.0 for firmwares with api < 1.8 were saved with incorrect looptime
            if (configuration.FC_CONFIG.loopTime == 0) {
                //reset it to the default
                configuration.FC_CONFIG.loopTime = 3500;
            }
        }

        if (semver.lt(migratedVersion, '0.66.0')) {
            // api 1.12 updated servo configuration protocol and added servo mixer rules
            for (let profileIndex = 0; profileIndex < configuration.profiles.length; profileIndex++) {
                if (semver.eq(configuration.apiVersion, '1.10.0')) {
                    // drop two unused servo configurations
                    while (configuration.profiles[profileIndex].ServoConfig.length > 8) {
                        configuration.profiles[profileIndex].ServoConfig.pop();
                    }
                }

                for (let i = 0; i < configuration.profiles[profileIndex].ServoConfig.length; i++) {
                    const servoConfig = configuration.profiles[profileIndex].ServoConfig;

                    servoConfig[i].angleAtMin = 45;
                    servoConfig[i].angleAtMax = 45;
                    servoConfig[i].reversedInputSources = 0;

                    // set the rate to 0 if an invalid value is detected.
                    if (servoConfig[i].rate < -100 || servoConfig[i].rate > 100) {
                        servoConfig[i].rate = 0;
                    }
                }

                configuration.profiles[profileIndex].ServoRules = [];
            }

            migratedVersion = '0.66.0';

            gui_log(i18n.getMessage('configMigratedTo', [migratedVersion]));
            appliedMigrationsCount++;
        }

        if (semver.lt(configuration.apiVersion, '1.14.0') && semver.gte(FC.CONFIG.apiVersion, "1.14.0")) {
            // api 1.14 removed old pid controllers
            for (let profileIndex = 0; profileIndex < configuration.profiles.length; profileIndex++) {
                let newPidControllerIndex = configuration.profiles[profileIndex].PID.controller;
                switch (newPidControllerIndex) {
                    case 3:
                    case 4:
                    case 5:
                        newPidControllerIndex = 0;
                        break;
                }
                configuration.profiles[profileIndex].PID.controller = newPidControllerIndex;
            }

            gui_log(i18n.getMessage('configMigratedTo', [migratedVersion]));
            appliedMigrationsCount++;
        }


        if (compareVersions(migratedVersion, '0.66.0') && !compareVersions(configuration.apiVersion, '1.14.0')) {
            // api 1.14 exposes 3D configuration

            if (configuration.MOTOR_3D_CONFIG == undefined) {
                configuration.MOTOR_3D_CONFIG = {
                    deadband3d_low:         1406,
                    deadband3d_high:        1514,
                    neutral:                1460,
                    deadband3d_throttle:    50,
                };
            }

            gui_log(i18n.getMessage('configMigratedTo', [migratedVersion]));
            appliedMigrationsCount++;
        }


        if (compareVersions(migratedVersion, '0.66.0') && !compareVersions(configuration.apiVersion, '1.15.0')) {
            // api 1.15 exposes RCdeadband and sensor alignment

            for (let profileIndex = 0; profileIndex < configuration.profiles.length; profileIndex++) {
                 if (configuration.profiles[profileIndex].RCdeadband == undefined) {
                    configuration.profiles[profileIndex].RCdeadband = {
                    deadband:                0,
                    yaw_deadband:            0,
                    alt_hold_deadband:       40,
                    };
                }
            }
            if (configuration.SENSOR_ALIGNMENT == undefined) {
                    configuration.SENSOR_ALIGNMENT = {
                    align_gyro:              0,
                    align_acc:               0,
                    align_mag:               0,
                    };
            }

            // api 1.15 exposes RX_CONFIG, FAILSAFE_CONFIG and RXFAIL_CONFIG configuration

            if (configuration.RX_CONFIG == undefined) {
                configuration.RX_CONFIG = {
                    serialrx_provider:      0,
                    spektrum_sat_bind:      0,
                    stick_center:           1500,
                    stick_min:              1100,
                    stick_max:              1900,
                    rx_min_usec:            885,
                    rx_max_usec:            2115,
                };
            }

            if (configuration.FAILSAFE_CONFIG == undefined) {
                configuration.FAILSAFE_CONFIG = {
                    failsafe_delay:                 10,
                    failsafe_off_delay:             200,
                    failsafe_throttle:              1000,
                    failsafe_switch_mode:           0,
                    failsafe_throttle_low_delay:    100,
                    failsafe_procedure:             0,
                };
            }

            if (configuration.RXFAIL_CONFIG == undefined) {
                configuration.RXFAIL_CONFIG = [
                    {mode: 0, value: 1500},
                    {mode: 0, value: 1500},
                    {mode: 0, value: 1500},
                    {mode: 0, value: 875},
                ];

                for (let i = 0; i < 14; i++) {
                    const rxfailChannel = {
                        mode:  1,
                        value: 1500,
                    };
                    configuration.RXFAIL_CONFIG.push(rxfailChannel);
                }
            }

            gui_log(i18n.getMessage('configMigratedTo', [migratedVersion]));
            appliedMigrationsCount++;
        }

        if (compareVersions(migratedVersion, '1.2.0')) {
            // old version of the configurator incorrectly had a 'disabled' option for GPS SBAS mode.
            if (FC.GPS_CONFIG.ublox_sbas < 0) {
                FC.GPS_CONFIG.ublox_sbas = 0;
            }
            migratedVersion = '1.2.0';

            gui_log(i18n.getMessage('configMigratedTo', [migratedVersion]));
            appliedMigrationsCount++;
        }

        if (compareVersions(migratedVersion, '1.3.1')) {

            // LED_COLORS & LED_MODE_COLORS support was added.
            if (!configuration.LED_COLORS) {
                configuration.LED_COLORS = [];
            }
            if (!configuration.LED_MODE_COLORS) {
                configuration.LED_MODE_COLORS = [];
            }

            migratedVersion = '1.3.1';

            gui_log(i18n.getMessage('configMigratedTo', [migratedVersion]));
            appliedMigrationsCount++;
        }

        if (appliedMigrationsCount > 0) {
            gui_log(i18n.getMessage('configMigrationSuccessful', [appliedMigrationsCount]));
        }
        return true;
    }

    function configuration_upload(configuration, _callback) {
        function upload() {
            let activeProfile = null;
            let numProfiles = FC.CONFIG.numProfiles;
            if (configuration.profiles.length < numProfiles) {
                numProfiles = configuration.profiles.length;
            }

            const profileSpecificData = [
                MSPCodes.MSP_SET_PID_CONTROLLER,
                MSPCodes.MSP_SET_PID,
                MSPCodes.MSP_SET_RC_TUNING,
                MSPCodes.MSP_SET_ACC_TRIM,
                MSPCodes.MSP_SET_RC_DEADBAND,
            ];

            MSP.send_message(MSPCodes.MSP_STATUS, false, false, function () {
                activeProfile = FC.CONFIG.profile;
                select_profile();
            });

            function select_profile() {
                if (activeProfile > 0) {
                    MSP.send_message(MSPCodes.MSP_SELECT_SETTING, [0], false, upload_specific_data);
                } else {
                    upload_specific_data();
                }
            }

            function upload_specific_data() {
                let savingProfile = 0;
                let codeKey = 0;

                function load_objects(profile) {
                    FC.PID = configuration.profiles[profile].PID;
                    FC.PIDS = configuration.profiles[profile].PIDs;
                    FC.RC_TUNING = configuration.profiles[profile].RC;
                    FC.CONFIG.accelerometerTrims = configuration.profiles[profile].AccTrim;
                    FC.SERVO_CONFIG = configuration.profiles[profile].ServoConfig;
                    FC.SERVO_RULES = configuration.profiles[profile].ServoRules;
                    FC.MODE_RANGES = configuration.profiles[profile].ModeRanges;
                    FC.ADJUSTMENT_RANGES = configuration.profiles[profile].AdjustmentRanges;
                    FC.RC_DEADBAND_CONFIG = configuration.profiles[profile].RCdeadband;
                }

                function upload_using_specific_commands() {
                    MSP.send_message(profileSpecificData[codeKey], mspHelper.crunch(profileSpecificData[codeKey]), false, function () {
                        codeKey++;

                        if (codeKey < profileSpecificData.length) {
                            upload_using_specific_commands();
                        } else {
                            codeKey = 0;
                            savingProfile++;

                            if (savingProfile < numProfiles) {
                                load_objects(savingProfile);

                                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, function () {
                                    MSP.send_message(MSPCodes.MSP_SELECT_SETTING, [savingProfile], false, upload_using_specific_commands);
                                });
                            } else {
                                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, function () {
                                    MSP.send_message(MSPCodes.MSP_SELECT_SETTING, [activeProfile], false, upload_unique_data);
                                });
                            }
                        }
                    });
                }

                function upload_servo_configuration() {
                    mspHelper.sendServoConfigurations(upload_mode_ranges);
                }

                function upload_mode_ranges() {
                    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
                        if (configuration.MODE_RANGES_EXTRA == undefined) {
                            FC.MODE_RANGES_EXTRA = [];

                            for (let modeIndex = 0; modeIndex < FC.MODE_RANGES.length; modeIndex++) {
                                const defaultModeRangeExtra = {
                                    modeId:     FC.MODE_RANGES[modeIndex].modeId,
                                    modeLogic:  0,
                                    linkedTo:   0,
                                };
                                FC.MODE_RANGES_EXTRA.push(defaultModeRangeExtra);
                            }
                        } else {
                            FC.MODE_RANGES_EXTRA = configuration.MODE_RANGES_EXTRA;
                        }
                    }

                    mspHelper.sendModeRanges(upload_adjustment_ranges);
                }

                function upload_adjustment_ranges() {
                    mspHelper.sendAdjustmentRanges(upload_using_specific_commands);
                }
                // start uploading
                load_objects(0);
                upload_servo_configuration();
            }

            function upload_unique_data() {
                let codeKey = 0;

                const uniqueData = [
                    MSPCodes.MSP_SET_RX_MAP,
                    MSPCodes.MSP_SET_CF_SERIAL_CONFIG,
                ];

                function update_unique_data_list() {
                    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                        uniqueData.push([MSPCodes.MSP2_SET_TEXT, MSPCodes.CRAFT_NAME]);
                        uniqueData.push([MSPCodes.MSP2_SET_TEXT, MSPCodes.PILOT_NAME]);
                    } else {
                        uniqueData.push(MSPCodes.MSP_SET_NAME);
                    }

                    uniqueData.push(MSPCodes.MSP_SET_SENSOR_CONFIG);
                    uniqueData.push(MSPCodes.MSP_SET_MIXER_CONFIG);
                    uniqueData.push(MSPCodes.MSP_SET_BEEPER_CONFIG);
                    uniqueData.push(MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG);
                    uniqueData.push(MSPCodes.MSP_SET_ADVANCED_CONFIG);

                    uniqueData.push(MSPCodes.MSP_SET_LOOP_TIME);
                    uniqueData.push(MSPCodes.MSP_SET_ARMING_CONFIG);
                    uniqueData.push(MSPCodes.MSP_SET_MOTOR_3D_CONFIG);
                    uniqueData.push(MSPCodes.MSP_SET_SENSOR_ALIGNMENT);
                    uniqueData.push(MSPCodes.MSP_SET_RX_CONFIG);
                    uniqueData.push(MSPCodes.MSP_SET_FAILSAFE_CONFIG);
                    uniqueData.push(MSPCodes.MSP_SET_FEATURE_CONFIG);
                    uniqueData.push(MSPCodes.MSP_SET_MOTOR_CONFIG);
                    uniqueData.push(MSPCodes.MSP_SET_GPS_CONFIG);
                    uniqueData.push(MSPCodes.MSP_SET_COMPASS_CONFIG);
                    uniqueData.push(MSPCodes.MSP_SET_RSSI_CONFIG);
                }

                function load_objects() {
                    FC.MISC = configuration.MISC;
                    FC.RC_MAP = configuration.RCMAP;
                    FC.SERIAL_CONFIG = configuration.SERIAL_CONFIG;
                    FC.LED_STRIP = configuration.LED_STRIP;
                    FC.LED_COLORS = configuration.LED_COLORS;
                    FC.LED_MODE_COLORS = configuration.LED_MODE_COLORS;
                    FC.ARMING_CONFIG = configuration.ARMING_CONFIG;
                    FC.FC_CONFIG = configuration.FC_CONFIG;
                    FC.MOTOR_3D_CONFIG = configuration.MOTOR_3D_CONFIG;
                    FC.SENSOR_ALIGNMENT = configuration.SENSOR_ALIGNMENT;
                    FC.RX_CONFIG = configuration.RX_CONFIG;
                    FC.FAILSAFE_CONFIG = configuration.FAILSAFE_CONFIG;
                    FC.RXFAIL_CONFIG = configuration.RXFAIL_CONFIG;
                    FC.FEATURE_CONFIG = configuration.FEATURE_CONFIG;
                    FC.MOTOR_CONFIG = configuration.MOTOR_CONFIG;
                    FC.GPS_CONFIG = configuration.GPS_CONFIG;
                    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                        FC.COMPASS_CONFIG = configuration.COMPASS_CONFIG;
                    }
                    FC.RSSI_CONFIG = configuration.RSSI_CONFIG;
                    FC.BOARD_ALIGNMENT_CONFIG = configuration.BOARD_ALIGNMENT_CONFIG;
                    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                        FC.CONFIG.craftName = configuration.CRAFT_NAME;
                        FC.CONFIG.pilotName = configuration.PILOT_NAME;
                    } else {
                        FC.CONFIG.name = configuration.CRAFT_NAME;
                        FC.CONFIG.displayName = configuration.DISPLAY_NAME;
                    }
                    FC.MIXER_CONFIG = configuration.MIXER_CONFIG;
                    FC.SENSOR_CONFIG = configuration.SENSOR_CONFIG;
                    FC.PID_ADVANCED_CONFIG = configuration.PID_ADVANCED_CONFIG;

                    FC.BEEPER_CONFIG.beepers = new Beepers(FC.CONFIG);
                    FC.BEEPER_CONFIG.beepers.setDisabledMask(configuration.BEEPER_CONFIG.beepers._beeperDisabledMask);
                    FC.BEEPER_CONFIG.dshotBeaconTone = configuration.BEEPER_CONFIG.dshotBeaconTone;
                    FC.BEEPER_CONFIG.dshotBeaconConditions = new Beepers(FC.CONFIG, [ "RX_LOST", "RX_SET" ]);
                    FC.BEEPER_CONFIG.dshotBeaconConditions.setDisabledMask(configuration.BEEPER_CONFIG.dshotBeaconConditions._beeperDisabledMask);
                }

                function send_unique_data_item() {
                    if (codeKey < uniqueData.length) {
                        const callback = () => {
                            codeKey++;
                            send_unique_data_item();
                        };

                        if (Array.isArray(uniqueData[codeKey])) {
                            MSP.send_message(uniqueData[codeKey][0], mspHelper.crunch(...uniqueData[codeKey]), false, callback);
                        } else {
                            MSP.send_message(uniqueData[codeKey], mspHelper.crunch(uniqueData[codeKey]), false, callback);
                        }
                    } else {
                        send_led_strip_config();
                    }
                }

                load_objects();

                update_unique_data_list();

                // start uploading
                send_unique_data_item();
            }

            function send_led_strip_config() {
                mspHelper.sendLedStripConfig(send_led_strip_colors);
            }

            function send_led_strip_colors() {
                mspHelper.sendLedStripColors(send_led_strip_mode_colors);
            }

            function send_led_strip_mode_colors() {
                mspHelper.sendLedStripModeColors(send_rxfail_config);
            }

            function send_rxfail_config() {
                mspHelper.sendRxFailConfig(save_to_eeprom);
            }

            function save_to_eeprom() {
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, reboot);
            }

            function reboot() {
                gui_log(i18n.getMessage('eeprom_saved_ok'));

                GUI.tab_switch_cleanup(function() {
                    MSP.Promise(MSPCodes.MSP_SET_REBOOT)
                    .then(() => reinitializeConnection())
                    .then(() => _callback());
                });
            }
        }

        if (CONFIGURATOR.virtualMode) {
            FC.resetState();
            FC.CONFIG.apiVersion = CONFIGURATOR.virtualApiVersion;

            sensor_status(FC.CONFIG.activeSensors);
            update_dataflash_global();
        }

        upload();
    }
}
