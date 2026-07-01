import semver from "semver";
import { API_VERSION_1_46, API_VERSION_1_47, API_VERSION_1_48 } from "../data_storage";
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
        removeArrayElement(result, "AUTOPILOT_POSITION");
        addArrayElement(result, "AUTOPILOT_PID");
        // POSITION_NAV is a reserved enum slot in firmware (no name/fields yet);
        // it must occupy its index so AUTOPILOT_STOP decodes correctly.
        addArrayElement(result, "POSITION_NAV");
        addArrayElement(result, "AUTOPILOT_STOP");
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

/**
 * Returns the friendly debug field-name labels for every debug mode in the
 * firmware identified by `apiVersion`.
 *
 * Shape: `{ [modeName]: { "debug[all]": label, "debug[0]": label, ... } }`.
 * This is the single source of truth shared by the configurator's debug store
 * (`src/stores/debug.js`, sensors live view + onboard logging tab) and the
 * blackbox log viewer.
 *
 * @param {string} [apiVersion] - e.g. "1.47.0". If falsy, returns the
 *   pre-1.46 base labels (matches the behaviour when no FC is connected).
 * @returns {object} A fresh object; callers must treat it as read-only.
 */
export function getDebugFieldNames(apiVersion) {
    const baseFieldNames = {
        NONE: {
            "debug[all]": "Debug [all]",
            "debug[0]": "Debug [0]",
            "debug[1]": "Debug [1]",
            "debug[2]": "Debug [2]",
            "debug[3]": "Debug [3]",
            "debug[4]": "Debug [4]",
            "debug[5]": "Debug [5]",
            "debug[6]": "Debug [6]",
            "debug[7]": "Debug [7]",
        },
        CYCLETIME: {
            "debug[all]": "Debug Cycle Time",
            "debug[0]": "Cycle Time",
            "debug[1]": "CPU Load",
        },
        BATTERY: {
            "debug[all]": "Debug Battery",
            "debug[0]": "Battery Volt ADC",
            "debug[1]": "Battery Volt",
        },
        GYRO_FILTERED: {
            "debug[all]": "Debug Gyro Filtered",
            "debug[0]": "Gyro Filtered [X]",
            "debug[1]": "Gyro Filtered [Y]",
            "debug[2]": "Gyro Filtered [Z]",
        },
        ACCELEROMETER: {
            "debug[all]": "Debug Accel.",
            "debug[0]": "Raw Accel [dbg-axis]",
            "debug[1]": "Filtered Accel [dbg-axis]",
            "debug[2]": "Accel Magnitude",
            "debug[3]": "Jerk [dbg-axis]",
            "debug[4]": "Jerk Magnitude",
        },
        PIDLOOP: {
            "debug[all]": "Debug PID",
            "debug[0]": "Wait Time",
            "debug[1]": "Sub Update Time",
            "debug[2]": "PID Update Time",
            "debug[3]": "Motor Update Time",
        },
        GYRO_SCALED: {
            "debug[all]": "Debug Gyro Scaled",
            "debug[0]": "Gyro Scaled [roll]",
            "debug[1]": "Gyro Scaled [pitch]",
            "debug[2]": "Gyro Scaled [yaw]",
        },
        RC_INTERPOLATION: {
            "debug[all]": "Debug RC Interpolation",
            "debug[0]": "Raw RC Command [roll]",
            "debug[1]": "Current RX Refresh Rate",
            "debug[2]": "Interpolation Step Count",
            "debug[3]": "RC Setpoint [roll]",
        },
        ANGLERATE: {
            "debug[all]": "Debug Angle Rate",
            "debug[0]": "Angle Rate [roll]",
            "debug[1]": "Angle Rate [pitch]",
            "debug[2]": "Angle Rate [yaw]",
        },
        ESC_SENSOR: {
            "debug[all]": "ESC Sensor",
            "debug[0]": "Motor Index",
            "debug[1]": "Timeouts",
            "debug[2]": "CNC errors",
            "debug[3]": "Data age",
        },
        SCHEDULER: {
            "debug[all]": "Scheduler",
            "debug[2]": "Schedule Time",
        },
        STACK: {
            "debug[all]": "Stack",
            "debug[0]": "Stack High Mem",
            "debug[1]": "Stack Low Mem",
            "debug[2]": "Stack Current",
            "debug[3]": "Stack p",
        },
        ESC_SENSOR_RPM: {
            "debug[all]": "ESC Sensor RPM",
            "debug[0]": "Motor 1",
            "debug[1]": "Motor 2",
            "debug[2]": "Motor 3",
            "debug[3]": "Motor 4",
        },
        ESC_SENSOR_TMP: {
            "debug[all]": "ESC Sensor Temp",
            "debug[0]": "Motor 1",
            "debug[1]": "Motor 2",
            "debug[2]": "Motor 3",
            "debug[3]": "Motor 4",
        },
        ALTITUDE: {
            "debug[all]": "Altitude",
            "debug[0]": "GPS Trust * 100",
            "debug[1]": "Baro Altitude",
            "debug[2]": "GPS Altitude",
            "debug[3]": "Vario",
        },
        FFT: {
            "debug[all]": "Debug FFT",
            "debug[0]": "Gyro Pre Dyn Notch [dbg-axis]",
            "debug[1]": "Gyro Post Dyn Notch [dbg-axis]",
            "debug[2]": "Gyro Downsampled [dbg-axis]",
        },
        FFT_TIME: {
            "debug[all]": "Debug FFT TIME",
            "debug[0]": "Active calc step",
            "debug[1]": "Step duration",
        },
        FFT_FREQ: {
            "debug[all]": "Debug FFT FREQ",
            "debug[0]": "Notch 1 Center Freq [dbg-axis]",
            "debug[1]": "Notch 2 Center Freq [dbg-axis]",
            "debug[2]": "Notch 3 Center Freq [dbg-axis]",
            "debug[3]": "Gyro Pre Dyn Notch [dbg-axis]",
        },
        RX_FRSKY_SPI: {
            "debug[all]": "FrSky SPI Rx",
            "debug[0]": "Looptime",
            "debug[1]": "Packet",
            "debug[2]": "Missing Packets",
            "debug[3]": "State",
        },
        RX_SFHSS_SPI: {
            "debug[all]": "SFHSS SPI Rx",
            "debug[0]": "State",
            "debug[1]": "Missing Frame",
            "debug[2]": "Offset Max",
            "debug[3]": "Offset Min",
        },
        GYRO_RAW: {
            "debug[all]": "Debug Gyro Raw",
            "debug[0]": "Gyro Raw [X]",
            "debug[1]": "Gyro Raw [Y]",
            "debug[2]": "Gyro Raw [Z]",
        },
        DUAL_GYRO_RAW: {
            "debug[all]": "Debug Dual Gyro Raw",
            "debug[0]": "Gyro 1 Raw [roll]",
            "debug[1]": "Gyro 1 Raw [pitch]",
            "debug[2]": "Gyro 2 Raw [roll]",
            "debug[3]": "Gyro 2 Raw [pitch]",
        },
        DUAL_GYRO_COMBINED: {
            "debug[all]": "Debug Dual Combined",
            "debug[0]": "Not Used",
            "debug[1]": "Gyro Filtered [roll]",
            "debug[2]": "Gyro Filtered [pitch]",
        },
        DUAL_GYRO_DIFF: {
            "debug[all]": "Debug Dual Gyro Diff",
            "debug[0]": "Gyro Diff [roll]",
            "debug[1]": "Gyro Diff [pitch]",
            "debug[2]": "Gyro Diff [yaw]",
        },
        MAX7456_SIGNAL: {
            "debug[all]": "Max7456 Signal",
            "debug[0]": "Mode Reg",
            "debug[1]": "Sense",
            "debug[2]": "ReInit",
            "debug[3]": "Rows",
        },
        MAX7456_SPICLOCK: {
            "debug[all]": "Max7456 SPI Clock",
            "debug[0]": "Overclock",
            "debug[1]": "DevType",
            "debug[2]": "Divisor",
        },
        SBUS: {
            "debug[all]": "SBus Rx",
            "debug[0]": "Frame Flags",
            "debug[1]": "State Flags",
            "debug[2]": "Frame Time",
        },
        FPORT: {
            "debug[all]": "FPort Rx",
            "debug[0]": "Frame Interval",
            "debug[1]": "Frame Errors",
            "debug[2]": "Last Error",
            "debug[3]": "Telemetry Interval",
        },
        RANGEFINDER: {
            "debug[all]": "Rangefinder",
            "debug[0]": "not used",
            "debug[1]": "Raw Altitude",
            "debug[2]": "Calc Altitude",
            "debug[3]": "SNR",
        },
        RANGEFINDER_QUALITY: {
            "debug[all]": "Rangefinder Quality",
            "debug[0]": "Raw Altitude",
            "debug[1]": "SNR Threshold Reached",
            "debug[2]": "Dyn Distance Threshold",
            "debug[3]": "Is Surface Altitude Valid",
        },
        // debug[4-7] are driver-specific (rangefinder_lidartf.c vs
        // rangefinder_upt1.c disagree on meaning/units past debug[3]),
        // so intentionally left without a single shared label.
        LIDAR_TF: {
            "debug[all]": "Lidar TF",
            "debug[0]": "Distance",
            "debug[1]": "Strength",
            "debug[2]": "TF Frame (4)",
            "debug[3]": "TF Frame (5)",
        },
        ADC_INTERNAL: {
            "debug[all]": "ADC Internal",
            "debug[0]": "Core Temp",
            "debug[1]": "VRef Internal Sample",
            "debug[2]": "Temp Sensor Sample",
            "debug[3]": "Vref mV",
        },
        RUNAWAY_TAKEOFF: {
            "debug[all]": "Runaway Takeoff",
            "debug[0]": "Enabled",
            "debug[1]": "Activating Delay",
            "debug[2]": "Deactivating Delay",
            "debug[3]": "Deactivating Time",
        },
        SDIO: {
            "debug[all]": "Debug SDIO",
        },
        CURRENT_SENSOR: {
            "debug[all]": "Current Sensor",
            "debug[0]": "milliVolts",
            "debug[1]": "centiAmps",
            "debug[2]": "Amps Latest",
            "debug[3]": "mAh Drawn",
        },
        USB: {
            "debug[all]": "USB",
            "debug[0]": "Cable In",
            "debug[1]": "VCP Connected",
        },
        SMARTAUDIO: {
            "debug[all]": "Smart Audio VTx",
            "debug[0]": "Device + Version",
            "debug[1]": "Channel",
            "debug[2]": "Frequency",
            "debug[3]": "Power",
        },
        RTH: {
            "debug[all]": "RTH Rescue codes",
            "debug[0]": "Pitch angle, deg",
            "debug[1]": "Rescue Phase",
            "debug[2]": "Failure code",
            "debug[3]": "Failure timers",
        },
        ITERM_RELAX: {
            "debug[all]": "I-term Relax",
            "debug[0]": "Setpoint HPF [roll]",
            "debug[1]": "I Relax Factor [roll]",
            "debug[2]": "Relaxed I Error [roll]",
            "debug[3]": "Axis Error [roll]",
        },
        ACRO_TRAINER: {
            "debug[all]": "Acro Trainer (a_t_axis)",
            "debug[0]": "Current Angle * 10 [deg]",
            "debug[1]": "Axis State",
            "debug[2]": "Correction amount",
            "debug[3]": "Projected Angle * 10 [deg]",
        },
        RC_SMOOTHING: {
            "debug[all]": "Debug RC Smoothing",
            "debug[0]": "Raw RC Command",
            "debug[1]": "Raw RC Derivative",
            "debug[2]": "Smoothed RC Derivative",
            "debug[3]": "RX Refresh Rate",
        },
        RX_SIGNAL_LOSS: {
            "debug[all]": "Rx Signal Loss",
            "debug[0]": "Signal Received",
            "debug[1]": "Failsafe",
            "debug[2]": "Not used",
            "debug[3]": "Throttle",
        },
        RC_SMOOTHING_RATE: {
            "debug[all]": "Debug RC Smoothing Rate",
            "debug[0]": "Current RX Refresh Rate",
            "debug[1]": "Training Step Count",
            "debug[2]": "Average RX Refresh Rate",
            "debug[3]": "Sampling State",
        },
        ANTI_GRAVITY: {
            "debug[all]": "I-term Relax",
            "debug[0]": "Base I gain * 1000",
            "debug[1]": "Final I gain * 1000",
            "debug[2]": "P gain [roll] * 1000",
            "debug[3]": "P gain [pitch] * 1000",
        },
        DYN_LPF: {
            "debug[all]": "Debug Dyn LPF",
            "debug[0]": "Gyro Scaled [dbg-axis]",
            "debug[1]": "Notch Center [roll]",
            "debug[2]": "Lowpass Cutoff",
            "debug[3]": "Gyro Pre-Dyn [dbg-axis]",
        },
        RX_SPEKTRUM_SPI: {
            "debug[all]": "Debug RX Spektrum SPI",
            "debug[0]": "Missed packets",
            "debug[1]": "Error",
            "debug[2]": "IRQ Status",
        },
        DSHOT_RPM_TELEMETRY: {
            "debug[all]": "DShot Telemetry RPM",
            "debug[0]": "Motor 1 - DShot",
            "debug[1]": "Motor 2 - DShot",
            "debug[2]": "Motor 3 - DShot",
            "debug[3]": "Motor 4 - DShot",
            "debug[4]": "Motor 5 - DShot",
            "debug[5]": "Motor 6 - DShot",
            "debug[6]": "Motor 7 - DShot",
            "debug[7]": "Motor 8 - DShot",
        },
        RPM_FILTER: {
            "debug[all]": "RPM Filter",
            "debug[0]": "Motor 1 - rpmFilter",
            "debug[1]": "Motor 2 - rpmFilter",
            "debug[2]": "Motor 3 - rpmFilter",
            "debug[3]": "Motor 4 - rpmFilter",
        },
        D_MAX: {
            "debug[all]": "D_MAX",
            "debug[0]": "Gyro Factor [roll]",
            "debug[1]": "Setpoint Factor [roll]",
            "debug[2]": "Actual D [roll]",
            "debug[3]": "Actual D [pitch]",
        },
        AC_CORRECTION: {
            "debug[all]": "AC Correction",
            "debug[0]": "AC Correction [roll]",
            "debug[1]": "AC Correction [pitch]",
            "debug[2]": "AC Correction [yaw]",
        },
        AC_ERROR: {
            "debug[all]": "AC Error",
            "debug[0]": "AC Error [roll]",
            "debug[1]": "AC Error [pitch]",
            "debug[2]": "AC Error [yaw]",
        },
        DUAL_GYRO_SCALED: {
            "debug[all]": "Dual Gyro Scaled",
            "debug[0]": "Gyro 1 [roll]",
            "debug[1]": "Gyro 1 [pitch]",
            "debug[2]": "Gyro 2 [roll]",
            "debug[3]": "Gyro 2 [pitch]",
        },
        DSHOT_RPM_ERRORS: {
            "debug[all]": "DSHOT RPM Error",
            "debug[0]": "DSHOT RPM Error [1]",
            "debug[1]": "DSHOT RPM Error [2]",
            "debug[2]": "DSHOT RPM Error [3]",
            "debug[3]": "DSHOT RPM Error [4]",
        },
        CRSF_LINK_STATISTICS_UPLINK: {
            "debug[all]": "CRSF Stats Uplink",
            "debug[0]": "Uplink RSSI 1",
            "debug[1]": "Uplink RSSI 2",
            "debug[2]": "Uplink Link Quality",
            "debug[3]": "RF Mode",
        },
        CRSF_LINK_STATISTICS_PWR: {
            "debug[all]": "CRSF Stats Power",
            "debug[0]": "Antenna",
            "debug[1]": "SNR",
            "debug[2]": "TX Power",
        },
        CRSF_LINK_STATISTICS_DOWN: {
            "debug[all]": "CRSF Stats Downlink",
            "debug[0]": "Downlink RSSI",
            "debug[1]": "Downlink Link Quality",
            "debug[2]": "Downlink SNR",
        },
        BARO: {
            "debug[all]": "Debug Barometer",
            "debug[0]": "Baro State",
            "debug[1]": "Baro Pressure",
            "debug[2]": "Baro Temperature",
            "debug[3]": "Baro Altitude",
        },
        GPS_RESCUE_THROTTLE_PID: {
            "debug[all]": "GPS Rescue throttle PIDs",
            "debug[0]": "Throttle P",
            "debug[1]": "Throttle D",
            "debug[2]": "Altitude",
            "debug[3]": "Target altitude",
        },
        DYN_IDLE: {
            "debug[all]": "Dyn Idle",
            "debug[0]": "Dyn Idle P [roll]",
            "debug[1]": "Dyn Idle I [roll]",
            "debug[2]": "Dyn Idle D [roll]",
            "debug[3]": "Min RPM",
        },
        FEEDFORWARD_LIMIT: {
            "debug[all]": "Feedforward Limit",
            "debug[0]": "Feedforward Limited [roll]",
            "debug[1]": "Feedforward Limited [pitch]",
            "debug[2]": "Feedforward Limited [yaw]",
            "debug[3]": "Feedforward Average [roll]",
        },
        FEEDFORWARD: {
            "debug[all]": "Feedforward",
            "debug[0]": "Feedforward Avg [roll]",
            "debug[1]": "Feedforward Avg [pitch]",
            "debug[2]": "Feedforward Avg [yaw]",
        },
        BLACKBOX_OUTPUT: {
            "debug[all]": "Blackbox Output",
            "debug[0]": "Blackbox Rate",
            "debug[1]": "Blackbox Rate Max",
            "debug[2]": "Blackbox Drops",
            "debug[3]": "Blackbox Bytes Free",
        },
        GYRO_SAMPLE: {
            "debug[all]": "Gyro Sample",
            "debug[0]": "Gyro before downsampling [dbg-axis]",
            "debug[1]": "Gyro after downsampling [dbg-axis]",
            "debug[2]": "Gyro after RPM [dbg-axis]",
        },
        RX_TIMING: {
            "debug[all]": "Rx Timing",
            "debug[0]": "Delta (current frame time - average frame time)",
            "debug[1]": "Frame Age",
            "debug[2]": "Frame Jitter",
            "debug[3]": "Frame Age standard deviation",
        },
        D_LPF: {
            "debug[all]": "D_LPF",
            "debug[0]": "D Setpoint [roll]",
            "debug[1]": "D Setpoint Unfiltered [roll]",
            "debug[2]": "D Measurement [roll]",
            "debug[3]": "D Measurement Unfiltered [roll]",
        },
        VTX_TRAMP: {
            "debug[all]": "VTX Tramp",
            "debug[0]": "Status",
            "debug[1]": "Reply Code",
            "debug[2]": "Pit Mode",
            "debug[3]": "Retry Count",
        },
        GHST: {
            "debug[all]": "GHST",
            "debug[0]": "CRC Error Count",
            "debug[1]": "Unknown Frame Count",
            "debug[2]": "RSSI",
            "debug[3]": "LQ",
        },
        GHST_MSP: {
            "debug[all]": "GHST MSP",
            "debug[0]": "MSP Requests Received",
            "debug[1]": "MSP Responses Sent",
        },
        SCHEDULER_DETERMINISM: {
            "debug[all]": "Scheduler Determinism",
            "debug[0]": "Cycle Time",
            "debug[1]": "ID of Late Task",
            "debug[2]": "Task Delay Time",
            "debug[3]": "Gyro Skew Min",
            "debug[4]": "Min Gyro Period",
            "debug[5]": "Max Gyro Period",
            "debug[6]": "Gyro Period Range",
            "debug[7]": "Gyro Cycles Std Dev",
        },
        TIMING_ACCURACY: {
            "debug[all]": "Timing Accuracy",
            "debug[0]": "CPU Busy",
            "debug[1]": "Late Tasks per second",
            "debug[2]": "Total delay in last second",
            "debug[3]": "Total Tasks per second",
            "debug[4]": "Late Task Percentage",
            "debug[7]": "Gyro Cycles Std Dev",
        },
        RX_EXPRESSLRS_SPI: {
            "debug[all]": "Rx ExpressLRS SPI",
            "debug[0]": "Lost Connection Count",
            "debug[1]": "RSSI",
            "debug[2]": "SNR",
            "debug[3]": "Uplink LQ",
        },
        RX_EXPRESSLRS_PHASELOCK: {
            "debug[all]": "Rx ExpressLRS Phaselock",
            "debug[0]": "Phase offset in us",
            "debug[1]": "Filtered phase offset",
            "debug[2]": "Frequency offset in hz",
            "debug[3]": "Phase Shift",
        },
        RX_STATE_TIME: {
            "debug[all]": "Rx State Time",
            "debug[0]": "Time Spent In Failsafe",
            "debug[1]": "Time Spent With Rx Loss",
            "debug[2]": "Failsafe Count",
            "debug[3]": "Rx Loss Count",
        },
        GPS_RESCUE_VELOCITY: {
            "debug[all]": "GPS Rescue Velocity",
            "debug[0]": "P term",
            "debug[1]": "D term (filtered)",
            "debug[2]": "Velocity to Home",
            "debug[3]": "Target Velocity",
        },
        GPS_RESCUE_HEADING: {
            "debug[all]": "GPS Rescue Heading",
            "debug[0]": "Ground Speed",
            "debug[1]": "GPS Ground Course",
            "debug[2]": "Yaw Attitude",
            "debug[3]": "Direction To Home",
        },
        GPS_RESCUE_TRACKING: {
            "debug[all]": "GPS Rescue Tracking",
            "debug[0]": "Velocity To Home",
            "debug[1]": "Target Vertical Velocity",
            "debug[2]": "Current Altitude",
            "debug[3]": "Target Altitude",
        },
        GPS_CONNECTION: {
            "debug[all]": "GPS Connection",
            "debug[0]": "State",
            "debug[1]": "Hardware State",
            "debug[2]": "Connection State",
            "debug[3]": "Ack State",
        },
        ATTITUDE: {
            "debug[all]": "Attitude",
            "debug[0]": "Roll Angle",
            "debug[1]": "Pitch Angle",
        },
        VTX_MSP: {
            "debug[all]": "VTX MSP",
            "debug[0]": "packetCounter",
            "debug[1]": "isCrsfPortConfig",
            "debug[2]": "isLowPowerDisarmed",
            "debug[3]": "mspTelemetryDescriptor",
        },
        GPS_DOP: {
            "debug[all]": "GPS DOP",
            "debug[0]": "Number of Satellites",
            "debug[1]": "pDOP (positional - 3D)",
            "debug[2]": "hDOP (horizontal - 2D)",
            "debug[3]": "vDOP (vertical - 1D)",
        },
        FAILSAFE: {
            "debug[all]": "Failsafe",
            "debug[0]": "Failsafe Phase Switch",
            "debug[1]": "Failsafe State",
            "debug[2]": "Receiving Channels",
            "debug[3]": "Valid Channels",
        },
        GYRO_CALIBRATION: {
            "debug[all]": "Gyro Calibration",
            "debug[0]": "Calibration Stddev [roll]",
            "debug[1]": "Calibration Stddev [pitch]",
            "debug[2]": "Calibration Stddev [yaw]",
            "debug[3]": "Calibration Cycles Remaining",
        },
        ANGLE_MODE: {
            "debug[all]": "Angle Mode",
            "debug[0]": "Current Angle [roll]",
            "debug[1]": "Angle Target [roll]",
            "debug[2]": "Current Angle [pitch]",
            "debug[3]": "Angle Target [pitch]",
        },
        ANGLE_TARGET: {
            "debug[all]": "Angle Target",
            "debug[0]": "Target [roll]",
            "debug[1]": "Target [pitch]",
            "debug[2]": "Target FF [roll]",
            "debug[3]": "Target FF [pitch]",
        },
        CURRENT_ANGLE: {
            "debug[all]": "Current Angle",
            "debug[0]": "Angle [roll] * 10",
            "debug[1]": "Angle [pitch] * 10",
            "debug[2]": "Heading",
        },
        DSHOT_TELEMETRY_COUNTS: {
            "debug[all]": "Dshot Telemetry Counts",
            "debug[3]": "Preamble Skip",
        },
        RPM_LIMIT: {
            "debug[all]": "RPM Limit",
            "debug[0]": "RPM Limit Active State",
            "debug[1]": "Average RPM (unsmoothed)",
            "debug[2]": "RPM Limit throttle scale",
            "debug[3]": "Throttle",
            "debug[4]": "Error",
            "debug[5]": "Proportional",
            "debug[6]": "Integral",
            "debug[7]": "Derivative",
        },
        RC_STATS: {
            "debug[all]": "RC Stats",
            "debug[0]": "Average Throttle",
        },
        MAG_CALIB: {
            "debug[all]": "Mag Calibration",
            "debug[0]": "Mag X",
            "debug[1]": "Mag Y",
            "debug[2]": "Mag Z",
            "debug[3]": "Norm / Length of magADC",
            "debug[4]": "Estimated Mag Bias X",
            "debug[5]": "Estimated Mag Bias Y",
            "debug[6]": "Estimated Mag Bias Z",
            "debug[7]": "Mag Bias Estimator",
        },
        MAG_TASK_RATE: {
            "debug[all]": "Mag Task Rate",
            "debug[0]": "Task Rate (Hz)",
            "debug[1]": "Actual Data Rate (Hz)",
            "debug[2]": "Data Interval (Us)",
            "debug[3]": "Execute Time (Us)",
            "debug[4]": "Bus Busy",
            "debug[5]": "Read State",
            "debug[6]": "Task Time (Us)",
        },
        EZLANDING: {
            "debug[all]": "EZ Landing",
            "debug[0]": "EZ Land Factor",
            "debug[1]": "Adjusted Throttle",
            "debug[2]": "Upper Limit",
            "debug[3]": "EZ Land Limit",
            "debug[4]": "Stick Limit",
            "debug[5]": "Speed Limit",
        },
        TPA: {
            "debug[all]": "TPA",
            "debug[0]": "TPA Factor",
        },
        S_TERM: {
            "debug[all]": "S Term",
            "debug[0]": "S Term [roll]",
            "debug[1]": "S Term [pitch]",
            "debug[2]": "S Term [yaw]",
        },
        SPA: {
            "debug[all]": "SPA",
            "debug[0]": "Setpoint PID Attenuation [roll]",
            "debug[1]": "Setpoint PID Attenuation [pitch]",
            "debug[2]": "Setpoint PID Attenuation [yaw]",
        },
        TASK: {
            "debug[all]": "TASK",
            "debug[0]": "Value",
            "debug[1]": "Rate (Hz)",
            "debug[2]": "Max (us)",
            "debug[3]": "Average (us)",
            "debug[4]": "Estimated execution time (us)",
            "debug[5]": "Actual execution time (us)",
            "debug[6]": "Difference estimated vs actual",
            "debug[7]": "Late count",
        },
        GIMBAL: {
            "debug[all]": "Gimbal",
            "debug[0]": "Headtracker Roll",
            "debug[1]": "Headtracker Pitch",
            "debug[2]": "Headtracker Yaw",
            "debug[3]": "Gimbal Roll",
            "debug[4]": "Gimbal Pitch",
            "debug[5]": "Gimbal Yaw",
        },
        WING_SETPOINT: {
            "debug[all]": "Wing Setpoint",
            "debug[0]": "Current Setpoint [roll]",
            "debug[1]": "Adjusted Setpoint [roll]",
            "debug[2]": "Current Setpoint [pitch]",
            "debug[3]": "Adjusted Setpoint [pitch]",
            "debug[4]": "Current Setpoint [yaw]",
            "debug[5]": "Adjusted Setpoint [yaw]",
        },
    };

    if (!apiVersion) {
        return baseFieldNames;
    }

    // Make a copy to modify
    const result = { ...baseFieldNames };

    if (semver.gte(apiVersion, API_VERSION_1_46)) {
        result.ATTITUDE = {
            "debug[all]": "Attitude",
            "debug[0]": "Roll Angle",
            "debug[1]": "Pitch Angle",
            "debug[2]": "Ground Speed Factor",
            "debug[3]": "Heading Error",
            "debug[4]": "Velocity to Home",
            "debug[5]": "Ground Speed Error Ratio",
            "debug[6]": "Pitch Forward Angle",
            "debug[7]": "dcmKp Gain",
        };
        result.GPS_RESCUE_THROTTLE_PID = {
            "debug[all]": "GPS Rescue throttle PID",
            "debug[0]": "Throttle P",
            "debug[1]": "Throttle D",
            "debug[2]": "Altitude",
            "debug[3]": "Target altitude",
            "debug[4]": "Throttle I",
            "debug[5]": "Tilt adjustment",
            "debug[6]": "Throttle D before lp smoothing",
            "debug[7]": "Throttle adjustment",
        };
        // debug[2]/debug[3] only populate under USE_BATTERY_VOLTAGE_SAG_COMPENSATION;
        // debug[3] is shared with voltageStableBits when that feature is off.
        result.BATTERY = {
            "debug[all]": "Debug Battery",
            "debug[0]": "Battery Volt ADC",
            "debug[1]": "Battery Volt",
            "debug[2]": "Sag Comp Battery Goodness",
            "debug[3]": "Voltage Stable Bits / Sag Attenuation",
            "debug[4]": "Voltage Is Stable",
            "debug[5]": "Voltage From Battery",
            "debug[6]": "Battery Volt (Prev Filtered)",
            "debug[7]": "Voltage State",
        };
        // debug[2]/debug[3] are multiplexed by GPS init phase (io/gps.c):
        // baud-detect retry count / baudrate before fix, ms-since-last-nav after.
        result.GPS_CONNECTION = {
            "debug[all]": "GPS Connection",
            "debug[0]": "GPS Model",
            "debug[1]": "Nav Interval (ms)",
            "debug[2]": "Baud Detect Retry / Time Since Nav",
            "debug[3]": "Baudrate / Time Since Nav",
            "debug[4]": "State * 100 + State Position",
            "debug[5]": "Task Execute Time (us)",
            "debug[6]": "Ack State",
            "debug[7]": "RX Bytes Waiting",
        };
        // gps_rescue.c started using all 8 debug channels (#13055).
        result.GPS_RESCUE_VELOCITY = {
            "debug[all]": "GPS Rescue Velocity",
            "debug[0]": "P term",
            "debug[1]": "D term (filtered)",
            "debug[2]": "Velocity to Home",
            "debug[3]": "Target Velocity",
            "debug[4]": "I term",
            "debug[5]": "D term (raw)",
            "debug[6]": "I-term Relax Factor",
            "debug[7]": "Pitch Output",
        };
        result.GPS_RESCUE_HEADING = {
            "debug[all]": "GPS Rescue Heading",
            "debug[0]": "Ground Speed",
            "debug[1]": "GPS Ground Course",
            "debug[2]": "Yaw Attitude",
            "debug[3]": "Direction To Home",
            "debug[5]": "Roll Mix Attenuator",
            "debug[6]": "Roll Angle Adjustment * 100",
            "debug[7]": "Yaw Rate Correction",
        };
        result.GPS_RESCUE_TRACKING = {
            "debug[all]": "GPS Rescue Tracking",
            "debug[0]": "Velocity To Home",
            "debug[1]": "Target Vertical Velocity",
            "debug[2]": "Current Altitude",
            "debug[3]": "Target Altitude",
            "debug[4]": "Yaw Attitude",
            "debug[5]": "Direction To Home",
            "debug[7]": "Roll Angle Adjustment * 100",
        };
    }

    if (semver.gte(apiVersion, API_VERSION_1_47)) {
        delete result.GPS_RESCUE_THROTTLE_PID;
        delete result.GYRO_SCALED;

        result.MULTI_GYRO_RAW = result.DUAL_GYRO_RAW;
        result.MULTI_GYRO_DIFF = result.DUAL_GYRO_DIFF;
        result.MULTI_GYRO_SCALED = result.DUAL_GYRO_SCALED;

        delete result.DUAL_GYRO_RAW;
        delete result.DUAL_GYRO_DIFF;
        delete result.DUAL_GYRO_SCALED;

        result.FFT_FREQ = {
            "debug[all]": "Debug FFT FREQ",
            "debug[0]": "Gyro Pre Dyn Notch [dbg-axis]",
            "debug[1]": "Notch 1 Center Freq [dbg-axis]",
            "debug[2]": "Notch 2 Center Freq [dbg-axis]",
            "debug[3]": "Notch 3 Center Freq [dbg-axis]",
            "debug[4]": "Notch 4 Center Freq [dbg-axis]",
            "debug[5]": "Notch 5 Center Freq [dbg-axis]",
            "debug[6]": "Notch 6 Center Freq [dbg-axis]",
            "debug[7]": "Notch 7 Center Freq [dbg-axis]",
        };

        result.AUTOPILOT_ALTITUDE = {
            "debug[all]": "Autopilot Altitude",
            "debug[0]": "Autopilot Throttle",
            "debug[1]": "Tilt Multiplier",
            "debug[2]": "Target Altitude cm",
            "debug[3]": "Current Altitude cm",
            "debug[4]": "Altitude P",
            "debug[5]": "Altitude I",
            "debug[6]": "Altitude D",
            "debug[7]": "Altitude F",
        };

        result.TPA = {
            "debug[all]": "TPA",
            "debug[0]": "TPA Factor",
            "debug[1]": "TPA Attitude Roll (Wing)",
            "debug[2]": "TPA Attitude Pitch (Wing)",
            "debug[3]": "TPA Calculated Throttle (Wing)",
            "debug[4]": "TPA Speed (Wing)",
            "debug[5]": "TPA Argument (Wing)",
        };

        result.OPTICALFLOW = {
            "debug[all]": "Optical Flow",
            "debug[0]": "Quality",
            "debug[1]": "Raw flow rates X",
            "debug[2]": "Raw flow rates Y",
            "debug[3]": "Processed flow rates X",
            "debug[4]": "Processed flow rates Y",
            "debug[5]": "Delta time",
        };

        result.AUTOPILOT_POSITION = {
            "debug[all]": "Autopilot Position",
            "debug[0]": "Distance",
            "debug[1]": "GPS Distance",
            "debug[2]": "PID Sum EF",
            "debug[3]": "Angle",
            "debug[4]": "pidP",
            "debug[5]": "pidI",
            "debug[6]": "pidD",
            "debug[7]": "pidA",
        };

        result.CHIRP = {
            "debug[all]": "Chirp",
            "debug[0]": "Chirp sinarg",
            "debug[1]": "Chirp Axis",
            "debug[2]": "Chirp Frequency (dHz)",
            "debug[3]": "Chirp Excitation * 1000",
        };

        result.FLASH_TEST_PRBS = {
            "debug[all]": "Flash Test PRBS",
            "debug[0]": "State",
            "debug[1]": "Bytes Written Count",
            "debug[2]": "Flash Length",
            "debug[6]": "FlashLength / Pagesize",
            "debug[7]": "Errors",
        };

        // rx/mavlink.c writes debug[0-1]; telemetry/mavlink.c writes debug[2-7]
        // (per-message-type TX counters, disjoint from the RX-side fields).
        result.MAVLINK_TELEMETRY = {
            "debug[all]": "MAVLink Telemetry",
            "debug[0]": "Send Telemetry Flag",
            "debug[1]": "Last known TX buffer free space",
            "debug[2]": "Heartbeat TX Count",
            "debug[3]": "RC/RSSI TX Count",
            "debug[4]": "GPS Raw TX Count",
            "debug[5]": "Attitude TX Count",
            "debug[6]": "VFR HUD TX Count",
            "debug[7]": "Battery/Sys Status TX Count",
        };

        // fc/rc.c reworked RC smoothing/feedforward/RX-timing debug output
        // in one pass (#14411) — the pre-1.47 field layouts below are unrelated.
        result.RC_SMOOTHING = {
            "debug[all]": "Debug RC Smoothing",
            "debug[0]": "Current RX Rate",
            "debug[1]": "Smoothed RX Rate (for cutoffs)",
            "debug[2]": "Setpoint Cutoff Frequency",
            "debug[3]": "Throttle Cutoff Frequency",
            "debug[4]": "Feedforward Filter Gain * 1000",
            "debug[5]": "Smoothed RX Rate",
            "debug[6]": "Outlier Count",
            "debug[7]": "Valid Sample Count",
        };

        result.RC_SMOOTHING_RATE = {
            "debug[all]": "Debug RC Smoothing Rate",
            "debug[0]": "Current RX Refresh Rate",
            "debug[2]": "Average RX Refresh Rate",
            "debug[3]": "Smoothing Update Flag",
        };

        result.RX_TIMING = {
            "debug[all]": "Rx Timing",
            "debug[0]": "Delta (current frame time - average frame time)",
            "debug[1]": "Frame Age",
            "debug[2]": "Frame Jitter",
            "debug[3]": "Frame Age standard deviation",
            "debug[4]": "Current RX Rate",
            "debug[5]": "Smoothed RX Rate",
            "debug[6]": "Link Quality",
            "debug[7]": "Rx Receiving Signal Flag",
        };

        // All fields are single-axis, gated by `axis == gyro.gyroDebugAxis` in fc/rc.c.
        result.FEEDFORWARD = {
            "debug[all]": "Feedforward",
            "debug[0]": "Setpoint [dbg-axis]",
            "debug[1]": "Setpoint Speed [dbg-axis]",
            "debug[2]": "Feedforward Boost [dbg-axis]",
            "debug[3]": "RC Command Delta [dbg-axis]",
            "debug[4]": "Jitter Attenuator [dbg-axis]",
            "debug[5]": "Is Duplicate Packet [dbg-axis]",
            "debug[6]": "Yaw FF (no hold)",
            "debug[7]": "Yaw FF (with hold)",
        };

        result.FEEDFORWARD_LIMIT = {
            "debug[all]": "Feedforward Limit",
            "debug[0]": "Jitter Attenuation %",
            "debug[1]": "Max Setpoint Rate [dbg-axis]",
            "debug[2]": "Setpoint (unsmoothed) [dbg-axis]",
            "debug[3]": "Feedforward (unsmoothed) [dbg-axis]",
            "debug[4]": "Setpoint Speed (unsmoothed) [dbg-axis]",
            "debug[5]": "Setpoint Speed (smoothed) [dbg-axis]",
            "debug[6]": "Feedforward PT1 K",
            "debug[7]": "Smoothed RX Rate (Hz)",
        };

        result.EZLANDING = {
            "debug[all]": "EZ Landing",
            "debug[0]": "EZ Land Factor",
            "debug[1]": "Adjusted Throttle",
            "debug[2]": "Upper Limit",
            "debug[3]": "EZ Land Limit",
            "debug[4]": "Stick Limit",
            "debug[5]": "Speed Limit",
            "debug[6]": "Max Stick Deflection",
            "debug[7]": "Jerk Magnitude",
        };
    }

    if (semver.gte(apiVersion, API_VERSION_1_48)) {
        result.AUTOPILOT_PID = {
            "debug[all]": "Autopilot PID",
            "debug[0]": "Velocity Error [dbg-axis]",
            "debug[1]": "Distance Error [dbg-axis]",
            "debug[2]": "P Term [dbg-axis] * 10",
            "debug[3]": "I Term [dbg-axis] * 10",
            "debug[4]": "D Term [dbg-axis] * 10",
            "debug[5]": "A Term [dbg-axis] * 10",
            "debug[6]": "PID Sum [dbg-axis] * 10",
            "debug[7]": "Status Flags [dbg-axis]",
        };

        result.AUTOPILOT_STOP = {
            "debug[all]": "Autopilot Stop",
            "debug[0]": "Velocity Error [East]",
            "debug[1]": "Velocity Error [North]",
            "debug[2]": "PID Sum [East] * 10",
            "debug[3]": "PID Sum [North] * 10",
            "debug[4]": "Roll Angle Command * 10",
            "debug[5]": "Pitch Angle Command * 10",
            "debug[6]": "Status Flags [East]",
            "debug[7]": "Status Flags [North]",
        };

        result.GYRO_SAMPLE = {
            "debug[all]": "Gyro Sample",
            "debug[0]": "Gyro before downsampling [dbg-axis]",
            "debug[1]": "Gyro after downsampling [dbg-axis]",
            "debug[2]": "Gyro after RPM [dbg-axis]",
            "debug[3]": "Gyro after all filtering [dbg-axis]",
            "debug[4]": "CPU Load at Sample",
        };

        // Flow-processing pipeline replaced the quality/raw/processed/delta-time
        // layout used prior to 1.48 (opticalflow.c rewrite).
        result.OPTICALFLOW = {
            "debug[all]": "Optical Flow",
            "debug[0]": "Rotated Flow Rate X",
            "debug[1]": "Rotated Flow Rate Y",
            "debug[2]": "Gyro Compensation X",
            "debug[3]": "Gyro Compensation Y",
            "debug[4]": "Compensated Flow Rate X",
            "debug[5]": "Compensated Flow Rate Y",
            "debug[6]": "Filtered Flow Rate X",
            "debug[7]": "Filtered Flow Rate Y",
        };

        // POSITION_NAV is a reserved firmware enum slot with no fields yet,
        // so it intentionally has no fieldNames entry.
        delete result.AUTOPILOT_POSITION;

        result.RANGEFINDER = {
            "debug[all]": "Rangefinder",
            "debug[0]": "not used",
            "debug[1]": "Raw Altitude",
            "debug[2]": "Calc Altitude",
            "debug[3]": "SNR",
            "debug[4]": "Cos Tilt Angle * 1000",
            "debug[5]": "Max Tilt Cos * 1000",
        };

        // debug[3] ("Axis Error [roll]") was removed by "Remove absolute control" (#15023).
        result.ITERM_RELAX = {
            "debug[all]": "I-term Relax",
            "debug[0]": "Setpoint HPF [roll]",
            "debug[1]": "I Relax Factor [roll]",
            "debug[2]": "Relaxed I Error [roll]",
        };
    }

    return result;
}

/**
 * Hardware-scaling context for the debug value decode/convert helpers below.
 * Injected by the caller so these functions stay free of FlightLog / Pinia /
 * FC-store coupling. The blackbox viewer builds it from a parsed log; the
 * sensors live view builds it from the connected FC.
 *
 * @typedef {object} DebugScaleContext
 * @property {string} apiVersion - resolved API version (selects field layouts).
 * @property {number} motorPoles - motor pole count for eRPM conversions.
 * @property {(v:number)=>number} accRawToGs - raw accel → g.
 * @property {(v:number)=>number} gyroRawToDegreesPerSecond - raw gyro → °/s.
 * @property {(v:number)=>number} rcCommandRawToThrottle - raw throttle → %.
 * @property {(v:number)=>number} [throttleToRcCommandRaw] - inverse of above (convert only).
 * @property {string[]} [fftCalcSteps] - FFT calc-step enum names (optional).
 */

// ---------------------------------------------------------------------------
// Per-debug-mode value decoding (→ display string with units).
//
// Each entry is keyed by mode name and is either:
//   - a function (value, ctx, fieldName) => string  (whole-mode formatter), or
//   - an object  { "debug[n]": (value, ctx) => string, _default: ... } keyed by field.
// Modes/fields not present fall back to a plain integer (`value.toFixed(0)`),
// which matches the firmware's "no special formatting" behaviour. Hardware
// scaling comes from the injected ctx so this stays source-agnostic.
// ---------------------------------------------------------------------------

const f0 = (v) => v.toFixed(0);
const gyroDps = (v, ctx) => `${Math.round(ctx.gyroRawToDegreesPerSecond(v))} °/s`;
const gyroDecode = (v, ctx, fieldName) => (fieldName === "debug[4]" ? `${v.toFixed(0)} %` : gyroDps(v, ctx));
const fftFreqDecode = (v, ctx, fieldName) => {
    const gyroField = semver.gte(ctx.apiVersion, API_VERSION_1_47) ? "debug[0]" : "debug[3]";
    return fieldName === gyroField ? gyroDps(v, ctx) : `${v.toFixed(0)} Hz`;
};
// Pre-1.48: debug[0] is raw quality, debug[5] is deltaTimeUs (both unscaled ints).
// 1.48+: all 8 fields are the rotate/compensate/filter pipeline, scaled by 1000.
const opticalflowDecode = (v, ctx, fieldName) => {
    if (!semver.gte(ctx.apiVersion, API_VERSION_1_48) && (fieldName === "debug[0]" || fieldName === "debug[5]")) {
        return f0(v);
    }
    return (v / 1000).toFixed(1);
};

const DEBUG_DECODE = {
    NONE: {
        "debug[1]": (v) => `${v.toFixed(0)} hPa`,
        "debug[2]": (v) => `${(v / 100).toFixed(2)} °C`,
        "debug[3]": (v) => `${(v / 100).toFixed(2)} m`,
        _default: (v) => `${v.toFixed(0)}`,
    },
    CYCLETIME: {
        "debug[1]": (v) => `${v.toFixed(0)} %`,
        _default: (v) => `${v.toFixed(0)}μS`,
    },
    BATTERY: {
        "debug[0]": f0,
        "debug[1]": (v) => `${(v / 10).toFixed(1)} V`,
        "debug[2]": (v) => `${v.toFixed(0)} %`,
        "debug[6]": (v) => `${(v / 10).toFixed(1)} V`,
        _default: f0,
    },
    ACCELEROMETER: {
        "debug[0]": (v, ctx) => `${ctx.accRawToGs(v).toFixed(2)} g`,
        "debug[1]": (v, ctx) => `${ctx.accRawToGs(v).toFixed(2)} g`,
        "debug[2]": (v) => `${(v / 1000).toFixed(2)} g`,
        "debug[3]": (v, ctx) => `${ctx.accRawToGs(v * 100).toFixed(2)} g/s`,
        "debug[4]": (v) => `${(v / 1000).toFixed(2)} g/s`,
        _default: f0,
    },
    MIXER: (v, ctx) => `${Math.round(ctx.rcCommandRawToThrottle(v))} %`,
    PIDLOOP: (v) => `${v.toFixed(0)} μS`,
    RC_INTERPOLATION: {
        "debug[1]": (v) => `${v.toFixed(0)} ms`,
        "debug[3]": (v) => `${v.toFixed(0)} °/s`,
        _default: f0,
    },
    ANGLERATE: (v) => `${v.toFixed(0)} °/s`,
    ESC_SENSOR: {
        "debug[3]": (v) => `${v.toFixed(0)} μS`,
        _default: f0,
    },
    SCHEDULER: (v) => `${v.toFixed(0)} μS`,
    ESC_SENSOR_RPM: (v) => `${v.toFixed(0)} rpm`,
    ESC_SENSOR_TMP: (v) => `${v.toFixed(0)} °C`,
    ALTITUDE: {
        "debug[1]": (v) => `${(v / 100).toFixed(2)} m`,
        "debug[2]": (v) => `${(v / 100).toFixed(2)} m`,
        "debug[3]": (v) => `${(v / 100).toFixed(2)} m`,
        _default: f0,
    },
    FFT: {
        "debug[0]": gyroDps,
        "debug[1]": gyroDps,
        "debug[2]": gyroDps,
        _default: f0,
    },
    FFT_TIME: {
        "debug[0]": (v, ctx) => ctx.fftCalcSteps?.[v] ?? v.toFixed(0),
        "debug[1]": (v) => `${v.toFixed(0)} μs`,
        _default: f0,
    },
    FFT_FREQ: fftFreqDecode,
    ITERM_RELAX: {
        "debug[0]": (v) => `${v.toFixed(0)} °/s`,
        "debug[1]": (v) => `${v.toFixed(0)} %`,
        "debug[3]": (v) => `${(v / 10).toFixed(1)} °`,
        _default: f0,
    },
    RC_SMOOTHING: {
        "debug[0]": (v) => `${v.toFixed(0)} Hz`,
        "debug[1]": (v) => `${v.toFixed(0)} Hz`,
        "debug[2]": (v) => `${v.toFixed(0)} Hz`,
        "debug[3]": (v) => `${v.toFixed(0)} Hz`,
        "debug[5]": (v) => `${v.toFixed(0)} Hz`,
        "debug[4]": (v) => `${(v / 1000).toFixed(3)}`,
        _default: f0,
    },
    RC_SMOOTHING_RATE: {
        "debug[0]": (v) => `${(v / 1000).toFixed(2)} ms`,
        "debug[2]": (v) => `${v.toFixed(0)} Hz`,
        _default: f0,
    },
    DSHOT_RPM_TELEMETRY: (v, ctx) =>
        `${((v * 200) / ctx.motorPoles).toFixed(0)} rpm / ${((v * 3.333) / ctx.motorPoles).toFixed(0)} hz`,
    RPM_FILTER: (v) => `${(v * 60).toFixed(0)}rpm / ${v.toFixed(0)} Hz`,
    D_MAX: {
        "debug[0]": (v) => `${v.toFixed(0)} %`,
        "debug[1]": (v) => `${v.toFixed(0)} %`,
        "debug[2]": (v) => (v / 10).toFixed(1),
        "debug[3]": (v) => (v / 10).toFixed(1),
        _default: f0,
    },
    DYN_LPF: {
        "debug[0]": gyroDps,
        "debug[3]": gyroDps,
        _default: (v) => `${v.toFixed(0)} Hz`,
    },
    DYN_IDLE: {
        "debug[3]": (v) => `${v * 6} rpm / ${(v / 10).toFixed(0)} hz`,
        _default: f0,
    },
    AC_CORRECTION: (v) => `${(v / 10).toFixed(1)} °/s`,
    AC_ERROR: (v) => `${(v / 10).toFixed(1)} °`,
    RX_TIMING: {
        "debug[0]": (v) => `${(v / 100).toFixed(2)} ms`,
        "debug[3]": (v) => `${(v / 100).toFixed(2)} ms`,
        "debug[1]": (v) => `${(v / 10).toFixed(1)} ms`,
        "debug[4]": (v) => `${v.toFixed(0)} Hz`,
        "debug[5]": (v) => `${v.toFixed(0)} Hz`,
        _default: f0,
    },
    GHST: {
        "debug[3]": (v) => `${v.toFixed(0)} %`,
        _default: f0,
    },
    SCHEDULER_DETERMINISM: {
        "debug[0]": (v) => `${(v / 10).toFixed(1)} us`,
        "debug[2]": (v) => `${(v / 10).toFixed(1)} us`,
        "debug[3]": (v) => `${(v / 10).toFixed(1)} us`,
        "debug[4]": (v) => `${(v / 10).toFixed(1)} us`,
        "debug[5]": (v) => `${(v / 10).toFixed(1)} us`,
        "debug[6]": (v) => `${(v / 10).toFixed(1)} us`,
        "debug[7]": (v) => `${(v / 10).toFixed(1)} us`,
        _default: f0,
    },
    TIMING_ACCURACY: {
        "debug[0]": (v) => `${v.toFixed(1)} %`,
        "debug[2]": (v) => `${(v / 10).toFixed(1)} us`,
        "debug[4]": (v) => `${(v / 10).toFixed(1)} %`,
        "debug[7]": (v) => `${(v / 10).toFixed(1)} us`,
        _default: f0,
    },
    RX_EXPRESSLRS_SPI: {
        "debug[3]": (v) => `${v.toFixed(1)} %`,
        _default: f0,
    },
    RX_EXPRESSLRS_PHASELOCK: {
        "debug[2]": (v) => `${v.toFixed(0)} ticks`,
        _default: (v) => `${v.toFixed(0)} us`,
    },
    GPS_RESCUE_THROTTLE_PID: {
        "debug[0]": (v) => `${v.toFixed(0)} uS`,
        "debug[1]": (v) => `${v.toFixed(0)} uS`,
        "debug[4]": (v) => `${v.toFixed(0)} uS`,
        "debug[6]": (v) => `${v.toFixed(0)} uS`,
        "debug[2]": (v) => `${(v / 100).toFixed(1)} m`,
        "debug[3]": (v) => `${(v / 100).toFixed(1)} m`,
        _default: f0,
    },
    GPS_RESCUE_VELOCITY: {
        "debug[0]": (v) => `${(v / 100).toFixed(1)} °`,
        "debug[1]": (v) => `${(v / 100).toFixed(1)} °`,
        "debug[2]": (v) => `${(v / 100).toFixed(1)} m/s`,
        "debug[3]": (v) => `${(v / 100).toFixed(1)} m/s`,
        "debug[4]": (v) => `${(v / 100).toFixed(1)} °`,
        "debug[5]": (v) => `${(v / 100).toFixed(1)} °`,
        "debug[7]": (v) => `${(v / 100).toFixed(1)} °`,
        _default: f0,
    },
    GPS_RESCUE_HEADING: {
        "debug[0]": (v) => `${(v / 100).toFixed(2)} m/s`,
        "debug[1]": (v) => `${(v / 10).toFixed(1)} °`,
        "debug[2]": (v) => `${(v / 10).toFixed(1)} °`,
        "debug[3]": (v) => `${(v / 10).toFixed(1)} °`,
        "debug[6]": (v) => `${(v / 100).toFixed(1)} °`,
        _default: f0,
    },
    GPS_RESCUE_TRACKING: {
        "debug[0]": (v) => `${(v / 100).toFixed(1)} m/s`,
        "debug[1]": (v) => `${(v / 100).toFixed(1)} m/s`,
        "debug[2]": (v) => `${(v / 100).toFixed(1)} m`,
        "debug[3]": (v) => `${(v / 100).toFixed(1)} m`,
        "debug[4]": (v) => `${(v / 10).toFixed(1)} °`,
        "debug[5]": (v) => `${(v / 10).toFixed(1)} °`,
        "debug[7]": (v) => `${(v / 100).toFixed(1)} °`,
        _default: f0,
    },
    GPS_CONNECTION: {
        "debug[3]": (v) => (v * 100).toFixed(0),
        _default: f0,
    },
    GPS_DOP: {
        "debug[0]": f0,
        _default: (v) => (v / 100).toFixed(2),
    },
    ANGLE_MODE: {
        "debug[0]": (v) => `${(v / 10).toFixed(1)} °`,
        "debug[1]": (v) => `${(v / 10).toFixed(1)} °`,
        "debug[2]": (v) => `${(v / 10).toFixed(1)} °`,
        "debug[3]": (v) => `${(v / 10).toFixed(1)} °`,
        _default: f0,
    },
    EZLANDING: (v) => `${(v / 100).toFixed(2)} %`,
    OPTICALFLOW: opticalflowDecode,
    AUTOPILOT_POSITION: {
        "debug[2]": (v) => `${(v / 10).toFixed(1)}`,
        "debug[3]": (v) => `${(v / 10).toFixed(1)}`,
        "debug[4]": (v) => `${(v / 10).toFixed(1)}`,
        "debug[5]": (v) => `${(v / 10).toFixed(1)}`,
        "debug[6]": (v) => `${(v / 10).toFixed(1)}`,
        "debug[7]": (v) => `${(v / 10).toFixed(1)}`,
        _default: (v) => v.toFixed(1),
    },
    TPA: {
        "debug[1]": (v) => `${(v / 10).toFixed(1)} °`,
        "debug[2]": (v) => `${(v / 10).toFixed(1)} °`,
        "debug[4]": (v) => `${(v / 10).toFixed(1)} m/s`,
        _default: (v) => v.toFixed(1),
    },
    FEEDFORWARD: {
        "debug[0]": (v) => `${v.toFixed(0)} °/s`,
        "debug[1]": (v) => `${v.toFixed(0)} °/s/s`,
        "debug[3]": (v) => `${(v / 10).toFixed(1)}`,
        "debug[4]": (v) => `${v.toFixed(0)} %`,
        _default: f0,
    },
    FEEDFORWARD_LIMIT: {
        "debug[0]": (v) => `${v.toFixed(0)} %`,
        "debug[6]": (v) => `${(v / 1000).toFixed(3)}`,
        "debug[7]": (v) => `${v.toFixed(0)} Hz`,
        _default: f0,
    },
    VELOCITY: () => "",
    DFILTER: () => "",
};
// Gyro-family modes share one whole-mode formatter.
for (const m of [
    "GYRO",
    "GYRO_FILTERED",
    "GYRO_SCALED",
    "DUAL_GYRO",
    "DUAL_GYRO_COMBINED",
    "DUAL_GYRO_DIFF",
    "DUAL_GYRO_RAW",
    "MULTI_GYRO_DIFF",
    "MULTI_GYRO_RAW",
    "MULTI_GYRO_SCALED",
    "NOTCH",
    "GYRO_SAMPLE",
]) {
    DEBUG_DECODE[m] = gyroDecode;
}
// NONE/AIRMODE/BARO share one block (firmware groups them).
DEBUG_DECODE.AIRMODE = DEBUG_DECODE.NONE;
DEBUG_DECODE.BARO = DEBUG_DECODE.NONE;

/**
 * Format a debug field value as a human-readable string with units, for the
 * given debug mode. Mirrors the firmware's per-debug-mode field semantics.
 * This is the single source of truth shared by the blackbox viewer and the
 * sensors live view.
 *
 * @param {string} debugModeName - e.g. "BATTERY" (from getDebugModes(apiVersion)).
 * @param {string} fieldName - e.g. "debug[1]".
 * @param {number} value - raw field value.
 * @param {DebugScaleContext} ctx - hardware scaling context.
 * @returns {string}
 */
export function decodeDebugFieldToFriendly(debugModeName, fieldName, value, ctx) {
    const entry = DEBUG_DECODE[debugModeName];
    if (entry === undefined) {
        return value.toFixed(0);
    }
    if (typeof entry === "function") {
        return entry(value, ctx, fieldName);
    }
    const fn = entry[fieldName] ?? entry._default;
    return fn ? fn(value, ctx) : value.toFixed(0);
}

// ---------------------------------------------------------------------------
// Per-debug-mode value conversion (log/raw units ↔ chart/friendly units).
// Same table shape as DEBUG_DECODE; each formatter is (toFriendly, value, ctx)
// => number. Modes/fields not present pass the value through unchanged.
// ---------------------------------------------------------------------------

const cScale = (n) => (toFriendly, v) => (toFriendly ? v / n : v * n);
const cInvScale = (n) => (toFriendly, v) => (toFriendly ? v * n : v / n);
const cGyro = (toFriendly, v, ctx) =>
    toFriendly ? ctx.gyroRawToDegreesPerSecond(v) : v / ctx.gyroRawToDegreesPerSecond(1);
const cGyroGroup = (toFriendly, v, ctx, fieldName) => (fieldName === "debug[4]" ? v : cGyro(toFriendly, v, ctx));
const cFftFreq = (toFriendly, v, ctx, fieldName) => {
    const gyroField = semver.gte(ctx.apiVersion, API_VERSION_1_47) ? "debug[0]" : "debug[3]";
    return fieldName === gyroField ? cGyro(toFriendly, v, ctx) : v;
};
const cScale100 = cScale(100);
const cScale10 = cScale(10);
const cScale1000 = cScale(1000);
// Pre-1.48: debug[0]/debug[5] (quality/deltaTimeUs) pass through unscaled.
const cOpticalflow = (toFriendly, v, ctx, fieldName) => {
    if (!semver.gte(ctx.apiVersion, API_VERSION_1_48) && (fieldName === "debug[0]" || fieldName === "debug[5]")) {
        return v;
    }
    return cScale1000(toFriendly, v);
};

const DEBUG_CONVERT = {
    NONE: {
        "debug[2]": cScale100,
        "debug[3]": cScale100,
    },
    BATTERY: {
        "debug[0]": null, // explicit passthrough (overrides _default)
        "debug[1]": cScale10,
        "debug[6]": cScale10,
        _default: null,
    },
    ACCELEROMETER: {
        "debug[0]": (toFriendly, v, ctx) => (toFriendly ? ctx.accRawToGs(v) : v / ctx.accRawToGs(1)),
        "debug[1]": (toFriendly, v, ctx) => (toFriendly ? ctx.accRawToGs(v) : v / ctx.accRawToGs(1)),
        "debug[2]": cScale1000,
        "debug[3]": (toFriendly, v, ctx) => (toFriendly ? ctx.accRawToGs(v * 100) : v / ctx.accRawToGs(1) / 100),
        "debug[4]": cScale1000,
    },
    MIXER: (toFriendly, v, ctx) => (toFriendly ? ctx.rcCommandRawToThrottle(v) : ctx.throttleToRcCommandRaw(v)),
    ALTITUDE: {
        "debug[1]": cScale100,
        "debug[2]": cScale100,
        "debug[3]": cScale100,
    },
    FFT: {
        "debug[0]": cGyro,
        "debug[1]": cGyro,
        "debug[2]": cGyro,
    },
    FFT_FREQ: cFftFreq,
    ITERM_RELAX: {
        "debug[3]": cScale10,
    },
    RC_SMOOTHING: {
        "debug[4]": cScale(1000),
    },
    RC_SMOOTHING_RATE: {
        "debug[0]": cScale(1000),
    },
    DSHOT_RPM_TELEMETRY: (toFriendly, v, ctx) => (toFriendly ? (v * 200) / ctx.motorPoles : (v * ctx.motorPoles) / 200),
    RPM_FILTER: cInvScale(60),
    D_MAX: {
        "debug[2]": cScale10,
        "debug[3]": cScale10,
    },
    DYN_LPF: {
        "debug[0]": cGyro,
        "debug[3]": cGyro,
    },
    DYN_IDLE: {
        "debug[3]": cInvScale(6),
    },
    AC_CORRECTION: cScale10,
    AC_ERROR: cScale10,
    RX_TIMING: {
        "debug[0]": cScale100,
        "debug[3]": cScale100,
        "debug[1]": cScale10,
    },
    SCHEDULER_DETERMINISM: {
        "debug[0]": cScale10,
        "debug[2]": cScale10,
        "debug[3]": cScale10,
    },
    TIMING_ACCURACY: {
        "debug[2]": cScale10,
    },
    GPS_RESCUE_THROTTLE_PID: {
        "debug[2]": cScale100,
        "debug[3]": cScale100,
    },
    GPS_RESCUE_VELOCITY: {
        "debug[0]": cScale100,
        "debug[1]": cScale100,
        "debug[2]": cScale100,
        "debug[3]": cScale100,
        "debug[4]": cScale100,
        "debug[5]": cScale100,
        "debug[7]": cScale100,
    },
    GPS_RESCUE_HEADING: {
        "debug[0]": cScale100,
        "debug[1]": cScale10,
        "debug[2]": cScale10,
        "debug[3]": cScale10,
        "debug[6]": cScale100,
    },
    GPS_RESCUE_TRACKING: {
        "debug[0]": cScale100,
        "debug[1]": cScale100,
        "debug[2]": cScale100,
        "debug[3]": cScale100,
        "debug[4]": cScale10,
        "debug[5]": cScale10,
        "debug[7]": cScale100,
    },
    GPS_CONNECTION: {
        "debug[3]": cInvScale(100),
    },
    GPS_DOP: {
        "debug[0]": null, // passthrough
        _default: cScale100,
    },
    ANGLE_MODE: {
        "debug[0]": cScale10,
        "debug[1]": cScale10,
        "debug[2]": cScale10,
        "debug[3]": cScale10,
    },
    OPTICALFLOW: cOpticalflow,
    AUTOPILOT_POSITION: {
        "debug[2]": cScale10,
        "debug[3]": cScale10,
        "debug[4]": cScale10,
        "debug[5]": cScale10,
        "debug[6]": cScale10,
        "debug[7]": cScale10,
    },
    TPA: {
        "debug[1]": cScale10,
        "debug[2]": cScale10,
        "debug[4]": cScale10,
    },
    FEEDFORWARD: {
        "debug[3]": cScale10,
    },
    FEEDFORWARD_LIMIT: {
        "debug[6]": cScale(1000),
    },
};
for (const m of [
    "GYRO",
    "GYRO_FILTERED",
    "GYRO_SCALED",
    "DUAL_GYRO",
    "DUAL_GYRO_COMBINED",
    "DUAL_GYRO_DIFF",
    "DUAL_GYRO_RAW",
    "MULTI_GYRO_DIFF",
    "MULTI_GYRO_RAW",
    "MULTI_GYRO_SCALED",
    "NOTCH",
    "GYRO_SAMPLE",
]) {
    DEBUG_CONVERT[m] = cGyroGroup;
}
// NONE/AIRMODE/BARO share one block (firmware groups them).
DEBUG_CONVERT.AIRMODE = DEBUG_CONVERT.NONE;
DEBUG_CONVERT.BARO = DEBUG_CONVERT.NONE;

/**
 * Convert a debug field value between log/raw units and chart/friendly units
 * for the given debug mode. Inverse direction when `toFriendly` is false.
 *
 * @param {string} debugModeName - e.g. "BATTERY".
 * @param {string} fieldName - e.g. "debug[1]".
 * @param {boolean} toFriendly - true: raw → chart units; false: chart → raw.
 * @param {number} value
 * @param {DebugScaleContext} ctx - hardware scaling context.
 * @returns {number}
 */
export function convertDebugFieldValue(debugModeName, fieldName, toFriendly, value, ctx) {
    const entry = DEBUG_CONVERT[debugModeName];
    if (entry === undefined) {
        return value;
    }
    if (typeof entry === "function") {
        return entry(toFriendly, value, ctx, fieldName);
    }
    // `null` field entries are explicit passthroughs that override `_default`.
    const fn = fieldName in entry ? entry[fieldName] : entry._default;
    return fn ? fn(toFriendly, value, ctx) : value;
}
