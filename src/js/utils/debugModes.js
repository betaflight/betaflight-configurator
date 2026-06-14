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
            "debug[2]": "Motor Update",
            "debug[3]": "Motor Deviation",
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
            "debug[0]": "Accel. Raw [X]",
            "debug[1]": "Accel. Raw [Y]",
            "debug[2]": "Accel. Raw [Z]",
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
            "debug[3]": "Function Exec Time",
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
            "debug[1]": "Blackbox Bytes Sent",
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
            "debug[0]": "Packet Counter",
            "debug[1]": "Packet Number",
            "debug[2]": "Bytes Sent",
            "debug[3]": "Status",
        },
        SCHEDULER_DETERMINISM: {
            "debug[all]": "Scheduler Determinism",
            "debug[0]": "Cycle Time",
            "debug[1]": "ID of Late Task",
            "debug[2]": "Task Delay Time",
            "debug[3]": "Gyro Skew Min",
        },
        TIMING_ACCURACY: {
            "debug[all]": "Timing Accuracy",
            "debug[0]": "CPU Busy",
            "debug[1]": "Late Tasks per second",
            "debug[2]": "Total delay in last second",
            "debug[3]": "Total Tasks per second",
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
            "debug[1]": "D term",
            "debug[2]": "Target Velocity",
            "debug[3]": "Velocity",
        },
        GPS_RESCUE_HEADING: {
            "debug[all]": "GPS Rescue Heading",
            "debug[0]": "Ground Speed",
            "debug[1]": "GPS Heading Error * 10",
            "debug[2]": "Attitude",
            "debug[3]": "Roll Angle Adjustment * 100",
        },
        GPS_RESCUE_TRACKING: {
            "debug[all]": "GPS Rescue Tracking",
            "debug[0]": "Velocity P",
            "debug[1]": "Velocity D",
            "debug[2]": "Position Index * 100",
            "debug[3]": "Current Position Error",
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
            "debug[0]": "Calibrating Axis Flags",
            "debug[1]": "Gyro pre cal [roll]",
            "debug[2]": "Gyro post cal [roll]",
            "debug[3]": "Gyro calibrated [roll]",
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
            "debug[0]": "Frame Number - motor 0",
            "debug[1]": "Valid Count - motor 0",
            "debug[2]": "No Reply Count - motor 0",
            "debug[3]": "Invalid CRC Count - motor 0",
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
        };

        result.FLASH_TEST_PRBS = {
            "debug[all]": "Flash Test PRBS",
            "debug[0]": "State",
            "debug[1]": "Flash Length",
            "debug[6]": "FlashLength / Pagesize",
            "debug[7]": "Errors",
        };

        result.MAVLINK_TELEMETRY = {
            "debug[all]": "MAVLink Telemetry",
            "debug[0]": "Telemetry state",
            "debug[1]": "Last known TX buffer free space",
            "debug[2]": "Estimated TX buffer free space",
            "debug[3]": "Ticks",
        };
    }

    if (semver.gte(apiVersion, API_VERSION_1_48)) {
        result.AUTOPILOT_PID = {
            "debug[all]": "Autopilot PID",
            "debug[0]": "P term (East) * 100",
            "debug[1]": "P term (North) * 100",
            "debug[2]": "I term (East) * 100",
            "debug[3]": "I term (North) * 100",
            "debug[4]": "II term (East) * 100",
            "debug[5]": "II term (North) * 100",
            "debug[6]": "Roll angle command * 100",
            "debug[7]": "Pitch angle command * 100",
        };

        result.AUTOPILOT_STOP = {
            "debug[all]": "Autopilot Stop",
            "debug[0]": "Distance to target (cm)",
            "debug[1]": "Horizontal speed (cm/s)",
            "debug[2]": "Sticks active",
            "debug[3]": "Nav active",
            "debug[4]": "Position held",
            "debug[6]": "Roll angle command * 100",
            "debug[7]": "Pitch angle command * 100",
        };

        result.GYRO_SAMPLE = {
            "debug[all]": "Gyro Sample",
            "debug[0]": "Gyro before downsampling [dbg-axis]",
            "debug[1]": "Gyro after downsampling [dbg-axis]",
            "debug[2]": "Gyro after RPM [dbg-axis]",
            "debug[3]": "Gyro after all filtering [dbg-axis]",
            "debug[4]": "CPU Load at Sample",
        };

        // POSITION_NAV is a reserved firmware enum slot with no fields yet,
        // so it intentionally has no fieldNames entry.
        delete result.AUTOPILOT_POSITION;
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
    switch (debugModeName) {
        case "NONE":
        case "AIRMODE":
        case "BARO":
            switch (fieldName) {
                case "debug[1]":
                    return `${value.toFixed(0)} hPa`;
                case "debug[2]":
                    return `${(value / 100).toFixed(2)} °C`;
                case "debug[3]":
                    return `${(value / 100).toFixed(2)} m`;
                default:
                    return `${value.toFixed(0)}`;
            }
        case "VELOCITY":
        case "DFILTER":
            return "";
        case "CYCLETIME":
            switch (fieldName) {
                case "debug[1]":
                    return `${value.toFixed(0)} %`;
                default:
                    return `${value.toFixed(0)}μS`;
            }
        case "BATTERY":
            switch (fieldName) {
                case "debug[0]":
                    return value.toFixed(0);
                default:
                    return `${(value / 10).toFixed(1)} V`;
            }
        case "ACCELEROMETER":
            return `${ctx.accRawToGs(value).toFixed(2)} g`;
        case "MIXER":
            return `${Math.round(ctx.rcCommandRawToThrottle(value))} %`;
        case "PIDLOOP":
            return `${value.toFixed(0)} μS`;
        case "RC_INTERPOLATION":
            switch (fieldName) {
                case "debug[1]": // current RX refresh rate
                    return `${value.toFixed(0)} ms`;
                case "debug[3]": // setpoint [roll]
                    return `${value.toFixed(0)} °/s`;
                default:
                    return value.toFixed(0);
            }
        case "GYRO":
        case "GYRO_FILTERED":
        case "GYRO_SCALED":
        case "DUAL_GYRO":
        case "DUAL_GYRO_COMBINED":
        case "DUAL_GYRO_DIFF":
        case "DUAL_GYRO_RAW":
        case "MULTI_GYRO_DIFF":
        case "MULTI_GYRO_RAW":
        case "MULTI_GYRO_SCALED":
        case "NOTCH":
        case "GYRO_SAMPLE":
            if (fieldName === "debug[4]") {
                return `${value.toFixed(0)} %`; // Avg System Load %
            }
            return `${Math.round(ctx.gyroRawToDegreesPerSecond(value))} °/s`;
        case "ANGLERATE":
            return `${value.toFixed(0)} °/s`;
        case "ESC_SENSOR":
            switch (fieldName) {
                case "debug[3]":
                    return `${value.toFixed(0)} μS`;
                default:
                    return value.toFixed(0);
            }
        case "SCHEDULER":
            return `${value.toFixed(0)} μS`;
        case "STACK":
            return value.toFixed(0);
        case "ESC_SENSOR_RPM":
            return `${value.toFixed(0)} rpm`;
        case "ESC_SENSOR_TMP":
            return `${value.toFixed(0)} °C`;
        case "ALTITUDE":
            switch (fieldName) {
                case "debug[0]": // GPS Trust * 100
                    return value.toFixed(0);
                case "debug[1]": // GPS Altitude cm
                case "debug[2]": // OSD Altitude cm
                case "debug[3]": // Control Altitude
                    return `${(value / 100).toFixed(2)} m`;
                default:
                    return value.toFixed(0);
            }
        case "FFT":
            switch (fieldName) {
                case "debug[0]": // gyro pre dyn notch [for gyro debug axis]
                case "debug[1]": // gyro post dyn notch [for gyro debug axis]
                case "debug[2]": // gyro pre dyn notch, downsampled for FFT [for gyro debug axis]
                    return `${Math.round(ctx.gyroRawToDegreesPerSecond(value))} °/s`;
                // debug 3 = not used
                default:
                    return value.toFixed(0);
            }
        case "FFT_TIME":
            switch (fieldName) {
                case "debug[0]":
                    return ctx.fftCalcSteps?.[value] ?? value.toFixed(0);
                case "debug[1]":
                    return `${value.toFixed(0)} μs`;
                // debug 2 = not used
                // debug 3 = not used
                default:
                    return value.toFixed(0);
            }
        case "FFT_FREQ":
            if (semver.gte(ctx.apiVersion, API_VERSION_1_47)) {
                switch (fieldName) {
                    case "debug[0]": // gyro pre dyn notch [for gyro debug axis]
                        return `${Math.round(ctx.gyroRawToDegreesPerSecond(value))} °/s`;
                    default:
                        return `${value.toFixed(0)} Hz`;
                }
            } else {
                switch (fieldName) {
                    case "debug[3]": // gyro pre dyn notch [for gyro debug axis]
                        return `${Math.round(ctx.gyroRawToDegreesPerSecond(value))} °/s`;
                    default:
                        return `${value.toFixed(0)} Hz`;
                }
            }
        case "RTH":
            switch (fieldName) {
                // temporarily, perhaps
                //                        case 'debug[0]': // pitch angle +/-4000 means +/- 40 deg
                //                            return (value / 100).toFixed(1) + " °";
                default:
                    return value.toFixed(0);
            }
        case "ITERM_RELAX":
            switch (fieldName) {
                case "debug[0]": // roll setpoint high-pass filtered
                    return `${value.toFixed(0)} °/s`;
                case "debug[1]": // roll I-term relax factor
                    return `${value.toFixed(0)} %`;
                case "debug[3]": // roll absolute control axis error (pre-2026.6; unused/zero in firmware >= 2026.6)
                    return `${(value / 10).toFixed(1)} °`;
                default:
                    return value.toFixed(0);
            }
        case "RC_SMOOTHING":
            switch (fieldName) {
                case "debug[0]": // current Rx Rate Hz
                case "debug[1]": // smoothed but stepped Rx Rate Hz
                case "debug[2]": // setpoint cutoff Hz
                case "debug[3]": // throttle cutoff Hz
                case "debug[5]": // smoothed Rx Rate Hz, without steps
                    return `${value.toFixed(0)} Hz`;
                case "debug[4]": // Feedforward PT1k range 0-1000 show as 0.nnn
                    return `${(value / 1000).toFixed(3)}`;
                // debug 6 is outlier count 0-3
                // debug 7 is valid count 0-3
                default:
                    return value.toFixed(0);
            }
        case "RC_SMOOTHING_RATE":
            switch (fieldName) {
                case "debug[0]": // current Rx Interval [us]
                    return `${(value / 1000).toFixed(2)} ms`;
                case "debug[2]": // smoothed Rx Rate [Hz]
                    return `${value.toFixed(0)} Hz`;
                // case "debug[3]": // flag to update smoothing
                default:
                    return value.toFixed(0);
            }
        case "DSHOT_RPM_TELEMETRY":
            return `${((value * 200) / ctx.motorPoles).toFixed(0)} rpm / ${((value * 3.333) / ctx.motorPoles).toFixed(
                0,
            )} hz`;
        case "RPM_FILTER":
            return `${(value * 60).toFixed(0)}rpm / ${value.toFixed(0)} Hz`;
        case "D_MAX":
            switch (fieldName) {
                case "debug[0]": // roll gyro factor
                case "debug[1]": // roll setpoint Factor
                    return `${value.toFixed(0)} %`;
                case "debug[2]": // roll actual D
                case "debug[3]": // pitch actual D
                    return (value / 10).toFixed(1);
                default:
                    return value.toFixed(0);
            }
        case "DYN_LPF":
            switch (fieldName) {
                case "debug[0]": // gyro scaled [for selected axis]
                case "debug[3]": // pre-dyn notch gyro [for selected axis]
                    return `${Math.round(ctx.gyroRawToDegreesPerSecond(value))} °/s`;
                default:
                    return `${value.toFixed(0)} Hz`;
            }
        case "DYN_IDLE":
            switch (fieldName) {
                case "debug[3]": // minRPS
                    return `${value * 6} rpm / ${(value / 10).toFixed(0)} hz`;
                default:
                    return value.toFixed(0);
            }
        case "AC_CORRECTION":
            return `${(value / 10).toFixed(1)} °/s`;
        case "AC_ERROR":
            return `${(value / 10).toFixed(1)} °`;
        case "RX_TIMING":
            switch (fieldName) {
                case "debug[0]": // Packet interval us/10
                case "debug[3]": // Constrained packet interval us/10
                    return `${(value / 100).toFixed(2)} ms`;
                case "debug[1]": // Packet time stamp us/100, divide by 10 to ms
                    return `${(value / 10).toFixed(1)} ms`;
                case "debug[4]": // Rx Rate Hz
                case "debug[5]": // Smoothed Rx RateHz
                    return `${value.toFixed(0)} Hz`;
                case "debug[6]": // LQ Percent
                case "debug[2]": // isRateValid boolean
                case "debug[7]": // Is Receiving Signal boolean
                default:
                    return value.toFixed(0);
            }
        case "GHST":
            switch (fieldName) {
                // debug 0 is CRC error count 0 to int16_t
                // debug 1 is unknown frame count 0 to int16_t
                // debug 2 is RSSI 0 to -128 -> 0 to 128
                case "debug[3]": // LQ 0-100
                    return `${value.toFixed(0)} %`;
                default:
                    return value.toFixed(0);
            }
        case "GHST_MSP":
            switch (fieldName) {
                // debug 0 is msp frame count
                // debug 1 is msp frame count
                // debug 2 and 3 not used
                default:
                    return value.toFixed(0);
            }
        case "SCHEDULER_DETERMINISM":
            switch (fieldName) {
                case "debug[0]": // cycle time in us*10
                case "debug[2]": // task delay time in us*10
                case "debug[3]": // task delay time in us*10
                    return `${(value / 10).toFixed(1)} us`;
                // debug 1 is task ID of late task
                default:
                    return value.toFixed(0);
            }
        case "TIMING_ACCURACY":
            switch (fieldName) {
                case "debug[0]": // CPU Busy %
                    return `${value.toFixed(1)} %`;
                case "debug[2]": // task delay time in us*10
                    return `${(value / 10).toFixed(1)} us`;
                default:
                    return value.toFixed(0);
            }
        case "RX_EXPRESSLRS_SPI":
            switch (fieldName) {
                case "debug[3]": // uplink LQ %
                    return `${value.toFixed(1)} %`;
                // debug 0 = Lost connection count
                // debug 1 = RSSI
                // debug 2 = SNR
                default:
                    return value.toFixed(0);
            }
        case "RX_EXPRESSLRS_PHASELOCK":
            switch (fieldName) {
                case "debug[2]": // Frequency offset in ticks
                    return `${value.toFixed(0)} ticks`;
                // debug 0 = Phase offset us
                // debug 1 = Filtered phase offset us
                // debug 3 = Pphase shift in us
                default:
                    return `${value.toFixed(0)} us`;
            }
        case "GPS_RESCUE_THROTTLE_PID":
            switch (fieldName) {
                case "debug[0]": // Throttle P added uS
                case "debug[1]": // Throttle D added uS
                case "debug[4]": // Throttle I added uS
                case "debug[6]": // Throttle D before lp smoothing uS
                    return `${value.toFixed(0)} uS`;
                case "debug[2]": // current altitude in m
                case "debug[3]": // TARGET altitude in m
                    return `${(value / 100).toFixed(1)} m`;
                default:
                    return value.toFixed(0);
            }
        case "GPS_RESCUE_VELOCITY":
            switch (fieldName) {
                case "debug[0]": // Pitch P degrees * 100
                case "debug[1]": // Pitch D degrees * 100
                    return `${(value / 100).toFixed(1)} °`;
                case "debug[2]": // velocity to home cm/s
                case "debug[3]": // velocity target cm/s
                    return `${(value / 100).toFixed(1)} m/s`;
                default:
                    return value.toFixed(0);
            }
        case "GPS_RESCUE_HEADING":
            switch (fieldName) {
                case "debug[0]": // Ground speed cm/s
                    return `${(value / 100).toFixed(2)} m/s`;
                case "debug[1]": // GPS Ground course degrees * 10
                case "debug[2]": // Attitude in degrees * 10
                case "debug[3]": // Angle to home in degrees * 10
                case "debug[4]": // magYaw in degrees * 10
                    return `${(value / 10).toFixed(1)} °`;
                case "debug[6]": // Roll Added deg * 100
                    return `${(value / 100).toFixed(1)} °`;
                case "debug[5]": // Roll Mix Att
                case "debug[7]": // Rescue Yaw Rate
                default:
                    return value.toFixed(0);
            }
        case "GPS_RESCUE_TRACKING":
            switch (fieldName) {
                case "debug[0]": // velocity to home cm/s
                case "debug[1]": // velocity target cm/s
                    return `${(value / 100).toFixed(1)} m/s`;
                case "debug[2]": // altitude cm
                case "debug[3]": // altitude target cm
                    return `${(value / 100).toFixed(1)} m`;
                default:
                    return value.toFixed(0);
            }
        case "GPS__CONNECTION":
            switch (fieldName) {
                case "debug[0]": // Flight model
                case "debug[1]": // GPS Nav packet interval
                case "debug[2]": // FC Nav data time
                    return value.toFixed(0);
                case "debug[3]": // Baud Rate / Nav interval
                    return (value * 100).toFixed(0);
                case "debug[4]": // main state * 100 + subState
                case "debug[5]": // executeTimeUs
                case "debug[6]": // ack state
                case "debug[7]": // serial Rx buffer
                default:
                    return value.toFixed(0);
            }
        case "ATTITUDE":
            switch (fieldName) {
                case "debug[0]": // Roll Angle
                case "debug[1]": // Pitch Angle
                case "debug[2]": // Ground speed factor
                case "debug[3]": // Heading error
                case "debug[4]": // Velocity to home
                case "debug[5]": // Ground speed error ratio
                case "debug[6]": // Pitch forward angle
                case "debug[7]": // dcmKp gain
                default:
                    return value.toFixed(0);
            }
        case "VTX_MSP":
            switch (fieldName) {
                case "debug[0]": // packetCounter
                case "debug[1]": // isCrsfPortConfig
                case "debug[2]": // isLowPowerDisarmed
                case "debug[3]": // mspTelemetryDescriptor
                default:
                    return value.toFixed(0);
            }
        case "GPS_DOP":
            switch (fieldName) {
                case "debug[0]": // Number of Satellites
                    return value.toFixed(0);
                case "debug[1]": // pDOP (positional - 3D)
                case "debug[2]": // hDOP (horizontal - 2D)
                case "debug[3]": // vDOP (vertical - 1D)
                default:
                    return (value / 100).toFixed(2);
            }
        case "FAILSAFE":
            return value.toFixed(0);
        case "GYRO_CALIBRATION":
            return value.toFixed(0);
        case "ANGLE_MODE":
            switch (fieldName) {
                case "debug[0]": // target angle
                case "debug[1]": // angle error
                case "debug[2]": // angle feedforward
                case "debug[3]": // angle achieved
                    return `${(value / 10).toFixed(1)} °`;
                default:
                    return value.toFixed(0);
            }
        case "ANGLE_TARGET":
            return value.toFixed(0);
        case "CURRENT_ANGLE":
            return value.toFixed(0);
        case "DSHOT_TELEMETRY_COUNTS":
            return value.toFixed(0);
        case "EZLANDING":
            return `${(value / 100).toFixed(2)} %`;
        case "OPTICALFLOW":
            switch (fieldName) {
                case "debug[1]":
                case "debug[2]":
                case "debug[3]":
                case "debug[4]":
                    return `${(value / 1000).toFixed(1)}`;
                default:
                    return value.toFixed(1);
            }
        case "AUTOPILOT_POSITION":
            switch (fieldName) {
                case "debug[2]":
                case "debug[3]":
                case "debug[4]":
                case "debug[5]":
                case "debug[6]":
                case "debug[7]":
                    return `${(value / 10).toFixed(1)}`;
                default:
                    return value.toFixed(1);
            }
        case "TPA":
            switch (fieldName) {
                case "debug[1]":
                case "debug[2]":
                    return `${(value / 10).toFixed(1)} °`;
                case "debug[4]":
                    return `${(value / 10).toFixed(1)} m/s`;
                default:
                    return value.toFixed(1);
            }
        case "FEEDFORWARD":
            switch (fieldName) {
                case "debug[0]": // setpoint
                    return `${value.toFixed(0)} °/s`;
                case "debug[1]": // setpoint speed
                    return `${value.toFixed(0)} °/s/s`;
                // case "debug[2]": feedforward boost
                case "debug[3]": // rcCommand Delta integer * 10
                    return `${(value / 10).toFixed(1)}`;
                case "debug[4]": // jitter attenuator percent
                    return `${value.toFixed(0)} %`;
                // case "debug[5]": boolean packet duplicate
                // case "debug[6]": yaw feedforward
                // case "debug[7]": yaw feedforward hold element
                default:
                    return value.toFixed(0);
            }
        case "FEEDFORWARD_LIMIT":
            switch (fieldName) {
                case "debug[0]": // jitter attenuator percent
                    return `${value.toFixed(0)} %`;
                // case "debug[1]": max setpoint rate for the axis
                // case "debug[2]": setpoint
                // case "debug[3]": feedforward
                // case "debug[4]": setpoint speed un-smoothed
                // case "debug[5]": setpoint speed smoothed
                case "debug[6]": // feedforward smoothing PT1K * 1000
                    return `${(value / 1000).toFixed(3)}`;
                case "debug[7]": // smoothed RxRateHz
                    return `${value.toFixed(0)} Hz`;
                default:
                    return value.toFixed(0);
            }
    }
    return value.toFixed(0);
}

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
    switch (debugModeName) {
        case "NONE":
        case "AIRMODE":
        case "BARO":
            switch (fieldName) {
                case "debug[1]":
                    return value; // hPa
                case "debug[2]":
                    return toFriendly ? value / 100 : value * 100; // °C`
                case "debug[3]":
                    return toFriendly ? value / 100 : value * 100; //m`
                default:
                    return value;
            }
        case "VELOCITY":
        case "DFILTER":
            return value;
        case "CYCLETIME":
            return value;
        case "BATTERY":
            switch (fieldName) {
                case "debug[0]":
                    return value;
                default:
                    return toFriendly ? value / 10 : value * 10; // " V";
            }
        case "ACCELEROMETER":
            return toFriendly ? ctx.accRawToGs(value) : value / ctx.accRawToGs(1);
        case "MIXER":
            return toFriendly ? ctx.rcCommandRawToThrottle(value) : ctx.throttleToRcCommandRaw(value);
        case "PIDLOOP":
            return value;
        case "RC_INTERPOLATION":
            return value;
        case "GYRO":
        case "GYRO_FILTERED":
        case "GYRO_SCALED":
        case "DUAL_GYRO":
        case "DUAL_GYRO_COMBINED":
        case "DUAL_GYRO_DIFF":
        case "DUAL_GYRO_RAW":
        case "MULTI_GYRO_DIFF":
        case "MULTI_GYRO_RAW":
        case "MULTI_GYRO_SCALED":
        case "NOTCH":
        case "GYRO_SAMPLE":
            if (fieldName === "debug[4]") {
                return value; // Avg System Load %
            }
            return toFriendly ? ctx.gyroRawToDegreesPerSecond(value) : value / ctx.gyroRawToDegreesPerSecond(1); // °/s;
        case "ANGLERATE":
            return value; // °/s;
        case "ESC_SENSOR":
            return value;
        case "SCHEDULER":
            return value;
        case "STACK":
            return value;
        case "ESC_SENSOR_RPM":
            return value; // " rpm";
        case "ESC_SENSOR_TMP":
            return value; // " °C";
        case "ALTITUDE":
            switch (fieldName) {
                case "debug[0]": // GPS Trust * 100
                    return value;
                case "debug[1]": // GPS Altitude cm
                case "debug[2]": // OSD Altitude cm
                case "debug[3]": // Control Altitude
                    return toFriendly ? value / 100 : value * 100; //  m
                default:
                    return value;
            }
        case "FFT":
            switch (fieldName) {
                case "debug[0]": // gyro pre dyn notch [for gyro debug axis]
                case "debug[1]": // gyro post dyn notch [for gyro debug axis]
                case "debug[2]": // gyro pre dyn notch, downsampled for FFT [for gyro debug axis]
                    return toFriendly ? ctx.gyroRawToDegreesPerSecond(value) : value / ctx.gyroRawToDegreesPerSecond(1); // °/s;
                // debug 3 = not used
                default:
                    return value;
            }
        case "FFT_TIME":
            return value;
        case "FFT_FREQ":
            if (semver.gte(ctx.apiVersion, API_VERSION_1_47)) {
                switch (fieldName) {
                    case "debug[0]": // gyro pre dyn notch [for gyro debug axis]
                        return toFriendly
                            ? ctx.gyroRawToDegreesPerSecond(value)
                            : value / ctx.gyroRawToDegreesPerSecond(1); // °/s;
                    default:
                        return value;
                }
            } else {
                switch (fieldName) {
                    case "debug[3]": // gyro pre dyn notch [for gyro debug axis]
                        return toFriendly
                            ? ctx.gyroRawToDegreesPerSecond(value)
                            : value / ctx.gyroRawToDegreesPerSecond(1); // °/s;
                    default:
                        return value;
                }
            }
        case "RTH":
            switch (fieldName) {
                // temporarily, perhaps
                //                        case 'debug[0]': // pitch angle +/-4000 means +/- 40 deg
                //                            return (value / 100).toFixed(1) + " °";
                default:
                    return value;
            }
        case "ITERM_RELAX":
            switch (fieldName) {
                case "debug[0]": // roll setpoint high-pass filtered
                    return value; // °/s
                case "debug[1]": // roll I-term relax factor
                    return value; // %
                case "debug[3]": // roll absolute control axis error (pre-2026.6; unused/zero in firmware >= 2026.6)
                    return toFriendly ? value / 10 : value * 10; // °
                default:
                    return value;
            }
        case "RC_SMOOTHING":
            switch (fieldName) {
                // case "debug[0]": // current Rx Rate Hz
                // case "debug[1]": // smoothed but stepped Rx Rate Hz
                // case "debug[2]": // setpoint cutoff Hz
                // case "debug[3]": // throttle cutoff Hz
                // case "debug[5]": // smoothed Rx Rate Hz, without steps
                case "debug[4]": // Feedforward PT1K range 0-1000 show as 0.mmm
                    return toFriendly ? value / 1000 : value * 1000;
                // debug 6 is outlier count 0-3
                // debug 7 is valid count 0-3
                default:
                    return value;
            }
        case "RC_SMOOTHING_RATE":
            switch (fieldName) {
                case "debug[0]": // current frame rate [us]
                    return toFriendly ? value / 1000 : value * 1000; // ms
                case "debug[2]": // smoothed RxRate [Hz]
                case "debug[3]": // boolean indicating need to update smoothing
                default:
                    return value;
            }
        case "DSHOT_RPM_TELEMETRY": {
            const pole = ctx.motorPoles;
            return toFriendly ? (value * 200) / pole : (value * pole) / 200;
        }
        case "RPM_FILTER":
            return toFriendly ? value * 60 : value / 60;
        case "D_MAX":
            switch (fieldName) {
                case "debug[0]": // roll gyro factor
                case "debug[1]": // roll setpoint Factor
                    return value;
                case "debug[2]": // roll actual D
                case "debug[3]": // pitch actual D
                    return toFriendly ? value / 10 : value * 10;
                default:
                    return value;
            }
        case "DYN_LPF":
            switch (fieldName) {
                case "debug[0]": // gyro scaled [for selected axis]
                case "debug[3]": // pre-dyn notch gyro [for selected axis]
                    return toFriendly ? ctx.gyroRawToDegreesPerSecond(value) : value / ctx.gyroRawToDegreesPerSecond(1); // °/s
                default:
                    return value;
            }
        case "DYN_IDLE":
            switch (fieldName) {
                case "debug[3]": // minRPS
                    return toFriendly ? value * 6 : value / 6;
                default:
                    return value;
            }
        case "AC_CORRECTION":
            return toFriendly ? value / 10 : value * 10; // °/s
        case "AC_ERROR":
            return toFriendly ? value / 10 : value * 10; // °
        case "RX_TIMING":
            switch (fieldName) {
                case "debug[0]": // packet interval in hundredths of ms
                case "debug[3]": // constrained packet interval in hundredths of ms
                    return toFriendly ? value / 100 : value * 100; //ms
                case "debug[1]": // Frame time stamp us/100
                    return toFriendly ? value / 10 : value * 10; //ms
                // debug 2 is isRateValid boolean
                // debug 4 is current Rx Rate, Hz
                // debug 5 is smoothed Rx Rate, Hz
                // debug 6 is link quality
                // debug 7 is isReceivingSignal boolean
                default:
                    return value;
            }
        case "GHST":
            return value;
        case "GHST_MSP":
            switch (fieldName) {
                // debug 0 is msp frame count
                // debug 1 is msp frame count
                // debug 2 and 3 not used
                default:
                    return value;
            }
        case "SCHEDULER_DETERMINISM":
            switch (fieldName) {
                case "debug[0]": // cycle time in us*10
                case "debug[2]": // task delay time in us*10
                case "debug[3]": // task delay time in us*10
                    return toFriendly ? value / 10 : value * 10; // us
                // debug 1 is task ID of late task
                default:
                    return value;
            }
        case "TIMING_ACCURACY":
            switch (fieldName) {
                case "debug[0]": // CPU Busy %
                    return value; // %
                case "debug[2]": // task delay time in us*10
                    return toFriendly ? value / 10 : value * 10; // us
                default:
                    return value;
            }
        case "RX_EXPRESSLRS_SPI":
            return value;
        case "RX_EXPRESSLRS_PHASELOCK":
            return value;
        case "GPS_RESCUE_THROTTLE_PID":
            switch (fieldName) {
                case "debug[0]": // Throttle P added uS
                case "debug[1]": // Throttle D added * uS
                case "debug[4]": // Throttle I added uS
                case "debug[6]": // Throttle D before lp smoothing uS
                    return value; // ' uS';
                case "debug[2]": // current altitude in m
                case "debug[3]": // TARGET altitude in m
                    return toFriendly ? value / 100 : value * 100; //  m
                default:
                    return value;
            }
        case "GPS_RESCUE_VELOCITY":
            switch (fieldName) {
                case "debug[0]": // Pitch P degrees * 100
                case "debug[1]": // Pitch D degrees * 100
                    return toFriendly ? value / 100 : value * 100; // °
                case "debug[2]": // velocity to home cm/s
                case "debug[3]": // velocity target cm/s
                    return toFriendly ? value / 100 : value * 100; // m/s
                default:
                    return value;
            }
        case "GPS_RESCUE_HEADING":
            switch (fieldName) {
                case "debug[0]": // Ground speed cm/s
                    return toFriendly ? value / 100 : value * 100; // m/s
                case "debug[1]": // GPS Ground course degrees * 10
                case "debug[2]": // Attitude in degrees * 10
                case "debug[3]": // Angle to home in degrees * 10
                case "debug[4]": // magYaw in degrees * 10
                    return toFriendly ? value / 10 : value * 10; //°
                case "debug[6]": // Roll Added deg * 100
                    return toFriendly ? value / 100 : value * 100; // °
                case "debug[5]": // Roll Mix Att
                case "debug[7]": // Rescue Yaw Rate
                default:
                    return value;
            }
        case "GPS_RESCUE_TRACKING":
            switch (fieldName) {
                case "debug[0]": // velocity to home cm/s
                case "debug[1]": // velocity target cm/s
                    return toFriendly ? value / 100 : value * 100; // m/s
                case "debug[2]": // altitude cm
                case "debug[3]": // altitude target cm
                    return toFriendly ? value / 100 : value * 100;
                default:
                    return value;
            }
        case "GPS__CONNECTION":
            switch (fieldName) {
                case "debug[0]": // Flight model
                case "debug[1]": // GPS Nav packet interval
                case "debug[2]": // FC Nav data time
                    return value;
                case "debug[3]": // Baud Rate / Nav interval
                    return toFriendly ? value * 100 : value / 100;
                case "debug[4]": // main state * 100 + subState
                case "debug[5]": // executeTimeUs
                case "debug[6]": // ack state
                case "debug[7]": // serial Rx buffer
                default:
                    return value;
            }
        case "ATTITUDE":
            switch (fieldName) {
                case "debug[0]": // Roll Angle
                case "debug[1]": // Pitch Angle
                case "debug[2]": // Ground speed factor
                case "debug[3]": // Heading error
                case "debug[4]": // Velocity to home
                case "debug[5]": // Ground speed error ratio
                case "debug[6]": // Pitch forward angle
                case "debug[7]": // dcmKp gain
                default:
                    return value;
            }
        case "VTX_MSP":
            switch (fieldName) {
                case "debug[0]": // packetCounter
                case "debug[1]": // isCrsfPortConfig
                case "debug[2]": // isLowPowerDisarmed
                case "debug[3]": // mspTelemetryDescriptor
                default:
                    return value;
            }
        case "GPS_DOP":
            switch (fieldName) {
                case "debug[0]": // Number of Satellites
                    return value;
                case "debug[1]": // pDOP (positional - 3D)
                case "debug[2]": // hDOP (horizontal - 2D)
                case "debug[3]": // vDOP (vertical - 1D)
                default:
                    return toFriendly ? value / 100 : value * 100;
            }
        case "FAILSAFE":
            return value;
        case "GYRO_CALIBRATION":
            return value;
        case "ANGLE_MODE":
            switch (fieldName) {
                case "debug[0]": // target angle
                case "debug[1]": // angle error
                case "debug[2]": // angle feedforward
                case "debug[3]": // angle achieved
                    return toFriendly ? value / 10 : value * 10; // °
                default:
                    return value;
            }
        case "ANGLE_TARGET":
            return value;
        case "CURRENT_ANGLE":
            return value;
        case "DSHOT_TELEMETRY_COUNTS":
            return value;
        case "OPTICALFLOW":
            switch (fieldName) {
                case "debug[1]":
                case "debug[2]":
                case "debug[3]":
                case "debug[4]":
                    return toFriendly ? value / 1000 : value * 1000;
                default:
                    return value;
            }
        case "AUTOPILOT_POSITION":
            switch (fieldName) {
                case "debug[2]":
                case "debug[3]":
                case "debug[4]":
                case "debug[5]":
                case "debug[6]":
                case "debug[7]":
                    return toFriendly ? value / 10 : value * 10;
                default:
                    return value;
            }
        case "TPA":
            switch (fieldName) {
                case "debug[1]":
                case "debug[2]":
                case "debug[4]":
                    return toFriendly ? value / 10 : value * 10;
                default:
                    return value;
            }
        case "FEEDFORWARD":
            switch (fieldName) {
                // case "debug[0]": // setpoint
                // case "debug[1]": // setpoint speed
                // case "debug[2]": //feedforward boost
                case "debug[3]": // rcCommand Delta integer * 10
                    return toFriendly ? value / 10 : value * 10;
                // case "debug[4]": // jitter attenuator percent
                // case "debug[5]": // boolean indicating packet duplicate
                // case "debug[6]": // yaw feedforward
                // case "debug[7]": // yaw feedforward hold element
                default:
                    return value;
            }
        case "FEEDFORWARD_LIMIT":
            switch (fieldName) {
                // case "debug[0]": // jitter attenuator percent
                // case "debug[1]": // max setpoint rate for the axis
                // case "debug[2]": // setpoint
                // case "debug[3]": // feedforward
                // case "debug[4]": // setpoint speed un-smoothed
                // case "debug[5]": // setpoint speed smoothed
                case "debug[6]": //feedforward smoothing PT1K * 1000 show as 0.nnn
                    return toFriendly ? value / 1000 : value * 1000;
                // case "debug[7]": // smoothed RxRateHz
                default:
                    return value;
            }
    }
    return value;
}
