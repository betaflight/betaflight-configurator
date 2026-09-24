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

// Byte helpers the MSP encoders and decoders rely on, patched onto the built-in prototypes.

declare global {
    interface Number {
        clamp(min: number, max: number): number;
    }

    // eslint-disable-next-line unused-imports/no-unused-vars -- must match lib's Array<T> to merge
    interface Array<T> {
        /** Appends the low byte of `val`; chainable. */
        push8(val: number): this;
        /** Appends `val` as two little-endian bytes; chainable. */
        push16(val: number): this;
        /** Appends `val` as four little-endian bytes; chainable. */
        push32(val: number): this;
    }

    interface DataView {
        /** Read cursor shared by the read* helpers below. */
        offset: number;
        // The read* helpers return null once the payload is exhausted, which is how a decoder
        // meets a reply from older firmware that sends fewer fields. They are typed `number`
        // because every decoder is written that way; a short read stores null into the field.
        readU8(): number;
        readU16(): number;
        readU32(): number;
        read8(): number;
        read16(): number;
        read32(): number;
        remaining(): number;
    }
}

// See the DataView declaration above: a read past the payload yields null.
const PAST_END_OF_PAYLOAD = null as unknown as number;

Number.prototype.clamp = function (this: number, min: number, max: number) {
    return Math.min(Math.max(this, min), max);
};

Array.prototype.push8 = function (this: number[], val: number) {
    this.push(0xff & val);
    return this;
};

Array.prototype.push16 = function (this: number[], val: number) {
    // low byte
    this.push(0x00ff & val);
    // high byte
    this.push(val >> 8);
    // chainable
    return this;
};

Array.prototype.push32 = function (this: number[], val: number) {
    this.push8(val)
        .push8(val >> 8)
        .push8(val >> 16)
        .push8(val >> 24);
    return this;
};

DataView.prototype.offset = 0;
DataView.prototype.readU8 = function (this: DataView) {
    if (this.byteLength >= this.offset + 1) {
        return this.getUint8(this.offset++);
    } else {
        return PAST_END_OF_PAYLOAD;
    }
};

DataView.prototype.readU16 = function (this: DataView) {
    if (this.byteLength >= this.offset + 2) {
        return this.readU8() + this.readU8() * 256;
    } else {
        return PAST_END_OF_PAYLOAD;
    }
};

DataView.prototype.readU32 = function (this: DataView) {
    if (this.byteLength >= this.offset + 4) {
        return this.readU16() + this.readU16() * 65536;
    } else {
        return PAST_END_OF_PAYLOAD;
    }
};

DataView.prototype.read8 = function (this: DataView) {
    if (this.byteLength >= this.offset + 1) {
        return this.getInt8(this.offset++);
    } else {
        return PAST_END_OF_PAYLOAD;
    }
};

DataView.prototype.read16 = function (this: DataView) {
    this.offset += 2;
    if (this.byteLength >= this.offset) {
        return this.getInt16(this.offset - 2, true);
    } else {
        return PAST_END_OF_PAYLOAD;
    }
};

DataView.prototype.read32 = function (this: DataView) {
    this.offset += 4;
    if (this.byteLength >= this.offset) {
        return this.getInt32(this.offset - 4, true);
    } else {
        return PAST_END_OF_PAYLOAD;
    }
};

DataView.prototype.remaining = function (this: DataView) {
    return this.byteLength - this.offset;
};

export {};
