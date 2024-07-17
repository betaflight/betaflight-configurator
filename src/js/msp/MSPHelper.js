import '../injected_methods';
import { update_dataflash_global } from "../update_dataflash_global";
import { bit_check, bit_set } from "../bit";
import { i18n } from "../localization";
import { gui_log } from "../gui_log";
import FC from "../fc";
import semver from 'semver';
import vtxDeviceStatusFactory from "../utils/VtxDeviceStatus/VtxDeviceStatusFactory";
import MSP from "../msp";
import MSPCodes from "./MSPCodes";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from '../data_storage';
import EscProtocols from "../utils/EscProtocols";
import huffmanDecodeBuf from "../huffman";
import { defaultHuffmanTree, defaultHuffmanLenIndex } from "../default_huffman_tree";
import { updateTabList } from "../utils/updateTabList";
import { showErrorDialog } from "../utils/showErrorDialog";
import GUI, { TABS } from "../gui";
import { OSD } from "../tabs/osd";
import { reinitializeConnection } from "../serial_backend";

// Used for LED_STRIP
const ledDirectionLetters    = ['n', 'e', 's', 'w', 'u', 'd'];      // in LSB bit order
const ledBaseFunctionLetters = ['c', 'f', 'a', 'l', 's', 'g', 'r', 'p', 'e', 'u']; // in LSB bit
let ledOverlayLetters        = ['t', 'y', 'o', 'b', 'v', 'i', 'w']; // in LSB bit

function MspHelper() {
    const self = this;

    // 0 based index, must be identical to 'baudRates' in 'src/main/io/serial.c' in betaflight
    self.BAUD_RATES = ['AUTO', '9600', '19200', '38400', '57600', '115200',
    '230400', '250000', '400000', '460800', '500000', '921600', '1000000',
    '1500000', '2000000', '2470000'];
    // needs to be identical to 'serialPortFunction_e' in 'src/main/io/serial.h' in betaflight
    self.SERIAL_PORT_FUNCTIONS = {
    'MSP': 0,
    'GPS': 1,
    'TELEMETRY_FRSKY': 2,
    'TELEMETRY_HOTT': 3,
    'TELEMETRY_MSP': 4,
    'TELEMETRY_LTM': 4, // LTM replaced MSP
    'TELEMETRY_SMARTPORT': 5,
    'RX_SERIAL': 6,
    'BLACKBOX': 7,
    'TELEMETRY_MAVLINK': 9,
    'ESC_SENSOR': 10,
    'TBS_SMARTAUDIO': 11,
    'TELEMETRY_IBUS': 12,
    'IRC_TRAMP': 13,
    'RUNCAM_DEVICE_CONTROL': 14, // support communitate with RunCam Device
    'LIDAR_TF': 15,
    'FRSKY_OSD': 16,
    'VTX_MSP': 17,
    };

    self.REBOOT_TYPES = {
        FIRMWARE: 0,
        BOOTLOADER: 1,
        MSC: 2,
        MSC_UTC: 3,
        BOOTLOADER_FLASH: 4,
    };

    self.RESET_TYPES = {
        BASE_DEFAULTS: 0,
        CUSTOM_DEFAULTS: 1,
    };

    self.SIGNATURE_LENGTH = 32;

    self.mspMultipleCache = [];

    self.setText = function(buffer, type, config, length) {
        // type byte
        buffer.push8(type);

        const size = Math.min(length, config.length);
        // length byte followed by the actual characters
        buffer.push8(size);

        for (let i = 0; i < size; i++) {
            buffer.push8(config.charCodeAt(i));
        }
    };

    self.getText = function(data) {
        // length byte followed by the actual characters
        const size = data.readU8() || 0;
        let str = '';

        for (let i = 0; i < size; i++) {
            str += String.fromCharCode(data.readU8());
        }

        return str;
    };
}

function getMSPCodeName(code) {
    return Object.keys(MSPCodes).find(key => MSPCodes[key] === code);
}

MspHelper.readPidSliderSettings = function(data) {
    FC.TUNING_SLIDERS.slider_pids_mode = data.readU8();
    FC.TUNING_SLIDERS.slider_master_multiplier = data.readU8();
    FC.TUNING_SLIDERS.slider_roll_pitch_ratio = data.readU8();
    FC.TUNING_SLIDERS.slider_i_gain = data.readU8();
    FC.TUNING_SLIDERS.slider_d_gain = data.readU8();
    FC.TUNING_SLIDERS.slider_pi_gain = data.readU8();
    FC.TUNING_SLIDERS.slider_dmax_gain = data.readU8();
    FC.TUNING_SLIDERS.slider_feedforward_gain = data.readU8();
    FC.TUNING_SLIDERS.slider_pitch_pi_gain = data.readU8();
    data.readU32(); // reserved for future use
    data.readU32(); // reserved for future use
};

MspHelper.writePidSliderSettings = function(buffer) {
    buffer
    .push8(FC.TUNING_SLIDERS.slider_pids_mode)
    .push8(FC.TUNING_SLIDERS.slider_master_multiplier)
    .push8(FC.TUNING_SLIDERS.slider_roll_pitch_ratio)
    .push8(FC.TUNING_SLIDERS.slider_i_gain)
    .push8(FC.TUNING_SLIDERS.slider_d_gain)
    .push8(FC.TUNING_SLIDERS.slider_pi_gain)
    .push8(FC.TUNING_SLIDERS.slider_dmax_gain)
    .push8(FC.TUNING_SLIDERS.slider_feedforward_gain)
    .push8(FC.TUNING_SLIDERS.slider_pitch_pi_gain)
    .push32(0)  // reserved for future use
    .push32(0); // reserved for future use
};

MspHelper.readDtermFilterSliderSettings = function(data) {
    FC.TUNING_SLIDERS.slider_dterm_filter = data.readU8();
    FC.TUNING_SLIDERS.slider_dterm_filter_multiplier = data.readU8();
    FC.FILTER_CONFIG.dterm_lowpass_hz = data.readU16();
    FC.FILTER_CONFIG.dterm_lowpass2_hz = data.readU16();
    FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = data.readU16();
    FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz = data.readU16();
    data.readU32(); // reserved for future use
    data.readU32(); // reserved for future use
};

MspHelper.writeDtermFilterSliderSettings = function(buffer) {
    buffer
    .push8(FC.TUNING_SLIDERS.slider_dterm_filter)
    .push8(FC.TUNING_SLIDERS.slider_dterm_filter_multiplier)
    .push16(FC.FILTER_CONFIG.dterm_lowpass_hz)
    .push16(FC.FILTER_CONFIG.dterm_lowpass2_hz)
    .push16(FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz)
    .push16(FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz)
    .push32(0)  // reserved for future use
    .push32(0); // reserved for future use
};

MspHelper.readGyroFilterSliderSettings = function(data) {
    FC.TUNING_SLIDERS.slider_gyro_filter = data.readU8();
    FC.TUNING_SLIDERS.slider_gyro_filter_multiplier = data.readU8();
    FC.FILTER_CONFIG.gyro_lowpass_hz = data.readU16();
    FC.FILTER_CONFIG.gyro_lowpass2_hz = data.readU16();
    FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = data.readU16();
    FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = data.readU16();
    data.readU32(); // reserved for future use
    data.readU32(); // reserved for future use
};

MspHelper.writeGyroFilterSliderSettings = function(buffer) {
    buffer
    .push8(FC.TUNING_SLIDERS.slider_gyro_filter)
    .push8(FC.TUNING_SLIDERS.slider_gyro_filter_multiplier)
    .push16(FC.FILTER_CONFIG.gyro_lowpass_hz)
    .push16(FC.FILTER_CONFIG.gyro_lowpass2_hz)
    .push16(FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz)
    .push16(FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz)
    .push32(0)  // reserved for future use
    .push32(0); // reserved for future use
};

MspHelper.prototype.process_data = function(dataHandler) {
    const self = this;
    const data = dataHandler.dataView; // DataView (allowing us to view arrayBuffer as struct/union)
    const code = dataHandler.code;
    const crcError = dataHandler.crcError;
    let buff = [];
    let char = '';
    let flags = 0;

    if (!crcError) {
        if (!dataHandler.unsupported) switch (code) {
            case MSPCodes.MSP_STATUS:
                FC.CONFIG.cycleTime = data.readU16();
                FC.CONFIG.i2cError = data.readU16();
                FC.CONFIG.activeSensors = data.readU16();
                FC.CONFIG.mode = data.readU32();
                FC.CONFIG.profile = data.readU8();

                break;
            case MSPCodes.MSP_STATUS_EX:
                FC.CONFIG.cycleTime = data.readU16();
                FC.CONFIG.i2cError = data.readU16();
                FC.CONFIG.activeSensors = data.readU16();
                FC.CONFIG.mode = data.readU32();
                FC.CONFIG.profile = data.readU8();
                FC.CONFIG.cpuload = data.readU16();
                FC.CONFIG.numProfiles = data.readU8();
                FC.CONFIG.rateProfile = data.readU8();

                // Read flight mode flags
                const byteCount = data.readU8();
                for (let i = 0; i < byteCount; i++) {
                    data.readU8();
                }

                // Read arming disable flags
                FC.CONFIG.armingDisableCount = data.readU8(); // Flag count
                FC.CONFIG.armingDisableFlags = data.readU32();

                // Read config state flags - bits to indicate the state of the configuration, reboot required, etc.
                FC.CONFIG.configStateFlag = data.readU8();

                // Read CPU temp, from API version 1.46
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                    FC.CONFIG.cpuTemp = data.readU16();
                }

                break;

            case MSPCodes.MSP_RAW_IMU:
                // 2048 for mpu6050, 1024 for mma (times 4 since we don't scale in the firmware)
                // currently we are unable to differentiate between the sensor types, so we are going with 2048
                FC.SENSOR_DATA.accelerometer[0] = data.read16() / 2048;
                FC.SENSOR_DATA.accelerometer[1] = data.read16() / 2048;
                FC.SENSOR_DATA.accelerometer[2] = data.read16() / 2048;

                // properly scaled
                FC.SENSOR_DATA.gyroscope[0] = data.read16() * (4 / 16.4);
                FC.SENSOR_DATA.gyroscope[1] = data.read16() * (4 / 16.4);
                FC.SENSOR_DATA.gyroscope[2] = data.read16() * (4 / 16.4);

                // no clue about scaling factor
                FC.SENSOR_DATA.magnetometer[0] = data.read16();
                FC.SENSOR_DATA.magnetometer[1] = data.read16();
                FC.SENSOR_DATA.magnetometer[2] = data.read16();
                break;
            case MSPCodes.MSP_SERVO:
                const servoCount = data.byteLength / 2;
                for (let i = 0; i < servoCount; i++) {
                    FC.SERVO_DATA[i] = data.readU16();
                }
                break;
            case MSPCodes.MSP_MOTOR:
                const motorCount = data.byteLength / 2;
                for (let i = 0; i < motorCount; i++) {
                    FC.MOTOR_DATA[i] = data.readU16();
                }
                break;
            case MSPCodes.MSP2_MOTOR_OUTPUT_REORDERING:
                FC.MOTOR_OUTPUT_ORDER = [];
                const arraySize = data.read8();
                for (let i = 0; i < arraySize; i++) {
                    FC.MOTOR_OUTPUT_ORDER[i] = data.readU8();
                }
                break;
            case MSPCodes.MSP2_GET_VTX_DEVICE_STATUS:
                FC.VTX_DEVICE_STATUS = null;
                const dataLength = data.byteLength;
                if (dataLength > 0) {
                    const vtxDeviceStatusData = new Uint8Array(dataLength);
                    for (let i = 0; i < dataLength; i++) {
                        vtxDeviceStatusData[i] = data.readU8();
                    }
                    FC.VTX_DEVICE_STATUS = vtxDeviceStatusFactory.createVtxDeviceStatus(vtxDeviceStatusData);
                }
                break;
            case MSPCodes.MSP_MOTOR_TELEMETRY:
                const telemMotorCount = data.readU8();
                for (let i = 0; i < telemMotorCount; i++) {
                    FC.MOTOR_TELEMETRY_DATA.rpm[i] = data.readU32();   // RPM
                    FC.MOTOR_TELEMETRY_DATA.invalidPercent[i] = data.readU16();   // 10000 = 100.00%
                    FC.MOTOR_TELEMETRY_DATA.temperature[i] = data.readU8();       // degrees celsius
                    FC.MOTOR_TELEMETRY_DATA.voltage[i] = data.readU16();          // 0.01V per unit
                    FC.MOTOR_TELEMETRY_DATA.current[i] = data.readU16();          // 0.01A per unit
                    FC.MOTOR_TELEMETRY_DATA.consumption[i] = data.readU16();      // mAh
                }
                break;
            case MSPCodes.MSP_RC:
                FC.RC.active_channels = data.byteLength / 2;
                for (let i = 0; i < FC.RC.active_channels; i++) {
                    FC.RC.channels[i] = data.readU16();
                }
                break;
            case MSPCodes.MSP_RAW_GPS:
                FC.GPS_DATA.fix = data.readU8();
                FC.GPS_DATA.numSat = data.readU8();
                FC.GPS_DATA.lat = data.read32();
                FC.GPS_DATA.lon = data.read32();
                FC.GPS_DATA.alt = data.readU16();
                FC.GPS_DATA.speed = data.readU16();
                FC.GPS_DATA.ground_course = data.readU16();
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                    FC.GPS_DATA.positionalDop = data.readU16();
                }
                break;
            case MSPCodes.MSP_COMP_GPS:
                FC.GPS_DATA.distanceToHome = data.readU16();
                FC.GPS_DATA.directionToHome = data.readU16();
                FC.GPS_DATA.update = data.readU8();
                break;
            case MSPCodes.MSP_ATTITUDE:
                FC.SENSOR_DATA.kinematics[0] = data.read16() / 10.0; // x
                FC.SENSOR_DATA.kinematics[1] = data.read16() / 10.0; // y
                FC.SENSOR_DATA.kinematics[2] = data.read16(); // z
                break;
            case MSPCodes.MSP_ALTITUDE:
                FC.SENSOR_DATA.altitude = parseFloat((data.read32() / 100.0).toFixed(2)); // correct scale factor
                break;
            case MSPCodes.MSP_SONAR:
                FC.SENSOR_DATA.sonar = data.read32();
                break;
            case MSPCodes.MSP_ANALOG:
                FC.ANALOG.voltage = data.readU8() / 10.0;
                FC.ANALOG.mAhdrawn = data.readU16();
                FC.ANALOG.rssi = data.readU16(); // 0-1023
                FC.ANALOG.amperage = data.read16() / 100; // A
                FC.ANALOG.voltage = data.readU16() / 100;
                FC.ANALOG.last_received_timestamp = performance.now();
                break;
            case MSPCodes.MSP_VOLTAGE_METERS:
                FC.VOLTAGE_METERS = [];
                const voltageMeterLength = 2;
                for (let i = 0; i < (data.byteLength / voltageMeterLength); i++) {
                    const voltageMeter = {
                        id: data.readU8(),
                        voltage: data.readU8() / 10.0,
                    };

                    FC.VOLTAGE_METERS.push(voltageMeter);
                }
                break;
            case MSPCodes.MSP_CURRENT_METERS:

                FC.CURRENT_METERS = [];
                const currentMeterLength = 5;
                for (let i = 0; i < (data.byteLength / currentMeterLength); i++) {
                    const currentMeter = {
                        id: data.readU8(),
                        mAhDrawn: data.readU16(), // mAh
                        amperage: data.readU16() / 1000, // A
                    };

                    FC.CURRENT_METERS.push(currentMeter);
                }
                break;
            case MSPCodes.MSP_BATTERY_STATE:
                FC.BATTERY_STATE.cellCount = data.readU8();
                FC.BATTERY_STATE.capacity = data.readU16(); // mAh

                FC.BATTERY_STATE.voltage = data.readU8() / 10.0; // V
                FC.BATTERY_STATE.mAhDrawn = data.readU16(); // mAh
                FC.BATTERY_STATE.amperage = data.readU16() / 100; // A
                FC.BATTERY_STATE.batteryState = data.readU8();
                FC.BATTERY_STATE.voltage = data.readU16() / 100;
                break;

            case MSPCodes.MSP_VOLTAGE_METER_CONFIG:
                FC.VOLTAGE_METER_CONFIGS = [];
                const voltageMeterCount = data.readU8();

                for (let i = 0; i < voltageMeterCount; i++) {
                    const subframeLength = data.readU8();
                    if (subframeLength !== 5) {
                        for (let j = 0; j < subframeLength; j++) {
                            data.readU8();
                        }
                    } else {
                        const voltageMeterConfig = {
                            id: data.readU8(),
                            sensorType: data.readU8(),
                            vbatscale: data.readU8(),
                            vbatresdivval: data.readU8(),
                            vbatresdivmultiplier: data.readU8(),
                        };

                        FC.VOLTAGE_METER_CONFIGS.push(voltageMeterConfig);
                    }
                }
                break;
            case MSPCodes.MSP_CURRENT_METER_CONFIG:
                FC.CURRENT_METER_CONFIGS = [];
                const currentMeterCount = data.readU8();
                for (let i = 0; i < currentMeterCount; i++) {
                    const currentMeterConfig = {};
                    const subframeLength = data.readU8();

                    if (subframeLength !== 6) {
                        for (let j = 0; j < subframeLength; j++) {
                            data.readU8();
                        }
                    } else {
                        currentMeterConfig.id = data.readU8();
                        currentMeterConfig.sensorType = data.readU8();
                        currentMeterConfig.scale = data.read16();
                        currentMeterConfig.offset = data.read16();

                        FC.CURRENT_METER_CONFIGS.push(currentMeterConfig);
                    }
                }
                break;

            case MSPCodes.MSP_BATTERY_CONFIG:
                FC.BATTERY_CONFIG.vbatmincellvoltage = data.readU8() / 10; // 10-50
                FC.BATTERY_CONFIG.vbatmaxcellvoltage = data.readU8() / 10; // 10-50
                FC.BATTERY_CONFIG.vbatwarningcellvoltage = data.readU8() / 10; // 10-50
                FC.BATTERY_CONFIG.capacity = data.readU16();
                FC.BATTERY_CONFIG.voltageMeterSource = data.readU8();
                FC.BATTERY_CONFIG.currentMeterSource = data.readU8();
                FC.BATTERY_CONFIG.vbatmincellvoltage = data.readU16() / 100;
                FC.BATTERY_CONFIG.vbatmaxcellvoltage = data.readU16() / 100;
                FC.BATTERY_CONFIG.vbatwarningcellvoltage = data.readU16() / 100;
                break;
            case MSPCodes.MSP_SET_BATTERY_CONFIG:
                console.log('Battery configuration saved');
                break;
            case MSPCodes.MSP_RC_TUNING:
                FC.RC_TUNING.RC_RATE = parseFloat((data.readU8() / 100).toFixed(2));
                FC.RC_TUNING.RC_EXPO = parseFloat((data.readU8() / 100).toFixed(2));
                FC.RC_TUNING.roll_pitch_rate = 0;
                FC.RC_TUNING.roll_rate = parseFloat((data.readU8() / 100).toFixed(2));
                FC.RC_TUNING.pitch_rate = parseFloat((data.readU8() / 100).toFixed(2));
                FC.RC_TUNING.yaw_rate = parseFloat((data.readU8() / 100).toFixed(2));
                if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                    FC.RC_TUNING.dynamic_THR_PID = parseFloat((data.readU8() / 100).toFixed(2));
                } else {
                    data.readU8();
                }
                FC.RC_TUNING.throttle_MID = parseFloat((data.readU8() / 100).toFixed(2));
                FC.RC_TUNING.throttle_EXPO = parseFloat((data.readU8() / 100).toFixed(2));
                if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                    FC.RC_TUNING.dynamic_THR_breakpoint = data.readU16();
                } else {
                    data.readU16();
                }
                FC.RC_TUNING.RC_YAW_EXPO = parseFloat((data.readU8() / 100).toFixed(2));
                FC.RC_TUNING.rcYawRate = parseFloat((data.readU8() / 100).toFixed(2));
                FC.RC_TUNING.rcPitchRate = parseFloat((data.readU8() / 100).toFixed(2));
                FC.RC_TUNING.RC_PITCH_EXPO = parseFloat((data.readU8() / 100).toFixed(2));
                FC.RC_TUNING.throttleLimitType = data.readU8();
                FC.RC_TUNING.throttleLimitPercent = data.readU8();
                FC.RC_TUNING.roll_rate_limit = data.readU16();
                FC.RC_TUNING.pitch_rate_limit = data.readU16();
                FC.RC_TUNING.yaw_rate_limit = data.readU16();
                FC.RC_TUNING.rates_type = data.readU8();
                break;
            case MSPCodes.MSP_PID:
                // PID data arrived, we need to scale it and save to appropriate bank / array
                for (let i = 0, needle = 0; i < (data.byteLength / 3); i++, needle += 3) {
                    // main for loop selecting the pid section
                    for (let j = 0; j < 3; j++) {
                        FC.PIDS_ACTIVE[i][j] = data.readU8();
                        FC.PIDS[i][j] = FC.PIDS_ACTIVE[i][j];
                    }
                }
                break;

            case MSPCodes.MSP_ARMING_CONFIG:
                FC.ARMING_CONFIG.auto_disarm_delay = data.readU8();
                data.readU8(); // was FC.ARMING_CONFIG.auto_disarm_kill_switch
                FC.ARMING_CONFIG.small_angle = data.readU8();
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                    FC.ARMING_CONFIG.gyro_cal_on_first_arm = data.readU8();
                }
                break;
            case MSPCodes.MSP_LOOP_TIME:
                FC.FC_CONFIG.loopTime = data.readU16();
                break;
            case MSPCodes.MSP_MISC: // 22 bytes
                FC.RX_CONFIG.midrc = data.readU16();
                FC.MOTOR_CONFIG.minthrottle = data.readU16(); // 0-2000
                FC.MOTOR_CONFIG.maxthrottle = data.readU16(); // 0-2000
                FC.MOTOR_CONFIG.mincommand = data.readU16(); // 0-2000
                FC.MISC.failsafe_throttle = data.readU16(); // 1000-2000
                FC.GPS_CONFIG.provider = data.readU8();
                FC.MISC.gps_baudrate = data.readU8();
                FC.GPS_CONFIG.ublox_sbas = data.readU8();
                FC.MISC.multiwiicurrentoutput = data.readU8();
                FC.RSSI_CONFIG.channel = data.readU8();
                FC.MISC.placeholder2 = data.readU8();
                data.read16(); // was mag_declination
                FC.MISC.vbatscale = data.readU8(); // was FC.MISC.vbatscale - 10-200
                FC.MISC.vbatmincellvoltage = data.readU8() / 10; // 10-50
                FC.MISC.vbatmaxcellvoltage = data.readU8() / 10; // 10-50
                FC.MISC.vbatwarningcellvoltage = data.readU8() / 10; // 10-50
                break;
            case MSPCodes.MSP_MOTOR_CONFIG:
                FC.MOTOR_CONFIG.minthrottle = data.readU16(); // 0-2000
                FC.MOTOR_CONFIG.maxthrottle = data.readU16(); // 0-2000
                FC.MOTOR_CONFIG.mincommand = data.readU16(); // 0-2000
                FC.MOTOR_CONFIG.motor_count = data.readU8();
                FC.MOTOR_CONFIG.motor_poles = data.readU8();
                FC.MOTOR_CONFIG.use_dshot_telemetry = data.readU8() != 0;
                FC.MOTOR_CONFIG.use_esc_sensor = data.readU8() != 0;
                break;
            case MSPCodes.MSP_COMPASS_CONFIG:
                FC.COMPASS_CONFIG.mag_declination = data.read16() / 10;
                break;
            case MSPCodes.MSP_GPS_CONFIG:
                FC.GPS_CONFIG.provider = data.readU8();
                FC.GPS_CONFIG.ublox_sbas = data.readU8();
                FC.GPS_CONFIG.auto_config = data.readU8();
                FC.GPS_CONFIG.auto_baud = data.readU8();

                // Introduced in API version 1.43
                FC.GPS_CONFIG.home_point_once = data.readU8();
                FC.GPS_CONFIG.ublox_use_galileo = data.readU8();
                break;
            case MSPCodes.MSP_GPS_RESCUE:
                FC.GPS_RESCUE.angle             = data.readU16();
                FC.GPS_RESCUE.returnAltitudeM   = data.readU16();
                FC.GPS_RESCUE.descentDistanceM  = data.readU16();
                FC.GPS_RESCUE.groundSpeed       = data.readU16();
                FC.GPS_RESCUE.throttleMin       = data.readU16();
                FC.GPS_RESCUE.throttleMax       = data.readU16();
                FC.GPS_RESCUE.throttleHover     = data.readU16();
                FC.GPS_RESCUE.sanityChecks      = data.readU8();
                FC.GPS_RESCUE.minSats           = data.readU8();

                // Introduced in API version 1.43
                FC.GPS_RESCUE.ascendRate            = data.readU16();
                FC.GPS_RESCUE.descendRate           = data.readU16();
                FC.GPS_RESCUE.allowArmingWithoutFix = data.readU8();
                FC.GPS_RESCUE.altitudeMode          = data.readU8();

                // Introduced in API version 1.44
                FC.GPS_RESCUE.minStartDistM = data.readU16();

                // Introduced in API version 1.46
                FC.GPS_RESCUE.initialClimbM = data.readU16();
                break;
            case MSPCodes.MSP_RSSI_CONFIG:
                FC.RSSI_CONFIG.channel = data.readU8();
                break;
            case MSPCodes.MSP_MOTOR_3D_CONFIG:
                FC.MOTOR_3D_CONFIG.deadband3d_low = data.readU16();
                FC.MOTOR_3D_CONFIG.deadband3d_high = data.readU16();
                FC.MOTOR_3D_CONFIG.neutral = data.readU16();
                break;
            case MSPCodes.MSP_BOXNAMES:
                FC.AUX_CONFIG = []; // empty the array as new data is coming in

                buff = [];
                for (let i = 0; i < data.byteLength; i++) {
                    char = data.readU8();
                    if (char == 0x3B) { // ; (delimeter char)
                        FC.AUX_CONFIG.push(String.fromCharCode.apply(null, buff)); // convert bytes into ASCII and save as strings

                        // empty buffer
                        buff = [];
                    } else {
                        buff.push(char);
                    }
                }
                break;
            case MSPCodes.MSP_PIDNAMES:
                FC.PID_NAMES = []; // empty the array as new data is coming in

                buff = [];
                for (let i = 0; i < data.byteLength; i++) {
                    char = data.readU8();
                    if (char == 0x3B) { // ; (delimeter char)
                        FC.PID_NAMES.push(String.fromCharCode.apply(null, buff)); // convert bytes into ASCII and save as strings

                        // empty buffer
                        buff = [];
                    } else {
                        buff.push(char);
                    }
                }
                break;
            case MSPCodes.MSP_BOXIDS:
                FC.AUX_CONFIG_IDS = []; // empty the array as new data is coming in

                for (let i = 0; i < data.byteLength; i++) {
                    FC.AUX_CONFIG_IDS.push(data.readU8());
                }
                break;
            case MSPCodes.MSP_SERVO_MIX_RULES:
                break;

            case MSPCodes.MSP_SERVO_CONFIGURATIONS:
                FC.SERVO_CONFIG = []; // empty the array as new data is coming in
                if (data.byteLength % 12 == 0) {
                    for (let i = 0; i < data.byteLength; i += 12) {
                        const arr = {
                            'min':                      data.readU16(),
                            'max':                      data.readU16(),
                            'middle':                   data.readU16(),
                            'rate':                     data.read8(),
                            'indexOfChannelToForward':  data.readU8(),
                            'reversedInputSources':     data.readU32(),
                        };

                        FC.SERVO_CONFIG.push(arr);
                    }
                }
                break;
            case MSPCodes.MSP_RC_DEADBAND:
                FC.RC_DEADBAND_CONFIG.deadband = data.readU8();
                FC.RC_DEADBAND_CONFIG.yaw_deadband = data.readU8();
                FC.RC_DEADBAND_CONFIG.alt_hold_deadband = data.readU8();

                FC.RC_DEADBAND_CONFIG.deadband3d_throttle = data.readU16();
                break;
            case MSPCodes.MSP_SENSOR_ALIGNMENT:
                FC.SENSOR_ALIGNMENT.align_gyro = data.readU8();
                FC.SENSOR_ALIGNMENT.align_acc = data.readU8();
                FC.SENSOR_ALIGNMENT.align_mag = data.readU8();
                FC.SENSOR_ALIGNMENT.gyro_detection_flags = data.readU8();
                FC.SENSOR_ALIGNMENT.gyro_to_use = data.readU8();
                FC.SENSOR_ALIGNMENT.gyro_1_align = data.readU8();
                FC.SENSOR_ALIGNMENT.gyro_2_align = data.readU8();
                break;
            case MSPCodes.MSP_DISPLAYPORT:
                break;
            case MSPCodes.MSP_SET_RAW_RC:
                break;
            case MSPCodes.MSP_SET_PID:
                console.log('PID settings saved');
                FC.PIDS_ACTIVE = FC.PIDS.map(array => array.slice());
                break;
            case MSPCodes.MSP_SET_RC_TUNING:
                console.log('RC Tuning saved');
                break;
            case MSPCodes.MSP_ACC_CALIBRATION:
                console.log('Accel calibration executed');
                break;
            case MSPCodes.MSP_MAG_CALIBRATION:
                console.log('Mag calibration executed');
                break;
            case MSPCodes.MSP_SET_MOTOR_CONFIG:
                console.log('Motor Configuration saved');
                break;
            case MSPCodes.MSP_SET_GPS_CONFIG:
                console.log('GPS Configuration saved');
                break;
            case MSPCodes.MSP_SET_GPS_RESCUE:
                console.log('GPS Rescue Configuration saved');
                break;
            case MSPCodes.MSP_SET_RSSI_CONFIG:
                console.log('RSSI Configuration saved');
                break;
            case MSPCodes.MSP_SET_FEATURE_CONFIG:
                console.log('Features saved');
                break;
            case MSPCodes.MSP_SET_BEEPER_CONFIG:
                console.log('Beeper Configuration saved');
                break;
            case MSPCodes.MSP_RESET_CONF:
                console.log('Settings Reset');
                break;
            case MSPCodes.MSP_SELECT_SETTING:
                console.log('Profile selected');
                break;
            case MSPCodes.MSP_SET_SERVO_CONFIGURATION:
                console.log('Servo Configuration saved');
                break;
            case MSPCodes.MSP_EEPROM_WRITE:
                console.log('Settings Saved in EEPROM');
                break;
            case MSPCodes.MSP_SET_CURRENT_METER_CONFIG:
                console.log('Amperage Settings saved');
                break;
            case MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG:
                console.log('Voltage config saved');
                break;
            case MSPCodes.MSP_DEBUG:
                for (let i = 0; i < 8; i++) {
                    FC.SENSOR_DATA.debug[i] = data.read16();
                }
                break;
            case MSPCodes.MSP_SET_MOTOR:
                break;
            case MSPCodes.MSP_UID:
                FC.CONFIG.uid[0] = data.readU32();
                FC.CONFIG.uid[1] = data.readU32();
                FC.CONFIG.uid[2] = data.readU32();
                FC.CONFIG.deviceIdentifier = FC.CONFIG.uid[0].toString(16) + FC.CONFIG.uid[1].toString(16) + FC.CONFIG.uid[2].toString(16);
                break;
            case MSPCodes.MSP_ACC_TRIM:
                FC.CONFIG.accelerometerTrims[0] = data.read16(); // pitch
                FC.CONFIG.accelerometerTrims[1] = data.read16(); // roll
                break;
            case MSPCodes.MSP_SET_ACC_TRIM:
                console.log('Accelerometer trimms saved.');
                break;
            case MSPCodes.MSP_GPS_SV_INFO:
                if (data.byteLength > 0) {
                    const numCh = data.readU8();

                    for (let i = 0; i < numCh; i++) {
                        FC.GPS_DATA.chn[i] = data.readU8();
                        FC.GPS_DATA.svid[i] = data.readU8();
                        FC.GPS_DATA.quality[i] = data.readU8();
                        FC.GPS_DATA.cno[i] = data.readU8();
                    }
                }
                break;

            case MSPCodes.MSP_RX_MAP:
                FC.RC_MAP = []; // empty the array as new data is coming in

                for (let i = 0; i < data.byteLength; i++) {
                    FC.RC_MAP.push(data.readU8());
                }
                break;
            case MSPCodes.MSP_SET_RX_MAP:
                console.log('RCMAP saved');
                break;

            case MSPCodes.MSP_MIXER_CONFIG:
                FC.MIXER_CONFIG.mixer = data.readU8();
                FC.MIXER_CONFIG.reverseMotorDir = data.readU8();
                break;

            case MSPCodes.MSP_FEATURE_CONFIG:
                FC.FEATURE_CONFIG.features.setMask(data.readU32());

                updateTabList(FC.FEATURE_CONFIG.features);
                break;

            case MSPCodes.MSP_BEEPER_CONFIG:
                FC.BEEPER_CONFIG.beepers.setDisabledMask(data.readU32());
                FC.BEEPER_CONFIG.dshotBeaconTone = data.readU8();
                FC.BEEPER_CONFIG.dshotBeaconConditions.setDisabledMask(data.readU32());
                break;

            case MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG:
                FC.BOARD_ALIGNMENT_CONFIG.roll = data.read16(); // -180 - 360
                FC.BOARD_ALIGNMENT_CONFIG.pitch = data.read16(); // -180 - 360
                FC.BOARD_ALIGNMENT_CONFIG.yaw = data.read16(); // -180 - 360
                break;

            case MSPCodes.MSP_SET_REBOOT:
                const rebootType = data.read8();
                if ((rebootType === self.REBOOT_TYPES.MSC) || (rebootType === self.REBOOT_TYPES.MSC_UTC)) {
                    if (data.read8() === 0) {
                        console.log('Storage device not ready.');

                        showErrorDialog(i18n.getMessage('storageDeviceNotReady'));
                        break;
                    }
                }
                console.log('Reboot request accepted');
                break;

            case MSPCodes.MSP_API_VERSION:
                FC.CONFIG.mspProtocolVersion = data.readU8();
                FC.CONFIG.apiVersion = `${data.readU8()}.${data.readU8()}.0`;
                break;

            case MSPCodes.MSP_FC_VARIANT:
                let fcVariantIdentifier = '';
                for (let i = 0; i < 4; i++) {
                    fcVariantIdentifier += String.fromCharCode(data.readU8());
                }
                FC.CONFIG.flightControllerIdentifier = fcVariantIdentifier;
                break;

            case MSPCodes.MSP_FC_VERSION:
                FC.CONFIG.flightControllerVersion = `${data.readU8()}.${data.readU8()}.${data.readU8()}`;
                break;

            case MSPCodes.MSP_BUILD_INFO: {
                const dateLength = 11;
                buff = [];

                for (let i = 0; i < dateLength; i++) {
                    buff.push(data.readU8());
                }
                buff.push(32); // ascii space

                const timeLength = 8;
                for (let i = 0; i < timeLength; i++) {
                    buff.push(data.readU8());
                }
                FC.CONFIG.buildInfo = String.fromCharCode.apply(null, buff);

                const gitRevisionLength = 7;
                buff = [];
                for (let i = 0; i < gitRevisionLength; i++) {
                    buff.push(data.readU8());
                }

                FC.CONFIG.gitRevision = String.fromCharCode.apply(null, buff);
                console.log("Fw git rev:", FC.CONFIG.gitRevision);

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                    let option = data.readU16();
                    while (option) {
                        FC.CONFIG.buildOptions.push(option);
                        option = data.readU16();
                    }
                }

                break;
            }

            case MSPCodes.MSP_BOARD_INFO:
                FC.CONFIG.boardIdentifier = '';

                for (let i = 0; i < 4; i++) {
                    FC.CONFIG.boardIdentifier += String.fromCharCode(data.readU8());
                }

                FC.CONFIG.boardVersion = data.readU16();
                FC.CONFIG.boardType = data.readU8();

                FC.CONFIG.targetCapabilities = data.readU8();
                FC.CONFIG.targetName = this.getText(data);

                FC.CONFIG.boardName = this.getText(data);
                FC.CONFIG.manufacturerId = this.getText(data);
                FC.CONFIG.signature = [];

                for (let i = 0; i < self.SIGNATURE_LENGTH; i++) {
                    FC.CONFIG.signature.push(data.readU8());
                }

                FC.CONFIG.mcuTypeId = data.readU8();
                // Introduced in API version 1.42
                FC.CONFIG.configurationState = data.readU8();

                // Introduced in API version 1.43
                FC.CONFIG.sampleRateHz = data.readU16();
                FC.CONFIG.configurationProblems = data.readU32();

                // Refresh the hardware name (it's a calculated field)
                FC.calculateHardwareName();

                break;

            case MSPCodes.MSP_NAME:
                FC.CONFIG.name = '';
                while ((char = data.readU8()) !== null) {
                    FC.CONFIG.name += String.fromCharCode(char);
                }
                break;

            case MSPCodes.MSP2_GET_TEXT:
                // type byte
                const textType = data.readU8();

                switch(textType) {
                    case MSPCodes.PILOT_NAME:
                        FC.CONFIG.pilotName = self.getText(data);
                        break;
                    case MSPCodes.CRAFT_NAME:
                        FC.CONFIG.craftName = self.getText(data);
                        break;
                    case MSPCodes.PID_PROFILE_NAME:
                        FC.CONFIG.pidProfileNames[FC.CONFIG.profile] = self.getText(data);
                        break;
                    case MSPCodes.RATE_PROFILE_NAME:
                        FC.CONFIG.rateProfileNames[FC.CONFIG.rateProfile] = self.getText(data);
                        break;
                    case MSPCodes.BUILD_KEY:
                        FC.CONFIG.buildKey = self.getText(data);
                        break;
                    default:
                        console.log('Unsupport text type');
                        break;
                }

                break;

            case MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES:
                FC.LED_CONFIG_VALUES.brightness = data.readU8();
                FC.LED_CONFIG_VALUES.rainbow_delta = data.readU16();
                FC.LED_CONFIG_VALUES.rainbow_freq = data.readU16();
                break;

            case MSPCodes.MSP_SET_CHANNEL_FORWARDING:
                console.log('Channel forwarding saved');
                break;

            case MSPCodes.MSP_CF_SERIAL_CONFIG:
                FC.SERIAL_CONFIG.ports = [];
                const bytesPerPort = 1 + 2 + (1 * 4);

                const serialPortCount = data.byteLength / bytesPerPort;
                for (let i = 0; i < serialPortCount; i++) {
                    const serialPort = {
                        identifier: data.readU8(),
                        functions: self.serialPortFunctionMaskToFunctions(data.readU16()),
                        msp_baudrate: self.BAUD_RATES[data.readU8()],
                        gps_baudrate: self.BAUD_RATES[data.readU8()],
                        telemetry_baudrate: self.BAUD_RATES[data.readU8()],
                        blackbox_baudrate: self.BAUD_RATES[data.readU8()],
                    };

                    FC.SERIAL_CONFIG.ports.push(serialPort);
                }
                break;

            case MSPCodes.MSP2_COMMON_SERIAL_CONFIG:
                FC.SERIAL_CONFIG.ports = [];
                const count = data.readU8();
                const portConfigSize = data.remaining() / count;
                for (let ii = 0; ii < count; ii++) {
                    const start = data.remaining();
                    const serialPort = {
                        identifier: data.readU8(),
                        functions: self.serialPortFunctionMaskToFunctions(data.readU32()),
                        msp_baudrate: self.BAUD_RATES[data.readU8()],
                        gps_baudrate: self.BAUD_RATES[data.readU8()],
                        telemetry_baudrate: self.BAUD_RATES[data.readU8()],
                        blackbox_baudrate: self.BAUD_RATES[data.readU8()],
                    };
                    FC.SERIAL_CONFIG.ports.push(serialPort);
                    while(start - data.remaining() < portConfigSize && data.remaining() > 0) {
                        data.readU8();
                    }
                }
                break;

            case MSPCodes.MSP_SET_CF_SERIAL_CONFIG:
                console.log('Serial config saved');
                break;

            case MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG:
                console.log('Serial config saved (MSPv2)');
                break;

            case MSPCodes.MSP_MODE_RANGES:
                FC.MODE_RANGES = []; // empty the array as new data is coming in

                const modeRangeCount = data.byteLength / 4; // 4 bytes per item.

                for (let i = 0; i < modeRangeCount; i++) {
                    const modeRange = {
                        id: data.readU8(),
                        auxChannelIndex: data.readU8(),
                        range: {
                            start: 900 + (data.readU8() * 25),
                            end: 900 + (data.readU8() * 25),
                        },
                    };
                    FC.MODE_RANGES.push(modeRange);
                }
                break;

            case MSPCodes.MSP_MODE_RANGES_EXTRA:
                FC.MODE_RANGES_EXTRA = []; // empty the array as new data is coming in

                const modeRangeExtraCount = data.readU8();

                for (let i = 0; i < modeRangeExtraCount; i++) {
                    const modeRangeExtra = {
                        id: data.readU8(),
                        modeLogic: data.readU8(),
                        linkedTo: data.readU8(),
                    };
                    FC.MODE_RANGES_EXTRA.push(modeRangeExtra);
                }
                break;

            case MSPCodes.MSP_ADJUSTMENT_RANGES:
                FC.ADJUSTMENT_RANGES = []; // empty the array as new data is coming in

                const adjustmentRangeCount = data.byteLength / 6; // 6 bytes per item.

                for (let i = 0; i < adjustmentRangeCount; i++) {
                    const adjustmentRange = {
                        slotIndex: data.readU8(),
                        auxChannelIndex: data.readU8(),
                        range: {
                            start: 900 + (data.readU8() * 25),
                            end: 900 + (data.readU8() * 25),
                        },
                        adjustmentFunction: data.readU8(),
                        auxSwitchChannelIndex: data.readU8(),
                    };
                    FC.ADJUSTMENT_RANGES.push(adjustmentRange);
                }
                break;

            case MSPCodes.MSP_RX_CONFIG:
                FC.RX_CONFIG.serialrx_provider = data.readU8();
                FC.RX_CONFIG.stick_max = data.readU16();
                FC.RX_CONFIG.stick_center = data.readU16();
                FC.RX_CONFIG.stick_min = data.readU16();
                FC.RX_CONFIG.spektrum_sat_bind = data.readU8();
                FC.RX_CONFIG.rx_min_usec = data.readU16();
                FC.RX_CONFIG.rx_max_usec = data.readU16();
                data.readU8(); // was FC.RX_CONFIG.rcInterpolation
                data.readU8(); // was FC.RX_CONFIG.rcInterpolationInterval
                FC.RX_CONFIG.airModeActivateThreshold = data.readU16();
                FC.RX_CONFIG.rxSpiProtocol = data.readU8();
                FC.RX_CONFIG.rxSpiId = data.readU32();
                FC.RX_CONFIG.rxSpiRfChannelCount = data.readU8();
                FC.RX_CONFIG.fpvCamAngleDegrees = data.readU8();
                data.readU8(); // was FC.RX_CONFIG.rcInterpolationChannels
                data.readU8(); // was FC.RX_CONFIG.rcSmoothingType
                FC.RX_CONFIG.rcSmoothingSetpointCutoff = data.readU8();
                FC.RX_CONFIG.rcSmoothingFeedforwardCutoff = data.readU8();
                data.readU8(); // was FC.RX_CONFIG.rcSmoothingInputType
                data.readU8(); // was FC.RX_CONFIG.rcSmoothingDerivativeType
                FC.RX_CONFIG.usbCdcHidType = data.readU8();
                FC.RX_CONFIG.rcSmoothingAutoFactor = data.readU8();
                FC.RX_CONFIG.rcSmoothingMode = data.readU8();

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                    const elrsUidLength = 6;
                    FC.RX_CONFIG.elrsUid = [];
                    for (let i = 0; i < elrsUidLength; i++) {
                        FC.RX_CONFIG.elrsUid.push(data.readU8());
                    }
                }

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                    FC.RX_CONFIG.elrsModelId = data.readU8();
                }

                break;

            case MSPCodes.MSP_FAILSAFE_CONFIG:
                FC.FAILSAFE_CONFIG.failsafe_delay = data.readU8();
                FC.FAILSAFE_CONFIG.failsafe_off_delay = data.readU8();
                FC.FAILSAFE_CONFIG.failsafe_throttle = data.readU16();
                FC.FAILSAFE_CONFIG.failsafe_switch_mode = data.readU8();
                FC.FAILSAFE_CONFIG.failsafe_throttle_low_delay = data.readU16();
                FC.FAILSAFE_CONFIG.failsafe_procedure = data.readU8();
                break;

            case MSPCodes.MSP_RXFAIL_CONFIG:
                FC.RXFAIL_CONFIG = []; // empty the array as new data is coming in

                const channelCount = data.byteLength / 3;
                for (let i = 0; i < channelCount; i++) {
                    const rxfailChannel = {
                        mode:  data.readU8(),
                        value: data.readU16(),
                    };
                    FC.RXFAIL_CONFIG.push(rxfailChannel);
                }
                break;

            case MSPCodes.MSP_ADVANCED_CONFIG:
                FC.PID_ADVANCED_CONFIG.gyro_sync_denom = data.readU8();
                FC.PID_ADVANCED_CONFIG.pid_process_denom = data.readU8();
                FC.PID_ADVANCED_CONFIG.use_unsyncedPwm = data.readU8();
                FC.PID_ADVANCED_CONFIG.fast_pwm_protocol = EscProtocols.ReorderPwmProtocols(FC.CONFIG.apiVersion, data.readU8());
                FC.PID_ADVANCED_CONFIG.motor_pwm_rate = data.readU16();
                FC.PID_ADVANCED_CONFIG.digitalIdlePercent = data.readU16() / 100;
                data.readU8(); // gyroUse32Khz is not supported
                // Introduced in 1.42
                FC.PID_ADVANCED_CONFIG.motorPwmInversion = data.readU8();
                FC.SENSOR_ALIGNMENT.gyro_to_use = data.readU8(); // We don't want to double up on storing this state
                FC.PID_ADVANCED_CONFIG.gyroHighFsr = data.readU8();
                FC.PID_ADVANCED_CONFIG.gyroMovementCalibThreshold = data.readU8();
                FC.PID_ADVANCED_CONFIG.gyroCalibDuration = data.readU16();
                FC.PID_ADVANCED_CONFIG.gyroOffsetYaw = data.readU16();
                FC.PID_ADVANCED_CONFIG.gyroCheckOverflow = data.readU8();
                FC.PID_ADVANCED_CONFIG.debugMode = data.readU8();
                FC.PID_ADVANCED_CONFIG.debugModeCount = data.readU8();
                break;
            case MSPCodes.MSP_FILTER_CONFIG:
                FC.FILTER_CONFIG.gyro_lowpass_hz = data.readU8();
                FC.FILTER_CONFIG.dterm_lowpass_hz = data.readU16();
                FC.FILTER_CONFIG.yaw_lowpass_hz = data.readU16();
                FC.FILTER_CONFIG.gyro_notch_hz = data.readU16();
                FC.FILTER_CONFIG.gyro_notch_cutoff = data.readU16();
                FC.FILTER_CONFIG.dterm_notch_hz = data.readU16();
                FC.FILTER_CONFIG.dterm_notch_cutoff = data.readU16();
                FC.FILTER_CONFIG.gyro_notch2_hz = data.readU16();
                FC.FILTER_CONFIG.gyro_notch2_cutoff = data.readU16();
                FC.FILTER_CONFIG.dterm_lowpass_type = data.readU8();
                FC.FILTER_CONFIG.gyro_hardware_lpf = data.readU8();
                data.readU8(); // gyro_32khz_hardware_lpf not used
                FC.FILTER_CONFIG.gyro_lowpass_hz = data.readU16();
                FC.FILTER_CONFIG.gyro_lowpass2_hz = data.readU16();
                FC.FILTER_CONFIG.gyro_lowpass_type = data.readU8();
                FC.FILTER_CONFIG.gyro_lowpass2_type = data.readU8();
                FC.FILTER_CONFIG.dterm_lowpass2_hz = data.readU16();
                FC.FILTER_CONFIG.gyro_32khz_hardware_lpf = 0;
                FC.FILTER_CONFIG.dterm_lowpass2_type = data.readU8();
                FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = data.readU16();
                FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = data.readU16();
                FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = data.readU16();
                FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz = data.readU16();
                // Introduced in 1.42
                FC.FILTER_CONFIG.dyn_notch_range = data.readU8();
                FC.FILTER_CONFIG.dyn_notch_width_percent = data.readU8();
                FC.FILTER_CONFIG.dyn_notch_q = data.readU16();
                FC.FILTER_CONFIG.dyn_notch_min_hz = data.readU16();

                FC.FILTER_CONFIG.gyro_rpm_notch_harmonics = data.readU8();
                FC.FILTER_CONFIG.gyro_rpm_notch_min_hz = data.readU8();
                // Introduced in 1.43
                FC.FILTER_CONFIG.dyn_notch_max_hz = data.readU16();
                // Introduced in 1.44
                FC.FILTER_CONFIG.dyn_lpf_curve_expo = data.readU8();
                FC.FILTER_CONFIG.dyn_notch_count = data.readU8();
                break;
            case MSPCodes.MSP_SET_PID_ADVANCED:
                console.log("Advanced PID settings saved");
                FC.ADVANCED_TUNING_ACTIVE = { ...FC.ADVANCED_TUNING };
                break;
            case MSPCodes.MSP_PID_ADVANCED:
                FC.ADVANCED_TUNING.rollPitchItermIgnoreRate = data.readU16();
                FC.ADVANCED_TUNING.yawItermIgnoreRate = data.readU16();
                FC.ADVANCED_TUNING.yaw_p_limit = data.readU16();
                FC.ADVANCED_TUNING.deltaMethod = data.readU8();
                FC.ADVANCED_TUNING.vbatPidCompensation = data.readU8();
                FC.ADVANCED_TUNING.feedforwardTransition = data.readU8();
                FC.ADVANCED_TUNING.dtermSetpointWeight = data.readU8();
                FC.ADVANCED_TUNING.toleranceBand = data.readU8();
                FC.ADVANCED_TUNING.toleranceBandReduction = data.readU8();
                FC.ADVANCED_TUNING.itermThrottleGain = data.readU8();
                FC.ADVANCED_TUNING.pidMaxVelocity = data.readU16();
                FC.ADVANCED_TUNING.pidMaxVelocityYaw = data.readU16();
                FC.ADVANCED_TUNING.levelAngleLimit = data.readU8();
                FC.ADVANCED_TUNING.levelSensitivity = data.readU8();
                FC.ADVANCED_TUNING.itermThrottleThreshold = data.readU16();
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                    FC.ADVANCED_TUNING.antiGravityGain = data.readU16();
                } else {
                    FC.ADVANCED_TUNING.itermAcceleratorGain = data.readU16();
                }

                FC.ADVANCED_TUNING.dtermSetpointWeight = data.readU16();
                FC.ADVANCED_TUNING.itermRotation = data.readU8();
                FC.ADVANCED_TUNING.smartFeedforward = data.readU8();
                FC.ADVANCED_TUNING.itermRelax = data.readU8();
                FC.ADVANCED_TUNING.itermRelaxType = data.readU8();
                FC.ADVANCED_TUNING.absoluteControlGain = data.readU8();
                FC.ADVANCED_TUNING.throttleBoost = data.readU8();
                FC.ADVANCED_TUNING.acroTrainerAngleLimit = data.readU8();
                FC.ADVANCED_TUNING.feedforwardRoll  = data.readU16();
                FC.ADVANCED_TUNING.feedforwardPitch = data.readU16();
                FC.ADVANCED_TUNING.feedforwardYaw   = data.readU16();
                FC.ADVANCED_TUNING.antiGravityMode  = data.readU8();

                FC.ADVANCED_TUNING.dMinRoll = data.readU8();
                FC.ADVANCED_TUNING.dMinPitch = data.readU8();
                FC.ADVANCED_TUNING.dMinYaw = data.readU8();
                FC.ADVANCED_TUNING.dMinGain = data.readU8();
                FC.ADVANCED_TUNING.dMinAdvance = data.readU8();
                FC.ADVANCED_TUNING.useIntegratedYaw = data.readU8();
                FC.ADVANCED_TUNING.integratedYawRelax = data.readU8();

                // Introduced in 1.42
                FC.ADVANCED_TUNING.itermRelaxCutoff = data.readU8();

                // Introduced in 1.43
                FC.ADVANCED_TUNING.motorOutputLimit = data.readU8();
                FC.ADVANCED_TUNING.autoProfileCellCount = data.read8();
                FC.ADVANCED_TUNING.idleMinRpm = data.readU8();

                // Introduced in 1.44
                FC.ADVANCED_TUNING.feedforward_averaging = data.readU8();
                FC.ADVANCED_TUNING.feedforward_smooth_factor = data.readU8();
                FC.ADVANCED_TUNING.feedforward_boost = data.readU8();
                FC.ADVANCED_TUNING.feedforward_max_rate_limit = data.readU8();
                FC.ADVANCED_TUNING.feedforward_jitter_factor = data.readU8();
                FC.ADVANCED_TUNING.vbat_sag_compensation = data.readU8();
                FC.ADVANCED_TUNING.thrustLinearization = data.readU8();

                // Introduced in 1.45
                FC.ADVANCED_TUNING.tpaMode = data.readU8();
                FC.ADVANCED_TUNING.tpaRate = parseFloat((data.readU8() / 100).toFixed(2));
                FC.ADVANCED_TUNING.tpaBreakpoint = data.readU16();

                FC.ADVANCED_TUNING_ACTIVE = { ...FC.ADVANCED_TUNING };
                break;
            case MSPCodes.MSP_SENSOR_CONFIG:
                FC.SENSOR_CONFIG.acc_hardware = data.readU8();
                FC.SENSOR_CONFIG.baro_hardware = data.readU8();
                FC.SENSOR_CONFIG.mag_hardware = data.readU8();
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                    FC.SENSOR_CONFIG.sonar_hardware = data.readU8();
                }
                break;
            case MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE:
                FC.SENSOR_CONFIG_ACTIVE.gyro_hardware = data.readU8();
                FC.SENSOR_CONFIG_ACTIVE.acc_hardware = data.readU8();
                FC.SENSOR_CONFIG_ACTIVE.baro_hardware = data.readU8();
                FC.SENSOR_CONFIG_ACTIVE.mag_hardware = data.readU8();
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                    FC.SENSOR_CONFIG_ACTIVE.sonar_hardware = data.readU8();
                }
                break;

            case MSPCodes.MSP_LED_STRIP_CONFIG:
                FC.LED_STRIP = [];

                let ledCount = (data.byteLength - 2) / 4;

                // The 32 bit config of each LED contains the following in LSB:
                // +----------------------------------------------------------------------------------------------------------+
                // | Directions - 6 bit | Color ID - 4 bit | Overlays - 10 bit | Function ID - 4 bit  | X - 4 bit | Y - 4 bit |
                // +----------------------------------------------------------------------------------------------------------+
                // According to betaflight/src/main/msp/msp.c
                // API 1.41 - add indicator for advanced profile support and the current profile selection
                // 0 = basic ledstrip available
                // 1 = advanced ledstrip available
                // Following byte is the current LED profile

                //Before API_VERSION_1_46 Parameters were 4 bit and Overlays 6 bit

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {

                    for (let i = 0; i < ledCount; i++) {

                        const mask = data.readU32();

                        const functionId = (mask >> 8) & 0xF;
                        const functions = [];
                        for (let baseFunctionLetterIndex = 0; baseFunctionLetterIndex < ledBaseFunctionLetters.length; baseFunctionLetterIndex++) {
                            if (functionId == baseFunctionLetterIndex) {
                                functions.push(ledBaseFunctionLetters[baseFunctionLetterIndex]);
                                break;
                            }
                        }

                        const overlayMask = (mask >> 12) & 0x3FF;
                        for (let overlayLetterIndex = 0; overlayLetterIndex < ledOverlayLetters.length; overlayLetterIndex++) {
                            if (bit_check(overlayMask, overlayLetterIndex)) {
                                functions.push(ledOverlayLetters[overlayLetterIndex]);
                            }
                        }

                        const directionMask = (mask >> 26) & 0x3F;
                        const directions = [];
                        for (let directionLetterIndex = 0; directionLetterIndex < ledDirectionLetters.length; directionLetterIndex++) {
                            if (bit_check(directionMask, directionLetterIndex)) {
                                directions.push(ledDirectionLetters[directionLetterIndex]);
                            }
                        }
                        const led = {
                            y: (mask) & 0xF,
                            x: (mask >> 4) & 0xF,
                            functions: functions,
                            color: (mask >> 22) & 0xF,
                            directions: directions,
                        };

                        FC.LED_STRIP.push(led);
                    }
                } else {
                    ledOverlayLetters = ledOverlayLetters.filter(x => x !== 'y'); //remove rainbow because it's only supported after API 1.46

                    for (let i = 0; i < ledCount; i++) {

                        const mask = data.readU32();

                        const functionId = (mask >> 8) & 0xF;
                        const functions = [];
                        for (let baseFunctionLetterIndex = 0; baseFunctionLetterIndex < ledBaseFunctionLetters.length; baseFunctionLetterIndex++) {
                            if (functionId == baseFunctionLetterIndex) {
                                functions.push(ledBaseFunctionLetters[baseFunctionLetterIndex]);
                                break;
                            }
                        }

                        const overlayMask = (mask >> 12) & 0x3F;
                        for (let overlayLetterIndex = 0; overlayLetterIndex < ledOverlayLetters.length; overlayLetterIndex++) {
                            if (bit_check(overlayMask, overlayLetterIndex)) {
                                functions.push(ledOverlayLetters[overlayLetterIndex]);
                            }
                        }

                        const directionMask = (mask >> 22) & 0x3F;
                        const directions = [];
                        for (let directionLetterIndex = 0; directionLetterIndex < ledDirectionLetters.length; directionLetterIndex++) {
                            if (bit_check(directionMask, directionLetterIndex)) {
                                directions.push(ledDirectionLetters[directionLetterIndex]);
                            }
                        }
                        const led = {
                            y: (mask) & 0xF,
                            x: (mask >> 4) & 0xF,
                            functions: functions,
                            color: (mask >> 18) & 0xF,
                            directions: directions,
                            parameters: (mask >> 28) & 0xF,
                        };

                        FC.LED_STRIP.push(led);
                    }
                }
                break;
            case MSPCodes.MSP_SET_LED_STRIP_CONFIG:
                console.log('Led strip config saved');
                break;
            case MSPCodes.MSP_LED_COLORS:

                FC.LED_COLORS = [];

                const ledcolorCount = data.byteLength / 4;

                for (let i = 0; i < ledcolorCount; i++) {

                    const color = {
                        h: data.readU16(),
                        s: data.readU8(),
                        v: data.readU8(),
                    };
                    FC.LED_COLORS.push(color);
                }

                break;
            case MSPCodes.MSP_SET_LED_COLORS:
                console.log('Led strip colors saved');
                break;
            case MSPCodes.MSP_LED_STRIP_MODECOLOR:
                FC.LED_MODE_COLORS = [];

                const colorCount = data.byteLength / 3;

                for (let i = 0; i < colorCount; i++) {

                    const modeColor = {
                        mode: data.readU8(),
                        direction: data.readU8(),
                        color: data.readU8(),
                    };
                    FC.LED_MODE_COLORS.push(modeColor);
                }
                break;
            case MSPCodes.MSP_SET_LED_STRIP_MODECOLOR:
                console.log('Led strip mode colors saved');
                break;

            case MSPCodes.MSP_DATAFLASH_SUMMARY:
                if (data.byteLength >= 13) {
                    flags = data.readU8();
                    FC.DATAFLASH.ready = (flags & 1) != 0;
                    FC.DATAFLASH.supported = (flags & 2) != 0;
                    FC.DATAFLASH.sectors = data.readU32();
                    FC.DATAFLASH.totalSize = data.readU32();
                    FC.DATAFLASH.usedSize = data.readU32();
                } else {
                    // Firmware version too old to support MSP_DATAFLASH_SUMMARY
                    FC.DATAFLASH.ready = false;
                    FC.DATAFLASH.supported = false;
                    FC.DATAFLASH.sectors = 0;
                    FC.DATAFLASH.totalSize = 0;
                    FC.DATAFLASH.usedSize = 0;
                }
                update_dataflash_global();
                break;
            case MSPCodes.MSP_DATAFLASH_READ:
                // No-op, let callback handle it
                break;
            case MSPCodes.MSP_DATAFLASH_ERASE:
                console.log("Data flash erase begun...");
                break;
            case MSPCodes.MSP_SDCARD_SUMMARY:
                flags = data.readU8();

                FC.SDCARD.supported = (flags & 0x01) != 0;
                FC.SDCARD.state = data.readU8();
                FC.SDCARD.filesystemLastError = data.readU8();
                FC.SDCARD.freeSizeKB = data.readU32();
                FC.SDCARD.totalSizeKB = data.readU32();
                break;
            case MSPCodes.MSP_BLACKBOX_CONFIG:
                FC.BLACKBOX.supported = (data.readU8() & 1) != 0;
                FC.BLACKBOX.blackboxDevice = data.readU8();
                FC.BLACKBOX.blackboxRateNum = data.readU8();
                FC.BLACKBOX.blackboxRateDenom = data.readU8();
                FC.BLACKBOX.blackboxPDenom = data.readU16();

                // Introduced in API version 1.44
                FC.BLACKBOX.blackboxSampleRate = data.readU8();

                // Introduced in API version 1.45
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                    FC.BLACKBOX.blackboxDisabledMask = data.readU32();
                }
                break;
            case MSPCodes.MSP_SET_BLACKBOX_CONFIG:
                console.log("Blackbox config saved");
                break;
            case MSPCodes.MSP_TRANSPONDER_CONFIG:
                let bytesRemaining = data.byteLength;
                const providerCount = data.readU8();
                bytesRemaining--;

                FC.TRANSPONDER.supported = providerCount > 0;
                FC.TRANSPONDER.providers = [];

                for (let i = 0; i < providerCount; i++) {
                    const provider = {
                        id: data.readU8(),
                        dataLength: data.readU8(),
                    };
                    bytesRemaining -= 2;

                    FC.TRANSPONDER.providers.push(provider);
                }
                FC.TRANSPONDER.provider = data.readU8();
                bytesRemaining--;

                FC.TRANSPONDER.data = [];

                for (let i = 0; i < bytesRemaining; i++) {
                    FC.TRANSPONDER.data.push(data.readU8());
                }
                break;

            case MSPCodes.MSP_SET_TRANSPONDER_CONFIG:
                console.log("Transponder config saved");
                break;

            case MSPCodes.MSP_VTX_CONFIG:

                FC.VTX_CONFIG.vtx_type = data.readU8();
                FC.VTX_CONFIG.vtx_band = data.readU8();
                FC.VTX_CONFIG.vtx_channel = data.readU8();
                FC.VTX_CONFIG.vtx_power = data.readU8();
                FC.VTX_CONFIG.vtx_pit_mode = data.readU8() != 0;
                FC.VTX_CONFIG.vtx_frequency = data.readU16();
                FC.VTX_CONFIG.vtx_device_ready = data.readU8() != 0;
                FC.VTX_CONFIG.vtx_low_power_disarm = data.readU8();

                // Introduced in API version 1.42
                FC.VTX_CONFIG.vtx_pit_mode_frequency = data.readU16();
                FC.VTX_CONFIG.vtx_table_available = data.readU8() != 0;
                FC.VTX_CONFIG.vtx_table_bands = data.readU8();
                FC.VTX_CONFIG.vtx_table_channels = data.readU8();
                FC.VTX_CONFIG.vtx_table_powerlevels = data.readU8();
                FC.VTX_CONFIG.vtx_table_clear = false;
                break;

            case MSPCodes.MSP_SET_VTX_CONFIG:
                console.log("VTX config sent");
                break;

            case MSPCodes.MSP_VTXTABLE_BAND:

                FC.VTXTABLE_BAND.vtxtable_band_number = data.readU8();

                const bandNameLength = data.readU8();
                FC.VTXTABLE_BAND.vtxtable_band_name = '';
                for (let i = 0; i < bandNameLength; i++) {
                    FC.VTXTABLE_BAND.vtxtable_band_name += String.fromCharCode(data.readU8());
                }

                FC.VTXTABLE_BAND.vtxtable_band_letter = String.fromCharCode(data.readU8());
                FC.VTXTABLE_BAND.vtxtable_band_is_factory_band = data.readU8() != 0;

                const bandFrequenciesLength = data.readU8();
                FC.VTXTABLE_BAND.vtxtable_band_frequencies = [];
                for (let i = 0; i < bandFrequenciesLength; i++) {
                    FC.VTXTABLE_BAND.vtxtable_band_frequencies.push(data.readU16());
                }

                break;

            case MSPCodes.MSP_SET_VTXTABLE_BAND:
                console.log("VTX band sent");
                break;

            case MSPCodes.MSP_VTXTABLE_POWERLEVEL:

                FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_number = data.readU8();
                FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_value = data.readU16();

                const powerLabelLength = data.readU8();
                FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label = '';
                for (let i = 0; i < powerLabelLength; i++) {
                    FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label += String.fromCharCode(data.readU8());
                }

                break;

            case MSPCodes.MSP_SET_SIMPLIFIED_TUNING:
                console.log('Tuning Sliders sent');
                break;

            case MSPCodes.MSP_SIMPLIFIED_TUNING:
                MspHelper.readPidSliderSettings(data);
                MspHelper.readDtermFilterSliderSettings(data);
                MspHelper.readGyroFilterSliderSettings(data);

                break;
            case MSPCodes.MSP_CALCULATE_SIMPLIFIED_PID:

                if (FC.TUNING_SLIDERS.slider_pids_mode > 0) {
                    FC.PIDS[0][0] = data.readU8();
                    FC.PIDS[0][1] = data.readU8();
                    FC.PIDS[0][2] = data.readU8();
                    FC.ADVANCED_TUNING.dMinRoll = data.readU8();
                    FC.ADVANCED_TUNING.feedforwardRoll = data.readU16();

                    FC.PIDS[1][0] = data.readU8();
                    FC.PIDS[1][1] = data.readU8();
                    FC.PIDS[1][2] = data.readU8();
                    FC.ADVANCED_TUNING.dMinPitch = data.readU8();
                    FC.ADVANCED_TUNING.feedforwardPitch = data.readU16();
                }

                if (FC.TUNING_SLIDERS.slider_pids_mode > 1) {
                    FC.PIDS[2][0] = data.readU8();
                    FC.PIDS[2][1] = data.readU8();
                    FC.PIDS[2][2] = data.readU8();
                    FC.ADVANCED_TUNING.dMinYaw = data.readU8();
                    FC.ADVANCED_TUNING.feedforwardYaw = data.readU16();
                }

                break;
            case MSPCodes.MSP_CALCULATE_SIMPLIFIED_GYRO:
                MspHelper.readGyroFilterSliderSettings(data);

                break;
            case MSPCodes.MSP_CALCULATE_SIMPLIFIED_DTERM:
                MspHelper.readDtermFilterSliderSettings(data);

                break;
            case MSPCodes.MSP_VALIDATE_SIMPLIFIED_TUNING:
                FC.TUNING_SLIDERS.slider_pids_valid = data.readU8();
                FC.TUNING_SLIDERS.slider_gyro_valid = data.readU8();
                FC.TUNING_SLIDERS.slider_dterm_valid = data.readU8();

                break;
            case MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL:
                console.log("VTX powerlevel sent");
                break;
            case MSPCodes.MSP_SET_MODE_RANGE:
                console.log('Mode range saved');
                break;
            case MSPCodes.MSP_SET_ADJUSTMENT_RANGE:
                console.log('Adjustment range saved');
                break;
            case MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG:
                console.log('Board alignment saved');
                break;
            case MSPCodes.MSP_PID_CONTROLLER:
                FC.PID.controller = data.readU8();
                break;
            case MSPCodes.MSP_SET_PID_CONTROLLER:
                console.log('PID controller changed');
                break;
            case MSPCodes.MSP_SET_LOOP_TIME:
                console.log('Looptime saved');
                break;
            case MSPCodes.MSP_SET_ARMING_CONFIG:
                console.log('Arming config saved');
                break;
            case MSPCodes.MSP_SET_RESET_CURR_PID:
                console.log('Current PID profile reset');
                break;
            case MSPCodes.MSP_SET_MOTOR_3D_CONFIG:
                console.log('3D settings saved');
                break;
            case MSPCodes.MSP_SET_MIXER_CONFIG:
                console.log('Mixer config saved');
                break;
            case MSPCodes.MSP_SET_RC_DEADBAND:
                console.log('Rc controls settings saved');
                break;
            case MSPCodes.MSP_SET_SENSOR_ALIGNMENT:
                console.log('Sensor alignment saved');
                break;
            case MSPCodes.MSP_SET_RX_CONFIG:
                console.log('Rx config saved');
                break;
            case MSPCodes.MSP_SET_RXFAIL_CONFIG:
                console.log('Rxfail config saved');
                break;
            case MSPCodes.MSP_SET_FAILSAFE_CONFIG:
                console.log('Failsafe config saved');
                break;
            case MSPCodes.MSP_OSD_CANVAS:
                OSD.data.VIDEO_COLS['HD'] = data.readU8();
                OSD.data.VIDEO_ROWS['HD'] = data.readU8();
                OSD.data.VIDEO_BUFFER_CHARS['HD'] = OSD.data.VIDEO_COLS['HD'] * OSD.data.VIDEO_ROWS['HD'];
                console.log(`Canvas ${OSD.data.VIDEO_COLS['HD']} x ${OSD.data.VIDEO_ROWS['HD']}`);
                break;
            case MSPCodes.MSP_SET_OSD_CANVAS:
                console.log('OSD Canvas config set');
                break;
            case MSPCodes.MSP_OSD_CONFIG:
                break;
            case MSPCodes.MSP_SET_OSD_CONFIG:
                console.log('OSD config set');
                break;
            case MSPCodes.MSP_OSD_CHAR_READ:
                break;
            case MSPCodes.MSP_OSD_CHAR_WRITE:
                console.log('OSD char uploaded');
                break;
            case MSPCodes.MSP_SET_NAME:
                console.log('Name set');
                break;
            case MSPCodes.MSP2_SET_TEXT:
                console.log('Text set');
                break;
            case MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES:
                break;
            case MSPCodes.MSP_SET_FILTER_CONFIG:
                // removed as this fires a lot with firmware sliders console.log('Filter config set');
                break;
            case MSPCodes.MSP_SET_ADVANCED_CONFIG:
                console.log('Advanced config parameters set');
                break;
            case MSPCodes.MSP_SET_SENSOR_CONFIG:
                console.log('Sensor config parameters set');
                break;
            case MSPCodes.MSP_COPY_PROFILE:
                console.log('Copy profile');
                break;
            case MSPCodes.MSP_ARMING_DISABLE:
                console.log('Arming disable');
                break;
            case MSPCodes.MSP_SET_RTC:
                console.log('Real time clock set');
                break;
            case MSPCodes.MSP2_SET_MOTOR_OUTPUT_REORDERING:
                console.log('Motor output reordering set');
                break;
            case MSPCodes.MSP2_SEND_DSHOT_COMMAND:
                console.log('DSHOT command sent');
                break;

            case MSPCodes.MSP_MULTIPLE_MSP:

                let hasReturnedSomeCommand = false; // To avoid infinite loops

                while (data.offset < data.byteLength) {

                    hasReturnedSomeCommand = true;

                    const command = self.mspMultipleCache.shift();
                    const payloadSize = data.readU8();

                    if (payloadSize != 0) {

                        const currentDataHandler = {
                            code         : command,
                            dataView     : new DataView(data.buffer, data.offset, payloadSize),
                            callbacks    : [],
                        };

                        self.process_data(currentDataHandler);

                        data.offset += payloadSize;
                    }
                }

                if (hasReturnedSomeCommand) {
                    // Send again MSP messages missing, the buffer in the FC was too small
                    if (self.mspMultipleCache.length > 0) {

                        const partialBuffer = [];
                        for (const instance of self.mspMultipleCache) {
                            partialBuffer.push8(instance);
                        }

                        MSP.send_message(MSPCodes.MSP_MULTIPLE_MSP, partialBuffer, false, dataHandler.callbacks);
                        dataHandler.callbacks = [];
                    }
                } else {
                    console.log("MSP Multiple can't process the command");
                    self.mspMultipleCache = [];
                }

                break;

            default:
                console.log(`Unknown code detected: ${code} (${getMSPCodeName(code)})`);
        } else {
            console.log(`FC reports unsupported message error: ${code} (${getMSPCodeName(code)})`);

            if (code === MSPCodes.MSP_SET_REBOOT) {
                TABS.onboard_logging.mscRebootFailedCallback();
            }
        }

    } else {
        console.warn(`code: ${code} (${getMSPCodeName(code)}) - crc failed`);
    }
    // trigger callbacks, cleanup/remove callback after trigger
    for (let i = dataHandler.callbacks.length - 1; i >= 0; i--) { // iterating in reverse because we use .splice which modifies array length
        if (dataHandler.callbacks[i]?.code === code) {
            // save callback reference
            const callback = dataHandler.callbacks[i].callback;
            const callbackOnError = dataHandler.callbacks[i].callbackOnError;

            // remove timeout
            clearInterval(dataHandler.callbacks[i].timer);

            // remove object from array
            dataHandler.callbacks.splice(i, 1);
            if (!crcError || callbackOnError) {
                // fire callback
                if (callback) callback({'command': code, 'data': data, 'length': data.byteLength, 'crcError': crcError});
            } else {
                console.warn(`code: ${code} - crc failed. No callback`);
            }
        }
    }
};

/**
 * Encode the request body for the MSP request with the given code and return it as an array of bytes.
 * The second (optional) 'modifierCode' argument can be used to extend/specify the behavior of certain MSP codes
 * (e.g. 'MSPCodes.MSP2_GET_TEXT' and 'MSPCodes.MSP2_SET_TEXT')
 */
MspHelper.prototype.crunch = function(code, modifierCode = undefined) {
    const buffer = [];
    const self = this;

    switch (code) {
        case MSPCodes.MSP_SET_FEATURE_CONFIG:
            const featureMask = FC.FEATURE_CONFIG.features.getMask();
            buffer.push32(featureMask);
            break;
        case MSPCodes.MSP_SET_BEEPER_CONFIG:
            const beeperDisabledMask = FC.BEEPER_CONFIG.beepers.getDisabledMask();
            buffer.push32(beeperDisabledMask);
            buffer.push8(FC.BEEPER_CONFIG.dshotBeaconTone);
            buffer.push32(FC.BEEPER_CONFIG.dshotBeaconConditions.getDisabledMask());
            break;
        case MSPCodes.MSP_SET_MIXER_CONFIG:
            buffer.push8(FC.MIXER_CONFIG.mixer);
            buffer.push8(FC.MIXER_CONFIG.reverseMotorDir);
            break;
        case MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG:
            buffer.push16(FC.BOARD_ALIGNMENT_CONFIG.roll)
                .push16(FC.BOARD_ALIGNMENT_CONFIG.pitch)
                .push16(FC.BOARD_ALIGNMENT_CONFIG.yaw);
            break;
        case MSPCodes.MSP_SET_PID_CONTROLLER:
            buffer.push8(FC.PID.controller);
            break;
        case MSPCodes.MSP_SET_PID:
            for (let i = 0; i < FC.PIDS.length; i++) {
                for (let j = 0; j < 3; j++) {
                    buffer.push8(parseInt(FC.PIDS[i][j]));
                }
            }
            break;
        case MSPCodes.MSP_SET_RC_TUNING:
            buffer.push8(Math.round(FC.RC_TUNING.RC_RATE * 100))
                .push8(Math.round(FC.RC_TUNING.RC_EXPO * 100))
                .push8(Math.round(FC.RC_TUNING.roll_rate * 100))
                .push8(Math.round(FC.RC_TUNING.pitch_rate * 100))
                .push8(Math.round(FC.RC_TUNING.yaw_rate * 100));
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                buffer.push8(0);
            } else {
                buffer.push8(Math.round(FC.RC_TUNING.dynamic_THR_PID * 100));
            }
            buffer.push8(Math.round(FC.RC_TUNING.throttle_MID * 100));
            buffer.push8(Math.round(FC.RC_TUNING.throttle_EXPO * 100));
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                buffer.push16(0);
            } else {
                buffer.push16(FC.RC_TUNING.dynamic_THR_breakpoint);
            }
            buffer.push8(Math.round(FC.RC_TUNING.RC_YAW_EXPO * 100));
            buffer.push8(Math.round(FC.RC_TUNING.rcYawRate * 100));
            buffer.push8(Math.round(FC.RC_TUNING.rcPitchRate * 100));
            buffer.push8(Math.round(FC.RC_TUNING.RC_PITCH_EXPO * 100));
            buffer.push8(FC.RC_TUNING.throttleLimitType);
            buffer.push8(FC.RC_TUNING.throttleLimitPercent);

            // Introduced in 1.42
            buffer.push16(FC.RC_TUNING.roll_rate_limit);
            buffer.push16(FC.RC_TUNING.pitch_rate_limit);
            buffer.push16(FC.RC_TUNING.yaw_rate_limit);

            // Introduced in 1.43
            buffer.push8(FC.RC_TUNING.rates_type);
            break;
        case MSPCodes.MSP_SET_RX_MAP:
            for (let i = 0; i < FC.RC_MAP.length; i++) {
                buffer.push8(FC.RC_MAP[i]);
            }
            break;
        case MSPCodes.MSP_SET_ACC_TRIM:
            buffer.push16(FC.CONFIG.accelerometerTrims[0])
                .push16(FC.CONFIG.accelerometerTrims[1]);
            break;
        case MSPCodes.MSP_SET_ARMING_CONFIG:
            buffer.push8(FC.ARMING_CONFIG.auto_disarm_delay)
                .push8(0) // was disarm_kill_switch
                .push8(FC.ARMING_CONFIG.small_angle);
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
                    buffer.push8(FC.ARMING_CONFIG.gyro_cal_on_first_arm);
                }
            break;
        case MSPCodes.MSP_SET_LOOP_TIME:
            buffer.push16(FC.FC_CONFIG.loopTime);
            break;
        case MSPCodes.MSP_SET_MISC:
            buffer.push16(FC.RX_CONFIG.midrc)
                .push16(FC.MOTOR_CONFIG.minthrottle)
                .push16(FC.MOTOR_CONFIG.maxthrottle)
                .push16(FC.MOTOR_CONFIG.mincommand)
                .push16(FC.MISC.failsafe_throttle)
                .push8(FC.GPS_CONFIG.provider)
                .push8(FC.MISC.gps_baudrate)
                .push8(FC.GPS_CONFIG.ublox_sbas)
                .push8(FC.MISC.multiwiicurrentoutput)
                .push8(FC.RSSI_CONFIG.channel)
                .push8(FC.MISC.placeholder2)
                .push16(0) // was mag_declination
                .push8(FC.MISC.vbatscale)
                .push8(Math.round(FC.MISC.vbatmincellvoltage * 10))
                .push8(Math.round(FC.MISC.vbatmaxcellvoltage * 10))
                .push8(Math.round(FC.MISC.vbatwarningcellvoltage * 10));
            break;
        case MSPCodes.MSP_SET_MOTOR_CONFIG:
            buffer.push16(FC.MOTOR_CONFIG.minthrottle)
                .push16(FC.MOTOR_CONFIG.maxthrottle)
                .push16(FC.MOTOR_CONFIG.mincommand);

            // Introduced in 1.42
            buffer.push8(FC.MOTOR_CONFIG.motor_poles);
            buffer.push8(FC.MOTOR_CONFIG.use_dshot_telemetry ? 1 : 0);
            break;
        case MSPCodes.MSP_SET_GPS_CONFIG:
            buffer.push8(FC.GPS_CONFIG.provider)
                .push8(FC.GPS_CONFIG.ublox_sbas)
                .push8(FC.GPS_CONFIG.auto_config)
                .push8(FC.GPS_CONFIG.auto_baud);

            // Introduced in 1.43
            buffer.push8(FC.GPS_CONFIG.home_point_once)
                .push8(FC.GPS_CONFIG.ublox_use_galileo);
            break;
        case MSPCodes.MSP_SET_GPS_RESCUE:
            buffer.push16(FC.GPS_RESCUE.angle)
                .push16(FC.GPS_RESCUE.returnAltitudeM)
                .push16(FC.GPS_RESCUE.descentDistanceM)
                .push16(FC.GPS_RESCUE.groundSpeed)
                .push16(FC.GPS_RESCUE.throttleMin)
                .push16(FC.GPS_RESCUE.throttleMax)
                .push16(FC.GPS_RESCUE.throttleHover)
                .push8(FC.GPS_RESCUE.sanityChecks)
                .push8(FC.GPS_RESCUE.minSats);

            // Introduced in 1.43
            buffer.push16(FC.GPS_RESCUE.ascendRate)
                .push16(FC.GPS_RESCUE.descendRate)
                .push8(FC.GPS_RESCUE.allowArmingWithoutFix)
                .push8(FC.GPS_RESCUE.altitudeMode);

            // Introduced in 1.44
            buffer.push16(FC.GPS_RESCUE.minStartDistM);

            // Introduced in 1.46
            buffer.push16(FC.GPS_RESCUE.initialClimbM);
            break;
        case MSPCodes.MSP_SET_COMPASS_CONFIG:
            buffer.push16(Math.round(10.0 * parseFloat(FC.COMPASS_CONFIG.mag_declination)));
            break;
        case MSPCodes.MSP_SET_RSSI_CONFIG:
            buffer.push8(FC.RSSI_CONFIG.channel);
            break;
        case MSPCodes.MSP_SET_BATTERY_CONFIG:
            buffer.push8(Math.round(FC.BATTERY_CONFIG.vbatmincellvoltage * 10))
                .push8(Math.round(FC.BATTERY_CONFIG.vbatmaxcellvoltage * 10))
                .push8(Math.round(FC.BATTERY_CONFIG.vbatwarningcellvoltage * 10))
                .push16(FC.BATTERY_CONFIG.capacity)
                .push8(FC.BATTERY_CONFIG.voltageMeterSource)
                .push8(FC.BATTERY_CONFIG.currentMeterSource)
                .push16(Math.round(FC.BATTERY_CONFIG.vbatmincellvoltage * 100))
                .push16(Math.round(FC.BATTERY_CONFIG.vbatmaxcellvoltage * 100))
                .push16(Math.round(FC.BATTERY_CONFIG.vbatwarningcellvoltage * 100));
            break;
        case MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG:
            // not used
           break;
        case MSPCodes.MSP_SET_CURRENT_METER_CONFIG:
            // not used
            break;
        case MSPCodes.MSP_SET_RX_CONFIG:
            buffer.push8(FC.RX_CONFIG.serialrx_provider)
                .push16(FC.RX_CONFIG.stick_max)
                .push16(FC.RX_CONFIG.stick_center)
                .push16(FC.RX_CONFIG.stick_min)
                .push8(FC.RX_CONFIG.spektrum_sat_bind)
                .push16(FC.RX_CONFIG.rx_min_usec)
                .push16(FC.RX_CONFIG.rx_max_usec)
                .push8(FC.RX_CONFIG.rcInterpolation)
                .push8(FC.RX_CONFIG.rcInterpolationInterval)
                .push16(FC.RX_CONFIG.airModeActivateThreshold)
                .push8(FC.RX_CONFIG.rxSpiProtocol)
                .push32(FC.RX_CONFIG.rxSpiId)
                .push8(FC.RX_CONFIG.rxSpiRfChannelCount)
                .push8(FC.RX_CONFIG.fpvCamAngleDegrees)
                .push8(FC.RX_CONFIG.rcInterpolationChannels)
                .push8(FC.RX_CONFIG.rcSmoothingType)
                .push8(FC.RX_CONFIG.rcSmoothingSetpointCutoff)
                .push8(FC.RX_CONFIG.rcSmoothingFeedforwardCutoff)
                .push8(FC.RX_CONFIG.rcSmoothingInputType)
                .push8(FC.RX_CONFIG.rcSmoothingDerivativeType);

            // Introduced in 1.42
            buffer.push8(FC.RX_CONFIG.usbCdcHidType)
            .push8(FC.RX_CONFIG.rcSmoothingAutoFactor);

            // Introduced in 1.44
            buffer.push8(FC.RX_CONFIG.rcSmoothingMode);

            // Introduced in 1.45
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                FC.RX_CONFIG.elrsUid.forEach(b => buffer.push8(b));
            }

            // Introduced in 1.47
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
                buffer.push8(FC.RX_CONFIG.elrsModelId);
            }

            break;

        case MSPCodes.MSP_SET_FAILSAFE_CONFIG:
            buffer.push8(FC.FAILSAFE_CONFIG.failsafe_delay)
                .push8(FC.FAILSAFE_CONFIG.failsafe_off_delay)
                .push16(FC.FAILSAFE_CONFIG.failsafe_throttle)
                .push8(FC.FAILSAFE_CONFIG.failsafe_switch_mode)
                .push16(FC.FAILSAFE_CONFIG.failsafe_throttle_low_delay)
                .push8(FC.FAILSAFE_CONFIG.failsafe_procedure);
            break;

        case MSPCodes.MSP_SET_TRANSPONDER_CONFIG:
            buffer.push8(FC.TRANSPONDER.provider); //

            for (let i = 0; i < FC.TRANSPONDER.data.length; i++) {
                buffer.push8(FC.TRANSPONDER.data[i]);
            }
            break;

        case MSPCodes.MSP_SET_CHANNEL_FORWARDING:
            for (let i = 0; i < FC.SERVO_CONFIG.length; i++) {
                let out = FC.SERVO_CONFIG[i].indexOfChannelToForward;
                if (out == undefined) {
                    out = 255; // Cleanflight defines "CHANNEL_FORWARDING_DISABLED" as "(uint8_t)0xFF"
                }
                buffer.push8(out);
            }
            break;
        case MSPCodes.MSP_SET_CF_SERIAL_CONFIG:
            for (let i = 0; i < FC.SERIAL_CONFIG.ports.length; i++) {
                const serialPort = FC.SERIAL_CONFIG.ports[i];

                buffer.push8(serialPort.identifier);

                const functionMask = self.serialPortFunctionsToMask(serialPort.functions);
                buffer.push16(functionMask)
                    .push8(self.BAUD_RATES.indexOf(serialPort.msp_baudrate))
                    .push8(self.BAUD_RATES.indexOf(serialPort.gps_baudrate))
                    .push8(self.BAUD_RATES.indexOf(serialPort.telemetry_baudrate))
                    .push8(self.BAUD_RATES.indexOf(serialPort.blackbox_baudrate));
            }
            break;

        case MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG:
            buffer.push8(FC.SERIAL_CONFIG.ports.length);

            for (let i = 0; i < FC.SERIAL_CONFIG.ports.length; i++) {
                const serialPort = FC.SERIAL_CONFIG.ports[i];

                buffer.push8(serialPort.identifier);

                const functionMask = self.serialPortFunctionsToMask(serialPort.functions);
                buffer.push32(functionMask)
                    .push8(self.BAUD_RATES.indexOf(serialPort.msp_baudrate))
                    .push8(self.BAUD_RATES.indexOf(serialPort.gps_baudrate))
                    .push8(self.BAUD_RATES.indexOf(serialPort.telemetry_baudrate))
                    .push8(self.BAUD_RATES.indexOf(serialPort.blackbox_baudrate));
            }
            break;

        case MSPCodes.MSP_SET_MOTOR_3D_CONFIG:
            buffer.push16(FC.MOTOR_3D_CONFIG.deadband3d_low)
                .push16(FC.MOTOR_3D_CONFIG.deadband3d_high)
                .push16(FC.MOTOR_3D_CONFIG.neutral);
            break;

        case MSPCodes.MSP_SET_RC_DEADBAND:
            buffer.push8(FC.RC_DEADBAND_CONFIG.deadband)
                .push8(FC.RC_DEADBAND_CONFIG.yaw_deadband)
                .push8(FC.RC_DEADBAND_CONFIG.alt_hold_deadband)
                .push16(FC.RC_DEADBAND_CONFIG.deadband3d_throttle);
            break;

        case MSPCodes.MSP_SET_SENSOR_ALIGNMENT:
            buffer.push8(FC.SENSOR_ALIGNMENT.align_gyro)
                .push8(FC.SENSOR_ALIGNMENT.align_acc)
                .push8(FC.SENSOR_ALIGNMENT.align_mag)
                .push8(FC.SENSOR_ALIGNMENT.gyro_to_use)
                .push8(FC.SENSOR_ALIGNMENT.gyro_1_align)
                .push8(FC.SENSOR_ALIGNMENT.gyro_2_align);
            break;
        case MSPCodes.MSP_SET_ADVANCED_CONFIG:
            buffer.push8(FC.PID_ADVANCED_CONFIG.gyro_sync_denom)
                .push8(FC.PID_ADVANCED_CONFIG.pid_process_denom)
                .push8(FC.PID_ADVANCED_CONFIG.use_unsyncedPwm)
                .push8(EscProtocols.ReorderPwmProtocols(FC.CONFIG.apiVersion, FC.PID_ADVANCED_CONFIG.fast_pwm_protocol))
                .push16(FC.PID_ADVANCED_CONFIG.motor_pwm_rate)
                .push16(FC.PID_ADVANCED_CONFIG.digitalIdlePercent * 100)
                .push8(0); // gyroUse32kHz not used

            // Introduced in 1.42
            buffer.push8(FC.PID_ADVANCED_CONFIG.motorPwmInversion)
                .push8(FC.SENSOR_ALIGNMENT.gyro_to_use) // We don't want to double up on storing this state
                .push8(FC.PID_ADVANCED_CONFIG.gyroHighFsr)
                .push8(FC.PID_ADVANCED_CONFIG.gyroMovementCalibThreshold)
                .push16(FC.PID_ADVANCED_CONFIG.gyroCalibDuration)
                .push16(FC.PID_ADVANCED_CONFIG.gyroOffsetYaw)
                .push8(FC.PID_ADVANCED_CONFIG.gyroCheckOverflow)
                .push8(FC.PID_ADVANCED_CONFIG.debugMode);

            break;
        case MSPCodes.MSP_SET_FILTER_CONFIG:
            buffer.push8(FC.FILTER_CONFIG.gyro_lowpass_hz)
                .push16(FC.FILTER_CONFIG.dterm_lowpass_hz)
                .push16(FC.FILTER_CONFIG.yaw_lowpass_hz)
                .push16(FC.FILTER_CONFIG.gyro_notch_hz)
                .push16(FC.FILTER_CONFIG.gyro_notch_cutoff)
                .push16(FC.FILTER_CONFIG.dterm_notch_hz)
                .push16(FC.FILTER_CONFIG.dterm_notch_cutoff)
                .push16(FC.FILTER_CONFIG.gyro_notch2_hz)
                .push16(FC.FILTER_CONFIG.gyro_notch2_cutoff)
                .push8(FC.FILTER_CONFIG.dterm_lowpass_type)
                .push8(FC.FILTER_CONFIG.gyro_hardware_lpf)
                .push8(0) // gyro_32khz_hardware_lpf not used
                .push16(FC.FILTER_CONFIG.gyro_lowpass_hz)
                .push16(FC.FILTER_CONFIG.gyro_lowpass2_hz)
                .push8(FC.FILTER_CONFIG.gyro_lowpass_type)
                .push8(FC.FILTER_CONFIG.gyro_lowpass2_type)
                .push16(FC.FILTER_CONFIG.dterm_lowpass2_hz)
                .push8(FC.FILTER_CONFIG.dterm_lowpass2_type)
                .push16(FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz)
                .push16(FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz)
                .push16(FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz)
                .push16(FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz);

            // Introduced in 1.42
            buffer.push8(FC.FILTER_CONFIG.dyn_notch_range)
                .push8(FC.FILTER_CONFIG.dyn_notch_width_percent)
                .push16(FC.FILTER_CONFIG.dyn_notch_q)
                .push16(FC.FILTER_CONFIG.dyn_notch_min_hz)
                .push8(FC.FILTER_CONFIG.gyro_rpm_notch_harmonics)
                .push8(FC.FILTER_CONFIG.gyro_rpm_notch_min_hz);

            // Introduced in 1.43
            buffer.push16(FC.FILTER_CONFIG.dyn_notch_max_hz);

            // Introduced in 1.44
            buffer.push8(FC.FILTER_CONFIG.dyn_lpf_curve_expo)
                    .push8(FC.FILTER_CONFIG.dyn_notch_count);
            break;
        case MSPCodes.MSP_SET_PID_ADVANCED:
            buffer.push16(FC.ADVANCED_TUNING.rollPitchItermIgnoreRate)
                .push16(FC.ADVANCED_TUNING.yawItermIgnoreRate)
                .push16(FC.ADVANCED_TUNING.yaw_p_limit)
                .push8(FC.ADVANCED_TUNING.deltaMethod)
                .push8(FC.ADVANCED_TUNING.vbatPidCompensation)
                .push8(FC.ADVANCED_TUNING.feedforwardTransition)
                .push8(Math.min(FC.ADVANCED_TUNING.dtermSetpointWeight, 254))
                .push8(FC.ADVANCED_TUNING.toleranceBand)
                .push8(FC.ADVANCED_TUNING.toleranceBandReduction)
                .push8(FC.ADVANCED_TUNING.itermThrottleGain)
                .push16(FC.ADVANCED_TUNING.pidMaxVelocity)
                .push16(FC.ADVANCED_TUNING.pidMaxVelocityYaw)
                .push8(FC.ADVANCED_TUNING.levelAngleLimit)
                .push8(FC.ADVANCED_TUNING.levelSensitivity)
                .push16(FC.ADVANCED_TUNING.itermThrottleThreshold);

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                buffer.push16(FC.ADVANCED_TUNING.antiGravityGain);
            } else {
                buffer.push16(FC.ADVANCED_TUNING.itermAcceleratorGain);
            }

            buffer.push16(FC.ADVANCED_TUNING.dtermSetpointWeight)
                .push8(FC.ADVANCED_TUNING.itermRotation)
                .push8(FC.ADVANCED_TUNING.smartFeedforward)
                .push8(FC.ADVANCED_TUNING.itermRelax)
                .push8(FC.ADVANCED_TUNING.itermRelaxType)
                .push8(FC.ADVANCED_TUNING.absoluteControlGain)
                .push8(FC.ADVANCED_TUNING.throttleBoost)
                .push8(FC.ADVANCED_TUNING.acroTrainerAngleLimit)
                .push16(FC.ADVANCED_TUNING.feedforwardRoll)
                .push16(FC.ADVANCED_TUNING.feedforwardPitch)
                .push16(FC.ADVANCED_TUNING.feedforwardYaw)
                .push8(FC.ADVANCED_TUNING.antiGravityMode)
                .push8(FC.ADVANCED_TUNING.dMinRoll)
                .push8(FC.ADVANCED_TUNING.dMinPitch)
                .push8(FC.ADVANCED_TUNING.dMinYaw)
                .push8(FC.ADVANCED_TUNING.dMinGain)
                .push8(FC.ADVANCED_TUNING.dMinAdvance)
                .push8(FC.ADVANCED_TUNING.useIntegratedYaw)
                .push8(FC.ADVANCED_TUNING.integratedYawRelax);

            // Introduced in 1.42
            buffer.push8(FC.ADVANCED_TUNING.itermRelaxCutoff);

            // Introduced in 1.43
            buffer.push8(FC.ADVANCED_TUNING.motorOutputLimit)
                .push8(FC.ADVANCED_TUNING.autoProfileCellCount)
                .push8(FC.ADVANCED_TUNING.idleMinRpm);

            // Introduced in 1.44
            buffer.push8(FC.ADVANCED_TUNING.feedforward_averaging)
                .push8(FC.ADVANCED_TUNING.feedforward_smooth_factor)
                .push8(FC.ADVANCED_TUNING.feedforward_boost)
                .push8(FC.ADVANCED_TUNING.feedforward_max_rate_limit)
                .push8(FC.ADVANCED_TUNING.feedforward_jitter_factor)
                .push8(FC.ADVANCED_TUNING.vbat_sag_compensation)
                .push8(FC.ADVANCED_TUNING.thrustLinearization);

            // Introduced in 1.45
            buffer.push8(FC.ADVANCED_TUNING.tpaMode);
            buffer.push8(Math.round(FC.ADVANCED_TUNING.tpaRate * 100));
            buffer.push16(FC.ADVANCED_TUNING.tpaBreakpoint);
            break;
        case MSPCodes.MSP_SET_SENSOR_CONFIG:
            buffer.push8(FC.SENSOR_CONFIG.acc_hardware)
                .push8(FC.SENSOR_CONFIG.baro_hardware)
                .push8(FC.SENSOR_CONFIG.mag_hardware);
            break;

        case MSPCodes.MSP_SET_NAME:
            const MSP_BUFFER_SIZE = 64;
            for (let i = 0; i<FC.CONFIG.name.length && i<MSP_BUFFER_SIZE; i++) {
                buffer.push8(FC.CONFIG.name.charCodeAt(i));
            }
            break;

        case MSPCodes.MSP2_GET_TEXT:
            buffer.push8(modifierCode);
            break;

        case MSPCodes.MSP2_SET_TEXT:
            switch (modifierCode) {
                case MSPCodes.PILOT_NAME:
                    self.setText(buffer, modifierCode, FC.CONFIG.pilotName, 16);
                    break;
                case MSPCodes.CRAFT_NAME:
                    self.setText(buffer, modifierCode, FC.CONFIG.craftName, 16);
                    break;
                case MSPCodes.PID_PROFILE_NAME:
                    self.setText(buffer, modifierCode, FC.CONFIG.pidProfileNames[FC.CONFIG.profile], 8);
                    break;
                case MSPCodes.RATE_PROFILE_NAME:
                    self.setText(buffer, modifierCode, FC.CONFIG.rateProfileNames[FC.CONFIG.rateProfile], 8);
                    break;
                default:
                    console.log('Unsupported text type');
                    break;
            }
            break;

        case MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES:
            break;

        case MSPCodes.MSP_SET_BLACKBOX_CONFIG:
            buffer.push8(FC.BLACKBOX.blackboxDevice)
                .push8(FC.BLACKBOX.blackboxRateNum)
                .push8(FC.BLACKBOX.blackboxRateDenom)
                .push16(FC.BLACKBOX.blackboxPDenom);

            // Introduced in 1.44
            buffer.push8(FC.BLACKBOX.blackboxSampleRate);

            // Introduced in 1.45
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
                buffer.push32(FC.BLACKBOX.blackboxDisabledMask);
            }

            break;

        case MSPCodes.MSP_COPY_PROFILE:
            buffer.push8(FC.COPY_PROFILE.type)
                .push8(FC.COPY_PROFILE.dstProfile)
                .push8(FC.COPY_PROFILE.srcProfile);
            break;
        case MSPCodes.MSP_ARMING_DISABLE:
            let value;
            if (FC.CONFIG.armingDisabled) {
                value = 1;
            } else {
                value = 0;
            }
            buffer.push8(value);

            if (FC.CONFIG.runawayTakeoffPreventionDisabled) {
                value = 1;
            } else {
                value = 0;
            }
            // This will be ignored if `armingDisabled` is true
            buffer.push8(value);

            break;
        case MSPCodes.MSP_SET_RTC:
            const now = new Date();

            const timestamp = now.getTime();
            const secs = timestamp / 1000;
            const millis = timestamp % 1000;
            buffer.push32(secs);
            buffer.push16(millis);

            break;

        case MSPCodes.MSP_SET_VTX_CONFIG:

            buffer.push16(FC.VTX_CONFIG.vtx_frequency)
                .push8(FC.VTX_CONFIG.vtx_power)
                .push8(FC.VTX_CONFIG.vtx_pit_mode ? 1 : 0)
                .push8(FC.VTX_CONFIG.vtx_low_power_disarm);

            // Introduced in 1.42
            buffer.push16(FC.VTX_CONFIG.vtx_pit_mode_frequency)
                .push8(FC.VTX_CONFIG.vtx_band)
                .push8(FC.VTX_CONFIG.vtx_channel)
                .push16(FC.VTX_CONFIG.vtx_frequency)
                .push8(FC.VTX_CONFIG.vtx_table_bands)
                .push8(FC.VTX_CONFIG.vtx_table_channels)
                .push8(FC.VTX_CONFIG.vtx_table_powerlevels)
                .push8(FC.VTX_CONFIG.vtx_table_clear ? 1 : 0);

            break;

        case MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL:

            buffer.push8(FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_number)
                .push16(FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_value)
                .push8(FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label.length);

            for (let i = 0; i < FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label.length; i++) {
                buffer.push8(FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label.charCodeAt(i));
            }

            break;

        case MSPCodes.MSP_SET_VTXTABLE_BAND:

            buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_number);

            buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_name.length);
            for (let i = 0; i < FC.VTXTABLE_BAND.vtxtable_band_name.length; i++) {
                buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_name.charCodeAt(i));
            }

            if (FC.VTXTABLE_BAND.vtxtable_band_letter != '') {
                buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_letter.charCodeAt(0));
            } else {
                buffer.push8(' '.charCodeAt(0));
            }
            buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_is_factory_band ? 1 : 0);

            buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_frequencies.length);
            for (let i = 0; i < FC.VTXTABLE_BAND.vtxtable_band_frequencies.length; i++) {
                buffer.push16(FC.VTXTABLE_BAND.vtxtable_band_frequencies[i]);
            }

            break;

        case MSPCodes.MSP_MULTIPLE_MSP:

            while (FC.MULTIPLE_MSP.msp_commands.length > 0) {
                const mspCommand = FC.MULTIPLE_MSP.msp_commands.shift();
                self.mspMultipleCache.push(mspCommand);
                buffer.push8(mspCommand);
            }

            break;

        case MSPCodes.MSP2_SET_MOTOR_OUTPUT_REORDERING:

            buffer.push8(FC.MOTOR_OUTPUT_ORDER.length);
            for (let i = 0; i < FC.MOTOR_OUTPUT_ORDER.length; i++) {
                buffer.push8(FC.MOTOR_OUTPUT_ORDER[i]);
            }

            break;

        case MSPCodes.MSP2_SEND_DSHOT_COMMAND:
            buffer.push8(1);
            break;

        case MSPCodes.MSP_SET_SIMPLIFIED_TUNING:
            MspHelper.writePidSliderSettings(buffer);
            MspHelper.writeDtermFilterSliderSettings(buffer);
            MspHelper.writeGyroFilterSliderSettings(buffer);

            break;
        case MSPCodes.MSP_CALCULATE_SIMPLIFIED_PID:
            MspHelper.writePidSliderSettings(buffer);

            break;

        case MSPCodes.MSP_CALCULATE_SIMPLIFIED_GYRO:
            MspHelper.writeGyroFilterSliderSettings(buffer);

            break;
        case MSPCodes.MSP_CALCULATE_SIMPLIFIED_DTERM:
            MspHelper.writeDtermFilterSliderSettings(buffer);

            break;

        default:
            return buffer;
    }

    return buffer;
};

/**
 * Set raw Rx values over MSP protocol.
 *
 * Channels is an array of 16-bit unsigned integer channel values to be sent. 8 channels is probably the maximum.
 */
MspHelper.prototype.setRawRx = function(channels) {
    const buffer = [];

    for (let i = 0; i < channels.length; i++) {
        buffer.push16(channels[i]);
    }

    MSP.send_message(MSPCodes.MSP_SET_RAW_RC, buffer, false);
};

/**
 * Send a request to read a block of data from the dataflash at the given address and pass that address and a dataview
 * of the returned data to the given callback (or null for the data if an error occured).
 */
MspHelper.prototype.dataflashRead = function(address, blockSize, onDataCallback) {
    let outData = [address & 0xFF, (address >> 8) & 0xFF, (address >> 16) & 0xFF, (address >> 24) & 0xFF];

    outData = outData.concat([blockSize & 0xFF, (blockSize >> 8) & 0xFF]);

    // Allow compression
    outData = outData.concat([1]);

    MSP.send_message(MSPCodes.MSP_DATAFLASH_READ, outData, false, function(response) {
        if (!response.crcError) {
            const chunkAddress = response.data.readU32();

            const headerSize = 7;
            const dataSize = response.data.readU16();
            const dataCompressionType = response.data.readU8();

            // Verify that the address of the memory returned matches what the caller asked for and there was not a CRC error
            if (chunkAddress == address) {
                /* Strip that address off the front of the reply and deliver it separately so the caller doesn't have to
                 * figure out the reply format:
                 */
                if (dataCompressionType == 0) {
                    onDataCallback(address, new DataView(response.data.buffer, response.data.byteOffset + headerSize, dataSize));
                } else if (dataCompressionType == 1) {
                    // Read compressed char count to avoid decoding stray bit sequences as bytes
                    const compressedCharCount = response.data.readU16();

                    // Compressed format uses 2 additional bytes as a pseudo-header to denote the number of uncompressed bytes
                    const compressedArray = new Uint8Array(response.data.buffer, response.data.byteOffset + headerSize + 2, dataSize - 2);
                    const decompressedArray = huffmanDecodeBuf(compressedArray, compressedCharCount, defaultHuffmanTree, defaultHuffmanLenIndex);

                    onDataCallback(address, new DataView(decompressedArray.buffer), dataSize);
                }
            } else {
                // Report address error
                console.log(`Expected address ${address} but received ${chunkAddress} - retrying`);
                onDataCallback(address, null);  // returning null to the callback forces a retry
            }
        } else {
            // Report crc error
            console.log(`CRC error for address ${address} - retrying`);
            onDataCallback(address, null);  // returning null to the callback forces a retry
        }
    }, true);
};

MspHelper.prototype.sendServoConfigurations = function(onCompleteCallback) {
    let nextFunction = send_next_servo_configuration;

    let servoIndex = 0;

    if (FC.SERVO_CONFIG.length == 0) {
        onCompleteCallback();
    } else {
        nextFunction();
    }


    function send_next_servo_configuration() {

        const buffer = [];

        // send one at a time, with index

        const servoConfiguration = FC.SERVO_CONFIG[servoIndex];

        buffer.push8(servoIndex)
            .push16(servoConfiguration.min)
            .push16(servoConfiguration.max)
            .push16(servoConfiguration.middle)
            .push8(servoConfiguration.rate);

        let out = servoConfiguration.indexOfChannelToForward;
        if (out == undefined) {
            out = 255; // Cleanflight defines "CHANNEL_FORWARDING_DISABLED" as "(uint8_t)0xFF"
        }
        buffer.push8(out)
            .push32(servoConfiguration.reversedInputSources);

        // prepare for next iteration
        servoIndex++;
        if (servoIndex == FC.SERVO_CONFIG.length) {
            nextFunction = onCompleteCallback;
        }

        MSP.send_message(MSPCodes.MSP_SET_SERVO_CONFIGURATION, buffer, false, nextFunction);
    }
};

MspHelper.prototype.sendModeRanges = function(onCompleteCallback) {
    let nextFunction = send_next_mode_range;

    let modeRangeIndex = 0;

    if (FC.MODE_RANGES.length == 0) {
        onCompleteCallback();
    } else {
        send_next_mode_range();
    }

    function send_next_mode_range() {

        const modeRange = FC.MODE_RANGES[modeRangeIndex];
        const buffer = [];

        buffer.push8(modeRangeIndex)
            .push8(modeRange.id)
            .push8(modeRange.auxChannelIndex)
            .push8((modeRange.range.start - 900) / 25)
            .push8((modeRange.range.end - 900) / 25);

        const modeRangeExtra = FC.MODE_RANGES_EXTRA[modeRangeIndex];

        buffer.push8(modeRangeExtra.modeLogic)
            .push8(modeRangeExtra.linkedTo);

        // prepare for next iteration
        modeRangeIndex++;
        if (modeRangeIndex == FC.MODE_RANGES.length) {
            nextFunction = onCompleteCallback;
        }
        MSP.send_message(MSPCodes.MSP_SET_MODE_RANGE, buffer, false, nextFunction);
    }
};

MspHelper.prototype.sendAdjustmentRanges = function(onCompleteCallback) {
    let nextFunction = send_next_adjustment_range;

    let adjustmentRangeIndex = 0;

    if (FC.ADJUSTMENT_RANGES.length == 0) {
        onCompleteCallback();
    } else {
        send_next_adjustment_range();
    }


    function send_next_adjustment_range() {

        const adjustmentRange = FC.ADJUSTMENT_RANGES[adjustmentRangeIndex];
        const buffer = [];

        buffer.push8(adjustmentRangeIndex)
            .push8(adjustmentRange.slotIndex)
            .push8(adjustmentRange.auxChannelIndex)
            .push8((adjustmentRange.range.start - 900) / 25)
            .push8((adjustmentRange.range.end - 900) / 25)
            .push8(adjustmentRange.adjustmentFunction)
            .push8(adjustmentRange.auxSwitchChannelIndex);

        // prepare for next iteration
        adjustmentRangeIndex++;
        if (adjustmentRangeIndex == FC.ADJUSTMENT_RANGES.length) {
            nextFunction = onCompleteCallback;

        }
        MSP.send_message(MSPCodes.MSP_SET_ADJUSTMENT_RANGE, buffer, false, nextFunction);
    }
};

MspHelper.prototype.sendVoltageConfig = function(onCompleteCallback) {

    let nextFunction = send_next_voltage_config;

    let configIndex = 0;

    if (FC.VOLTAGE_METER_CONFIGS.length == 0) {
        onCompleteCallback();
    } else {
        send_next_voltage_config();
    }

    function send_next_voltage_config() {
        const buffer = [];

        buffer.push8(FC.VOLTAGE_METER_CONFIGS[configIndex].id)
            .push8(FC.VOLTAGE_METER_CONFIGS[configIndex].vbatscale)
            .push8(FC.VOLTAGE_METER_CONFIGS[configIndex].vbatresdivval)
            .push8(FC.VOLTAGE_METER_CONFIGS[configIndex].vbatresdivmultiplier);

        // prepare for next iteration
        configIndex++;
        if (configIndex == FC.VOLTAGE_METER_CONFIGS.length) {
            nextFunction = onCompleteCallback;
        }

        MSP.send_message(MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG, buffer, false, nextFunction);
    }

};

MspHelper.prototype.sendCurrentConfig = function(onCompleteCallback) {

    let nextFunction = send_next_current_config;

    let configIndex = 0;

    if (FC.CURRENT_METER_CONFIGS.length == 0) {
        onCompleteCallback();
    } else {
        send_next_current_config();
    }

    function send_next_current_config() {
        const buffer = [];

        buffer.push8(FC.CURRENT_METER_CONFIGS[configIndex].id)
            .push16(FC.CURRENT_METER_CONFIGS[configIndex].scale)
            .push16(FC.CURRENT_METER_CONFIGS[configIndex].offset);

        // prepare for next iteration
        configIndex++;
        if (configIndex == FC.CURRENT_METER_CONFIGS.length) {
            nextFunction = onCompleteCallback;
        }

        MSP.send_message(MSPCodes.MSP_SET_CURRENT_METER_CONFIG, buffer, false, nextFunction);
    }

};

MspHelper.prototype.sendLedStripConfig = function(onCompleteCallback) {

    let nextFunction = send_next_led_strip_config;

    let ledIndex = 0;

    if (FC.LED_STRIP.length == 0) {
        onCompleteCallback();
    } else {
        send_next_led_strip_config();
    }

    function send_next_led_strip_config() {

        const led = FC.LED_STRIP[ledIndex];
        const buffer = [];

        buffer.push(ledIndex);

        let mask = 0;

        mask |= (led.y << 0);
        mask |= (led.x << 4);

        for (let functionLetterIndex = 0; functionLetterIndex < led.functions.length; functionLetterIndex++) {
            const fnIndex = ledBaseFunctionLetters.indexOf(led.functions[functionLetterIndex]);
            if (fnIndex >= 0) {
                mask |= (fnIndex << 8);
                break;
            }
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {

            for (let overlayLetterIndex = 0; overlayLetterIndex < led.functions.length; overlayLetterIndex++) {
                const bitIndex = ledOverlayLetters.indexOf(led.functions[overlayLetterIndex]);
                if (bitIndex >= 0) {
                    mask |= bit_set(mask, bitIndex + 12);
                }
            }

            mask |= (led.color << 22);

            for (let directionLetterIndex = 0; directionLetterIndex < led.directions.length; directionLetterIndex++) {
                const bitIndex = ledDirectionLetters.indexOf(led.directions[directionLetterIndex]);
                if (bitIndex >= 0) {
                    mask |= bit_set(mask, bitIndex + 26);
                }
            }

            buffer.push32(mask);
        } else {
            for (let overlayLetterIndex = 0; overlayLetterIndex < led.functions.length; overlayLetterIndex++) {
                const bitIndex = ledOverlayLetters.indexOf(led.functions[overlayLetterIndex]);
                if (bitIndex >= 0) {
                    mask |= bit_set(mask, bitIndex + 12);
                }
            }

            mask |= (led.color << 18);

            for (let directionLetterIndex = 0; directionLetterIndex < led.directions.length; directionLetterIndex++) {
                const bitIndex = ledDirectionLetters.indexOf(led.directions[directionLetterIndex]);
                if (bitIndex >= 0) {
                    mask |= bit_set(mask, bitIndex + 22);
                }
            }

            mask |= (0 << 28); // parameters

            buffer.push32(mask);
        }

        // prepare for next iteration
        ledIndex++;
        if (ledIndex == FC.LED_STRIP.length) {
            nextFunction = onCompleteCallback;
        }

        MSP.send_message(MSPCodes.MSP_SET_LED_STRIP_CONFIG, buffer, false, nextFunction);
    }
};

MspHelper.prototype.sendLedStripColors = function(onCompleteCallback) {
    if (FC.LED_COLORS.length == 0) {
        onCompleteCallback();
    } else {
        const buffer = [];

        for (const color of FC.LED_COLORS) {
            buffer.push16(color.h)
                .push8(color.s)
                .push8(color.v);
        }
        MSP.send_message(MSPCodes.MSP_SET_LED_COLORS, buffer, false, onCompleteCallback);
    }
};

MspHelper.prototype.sendLedStripModeColors = function(onCompleteCallback) {

    let nextFunction = send_next_led_strip_mode_color;
    let index = 0;

    if (FC.LED_MODE_COLORS.length == 0) {
        onCompleteCallback();
    } else {
        send_next_led_strip_mode_color();
    }

    function send_next_led_strip_mode_color() {
        const buffer = [];

        const modeColor = FC.LED_MODE_COLORS[index];

        buffer.push8(modeColor.mode)
            .push8(modeColor.direction)
            .push8(modeColor.color);

        // prepare for next iteration
        index++;
        if (index == FC.LED_MODE_COLORS.length) {
            nextFunction = onCompleteCallback;
        }

        MSP.send_message(MSPCodes.MSP_SET_LED_STRIP_MODECOLOR, buffer, false, nextFunction);
    }
};

MspHelper.prototype.sendLedStripConfigValues = function(onCompleteCallback) {
    const buffer = [];
    buffer.push8(FC.LED_CONFIG_VALUES.brightness);
    buffer.push16(FC.LED_CONFIG_VALUES.rainbow_delta);
    buffer.push16(FC.LED_CONFIG_VALUES.rainbow_freq);
    MSP.send_message(MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES, buffer, false, onCompleteCallback);
};

MspHelper.prototype.serialPortFunctionMaskToFunctions = function(functionMask) {
    const self = this;
    const functions = [];

    const keys = Object.keys(self.SERIAL_PORT_FUNCTIONS);
    for (const key of keys) {
        const bit = self.SERIAL_PORT_FUNCTIONS[key];
        if (bit_check(functionMask, bit)) {
            functions.push(key);
        }
    }
    return functions;
};

MspHelper.prototype.serialPortFunctionsToMask = function(functions) {
    const self = this;
    let mask = 0;

    for (let index = 0; index < functions.length; index++) {
        const key = functions[index];
        const bitIndex = self.SERIAL_PORT_FUNCTIONS[key];
        if (bitIndex >= 0) {
            mask = bit_set(mask, bitIndex);
        }
    }

    return mask;
};

MspHelper.prototype.sendRxFailConfig = function(onCompleteCallback) {
    let nextFunction = send_next_rxfail_config;

    let rxFailIndex = 0;

    if (FC.RXFAIL_CONFIG.length == 0) {
        onCompleteCallback();
    } else {
        send_next_rxfail_config();
    }

    function send_next_rxfail_config() {

        const rxFail = FC.RXFAIL_CONFIG[rxFailIndex];

        const buffer = [];
        buffer.push8(rxFailIndex)
            .push8(rxFail.mode)
            .push16(rxFail.value);


        // prepare for next iteration
        rxFailIndex++;
        if (rxFailIndex == FC.RXFAIL_CONFIG.length) {
            nextFunction = onCompleteCallback;

        }
        MSP.send_message(MSPCodes.MSP_SET_RXFAIL_CONFIG, buffer, false, nextFunction);
    }
};

MspHelper.prototype.setArmingEnabled = function(doEnable, disableRunawayTakeoffPrevention, onCompleteCallback) {
    if (FC.CONFIG.armingDisabled === doEnable || FC.CONFIG.runawayTakeoffPreventionDisabled !== disableRunawayTakeoffPrevention) {

        FC.CONFIG.armingDisabled = !doEnable;
        FC.CONFIG.runawayTakeoffPreventionDisabled = disableRunawayTakeoffPrevention;

        MSP.send_message(MSPCodes.MSP_ARMING_DISABLE, mspHelper.crunch(MSPCodes.MSP_ARMING_DISABLE), false, function () {
            if (doEnable) {
                gui_log(i18n.getMessage('armingEnabled'));
                if (disableRunawayTakeoffPrevention) {
                    gui_log(i18n.getMessage('runawayTakeoffPreventionDisabled'));
                } else {
                    gui_log(i18n.getMessage('runawayTakeoffPreventionEnabled'));
                }
            } else {
                gui_log(i18n.getMessage('armingDisabled'));
            }

            if (onCompleteCallback) {
                onCompleteCallback();
            }
        });
    } else {
        if (onCompleteCallback) {
            onCompleteCallback();
        }
    }
};

MspHelper.prototype.loadSerialConfig = function(callback) {
    const mspCode = MSPCodes.MSP2_COMMON_SERIAL_CONFIG;
    MSP.send_message(mspCode, false, false, callback);
};

MspHelper.prototype.sendSerialConfig = function(callback) {
    const mspCode = MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG;
    MSP.send_message(mspCode, mspHelper.crunch(mspCode), false, callback);
};

MspHelper.prototype.writeConfiguration = function(reboot, callback) {
    setTimeout(function() {
        MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, function() {
            gui_log(i18n.getMessage('configurationEepromSaved'));
            console.log('Configuration saved to EEPROM');
            if (reboot) {
                GUI.tab_switch_cleanup(function() {
                    return reinitializeConnection(callback);
                });
            }
            if (callback) {
                callback();
            }
        });
    }, 100); // 100ms delay before sending MSP_EEPROM_WRITE to ensure that all settings have been received
};

let mspHelper;
// This is temporary, till things are moved
// to modules and every usage of this can create own
// instance or re-use existing where needed.
window.mspHelper = mspHelper = new MspHelper();
export { mspHelper };
export default MspHelper;
