'use strict';

TABS.motors = {
        feature3DEnabled: false,
        escProtocolIsDshot: false,
        sensor: "gyro",
        sensorGyroRate: 20,
        sensorGyroScale: 2000,
        sensorAccelRate: 20,
        sensorAccelScale: 2,
        sensorSelectValues: {
            "gyroScale": {"10" : 10, 
                          "25" : 25, 
                          "50" : 50, 
                          "100" : 100, 
                          "200" : 200, 
                          "300" : 300, 
                          "400" : 400,
                          "500" : 500,
                          "1000" : 1000,
                          "2000" : 2000},
            "accelScale": {"0.05" : 0.05,
                           "0.1" : 0.1,
                           "0.2" : 0.2,
                           "0.3" : 0.3,
                           "0.4" : 0.4,
                           "0.5" : 0.5,
                           "1" : 1,
                           "2" : 2}
        },
        // These are translated into proper Dshot values on the flight controller
        DSHOT_DISARMED_VALUE: 1000,
        DSHOT_MAX_VALUE: 2000,
        DSHOT_3D_NEUTRAL: 1500
};

TABS.motors.initialize = function (callback) {
    var self = this;

    self.armed = false;
    self.escProtocolIsDshot = false;

    if (GUI.active_tab != 'motors') {
        GUI.active_tab = 'motors';
    }

    function get_arm_status() {
        MSP.send_message(MSPCodes.MSP_STATUS, false, false, load_feature_config);
    }

    function load_feature_config() {
        MSP.send_message(MSPCodes.MSP_FEATURE_CONFIG, false, false, load_motor_3d_config);
    }

    function load_motor_3d_config() {
        MSP.send_message(MSPCodes.MSP_MOTOR_3D_CONFIG, false, false, load_esc_protocol);
    }

    function load_esc_protocol() {
        MSP.send_message(MSPCodes.MSP_ADVANCED_CONFIG, false, false, load_motor_data);
    }

    function load_motor_data() {
        MSP.send_message(MSPCodes.MSP_MOTOR, false, false, load_motor_telemetry_data);
    }

    function load_motor_telemetry_data() {
        if (MOTOR_CONFIG.use_dshot_telemetry || MOTOR_CONFIG.use_esc_sensor) {
            MSP.send_message(MSPCodes.MSP_MOTOR_TELEMETRY, false, false, load_mixer_config);
        } else {
            load_mixer_config();
        }
    }

    function load_mixer_config() {
        MSP.send_message(MSPCodes.MSP_MIXER_CONFIG, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/motors.html", process_html);
    }

    // Get information from Betaflight
    if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
        // BF 3.2.0+
        MSP.send_message(MSPCodes.MSP_MOTOR_CONFIG, false, false, get_arm_status);
    } else {
        // BF 3.1.x or older
        MSP.send_message(MSPCodes.MSP_MISC, false, false, get_arm_status);
    }

    function update_arm_status() {
        self.armed = bit_check(CONFIG.mode, 0);
    }

    function initSensorData() {
        for (var i = 0; i < 3; i++) {
            SENSOR_DATA.accelerometer[i] = 0;
            SENSOR_DATA.gyroscope[i] = 0;
        }
    }

    function initDataArray(length) {
        var data = new Array(length);
        for (var i = 0; i < length; i++) {
            data[i] = [];
            data[i].min = -1;
            data[i].max = 1;
        }
        return data;
    }

    function addSampleToData(data, sampleNumber, sensorData) {
        for (var i = 0; i < data.length; i++) {
            var dataPoint = sensorData[i];
            data[i].push([sampleNumber, dataPoint]);
            if (dataPoint < data[i].min) {
                data[i].min = dataPoint;
            }
            if (dataPoint > data[i].max) {
                data[i].max = dataPoint;
            }
        }
        while (data[0].length > 300) {
            for (i = 0; i < data.length; i++) {
                data[i].shift();
            }
        }
        return sampleNumber + 1;
    }

    var margin = {top: 20, right: 30, bottom: 10, left: 20};
    function updateGraphHelperSize(helpers) {
        helpers.width = helpers.targetElement.width() - margin.left - margin.right;
        helpers.height = helpers.targetElement.height() - margin.top - margin.bottom;

        helpers.widthScale.range([0, helpers.width]);
        helpers.heightScale.range([helpers.height, 0]);

        helpers.xGrid.tickSize(-helpers.height, 0, 0);
        helpers.yGrid.tickSize(-helpers.width, 0, 0);
    }

    function initGraphHelpers(selector, sampleNumber, heightDomain) {
        var helpers = {selector: selector, targetElement: $(selector), dynamicHeightDomain: !heightDomain};

        helpers.widthScale = d3.scale.linear()
        .clamp(true)
        .domain([(sampleNumber - 299), sampleNumber]);

        helpers.heightScale = d3.scale.linear()
        .clamp(true)
        .domain(heightDomain || [1, -1]);

        helpers.xGrid = d3.svg.axis();
        helpers.yGrid = d3.svg.axis();

        updateGraphHelperSize(helpers);

        helpers.xGrid
        .scale(helpers.widthScale)
        .orient("bottom")
        .ticks(5)
        .tickFormat("");

        helpers.yGrid
        .scale(helpers.heightScale)
        .orient("left")
        .ticks(5)
        .tickFormat("");

        helpers.xAxis = d3.svg.axis()
        .scale(helpers.widthScale)
        .ticks(5)
        .orient("bottom")
        .tickFormat(function (d) {return d;});

        helpers.yAxis = d3.svg.axis()
        .scale(helpers.heightScale)
        .ticks(5)
        .orient("left")
        .tickFormat(function (d) {return d;});

        helpers.line = d3.svg.line()
        .x(function (d) { return helpers.widthScale(d[0]); })
        .y(function (d) { return helpers.heightScale(d[1]); });

        return helpers;
    }

    function drawGraph(graphHelpers, data, sampleNumber) {

        var svg = d3.select(graphHelpers.selector);

        if (graphHelpers.dynamicHeightDomain) {
            var limits = [];
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

        var group = svg.select("g.data");
        var lines = group.selectAll("path").data(data, function (d, i) {return i;});

        lines.enter().append("path").attr("class", "line");
        lines.attr('d', graphHelpers.line);
    }

    function update_model(mixer) {
        var reverse = "";

        if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
            reverse = MIXER_CONFIG.reverseMotorDir ? "_reversed" : "";
        }

        $('.mixerPreview img').attr('src', './resources/motor_order/' + mixerList[mixer - 1].image + reverse + '.svg');
    }

    function process_html() {
        // translate to user-selected language
        i18n.localizePage();

        update_arm_status();

        self.feature3DEnabled = FEATURE_CONFIG.features.isEnabled('3D');

        if (PID_ADVANCED_CONFIG.fast_pwm_protocol >= TABS.configuration.DSHOT_PROTOCOL_MIN_VALUE) {
            self.escProtocolIsDshot = true;
        } else {
            self.escProtocolIsDshot = false;
        }

        $('#motorsEnableTestMode').prop('checked', false);

        if (semver.lt(CONFIG.apiVersion, "1.42.0") || !(MOTOR_CONFIG.use_dshot_telemetry || MOTOR_CONFIG.use_esc_sensor)) {
            $(".motor_testing .telemetry").hide();
        } else {
            // Hide telemetry from unused motors (to hide the tooltip in an empty blank space)
            for (let i = MOTOR_CONFIG.motor_count; i < MOTOR_DATA.length; i++) {
                $(".motor_testing .telemetry .motor-" + i).hide();
            }
        }

        update_model(MIXER_CONFIG.mixer);

        // Always start with default/empty sensor data array, clean slate all
        initSensorData();

        // Setup variables
        var samples_gyro_i = 0,
        gyro_data = initDataArray(3),
        gyro_helpers = initGraphHelpers('#graph', samples_gyro_i, [-2, 2]),
        gyro_max_read = [0, 0, 0];

        var samples_accel_i = 0,
        accel_data = initDataArray(3),
        accel_helpers = initGraphHelpers('#graph', samples_accel_i, [-2, 2]),
        accel_max_read = [0, 0, 0],
        accel_offset = [0, 0, 0],
        accel_offset_established = false;

        // cached elements
        var motor_voltage_e = $('.motors-bat-voltage'),
            motor_mah_drawing_e = $('.motors-bat-mah-drawing'),
            motor_mah_drawn_e = $('.motors-bat-mah-drawn');
            

        var raw_data_text_ements = {
                x: [],
                y: [],
                z: [],
                rms: []
        };

        $('.plot_control .x, .plot_control .y, .plot_control .z, .plot_control .rms').each(function () {
            var el = $(this);
            if (el.hasClass('x')) {
                raw_data_text_ements.x.push(el);
            } else if (el.hasClass('y')) {
                raw_data_text_ements.y.push(el);
            } else if (el.hasClass('z')) {
                raw_data_text_ements.z.push(el);
            } else if (el.hasClass('rms')) {
                raw_data_text_ements.rms.push(el);
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
            TABS.motors.sensor = $('.tab-motors select[name="sensor_choice"]').val()
            ConfigStorage.set({'motors_tab_sensor_settings': {'sensor': TABS.motors.sensor}});

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
            var rate = parseInt($('.tab-motors select[name="rate"]').val(), 10);
            var scale = parseFloat($('.tab-motors select[name="scale"]').val());

            GUI.interval_kill_all(['motor_and_status_pull','motors_power_data_pull_slow']);

            switch(TABS.motors.sensor) {
            case "gyro":
                ConfigStorage.set({'motors_tab_gyro_settings': {'rate': rate, 'scale': scale}});
                TABS.motors.sensorGyroRate = rate;
                TABS.motors.sensorGyroScale = scale;

                gyro_helpers = initGraphHelpers('#graph', samples_gyro_i, [-scale, scale]);

                GUI.interval_add('IMU_pull', function imu_data_pull() {
                    MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, update_gyro_graph);
                }, rate, true);
                break;
            case "accel":
                ConfigStorage.set({'motors_tab_accel_settings': {'rate': rate, 'scale': scale}});
                TABS.motors.sensorAccelRate = rate;
                TABS.motors.sensorAccelScale = scale;
                accel_helpers = initGraphHelpers('#graph', samples_accel_i, [-scale, scale]);

                GUI.interval_add('IMU_pull', function imu_data_pull() {
                    MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, update_accel_graph);
                }, rate, true);
                break;
            }

            function update_accel_graph() {
                if (!accel_offset_established) {
                    for (var i = 0; i < 3; i++) {
                        accel_offset[i] = SENSOR_DATA.accelerometer[i] * -1;
                    }

                    accel_offset_established = true;
                }

                var accel_with_offset = [
                    accel_offset[0] + SENSOR_DATA.accelerometer[0],
                    accel_offset[1] + SENSOR_DATA.accelerometer[1],
                    accel_offset[2] + SENSOR_DATA.accelerometer[2]
                    ];

                updateGraphHelperSize(accel_helpers);
                samples_accel_i = addSampleToData(accel_data, samples_accel_i, accel_with_offset);
                drawGraph(accel_helpers, accel_data, samples_accel_i);
                for (var i = 0; i < 3; i++) {
                    if (Math.abs(accel_with_offset[i]) > Math.abs(accel_max_read[i])) accel_max_read[i] = accel_with_offset[i];
                }
                computeAndUpdate(accel_with_offset, accel_data, accel_max_read);

            }

            function update_gyro_graph() {
                var gyro = [
                    SENSOR_DATA.gyroscope[0],
                    SENSOR_DATA.gyroscope[1],
                    SENSOR_DATA.gyroscope[2]
                    ];

                updateGraphHelperSize(gyro_helpers);
                samples_gyro_i = addSampleToData(gyro_data, samples_gyro_i, gyro);
                drawGraph(gyro_helpers, gyro_data, samples_gyro_i);
                for (var i = 0; i < 3; i++) {
                    if (Math.abs(gyro[i]) > Math.abs(gyro_max_read[i])) gyro_max_read[i] = gyro[i];
                }
                computeAndUpdate(gyro, gyro_data, gyro_max_read);
            }

            function computeAndUpdate(sensor_data, data, max_read) {
                var sum = 0.0;
                for (var j = 0, jlength = data.length; j < jlength; j++) {
                    for (var k = 0, klength = data[j].length; k < klength; k++){
                        sum += data[j][k][1]*data[j][k][1];
                    }
                }
                var rms = Math.sqrt(sum/(data[0].length+data[1].length+data[2].length));

                raw_data_text_ements.x[0].text(sensor_data[0].toFixed(2) + ' (' + max_read[0].toFixed(2) + ')');
                raw_data_text_ements.y[0].text(sensor_data[1].toFixed(2) + ' (' + max_read[1].toFixed(2) + ')');
                raw_data_text_ements.z[0].text(sensor_data[2].toFixed(2) + ' (' + max_read[2].toFixed(2) + ')');
                raw_data_text_ements.rms[0].text(rms.toFixed(4));
            }
        });


        // set refresh speeds according to configuration saved in storage
        ConfigStorage.get(['motors_tab_sensor_settings', 'motors_tab_gyro_settings', 'motors_tab_accel_settings'], function (result) {
            if (result.motors_tab_sensor_settings) {
                var sensor = result.motors_tab_sensor_settings.sensor;
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
        });


        // Amperage
        function power_data_pull() {
            motor_voltage_e.text(i18n.getMessage('motorsVoltageValue', [ANALOG.voltage]));
            motor_mah_drawing_e.text(i18n.getMessage('motorsADrawingValue', [ANALOG.amperage.toFixed(2)]));
            motor_mah_drawn_e.text(i18n.getMessage('motorsmAhDrawnValue', [ANALOG.mAhdrawn]));
            
        }
        GUI.interval_add('motors_power_data_pull_slow', power_data_pull, 250, true); // 4 fps

        $('a.reset_max').click(function () {
            gyro_max_read = [0, 0, 0];
            accel_max_read = [0, 0, 0];
            accel_offset_established = false;
        });

        var number_of_valid_outputs = (MOTOR_DATA.indexOf(0) > -1) ? MOTOR_DATA.indexOf(0) : 8;
        var rangeMin;
        var rangeMax;
        var neutral3d;
        if (self.escProtocolIsDshot) {
            rangeMin = self.DSHOT_DISARMED_VALUE;
            rangeMax = self.DSHOT_MAX_VALUE;
            neutral3d = self.DSHOT_3D_NEUTRAL;
        } else {
            rangeMin = MOTOR_CONFIG.mincommand;
            rangeMax = MOTOR_CONFIG.maxthrottle;
            //Arbitrary sanity checks
            //Note: values may need to be revisited
            neutral3d = (MOTOR_3D_CONFIG.neutral > 1575 || MOTOR_3D_CONFIG.neutral < 1425) ? 1500 : MOTOR_3D_CONFIG.neutral;
        }

        var motors_wrapper = $('.motors .bar-wrapper'),
            servos_wrapper = $('.servos .bar-wrapper');

        for (var i = 0; i < 8; i++) {
            motors_wrapper.append('\
                    <div class="m-block motor-' + i + '">\
                    <div class="meter-bar">\
                    <div class="label"></div>\
                    <div class="indicator">\
                    <div class="label">\
                    <div class="label"></div>\
                    </div>\
                    </div>\
                    </div>\
                    </div>\
            ');

            servos_wrapper.append('\
                    <div class="m-block servo-' + (7 - i) + '">\
                    <div class="meter-bar">\
                    <div class="label"></div>\
                    <div class="indicator">\
                    <div class="label">\
                    <div class="label"></div>\
                    </div>\
                    </div>\
                    </div>\
                    </div>\
            ');
        }

        $('div.sliders input').prop('min', rangeMin)
        .prop('max', rangeMax);
        $('div.values li:not(:last)').text(rangeMin);

        // UI hooks
        function setSlidersDefault() {
            // change all values to default
            if (self.feature3DEnabled) {
                $('div.sliders input').val(neutral3d);
            } else {
                $('div.sliders input').val(rangeMin);
            }
        }

        function setSlidersEnabled(isEnabled) {
            if (isEnabled && !self.armed) {
                $('div.sliders input').slice(0, number_of_valid_outputs).prop('disabled', false);

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

        $('#motorsEnableTestMode').change(function () {
            var enabled = $(this).is(':checked');

            setSlidersEnabled(enabled);

            $('div.sliders input').trigger('input');

            mspHelper.setArmingEnabled(enabled, enabled);
        }).change();

        var buffering_set_motor = [],
        buffer_delay = false;
        $('div.sliders input:not(.master)').on('input', function () {
            var index = $(this).index(),
            buffer = [];

            $('div.values li').eq(index).text($(this).val());

            for (var i = 0; i < 8; i++) {
                var val = parseInt($('div.sliders input').eq(i).val());
                buffer.push16(val);
            }

            buffering_set_motor.push(buffer);

            if (!buffer_delay) {
                buffer_delay = setTimeout(function () {
                    buffer = buffering_set_motor.pop();

                    MSP.send_message(MSPCodes.MSP_SET_MOTOR, buffer);

                    buffering_set_motor = [];
                    buffer_delay = false;
                }, 10);
            }
        });

        $('div.sliders input.master').on('input', function () {
            var val = $(this).val();

            $('div.sliders input:not(:disabled, :last)').val(val);
            $('div.values li:not(:last)').slice(0, number_of_valid_outputs).text(val);
            $('div.sliders input:not(:last):first').trigger('input');
        });

        // check if motors are already spinning
        var motors_running = false;

        for (var i = 0; i < number_of_valid_outputs; i++) {
            if (!self.feature3DEnabled) {
                if (MOTOR_DATA[i] > rangeMin) {
                    motors_running = true;
                }
            } else {
                if ((MOTOR_DATA[i] < MOTOR_3D_CONFIG.deadband3d_low) || (MOTOR_DATA[i] > MOTOR_3D_CONFIG.deadband3d_high)) {
                    motors_running = true;
                }
            }
        }

        if (motors_running) {
            $('#motorsEnableTestMode').prop('checked', true).change();

            // motors are running adjust sliders to current values

            var sliders = $('div.sliders input:not(.master)');

            var master_value = MOTOR_DATA[0];
            for (var i = 0; i < MOTOR_DATA.length; i++) {
                if (MOTOR_DATA[i] > 0) {
                    sliders.eq(i).val(MOTOR_DATA[i]);

                    if (master_value != MOTOR_DATA[i]) {
                        master_value = false;
                    }
                }
            }

            // only fire events when all values are set
            sliders.trigger('input');

            // slide master slider if condition is valid
            if (master_value) {
                $('div.sliders input.master').val(master_value)
                .trigger('input');
            }
        }

        // data pulling functions used inside interval timer

        function get_status() {
            // status needed for arming flag
            MSP.send_message(MSPCodes.MSP_STATUS, false, false, get_motor_data);
        }

        function get_motor_data() {
            MSP.send_message(MSPCodes.MSP_MOTOR, false, false, get_motor_telemetry_data);
        }

        function get_motor_telemetry_data() {
            if (MOTOR_CONFIG.use_dshot_telemetry || MOTOR_CONFIG.use_esc_sensor) {
                MSP.send_message(MSPCodes.MSP_MOTOR_TELEMETRY, false, false, get_servo_data);
            } else {
                get_servo_data();
            }
        }

        function get_servo_data() {
            MSP.send_message(MSPCodes.MSP_SERVO, false, false, update_ui);
        }

        var full_block_scale = rangeMax - rangeMin;

        function update_ui() {
            var previousArmState = self.armed;
            var block_height = $('div.m-block:first').height();

            for (var i = 0; i < MOTOR_DATA.length; i++) {
                var motorValue = MOTOR_DATA[i];
                var barHeight = motorValue - rangeMin,
                margin_top = block_height - (barHeight * (block_height / full_block_scale)).clamp(0, block_height),
                height = (barHeight * (block_height / full_block_scale)).clamp(0, block_height),
                color = parseInt(barHeight * 0.009);

                $('.motor-' + i + ' .label', motors_wrapper).text(motorValue);
                $('.motor-' + i + ' .indicator', motors_wrapper).css({
                    'margin-top' : margin_top + 'px',
                    'height' : height + 'px',
                    'background-color' : 'rgba(255,187,0,1.'+ color +')'
                });

                if (i < MOTOR_CONFIG.motor_count && (MOTOR_CONFIG.use_dshot_telemetry || MOTOR_CONFIG.use_esc_sensor)) {

                    const MAX_INVALID_PERCENT = 100,
                          MAX_VALUE_SIZE = 6;

                    let rpmMotorValue = MOTOR_TELEMETRY_DATA.rpm[i];

                    // Reduce the size of the value if too big
                    if (rpmMotorValue > 999999) {
                        rpmMotorValue = (rpmMotorValue / 1000000).toFixed(5 - (rpmMotorValue / 1000000).toFixed(0).toString().length) + "M";  
                    }

                    rpmMotorValue = rpmMotorValue.toString().padStart(MAX_VALUE_SIZE);
                    let telemetryText = i18n.getMessage('motorsRPM', {motorsRpmValue: rpmMotorValue});

                    
                    if (MOTOR_CONFIG.use_dshot_telemetry) {

                        let invalidPercent = MOTOR_TELEMETRY_DATA.invalidPercent[i];

                        let classError = (invalidPercent > MAX_INVALID_PERCENT) ? "warning" : "";
                        invalidPercent = (invalidPercent / 100).toFixed(2).toString().padStart(MAX_VALUE_SIZE);

                        telemetryText += "<br><span class='" + classError + "'>";
                        telemetryText += i18n.getMessage('motorsRPMError', {motorsErrorValue: invalidPercent});
                        telemetryText += "</span>";
                    }

                    if (MOTOR_CONFIG.use_esc_sensor) {

                        let escTemperature = MOTOR_TELEMETRY_DATA.temperature[i];

                        telemetryText += "<br>";
                        escTemperature = escTemperature.toString().padStart(MAX_VALUE_SIZE);
                        telemetryText += i18n.getMessage('motorsESCTemperature', {motorsESCTempValue: escTemperature});
                    }

                    $('.motor_testing .telemetry .motor-' + i).html(telemetryText);
                }
                

            }

            // servo indicators are still using old (not flexible block scale), it will be changed in the future accordingly
            for (var i = 0; i < SERVO_DATA.length; i++) {
                var data = SERVO_DATA[i] - 1000,
                margin_top = block_height - (data * (block_height / 1000)).clamp(0, block_height),
                height = (data * (block_height / 1000)).clamp(0, block_height),
                color = parseInt(data * 0.009);

                $('.servo-' + i + ' .label', servos_wrapper).text(SERVO_DATA[i]);
                $('.servo-' + i + ' .indicator', servos_wrapper).css({'margin-top' : margin_top + 'px', 'height' : height + 'px', 'background-color' : 'rgba(255,187,0,1'+ color +')'});
            }
            //keep the following here so at least we get a visual cue of our motor setup
            update_arm_status();

            if (previousArmState != self.armed) {
                console.log('arm state change detected');

                $('#motorsEnableTestMode').change();
            }
        }

        // enable Status and Motor data pulling
        GUI.interval_add('motor_and_status_pull', get_status, 50, true);

        GUI.content_ready(callback);
    }
};

TABS.motors.cleanup = function (callback) {
    if (callback) callback();
};
