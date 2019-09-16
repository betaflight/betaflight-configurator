'use strict';

TABS.ports = {
    analyticsChanges: {},
};

TABS.ports.initialize = function (callback, scrollPosition) {
    var self = this;

    var board_definition = {};

    var functionRules = [
         {name: 'MSP',                  groups: ['configuration', 'msp'], maxPorts: 2},
         {name: 'GPS',                  groups: ['sensors'], maxPorts: 1},
         {name: 'TELEMETRY_FRSKY',      groups: ['telemetry'], sharableWith: ['msp'], notSharableWith: ['peripherals'], maxPorts: 1},
         {name: 'TELEMETRY_HOTT',       groups: ['telemetry'], sharableWith: ['msp'], notSharableWith: ['peripherals'], maxPorts: 1},
         {name: 'TELEMETRY_SMARTPORT',  groups: ['telemetry'], maxPorts: 1},
         {name: 'RX_SERIAL',            groups: ['rx'], maxPorts: 1},
         {name: 'BLACKBOX',     groups: ['peripherals'], sharableWith: ['msp'], notSharableWith: ['telemetry'], maxPorts: 1}
    ];

    if (semver.gte(CONFIG.apiVersion, "1.15.0")) {
        var ltmFunctionRule = {name: 'TELEMETRY_LTM',        groups: ['telemetry'], sharableWith: ['msp'], notSharableWith: ['peripherals'], maxPorts: 1};
        functionRules.push(ltmFunctionRule);
    } else {
        var mspFunctionRule = {name: 'TELEMETRY_MSP',        groups: ['telemetry'], sharableWith: ['msp'], notSharableWith: ['peripherals'], maxPorts: 1};
        functionRules.push(mspFunctionRule);
    }

    if (semver.gte(CONFIG.apiVersion, "1.18.0")) {
        var mavlinkFunctionRule = {name: 'TELEMETRY_MAVLINK',    groups: ['telemetry'], sharableWith: ['msp'], notSharableWith: ['peripherals'], maxPorts: 1};
        functionRules.push(mavlinkFunctionRule);
    }

    if (semver.gte(CONFIG.apiVersion, "1.31.0")) {
        functionRules.push({ name: 'ESC_SENSOR', groups: ['sensors'], maxPorts: 1 });
        functionRules.push({ name: 'TBS_SMARTAUDIO', groups: ['peripherals'], maxPorts: 1 });
    }

    if (semver.gte(CONFIG.apiVersion, "1.27.0")) {
        functionRules.push({ name: 'IRC_TRAMP', groups: ['peripherals'], maxPorts: 1 });
    }

    if (semver.gte(CONFIG.apiVersion, "1.32.0")) {
        functionRules.push({ name: 'TELEMETRY_IBUS', groups: ['telemetry'], maxPorts: 1 });
    }

    if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
        functionRules.push({ name: 'RUNCAM_DEVICE_CONTROL', groups: ['peripherals'], maxPorts: 1 });
    }

    if (semver.gte(CONFIG.apiVersion, "1.37.0")) {
        functionRules.push({ name: 'LIDAR_TF', groups: ['peripherals'], maxPorts: 1 });
    }

    for (var i = 0; i < functionRules.length; i++) {
        functionRules[i].displayName = i18n.getMessage('portsFunction_' + functionRules[i].name);
    }

    var mspBaudRates = [
        '9600',
        '19200',
        '38400',
        '57600',
        '115200',
        '230400',
        '250000'
    ];

    if (semver.gte(CONFIG.apiVersion, "1.31.0")) {
        mspBaudRates = mspBaudRates.concat(['500000', '1000000']);
    }

    var gpsBaudRates = [
        'AUTO',
        '9600',
        '19200',
        '38400',
        '57600',
        '115200'
    ];

    var telemetryBaudRates = [
        'AUTO',
        '9600',
        '19200',
        '38400',
        '57600',
        '115200'
    ];

    var blackboxBaudRates = [
        'AUTO',
        '19200',
        '38400',
        '57600',
        '115200',
        '230400',
        '250000',
        '1500000',
        '2000000',
        '2470000'
    ];

    var columns = ['configuration', 'peripherals', 'sensors', 'telemetry', 'rx'];

    if (GUI.active_tab != 'ports') {
        GUI.active_tab = 'ports';
    }

    load_configuration_from_fc();

    function load_configuration_from_fc() {
        if(semver.gte(CONFIG.apiVersion, "1.42.0")) {
            MSP.promise(MSPCodes.MSP_VTX_CONFIG).then(function() {
                return MSP.send_message(MSPCodes.MSP_CF_SERIAL_CONFIG, false, false, on_configuration_loaded_handler);
            });
        } else {
            MSP.send_message(MSPCodes.MSP_CF_SERIAL_CONFIG, false, false, on_configuration_loaded_handler);
        }

        function on_configuration_loaded_handler() {
            $('#content').load("./tabs/ports.html", on_tab_loaded_handler);

            board_definition = BOARD.find_board_definition(CONFIG.boardIdentifier);
            console.log('Using board definition', board_definition);
        }
    }

    function update_ui() {
        self.analyticsChanges = {};

        if (semver.lt(CONFIG.apiVersion, "1.6.0")) {

            $(".tab-ports").removeClass("supported");
            return;
        }

        $(".tab-ports").addClass("supported");

        const VCP_PORT_IDENTIFIER = 20;

        var portIdentifierToNameMapping = {
           0: 'UART1',
           1: 'UART2',
           2: 'UART3',
           3: 'UART4',
           4: 'UART5',
           5: 'UART6',
           6: 'UART7',
           7: 'UART8',
           8: 'UART9',
           9: 'UART10',
           20: 'USB VCP',
           30: 'SOFTSERIAL1',
           31: 'SOFTSERIAL2'
        };

        var gps_baudrate_e = $('select.gps_baudrate');
        for (var i = 0; i < gpsBaudRates.length; i++) {
            gps_baudrate_e.append('<option value="' + gpsBaudRates[i] + '">' + gpsBaudRates[i] + '</option>');
        }

        var msp_baudrate_e = $('select.msp_baudrate');
        for (var i = 0; i < mspBaudRates.length; i++) {
            msp_baudrate_e.append('<option value="' + mspBaudRates[i] + '">' + mspBaudRates[i] + '</option>');
        }

        var telemetry_baudrate_e = $('select.telemetry_baudrate');
        for (var i = 0; i < telemetryBaudRates.length; i++) {
            telemetry_baudrate_e.append('<option value="' + telemetryBaudRates[i] + '">' + telemetryBaudRates[i] + '</option>');
        }

        var blackbox_baudrate_e = $('select.blackbox_baudrate');
        for (var i = 0; i < blackboxBaudRates.length; i++) {
            blackbox_baudrate_e.append('<option value="' + blackboxBaudRates[i] + '">' + blackboxBaudRates[i] + '</option>');
        }

        let lastVtxControlSelected;
        var ports_e = $('.tab-ports .ports');
        var port_configuration_template_e = $('#tab-ports-templates .portConfiguration');

        for (var portIndex = 0; portIndex < SERIAL_CONFIG.ports.length; portIndex++) {
            var port_configuration_e = port_configuration_template_e.clone();
            var serialPort = SERIAL_CONFIG.ports[portIndex];

            port_configuration_e.data('serialPort', serialPort);

            var msp_baudrate_e = port_configuration_e.find('select.msp_baudrate');
            msp_baudrate_e.val(serialPort.msp_baudrate);

            var telemetry_baudrate_e = port_configuration_e.find('select.telemetry_baudrate');
            telemetry_baudrate_e.val(serialPort.telemetry_baudrate);

            var gpsBaudrate;
            if (serialPort.functions.indexOf('GPS') >= 0) {
                gpsBaudrate = serialPort.gps_baudrate;
            } else {
                gpsBaudrate = 'AUTO';
            }
            var gps_baudrate_e = port_configuration_e.find('select.gps_baudrate');
            gps_baudrate_e.val(gpsBaudrate);

            var blackboxBaudrate;
            if (serialPort.functions.indexOf('BLACKBOX') >= 0) {
                blackboxBaudrate = serialPort.blackbox_baudrate;
            } else {
                blackboxBaudrate = 'AUTO';
            }
            var blackbox_baudrate_e = port_configuration_e.find('select.blackbox_baudrate');
            blackbox_baudrate_e.val(blackboxBaudrate);

            port_configuration_e.find('.identifier').text(portIdentifierToNameMapping[serialPort.identifier]);

            port_configuration_e.data('index', portIndex);
            port_configuration_e.data('port', serialPort);


            for (var columnIndex = 0; columnIndex < columns.length; columnIndex++) {
                var column = columns[columnIndex];

                var functions_e = $(port_configuration_e).find('.functionsCell-' + column);

                for (var i = 0; i < functionRules.length; i++) {
                    var functionRule = functionRules[i];
                    var functionName = functionRule.name;

                    if (functionRule.groups.indexOf(column) == -1) {
                        continue;
                    }

                    var select_e;
                    if (column !== 'telemetry' && column !== 'sensors' && column !== 'peripherals') {
                        var checkboxId = 'functionCheckbox-' + portIndex + '-' + columnIndex + '-' + i;
                        functions_e.prepend('<span class="function"><input type="checkbox" class="togglemedium" id="' + checkboxId + '" value="' + functionName + '" /><label for="' + checkboxId + '"></label></span>');

                        if (serialPort.functions.indexOf(functionName) >= 0) {
                            var checkbox_e = functions_e.find('#' + checkboxId);
                            checkbox_e.prop("checked", true);
                        }

                        if (serialPort.identifier == VCP_PORT_IDENTIFIER && functionName == "MSP") {
                            var checkbox_e = functions_e.find('#' + checkboxId);
                            checkbox_e.prop("checked", true);
                            checkbox_e.prop("disabled", true);
                        }

                    } else {
                        var selectElementName = 'function-' + column;
                        var selectElementSelector = 'select[name=' + selectElementName + ']';
                        select_e = functions_e.find(selectElementSelector);

                        if (select_e.length == 0) {
                            functions_e.prepend('<span class="function"><select name="' + selectElementName + '" /></span>');
                            select_e = functions_e.find(selectElementSelector);
                            var disabledText = i18n.getMessage('portsTelemetryDisabled');
                            select_e.append('<option value="">' + disabledText + '</option>');
                        }
                        select_e.append('<option value="' + functionName + '">' + functionRule.displayName + '</option>');

                        if (serialPort.functions.indexOf(functionName) >= 0) {
                            select_e.val(functionName);

                            if (column === 'peripherals' && (functionName === "TBS_SMARTAUDIO" || functionName === "IRC_TRAMP")) {
                                lastVtxControlSelected = functionName;
                            }
                        }

                        if (column === 'telemetry') {
                            var initialValue = functionName;
                            select_e.change(function () {
                                var telemetryValue = $(this).val();

                                var newValue;
                                if (telemetryValue !== initialValue) {
                                    newValue = $(this).find('option:selected').text();
                                }
                                self.analyticsChanges['Telemetry'] = newValue;
                            });
                        }
                    }
                }
            }

            ports_e.find('tbody').append(port_configuration_e);
        }

        let vtxTableNotConfigured = true;
        if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
            vtxTableNotConfigured = VTX_CONFIG.vtx_table_available &&
                                        (VTX_CONFIG.vtx_table_bands == 0 ||
                                        VTX_CONFIG.vtx_table_channels == 0 ||
                                        VTX_CONFIG.vtx_table_powerlevels == 0);
        } else {
            $('.vtxTableNotSet').hide();
        }

        const pheripheralsSelectElement = $('select[name="function-peripherals"]');
        pheripheralsSelectElement.change(function() {
            let vtxControlSelected = undefined;
            pheripheralsSelectElement.each(function() {
                const el = $(this);
                if (el.val() === "TBS_SMARTAUDIO" || el.val() === "IRC_TRAMP") {
                    vtxControlSelected = el.val();
                }
            });

            if (lastVtxControlSelected !== vtxControlSelected) {
                self.analyticsChanges['VtxControl'] = vtxControlSelected;

                lastVtxControlSelected = vtxControlSelected;
            }

            if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                if (vtxControlSelected && vtxTableNotConfigured) {
                    $('.vtxTableNotSet').show();
                } else {
                    $('.vtxTableNotSet').hide();
                }
            }
        });
        pheripheralsSelectElement.change();
    }

    function on_tab_loaded_handler() {
        var self = this;

        i18n.localizePage();

        update_ui();

        $('a.save').click(on_save_handler);

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function status_pull() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);

        GUI.content_ready(callback);
    }

   function on_save_handler() {
        analytics.sendChangeEvents(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, self.analyticsChanges);
       self.analyticsChanges = {};

        // update configuration based on current ui state
        SERIAL_CONFIG.ports = [];

        var ports_e = $('.tab-ports .portConfiguration').each(function (portConfiguration_e) {

            var portConfiguration_e = this;

            var oldSerialPort = $(this).data('serialPort');

            var functions = $(portConfiguration_e).find('input:checkbox:checked').map(function() {
                return this.value;
            }).get();

            var telemetryFunction = $(portConfiguration_e).find('select[name=function-telemetry]').val();
            if (telemetryFunction) {
                functions.push(telemetryFunction);
            }

            var sensorFunction = $(portConfiguration_e).find('select[name=function-sensors]').val();
            if (sensorFunction) {
                functions.push(sensorFunction);
            }

            var peripheralFunction = $(portConfiguration_e).find('select[name=function-peripherals]').val();
            if (peripheralFunction) {
                functions.push(peripheralFunction);
            }

            var gpsBaudrate = $(portConfiguration_e).find('.gps_baudrate').val();
            if (gpsBaudrate === 'AUTO') {
                gpsBaudrate = '57600';
            }

            var blackboxBaudrate = $(portConfiguration_e).find('.blackbox_baudrate').val();
            if (blackboxBaudrate === 'AUTO') {
                blackboxBaudrate = '115200';
            }

            var serialPort = {
                functions: functions,
                msp_baudrate: $(portConfiguration_e).find('.msp_baudrate').val(),
                telemetry_baudrate: $(portConfiguration_e).find('.telemetry_baudrate').val(),
                gps_baudrate: gpsBaudrate,
                blackbox_baudrate: blackboxBaudrate,
                identifier: oldSerialPort.identifier
            };
            SERIAL_CONFIG.ports.push(serialPort);
        });

        MSP.send_message(MSPCodes.MSP_SET_CF_SERIAL_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_CF_SERIAL_CONFIG), false, save_to_eeprom);

        function save_to_eeprom() {
            MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, on_saved_handler);
        }

        function on_saved_handler() {
            GUI.log(i18n.getMessage('configurationEepromSaved'));

            GUI.tab_switch_cleanup(function() {
                MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false);
                reinitialiseConnection(self);
            });
        }
    }
};

TABS.ports.cleanup = function (callback) {
    if (callback) callback();
};
