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

import { describe, expect, it } from "vitest";
import { ArrayDataStream, signExtend2Bit, signExtend8Bit, signExtend24Bit } from "../../src/js/blackbox/datastream";

const stream = (...bytes: number[]) => new ArrayDataStream(Uint8Array.from(bytes));

describe("ArrayDataStream", () => {
    it("reads between start and end, and flags eof past the end", () => {
        const s = new ArrayDataStream(Uint8Array.from([1, 2, 3, 4]), 1, 3);
        expect([s.readByte(), s.readByte()]).toEqual([2, 3]);
        expect(s.eof).toBe(false);
        expect(s.readByte()).toBe(s.EOF);
        expect(s.eof).toBe(true);
    });

    it("does not unread past the start", () => {
        const s = new ArrayDataStream(Uint8Array.from([65, 66]), 1);
        s.unreadChar();
        expect(s.readChar()).toBe("B");
        s.unreadChar();
        expect(s.peekChar()).toBe("B");
        expect(s.pos).toBe(1);
    });

    it("reads little-endian integers, sign-extending the signed ones", () => {
        expect(stream(0xfe, 0xff).readS16()).toBe(-2);
        expect(stream(0xfe, 0xff).readU16()).toBe(0xfffe);
        expect(stream(0xff, 0xff, 0xff, 0xff).readU32()).toBe(0xffffffff);
        expect(stream(0x80).readS8()).toBe(-128);
    });

    it("reads unsigned variable-byte integers, 7 bits per byte", () => {
        expect(stream(0x05).readUnsignedVB()).toBe(5);
        expect(stream(0x80, 0x01).readUnsignedVB()).toBe(128);
        expect(stream(0xac, 0x02).readUnsignedVB()).toBe(300);
        expect(stream(0xff, 0xff, 0xff, 0xff, 0x0f).readUnsignedVB()).toBe(0xffffffff);
    });

    it("gives 0 for a variable-byte integer that is truncated or longer than 5 bytes", () => {
        expect(stream(0x80).readUnsignedVB()).toBe(0);
        expect(stream(0x80, 0x80, 0x80, 0x80, 0x80, 0x01).readUnsignedVB()).toBe(0);
    });

    it("zig-zag decodes signed variable-byte integers", () => {
        expect([0, 1, 2, 3].map((b) => stream(b).readSignedVB())).toEqual([0, -1, 1, -2]);
    });

    it("reads a fixed-length string", () => {
        expect(stream(72, 105, 33).readString(2)).toBe("Hi");
    });

    it("finds the next offset of a byte sequence from the current position", () => {
        const s = stream(1, 2, 3, 1, 2, 3);
        s.readByte();
        expect(s.nextOffsetOf([1, 2])).toBe(3);
        expect(s.nextOffsetOf([2, 4])).toBe(-1);
    });
});

describe("sign extension", () => {
    it("extends only when the top bit of the field is set", () => {
        expect([signExtend2Bit(1), signExtend2Bit(2), signExtend2Bit(3)]).toEqual([1, -2, -1]);
        expect([signExtend8Bit(0x7f), signExtend8Bit(0x80)]).toEqual([127, -128]);
        expect([signExtend24Bit(0x7fffff), signExtend24Bit(0x800000)]).toEqual([0x7fffff, -0x800000]);
    });
});
