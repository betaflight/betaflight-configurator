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

export const HUFFMAN_EOF = -1;

/** A leaf of a Huffman tree: the byte `value` (or HUFFMAN_EOF) is coded as the low `codeLen` bits of `code`. */
export interface HuffmanTreeEntry {
    value: number;
    codeLen: number;
    code: number;
}

/** The leaf coded as the low `codeLen` bits of `code`, or undefined for an interior node. */
function findLeaf(
    huffmanTree: readonly HuffmanTreeEntry[],
    huffmanLenIndex: readonly number[],
    codeLen: number,
    code: number,
): HuffmanTreeEntry | undefined {
    const first = huffmanLenIndex[codeLen];
    if (first === -1 || first === undefined) {
        return undefined;
    }
    // only leaf nodes are stored in the tree, sorted by code length
    for (let i = first; i < huffmanTree.length && huffmanTree[i].codeLen === codeLen; ++i) {
        if (huffmanTree[i].code === code) {
            return huffmanTree[i];
        }
    }
    return undefined;
}

/**
 * Decodes `inBuf` until `inBufCharacterCount` bytes are out or the EOF code is read.
 * `huffmanTree` is sorted by code length, and `huffmanLenIndex[len]` is the index of its first
 * entry of that length, or -1 when there is none.
 */
function huffmanDecodeBuf(
    inBuf: Uint8Array,
    inBufCharacterCount: number,
    huffmanTree: readonly HuffmanTreeEntry[],
    huffmanLenIndex: readonly number[],
): Uint8Array {
    let code = 0;
    let codeLen = 0;
    let testBit = 0x80;
    let eof = false;
    const outBuf: number[] = [];

    while (!eof && inBuf.byteLength != 0) {
        if (outBuf.length == inBufCharacterCount) {
            // we've exhausted the input stream, discard any odd bits on the end
            break;
        }

        // get the next bit from the input buffer
        code <<= 1;
        ++codeLen;
        if (inBuf[0] & testBit) {
            code |= 0x01;
        }
        testBit >>= 1;
        if (testBit == 0) {
            testBit = 0x80;
            inBuf = inBuf.subarray(1);
        }

        // check if the code is a leaf node or an interior node
        const leaf = findLeaf(huffmanTree, huffmanLenIndex, codeLen, code);
        if (leaf) {
            if (leaf.value === HUFFMAN_EOF) {
                eof = true;
            } else {
                // output the value
                outBuf.push(leaf.value);
            }

            // reset the code to continue decompressing the input buffer
            code = 0;
            codeLen = 0;
        }
    }

    return new Uint8Array(outBuf);
}

export default huffmanDecodeBuf;
