import { signExtend16Bit, signExtend8Bit } from "./tools";

const EOF = -1;

/*
 * Take an array of unsigned byte data and present it as a stream with various methods
 * for reading data in different formats.
 */
export const ArrayDataStream = function (data, start, end) {
    this.data = data;
    this.eof = false;
    this.start = start === undefined ? 0 : start;
    this.end = end === undefined ? data.length : end;
    this.pos = this.start;
};

/**
 * Read a single byte from the string and turn it into a JavaScript string (assuming ASCII).
 *
 * @returns String containing one character, or EOF if the end of file was reached (eof flag
 * is set).
 */
ArrayDataStream.prototype.readChar = function () {
    if (this.pos < this.end) {
        return String.fromCodePoint(this.data[this.pos++]);
    }

    this.eof = true;
    return EOF;
};

/**
 * Read one unsigned byte from the stream
 *
 * @returns Unsigned byte, or EOF if the end of file was reached (eof flag is set).
 */
ArrayDataStream.prototype.readByte = function () {
    if (this.pos < this.end) {
        return this.data[this.pos++];
    }

    this.eof = true;
    return EOF;
};

//Synonym:
ArrayDataStream.prototype.readU8 = ArrayDataStream.prototype.readByte;

ArrayDataStream.prototype.readS8 = function () {
    return signExtend8Bit(this.readByte());
};

ArrayDataStream.prototype.unreadChar = function (_c) {
    this.pos--;
};

ArrayDataStream.prototype.peekChar = function () {
    if (this.pos < this.end) {
        return String.fromCodePoint(this.data[this.pos]);
    }

    this.eof = true;
    return EOF;
};

/**
 * Read a (maximally 32-bit) unsigned integer from the stream which was encoded in Variable Byte format.
 *
 * @returns the unsigned integer, or 0 if a valid integer could not be read (EOF was reached or integer format
 * was invalid).
 */
ArrayDataStream.prototype.readUnsignedVB = function () {
    let i,
        b,
        shift = 0,
        result = 0;

    // 5 bytes is enough to encode 32-bit unsigned quantities
    for (i = 0; i < 5; i++) {
        b = this.readByte();

        if (b === EOF) {
            return 0;
        }

        result = result | ((b & ~0x80) << shift);

        // Final byte?
        if (b < 128) {
            /*
             * Force the 32-bit integer to be reinterpreted as unsigned by doing an unsigned right shift, so that
             * the top bit being set doesn't cause it to interpreted as a negative number.
             */
            return result >>> 0;
        }

        shift += 7;
    }

    // This VB-encoded int is too long!
    return 0;
};

ArrayDataStream.prototype.readSignedVB = function () {
    const unsigned = this.readUnsignedVB();

    // Apply ZigZag decoding to recover the signed value
    return (unsigned >>> 1) ^ -(unsigned & 1);
};

ArrayDataStream.prototype.readString = function (length) {
    const chars = new Array(length);
    let i;

    for (i = 0; i < length; i++) {
        chars[i] = this.readChar();
    }

    return chars.join("");
};

ArrayDataStream.prototype.readS16 = function () {
    const b1 = this.readByte(),
        b2 = this.readByte();

    return signExtend16Bit(b1 | (b2 << 8));
};

ArrayDataStream.prototype.readU16 = function () {
    const b1 = this.readByte(),
        b2 = this.readByte();

    return b1 | (b2 << 8);
};

ArrayDataStream.prototype.readU32 = function () {
    const b1 = this.readByte(),
        b2 = this.readByte(),
        b3 = this.readByte(),
        b4 = this.readByte();
    return b1 | (b2 << 8) | (b3 << 16) | (b4 << 24);
};

/**
 * Search for the string 'needle' beginning from the current stream position up
 * to the end position. Return the offset of the first occurrence found.
 *
 * @param needle
 *            String to search for
 * @returns Position of the start of needle in the stream, or -1 if it wasn't
 *          found
 */
ArrayDataStream.prototype.nextOffsetOf = function (needle) {
    let i, j;

    for (i = this.pos; i <= this.end - needle.length; i++) {
        if (this.data[i] === needle[0]) {
            for (j = 1; j < needle.length && this.data[i + j] === needle[j]; j++) {
                // advance j to the first mismatch
            }

            if (j === needle.length) {
                return i;
            }
        }
    }

    return -1;
};

ArrayDataStream.prototype.EOF = EOF;
