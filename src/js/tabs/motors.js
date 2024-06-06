import { i18n } from "../localization";
import GUI, { TABS } from '../gui';
import { get as getConfig, set as setConfig } from '../ConfigStorage';
import MotorOutputReorderConfig from "../../components/MotorOutputReordering/MotorOutputReorderingConfig";
import MotorOutputReorderComponent from "../../components/MotorOutputReordering/MotorOutputReorderingComponent";
import EscDshotDirectionComponent from "../../components/EscDshotDirection/EscDshotDirectionComponent";
import DshotCommand from "../../js/utils/DshotCommand.js";
import { tracking } from "../Analytics";
import { bit_check } from "../bit";
import { mspHelper } from "../msp/MSPHelper";
import FC from "../fc";
import MSP from "../msp";
import { mixerList } from "../model";
import MSPCodes from "../msp/MSPCodes";
import EscProtocols from "../utils/EscProtocols";
import { updateTabList } from "../utils/updateTabList";
import { isInt, getMixerImageSrc } from "../utils/common";
import * as d3 from 'd3';
import $ from 'jquery';

const motors = {
    previousDshotBidir: null,
    previousFilterDynQ: null,
    previousFilterDynCount: null,
    analyticsChanges: {},
    configHasChanged: false,
    configChanges: {},
    feature3DEnabled: false,
    sensor: "gyro",
    sensorGyroRate: 20,
    sensorGyroScale: 2000,
    sensorAccelRate: 20,
    sensorAccelScale: 2,
    sensorSelectValues: {
        "gyroScale": {
            "1" : 1,
            "2" : 2,
            "3" : 3,
            "4" : 4,
            "5" : 5,
            "10" : 10,
            "25" : 25,
            "50" : 50,
            "100" : 100,
            "200" : 200,
            "300" : 300,
            "400" : 400,
            "500" : 500,
            "1000" : 1000,
            "2000" : 2000,
        },
        "accelScale": {
            "0.05" : 0.05,
            "0.1" : 0.1,
            "0.2" : 0.2,
            "0.3" : 0.3,
            "0.4" : 0.4,
            "0.5" : 0.5,
            "1" : 1,
            "2" : 2,
        },
    },
    // These are translated into proper Dshot values on the flight controller
    DSHOT_PROTOCOL_MIN_VALUE: 0,
    DSHOT_DISARMED_VALUE: 1000,
    DSHOT_MAX_VALUE: 2000,
    DSHOT_3D_NEUTRAL: 1500,
};

motors.initialize = async function (callback) {
    const self = this;

    self.armed = false;
    self.escProtocolIsDshot = false;
    self.configHasChanged = false;
    self.configChanges = {};

    // Update filtering defaults based on API version
    const FILTER_DEFAULT = FC.getFilterDefaults();

    GUI.active_tab = 'motors';

    await MSP.promise(MSPCodes.MSP_PID_ADVANCED);
    await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
    await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
    if (FC.MOTOR_CONFIG.use_dshot_telemetry || FC.MOTOR_CONFIG.use_esc_sensor) {
        await MSP.promise(MSPCodes.MSP_MOTOR_TELEMETRY);
    }
    await MSP.promise(MSPCodes.MSP_MOTOR_CONFIG);
    await MSP.promise(MSPCodes.MSP_MOTOR_3D_CONFIG);
    await MSP.promise(MSPCodes.MSP2_MOTOR_OUTPUT_REORDERING);
    await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);
    await MSP.promise(MSPCodes.MSP_FILTER_CONFIG);
    await MSP.promise(MSPCodes.MSP_ARMING_CONFIG);

    load_html();

    function load_html() {
        $('#content').load("./tabs/motors.html", process_html);
    }

    function update_arm_status() {
        self.armed = bit_check(FC.CONFIG.mode, 0);
    }

    function initSensorData() {
        for (let i = 0; i < 3; i++) {
            FC.SENSOR_DATA.accelerometer[i] = 0;
            FC.SENSOR_DATA.gyroscope[i] = 0;
        }
    }

    function initDataArray(length) {
        const data = Array.from({length: length});
        for (let i = 0; i < length; i++) {
            data[i] = [];
            data[i].min = -1;
            data[i].max = 1;
        }
        return data;
    }

    function addSampleToData(data, sampleNumber, sensorData) {
        for (let i = 0; i < data.length; i++) {
            const dataPoint = sensorData[i];
            data[i].push([sampleNumber, dataPoint]);
            if (dataPoint < data[i].min) {
                data[i].min = dataPoint;
            }
            if (dataPoint > data[i].max) {
                data[i].max = dataPoint;
            }
        }
        while (data[0].length > 300) {
            for (const item of data) {
                item.shift();
            }
        }
        return sampleNumber + 1;
    }

    const margin = {top: 20, right: 30, bottom: 10, left: 20};
    function updateGraphHelperSize(helpers) {
        helpers.width = helpers.targetElement.width() - margin.left - margin.right;
        helpers.height = helpers.targetElement.height() - margin.top - margin.bottom;

        helpers.widthScale.range([0, helpers.width]);
        helpers.heightScale.range([helpers.height, 0]);

        helpers.xGrid.tickSize(-helpers.height, 0, 0);
        helpers.yGrid.tickSize(-helpers.width, 0, 0);
    }

    function initGraphHelpers(selector, sampleNumber, heightDomain) {
        const helpers = {selector: selector, targetElement: $(selector), dynamicHeightDomain: !heightDomain};

        helpers.widthScale = d3.scaleLinear()
            .clamp(true)
            .domain([(sampleNumber - 299), sampleNumber]);

        helpers.heightScale = d3.scaleLinear()
            .clamp(true)
            .domain(heightDomain || [1, -1]);

        helpers.xGrid = d3.axisBottom();
        helpers.yGrid = d3.axisLeft();

        updateGraphHelperSize(helpers);

        helpers.xGrid
            .scale(helpers.widthScale)
            .tickSize(-helpers.height)
            .tickValues(helpers.widthScale.ticks(5).concat(helpers.widthScale.domain()))
            .tickFormat("");

        helpers.yGrid
            .scale(helpers.heightScale)
            .tickSize(-helpers.width)
            .tickValues(helpers.heightScale.ticks(5).concat(helpers.heightScale.domain()))
            .tickFormat("");
        helpers.xAxis = d3.axisBottom()
            .scale(helpers.widthScale)
            .ticks(5)
            .tickFormat(function (d) {return d;});

        helpers.yAxis = d3.axisLeft()
            .scale(helpers.heightScale)
            .ticks(5)
            .tickFormat(function (d) {return d;});

        helpers.line = d3.line()
            .x(function (d) { return helpers.widthScale(d[0]); })
            .y(function (d) { return helpers.heightScale(d[1]); });

        return helpers;
    }

    function drawGraph(graphHelpers, data, sampleNumber) {

        const svg = d3.select(graphHelpers.selector);

        if (graphHelpers.dynamicHeightDomain) {
            const limits = [];
            $.each(data, function (idx, datum) {
                limits.push(datum.min);
                limits.push(datum.max);
            });
            graphHelpers.heightScale.domain(d3.extent(limits));
        }
        graphHelpers.widthScale.domain([(sampleNumber - 299), sampleNumber]);

        svg.select(".x.grid").call(graphHelpers.xGrid);
        svg.select(".y.grid").call(graphHelpers.yGrid);
        svg.select(".x.axis").call(graphHelpers.xAxis);
        svg.select(".y.axis").call(graphHelpers.yAxis);

        const group = svg.select("g.data");
        const lines = group.selectAll("path").data(data, function (d, i) {
            return i;
        });

        lines.enter().append("path").attr("class", "line");
        lines.attr('d', graphHelpers.line);
    }

    function replace_mixer_preview(imgSrc) {
        $.get(imgSrc, function(data) {
            const svg = $(data).find('svg');
            $('.mixerPreview').html(svg);
        }, 'xml');
    }

    function update_model(mixer) {
        const imgSrc = getMixerImageSrc(mixer, FC.MIXER_CONFIG.reverseMotorDir);

        replace_mixer_preview(imgSrc);

        const motorOutputReorderConfig = new MotorOutputReorderConfig(100);
        const domMotorOutputReorderDialogOpen = $('#motorOutputReorderDialogOpen');

        const isMotorReorderingAvailable = (mixerList[mixer - 1].name in motorOutputReorderConfig)
            && (FC.MOTOR_OUTPUT_ORDER) && (FC.MOTOR_OUTPUT_ORDER.length > 0);
        domMotorOutputReorderDialogOpen.toggle(isMotorReorderingAvailable);

        self.escProtocolIsDshot = EscProtocols.IsProtocolDshot(FC.CONFIG.apiVersion, FC.PID_ADVANCED_CONFIG.fast_pwm_protocol);
    }

    function process_html() {
        // translate to user-selected language
        i18n.localizePage();

        update_arm_status();

        self.feature3DEnabled = FC.FEATURE_CONFIG.features.isEnabled('3D');
        const motorsEnableTestModeElement = $('#motorsEnableTestMode');
        self.analyticsChanges = {};

        motorsEnableTestModeElement.prop('checked', self.armed);

        if (!(FC.MOTOR_CONFIG.use_dshot_telemetry || FC.MOTOR_CONFIG.use_esc_sensor)) {
            $(".motor_testing .telemetry").hide();
        }

        function setContentButtons(motorsTesting=false) {
            $('.btn .tool').toggleClass("disabled", self.configHasChanged || motorsTesting);
            $('.btn .save').toggleClass("disabled", !self.configHasChanged);
            $('.btn .stop').toggleClass("disabled", !motorsTesting);
        }

        const defaultConfiguration = {
            mixer:              FC.MIXER_CONFIG.mixer,
            reverseMotorSwitch: FC.MIXER_CONFIG.reverseMotorDir,
            escprotocol:        FC.PID_ADVANCED_CONFIG.fast_pwm_protocol + 1,
            feature4:           FC.FEATURE_CONFIG.features.isEnabled('MOTOR_STOP'),
            feature12:          FC.FEATURE_CONFIG.features.isEnabled('3D'),
            feature27:          FC.FEATURE_CONFIG.features.isEnabled('ESC_SENSOR'),
            dshotBidir:         FC.MOTOR_CONFIG.use_dshot_telemetry,
            motorPoles:         FC.MOTOR_CONFIG.motor_poles,
            digitalIdlePercent: FC.PID_ADVANCED_CONFIG.digitalIdlePercent,
            idleMinRpm:         FC.ADVANCED_TUNING.idleMinRpm,
            _3ddeadbandlow:     FC.MOTOR_3D_CONFIG.deadband3d_low,
            _3ddeadbandhigh:    FC.MOTOR_3D_CONFIG.deadband3d_high,
            _3dneutral:         FC.MOTOR_3D_CONFIG.neutral,
            unsyncedPWMSwitch:  FC.PID_ADVANCED_CONFIG.use_unsyncedPwm,
            unsyncedpwmfreq:    FC.PID_ADVANCED_CONFIG.motor_pwm_rate,
            minthrottle:        FC.MOTOR_CONFIG.minthrottle,
            maxthrottle:        FC.MOTOR_CONFIG.maxthrottle,
            mincommand:         FC.MOTOR_CONFIG.mincommand,
        };

        setContentButtons();

        // Stop motor testing on configuration changes
        function disableHandler(e) {
            if (e.target !== e.currentTarget) {
                const item = e.target.id === '' ? e.target.name : e.target.id;
                let value = e.target.type === "checkbox" ? e.target.checked : e.target.value;

                switch (e.target.type) {
                    case "checkbox":
                        if (item === "reverseMotorSwitch") {
                            value = value === false ? 0 : 1;
                        }
                        break;
                    case "number":
                        value = isInt(value) ? parseInt(value) : parseFloat(value);
                        break;
                    case "select-one":
                        value = parseInt(value);
                        break;
                    default:
                        console.log(`Undefined case ${e.target.type} encountered, please check code`);
                }

                self.configChanges[item] = value;

                if (item in defaultConfiguration) {
                    if (value !== defaultConfiguration[item]) {
                        self.configHasChanged = true;
                    } else {
                        delete self.configChanges[item];
                        if (Object.keys(self.configChanges).length === 0) {
                            console.log('All configuration changes reverted');
                            self.configHasChanged = false;
                          }
                    }
                } else {
                    console.log(`Unknown item ${item} found with type ${e.target.type}, please add to the defaultConfiguration object.`);
                    self.configHasChanged = true;
                }

                // disables Motor Testing if settings are being changed (must save and reboot or undo changes).
                motorsEnableTestModeElement.trigger("change");
                setContentButtons();
            }
            e.stopPropagation();
        }

        // Add EventListener for configuration changes
        document.querySelector('.configuration').addEventListener('change', disableHandler);

        /*
        *  MIXER
        */

        const mixerListElement = $('select.mixerList');
        for (let selectIndex = 0; selectIndex < mixerList.length; selectIndex++) {
            mixerList.forEach(function (mixerEntry, mixerIndex) {
                if (mixerEntry.pos === selectIndex) {
                    mixerListElement.append(`<option value="${(mixerIndex + 1)}">${mixerEntry.name.toUpperCase()}</option>`);
                }
            });
        }

        mixerListElement.sortSelect();

        function refreshMixerPreview() {
            const imgSrc = getMixerImageSrc(FC.MIXER_CONFIG.mixer, FC.MIXER_CONFIG.reverseMotorDir);
            replace_mixer_preview(imgSrc);
        }

        const reverseMotorSwitchElement = $('#reverseMotorSwitch');

        reverseMotorSwitchElement.change(function() {
            FC.MIXER_CONFIG.reverseMotorDir = $(this).prop('checked') ? 1 : 0;
            refreshMixerPreview();
        });

        reverseMotorSwitchElement.prop('checked', FC.MIXER_CONFIG.reverseMotorDir !== 0).change();

        mixerListElement.change(function () {
            const mixerValue = parseInt($(this).val());

            let newValue;
            if (mixerValue !== FC.MIXER_CONFIG.mixer) {
                newValue = $(this).find('option:selected').text();
            }
            self.analyticsChanges['Mixer'] = newValue;

            FC.MIXER_CONFIG.mixer = mixerValue;
            refreshMixerPreview();
        });

        // select current mixer configuration
        mixerListElement.val(FC.MIXER_CONFIG.mixer).change();

        function validateMixerOutputs() {
            MSP.promise(MSPCodes.MSP_MOTOR).then(() => {
                const mixer = FC.MIXER_CONFIG.mixer;
                const motorCount = mixerList[mixer - 1].motors;
                // initialize for models with zero motors
                self.numberOfValidOutputs = motorCount;

                for (let i = 0; i < FC.MOTOR_DATA.length; i++) {
                    if (FC.MOTOR_DATA[i] === 0) {
                        self.numberOfValidOutputs = i;
                        if (motorCount > self.numberOfValidOutputs && motorCount > 0) {
                            const msg = i18n.getMessage('motorsDialogMixerReset', {
                                mixerName: mixerList[mixer - 1].name,
                                mixerMotors: motorCount,
                                outputs: self.numberOfValidOutputs,
                            });
                            showDialogMixerReset(msg);
                        }
                        return;
                    }
                }
            });
        }

        update_model(FC.MIXER_CONFIG.mixer);

        // Reference: src/main/drivers/motor.h for motorPwmProtocolTypes_e;
        const ESC_PROTOCOL_UNDEFINED = 9;
        if (FC.PID_ADVANCED_CONFIG.fast_pwm_protocol !== ESC_PROTOCOL_UNDEFINED) {
            validateMixerOutputs();
        }

        // Always start with default/empty sensor data array, clean slate all
        initSensorData();

        // Setup variables
        let samplesGyro = 0;
        const gyroData = initDataArray(3);
        let gyroHelpers = initGraphHelpers('#graph', samplesGyro, [-2, 2]);
        let gyroMaxRead = [0, 0, 0];

        let samplesAccel = 0;
        const accelData = initDataArray(3);
        let accelHelpers = initGraphHelpers('#graph', samplesAccel, [-2, 2]);
        let accelMaxRead = [0, 0, 0];
        const accelOffset = [0, 0, 0];
        let accelOffsetEstablished = false;

        // cached elements
        const motorVoltage = $('.motors-bat-voltage');
        const motorMahDrawingElement = $('.motors-bat-mah-drawing');
        const motorMahDrawnElement = $('.motors-bat-mah-drawn');

        const rawDataTextElements = {
            x: [],
            y: [],
            z: [],
            rms: [],
        };

        $('.plot_control .x, .plot_control .y, .plot_control .z, .plot_control .rms').each(function () {
            const el = $(this);
            if (el.hasClass('x')) {
                rawDataTextElements.x.push(el);
            } else if (el.hasClass('y')) {
                rawDataTextElements.y.push(el);
            } else if (el.hasClass('z')) {
                rawDataTextElements.z.push(el);
            } else if (el.hasClass('rms')) {
                rawDataTextElements.rms.push(el);
            }
        });

        function loadScaleSelector(selectorValues, selectedValue) {
            $('.tab-motors select[name="scale"]').find('option').remove();

            $.each(selectorValues, function(key, val) {
                $('.tab-motors select[name="scale"]').append(new Option(key, val));
            });

            $('.tab-motors select[name="scale"]').val(selectedValue);
        }

        function selectRefresh(refreshValue){
            $('.tab-motors select[name="rate"]').val(refreshValue);
        }

        $('.tab-motors .sensor select').change(function(){
            TABS.motors.sensor = $('.tab-motors select[name="sensor_choice"]').val();
            setConfig({'motors_tab_sensor_settings': {'sensor': TABS.motors.sensor}});

            switch(TABS.motors.sensor){
            case "gyro":
                loadScaleSelector(TABS.motors.sensorSelectValues.gyroScale,
                        TABS.motors.sensorGyroScale);
                selectRefresh(TABS.motors.sensorGyroRate);
                break;
            case "accel":
                loadScaleSelector(TABS.motors.sensorSelectValues.accelScale,
                        TABS.motors.sensorAccelScale);
                selectRefresh(TABS.motors.sensorAccelRate);
                break;
            }

            $('.tab-motors .rate select:first').change();
        });

        $('.tab-motors .rate select, .tab-motors .scale select').change(function () {
            const rate = parseInt($('.tab-motors select[name="rate"]').val(), 10);
            const scale = parseFloat($('.tab-motors select[name="scale"]').val());

            GUI.interval_kill_all(['motor_and_status_pull','motors_power_data_pull_slow']);

            switch(TABS.motors.sensor) {
            case "gyro":
                setConfig({'motors_tab_gyro_settings': {'rate': rate, 'scale': scale}});
                TABS.motors.sensorGyroRate = rate;
                TABS.motors.sensorGyroScale = scale;

                gyroHelpers = initGraphHelpers('#graph', samplesGyro, [-scale, scale]);

                GUI.interval_add('IMU_pull', function imu_data_pull() {
                    MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, update_gyro_graph);
                }, rate, true);
                break;
            case "accel":
                setConfig({'motors_tab_accel_settings': {'rate': rate, 'scale': scale}});
                TABS.motors.sensorAccelRate = rate;
                TABS.motors.sensorAccelScale = scale;
                accelHelpers = initGraphHelpers('#graph', samplesAccel, [-scale, scale]);

                GUI.interval_add('IMU_pull', function imu_data_pull() {
                    MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, update_accel_graph);
                }, rate, true);
                break;
            }

            function update_accel_graph() {
                if (!accelOffsetEstablished) {
                    for (let i = 0; i < 3; i++) {
                        accelOffset[i] = FC.SENSOR_DATA.accelerometer[i] * -1;
                    }

                    accelOffsetEstablished = true;
                }

                const accelWithOffset = [
                    accelOffset[0] + FC.SENSOR_DATA.accelerometer[0],
                    accelOffset[1] + FC.SENSOR_DATA.accelerometer[1],
                    accelOffset[2] + FC.SENSOR_DATA.accelerometer[2],
                ];

                updateGraphHelperSize(accelHelpers);
                samplesAccel = addSampleToData(accelData, samplesAccel, accelWithOffset);
                drawGraph(accelHelpers, accelData, samplesAccel);
                for (let i = 0; i < 3; i++) {
                    if (Math.abs(accelWithOffset[i]) > Math.abs(accelMaxRead[i])) {
                        accelMaxRead[i] = accelWithOffset[i];
                    }
                }
                computeAndUpdate(accelWithOffset, accelData, accelMaxRead);

            }

            function update_gyro_graph() {
                const gyro = [
                    FC.SENSOR_DATA.gyroscope[0],
                    FC.SENSOR_DATA.gyroscope[1],
                    FC.SENSOR_DATA.gyroscope[2],
                ];

                updateGraphHelperSize(gyroHelpers);
                samplesGyro = addSampleToData(gyroData, samplesGyro, gyro);
                drawGraph(gyroHelpers, gyroData, samplesGyro);
                for (let i = 0; i < 3; i++) {
                    if (Math.abs(gyro[i]) > Math.abs(gyroMaxRead[i])) {
                        gyroMaxRead[i] = gyro[i];
                    }
                }
                computeAndUpdate(gyro, gyroData, gyroMaxRead);
            }

            function computeAndUpdate(sensor_data, data, max_read) {
                let sum = 0.0;
                for (let j = 0, jlength = data.length; j < jlength; j++) {
                    for (let k = 0, klength = data[j].length; k < klength; k++) {
                        sum += data[j][k][1]*data[j][k][1];
                    }
                }
                const rms = Math.sqrt(sum/(data[0].length+data[1].length+data[2].length));

                rawDataTextElements.x[0].text(`${sensor_data[0].toFixed(2)} ( ${max_read[0].toFixed(2)} )`);
                rawDataTextElements.y[0].text(`${sensor_data[1].toFixed(2)} ( ${max_read[1].toFixed(2)} )`);
                rawDataTextElements.z[0].text(`${sensor_data[2].toFixed(2)} ( ${max_read[2].toFixed(2)} )`);
                rawDataTextElements.rms[0].text(rms.toFixed(4));
            }
        });

        // set refresh speeds according to configuration saved in storage
        const result = getConfig(['motors_tab_sensor_settings', 'motors_tab_gyro_settings', 'motors_tab_accel_settings']);
        if (result.motors_tab_sensor_settings) {
            $('.tab-motors select[name="sensor_choice"]').val(result.motors_tab_sensor_settings.sensor);
        }

        if (result.motors_tab_gyro_settings) {
            TABS.motors.sensorGyroRate = result.motors_tab_gyro_settings.rate;
            TABS.motors.sensorGyroScale = result.motors_tab_gyro_settings.scale;
        }

        if (result.motors_tab_accel_settings) {
            TABS.motors.sensorAccelRate = result.motors_tab_accel_settings.rate;
            TABS.motors.sensorAccelScale = result.motors_tab_accel_settings.scale;
        }
        $('.tab-motors .sensor select:first').change();

        // Amperage
        function power_data_pull() {
            if (FC.ANALOG.last_received_timestamp) {
                motorVoltage.text(i18n.getMessage('motorsVoltageValue', [FC.ANALOG.voltage]));
                motorMahDrawingElement.text(i18n.getMessage('motorsADrawingValue', [FC.ANALOG.amperage.toFixed(2)]));
                motorMahDrawnElement.text(i18n.getMessage('motorsmAhDrawnValue', [FC.ANALOG.mAhdrawn]));
            }
        }

        GUI.interval_add('motors_power_data_pull_slow', power_data_pull, 250, true); // 4 fps

        $('a.reset_max').click(function () {
            gyroMaxRead = [0, 0, 0];
            accelMaxRead = [0, 0, 0];
            accelOffsetEstablished = false;
        });

        let rangeMin;
        let rangeMax;
        let neutral3d;
        if (self.escProtocolIsDshot) {
            rangeMin = self.DSHOT_DISARMED_VALUE;
            rangeMax = self.DSHOT_MAX_VALUE;
            neutral3d = self.DSHOT_3D_NEUTRAL;
        } else {
            rangeMin = FC.MOTOR_CONFIG.mincommand;
            rangeMax = FC.MOTOR_CONFIG.maxthrottle;
            //Arbitrary sanity checks
            //Note: values may need to be revisited
            neutral3d = (FC.MOTOR_3D_CONFIG.neutral > 1575 || FC.MOTOR_3D_CONFIG.neutral < 1425) ? 1500 : FC.MOTOR_3D_CONFIG.neutral;
        }

        let zeroThrottleValue = rangeMin;

        if (self.feature3DEnabled) {
            zeroThrottleValue = neutral3d;
        }

        const motorsWrapper = $('.motors .bar-wrapper');

        for (let i = 0; i < 8; i++) {
            motorsWrapper.append(`\
                <div class="m-block motor-${i}">\
                <div class="meter-bar">\
                <div class="label"></div>\
                <div class="indicator">\
                <div class="label">\
                <div class="label"></div>\
                </div>\
                </div>\
                </div>\
                </div>\
            `);
        }

        $('div.sliders input').prop('min', rangeMin)
        .prop('max', rangeMax);
        $('div.values li:not(:last)').text(rangeMin);

        const featuresElement = $('.tab-motors .features');
        FC.FEATURE_CONFIG.features.generateElements(featuresElement);

        /*
        *   ESC protocol
        */

        const escProtocols = EscProtocols.GetAvailableProtocols(FC.CONFIG.apiVersion);
        const escProtocolElement = $('select.escprotocol');

        for (let j = 0; j < escProtocols.length; j++) {
            escProtocolElement.append(`<option value="${j + 1}">${escProtocols[j]}</option>`);
        }

        escProtocolElement.sortSelect("DISABLED");

        const unsyncedPWMSwitchElement = $("input[id='unsyncedPWMSwitch']");
        const divUnsyncedPWMFreq = $('div.unsyncedpwmfreq');

        unsyncedPWMSwitchElement.on("change", function () {
            if ($(this).is(':checked')) {
                divUnsyncedPWMFreq.show();
            } else {
                divUnsyncedPWMFreq.hide();
            }
        });

        const dshotBidirElement = $('input[id="dshotBidir"]');

        unsyncedPWMSwitchElement.prop('checked', FC.PID_ADVANCED_CONFIG.use_unsyncedPwm !== 0).trigger("change");
        $('input[name="unsyncedpwmfreq"]').val(FC.PID_ADVANCED_CONFIG.motor_pwm_rate);
        $('input[name="digitalIdlePercent"]').val(FC.PID_ADVANCED_CONFIG.digitalIdlePercent);
        $('input[name="idleMinRpm"]').val(FC.ADVANCED_TUNING.idleMinRpm);

        dshotBidirElement.prop('checked', FC.MOTOR_CONFIG.use_dshot_telemetry).trigger("change");

        self.previousDshotBidir = FC.MOTOR_CONFIG.use_dshot_telemetry;
        self.previousFilterDynQ = FC.FILTER_CONFIG.dyn_notch_q;
        self.previousFilterDynCount = FC.FILTER_CONFIG.dyn_notch_count;

        dshotBidirElement.on("change", function () {
            const value = dshotBidirElement.is(':checked');
            const newValue = (value !== FC.MOTOR_CONFIG.use_dshot_telemetry) ? 'On' : 'Off';
            self.analyticsChanges['BidirectionalDshot'] = newValue;
            FC.MOTOR_CONFIG.use_dshot_telemetry = value;

            const rpmFilterIsDisabled = FC.FILTER_CONFIG.gyro_rpm_notch_harmonics === 0;
            FC.FILTER_CONFIG.dyn_notch_count = self.previousFilterDynCount;
            FC.FILTER_CONFIG.dyn_notch_q = self.previousFilterDynQ;

            const dialogDynFilterSettings = {
                title: i18n.getMessage("dialogDynFiltersChangeTitle"),
                text: i18n.getMessage("dialogDynFiltersChangeNote"),
                buttonYesText: i18n.getMessage("presetsWarningDialogYesButton"),
                buttonNoText: i18n.getMessage("presetsWarningDialogNoButton"),
                buttonYesCallback: () => _dynFilterChange(),
                buttonNoCallback: null,
            };

            const _dynFilterChange = function() {
                if (FC.MOTOR_CONFIG.use_dshot_telemetry && !self.previousDshotBidir) {
                    FC.FILTER_CONFIG.dyn_notch_count = FILTER_DEFAULT.dyn_notch_count_rpm;
                    FC.FILTER_CONFIG.dyn_notch_q = FILTER_DEFAULT.dyn_notch_q_rpm;
                } else if (!FC.MOTOR_CONFIG.use_dshot_telemetry && self.previousDshotBidir) {
                    FC.FILTER_CONFIG.dyn_notch_count = FILTER_DEFAULT.dyn_notch_count;
                    FC.FILTER_CONFIG.dyn_notch_q = FILTER_DEFAULT.dyn_notch_q;
                }
            };

            if ((FC.MOTOR_CONFIG.use_dshot_telemetry !== self.previousDshotBidir) && !(rpmFilterIsDisabled)) {
                GUI.showYesNoDialog(dialogDynFilterSettings);
            } else {
                FC.FILTER_CONFIG.dyn_notch_count = self.previousFilterDynCount;
                FC.FILTER_CONFIG.dyn_notch_q = self.previousFilterDynQ;
            }
        });

        $('input[name="motorPoles"]').val(FC.MOTOR_CONFIG.motor_poles);

        function updateVisibility() {
            // Hide unused settings
            const protocolName = $('select.escprotocol option:selected').text();
            const protocolConfigured = protocolName !== 'DISABLED';
            let digitalProtocol = false;
            switch (protocolName) {
                case 'DSHOT150':
                case 'DSHOT300':
                case 'DSHOT600':
                case 'PROSHOT1000':
                    digitalProtocol = true;

                    break;
                default:
            }

            const rpmFeaturesVisible = digitalProtocol && dshotBidirElement.is(':checked') || $("input[name='ESC_SENSOR']").is(':checked');

            $('div.minthrottle').toggle(protocolConfigured && !digitalProtocol);
            $('div.maxthrottle').toggle(protocolConfigured && !digitalProtocol);
            $('div.mincommand').toggle(protocolConfigured && !digitalProtocol);
            $('div.checkboxPwm').toggle(protocolConfigured && !digitalProtocol);
            divUnsyncedPWMFreq.toggle(protocolConfigured && !digitalProtocol);

            $('div.digitalIdlePercent').toggle(protocolConfigured && digitalProtocol);
            $('div.idleMinRpm').toggle(protocolConfigured && digitalProtocol && FC.MOTOR_CONFIG.use_dshot_telemetry);

            if (FC.ADVANCED_TUNING.idleMinRpm && FC.MOTOR_CONFIG.use_dshot_telemetry) {
                $('div.digitalIdlePercent').hide();
            }

            $('.escSensor').toggle(protocolConfigured && digitalProtocol);

            $('div.checkboxDshotBidir').toggle(protocolConfigured && digitalProtocol);
            $('div.motorPoles').toggle(protocolConfigured && rpmFeaturesVisible);

            $('.escMotorStop').toggle(protocolConfigured);

            $('#escProtocolDisabled').toggle(!protocolConfigured);

            //trigger change unsyncedPWMSwitch to show/hide Motor PWM freq input
            unsyncedPWMSwitchElement.trigger("change");
        }

        escProtocolElement.val(FC.PID_ADVANCED_CONFIG.fast_pwm_protocol + 1);

        escProtocolElement.on("change", function () {
            const escProtocolValue = parseInt($(this).val()) - 1;

            let newValue = undefined;
            if (escProtocolValue !== FC.PID_ADVANCED_CONFIG.fast_pwm_protocol) {
                newValue = $(this).find('option:selected').text();
            }
            self.analyticsChanges['EscProtocol'] = newValue;

            updateVisibility();
        }).trigger("change");

        //trigger change dshotBidir and ESC_SENSOR to show/hide Motor Poles tab
        dshotBidirElement.change(updateVisibility).trigger("change");
        $("input[name='ESC_SENSOR']").on("change", updateVisibility).trigger("change");

        // fill throttle
        $('input[name="minthrottle"]').val(FC.MOTOR_CONFIG.minthrottle);
        $('input[name="maxthrottle"]').val(FC.MOTOR_CONFIG.maxthrottle);
        $('input[name="mincommand"]').val(FC.MOTOR_CONFIG.mincommand);

        //fill 3D
        $('.tab-motors ._3d').show();
        $('input[name="_3ddeadbandlow"]').val(FC.MOTOR_3D_CONFIG.deadband3d_low);
        $('input[name="_3ddeadbandhigh"]').val(FC.MOTOR_3D_CONFIG.deadband3d_high);
        $('input[name="_3dneutral"]').val(FC.MOTOR_3D_CONFIG.neutral);

        /*
        * UI hooks
        */

       function checkUpdate3dControls() {
            if (FC.FEATURE_CONFIG.features.isEnabled('3D')) {
                $('._3dSettings').show();
            } else {
                $('._3dSettings').hide();
            }
        }

        $('input.feature', featuresElement).on("change", function () {
            const element = $(this);

            FC.FEATURE_CONFIG.features.updateData(element);
            updateTabList(FC.FEATURE_CONFIG.features);

            switch (element.attr('name')) {
                case 'MOTOR_STOP':
                    break;

                case '3D':
                    checkUpdate3dControls();
                    break;

                default:
                    break;
            }
        });

        $(featuresElement).filter('select').change(function () {
            const element = $(this);

            FC.FEATURE_CONFIG.features.updateData(element);
            updateTabList(FC.FEATURE_CONFIG.features);

        });

        checkUpdate3dControls();

        /*
        * MOTOR TESTING
        */

        function setSlidersDefault() {
            // change all values to default
            $('div.sliders input').val(zeroThrottleValue);
        }

        function setSlidersEnabled(isEnabled) {
            if (isEnabled && !self.armed) {
                $('div.sliders input').slice(0, self.numberOfValidOutputs).prop('disabled', false);

                // unlock master slider
                $('div.sliders input:last').prop('disabled', false);
            } else {
                setSlidersDefault();

                // disable sliders / min max
                $('div.sliders input').prop('disabled', true);
            }

            $('div.sliders input').trigger('input');
        }

        setSlidersDefault();

        const ignoreKeys = [
            'PageUp',
            'PageDown',
            'End',
            'Home',
            'ArrowUp',
            'ArrowDown',
            'AltLeft',
            'AltRight',
        ];

        motorsEnableTestModeElement.on('change', function () {
            let enabled = motorsEnableTestModeElement.is(':checked');
            // prevent or disable testing if configHasChanged flag is set.
            if (self.configHasChanged) {
                if (enabled) {
                    const message = i18n.getMessage('motorsDialogSettingsChanged');
                    showDialogSettingsChanged(message);
                    enabled = false;
                }
                // disable input
                motorsEnableTestModeElement.prop('checked', false);
            }

            function disableMotorTest(e) {
                if (motorsEnableTestModeElement.is(':checked')) {
                    if (!ignoreKeys.includes(e.code)) {
                        motorsEnableTestModeElement.prop('checked', false).trigger('change');
                        document.removeEventListener('keydown', evt => disableMotorTest(evt));
                    }
                }
            }

            if (enabled) {
                // Send enable extended dshot telemetry command
                const buffer = [];

                buffer.push8(DshotCommand.dshotCommandType_e.DSHOT_CMD_TYPE_BLOCKING);
                buffer.push8(255);  // Send to all escs
                buffer.push8(1);    // 1 command
                buffer.push8(13);   // Enable extended dshot telemetry

                MSP.send_message(MSPCodes.MSP2_SEND_DSHOT_COMMAND, buffer);

                document.addEventListener('keydown', e => disableMotorTest(e));
            }

            setContentButtons(enabled);
            setSlidersEnabled(enabled);

            $('div.sliders input').trigger('input');

            mspHelper.setArmingEnabled(enabled, enabled);
        });

        let bufferingSetMotor = [],
        buffer_delay = false;

        $('div.sliders input:not(.master)').on('input', function () {
            const index = $(this).index();
            let buffer = [];

            $('div.values li').eq(index).text($(this).val());

            for (let i = 0; i < self.numberOfValidOutputs; i++) {
                const val = parseInt($('div.sliders input').eq(i).val());
                buffer.push16(val);
            }

            bufferingSetMotor.push(buffer);

            if (!buffer_delay) {
                buffer_delay = setTimeout(function () {
                    buffer = bufferingSetMotor.pop();

                    MSP.send_message(MSPCodes.MSP_SET_MOTOR, buffer);

                    bufferingSetMotor = [];
                    buffer_delay = false;
                }, 10);
            }
        });

        $('div.sliders input:not(.master)').on('input wheel', function (e) {
            self.scrollSlider($(this), e);
        });

        $('div.sliders input.master').on('input', function () {
            const val = $(this).val();

            $('div.sliders input:not(:disabled, :last)').val(val);
            $('div.values li:not(:last)').slice(0, self.numberOfValidOutputs).text(val);
            $('div.sliders input:not(:last):first').trigger('input');
        });

        $('div.sliders input.master').on('input wheel', function (e) {
            self.scrollSlider($(this), e);
        });

        // check if motors are already spinning
        let motorsRunning = false;

        for (let i = 0; i < self.numberOfValidOutputs; i++) {
            if (!self.feature3DEnabled) {
                if (FC.MOTOR_DATA[i] > zeroThrottleValue) {
                    motorsRunning = true;
                }
            } else {
                if ((FC.MOTOR_DATA[i] < FC.MOTOR_3D_CONFIG.deadband3d_low) || (FC.MOTOR_DATA[i] > FC.MOTOR_3D_CONFIG.deadband3d_high)) {
                    motorsRunning = true;
                }
            }
        }

        if (motorsRunning) {
            motorsEnableTestModeElement.prop('checked', true).trigger('change');

            // motors are running adjust sliders to current values

            const sliders = $('div.sliders input:not(.master)');

            let masterValue = FC.MOTOR_DATA[0];
            for (let i = 0; i < FC.MOTOR_DATA.length; i++) {
                if (FC.MOTOR_DATA[i] > 0) {
                    sliders.eq(i).val(FC.MOTOR_DATA[i]);

                    if (masterValue !== FC.MOTOR_DATA[i]) {
                        masterValue = false;
                    }
                }
            }

            // only fire events when all values are set
            sliders.trigger('input');

            // slide master slider if condition is valid
            if (masterValue) {
                $('div.sliders input.master').val(masterValue)
                .trigger('input');
            }
        }

        // data pulling functions used inside interval timer

        function get_motor_data() {
            MSP.send_message(MSPCodes.MSP_MOTOR, false, false, get_motor_telemetry_data);
        }

        function get_motor_telemetry_data() {
            if (FC.MOTOR_CONFIG.use_dshot_telemetry || FC.MOTOR_CONFIG.use_esc_sensor) {
                MSP.send_message(MSPCodes.MSP_MOTOR_TELEMETRY, false, false, update_ui);
            } else {
                update_ui();
            }
        }

        function getMotorOutputs() {
            const motorData = [];
            const motorsTesting = motorsEnableTestModeElement.is(':checked');

            for (let i = 0; i < self.numberOfValidOutputs; i++) {
                motorData[i] = motorsTesting ? FC.MOTOR_DATA[i] : zeroThrottleValue;
            }

            return motorData;
        }

        const fullBlockScale = rangeMax - rangeMin;

        function update_ui() {
            const previousArmState = self.armed;
            const blockHeight = $('div.m-block:first').height();
            const motorValues = getMotorOutputs();
            const MAX_VALUE_SIZE = 6,
                AVG_RPM_ROUNDING = 100;
            let sumRpm = 0,
                isAllMotorValueEqual = motorValues.every((value, _index, arr) => value === arr[0]),
                hasTelemetryError = false;

            for (let i = 0; i < motorValues.length; i++) {
                const motorValue = motorValues[i];
                const barHeight = motorValue - rangeMin,
                marginTop = blockHeight - (barHeight * (blockHeight / fullBlockScale)).clamp(0, blockHeight),
                height = (barHeight * (blockHeight / fullBlockScale)).clamp(0, blockHeight),
                color = parseInt(barHeight * 0.009);

                $(`.motor-${i} .label`, motorsWrapper).text(motorValue);
                $(`.motor-${i} .indicator`, motorsWrapper).css({
                    'margin-top' : `${marginTop}px`,
                    'height' : `${height}px`,
                    'background-color' : `rgba(255,187,0,1.${color})`,
                });

                if (i < FC.MOTOR_CONFIG.motor_count && (FC.MOTOR_CONFIG.use_dshot_telemetry || FC.MOTOR_CONFIG.use_esc_sensor)) {

                    const MAX_INVALID_PERCENT = 100;

                    let rpmMotorValue = FC.MOTOR_TELEMETRY_DATA.rpm[i];

                    // Reduce the size of the value if too big
                    if (rpmMotorValue > 999999) {
                        rpmMotorValue = `${(rpmMotorValue / 1000000).toFixed(5 - (rpmMotorValue / 1000000).toFixed(0).toString().length)}M`;
                    }
                    if (isAllMotorValueEqual) {
                        sumRpm += Math.round(rpmMotorValue * AVG_RPM_ROUNDING) / AVG_RPM_ROUNDING;
                    }
                    rpmMotorValue = rpmMotorValue.toString().padStart(MAX_VALUE_SIZE);
                    let telemetryText = i18n.getMessage('motorsRPM', {motorsRpmValue: rpmMotorValue});

                    if (FC.MOTOR_CONFIG.use_dshot_telemetry) {

                        let invalidPercent = FC.MOTOR_TELEMETRY_DATA.invalidPercent[i];
                        hasTelemetryError = invalidPercent > MAX_INVALID_PERCENT;
                        let classError = hasTelemetryError ? "warning" : "";
                        invalidPercent = (invalidPercent / 100).toFixed(2).toString().padStart(MAX_VALUE_SIZE);

                        telemetryText += `<br><span class="${classError}">`;
                        telemetryText += i18n.getMessage('motorsRPMError', {motorsErrorValue: invalidPercent});
                        telemetryText += "</span>";
                    }

                    if (FC.MOTOR_CONFIG.use_dshot_telemetry || FC.MOTOR_CONFIG.use_esc_sensor) {

                        let escTemperature = FC.MOTOR_TELEMETRY_DATA.temperature[i];
                        escTemperature = escTemperature.toString().padStart(MAX_VALUE_SIZE);

                        telemetryText += "<br>";
                        telemetryText += i18n.getMessage('motorsESCTemperature', {motorsESCTempValue: escTemperature});
                    }

                    $(`.motor_testing .telemetry .motor-${i}`).html(telemetryText);
                }
            }

            if (FC.MOTOR_CONFIG.use_dshot_telemetry && !hasTelemetryError && isAllMotorValueEqual) {
                const avgRpm = (Math.round(sumRpm / motorValues.length * AVG_RPM_ROUNDING) / AVG_RPM_ROUNDING).toFixed(0),
                    avgRpmMotorValue = avgRpm.toString().padStart(MAX_VALUE_SIZE),
                    message = i18n.getMessage('motorsRPM', { motorsRpmValue: avgRpmMotorValue });
                $(`.motor_testing .telemetry .motor-master`).html(message);
            } else {
                $(`.motor_testing .telemetry .motor-master`).html("");
            }

            //keep the following here so at least we get a visual cue of our motor setup
            update_arm_status();

            if (previousArmState !== self.armed) {
                console.log('arm state change detected');

                motorsEnableTestModeElement.change();
            }
        }

        $('a.save').on('click', async function() {
            GUI.interval_kill_all(['motor_and_status_pull','motors_power_data_pull_slow']);

            // gather data that doesn't have automatic change event bound
            FC.MOTOR_CONFIG.minthrottle = parseInt($('input[name="minthrottle"]').val());
            FC.MOTOR_CONFIG.maxthrottle = parseInt($('input[name="maxthrottle"]').val());
            FC.MOTOR_CONFIG.mincommand = parseInt($('input[name="mincommand"]').val());

            FC.MOTOR_CONFIG.motor_poles = parseInt($('input[name="motorPoles"]').val());

            FC.MOTOR_3D_CONFIG.deadband3d_low = parseInt($('input[name="_3ddeadbandlow"]').val());
            FC.MOTOR_3D_CONFIG.deadband3d_high = parseInt($('input[name="_3ddeadbandhigh"]').val());
            FC.MOTOR_3D_CONFIG.neutral = parseInt($('input[name="_3dneutral"]').val());

            FC.PID_ADVANCED_CONFIG.fast_pwm_protocol = parseInt(escProtocolElement.val() - 1);
            FC.PID_ADVANCED_CONFIG.use_unsyncedPwm = unsyncedPWMSwitchElement.is(':checked') ? 1 : 0;
            FC.PID_ADVANCED_CONFIG.motor_pwm_rate = parseInt($('input[name="unsyncedpwmfreq"]').val());
            FC.PID_ADVANCED_CONFIG.digitalIdlePercent = parseFloat($('input[name="digitalIdlePercent"]').val());

            await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));
            await MSP.promise(MSPCodes.MSP_SET_MIXER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MIXER_CONFIG));
            await MSP.promise(MSPCodes.MSP_SET_MOTOR_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MOTOR_CONFIG));
            await MSP.promise(MSPCodes.MSP_SET_MOTOR_3D_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MOTOR_3D_CONFIG));
            await MSP.promise(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG));
            await MSP.promise(MSPCodes.MSP_SET_ARMING_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ARMING_CONFIG));

            await MSP.promise(MSPCodes.MSP_SET_FILTER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FILTER_CONFIG));

            tracking.sendSaveAndChangeEvents(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, self.analyticsChanges, 'motors');
            self.analyticsChanges = {};
            self.configHasChanged = false;

            mspHelper.writeConfiguration(true);
        });

        $('a.stop').on('click', () => motorsEnableTestModeElement.prop('checked', false).trigger('change'));

        // enable Status and Motor data pulling
        GUI.interval_add('motor_and_status_pull', get_motor_data, 50, true);

        setup_motor_output_reordering_dialog(SetupEscDshotDirectionDialogCallback, zeroThrottleValue);

        function SetupEscDshotDirectionDialogCallback() {
            SetupdescDshotDirectionDialog(content_ready, zeroThrottleValue);
        }

        function content_ready() {
            GUI.content_ready(callback);
        }

        content_ready();
    }

    function showDialogMixerReset(message) {
        const dialogMixerReset = $('#dialog-mixer-reset')[0];

        $('#dialog-mixer-reset-content').html(message);

        if (!dialogMixerReset.hasAttribute('open')) {
            dialogMixerReset.showModal();
            $('#dialog-mixer-reset-confirmbtn').click(function() {
                dialogMixerReset.close();
            });
        }
    }

    function showDialogSettingsChanged(message) {
        const dialogSettingsChanged = $('#dialog-settings-changed')[0];

        $('#dialog-settings-changed-content').html(message);

        if (!dialogSettingsChanged.hasAttribute('open')) {
            dialogSettingsChanged.showModal();
            $('#dialog-settings-reset-confirmbtn').click(function() {
                TABS.motors.refresh();
            });
            $('#dialog-settings-changed-confirmbtn').click(function() {
                dialogSettingsChanged.close();
            });
        }
    }

    function setup_motor_output_reordering_dialog(callbackFunction, zeroThrottleValue)
    {
        const domDialogMotorOutputReorder = $('#dialogMotorOutputReorder');
        const idleThrottleValue = zeroThrottleValue + 60;

        const motorOutputReorderComponent = new MotorOutputReorderComponent($('#dialogMotorOutputReorderContent'),
            callbackFunction, mixerList[FC.MIXER_CONFIG.mixer - 1].name,
            zeroThrottleValue, idleThrottleValue);

        $('#dialogMotorOutputReorder-closebtn').click(closeDialogMotorOutputReorder);

        function closeDialogMotorOutputReorder()
        {
            domDialogMotorOutputReorder[0].close();
            motorOutputReorderComponent.close();
            $(document).off("keydown", onDocumentKeyPress);
        }

        function onDocumentKeyPress(event)
        {
            if (27 === event.which) {
                closeDialogMotorOutputReorder();
            }
        }

        $('#motorOutputReorderDialogOpen').click(function()
        {
            $(document).on("keydown", onDocumentKeyPress);
            domDialogMotorOutputReorder[0].showModal();
        });
    }

    function SetupdescDshotDirectionDialog(callbackFunction, zeroThrottleValue)
    {
        const domEscDshotDirectionDialog = $('#escDshotDirectionDialog');

        const idleThrottleValue = zeroThrottleValue + 60;

        const motorConfig = {
            numberOfMotors: self.numberOfValidOutputs,
            motorStopValue: zeroThrottleValue,
            motorSpinValue: idleThrottleValue,
            escProtocolIsDshot: self.escProtocolIsDshot,
        };

        const escDshotDirectionComponent = new EscDshotDirectionComponent(
            $('#escDshotDirectionDialog-Content'), callbackFunction, motorConfig);

        $('#escDshotDirectionDialog-closebtn').on("click", closeEscDshotDirectionDialog);

        function closeEscDshotDirectionDialog()
        {
            domEscDshotDirectionDialog[0].close();
            escDshotDirectionComponent.close();
            $(document).off("keydown", onDocumentKeyPress);
        }

        function onDocumentKeyPress(event)
        {
            if (27 === event.which) {
                closeEscDshotDirectionDialog();
            }
        }

        $('#escDshotDirectionDialog-Open').click(function()
        {
            $(document).on("keydown", onDocumentKeyPress);
            domEscDshotDirectionDialog[0].showModal();
        });

        callbackFunction();
    }
};

motors.refresh = function (callback) {
    const self = this;

    GUI.tab_switch_cleanup(function() {
        self.initialize();

        if (callback) {
            callback();
        }
    });
};

motors.cleanup = function (callback) {
    if (callback) callback();
};

motors.scrollSlider = function(slider, e) {
    if (slider.prop('disabled')) {
        return;
    }

    if (!(e.originalEvent?.deltaY && e.originalEvent?.altKey)) {
        return;
    }

    e.preventDefault();

    const step = 25;
    const delta = e.originalEvent.deltaY > 0 ? -step : step;
    const val = parseInt(slider.val()) + delta;
    const roundedVal = Math.round(val / step) * step;
    slider.val(roundedVal);
    slider.trigger('input');
};

TABS.motors = motors;
export {
    motors,
};
