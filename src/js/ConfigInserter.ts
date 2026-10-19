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

import type { HexBlock, ParsedHex } from "./workers/hex_parser";

/** A position in a parsed image; byteIndex is unset when the address falls between blocks. */
interface ImageIndex {
    lineIndex: number;
    byteIndex?: number;
}

interface CustomDefaultsArea {
    startAddress: number;
    endAddress: number;
}

const CUSTOM_DEFAULTS_POINTER_ADDRESS = 0x08002800;
const BLOCK_SIZE = 16384;

function seek(firmware: ParsedHex, address: number): ImageIndex {
    let index = 0;
    for (
        ;
        index < firmware.data.length && address >= firmware.data[index].address + firmware.data[index].bytes;
        index++
    ) {
        // empty for loop to increment index
    }

    const result: ImageIndex = {
        lineIndex: index,
    };

    if (firmware.data[index] && address >= firmware.data[index].address) {
        result.byteIndex = address - firmware.data[index].address;
    }

    return result;
}

// Only called once seek() has found the address inside a block, so byteIndex is set.
function readUint32(firmware: ParsedHex, index: Required<ImageIndex>): number {
    let result = 0;
    for (let position = 0; position < 4; position++) {
        result += firmware.data[index.lineIndex].data[index.byteIndex++] << (8 * position);
        if (index.byteIndex >= firmware.data[index.lineIndex].bytes) {
            index.lineIndex++;
            index.byteIndex = 0;
        }
    }

    return result;
}

function getCustomDefaultsArea(firmware: ParsedHex): CustomDefaultsArea | undefined {
    const index = seek(firmware, CUSTOM_DEFAULTS_POINTER_ADDRESS);

    if (index.byteIndex === undefined) {
        return;
    }

    const position = { lineIndex: index.lineIndex, byteIndex: index.byteIndex };
    const startAddress = readUint32(firmware, position);
    const endAddress = readUint32(firmware, position);

    return { startAddress, endAddress };
}

function generateData(firmware: ParsedHex, input: string, startAddress: number): void {
    let address = startAddress;

    const index = seek(firmware, address);

    if (index.byteIndex !== undefined) {
        throw new Error("Configuration area in firmware not free.");
    }

    let inputIndex = 0;
    while (inputIndex < input.length) {
        const remaining = input.length - inputIndex;
        const line: HexBlock = {
            address: address,
            bytes: Math.min(BLOCK_SIZE, remaining),
            data: [],
        };

        if (firmware.data[index.lineIndex] && line.address + line.bytes > firmware.data[index.lineIndex].address) {
            throw new Error("Aborting data generation, free area too small.");
        }

        for (let i = 0; i < line.bytes; i++) {
            // One entry per UTF-16 unit, matching `bytes`; codePointAt would differ at surrogate pairs.
            line.data.push(input.charCodeAt(inputIndex++)); // NOSONAR
        }

        address = address + line.bytes;

        firmware.data.splice(index.lineIndex++, 0, line);
    }

    firmware.bytes_total += input.length;
}

const CONFIG_LABEL = `Custom defaults inserted in`;

export default class ConfigInserter {
    /**
     * Write `config` into the image's custom defaults area.
     * @returns false when the image has no custom defaults area
     * @throws when the area is too small or already holds data
     */
    insertConfig(firmware: ParsedHex, config: string): boolean {
        console.time(CONFIG_LABEL);

        const input = `# Betaflight\n${config}\0`;
        const customDefaultsArea = getCustomDefaultsArea(firmware);

        if (!customDefaultsArea || customDefaultsArea.endAddress - customDefaultsArea.startAddress === 0) {
            return false;
        } else if (input.length >= customDefaultsArea.endAddress - customDefaultsArea.startAddress) {
            throw new Error(
                `Custom defaults area too small (${
                    customDefaultsArea.endAddress - customDefaultsArea.startAddress
                } bytes), ${input.length + 1} bytes needed.`,
            );
        }

        generateData(firmware, input, customDefaultsArea.startAddress);

        console.timeEnd(CONFIG_LABEL);

        return true;
    }
}
