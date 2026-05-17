/**
 * Ported from betaflight-blackbox-log-viewer/src/decoders.js
 *
 * Extends ArrayDataStream with decoders for advanced blackbox binary encodings:
 * Tag2_3S32, Tag2_3SVariable, Tag8_4S16 (v1/v2), Tag8_8SVB.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    ArrayDataStream,
    signExtend24Bit,
    signExtend16Bit,
    signExtend8Bit,
    signExtend7Bit,
    signExtend6Bit,
    signExtend5Bit,
    signExtend4Bit,
    signExtend2Bit,
} from "./datastream.js";

/**
 * Shared decoder for the "case 3" branch of both readTag2_3S32 and
 * readTag2_3SVariable: three values, each encoded with 1/2/3/4 bytes as
 * selected by consecutive pairs of bits in `leadByte`.
 */
function readTag2_3S_case3(stream, values, leadByte) {
    for (let i = 0; i < 3; i++) {
        switch (leadByte & 0x03) {
            case 0:
                values[i] = signExtend8Bit(stream.readByte());
                break;
            case 1: {
                const b1 = stream.readByte();
                const b2 = stream.readByte();
                values[i] = signExtend16Bit(b1 | (b2 << 8));
                break;
            }
            case 2: {
                const b1 = stream.readByte();
                const b2 = stream.readByte();
                const b3 = stream.readByte();
                values[i] = signExtend24Bit(b1 | (b2 << 8) | (b3 << 16));
                break;
            }
            case 3: {
                const b1 = stream.readByte();
                const b2 = stream.readByte();
                const b3 = stream.readByte();
                const b4 = stream.readByte();
                values[i] = b1 | (b2 << 8) | (b3 << 16) | (b4 << 24);
                break;
            }
        }
        leadByte >>= 2;
    }
}

ArrayDataStream.prototype.readTag2_3S32 = function (values) {
    let leadByte = this.readByte();

    switch (leadByte >> 6) {
        case 0:
            values[0] = signExtend2Bit((leadByte >> 4) & 0x03);
            values[1] = signExtend2Bit((leadByte >> 2) & 0x03);
            values[2] = signExtend2Bit(leadByte & 0x03);
            break;
        case 1:
            values[0] = signExtend4Bit(leadByte & 0x0f);
            leadByte = this.readByte();
            values[1] = signExtend4Bit(leadByte >> 4);
            values[2] = signExtend4Bit(leadByte & 0x0f);
            break;
        case 2:
            values[0] = signExtend6Bit(leadByte & 0x3f);
            leadByte = this.readByte();
            values[1] = signExtend6Bit(leadByte & 0x3f);
            leadByte = this.readByte();
            values[2] = signExtend6Bit(leadByte & 0x3f);
            break;
        case 3:
            readTag2_3S_case3(this, values, leadByte);
            break;
    }
};

ArrayDataStream.prototype.readTag2_3SVariable = function (values) {
    let leadByte = this.readByte();

    switch (leadByte >> 6) {
        case 0:
            values[0] = signExtend2Bit((leadByte >> 4) & 0x03);
            values[1] = signExtend2Bit((leadByte >> 2) & 0x03);
            values[2] = signExtend2Bit(leadByte & 0x03);
            break;
        case 1: {
            values[0] = signExtend5Bit((leadByte & 0x3e) >> 1);
            const leadByte2 = this.readByte();
            values[1] = signExtend5Bit(((leadByte & 0x01) << 4) | ((leadByte2 & 0xf0) >> 4));
            values[2] = signExtend4Bit(leadByte2 & 0x0f);
            break;
        }
        case 2: {
            const leadByte2 = this.readByte();
            values[0] = signExtend8Bit(((leadByte & 0x3f) << 2) | ((leadByte2 & 0xc0) >> 6));
            const leadByte3 = this.readByte();
            values[1] = signExtend7Bit(((leadByte2 & 0x3f) << 1) | ((leadByte3 & 0x80) >> 7));
            values[2] = signExtend7Bit(leadByte3 & 0x7f);
            break;
        }
        case 3:
            readTag2_3S_case3(this, values, leadByte);
            break;
    }
};

ArrayDataStream.prototype.readTag8_4S16_v1 = function (values) {
    const FIELD_ZERO = 0;
    const FIELD_4BIT = 1;
    const FIELD_8BIT = 2;
    const FIELD_16BIT = 3;

    let selector = this.readByte();

    for (let i = 0; i < 4; i++) {
        switch (selector & 0x03) {
            case FIELD_ZERO:
                values[i] = 0;
                break;
            case FIELD_4BIT: {
                const combinedChar = this.readByte();
                values[i] = signExtend4Bit(combinedChar & 0x0f);
                i++;
                selector >>= 2;
                values[i] = signExtend4Bit(combinedChar >> 4);
                break;
            }
            case FIELD_8BIT:
                values[i] = signExtend8Bit(this.readByte());
                break;
            case FIELD_16BIT: {
                const char1 = this.readByte();
                const char2 = this.readByte();
                values[i] = signExtend16Bit(char1 | (char2 << 8));
                break;
            }
        }
        selector >>= 2;
    }
};

ArrayDataStream.prototype.readTag8_4S16_v2 = function (values) {
    const FIELD_ZERO = 0;
    const FIELD_4BIT = 1;
    const FIELD_8BIT = 2;
    const FIELD_16BIT = 3;

    let selector = this.readByte();
    let nibbleIndex = 0;
    let buffer = 0;

    for (let i = 0; i < 4; i++) {
        switch (selector & 0x03) {
            case FIELD_ZERO:
                values[i] = 0;
                break;
            case FIELD_4BIT:
                if (nibbleIndex === 0) {
                    buffer = this.readByte();
                    values[i] = signExtend4Bit(buffer >> 4);
                    nibbleIndex = 1;
                } else {
                    values[i] = signExtend4Bit(buffer & 0x0f);
                    nibbleIndex = 0;
                }
                break;
            case FIELD_8BIT:
                if (nibbleIndex === 0) {
                    values[i] = signExtend8Bit(this.readByte());
                } else {
                    let char1 = (buffer & 0x0f) << 4;
                    buffer = this.readByte();
                    char1 |= buffer >> 4;
                    values[i] = signExtend8Bit(char1);
                }
                break;
            case FIELD_16BIT:
                if (nibbleIndex === 0) {
                    const char1 = this.readByte();
                    const char2 = this.readByte();
                    values[i] = signExtend16Bit((char1 << 8) | char2);
                } else {
                    const char1 = this.readByte();
                    const char2 = this.readByte();
                    values[i] = signExtend16Bit(((buffer & 0x0f) << 12) | (char1 << 4) | (char2 >> 4));
                    buffer = char2;
                }
                break;
        }
        selector >>= 2;
    }
};

ArrayDataStream.prototype.readTag8_8SVB = function (values, valueCount) {
    if (valueCount === 1) {
        values[0] = this.readSignedVB();
    } else {
        let header = this.readByte();
        for (let i = 0; i < valueCount; i++, header >>= 1) {
            values[i] = header & 0x01 ? this.readSignedVB() : 0;
        }
    }
};
