import { millitime } from '../utils/common.js';
import GUI, { TABS } from '../gui';
import { generateFilename } from '../utils/generate_filename.js';
import { i18n } from '../localization';
import FC from '../fc.js';
import FileSystem from '../FileSystem';
import MSP from '../msp.js';
import MSPCodes from '../msp/MSPCodes.js';
import CONFIGURATOR from '../data_storage.js';
import { gui_log } from '../gui_log.js';
import $ from 'jquery';

const logging = {
    fileEntry: null,
    fileWriter: null,
};

logging.initialize = function (callback) {


    if (GUI.active_tab != 'logging') {
        GUI.active_tab = 'logging';
    }

    let requestedProperties = [];
    let samples = 0;
    let requests = 0;
    let logBuffer = [];

    if (CONFIGURATOR.connectionValid) {
        const getMotorData = function () {
            MSP.send_message(MSPCodes.MSP_MOTOR, false, false, loadHtml);
        };

        const loadHtml = function () {
            $('#content').load("./tabs/logging.html", process_html);
        };

        MSP.send_message(MSPCodes.MSP_RC, false, false, getMotorData);
    }

    function process_html() {
        // translate to user-selected language
        i18n.localizePage();

        // UI hooks
        $('a.log_file').click(prepare_file);

        $('a.logging').click(function () {
            if (GUI.connected_to) {
                if (logging.fileEntry != null) {
                    const clicks = $(this).data('clicks');

                    if (!clicks) {
                        // reset some variables before start
                        samples = 0;
                        requests = 0;
                        logBuffer = [];
                        requestedProperties = [];

                        $('.properties input:checked').each(function () {
                            requestedProperties.push($(this).prop('name'));
                        });

                        if (requestedProperties.length) {

                            const logDataPoll = function () {
                                if (requests) {
                                    // save current data (only after everything is initialized)
                                    crunch_data();
                                }

                                // request new
                                for (let i = 0; i < requestedProperties.length; i++, requests++) {
                                    MSP.send_message(MSPCodes[requestedProperties[i]]);
                                }
                            };

                            function writeData() {
                                if (logBuffer.length) { // only execute when there is actual data to write
                                    append_to_file(logBuffer.join('\n').concat('\n'));

                                    $('.samples').text(samples += logBuffer.length);

                                    logBuffer = [];
                                }
                            }
                            console.log("Opening file: ", logging.fileEntry.name);
                            FileSystem.openFile(logging.fileEntry).then((writer) => {
                                logging.fileWriter = writer;

                                // print header for the csv file
                                print_head();

                                GUI.interval_add('log_data_poll', logDataPoll, parseInt($('select.speed').val()), true); // refresh rate goes here
                                GUI.interval_add('write_data', writeData, 1000);

                                $('.speed').prop('disabled', true);
                                $(this).text(i18n.getMessage('loggingStop'));
                                $(this).data("clicks", clicks !== true);
                            });
                        } else {
                            gui_log(i18n.getMessage('loggingErrorOneProperty'));
                        }
                    } else {
                        GUI.interval_kill_all();

                        console.log("Closing file: ", logging.fileEntry.name);
                        FileSystem.closeFile(logging.fileWriter)
                        .catch((error) => {
                            console.error("Error closing file: ", error);
                        });

                        $('.speed').prop('disabled', false);
                        $(this).text(i18n.getMessage('loggingStart'));
                        $(this).data("clicks", !clicks);
                    }
                } else {
                    gui_log(i18n.getMessage('loggingErrorLogFile'));
                }
            } else {
                gui_log(i18n.getMessage('loggingErrorNotConnected'));
            }
        });

        GUI.content_ready(callback);
    }

    function print_head() {
        let head = "timestamp";

        for (let i = 0; i < requestedProperties.length; i++) {
            switch (requestedProperties[i]) {
                case 'MSP_RAW_IMU':
                    head += ',' + 'gyroscopeX';
                    head += ',' + 'gyroscopeY';
                    head += ',' + 'gyroscopeZ';

                    head += ',' + 'accelerometerX';
                    head += ',' + 'accelerometerY';
                    head += ',' + 'accelerometerZ';

                    head += ',' + 'magnetometerX';
                    head += ',' + 'magnetometerY';
                    head += ',' + 'magnetometerZ';
                    break;
                case 'MSP_ATTITUDE':
                    head += ',' + 'kinematicsX';
                    head += ',' + 'kinematicsY';
                    head += ',' + 'kinematicsZ';
                    break;
                case 'MSP_ALTITUDE':
                    head += ',' + 'altitude';
                    break;
                case 'MSP_RAW_GPS':
                    head += ',' + 'gpsFix';
                    head += ',' + 'gpsNumSat';
                    head += ',' + 'gpsLat';
                    head += ',' + 'gpsLon';
                    head += ',' + 'gpsAlt';
                    head += ',' + 'gpsSpeed';
                    head += ',' + 'gpsGroundCourse';
                    break;
                case 'MSP_ANALOG':
                    head += ',' + 'voltage';
                    head += ',' + 'amperage';
                    head += ',' + 'mAhdrawn';
                    head += ',' + 'rssi';
                    break;
                case 'MSP_RC':
                    for (let chan = 0; chan < FC.RC.active_channels; chan++) {
                        head += `${',' + 'RC'}${chan}`;
                    }
                    break;
                case 'MSP_MOTOR':
                    for (let motor = 0; motor < FC.MOTOR_DATA.length; motor++) {
                        head += `${',' + 'Motor'}${motor}`;
                    }
                    break;
                case 'MSP_DEBUG':
                    for (let debug = 0; debug < FC.SENSOR_DATA.debug.length; debug++) {
                        head += `${',' + 'Debug'}${debug}`;
                    }
                    break;
            }
        }
        head += '\n';

        append_to_file(head);
    }

    function crunch_data() {
        let sample = millitime();

        for (let i = 0; i < requestedProperties.length; i++) {
            switch (requestedProperties[i]) {
                case 'MSP_RAW_IMU':
                    sample += `,${FC.SENSOR_DATA.gyroscope}`;
                    sample += `,${FC.SENSOR_DATA.accelerometer}`;
                    sample += `,${FC.SENSOR_DATA.magnetometer}`;
                    break;
                case 'MSP_ATTITUDE':
                    sample += `,${FC.SENSOR_DATA.kinematics[0]}`;
                    sample += `,${FC.SENSOR_DATA.kinematics[1]}`;
                    sample += `,${FC.SENSOR_DATA.kinematics[2]}`;
                    break;
                case 'MSP_ALTITUDE':
                    sample += `,${FC.SENSOR_DATA.altitude}`;
                    break;
                case 'MSP_RAW_GPS':
                    sample += `,${FC.GPS_DATA.fix}`;
                    sample += `,${FC.GPS_DATA.numSat}`;
                    sample += `,${FC.GPS_DATA.lat / 10000000}`;
                    sample += `,${FC.GPS_DATA.lon / 10000000}`;
                    sample += `,${FC.GPS_DATA.alt}`;
                    sample += `,${FC.GPS_DATA.speed}`;
                    sample += `,${FC.GPS_DATA.ground_course}`;
                    break;
                case 'MSP_ANALOG':
                    sample += `,${FC.ANALOG.voltage}`;
                    sample += `,${FC.ANALOG.amperage}`;
                    sample += `,${FC.ANALOG.mAhdrawn}`;
                    sample += `,${FC.ANALOG.rssi}`;
                    break;
                case 'MSP_RC':
                    for (let chan = 0; chan < FC.RC.active_channels; chan++) {
                        sample += `,${FC.RC.channels[chan]}`;
                    }
                    break;
                case 'MSP_MOTOR':
                    sample += `,${FC.MOTOR_DATA}`;
                    break;
                case 'MSP_DEBUG':
                    sample += `,${FC.SENSOR_DATA.debug}`;
                    break;
            }
        }

        logBuffer.push(sample);
    }


    // IO related methods
    function prepare_file() {
        const prefix = 'log';
        const suffix = 'csv';

        const filename = generateFilename(prefix, suffix);

        // create or load the file
        FileSystem.pickSaveFile(filename, i18n.getMessage('fileSystemPickerFiles', {typeof: suffix.toUpperCase}), `.${suffix}`).then((file) => {
            logging.fileEntry = file;
            console.log("Log file path: ", file.name);

            $('a.logging').removeClass('disabled');
        });
    }

    function append_to_file(data) {

        FileSystem.writeChunck(logging.fileWriter, new Blob([data], {type: 'text/plain'}))
        .catch((error) => {
            console.error("Error appending to file: ", error);
        });
    }
};

logging.cleanup = function (callback) {
    if (callback) callback();
};

// TODO: only for transition to modules, drop this eventually
TABS.logging = logging;

export {
    logging,
};
