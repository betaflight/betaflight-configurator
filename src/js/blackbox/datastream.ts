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
 * Ported from betaflight-blackbox-log-viewer/src/datastream.js
 * and betaflight-blackbox-log-viewer/src/tools.js (signExtend functions).
 *
 * Provides ArrayDataStream for reading blackbox binary log data with
 * variable-byte encoding support.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const EOF = -1;

// --- Sign-extension helpers ---

export function signExtend24Bit(u: number): number {
    return u & 0x800000 ? u | 0xff000000 : u;
}

export function signExtend16Bit(word: number): number {
    return word & 0x8000 ? word | 0xffff0000 : word;
}

export function signExtend8Bit(byte: number): number {
    return byte & 0x80 ? byte | 0xffffff00 : byte;
}

export function signExtend7Bit(byte: number): number {
    return byte & 0x40 ? byte | 0xffffff80 : byte;
}

export function signExtend6Bit(byte: number): number {
    return byte & 0x20 ? byte | 0xffffffc0 : byte;
}

export function signExtend5Bit(byte: number): number {
    return byte & 0x10 ? byte | 0xffffffe0 : byte;
}

export function signExtend4Bit(nibble: number): number {
    return nibble & 0x08 ? nibble | 0xfffffff0 : nibble;
}

export function signExtend2Bit(byte: number): number {
    return byte & 0x02 ? byte | 0xfffffffc : byte;
}

// --- ArrayDataStream ---

/** Reads a blackbox log from a byte array, between `start` and `end`. */
export class ArrayDataStream {
    data: ArrayLike<number>;
    eof: boolean;
    start: number;
    end: number;
    pos: number;
    /** What readByte() returns past the end. */
    readonly EOF = EOF;

    constructor(data: ArrayLike<number>, start?: number, end?: number) {
        this.data = data;
        this.eof = false;
        this.start = start ?? 0;
        this.end = end ?? data.length;
        this.pos = this.start;
    }

    readChar(): string {
        if (this.pos < this.end) {
            return String.fromCodePoint(this.data[this.pos++]);
        }
        this.eof = true;
        return "";
    }

    readByte(): number {
        if (this.pos < this.end) {
            return this.data[this.pos++];
        }
        this.eof = true;
        return EOF;
    }

    readU8(): number {
        return this.readByte();
    }

    readS8(): number {
        return signExtend8Bit(this.readByte());
    }

    unreadChar(): void {
        if (this.pos > this.start) {
            this.pos--;
        }
    }

    peekChar(): string {
        if (this.pos < this.end) {
            return String.fromCodePoint(this.data[this.pos]);
        }
        this.eof = true;
        return "";
    }

    readUnsignedVB(): number {
        let shift = 0;
        let result = 0;

        for (let i = 0; i < 5; i++) {
            const b = this.readByte();
            if (b === EOF) {
                return 0;
            }

            result = result | ((b & ~0x80) << shift);

            if (b < 128) {
                return result >>> 0;
            }
            shift += 7;
        }
        return 0;
    }

    readSignedVB(): number {
        const unsigned = this.readUnsignedVB();
        return (unsigned >>> 1) ^ -(unsigned & 1);
    }

    readString(length: number): string {
        const chars = new Array<string>(length);
        for (let i = 0; i < length; i++) {
            chars[i] = this.readChar();
        }
        return chars.join("");
    }

    readS16(): number {
        const b1 = this.readByte();
        const b2 = this.readByte();
        return signExtend16Bit(b1 | (b2 << 8));
    }

    readU16(): number {
        const b1 = this.readByte();
        const b2 = this.readByte();
        return b1 | (b2 << 8);
    }

    readU32(): number {
        const b1 = this.readByte();
        const b2 = this.readByte();
        const b3 = this.readByte();
        const b4 = this.readByte();
        return (b1 | (b2 << 8) | (b3 << 16) | (b4 << 24)) >>> 0;
    }

    nextOffsetOf(needle: ArrayLike<number>): number {
        for (let i = this.pos; i <= this.end - needle.length; i++) {
            if (this.data[i] === needle[0]) {
                let j = 1;
                while (j < needle.length && this.data[i + j] === needle[j]) {
                    j++;
                }
                if (j === needle.length) {
                    return i;
                }
            }
        }
        return -1;
    }
}
