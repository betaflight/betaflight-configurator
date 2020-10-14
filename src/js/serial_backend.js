'use strict';
var mspHelper;

var connectionTimestamp;

function initializeSerialBackend() {
    mspHelper = new MspHelper();
    mspHelper.process_data.bind(mspHelper);

    GUI.updateManualPortVisibility = function(){
        var selected_port = $('div#port-picker #port option:selected');
        if (selected_port.data().isManual) {
            $('#port-override-option').show();
        }
        else {
            $('#port-override-option').hide();
        }
        if (selected_port.data().isDFU) {
            $('select#baud').hide();
        }
        else {
            $('select#baud').show();
        }
    };

    GUI.updateManualPortVisibility();

    $('#port-override').change(function () {
        ConfigStorage.set({'portOverride': $('#port-override').val()});
    });

    ConfigStorage.get('portOverride', function (data) {
        $('#port-override').val(data.portOverride);
    });

    $('div#port-picker #port').change(function (target) {
        GUI.updateManualPortVisibility();
    });

    $('div.connect_controls a.connect').click(function () {
        if (GUI.connect_lock != true) { // GUI control overrides the user control

            var thisElement = $(this);
            var clicks = thisElement.data('clicks');

            var toggleStatus = function() {
                thisElement.data("clicks", !clicks);
            };

            GUI.configuration_loaded = false;

            var selected_baud = parseInt($('div#port-picker #baud').val());
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

                    serial.connect(portName, {bitrate: selected_baud}, onOpen);

                    toggleStatus();
                } else {
                    if ($('div#flashbutton a.flash_state').hasClass('active') && $('div#flashbutton a.flash').hasClass('active')) {
                        $('div#flashbutton a.flash_state').removeClass('active');
                        $('div#flashbutton a.flash').removeClass('active');
                    }
                    GUI.timeout_kill_all();
                    GUI.interval_kill_all();
                    GUI.tab_switch_cleanup();
                    GUI.tab_switch_in_progress = false;

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
    ConfigStorage.get('auto_connect', function (result) {
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

            ConfigStorage.set({'auto_connect': GUI.auto_connect});
        });
    });

    PortHandler.initialize();
    PortUsage.initialize();
}

function finishClose(finishedCallback) {
    if (GUI.isCordova()) {
        UI_PHONES.reset();
    }

    var wasConnected = CONFIGURATOR.connectionValid;

    analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'Disconnected');
    if (connectionTimestamp) {
        var connectedTime = Date.now() - connectionTimestamp;
        analytics.sendTiming(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'Connected', connectedTime);

        connectedTime = undefined;
    }
    // close reset to custom defaults dialog
    $('#dialogResetToCustomDefaults')[0].close();

    analytics.resetFlightControllerData();

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
            GUI.log(i18n.getMessage('noConfigurationReceived'));

            $('div.connect_controls a.connect').click(); // disconnect
        }
    }, 10000);
}

function onOpen(openInfo) {
    if (openInfo) {
        // update connected_to
        GUI.connected_to = GUI.connecting_to;

        // reset connecting_to
        GUI.connecting_to = false;

        GUI.log(i18n.getMessage('serialPortOpened', [openInfo.connectionId]));

        serial.onReceive.addListener(read_serial);

        setConnectionTimeout();

        FC.resetState();
        mspHelper = new MspHelper();
        MSP.listen(mspHelper.process_data.bind(mspHelper));

        // request configuration data
        MSP.send_message(MSPCodes.MSP_API_VERSION, false, false, function () {
            analytics.setFlightControllerData(analytics.DATA.API_VERSION, FC.CONFIG.apiVersion);

            GUI.log(i18n.getMessage('apiVersionReceived', [FC.CONFIG.apiVersion]));

            if (semver.gte(FC.CONFIG.apiVersion, CONFIGURATOR.API_VERSION_ACCEPTED)) {

                MSP.send_message(MSPCodes.MSP_FC_VARIANT, false, false, function () {
                    analytics.setFlightControllerData(analytics.DATA.FIRMWARE_TYPE, FC.CONFIG.flightControllerIdentifier);
                    if (FC.CONFIG.flightControllerIdentifier === 'BTFL') {
                        MSP.send_message(MSPCodes.MSP_FC_VERSION, false, false, function () {
                            analytics.setFlightControllerData(analytics.DATA.FIRMWARE_VERSION, FC.CONFIG.flightControllerVersion);

                            GUI.log(i18n.getMessage('fcInfoReceived', [FC.CONFIG.flightControllerIdentifier, FC.CONFIG.flightControllerVersion]));

                            MSP.send_message(MSPCodes.MSP_BUILD_INFO, false, false, function () {

                                GUI.log(i18n.getMessage('buildInfoReceived', [FC.CONFIG.buildInfo]));

                                MSP.send_message(MSPCodes.MSP_BOARD_INFO, false, false, processBoardInfo);
                            });
                        });
                    } else {
                        analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'ConnectionRefusedFirmwareType', FC.CONFIG.flightControllerIdentifier);

                        var dialog = $('.dialogConnectWarning')[0];

                        $('.dialogConnectWarning-content').html(i18n.getMessage('firmwareTypeNotSupported'));

                        $('.dialogConnectWarning-closebtn').click(function() {
                            dialog.close();
                        });

                        dialog.showModal();

                        connectCli();
                    }
                });
            } else {
                analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'ConnectionRefusedFirmwareVersion', FC.CONFIG.apiVersion);

                var dialog = $('.dialogConnectWarning')[0];

                $('.dialogConnectWarning-content').html(i18n.getMessage('firmwareVersionNotSupported', [CONFIGURATOR.API_VERSION_ACCEPTED]));

                $('.dialogConnectWarning-closebtn').click(function() {
                    dialog.close();
                });

                dialog.showModal();

                connectCli();
            }
        });
    } else {
        analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'SerialPortFailed');

        console.log('Failed to open serial port');
        GUI.log(i18n.getMessage('serialPortOpenFail'));

        abortConnect();
    }
}

function abortConnect() {
    $('div#connectbutton div.connect_state').text(i18n.getMessage('connect'));
    $('div#connectbutton a.connect').removeClass('active');

    // unlock port select & baud
    $('div#port-picker #port, div#port-picker #baud, div#port-picker #delay').prop('disabled', false);

    // reset data
    $('div#connectbutton a.connect').data("clicks", false);
}

function processBoardInfo() {
    analytics.setFlightControllerData(analytics.DATA.BOARD_TYPE, FC.CONFIG.boardIdentifier);
    analytics.setFlightControllerData(analytics.DATA.TARGET_NAME, FC.CONFIG.targetName);
    analytics.setFlightControllerData(analytics.DATA.BOARD_NAME, FC.CONFIG.boardName);
    analytics.setFlightControllerData(analytics.DATA.MANUFACTURER_ID, FC.CONFIG.manufacturerId);
    analytics.setFlightControllerData(analytics.DATA.MCU_TYPE, FC.getMcuType());

    GUI.log(i18n.getMessage('boardInfoReceived', [FC.getHardwareName(), FC.CONFIG.boardVersion]));

    if (bit_check(FC.CONFIG.targetCapabilities, FC.TARGET_CAPABILITIES_FLAGS.SUPPORTS_CUSTOM_DEFAULTS) && bit_check(FC.CONFIG.targetCapabilities, FC.TARGET_CAPABILITIES_FLAGS.HAS_CUSTOM_DEFAULTS) && FC.CONFIG.configurationState === FC.CONFIGURATION_STATES.DEFAULTS_BARE) {
        var dialog = $('#dialogResetToCustomDefaults')[0];

        $('#dialogResetToCustomDefaults-acceptbtn').click(function() {
            analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'AcceptResetToCustomDefaults');

            var buffer = [];
            buffer.push(mspHelper.RESET_TYPES.CUSTOM_DEFAULTS);
            MSP.send_message(MSPCodes.MSP_RESET_CONF, buffer, false);

            dialog.close();

            GUI.timeout_add('disconnect', function () {
                $('div.connect_controls a.connect').click(); // disconnect
            }, 0);
        });

        $('#dialogResetToCustomDefaults-cancelbtn').click(function() {
            analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'CancelResetToCustomDefaults');

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

            analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, PROBLEM_ANALYTICS_EVENT, problemName);

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
                [CONFIGURATOR.latestVersion, CONFIGURATOR.latestVersionReleaseUrl, CONFIGURATOR.version, FC.CONFIG.flightControllerVersion])).appendTo(problemDialogList);
            needsProblemReportingDialog = true;

            analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, PROBLEM_ANALYTICS_EVENT,
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
        }

        processUid();
    });
}

function processUid() {
    MSP.send_message(MSPCodes.MSP_UID, false, false, function () {
        var uniqueDeviceIdentifier = FC.CONFIG.uid[0].toString(16) + FC.CONFIG.uid[1].toString(16) + FC.CONFIG.uid[2].toString(16);

        analytics.setFlightControllerData(analytics.DATA.MCU_ID, objectHash.sha1(uniqueDeviceIdentifier));
        analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'Connected');
        connectionTimestamp = Date.now();
        GUI.log(i18n.getMessage('uniqueDeviceIdReceived', [uniqueDeviceIdentifier]));

        if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
            processName();
        } else {
            setRtc();
        }
    });
}

function processName() {
    MSP.send_message(MSPCodes.MSP_NAME, false, false, function () {
        GUI.log(i18n.getMessage('craftNameReceived', [FC.CONFIG.name]));

        FC.CONFIG.armingDisabled = false;
        mspHelper.setArmingEnabled(false, false, setRtc);
    });
}

function setRtc() {
    if (semver.gte(FC.CONFIG.apiVersion, "1.37.0")) {
        MSP.send_message(MSPCodes.MSP_SET_RTC, mspHelper.crunch(MSPCodes.MSP_SET_RTC), false, finishOpen);
    } else {
        finishOpen();
    }
}

function finishOpen() {
    CONFIGURATOR.connectionValid = true;
    GUI.allowedTabs = GUI.defaultAllowedFCTabsWhenConnected.slice();
    if (semver.lt(FC.CONFIG.apiVersion, "1.4.0")) {
        GUI.allowedTabs.splice(GUI.allowedTabs.indexOf('led_strip'), 1);
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
        var classes = $(this).attr("class").split(/\s+/);
        var found = false;
        $.each(GUI.allowedTabs, function (index, value) {
            var tabName = "tab_" + value;
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
        if (semver.gte(FC.CONFIG.apiVersion, "1.33.0")) {
            MSP.send_message(MSPCodes.MSP_BATTERY_CONFIG, false, false);
        }
        MSP.send_message(MSPCodes.MSP_STATUS_EX, false, false);
        MSP.send_message(MSPCodes.MSP_DATAFLASH_SUMMARY, false, false);

        if (FC.CONFIG.boardType == 0 || FC.CONFIG.boardType == 2) {
            startLiveDataRefreshTimer();
        }
    }

    var sensor_state = $('#sensor-status');
    sensor_state.show();

    var port_picker = $('#portsinput');
    port_picker.hide();

    var dataflash = $('#dataflash_wrapper_global');
    dataflash.show();
}

function onClosed(result) {
    if (result) { // All went as expected
        GUI.log(i18n.getMessage('serialPortClosedOk'));
    } else { // Something went wrong
        GUI.log(i18n.getMessage('serialPortClosedFail'));
    }

    $('#tabs ul.mode-connected').hide();
    $('#tabs ul.mode-connected-cli').hide();
    $('#tabs ul.mode-disconnected').show();

    var sensor_state = $('#sensor-status');
    sensor_state.hide();

    var port_picker = $('#portsinput');
    port_picker.show();

    var dataflash = $('#dataflash_wrapper_global');
    dataflash.hide();

    var battery = $('#quad-status_wrapper');
    battery.hide();

    MSP.clearListeners();

    CONFIGURATOR.connectionValid = false;
    CONFIGURATOR.cliValid = false;
    CONFIGURATOR.cliActive = false;
}

function read_serial(info) {
    if (!CONFIGURATOR.cliActive) {
        MSP.read(info);
    } else if (CONFIGURATOR.cliActive) {
        TABS.cli.read(info);
    }
}

function sensor_status(sensors_detected) {
    // initialize variable (if it wasn't)
    if (!sensor_status.previous_sensors_detected) {
        sensor_status.previous_sensors_detected = -1; // Otherwise first iteration will not be run if sensors_detected == 0
    }

    // update UI (if necessary)
    if (sensor_status.previous_sensors_detected == sensors_detected) {
        return;
    }

    // set current value
    sensor_status.previous_sensors_detected = sensors_detected;

    var e_sensor_status = $('div#sensor-status');

    if (have_sensor(sensors_detected, 'acc')) {
        $('.accel', e_sensor_status).addClass('on');
        $('.accicon', e_sensor_status).addClass('active');

    } else {
        $('.accel', e_sensor_status).removeClass('on');
        $('.accicon', e_sensor_status).removeClass('active');
    }

    if ((FC.CONFIG.boardType == 0 || FC.CONFIG.boardType == 2) && have_sensor(sensors_detected, 'gyro')) {
        $('.gyro', e_sensor_status).addClass('on');
        $('.gyroicon', e_sensor_status).addClass('active');
    } else {
        $('.gyro', e_sensor_status).removeClass('on');
        $('.gyroicon', e_sensor_status).removeClass('active');
    }

    if (have_sensor(sensors_detected, 'baro')) {
        $('.baro', e_sensor_status).addClass('on');
        $('.baroicon', e_sensor_status).addClass('active');
    } else {
        $('.baro', e_sensor_status).removeClass('on');
        $('.baroicon', e_sensor_status).removeClass('active');
    }

    if (have_sensor(sensors_detected, 'mag')) {
        $('.mag', e_sensor_status).addClass('on');
        $('.magicon', e_sensor_status).addClass('active');
    } else {
        $('.mag', e_sensor_status).removeClass('on');
        $('.magicon', e_sensor_status).removeClass('active');
    }

    if (have_sensor(sensors_detected, 'gps')) {
        $('.gps', e_sensor_status).addClass('on');
    $('.gpsicon', e_sensor_status).addClass('active');
    } else {
        $('.gps', e_sensor_status).removeClass('on');
        $('.gpsicon', e_sensor_status).removeClass('active');
    }

    if (have_sensor(sensors_detected, 'sonar')) {
        $('.sonar', e_sensor_status).addClass('on');
        $('.sonaricon', e_sensor_status).addClass('active');
    } else {
        $('.sonar', e_sensor_status).removeClass('on');
        $('.sonaricon', e_sensor_status).removeClass('active');
    }
}

function have_sensor(sensors_detected, sensor_code) {
    switch(sensor_code) {
        case 'acc':
            return bit_check(sensors_detected, 0);
        case 'baro':
            return bit_check(sensors_detected, 1);
        case 'mag':
            return bit_check(sensors_detected, 2);
        case 'gps':
            return bit_check(sensors_detected, 3);
        case 'sonar':
            return bit_check(sensors_detected, 4);
        case 'gyro':
            if (semver.gte(FC.CONFIG.apiVersion, "1.36.0")) {
                return bit_check(sensors_detected, 5);
            } else {
                return true;
            }
    }
    return false;
}

function startLiveDataRefreshTimer() {
    // live data refresh
    GUI.timeout_add('data_refresh', function () { update_live_status(); }, 100);
}

function update_live_status() {

    var statuswrapper = $('#quad-status_wrapper');

    $(".quad-status-contents").css({
       display: 'inline-block'
    });

    if (GUI.active_tab != 'cli') {
        MSP.send_message(MSPCodes.MSP_BOXNAMES, false, false);
        if (semver.gte(FC.CONFIG.apiVersion, "1.32.0")) {
            MSP.send_message(MSPCodes.MSP_STATUS_EX, false, false);
        } else {
            MSP.send_message(MSPCodes.MSP_STATUS, false, false);
        }
        MSP.send_message(MSPCodes.MSP_ANALOG, false, false);
    }

    var active = ((Date.now() - FC.ANALOG.last_received_timestamp) < 300);

    for (var i = 0; i < FC.AUX_CONFIG.length; i++) {
       if (FC.AUX_CONFIG[i] == 'ARM') {
               if (bit_check(FC.CONFIG.mode, i))
                       $(".armedicon").addClass('active');
               else
                       $(".armedicon").removeClass('active');
       }
       if (FC.AUX_CONFIG[i] == 'FAILSAFE') {
               if (bit_check(FC.CONFIG.mode, i))
                       $(".failsafeicon").addClass('active');
               else
                       $(".failsafeicon").removeClass('active');
       }
    }

    if (FC.ANALOG != undefined) {
        var nbCells = Math.floor(FC.ANALOG.voltage / FC.BATTERY_CONFIG.vbatmaxcellvoltage) + 1;

        if (FC.ANALOG.voltage == 0) {
               nbCells = 1;
        }

       var min = FC.BATTERY_CONFIG.vbatmincellvoltage * nbCells;
       var max = FC.BATTERY_CONFIG.vbatmaxcellvoltage * nbCells;
       var warn = FC.BATTERY_CONFIG.vbatwarningcellvoltage * nbCells;

       const NO_BATTERY_VOLTAGE_MAXIMUM = 1.8; // Maybe is better to add a call to MSP_BATTERY_STATE but is not available for all versions  

       if (FC.ANALOG.voltage < min && FC.ANALOG.voltage > NO_BATTERY_VOLTAGE_MAXIMUM) {
           $(".battery-status").addClass('state-empty').removeClass('state-ok').removeClass('state-warning');
           $(".battery-status").css({
               width: "100%",
           });
       } else {
           $(".battery-status").css({
               width: ((FC.ANALOG.voltage - min) / (max - min) * 100) + "%",
           });

           if (FC.ANALOG.voltage < warn) {
               $(".battery-status").addClass('state-warning').removeClass('state-empty').removeClass('state-ok');
           } else  {
               $(".battery-status").addClass('state-ok').removeClass('state-warning').removeClass('state-empty');
           }
       }

    }

    if (active) {
        $(".linkicon").addClass('active');
    } else {
        $(".linkicon").removeClass('active');
    }

    statuswrapper.show();
    GUI.timeout_remove('data_refresh');
    startLiveDataRefreshTimer();
}

function specificByte(num, pos) {
    return 0x000000FF & (num >> (8 * pos));
}

function bit_check(num, bit) {
    return ((num >> bit) % 2 != 0);
}

function bit_set(num, bit) {
    return num | 1 << bit;
}

function bit_clear(num, bit) {
    return num & ~(1 << bit);
}

function update_dataflash_global() {
    function formatFilesize(bytes) {
        if (bytes < 1024) {
            return bytes + "B";
        }
        var kilobytes = bytes / 1024;

        if (kilobytes < 1024) {
            return Math.round(kilobytes) + "kB";
        }

        var megabytes = kilobytes / 1024;

        return megabytes.toFixed(1) + "MB";
    }

    var supportsDataflash = FC.DATAFLASH.totalSize > 0;

    if (supportsDataflash){
        $(".noflash_global").css({
           display: 'none'
        });

        $(".dataflash-contents_global").css({
           display: 'block'
        });

        $(".dataflash-free_global").css({
           width: (100-(FC.DATAFLASH.totalSize - FC.DATAFLASH.usedSize) / FC.DATAFLASH.totalSize * 100) + "%",
           display: 'block'
        });
        $(".dataflash-free_global div").text('Dataflash: free ' + formatFilesize(FC.DATAFLASH.totalSize - FC.DATAFLASH.usedSize));
     } else {
        $(".noflash_global").css({
           display: 'block'
        });

        $(".dataflash-contents_global").css({
           display: 'none'
        });
     }
}

function reinitialiseConnection(originatorTab, callback) {
    GUI.log(i18n.getMessage('deviceRebooting'));

    if (FC.boardHasVcp()) { // VCP-based flight controls may crash old drivers, we catch and reconnect
        GUI.timeout_add('waiting_for_disconnect', function waiting_for_bootup() {
            if (callback) {
                callback();
            }
        }, 100);
        //TODO: Need to work out how to do a proper reconnect here.
        // caveat: Timeouts set with `GUI.timeout_add()` are removed on disconnect.
    } else {
        GUI.timeout_add('waiting_for_bootup', function waiting_for_bootup() {
            if (callback) {
                callback();
            }

            MSP.send_message(MSPCodes.MSP_STATUS, false, false, function() {
                GUI.log(i18n.getMessage('deviceReady'));
                originatorTab.initialize(false, $('#content').scrollTop());
            });
        }, 1500); // 1500 ms seems to be just the right amount of delay to prevent data request timeouts
    }
}
