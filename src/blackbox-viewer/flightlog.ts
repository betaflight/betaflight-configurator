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
import { FlightLogIndex, type IntraframeDirectory } from "./flightlog_index";
import {
    FlightLogParser,
    type FieldStats,
    type FrameReadyHandler,
    type LogEvent,
    type ParserStats,
    type SysConfig,
} from "./flightlog_parser";
import { GpsTransform } from "./gps_transform";
import {
    MAX_MOTOR_NUMBER,
    DSHOT_MIN_VALUE,
    DSHOT_RANGE,
    FlightLogEvent,
    AXIS,
    FAST_PROTOCOL,
    SUPER_EXPO_YAW,
    FIRMWARE_TYPE_BETAFLIGHT,
    FIRMWARE_TYPE_CLEANFLIGHT,
} from "./flightlog_fielddefs";
import { IMU, type Attitude } from "./imu";
import { FIFOCache } from "./cache";
import { binarySearchOrPrevious, binarySearchOrNext, constrain, validate, firmwareGreaterOrEqual } from "./tools";

const WARNING_RATE_DIFFERENCE = 0.05;

/*
 * Double check that the indexes of each chunk in the array are in increasing order (bugcheck).
 */
/**
 * A main frame as FlightLog serves it: the log's I/P fields, then the slow and GPS fields last
 * seen (null before the first one), then the computed fields.
 */
export type LogFrame = [loopIteration: number, time: number, ...fields: (number | null)[]];

/** A run of frames between two index entries (every 4th I-frame). */
export interface Chunk {
    index: number;
    frames: LogFrame[];
    /** Frame indexes after which the data has a gap (a corrupt frame or a logging pause). */
    gapStartsHere: Record<number, boolean>;
    events: LogEvent[];
    initialIMU?: IMU;
    initialGPSHome?: number[] | null;
    hasAdditionalFields?: boolean;
    needsEventTimes?: boolean;
}

/** Which field groups the log's `fields_disabled_mask` turns off. */
export interface DisabledFields {
    PID?: boolean;
    RC_COMMANDS?: boolean;
    SETPOINT?: boolean;
    BATTERY?: boolean;
    MAGNETOMETER?: boolean;
    ALTITUDE?: boolean;
    RSSI?: boolean;
    GYRO?: boolean;
    ATTITUDE?: boolean;
    ACC?: boolean;
    DEBUG?: boolean;
    MOTORS?: boolean;
    GPS?: boolean;
    RPM?: boolean;
    GYROUNFILT?: boolean;
    SERVO?: boolean;
    PITOT?: boolean;
}

/** The parser's stats, plus the merged `field` ranges getStats() adds. */
export type LogStats = ParserStats & { field: FieldStats[] };

export interface FieldRange {
    min: number;
    max: number;
}

/** Field indexes resolved once per injectComputedFields() call; `false` where the log lacks the field. */
interface ComputedFieldContext {
    gyroADC: (number | undefined)[] | false;
    accSmooth: (number | undefined)[] | false;
    magADC: (number | undefined)[] | false;
    imuQuaternion: (number | undefined)[] | false;
    rcCommand: (number | undefined)[] | false;
    setpoint: (number | undefined)[] | false;
    gpsCoord: (number | undefined)[] | false;
    gpsVelNED: (number | undefined)[] | false;
    axisPID: (number | undefined)[][] | false;
    numSatIndex: number | undefined;
    flightModeFlagsIndex: number | undefined;
    sysConfig: SysConfig;
    disabledFields: DisabledFields;
}

/** A linear map applied to one main frame field as it is loaded. */
interface FieldRescale {
    index: number;
    gain: number;
    offset: number;
}

/**
 * Logs with an `rc_command_scale` header carry rcCommand as roll/pitch/yaw -1..1 and throttle 0..1 times
 * that scale. Everything here reads rcCommand in the units logged before it: roll/pitch/yaw -500..500 and
 * throttle 1000..2000, both times the high resolution scale.
 */
function legacyRcCommandRescale(sysConfig: SysConfig, nameToIndex: Record<string, number>): FieldRescale[] {
    const scale = Number(sysConfig.rc_command_scale);
    if (!(scale > 0)) {
        return [];
    }
    const highResolutionScale = Number(sysConfig.blackbox_high_resolution) > 0 ? 10 : 1;
    const rescale: FieldRescale[] = [];
    for (let axis = 0; axis < 4; axis++) {
        const index = nameToIndex[`rcCommand[${axis}]`];
        if (index !== undefined) {
            rescale.push(
                axis === AXIS.YAW + 1
                    ? { index, gain: 1000 / scale, offset: 1000 * highResolutionScale }
                    : { index, gain: 500 / scale, offset: 0 },
            );
        }
    }
    return rescale;
}

/** frame[index], where `index` is undefined for a field the log does not have. */
function fieldAt(frame: LogFrame, index: number | undefined): number | null | undefined {
    return frame[index as number];
}

/**
 * A frame value as the arithmetic below has always read it: a slow or GPS slot still null counts
 * as 0, and a field the log does not have as NaN. Number() is the coercion `+`, `/` and `>` applied.
 */
function fieldNumber(frame: LogFrame, index: number | undefined): number {
    return Number(fieldAt(frame, index));
}

function verifyChunkIndexes(_chunks: Chunk[]) {
    // Uncomment for debugging...
}

/**
 * Uses a FlightLogParser to provide on-demand parsing (and caching) of the flight data log.
 *
 * An index is computed to allow efficient seeking.
 *
 * Multiple disparate frame types in the original log are aligned and merged together to provide one time series.
 * Additional computed fields are derived from the original data set and added as new fields in the resulting data.
 * Window based smoothing of fields is offered.
 */
/** Give the events at the end of `chunk` that have no time yet the time `nextTime`. */
function fillTrailingEventTimes(chunk: Chunk, nextTime: number): void {
    for (let j = chunk.events.length - 1; j >= 0; j--) {
        if (chunk.events[j].time !== undefined) {
            // All events with missing timestamps should appear at the end of the chunk, so we're done
            return;
        }
        chunk.events[j].time = nextTime;
    }
}

/** Copy `source` into slot `j` of `frames`, on top of the recycled array there if there is one. */
function copyFrameInto(frames: LogFrame[], j: number, source: LogFrame): void {
    const target = frames[j];
    if (target) {
        //Copy on top of the recycled array:
        target.length = source.length;

        for (let k = 0; k < source.length; k++) {
            target[k] = source[k];
        }
    } else {
        //Allocate a new copy of the raw array:
        frames[j] = source.slice(0) as LogFrame;
    }
}

const TIME = FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME;

/** A frame position: chunk index into the source chunks, frame index within it. */
interface Cursor {
    chunk: number;
    frame: number;
}

/** One smoothing call's chunks: the source, the copies being smoothed, and which copies were cached. */
interface SmoothingPass {
    sourceChunks: Chunk[];
    resultChunks: Chunk[];
    chunkAlreadyDone: boolean[];
    leadingROChunks: number;
    trailingROChunks: number;
}

/** The moving window over one partition: its edges, its sum and count, and where the partition ends. */
interface SmoothingWindow {
    left: Cursor;
    right: Cursor;
    /** Exclusive: the partition doesn't contain the value at `end`. */
    end: Cursor;
    partitionEnded: boolean;
    accumulator: number;
    valuesInHistory: number;
}

function frameAt(pass: SmoothingPass, at: Cursor): LogFrame {
    return pass.sourceChunks[at.chunk].frames[at.frame];
}

/**
 * The center may not be the left edge of a partition: we may just have skipped the previous chunk
 * because it was cached. If so, the window starts further left, so the main loop reads those
 * earlier values to prime it.
 */
function primeLeft(pass: SmoothingPass, center: Cursor, earliestTime: number): Cursor {
    const left = { ...center };
    while (left.frame > 0 || (left.frame === 0 && left.chunk > 0)) {
        const old = { ...left };

        //Try moving it left
        if (left.frame === 0) {
            left.chunk--;
            left.frame = pass.sourceChunks[left.chunk].frames.length - 1;
        } else {
            left.frame--;
        }

        if (pass.sourceChunks[left.chunk].gapStartsHere[left.frame] || frameAt(pass, left)[TIME] < earliestTime) {
            //We moved the left index one step too far, shift it back
            return old;
        }
    }
    return left;
}

/** Old values fall out of the window. */
function dropOld(pass: SmoothingPass, window: SmoothingWindow, fieldIndex: number, earliestTime: number): void {
    const left = window.left;
    while (frameAt(pass, left)[TIME] < earliestTime) {
        window.accumulator -= fieldNumber(frameAt(pass, left), fieldIndex);
        window.valuesInHistory--;

        left.frame++;
        if (left.frame === pass.sourceChunks[left.chunk].frames.length) {
            left.frame = 0;
            left.chunk++;
        }
    }
}

/** New values are added to the window, up to a discontinuity or the end of the region. */
function addNew(pass: SmoothingPass, window: SmoothingWindow, fieldIndex: number, latestTime: number): void {
    const right = window.right;
    while (!window.partitionEnded && frameAt(pass, right)[TIME] <= latestTime) {
        window.accumulator += fieldNumber(frameAt(pass, right), fieldIndex);
        window.valuesInHistory++;

        //If there is a discontinuity after this point, stop trying to add further values
        if (pass.sourceChunks[right.chunk].gapStartsHere[right.frame]) {
            window.partitionEnded = true;
        }

        //Advance the right index onward since we read a value
        right.frame++;
        if (right.frame === pass.sourceChunks[right.chunk].frames.length) {
            right.frame = 0;
            right.chunk++;

            if (right.chunk === pass.sourceChunks.length) {
                //We reached the end of the region of interest!
                window.partitionEnded = true;
            }
        }

        if (window.partitionEnded) {
            //Let the center-storing loop know not to advance the center to this position:
            window.end = { ...right };
        }
    }
}

/**
 * Advance the center to the next frame. "skipChunk" when that enters a chunk that is already
 * smoothed, "done" when it leaves the region to smooth.
 */
function advanceCenter(pass: SmoothingPass, center: Cursor): "next" | "skipChunk" | "done" {
    center.frame++;
    if (center.frame === pass.sourceChunks[center.chunk].frames.length) {
        center.frame = 0;
        center.chunk++;

        //Is the next chunk already cached? Then we have nothing to write into there
        if (pass.chunkAlreadyDone[center.chunk]) {
            return "skipChunk";
        }

        //Have we covered the whole ROI?
        if (center.chunk === pass.sourceChunks.length - pass.trailingROChunks) {
            return "done";
        }
    }
    return "next";
}

/**
 * Smooth one partition, starting at `center`: march the window along until a discontinuity or the
 * end of the region, writing each average into the result. Returns why it stopped.
 */
function smoothPartition(
    pass: SmoothingPass,
    fieldIndex: number,
    radius: number,
    center: Cursor,
): "partition" | "skipChunk" | "done" {
    const lastChunk = pass.sourceChunks.length - 1 - pass.trailingROChunks;
    let centerTime = frameAt(pass, center)[TIME];
    const left = primeLeft(pass, center, centerTime - radius);
    const window: SmoothingWindow = {
        left,
        right: { ...left },
        // We'll refine this guess for the end of the partition later if we find discontinuities:
        end: { chunk: lastChunk, frame: pass.sourceChunks[lastChunk].frames.length },
        partitionEnded: false,
        accumulator: 0,
        valuesInHistory: 0,
    };

    //The main loop, where we march our smoothing window along until we exhaust this partition
    while (center.chunk < window.end.chunk || (center.chunk === window.end.chunk && center.frame < window.end.frame)) {
        dropOld(pass, window, fieldIndex, centerTime - radius);
        addNew(pass, window, fieldIndex, centerTime + radius);

        // Store the average of the history window into the frame in the center of the window
        pass.resultChunks[center.chunk - pass.leadingROChunks].frames[center.frame][fieldIndex] = Math.round(
            window.accumulator / window.valuesInHistory,
        );

        // Advance the center so we can start computing the next value
        const step = advanceCenter(pass, center);
        if (step !== "next") {
            return step;
        }

        centerTime = frameAt(pass, center)[TIME];
    }
    return "partition";
}

/** Smooth one field over every chunk of the pass that is not cached already. */
function smoothField(pass: SmoothingPass, fieldIndex: number, radius: number): void {
    //The position we're currently computing the smoothed value for. Don't bother to smooth the
    //first and last source chunks, since we can't smooth them completely.
    const center: Cursor = { chunk: pass.leadingROChunks, frame: 0 };
    for (; center.chunk < pass.sourceChunks.length - pass.trailingROChunks; center.chunk++) {
        if (pass.chunkAlreadyDone[center.chunk]) {
            continue;
        }

        //Each partition begins where the last one ended; a skipped chunk moves on to the next.
        for (center.frame = 0; center.frame < pass.sourceChunks[center.chunk].frames.length;) {
            const stop = smoothPartition(pass, fieldIndex, radius, center);
            if (stop === "skipChunk") {
                break;
            }
            if (stop === "done") {
                return;
            }
        }
    }
}

/*
 * The rcCommandRawToDegreesPerSecond() curves are Betaflight version specific, due to the coding
 * improvements from v2.8.0 onwards. Header values are read through Number(), the coercion the
 * arithmetic applied to a missing (null) one.
 */

/** Betaflight 3.0+ / Cleanflight 2.0+: the setpoint rate curve. */
function setpointRate(sysConfig: SysConfig, axis: number, rc: number): number {
    const RC_RATE_INCREMENTAL = 14.54;
    const RC_EXPO_POWER = 3;

    let rcCommandf = rc / 500;
    const rcCommandfAbs = Math.abs(rcCommandf);

    if (sysConfig["rc_expo"][axis]) {
        const expof = Number(sysConfig["rc_expo"][axis]) / 100;
        rcCommandf = rcCommandf * rcCommandfAbs ** RC_EXPO_POWER * expof + rcCommandf * (1 - expof);
    }

    let rcRate = Number(sysConfig["rc_rates"][axis]) / 100;
    if (rcRate > 2) {
        rcRate += RC_RATE_INCREMENTAL * (rcRate - 2);
    }

    let angleRate = 200 * rcRate * rcCommandf;
    if (sysConfig.rates[axis]) {
        const rcSuperfactor = 1 / constrain(1 - rcCommandfAbs * (Number(sysConfig.rates[axis]) / 100), 0.01, 1);
        angleRate *= rcSuperfactor;
    }

    const limit = sysConfig["rate_limits"][axis];
    if (sysConfig.pidController === 0 || limit == null) {
        /* LEGACY */
        return constrain(angleRate * 4.1, -8190, 8190) >> 2; // Rate limit protection
    }
    return constrain(angleRate, -1 * limit, limit); // Rate limit protection (deg/sec)
}

/** Betaflight 2.8 to 3.0. */
function rateFrom28(sysConfig: SysConfig, value: number, axis: number): number {
    const FEATURE_SUPEREXPO_RATES = 1 << 23;
    let angleRate;

    if (Number(sysConfig.features) & FEATURE_SUPEREXPO_RATES) {
        let rcFactor =
            axis === AXIS.YAW
                ? Math.abs(value) / (500 * (validate(sysConfig.rc_rates[2], 100) / 100))
                : Math.abs(value) / (500 * (validate(sysConfig.rc_rates[0], 100) / 100));
        rcFactor = 1 / constrain(1 - rcFactor * (validate(sysConfig.rates[axis], 100) / 100), 0.01, 1);

        angleRate = rcFactor * ((27 * value) / 16);
    } else {
        angleRate = ((validate(sysConfig.rates[axis], 100) + 27) * value) / 16;
    }

    return constrain(angleRate, -8190, 8190); // Rate limit protection
}

/** Before Betaflight 2.8: the expo-plus curve, with super expo per axis and, on yaw, per mode. */
function rateBefore28(
    sysConfig: SysConfig,
    value: number,
    axis: number,
    currentFlightMode: number | null | undefined,
    hasSuperExpoMode: (flightMode: number) => boolean,
): number {
    let propFactor;
    if (axis === AXIS.YAW && !sysConfig.superExpoYawMode) {
        propFactor = 1;
    } else {
        const factor = axis === AXIS.YAW ? sysConfig.superExpoFactorYaw : sysConfig.superExpoFactor;
        propFactor = 1 - (Number(factor) / 100) * (Math.abs(value) / 500);
    }

    let superExpoFactor = 1 / propFactor;

    if (axis !== AXIS.YAW) {
        /*ROLL or PITCH */
        if (currentFlightMode == null) {
            superExpoFactor = 1; // If we don't know the flight mode, then reset the super expo mode.
        }
        const rate = Number(axis === AXIS.ROLL ? sysConfig.rates[AXIS.ROLL] : sysConfig.rates[AXIS.PITCH]);
        return (superExpoFactor * ((rate + 27) * value)) >> 6;
    }

    // The header logs the mode as an index into SUPER_EXPO_YAW.
    const SUPER_EXPO_YAW_ON = SUPER_EXPO_YAW.indexOf("ON");
    const SUPER_EXPO_YAW_ALWAYS = SUPER_EXPO_YAW.indexOf("ALWAYS");
    if (sysConfig.superExpoYawMode === SUPER_EXPO_YAW_ON && currentFlightMode == null) {
        superExpoFactor = 1; // If we don't know the flight mode, then reset the super expo mode.
    }
    if (
        sysConfig.superExpoYawMode === SUPER_EXPO_YAW_ALWAYS ||
        (sysConfig.superExpoYawMode === SUPER_EXPO_YAW_ON && hasSuperExpoMode(Number(currentFlightMode)))
    ) {
        return (superExpoFactor * ((Number(sysConfig.rates[AXIS.YAW]) + 47) * value)) >> 7;
    }
    return ((Number(sysConfig.rates[AXIS.YAW]) + 47) * value) >> 7;
}

export class FlightLog {
    declare parser: FlightLogParser;
    declare getMainFieldCount: () => number;
    declare getMainFieldNames: () => string[];
    /** The fatal parse error of the log with the given index, or false if there was none. */
    declare getLogError: (logIndex: number) => unknown;
    declare getStats: (logIndex?: number) => LogStats;
    declare getMinTime: (index?: number) => number;
    declare getMaxTime: (index?: number) => number;
    declare getActualLoggedTime: (index?: number) => number;
    declare getBlackboxRate: () => number | null;
    declare getActualLogRate: () => number;
    declare isWrongLogRate: () => boolean;
    declare getSysConfig: () => SysConfig;
    declare setSysConfig: (newSysConfig: Partial<SysConfig>) => void;
    declare getLogIndex: () => number;
    declare getLogCount: () => number;
    declare getActivitySummary: () => Pick<
        IntraframeDirectory,
        "times" | "avgThrottle" | "maxMotorDiff" | "maxRC" | "hasEvent"
    >;
    declare getMainFieldIndexByName: (name: string) => number | undefined;
    declare getMainFieldIndexes: (_name?: string) => Record<string, number>;
    declare getFrameAtTime: (startTime: number) => LogFrame | false | undefined;
    declare getSmoothedFrameAtTime: (startTime: number) => LogFrame | false | undefined;
    declare getCurrentFrameAtTime: (
        startTime: number,
    ) => { previous: LogFrame | null; current: LogFrame | null; next: LogFrame | null } | false;
    declare getNumCellsEstimate: () => number | false;
    declare getNumMotors: () => number | false;
    declare getChunksInTimeRange: (startTime: number, endTime: number) => Chunk[];
    /** Map from field index to smoothing radius in microseconds; only fields to smooth need an entry. */
    declare setFieldSmoothing: (newSmoothing: Record<number, number>) => void;
    declare getSmoothedChunksInTimeRange: (startTime: number, endTime: number) => Chunk[];
    declare openLog: (index: number) => boolean;
    declare hasGpsData: () => boolean;
    declare getMinMaxForFieldDuringAllTime: (field_name: string) => FieldRange | undefined;
    declare getMinMaxForFieldDuringTimeInterval: (
        field_name: string,
        start_time: number,
        end_time: number,
    ) => FieldRange | undefined;
    declare getCurrentLogRowsCount: () => number;

    constructor(logData: Uint8Array) {
        const ADDITIONAL_COMPUTED_FIELD_COUNT = 21; /** attitude + PID_SUM + PID_ERROR + RCCOMMAND_SCALED + GPS coord, distance, azimuth, trajectory tilt angle **/
        let logIndex = 0;
        const logIndexes = new FlightLogIndex(logData);
        const parser = new FlightLogParser(logData);
        let iframeDirectory: IntraframeDirectory;
        // We cache these details so they don't have to be recomputed on every request:
        let numCells: number | false = false,
            numMotors: number | false = false;
        let fieldNames: string[] = [],
            fieldNameToIndex: Record<string, number> = {};
        let rcCommandRescale: FieldRescale[] = [];
        const chunkCache = new FIFOCache<number, Chunk>(2);
        // Map from field indexes to smoothing window size in microseconds
        let fieldSmoothing: Record<number, number> = {},
            maxSmoothing = 0;
        const smoothedCache = new FIFOCache<number, Chunk>(2);
        let gpsTransform: GpsTransform | null = null;

        //Public fields:
        this.parser = parser;

        this.getMainFieldCount = function () {
            return fieldNames.length;
        };

        this.getMainFieldNames = function () {
            return fieldNames;
        };

        /**
         * Get the fatal parse error encountered when reading the log with the given index, or false if no error
         * was encountered.
         */
        this.getLogError = function (logIndex) {
            const error = logIndexes.getIntraframeDirectory(logIndex).error;

            if (error) {
                return error;
            }

            return false;
        };

        /**
         * Get the stats for the log of the given index, or leave off the logIndex argument to fetch the stats
         * for the current log.
         */
        // Only asked of logs without an error, which the index has always parsed (and so has stats for).
        function getRawStats(logIndex?: number): ParserStats {
            if (logIndex === undefined) {
                return iframeDirectory.stats!;
            } else {
                return logIndexes.getIntraframeDirectory(logIndex).stats!;
            }
        }

        /**
         * Get the stats for the log of the given index, or leave off the logIndex argument to fetch the stats
         * for the current log.
         *
         * Stats are modified to add a global field[] array which contains merged field stats for the different frame types
         * that the flightlog presents as one merged frame.
         */
        this.getStats = function (logIndex) {
            const rawStats = getRawStats(logIndex);

            if (rawStats.field === undefined) {
                rawStats.field = [];
                // A log without an error has valid I and P frames, which is what created both entries.
                const intra = rawStats.frame.I!;
                const inter = rawStats.frame.P!;
                for (let i = 0; i < intra.field.length; ++i) {
                    rawStats.field[i] = {
                        min: Math.min(intra.field[i].min, inter.field[i].min),
                        max: Math.max(intra.field[i].max, inter.field[i].max),
                    };
                }
                for (const { index, gain, offset } of rcCommandRescale) {
                    const range = rawStats.field[index];
                    range.min = range.min * gain + offset;
                    range.max = range.max * gain + offset;
                }

                if (rawStats.frame.S) {
                    rawStats.field = rawStats.field.concat(rawStats.frame.S.field);
                }
            }
            return rawStats as LogStats;
        };

        /**
         * Get the earliest time seen in the log of the given index (in microseconds), or leave off the logIndex
         * argument to fetch details for the current log.
         *
         * Only for a log without an error: the index gives one to every log it found no time in.
         */
        this.getMinTime = function (index) {
            index = index ?? logIndex;
            return logIndexes.getIntraframeDirectory(index).minTime as number;
        };

        /**
         * Get the latest time seen in the log of the given index (in microseconds), or leave off the logIndex
         * argument to fetch details for the current log.
         *
         * Only for a log without an error, as for getMinTime().
         */
        this.getMaxTime = function (index) {
            index = index ?? logIndex;
            return logIndexes.getIntraframeDirectory(index).maxTime as number;
        };

        this.getActualLoggedTime = function (index) {
            index = index ?? logIndex;
            const directory = logIndexes.getIntraframeDirectory(index);
            return (directory.maxTime as number) - (directory.minTime as number) - directory.unLoggedTime;
        };

        this.getBlackboxRate = function () {
            const sysConfig = this.getSysConfig();
            if (!sysConfig["looptime"] || !sysConfig["frameIntervalPNum"] || !sysConfig["frameIntervalPDenom"]) {
                return null;
            }
            const gyroRate = 1000000 / sysConfig["looptime"];
            let blackBoxRate = (gyroRate * sysConfig["frameIntervalPNum"]) / sysConfig["frameIntervalPDenom"];
            if (sysConfig.pid_process_denom != null) {
                blackBoxRate /= sysConfig.pid_process_denom;
            }
            return Number.isFinite(blackBoxRate) && blackBoxRate > 0 ? blackBoxRate : null;
        };

        this.getActualLogRate = function () {
            const loggedTime = this.getActualLoggedTime();
            return loggedTime > 0 ? (this.getCurrentLogRowsCount() / loggedTime) * 1000000 : 0;
        };

        this.isWrongLogRate = function () {
            const blackboxRate = this.getBlackboxRate();
            const actualLogRate = this.getActualLogRate();
            // A null rate counts as 0, as `-` made it.
            return (
                !actualLogRate ||
                Math.abs(Number(blackboxRate) - actualLogRate) / actualLogRate > WARNING_RATE_DIFFERENCE
            );
        };

        /**
         * Get the flight controller system information that was parsed for the current log file.
         */
        this.getSysConfig = function () {
            return parser.sysConfig;
        };

        this.setSysConfig = function (newSysConfig) {
            Object.assign(parser.sysConfig, newSysConfig);
        };

        /**
         * Get the index of the currently selected log.
         */
        this.getLogIndex = function () {
            return logIndex;
        };

        this.getLogCount = function () {
            return logIndexes.getLogCount();
        };

        /**
         * Return a coarse summary of throttle position and events across the entire log.
         */
        this.getActivitySummary = function () {
            const directory = logIndexes.getIntraframeDirectory(logIndex);

            return {
                times: directory.times,
                avgThrottle: directory.avgThrottle,
                maxMotorDiff: directory.maxMotorDiff,
                maxRC: directory.maxRC,
                hasEvent: directory.hasEvent,
            };
        };

        /**
         * Get the index of the field with the given name, or undefined if that field doesn't exist in the log.
         */
        this.getMainFieldIndexByName = function (name) {
            return fieldNameToIndex[name];
        };

        this.getMainFieldIndexes = function (_name) {
            return fieldNameToIndex;
        };

        this.getFrameAtTime = function (startTime) {
            const chunks = this.getChunksInTimeRange(startTime, startTime),
                chunk = chunks[0];

            if (chunk) {
                let i;
                for (i = 0; i < chunk.frames.length; i++) {
                    if (chunk.frames[i][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME] > startTime) {
                        break;
                    }
                }

                return chunk.frames[i - 1];
            } else {
                return false;
            }
        };

        this.getSmoothedFrameAtTime = function (startTime) {
            const chunks = this.getSmoothedChunksInTimeRange(startTime, startTime),
                chunk = chunks[0];

            if (chunk) {
                let i;
                for (i = 0; i < chunk.frames.length; i++) {
                    if (chunk.frames[i][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME] > startTime) {
                        break;
                    }
                }

                return chunk.frames[i - 1];
            } else {
                return false;
            }
        };

        this.getCurrentFrameAtTime = function (startTime) {
            const chunks = this.getSmoothedChunksInTimeRange(startTime, startTime),
                chunk = chunks[0];

            if (chunk) {
                let i;
                for (i = 0; i < chunk.frames.length; i++) {
                    if (chunk.frames[i][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME] > startTime) {
                        break;
                    }
                }

                return {
                    previous: i >= 2 ? chunk.frames[i - 2] : null,
                    current: i >= 1 ? chunk.frames[i - 1] : null,
                    next: i >= 0 ? chunk.frames[i] : null,
                };
            } else {
                return false;
            }
        };

        const addComputedFieldNames = (disabled: DisabledFields) => {
            // Heading: ATTITUDE enabled (quaternion available) OR both GYRO and ACC enabled (IMU estimation)
            const hasQuaternion = fieldNames.includes("imuQuaternion[0]");
            const hasGyroAndAcc = fieldNames.includes("gyroADC[0]") && fieldNames.includes("accSmooth[0]");
            if (hasQuaternion || hasGyroAndAcc) {
                fieldNames.push("heading[0]", "heading[1]", "heading[2]");
            }

            if (!disabled.PID) {
                fieldNames.push("axisSum[0]", "axisSum[1]", "axisSum[2]");
            }
            if (!disabled.SETPOINT) {
                fieldNames.push("rcCommands[0]", "rcCommands[1]", "rcCommands[2]", "rcCommands[3]");
            }
            if (!disabled.GYRO && !disabled.SETPOINT) {
                fieldNames.push("axisError[0]", "axisError[1]", "axisError[2]");
            }
            if (!disabled.GPS) {
                if (fieldNames.includes("GPS_coord[0]")) {
                    fieldNames.push(
                        "gpsCartesianCoords[0]",
                        "gpsCartesianCoords[1]",
                        "gpsCartesianCoords[2]",
                        "gpsDistance",
                        "gpsHomeAzimuth",
                    );
                }
                if (fieldNames.includes("GPS_velned[0]")) {
                    fieldNames.push("gpsTrajectoryTiltAngle");
                }
            }
        };

        const buildFieldNames = () => {
            // Make an independent copy
            // openLog() parses the header first, which throws without a complete I-frame definition.
            fieldNames = parser.frameDefs.I!.name.slice(0);

            // Merge slow fields into main stream
            if (parser.frameDefs.S) {
                fieldNames.push(...parser.frameDefs.S.name);
            }
            // Merge GPS fields (skip duplicate time)
            if (parser.frameDefs.G) {
                fieldNames.push(...parser.frameDefs.G.name.filter((n) => n !== "time"));
            }

            addComputedFieldNames(this.isFieldDisabled());

            fieldNameToIndex = {};
            for (let i = 0; i < fieldNames.length; i++) {
                fieldNameToIndex[fieldNames[i]] = i;
            }
        };

        const estimateNumMotors = () => {
            let count = 0;

            for (let j = 0; j < MAX_MOTOR_NUMBER; j++) {
                if (this.getMainFieldIndexByName(`motor[${j}]`) !== undefined) {
                    count++;
                }
            }

            numMotors = count;
        };

        const estimateNumCells = () => {
            const sysConfig = this.getSysConfig();
            let i;

            let refVoltage;
            if (firmwareGreaterOrEqual(sysConfig, "3.1.0", "2.0.0")) {
                refVoltage = sysConfig.vbatref;
            } else {
                refVoltage = this.vbatADCToMillivolts(sysConfig.vbatref) / 100;
            }

            //Are we even logging VBAT?
            if (fieldNameToIndex.vbatLatest) {
                for (i = 1; i < 8; i++) {
                    if (refVoltage < i * Number(sysConfig.vbatmaxcellvoltage)) {
                        break;
                    }
                }

                numCells = i;
            } else {
                numCells = false;
            }
        };

        this.getNumCellsEstimate = function () {
            return numCells;
        };

        this.getNumMotors = function () {
            return numMotors;
        };

        /** The transform to the local frame around a GPS home (lat, lon in 1e-7 degrees, altitude in dm). */
        const homeTransform = (home: ArrayLike<number>): GpsTransform => {
            const homeAltitude = home.length > 2 ? home[2] / 10 : 0; // will work after BF firmware improvement
            return new GpsTransform(home[0] / 10000000, home[1] / 10000000, homeAltitude, 0);
        };

        /** Give the waiting events the time of the frame that followed them, and stop waiting. */
        const stampEvents = (eventNeedsTimestamp: LogEvent[], frame: ArrayLike<number | null>): void => {
            for (const event of eventNeedsTimestamp) {
                event.time = frame[FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME] as number;
            }
            eventNeedsTimestamp.length = 0;
        };

        /** Reuse the oldest cached chunk's memory if there is one, else start a new chunk. */
        const recycledChunk = (chunkIndex: number): Chunk => {
            const chunk = chunkCache.recycle();

            // Were we able to reuse memory from an expired chunk?
            if (chunk) {
                chunk.index = chunkIndex;
                /*
                 * getSmoothedChunks would like to share this data, so we can't reuse the old arrays without
                 * accidentally changing data that it might still want to reference:
                 */
                chunk.gapStartsHere = {};
                chunk.events = [];
                delete chunk.hasAdditionalFields;
                delete chunk.needsEventTimes;

                //But reuse the old chunk's frames array since getSmoothedChunks has an independent copy
                return chunk;
            }
            return {
                index: chunkIndex,
                frames: [],
                gapStartsHere: {},
                events: [],
            };
        };

        /** What decoding one chunk carries from frame to frame. */
        interface ChunkParseState {
            chunk: Chunk;
            mainFrameIndex: number;
            eventNeedsTimestamp: LogEvent[];
            lastSlow: number[];
            lastGPS: number[];
            slowFrameLength: number;
            lastGPSLength: number;
        }

        const appendMainFrame = (state: ChunkParseState, frame: number[]): void => {
            //The parser re-uses the "frame" array so we must copy that data somewhere else
            const { chunk, lastSlow, lastGPS, slowFrameLength, lastGPSLength } = state;
            const numOutputFields = frame.length + slowFrameLength + lastGPSLength + ADDITIONAL_COMPUTED_FIELD_COUNT;
            let destFrame: LogFrame;

            //Do we have a recycled chunk to copy on top of?
            if (chunk.frames[state.mainFrameIndex]) {
                destFrame = chunk.frames[state.mainFrameIndex];
                destFrame.length = numOutputFields;
            } else {
                // Otherwise allocate a new array; the loop below fills iteration and time first
                destFrame = new Array(numOutputFields) as LogFrame;
                chunk.frames.push(destFrame);
            }

            // Copy the main frame data in
            for (let i = 0; i < frame.length; i++) {
                destFrame[i] = frame[i];
            }
            for (const { index, gain, offset } of rcCommandRescale) {
                destFrame[index] = frame[index] * gain + offset;
            }

            let destFrame_currentIndex = frame.length; // Keeps track of where to place direct data in the destFrame.
            // Then merge in the last seen slow-frame data
            for (let slowFrameIndex = 0; slowFrameIndex < slowFrameLength; slowFrameIndex++) {
                destFrame[slowFrameIndex + destFrame_currentIndex] = lastSlow[slowFrameIndex] ?? null;
            }
            destFrame_currentIndex += slowFrameLength;

            // Also merge last seen gps-frame data
            for (let gpsFrameIndex = 0; gpsFrameIndex < lastGPSLength; gpsFrameIndex++) {
                destFrame[gpsFrameIndex + destFrame_currentIndex] = lastGPS[gpsFrameIndex] ?? null;
            }
            // destFrame_currentIndex += lastGPSLength; Add this line if you wish to add more fields.

            stampEvents(state.eventNeedsTimestamp, frame);

            state.mainFrameIndex++;
        };

        const recordChunkEvent = (state: ChunkParseState, event: LogEvent): void => {
            if (event.event === FlightLogEvent.LOGGING_RESUME) {
                state.chunk.gapStartsHere[state.mainFrameIndex - 1] = true;
            }

            /*
             * If the event was logged during a loop iteration, it will appear in the log
             * before that loop iteration does (since the main log stream is logged at the very
             * end of the loop).
             *
             * So we want to use the timestamp of that later frame as the timestamp of the loop
             * iteration this event was logged in.
             */
            if (!event.time) {
                state.eventNeedsTimestamp.push(event);
            }
            state.chunk.events.push(event);
        };

        const chunkFrameHandler = (state: ChunkParseState): FrameReadyHandler =>
            function (frameValid, frame, frameType, _frameOffset, _frameSize) {
                // The G frames need to be processed always. They are "invalid" if not H (Home) has been detected
                // before, but if not processed the viewer shows cuts and gaps. This happens if the quad takes off before
                // fixing enough satellites.
                if (!frameValid && !(frameType === "G" && frame)) {
                    state.chunk.gapStartsHere[state.mainFrameIndex - 1] = true;
                    return;
                }

                switch (frameType) {
                    case "P":
                    case "I":
                        appendMainFrame(state, frame);
                        break;
                    case "E":
                        recordChunkEvent(state, frame);
                        break;
                    case "S":
                        for (let i = 0; i < frame.length; i++) {
                            state.lastSlow[i] = frame[i];
                        }
                        break;
                    case "H":
                        gpsTransform = homeTransform(frame);
                        break;
                    case "G":
                        // The frameValid can be false, when no GPS home (the G frames contains GPS position as diff of GPS Home position).
                        // But other data from the G frame can be valid (time, num sats)

                        //H Field G name:time,GPS_numSat,GPS_coord[0],GPS_coord[1],GPS_altitude,GPS_speed,GPS_ground_course
                        frame.shift(); // remove time
                        for (let i = 0; i < frame.length; i++) {
                            state.lastGPS[i] = frame[i];
                        }
                        break;
                }
            };

        /** Parse the log file to create the chunk with this index, which wasn't cached. */
        const parseChunk = (chunkIndex: number, eventNeedsTimestamp: LogEvent[]): Chunk => {
            const chunkStartOffset = iframeDirectory.offsets[chunkIndex];
            const chunkEndOffset =
                chunkIndex + 1 < iframeDirectory.offsets.length
                    ? iframeDirectory.offsets[chunkIndex + 1]
                    : // We're at the end so parse till end-of-log
                      logIndexes.getLogBeginOffset(logIndex + 1);

            const chunk = recycledChunk(chunkIndex);

            // We need to store these on the chunk so we can refer to them later when we inject
            // computed fields (IMU for attitude, GPS home for cartesian/home-distance/azimuth).
            chunk.initialIMU = iframeDirectory.initialIMU[chunkIndex];
            chunk.initialGPSHome = iframeDirectory.initialGPSHome?.[chunkIndex] ?? null;

            const state: ChunkParseState = {
                chunk,
                mainFrameIndex: 0,
                eventNeedsTimestamp,
                slowFrameLength: parser.frameDefs.S ? parser.frameDefs.S.count : 0,
                // The index keeps initialSlow exactly when the log has S frames
                lastSlow: parser.frameDefs.S ? iframeDirectory.initialSlow![chunkIndex].slice(0) : [],
                lastGPSLength: parser.frameDefs.G ? parser.frameDefs.G.count - 1 : 0, // -1 since we exclude the time field
                lastGPS: parser.frameDefs.G ? iframeDirectory.initialGPS[chunkIndex].slice(0) : [],
            };
            parser.onFrameReady = chunkFrameHandler(state);

            parser.resetDataState();

            //Prime the parser with the previous state we get from the flightlog index, so it can base deltas off that data
            gpsTransform = null;
            const initialGPSHome = iframeDirectory.initialGPSHome?.[chunkIndex];
            if (initialGPSHome) {
                parser.setGPSHomeHistory(initialGPSHome);
                gpsTransform = homeTransform(initialGPSHome);
            }

            parser.parseLogData(false, chunkStartOffset, chunkEndOffset);

            //Truncate the array to fit just in case it was recycled and the new one is shorter
            chunk.frames.length = state.mainFrameIndex;

            chunkCache.add(chunkIndex, chunk);
            return chunk;
        };

        /**
         * Get the raw chunks in the range [startIndex...endIndex] (inclusive)
         *
         * When the cache misses, this will result in parsing the original log file to create chunks.
         */
        function getChunksInIndexRange(startIndex: number, endIndex: number): Chunk[] {
            const resultChunks: Chunk[] = [],
                eventNeedsTimestamp: LogEvent[] = [];

            startIndex = Math.max(startIndex, 0);
            endIndex = Math.min(endIndex, iframeDirectory.offsets.length - 1);

            if (endIndex < startIndex) {
                return [];
            }

            //Assume caller asked for about a screen-full. Try to cache about three screens worth.
            if (chunkCache.capacity < (endIndex - startIndex + 1) * 3 + 1) {
                chunkCache.capacity = (endIndex - startIndex + 1) * 3 + 1;

                //And while we're here, use the same size for the smoothed cache
                smoothedCache.capacity = chunkCache.capacity;
            }

            for (let chunkIndex = startIndex; chunkIndex <= endIndex; chunkIndex++) {
                const cached = chunkCache.get(chunkIndex);

                // Did we cache this chunk already? Use its first frame to fill in event times at the
                // trailing end of the previous one.
                if (cached) {
                    stampEvents(eventNeedsTimestamp, cached.frames[0]);
                }
                resultChunks.push(cached ?? parseChunk(chunkIndex, eventNeedsTimestamp));
            }

            /*
             * If there is an event that trailed the all the chunks we were decoding, we can't give it an event time field
             * because we didn't get to see the time of the next frame.
             */
            if (eventNeedsTimestamp.length > 0) {
                resultChunks.at(-1)!.needsEventTimes = true;
            }

            injectComputedFields(resultChunks, resultChunks);

            return resultChunks;
        }

        /**
         * Get an array of chunks which span times from the given start to end time.
         * Each chunk is an array of log frames.
         */
        this.getChunksInTimeRange = function (startTime, endTime) {
            const startIndex = binarySearchOrPrevious(iframeDirectory.times, startTime),
                endIndex = binarySearchOrPrevious(iframeDirectory.times, endTime);

            return getChunksInIndexRange(startIndex, endIndex);
        };

        /*
         * Smoothing is map from field index to smoothing radius, where radius is in us. You only need to specify fields
         * which need to be smoothed.
         */
        this.setFieldSmoothing = function (newSmoothing) {
            smoothedCache.clear();
            fieldSmoothing = newSmoothing;

            maxSmoothing = 0;

            for (const value of Object.values(newSmoothing)) {
                if (value > maxSmoothing) {
                    maxSmoothing = value;
                }
            }
        };

        /**
         * Compute attitude (roll, pitch, heading) from IMU quaternion or gyro+acc fallback.
         * Writes 3 fields to destFrame starting at fieldIndex.
         * Returns updated fieldIndex.
         */
        const computeAttitude = (
            srcFrame: LogFrame,
            destFrame: LogFrame,
            fieldIndex: number,
            {
                imuQuaternion,
                gyroADC,
                accSmooth,
                magADC,
                chunkIMU,
                sysConfig,
            }: Pick<ComputedFieldContext, "imuQuaternion" | "gyroADC" | "accSmooth" | "magADC" | "sysConfig"> & {
                chunkIMU: IMU;
            },
        ): number => {
            if (imuQuaternion) {
                const scaleFromFixedInt16 = 0x7fff; // 0x7FFF = 2^15 - 1
                const q = {
                    x: fieldNumber(srcFrame, imuQuaternion[0]) / scaleFromFixedInt16,
                    y: fieldNumber(srcFrame, imuQuaternion[1]) / scaleFromFixedInt16,
                    z: fieldNumber(srcFrame, imuQuaternion[2]) / scaleFromFixedInt16,
                    w: 1,
                };

                let m = q.x ** 2 + q.y ** 2 + q.z ** 2;
                if (m < 1) {
                    q.w = Math.sqrt(1 - m);
                } else {
                    m = Math.sqrt(m);
                    q.x /= m;
                    q.y /= m;
                    q.z /= m;
                    q.w = 0;
                }
                const xx = q.x ** 2,
                    xy = q.x * q.y,
                    xz = q.x * q.z,
                    wx = q.w * q.x,
                    yy = q.y ** 2,
                    yz = q.y * q.z,
                    wy = q.w * q.y,
                    zz = q.z ** 2,
                    wz = q.w * q.z;
                const roll = Math.atan2(+2 * (wx + yz), +1 - 2 * (xx + yy));
                const pitch = 0.5 * Math.PI - Math.acos(+2 * (wy - xz));
                let heading = -Math.atan2(+2 * (wz + xy), +1 - 2 * (yy + zz));
                if (heading < 0) {
                    heading += 2 * Math.PI;
                }

                destFrame[fieldIndex++] = roll;
                destFrame[fieldIndex++] = pitch;
                destFrame[fieldIndex++] = heading;
            } else if (gyroADC && accSmooth) {
                const attitude: Attitude = chunkIMU.updateEstimatedAttitude(
                    [
                        fieldNumber(srcFrame, gyroADC[0]),
                        fieldNumber(srcFrame, gyroADC[1]),
                        fieldNumber(srcFrame, gyroADC[2]),
                    ],
                    [
                        fieldNumber(srcFrame, accSmooth[0]),
                        fieldNumber(srcFrame, accSmooth[1]),
                        fieldNumber(srcFrame, accSmooth[2]),
                    ],
                    srcFrame[FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME],
                    sysConfig.acc_1G,
                    sysConfig.gyroScale,
                    magADC,
                );
                destFrame[fieldIndex++] = attitude.roll;
                destFrame[fieldIndex++] = attitude.pitch;
                destFrame[fieldIndex++] = attitude.heading;
            }
            return fieldIndex;
        };

        /**
         * Read a single PID component value from the source frame, returning 0 if the field is absent.
         */
        const readPidComponent = (srcFrame: LogFrame, components: (number | undefined)[], index: number): number => {
            if (components[index] === undefined) {
                return 0;
            }
            return fieldNumber(srcFrame, components[index]);
        };

        /**
         * Compute PID sums (P+I+D+F+S) for each axis, constrained by pidSumLimit.
         * Writes 3 fields to destFrame starting at fieldIndex.
         * Returns updated fieldIndex.
         */
        const computePidSums = (
            srcFrame: LogFrame,
            destFrame: LogFrame,
            fieldIndex: number,
            axisPID: (number | undefined)[][],
            sysConfig: SysConfig,
        ): number => {
            for (let axis = 0; axis < 3; axis++) {
                let pidSum = 0;
                for (let n = 0; n < 5; n++) {
                    pidSum += readPidComponent(srcFrame, axisPID[axis], n);
                }

                const pidLimit = axis < AXIS.YAW ? sysConfig.pidSumLimit : sysConfig.pidSumLimitYaw;
                if (pidLimit != null && pidLimit > 0) {
                    pidSum = constrain(pidSum, -pidLimit, pidLimit);
                }

                destFrame[fieldIndex++] = pidSum;
            }
            return fieldIndex;
        };

        /**
         * Compute scaled RC commands (setpoint in deg/s, throttle in %).
         * For BF 4.0+ copies real setpoint fields; for older versions calculates from rcCommand.
         * Writes 4 fields to destFrame starting at fieldIndex.
         * Returns updated fieldIndex.
         */
        const computeScaledRcCommands = (
            srcFrame: LogFrame,
            destFrame: LogFrame,
            fieldIndex: number,
            setpoint: ComputedFieldContext["setpoint"],
            rcCommand: ComputedFieldContext["rcCommand"],
            currentFlightMode: number | null | undefined,
            sysConfig: SysConfig,
        ): number => {
            // A log without the fields indexes `false`, which reads undefined, as before.
            const setpointIndexes = setpoint || [];
            const rcCommandIndexes = rcCommand || [];
            if (sysConfig.firmwareType === FIRMWARE_TYPE_BETAFLIGHT && semver.gte(sysConfig.firmwareVersion, "4.0.0")) {
                for (let axis = 0; axis <= AXIS.YAW; axis++) {
                    // Copied as logged; undefined only for a 4.0+ log without setpoint fields.
                    destFrame[fieldIndex++] = fieldAt(srcFrame, setpointIndexes[axis]) as number | null;
                }
                destFrame[fieldIndex++] = fieldNumber(srcFrame, setpointIndexes[AXIS.YAW + 1]) / 10;
            } else {
                for (let axis = 0; axis <= AXIS.YAW; axis++) {
                    destFrame[fieldIndex++] =
                        rcCommandIndexes[axis] === undefined
                            ? 0
                            : this.rcCommandRawToDegreesPerSecond(
                                  fieldNumber(srcFrame, rcCommandIndexes[axis]),
                                  axis,
                                  currentFlightMode,
                              );
                }
                destFrame[fieldIndex++] =
                    rcCommandIndexes[AXIS.YAW + 1] === undefined
                        ? 0
                        : this.rcCommandRawToThrottle(fieldNumber(srcFrame, rcCommandIndexes[AXIS.YAW + 1]));
            }
            return fieldIndex;
        };

        /**
         * Compute PID error (setpoint - gyro) for each axis.
         * Writes 3 fields to destFrame starting at fieldIndex.
         * Returns updated fieldIndex.
         */
        const computePidErrors = (
            srcFrame: LogFrame,
            destFrame: LogFrame,
            fieldIndex: number,
            fieldIndexRcCommands: number,
            gyroADC: ComputedFieldContext["gyroADC"],
        ): number => {
            const gyroIndexes = gyroADC || [];
            for (let axis = 0; axis < 3; axis++) {
                const gyroADCdegrees =
                    gyroIndexes[axis] === undefined
                        ? 0
                        : this.gyroRawToDegreesPerSecond(fieldNumber(srcFrame, gyroIndexes[axis]));
                destFrame[fieldIndex++] = fieldNumber(destFrame, fieldIndexRcCommands + axis) - gyroADCdegrees;
            }
            return fieldIndex;
        };

        /**
         * Compute GPS cartesian coordinates, distance to home, and azimuth.
         * Writes 5 fields to destFrame starting at fieldIndex.
         * Returns updated fieldIndex.
         */
        const computeGpsFields = (
            srcFrame: LogFrame,
            destFrame: LogFrame,
            fieldIndex: number,
            gpsCoord: (number | undefined)[],
            numSatIndex: number | undefined,
        ): number => {
            const numSat = numSatIndex ? fieldNumber(srcFrame, numSatIndex) : 0;
            if (numSat > 4) {
                // computeFrameFields() only calls this with a transform set
                const gpsCartesianCoords = gpsTransform!.WGS_BS(
                    fieldNumber(srcFrame, gpsCoord[0]) / 10000000,
                    fieldNumber(srcFrame, gpsCoord[1]) / 10000000,
                    fieldNumber(srcFrame, gpsCoord[2]) / 10,
                );
                destFrame[fieldIndex++] = gpsCartesianCoords.x;
                destFrame[fieldIndex++] = gpsCartesianCoords.y;
                destFrame[fieldIndex++] = gpsCartesianCoords.z;
                destFrame[fieldIndex++] = Math.hypot(gpsCartesianCoords.x, gpsCartesianCoords.z);

                let homeAzimuth = (Math.atan2(-gpsCartesianCoords.z, -gpsCartesianCoords.x) * 180) / Math.PI;
                if (homeAzimuth < 0) {
                    homeAzimuth += 360;
                }
                destFrame[fieldIndex++] = homeAzimuth;
            } else {
                destFrame[fieldIndex++] = 0;
                destFrame[fieldIndex++] = 0;
                destFrame[fieldIndex++] = 0;
                destFrame[fieldIndex++] = 0;
                destFrame[fieldIndex++] = 0;
            }
            return fieldIndex;
        };

        /**
         * Compute trajectory tilt angle from NED GPS velocity.
         * Writes 1 field to destFrame at fieldIndex.
         * Returns updated fieldIndex.
         */
        const computeTrajectoryTilt = (
            srcFrame: LogFrame,
            destFrame: LogFrame,
            fieldIndex: number,
            gpsVelNED: (number | undefined)[],
        ): number => {
            const Vn = fieldNumber(srcFrame, gpsVelNED[0]),
                Ve = fieldNumber(srcFrame, gpsVelNED[1]),
                Vd = fieldNumber(srcFrame, gpsVelNED[2]);
            const velocity = Math.hypot(Vn, Ve, Vd);
            const minVelo = 5; // 5cm/s limit to prevent division by zero and miss tiny noise values
            let trajectoryTiltAngle = 0;
            if (velocity > minVelo) {
                const angleSin = Math.max(-1, Math.min(1, Vd / velocity));
                trajectoryTiltAngle = (-Math.asin(angleSin) * 180) / Math.PI; // [degree], if velo is up then >0
            }
            destFrame[fieldIndex++] = trajectoryTiltAngle;
            return fieldIndex;
        };

        /**
         * Resolve field indices from fieldNameToIndex for computed field injection.
         * Sets arrays to false when the primary field is absent.
         */
        const resolveFieldIndices = (): ComputedFieldContext => {
            let gyroADC: ComputedFieldContext["gyroADC"] = [
                fieldNameToIndex["gyroADC[0]"],
                fieldNameToIndex["gyroADC[1]"],
                fieldNameToIndex["gyroADC[2]"],
            ];
            let accSmooth: ComputedFieldContext["accSmooth"] = [
                fieldNameToIndex["accSmooth[0]"],
                fieldNameToIndex["accSmooth[1]"],
                fieldNameToIndex["accSmooth[2]"],
            ];
            let magADC: ComputedFieldContext["magADC"] = [
                fieldNameToIndex["magADC[0]"],
                fieldNameToIndex["magADC[1]"],
                fieldNameToIndex["magADC[2]"],
            ];
            let imuQuaternion: ComputedFieldContext["imuQuaternion"] = [
                fieldNameToIndex["imuQuaternion[0]"],
                fieldNameToIndex["imuQuaternion[1]"],
                fieldNameToIndex["imuQuaternion[2]"],
            ];
            let rcCommand: ComputedFieldContext["rcCommand"] = [
                fieldNameToIndex["rcCommand[0]"],
                fieldNameToIndex["rcCommand[1]"],
                fieldNameToIndex["rcCommand[2]"],
                fieldNameToIndex["rcCommand[3]"],
            ];
            let setpoint: ComputedFieldContext["setpoint"] = [
                fieldNameToIndex["setpoint[0]"],
                fieldNameToIndex["setpoint[1]"],
                fieldNameToIndex["setpoint[2]"],
                fieldNameToIndex["setpoint[3]"],
            ];
            let gpsCoord: ComputedFieldContext["gpsCoord"] = [
                fieldNameToIndex["GPS_coord[0]"],
                fieldNameToIndex["GPS_coord[1]"],
                fieldNameToIndex["GPS_altitude"],
            ];
            let gpsVelNED: ComputedFieldContext["gpsVelNED"] = [
                fieldNameToIndex["GPS_velned[0]"],
                fieldNameToIndex["GPS_velned[1]"],
                fieldNameToIndex["GPS_velned[2]"],
            ];
            let axisPID: ComputedFieldContext["axisPID"] = [
                [
                    fieldNameToIndex["axisP[0]"],
                    fieldNameToIndex["axisI[0]"],
                    fieldNameToIndex["axisD[0]"],
                    fieldNameToIndex["axisF[0]"],
                    fieldNameToIndex["axisS[0]"],
                ],
                [
                    fieldNameToIndex["axisP[1]"],
                    fieldNameToIndex["axisI[1]"],
                    fieldNameToIndex["axisD[1]"],
                    fieldNameToIndex["axisF[1]"],
                    fieldNameToIndex["axisS[1]"],
                ],
                [
                    fieldNameToIndex["axisP[2]"],
                    fieldNameToIndex["axisI[2]"],
                    fieldNameToIndex["axisD[2]"],
                    fieldNameToIndex["axisF[2]"],
                    fieldNameToIndex["axisS[2]"],
                ],
            ];

            if (!magADC[0]) {
                magADC = false;
            }
            if (!gyroADC[0]) {
                gyroADC = false;
            }
            if (!accSmooth[0]) {
                accSmooth = false;
            }
            if (!imuQuaternion[0]) {
                imuQuaternion = false;
            }
            if (!rcCommand[0]) {
                rcCommand = false;
            }
            if (!setpoint[0]) {
                setpoint = false;
            }
            if (!axisPID[0]) {
                axisPID = false;
            }
            if (!gpsCoord[0]) {
                gpsCoord = false;
            }
            if (!gpsVelNED[0]) {
                gpsVelNED = false;
            }

            return {
                gyroADC,
                accSmooth,
                magADC,
                imuQuaternion,
                rcCommand,
                setpoint,
                gpsCoord,
                gpsVelNED,
                axisPID,
                numSatIndex: fieldNameToIndex["GPS_numSat"],
                flightModeFlagsIndex: fieldNameToIndex["flightModeFlags"],
                sysConfig: this.getSysConfig(),
                disabledFields: this.isFieldDisabled(),
            };
        };

        /**
         * Compute all additional fields for a single frame.
         */
        const computeFrameFields = (
            srcFrame: LogFrame,
            destFrame: LogFrame,
            chunkIMU: IMU,
            ctx: ComputedFieldContext,
        ): void => {
            let fieldIndex = destFrame.length - ADDITIONAL_COMPUTED_FIELD_COUNT;

            fieldIndex = computeAttitude(srcFrame, destFrame, fieldIndex, {
                imuQuaternion: ctx.imuQuaternion,
                gyroADC: ctx.gyroADC,
                accSmooth: ctx.accSmooth,
                magADC: ctx.magADC,
                chunkIMU,
                sysConfig: ctx.sysConfig,
            });

            // axisPID is always a list: resolveFieldIndices() only drops it when its first entry,
            // itself a list, is falsy, which it never is.
            if (!ctx.disabledFields.PID) {
                fieldIndex = computePidSums(srcFrame, destFrame, fieldIndex, ctx.axisPID || [], ctx.sysConfig);
            }

            const currentFlightMode = fieldAt(srcFrame, ctx.flightModeFlagsIndex);
            const fieldIndexRcCommands = fieldIndex;

            if (!ctx.disabledFields.SETPOINT) {
                fieldIndex = computeScaledRcCommands(
                    srcFrame,
                    destFrame,
                    fieldIndex,
                    ctx.setpoint,
                    ctx.rcCommand,
                    currentFlightMode,
                    ctx.sysConfig,
                );
            }

            if (!ctx.disabledFields.GYRO && !ctx.disabledFields.SETPOINT) {
                fieldIndex = computePidErrors(srcFrame, destFrame, fieldIndex, fieldIndexRcCommands, ctx.gyroADC);
            }

            if (gpsTransform && ctx.gpsCoord) {
                fieldIndex = computeGpsFields(srcFrame, destFrame, fieldIndex, ctx.gpsCoord, ctx.numSatIndex);
            }

            if (ctx.gpsVelNED) {
                fieldIndex = computeTrajectoryTilt(srcFrame, destFrame, fieldIndex, ctx.gpsVelNED);
            }

            destFrame.splice(fieldIndex);
        };

        /**
         * Use the data in sourceChunks to compute additional fields (like IMU attitude) and add those into the
         * resultChunks.
         *
         * sourceChunks and destChunks can be the same array.
         */
        const injectComputedFields = (sourceChunks: Chunk[], destChunks: Chunk[]): void => {
            if (destChunks.length === 0) {
                return;
            }

            const ctx = resolveFieldIndices();

            let sourceChunkIndex = 0;
            let destChunkIndex = 0;

            // Skip leading source chunks that don't appear in the destination
            while (sourceChunks[sourceChunkIndex].index < destChunks[destChunkIndex].index) {
                sourceChunkIndex++;
            }

            for (; destChunkIndex < destChunks.length; sourceChunkIndex++, destChunkIndex++) {
                const destChunk = destChunks[destChunkIndex];
                const sourceChunk = sourceChunks[sourceChunkIndex];

                if (!destChunk.hasAdditionalFields) {
                    destChunk.hasAdditionalFields = true;
                    const chunkIMU = new IMU(sourceChunk.initialIMU);

                    // Restore this chunk's GPS home so the computed GPS fields (cartesian
                    // coordinates / home distance / azimuth) reference the home that was active for
                    // the chunk being processed, not whichever chunk happened to be parsed last.
                    gpsTransform = null;
                    const initialGPSHome = sourceChunk.initialGPSHome;
                    if (initialGPSHome) {
                        gpsTransform = homeTransform(initialGPSHome);
                    }

                    for (let i = 0; i < sourceChunk.frames.length; i++) {
                        computeFrameFields(sourceChunk.frames[i], destChunk.frames[i], chunkIMU, ctx);
                    }
                }
            }
        };

        /**
         * Add timestamps to events that getChunksInRange was unable to compute, because at the time it had trailing
         * events in its chunk array but no next-chunk to take the times from for those events.
         *
         * Set processLastChunk to true if the last chunk of this array is the final chunk in the file.
         */
        function addMissingEventTimes(chunks: Chunk[], processLastChunk: boolean): void {
            /*
             * If we're at the end of the file then we will compute event times for the last chunk, otherwise we'll
             * wait until we have the next chunk to fill in times for this last chunk.
             */
            const endChunk = processLastChunk ? chunks.length : chunks.length - 1;

            for (let i = 0; i < endChunk; i++) {
                const chunk = chunks[i];

                if (chunk.needsEventTimes) {
                    // What is the time of the next frame after the chunk with the trailing events? We'll use that for
                    // the event times. At the end of the log, assume they were logged sometime after the final frame.
                    const nextFrame = i + 1 < chunks.length ? chunks[i + 1].frames[0] : chunk.frames.at(-1)!;
                    fillTrailingEventTimes(chunk, nextFrame[FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME]);

                    delete chunk.needsEventTimes;
                }
            }
        }

        /**
         * A smoothed copy of `sourceChunk`, from the cache if it was smoothed already (`done`), else in
         * recycled or new memory, to be smoothed now.
         */
        const smoothedCopy = (sourceChunk: Chunk): { chunk: Chunk; done: boolean } => {
            const cached = smoothedCache.get(sourceChunk.index);
            if (cached) {
                return { chunk: cached, done: true };
            }

            let resultChunk = smoothedCache.recycle();

            if (resultChunk) {
                //Reuse the memory from the expired chunk to reduce garbage
                resultChunk.index = sourceChunk.index;
                resultChunk.frames.length = sourceChunk.frames.length;
                resultChunk.gapStartsHere = sourceChunk.gapStartsHere;
                resultChunk.events = sourceChunk.events;

                //Copy frames onto the expired chunk:
                for (let j = 0; j < resultChunk.frames.length; j++) {
                    copyFrameInto(resultChunk.frames, j, sourceChunk.frames[j]);
                }
            } else {
                //Allocate a new chunk
                resultChunk = {
                    index: sourceChunk.index,
                    frames: new Array(sourceChunk.frames.length),
                    gapStartsHere: sourceChunk.gapStartsHere,
                    events: sourceChunk.events,
                };

                for (let j = 0; j < resultChunk.frames.length; j++) {
                    resultChunk.frames[j] = sourceChunk.frames[j].slice(0) as LogFrame;
                }
            }

            smoothedCache.add(resultChunk.index, resultChunk);
            return { chunk: resultChunk, done: false };
        };

        /**
         * Get an array of chunk data which has been smoothed by the previously-configured smoothing settings. The frames
         * in the chunks will at least span the range given by [startTime...endTime].
         */
        this.getSmoothedChunksInTimeRange = function (startTime, endTime) {
            /*
             * Ensure that the range that the caller asked for can be fully smoothed by expanding the request
             * for source chunks on either side of the range asked for (to smooth the chunks on the edges, we
             * need to be able to see their neighbors)
             */
            let leadingROChunks = 1,
                trailingROChunks = 1;
            let startIndex = binarySearchOrPrevious(iframeDirectory.times, startTime - maxSmoothing) - leadingROChunks;
            let endIndex = binarySearchOrNext(iframeDirectory.times, endTime + maxSmoothing) + trailingROChunks;

            /*
             * If our expanded source chunk range exceeds the actual source chunks available, trim down our leadingROChunks
             * and trailingROChunks to match (i.e. we are allowed to smooth the first and last chunks of the file despite
             * there not being a chunk past them to smooth against on one side).
             */
            if (startIndex < 0) {
                leadingROChunks += startIndex;
                startIndex = 0;
            }

            if (endIndex > iframeDirectory.offsets.length - 1) {
                trailingROChunks -= endIndex - (iframeDirectory.offsets.length - 1);
                endIndex = iframeDirectory.offsets.length - 1;
            }

            const sourceChunks = getChunksInIndexRange(startIndex, endIndex);

            verifyChunkIndexes(sourceChunks);

            //Create an independent copy of the raw frame data to smooth out:
            const resultChunks: Chunk[] = new Array(sourceChunks.length - leadingROChunks - trailingROChunks);
            const chunkAlreadyDone: boolean[] = new Array(sourceChunks.length);

            let allDone = true;

            //Don't smooth the edge chunks since they can't be fully smoothed
            for (let i = leadingROChunks; i < sourceChunks.length - trailingROChunks; i++) {
                const { chunk, done } = smoothedCopy(sourceChunks[i]);
                chunkAlreadyDone[i] = done;
                allDone &&= done;
                resultChunks[i - leadingROChunks] = chunk;
            }

            if (!allDone) {
                const pass: SmoothingPass = {
                    sourceChunks,
                    resultChunks,
                    chunkAlreadyDone,
                    leadingROChunks,
                    trailingROChunks,
                };
                for (const [fieldKey, radius] of Object.entries(fieldSmoothing)) {
                    // Object.entries() gives the index as a string; an array reads "5" and 5 alike.
                    smoothField(pass, Number(fieldKey), radius);
                }
            }

            addMissingEventTimes(sourceChunks, trailingROChunks === 0);

            verifyChunkIndexes(sourceChunks);
            verifyChunkIndexes(resultChunks);

            return resultChunks;
        };

        /**
         * Attempt to open the log with the given index, returning true on success.
         */
        this.openLog = function (index) {
            if (this.getLogError(index)) {
                return false;
            }

            logIndex = index;

            chunkCache.clear();
            smoothedCache.clear();

            iframeDirectory = logIndexes.getIntraframeDirectory(index);

            parser.parseHeader(logIndexes.getLogBeginOffset(index), logIndexes.getLogBeginOffset(index + 1));

            buildFieldNames();
            rcCommandRescale = legacyRcCommandRescale(this.getSysConfig(), fieldNameToIndex);

            estimateNumMotors();
            estimateNumCells();

            return true;
        };

        this.hasGpsData = function () {
            return Boolean(this.getStats()?.frame?.G);
        };

        this.getMinMaxForFieldDuringAllTime = function (field_name) {
            const stats = this.getStats();
            let range;

            const fieldIndex = this.getMainFieldIndexByName(field_name),
                fieldStat = fieldIndex === undefined ? false : stats.field[fieldIndex];

            if (fieldStat) {
                range = {
                    min: fieldStat.min,
                    max: fieldStat.max,
                };
            } else {
                range = this.getMinMaxForFieldDuringTimeInterval(field_name, this.getMinTime(), this.getMaxTime());
            }

            return range;
        };

        /**
         * Function to compute min and max curve values during time interval.
         * @param {string} field_name - Curve field name.
         * @param {number} start_time - The interval start time.
         * @param {number} end_time - The interval end time.
         * @returns {{min: number, max: number} | undefined} - Min and max values if success, or undefined if error
         */
        this.getMinMaxForFieldDuringTimeInterval = function (field_name, start_time, end_time) {
            const chunks = this.getSmoothedChunksInTimeRange(start_time, end_time);
            let startFrameIndex;
            let minValue = Number.MAX_VALUE,
                maxValue = -Number.MAX_VALUE;

            const fieldIndex = this.getMainFieldIndexByName(field_name);
            if (chunks.length === 0 || fieldIndex === undefined) {
                return undefined;
            }

            //Find the first sample that lies inside the window
            for (startFrameIndex = 0; startFrameIndex < chunks[0].frames.length; startFrameIndex++) {
                if (
                    chunks[0].frames[startFrameIndex][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME] >=
                    start_time
                ) {
                    break;
                }
            }

            // Pick the sample before that to begin plotting from
            if (startFrameIndex > 0) {
                startFrameIndex--;
            }

            let frameIndex = startFrameIndex;
            findingLoop: for (const chunk of chunks) {
                for (; frameIndex < chunk.frames.length; frameIndex++) {
                    const fieldValue = fieldNumber(chunk.frames[frameIndex], fieldIndex);
                    const frameTime = chunk.frames[frameIndex][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME];
                    if (frameTime > end_time) {
                        break findingLoop;
                    }
                    minValue = Math.min(minValue, fieldValue);
                    maxValue = Math.max(maxValue, fieldValue);
                }
                frameIndex = 0;
            }

            if (minValue !== Number.MAX_VALUE && maxValue !== -Number.MAX_VALUE) {
                return {
                    min: minValue,
                    max: maxValue,
                };
            } else {
                return undefined;
            }
        };

        this.getCurrentLogRowsCount = function () {
            const stats = this.getStats(this.getLogIndex());
            // An open log has valid I and P frames (see getStats())
            return stats.frame["I"]!.validCount + stats.frame["P"]!.validCount;
        };
    }

    accRawToGs(value: number): number {
        return value / this.getSysConfig().acc_1G;
    }

    gyroRawToDegreesPerSecond(value: number): number {
        return ((this.getSysConfig().gyroScale * 1000000) / (Math.PI / 180)) * value;
    }

    /***

        The rcCommandToDegreesPerSecond function is betaflight version specific
        due to the coding improvements from v2.8.0 onwards

    **/

    // Convert rcCommand to degrees per second
    rcCommandRawToDegreesPerSecond(value: number, axis: number, currentFlightMode: number | null | undefined): number {
        const sysConfig = this.getSysConfig();

        if (firmwareGreaterOrEqual(sysConfig, "3.0.0", "2.0.0")) {
            return setpointRate(sysConfig, axis, value);
        } else if (firmwareGreaterOrEqual(sysConfig, "2.8.0")) {
            return rateFrom28(sysConfig, value, axis) >> 2; // the shift by 2 is to counterbalance the divide by 4 that occurs on the gyro to calculate the error
        }
        // earlier version of betaflight
        return rateBefore28(sysConfig, value, axis, currentFlightMode, (mode) => this.getFlightMode(mode).SuperExpo);
    }

    rcCommandRawToThrottle(value: number): number {
        // Throttle displayed as percentage
        return Math.min(
            Math.max(
                ((value - this.getSysConfig().minthrottle) /
                    (this.getSysConfig().maxthrottle - this.getSysConfig().minthrottle)) *
                    100,
                0,
            ),
            100,
        );
    }

    // rcCommandThrottle back transform function
    ThrottleTorcCommandRaw(value: number): number {
        // Throttle displayed as percentage
        return (
            (value / 100) * (this.getSysConfig().maxthrottle - this.getSysConfig().minthrottle) +
            this.getSysConfig().minthrottle
        );
    }

    rcMotorRawToPctPhysical(value: number): number {
        // Motor displayed as percentage
        let motorPct;
        if (this.isDigitalProtocol()) {
            motorPct = ((value - DSHOT_MIN_VALUE) / DSHOT_RANGE) * 100;
        } else {
            const MAX_ANALOG_VALUE = this.getSysConfig().maxthrottle;
            const MIN_ANALOG_VALUE = this.getSysConfig().minthrottle;
            const ANALOG_RANGE = MAX_ANALOG_VALUE - MIN_ANALOG_VALUE;
            motorPct = ((value - MIN_ANALOG_VALUE) / ANALOG_RANGE) * 100;
        }
        return Math.min(Math.max(motorPct, 0), 100);
    }

    // rcMotorRaw back transform function
    PctPhysicalTorcMotorRaw(value: number): number {
        // Motor displayed as percentage
        let motorRaw;
        if (this.isDigitalProtocol()) {
            motorRaw = (value / 100) * DSHOT_RANGE + DSHOT_MIN_VALUE;
        } else {
            const MAX_ANALOG_VALUE = this.getSysConfig().maxthrottle;
            const MIN_ANALOG_VALUE = this.getSysConfig().minthrottle;
            const ANALOG_RANGE = MAX_ANALOG_VALUE - MIN_ANALOG_VALUE;
            motorRaw = (value / 100) * ANALOG_RANGE + MIN_ANALOG_VALUE;
        }
        return motorRaw;
    }

    isDigitalProtocol(): boolean {
        let digitalProtocol;
        // An absent protocol reads FAST_PROTOCOL[undefined], which is undefined: digital, by the default.
        switch (FAST_PROTOCOL[this.getSysConfig().fast_pwm_protocol as number]) {
            case "PWM":
            case "ONESHOT125":
            case "ONESHOT42":
            case "MULTISHOT":
            case "BRUSHED":
                digitalProtocol = false;
                break;
            case "DSHOT150":
            case "DSHOT300":
            case "DSHOT600":
            case "DSHOT1200":
            case "PROSHOT1000":
            default:
                digitalProtocol = true;
                break;
        }
        return digitalProtocol;
    }

    getPIDPercentage(value: number): number {
        // PID components and outputs are displayed as percentage (raw value is 0-1000)
        return value / 10;
    }

    getReferenceVoltageMillivolts(): number {
        if (
            this.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
            semver.gte(this.getSysConfig().firmwareVersion, "4.0.0")
        ) {
            return this.getSysConfig().vbatref * 10;
        } else if (
            (this.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                semver.gte(this.getSysConfig().firmwareVersion, "3.1.0")) ||
            (this.getSysConfig().firmwareType === FIRMWARE_TYPE_CLEANFLIGHT &&
                semver.gte(this.getSysConfig().firmwareVersion, "2.0.0"))
        ) {
            return this.getSysConfig().vbatref * 100;
        } else {
            return this.vbatADCToMillivolts(this.getSysConfig().vbatref);
        }
    }

    vbatADCToMillivolts(vbatADC: number): number {
        const ADCVREF = 33;

        // ADC is 12 bit (i.e. max 0xFFF), voltage reference is 3.3V, vbatscale is premultiplied by 100
        return (vbatADC * ADCVREF * 10 * this.getSysConfig().vbatscale) / 0xfff;
    }

    amperageADCToMillivolts(amperageADC: number): number {
        const ADCVREF = 33;
        let millivolts = (amperageADC * ADCVREF * 100) / 4095;

        millivolts -= Number(this.getSysConfig().currentMeterOffset);

        return (millivolts * 10000) / Number(this.getSysConfig().currentMeterScale);
    }

    getFlightMode(currentFlightMode: number): Record<string, boolean> {
        return {
            Arm: (currentFlightMode & 1) !== 0,
            Angle: (currentFlightMode & (1 << 1)) !== 0,
            Horizon: (currentFlightMode & (1 << 2)) !== 0,
            Baro: (currentFlightMode & (1 << 3)) !== 0,
            AntiGravity: (currentFlightMode & (1 << 4)) !== 0,
            Headfree: (currentFlightMode & (1 << 5)) !== 0,
            HeadAdj: (currentFlightMode & (1 << 6)) !== 0,
            CamStab: (currentFlightMode & (1 << 7)) !== 0,
            CamTrig: (currentFlightMode & (1 << 8)) !== 0,
            GPSHome: (currentFlightMode & (1 << 9)) !== 0,
            GPSHold: (currentFlightMode & (1 << 10)) !== 0,
            Passthrough: (currentFlightMode & (1 << 11)) !== 0,
            Beeper: (currentFlightMode & (1 << 12)) !== 0,
            LEDMax: (currentFlightMode & (1 << 13)) !== 0,
            LEDLow: (currentFlightMode & (1 << 14)) !== 0,
            LLights: (currentFlightMode & (1 << 15)) !== 0,
            Calib: (currentFlightMode & (1 << 16)) !== 0,
            GOV: (currentFlightMode & (1 << 17)) !== 0,
            OSD: (currentFlightMode & (1 << 18)) !== 0,
            Telemetry: (currentFlightMode & (1 << 19)) !== 0,
            GTune: (currentFlightMode & (1 << 20)) !== 0,
            Sonar: (currentFlightMode & (1 << 21)) !== 0,
            Servo1: (currentFlightMode & (1 << 22)) !== 0,
            Servo2: (currentFlightMode & (1 << 23)) !== 0,
            Servo3: (currentFlightMode & (1 << 24)) !== 0,
            Blackbox: (currentFlightMode & (1 << 25)) !== 0,
            Failsafe: (currentFlightMode & (1 << 26)) !== 0,
            Airmode: (currentFlightMode & (1 << 27)) !== 0,
            SuperExpo: (currentFlightMode & (1 << 28)) !== 0,
            _3DDisableSwitch: (currentFlightMode & (1 << 29)) !== 0,
            CheckboxItemCount: (currentFlightMode & (1 << 30)) !== 0,
        };
    }

    getFeatures(enabledFeatures: number): Record<string, boolean> {
        return {
            RX_PPM: (enabledFeatures & 1) !== 0,
            VBAT: (enabledFeatures & (1 << 1)) !== 0,
            INFLIGHT_ACC_CAL: (enabledFeatures & (1 << 2)) !== 0,
            RX_SERIAL: (enabledFeatures & (1 << 3)) !== 0,
            MOTOR_STOP: (enabledFeatures & (1 << 4)) !== 0,
            SERVO_TILT: (enabledFeatures & (1 << 5)) !== 0,
            SOFTSERIAL: (enabledFeatures & (1 << 6)) !== 0,
            GPS: (enabledFeatures & (1 << 7)) !== 0,
            FAILSAFE: (enabledFeatures & (1 << 8)) !== 0,
            SONAR: (enabledFeatures & (1 << 9)) !== 0,
            TELEMETRY: (enabledFeatures & (1 << 10)) !== 0,
            CURRENT_METER: (enabledFeatures & (1 << 11)) !== 0,
            _3D: (enabledFeatures & (1 << 12)) !== 0,
            RX_PARALLEL_PWM: (enabledFeatures & (1 << 13)) !== 0,
            RX_MSP: (enabledFeatures & (1 << 14)) !== 0,
            RSSI_ADC: (enabledFeatures & (1 << 15)) !== 0,
            LED_STRIP: (enabledFeatures & (1 << 16)) !== 0,
            DISPLAY: (enabledFeatures & (1 << 17)) !== 0,
            ONESHOT125: (enabledFeatures & (1 << 18)) !== 0,
            BLACKBOX: (enabledFeatures & (1 << 19)) !== 0,
            CHANNEL_FORWARDING: (enabledFeatures & (1 << 20)) !== 0,
            TRANSPONDER: (enabledFeatures & (1 << 21)) !== 0,
            AIRMODE: (enabledFeatures & (1 << 22)) !== 0,
            SUPEREXPO_RATES: (enabledFeatures & (1 << 23)) !== 0,
            ANTI_GRAVITY: (enabledFeatures & (1 << 24)) !== 0,
        };
    }

    isFieldDisabled(): DisabledFields {
        // Without the header every bit tests as clear, as `&` made of a missing value.
        const disabledFields = Number(this.getSysConfig().fields_disabled_mask);
        const disabledFieldsFlags: DisabledFields = {};
        if (
            this.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
            firmwareGreaterOrEqual(this.getSysConfig(), "2025.12.0")
        ) {
            disabledFieldsFlags.PID = (disabledFields & 1) !== 0;
            disabledFieldsFlags.RC_COMMANDS = (disabledFields & (1 << 1)) !== 0;
            disabledFieldsFlags.SETPOINT = (disabledFields & (1 << 2)) !== 0;
            disabledFieldsFlags.BATTERY = (disabledFields & (1 << 3)) !== 0;
            disabledFieldsFlags.MAGNETOMETER = (disabledFields & (1 << 4)) !== 0;
            disabledFieldsFlags.ALTITUDE = (disabledFields & (1 << 5)) !== 0;
            disabledFieldsFlags.RSSI = (disabledFields & (1 << 6)) !== 0;
            disabledFieldsFlags.GYRO = (disabledFields & (1 << 7)) !== 0;
            disabledFieldsFlags.ATTITUDE = (disabledFields & (1 << 8)) !== 0;
            disabledFieldsFlags.ACC = (disabledFields & (1 << 9)) !== 0;
            disabledFieldsFlags.DEBUG = (disabledFields & (1 << 10)) !== 0;
            disabledFieldsFlags.MOTORS = (disabledFields & (1 << 11)) !== 0;
            disabledFieldsFlags.GPS = (disabledFields & (1 << 12)) !== 0;
            disabledFieldsFlags.RPM = (disabledFields & (1 << 13)) !== 0;
            disabledFieldsFlags.GYROUNFILT = (disabledFields & (1 << 14)) !== 0;
            disabledFieldsFlags.SERVO = (disabledFields & (1 << 15)) !== 0;
        } else {
            disabledFieldsFlags.PID = (disabledFields & 1) !== 0;
            disabledFieldsFlags.RC_COMMANDS = (disabledFields & (1 << 1)) !== 0;
            disabledFieldsFlags.SETPOINT = (disabledFields & (1 << 2)) !== 0;
            disabledFieldsFlags.BATTERY = (disabledFields & (1 << 3)) !== 0;
            disabledFieldsFlags.MAGNETOMETER = (disabledFields & (1 << 4)) !== 0;
            disabledFieldsFlags.ALTITUDE = (disabledFields & (1 << 5)) !== 0;
            disabledFieldsFlags.RSSI = (disabledFields & (1 << 6)) !== 0;
            disabledFieldsFlags.GYRO = (disabledFields & (1 << 7)) !== 0;
            disabledFieldsFlags.ACC = (disabledFields & (1 << 8)) !== 0;
            disabledFieldsFlags.DEBUG = (disabledFields & (1 << 9)) !== 0;
            disabledFieldsFlags.MOTORS = (disabledFields & (1 << 10)) !== 0;
            disabledFieldsFlags.GPS = (disabledFields & (1 << 11)) !== 0;
            disabledFieldsFlags.RPM = (disabledFields & (1 << 12)) !== 0;
            disabledFieldsFlags.GYROUNFILT = (disabledFields & (1 << 13)) !== 0;
        }

        if (firmwareGreaterOrEqual(this.getSysConfig(), "2026.12.0")) {
            disabledFieldsFlags.PITOT = (disabledFields & (1 << 16)) !== 0;
        }

        return disabledFieldsFlags;
    }
}
