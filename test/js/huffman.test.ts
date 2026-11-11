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
import huffmanDecodeBuf, { HUFFMAN_EOF } from "../../src/js/huffman";
import { defaultHuffmanLenIndex, defaultHuffmanTree } from "../../src/js/default_huffman_tree";

/** Encodes with the default tree, MSB first, zero-padding the last byte. */
function encode(values: number[]): Uint8Array {
    const bits = values
        .map((value) => {
            const entry = defaultHuffmanTree.find((e) => e.value === value);
            if (!entry) {
                throw new Error(`no code for ${value}`);
            }
            return entry.code.toString(2).padStart(entry.codeLen, "0");
        })
        .join("");
    const padded = bits.padEnd(Math.ceil(bits.length / 8) * 8, "0");
    return Uint8Array.from(padded.match(/.{8}/g) ?? [], (byte) => Number.parseInt(byte, 2));
}

const decode = (buf: Uint8Array, count: number) =>
    Array.from(huffmanDecodeBuf(buf, count, defaultHuffmanTree, defaultHuffmanLenIndex));

describe("huffmanDecodeBuf", () => {
    it("decodes codes of every length, across byte boundaries", () => {
        const values = [0x00, 0x01, 0x50, 0x10, 0x09, 0x0e, 0xf9, 0x00];
        expect(decode(encode(values), values.length)).toEqual(values);
    });

    it("stops after the expected number of bytes, ignoring padding", () => {
        expect(decode(encode([0x01, 0x01, 0x01, 0x00]), 3)).toEqual([0x01, 0x01, 0x01]);
    });

    it("stops at the end-of-file code", () => {
        expect(decode(encode([0x02, HUFFMAN_EOF, 0x03]), 3)).toEqual([0x02]);
    });

    it("returns nothing for an empty buffer", () => {
        expect(decode(new Uint8Array(), 5)).toEqual([]);
    });
});

describe("defaultHuffmanLenIndex", () => {
    it("points at the first tree entry of each code length", () => {
        defaultHuffmanTree.forEach((entry, i) => {
            const first = defaultHuffmanLenIndex[entry.codeLen];
            expect(first).toBeLessThanOrEqual(i);
            expect(defaultHuffmanTree[first].codeLen).toBe(entry.codeLen);
            expect(first === 0 || defaultHuffmanTree[first - 1].codeLen !== entry.codeLen).toBe(true);
        });
    });
});
