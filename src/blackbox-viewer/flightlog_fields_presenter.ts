/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

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
import { useSettingsStore } from "./stores/settings";
import type { FlightLog } from "./flightlog";
import type { UserSettings } from "./user_settings_data";
import {
    type DebugContext,
    type DebugScaleContext,
    getDebugModes,
    getDebugFieldNames,
    debugContextFromSysConfig,
    resolveDebugField,
    decodeDebugFieldToFriendly as sharedDecodeDebugFieldToFriendly,
    convertDebugFieldValue as sharedConvertDebugFieldValue,
} from "../js/utils/debugModes";

/** The FlightLog members the presenter reads. */
export type PresentedFlightLog = Pick<
    FlightLog,
    | "getSysConfig"
    | "accRawToGs"
    | "gyroRawToDegreesPerSecond"
    | "rcCommandRawToThrottle"
    | "ThrottleTorcCommandRaw"
    | "rcMotorRawToPctPhysical"
    | "PctPhysicalTorcMotorRaw"
    | "getPIDPercentage"
    | "getNumCellsEstimate"
    | "getNumMotors"
    | "vbatADCToMillivolts"
    | "amperageADCToMillivolts"
>;

/**
 * What the log itself says about its debug fields, falling back to the
 * API-version keyed tables for a log recorded before firmware said so.
 */
function debugContextForLog(flightLog: PresentedFlightLog): DebugContext {
    return debugContextFromSysConfig(flightLog.getSysConfig());
}

/**
 * Build the hardware-scaling context the shared debug decode/convert helpers
 * need, bound to a parsed FlightLog. Keeps the shared functions free of any
 * FlightLog coupling.
 */
function debugScaleContext(flightLog: PresentedFlightLog): DebugScaleContext {
    const sysConfig = flightLog.getSysConfig();
    return {
        ...debugContextFromSysConfig(sysConfig),
        // The parser always resolves one, defaulting to 1.44
        apiVersion: sysConfig.apiVersion,
        // A pole count the header lacks is null, which the eRPM arithmetic reads as 0, as before.
        motorPoles: sysConfig["motor_poles"] as number,
        accRawToGs: (v) => flightLog.accRawToGs(v),
        gyroRawToDegreesPerSecond: (v) => flightLog.gyroRawToDegreesPerSecond(v),
        rcCommandRawToThrottle: (v) => flightLog.rcCommandRawToThrottle(v),
        throttleToRcCommandRaw: (v) => flightLog.ThrottleTorcCommandRaw(v),
        fftCalcSteps: FFT_CALC_STEPS,
    };
}

const FRIENDLY_FIELD_NAMES: Record<string, string | undefined> = {
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

    "pitot[all]": "Pitot data",
    "pitot[0]": "Airspeed",
    "pitot[1]": "Diff. pressure",
};

/* What to call one debug[n] under the mode the log was recorded in. */
function debugFieldLabel(fieldName: string, ctx: DebugContext): string {
    // The log's own annotation for the slot, where it carries one.
    const logged = resolveDebugField(fieldName, ctx);
    if (logged) {
        return logged.label;
    }

    const fieldNames = getDebugFieldNames(ctx.apiVersion);
    const debugFields = ctx.modeName ? fieldNames[ctx.modeName] : undefined;
    if (debugFields) {
        return debugFields[fieldName] ?? fieldName;
    }
    if (fieldName === "debug[all]") {
        return `Debug (${ctx.modeName || ctx.modeIndex})`;
    }

    // A mode with no table of its own still has the NONE names to fall back on.
    return fieldNames[getDebugModes(ctx.apiVersion)[0]][fieldName] ?? fieldName;
}

/** What the per-field formatters read besides the value. */
interface PresentContext {
    flightLog: PresentedFlightLog;
    fieldName: string;
    /** 10 for a high-resolution log, whose values carry one more decimal; else 1. */
    highResolutionScale: number;
    /** The decimal places that extra digit adds: 1 or 0. */
    highResolutionAddPrecision: number;
    userSettings: UserSettings;
}

function presentContext(flightLog: PresentedFlightLog, fieldName: string, userSettings: UserSettings): PresentContext {
    const highResolution = flightLog && Number(flightLog.getSysConfig().blackbox_high_resolution) > 0;
    return {
        flightLog,
        fieldName,
        highResolutionScale: highResolution ? 10 : 1,
        highResolutionAddPrecision: highResolution ? 1 : 0,
        userSettings,
    };
}

type FieldDecoder = (value: number, context: PresentContext) => string | number | undefined;
/** A field's conversion from log units to chart units, and back. */
interface FieldConverter {
    toFriendly: (value: number, context: PresentContext) => number;
    fromFriendly: (value: number, context: PresentContext) => number;
}

/** A field-name lookup; a Map, so a name such as "toString" finds nothing, as a switch would. */
function fieldTable<F>(entries: [names: string[], handler: F][]): Map<string, F> {
    const table = new Map<string, F>();
    for (const [names, handler] of entries) {
        for (const name of names) {
            table.set(name, handler);
        }
    }
    return table;
}

/** decodeFieldToFriendly() for each field it knows; any other field is shown as a whole number. */
const FIELD_DECODERS = fieldTable<FieldDecoder>([
    [
        ["time"],
        (value) => {
            return formatTime(value / 1000, true);
        },
    ],
    [
        ["gyroADC[0]", "gyroADC[1]", "gyroADC[2]", "gyroUnfilt[0]", "gyroUnfilt[1]", "gyroUnfilt[2]"],
        (value, { flightLog, highResolutionScale, highResolutionAddPrecision }) => {
            return `${flightLog
                .gyroRawToDegreesPerSecond(value / highResolutionScale)
                .toFixed(highResolutionAddPrecision)} °/s`;
        },
    ],
    [
        ["gyroADCs[0]", "gyroADCs[1]", "gyroADCs[2]"],
        (value) => {
            return `${value.toFixed(0)} °/s`;
        },
    ],
    [
        ["axisError[0]", "axisError[1]", "axisError[2]"],
        (value, { highResolutionScale, highResolutionAddPrecision }) => {
            return `${(value / highResolutionScale).toFixed(highResolutionAddPrecision)} °/s`;
        },
    ],
    [
        ["rcCommand[0]", "rcCommand[1]", "rcCommand[2]"],
        (value, { highResolutionScale, highResolutionAddPrecision }) => {
            return `${(value / highResolutionScale + 1500).toFixed(highResolutionAddPrecision)} us`;
        },
    ],
    [
        ["rcCommand[3]"],
        (value, { highResolutionScale, highResolutionAddPrecision }) => {
            return `${(value / highResolutionScale).toFixed(highResolutionAddPrecision)} us`;
        },
    ],
    [
        ["motor[0]", "motor[1]", "motor[2]", "motor[3]", "motor[4]", "motor[5]", "motor[6]", "motor[7]"],
        (value, { flightLog }) => {
            return `${flightLog.rcMotorRawToPctPhysical(value).toFixed(2)} %`;
        },
    ],
    [
        ["eRPM[0]", "eRPM[1]", "eRPM[2]", "eRPM[3]", "eRPM[4]", "eRPM[5]", "eRPM[6]", "eRPM[7]"],
        (value, { flightLog }) => {
            const motor_poles = Number(flightLog.getSysConfig()["motor_poles"]);
            return `${((value * 200) / motor_poles).toFixed(0)} rpm / ${((value * 3.333) / motor_poles).toFixed(1)} hz`;
        },
    ],
    [
        ["rcCommands[0]", "rcCommands[1]", "rcCommands[2]"],
        (value, { highResolutionScale, highResolutionAddPrecision }) => {
            return `${(value / highResolutionScale).toFixed(highResolutionAddPrecision)} °/s`;
        },
    ],
    [
        ["rcCommands[3]"],
        (value) => {
            return `${value.toFixed(1)}%`;
        },
    ],
    [
        [
            "axisSum[0]",
            "axisSum[1]",
            "axisSum[2]",
            "axisP[0]",
            "axisP[1]",
            "axisP[2]",
            "axisI[0]",
            "axisI[1]",
            "axisI[2]",
            "axisD[0]",
            "axisD[1]",
            "axisD[2]",
            "axisF[0]",
            "axisF[1]",
            "axisF[2]",
            "axisS[0]",
            "axisS[1]",
            "axisS[2]",
        ],
        (value, { flightLog }) => {
            return `${flightLog.getPIDPercentage(value).toFixed(1)} %`;
        },
    ],
    [
        ["accSmooth[0]", "accSmooth[1]", "accSmooth[2]"],
        (value, { flightLog, highResolutionAddPrecision }) => {
            return `${flightLog.accRawToGs(value).toFixed(2 + highResolutionAddPrecision)} g`;
        },
    ],
    [
        ["vbatLatest"],
        (value, { flightLog }) => {
            if (
                flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                semver.gte(flightLog.getSysConfig().firmwareVersion, "4.0.0")
            ) {
                return (
                    `${(value / 100).toFixed(2)}V` +
                    `, ${(value / 100 / Number(flightLog.getNumCellsEstimate())).toFixed(2)} V/cell`
                );
            } else if (
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "3.1.0")) ||
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_CLEANFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "2.0.0"))
            ) {
                return (
                    `${(value / 10).toFixed(2)}V` +
                    `, ${(value / 10 / Number(flightLog.getNumCellsEstimate())).toFixed(2)} V/cell`
                );
            } else {
                return (
                    `${(flightLog.vbatADCToMillivolts(value) / 1000).toFixed(2)}V` +
                    `, ${(
                        flightLog.vbatADCToMillivolts(value) /
                        1000 /
                        Number(flightLog.getNumCellsEstimate())
                    ).toFixed(2)} V/cell`
                );
            }
        },
    ],
    [
        ["amperageLatest"],
        (value, { flightLog }) => {
            // Betaflight 3.1.0+ and Cleanflight 2.0.0+ log centiamps (3.1.7+ is a subset of the first).
            if (
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "3.1.0")) ||
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_CLEANFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "2.0.0"))
            ) {
                return (
                    `${(value / 100).toFixed(2)}A` +
                    `, ${(value / 100 / Number(flightLog.getNumMotors())).toFixed(2)} A/motor`
                );
            } else {
                return (
                    `${(flightLog.amperageADCToMillivolts(value) / 1000).toFixed(2)}A` +
                    `, ${(flightLog.amperageADCToMillivolts(value) / 1000 / Number(flightLog.getNumMotors())).toFixed(
                        2,
                    )} A/motor`
                );
            }
        },
    ],
    [
        ["heading[0]", "heading[1]", "heading[2]"],
        (value) => {
            return `${((value / Math.PI) * 180).toFixed(1)}°`;
        },
    ],
    [
        ["baroAlt"],
        (value, { userSettings }) => {
            return FlightLogFieldPresenter.decodeCorrectAltitude(value / 100, userSettings.altitudeUnits);
        },
    ],
    [
        ["flightModeFlags"],
        (value) => {
            return FlightLogFieldPresenter.presentFlags(value, FLIGHT_LOG_FLIGHT_MODE_NAME);
        },
    ],
    [
        ["stateFlags"],
        (value) => {
            return FlightLogFieldPresenter.presentFlags(value, FLIGHT_LOG_FLIGHT_STATE_NAME);
        },
    ],
    [
        ["failsafePhase"],
        (value) => {
            return FlightLogFieldPresenter.presentEnum(value, FLIGHT_LOG_FAILSAFE_PHASE_NAME);
        },
    ],
    [
        ["features"],
        (value) => {
            return FlightLogFieldPresenter.presentEnum(value, FLIGHT_LOG_FEATURES);
        },
    ],
    [
        ["rssi"],
        (value) => {
            return `${((value / 1024) * 100).toFixed(2)} %`;
        },
    ],
    [
        ["GPS_numSat"],
        (value) => {
            return `${value}`;
        },
    ],
    [
        ["GPS_coord[0]", "GPS_coord[1]"],
        (value) => {
            return `${(value / 10000000).toFixed(5)}`;
        },
    ],
    [
        ["GPS_altitude"],
        (value, { userSettings }) => {
            return FlightLogFieldPresenter.decodeCorrectAltitude(value / 10, userSettings.altitudeUnits);
        },
    ],
    [
        ["GPS_speed"],
        (value, { userSettings }) => {
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
        },
    ],
    [
        ["GPS_ground_course"],
        (value) => {
            return `${(value / 10).toFixed(1)} °`;
        },
    ],
    [
        ["GPS_velned[0]", "GPS_velned[1]", "GPS_velned[2]"],
        (value) => {
            return `${(value / 100).toFixed(1)} m/s`;
        },
    ],
    [
        ["gpsCartesianCoords[0]", "gpsCartesianCoords[1]", "gpsCartesianCoords[2]", "gpsDistance"],
        (value) => {
            return `${value.toFixed(0)} m`;
        },
    ],
    [
        ["gpsHomeAzimuth", "gpsTrajectoryTiltAngle"],
        (value) => {
            return `${value.toFixed(1)} °`;
        },
    ],
    [
        ["magADC[0]", "magADC[1]", "magADC[2]"],
        (value) => {
            return `${(value / 10).toFixed(1)} °`;
        },
    ],
    [
        ["pitot[0]"],
        (value) => {
            return `${(value / 100).toFixed(1)} m/s`;
        },
    ],
    [
        ["pitot[1]"],
        (value) => {
            return `${value.toFixed(1)} Pa`;
        },
    ],
    [
        ["debug[0]", "debug[1]", "debug[2]", "debug[3]", "debug[4]", "debug[5]", "debug[6]", "debug[7]"],
        (value, { flightLog, fieldName }) => {
            return FlightLogFieldPresenter.decodeDebugFieldToFriendly(flightLog, fieldName, value);
        },
    ],
]);

/** The motor pole count for eRPM; a missing one is null, which the arithmetic reads as 0, as before. */
function motorPoles(flightLog: PresentedFlightLog): number {
    return Number(flightLog.getSysConfig()["motor_poles"]);
}

function isFirmwareFrom(flightLog: PresentedFlightLog, firmwareType: number, version: string): boolean {
    return (
        flightLog.getSysConfig().firmwareType === firmwareType &&
        semver.gte(flightLog.getSysConfig().firmwareVersion, version)
    );
}

/** What vbatLatest is divided by for volts: centivolts from Betaflight 4.0, decivolts from 3.1 or Cleanflight 2.0, else millivolts. */
function vbatDivisor(flightLog: PresentedFlightLog): number {
    if (isFirmwareFrom(flightLog, FIRMWARE_TYPE_BETAFLIGHT, "4.0.0")) {
        return 100;
    }
    if (
        isFirmwareFrom(flightLog, FIRMWARE_TYPE_BETAFLIGHT, "3.1.0") ||
        isFirmwareFrom(flightLog, FIRMWARE_TYPE_CLEANFLIGHT, "2.0.0")
    ) {
        return 10;
    }
    return 1000;
}

/** What amperageLatest is divided by for amps: centiamps from Betaflight 3.1.0 (3.1.7+ is a subset) or Cleanflight 2.0, else milliamps. */
function amperageDivisor(flightLog: PresentedFlightLog): number {
    const centiamps =
        isFirmwareFrom(flightLog, FIRMWARE_TYPE_BETAFLIGHT, "3.1.0") ||
        isFirmwareFrom(flightLog, FIRMWARE_TYPE_CLEANFLIGHT, "2.0.0");
    return centiamps ? 100 : 1000;
}

/** The logged cm/s in m/s, times this: 3.6 for kph, 2.2369 for mph, 1 for m/s and any other setting. */
function speedFactor(speedUnits: number): number {
    switch (speedUnits) {
        case 2:
            return 3.6;
        case 3:
            return 2.2369;
        default:
            return 1;
    }
}

/** ConvertFieldValue() for each field it scales; any other field (flags, enums, counts) is passed through. */
const FIELD_CONVERTERS = fieldTable<FieldConverter>([
    [
        ["time"],
        {
            toFriendly: (value) => value / 1000,
            fromFriendly: (value) => value * 1000,
        },
    ],
    [
        ["gyroADC[0]", "gyroADC[1]", "gyroADC[2]", "gyroUnfilt[0]", "gyroUnfilt[1]", "gyroUnfilt[2]"],
        {
            toFriendly: (value, { flightLog, highResolutionScale }) =>
                flightLog.gyroRawToDegreesPerSecond(value / highResolutionScale),
            fromFriendly: (value, { flightLog, highResolutionScale }) =>
                (value * highResolutionScale) / flightLog.gyroRawToDegreesPerSecond(1),
        },
    ],
    [
        ["axisError[0]", "axisError[1]", "axisError[2]"],
        {
            toFriendly: (value, { highResolutionScale }) => value / highResolutionScale,
            fromFriendly: (value, { highResolutionScale }) => value * highResolutionScale,
        },
    ],
    [
        ["rcCommand[0]", "rcCommand[1]", "rcCommand[2]"],
        {
            toFriendly: (value, { highResolutionScale }) => value / highResolutionScale + 1500,
            fromFriendly: (value, { highResolutionScale }) => (value - 1500) * highResolutionScale,
        },
    ],
    [
        ["rcCommand[3]"],
        {
            toFriendly: (value, { highResolutionScale }) => value / highResolutionScale,
            fromFriendly: (value, { highResolutionScale }) => value * highResolutionScale,
        },
    ],
    [
        ["motor[0]", "motor[1]", "motor[2]", "motor[3]", "motor[4]", "motor[5]", "motor[6]", "motor[7]"],
        {
            toFriendly: (value, { flightLog }) => flightLog.rcMotorRawToPctPhysical(value),
            fromFriendly: (value, { flightLog }) => flightLog.PctPhysicalTorcMotorRaw(value),
        },
    ],
    [
        ["eRPM[0]", "eRPM[1]", "eRPM[2]", "eRPM[3]", "eRPM[4]", "eRPM[5]", "eRPM[6]", "eRPM[7]"],
        {
            toFriendly: (value, { flightLog }) => (value * 200) / motorPoles(flightLog),
            fromFriendly: (value, { flightLog }) => (value * motorPoles(flightLog)) / 200,
        },
    ],
    [
        [
            "axisSum[0]",
            "axisSum[1]",
            "axisSum[2]",
            "axisP[0]",
            "axisP[1]",
            "axisP[2]",
            "axisI[0]",
            "axisI[1]",
            "axisI[2]",
            "axisD[0]",
            "axisD[1]",
            "axisD[2]",
            "axisF[0]",
            "axisF[1]",
            "axisF[2]",
            "axisS[0]",
            "axisS[1]",
            "axisS[2]",
        ],
        {
            toFriendly: (value, { flightLog }) => flightLog.getPIDPercentage(value),
            fromFriendly: (value, { flightLog }) => value / flightLog.getPIDPercentage(1),
        },
    ],
    [
        ["accSmooth[0]", "accSmooth[1]", "accSmooth[2]"],
        {
            toFriendly: (value, { flightLog }) => flightLog.accRawToGs(value),
            fromFriendly: (value, { flightLog }) => value / flightLog.accRawToGs(1),
        },
    ],
    [
        ["vbatLatest"],
        {
            toFriendly: (value, { flightLog }) => value / vbatDivisor(flightLog),
            fromFriendly: (value, { flightLog }) => value * vbatDivisor(flightLog),
        },
    ],
    [
        ["amperageLatest"],
        {
            toFriendly: (value, { flightLog }) => value / amperageDivisor(flightLog),
            fromFriendly: (value, { flightLog }) => value * amperageDivisor(flightLog),
        },
    ],
    [
        ["heading[0]", "heading[1]", "heading[2]"],
        {
            toFriendly: (value) => (value / Math.PI) * 180,
            fromFriendly: (value) => (value * Math.PI) / 180,
        },
    ],
    [
        ["baroAlt"],
        {
            toFriendly: (value, { userSettings }) =>
                Number(FlightLogFieldPresenter.decodeAltitudeLogToChart(value / 100, userSettings.altitudeUnits)),
            fromFriendly: (value, { userSettings }) =>
                (value * 100) / Number(FlightLogFieldPresenter.decodeAltitudeLogToChart(1, userSettings.altitudeUnits)),
        },
    ],
    [
        ["rssi"],
        {
            toFriendly: (value) => (value / 1024) * 100,
            fromFriendly: (value) => (value * 1024) / 100,
        },
    ],
    [
        ["GPS_coord[0]", "GPS_coord[1]"],
        {
            toFriendly: (value) => value / 10000000,
            fromFriendly: (value) => value * 10000000,
        },
    ],
    [
        ["GPS_altitude"],
        {
            toFriendly: (value, { userSettings }) =>
                Number(FlightLogFieldPresenter.decodeAltitudeLogToChart(value / 10, userSettings.altitudeUnits)),
            fromFriendly: (value, { userSettings }) =>
                (value * 10) / Number(FlightLogFieldPresenter.decodeAltitudeLogToChart(1, userSettings.altitudeUnits)),
        },
    ],
    [
        ["GPS_speed"],
        {
            toFriendly: (value, { userSettings }) => (value / 100) * speedFactor(userSettings.speedUnits),
            fromFriendly: (value, { userSettings }) => (value * 100) / speedFactor(userSettings.speedUnits),
        },
    ],
    [
        ["GPS_ground_course"],
        {
            toFriendly: (value) => value / 10,
            fromFriendly: (value) => value * 10,
        },
    ],
    [
        ["GPS_velned[0]", "GPS_velned[1]", "GPS_velned[2]"],
        {
            toFriendly: (value) => value / 100,
            fromFriendly: (value) => value * 100,
        },
    ],
    [
        ["magADC[0]", "magADC[1]", "magADC[2]"],
        {
            toFriendly: (value) => value / 10,
            fromFriendly: (value) => value * 10,
        },
    ],
    [
        ["pitot[0]"],
        {
            toFriendly: (value) => value / 100,
            fromFriendly: (value) => value * 100,
        },
    ],
    [
        ["debug[0]", "debug[1]", "debug[2]", "debug[3]", "debug[4]", "debug[5]", "debug[6]", "debug[7]"],
        {
            toFriendly: (value, { flightLog, fieldName }) =>
                FlightLogFieldPresenter.ConvertDebugFieldValue(flightLog, fieldName, true, value),
            fromFriendly: (value, { flightLog, fieldName }) =>
                FlightLogFieldPresenter.ConvertDebugFieldValue(flightLog, fieldName, false, value),
        },
    ],
]);

export class FlightLogFieldPresenter {
    static presentFlags(flags: number, flagNames: ArrayLike<string>): string {
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

            // `>>>` and not `>>`: a signed shift coerces to int32, so a set bit 31
            // would turn the value negative and end the loop, hiding the rest.
            flags >>>= 1;
            i++;
        }

        if (printedFlag) {
            return result;
        } else {
            return "0"; //No flags set
        }
    }

    // Only list events that have changed, flag with eirer go ON or OFF.
    static presentChangeEvent(flags: number, lastFlags: number, flagNames: ArrayLike<string>): string {
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
    }

    static presentEnum(value: number, enumNames: ArrayLike<string>): string | number {
        if (enumNames[value] === undefined) {
            return value;
        }

        return enumNames[value];
    }

    /**
     * Function to translate altitudes from the default meters
     * to the user selected measurement unit.
     * @param altitude String: Altitude in meters.
     * @param altitudeUnits Integer: 1 for meters, 2 for feet.
     *
     * @returns String: readable meters in selected unit.
     */

    static decodeCorrectAltitude(altitude: number, altitudeUnits: number): string | undefined {
        switch (altitudeUnits) {
            case 1: // Keep it in meters.
                return `${altitude.toFixed(2)} m`;
            case 2: // Translate it into feet.
                return `${(altitude * 3.28).toFixed(2)} ft`;
        }
    }

    // Altitude back convertacion function
    static decodeAltitudeLogToChart(altitude: number, altitudeUnits: number): number | undefined {
        switch (altitudeUnits) {
            case 1: // Keep it in meters.
                return altitude;
            case 2: // Translate it into feet.
                return altitude * 3.28;
        }
    }

    /**
     * Attempt to decode the given raw logged value into something more human readable, or return an empty string if
     * no better representation is available.
     *
     * @param flightLog The pointer to FlightLog object
     * @param fieldName Name of the field
     * @param value Value of the field
     */
    static decodeFieldToFriendly(
        flightLog: PresentedFlightLog,
        fieldName: string,
        rawValue: number | null | undefined,
        _currentFlightMode?: unknown,
    ): string | number | undefined {
        const { userSettings } = useSettingsStore();
        if (rawValue === undefined) {
            return "";
        }
        // A slow or GPS slot is null until its first frame. The arithmetic below reads that as 0,
        // and the branches that call toFixed() directly are for fields that are never null, so the
        // value is typed as the number each branch treats it as. Nothing is converted.
        const value = rawValue as number;

        const context = presentContext(flightLog, fieldName, userSettings);

        const decode = FIELD_DECODERS.get(fieldName);
        return decode ? decode(value, context) : value?.toFixed(0);
    }

    static decodeDebugFieldToFriendly(
        flightLog: PresentedFlightLog | null | undefined,
        fieldName: string,
        value: number,
    ): string {
        if (!flightLog) {
            return value.toFixed(0);
        }
        return sharedDecodeDebugFieldToFriendly(
            debugContextForLog(flightLog).modeName,
            fieldName,
            value,
            debugScaleContext(flightLog),
        );
    }

    static fieldNameToFriendly(fieldName: string, ctx?: DebugContext | null): string {
        // Mode 0 is NONE, which has names of its own, so the index is compared
        // against null rather than tested for truth.
        if (ctx?.modeIndex != null && fieldName.includes("debug")) {
            return debugFieldLabel(fieldName, ctx);
        }
        const friendly = FRIENDLY_FIELD_NAMES[fieldName];
        if (friendly) {
            return friendly;
        }

        return fieldName;
    }

    /**
     * Attempt to decode fields values from log file to chart units and back.
     *
     * @param flightLog The pointer to FlightLog object
     * @param fieldName Name of the field
     * @param value Value of the field
     * @param toFriendly If true then convert from log file units to charts, else - from charts units to log file
     */
    // The toFriendly flag (Sonar S2301) is the API of its 12 JavaScript call sites, in grapher.js and
    // graph_config.js (batch F of #5542); each field's conversion is a toFriendly/fromFriendly pair.
    static ConvertFieldValue(
        flightLog: PresentedFlightLog,
        fieldName: string,
        toFriendly: boolean, // NOSONAR
        rawValue: number | null | undefined,
    ): number {
        const { userSettings } = useSettingsStore();
        if (rawValue === undefined) {
            return 0;
        }
        // As in decodeFieldToFriendly(): a null slot goes through the arithmetic as 0, or comes back
        // unchanged from the branches that return the value as it is.
        const value = rawValue as number;

        const context = presentContext(flightLog, fieldName, userSettings);

        const convert = FIELD_CONVERTERS.get(fieldName);
        if (!convert) {
            return value;
        }
        return toFriendly ? convert.toFriendly(value, context) : convert.fromFriendly(value, context);
    }

    /**
     * Attempt to decode debug fields values from log file to chart units and back.
     *
     * @param flightLog The pointer to FlightLog object
     * @param fieldName Name of the field
     * @param value Value of the field
     * @param toFriendly If true then convert from log file units to charts, else - from charts units to log file
     */
    static ConvertDebugFieldValue(
        flightLog: PresentedFlightLog | null | undefined,
        fieldName: string,
        toFriendly: boolean,
        value: number,
    ): number {
        if (!flightLog) {
            return value;
        }
        return sharedConvertDebugFieldValue(
            debugContextForLog(flightLog).modeName,
            fieldName,
            toFriendly,
            value,
            debugScaleContext(flightLog),
        );
    }
}
