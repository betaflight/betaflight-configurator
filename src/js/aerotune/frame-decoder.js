/**
 * AeroTune 7 — BBL Frame Decoder
 *
 * Decodes binary I-frames and P-frames from Betaflight Blackbox logs.
 * Extracts gyro, setpoint, PID terms, and motor output data.
 *
 * Written from scratch by aerobot2.com
 * Reference: BBL format specification (public documentation)
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStream } from "./data-stream.js";

// Frame type bytes
let FRAME_TYPE_I = 0x49; // 'I'
let FRAME_TYPE_P = 0x50; // 'P'
let FRAME_TYPE_E = 0x45; // 'E'
let FRAME_TYPE_S = 0x53; // 'S'
let FRAME_TYPE_G = 0x47; // 'G'
let FRAME_TYPE_H = 0x48; // 'H'

// Encoding types
let ENC_SIGNED_VB = 0;
let ENC_UNSIGNED_VB = 1;
let ENC_NEG_14BIT = 3;
let ENC_TAG8_8SVB = 6;
let ENC_TAG2_3S32 = 7;
let ENC_TAG8_4S16 = 8;
let ENC_NULL = 9;
let ENC_TAG2_3SVAR = 10;

// Predictor types
let PRED_ZERO = 0;
let PRED_PREVIOUS = 1;
let PRED_STRAIGHT_LINE = 2;
let PRED_AVERAGE_2 = 3;
let PRED_MINTHROTTLE = 4;
let PRED_MOTOR_0 = 5;
let PRED_INCREMENT = 6;
let PRED_HOME_COORD = 7;
let PRED_1500 = 8;
let PRED_VBATREF = 9;
let PRED_LAST_MAIN_TIME = 10;
let PRED_MINMOTOR = 11;

class FrameDecoder {
    /**
     * @param {Object} config - Parsed BBL config from header parser
     */
    constructor(config) {
        this.config = config;
        this.frameFields = config.frameFields;

        // Build field index maps for fast lookup
        this._buildFieldMaps();

        // History for inter-frame prediction (ring buffer of last 3 I/P frames)
        this.history = [null, null, null];
        this.historyIndex = 0;

        // Decoded frame data storage
        this.frames = [];

        // Track last I-frame time for time predictor
        this.lastIFrameTime = 0;
    }

    /**
     * Build lookup maps so we can quickly find field indices by name.
     */
    _buildFieldMaps() {
        this.iFieldMap = {};
        this.pFieldMap = {};

        if (this.frameFields.I) {
            const names = this.frameFields.I.names;
            for (let i = 0; i < names.length; i++) {
                this.iFieldMap[names[i]] = i;
            }
        }

        if (this.frameFields.P) {
            const pnames = this.frameFields.P.names;
            for (let i = 0; i < pnames.length; i++) {
                this.pFieldMap[pnames[i]] = i;
            }
        }
    }

    /**
     * Decode all frames from the binary data after the header.
     *
     * @param {Buffer|Uint8Array} buffer - Full BBL file buffer
     * @param {number} headerEnd - Byte offset where the header section ends
     * @param {number} maxFrames - Maximum frames to decode (0 = all)
     * @returns {Object} { frames, stats }
     */
    decodeFrames(buffer, headerEnd, maxFrames) {
        let stream = new DataStream(buffer, headerEnd, buffer.length);
        this.frames = [];
        this.history = [null, null, null];
        this.historyIndex = 0;
        this.lastIFrameTime = 0;

        let stats = {
            iFrames: 0,
            pFrames: 0,
            sFrames: 0,
            eFrames: 0,
            errors: 0,
            skipped: 0,
        };

        let limit = maxFrames || Infinity;

        while (!stream.eof() && this.frames.length < limit) {
            let frameType = stream.readByte();

            if (frameType === -1) break;

            switch (frameType) {
                case FRAME_TYPE_I:
                    if (this._decodeIFrame(stream)) {
                        stats.iFrames++;
                    } else {
                        stats.errors++;
                        this._resync(stream);
                    }
                    break;

                case FRAME_TYPE_P:
                    if (this.history[0] && this._decodePFrame(stream)) {
                        stats.pFrames++;
                    } else {
                        if (!this.history[0]) stats.skipped++;
                        else stats.errors++;
                        this._resync(stream);
                    }
                    break;

                case FRAME_TYPE_E:
                    this._skipEventFrame(stream);
                    stats.eFrames++;
                    break;

                case FRAME_TYPE_S:
                    this._skipSlowFrame(stream);
                    stats.sFrames++;
                    break;

                case FRAME_TYPE_G:
                case FRAME_TYPE_H:
                    // GPS frames — skip
                    this._skipGPSFrame(stream, frameType);
                    break;

                default:
                    // Not a valid frame start — try to resync
                    stats.errors++;
                    this._resync(stream);
                    break;
            }
        }

        return {
            frames: this.frames,
            stats: stats,
        };
    }

    /**
     * Decode an I-frame (intra/keyframe).
     * All values are absolute — no prediction from previous frames.
     */
    _decodeIFrame(stream) {
        let fieldDefs = this.frameFields.I;
        if (!fieldDefs) return false;

        let fieldCount = fieldDefs.names.length;
        let values = new Array(fieldCount);
        let startPos = stream.getPos();

        try {
            let i = 0;
            while (i < fieldCount) {
                let encoding = fieldDefs.encoding[i];
                let read = this._readFieldGroup(stream, encoding, fieldDefs, i);

                if (read === null) return false;

                for (let j = 0; j < read.length && i + j < fieldCount; j++) {
                    values[i + j] = read[j];
                }
                i += read.length;
            }
        } catch (e) {
            return false;
        }

        // Apply I-frame predictors (most are PRED_ZERO for I-frames)
        let decoded = this._applyPredictors(values, fieldDefs, null, "I");

        // Validate: check if next byte looks like a valid frame start
        if (!this._validateFrameEnd(stream)) {
            stream.setPos(startPos);
            return false;
        }

        // Store in history
        this._pushHistory(decoded);
        this.lastIFrameTime = decoded[this.iFieldMap["time"]] || 0;

        // Store the frame
        this.frames.push(this._extractFields(decoded, fieldDefs.names));

        return true;
    }

    /**
     * Decode a P-frame (inter/predicted frame).
     * Values are deltas from predicted values based on history.
     */
    _decodePFrame(stream) {
        let fieldDefs = this.frameFields.P;
        if (!fieldDefs) return false;

        let fieldCount = fieldDefs.names.length;
        let values = new Array(fieldCount);
        let startPos = stream.getPos();

        try {
            let i = 0;
            while (i < fieldCount) {
                let encoding = fieldDefs.encoding[i];
                let read = this._readFieldGroup(stream, encoding, fieldDefs, i);

                if (read === null) return false;

                for (let j = 0; j < read.length && i + j < fieldCount; j++) {
                    values[i + j] = read[j];
                }
                i += read.length;
            }
        } catch (e) {
            return false;
        }

        // Apply P-frame predictors using history
        let decoded = this._applyPredictors(values, fieldDefs, this.history, "P");

        // Validate
        if (!this._validateFrameEnd(stream)) {
            stream.setPos(startPos);
            return false;
        }

        // Store in history
        this._pushHistory(decoded);

        // Store the frame
        this.frames.push(this._extractFields(decoded, fieldDefs.names));

        return true;
    }

    /**
     * Read a group of fields using the specified encoding.
     * Some encodings read multiple fields at once (tag-based).
     * Returns array of raw values read.
     */
    _readFieldGroup(stream, encoding, fieldDefs, fieldIndex) {
        switch (encoding) {
            case ENC_SIGNED_VB:
                return [stream.readSignedVB()];

            case ENC_UNSIGNED_VB:
                return [stream.readUnsignedVB()];

            case ENC_NEG_14BIT:
                return [stream.readNeg14Bit()];

            case ENC_NULL:
                return [0];

            case ENC_TAG8_8SVB:
                // Count consecutive fields with this encoding
                const count = this._countConsecutiveEncoding(fieldDefs, fieldIndex, ENC_TAG8_8SVB);
                return stream.readTag8_8SVB(count);

            case ENC_TAG2_3S32:
                return stream.readTag2_3S32();

            case ENC_TAG8_4S16:
                return stream.readTag8_4S16();

            case ENC_TAG2_3SVAR:
                return stream.readTag2_3SVariable();

            default:
                // Unknown encoding — read as signed VB as fallback
                return [stream.readSignedVB()];
        }
    }

    /**
     * Count how many consecutive fields share the same encoding.
     */
    _countConsecutiveEncoding(fieldDefs, startIndex, encoding) {
        let count = 0;
        for (let i = startIndex; i < fieldDefs.encoding.length; i++) {
            if (fieldDefs.encoding[i] === encoding) {
                count++;
            } else {
                break;
            }
        }
        return Math.min(count, 8); // Tag8 supports max 8 fields
    }

    /**
     * Apply predictors to decoded raw values.
     */
    _applyPredictors(rawValues, fieldDefs, history, frameType) {
        let result = new Array(rawValues.length);
        let prev = history ? history[0] : null;
        let prev2 = history ? history[1] : null;

        for (let i = 0; i < rawValues.length; i++) {
            let predictor = fieldDefs.predictor[i];
            let raw = rawValues[i];

            if (frameType === "I") {
                switch (predictor) {
                    case PRED_ZERO:
                        result[i] = raw;
                        break;
                    case PRED_MINTHROTTLE:
                        result[i] = raw + (this.config.motor.minThrottle || 1070);
                        break;
                    case PRED_MINMOTOR:
                        result[i] = raw + (this.config.motor.motorOutput[0] || 48);
                        break;
                    case PRED_MOTOR_0:
                        const m0idx = this._findMotor0Index(fieldDefs);
                        result[i] = raw + (m0idx >= 0 ? result[m0idx] : 0);
                        break;
                    case PRED_1500:
                        result[i] = raw + 1500;
                        break;
                    case PRED_VBATREF:
                        result[i] = raw + (this.config.battery.ref || 0);
                        break;
                    default:
                        result[i] = raw;
                        break;
                }
            } else {
                switch (predictor) {
                    case PRED_ZERO:
                        result[i] = raw;
                        break;

                    case PRED_PREVIOUS:
                        result[i] = raw + (prev ? prev[i] : 0);
                        break;

                    case PRED_STRAIGHT_LINE:
                        if (prev && prev2) {
                            result[i] = raw + 2 * prev[i] - prev2[i];
                        } else if (prev) {
                            result[i] = raw + prev[i];
                        } else {
                            result[i] = raw;
                        }
                        break;

                    case PRED_AVERAGE_2:
                        if (prev && prev2) {
                            result[i] = raw + Math.floor((prev[i] + prev2[i]) / 2);
                        } else if (prev) {
                            result[i] = raw + prev[i];
                        } else {
                            result[i] = raw;
                        }
                        break;

                    case PRED_MINTHROTTLE:
                        result[i] = raw + (this.config.motor.minThrottle || 1070);
                        break;

                    case PRED_MOTOR_0:
                        result[i] = raw + (result[this._findMotor0Index(fieldDefs)] || 0);
                        break;

                    case PRED_INCREMENT:
                        result[i] = (prev ? prev[i] : 0) + 1 + raw;
                        break;

                    case PRED_1500:
                        result[i] = raw + 1500;
                        break;

                    case PRED_VBATREF:
                        result[i] = raw + (this.config.battery.ref || 0);
                        break;

                    case PRED_LAST_MAIN_TIME:
                        result[i] = raw + this.lastIFrameTime;
                        break;

                    case PRED_MINMOTOR:
                        result[i] = raw + (this.config.motor.motorOutput[0] || 48);
                        break;

                    default:
                        result[i] = raw + (prev ? prev[i] : 0);
                        break;
                }
            }
        }

        return result;
    }

    /** Find the index of motor[0] in the field list */
    _findMotor0Index(fieldDefs) {
        for (let i = 0; i < fieldDefs.names.length; i++) {
            if (fieldDefs.names[i] === "motor[0]") return i;
        }
        return -1;
    }

    /** Push a decoded frame into the history ring buffer */
    _pushHistory(decoded) {
        this.history[2] = this.history[1];
        this.history[1] = this.history[0];
        this.history[0] = decoded.slice();
    }

    /**
     * Check if the next byte looks like a valid frame type.
     */
    _validateFrameEnd(stream) {
        if (stream.eof()) return true;
        let nextByte = stream.peekByte();
        return (
            nextByte === FRAME_TYPE_I ||
            nextByte === FRAME_TYPE_P ||
            nextByte === FRAME_TYPE_E ||
            nextByte === FRAME_TYPE_S ||
            nextByte === FRAME_TYPE_G ||
            nextByte === FRAME_TYPE_H
        );
    }

    /**
     * Resync after a corrupt frame: scan forward until we find
     * a valid frame type byte.
     */
    _resync(stream) {
        while (!stream.eof()) {
            let byte = stream.peekByte();
            if (
                byte === FRAME_TYPE_I ||
                byte === FRAME_TYPE_P ||
                byte === FRAME_TYPE_E ||
                byte === FRAME_TYPE_S ||
                byte === FRAME_TYPE_G ||
                byte === FRAME_TYPE_H
            ) {
                return;
            }
            stream.readByte();
        }
    }

    /** Skip an event frame (variable length) */
    _skipEventFrame(stream) {
        let eventType = stream.readByte();
        if (eventType === 0xff) return; // LOG_END
        this._resync(stream);
    }

    /** Skip a slow frame */
    _skipSlowFrame(stream) {
        if (!this.frameFields.S) {
            this._resync(stream);
            return;
        }
        let fieldCount = this.frameFields.S.names.length;
        for (let i = 0; i < fieldCount; i++) {
            stream.readSignedVB();
        }
    }

    /** Skip a GPS frame */
    _skipGPSFrame(stream, type) {
        this._resync(stream);
    }

    /**
     * Extract named fields from a decoded frame array into a plain object.
     */
    _extractFields(decoded, names) {
        let obj = {};
        for (let i = 0; i < names.length; i++) {
            obj[names[i]] = decoded[i];
        }
        return obj;
    }
}

export { FrameDecoder };
