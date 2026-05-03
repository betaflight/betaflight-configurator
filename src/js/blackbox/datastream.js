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

export function signExtend24Bit(u) {
    return u & 0x800000 ? u | 0xff000000 : u;
}

export function signExtend16Bit(word) {
    return word & 0x8000 ? word | 0xffff0000 : word;
}

export function signExtend8Bit(byte) {
    return byte & 0x80 ? byte | 0xffffff00 : byte;
}

export function signExtend7Bit(byte) {
    return byte & 0x40 ? byte | 0xffffff80 : byte;
}

export function signExtend6Bit(byte) {
    return byte & 0x20 ? byte | 0xffffffc0 : byte;
}

export function signExtend5Bit(byte) {
    return byte & 0x10 ? byte | 0xffffffe0 : byte;
}

export function signExtend4Bit(nibble) {
    return nibble & 0x08 ? nibble | 0xfffffff0 : nibble;
}

export function signExtend2Bit(byte) {
    return byte & 0x02 ? byte | 0xfffffffc : byte;
}

// --- ArrayDataStream ---

export function ArrayDataStream(data, start, end) {
    this.data = data;
    this.eof = false;
    this.start = start === undefined ? 0 : start;
    this.end = end === undefined ? data.length : end;
    this.pos = this.start;
}

ArrayDataStream.prototype.readChar = function () {
    if (this.pos < this.end) {
        return String.fromCodePoint(this.data[this.pos++]);
    }
    this.eof = true;
    return "";
};

ArrayDataStream.prototype.readByte = function () {
    if (this.pos < this.end) {
        return this.data[this.pos++];
    }
    this.eof = true;
    return EOF;
};

ArrayDataStream.prototype.readU8 = ArrayDataStream.prototype.readByte;

ArrayDataStream.prototype.readS8 = function () {
    return signExtend8Bit(this.readByte());
};

ArrayDataStream.prototype.unreadChar = function () {
    this.pos--;
};

ArrayDataStream.prototype.peekChar = function () {
    if (this.pos < this.end) {
        return String.fromCodePoint(this.data[this.pos]);
    }
    this.eof = true;
    return "";
};

ArrayDataStream.prototype.readUnsignedVB = function () {
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
};

ArrayDataStream.prototype.readSignedVB = function () {
    const unsigned = this.readUnsignedVB();
    return (unsigned >>> 1) ^ -(unsigned & 1);
};

ArrayDataStream.prototype.readString = function (length) {
    const chars = new Array(length);
    for (let i = 0; i < length; i++) {
        chars[i] = this.readChar();
    }
    return chars.join("");
};

ArrayDataStream.prototype.readS16 = function () {
    const b1 = this.readByte();
    const b2 = this.readByte();
    return signExtend16Bit(b1 | (b2 << 8));
};

ArrayDataStream.prototype.readU16 = function () {
    const b1 = this.readByte();
    const b2 = this.readByte();
    return b1 | (b2 << 8);
};

ArrayDataStream.prototype.readU32 = function () {
    const b1 = this.readByte();
    const b2 = this.readByte();
    const b3 = this.readByte();
    const b4 = this.readByte();
    return b1 | (b2 << 8) | (b3 << 16) | (b4 << 24);
};

ArrayDataStream.prototype.nextOffsetOf = function (needle) {
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
};

ArrayDataStream.prototype.EOF = EOF;
