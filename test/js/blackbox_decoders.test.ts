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
import { ArrayDataStream } from "../../src/js/blackbox/datastream";
import "../../src/js/blackbox/decoders";

type Reader = "readTag2_3S32" | "readTag2_3SVariable" | "readTag8_4S16_v1" | "readTag8_4S16_v2";

/** Decodes one group and reports the values and how many bytes it consumed. */
function decode(reader: Reader, bytes: number[], valueCount = 4) {
    const stream = new ArrayDataStream(Uint8Array.from(bytes));
    const values = new Array<number>(valueCount).fill(99);
    stream[reader](values);
    return { values: values.slice(0, reader.startsWith("readTag2") ? 3 : 4), consumed: stream.pos };
}

// Shared by both Tag2_3S readers: three values sized 1/2/3/4 bytes by bit pairs, LSB first.
const CASE_3 = [
    { bytes: [0xf4, 0xff, 0x00, 0x80, 0x01, 0x00, 0x00, 0x80], values: [-1, -32768, -2147483647] },
    { bytes: [0xc2, 0xff, 0xff, 0x7f, 0x05, 0x80], values: [8388607, 5, -128] },
];

describe("readTag2_3S32", () => {
    it.each([
        { name: "three 2-bit values", bytes: [0x1b], values: [1, -2, -1] },
        { name: "three 4-bit values", bytes: [0x47, 0x9f], values: [7, -7, -1] },
        { name: "three 6-bit values", bytes: [0xa0, 0x1f, 0x3f], values: [-32, 31, -1] },
        ...CASE_3.map((c) => ({ name: "three byte-sized values", ...c })),
    ])("decodes $name", ({ bytes, values }) => {
        expect(decode("readTag2_3S32", bytes)).toEqual({ values, consumed: bytes.length });
    });
});

describe("readTag2_3SVariable", () => {
    it.each([
        { name: "three 2-bit values", bytes: [0x1b], values: [1, -2, -1] },
        { name: "5, 5 and 4-bit values", bytes: [0x61, 0x2e], values: [-16, -14, -2] },
        { name: "8, 7 and 7-bit values", bytes: [0xbf, 0xc1, 0xc0], values: [-1, 3, -64] },
        ...CASE_3.map((c) => ({ name: "three byte-sized values", ...c })),
    ])("decodes $name", ({ bytes, values }) => {
        expect(decode("readTag2_3SVariable", bytes)).toEqual({ values, consumed: bytes.length });
    });
});

describe("readTag8_4S16_v1", () => {
    it("decodes zero, 16-bit little-endian, 8-bit and a pair of 4-bit fields", () => {
        // Selector, LSB first: 16-bit, 8-bit, then 4-bit, which fills fields 2 and 3 from one byte.
        expect(decode("readTag8_4S16_v1", [0x1b, 0x00, 0x80, 0xfe, 0x7a])).toEqual({
            values: [-32768, -2, -6, 7],
            consumed: 5,
        });
        expect(decode("readTag8_4S16_v1", [0x00])).toEqual({ values: [0, 0, 0, 0], consumed: 1 });
    });

    it("skips the selector bits of the field a 4-bit pair fills", () => {
        // 4-bit pair in fields 0-1 (field 1's own bits are ignored), then 8-bit, then zero.
        expect(decode("readTag8_4S16_v1", [0x21, 0x7a, 0x80])).toEqual({ values: [-6, 7, -128, 0], consumed: 3 });
    });
});

describe("readTag8_4S16_v2", () => {
    it("packs fields by nibble, high nibble first", () => {
        // 4-bit, 8-bit, 16-bit, 4-bit: every field after the first straddles a byte.
        expect(decode("readTag8_4S16_v2", [0x79, 0x9f, 0xe0, 0x12, 0x34])).toEqual({
            values: [-7, -2, 291, 4],
            consumed: 5,
        });
    });

    it("reads byte-aligned 8 and 16-bit fields big-endian", () => {
        expect(decode("readTag8_4S16_v2", [0x0e, 0x80, 0x80, 0x01])).toEqual({
            values: [-128, -32767, 0, 0],
            consumed: 4,
        });
    });
});

describe("readTag8_8SVB", () => {
    it("reads a lone value without a header", () => {
        const stream = new ArrayDataStream(Uint8Array.from([0x03]));
        const values = [99];
        stream.readTag8_8SVB(values, 1);
        expect(values).toEqual([-2]);
    });

    it("reads only the values the header flags, LSB first", () => {
        const stream = new ArrayDataStream(Uint8Array.from([0x05, 0x02, 0x04]));
        const values = [99, 99, 99];
        stream.readTag8_8SVB(values, 3);
        expect(values).toEqual([1, 0, 2]);
        expect(stream.pos).toBe(3);
    });
});
