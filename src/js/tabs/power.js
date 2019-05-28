'use strict';

TABS.power = {
    supported: false,
};

TABS.power.initialize = function (callback) {
    var self = this;

    if (GUI.active_tab != 'power') {
        GUI.active_tab = 'power';
        // Disabled on merge into betaflight-configurator
        //googleAnalytics.sendAppView('Power');
    }

    if (GUI.calibrationManager) {
        GUI.calibrationManager.destroy();
    }
    if (GUI.calibrationManagerConfirmation) {
        GUI.calibrationManagerConfirmation.destroy();
    }

    function load_status() {
        MSP.send_message(MSPCodes.MSP_STATUS, false, false, load_voltage_meters);
    }

    function load_voltage_meters() {
        MSP.send_message(MSPCodes.MSP_VOLTAGE_METERS, false, false, load_current_meters);
    }

    function load_current_meters() {
        MSP.send_message(MSPCodes.MSP_CURRENT_METERS, false, false, load_current_meter_configs);
    }

    function load_current_meter_configs() {
        MSP.send_message(MSPCodes.MSP_CURRENT_METER_CONFIG, false, false, load_voltage_meter_configs);
    }

    function load_voltage_meter_configs() {
        MSP.send_message(MSPCodes.MSP_VOLTAGE_METER_CONFIG, false, false, load_battery_state);
    }

    function load_battery_state() {
        MSP.send_message(MSPCodes.MSP_BATTERY_STATE, false, false, load_battery_config);
    }

    function load_battery_config() {
        MSP.send_message(MSPCodes.MSP_BATTERY_CONFIG, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/power.html", process_html);
    }

    this.supported = semver.gte(CONFIG.apiVersion, "1.33.0");

    if (!this.supported) {
        load_html();
    } else {
        load_status();
    }

    function updateDisplay(voltageDataSource, currentDataSource) {
        // voltage meters

        if (BATTERY_CONFIG.voltageMeterSource == 0) {
            $('.boxVoltageConfiguration').hide();
        } else {
            $('.boxVoltageConfiguration').show();
        }

        if (!voltageDataSource) {
            voltageDataSource = [];
            for (var index = 0; index < VOLTAGE_METER_CONFIGS.length; index++) {
                voltageDataSource[index] = {
                    vbatscale: parseInt($('input[name="vbatscale-' + index + '"]').val()),
                    vbatresdivval: parseInt($('input[name="vbatresdivval-' + index + '"]').val()),
                    vbatresdivmultiplier: parseInt($('input[name="vbatresdivmultiplier-' + index + '"]').val())
                };
            }
        }

        var template = $('#tab-power-templates .voltage-meters .voltage-meter');
        var destination = $('.tab-power .voltage-meters');
        destination.empty();
        for (var index = 0; index < VOLTAGE_METERS.length; index++) {
            var meterElement = template.clone();
            $(meterElement).attr('id', 'voltage-meter-' + index);

            var message = i18n.getMessage('powerVoltageId' + VOLTAGE_METERS[index].id);
            $(meterElement).find('.label').text(message)
            destination.append(meterElement);

            meterElement.hide();
            if ((BATTERY_CONFIG.voltageMeterSource == 1 && VOLTAGE_METERS[index].id == 10)  // TODO: replace hardcoded constants
                || (BATTERY_CONFIG.voltageMeterSource == 2 && VOLTAGE_METERS[index].id >= 50)) {
                meterElement.show();
            }
        }

        var template = $('#tab-power-templates .voltage-configuration');
        for (var index = 0; index < VOLTAGE_METER_CONFIGS.length; index++) {
            var destination = $('#voltage-meter-' + index + ' .configuration');
            var element = template.clone();

            var attributeNames = ["vbatscale", "vbatresdivval", "vbatresdivmultiplier"];
            for (let attributeName of attributeNames) {
                $(element).find('input[name="' + attributeName + '"]').attr('name', attributeName + '-' + index);
            }
            destination.append(element);

            $('input[name="vbatscale-' + index + '"]').val(voltageDataSource[index].vbatscale);
            $('input[name="vbatresdivval-' + index + '"]').val(voltageDataSource[index].vbatresdivval);
            $('input[name="vbatresdivmultiplier-' + index + '"]').val(voltageDataSource[index].vbatresdivmultiplier);
        }

        // amperage meters
        if (BATTERY_CONFIG.currentMeterSource == 0) {
            $('.boxAmperageConfiguration').hide();
        } else {
            $('.boxAmperageConfiguration').show();
        }

        if (!currentDataSource) {
            currentDataSource = [];
            for (var index = 0; index < CURRENT_METER_CONFIGS.length; index++) {
                currentDataSource[index] = {
                    scale: parseInt($('input[name="amperagescale-' + index + '"]').val()),
                    offset: parseInt($('input[name="amperageoffset-' + index + '"]').val())
                };
            }
        }
        var template = $('#tab-power-templates .amperage-meters .amperage-meter');
        var destination = $('.tab-power .amperage-meters');
        destination.empty();
        for (var index = 0; index < CURRENT_METERS.length; index++) {
            var meterElement = template.clone();
            $(meterElement).attr('id', 'amperage-meter-' + index);

            var message = i18n.getMessage('powerAmperageId' + CURRENT_METERS[index].id);
            $(meterElement).find('.label').text(message)
            destination.append(meterElement);

            meterElement.hide();
            if ((BATTERY_CONFIG.currentMeterSource == 1 && CURRENT_METERS[index].id == 10)              // TODO: replace constants
                || (BATTERY_CONFIG.currentMeterSource == 2 && CURRENT_METERS[index].id == 80)
                || (BATTERY_CONFIG.currentMeterSource == 3 && CURRENT_METERS[index].id >= 50 && CURRENT_METERS[index].id < 80)) {
                meterElement.show();
            }
        }

        var template = $('#tab-power-templates .amperage-configuration');
        for (var index = 0; index < CURRENT_METER_CONFIGS.length; index++) {
            var destination = $('#amperage-meter-' + index + ' .configuration');
            var element = template.clone();

            var attributeNames = ["amperagescale", "amperageoffset"];
            for (let attributeName of attributeNames) {
                $(element).find('input[name="' + attributeName + '"]').attr('name', attributeName + '-' + index);
            }
            destination.append(element);

            $('input[name="amperagescale-' + index + '"]').val(currentDataSource[index].scale);
            $('input[name="amperageoffset-' + index + '"]').val(currentDataSource[index].offset);
        }

        if(BATTERY_CONFIG.voltageMeterSource == 1 || BATTERY_CONFIG.currentMeterSource == 1 || BATTERY_CONFIG.currentMeterSource == 2) {
            $('.calibration').show();
        } else {
            $('.calibration').hide();
        }
    }

    function initDisplay() {
        if (!TABS.power.supported) {
            $(".tab-power").removeClass("supported");
            return;
        }
        $(".tab-power").addClass("supported");

       // battery
        var template = $('#tab-power-templates .battery-state .battery-state');
        var destination = $('.tab-power .battery-state');
        var element = template.clone();
        $(element).find('.connection-state').attr('id', 'battery-connection-state');
        $(element).find('.voltage').attr('id', 'battery-voltage');
        $(element).find('.mah-drawn').attr('id', 'battery-mah-drawn');
        $(element).find('.amperage').attr('id', 'battery-amperage');

        destination.append(element.children());

        var template = $('#tab-power-templates .battery-configuration');
        var destination = $('.tab-power .battery .configuration');
        var element = template.clone();
        destination.append(element);

        if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
            $('input[name="mincellvoltage"]').prop('step','0.01');
            $('input[name="maxcellvoltage"]').prop('step','0.01');
            $('input[name="warningcellvoltage"]').prop('step','0.01');
        }

        $('input[name="mincellvoltage"]').val(BATTERY_CONFIG.vbatmincellvoltage);
        $('input[name="maxcellvoltage"]').val(BATTERY_CONFIG.vbatmaxcellvoltage);
        $('input[name="warningcellvoltage"]').val(BATTERY_CONFIG.vbatwarningcellvoltage);
        $('input[name="capacity"]').val(BATTERY_CONFIG.capacity);

        var haveFc = (semver.lt(CONFIG.apiVersion, "1.35.0") || (CONFIG.boardType == 0 || CONFIG.boardType == 2));

        var batteryMeterTypes = [
            i18n.getMessage('powerBatteryVoltageMeterTypeNone'),
            i18n.getMessage('powerBatteryVoltageMeterTypeAdc'),
        ];

        if (haveFc) {
            batteryMeterTypes.push(i18n.getMessage('powerBatteryVoltageMeterTypeEsc'));
        }

        var batteryMeterType_e = $('select.batterymetersource');

        for (var i = 0; i < batteryMeterTypes.length; i++) {
            batteryMeterType_e.append('<option value="' + i + '">' + batteryMeterTypes[i] + '</option>');
        }

        // fill current
        var currentMeterTypes = [
            i18n.getMessage('powerBatteryCurrentMeterTypeNone'),
            i18n.getMessage('powerBatteryCurrentMeterTypeAdc'),
        ];

        if (haveFc) {
            currentMeterTypes.push(i18n.getMessage('powerBatteryCurrentMeterTypeVirtual'));
            currentMeterTypes.push(i18n.getMessage('powerBatteryCurrentMeterTypeEsc'));
            
            if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                currentMeterTypes.push(i18n.getMessage('powerBatteryCurrentMeterTypeMsp'));
            }
        }

        var currentMeterType_e = $('select.currentmetersource');

        for (var i = 0; i < currentMeterTypes.length; i++) {
            currentMeterType_e.append('<option value="' + i + '">' + currentMeterTypes[i] + '</option>');
        }

        updateDisplay(VOLTAGE_METER_CONFIGS, CURRENT_METER_CONFIGS);

        var batteryMeterType_e = $('select.batterymetersource');

        var sourceschanged = false;
        batteryMeterType_e.val(BATTERY_CONFIG.voltageMeterSource);
        batteryMeterType_e.change(function () {
            BATTERY_CONFIG.voltageMeterSource = parseInt($(this).val());

            updateDisplay();
            sourceschanged = true;
        });

        var currentMeterType_e = $('select.currentmetersource');
        currentMeterType_e.val(BATTERY_CONFIG.currentMeterSource);
        currentMeterType_e.change(function () {
            BATTERY_CONFIG.currentMeterSource = parseInt($(this).val());

            updateDisplay();
            sourceschanged = true;
        });

        function get_slow_data() {
            MSP.send_message(MSPCodes.MSP_VOLTAGE_METERS, false, false, function () {
                for (var i = 0; i < VOLTAGE_METERS.length; i++) {
                    var elementName = '#voltage-meter-' + i + ' .value';
                    var element = $(elementName);
                    element.text(i18n.getMessage('powerVoltageValue', [VOLTAGE_METERS[i].voltage]));
                }
            });

            MSP.send_message(MSPCodes.MSP_CURRENT_METERS, false, false, function () {
                for (var i = 0; i < CURRENT_METERS.length; i++) {
                    var elementName = '#amperage-meter-' + i + ' .value';
                    var element = $(elementName);
                    element.text(i18n.getMessage('powerAmperageValue', [CURRENT_METERS[i].amperage.toFixed(2)]));
                }
            });

            MSP.send_message(MSPCodes.MSP_BATTERY_STATE, false, false, function () {
                var elementPrefix = '#battery';
                var element;

                element = $(elementPrefix + '-connection-state .value');
                element.text(BATTERY_STATE.cellCount > 0 ? i18n.getMessage('powerBatteryConnectedValueYes', [BATTERY_STATE.cellCount]) : i18n.getMessage('powerBatteryConnectedValueNo'));
                element = $(elementPrefix + '-voltage .value');
                element.text(i18n.getMessage('powerVoltageValue', [BATTERY_STATE.voltage]));
                element = $(elementPrefix + '-mah-drawn .value');
                element.text(i18n.getMessage('powerMahValue', [BATTERY_STATE.mAhDrawn]));
                element = $(elementPrefix + '-amperage .value');
                element.text(i18n.getMessage('powerAmperageValue', [BATTERY_STATE.amperage]));
            });

        }

        //calibration manager
        var calibrationconfirmed = false;
        GUI.calibrationManager = new jBox('Modal', {
            width: 400,
            height: 230,
            closeButton: 'title',
            animation: false,
            attach: $('#calibrationmanager'),
            title: 'Calibration Manager',
            content: $('#calibrationmanagercontent'),
            onCloseComplete: function() {
                if (!calibrationconfirmed) {
                    TABS.power.initialize();
                }
            },
        });

        GUI.calibrationManagerConfirmation = new jBox('Modal', {
            width: 400,
            height: 230,
            closeButton: 'title',
            animation: false,
            attach: $('#calibrate'),
            title: 'Calibration Manager Confirmation',
            content: $('#calibrationmanagerconfirmcontent'),
            onCloseComplete: function() {
                GUI.calibrationManager.close();
            },
        });

        $('a.calibrationmanager').click(function() {
            if (BATTERY_CONFIG.voltageMeterSource == 1 && BATTERY_STATE.voltage > 0.1){
                $('.vbatcalibration').show();
            } else {
                $('.vbatcalibration').hide();
            }
            if ((BATTERY_CONFIG.currentMeterSource == 1 || BATTERY_CONFIG.currentMeterSource == 2) && BATTERY_STATE.amperage > 0.1) {
                $('.amperagecalibration').show();
            } else {
                $('.amperagecalibration').hide();
            }
            if (BATTERY_STATE.cellCount == 0) {
                $('.vbatcalibration').hide();
                $('.amperagecalibration').hide();
                $('.calibrate').hide();
                $('.nocalib').show();
            } else {
                $('.calibrate').show();
                $('.nocalib').hide();
            }
            if (sourceschanged) {
                $('.srcchange').show();
                $('.vbatcalibration').hide();
                $('.amperagecalibration').hide();
                $('.calibrate').hide();
                $('.nocalib').hide();
            } else {
                $('.srcchange').hide();
            }
        });
        
        $('input[name="vbatcalibration"]').val(0);
        $('input[name="amperagecalibration"]').val(0);

        var vbatscalechanged = false;
        var amperagescalechanged = false;
        $('a.calibrate').click(function() {
            if (BATTERY_CONFIG.voltageMeterSource == 1) {
                var vbatcalibration = parseFloat($('input[name="vbatcalibration"]').val());
                if (vbatcalibration != 0) {
                    var vbatnewscale = Math.round(VOLTAGE_METER_CONFIGS[0].vbatscale * (vbatcalibration / VOLTAGE_METERS[0].voltage));
                    if (vbatnewscale >= 10 && vbatnewscale <= 255) {
                        VOLTAGE_METER_CONFIGS[0].vbatscale = vbatnewscale;
                        vbatscalechanged = true;
                    }
                }
            }
            var ampsource = BATTERY_CONFIG.currentMeterSource;
            if (ampsource == 1 || ampsource == 2) {
                var amperagecalibration = parseFloat($('input[name="amperagecalibration"]').val());
                var amperageoffset = CURRENT_METER_CONFIGS[ampsource - 1].offset / 1000;
                if (amperagecalibration != 0) {
                    if (CURRENT_METERS[ampsource - 1].amperage != amperageoffset && amperagecalibration != amperageoffset) {
                        var amperagenewscale = Math.round(CURRENT_METER_CONFIGS[ampsource - 1].scale * 
                            ((CURRENT_METERS[ampsource - 1].amperage -  amperageoffset) / (amperagecalibration - amperageoffset)));
                        if (amperagenewscale > -16000 && amperagenewscale < 16000 && amperagenewscale != 0) {
                            CURRENT_METER_CONFIGS[ampsource - 1].scale = amperagenewscale;
                            amperagescalechanged = true;
                        }
                    }
                }
            }
            if (vbatscalechanged || amperagescalechanged) {
                if (vbatscalechanged) {
                    $('.vbatcalibration').show();
                } else {
                    $('.vbatcalibration').hide();
                }
                if (amperagescalechanged) {
                    $('.amperagecalibration').show();
                } else {
                    $('.amperagecalibration').hide();
                }

                $('output[name="vbatnewscale"').val(vbatnewscale);
                $('output[name="amperagenewscale"').val(amperagenewscale);

                $('a.applycalibration').click(function() {
                    calibrationconfirmed = true;
                    GUI.calibrationManagerConfirmation.close();
                    updateDisplay(VOLTAGE_METER_CONFIGS, CURRENT_METER_CONFIGS);
                    $('.calibration').hide();
                });

                $('a.discardcalibration').click(function() {
                    GUI.calibrationManagerConfirmation.close();
                }); 
            } else {
                GUI.calibrationManagerConfirmation.close();
            }
        });

        $('a.save').click(function () {
            for (var index = 0; index < VOLTAGE_METER_CONFIGS.length; index++) {
                VOLTAGE_METER_CONFIGS[index].vbatscale = parseInt($('input[name="vbatscale-' + index + '"]').val());
                VOLTAGE_METER_CONFIGS[index].vbatresdivval = parseInt($('input[name="vbatresdivval-' + index + '"]').val());
                VOLTAGE_METER_CONFIGS[index].vbatresdivmultiplier = parseInt($('input[name="vbatresdivmultiplier-' + index + '"]').val());
            }

            for (var index = 0; index < CURRENT_METER_CONFIGS.length; index++) {
                CURRENT_METER_CONFIGS[index].scale = parseInt($('input[name="amperagescale-' + index + '"]').val());
                CURRENT_METER_CONFIGS[index].offset = parseInt($('input[name="amperageoffset-' + index + '"]').val());
            }

            BATTERY_CONFIG.vbatmincellvoltage = parseFloat($('input[name="mincellvoltage"]').val());
            BATTERY_CONFIG.vbatmaxcellvoltage = parseFloat($('input[name="maxcellvoltage"]').val());
            BATTERY_CONFIG.vbatwarningcellvoltage = parseFloat($('input[name="warningcellvoltage"]').val());
            BATTERY_CONFIG.capacity = parseInt($('input[name="capacity"]').val());

            save_power_config();
        });

        GUI.interval_add('setup_data_pull_slow', get_slow_data, 200, true); // 5hz
    }

    function save_power_config() {
        function save_battery_config() {
            MSP.send_message(MSPCodes.MSP_SET_BATTERY_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BATTERY_CONFIG), false, save_voltage_config);
        }

        function save_voltage_config() {
            if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                mspHelper.sendVoltageConfig(save_amperage_config);
            } else {
                MSP.send_message(MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG), false, save_amperage_config);
            }
        }

        function save_amperage_config() {
            if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                mspHelper.sendCurrentConfig(save_to_eeprom);
            } else {
                MSP.send_message(MSPCodes.MSP_SET_CURRENT_METER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_CURRENT_METER_CONFIG), false, save_to_eeprom);
            }
        }

        function save_to_eeprom() {
            MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, save_completed);
        }

        function save_completed() {
            GUI.log(i18n.getMessage('configurationEepromSaved'));

            TABS.power.initialize();
        }

        save_battery_config();
    }

    function process_html() {
        initDisplay();

        // translate to user-selected language
        i18n.localizePage();

        GUI.content_ready(callback);
    }
};

TABS.power.cleanup = function (callback) {
    if (callback) callback();

    if (GUI.calibrationManager) {
        GUI.calibrationManager.destroy();
    }
    if (GUI.calibrationManagerConfirmation) {
        GUI.calibrationManagerConfirmation.destroy();
    }
};
