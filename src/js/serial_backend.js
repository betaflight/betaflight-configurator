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
import CONFIGURATOR, { API_VERSION_1_45 } from "./data_storage";
import serial from "./serial";
import MdnsDiscovery from "./mdns_discovery";
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

let mspHelper;
let connectionTimestamp;
let clicks = false;

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

    $('div.connect_controls a.connect').click(function () {
        if (!GUI.connect_lock) { // GUI control overrides the user control

            const toggleStatus = function() {
                clicks = !clicks;
            };

            GUI.configuration_loaded = false;

            const selected_baud = parseInt($('div#port-picker #baud').val());
            const selectedPort = $('div#port-picker #port option:selected');

            let portName;
            if (selectedPort.data().isManual) {
                portName = $('#port-override').val();
            } else {
                portName = String($('div#port-picker #port').val());
            }

            if (selectedPort.data().isDFU) {
                $('select#baud').hide();
            } else if (portName !== '0') {
                if (!clicks) {
                    console.log(`Connecting to: ${portName}`);
                    GUI.connecting_to = portName;

                    // lock port select & baud while we are connecting / connected
                    $('div#port-picker #port, div#port-picker #baud, div#port-picker #delay').prop('disabled', true);
                    $('div.connect_controls div.connect_state').text(i18n.getMessage('connecting'));

                    if (selectedPort.data().isVirtual) {
                        CONFIGURATOR.virtualMode = true;
                        CONFIGURATOR.virtualApiVersion = $('#firmware-version-dropdown :selected').val();

                        serial.connect('virtual', {}, onOpenVirtual);
                    } else {
                        serial.connect(portName, {bitrate: selected_baud}, onOpen);
                    }

                    toggleStatus();
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

                    mspHelper.setArmingEnabled(true, false, onFinishCallback);
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

    MdnsDiscovery.initialize();
    PortHandler.initialize();
    PortUsage.initialize();
}

function finishClose(finishedCallback) {
    if (GUI.isCordova()) {
        UI_PHONES.reset();
    }

    const wasConnected = CONFIGURATOR.connectionValid;

    tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'Disconnected');
    if (connectionTimestamp) {
        const connectedTime = Date.now() - connectionTimestamp;
        tracking.sendTiming(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'Connected', connectedTime);
    }
    // close reset to custom defaults dialog
    $('#dialogResetToCustomDefaults')[0].close();

    tracking.resetFlightControllerData();

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
    sensor_status(0);

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

        serial.onReceive.addListener(read_serial);
        setConnectionTimeout();
        FC.resetState();
        mspHelper = new MspHelper();
        MSP.listen(mspHelper.process_data.bind(mspHelper));
        MSP.timeout = 250;
        console.log(`Requesting configuration data`);

        MSP.send_message(MSPCodes.MSP_API_VERSION, false, false, function () {
            tracking.setFlightControllerData(tracking.DATA.API_VERSION, FC.CONFIG.apiVersion);

            gui_log(i18n.getMessage('apiVersionReceived', [FC.CONFIG.apiVersion]));

            if (semver.gte(FC.CONFIG.apiVersion, CONFIGURATOR.API_VERSION_ACCEPTED)) {

                MSP.send_message(MSPCodes.MSP_FC_VARIANT, false, false, function () {
                    tracking.setFlightControllerData(tracking.DATA.FIRMWARE_TYPE, FC.CONFIG.flightControllerIdentifier);
                    if (FC.CONFIG.flightControllerIdentifier === 'BTFL') {
                        MSP.send_message(MSPCodes.MSP_FC_VERSION, false, false, function () {
                            tracking.setFlightControllerData(tracking.DATA.FIRMWARE_VERSION, FC.CONFIG.flightControllerVersion);

                            gui_log(i18n.getMessage('fcInfoReceived', [FC.CONFIG.flightControllerIdentifier, FC.CONFIG.flightControllerVersion]));

                            MSP.send_message(MSPCodes.MSP_BUILD_INFO, false, false, function () {

                                gui_log(i18n.getMessage('buildInfoReceived', [FC.CONFIG.buildInfo]));

                                MSP.send_message(MSPCodes.MSP_BOARD_INFO, false, false, processBoardInfo);
                            });
                        });
                    } else {
                        tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'ConnectionRefusedFirmwareType', FC.CONFIG.flightControllerIdentifier);

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
                tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'ConnectionRefusedFirmwareVersion', FC.CONFIG.apiVersion);

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
        tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'SerialPortFailed');

        console.log('Failed to open serial port');
        gui_log(i18n.getMessage('serialPortOpenFail'));

        abortConnect();
    }
}

function onOpenVirtual() {
    GUI.connected_to = GUI.connecting_to;
    GUI.connecting_to = false;

    CONFIGURATOR.connectionValid = true;

    mspHelper = new MspHelper();

    VirtualFC.setVirtualConfig();

    processBoardInfo();

    update_dataflash_global();
    sensor_status(FC.CONFIG.activeSensors);
    updateTabList(FC.FEATURE_CONFIG.features);
}

function abortConnect() {
    $('div#connectbutton div.connect_state').text(i18n.getMessage('connect'));
    $('div#connectbutton a.connect').removeClass('active');

    // unlock port select & baud
    $('div#port-picker #port, div#port-picker #baud, div#port-picker #delay').prop('disabled', false);

    // reset data
    clicks = false;
}

function processBoardInfo() {
    tracking.setFlightControllerData(tracking.DATA.BOARD_TYPE, FC.CONFIG.boardIdentifier);
    tracking.setFlightControllerData(tracking.DATA.TARGET_NAME, FC.CONFIG.targetName);
    tracking.setFlightControllerData(tracking.DATA.BOARD_NAME, FC.CONFIG.boardName);
    tracking.setFlightControllerData(tracking.DATA.MANUFACTURER_ID, FC.CONFIG.manufacturerId);
    tracking.setFlightControllerData(tracking.DATA.MCU_TYPE, FC.getMcuType());

    gui_log(i18n.getMessage('boardInfoReceived', [FC.getHardwareName(), FC.CONFIG.boardVersion]));

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

function checkReportProblems() {
    const PROBLEM_ANALYTICS_EVENT = 'ProblemFound';
    const problemItemTemplate = $('#dialogReportProblems-listItemTemplate');

    function checkReportProblem(problemName, problemDialogList) {
        if (bit_check(FC.CONFIG.configurationProblems, FC.CONFIGURATION_PROBLEM_FLAGS[problemName])) {
            problemItemTemplate.clone().html(i18n.getMessage(`reportProblemsDialog${problemName}`)).appendTo(problemDialogList);

            tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, PROBLEM_ANALYTICS_EVENT, problemName);

            return true;
        }

        return false;
    }

    MSP.send_message(MSPCodes.MSP_STATUS, false, false, function () {
        let needsProblemReportingDialog = false;
        const problemDialogList = $('#dialogReportProblems-list');
        problemDialogList.empty();

        if (semver.gt(FC.CONFIG.apiVersion, CONFIGURATOR.API_VERSION_MAX_SUPPORTED)) {
            const problemName = 'API_VERSION_MAX_SUPPORTED';
            problemItemTemplate.clone().html(i18n.getMessage(`reportProblemsDialog${problemName}`,
                [CONFIGURATOR.latestVersion, CONFIGURATOR.latestVersionReleaseUrl, CONFIGURATOR.getDisplayVersion(), FC.CONFIG.flightControllerVersion])).appendTo(problemDialogList);
            needsProblemReportingDialog = true;

            tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, PROBLEM_ANALYTICS_EVENT,
                `${problemName};${CONFIGURATOR.API_VERSION_MAX_SUPPORTED};${FC.CONFIG.apiVersion}`);
        }

        needsProblemReportingDialog = checkReportProblem('MOTOR_PROTOCOL_DISABLED', problemDialogList) || needsProblemReportingDialog;

        if (have_sensor(FC.CONFIG.activeSensors, 'acc')) {
            needsProblemReportingDialog = checkReportProblem('ACC_NEEDS_CALIBRATION', problemDialogList) || needsProblemReportingDialog;
        }

        if (needsProblemReportingDialog) {
            const problemDialog = $('#dialogReportProblems')[0];
            $('#dialogReportProblems-closebtn').click(function() {
                problemDialog.close();
            });

            problemDialog.showModal();
            $('#dialogReportProblems').scrollTop(0);
            $('#dialogReportProblems-closebtn').focus();
        }

        processUid();
    });
}

function processUid() {
    MSP.send_message(MSPCodes.MSP_UID, false, false, function () {
        const deviceIdentifier = FC.CONFIG.deviceIdentifier;

        tracking.setFlightControllerData(tracking.DATA.MCU_ID, CryptoES.SHA1(deviceIdentifier));
        tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'Connected');
        connectionTimestamp = Date.now();
        gui_log(i18n.getMessage('uniqueDeviceIdReceived', [deviceIdentifier]));

        processCraftName();
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
    GUI.allowedTabs = GUI.defaultAllowedFCTabsWhenConnected.slice();

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
    if ($('div#flashbutton a.flash_state').hasClass('active') && $('div#flashbutton a.flash').hasClass('active')) {
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

        getStatus();

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

function startLiveDataRefreshTimer() {
    // live data refresh
    GUI.timeout_add('data_refresh', update_live_status, 100);
}

async function getStatus() {
    return MSP.promise(MSPCodes.MSP_STATUS_EX);
}

async function update_live_status() {
    const statuswrapper = $('#quad-status_wrapper');

    if (GUI.active_tab !== 'cli' && GUI.active_tab !== 'presets') {
        await MSP.promise(MSPCodes.MSP_BOXNAMES);
        await getStatus();
        await MSP.promise(MSPCodes.MSP_ANALOG);

        const active = ((Date.now() - FC.ANALOG.last_received_timestamp) < 300);

        for (let i = 0; i < FC.AUX_CONFIG.length; i++) {
            if (FC.AUX_CONFIG[i] === 'ARM') {
                $(".armedicon").toggleClass('active', bit_check(FC.CONFIG.mode, i));
            }
            if (FC.AUX_CONFIG[i] === 'FAILSAFE') {
                $(".failsafeicon").toggleClass('active', bit_check(FC.CONFIG.mode, i));
            }
        }

        if (FC.ANALOG != undefined) {
            let nbCells = Math.floor(FC.ANALOG.voltage / FC.BATTERY_CONFIG.vbatmaxcellvoltage) + 1;

            if (FC.ANALOG.voltage == 0) {
                    nbCells = 1;
            }

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
        }

        $(".linkicon").toggleClass('active', active);

        statuswrapper.show();
        GUI.timeout_remove('data_refresh');
        startLiveDataRefreshTimer();
    }
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
        if (connectionTimestamp !== previousTimeStamp && CONFIGURATOR.connectionValid) {
            console.log(`Serial connection available after ${attempts / 10} seconds`);
            clearInterval(reconnect);
            getStatus();
            gui_log(i18n.getMessage('deviceReady'));
            if (callback === typeof('function')) {
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
