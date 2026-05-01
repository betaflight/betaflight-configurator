import semver from "semver";
import { API_VERSION_1_47, API_VERSION_1_48 } from "../data_storage";
import { addArrayElement, addArrayElementAfter, removeArrayElement, replaceArrayElement } from "./array";

/**
 * Ordered list of firmware debug_mode names, matching the `debug_mode_e`
 * enum in firmware `debug.h` for versions prior to API 1.47.
 *
 * A name's index in this array (or in the array returned by `getDebugModes`)
 * is the numeric value stored in a blackbox log header's `debug_mode` field.
 *
 * Keep in sync with Betaflight firmware `debug.h`.
 */
const BASE_DEBUG_MODES = Object.freeze([
    "NONE",
    "CYCLETIME",
    "BATTERY",
    "GYRO_FILTERED",
    "ACCELEROMETER",
    "PIDLOOP",
    "GYRO_SCALED",
    "RC_INTERPOLATION",
    "ANGLERATE",
    "ESC_SENSOR",
    "SCHEDULER",
    "STACK",
    "ESC_SENSOR_RPM",
    "ESC_SENSOR_TMP",
    "ALTITUDE",
    "FFT",
    "FFT_TIME",
    "FFT_FREQ",
    "RX_FRSKY_SPI",
    "RX_SFHSS_SPI",
    "GYRO_RAW",
    "DUAL_GYRO_RAW",
    "DUAL_GYRO_DIFF",
    "MAX7456_SIGNAL",
    "MAX7456_SPICLOCK",
    "SBUS",
    "FPORT",
    "RANGEFINDER",
    "RANGEFINDER_QUALITY",
    "LIDAR_TF",
    "ADC_INTERNAL",
    "RUNAWAY_TAKEOFF",
    "SDIO",
    "CURRENT_SENSOR",
    "USB",
    "SMARTAUDIO",
    "RTH",
    "ITERM_RELAX",
    "ACRO_TRAINER",
    "RC_SMOOTHING",
    "RX_SIGNAL_LOSS",
    "RC_SMOOTHING_RATE",
    "ANTI_GRAVITY",
    "DYN_LPF",
    "RX_SPEKTRUM_SPI",
    "DSHOT_RPM_TELEMETRY",
    "RPM_FILTER",
    "D_MAX",
    "AC_CORRECTION",
    "AC_ERROR",
    "DUAL_GYRO_SCALED",
    "DSHOT_RPM_ERRORS",
    "CRSF_LINK_STATISTICS_UPLINK",
    "CRSF_LINK_STATISTICS_PWR",
    "CRSF_LINK_STATISTICS_DOWN",
    "BARO",
    "GPS_RESCUE_THROTTLE_PID",
    "DYN_IDLE",
    "FEEDFORWARD_LIMIT",
    "FEEDFORWARD",
    "BLACKBOX_OUTPUT",
    "GYRO_SAMPLE",
    "RX_TIMING",
    "D_LPF",
    "VTX_TRAMP",
    "GHST",
    "GHST_MSP",
    "SCHEDULER_DETERMINISM",
    "TIMING_ACCURACY",
    "RX_EXPRESSLRS_SPI",
    "RX_EXPRESSLRS_PHASELOCK",
    "RX_STATE_TIME",
    "GPS_RESCUE_VELOCITY",
    "GPS_RESCUE_HEADING",
    "GPS_RESCUE_TRACKING",
    "GPS_CONNECTION",
    "ATTITUDE",
    "VTX_MSP",
    "GPS_DOP",
    "FAILSAFE",
    "GYRO_CALIBRATION",
    "ANGLE_MODE",
    "ANGLE_TARGET",
    "CURRENT_ANGLE",
    "DSHOT_TELEMETRY_COUNTS",
    "RPM_LIMIT",
    "RC_STATS",
    "MAG_CALIB",
    "MAG_TASK_RATE",
    "EZLANDING",
    "TPA",
    "S_TERM",
    "SPA",
    "TASK",
    "GIMBAL",
    "WING_SETPOINT",
]);

/**
 * Returns the list of debug_mode names in the order they appear in the
 * firmware's `debug_mode_e` enum for a given API version.
 *
 * A name's index in the returned array equals the numeric value stored
 * in a blackbox log header's `debug_mode` field for that firmware.
 *
 * @param {string} [apiVersion] - e.g. "1.47.0". If falsy, returns the
 *   pre-1.47 base list (matches the behaviour when no FC is connected).
 * @returns {string[]} A fresh array; callers may mutate it freely.
 */
export function getDebugModes(apiVersion) {
    const result = [...BASE_DEBUG_MODES];

    if (!apiVersion) {
        return result;
    }

    if (semver.gte(apiVersion, API_VERSION_1_47)) {
        replaceArrayElement(result, "GPS_RESCUE_THROTTLE_PID", "AUTOPILOT_ALTITUDE");
        removeArrayElement(result, "GYRO_SCALED");
        addArrayElementAfter(result, "RANGEFINDER_QUALITY", "OPTICALFLOW");
        addArrayElement(result, "AUTOPILOT_POSITION");
        addArrayElement(result, "CHIRP");
        addArrayElement(result, "FLASH_TEST_PRBS");
        addArrayElement(result, "MAVLINK_TELEMETRY");
        replaceArrayElement(result, "DUAL_GYRO_RAW", "MULTI_GYRO_RAW");
        replaceArrayElement(result, "DUAL_GYRO_DIFF", "MULTI_GYRO_DIFF");
        replaceArrayElement(result, "DUAL_GYRO_SCALED", "MULTI_GYRO_SCALED");
    }

    if (semver.gte(apiVersion, API_VERSION_1_48)) {
        addArrayElement(result, "AUTOPILOT_PID");
    }

    return result;
}

/**
 * Returns the numeric debug_mode value for a given name in the firmware
 * identified by `apiVersion`, or -1 if the name is not defined in that
 * firmware's enum.
 *
 * @param {string} name - debug mode name, e.g. "CHIRP"
 * @param {string} [apiVersion]
 * @returns {number}
 */
export function getDebugModeIndex(name, apiVersion) {
    return getDebugModes(apiVersion).indexOf(name);
}
