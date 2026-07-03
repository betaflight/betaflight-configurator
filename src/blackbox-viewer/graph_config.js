import { FlightLogFieldPresenter } from "./flightlog_fields_presenter";
import { RATES_TYPE } from "./flightlog_fielddefs";
import { escapeRegExp } from "./tools";
import { getDebugModes } from "../js/utils/debugModes";

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
            switch (debugModeName) {
                case "CYCLETIME":
                    switch (fieldName) {
                        case "debug[1]": //CPU Load
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 100,
                                },
                            };
                        default:
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 2000,
                                },
                            };
                    }
                case "PIDLOOP":
                    return {
                        power: 1,
                        MinMax: {
                            min: 0,
                            max: 500,
                        },
                    };
                case "GYRO":
                case "GYRO_FILTERED":
                case "GYRO_SCALED":
                case "DUAL_GYRO":
                case "DUAL_GYRO_COMBINED":
                case "DUAL_GYRO_DIFF":
                case "DUAL_GYRO_RAW":
                case "DUAL_GYRO_SCALED":
                case "NOTCH":
                case "AC_CORRECTION":
                case "AC_ERROR":
                    return {
                        power: 1,
                        MinMax: {
                            min: -maxDegreesSecond(gyroScaleMargin),
                            max: maxDegreesSecond(gyroScaleMargin),
                        },
                    };
                case "ACCELEROMETER":
                    return {
                        power: 1,
                        MinMax: {
                            min: -16,
                            max: 16,
                        },
                    };
                case "MIXER":
                    return {
                        power: 1,
                        MinMax: {
                            min: -100,
                            max: 100,
                        },
                    };
                case "BATTERY":
                    switch (fieldName) {
                        case "debug[0]": //Raw Value (0-4095)
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 4096,
                                },
                            };
                        default:
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 26,
                                },
                            };
                    }
                case "RC_INTERPOLATION":
                    switch (fieldName) {
                        case "debug[0]": // Roll RC Command
                        case "debug[3]": // refresh period
                            return getCurveForMinMaxFieldsZeroOffset(fieldName);
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "RC_SMOOTHING":
                    switch (fieldName) {
                        case "debug[0]": // current Rx Rate Hz
                        case "debug[1]": // smoothed but stepped Rx Rate Hz
                        case "debug[2]": // setpoint cutoff Hz
                        case "debug[3]": // throttle cutoff Hz
                        case "debug[5]": // smoothed Rx Rate Hz, without steps
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 1200,
                                },
                            };
                        case "debug[4]": // pt1K 0-1
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 1,
                                },
                            };
                        case "debug[6]": // outlier count 0-3
                        case "debug[7]": // valid count 0-3
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 50, // put them at the very bottom
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "RC_SMOOTHING_RATE":
                    switch (fieldName) {
                        case "debug[0]": // current frame rate [us]
                        case "debug[2]": // average frame rate [us]
                            return getCurveForMinMaxFields("debug[0]", "debug[2]");
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "ANGLERATE":
                    return {
                        power: 1,
                        MinMax: {
                            min: -maxDegreesSecond(gyroScaleMargin),
                            max: maxDegreesSecond(gyroScaleMargin),
                        },
                    };
                case "ALTITUDE":
                    switch (fieldName) {
                        case "debug[0]": // GPS Trust
                            return {
                                power: 1,
                                MinMax: {
                                    min: -200,
                                    max: 200,
                                },
                            };
                        case "debug[1]": // Baro Alt
                        case "debug[2]": // GPS Alt
                            return {
                                power: 1,
                                MinMax: {
                                    min: -50,
                                    max: 50,
                                },
                            };
                        case "debug[3]": // vario
                            return {
                                power: 1,
                                MinMax: {
                                    min: -5,
                                    max: 5,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "FFT":
                    switch (fieldName) {
                        case "debug[0]": // pre-dyn notch gyro [for gyro debug axis]
                        case "debug[1]": // post-dyn notch gyro [for gyro debug axis]
                        case "debug[2]": // pre-dyn notch gyro downsampled for FFT [for gyro debug axis]
                            return {
                                power: 1,
                                MinMax: {
                                    min: -maxDegreesSecond(gyroScaleMargin),
                                    max: maxDegreesSecond(gyroScaleMargin),
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "FFT_FREQ":
                    switch (fieldName) {
                        case "debug[0]": // notch 1 center freq [for gyro debug axis]
                        case "debug[1]": // notch 2 center freq [for gyro debug axis]
                        case "debug[2]": // notch 3 center freq [for gyro debug axis]
                            return getCurveForMinMaxFields("debug[0]", "debug[1]", "debug[2]");
                        case "debug[3]": // pre-dyn notch gyro [for gyro debug axis]
                            return {
                                power: 1,
                                MinMax: {
                                    min: -maxDegreesSecond(gyroScaleMargin),
                                    max: maxDegreesSecond(gyroScaleMargin),
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "DYN_LPF":
                    switch (fieldName) {
                        case "debug[1]": // Notch center
                        case "debug[2]": // Lowpass Cutoff
                            return getCurveForMinMaxFields("debug[1]", "debug[2]");
                        case "debug[0]": // gyro scaled [for selected axis]
                        case "debug[3]": // pre-dyn notch gyro [for selected axis]
                            return {
                                power: 1,
                                MinMax: {
                                    min: -maxDegreesSecond(gyroScaleMargin),
                                    max: maxDegreesSecond(gyroScaleMargin),
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "FFT_TIME":
                    return {
                        power: 1,
                        MinMax: {
                            min: -100,
                            max: 100,
                        },
                    };
                case "ESC_SENSOR_RPM":
                case "DSHOT_RPM_TELEMETRY":
                case "RPM_FILTER":
                    return getCurveForMinMaxFields("debug[0]", "debug[1]", "debug[2]", "debug[3]");
                case "D_MAX":
                    switch (fieldName) {
                        case "debug[0]": // roll gyro factor
                        case "debug[1]": // roll setpoint Factor
                            return getCurveForMinMaxFields("debug[0]", "debug[1]");
                        case "debug[2]": // roll actual D
                        case "debug[3]": // pitch actual D
                            return getCurveForMinMaxFields("debug[2]", "debug[3]");
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "ITERM_RELAX":
                    switch (fieldName) {
                        case "debug[2]": // roll I relaxed error
                        case "debug[3]": // roll absolute control axis error (pre-2026.6; unused/zero in firmware >= 2026.6)
                            return getCurveForMinMaxFieldsZeroOffset(fieldName);
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "FF_INTERPOLATED":
                    switch (fieldName) {
                        case "debug[0]": // setpoint Delta
                        case "debug[1]": // AccelerationModified
                        case "debug[2]": // Acceleration
                            return {
                                power: 1,
                                MinMax: {
                                    min: -1000,
                                    max: 1000,
                                },
                            };
                        case "debug[3]": // Clip or Count
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 20,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "FEEDFORWARD": // replaces FF_INTERPOLATED in 4.3
                    switch (fieldName) {
                        case "debug[0]": // in 4.3 is interpolated setpoint, now un-smoothed setpoint
                            return {
                                power: 1,
                                MinMax: {
                                    min: -maxDegreesSecond(gyroScaleMargin),
                                    max: maxDegreesSecond(gyroScaleMargin),
                                },
                            };
                        case "debug[1]": // feedforward delta element
                        case "debug[2]": // feedforward boost element
                            return {
                                power: 1,
                                MinMax: {
                                    min: -200,
                                    max: 200,
                                },
                            };
                        case "debug[3]": // rcCommand deltaAbs
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 100,
                                },
                            };
                        case "debug[4]": // Jitter Attenuator
                            return {
                                power: 1,
                                MinMax: {
                                    min: -100,
                                    max: 100,
                                },
                            };
                        case "debug[5]": // Packet Duplicate boolean
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 10,
                                },
                            };
                        case "debug[6]": // Yaw feedforward
                        case "debug[7]": // Yaw feedforward hold element
                            return {
                                power: 1,
                                MinMax: {
                                    min: -200,
                                    max: 200,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "FF_LIMIT":
                case "FEEDFORWARD_LIMIT":
                    switch (fieldName) {
                        case "debug[0]": // Jitter Attenuator
                            return {
                                power: 1,
                                MinMax: {
                                    min: -100,
                                    max: 100,
                                },
                            };
                        case "debug[1]": // Max setpoint rate for axis
                        case "debug[2]": // Setpoint
                            return {
                                power: 1,
                                MinMax: {
                                    min: -maxDegreesSecond(gyroScaleMargin),
                                    max: maxDegreesSecond(gyroScaleMargin),
                                },
                            };
                        case "debug[3]": // feedforward
                        case "debug[4]": // setpoint speed unsmoothed
                        case "debug[5]": // setpoint speed smoothed
                            return {
                                power: 1,
                                MinMax: {
                                    min: -200,
                                    max: 200,
                                },
                            };
                        case "debug[6]": // pt1K 0-1
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 1,
                                },
                            };
                        case "debug[7]": // smoothed Rx Rate Hz
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 1200,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "BARO":
                    switch (fieldName) {
                        case "debug[0]": // Baro state 0-10
                            return {
                                power: 1,
                                MinMax: {
                                    min: -20,
                                    max: 20,
                                },
                            };
                        case "debug[1]": // Baro Temp
                        case "debug[2]": // Baro Raw
                        case "debug[3]": // Baro smoothed
                            return {
                                power: 1,
                                MinMax: {
                                    min: -200,
                                    max: 200,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "GPS_RESCUE_THROTTLE_PID":
                    switch (fieldName) {
                        case "debug[0]": // Throttle P uS added
                        case "debug[1]": // Throttle D uS added
                            return {
                                power: 1,
                                MinMax: {
                                    min: -200,
                                    max: 200,
                                },
                            };
                        case "debug[2]": // Altitude
                        case "debug[3]": // Target Altitude
                            return {
                                power: 1,
                                MinMax: {
                                    min: -50,
                                    max: 50,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "DYN_IDLE":
                    switch (fieldName) {
                        case "debug[0]": // in 4.3 is dyn idle P
                        case "debug[1]": // in 4.3 is dyn idle I
                        case "debug[2]": // in 4.3 is dyn idle D
                            return {
                                power: 1,
                                MinMax: {
                                    min: -1000,
                                    max: 1000,
                                },
                            };
                        case "debug[3]": // in 4.3 and 4.2 is minRPS
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 12000,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "GYRO_SAMPLE":
                    switch (fieldName) {
                        case "debug[0]": // Before downsampling
                        case "debug[1]": // After downsampling
                        case "debug[2]": // After RPM
                        case "debug[3]": // After all but Dyn Notch
                            return {
                                power: 1,
                                MinMax: {
                                    min: -maxDegreesSecond(gyroScaleMargin * highResolutionScale),
                                    max: maxDegreesSecond(gyroScaleMargin * highResolutionScale),
                                },
                            };
                        case "debug[4]": // Avg System Load %
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 100,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "RX_TIMING":
                    switch (fieldName) {
                        case "debug[0]": // interval in ms
                        case "debug[1]": // Frame time stamp us/100
                        case "debug[3]": // constrained interval in ms
                            return {
                                // start at bottom, scale up to 30ms
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 30,
                                },
                            };
                        case "debug[2]": // IsRateValid boolean
                        case "debug[7]": // isReceivingSignal boolean
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 10,
                                },
                            };
                        case "debug[4]": // Rx Rate
                        case "debug[5]": // Smoothed Rx Rate
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 1200,
                                },
                            };
                        case "debug[6]": // LQ
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 100,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "GHST":
                    switch (fieldName) {
                        case "debug[0]": // CRC 0 to max int16_t
                        case "debug[1]": // Count of Unknown Frames
                            return getCurveForMinMaxFieldsZeroOffset(fieldName);
                        case "debug[2]": // RSSI
                            return {
                                power: 1,
                                MinMax: {
                                    min: -256,
                                    max: 0,
                                },
                            };
                        case "debug[3]": // LQ percent
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 100,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "SCHEDULER_DETERMINISM":
                    switch (fieldName) {
                        case "debug[0]": // Gyro task cycle us * 10 so 1250 = 125us
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 1000,
                                },
                            };
                        case "debug[1]": // ID of late task
                        case "debug[2]": // task delay time 100us in middle
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 200,
                                },
                            };
                        case "debug[3]": // gyro skew 100 = 10us
                            return {
                                power: 1,
                                MinMax: {
                                    min: -50,
                                    max: 50,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "TIMING_ACCURACY":
                    switch (fieldName) {
                        case "debug[0]": // % CPU Busy
                        case "debug[1]": // late tasks per second
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 100,
                                },
                            };
                        case "debug[2]": // total delay in last second
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 100,
                                },
                            };
                        case "debug[3]": // total tasks per second
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 10000,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "RX_EXPRESSLRS_SPI":
                    switch (fieldName) {
                        case "debug[2]": // Uplink LQ
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 100,
                                },
                            };
                        // debug 0 = Lost connection count
                        // debug 1 = RSSI
                        // debug 3 = SNR
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "RX_EXPRESSLRS_PHASELOCK":
                    switch (fieldName) {
                        case "debug[2]": // Frequency offset in ticks
                            return getCurveForMinMaxFieldsZeroOffset(fieldName);
                        // debug 0 = Phase offset us
                        // debug 1 = Filtered phase offset us
                        // debug 3 = Phase shift in us
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "GPS_RESCUE_VELOCITY":
                    switch (fieldName) {
                        case "debug[0]": // Pitch P deg * 100
                        case "debug[1]": // Pitch D deg * 100
                            return {
                                power: 1,
                                MinMax: {
                                    min: -20,
                                    max: 20,
                                },
                            };
                        case "debug[2]": // Velocity in cm/s
                        case "debug[3]": // Velocity to home in cm/s
                            return {
                                power: 1,
                                MinMax: {
                                    min: -5,
                                    max: 5,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "GPS_RESCUE_HEADING":
                    switch (fieldName) {
                        case "debug[0]": // Groundspeed cm/s
                            return {
                                power: 1,
                                MinMax: {
                                    min: -100,
                                    max: 100,
                                },
                            };
                        case "debug[1]": // GPS GroundCourse
                        case "debug[2]": // Yaw attitude * 10
                        case "debug[3]": // Angle to home * 10
                        case "debug[4]": // magYaw * 10
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 360,
                                },
                            };
                        case "debug[5]": // magYaw * 10
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 20,
                                },
                            };
                        case "debug[6]": // roll angle *100
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 180,
                                },
                            };
                        case "debug[7]": // yaw rate deg/s
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 200,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "RTH":
                    switch (fieldName) {
                        case "debug[0]": // Pitch angle, deg * 100
                            return {
                                power: 1,
                                MinMax: {
                                    min: -4000,
                                    max: 4000,
                                },
                            };
                        case "debug[1]": // Rescue Phase
                        case "debug[2]": // Failure code
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 20,
                                },
                            };
                        case "debug[3]": // Failure counters coded
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 4000,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "GPS_RESCUE_TRACKING":
                    switch (fieldName) {
                        case "debug[0]": // velocity to home cm/s
                        case "debug[1]": // target velocity cm/s
                            return {
                                power: 1,
                                MinMax: {
                                    min: -10,
                                    max: 10,
                                },
                            };
                        case "debug[2]": // altitude m
                        case "debug[3]": // Target altitude m
                            return {
                                power: 1,
                                MinMax: {
                                    min: -50,
                                    max: 50,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "GPS_CONNECTION":
                    switch (fieldName) {
                        case "debug[0]": // GPS flight model
                        case "debug[1]": // Nav Data interval
                            return {
                                power: 1,
                                MinMax: {
                                    min: -200,
                                    max: 200,
                                },
                            };
                        case "debug[2]": // task interval
                            return {
                                power: 1,
                                MinMax: {
                                    min: -200,
                                    max: 200,
                                },
                            };
                        case "debug[3]": // Baud rate / resolved packet interval
                        case "debug[4]": // State*100 + SubState
                            return getCurveForMinMaxFields(fieldName);
                        case "debug[5]": // ExecuteTimeUs
                            return {
                                power: 1,
                                MinMax: {
                                    min: -100,
                                    max: 100,
                                },
                            };
                        case "debug[6]": // ackState
                            return {
                                power: 1,
                                MinMax: {
                                    min: -10,
                                    max: 10,
                                },
                            };
                        case "debug[7]": // Incoming buffer
                            return {
                                power: 1,
                                MinMax: {
                                    min: -100,
                                    max: 100,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "GPS_DOP":
                    switch (fieldName) {
                        case "debug[0]": // Number of Satellites (now this is in normal GPS data, maybe gpsTrust?)
                        case "debug[1]": // pDOP
                        case "debug[2]": // hDOP
                        case "debug[3]": // vDOP
                            return {
                                power: 1,
                                MinMax: {
                                    min: -200,
                                    max: 200,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "FAILSAFE":
                    switch (fieldName) {
                        case "debug[0]":
                        case "debug[1]":
                        case "debug[2]":
                        case "debug[3]":
                            return {
                                power: 1,
                                MinMax: {
                                    min: -200,
                                    max: 200,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "ANGLE_MODE":
                    switch (fieldName) {
                        case "debug[0]": // angle target
                        case "debug[3]": // angle achieved
                            return {
                                power: 1,
                                MinMax: {
                                    min: -100,
                                    max: 100,
                                },
                            };
                        case "debug[1]": // angle error correction
                        case "debug[2]": // angle feedforward
                            return {
                                power: 1,
                                MinMax: {
                                    min: -500,
                                    max: 500,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "DSHOT_TELEMETRY_COUNTS":
                    switch (fieldName) {
                        case "debug[0]":
                        case "debug[1]":
                        case "debug[2]":
                        case "debug[3]":
                            return {
                                power: 1,
                                MinMax: {
                                    min: -200,
                                    max: 200,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "MAG_CALIB":
                    switch (fieldName) {
                        case "debug[0]": // X
                        case "debug[1]": // Y
                        case "debug[2]": // Z
                        case "debug[3]": // Field
                            return {
                                power: 1,
                                MinMax: {
                                    min: -2000,
                                    max: 2000,
                                },
                            };
                        case "debug[4]": // X Cal
                        case "debug[5]": // Y Cal
                        case "debug[6]": // Z Cal
                            return {
                                power: 1,
                                MinMax: {
                                    min: -500,
                                    max: 500,
                                },
                            };
                        case "debug[7]": // Lambda
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 4000,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "MAG_TASK_RATE":
                    switch (fieldName) {
                        case "debug[0]": // Task Rate
                        case "debug[1]": // Data Rate
                            return {
                                power: 1,
                                MinMax: {
                                    min: -1000,
                                    max: 1000,
                                },
                            };
                        case "debug[2]": // Data Interval
                            return {
                                power: 1,
                                MinMax: {
                                    min: -10000,
                                    max: 10000,
                                },
                            };
                        case "debug[3]": // Execute Time
                            return {
                                power: 1,
                                MinMax: {
                                    min: -20,
                                    max: 20,
                                },
                            };
                        case "debug[4]": // Bus Busy Check
                        case "debug[5]": // Read State Check
                            return {
                                power: 1,
                                MinMax: {
                                    min: -2,
                                    max: 2,
                                },
                            };
                        case "debug[6]": // Time since previous task uS
                            return {
                                power: 1,
                                MinMax: {
                                    min: -10000,
                                    max: 10000,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "EZLANDING":
                    return {
                        offset: -5000,
                        power: 1,
                        inputRange: 5000,
                        outputRange: 1,
                    };
                case "ATTITUDE":
                    switch (fieldName) {
                        case "debug[0]": // Roll angle
                        case "debug[1]": // Pitch angle
                            return {
                                power: 1,
                                MinMax: {
                                    min: -180,
                                    max: 180,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
                case "MAVLINK_TELEMETRY":
                    switch (fieldName) {
                        case "debug[0]":
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 1,
                                },
                            };
                        case "debug[1]":
                        case "debug[2]":
                        case "debug[3]":
                        case "debug[4]":
                        case "debug[5]":
                        case "debug[6]":
                        case "debug[7]":
                            return {
                                power: 1,
                                MinMax: {
                                    min: 0,
                                    max: 100,
                                },
                            };
                        default:
                            return getCurveForMinMaxFields(fieldName);
                    }
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
 * Compute min-max values for field during all time.
 * @param fieldName Name of the field
 */
GraphConfig.getMinMaxForFieldDuringAllTime = function (flightLog, fieldName) {
    const mm = flightLog.getMinMaxForFieldDuringAllTime(fieldName);
    if (mm.min === Number.MAX_VALUE || mm.max === -Number.MAX_VALUE) {
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
