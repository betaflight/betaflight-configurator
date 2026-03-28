/**
 * This file is part of Betaflight Configurator.
 *
 * Betaflight Configurator is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General Public
 * License as published by the Free Software Foundation, either version 3 of
 * the License, or (at your option) any later version.
 *
 * Betaflight Configurator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this software. If not, see <http://www.gnu.org/licenses/>.
 *
 * AeroTune 7 — Binary Data Stream Reader
 * Reads bytes and bits from a BBL binary buffer.
 * Reference: BBL format specification (public documentation)
 */

class DataStream {
    /**
     * @param {Buffer|Uint8Array} buffer - Raw binary data
     * @param {number} start - Start offset in buffer
     * @param {number} end - End offset in buffer (exclusive)
     */
    constructor(buffer, start, end) {
        this.buffer = buffer;
        this.start = start || 0;
        this.end = end || buffer.length;
        this.pos = this.start;

        // For bit-level reading (used by some tag encodings)
        this.bitBuffer = 0;
        this.bitsInBuffer = 0;
    }

    // ── Basic reads ─────────────────────────────────────────────

    /** Read one unsigned byte */
    readByte() {
        if (this.pos >= this.end) {
            return -1;
        } // EOF
        return this.buffer[this.pos++];
    }

    /** Peek at next byte without advancing */
    peekByte() {
        if (this.pos >= this.end) return -1;
        return this.buffer[this.pos];
    }

    /** Read a signed 8-bit integer */
    readInt8() {
        let val = this.readByte();
        if (val > 127) val -= 256;
        return val;
    }

    /** Read unsigned 16-bit little-endian */
    readU16() {
        let lo = this.readByte();
        let hi = this.readByte();
        return (hi << 8) | lo;
    }

    /** Read signed 16-bit little-endian */
    readS16() {
        let val = this.readU16();
        if (val > 32767) val -= 65536;
        return val;
    }

    /** Read unsigned 32-bit little-endian */
    readU32() {
        let a = this.readByte();
        let b = this.readByte();
        let c = this.readByte();
        let d = this.readByte();
        return ((d << 24) | (c << 16) | (b << 8) | a) >>> 0;
    }

    /** Read signed 32-bit little-endian */
    readS32() {
        return this.readU32() | 0; // Force to signed
    }

    // ── Bit-level reads ─────────────────────────────────────────

    /** Read N bits from the stream */
    readBits(count) {
        // Fill the bit buffer as needed
        while (this.bitsInBuffer < count) {
            let byte = this.readByte();
            if (byte === -1) return 0;
            this.bitBuffer |= byte << this.bitsInBuffer;
            this.bitsInBuffer += 8;
        }

        let result = this.bitBuffer & ((1 << count) - 1);
        this.bitBuffer >>= count;
        this.bitsInBuffer -= count;
        return result;
    }

    /** Read 1 bit */
    readBit() {
        return this.readBits(1);
    }

    /** Discard any remaining bits in the bit buffer (re-align to byte boundary) */
    alignToByte() {
        this.bitBuffer = 0;
        this.bitsInBuffer = 0;
    }

    // ── Variable-byte encodings ─────────────────────────────────

    /**
     * Read an unsigned variable-byte encoded integer.
     * Each byte uses 7 data bits + 1 continuation bit (MSB).
     * Bit 7 = 1 means more bytes follow.
     * Bit 7 = 0 means this is the last byte.
     */
    readUnsignedVB() {
        let result = 0;
        let shift = 0;
        let byte;

        do {
            byte = this.readByte();
            if (byte === -1) return 0;
            result |= (byte & 0x7f) << shift;
            shift += 7;
        } while (byte & 0x80);

        return result;
    }

    /**
     * Read a signed variable-byte encoded integer.
     * Uses ZigZag encoding: small negatives map to small positives.
     * zigzag = (value << 1) ^ (value >> 31)
     * Decode: value = (zigzag >>> 1) ^ -(zigzag & 1)
     */
    readSignedVB() {
        let zigzag = this.readUnsignedVB();
        return (zigzag >>> 1) ^ -(zigzag & 1);
    }

    /**
     * Read a Neg 14-bit encoded value.
     * Value is negated and treated as unsigned 14-bit,
     * then encoded as unsigned variable byte.
     * Used for battery voltage.
     */
    readNeg14Bit() {
        let unsigned = this.readUnsignedVB();
        // Mask to 14 bits and negate
        return -(unsigned & 0x3fff);
    }

    // ── Tag-based encodings ─────────────────────────────────────

    /**
     * Tag8_8SVB (encoding 6)
     * If fieldCount == 1: read a single signedVB directly (no tag byte).
     * Otherwise: read a 1-byte tag header. Each bit indicates if the
     * corresponding field (up to 8 fields) is non-zero.
     * Non-zero fields follow as signed variable bytes.
     * Returns an array of decoded values.
     */
    readTag8_8SVB(fieldCount) {
        let values = [];

        if (fieldCount === 1) {
            // Single field: no tag byte, just a signedVB
            values.push(this.readSignedVB());
            return values;
        }

        let tag = this.readByte();
        if (tag === -1) return new Array(fieldCount).fill(0);

        for (let i = 0; i < fieldCount; i++) {
            if (tag & (1 << i)) {
                values.push(this.readSignedVB());
            } else {
                values.push(0);
            }
        }
        return values;
    }

    /**
     * Tag2_3S32 (encoding 7)
     * The top 2 bits of the first byte are the selector:
     *   Selector 0: 2 bits per field  — byte layout: ss11 2233
     *   Selector 1: 4 bits per field  — first byte: ss11 1111, second byte: 2222 3333
     *   Selector 2: 6 bits per field  — each field occupies bottom 6 bits of its own byte
     *   Selector 3: variable width    — each field is 8/16/24/32 bits, 2 bits per field in
     *                                   leadByte indicate which (0=8bit, 1=16bit, 2=24bit, 3=32bit)
     * Returns array of 3 values.
     */
    readTag2_3S32() {
        let leadByte = this.readByte();
        if (leadByte === -1) return [0, 0, 0];

        let selector = leadByte >> 6;
        let values = [0, 0, 0];

        switch (selector) {
            case 0:
                // 2-bit fields: byte = ss11 2233
                values[0] = this._signExtend((leadByte >> 4) & 0x03, 2);
                values[1] = this._signExtend((leadByte >> 2) & 0x03, 2);
                values[2] = this._signExtend(leadByte & 0x03, 2);
                break;

            case 1:
                // 4-bit fields: first byte ss11 1111, second byte 2222 3333
                values[0] = this._signExtend(leadByte & 0x0f, 4);
                leadByte = this.readByte();
                values[1] = this._signExtend(leadByte >> 4, 4);
                values[2] = this._signExtend(leadByte & 0x0f, 4);
                break;

            case 2:
                // 6-bit fields: each field in bottom 6 bits of its own byte
                values[0] = this._signExtend(leadByte & 0x3f, 6);
                leadByte = this.readByte();
                values[1] = this._signExtend(leadByte & 0x3f, 6);
                leadByte = this.readByte();
                values[2] = this._signExtend(leadByte & 0x3f, 6);
                break;

            case 3:
                // Variable width: 2 bits in leadByte per field say 8/16/24/32 bits
                for (let i = 0; i < 3; i++) {
                    let fieldTag = leadByte & 0x03;
                    leadByte >>= 2;
                    let b1, b2, b3, b4;
                    switch (fieldTag) {
                        case 0: // 8-bit signed
                            b1 = this.readByte();
                            values[i] = this._signExtend(b1, 8);
                            break;
                        case 1: // 16-bit signed little-endian
                            b1 = this.readByte();
                            b2 = this.readByte();
                            values[i] = this._signExtend(b1 | (b2 << 8), 16);
                            break;
                        case 2: // 24-bit signed little-endian
                            b1 = this.readByte();
                            b2 = this.readByte();
                            b3 = this.readByte();
                            values[i] = this._signExtend(b1 | (b2 << 8) | (b3 << 16), 24);
                            break;
                        case 3: // 32-bit signed little-endian
                            b1 = this.readByte();
                            b2 = this.readByte();
                            b3 = this.readByte();
                            b4 = this.readByte();
                            values[i] = Math.trunc(b1 | (b2 << 8) | (b3 << 16) | (b4 << 24));
                            break;
                    }
                }
                break;
        }

        return values;
    }

    /**
     * Tag8_4S16 v2 (encoding 8, data version >= 2)
     * A 1-byte tag for 4 signed values.
     * Each 2-bit pair in the tag says how many bits that field uses:
     *   0 = value is 0 (no bytes)
     *   1 = 4-bit signed (fields packed in nibbles)
     *   2 = 8-bit signed
     *   3 = 16-bit signed
     * Nibble-aligned: 4-bit values are packed consecutively.
     * Returns array of 4 values.
     */
    readTag8_4S16() {
        let selector = this.readByte();
        if (selector === -1) return [0, 0, 0, 0];

        let values = [0, 0, 0, 0];
        let nibbleIndex = 0;
        let buf = 0;
        let char1, char2;

        for (let i = 0; i < 4; i++) {
            let fieldTag = selector & 0x03;
            selector >>= 2;

            switch (fieldTag) {
                case 0: // zero
                    values[i] = 0;
                    break;

                case 1: // 4-bit signed, nibble-packed
                    if (nibbleIndex === 0) {
                        buf = this.readByte();
                        values[i] = this._signExtend(buf >> 4, 4);
                        nibbleIndex = 1;
                    } else {
                        values[i] = this._signExtend(buf & 0x0f, 4);
                        nibbleIndex = 0;
                    }
                    break;

                case 2: // 8-bit signed
                    if (nibbleIndex === 0) {
                        values[i] = this._signExtend(this.readByte(), 8);
                    } else {
                        char1 = (buf & 0x0f) << 4;
                        buf = this.readByte();
                        char1 |= buf >> 4;
                        values[i] = this._signExtend(char1, 8);
                    }
                    break;

                case 3: // 16-bit signed
                    if (nibbleIndex === 0) {
                        char1 = this.readByte();
                        char2 = this.readByte();
                        values[i] = this._signExtend((char1 << 8) | char2, 16);
                    } else {
                        char1 = this.readByte();
                        char2 = this.readByte();
                        values[i] = this._signExtend(((buf & 0x0f) << 12) | (char1 << 4) | (char2 >> 4), 16);
                        buf = char2;
                    }
                    break;
            }
        }

        return values;
    }

    /**
     * Tag2_3SVARIABLE (encoding 10)
     * Same top-2-bit selector as Tag2_3S32 but cases 1 and 2 use different bit widths:
     *   Selector 0: 2, 2, 2 bits  — identical to Tag2_3S32 selector 0
     *   Selector 1: 5, 5, 4 bits
     *     byte0: ss AAAAAB  (A = v0[4:0], B = v1[4])
     *     byte1: BBBB CCCC  (B = v1[3:0], C = v2[3:0])
     *   Selector 2: 8, 7, 7 bits
     *     byte0: ss AAAAAA  (A = v0[7:2])
     *     byte1: AA BBBBBB  (A = v0[1:0], B = v1[6:1])
     *     byte2:  B CCCCCCC (B = v1[0],   C = v2[6:0])
     *   Selector 3: variable width — identical to Tag2_3S32 selector 3
     */
    readTag2_3SVariable() {
        let leadByte = this.readByte();
        if (leadByte === -1) return [0, 0, 0];

        const selector = leadByte >> 6;
        const values = [0, 0, 0];

        switch (selector) {
            case 0:
                // 2-bit fields — same layout as Tag2_3S32 selector 0
                values[0] = this._signExtend((leadByte >> 4) & 0x03, 2);
                values[1] = this._signExtend((leadByte >> 2) & 0x03, 2);
                values[2] = this._signExtend(leadByte & 0x03, 2);
                break;

            case 1: {
                // 5, 5, 4 bits packed into two bytes
                const b1 = this.readByte();
                values[0] = this._signExtend((leadByte & 0x3e) >> 1, 5);
                values[1] = this._signExtend(((leadByte & 0x01) << 4) | (b1 >> 4), 5);
                values[2] = this._signExtend(b1 & 0x0f, 4);
                break;
            }

            case 2: {
                // 8, 7, 7 bits packed into three bytes
                const b1 = this.readByte();
                const b2 = this.readByte();
                values[0] = this._signExtend(((leadByte & 0x3f) << 2) | (b1 >> 6), 8);
                values[1] = this._signExtend(((b1 & 0x3f) << 1) | (b2 >> 7), 7);
                values[2] = this._signExtend(b2 & 0x7f, 7);
                break;
            }

            case 3:
                // Variable width — identical to Tag2_3S32 selector 3
                for (let i = 0; i < 3; i++) {
                    const fieldTag = leadByte & 0x03;
                    leadByte >>= 2;
                    let b1, b2, b3, b4;
                    switch (fieldTag) {
                        case 0:
                            values[i] = this._signExtend(this.readByte(), 8);
                            break;
                        case 1:
                            b1 = this.readByte();
                            b2 = this.readByte();
                            values[i] = this._signExtend(b1 | (b2 << 8), 16);
                            break;
                        case 2:
                            b1 = this.readByte();
                            b2 = this.readByte();
                            b3 = this.readByte();
                            values[i] = this._signExtend(b1 | (b2 << 8) | (b3 << 16), 24);
                            break;
                        case 3:
                            b1 = this.readByte();
                            b2 = this.readByte();
                            b3 = this.readByte();
                            b4 = this.readByte();
                            values[i] = Math.trunc(b1 | (b2 << 8) | (b3 << 16) | (b4 << 24));
                            break;
                    }
                }
                break;
        }

        return values;
    }

    // ── Helpers ─────────────────────────────────────────────────

    /** Sign-extend a value from N bits to 32 bits */
    _signExtend(value, bits) {
        let mask = 1 << (bits - 1);
        return (value ^ mask) - mask;
    }

    /** Check if we've reached the end */
    eof() {
        return this.pos >= this.end;
    }

    /** Get remaining bytes */
    remaining() {
        return this.end - this.pos;
    }

    /** Get current position */
    getPos() {
        return this.pos;
    }

    /** Set position */
    setPos(pos) {
        this.pos = pos;
        this.alignToByte();
    }

    /** Skip N bytes */
    skip(n) {
        this.pos += n;
    }
}

export { DataStream };
