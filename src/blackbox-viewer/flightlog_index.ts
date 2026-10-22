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

import { FlightLogParser, type ParserStats } from "./flightlog_parser";
import { FlightLogEvent } from "./flightlog_fielddefs";
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
                const initialSlow: number[][] = [];
                const initialGPSHome: number[][] = [];
                const intraIndex: IntraframeDirectory = {
                    times: [],
                    offsets: [],
                    avgThrottle: [],
                    maxRC: [],
                    maxMotorDiff: [],
                    initialIMU: [],
                    initialSlow,
                    initialGPSHome,
                    initialGPS: [],
                    hasEvent: [],
                    minTime: false,
                    maxTime: false,
                    unLoggedTime: 0,
                };
                const imu = new IMU();
                let iframeCount = 0;
                const motorFields: number[] = [];
                const maxRCFields: number[] = [];
                let throttleTotal: number;
                let rcTotal: number;
                let maxMotor: number;
                let minMotor: number;
                let parsedHeader;
                let sawEndMarker = false;

                try {
                    parser.parseHeader(offsets()[i], offsets()[i + 1]);
                    parsedHeader = true;
                } catch (e) {
                    console.log(`Error parsing header of log #${i + 1}: ${e}`);
                    intraIndex.error = e;

                    parsedHeader = false;
                }

                // Only attempt to parse the log if the header wasn't corrupt
                if (parsedHeader) {
                    const sysConfig = parser.sysConfig;
                    // parseHeader() throws unless the I-frame definition is complete
                    const mainFrameDef = parser.frameDefs.I!;
                    const gyroADC = [
                        mainFrameDef.nameToIndex["gyroADC[0]"],
                        mainFrameDef.nameToIndex["gyroADC[1]"],
                        mainFrameDef.nameToIndex["gyroADC[2]"],
                    ];
                    const accSmooth = [
                        mainFrameDef.nameToIndex["accSmooth[0]"],
                        mainFrameDef.nameToIndex["accSmooth[1]"],
                        mainFrameDef.nameToIndex["accSmooth[2]"],
                    ];
                    let magADC: number[] | false = [
                        mainFrameDef.nameToIndex["magADC[0]"],
                        mainFrameDef.nameToIndex["magADC[1]"],
                        mainFrameDef.nameToIndex["magADC[2]"],
                    ];
                    let lastSlow: number[] = [];
                    let lastGPSHome: number[] = [];
                    let lastGPS: number[] = [];

                    // Identify motor fields so they can be used to show the activity summary bar
                    for (let j = 0; j < 8; j++) {
                        if (mainFrameDef.nameToIndex[`motor[${j}]`] !== undefined) {
                            motorFields.push(mainFrameDef.nameToIndex[`motor[${j}]`]);
                        }
                    }

                    for (let j = 0; j < 3; j++) {
                        if (mainFrameDef.nameToIndex[`rcCommand[${j}]`] === undefined) {
                            console.log("RCField not found");
                        } else {
                            maxRCFields.push(mainFrameDef.nameToIndex[`rcCommand[${j}]`]);
                        }
                    }

                    // Do we have mag fields? If not mark that data as absent
                    if (magADC[0] === undefined) {
                        magADC = false;
                    }

                    let frameTime: number | undefined;
                    parser.onFrameReady = function (frameValid, frame, frameType, frameOffset, _frameSize) {
                        if (!frameValid) {
                            return;
                        }

                        switch (frameType) {
                            case "P":
                            case "I":
                                frameTime = frame[FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME];
                                if (intraIndex.minTime === false) {
                                    intraIndex.minTime = frameTime;
                                }

                                if (intraIndex.maxTime === false || frameTime > intraIndex.maxTime) {
                                    intraIndex.maxTime = frameTime;
                                }

                                if (frameType === "I") {
                                    // Start a new chunk on every 4th I-frame
                                    if (iframeCount % 4 === 0) {
                                        // Log the beginning of the new chunk
                                        intraIndex.times.push(frameTime);
                                        intraIndex.offsets.push(frameOffset);

                                        if (motorFields.length) {
                                            throttleTotal = 0;
                                            maxMotor = 0;
                                            minMotor = 2000;
                                            for (const mofo of motorFields) {
                                                maxMotor = Math.max(frame[mofo], maxMotor);
                                                minMotor = Math.min(frame[mofo], minMotor);
                                                throttleTotal += frame[mofo];
                                            }

                                            intraIndex.maxMotorDiff.push(maxMotor - minMotor);
                                            intraIndex.avgThrottle.push(Math.round(throttleTotal / motorFields.length));
                                        }
                                        if (maxRCFields.length) {
                                            rcTotal = 0;
                                            for (const rcfo of maxRCFields) {
                                                rcTotal += Math.max(rcTotal, Math.abs(frame[rcfo]));
                                            }

                                            intraIndex.maxRC.push(rcTotal);
                                        }

                                        /* To enable seeking to an arbitrary point in the log without re-reading anything
                                         * that came before, we have to record the initial state of various items which aren't
                                         * logged anew every iteration.
                                         */
                                        intraIndex.initialIMU.push(new IMU(imu));
                                        initialSlow.push(lastSlow);
                                        initialGPSHome.push(lastGPSHome);
                                        intraIndex.initialGPS.push(lastGPS);
                                    }

                                    iframeCount++;
                                }

                                imu.updateEstimatedAttitude(
                                    [frame[gyroADC[0]], frame[gyroADC[1]], frame[gyroADC[2]]],
                                    [frame[accSmooth[0]], frame[accSmooth[1]], frame[accSmooth[2]]],
                                    frame[FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME],
                                    sysConfig.acc_1G,
                                    sysConfig.gyroScale,
                                    magADC ? [frame[magADC[0]], frame[magADC[1]], frame[magADC[2]]] : false,
                                );
                                break;
                            case "G":
                                lastGPS = frame.slice(0);
                                lastGPS.shift(); // Remove the time field
                                break;
                            case "H":
                                lastGPSHome = frame.slice(0);
                                break;
                            case "E":
                                // Mark that there was an event inside the current chunk
                                if (intraIndex.times.length > 0) {
                                    intraIndex.hasEvent[intraIndex.times.length - 1] = true;
                                }

                                if (frame.event === FlightLogEvent.LOG_END) {
                                    sawEndMarker = true;
                                }

                                if (frame.event === FlightLogEvent.LOGGING_RESUME) {
                                    if (frameTime) {
                                        // parseEventFrame() reads currentTime for every LOGGING_RESUME
                                        intraIndex.unLoggedTime += frame.data.currentTime! - frameTime;
                                    }
                                }

                                break;
                            case "S":
                                lastSlow = frame.slice(0);
                                break;
                        }
                    };

                    try {
                        parser.parseLogData(false);
                    } catch (e) {
                        intraIndex.error = e;
                    }

                    // Don't bother including the initial (empty) states for S and H frames if we didn't have any in the source data
                    if (!parser.frameDefs.S) {
                        delete intraIndex.initialSlow;
                    }

                    if (!parser.frameDefs.H) {
                        delete intraIndex.initialGPSHome;
                    }

                    intraIndex.stats = parser.stats;
                }

                // Did we not find any events in this log?
                if (intraIndex.minTime === false) {
                    if (sawEndMarker) {
                        intraIndex.error = "Logging paused, no data";
                    } else {
                        intraIndex.error = "Log truncated, no data";
                    }
                }

                directories.push(intraIndex);
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
