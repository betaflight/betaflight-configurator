import { defineStore } from "pinia";
import { computed } from "vue";
import { useFlightControllerStore } from "./fc";
import semver from "semver";
import { API_VERSION_1_46, API_VERSION_1_47 } from "../js/data_storage";
import { removeArrayElement, addArrayElement, replaceArrayElement, addArrayElementAfter } from "../js/utils/array";

export const useDebugStore = defineStore("debug", () => {
    const fcStore = useFlightControllerStore();

    const modes = computed(() => {
        const baseModes = [
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
        ];

        const apiVersion = fcStore.config?.apiVersion;
        if (!apiVersion) {
            return baseModes;
        }

        // Make a copy to modify
        const result = [...baseModes];

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

        return result;
    });

    const fieldNames = computed(() => {
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

        const apiVersion = fcStore.config?.apiVersion;
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
                "debug[2]": "Zero Altitude cm",
                "debug[3]": "Altitude cm",
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

        return result;
    });

    const enableFields = computed(() => {
        const baseFields = [
            "PID",
            "RC Commands",
            "Setpoint",
            "Battery",
            "Magnetometer",
            "Altitude",
            "RSSI",
            "Gyro",
            "Accelerometer",
            "Debug Log",
            "Motor",
            "GPS",
            "RPM",
            "Gyro (Unfiltered)",
        ];

        const apiVersion = fcStore.config?.apiVersion;
        if (!apiVersion) {
            return baseFields;
        }

        const result = [...baseFields];

        if (semver.gte(apiVersion, API_VERSION_1_47)) {
            addArrayElementAfter(result, "Gyro", "Attitude");
            addArrayElement(result, "Servo");
        }

        return result;
    });

    return {
        modes,
        fieldNames,
        enableFields,
    };
});
