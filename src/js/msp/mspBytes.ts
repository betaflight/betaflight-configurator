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

// Byte helpers for MSP payloads. Subclasses rather than patches on the built-in prototypes,
// so only buffers and views that MSP code creates carry them.

// A read past the end of the payload yields null — how a decoder meets a reply from older
// firmware that sends fewer fields (MSP_NAME reads until it sees one). The read helpers are
// typed `number` because every decoder is written that way; a short read stores null.
const PAST_END_OF_PAYLOAD = null as unknown as number;

/** An MSP request payload under construction: little-endian byte appends, chainable. */
export class MspBuffer extends Array<number> {
    /** Appends the low byte of `val`. */
    push8(val: number): this {
        this.push(0xff & val);
        return this;
    }

    /** Appends `val` as two little-endian bytes. */
    push16(val: number): this {
        // low byte
        this.push(0x00ff & val);
        // high byte
        this.push(val >> 8);
        return this;
    }

    /** Appends `val` as four little-endian bytes. */
    push32(val: number): this {
        this.push8(val)
            .push8(val >> 8)
            .push8(val >> 16)
            .push8(val >> 24);
        return this;
    }
}

/** An MSP reply payload with a read cursor shared by the read* helpers. */
export class MspDataView extends DataView<ArrayBufferLike> {
    offset = 0;

    readU8(): number {
        if (this.byteLength >= this.offset + 1) {
            return this.getUint8(this.offset++);
        }
        return PAST_END_OF_PAYLOAD;
    }

    readU16(): number {
        if (this.byteLength >= this.offset + 2) {
            return this.readU8() + this.readU8() * 256;
        }
        return PAST_END_OF_PAYLOAD;
    }

    readU32(): number {
        if (this.byteLength >= this.offset + 4) {
            return this.readU16() + this.readU16() * 65536;
        }
        return PAST_END_OF_PAYLOAD;
    }

    read8(): number {
        if (this.byteLength >= this.offset + 1) {
            return this.getInt8(this.offset++);
        }
        return PAST_END_OF_PAYLOAD;
    }

    read16(): number {
        this.offset += 2;
        if (this.byteLength >= this.offset) {
            return this.getInt16(this.offset - 2, true);
        }
        return PAST_END_OF_PAYLOAD;
    }

    read32(): number {
        this.offset += 4;
        if (this.byteLength >= this.offset) {
            return this.getInt32(this.offset - 4, true);
        }
        return PAST_END_OF_PAYLOAD;
    }

    remaining(): number {
        return this.byteLength - this.offset;
    }
}
