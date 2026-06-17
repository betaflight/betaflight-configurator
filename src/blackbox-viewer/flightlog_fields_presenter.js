import semver from "semver";
import {
    FLIGHT_LOG_FLIGHT_MODE_NAME,
    FLIGHT_LOG_FEATURES,
    FLIGHT_LOG_FLIGHT_STATE_NAME,
    FLIGHT_LOG_FAILSAFE_PHASE_NAME,
    FFT_CALC_STEPS,
    FIRMWARE_TYPE_BETAFLIGHT,
    FIRMWARE_TYPE_CLEANFLIGHT,
} from "./flightlog_fielddefs";
import { formatTime } from "./tools";
import { useSettingsStore } from "./stores/settings.js";
import {
    getDebugModes,
    getDebugFieldNames,
    decodeDebugFieldToFriendly as sharedDecodeDebugFieldToFriendly,
    convertDebugFieldValue as sharedConvertDebugFieldValue,
} from "../js/utils/debugModes";

/**
 * Resolve the debug_mode name for a parsed log using the shared, API-version
 * keyed definitions (`getDebugModes`). The log's apiVersion is resolved once by
 * the parser (see firmwareToApiVersion) and stored on sysConfig.
 */
function debugModeNameForLog(flightLog) {
    const sysConfig = flightLog.getSysConfig();
    return getDebugModes(sysConfig.apiVersion)[sysConfig.debug_mode];
}

/**
 * Build the hardware-scaling context the shared debug decode/convert helpers
 * need, bound to a parsed FlightLog. Keeps the shared functions free of any
 * FlightLog coupling.
 */
function debugScaleContext(flightLog) {
    const sysConfig = flightLog.getSysConfig();
    return {
        apiVersion: sysConfig.apiVersion,
        motorPoles: sysConfig["motor_poles"],
        accRawToGs: (v) => flightLog.accRawToGs(v),
        gyroRawToDegreesPerSecond: (v) => flightLog.gyroRawToDegreesPerSecond(v),
        rcCommandRawToThrottle: (v) => flightLog.rcCommandRawToThrottle(v),
        throttleToRcCommandRaw: (v) => flightLog.ThrottleTorcCommandRaw(v),
        fftCalcSteps: FFT_CALC_STEPS,
    };
}

export function FlightLogFieldPresenter() {
    // this is intentional
}

const FRIENDLY_FIELD_NAMES = {
    "axisP[all]": "PID P",
    "axisP[0]": "PID P [roll]",
    "axisP[1]": "PID P [pitch]",
    "axisP[2]": "PID P [yaw]",

    "axisI[all]": "PID I",
    "axisI[0]": "PID I [roll]",
    "axisI[1]": "PID I [pitch]",
    "axisI[2]": "PID I [yaw]",

    "axisD[all]": "PID D",
    "axisD[0]": "PID D [roll]",
    "axisD[1]": "PID D [pitch]",
    "axisD[2]": "PID D [yaw]",

    "axisF[all]": "PID Feedforward",
    "axisF[0]": "PID Feedforward [roll]",
    "axisF[1]": "PID Feedforward [pitch]",
    "axisF[2]": "PID Feedforward [yaw]",

    "axisS[all]": "PID S",
    "axisS[0]": "PID S [roll]",
    "axisS[1]": "PID S [pitch]",
    "axisS[2]": "PID S [yaw]",

    //Virtual field
    "axisSum[all]": "PID Sum",
    "axisSum[0]": "PID Sum [roll]",
    "axisSum[1]": "PID Sum [pitch]",
    "axisSum[2]": "PID Sum [yaw]",

    //Virtual field
    "axisError[all]": "PID Error",
    "axisError[0]": "PID Error [roll]",
    "axisError[1]": "PID Error [pitch]",
    "axisError[2]": "PID Error [yaw]",

    //Virtual field
    "rcCommands[all]": "Setpoints",
    "rcCommands[0]": "Setpoint [roll]",
    "rcCommands[1]": "Setpoint [pitch]",
    "rcCommands[2]": "Setpoint [yaw]",
    "rcCommands[3]": "Setpoint [throttle]",

    "rcCommand[all]": "RC Commands",
    "rcCommand[0]": "RC Command [roll]",
    "rcCommand[1]": "RC Command [pitch]",
    "rcCommand[2]": "RC Command [yaw]",
    "rcCommand[3]": "RC Command [throttle]",

    "gyroADC[all]": "Gyros",
    "gyroADC[0]": "Gyro [roll]",
    "gyroADC[1]": "Gyro [pitch]",
    "gyroADC[2]": "Gyro [yaw]",

    "gyroUnfilt[all]": "Unfiltered Gyros",
    "gyroUnfilt[0]": "Unfiltered Gyro [roll]",
    "gyroUnfilt[1]": "Unfiltered Gyro [pitch]",
    "gyroUnfilt[2]": "Unfiltered Gyro [yaw]",

    //End-users prefer 1-based indexing
    "motor[all]": "Motors",
    "motor[0]": "Motor [1]",
    "motor[1]": "Motor [2]",
    "motor[2]": "Motor [3]",
    "motor[3]": "Motor [4]",
    "motor[4]": "Motor [5]",
    "motor[5]": "Motor [6]",
    "motor[6]": "Motor [7]",
    "motor[7]": "Motor [8]",

    "eRPM[all]": "RPM",
    "eRPM[0]": "RPM [1]",
    "eRPM[1]": "RPM [2]",
    "eRPM[2]": "RPM [3]",
    "eRPM[3]": "RPM [4]",
    "eRPM[4]": "RPM [5]",
    "eRPM[5]": "RPM [6]",
    "eRPM[6]": "RPM [7]",
    "eRPM[7]": "RPM [8]",

    "servo[all]": "Servos",
    "servo[5]": "Servo Tail",

    vbatLatest: "Battery volt.",
    amperageLatest: "Amperage",
    baroAlt: "Barometer",

    "heading[all]": "Heading",
    "heading[0]": "Heading [roll]",
    "heading[1]": "Heading [pitch]",
    "heading[2]": "Heading [yaw]",

    "accSmooth[all]": "Accel.",
    "accSmooth[0]": "Accel. [X]",
    "accSmooth[1]": "Accel. [Y]",
    "accSmooth[2]": "Accel. [Z]",

    "magADC[all]": "Compass",
    "magADC[0]": "Compass [X]",
    "magADC[1]": "Compass [Y]",
    "magADC[2]": "Compass [Z]",

    flightModeFlags: "Flight Mode Flags",
    stateFlags: "State Flags",
    failsafePhase: "Failsafe Phase",
    rxSignalReceived: "RX Signal Received",
    rxFlightChannelsValid: "RX Flight Ch. Valid",
    rssi: "RSSI",

    GPS_numSat: "GPS Sat Count",
    "GPS_coord[0]": "GPS Latitude",
    "GPS_coord[1]": "GPS Longitude",
    GPS_altitude: "GPS Altitude ASL",
    GPS_speed: "GPS Speed",
    GPS_ground_course: "GPS Heading",

    "GPS_velned[all]": "GPS NED velocities",
    "GPS_velned[0]": "North velocity",
    "GPS_velned[1]": "East velocity",
    "GPS_velned[2]": "Down velocity",

    "gpsCartesianCoords[all]": "GPS Coords",
    "gpsCartesianCoords[0]": "GPS Coords [X]",
    "gpsCartesianCoords[1]": "GPS Coords [Y]",
    "gpsCartesianCoords[2]": "GPS Coords [Z]",
    gpsDistance: "GPS Home distance",
    gpsHomeAzimuth: "GPS Home azimuth",
    gpsTrajectoryTiltAngle: "GPS Traject. tilt angle",
};

FlightLogFieldPresenter.presentFlags = function (flags, flagNames) {
    let printedFlag = false,
        i = 0,
        result = "";

    while (flags > 0) {
        if ((flags & 1) !== 0) {
            if (printedFlag) {
                result += "|";
            } else {
                printedFlag = true;
            }

            result += flagNames[i];
        }

        flags >>= 1;
        i++;
    }

    if (printedFlag) {
        return result;
    } else {
        return "0"; //No flags set
    }
};

// Only list events that have changed, flag with eirer go ON or OFF.
FlightLogFieldPresenter.presentChangeEvent = function presentChangeEvent(flags, lastFlags, flagNames) {
    let eventState = "";
    let found = false;
    const maxModeNumber = 32; // int has 32 bit only! We have not to roll bit shift 1<<i for i values grate then 31 !!!
    let modesCount = flagNames.length;
    if (modesCount > maxModeNumber) {
        modesCount = maxModeNumber;
    }
    for (let i = 0; i < modesCount; i++) {
        if ((1 << i) & (flags ^ lastFlags)) {
            // State Changed
            eventState += `${found ? "|" : ""}${flagNames[i]} ${(1 << i) & flags ? "ON" : "OFF"}`;
            found = true;
        }
    }
    if (!found) {
        eventState += " | ACRO";
    } // Catch the state when all flags are off, which is ACRO of course
    return eventState;
};

FlightLogFieldPresenter.presentEnum = function presentEnum(value, enumNames) {
    if (enumNames[value] === undefined) {
        return value;
    }

    return enumNames[value];
};

/**
 * Function to translate altitudes from the default meters
 * to the user selected measurement unit.
 * @param altitude String: Altitude in meters.
 * @param altitudeUnits Integer: 1 for meters, 2 for feet.
 *
 * @returns String: readable meters in selected unit.
 */

FlightLogFieldPresenter.decodeCorrectAltitude = function (altitude, altitudeUnits) {
    switch (altitudeUnits) {
        case 1: // Keep it in meters.
            return `${altitude.toFixed(2)} m`;
        case 2: // Translate it into feet.
            return `${(altitude * 3.28).toFixed(2)} ft`;
    }
};

// Altitude back convertacion function
FlightLogFieldPresenter.decodeAltitudeLogToChart = function (altitude, altitudeUnits) {
    switch (altitudeUnits) {
        case 1: // Keep it in meters.
            return altitude;
        case 2: // Translate it into feet.
            return altitude * 3.28;
    }
};

/**
 * Attempt to decode the given raw logged value into something more human readable, or return an empty string if
 * no better representation is available.
 *
 * @param flightLog The pointer to FlightLog object
 * @param fieldName Name of the field
 * @param value Value of the field
 */
FlightLogFieldPresenter.decodeFieldToFriendly = function (flightLog, fieldName, value, _currentFlightMode) {
    const { userSettings } = useSettingsStore();
    if (value === undefined) {
        return "";
    }

    const highResolutionScale = flightLog && flightLog.getSysConfig().blackbox_high_resolution > 0 ? 10 : 1;
    const highResolutionAddPrecision = flightLog && flightLog.getSysConfig().blackbox_high_resolution > 0 ? 1 : 0;

    switch (fieldName) {
        case "time":
            return formatTime(value / 1000, true);

        case "gyroADC[0]":
        case "gyroADC[1]":
        case "gyroADC[2]":
        case "gyroUnfilt[0]":
        case "gyroUnfilt[1]":
        case "gyroUnfilt[2]":
            return `${flightLog
                .gyroRawToDegreesPerSecond(value / highResolutionScale)
                .toFixed(highResolutionAddPrecision)} °/s`;

        case "gyroADCs[0]":
        case "gyroADCs[1]":
        case "gyroADCs[2]":
            return `${value.toFixed(0)} °/s`;

        case "axisError[0]":
        case "axisError[1]":
        case "axisError[2]":
            return `${(value / highResolutionScale).toFixed(highResolutionAddPrecision)} °/s`;

        case "rcCommand[0]":
        case "rcCommand[1]":
        case "rcCommand[2]":
            return `${(value / highResolutionScale + 1500).toFixed(highResolutionAddPrecision)} us`;
        case "rcCommand[3]":
            return `${(value / highResolutionScale).toFixed(highResolutionAddPrecision)} us`;

        case "motor[0]":
        case "motor[1]":
        case "motor[2]":
        case "motor[3]":
        case "motor[4]":
        case "motor[5]":
        case "motor[6]":
        case "motor[7]":
            return `${flightLog.rcMotorRawToPctPhysical(value).toFixed(2)} %`;

        case "eRPM[0]":
        case "eRPM[1]":
        case "eRPM[2]":
        case "eRPM[3]":
        case "eRPM[4]":
        case "eRPM[5]":
        case "eRPM[6]":
        case "eRPM[7]": {
            const motor_poles = flightLog.getSysConfig()["motor_poles"];
            return `${((value * 200) / motor_poles).toFixed(0)} rpm / ${((value * 3.333) / motor_poles).toFixed(1)} hz`;
        }
        case "rcCommands[0]":
        case "rcCommands[1]":
        case "rcCommands[2]":
            return `${(value / highResolutionScale).toFixed(highResolutionAddPrecision)} °/s`;
        case "rcCommands[3]":
            return `${value.toFixed(1)}%`;

        case "axisSum[0]":
        case "axisSum[1]":
        case "axisSum[2]":
        case "axisP[0]":
        case "axisP[1]":
        case "axisP[2]":
        case "axisI[0]":
        case "axisI[1]":
        case "axisI[2]":
        case "axisD[0]":
        case "axisD[1]":
        case "axisD[2]":
        case "axisF[0]":
        case "axisF[1]":
        case "axisF[2]":
        case "axisS[0]":
        case "axisS[1]":
        case "axisS[2]":
            return `${flightLog.getPIDPercentage(value).toFixed(1)} %`;

        case "accSmooth[0]":
        case "accSmooth[1]":
        case "accSmooth[2]":
            return `${flightLog.accRawToGs(value).toFixed(2 + highResolutionAddPrecision)} g`;

        case "vbatLatest":
            if (
                flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                semver.gte(flightLog.getSysConfig().firmwareVersion, "4.0.0")
            ) {
                return (
                    `${(value / 100).toFixed(2)}V` +
                    `, ${(value / 100 / flightLog.getNumCellsEstimate()).toFixed(2)} V/cell`
                );
            } else if (
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "3.1.0")) ||
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_CLEANFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "2.0.0"))
            ) {
                return (
                    `${(value / 10).toFixed(2)}V` +
                    `, ${(value / 10 / flightLog.getNumCellsEstimate()).toFixed(2)} V/cell`
                );
            } else {
                return (
                    `${(flightLog.vbatADCToMillivolts(value) / 1000).toFixed(2)}V` +
                    `, ${(flightLog.vbatADCToMillivolts(value) / 1000 / flightLog.getNumCellsEstimate()).toFixed(
                        2,
                    )} V/cell`
                );
            }

        case "amperageLatest":
            if (
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "3.1.7")) ||
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_CLEANFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "2.0.0"))
            ) {
                return (
                    `${(value / 100).toFixed(2)}A` + `, ${(value / 100 / flightLog.getNumMotors()).toFixed(2)} A/motor`
                );
            } else if (
                flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                semver.gte(flightLog.getSysConfig().firmwareVersion, "3.1.0")
            ) {
                return (
                    `${(value / 100).toFixed(2)}A` + `, ${(value / 100 / flightLog.getNumMotors()).toFixed(2)} A/motor`
                );
            } else {
                return (
                    `${(flightLog.amperageADCToMillivolts(value) / 1000).toFixed(2)}A` +
                    `, ${(flightLog.amperageADCToMillivolts(value) / 1000 / flightLog.getNumMotors()).toFixed(
                        2,
                    )} A/motor`
                );
            }

        case "heading[0]":
        case "heading[1]":
        case "heading[2]":
            return `${((value / Math.PI) * 180).toFixed(1)}°`;

        case "baroAlt":
            return FlightLogFieldPresenter.decodeCorrectAltitude(value / 100, userSettings.altitudeUnits);

        case "flightModeFlags":
            return FlightLogFieldPresenter.presentFlags(value, FLIGHT_LOG_FLIGHT_MODE_NAME);

        case "stateFlags":
            return FlightLogFieldPresenter.presentFlags(value, FLIGHT_LOG_FLIGHT_STATE_NAME);

        case "failsafePhase":
            return FlightLogFieldPresenter.presentEnum(value, FLIGHT_LOG_FAILSAFE_PHASE_NAME);

        case "features":
            return FlightLogFieldPresenter.presentEnum(value, FLIGHT_LOG_FEATURES);

        case "rssi":
            return `${((value / 1024) * 100).toFixed(2)} %`;

        //H Field G name:time,GPS_numSat,GPS_coord[0],GPS_coord[1],GPS_altitude,GPS_speed,GPS_ground_course
        case "GPS_numSat":
            return `${value}`;
        case "GPS_coord[0]":
        case "GPS_coord[1]":
            return `${(value / 10000000).toFixed(5)}`;
        case "GPS_altitude":
            return FlightLogFieldPresenter.decodeCorrectAltitude(value / 10, userSettings.altitudeUnits);
        case "GPS_speed":
            switch (userSettings.speedUnits) {
                case 1:
                    return `${(value / 100).toFixed(2)} m/s`;
                case 2:
                    return `${((value / 100) * 3.6).toFixed(2)} kph`;
                case 3:
                    return `${((value / 100) * 2.2369).toFixed(2)} mph`;
                default:
                    return `${(value / 100).toFixed(2)} m/s`;
            }
        case "GPS_ground_course":
            return `${(value / 10).toFixed(1)} °`;

        case "GPS_velned[0]":
        case "GPS_velned[1]":
        case "GPS_velned[2]":
            return `${(value / 100).toFixed(1)} m/s`;

        case "gpsCartesianCoords[0]":
        case "gpsCartesianCoords[1]":
        case "gpsCartesianCoords[2]":
        case "gpsDistance":
            return `${value.toFixed(0)} m`;
        case "gpsHomeAzimuth":
        case "gpsTrajectoryTiltAngle":
            return `${value.toFixed(1)} °`;
        case "magADC[0]":
        case "magADC[1]":
        case "magADC[2]":
            return `${(value / 10).toFixed(1)} °`;

        case "debug[0]":
        case "debug[1]":
        case "debug[2]":
        case "debug[3]":
        case "debug[4]":
        case "debug[5]":
        case "debug[6]":
        case "debug[7]":
            return FlightLogFieldPresenter.decodeDebugFieldToFriendly(flightLog, fieldName, value);

        default:
            return value?.toFixed(0);
    }
};

FlightLogFieldPresenter.decodeDebugFieldToFriendly = function (flightLog, fieldName, value) {
    if (!flightLog) {
        return value.toFixed(0);
    }
    return sharedDecodeDebugFieldToFriendly(
        debugModeNameForLog(flightLog),
        fieldName,
        value,
        debugScaleContext(flightLog),
    );
};

FlightLogFieldPresenter.fieldNameToFriendly = function (fieldName, debugMode, apiVersion) {
    if (debugMode) {
        if (fieldName.includes("debug")) {
            const modes = getDebugModes(apiVersion);
            const fieldNames = getDebugFieldNames(apiVersion);
            const debugModeName = modes[debugMode];
            let debugFields;

            if (debugModeName) {
                debugFields = fieldNames[debugModeName];
            }

            if (!debugFields) {
                if (fieldName === "debug[all]") {
                    return `Debug (${debugModeName || debugMode})`;
                }
                debugFields = fieldNames[modes[0]];
            }

            return debugFields[fieldName] ?? fieldName;
        }
    }
    if (FRIENDLY_FIELD_NAMES[fieldName]) {
        return FRIENDLY_FIELD_NAMES[fieldName];
    }

    return fieldName;
};

/**
 * Attempt to decode fields values from log file to chart units and back.
 *
 * @param flightLog The pointer to FlightLog object
 * @param fieldName Name of the field
 * @param value Value of the field
 * @param toFriendly If true then convert from log file units to charts, else - from charts units to log file
 */
FlightLogFieldPresenter.ConvertFieldValue = function (flightLog, fieldName, toFriendly, value) {
    const { userSettings } = useSettingsStore();
    if (value === undefined) {
        return 0;
    }

    const highResolutionScale = flightLog && flightLog.getSysConfig().blackbox_high_resolution > 0 ? 10 : 1;

    switch (fieldName) {
        case "time":
            return toFriendly ? value / 1000 : value * 1000;

        case "gyroADC[0]":
        case "gyroADC[1]":
        case "gyroADC[2]":
        case "gyroUnfilt[0]":
        case "gyroUnfilt[1]":
        case "gyroUnfilt[2]":
            return toFriendly
                ? flightLog.gyroRawToDegreesPerSecond(value / highResolutionScale)
                : (value * highResolutionScale) / flightLog.gyroRawToDegreesPerSecond(1);

        case "axisError[0]":
        case "axisError[1]":
        case "axisError[2]":
            return toFriendly ? value / highResolutionScale : value * highResolutionScale;

        case "rcCommand[0]":
        case "rcCommand[1]":
        case "rcCommand[2]":
            return toFriendly ? value / highResolutionScale + 1500 : (value - 1500) * highResolutionScale;
        case "rcCommand[3]":
            return toFriendly ? value / highResolutionScale : value * highResolutionScale;

        case "motor[0]":
        case "motor[1]":
        case "motor[2]":
        case "motor[3]":
        case "motor[4]":
        case "motor[5]":
        case "motor[6]":
        case "motor[7]":
            return toFriendly ? flightLog.rcMotorRawToPctPhysical(value) : flightLog.PctPhysicalTorcMotorRaw(value);

        case "eRPM[0]":
        case "eRPM[1]":
        case "eRPM[2]":
        case "eRPM[3]":
        case "eRPM[4]":
        case "eRPM[5]":
        case "eRPM[6]":
        case "eRPM[7]": {
            const motor_poles = flightLog.getSysConfig()["motor_poles"];
            return toFriendly ? (value * 200) / motor_poles : (value * motor_poles) / 200;
        }
        case "axisSum[0]":
        case "axisSum[1]":
        case "axisSum[2]":
        case "axisP[0]":
        case "axisP[1]":
        case "axisP[2]":
        case "axisI[0]":
        case "axisI[1]":
        case "axisI[2]":
        case "axisD[0]":
        case "axisD[1]":
        case "axisD[2]":
        case "axisF[0]":
        case "axisF[1]":
        case "axisF[2]":
        case "axisS[0]":
        case "axisS[1]":
        case "axisS[2]":
            return toFriendly ? flightLog.getPIDPercentage(value) : value / flightLog.getPIDPercentage(1);

        case "accSmooth[0]":
        case "accSmooth[1]":
        case "accSmooth[2]":
            return toFriendly ? flightLog.accRawToGs(value) : value / flightLog.accRawToGs(1);

        case "vbatLatest":
            if (
                flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                semver.gte(flightLog.getSysConfig().firmwareVersion, "4.0.0")
            ) {
                return toFriendly ? value / 100 : value * 100;
            } else if (
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "3.1.0")) ||
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_CLEANFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "2.0.0"))
            ) {
                return toFriendly ? value / 10 : value * 10;
            } else {
                return toFriendly ? value / 1000 : value * 1000;
            }

        case "amperageLatest":
            if (
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "3.1.7")) ||
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_CLEANFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "2.0.0"))
            ) {
                return toFriendly ? value / 100 : value * 100;
            } else if (
                flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                semver.gte(flightLog.getSysConfig().firmwareVersion, "3.1.0")
            ) {
                return toFriendly ? value / 100 : value * 100;
            } else {
                return toFriendly ? value / 1000 : value * 1000;
            }

        case "heading[0]":
        case "heading[1]":
        case "heading[2]":
            return toFriendly ? (value / Math.PI) * 180 : (value * Math.PI) / 180;

        case "baroAlt":
            return toFriendly
                ? FlightLogFieldPresenter.decodeAltitudeLogToChart(value / 100, userSettings.altitudeUnits)
                : (value * 100) / FlightLogFieldPresenter.decodeAltitudeLogToChart(1, userSettings.altitudeUnits);

        case "flightModeFlags":
            return value;

        case "stateFlags":
            return value;

        case "failsafePhase":
            return value;

        case "features":
            return value;

        case "rssi":
            return toFriendly ? (value / 1024) * 100 : (value * 1024) / 100;

        //H Field G name:time,GPS_numSat,GPS_coord[0],GPS_coord[1],GPS_altitude,GPS_speed,GPS_ground_course
        case "GPS_numSat":
            return value;
        case "GPS_coord[0]":
        case "GPS_coord[1]":
            return toFriendly ? value / 10000000 : value * 10000000;
        case "GPS_altitude":
            return toFriendly
                ? FlightLogFieldPresenter.decodeAltitudeLogToChart(value / 10, userSettings.altitudeUnits)
                : (value * 10) / FlightLogFieldPresenter.decodeAltitudeLogToChart(1, userSettings.altitudeUnits);
        case "GPS_speed":
            switch (userSettings.speedUnits) {
                case 1:
                    return toFriendly ? value / 100 : value * 100; // m/s
                case 2:
                    return toFriendly ? (value / 100) * 3.6 : (100 * value) / 3.6; // kph
                case 3:
                    return toFriendly ? (value / 100) * 2.2369 : (value * 100) / 2.2369; //mph
                default:
                    return toFriendly ? value / 100 : value * 100; // m/s
            }
        case "GPS_ground_course":
            return toFriendly ? value / 10 : value * 10;
        case "GPS_velned[0]":
        case "GPS_velned[1]":
        case "GPS_velned[2]":
            return toFriendly ? value / 100 : value * 100;
        case "magADC[0]":
        case "magADC[1]":
        case "magADC[2]":
            return toFriendly ? value / 10 : value * 10;

        case "debug[0]":
        case "debug[1]":
        case "debug[2]":
        case "debug[3]":
        case "debug[4]":
        case "debug[5]":
        case "debug[6]":
        case "debug[7]":
            return FlightLogFieldPresenter.ConvertDebugFieldValue(flightLog, fieldName, toFriendly, value);

        default:
            return value;
    }
};

/**
 * Attempt to decode debug fields values from log file to chart units and back.
 *
 * @param flightLog The pointer to FlightLog object
 * @param fieldName Name of the field
 * @param value Value of the field
 * @param toFriendly If true then convert from log file units to charts, else - from charts units to log file
 */
FlightLogFieldPresenter.ConvertDebugFieldValue = function (flightLog, fieldName, toFriendly, value) {
    if (!flightLog) {
        return value;
    }
    return sharedConvertDebugFieldValue(
        debugModeNameForLog(flightLog),
        fieldName,
        toFriendly,
        value,
        debugScaleContext(flightLog),
    );
};
