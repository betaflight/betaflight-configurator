import semver from "semver";

import { API_VERSION_1_49 } from "../js/data_storage";

import { FlightLogFieldPresenter } from "./flightlog_fields_presenter";
import { RATES_TYPE } from "./flightlog_fielddefs";
import { escapeRegExp } from "./tools";
import { getDebugFieldAxis, getDebugModes } from "../js/utils/debugModes";

export function GraphConfig(graphConfig) {
    const listeners = [];
    const that = this;
    let graphs = graphConfig ?? [];

    function notifyListeners() {
        for (const listener of listeners) {
            listener(that);
        }
    }

    this.selectedFieldName = null;
    this.selectedGraphIndex = 0;
    this.selectedFieldIndex = 0;

    this.highlightGraphIndex = null;
    this.highlightFieldIndex = null;

    const hiddenGraphFields = new Set();

    this.getGraphs = function () {
        return graphs;
    };

    let redrawChart = true;
    this.setRedrawChart = function (isRedraw) {
        redrawChart = isRedraw;
    };

    /**
     * newGraphs is an array of objects like {label: "graph label", height:, fields:[{name: curve:{power:, MinMax:, steps:}, color:, }, ...]}
     */
    this.setGraphs = function (newGraphs) {
        graphs = newGraphs;

        hiddenGraphFields.clear();
        if (redrawChart) {
            notifyListeners();
        }
    };

    this.extendFields = function (flightLog, field) {
        const matches = field.name.match(/^(.+)\[all\]$/);
        const logFieldNames = flightLog.getMainFieldNames();
        const fields = [];
        const setupColor = field?.color === -1;
        const sysConfig = flightLog.getSysConfig();
        const apiVersion = sysConfig.apiVersion;
        if (matches) {
            const nameRoot = matches[1],
                nameRegex = new RegExp(String.raw`^${escapeRegExp(nameRoot)}\[[0-9]+\]$`);
            let colorIndex = 0;
            for (const fieldName of logFieldNames) {
                if (fieldName.match(nameRegex)) {
                    // forceNewCurve must be true for min max computing extended curves.
                    const forceNewCurve = true;
                    const color = GraphConfig.PALETTE[colorIndex++ % GraphConfig.PALETTE.length].color;
                    field.color = setupColor ? color : undefined;
                    fields.push(
                        adaptField(
                            flightLog,
                            {
                                ...field,
                                curve: { ...field.curve },
                                name: fieldName,
                                friendlyName: FlightLogFieldPresenter.fieldNameToFriendly(
                                    fieldName,
                                    sysConfig.debug_mode,
                                    apiVersion,
                                ),
                            },
                            forceNewCurve,
                        ),
                    );
                }
            }
        } else {
            // Don't add fields if they don't exist in this log
            if (flightLog.getMainFieldIndexByName(field.name) !== undefined) {
                fields.push(
                    adaptField(flightLog, {
                        ...field,
                        curve: { ...field.curve },
                        friendlyName: FlightLogFieldPresenter.fieldNameToFriendly(
                            field.name,
                            sysConfig.debug_mode,
                            apiVersion,
                        ),
                    }),
                );
            }
        }
        return fields;
    };

    const adaptField = function (flightLog, field, forceNewCurve) {
        const defaultCurve = GraphConfig.getDefaultCurveForField(flightLog, field.name);
        if (field.curve === undefined || forceNewCurve) {
            field.curve = defaultCurve;
        } else if (field.curve.MinMax === undefined) {
            field.curve.MinMax = defaultCurve.MinMax;
        }

        if (field.smoothing === undefined) {
            field.smoothing = GraphConfig.getDefaultSmoothingForField(flightLog, field.name);
        }

        return field;
    };

    /**
     * Convert the given graph configs to make them appropriate for the given flight log.
     */
    this.adaptGraphs = function (flightLog, graphs) {
        const // Make copies of graphs into here so we can modify them without wrecking caller's copy
            newGraphs = [];

        for (const graph of graphs) {
            const newGraph = {
                // Default values for missing properties:
                height: 1,
                // The old graph
                ...graph,
                // New fields to replace the old ones:
                fields: [],
            };

            for (const field of graph.fields) {
                const fields = this.extendFields(flightLog, field);
                newGraph.fields = newGraph.fields.concat(fields);
            }

            newGraphs.push(newGraph);
        }

        this.setGraphs(newGraphs);
    };

    this.addListener = function (listener) {
        listeners.push(listener);
    };

    this.toggleGraphField = (graphIndex, fieldIndex) => {
        const item = `${graphIndex}:${fieldIndex}`;
        if (hiddenGraphFields.has(item)) {
            hiddenGraphFields.delete(item);
        } else {
            hiddenGraphFields.add(item);
        }
    };

    this.isGraphFieldHidden = (graphIndex, fieldIndex) => {
        return hiddenGraphFields.has(`${graphIndex}:${fieldIndex}`);
    };
}

GraphConfig.PALETTE = [
    { color: "#fb8072", name: "Red" },
    { color: "#8dd3c7", name: "Cyan" },
    { color: "#ffffb3", name: "Yellow" },
    { color: "#bebada", name: "Purple" },
    { color: "#80b1d3", name: "Blue" },
    { color: "#fdb462", name: "Orange" },
    { color: "#b3de69", name: "Green" },
    { color: "#fccde5", name: "Pink" },
    { color: "#d9d9d9", name: "Grey" },
    { color: "#bc80bd", name: "Dark Purple" },
    { color: "#ccebc5", name: "Light Green" },
    { color: "#ffed6f", name: "Dark Yellow" },
];

GraphConfig.load = function (config) {
    // Upgrade legacy configs to suit the newer standard by translating field names
    if (config) {
        for (const graph of config) {
            for (const field of graph.fields) {
                const matches = field.name.match(/^gyroData(.+)$/);
                if (matches) {
                    field.name = `gyroADC${matches[1]}`;
                }
            }
        }
    } else {
        config = false;
    }

    return config;
};

GraphConfig.getDefaultSmoothingForField = function (flightLog, fieldName) {
    try {
        if (fieldName.match(/^motor(Raw)?\[/)) {
            return 5000;
        } else if (fieldName.match(/^servo\[/)) {
            return 5000;
        } else if (fieldName.match(/^gyroADC.*\[/)) {
            return 3000;
        } else if (fieldName.match(/^gyroUnfilt.*\[/)) {
            return 3000;
        } else if (fieldName.match(/^accSmooth\[/)) {
            return 3000;
        } else if (fieldName.match(/^axis.+\[/)) {
            return 3000;
        } else {
            return 0;
        }
    } catch {
        return 0;
    }
};

const minMaxPower1 = function (min, max) {
    return {
        power: 1,
        MinMax: {
            min,
            max,
        },
    };
};

const isApi149OrLater = function (apiVersion) {
    return Boolean(apiVersion) && semver.gte(apiVersion, API_VERSION_1_49);
};

const gatedByApi149 = function (fromApi149, beforeApi149 = {}) {
    return { fromApi149, beforeApi149 };
};

const GYRO_SCALED_CURVE = { default: (curves) => curves.gyro() };

// Firmware before 1.47 called this slot D_MIN, so a log reports one name or the other.
const D_MAX_CURVE = {
    0: (curves) => curves.combined("debug[0]", "debug[1]"), // roll gyro factor
    1: (curves) => curves.combined("debug[0]", "debug[1]"), // roll setpoint factor
    2: (curves) => curves.combined("debug[2]", "debug[3]"), // roll actual D
    3: (curves) => curves.combined("debug[2]", "debug[3]"), // pitch actual D
};

const RPM_CURVE = { default: (curves) => curves.combined("debug[0]", "debug[1]", "debug[2]", "debug[3]") };

const FEEDFORWARD_LIMIT_CURVE = {
    0: [-100, 100], // jitter attenuator
    1: (curves) => curves.gyro(), // max setpoint rate for axis
    2: (curves) => curves.gyro(), // setpoint
    3: [-200, 200], // feedforward
    4: [-200, 200], // setpoint speed unsmoothed
    5: [-200, 200], // setpoint speed smoothed
    6: [0, 1], // pt1K 0-1
    7: [0, 1200], // smoothed Rx rate Hz
};

/**
 * Default curve per debug mode, keyed by the debug field index.
 *
 * An entry is either a fixed `[min, max]` range or a function picking a curve derived from the log
 * itself. `default` covers the indices with no entry of their own; without one they auto-scale to
 * the field's own observed range.
 */
const DEBUG_MODE_CURVES = {
    CYCLETIME: { 1: [0, 100], default: [0, 2000] }, // debug[1] is CPU load
    PIDLOOP: { default: [0, 500] },
    GYRO: GYRO_SCALED_CURVE,
    GYRO_FILTERED: GYRO_SCALED_CURVE,
    GYRO_SCALED: GYRO_SCALED_CURVE,
    GYRO_RAW: GYRO_SCALED_CURVE,
    DUAL_GYRO: GYRO_SCALED_CURVE,
    DUAL_GYRO_COMBINED: GYRO_SCALED_CURVE,
    DUAL_GYRO_DIFF: GYRO_SCALED_CURVE,
    DUAL_GYRO_RAW: GYRO_SCALED_CURVE,
    DUAL_GYRO_SCALED: GYRO_SCALED_CURVE,
    // From API 1.47 the dual gyro modes are reported as MULTI_GYRO_*.
    MULTI_GYRO_DIFF: GYRO_SCALED_CURVE,
    MULTI_GYRO_RAW: GYRO_SCALED_CURVE,
    MULTI_GYRO_SCALED: GYRO_SCALED_CURVE,
    NOTCH: GYRO_SCALED_CURVE,
    AC_CORRECTION: GYRO_SCALED_CURVE,
    AC_ERROR: GYRO_SCALED_CURVE,
    ANGLERATE: GYRO_SCALED_CURVE,
    ACCELEROMETER: { default: [-16, 16] },
    MIXER: { default: [-100, 100] },
    BATTERY: { 0: [0, 4096], default: [0, 26] }, // debug[0] is the raw 0-4095 reading
    RC_INTERPOLATION: {
        0: (curves) => curves.zeroCentred(), // roll RC command
        3: (curves) => curves.zeroCentred(), // refresh period
    },
    RC_SMOOTHING: {
        0: [0, 1200], // current Rx rate Hz
        1: [0, 1200], // smoothed but stepped Rx rate Hz
        2: [0, 1200], // setpoint cutoff Hz
        3: [0, 1200], // throttle cutoff Hz
        4: [0, 1], // pt1K 0-1
        5: [0, 1200], // smoothed Rx rate Hz, without steps
        6: [0, 50], // outlier count 0-3, kept at the very bottom
        7: [0, 50], // valid count 0-3, kept at the very bottom
    },
    RC_SMOOTHING_RATE: {
        0: (curves) => curves.combined("debug[0]", "debug[2]"), // current frame rate us
        2: (curves) => curves.combined("debug[0]", "debug[2]"), // average frame rate us
    },
    ALTITUDE: gatedByApi149(
        {
            0: [-10, 10], // rangefinder alt
            1: [-10, 10], // baro alt
            2: [-10, 10], // GPS alt
            3: [-10, 10], // Kalman alt
            4: [-10, 10], // GPS vel up
            5: [-10, 10], // Kalman vel up
            6: [-10, 10], // accelerometer up
            7: [-10, 10], // Kalman accel up
        },
        {
            0: [-200, 200], // GPS trust
            1: [-50, 50], // baro alt
            2: [-50, 50], // GPS alt
            3: [-5, 5], // vario
        },
    ),
    FFT: {
        0: (curves) => curves.gyro(), // pre-dyn notch gyro
        1: (curves) => curves.gyro(), // post-dyn notch gyro
        2: (curves) => curves.gyro(), // pre-dyn notch gyro downsampled for FFT
    },
    FFT_FREQ: {
        0: (curves) => curves.combined("debug[0]", "debug[1]", "debug[2]"), // notch 1 centre freq
        1: (curves) => curves.combined("debug[0]", "debug[1]", "debug[2]"), // notch 2 centre freq
        2: (curves) => curves.combined("debug[0]", "debug[1]", "debug[2]"), // notch 3 centre freq
        3: (curves) => curves.gyro(), // pre-dyn notch gyro
    },
    DYN_LPF: {
        0: (curves) => curves.gyro(), // gyro scaled
        1: (curves) => curves.combined("debug[1]", "debug[2]"), // notch centre
        2: (curves) => curves.combined("debug[1]", "debug[2]"), // lowpass cutoff
        3: (curves) => curves.gyro(), // pre-dyn notch gyro
    },
    FFT_TIME: { default: [-100, 100] },
    ESC_SENSOR_RPM: RPM_CURVE,
    DSHOT_RPM_TELEMETRY: RPM_CURVE,
    RPM_FILTER: RPM_CURVE,
    D_MIN: D_MAX_CURVE,
    D_MAX: D_MAX_CURVE,
    ITERM_RELAX: {
        2: (curves) => curves.zeroCentred(), // roll I relaxed error
        3: (curves) => curves.zeroCentred(), // roll absolute control axis error, unused from 2026.6
    },
    FF_INTERPOLATED: {
        0: [-1000, 1000], // setpoint delta
        1: [-1000, 1000], // acceleration modified
        2: [-1000, 1000], // acceleration
        3: [0, 20], // clip or count
    },
    FEEDFORWARD: {
        0: (curves) => curves.gyro(), // un-smoothed setpoint, interpolated setpoint in 4.3
        1: [-200, 200], // feedforward delta element
        2: [-200, 200], // feedforward boost element
        3: [0, 100], // rcCommand deltaAbs
        4: [-100, 100], // jitter attenuator
        5: [0, 10], // packet duplicate boolean
        6: [-200, 200], // yaw feedforward
        7: [-200, 200], // yaw feedforward hold element
    },
    FF_LIMIT: FEEDFORWARD_LIMIT_CURVE,
    FEEDFORWARD_LIMIT: FEEDFORWARD_LIMIT_CURVE,
    BARO: {
        0: [-20, 20], // baro state 0-10
        1: [-200, 200], // baro temp
        2: [-200, 200], // baro raw
        3: [-200, 200], // baro smoothed
    },
    GPS_RESCUE_THROTTLE_PID: {
        0: [-200, 200], // throttle P uS added
        1: [-200, 200], // throttle D uS added
        2: [-50, 50], // altitude
        3: [-50, 50], // target altitude
    },
    DYN_IDLE: {
        0: [-1000, 1000], // dyn idle P
        1: [-1000, 1000], // dyn idle I
        2: [-1000, 1000], // dyn idle D
        3: [0, 12000], // minRPS
    },
    GYRO_SAMPLE: {
        0: (curves) => curves.gyroHighResolution(), // before downsampling
        1: (curves) => curves.gyroHighResolution(), // after downsampling
        2: (curves) => curves.gyroHighResolution(), // after RPM
        3: (curves) => curves.gyroHighResolution(), // after all but dyn notch
        4: [0, 100], // average system load %
    },
    RX_TIMING: {
        0: [0, 30], // interval in ms, starting at the bottom
        1: [0, 30], // frame time stamp us/100
        2: [0, 10], // isRateValid boolean
        3: [0, 30], // constrained interval in ms
        4: [0, 1200], // Rx rate
        5: [0, 1200], // smoothed Rx rate
        6: [0, 100], // LQ
        7: [0, 10], // isReceivingSignal boolean
    },
    GHST: {
        0: (curves) => curves.zeroCentred(), // CRC, 0 to max int16_t
        1: (curves) => curves.zeroCentred(), // count of unknown frames
        2: [-256, 0], // RSSI
        3: [0, 100], // LQ percent
    },
    SCHEDULER_DETERMINISM: {
        0: [0, 1000], // gyro task cycle us * 10, so 1250 is 125us
        1: [0, 200], // ID of late task
        2: [0, 200], // task delay time, 100us in the middle
        3: [-50, 50], // gyro skew, 100 is 10us
    },
    TIMING_ACCURACY: {
        0: [0, 100], // % CPU busy
        1: [0, 100], // late tasks per second
        2: [0, 100], // total delay in the last second
        3: [0, 10000], // total tasks per second
    },
    RX_EXPRESSLRS_SPI: { 2: [0, 100] }, // debug[2] is uplink LQ; lost connection count, RSSI and SNR auto-scale
    RX_EXPRESSLRS_PHASELOCK: { 2: (curves) => curves.zeroCentred() }, // debug[2] is the frequency offset in ticks
    GPS_RESCUE_VELOCITY: gatedByApi149(
        {
            0: [-1000, 1000], // target velocity
            1: [-1000, 1000], // velocity / phase
            2: [-1000, 1000], // step east * 100
            3: [-1000, 1000], // step north * 100
        },
        {
            0: [-20, 20], // pitch P deg * 100
            1: [-20, 20], // pitch D deg * 100
            2: [-5, 5], // velocity in cm/s
            3: [-5, 5], // velocity to home in cm/s
        },
    ),
    GPS_RESCUE_HEADING: gatedByApi149(
        {
            0: [-20, 20], // ground speed
            1: [0, 360], // GPS ground course
            2: [0, 360], // yaw attitude
            3: [0, 360], // direction to home
            4: [0, 360], // mag yaw
            7: [-100, 100], // rescue yaw rate
        },
        {
            0: [-100, 100], // groundspeed cm/s
            1: [0, 360], // GPS ground course
            2: [0, 360], // yaw attitude * 10
            3: [0, 360], // angle to home * 10
            4: [0, 360], // magYaw * 10
            5: [0, 20], // magYaw * 10
            6: [0, 180], // roll angle * 100
            7: [0, 200], // yaw rate deg/s
        },
    ),
    GPS_RESCUE_TRACKING: gatedByApi149(
        {
            0: [-10, 10], // velocity
            2: [-10, 10], // altitude
            3: [-10, 10], // target altitude
            4: [0, 360], // aircraft heading
            5: [0, 360], // bearing to home
        },
        {
            0: [-10, 10], // velocity to home cm/s
            1: [-10, 10], // target velocity cm/s
            2: [-50, 50], // altitude m
            3: [-50, 50], // target altitude m
        },
    ),
    GPS_CONNECTION: {
        0: [-200, 200], // GPS flight model
        1: [-200, 200], // nav data interval
        2: [-200, 200], // task interval
        3: (curves) => curves.ownRange(), // baud rate / resolved packet interval
        4: (curves) => curves.ownRange(), // state * 100 + substate
        5: [-100, 100], // executeTimeUs
        6: [-10, 10], // ackState
        7: [-100, 100], // incoming buffer
    },
    GPS_DOP: {
        0: [-200, 200], // number of satellites
        1: [-200, 200], // pDOP
        2: [-200, 200], // hDOP
        3: [-200, 200], // vDOP
    },
    RTH: {
        0: [-4000, 4000], // pitch angle, deg * 100
        1: [0, 20], // rescue phase
        2: [0, 20], // failure code
        3: [0, 4000], // failure counters, coded
    },
    FAILSAFE: { 0: [-200, 200], 1: [-200, 200], 2: [-200, 200], 3: [-200, 200] },
    ANGLE_MODE: {
        0: [-100, 100], // angle target
        1: [-500, 500], // angle error correction
        2: [-500, 500], // angle feedforward
        3: [-100, 100], // angle achieved
    },
    DSHOT_TELEMETRY_COUNTS: { 0: [-200, 200], 1: [-200, 200], 2: [-200, 200], 3: [-200, 200] },
    MAG_CALIB: {
        0: [-2000, 2000], // X
        1: [-2000, 2000], // Y
        2: [-2000, 2000], // Z
        3: [-2000, 2000], // field
        4: [-500, 500], // X cal
        5: [-500, 500], // Y cal
        6: [-500, 500], // Z cal
        7: [0, 4000], // lambda
    },
    MAG_TASK_RATE: {
        0: [-1000, 1000], // task rate
        1: [-1000, 1000], // data rate
        2: [-10000, 10000], // data interval
        3: [-20, 20], // execute time
        4: [-2, 2], // bus busy check
        5: [-2, 2], // read state check
        6: [-10000, 10000], // time since previous task uS
    },
    EZLANDING: { default: () => ({ offset: -5000, power: 1, inputRange: 5000, outputRange: 1 }) },
    ATTITUDE: {
        0: [-180, 180], // roll angle
        1: [-180, 180], // pitch angle
    },
    MAVLINK_TELEMETRY: {
        0: [0, 1],
        1: [0, 100],
        2: [0, 100],
        3: [0, 100],
        4: [0, 100],
        5: [0, 100],
        6: [0, 100],
        7: [0, 100],
    },
    AUTOPILOT_ALTITUDE: gatedByApi149({
        0: [1000, 2000], // new throttle
        1: [-10, 10], // target altitude
        2: [-10, 10], // current altitude
        3: [-500, 500], // P
        4: [-500, 500], // I
        5: [-500, 500], // D
        6: [-500, 500], // A
        7: [-500, 500], // F
    }),
    AUTOPILOT_PID: gatedByApi149({
        0: [-10, 10], // XY velocity
        1: [-10, 10], // XY distance error
        2: [-500, 500], // XY P
        3: [-500, 500], // XY I
        4: [-500, 500], // XY D
        5: [-500, 500], // XY A
        6: [-500, 500], // XY F
        7: [0, 500], // status
    }),
    POSITION_NAV: gatedByApi149({
        0: [-10, 10], // target velocity
        1: [-10, 10], // velocity
        2: [-10, 10], // velocity error
        3: [-500, 500], // P
        4: [-500, 500], // I
        5: [-500, 500], // D
        6: [-500, 500], // A
        7: [0, 500], // status
    }),
    AUTOPILOT_STOP: gatedByApi149({
        0: [-5, 5], // velocity error east
        1: [-5, 5], // velocity error north
        2: [-500, 500], // PID sum east
        3: [-500, 500], // PID sum north
        4: [-500, 500], // roll angle command
        5: [-500, 500], // pitch angle command
        6: [0, 500], // status flags east
        7: [0, 500], // status flags north
    }),
    POSITION_EST: {
        0: [-10, 10], // position
        1: [-10, 10], // velocity
        2: [-10, 10], // Kalman acceleration
        3: [-10, 10], // velocity east
        4: [-10, 10], // velocity north
        5: [-10, 10], // raw acceleration
        6: [0, 1000], // GPS R pos
        7: [0, 1000], // GPS R vel
    },
};

GraphConfig.getDefaultCurveForField = function (flightLog, fieldName) {
    const sysConfig = flightLog.getSysConfig();

    const maxDegreesSecond = function (scale) {
        switch (sysConfig["rates_type"]) {
            case RATES_TYPE.indexOf("ACTUAL"):
            case RATES_TYPE.indexOf("QUICK"):
                return Math.max(
                    sysConfig["rates"][0] * 10 * scale,
                    sysConfig["rates"][1] * 10 * scale,
                    sysConfig["rates"][2] * 10 * scale,
                );
            default:
                return Math.max(
                    flightLog.rcCommandRawToDegreesPerSecond(500, 0) * scale,
                    flightLog.rcCommandRawToDegreesPerSecond(500, 1) * scale,
                    flightLog.rcCommandRawToDegreesPerSecond(500, 2) * scale,
                );
        }
    };

    // The accelerometer's own full scale, so an accADC axis follows the craft's
    // configuration the way a gyro axis does.
    const maxAccelerometerG = function () {
        return Math.abs(flightLog.accRawToGs(32767));
    };

    const getMinMaxForFields = function (...fieldNames) {
        // helper to make a curve scale based on the combined min/max of one or more fields
        let min = Number.MAX_VALUE,
            max = -Number.MAX_VALUE;

        for (const fieldName of fieldNames) {
            const mm = flightLog.getMinMaxForFieldDuringAllTime(fieldName);
            min = Math.min(mm.min, min);
            max = Math.max(mm.max, max);
        }

        if (min !== Number.MAX_VALUE && max !== -Number.MAX_VALUE) {
            return { min: min, max: max };
        }

        return { min: -500, max: 500 };
    };

    const getCurveForMinMaxFields = function (...fieldNames) {
        const mm = getMinMaxForFields(...fieldNames);
        // added convertation min max values from log file units to friendly chart
        const mmChartUnits = {
            min: FlightLogFieldPresenter.ConvertFieldValue(flightLog, fieldName, true, mm.min),
            max: FlightLogFieldPresenter.ConvertFieldValue(flightLog, fieldName, true, mm.max),
        };
        return {
            power: 1,
            MinMax: mmChartUnits,
        };
    };

    const getCurveForMinMaxFieldsZeroOffset = function (...fieldNames) {
        const mm = getMinMaxForFields(...fieldNames);
        // added convertation min max values from log file units to friendly chart
        const mmChartUnits = {
            min: FlightLogFieldPresenter.ConvertFieldValue(flightLog, fieldName, true, mm.min),
            max: FlightLogFieldPresenter.ConvertFieldValue(flightLog, fieldName, true, mm.max),
        };
        mmChartUnits.max = Math.max(Math.max(Math.abs(mmChartUnits.max), Math.abs(mmChartUnits.min)), 1);
        mmChartUnits.min = -mmChartUnits.max;
        return {
            power: 1,
            MinMax: mmChartUnits,
        };
    };

    const gyroScaleMargin = 1.2; // Give a 20% margin for gyro graphs
    const highResolutionScale = sysConfig.blackbox_high_resolution > 0 ? 10 : 1;

    const curves = {
        ownRange: () => getCurveForMinMaxFields(fieldName),
        zeroCentred: () => getCurveForMinMaxFieldsZeroOffset(fieldName),
        combined: (...fieldNames) => getCurveForMinMaxFields(...fieldNames),
        gyro: () => {
            const limit = maxDegreesSecond(gyroScaleMargin);
            return minMaxPower1(-limit, limit);
        },
        gyroHighResolution: () => {
            const limit = maxDegreesSecond(gyroScaleMargin * highResolutionScale);
            return minMaxPower1(-limit, limit);
        },
    };

    const debugModeCurve = function (debugModeName) {
        let fields = DEBUG_MODE_CURVES[debugModeName];
        if (fields?.fromApi149) {
            fields = isApi149OrLater(sysConfig.apiVersion) ? fields.fromApi149 : fields.beforeApi149;
        }

        const index = fieldName.match(/^debug\[(\d+)\]$/)?.[1];
        const spec = fields?.[index] ?? fields?.default;
        if (Array.isArray(spec)) {
            const [min, max] = spec;
            return minMaxPower1(min, max);
        }

        return typeof spec === "function" ? spec(curves) : null;
    };

    try {
        if (
            fieldName.match(/^motor\[/) ||
            fieldName === "rcCommands[3]" || // Throttle scaled
            fieldName.match(/^rssi.*/)
        ) {
            return {
                power: 1,
                MinMax: {
                    min: 0,
                    max: 100,
                },
            };
        } else if (fieldName.match(/^eRPM\[/)) {
            return getCurveForMinMaxFields(
                "eRPM[0]",
                "eRPM[1]",
                "eRPM[2]",
                "eRPM[3]",
                "eRPM[4]",
                "eRPM[5]",
                "eRPM[6]",
                "eRPM[7]",
            );
        } else if (fieldName.match(/^accSmooth\[/)) {
            return {
                power: 1,
                MinMax: {
                    min: -16,
                    max: 16,
                },
            };
        } else if (
            fieldName.match(/^axisError\[/) || // Gyro, Gyro Scaled, RC Command Scaled and axisError
            fieldName.match(/^rcCommands\[/) || // These use the same scaling as they are in the
            fieldName.match(/^gyroADC\[/) || // same range.
            fieldName.match(/^gyroUnfilt\[/)
        ) {
            return {
                power: 1,
                MinMax: {
                    min: -maxDegreesSecond(gyroScaleMargin),
                    max: maxDegreesSecond(gyroScaleMargin),
                },
            };
        } else if (fieldName.match(/^axis.+\[/) || fieldName === "GPS_speed") {
            return {
                power: 1,
                MinMax: {
                    min: -100,
                    max: 100,
                },
            };
        } else if (fieldName.match(/^servo\[/) || fieldName.match(/^rcCommand\[/)) {
            return {
                power: 1,
                MinMax: {
                    min: 1000,
                    max: 2000,
                },
            };
        } else if (fieldName === "heading[2]" || fieldName === "GPS_ground_course" || fieldName === "gpsHomeAzimuth") {
            return {
                power: 1,
                MinMax: {
                    min: 0,
                    max: 360,
                },
            };
        } else if (fieldName.match(/^heading\[/)) {
            return {
                power: 1,
                MinMax: {
                    min: -180,
                    max: 180,
                },
            };
        } else if (fieldName.match(/^sonar.*/)) {
            return {
                power: 1,
                MinMax: {
                    min: 0,
                    max: 400,
                },
            };
        } else if (fieldName === "GPS_numSat") {
            return {
                power: 1,
                MinMax: {
                    min: 0,
                    max: 40,
                },
            };
        } else if (fieldName.match(/^GPS_velned\[/)) {
            return {
                power: 1,
                MinMax: {
                    min: -25,
                    max: 25,
                },
            };
        } else if (fieldName === "gpsTrajectoryTiltAngle") {
            return {
                power: 1,
                MinMax: {
                    min: -90,
                    max: 90,
                },
            };
        } else if (fieldName.match(/^debug.*/) && sysConfig.debug_mode != null) {
            const debugModeName = getDebugModes(sysConfig.apiVersion)[sysConfig.debug_mode];

            // Firmware from API 1.49 on annotates what each debug field holds, so the
            // axis follows from the field's own shape and DEBUG_MODE_CURVES is never
            // consulted. That table remains for logs recorded before the annotations.
            const axis = getDebugFieldAxis(debugModeName, fieldName, sysConfig.apiVersion);
            if (axis) {
                if (axis.range) {
                    return minMaxPower1(axis.range.min, axis.range.max);
                }
                if (axis.dynamic === "gyro") {
                    return curves.gyro();
                }
                if (axis.dynamic === "acc") {
                    return minMaxPower1(-maxAccelerometerG(), maxAccelerometerG());
                }
                // The group names every field firmware writes in that unit, but a
                // log only holds the fields it was configured to record; asking for
                // an absent one yields the generic fallback range.
                const logged = axis.fit.filter((name) => flightLog.getMainFieldIndexByName(name) !== undefined);
                return getCurveForMinMaxFields(...(logged.length > 0 ? logged : [fieldName]));
            }

            const curve = debugModeCurve(debugModeName);
            if (curve) {
                return curve;
            }
        }

        // if not found above then
        // Scale and center the field based on the whole-log observed ranges for that field
        return getCurveForMinMaxFields(fieldName);
    } catch {
        return {
            power: 1,
            MinMax: {
                min: -500,
                max: 500,
            },
        };
    }
};

/**
 * Compute min-max values for field during all time.
 *
 * @param flightLog The reference to the FlightLog object
 * @param fieldName Name of the field
 */
GraphConfig.getMinMaxForFieldDuringAllTimeInterval = function (flightLog, fieldName) {
    const mm = flightLog.getMinMaxForFieldDuringAllTime(fieldName);
    if (mm === undefined) {
        return {
            min: -500,
            max: 500,
        };
    }

    mm.min = FlightLogFieldPresenter.ConvertFieldValue(flightLog, fieldName, true, mm.min);
    mm.max = FlightLogFieldPresenter.ConvertFieldValue(flightLog, fieldName, true, mm.max);
    return mm;
};

/**
 * Compute min-max values for field during current windows time interval.
 *
 * @param flightLog The reference to the FlightLog object
 * @param logGrapher The reference to the FlightLogGrapher object
 * @param fieldName Name of the field
 */
GraphConfig.getMinMaxForFieldDuringWindowTimeInterval = function (flightLog, logGrapher, fieldName) {
    const WindowCenterTime = logGrapher.getWindowCenterTime();
    const WindowWidthTime = logGrapher.getWindowWidthTime();
    const minTime = WindowCenterTime - WindowWidthTime / 2;
    const maxTime = WindowCenterTime + WindowWidthTime / 2;

    const mm = flightLog.getMinMaxForFieldDuringTimeInterval(fieldName, minTime, maxTime);
    if (mm === undefined) {
        return {
            min: -500,
            max: 500,
        };
    }

    mm.min = FlightLogFieldPresenter.ConvertFieldValue(flightLog, fieldName, true, mm.min);
    mm.max = FlightLogFieldPresenter.ConvertFieldValue(flightLog, fieldName, true, mm.max);
    return mm;
};

/**
 * Compute min-max values for field during marked in-out time interval.
 *
 * @param flightLog The reference to the FlightLog object
 * @param logGrapher The reference to the FlightLogGrapher object
 * @param fieldName Name of the field
 */
GraphConfig.getMinMaxForFieldDuringMarkedInterval = function (flightLog, logGrapher, fieldName) {
    let minTime = logGrapher.getMarkedInTime();
    let maxTime = logGrapher.getMarkedOutTime();
    if (minTime === false) {
        minTime = flightLog.getMinTime();
    }
    if (maxTime === false) {
        maxTime = flightLog.getMaxTime();
    }

    const mm = flightLog.getMinMaxForFieldDuringTimeInterval(fieldName, minTime, maxTime);
    if (mm === undefined) {
        return {
            min: -500,
            max: 500,
        };
    }

    mm.min = FlightLogFieldPresenter.ConvertFieldValue(flightLog, fieldName, true, mm.min);
    mm.max = FlightLogFieldPresenter.ConvertFieldValue(flightLog, fieldName, true, mm.max);
    return mm;
};

/**
 * Get an array of suggested graph configurations will be usable for the fields available in the given flightlog.
 *
 * Supply an array of strings `graphNames` to only fetch the graph with the given names.
 */
GraphConfig.getExampleGraphConfigs = function (flightLog, graphNames) {
    const result = [];
    const EXAMPLE_GRAPHS = [];

    if (!flightLog.isFieldDisabled().MOTORS) {
        EXAMPLE_GRAPHS.push({
            label: "Motors",
            fields: ["motor[all]", "servo[5]"],
        });
        EXAMPLE_GRAPHS.push({
            label: "Motors (Legacy)",
            fields: ["motorLegacy[all]", "servo[5]"],
        });
    }
    if (!flightLog.isFieldDisabled().RPM) {
        EXAMPLE_GRAPHS.push({ label: "RPM", fields: ["eRPM[all]"] });
    }
    if (!flightLog.isFieldDisabled().GYRO) {
        EXAMPLE_GRAPHS.push({ label: "Gyros", fields: ["gyroADC[all]"] });
    }
    if (!flightLog.isFieldDisabled().GYROUNFILT) {
        EXAMPLE_GRAPHS.push({
            label: "Unfiltered Gyros",
            fields: ["gyroUnfilt[all]"],
        });
    }
    if (!flightLog.isFieldDisabled().SETPOINT) {
        EXAMPLE_GRAPHS.push({ label: "Setpoint", fields: ["rcCommands[all]"] });
    }
    if (!flightLog.isFieldDisabled().RC_COMMANDS) {
        EXAMPLE_GRAPHS.push({ label: "RC Command", fields: ["rcCommand[all]"] });
    }
    if (!flightLog.isFieldDisabled().PID) {
        EXAMPLE_GRAPHS.push({ label: "PIDs", fields: ["axisSum[all]"] });
    }
    if (!(flightLog.isFieldDisabled().GYRO || flightLog.isFieldDisabled().PID)) {
        EXAMPLE_GRAPHS.push(
            { label: "PID Error", fields: ["axisError[all]"] },
            {
                label: "Gyro + PID roll",
                fields: ["axisP[0]", "axisI[0]", "axisD[0]", "axisF[0]", "gyroADC[0]"],
            },
            {
                label: "Gyro + PID pitch",
                fields: ["axisP[1]", "axisI[1]", "axisD[1]", "axisF[1]", "gyroADC[1]"],
            },
            {
                label: "Gyro + PID yaw",
                fields: ["axisP[2]", "axisI[2]", "axisD[2]", "axisF[2]", "gyroADC[2]"],
            },
        );
    }
    if (!flightLog.isFieldDisabled().ACC) {
        EXAMPLE_GRAPHS.push({
            label: "Accelerometers",
            fields: ["accSmooth[all]"],
        });
    }
    if (!flightLog.isFieldDisabled().HEADING) {
        EXAMPLE_GRAPHS.push({ label: "Heading", fields: ["heading[all]"] });
    }
    if (!flightLog.isFieldDisabled().MAGNETOMETER) {
        EXAMPLE_GRAPHS.push({ label: "Compass", fields: ["magADC[all]"] });
    }
    if (!flightLog.isFieldDisabled().DEBUG) {
        EXAMPLE_GRAPHS.push({ label: "Debug", fields: ["debug[all]"] });
    }

    if (!flightLog.isFieldDisabled().GPS) {
        EXAMPLE_GRAPHS.push({
            label: "GPS",
            fields: [
                "GPS_numSat",
                "GPS_altitude",
                "GPS_speed",
                "GPS_ground_course",
                "gpsTrajectoryTiltAngle",
                "GPS_coord[all]",
            ],
        });
        EXAMPLE_GRAPHS.push({
            label: "GPS Cartesian coords",
            fields: ["gpsCartesianCoords[all]", "gpsDistance", "gpsHomeAzimuth"],
        });
    }

    for (const srcGraph of EXAMPLE_GRAPHS) {
        const destGraph = {
            label: srcGraph.label,
            fields: [],
            height: srcGraph.height || 1,
        };
        let found;

        if (graphNames !== undefined) {
            found = false;
            for (const name of graphNames) {
                if (srcGraph.label === name) {
                    found = true;
                    break;
                }
            }

            if (!found) {
                continue;
            }
        }

        for (const srcFieldName of srcGraph.fields) {
            const destField = {
                name: srcFieldName,
                color: -1,
            };

            destGraph.fields.push(destField);
        }

        result.push(destGraph);
    }

    return result;
};
