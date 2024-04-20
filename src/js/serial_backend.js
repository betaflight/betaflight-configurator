import GUI, { TABS } from "./gui";
import { i18n } from "./localization";
// NOTE: this is a circular dependency, needs investigating
import MspHelper from "./msp/MSPHelper";
import Features from "./Features";
import VirtualFC from "./VirtualFC";
import Beepers from "./Beepers";
import FC from "./fc";
import MSP from "./msp";
import MSPCodes from "./msp/MSPCodes";
import PortUsage from "./port_usage";
import PortHandler from "./port_handler";
import CONFIGURATOR, { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "./data_storage";
import UI_PHONES from "./phones_ui";
import { bit_check } from './bit.js';
import { sensor_status, have_sensor } from "./sensor_helpers";
import { update_dataflash_global } from "./update_dataflash_global";
import { gui_log } from "./gui_log";
import { updateTabList } from "./utils/updateTabList";
import { get as getConfig, set as setConfig } from "./ConfigStorage";
import { tracking } from "./Analytics";
import semver from 'semver';
import CryptoES from "crypto-es";
import $ from 'jquery';
import BuildApi from "./BuildApi";

import serialNWJS from "./serial.js";
import serialWeb from "./webSerial.js";
import { isWeb } from "./utils/isWeb";

const serial = isWeb() ? serialWeb : serialNWJS;

let mspHelper;
let connectionTimestamp;
let liveDataRefreshTimerId = false;

let isConnected = false;

const toggleStatus = function () {
    isConnected = !isConnected;
};

function connectHandler(event) {
    onOpen(event.detail);
    toggleStatus();
}

function disconnectHandler(event) {
    onClosed(event.detail);
}

export function initializeSerialBackend() {
    GUI.updateManualPortVisibility = function() {
        const selected_port = $('div#port-picker #port option:selected');
        if (selected_port.data().isManual) {
            $('#port-override-option').show();
        }
        else {
            $('#port-override-option').hide();
        }
        if (selected_port.data().isVirtual) {
            $('#firmware-virtual-option').show();
        }
        else {
            $('#firmware-virtual-option').hide();
        }

        $('#auto-connect-and-baud').toggle(!selected_port.data().isDFU);
    };

    GUI.updateManualPortVisibility();

    $('#port-override').change(function () {
        setConfig({'portOverride': $('#port-override').val()});
    });

    const data = getConfig('portOverride');
    if (data.portOverride) {
        $('#port-override').val(data.portOverride);
    }

    $('div#port-picker #port').change(function (target) {
        GUI.updateManualPortVisibility();
    });


    $("div.connect_controls a.connect").on('click', function () {

        const selectedPort = $('div#port-picker #port option:selected');
        let portName;
        if (selectedPort.data().isManual) {
            portName = $('#port-override').val();
        } else {
            portName = String($('div#port-picker #port').val());
        }

        if (!GUI.connect_lock) {
            // GUI control overrides the user control

            GUI.configuration_loaded = false;

            const selected_baud = parseInt($('div#port-picker #baud').val());
            const selectedPort = $('div#port-picker #port option:selected');

            if (selectedPort.data().isDFU) {
                $('select#baud').hide();
            } else if (portName !== '0') {
                if (!isConnected) {
                    console.log(`Connecting to: ${portName}`);
                    GUI.connecting_to = portName;

                    // lock port select & baud while we are connecting / connected
                    $('div#port-picker #port, div#port-picker #baud, div#port-picker #delay').prop('disabled', true);
                    $('div.connect_controls div.connect_state').text(i18n.getMessage('connecting'));

                    const baudRate = parseInt($('div#port-picker #baud').val());
                    if (selectedPort.data().isVirtual) {
                        CONFIGURATOR.virtualMode = true;
                        CONFIGURATOR.virtualApiVersion = $('#firmware-version-dropdown :selected').val();

                        serial.connect('virtual', {}, onOpenVirtual);
                    } else if (isWeb()) {
                        // Explicitly disconnect the event listeners before attaching the new ones.
                        serial.removeEventListener('connect', connectHandler);
                        serial.addEventListener('connect', connectHandler);

                        serial.removeEventListener('disconnect', disconnectHandler);
                        serial.addEventListener('disconnect', disconnectHandler);

                        serial.connect({ baudRate });
                    } else {
                        serial.connect(
                            portName,
                            { bitrate: selected_baud },
                            onOpen,
                        );
                        toggleStatus();
                    }

                } else {
                    if ($('div#flashbutton a.flash_state').hasClass('active') && $('div#flashbutton a.flash').hasClass('active')) {
                        $('div#flashbutton a.flash_state').removeClass('active');
                        $('div#flashbutton a.flash').removeClass('active');
                    }
                    GUI.timeout_kill_all();
                    GUI.interval_kill_all();
                    GUI.tab_switch_cleanup(() => GUI.tab_switch_in_progress = false);

                    function onFinishCallback() {
                        finishClose(toggleStatus);
                    }

                    mspHelper?.setArmingEnabled(true, false, onFinishCallback);
                }
            }
        }
    });

    $('div.open_firmware_flasher a.flash').click(function () {
        if ($('div#flashbutton a.flash_state').hasClass('active') && $('div#flashbutton a.flash').hasClass('active')) {
            $('div#flashbutton a.flash_state').removeClass('active');
            $('div#flashbutton a.flash').removeClass('active');
            $('#tabs ul.mode-disconnected .tab_landing a').click();
        } else {
            $('#tabs ul.mode-disconnected .tab_firmware_flasher a').click();
            $('div#flashbutton a.flash_state').addClass('active');
            $('div#flashbutton a.flash').addClass('active');
        }
    });

    // auto-connect
    const result = getConfig('auto_connect');
    if (result.auto_connect === undefined || result.auto_connect) {
        // default or enabled by user
        GUI.auto_connect = true;

        $('input.auto_connect').prop('checked', true);
        $('input.auto_connect, span.auto_connect').prop('title', i18n.getMessage('autoConnectEnabled'));

        $('select#baud').val(115200).prop('disabled', true);
    } else {
        // disabled by user
        GUI.auto_connect = false;

        $('input.auto_connect').prop('checked', false);
        $('input.auto_connect, span.auto_connect').prop('title', i18n.getMessage('autoConnectDisabled'));
    }

    // bind UI hook to auto-connect checkbos
    $('input.auto_connect').change(function () {
        GUI.auto_connect = $(this).is(':checked');

        // update title/tooltip
        if (GUI.auto_connect) {
            $('input.auto_connect, span.auto_connect').prop('title', i18n.getMessage('autoConnectEnabled'));

            $('select#baud').val(115200).prop('disabled', true);
        } else {
            $('input.auto_connect, span.auto_connect').prop('title', i18n.getMessage('autoConnectDisabled'));

            if (!GUI.connected_to && !GUI.connecting_to) $('select#baud').prop('disabled', false);
        }

        setConfig({'auto_connect': GUI.auto_connect});
    });

    PortHandler.initialize();
    PortUsage.initialize();
}

function finishClose(finishedCallback) {
    if (GUI.isCordova()) {
        UI_PHONES.reset();
    }

    const wasConnected = CONFIGURATOR.connectionValid;
    tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'Disconnected', { time: connectionTimestamp ? Date.now() - connectionTimestamp : undefined});

    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
        // close reset to custom defaults dialog
        $('#dialogResetToCustomDefaults')[0].close();
    }

    serial.disconnect(onClosed);

    MSP.disconnect_cleanup();
    PortUsage.reset();
    // To trigger the UI updates by Vue reset the state.
    FC.resetState();

    GUI.connected_to = false;
    GUI.allowedTabs = GUI.defaultAllowedTabsWhenDisconnected.slice();

    // close problems dialog
    $('#dialogReportProblems-closebtn').click();

    // unlock port select & baud
    $('div#port-picker #port').prop('disabled', false);
    if (!GUI.auto_connect) $('div#port-picker #baud').prop('disabled', false);

    // reset connect / disconnect button
    $('div.connect_controls a.connect').removeClass('active');
    $('div.connect_controls div.connect_state').text(i18n.getMessage('connect'));

    // reset active sensor indicators
    sensor_status();

    if (wasConnected) {
        // detach listeners and remove element data
        $('#content').empty();
    }

    $('#tabs .tab_landing a').click();

    finishedCallback();
}

function setConnectionTimeout() {
    // disconnect after 10 seconds with error if we don't get IDENT data
    GUI.timeout_add('connecting', function () {
        if (!CONFIGURATOR.connectionValid) {
            gui_log(i18n.getMessage('noConfigurationReceived'));

            $('div.connect_controls a.connect').click(); // disconnect
        }
    }, 10000);
}

function abortConnection() {
    GUI.timeout_remove('connecting'); // kill connecting timer

    GUI.connected_to = false;
    GUI.connecting_to = false;

    tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'SerialPortFailed');

    gui_log(i18n.getMessage('serialPortOpenFail'));

    $('div#connectbutton div.connect_state').text(i18n.getMessage('connect'));
    $('div#connectbutton a.connect').removeClass('active');

    // unlock port select & baud
    $('div#port-picker #port, div#port-picker #baud, div#port-picker #delay').prop('disabled', false);

    // reset data
    isConnected = false;
}

/**
 * purpose of this is to bridge the old and new api
 * when serial events are handled.
 */
function read_serial_adapter(event) {
    read_serial(event.detail.buffer);
}

function onOpen(openInfo) {
    if (openInfo) {
        CONFIGURATOR.virtualMode = false;

        // update connected_to
        GUI.connected_to = GUI.connecting_to;

        // reset connecting_to
        GUI.connecting_to = false;
        gui_log(i18n.getMessage('serialPortOpened', serial.connectionType === 'serial' ? [serial.connectionId] : [openInfo.socketId]));

        // save selected port with chrome.storage if the port differs
        let result = getConfig('last_used_port');
        if (result.last_used_port) {
            if (result.last_used_port !== GUI.connected_to) {
                // last used port doesn't match the one found in local db, we will store the new one
                setConfig({'last_used_port': GUI.connected_to});
            }
        } else {
            // variable isn't stored yet, saving
            setConfig({'last_used_port': GUI.connected_to});
        }

        // reset expert mode
        result = getConfig('expertMode')?.expertMode ?? false;
        $('input[name="expertModeCheckbox"]').prop('checked', result).trigger('change');

        if(isWeb()) {
            serial.removeEventListener('receive', read_serial_adapter);
            serial.addEventListener('receive', read_serial_adapter);
        } else {
            serial.onReceive.addListener(read_serial);
        }
        setConnectionTimeout();
        FC.resetState();
        mspHelper = new MspHelper();
        MSP.listen(mspHelper.process_data.bind(mspHelper));
        MSP.timeout = 250;
        console.log(`Requesting configuration data`);

        MSP.send_message(MSPCodes.MSP_API_VERSION, false, false, function () {
            gui_log(i18n.getMessage('apiVersionReceived', FC.CONFIG.apiVersion));

            if (FC.CONFIG.apiVersion.includes('null')) {
                abortConnection();
                return;
            }

            if (semver.gte(FC.CONFIG.apiVersion, CONFIGURATOR.API_VERSION_ACCEPTED)) {
                MSP.send_message(MSPCodes.MSP_FC_VARIANT, false, false, function () {
                    if (FC.CONFIG.flightControllerIdentifier === 'BTFL') {
                        MSP.send_message(MSPCodes.MSP_FC_VERSION, false, false, function () {
                            gui_log(i18n.getMessage('fcInfoReceived', [FC.CONFIG.flightControllerIdentifier, FC.CONFIG.flightControllerVersion]));

                            MSP.send_message(MSPCodes.MSP_BUILD_INFO, false, false, function () {

                                gui_log(i18n.getMessage('buildInfoReceived', [FC.CONFIG.buildInfo]));

                                // retrieve build options from the flight controller
                                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                                    FC.processBuildOptions();
                                }

                                MSP.send_message(MSPCodes.MSP_BOARD_INFO, false, false, processBoardInfo);
                            });
                        });
                    } else {
                        tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'ConnectionRefusedFirmwareType', { identifier: FC.CONFIG.flightControllerIdentifier });

                        const dialog = $('.dialogConnectWarning')[0];

                        $('.dialogConnectWarning-content').html(i18n.getMessage('firmwareTypeNotSupported'));

                        $('.dialogConnectWarning-closebtn').click(function() {
                            dialog.close();
                        });

                        dialog.showModal();

                        connectCli();
                    }
                });
            } else {
                tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'ConnectionRefusedFirmwareVersion', { apiVersion: FC.CONFIG.apiVersion });

                const dialog = $('.dialogConnectWarning')[0];

                $('.dialogConnectWarning-content').html(i18n.getMessage('firmwareVersionNotSupported', [CONFIGURATOR.API_VERSION_ACCEPTED]));

                $('.dialogConnectWarning-closebtn').click(function() {
                    dialog.close();
                });

                dialog.showModal();

                connectCli();
            }
        });
    } else {
        abortConnection();
    }
}

function onOpenVirtual() {
    GUI.connected_to = GUI.connecting_to;
    GUI.connecting_to = false;

    CONFIGURATOR.connectionValid = true;
    isConnected = true;

    mspHelper = new MspHelper();

    VirtualFC.setVirtualConfig();

    processBoardInfo();

    update_dataflash_global();
    sensor_status(FC.CONFIG.activeSensors);
    updateTabList(FC.FEATURE_CONFIG.features);
}

function processCustomDefaults() {
    if (bit_check(FC.CONFIG.targetCapabilities, FC.TARGET_CAPABILITIES_FLAGS.SUPPORTS_CUSTOM_DEFAULTS) && bit_check(FC.CONFIG.targetCapabilities, FC.TARGET_CAPABILITIES_FLAGS.HAS_CUSTOM_DEFAULTS) && FC.CONFIG.configurationState === FC.CONFIGURATION_STATES.DEFAULTS_BARE) {
        const dialog = $('#dialogResetToCustomDefaults')[0];

        $('#dialogResetToCustomDefaults-acceptbtn').click(function() {
            tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'AcceptResetToCustomDefaults');

            const buffer = [];
            buffer.push(mspHelper.RESET_TYPES.CUSTOM_DEFAULTS);
            MSP.send_message(MSPCodes.MSP_RESET_CONF, buffer, false);

            dialog.close();

            GUI.timeout_add('disconnect', function () {
                $('div.connect_controls a.connect').click(); // disconnect
            }, 0);
        });

        $('#dialogResetToCustomDefaults-cancelbtn').click(function() {
            tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'CancelResetToCustomDefaults');

            dialog.close();

            setConnectionTimeout();

            checkReportProblems();
        });

        dialog.showModal();

        GUI.timeout_remove('connecting'); // kill connecting timer
    } else {
        checkReportProblems();
    }
}

function processBoardInfo() {

    gui_log(i18n.getMessage('boardInfoReceived', [FC.getHardwareName(), FC.CONFIG.boardVersion]));

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
        checkReportProblems();
    } else {
        processCustomDefaults();
    }
    tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'Loaded', {
        boardIdentifier: FC.CONFIG.boardIdentifier,
        targetName: FC.CONFIG.targetName,
        boardName: FC.CONFIG.boardName,
        hardware: FC.getHardwareName(),
        manufacturerId: FC.CONFIG.manufacturerId,
        apiVersion: FC.CONFIG.apiVersion,
        flightControllerVersion: FC.CONFIG.flightControllerVersion,
        flightControllerIdentifier: FC.CONFIG.flightControllerIdentifier,
        mcu: FC.getMcuType(),
    });
}

function checkReportProblems() {
    const PROBLEM_ANALYTICS_EVENT = 'ProblemFound';
    const problemItemTemplate = $('#dialogReportProblems-listItemTemplate');

    function checkReportProblem(problemName, problems) {
        if (bit_check(FC.CONFIG.configurationProblems, FC.CONFIGURATION_PROBLEM_FLAGS[problemName])) {
            problems.push({name: problemName, description: i18n.getMessage(`reportProblemsDialog${problemName}`)});
            return true;
        }

        return false;
    }

    MSP.send_message(MSPCodes.MSP_STATUS, false, false, function () {
        let needsProblemReportingDialog = false;
        const problemDialogList = $('#dialogReportProblems-list');
        problemDialogList.empty();

        let problems = [];
        let abort = false;

        if (semver.gt(FC.CONFIG.apiVersion, CONFIGURATOR.API_VERSION_MAX_SUPPORTED)) {
            const problemName = 'API_VERSION_MAX_SUPPORTED';
            problems.push({ name: problemName, description: i18n.getMessage(`reportProblemsDialog${problemName}`,
                [CONFIGURATOR.latestVersion, CONFIGURATOR.latestVersionReleaseUrl, CONFIGURATOR.getDisplayVersion(), FC.CONFIG.flightControllerVersion])});
            needsProblemReportingDialog = true;

            abort = true;
            GUI.timeout_remove('connecting'); // kill connecting timer
            $('div.connect_controls a.connect').click(); // disconnect
        }

        if (!abort) {
            // only check for problems if we are not already aborting
            needsProblemReportingDialog = checkReportProblem('MOTOR_PROTOCOL_DISABLED', problems) || needsProblemReportingDialog;

            if (have_sensor(FC.CONFIG.activeSensors, 'acc')) {
                needsProblemReportingDialog = checkReportProblem('ACC_NEEDS_CALIBRATION', problems) || needsProblemReportingDialog;
            }
        }

        if (needsProblemReportingDialog) {

            problems.map((problem) => {
                problemItemTemplate.clone().html(problem.description).appendTo(problemDialogList);
            });

            tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, PROBLEM_ANALYTICS_EVENT, { problems: problems.map((problem) => problem.name) });

            const problemDialog = $('#dialogReportProblems')[0];
            $('#dialogReportProblems-closebtn').click(function() {
                problemDialog.close();
            });

            problemDialog.showModal();
            $('#dialogReportProblems').scrollTop(0);
            $('#dialogReportProblems-closebtn').focus();
        }

        if (!abort) {
            // if we are not aborting, we can continue
            processUid();
        }
    });
}

async function processBuildOptions() {
    const supported = semver.satisfies(FC.CONFIG.apiVersion, `${API_VERSION_1_45} - ${API_VERSION_1_46}`);

    // firmware 1_45 or higher is required to support cloud build options
    // firmware 1_46 or higher retrieves build options from the flight controller
    if (supported && FC.CONFIG.buildKey.length === 32 && navigator.onLine) {
        const buildApi = new BuildApi();

        function onLoadCloudBuild(options) {
            FC.CONFIG.buildOptions = options.Request.Options;
            processCraftName();
        }

        buildApi.requestBuildOptions(FC.CONFIG.buildKey, onLoadCloudBuild, processCraftName);
    } else {
        processCraftName();
    }
}

async function processBuildConfiguration() {
    const supported = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45);

    if (supported) {
        // get build key from firmware
        await MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.BUILD_KEY));
        gui_log(i18n.getMessage('buildKey', FC.CONFIG.buildKey));
    }

    processBuildOptions();
}

async function processUid() {
    await MSP.promise(MSPCodes.MSP_UID);

    connectionTimestamp = Date.now();

    gui_log(i18n.getMessage('uniqueDeviceIdReceived', FC.CONFIG.deviceIdentifier));

    processBuildConfiguration();

    tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'Connected', {
        deviceIdentifier: CryptoES.SHA1(FC.CONFIG.deviceIdentifier),
    });
}

async function processCraftName() {
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
        await MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.CRAFT_NAME));
    } else {
        await MSP.promise(MSPCodes.MSP_NAME);
    }

    gui_log(i18n.getMessage('craftNameReceived', semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) ? [FC.CONFIG.craftName] : [FC.CONFIG.name]));

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
        await MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.PILOT_NAME));
    }

    FC.CONFIG.armingDisabled = false;
    mspHelper.setArmingEnabled(false, false, setRtc);
}

function setRtc() {
    MSP.send_message(MSPCodes.MSP_SET_RTC, mspHelper.crunch(MSPCodes.MSP_SET_RTC), false, finishOpen);
}

function finishOpen() {
    CONFIGURATOR.connectionValid = true;

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) && FC.CONFIG.buildOptions.length) {

        GUI.allowedTabs = Array.from(GUI.defaultAllowedTabs);

        for (const tab of GUI.defaultCloudBuildTabOptions) {
            if (FC.CONFIG.buildOptions.some(opt => opt.toLowerCase().includes(tab))) {
                GUI.allowedTabs.push(tab);
            }
        }

    } else {
        GUI.allowedTabs = Array.from(GUI.defaultAllowedFCTabsWhenConnected);
    }

    if (GUI.isCordova()) {
        UI_PHONES.reset();
    }

    onConnect();

    GUI.selectDefaultTabWhenConnected();
}

function connectCli() {
    CONFIGURATOR.connectionValid = true; // making it possible to open the CLI tab
    GUI.allowedTabs = ['cli'];
    onConnect();
    $('#tabs .tab_cli a').click();
}

function onConnect() {
    if ($('div#flashbutton a.flash_state').hasClass('active') || $('div#flashbutton a.flash').hasClass('active')) {
        $('div#flashbutton a.flash_state').removeClass('active');
        $('div#flashbutton a.flash').removeClass('active');
    }

    GUI.timeout_remove('connecting'); // kill connecting timer

    $('div#connectbutton div.connect_state').text(i18n.getMessage('disconnect')).addClass('active');
    $('div#connectbutton a.connect').addClass('active');

    $('#tabs ul.mode-disconnected').hide();
    $('#tabs ul.mode-connected-cli').show();

    // show only appropriate tabs
    $('#tabs ul.mode-connected li').hide();
    $('#tabs ul.mode-connected li').filter(function (index) {
        const classes = $(this).attr("class").split(/\s+/);
        let found = false;

        $.each(GUI.allowedTabs, (_index, value) => {
            const tabName = `tab_${value}`;
            if ($.inArray(tabName, classes) >= 0) {
                found = true;
            }
        });

        if (FC.CONFIG.boardType == 0) {
            if (classes.indexOf("osd-required") >= 0) {
                found = false;
            }
        }

        return found;
    }).show();

    if (FC.CONFIG.flightControllerVersion !== '') {
        FC.FEATURE_CONFIG.features = new Features(FC.CONFIG);
        FC.BEEPER_CONFIG.beepers = new Beepers(FC.CONFIG);
        FC.BEEPER_CONFIG.dshotBeaconConditions = new Beepers(FC.CONFIG, [ "RX_LOST", "RX_SET" ]);

        $('#tabs ul.mode-connected').show();

        MSP.send_message(MSPCodes.MSP_FEATURE_CONFIG, false, false);
        MSP.send_message(MSPCodes.MSP_BATTERY_CONFIG, false, false);
        MSP.send_message(MSPCodes.MSP_DATAFLASH_SUMMARY, false, false);

        if (FC.CONFIG.boardType === 0 || FC.CONFIG.boardType === 2) {
            startLiveDataRefreshTimer();
        }
    }

    const sensorState = $('#sensor-status');
    sensorState.show();

    const portPicker = $('#portsinput');
    portPicker.hide();

    const dataflash = $('#dataflash_wrapper_global');
    dataflash.show();
}

function onClosed(result) {
    if (result) { // All went as expected
        gui_log(i18n.getMessage('serialPortClosedOk'));
    } else { // Something went wrong
        gui_log(i18n.getMessage('serialPortClosedFail'));
    }

    $('#tabs ul.mode-connected').hide();
    $('#tabs ul.mode-connected-cli').hide();
    $('#tabs ul.mode-disconnected').show();

    const sensorState = $('#sensor-status');
    sensorState.hide();

    const portPicker = $('#portsinput');
    portPicker.show();

    const dataflash = $('#dataflash_wrapper_global');
    dataflash.hide();

    const battery = $('#quad-status_wrapper');
    battery.hide();

    clearLiveDataRefreshTimer();

    MSP.clearListeners();

    CONFIGURATOR.connectionValid = false;
    CONFIGURATOR.cliValid = false;
    CONFIGURATOR.cliActive = false;
    CONFIGURATOR.cliEngineValid = false;
    CONFIGURATOR.cliEngineActive = false;
}

export function read_serial(info) {
    if (CONFIGURATOR.cliActive) {
        MSP.clearListeners();
        MSP.disconnect_cleanup();
        TABS.cli.read(info);
    } else if (CONFIGURATOR.cliEngineActive) {
        TABS.presets.read(info);
    } else {
        MSP.read(info);
    }
}

async function update_live_status() {
    const statuswrapper = $('#quad-status_wrapper');

    if (GUI.active_tab !== 'cli' && GUI.active_tab !== 'presets') {
        await MSP.promise(MSPCodes.MSP_ANALOG);

        const nbCells = FC.ANALOG.voltage === 0 ? 1 : Math.floor(FC.ANALOG.voltage / FC.BATTERY_CONFIG.vbatmaxcellvoltage) + 1;
        const min = FC.BATTERY_CONFIG.vbatmincellvoltage * nbCells;
        const max = FC.BATTERY_CONFIG.vbatmaxcellvoltage * nbCells;
        const warn = FC.BATTERY_CONFIG.vbatwarningcellvoltage * nbCells;
        const NO_BATTERY_VOLTAGE_MAXIMUM = 1.8; // Maybe is better to add a call to MSP_BATTERY_STATE but is not available for all versions

        if (FC.ANALOG.voltage < min && FC.ANALOG.voltage > NO_BATTERY_VOLTAGE_MAXIMUM) {
            $(".battery-status").addClass('state-empty').removeClass('state-ok').removeClass('state-warning');
            $(".battery-status").css({ width: "100%" });
        } else {
            $(".battery-status").css({ width: `${((FC.ANALOG.voltage - min) / (max - min) * 100)}%` });

            if (FC.ANALOG.voltage < warn) {
                $(".battery-status").addClass('state-warning').removeClass('state-empty').removeClass('state-ok');
            } else  {
                $(".battery-status").addClass('state-ok').removeClass('state-warning').removeClass('state-empty');
            }
        }

        await MSP.promise(MSPCodes.MSP_BOXNAMES);
        await MSP.promise(MSPCodes.MSP_STATUS_EX);

        const active = (performance.now() - FC.ANALOG.last_received_timestamp) < 300;
        $(".linkicon").toggleClass('active', active);

        for (let i = 0; i < FC.AUX_CONFIG.length; i++) {
            if (FC.AUX_CONFIG[i] === 'ARM') {
                $(".armedicon").toggleClass('active', bit_check(FC.CONFIG.mode, i));
            }
            if (FC.AUX_CONFIG[i] === 'FAILSAFE') {
                $(".failsafeicon").toggleClass('active', bit_check(FC.CONFIG.mode, i));
            }
        }

        if (have_sensor(FC.CONFIG.activeSensors, 'gps')) {
            await MSP.promise(MSPCodes.MSP_RAW_GPS);
        }

        sensor_status(FC.CONFIG.activeSensors, FC.GPS_DATA.fix);

        statuswrapper.show();
    }
}

function clearLiveDataRefreshTimer() {
    if (liveDataRefreshTimerId) {
        clearInterval(liveDataRefreshTimerId);
        liveDataRefreshTimerId = false;
    }
}

function startLiveDataRefreshTimer() {
    // live data refresh
    clearLiveDataRefreshTimer();
    liveDataRefreshTimerId = setInterval(update_live_status, 250);
}

export function reinitializeConnection(callback) {

    // Close connection gracefully if it still exists.
    const previousTimeStamp = connectionTimestamp;

    if (serial.connectionId) {
        if (GUI.connected_to || GUI.connecting_to) {
            $('a.connect').trigger('click');
        } else {
            serial.disconnect();
        }
    }

    gui_log(i18n.getMessage('deviceRebooting'));

    let attempts = 0;
    const reconnect = setInterval(waitforSerial, 100);

    function waitforSerial() {
        if ((connectionTimestamp !== previousTimeStamp && CONFIGURATOR.connectionValid) || GUI.active_tab === 'firmware_flasher') {
            console.log(`Serial connection available after ${attempts / 10} seconds`);
            clearInterval(reconnect);
            gui_log(i18n.getMessage('deviceReady'));

            if (typeof callback === 'function') {
                callback();
            }
        } else {
            attempts++;
            if (attempts > 100) {
                clearInterval(reconnect);
                console.log(`failed to get serial connection, gave up after 10 seconds`);
                gui_log(i18n.getMessage('serialPortOpenFail'));
            }
        }
    }
}
