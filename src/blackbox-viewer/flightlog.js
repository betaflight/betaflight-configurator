import semver from "semver";
import { FlightLogIndex } from "./flightlog_index";
import { FlightLogParser } from "./flightlog_parser";
import { GPS_transform } from "./gps_transform";
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
import { IMU } from "./imu";
import { FIFOCache } from "./cache";
import { binarySearchOrPrevious, binarySearchOrNext, constrain, validate, firmwareGreaterOrEqual } from "./tools";

const WARNING_RATE_DIFFERENCE = 0.05;

/*
 * Double check that the indexes of each chunk in the array are in increasing order (bugcheck).
 */
function verifyChunkIndexes(_chunks) {
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
export function FlightLog(logData) {
    const ADDITIONAL_COMPUTED_FIELD_COUNT = 21; /** attitude + PID_SUM + PID_ERROR + RCCOMMAND_SCALED + GPS coord, distance, azimuth, trajectory tilt angle **/
    let logIndex = 0;
    const logIndexes = new FlightLogIndex(logData);
    const parser = new FlightLogParser(logData);
    let iframeDirectory;
    // We cache these details so they don't have to be recomputed on every request:
    let numCells = false,
        numMotors = false;
    let fieldNames = [],
        fieldNameToIndex = {};
    const chunkCache = new FIFOCache(2);
    // Map from field indexes to smoothing window size in microseconds
    let fieldSmoothing = {},
        maxSmoothing = 0;
    const smoothedCache = new FIFOCache(2);
    let gpsTransform = null;

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
    function getRawStats(logIndex) {
        if (logIndex === undefined) {
            return iframeDirectory.stats;
        } else {
            return logIndexes.getIntraframeDirectory(logIndex).stats;
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
            for (let i = 0; i < rawStats.frame.I.field.length; ++i) {
                rawStats.field[i] = {
                    min: Math.min(rawStats.frame.I.field[i].min, rawStats.frame.P.field[i].min),
                    max: Math.max(rawStats.frame.I.field[i].max, rawStats.frame.P.field[i].max),
                };
            }

            if (rawStats.frame.S) {
                rawStats.field = rawStats.field.concat(rawStats.frame.S.field);
            }
        }
        return rawStats;
    };

    /**
     * Get the earliest time seen in the log of the given index (in microseconds), or leave off the logIndex
     * argument to fetch details for the current log.
     */
    this.getMinTime = function (index) {
        index = index ?? logIndex;
        return logIndexes.getIntraframeDirectory(index).minTime;
    };

    /**
     * Get the latest time seen in the log of the given index (in microseconds), or leave off the logIndex
     * argument to fetch details for the current log.
     */
    this.getMaxTime = function (index) {
        index = index ?? logIndex;
        return logIndexes.getIntraframeDirectory(index).maxTime;
    };

    this.getActualLoggedTime = function (index) {
        index = index ?? logIndex;
        const directory = logIndexes.getIntraframeDirectory(index);
        return directory.maxTime - directory.minTime - directory.unLoggedTime;
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
        return !actualLogRate || Math.abs(blackboxRate - actualLogRate) / actualLogRate > WARNING_RATE_DIFFERENCE;
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

    const addComputedFieldNames = (disabled) => {
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
        fieldNames = parser.frameDefs.I.name.slice(0);

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
                if (refVoltage < i * sysConfig.vbatmaxcellvoltage) {
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

    /**
     * Get the raw chunks in the range [startIndex...endIndex] (inclusive)
     *
     * When the cache misses, this will result in parsing the original log file to create chunks.
     */
    function getChunksInIndexRange(startIndex, endIndex) {
        const resultChunks = [],
            eventNeedsTimestamp = [];

        if (startIndex < 0) {
            startIndex = 0;
        }

        if (endIndex > iframeDirectory.offsets.length - 1) {
            endIndex = iframeDirectory.offsets.length - 1;
        }

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
            let chunkStartOffset,
                chunkEndOffset,
                chunk = chunkCache.get(chunkIndex);

            // Did we cache this chunk already?
            if (chunk) {
                // Use the first event in the chunk to fill in event times at the trailing end of the previous one
                const frame = chunk.frames[0];

                for (const event of eventNeedsTimestamp) {
                    event.time = frame[FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME];
                }
                eventNeedsTimestamp.length = 0;
            } else {
                // Parse the log file to create this chunk since it wasn't cached
                chunkStartOffset = iframeDirectory.offsets[chunkIndex];

                if (chunkIndex + 1 < iframeDirectory.offsets.length) {
                    chunkEndOffset = iframeDirectory.offsets[chunkIndex + 1];
                } else {
                    // We're at the end so parse till end-of-log
                    chunkEndOffset = logIndexes.getLogBeginOffset(logIndex + 1);
                }

                chunk = chunkCache.recycle();

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
                } else {
                    chunk = {
                        index: chunkIndex,
                        frames: [],
                        gapStartsHere: {},
                        events: [],
                    };
                }

                // We need to store these on the chunk so we can refer to them later when we inject
                // computed fields (IMU for attitude, GPS home for cartesian/home-distance/azimuth).
                chunk.initialIMU = iframeDirectory.initialIMU[chunkIndex];
                chunk.initialGPSHome = iframeDirectory.initialGPSHome?.[chunkIndex] ?? null;

                let mainFrameIndex = 0;
                const slowFrameLength = parser.frameDefs.S ? parser.frameDefs.S.count : 0;
                const lastSlow = parser.frameDefs.S ? iframeDirectory.initialSlow[chunkIndex].slice(0) : [];
                const lastGPSLength = parser.frameDefs.G ? parser.frameDefs.G.count - 1 : 0; // -1 since we exclude the time field
                const lastGPS = parser.frameDefs.G ? iframeDirectory.initialGPS[chunkIndex].slice(0) : [];

                parser.onFrameReady = function (frameValid, frame, frameType, _frameOffset, _frameSize) {
                    let destFrame, destFrame_currentIndex;

                    // The G frames need to be processed always. They are "invalid" if not H (Home) has been detected
                    // before, but if not processed the viewer shows cuts and gaps. This happens if the quad takes off before
                    // fixing enough satellites.
                    if (frameValid || (frameType === "G" && frame)) {
                        switch (frameType) {
                            case "P":
                            case "I": {
                                //The parser re-uses the "frame" array so we must copy that data somewhere else

                                const numOutputFields =
                                    frame.length + slowFrameLength + lastGPSLength + ADDITIONAL_COMPUTED_FIELD_COUNT;

                                //Do we have a recycled chunk to copy on top of?
                                if (chunk.frames[mainFrameIndex]) {
                                    destFrame = chunk.frames[mainFrameIndex];
                                    destFrame.length = numOutputFields;
                                } else {
                                    // Otherwise allocate a new array
                                    destFrame = new Array(numOutputFields);
                                    chunk.frames.push(destFrame);
                                }

                                // Copy the main frame data in
                                for (let i = 0; i < frame.length; i++) {
                                    destFrame[i] = frame[i];
                                }

                                destFrame_currentIndex = frame.length; // Keeps track of where to place direct data in the destFrame.
                                // Then merge in the last seen slow-frame data
                                for (let slowFrameIndex = 0; slowFrameIndex < slowFrameLength; slowFrameIndex++) {
                                    destFrame[slowFrameIndex + destFrame_currentIndex] =
                                        lastSlow[slowFrameIndex] === undefined ? null : lastSlow[slowFrameIndex];
                                }
                                destFrame_currentIndex += slowFrameLength;

                                // Also merge last seen gps-frame data
                                for (let gpsFrameIndex = 0; gpsFrameIndex < lastGPSLength; gpsFrameIndex++) {
                                    destFrame[gpsFrameIndex + destFrame_currentIndex] =
                                        lastGPS[gpsFrameIndex] === undefined ? null : lastGPS[gpsFrameIndex];
                                }
                                // destFrame_currentIndex += lastGPSLength; Add this line if you wish to add more fields.

                                for (const event of eventNeedsTimestamp) {
                                    event.time = frame[FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME];
                                }
                                eventNeedsTimestamp.length = 0;

                                mainFrameIndex++;

                                break;
                            }
                            case "E":
                                if (frame.event === FlightLogEvent.LOGGING_RESUME) {
                                    chunk.gapStartsHere[mainFrameIndex - 1] = true;
                                }

                                /*
                                 * If the event was logged during a loop iteration, it will appear in the log
                                 * before that loop iteration does (since the main log stream is logged at the very
                                 * end of the loop).
                                 *
                                 * So we want to use the timestamp of that later frame as the timestamp of the loop
                                 * iteration this event was logged in.
                                 */
                                if (!frame.time) {
                                    eventNeedsTimestamp.push(frame);
                                }
                                chunk.events.push(frame);
                                break;
                            case "S":
                                for (let i = 0; i < frame.length; i++) {
                                    lastSlow[i] = frame[i];
                                }
                                break;
                            case "H": {
                                const homeAltitude = frame.length > 2 ? frame[2] / 10 : 0; // will work after BF firmware improvement
                                gpsTransform = new GPS_transform(
                                    frame[0] / 10000000,
                                    frame[1] / 10000000,
                                    homeAltitude,
                                    0,
                                );
                                break;
                            }
                            case "G":
                                // The frameValid can be false, when no GPS home (the G frames contains GPS position as diff of GPS Home position).
                                // But other data from the G frame can be valid (time, num sats)

                                //H Field G name:time,GPS_numSat,GPS_coord[0],GPS_coord[1],GPS_altitude,GPS_speed,GPS_ground_course
                                frame.shift(); // remove time
                                for (let i = 0; i < frame.length; i++) {
                                    lastGPS[i] = frame[i];
                                }
                                break;
                        }
                    } else {
                        chunk.gapStartsHere[mainFrameIndex - 1] = true;
                    }
                };

                parser.resetDataState();

                //Prime the parser with the previous state we get from the flightlog index, so it can base deltas off that data
                gpsTransform = null;
                const initialGPSHome = iframeDirectory.initialGPSHome?.[chunkIndex];
                if (initialGPSHome) {
                    parser.setGPSHomeHistory(initialGPSHome);
                    const homeAltitude = initialGPSHome.length > 2 ? initialGPSHome[2] / 10 : 0;
                    gpsTransform = new GPS_transform(
                        initialGPSHome[0] / 10000000,
                        initialGPSHome[1] / 10000000,
                        homeAltitude,
                        0,
                    );
                }

                parser.parseLogData(false, chunkStartOffset, chunkEndOffset);

                //Truncate the array to fit just in case it was recycled and the new one is shorter
                chunk.frames.length = mainFrameIndex;

                chunkCache.add(chunkIndex, chunk);
            }

            resultChunks.push(chunk);
        }

        /*
         * If there is an event that trailed the all the chunks we were decoding, we can't give it an event time field
         * because we didn't get to see the time of the next frame.
         */
        if (eventNeedsTimestamp.length > 0) {
            resultChunks.at(-1).needsEventTimes = true;
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
        srcFrame,
        destFrame,
        fieldIndex,
        { imuQuaternion, gyroADC, accSmooth, magADC, chunkIMU, sysConfig },
    ) => {
        if (imuQuaternion) {
            const scaleFromFixedInt16 = 0x7fff; // 0x7FFF = 2^15 - 1
            const q = {
                x: srcFrame[imuQuaternion[0]] / scaleFromFixedInt16,
                y: srcFrame[imuQuaternion[1]] / scaleFromFixedInt16,
                z: srcFrame[imuQuaternion[2]] / scaleFromFixedInt16,
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
            const attitude = chunkIMU.updateEstimatedAttitude(
                [srcFrame[gyroADC[0]], srcFrame[gyroADC[1]], srcFrame[gyroADC[2]]],
                [srcFrame[accSmooth[0]], srcFrame[accSmooth[1]], srcFrame[accSmooth[2]]],
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
    const readPidComponent = (srcFrame, components, index) => {
        if (components[index] === undefined) {
            return 0;
        }
        return srcFrame[components[index]];
    };

    /**
     * Compute PID sums (P+I+D+F+S) for each axis, constrained by pidSumLimit.
     * Writes 3 fields to destFrame starting at fieldIndex.
     * Returns updated fieldIndex.
     */
    const computePidSums = (srcFrame, destFrame, fieldIndex, axisPID, sysConfig) => {
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
        srcFrame,
        destFrame,
        fieldIndex,
        setpoint,
        rcCommand,
        currentFlightMode,
        sysConfig,
    ) => {
        if (sysConfig.firmwareType === FIRMWARE_TYPE_BETAFLIGHT && semver.gte(sysConfig.firmwareVersion, "4.0.0")) {
            for (let axis = 0; axis <= AXIS.YAW; axis++) {
                destFrame[fieldIndex++] = srcFrame[setpoint[axis]];
            }
            destFrame[fieldIndex++] = srcFrame[setpoint[AXIS.YAW + 1]] / 10;
        } else {
            for (let axis = 0; axis <= AXIS.YAW; axis++) {
                destFrame[fieldIndex++] =
                    rcCommand[axis] === undefined
                        ? 0
                        : this.rcCommandRawToDegreesPerSecond(srcFrame[rcCommand[axis]], axis, currentFlightMode);
            }
            destFrame[fieldIndex++] =
                rcCommand[AXIS.YAW + 1] === undefined
                    ? 0
                    : this.rcCommandRawToThrottle(srcFrame[rcCommand[AXIS.YAW + 1]]);
        }
        return fieldIndex;
    };

    /**
     * Compute PID error (setpoint - gyro) for each axis.
     * Writes 3 fields to destFrame starting at fieldIndex.
     * Returns updated fieldIndex.
     */
    const computePidErrors = (srcFrame, destFrame, fieldIndex, fieldIndexRcCommands, gyroADC) => {
        for (let axis = 0; axis < 3; axis++) {
            const gyroADCdegrees =
                gyroADC[axis] === undefined ? 0 : this.gyroRawToDegreesPerSecond(srcFrame[gyroADC[axis]]);
            destFrame[fieldIndex++] = destFrame[fieldIndexRcCommands + axis] - gyroADCdegrees;
        }
        return fieldIndex;
    };

    /**
     * Compute GPS cartesian coordinates, distance to home, and azimuth.
     * Writes 5 fields to destFrame starting at fieldIndex.
     * Returns updated fieldIndex.
     */
    const computeGpsFields = (srcFrame, destFrame, fieldIndex, gpsCoord, numSatIndex) => {
        const numSat = numSatIndex ? srcFrame[numSatIndex] : 0;
        if (numSat > 4) {
            const gpsCartesianCoords = gpsTransform.WGS_BS(
                srcFrame[gpsCoord[0]] / 10000000,
                srcFrame[gpsCoord[1]] / 10000000,
                srcFrame[gpsCoord[2]] / 10,
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
    const computeTrajectoryTilt = (srcFrame, destFrame, fieldIndex, gpsVelNED) => {
        const Vn = srcFrame[gpsVelNED[0]],
            Ve = srcFrame[gpsVelNED[1]],
            Vd = srcFrame[gpsVelNED[2]];
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
    const resolveFieldIndices = () => {
        let gyroADC = [fieldNameToIndex["gyroADC[0]"], fieldNameToIndex["gyroADC[1]"], fieldNameToIndex["gyroADC[2]"]];
        let accSmooth = [
            fieldNameToIndex["accSmooth[0]"],
            fieldNameToIndex["accSmooth[1]"],
            fieldNameToIndex["accSmooth[2]"],
        ];
        let magADC = [fieldNameToIndex["magADC[0]"], fieldNameToIndex["magADC[1]"], fieldNameToIndex["magADC[2]"]];
        let imuQuaternion = [
            fieldNameToIndex["imuQuaternion[0]"],
            fieldNameToIndex["imuQuaternion[1]"],
            fieldNameToIndex["imuQuaternion[2]"],
        ];
        let rcCommand = [
            fieldNameToIndex["rcCommand[0]"],
            fieldNameToIndex["rcCommand[1]"],
            fieldNameToIndex["rcCommand[2]"],
            fieldNameToIndex["rcCommand[3]"],
        ];
        let setpoint = [
            fieldNameToIndex["setpoint[0]"],
            fieldNameToIndex["setpoint[1]"],
            fieldNameToIndex["setpoint[2]"],
            fieldNameToIndex["setpoint[3]"],
        ];
        let gpsCoord = [
            fieldNameToIndex["GPS_coord[0]"],
            fieldNameToIndex["GPS_coord[1]"],
            fieldNameToIndex["GPS_altitude"],
        ];
        let gpsVelNED = [
            fieldNameToIndex["GPS_velned[0]"],
            fieldNameToIndex["GPS_velned[1]"],
            fieldNameToIndex["GPS_velned[2]"],
        ];
        let axisPID = [
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
    const computeFrameFields = (srcFrame, destFrame, chunkIMU, ctx) => {
        let fieldIndex = destFrame.length - ADDITIONAL_COMPUTED_FIELD_COUNT;

        fieldIndex = computeAttitude(srcFrame, destFrame, fieldIndex, {
            imuQuaternion: ctx.imuQuaternion,
            gyroADC: ctx.gyroADC,
            accSmooth: ctx.accSmooth,
            magADC: ctx.magADC,
            chunkIMU,
            sysConfig: ctx.sysConfig,
        });

        if (!ctx.disabledFields.PID) {
            fieldIndex = computePidSums(srcFrame, destFrame, fieldIndex, ctx.axisPID, ctx.sysConfig);
        }

        const currentFlightMode = srcFrame[ctx.flightModeFlagsIndex];
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
    const injectComputedFields = (sourceChunks, destChunks) => {
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
                    const homeAltitude = initialGPSHome.length > 2 ? initialGPSHome[2] / 10 : 0;
                    gpsTransform = new GPS_transform(
                        initialGPSHome[0] / 10000000,
                        initialGPSHome[1] / 10000000,
                        homeAltitude,
                        0,
                    );
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
    function addMissingEventTimes(chunks, processLastChunk) {
        /*
         * If we're at the end of the file then we will compute event times for the last chunk, otherwise we'll
         * wait until we have the next chunk to fill in times for this last chunk.
         */
        const endChunk = processLastChunk ? chunks.length : chunks.length - 1;

        for (let i = 0; i < endChunk; i++) {
            const chunk = chunks[i];

            if (chunk.needsEventTimes) {
                // What is the time of the next frame after the chunk with the trailing events? We'll use that for the event times
                let nextTime;

                if (i + 1 < chunks.length) {
                    const nextChunk = chunks[i + 1];

                    nextTime = nextChunk.frames[0][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME];
                } else {
                    //Otherwise we're at the end of the log so assume this event was logged sometime after the final frame
                    nextTime =
                        chunk.frames[chunk.frames.length - 1][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME];
                }

                for (let j = chunk.events.length - 1; j >= 0; j--) {
                    if (chunk.events[j].time === undefined) {
                        chunk.events[j].time = nextTime;
                    } else {
                        // All events with missing timestamps should appear at the end of the chunk, so we're done
                        break;
                    }
                }

                delete chunk.needsEventTimes;
            }
        }
    }

    /**
     * Get an array of chunk data which has been smoothed by the previously-configured smoothing settings. The frames
     * in the chunks will at least span the range given by [startTime...endTime].
     */
    this.getSmoothedChunksInTimeRange = function (startTime, endTime) {
        const timeFieldIndex = FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME;

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
        const resultChunks = new Array(sourceChunks.length - leadingROChunks - trailingROChunks);
        const chunkAlreadyDone = new Array(sourceChunks.length);

        let allDone = true;

        //Don't smooth the edge chunks since they can't be fully smoothed
        for (let i = leadingROChunks; i < sourceChunks.length - trailingROChunks; i++) {
            const sourceChunk = sourceChunks[i];
            let resultChunk = smoothedCache.get(sourceChunk.index);

            chunkAlreadyDone[i] = Boolean(resultChunk);

            //If we haven't already smoothed this chunk
            if (!chunkAlreadyDone[i]) {
                allDone = false;

                resultChunk = smoothedCache.recycle();

                if (resultChunk) {
                    //Reuse the memory from the expired chunk to reduce garbage
                    resultChunk.index = sourceChunk.index;
                    resultChunk.frames.length = sourceChunk.frames.length;
                    resultChunk.gapStartsHere = sourceChunk.gapStartsHere;
                    resultChunk.events = sourceChunk.events;

                    //Copy frames onto the expired chunk:
                    for (let j = 0; j < resultChunk.frames.length; j++) {
                        if (resultChunk.frames[j]) {
                            //Copy on top of the recycled array:
                            resultChunk.frames[j].length = sourceChunk.frames[j].length;

                            for (let k = 0; k < sourceChunk.frames[j].length; k++) {
                                resultChunk.frames[j][k] = sourceChunk.frames[j][k];
                            }
                        } else {
                            //Allocate a new copy of the raw array:
                            resultChunk.frames[j] = sourceChunk.frames[j].slice(0);
                        }
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
                        resultChunk.frames[j] = sourceChunk.frames[j].slice(0);
                    }
                }

                smoothedCache.add(resultChunk.index, resultChunk);
            }

            resultChunks[i - leadingROChunks] = resultChunk;
        }

        if (!allDone) {
            for (const [fieldIndex, radius] of Object.entries(fieldSmoothing)) {
                //The position we're currently computing the smoothed value for:
                let centerChunkIndex, centerFrameIndex;

                //The outer two loops are used to begin a new partition to smooth within
                // Don't bother to smooth the first and last source chunks, since we can't smooth them completely
                mainLoop: for (
                    centerChunkIndex = leadingROChunks;
                    centerChunkIndex < sourceChunks.length - trailingROChunks;
                    centerChunkIndex++
                ) {
                    if (chunkAlreadyDone[centerChunkIndex]) {
                        continue;
                    }

                    for (centerFrameIndex = 0; centerFrameIndex < sourceChunks[centerChunkIndex].frames.length; ) {
                        let //Current beginning & end of the smoothing window:
                            leftChunkIndex = centerChunkIndex,
                            leftFrameIndex = centerFrameIndex,
                            rightChunkIndex,
                            rightFrameIndex,
                            /*
                             * The end of the current partition to be smoothed (exclusive, so the partition doesn't
                             * contain the value pointed to by chunks[endChunkIndex][endFrameIndex]).
                             *
                             * We'll refine this guess for the end of the partition later if we find discontinuities:
                             */
                            endChunkIndex = sourceChunks.length - 1 - trailingROChunks,
                            endFrameIndex = sourceChunks[endChunkIndex].frames.length,
                            partitionEnded = false,
                            accumulator = 0,
                            valuesInHistory = 0,
                            centerTime = sourceChunks[centerChunkIndex].frames[centerFrameIndex][timeFieldIndex];

                        /*
                         * This may not be the left edge of a partition, we may just have skipped the previous chunk due to
                         * it having already been cached. If so, we can read the values from the previous chunk in order
                         * to prime our history window. Move the left&right indexes to the left so the main loop will read
                         * those earlier values.
                         */
                        while (leftFrameIndex > 0 || (leftFrameIndex === 0 && leftChunkIndex > 0)) {
                            const oldleftChunkIndex = leftChunkIndex,
                                oldleftFrameIndex = leftFrameIndex;

                            //Try moving it left
                            if (leftFrameIndex === 0) {
                                leftChunkIndex--;
                                leftFrameIndex = sourceChunks[leftChunkIndex].frames.length - 1;
                            } else {
                                leftFrameIndex--;
                            }

                            if (
                                sourceChunks[leftChunkIndex].gapStartsHere[leftFrameIndex] ||
                                sourceChunks[leftChunkIndex].frames[leftFrameIndex][timeFieldIndex] <
                                    centerTime - radius
                            ) {
                                //We moved the left index one step too far, shift it back
                                leftChunkIndex = oldleftChunkIndex;
                                leftFrameIndex = oldleftFrameIndex;

                                break;
                            }
                        }

                        rightChunkIndex = leftChunkIndex;
                        rightFrameIndex = leftFrameIndex;

                        //The main loop, where we march our smoothing window along until we exhaust this partition
                        while (
                            centerChunkIndex < endChunkIndex ||
                            (centerChunkIndex === endChunkIndex && centerFrameIndex < endFrameIndex)
                        ) {
                            // Old values fall out of the window
                            while (
                                sourceChunks[leftChunkIndex].frames[leftFrameIndex][timeFieldIndex] <
                                centerTime - radius
                            ) {
                                accumulator -= sourceChunks[leftChunkIndex].frames[leftFrameIndex][fieldIndex];
                                valuesInHistory--;

                                leftFrameIndex++;
                                if (leftFrameIndex === sourceChunks[leftChunkIndex].frames.length) {
                                    leftFrameIndex = 0;
                                    leftChunkIndex++;
                                }
                            }

                            //New values are added to the window
                            while (
                                !partitionEnded &&
                                sourceChunks[rightChunkIndex].frames[rightFrameIndex][timeFieldIndex] <=
                                    centerTime + radius
                            ) {
                                accumulator += sourceChunks[rightChunkIndex].frames[rightFrameIndex][fieldIndex];
                                valuesInHistory++;

                                //If there is a discontinuity after this point, stop trying to add further values
                                if (sourceChunks[rightChunkIndex].gapStartsHere[rightFrameIndex]) {
                                    partitionEnded = true;
                                }

                                //Advance the right index onward since we read a value
                                rightFrameIndex++;
                                if (rightFrameIndex === sourceChunks[rightChunkIndex].frames.length) {
                                    rightFrameIndex = 0;
                                    rightChunkIndex++;

                                    if (rightChunkIndex === sourceChunks.length) {
                                        //We reached the end of the region of interest!
                                        partitionEnded = true;
                                    }
                                }

                                if (partitionEnded) {
                                    //Let the center-storing loop know not to advance the center to this position:
                                    endChunkIndex = rightChunkIndex;
                                    endFrameIndex = rightFrameIndex;
                                }
                            }

                            // Store the average of the history window into the frame in the center of the window
                            resultChunks[centerChunkIndex - leadingROChunks].frames[centerFrameIndex][fieldIndex] =
                                Math.round(accumulator / valuesInHistory);

                            // Advance the center so we can start computing the next value
                            centerFrameIndex++;
                            if (centerFrameIndex === sourceChunks[centerChunkIndex].frames.length) {
                                centerFrameIndex = 0;
                                centerChunkIndex++;

                                //Is the next chunk already cached? Then we have nothing to write into there
                                if (chunkAlreadyDone[centerChunkIndex]) {
                                    continue mainLoop;
                                }

                                //Have we covered the whole ROI?
                                if (centerChunkIndex === sourceChunks.length - trailingROChunks) {
                                    break mainLoop;
                                }
                            }

                            centerTime = sourceChunks[centerChunkIndex].frames[centerFrameIndex][timeFieldIndex];
                        }
                    }
                }
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

        estimateNumMotors();
        estimateNumCells();

        return true;
    };

    this.hasGpsData = function () {
        return Boolean(this.getStats()?.frame?.G);
    };

    this.getMinMaxForFieldDuringAllTime = function (field_name) {
        const stats = this.getStats();
        let min = Number.MAX_VALUE,
            max = -Number.MAX_VALUE;

        const fieldIndex = this.getMainFieldIndexByName(field_name),
            fieldStat = fieldIndex === undefined ? false : stats.field[fieldIndex];

        if (fieldStat) {
            min = Math.min(min, fieldStat.min);
            max = Math.max(max, fieldStat.max);
        } else {
            const mm = this.getMinMaxForFieldDuringTimeInterval(field_name, this.getMinTime(), this.getMaxTime());
            if (mm !== undefined) {
                min = Math.min(mm.min, min);
                max = Math.max(mm.max, max);
            }
        }

        return { min: min, max: max };
    };

    /**
     * Function to compute of min and max curve values during time interval.
     * @param field_name String: Curve fields name.
     * @param start_time Integer: The interval start time .
     * @end_time start_time Integer: The interval end time .
     * @returns {min: MinValue, max: MaxValue} if success, or {min: Number.MAX_VALUE, max: Number.MAX_VALUE} if error
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
                chunks[0].frames[startFrameIndex][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME] >= start_time
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
                const fieldValue = chunk.frames[frameIndex][fieldIndex];
                const frameTime = chunk.frames[frameIndex][FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME];
                if (frameTime > end_time) {
                    break findingLoop;
                }
                minValue = Math.min(minValue, fieldValue);
                maxValue = Math.max(maxValue, fieldValue);
            }
            frameIndex = 0;
        }
        return {
            min: minValue,
            max: maxValue,
        };
    };

    this.getCurrentLogRowsCount = function () {
        const stats = this.getStats(this.getLogIndex());
        return stats.frame["I"].validCount + stats.frame["P"].validCount;
    };
}

FlightLog.prototype.accRawToGs = function (value) {
    return value / this.getSysConfig().acc_1G;
};

FlightLog.prototype.gyroRawToDegreesPerSecond = function (value) {
    return ((this.getSysConfig().gyroScale * 1000000) / (Math.PI / 180)) * value;
};

/***

    The rcCommandToDegreesPerSecond function is betaflight version specific
    due to the coding improvements from v2.8.0 onwards

**/

// Convert rcCommand to degrees per second
FlightLog.prototype.rcCommandRawToDegreesPerSecond = function (value, axis, currentFlightMode) {
    const sysConfig = this.getSysConfig();

    if (firmwareGreaterOrEqual(sysConfig, "3.0.0", "2.0.0")) {
        const RC_RATE_INCREMENTAL = 14.54;
        const RC_EXPO_POWER = 3;

        const calculateSetpointRate = function (axis, rc) {
            let rcCommandf = rc / 500;
            const rcCommandfAbs = Math.abs(rcCommandf);

            if (sysConfig["rc_expo"][axis]) {
                const expof = sysConfig["rc_expo"][axis] / 100;
                rcCommandf = rcCommandf * rcCommandfAbs ** RC_EXPO_POWER * expof + rcCommandf * (1 - expof);
            }

            let rcRate = sysConfig["rc_rates"][axis] / 100;
            if (rcRate > 2) {
                rcRate += RC_RATE_INCREMENTAL * (rcRate - 2);
            }

            let angleRate = 200 * rcRate * rcCommandf;
            if (sysConfig.rates[axis]) {
                const rcSuperfactor = 1 / constrain(1 - rcCommandfAbs * (sysConfig.rates[axis] / 100), 0.01, 1);
                angleRate *= rcSuperfactor;
            }

            const limit = sysConfig["rate_limits"][axis];
            if (sysConfig.pidController === 0 || limit == null) {
                /* LEGACY */
                return constrain(angleRate * 4.1, -8190, 8190) >> 2; // Rate limit protection
            } else {
                return constrain(angleRate, -1 * limit, limit); // Rate limit protection (deg/sec)
            }
        };

        return calculateSetpointRate(axis, value);
    } else if (firmwareGreaterOrEqual(sysConfig, "2.8.0")) {
        const isSuperExpoActive = function () {
            const FEATURE_SUPEREXPO_RATES = 1 << 23;

            return sysConfig.features & FEATURE_SUPEREXPO_RATES;
        };

        const calculateRate = function (value, axis) {
            let angleRate;

            if (isSuperExpoActive()) {
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
        };

        return calculateRate(value, axis) >> 2; // the shift by 2 is to counterbalance the divide by 4 that occurs on the gyro to calculate the error
    } else {
        // earlier version of betaflight

        const calculateExpoPlus = (value, axis) => {
            let propFactor;
            let superExpoFactor;

            if (axis === AXIS.YAW && !this.getSysConfig().superExpoYawMode) {
                propFactor = 1;
            } else {
                superExpoFactor =
                    axis === AXIS.YAW ? this.getSysConfig().superExpoFactorYaw : this.getSysConfig().superExpoFactor;
                propFactor = 1 - (superExpoFactor / 100) * (Math.abs(value) / 500);
            }

            return propFactor;
        };

        let superExpoFactor = 1 / calculateExpoPlus(value, axis);

        if (axis === AXIS.YAW /*YAW*/) {
            if (sysConfig.superExpoYawMode === SUPER_EXPO_YAW.ON && currentFlightMode == null) {
                superExpoFactor = 1; // If we don't know the flight mode, then reset the super expo mode.
            }
            if (
                sysConfig.superExpoYawMode === SUPER_EXPO_YAW.ALWAYS ||
                (sysConfig.superExpoYawMode === SUPER_EXPO_YAW.ON && this.getFlightMode(currentFlightMode).SuperExpo)
            ) {
                return (superExpoFactor * ((sysConfig.rates[AXIS.YAW] + 47) * value)) >> 7;
            } else {
                return ((sysConfig.rates[AXIS.YAW] + 47) * value) >> 7;
            }
        } else {
            /*ROLL or PITCH */
            if (currentFlightMode == null) {
                superExpoFactor = 1; // If we don't know the flight mode, then reset the super expo mode.
            }
            return (
                (superExpoFactor *
                    (((axis === AXIS.ROLL ? sysConfig.rates[AXIS.ROLL] : sysConfig.rates[AXIS.PITCH]) + 27) * value)) >>
                6
            );
        }
    }
};

FlightLog.prototype.rcCommandRawToThrottle = function (value) {
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
};

// rcCommandThrottle back transform function
FlightLog.prototype.ThrottleTorcCommandRaw = function (value) {
    // Throttle displayed as percentage
    return (
        (value / 100) * (this.getSysConfig().maxthrottle - this.getSysConfig().minthrottle) +
        this.getSysConfig().minthrottle
    );
};

FlightLog.prototype.rcMotorRawToPctPhysical = function (value) {
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
};
// rcMotorRaw back transform function
FlightLog.prototype.PctPhysicalTorcMotorRaw = function (value) {
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
};

FlightLog.prototype.isDigitalProtocol = function () {
    let digitalProtocol;
    switch (FAST_PROTOCOL[this.getSysConfig().fast_pwm_protocol]) {
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
};

FlightLog.prototype.getPIDPercentage = function (value) {
    // PID components and outputs are displayed as percentage (raw value is 0-1000)
    return value / 10;
};

FlightLog.prototype.getReferenceVoltageMillivolts = function () {
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
};

FlightLog.prototype.vbatADCToMillivolts = function (vbatADC) {
    const ADCVREF = 33;

    // ADC is 12 bit (i.e. max 0xFFF), voltage reference is 3.3V, vbatscale is premultiplied by 100
    return (vbatADC * ADCVREF * 10 * this.getSysConfig().vbatscale) / 0xfff;
};

FlightLog.prototype.amperageADCToMillivolts = function (amperageADC) {
    const ADCVREF = 33;
    let millivolts = (amperageADC * ADCVREF * 100) / 4095;

    millivolts -= this.getSysConfig().currentMeterOffset;

    return (millivolts * 10000) / this.getSysConfig().currentMeterScale;
};

FlightLog.prototype.getFlightMode = function (currentFlightMode) {
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
};

FlightLog.prototype.getFeatures = function (enabledFeatures) {
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
};

FlightLog.prototype.isFieldDisabled = function () {
    const disabledFields = this.getSysConfig().fields_disabled_mask;
    const disabledFieldsFlags = {};
    if (
        this.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
        firmwareGreaterOrEqual(this.getSysConfig(), "2025.12.0")
    ) {
        disabledFieldsFlags.PID = (disabledFields & (1 << 0)) !== 0;
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
        disabledFieldsFlags.PID = (disabledFields & (1 << 0)) !== 0;
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
    return disabledFieldsFlags;
};
