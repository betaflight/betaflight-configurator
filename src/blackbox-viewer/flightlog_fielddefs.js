import semver from "semver";

function makeReadOnly(x) {
    // Make read-only if browser supports it:
    if (Object.freeze) {
        return Object.freeze(x);
    }

    // Otherwise a no-op
    return x;
}

// Firmware type constants
export const FIRMWARE_TYPE_UNKNOWN = 0;
export const FIRMWARE_TYPE_BASEFLIGHT = 1;
export const FIRMWARE_TYPE_CLEANFLIGHT = 2;
export const FIRMWARE_TYPE_BETAFLIGHT = 3;
export const FIRMWARE_TYPE_INAV = 4;

// Some constants used at different places
export const MAX_MOTOR_NUMBER = 8;
export const DSHOT_MIN_VALUE = 48;
const DSHOT_MAX_VALUE = 2047;
export const DSHOT_RANGE = DSHOT_MAX_VALUE - DSHOT_MIN_VALUE;

// Fields definitions for lists
export const FlightLogEvent = makeReadOnly({
    SYNC_BEEP: 0,

    AUTOTUNE_CYCLE_START: 10,
    AUTOTUNE_CYCLE_RESULT: 11,
    AUTOTUNE_TARGETS: 12,
    INFLIGHT_ADJUSTMENT: 13,
    LOGGING_RESUME: 14,
    DISARM: 15,

    GTUNE_CYCLE_RESULT: 20,
    FLIGHT_MODE: 30,
    TWITCH_TEST: 40, // Feature for latency testing

    CUSTOM: 250, // Virtual Event Code - Never part of Log File.
    CUSTOM_BLANK: 251, // Virtual Event Code - Never part of Log File. - No line shown
    LOG_END: 255,
});

// Add a general axis index.
export const AXIS = makeReadOnly({
    ROLL: 0,
    PITCH: 1,
    YAW: 2,
});

export let FLIGHT_LOG_FLIGHT_MODE_NAME = [];

export const FLIGHT_LOG_FLIGHT_MODE_NAME_PRE_3_3 = makeReadOnly([
    "ARM",
    "ANGLE",
    "HORIZON",
    "BARO",
    "ANTIGRAVITY",
    "MAG",
    "HEADFREE",
    "HEADADJ",
    "CAMSTAB",
    "CAMTRIG",
    "GPSHOME",
    "GPSHOLD",
    "PASSTHRU",
    "BEEPER",
    "LEDMAX",
    "LEDLOW",
    "LLIGHTS",
    "CALIB",
    "GOV",
    "OSD",
    "TELEMETRY",
    "GTUNE",
    "SONAR",
    "SERVO1",
    "SERVO2",
    "SERVO3",
    "BLACKBOX",
    "FAILSAFE",
    "AIRMODE",
    "3DDISABLE",
    "FPVANGLEMIX",
    "BLACKBOXERASE",
    "CAMERA1",
    "CAMERA2",
    "CAMERA3",
    "FLIPOVERAFTERCRASH",
    "PREARM",
]);

export const FLIGHT_LOG_FLIGHT_MODE_NAME_POST_3_3 = makeReadOnly([
    "ARM",
    "ANGLE",
    "HORIZON",
    "MAG",
    "BARO",
    "GPSHOME",
    "GPSHOLD",
    "HEADFREE",
    "PASSTHRU",
    "RANGEFINDER",
    "FAILSAFE",
    "GPSRESCUE",
    "ANTIGRAVITY",
    "HEADADJ",
    "CAMSTAB",
    "CAMTRIG",
    "BEEPER",
    "LEDMAX",
    "LEDLOW",
    "LLIGHTS",
    "CALIB",
    "GOV",
    "OSD",
    "TELEMETRY",
    "GTUNE",
    "SERVO1",
    "SERVO2",
    "SERVO3",
    "BLACKBOX",
    "AIRMODE",
    "3D",
    "FPVANGLEMIX",
    "BLACKBOXERASE",
    "CAMERA1",
    "CAMERA2",
    "CAMERA3",
    "FLIPOVERAFTERCRASH",
    "PREARM",
    "BEEPGPSCOUNT",
    "VTXPITMODE",
    "USER1",
    "USER2",
    "USER3",
    "USER4",
    "PIDAUDIO",
    "ACROTRAINER",
    "VTXCONTROLDISABLE",
    "LAUNCHCONTROL",
]);

export const FLIGHT_LOG_FLIGHT_MODE_NAME_POST_4_5 = makeReadOnly([
    "ARM",
    "ANGLE",
    "HORIZON",
    "MAG",
    "ALTHOLD",
    "HEADFREE",
    "CHIRP",
    "PASSTHRU",
    "FAILSAFE",
    "POSHOLD",
    "GPSRESCUE",
    "ANTIGRAVITY",
    "HEADADJ",
    "CAMSTAB",
    "BEEPER",
    "LEDLOW",
    "CALIB",
    "OSD",
    "TELEMETRY",
    "SERVO1",
    "SERVO2",
    "SERVO3",
    "BLACKBOX",
    "AIRMODE",
    "3D",
    "FPVANGLEMIX",
    "BLACKBOXERASE",
    "CAMERA1",
    "CAMERA2",
    "CAMERA3",
    "FLIPOVERAFTERCRASH",
    "PREARM",
    "BEEPGPSCOUNT",
    "VTXPITMODE",
    "USER1",
    "USER2",
    "USER3",
    "USER4",
    "PIDAUDIO",
    "ACROTRAINER",
    "VTXCONTROLDISABLE",
    "LAUNCHCONTROL",
]);

export const FLIGHT_LOG_FEATURES = makeReadOnly([
    "RX_PPM",
    "VBAT",
    "INFLIGHT_ACC_CAL",
    "RX_SERIAL",
    "MOTOR_STOP",
    "SERVO_TILT",
    "SOFTSERIAL",
    "GPS",
    "FAILSAFE",
    "SONAR",
    "TELEMETRY",
    "CURRENT_METER",
    "3D",
    "RX_PARALLEL_PWM",
    "RX_MSP",
    "RSSI_ADC",
    "LED_STRIP",
    "DISPLAY",
    "ONESHOT125",
    "BLACKBOX",
    "CHANNEL_FORWARDING",
    "TRANSPONDER",
    "AIRMODE",
    "SUPEREXPO_RATES",
]);

export const OFF_ON = makeReadOnly(["OFF", "ON"]);

export const FAST_PROTOCOL = makeReadOnly([
    "PWM",
    "ONESHOT125",
    "ONESHOT42",
    "MULTISHOT",
    "BRUSHED",
    "DSHOT150",
    "DSHOT300",
    "DSHOT600",
    "DSHOT1200", //deprecated
    "PROSHOT1000",
]);

export const MOTOR_SYNC = makeReadOnly(["SYNCED", "UNSYNCED"]);

export const SERIALRX_PROVIDER = makeReadOnly([
    "SPEK1024",
    "SPEK2048",
    "SBUS",
    "SUMD",
    "SUMH",
    "XB-B",
    "XB-B-RJ01",
    "IBUS",
    "JETIEXBUS",
    "CRSF",
    "SRXL",
    "CUSTOM",
    "FPORT",
    "SRXL2",
    "GHST",
]);

export const ANTI_GRAVITY_MODE = makeReadOnly(["SMOOTH", "STEP"]);

export const RC_SMOOTHING_TYPE = makeReadOnly(["INTERPOLATION", "FILTER"]);

export const RC_SMOOTHING_MODE = makeReadOnly(["OFF", "ON"]);

export const RC_SMOOTHING_DEBUG_AXIS = makeReadOnly(["ROLL", "PITCH", "YAW", "THROTTLE"]);

export const FILTER_TYPE = makeReadOnly(["PT1", "BIQUAD", "PT2", "PT3"]);

// Debug mode names and debug field labels are no longer defined here. They now
// live in the single shared source of truth `src/js/utils/debugModes.js`
// (getDebugModes / getDebugFieldNames), consumed by both the configurator debug
// store and the blackbox viewer. The blackbox parser resolves the log's
// API version once (firmwareToApiVersion) and stores it on sysConfig.apiVersion.

export const SUPER_EXPO_YAW = makeReadOnly(["OFF", "ON", "ALWAYS"]);

export const GYRO_LPF = makeReadOnly(["OFF", "188HZ", "98HZ", "42HZ", "20HZ", "10HZ", "5HZ", "EXPERIMENTAL"]);

export const GYRO_HARDWARE_LPF = makeReadOnly(["NORMAL", "EXPERIMENTAL", "1KHZ_SAMPLING"]);

export const GYRO_32KHZ_HARDWARE_LPF = makeReadOnly(["NORMAL", "EXPERIMENTAL"]);

export let ACC_HARDWARE = [];

const ACC_HARDWARE_COMPLETE = makeReadOnly([
    "AUTO",
    "NONE",
    "ADXL345",
    "MPU6050",
    "MMA8452",
    "BMA280",
    "LSM303DLHC",
    "MPU6000",
    "MPU6500",
    "MPU9250",
    "ICM20601",
    "ICM20602",
    "ICM20608G",
    "ICM20649",
    "ICM20689",
    "ICM42605",
    "ICM42688P",
    "BMI160",
    "BMI270",
    "LSM6DSO",
    "LSM6DSV16X",
    "VIRTUAL",
]);

export const BARO_HARDWARE = makeReadOnly([
    "AUTO",
    "NONE",
    "BMP085",
    "MS5611",
    "BMP280",
    "LPS",
    "QMP6988",
    "BMP388",
    "DPS310",
    "2SMPB_02B",
]);

export let MAG_HARDWARE = [];

const MAG_HARDWARE_COMPLETE = makeReadOnly([
    "AUTO",
    "NONE",
    "HMC5883",
    "AK8975",
    "AK8963",
    "QMC5883",
    "LIS3MDL",
    "MAG_MPU925X_AK8963",
]);

export const FLIGHT_LOG_FLIGHT_STATE_NAME = makeReadOnly([
    "GPS_FIX_HOME",
    "GPS_FIX",
    "CALIBRATE_MAG",
    "SMALL_ANGLE",
    "FIXED_WING",
]);

export const FLIGHT_LOG_FAILSAFE_PHASE_NAME = makeReadOnly(["IDLE", "RX_LOSS_DETECTED", "LANDING", "LANDED"]);

export const FFT_CALC_STEPS = makeReadOnly([
    "ARM_CFFT_F32",
    "BITREVERSAL",
    "STAGE_RFFT_F32",
    "ARM_CMPLX_MAG_F32",
    "CALC_FREQUENCIES",
    "UPDATE_FILTERS",
    "HANNING",
]);

export const ITERM_RELAX = makeReadOnly(["OFF", "RP", "RPY", "RP_INC", "RPY_INC"]);

export const ITERM_RELAX_TYPE = makeReadOnly(["GYRO", "SETPOINT"]);

export const FLIGHT_LOG_DISARM_REASON = makeReadOnly([
    "ARMING_DISABLED",
    "FAILSAFE",
    "THROTTLE_TIMEOUT",
    "STICKS",
    "SWITCH",
    "CRASH_PROTECTION",
    "RUNAWAY_TAKEOFF",
    "GPS_RESCUE",
    "SERIAL_IO",
]);

export const RATES_TYPE = makeReadOnly(["BETAFLIGHT", "RACEFLIGHT", "KISS", "ACTUAL", "QUICK"]);

export const GYRO_TO_USE = makeReadOnly(["FIRST", "SECOND", "BOTH"]);

export const FF_AVERAGING = makeReadOnly(["OFF", "2_POINT", "3_POINT", "4_POINT"]);

export const SIMPLIFIED_PIDS_MODE = makeReadOnly(["OFF", "ON - RP", "ON - RPY"]);

export const THROTTLE_LIMIT_TYPE = makeReadOnly(["OFF", "SCALE", "CLIP"]);

export function adjustFieldDefsList(firmwareType, firmwareVersion) {
    if (firmwareType === FIRMWARE_TYPE_BETAFLIGHT && semver.gte(firmwareVersion, "3.3.0")) {
        // Hardware names
        ACC_HARDWARE = ACC_HARDWARE_COMPLETE.slice(0);
        MAG_HARDWARE = MAG_HARDWARE_COMPLETE.slice(0);

        if (semver.gte(firmwareVersion, "4.5.0")) {
            MAG_HARDWARE.splice(MAG_HARDWARE.indexOf("LIS3MDL"), 0, "LIS2MDL");
            MAG_HARDWARE.push("IST8310");
        }
        if (semver.gte(firmwareVersion, "2025.12.0")) {
            ACC_HARDWARE.splice(ACC_HARDWARE.indexOf("ADXL345"), 1);
            ACC_HARDWARE.splice(ACC_HARDWARE.indexOf("MMA8452"), 1);
            ACC_HARDWARE.splice(ACC_HARDWARE.indexOf("BMA280"), 1);
            ACC_HARDWARE.splice(ACC_HARDWARE.indexOf("LSM303DLHC"), 1);
            ACC_HARDWARE.splice(ACC_HARDWARE.indexOf("LSM6DSV16X") + 1, 0, "IIM42653");
        }

        ACC_HARDWARE = makeReadOnly(ACC_HARDWARE);
        MAG_HARDWARE = makeReadOnly(MAG_HARDWARE);

        // Flight mode names
        if (semver.gte(firmwareVersion, "2025.12.0")) {
            FLIGHT_LOG_FLIGHT_MODE_NAME = FLIGHT_LOG_FLIGHT_MODE_NAME_POST_4_5.slice(0);
        } else {
            FLIGHT_LOG_FLIGHT_MODE_NAME = FLIGHT_LOG_FLIGHT_MODE_NAME_POST_3_3.slice(0);
            if (semver.lt(firmwareVersion, "3.4.0")) {
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("GPSRESCUE"), 1);
            }
            if (semver.gte(firmwareVersion, "3.5.0")) {
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("RANGEFINDER"), 1);
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("CAMTRIG"), 1);
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("LEDMAX"), 1);
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("LLIGHTS"), 1);
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("GOV"), 1);
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("GTUNE"), 1);
            }
            if (semver.gte(firmwareVersion, "4.0.0")) {
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("BARO"), 1);
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("GPSHOME"), 1);
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("GPSHOLD"), 1);
            }
        }
        if (semver.gte(firmwareVersion, "2026.6.0")) {
            FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("GPSRESCUE") + 1, 0, "AUTOPILOT");
        }

        FLIGHT_LOG_FLIGHT_MODE_NAME = makeReadOnly(FLIGHT_LOG_FLIGHT_MODE_NAME);
    } else {
        ACC_HARDWARE = makeReadOnly(ACC_HARDWARE_COMPLETE.slice(0));
        MAG_HARDWARE = makeReadOnly(MAG_HARDWARE_COMPLETE.slice(0));

        FLIGHT_LOG_FLIGHT_MODE_NAME = FLIGHT_LOG_FLIGHT_MODE_NAME_PRE_3_3.slice(0);

        if (firmwareType === FIRMWARE_TYPE_BETAFLIGHT && semver.lte(firmwareVersion, "3.1.6")) {
            FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("ANTIGRAVITY"), 1);
        }

        FLIGHT_LOG_FLIGHT_MODE_NAME = makeReadOnly(FLIGHT_LOG_FLIGHT_MODE_NAME);
    }
}
