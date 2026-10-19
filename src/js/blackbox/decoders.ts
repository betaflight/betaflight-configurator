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
} from "./datastream";

// The tag readers are patched onto ArrayDataStream's prototype when this module is imported;
// declaring them here puts them on the class type for every importer of this module.
declare module "./datastream" {
    interface ArrayDataStream {
        readTag2_3S32(values: number[]): void;
        readTag2_3SVariable(values: number[]): void;
        readTag8_4S16_v1(values: number[]): void;
        readTag8_4S16_v2(values: number[]): void;
        readTag8_8SVB(values: number[], valueCount: number): void;
    }
}

/** Shared "case 0" branch of both Tag2_3S readers: three 2-bit values packed in `leadByte`. */
function readTag2_3S_case0(values: number[], leadByte: number): void {
    values[0] = signExtend2Bit((leadByte >> 4) & 0x03);
    values[1] = signExtend2Bit((leadByte >> 2) & 0x03);
    values[2] = signExtend2Bit(leadByte & 0x03);
}

/**
 * Shared decoder for the "case 3" branch of both readTag2_3S32 and
 * readTag2_3SVariable: three values, each encoded with 1/2/3/4 bytes as
 * selected by consecutive pairs of bits in `leadByte`.
 */
function readTag2_3S_case3(stream: ArrayDataStream, values: number[], leadByte: number): void {
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

ArrayDataStream.prototype.readTag2_3S32 = function (this: ArrayDataStream, values: number[]) {
    let leadByte = this.readByte();

    switch (leadByte >> 6) {
        case 0:
            readTag2_3S_case0(values, leadByte);
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

ArrayDataStream.prototype.readTag2_3SVariable = function (this: ArrayDataStream, values: number[]) {
    const leadByte = this.readByte();

    switch (leadByte >> 6) {
        case 0:
            readTag2_3S_case0(values, leadByte);
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

// Tag8_4S16 field sizes, two selector bits per field.
const FIELD_ZERO = 0;
const FIELD_4BIT = 1;
const FIELD_8BIT = 2;
const FIELD_16BIT = 3;

ArrayDataStream.prototype.readTag8_4S16_v1 = function (this: ArrayDataStream, values: number[]) {
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

ArrayDataStream.prototype.readTag8_4S16_v2 = function (this: ArrayDataStream, values: number[]) {
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

ArrayDataStream.prototype.readTag8_8SVB = function (this: ArrayDataStream, values: number[], valueCount: number) {
    if (valueCount === 1) {
        values[0] = this.readSignedVB();
    } else {
        let header = this.readByte();
        for (let i = 0; i < valueCount; i++, header >>= 1) {
            values[i] = header & 0x01 ? this.readSignedVB() : 0;
        }
    }
};
