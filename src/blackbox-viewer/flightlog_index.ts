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

import {
    FlightLogParser,
    type FrameDef,
    type FrameReadyArgs,
    type LogEvent,
    type ParserStats,
    type SysConfig,
} from "./flightlog_parser";
import { AXIS, FlightLogEvent } from "./flightlog_fielddefs";
import { IMU } from "./imu";
import { ArrayDataStream } from "../js/blackbox/datastream";

/** What the index records for one log in the file, so FlightLog can seek it chunk by chunk. */
export interface IntraframeDirectory {
    /** Time and file offset of every 4th I-frame: the start of each chunk. */
    times: number[];
    offsets: number[];
    /** Per chunk, from its first I-frame; empty when the log has no motor (or rcCommand) fields. */
    avgThrottle: number[];
    maxRC: number[];
    maxMotorDiff: number[];
    /** Per chunk: the state at its start of everything not logged anew in every frame. */
    initialIMU: IMU[];
    /** Only present when the log has S (or H) frames. */
    initialSlow?: number[][];
    initialGPSHome?: number[][];
    initialGPS: number[][];
    /** True for a chunk that contains an event. */
    hasEvent: boolean[];
    /** `false` when no valid main frame was found. */
    minTime: number | false;
    maxTime: number | false;
    unLoggedTime: number;
    /** A thrown header or data error, or a message when the log has no data. */
    error?: unknown;
    stats?: ParserStats;
}

/** Field indexes of the main frame that the index reads; `false` for magnetometer fields the log lacks. */
interface IndexedFields {
    gyroADC: number[];
    accSmooth: number[];
    magADC: number[] | false;
    motors: number[];
    rcCommands: number[];
    rcCommandGain: number;
}

/** A linear map from a logged field value to the units the viewer reads it in. */
export interface FieldScale {
    gain: number;
    offset: number;
}

/**
 * Logs with an `rc_command_scale` header carry rcCommand as roll/pitch/yaw -1..1 and throttle 0..1 times
 * that scale. The viewer reads rcCommand in the units logged before it: roll/pitch/yaw -500..500 and
 * throttle 1000..2000, both times the high resolution scale. Null for a log without the header.
 */
export function legacyRcCommandScale(sysConfig: SysConfig, axis: number): FieldScale | null {
    const scale = Number(sysConfig.rc_command_scale);
    if (Number.isNaN(scale) || scale <= 0) {
        return null;
    }
    if (axis === AXIS.YAW + 1) {
        const highResolutionScale = Number(sysConfig.blackbox_high_resolution) > 0 ? 10 : 1;
        return { gain: 1000 / scale, offset: 1000 * highResolutionScale };
    }
    return { gain: 500 / scale, offset: 0 };
}

function indexedFields(mainFrameDef: FrameDef, sysConfig: SysConfig): IndexedFields {
    const index = (name: string) => mainFrameDef.nameToIndex[name];
    const motors: number[] = [];
    const rcCommands: number[] = [];

    // Identify motor fields so they can be used to show the activity summary bar
    for (let j = 0; j < 8; j++) {
        if (index(`motor[${j}]`) !== undefined) {
            motors.push(index(`motor[${j}]`));
        }
    }

    for (let j = 0; j < 3; j++) {
        if (index(`rcCommand[${j}]`) === undefined) {
            console.log("RCField not found");
        } else {
            rcCommands.push(index(`rcCommand[${j}]`));
        }
    }

    const magADC = [index("magADC[0]"), index("magADC[1]"), index("magADC[2]")];
    return {
        gyroADC: [index("gyroADC[0]"), index("gyroADC[1]"), index("gyroADC[2]")],
        accSmooth: [index("accSmooth[0]"), index("accSmooth[1]"), index("accSmooth[2]")],
        // Do we have mag fields? If not mark that data as absent
        magADC: magADC[0] === undefined ? false : magADC,
        motors,
        rcCommands,
        rcCommandGain: legacyRcCommandScale(sysConfig, AXIS.ROLL)?.gain ?? 1,
    };
}

/** Record the activity summary of the I-frame a chunk starts with. */
function recordChunkSummary(directory: IntraframeDirectory, frame: number[], fields: IndexedFields): void {
    if (fields.motors.length) {
        let throttleTotal = 0;
        let maxMotor = 0;
        let minMotor = 2000;
        for (const mofo of fields.motors) {
            maxMotor = Math.max(frame[mofo], maxMotor);
            minMotor = Math.min(frame[mofo], minMotor);
            throttleTotal += frame[mofo];
        }

        directory.maxMotorDiff.push(maxMotor - minMotor);
        directory.avgThrottle.push(Math.round(throttleTotal / fields.motors.length));
    }
    if (fields.rcCommands.length) {
        let rcTotal = 0;
        for (const rcfo of fields.rcCommands) {
            rcTotal += Math.max(rcTotal, Math.abs(frame[rcfo]) * fields.rcCommandGain);
        }

        directory.maxRC.push(rcTotal);
    }
}

/** Collects one log's directory from the parser's frames. */
class DirectoryBuilder {
    readonly initialSlow: number[][] = [];
    readonly initialGPSHome: number[][] = [];
    readonly directory: IntraframeDirectory = {
        times: [],
        offsets: [],
        avgThrottle: [],
        maxRC: [],
        maxMotorDiff: [],
        initialIMU: [],
        initialSlow: this.initialSlow,
        initialGPSHome: this.initialGPSHome,
        initialGPS: [],
        hasEvent: [],
        minTime: false,
        maxTime: false,
        unLoggedTime: 0,
    };
    sawEndMarker = false;
    private readonly imu = new IMU();
    private iframeCount = 0;
    private frameTime: number | undefined;
    private lastSlow: number[] = [];
    private lastGPSHome: number[] = [];
    private lastGPS: number[] = [];

    constructor(
        private readonly fields: IndexedFields,
        private readonly acc_1G: number,
        private readonly gyroScale: number,
    ) {}

    onFrameReady = (...[frameValid, frame, frameType, frameOffset]: FrameReadyArgs): void => {
        if (!frameValid) {
            return;
        }

        switch (frameType) {
            case "P":
            case "I":
                this.mainFrame(frame, frameType, frameOffset);
                break;
            case "G":
                this.lastGPS = frame.slice(0);
                this.lastGPS.shift(); // Remove the time field
                break;
            case "H":
                this.lastGPSHome = frame.slice(0);
                break;
            case "E":
                this.event(frame);
                break;
            case "S":
                this.lastSlow = frame.slice(0);
                break;
        }
    };

    private mainFrame(frame: number[], frameType: "I" | "P", frameOffset: number): void {
        const directory = this.directory;
        const frameTime = frame[FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME];
        this.frameTime = frameTime;
        if (directory.minTime === false) {
            directory.minTime = frameTime;
        }

        if (directory.maxTime === false || frameTime > directory.maxTime) {
            directory.maxTime = frameTime;
        }

        // Start a new chunk on every 4th I-frame
        if (frameType === "I") {
            if (this.iframeCount % 4 === 0) {
                this.startChunk(frame, frameTime, frameOffset);
            }
            this.iframeCount++;
        }

        const { gyroADC, accSmooth, magADC } = this.fields;
        this.imu.updateEstimatedAttitude(
            [frame[gyroADC[0]], frame[gyroADC[1]], frame[gyroADC[2]]],
            [frame[accSmooth[0]], frame[accSmooth[1]], frame[accSmooth[2]]],
            frameTime,
            this.acc_1G,
            this.gyroScale,
            magADC ? [frame[magADC[0]], frame[magADC[1]], frame[magADC[2]]] : false,
        );
    }

    private startChunk(frame: number[], frameTime: number, frameOffset: number): void {
        // Log the beginning of the new chunk
        this.directory.times.push(frameTime);
        this.directory.offsets.push(frameOffset);
        recordChunkSummary(this.directory, frame, this.fields);

        /* To enable seeking to an arbitrary point in the log without re-reading anything
         * that came before, we have to record the initial state of various items which aren't
         * logged anew every iteration.
         */
        this.directory.initialIMU.push(new IMU(this.imu));
        this.initialSlow.push(this.lastSlow);
        this.initialGPSHome.push(this.lastGPSHome);
        this.directory.initialGPS.push(this.lastGPS);
    }

    private event(frame: LogEvent): void {
        const directory = this.directory;
        // Mark that there was an event inside the current chunk
        if (directory.times.length > 0) {
            directory.hasEvent[directory.times.length - 1] = true;
        }

        if (frame.event === FlightLogEvent.LOG_END) {
            this.sawEndMarker = true;
        }

        if (frame.event === FlightLogEvent.LOGGING_RESUME && this.frameTime) {
            // parseEventFrame() reads currentTime for every LOGGING_RESUME
            directory.unLoggedTime += frame.data.currentTime! - this.frameTime;
        }
    }
}

/** Build the directory of the log between `start` and `end`. */
function indexLog(parser: FlightLogParser, logNumber: number, start: number, end: number): IntraframeDirectory {
    try {
        parser.parseHeader(start, end);
    } catch (e) {
        console.log(`Error parsing header of log #${logNumber + 1}: ${e}`);
        const failed = new DirectoryBuilder(indexedFieldsNone, 0, 0);
        failed.directory.error = e;
        return finishDirectory(failed);
    }

    // parseHeader() throws unless the I-frame definition is complete
    const builder = new DirectoryBuilder(
        indexedFields(parser.frameDefs.I!, parser.sysConfig),
        parser.sysConfig.acc_1G,
        parser.sysConfig.gyroScale,
    );
    const directory = builder.directory;
    parser.onFrameReady = builder.onFrameReady;

    try {
        parser.parseLogData(false);
    } catch (e) {
        directory.error = e;
    }

    // Don't bother including the initial (empty) states for S and H frames if we didn't have any in the source data
    if (!parser.frameDefs.S) {
        delete directory.initialSlow;
    }

    if (!parser.frameDefs.H) {
        delete directory.initialGPSHome;
    }

    directory.stats = parser.stats;
    return finishDirectory(builder);
}

/** Fields for a log whose header did not parse: none are read. */
const indexedFieldsNone: IndexedFields = {
    gyroADC: [],
    accSmooth: [],
    magADC: false,
    motors: [],
    rcCommands: [],
    rcCommandGain: 1,
};

function finishDirectory(builder: DirectoryBuilder): IntraframeDirectory {
    const directory = builder.directory;
    // Did we not find any events in this log? A header or data error already says why.
    if (directory.minTime === false && !directory.error) {
        directory.error = builder.sawEndMarker ? "Logging paused, no data" : "Log truncated, no data";
    }
    return directory;
}

export class FlightLogIndex {
    declare getLogBeginOffset: (index: number) => number;
    declare getLogCount: () => number;
    declare getIntraframeDirectories: () => IntraframeDirectory[];
    declare getIntraframeDirectory: (logIndex: number) => IntraframeDirectory;

    constructor(logData: Uint8Array) {
        //Private:
        let logBeginOffsets: number[] | false = false;
        let intraframeDirectories: IntraframeDirectory[] | false = false;

        function buildLogOffsetsIndex() {
            const stream = new ArrayDataStream(logData);
            let i;
            let logStart;
            const offsets: number[] = [];

            logBeginOffsets = offsets;

            for (i = 0; ; i++) {
                logStart = stream.nextOffsetOf(FlightLogParser.prototype.FLIGHT_LOG_START_MARKER);

                if (logStart === -1) {
                    //No more logs found in the file
                    offsets.push(stream.end);
                    break;
                }

                offsets.push(logStart);

                //Restart the search after this header
                stream.pos = logStart + FlightLogParser.prototype.FLIGHT_LOG_START_MARKER.length;
            }
        }

        const buildIntraframeDirectories = () => {
            const parser = new FlightLogParser(logData);
            const directories: IntraframeDirectory[] = [];
            // Only called once the offsets exist (getLogCount() builds them).
            const offsets = (): number[] => logBeginOffsets as number[];

            intraframeDirectories = directories;

            for (let i = 0; i < this.getLogCount(); i++) {
                directories.push(indexLog(parser, i, offsets()[i], offsets()[i + 1]));
            }
        };

        //Public:
        this.getLogBeginOffset = function (index) {
            if (!logBeginOffsets) {
                buildLogOffsetsIndex();
            }

            return (logBeginOffsets as number[])[index];
        };

        this.getLogCount = function () {
            if (!logBeginOffsets) {
                buildLogOffsetsIndex();
            }

            return (logBeginOffsets as number[]).length - 1;
        };

        this.getIntraframeDirectories = function () {
            if (!intraframeDirectories) {
                buildIntraframeDirectories();
            }

            return intraframeDirectories as IntraframeDirectory[];
        };

        this.getIntraframeDirectory = function (logIndex) {
            return this.getIntraframeDirectories()[logIndex];
        };
    }
}
