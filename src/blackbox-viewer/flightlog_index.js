import { FlightLogParser } from "./flightlog_parser";
import { FlightLogEvent } from "./flightlog_fielddefs";
import { IMU } from "./imu";
import { ArrayDataStream } from "./datastream";
import "./decoders";

export function FlightLogIndex(logData) {
    //Private:
    const that = this;
    let logBeginOffsets = false;
    let intraframeDirectories = false;

    function buildLogOffsetsIndex() {
        const stream = new ArrayDataStream(logData);
        let i;
        let logStart;

        logBeginOffsets = [];

        for (i = 0; ; i++) {
            logStart = stream.nextOffsetOf(FlightLogParser.prototype.FLIGHT_LOG_START_MARKER);

            if (logStart === -1) {
                //No more logs found in the file
                logBeginOffsets.push(stream.end);
                break;
            }

            logBeginOffsets.push(logStart);

            //Restart the search after this header
            stream.pos = logStart + FlightLogParser.prototype.FLIGHT_LOG_START_MARKER.length;
        }
    }

    function buildIntraframeDirectories() {
        const parser = new FlightLogParser(logData, that);

        intraframeDirectories = [];

        for (let i = 0; i < that.getLogCount(); i++) {
            const intraIndex = {
                times: [],
                offsets: [],
                avgThrottle: [],
                maxRC: [],
                maxMotorDiff: [],
                initialIMU: [],
                initialSlow: [],
                initialGPSHome: [],
                initialGPS: [],
                hasEvent: [],
                minTime: false,
                maxTime: false,
                unLoggedTime: 0,
            };
            const imu = new IMU();
            let iframeCount = 0;
            const motorFields = [];
            const maxRCFields = [];
            let throttleTotal;
            let rcTotal;
            let maxMotor;
            let minMotor;
            let parsedHeader;
            let sawEndMarker = false;

            try {
                parser.parseHeader(logBeginOffsets[i], logBeginOffsets[i + 1]);
                parsedHeader = true;
            } catch (e) {
                console.log(`Error parsing header of log #${i + 1}: ${e}`);
                intraIndex.error = e;

                parsedHeader = false;
            }

            // Only attempt to parse the log if the header wasn't corrupt
            if (parsedHeader) {
                const sysConfig = parser.sysConfig;
                const mainFrameDef = parser.frameDefs.I;
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
                let magADC = [
                    mainFrameDef.nameToIndex["magADC[0]"],
                    mainFrameDef.nameToIndex["magADC[1]"],
                    mainFrameDef.nameToIndex["magADC[2]"],
                ];
                let lastSlow = [];
                let lastGPSHome = [];
                let lastGPS = [];

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

                let frameTime;
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
                                    intraIndex.initialSlow.push(lastSlow);
                                    intraIndex.initialGPSHome.push(lastGPSHome);
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
                                    intraIndex.unLoggedTime += frame.data.currentTime - frameTime;
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

            intraframeDirectories.push(intraIndex);
        }
    }

    //Public:
    this.loadFromJSON = function (_json) {};

    this.saveToJSON = function () {
        const intraframeDirectories = this.getIntraframeDirectories();
        let i;
        let j;
        const resultIndexes = new Array(intraframeDirectories.length);

        for (i = 0; i < intraframeDirectories.length; i++) {
            let lastTime;
            let lastLastTime;
            let lastOffset;
            let lastLastOffset;
            const sourceIndex = intraframeDirectories[i];
            const resultIndex = {
                times: new Array(sourceIndex.times.length),
                offsets: new Array(sourceIndex.offsets.length),
                minTime: sourceIndex.minTime,
                maxTime: sourceIndex.maxTime,
                avgThrottle: new Array(sourceIndex.avgThrottle.length),
                maxRC: new Array(sourceIndex.maxRC.length),
                maxMotorDiff: new Array(sourceIndex.maxMotorDiff.length),
            };

            if (sourceIndex.times.length > 0) {
                resultIndex.times[0] = sourceIndex.times[0];
                resultIndex.offsets[0] = sourceIndex.offsets[0];

                lastLastTime = lastTime = sourceIndex.times[0];
                lastLastOffset = lastOffset = sourceIndex.offsets[0];

                for (j = 1; j < sourceIndex.times.length; j++) {
                    resultIndex.times[j] = sourceIndex.times[j] - 2 * lastTime + lastLastTime;
                    resultIndex.offsets[j] = sourceIndex.offsets[j] - 2 * lastOffset + lastLastOffset;

                    lastLastTime = lastTime;
                    lastTime = sourceIndex.times[j];

                    lastLastOffset = lastOffset;
                    lastOffset = sourceIndex.offsets[j];
                }
            }

            if (sourceIndex.avgThrottle.length > 0) {
                // Assuming that avgThrottle, maxRC and maxMotorDiff Arrays are the same length
                // since they are build in the same loop. Just to get rid of a codesmell on Sonarcloud
                for (let j = 0; j < sourceIndex.avgThrottle.length; j++) {
                    resultIndex.avgThrottle[j] = sourceIndex.avgThrottle[j] - 1000;
                    resultIndex.maxRC[j] = sourceIndex.maxRC[j] * 20 - 1000;
                    resultIndex.maxMotorDiff[j] = sourceIndex.maxMotorDiff[j] * 20 - 1000;
                }
            }
            resultIndexes[i] = resultIndex;
        }

        return JSON.stringify(resultIndexes);
    };

    this.getLogBeginOffset = function (index) {
        if (!logBeginOffsets) {
            buildLogOffsetsIndex();
        }

        return logBeginOffsets[index];
    };

    this.getLogCount = function () {
        if (!logBeginOffsets) {
            buildLogOffsetsIndex();
        }

        return logBeginOffsets.length - 1;
    };

    this.getIntraframeDirectories = function () {
        if (!intraframeDirectories) {
            buildIntraframeDirectories();
        }

        return intraframeDirectories;
    };

    this.getIntraframeDirectory = function (logIndex) {
        return this.getIntraframeDirectories()[logIndex];
    };
}
