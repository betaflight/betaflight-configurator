import { i18n } from "../localization";
import GUI, { TABS } from '../gui';
import { get as getConfig, set as setConfig } from '../ConfigStorage';
import { have_sensor } from "../sensor_helpers";
import FC from "../fc";
import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import serial from "../serial";
import * as d3 from 'd3';
import $ from 'jquery';
import semver from 'semver';
import { API_VERSION_1_46 } from "../data_storage";

const sensors = {};
sensors.initialize = function (callback) {

    if (GUI.active_tab != 'sensors') {
        GUI.active_tab = 'sensors';
    }

    function initSensorData(){
        for (let i = 0; i < 3; i++) {
            FC.SENSOR_DATA.accelerometer[i] = 0;
            FC.SENSOR_DATA.gyroscope[i] = 0;
            FC.SENSOR_DATA.magnetometer[i] = 0;
            FC.SENSOR_DATA.sonar = 0;
            FC.SENSOR_DATA.altitude = 0;
        }

        for (let i = 0; i < sensors.debugColumns; i++) {
            FC.SENSOR_DATA.debug[i] = 0;
        }
    }

    function initDataArray(length) {
        const data = new Array(length);
        for (let i = 0; i < length; i++) {
            data[i] = new Array();
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
            for (let i = 0; i < data.length; i++) {
                data[i].shift();
            }
        }
        return sampleNumber + 1;
    }

    const margin = {top: 20, right: 10, bottom: 10, left: 40};
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
            .ticks(5)
            .tickFormat("");

        helpers.yGrid
            .scale(helpers.heightScale)
            .ticks(5)
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
            .x(function (d) {return helpers.widthScale(d[0]);})
            .y(function (d) {return helpers.heightScale(d[1]);});

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
        const lines = group.selectAll("path").data(data, function (d, i) {return i;});
        lines.enter().append("path").attr("class", "line");
        lines.attr('d', graphHelpers.line);
    }

    function plot_gyro(enable) {
        if (enable) {
            $('.wrapper.gyro').show();
        } else {
            $('.wrapper.gyro').hide();
        }
    }

    function plot_accel(enable) {
        if (enable) {
            $('.wrapper.accel').show();
        } else {
            $('.wrapper.accel').hide();
        }
    }

    function plot_mag(enable) {
        if (enable) {
            $('.wrapper.mag').show();
        } else {
            $('.wrapper.mag').hide();
        }
    }

    function plot_altitude(enable) {
        if (enable) {
            $('.wrapper.altitude').show();
        } else {
            $('.wrapper.altitude').hide();
        }
    }

    function plot_sonar(enable) {
        if (enable) {
            $('.wrapper.sonar').show();
        } else {
            $('.wrapper.sonar').hide();
        }
    }

    function plot_debug(enable) {
        if (enable) {
            $('.wrapper.debug').show();
        } else {
            $('.wrapper.debug').hide();
        }
    }

    function displayDebugColumnNames() {
        const debugModes = [
            {text: "NONE"},
            {text: "CYCLETIME"},
            {text: "BATTERY"},
            {text: "GYRO_FILTERED"},
            {text: "ACCELEROMETER"},
            {text: "PIDLOOP"},
            {text: "GYRO_SCALED"},
            {text: "RC_INTERPOLATION"},
            {text: "ANGLERATE"},
            {text: "ESC_SENSOR"},
            {text: "SCHEDULER"},
            {text: "STACK"},
            {text: "ESC_SENSOR_RPM"},
            {text: "ESC_SENSOR_TMP"},
            {text: "ALTITUDE"},
            {text: "FFT"},
            {text: "FFT_TIME"},
            {text: "FFT_FREQ"},
            {text: "RX_FRSKY_SPI"},
            {text: "RX_SFHSS_SPI"},
            {text: "GYRO_RAW"},
            {text: "DUAL_GYRO_RAW"},
            {text: "DUAL_GYRO_DIFF"},
            {text: "MAX7456_SIGNAL"},
            {text: "MAX7456_SPICLOCK"},
            {text: "SBUS"},
            {text: "FPORT"},
            {text: "RANGEFINDER"},
            {text: "RANGEFINDER_QUALITY"},
            {text: "LIDAR_TF"},
            {text: "ADC_INTERNAL"},
            {text: "RUNAWAY_TAKEOFF"},
            {text: "SDIO"},
            {text: "CURRENT_SENSOR"},
            {text: "USB"},
            {text: "SMARTAUDIO"},
            {text: "RTH"},
            {text: "ITERM_RELAX"},
            {text: "ACRO_TRAINER"},
            {text: "RC_SMOOTHING"},
            {text: "RX_SIGNAL_LOSS"},
            {text: "RC_SMOOTHING_RATE"},
            {text: "ANTI_GRAVITY"},
            {text: "DYN_LPF"},
            {text: "RX_SPEKTRUM_SPI"},
            {text: "DSHOT_RPM_TELEMETRY"},
            {text: "RPM_FILTER"},
            {text: "D_MIN"},
            {text: "AC_CORRECTION"},
            {text: "AC_ERROR"},
            {text: "DUAL_GYRO_SCALED"},
            {text: "DSHOT_RPM_ERRORS"},
            {text: "CRSF_LINK_STATISTICS_UPLINK"},
            {text: "CRSF_LINK_STATISTICS_PWR"},
            {text: "CRSF_LINK_STATISTICS_DOWN"},
            {text: "BARO"},
            {text: "GPS_RESCUE_THROTTLE_PID"},
            {text: "DYN_IDLE"},
            {text: "FEEDFORWARD_LIMIT"},
            {text: "FEEDFORWARD"},
            {text: "BLACKBOX_OUTPUT"},
            {text: "GYRO_SAMPLE"},
            {text: "RX_TIMING"},
            {text: "D_LPF"},
            {text: "VTX_TRAMP"},
            {text: "GHST"},
            {text: "GHST_MSP"},
            {text: "SCHEDULER_DETERMINISM"},
            {text: "TIMING_ACCURACY"},
            {text: "RX_EXPRESSLRS_SPI"},
            {text: "RX_EXPRESSLRS_PHASELOCK"},
            {text: "RX_STATE_TIME"},
            {text: "GPS_RESCUE_VELOCITY"},
            {text: "GPS_RESCUE_HEADING"},
            {text: "GPS_RESCUE_TRACKING"},
            {text: "GPS_CONNECTION"},
            {text: "ATTITUDE"},
            {text: "VTX_MSP"},
            {text: "GPS_DOP"},
            {text: "FAILSAFE"},
            {text: "GYRO_CALIBRATION"},
            {text: "ANGLE_MODE"},
            {text: "ANGLE_TARGET"},
            {text: "CURRENT_ANGLE"},
            {text: "DSHOT_TELEMETRY_COUNTS"},
            {text: "RPM_LIMIT"},
        ];

        const DEBUG_FRIENDLY_FIELD_NAMES = {
            'NONE' : {
                'debug[all]':'Debug [all]',
                'debug[0]':'Debug [0]',
                'debug[1]':'Debug [1]',
                'debug[2]':'Debug [2]',
                'debug[3]':'Debug [3]',
                'debug[4]':'Debug [4]',
                'debug[5]':'Debug [5]',
                'debug[6]':'Debug [6]',
                'debug[7]':'Debug [7]',
            },
            'CYCLETIME' : {
                'debug[all]':'Debug Cycle Time',
                'debug[0]':'Cycle Time',
                'debug[1]':'CPU Load',
                'debug[2]':'Motor Update',
                'debug[3]':'Motor Deviation',
            },
            'BATTERY' : {
                'debug[all]':'Debug Battery',
                'debug[0]':'Battery Volt ADC',
                'debug[1]':'Battery Volt',
            },
            'GYRO' : {
                'debug[all]':'Debug Gyro',
                'debug[0]':'Gyro Raw [X]',
                'debug[1]':'Gyro Raw [Y]',
                'debug[2]':'Gyro Raw [Z]',
            },
            'GYRO_FILTERED' : {
                'debug[all]':'Debug Gyro Filtered',
                'debug[0]':'Gyro Filtered [X]',
                'debug[1]':'Gyro Filtered [Y]',
                'debug[2]':'Gyro Filtered [Z]',
            },
            'ACCELEROMETER' : {
                'debug[all]':'Debug Accel.',
                'debug[0]':'Accel. Raw [X]',
                'debug[1]':'Accel. Raw [Y]',
                'debug[2]':'Accel. Raw [Z]',
            },
            'MIXER' : {
                'debug[all]':'Debug Mixer',
                'debug[0]':'Roll-Pitch-Yaw Mix [0]',
                'debug[1]':'Roll-Pitch-Yaw Mix [1]',
                'debug[2]':'Roll-Pitch-Yaw Mix [2]',
                'debug[3]':'Roll-Pitch-Yaw Mix [3]',
            },
            'PIDLOOP' : {
                'debug[all]':'Debug PID',
                'debug[0]':'Wait Time',
                'debug[1]':'Sub Update Time',
                'debug[2]':'PID Update Time',
                'debug[3]':'Motor Update Time',
            },
            'NOTCH' : {
                'debug[all]':'Debug Notch',
                'debug[0]':'Gyro Pre-Notch [roll]',
                'debug[1]':'Gyro Pre-Notch [pitch]',
                'debug[2]':'Gyro Pre-Notch [yaw]',
            },
            'GYRO_SCALED' : {
                'debug[all]':'Debug Gyro Scaled',
                'debug[0]':'Gyro Scaled [roll]',
                'debug[1]':'Gyro Scaled [pitch]',
                'debug[2]':'Gyro Scaled [yaw]',
            },
            'RC_INTERPOLATION' : {
                'debug[all]':'Debug RC Interpolation',
                'debug[0]':'Raw RC Command [roll]',
                'debug[1]':'Current RX Refresh Rate',
                'debug[2]':'Interpolation Step Count',
                'debug[3]':'RC Setpoint [roll]',
            },
            'DTERM_FILTER' : {
                'debug[all]':'Debug Filter',
                'debug[0]':'DTerm Filter [roll]',
                'debug[1]':'DTerm Filter [pitch]',
            },
            'ANGLERATE' : {
                'debug[all]':'Debug Angle Rate',
                'debug[0]':'Angle Rate[roll]',
                'debug[1]':'Angle Rate[pitch]',
                'debug[2]':'Angle Rate[yaw]',
            },
            'ESC_SENSOR' : {
                'debug[all]':'ESC Sensor',
                'debug[0]':'Motor Index',
                'debug[1]':'Timeouts',
                'debug[2]':'CNC errors',
                'debug[3]':'Data age',
            },
            'SCHEDULER' : {
                'debug[all]':'Scheduler',
                'debug[2]':'Schedule Time',
                'debug[3]':'Function Exec Time',
            },
            'STACK' : {
                'debug[all]':'Stack',
                'debug[0]':'Stack High Mem',
                'debug[1]':'Stack Low Mem',
                'debug[2]':'Stack Current',
                'debug[3]':'Stack p',
            },
            'ESC_SENSOR_RPM' : {
                'debug[all]':'ESC Sensor RPM',
                'debug[0]':'Motor 1',
                'debug[1]':'Motor 2',
                'debug[2]':'Motor 3',
                'debug[3]':'Motor 4',
            },
            'ESC_SENSOR_TMP' : {
                'debug[all]':'ESC Sensor Temp',
                'debug[0]':'Motor 1',
                'debug[1]':'Motor 2',
                'debug[2]':'Motor 3',
                'debug[3]':'Motor 4',
            },
            'ALTITUDE' : {
                'debug[all]':'Altitude',
                'debug[0]':'GPS Trust * 100',
                'debug[1]':'Baro Altitude',
                'debug[2]':'GPS Altitude',
                'debug[3]':'Vario',
            },
            'FFT' : {
                'debug[all]':'Debug FFT',
                'debug[0]':'Gyro Pre Dyn Notch [dbg-axis]',
                'debug[1]':'Gyro Post Dyn Notch [dbg-axis]',
                'debug[2]':'Gyro Downsampled [dbg-axis]',
            },
            'FFT_TIME' : {
                'debug[all]':'Debug FFT TIME',
                'debug[0]':'Active calc step',
                'debug[1]':'Step duration',
            },
            'FFT_FREQ' : {
                'debug[all]':'Debug FFT FREQ',
                'debug[0]':'Notch 1 Center Freq [dbg-axis]',
                'debug[1]':'Notch 2 Center Freq [dbg-axis]',
                'debug[2]':'Notch 3 Center Freq [dbg-axis]',
                'debug[3]':'Gyro Pre Dyn Notch [dbg-axis]',
            },
            'RX_FRSKY_SPI' : {
                'debug[all]':'FrSky SPI Rx',
                'debug[0]':'Looptime',
                'debug[1]':'Packet',
                'debug[2]':'Missing Packets',
                'debug[3]':'State',
            },
            'RX_SFHSS_SPI' : {
                'debug[all]':'SFHSS SPI Rx',
                'debug[0]':'State',
                'debug[1]':'Missing Frame',
                'debug[2]':'Offset Max',
                'debug[3]':'Offset Min',
            },
            'GYRO_RAW' : {
                'debug[all]':'Debug Gyro Raw',
                'debug[0]':'Gyro Raw [X]',
                'debug[1]':'Gyro Raw [Y]',
                'debug[2]':'Gyro Raw [Z]',
            },
            'DUAL_GYRO' : {
                'debug[all]':'Debug Dual Gyro',
                'debug[0]':'Gyro 1 Filtered [roll]',
                'debug[1]':'Gyro 1 Filtered [pitch]',
                'debug[2]':'Gyro 2 Filtered [roll]',
                'debug[3]':'Gyro 2 Filtered [pitch]',
            },
            'DUAL_GYRO_RAW': {
                'debug[all]':'Debug Dual Gyro Raw',
                'debug[0]':'Gyro 1 Raw [roll]',
                'debug[1]':'Gyro 1 Raw [pitch]',
                'debug[2]':'Gyro 2 Raw [roll]',
                'debug[3]':'Gyro 2 Raw [pitch]',
            },
            'DUAL_GYRO_COMBINED': {
                'debug[all]':'Debug Dual Combined',
                'debug[0]':'Not Used',
                'debug[1]':'Gyro Filtered [roll]',
                'debug[2]':'Gyro Filtered [pitch]',
            },
            'DUAL_GYRO_DIFF': {
                'debug[all]':'Debug Dual Gyro Diff',
                'debug[0]':'Gyro Diff [roll]',
                'debug[1]':'Gyro Diff [pitch]',
                'debug[2]':'Gyro Diff [yaw]',
            },
            'MAX7456_SIGNAL' : {
                'debug[all]':'Max7456 Signal',
                'debug[0]':'Mode Reg',
                'debug[1]':'Sense',
                'debug[2]':'ReInit',
                'debug[3]':'Rows',
            },
            'MAX7456_SPICLOCK' : {
                'debug[all]':'Max7456 SPI Clock',
                'debug[0]':'Overclock',
                'debug[1]':'DevType',
                'debug[2]':'Divisor',
            },
            'SBUS' : {
                'debug[all]':'SBus Rx',
                'debug[0]':'Frame Flags',
                'debug[1]':'State Flags',
                'debug[2]':'Frame Time',
            },
            'FPORT' : {
                'debug[all]':'FPort Rx',
                'debug[0]':'Frame Interval',
                'debug[1]':'Frame Errors',
                'debug[2]':'Last Error',
                'debug[3]':'Telemetry Interval',
            },
            'RANGEFINDER' : {
                'debug[all]':'Rangefinder',
                'debug[0]':'not used',
                'debug[1]':'Raw Altitude',
                'debug[2]':'Calc Altituded',
                'debug[3]':'SNR',
            },
            'RANGEFINDER_QUALITY' : {
                'debug[all]':'Rangefinder Quality',
                'debug[0]':'Raw Altitude',
                'debug[1]':'SNR Threshold Reached',
                'debug[2]':'Dyn Distance Threshold',
                'debug[3]':'Is Surface Altitude Valid',
            },
            'LIDAR_TF' : {
                'debug[all]':'Lidar TF',
                'debug[0]':'Distance',
                'debug[1]':'Strength',
                'debug[2]':'TF Frame (4)',
                'debug[3]':'TF Frame (5)',
            },
            'ADC_INTERNAL' : {
                'debug[all]':'ADC Internal',
                'debug[0]':'Core Temp',
                'debug[1]':'VRef Internal Sample',
                'debug[2]':'Temp Sensor Sample',
                'debug[3]':'Vref mV',
            },
            'RUNAWAY_TAKEOFF' : {
                'debug[all]':'Runaway Takeoff',
                'debug[0]':'Enabled',
                'debug[1]':'Activating Delay',
                'debug[2]':'Deactivating Delay',
                'debug[3]':'Deactivating Time',
            },
            'CURRENT_SENSOR' : {
                'debug[all]':'Current Sensor',
                'debug[0]':'milliVolts',
                'debug[1]':'centiAmps',
                'debug[2]':'Amps Latest',
                'debug[3]':'mAh Drawn',
            },
            'USB' : {
                'debug[all]':'USB',
                'debug[0]':'Cable In',
                'debug[1]':'VCP Connected',
            },
            'SMART AUDIO' : {
                'debug[all]':'Smart Audio VTx',
                'debug[0]':'Device + Version',
                'debug[1]':'Channel',
                'debug[2]':'Frequency',
                'debug[3]':'Power',
            },
            'RTH' : {
                'debug[all]':'RTH Rescue codes',
                'debug[0]':'Pitch angle, deg',
                'debug[1]':'Rescue Phase',
                'debug[2]':'Failure code',
                'debug[3]':'Failure timers',
            },
            'ITERM_RELAX' : {
                'debug[all]':'I-term Relax',
                'debug[0]':'Setpoint HPF [roll]',
                'debug[1]':'I Relax Factor [roll]',
                'debug[2]':'Relaxed I Error [roll]',
                'debug[3]':'Axis Error [roll]',
            },
            'ACRO_TRAINER' : {
                'debug[all]':'Acro Trainer (a_t_axis)',
                'debug[0]':'Current Angle * 10 [deg]',
                'debug[1]':'Axis State',
                'debug[2]':'Correction amount',
                'debug[3]':'Projected Angle * 10 [deg]',
            },
            'RC_SMOOTHING' : {
                'debug[all]':'Debug RC Smoothing',
                'debug[0]':'Raw RC Command',
                'debug[1]':'Raw RC Derivative',
                'debug[2]':'Smoothed RC Derivative',
                'debug[3]':'RX Refresh Rate',
            },
            'RX_SIGNAL_LOSS' : {
                'debug[all]':'Rx Signal Loss',
                'debug[0]':'Signal Received',
                'debug[1]':'Failsafe',
                'debug[2]':'Not used',
                'debug[3]':'Throttle',
            },
            'RC_SMOOTHING_RATE' : {
                'debug[all]':'Debug RC Smoothing Rate',
                'debug[0]':'Current RX Refresh Rate',
                'debug[1]':'Training Step Count',
                'debug[2]':'Average RX Refresh Rate',
                'debug[3]':'Sampling State',
            },
            'ANTI_GRAVITY' : {
                'debug[all]':'I-term Relax',
                'debug[0]':'Base I gain * 1000',
                'debug[1]':'Final I gain * 1000',
                'debug[2]':'P gain [roll] * 1000',
                'debug[3]':'P gain [pitch] * 1000',
            },
            'DYN_LPF' : {
                'debug[all]':'Debug Dyn LPF',
                'debug[0]':'Gyro Scaled [dbg-axis]',
                'debug[1]':'Notch Center [roll]',
                'debug[2]':'Lowpass Cutoff',
                'debug[3]':'Gyro Pre-Dyn [dbg-axis]',
            },
            'DSHOT_RPM_TELEMETRY' : {
                'debug[all]':'DShot Telemetry RPM',
                'debug[0]':'Motor 1 - DShot',
                'debug[1]':'Motor 2 - DShot',
                'debug[2]':'Motor 3 - DShot',
                'debug[3]':'Motor 4 - DShot',
                'debug[4]':'Motor 5 - DShot',
                'debug[5]':'Motor 6 - DShot',
                'debug[6]':'Motor 7 - DShot',
                'debug[7]':'Motor 8 - DShot',
            },
            'RPM_FILTER' : {
                'debug[all]':'RPM Filter',
                'debug[0]':'Motor 1 - rpmFilter',
                'debug[1]':'Motor 2 - rpmFilter',
                'debug[2]':'Motor 3 - rpmFilter',
                'debug[3]':'Motor 4 - rpmFilter',
            },
            'D_MIN' : {
                'debug[all]':'D_MIN',
                'debug[0]':'Gyro Factor [roll]',
                'debug[1]':'Setpoint Factor [roll]',
                'debug[2]':'Actual D [roll]',
                'debug[3]':'Actual D [pitch]',
            },
            'AC_CORRECTION' : {
                'debug[all]':'AC Correction',
                'debug[0]':'AC Correction [roll]',
                'debug[1]':'AC Correction [pitch]',
                'debug[2]':'AC Correction [yaw]',
            },
            'AC_ERROR' : {
                'debug[all]':'AC Error',
                'debug[0]':'AC Error [roll]',
                'debug[1]':'AC Error [pitch]',
                'debug[2]':'AC Error [yaw]',
            },
            'DUAL_GYRO_SCALED' : {
                'debug[all]':'Dual Gyro Scaled',
                'debug[0]':'Gyro 1 [roll]',
                'debug[1]':'Gyro 1 [pitch]',
                'debug[2]':'Gyro 2 [roll]',
                'debug[3]':'Gyro 2 [pitch]',
            },
            'DSHOT_RPM_ERRORS' : {
                'debug[all]':'DSHOT RPM Error',
                'debug[0]':'DSHOT RPM Error [1]',
                'debug[1]':'DSHOT RPM Error [2]',
                'debug[2]':'DSHOT RPM Error [3]',
                'debug[3]':'DSHOT RPM Error [4]',
            },
            'CRSF_LINK_STATISTICS_UPLINK' : {
                'debug[all]':'CRSF Stats Uplink',
                'debug[0]':'Uplink RSSI 1',
                'debug[1]':'Uplink RSSI 2',
                'debug[2]':'Uplink Link Quality',
                'debug[3]':'RF Mode',
            },
            'CRSF_LINK_STATISTICS_PWR' : {
                'debug[all]':'CRSF Stats Power',
                'debug[0]':'Antenna',
                'debug[1]':'SNR',
                'debug[2]':'TX Power',
            },
            'CRSF_LINK_STATISTICS_DOWN' : {
                'debug[all]':'CRSF Stats Downlink',
                'debug[0]':'Downlink RSSI',
                'debug[1]':'Downlink Link Quality',
                'debug[2]':'Downlink SNR',
            },
            'BARO' : {
                'debug[all]':'Debug Barometer',
                'debug[0]':'Baro State',
                'debug[1]':'Baro Pressure',
                'debug[2]':'Baro Temperature',
                'debug[3]':'Baro Altitude',
            },
            'GPS_RESCUE_THROTTLE_PID' : {
                'debug[all]':'GPS Rescue throttle PIDs',
                'debug[0]':'Throttle P',
                'debug[1]':'Throttle D',
                'debug[2]':'Altitude',
                'debug[3]':'Target altitude',
            },
            'DYN_IDLE' : {
                'debug[all]':'Dyn Idle',
                'debug[0]':'Dyn Idle P [roll]',
                'debug[1]':'Dyn Idle I [roll]',
                'debug[2]':'Dyn Idle D [roll]',
                'debug[3]':'Min RPM',
            },
            'FEEDFORWARD' : {
                'debug[all]':'Feedforward [roll]',
                'debug[0]':'Setpoint, un-smoothed [roll]',
                'debug[1]':'Delta, smoothed [roll]',
                'debug[2]':'Boost, smoothed [roll]',
                'debug[3]':'rcCommand Delta [roll]',
            },
            'FEEDFORWARD_LIMIT' : {
                'debug[all]':'Feedforward Limit [roll]',
                'debug[0]':'Feedforward input [roll]',
                'debug[1]':'Feedforward input [pitch]',
                'debug[2]':'Feedforward limited [roll]',
            },
            'FF_INTERPOLATED' : {
                'debug[all]':'Feedforward [roll]',
                'debug[0]':'Setpoint Delta [roll]',
                'debug[1]':'Acceleration [roll]',
                'debug[2]':'Acceleration, clipped [roll]',
                'debug[3]':'Duplicate Counter [roll]',
            },
            'BLACKBOX_OUTPUT' : {
                'debug[all]':'Blackbox Output',
                'debug[0]':'Blackbox Rate',
                'debug[1]':'Blackbox Max Rate',
                'debug[2]':'Dropouts',
                'debug[3]':'Tx Bytes Free',
            },
            'GYRO_SAMPLE' : {
                'debug[all]':'Gyro Sample',
                'debug[0]':'Before downsampling',
                'debug[1]':'After downsampling',
                'debug[2]':'After RPM',
                'debug[3]':'After all but Dyn Notch',
            },
            'RX_TIMING' : {
                'debug[all]':'Receiver Timing (us)',
                'debug[0]':'Frame Delta',
                'debug[1]':'Frame Age',
            },
            'D_LPF' : {
                'debug[all]':'D-Term [D_LPF]',
                'debug[0]':'Unfiltered D [roll]',
                'debug[1]':'Unfiltered D [pitch]',
                'debug[2]':'Filtered, with DMax [roll]',
                'debug[3]':'Filtered, with DMax [pitch]',
            },
            'VTX_TRAMP' : {
                'debug[all]':'Tramp VTx',
                'debug[0]':'Status',
                'debug[1]':'Reply Code',
                'debug[2]':'Pit Mode',
                'debug[3]':'Retry Count',
            },
            'GHST' : {
                'debug[all]':'Ghost Rx',
                'debug[0]':'CRC Error Count',
                'debug[1]':'Unknown Frame Count',
                'debug[2]':'RSSI',
                'debug[3]':'Link Quality',
            },
            'GHST_MSP' : {
                'debug[all]':'Ghost MSP',
                'debug[0]':'MSP Frame Count',
                'debug[1]':'MSP Frame Counter',
            },
            'SCHEDULER_DETERMINISM' : {
                'debug[all]':'Scheduler Determinism',
                'debug[0]':'Cycle Start time',
                'debug[1]':'ID of Late Task',
                'debug[2]':'Task Delay Time',
                'debug[3]':'Gyro Clock Skew',
            },
            'TIMING_ACCURACY' : {
                'debug[all]':'Timing Accuracy',
                'debug[0]':'CPU Busy',
                'debug[1]':'Late Tasks per second',
                'debug[2]':'Total delay in last second',
                'debug[3]':'Total Tasks per second',
            },
            'RX_EXPRESSLRS_SPI' : {
                'debug[all]':'ExpressLRS SPI Rx',
                'debug[0]':'Lost Connection Count',
                'debug[1]':'RSSI',
                'debug[2]':'SNR',
                'debug[3]':'Uplink LQ',
            },
            'RX_EXPRESSLRS_PHASELOCK' : {
                'debug[all]':'ExpressLRS SPI Phaselock',
                'debug[0]':'Phase offset',
                'debug[1]':'Filtered phase offset',
                'debug[2]':'Frequency Offset',
                'debug[3]':'Phase Shift',
            },
            'RX_STATE_TIME' : {
                'debug[all]':'Rx State Time',
                'debug[0]':'Time 0',
                'debug[1]':'Time 1',
                'debug[2]':'Time 2',
                'debug[3]':'Time 3',
            },
            'GPS_RESCUE_VELOCITY' : {
                'debug[all]':'GPS Rescue Velocity',
                'debug[0]':'Velocity P',
                'debug[1]':'Velocity D',
                'debug[2]':'Velocity to Home',
                'debug[3]':'Target Velocity',
            },
            'GPS_RESCUE_HEADING' : {
                'debug[all]':'GPS Rescue Heading',
                'debug[0]':'Ground Speed',
                'debug[1]':'GPS Heading',
                'debug[2]':'IMU Attitude',
                'debug[3]':'Angle to home',
                'debug[4]':'magYaw',
                'debug[5]':'Roll MixAtt',
                'debug[6]':'Roll Added',
                'debug[7]':'Rescue Yaw Rate',
            },
            'GPS_RESCUE_TRACKING' : {
                'debug[all]':'GPS Rescue Tracking',
                'debug[0]':'Velocity to home',
                'debug[1]':'Target velocity',
                'debug[2]':'Altitude',
                'debug[3]':'Target altitude',
            },
            'GPS_CONNECTION' : {
                'debug[all]':'GPS Connection',
                'debug[0]':'Nav Model',
                'debug[1]':'GPS Nav interval',
                'debug[2]':'Task timer',
                'debug[3]':'Baud Rate / FC interval',
                'debug[4]':'State*100 +SubState',
                'debug[5]':'ExecuteTime',
                'debug[6]':'Ack State',
                'debug[7]':'Rx buffer size',
            },
            'ATTITUDE' : {
                'debug[all]':'Attitude',
                'debug[0]':'accADC X',
                'debug[1]':'accADC Y',
                'debug[2]':'Setpoint Roll',
                'debug[3]':'Setpoint Pitch',
            },
            'VTX_MSP' : {
                'debug[all]': 'VTX MSP',
                'debug[0]': 'packetCounter',
                'debug[1]': 'isCrsfPortConfig',
                'debug[2]': 'isLowPowerDisarmed',
                'debug[3]': 'mspTelemetryDescriptor',
            },
            'GPS_DOP' : {
                'debug[all]': 'GPS Dilution of Precision',
                'debug[0]': 'Number of Satellites',
                'debug[1]': 'pDOP (positional - 3D)',
                'debug[2]': 'hDOP (horizontal - 2D)',
                'debug[3]': 'vDOP (vertical - 1D)',
            },
        };

        for (let i = 0; i < sensors.debugColumns; i++) {
            const debugModeName = debugModes[FC.PID_ADVANCED_CONFIG.debugMode].text;
            const debugFields = DEBUG_FRIENDLY_FIELD_NAMES[debugModeName];
            const msg = debugFields[`debug[${i}]`] ?? `Debug ${i} not used`;

            $(`.plot_control.debug${i}`)
            .children('.title')
            .text(msg);
        }
    }

    $('#content').load("./tabs/sensors.html", function load_html() {
        // translate to user-selected language
        i18n.localizePage();

        // disable graphs for sensors that are missing
        let checkboxes = $('.tab-sensors .info .checkboxes input');
        checkboxes.parent().show();

        if (FC.CONFIG.boardType == 0 || FC.CONFIG.boardType == 2) {
            if (!have_sensor(FC.CONFIG.activeSensors, 'acc')) {
                checkboxes.eq(1).prop('disabled', true);
            }
            if (!have_sensor(FC.CONFIG.activeSensors, 'mag')) {
                checkboxes.eq(2).prop('disabled', true);
            }
            if (!(have_sensor(FC.CONFIG.activeSensors, 'baro') || have_sensor(FC.CONFIG.activeSensors, 'gps'))) {
                checkboxes.eq(3).prop('disabled', true);
            }
            if (!have_sensor(FC.CONFIG.activeSensors, 'sonar')) {
                checkboxes.eq(4).prop('disabled', true);
            }
        } else {
            for (let i = 0; i <= 4; i++) {
                checkboxes.eq(i).prop('disabled', true);
                checkboxes.eq(i).parent().hide();
            }
        }

        $('.tab-sensors .info .checkboxes input').change(function () {
            const enable = $(this).prop('checked');
            const index = $(this).parent().index();

            switch (index) {
                case 0:
                    plot_gyro(enable);
                    break;
                case 1:
                    plot_accel(enable);
                    break;
                case 2:
                    plot_mag(enable);
                    break;
                case 3:
                    plot_altitude(enable);
                    break;
                case 4:
                    plot_sonar(enable);
                    break;
                case 5:
                    plot_debug(enable);
                    break;
            }

            const _checkboxes = [];
            $('.tab-sensors .info .checkboxes input').each(function () {
                _checkboxes.push($(this).prop('checked'));
            });

            $('.tab-sensors .rate select:first').change();

            setConfig({'graphs_enabled': _checkboxes});
        });

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            sensors.debugColumns = 8;

            MSP.send_message(MSPCodes.MSP_ADVANCED_CONFIG, false, false, displayDebugColumnNames);
        } else {
            sensors.debugColumns = 4;

            for (let i = 4; i < 8; i++) {
                $(`svg#debug${i}`).hide();
                $(`div.plot_control.debug${i}`).hide();
            }
        }

        // Always start with default/empty sensor data array, clean slate all
        initSensorData();

        // Setup variables
        let samples_gyro_i = 0,
            samples_accel_i = 0,
            samples_mag_i = 0,
            samples_altitude_i = 0,
            samples_sonar_i = 0,
            samples_debug_i = 0;
        const gyro_data = initDataArray(3),
            accel_data = initDataArray(3),
            mag_data = initDataArray(3),
            altitude_data = initDataArray(1),
            sonar_data = initDataArray(1),
            debug_data = [];

        for (let i = 0; i < sensors.debugColumns; i++) {
            debug_data.push(initDataArray(1));
        }

        let gyroHelpers = initGraphHelpers('#gyro', samples_gyro_i, [-2000, 2000]);
        let accelHelpers = initGraphHelpers('#accel', samples_accel_i, [-2, 2]);
        let magHelpers = initGraphHelpers('#mag', samples_mag_i, [-1, 1]);
        const altitudeHelpers = initGraphHelpers('#altitude', samples_altitude_i);
        const sonarHelpers = initGraphHelpers('#sonar', samples_sonar_i);
        const debugHelpers = [];

        for (let i = 0; i < sensors.debugColumns; i++) {
            debugHelpers.push(initGraphHelpers(`#debug${i}`, samples_debug_i));
        }

        const raw_data_text_ements = {
            x: [],
            y: [],
            z: [],
        };
        $('.plot_control .x, .plot_control .y, .plot_control .z').each(function () {
            const el = $(this);
            if (el.hasClass('x')) {
                raw_data_text_ements.x.push(el);
            } else if (el.hasClass('y')) {
                raw_data_text_ements.y.push(el);
            } else {
                raw_data_text_ements.z.push(el);
            }
        });

        $('.tab-sensors .rate select, .tab-sensors .scale select').change(function () {
            // if any of the select fields change value, all of the select values are grabbed
            // and timers are re-initialized with the new settings
            const rates = {
                'gyro':   parseInt($('.tab-sensors select[name="gyro_refresh_rate"]').val(), 10),
                'accel':  parseInt($('.tab-sensors select[name="accel_refresh_rate"]').val(), 10),
                'mag':    parseInt($('.tab-sensors select[name="mag_refresh_rate"]').val(), 10),
                'altitude':   parseInt($('.tab-sensors select[name="altitude_refresh_rate"]').val(), 10),
                'sonar':  parseInt($('.tab-sensors select[name="sonar_refresh_rate"]').val(), 10),
                'debug':  parseInt($('.tab-sensors select[name="debug_refresh_rate"]').val(), 10),
            };

            const scales = {
                'gyro':  parseFloat($('.tab-sensors select[name="gyro_scale"]').val()),
                'accel': parseFloat($('.tab-sensors select[name="accel_scale"]').val()),
                'mag':   parseFloat($('.tab-sensors select[name="mag_scale"]').val()),
            };

            // handling of "data pulling" is a little bit funky here, as MSP_RAW_IMU contains values for gyro/accel/mag but not altitude
            // this means that setting a slower refresh rate on any of the attributes would have no effect
            // what we will do instead is = determinate the fastest refresh rate for those 3 attributes, use that as a "polling rate"
            // and use the "slower" refresh rates only for re-drawing the graphs (to save resources/computing power)
            const fastest = d3.min([rates.gyro, rates.accel, rates.mag]);

            // store current/latest refresh rates in the storage
            setConfig({'sensor_settings': {'rates': rates, 'scales': scales}});

            // re-initialize domains with new scales
            gyroHelpers = initGraphHelpers('#gyro', samples_gyro_i, [-scales.gyro, scales.gyro]);
            accelHelpers = initGraphHelpers('#accel', samples_accel_i, [-scales.accel, scales.accel]);
            magHelpers = initGraphHelpers('#mag', samples_mag_i, [-scales.mag, scales.mag]);

            // fetch currently enabled plots
            checkboxes = [];
            $('.tab-sensors .info .checkboxes input').each(function () {
                checkboxes.push($(this).prop('checked'));
            });

            // timer initialization
            GUI.interval_kill_all(['status_pull']);

            // data pulling timers
            if (checkboxes[0] || checkboxes[1] || checkboxes[2]) {
                GUI.interval_add('IMU_pull', function imu_data_pull() {
                    MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, update_imu_graphs);
                }, fastest, true);
            }

            if (checkboxes[3]) {
                GUI.interval_add('altitude_pull', function altitude_data_pull() {
                    MSP.send_message(MSPCodes.MSP_ALTITUDE, false, false, update_altitude_graph);
                }, rates.altitude, true);
            }

            if (checkboxes[4]) {
                GUI.interval_add('sonar_pull', function sonar_data_pull() {
                    MSP.send_message(MSPCodes.MSP_SONAR, false, false, update_sonar_graphs);
                }, rates.sonar, true);
            }

            if (checkboxes[5]) {
                GUI.interval_add('debug_pull', function debug_data_pull() {
                    MSP.send_message(MSPCodes.MSP_DEBUG, false, false, update_debug_graphs);
                }, rates.debug, true);
            }

            function update_imu_graphs() {
                if (checkboxes[0]) {
                    updateGraphHelperSize(gyroHelpers);

                    samples_gyro_i = addSampleToData(gyro_data, samples_gyro_i, FC.SENSOR_DATA.gyroscope);
                    drawGraph(gyroHelpers, gyro_data, samples_gyro_i);
                    raw_data_text_ements.x[0].text(FC.SENSOR_DATA.gyroscope[0].toFixed(2));
                    raw_data_text_ements.y[0].text(FC.SENSOR_DATA.gyroscope[1].toFixed(2));
                    raw_data_text_ements.z[0].text(FC.SENSOR_DATA.gyroscope[2].toFixed(2));
                }

                if (checkboxes[1]) {
                    updateGraphHelperSize(accelHelpers);

                    samples_accel_i = addSampleToData(accel_data, samples_accel_i, FC.SENSOR_DATA.accelerometer);
                    drawGraph(accelHelpers, accel_data, samples_accel_i);
                    const x = FC.SENSOR_DATA.accelerometer[0].toFixed(2);
                    const y = FC.SENSOR_DATA.accelerometer[1].toFixed(2);
                    const z = FC.SENSOR_DATA.accelerometer[2].toFixed(2);
                    const pi = Math.PI;
                    const rollACC = Math.round(Math.atan(y / (Math.sqrt(Math.pow(x, 2)) + (Math.pow(z, 2)))) * (180 / pi));
                    const pitchACC = Math.round(Math.atan(x / (Math.sqrt(Math.pow(y, 2)) + (Math.pow(z, 2)))) * (180 / pi));
                    raw_data_text_ements.x[1].text(`${x} (${rollACC})`);
                    raw_data_text_ements.y[1].text(`${y} (${pitchACC})`);
                    raw_data_text_ements.z[1].text(`${z}`);
                }

                if (checkboxes[2]) {
                    updateGraphHelperSize(magHelpers);

                    samples_mag_i = addSampleToData(mag_data, samples_mag_i, FC.SENSOR_DATA.magnetometer);
                    drawGraph(magHelpers, mag_data, samples_mag_i);
                    raw_data_text_ements.x[2].text(FC.SENSOR_DATA.magnetometer[0].toFixed(2));
                    raw_data_text_ements.y[2].text(FC.SENSOR_DATA.magnetometer[1].toFixed(2));
                    raw_data_text_ements.z[2].text(FC.SENSOR_DATA.magnetometer[2].toFixed(2));
                }
            }

            function update_altitude_graph() {
                updateGraphHelperSize(altitudeHelpers);

                samples_altitude_i = addSampleToData(altitude_data, samples_altitude_i, [FC.SENSOR_DATA.altitude]);
                drawGraph(altitudeHelpers, altitude_data, samples_altitude_i);
                raw_data_text_ements.x[3].text(FC.SENSOR_DATA.altitude.toFixed(2));
            }

            function update_sonar_graphs() {
                updateGraphHelperSize(sonarHelpers);

                samples_sonar_i = addSampleToData(sonar_data, samples_sonar_i, [FC.SENSOR_DATA.sonar]);
                drawGraph(sonarHelpers, sonar_data, samples_sonar_i);
                raw_data_text_ements.x[4].text(FC.SENSOR_DATA.sonar.toFixed(2));
            }

            function update_debug_graphs() {
                for (let i = 0; i < sensors.debugColumns; i++) {
                    updateGraphHelperSize(debugHelpers[i]);
                    addSampleToData(debug_data[i], samples_debug_i, [FC.SENSOR_DATA.debug[i]]);
                    drawGraph(debugHelpers[i], debug_data[i], samples_debug_i);
                    raw_data_text_ements.x[5 + i].text(FC.SENSOR_DATA.debug[i]);
                }
                samples_debug_i++;
            }
        });

        const result = getConfig('sensor_settings');
        // set refresh speeds according to configuration saved in storage
        if (result.sensor_settings) {
            $('.tab-sensors select[name="gyro_refresh_rate"]').val(result.sensor_settings.rates.gyro);
            $('.tab-sensors select[name="gyro_scale"]').val(result.sensor_settings.scales.gyro);

            $('.tab-sensors select[name="accel_refresh_rate"]').val(result.sensor_settings.rates.accel);
            $('.tab-sensors select[name="accel_scale"]').val(result.sensor_settings.scales.accel);

            $('.tab-sensors select[name="mag_refresh_rate"]').val(result.sensor_settings.rates.mag);
            $('.tab-sensors select[name="mag_scale"]').val(result.sensor_settings.scales.mag);

            $('.tab-sensors select[name="altitude_refresh_rate"]').val(result.sensor_settings.rates.altitude);
            $('.tab-sensors select[name="sonar_refresh_rate"]').val(result.sensor_settings.rates.sonar);

            $('.tab-sensors select[name="debug_refresh_rate"]').val(result.sensor_settings.rates.debug);

            // start polling data by triggering refresh rate change event
            $('.tab-sensors .rate select:first').change();
        } else {
            // start polling immediatly (as there is no configuration saved in the storage)
            $('.tab-sensors .rate select:first').change();
        }

        const resultGraphs = getConfig('graphs_enabled');
        if (resultGraphs.graphs_enabled) {
            const _checkboxes = $('.tab-sensors .info .checkboxes input');
            for (let i = 0; i < resultGraphs.graphs_enabled.length; i++) {
                _checkboxes.eq(i).not(':disabled').prop('checked', resultGraphs.graphs_enabled[i]).change();
            }
        } else {
            $('.tab-sensors .info input:lt(4):not(:disabled)').prop('checked', true).change();
        }

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function status_pull() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);

        GUI.content_ready(callback);
    });
};

sensors.cleanup = function (callback) {
    serial.emptyOutputBuffer();

    if (callback) callback();
};

TABS.sensors = sensors;
export {
    sensors,
};
