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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConfigInserter from "../../src/js/ConfigInserter";
import type { HexBlock, ParsedHex } from "../../src/js/workers/hex_parser";

const POINTER_ADDRESS = 0x08002800;
const AREA_START = 0x08010000;

function le32(value: number): number[] {
    return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function image(...blocks: HexBlock[]): ParsedHex {
    return {
        data: blocks,
        end_of_file: true,
        bytes_total: blocks.reduce((total, block) => total + block.bytes, 0),
        start_linear_address: 0,
    };
}

function block(address: number, data: number[]): HexBlock {
    return { address, bytes: data.length, data };
}

// Pointer block naming [start, end) as the custom defaults area.
function pointers(start: number, end: number): HexBlock {
    return block(POINTER_ADDRESS, [...le32(start), ...le32(end)]);
}

function bytesOf(text: string): number[] {
    return [...text].map((c) => c.charCodeAt(0));
}

describe("ConfigInserter.insertConfig", () => {
    beforeEach(() => {
        vi.spyOn(console, "time").mockImplementation(() => {});
        vi.spyOn(console, "timeEnd").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("inserts the config as a new block at the start of the area", () => {
        const firmware = image(pointers(AREA_START, AREA_START + 0x4000), block(AREA_START + 0x4000, [1, 2]));

        expect(new ConfigInserter().insertConfig(firmware, "set x = 1")).toBe(true);

        const text = "# Betaflight\nset x = 1\0";
        expect(firmware.data.map((b) => b.address)).toEqual([POINTER_ADDRESS, AREA_START, AREA_START + 0x4000]);
        expect(firmware.data[1]).toEqual(block(AREA_START, bytesOf(text)));
        expect(firmware.bytes_total).toBe(8 + 2 + text.length);
    });

    it("reads a pointer that is split across two blocks", () => {
        const bytes = [...le32(AREA_START), ...le32(AREA_START + 0x4000)];
        const firmware = image(block(POINTER_ADDRESS, bytes.slice(0, 3)), block(POINTER_ADDRESS + 3, bytes.slice(3)));

        expect(new ConfigInserter().insertConfig(firmware, "x")).toBe(true);
        expect(firmware.data[2].address).toBe(AREA_START);
    });

    it("splits a config longer than 16 KiB into 16 KiB blocks", () => {
        const firmware = image(pointers(AREA_START, AREA_START + 0x10000));
        const config = "a".repeat(20000);

        expect(new ConfigInserter().insertConfig(firmware, config)).toBe(true);

        const length = "# Betaflight\n".length + config.length + 1;
        expect(firmware.data.slice(1).map((b) => [b.address, b.bytes])).toEqual([
            [AREA_START, 16384],
            [AREA_START + 16384, length - 16384],
        ]);
        expect(firmware.bytes_total).toBe(8 + length);
    });

    it("returns false when the image has no pointer block", () => {
        const firmware = image(block(0x08000000, [0, 0]));

        expect(new ConfigInserter().insertConfig(firmware, "x")).toBe(false);
        expect(firmware.data).toHaveLength(1);
    });

    it("returns false when the area is empty", () => {
        const firmware = image(pointers(AREA_START, AREA_START));

        expect(new ConfigInserter().insertConfig(firmware, "x")).toBe(false);
        expect(firmware.data).toHaveLength(1);
    });

    it("throws when the config does not fit the area", () => {
        const firmware = image(pointers(AREA_START, AREA_START + 17));

        // "# Betaflight\n" + "abc" + NUL is 17 characters, as many as the area holds.
        expect(() => new ConfigInserter().insertConfig(firmware, "abc")).toThrow(
            "Custom defaults area too small (17 bytes), 18 bytes needed.",
        );
    });

    it("accepts a config with a byte to spare", () => {
        // The check is `length >= area`, so 17 characters need 18 bytes, as the message says.
        const firmware = image(pointers(AREA_START, AREA_START + 18));

        expect(new ConfigInserter().insertConfig(firmware, "abc")).toBe(true);
    });

    it("throws when the area already holds data", () => {
        const firmware = image(pointers(AREA_START, AREA_START + 0x4000), block(AREA_START, [0xff]));

        expect(() => new ConfigInserter().insertConfig(firmware, "x")).toThrow(
            "Configuration area in firmware not free.",
        );
    });

    it("fits between a block that ends at the area and one that starts right after the config", () => {
        const text = "# Betaflight\nx\0";
        const firmware = image(
            pointers(AREA_START, AREA_START + 0x4000),
            block(AREA_START - 2, [1, 2]),
            block(AREA_START + text.length, [3]),
        );

        expect(new ConfigInserter().insertConfig(firmware, "x")).toBe(true);
        expect(firmware.data[2]).toEqual(block(AREA_START, bytesOf(text)));
    });

    it("throws when the next block overlaps the config's last byte", () => {
        const text = "# Betaflight\nx\0";
        const firmware = image(pointers(AREA_START, AREA_START + 0x4000), block(AREA_START + text.length - 1, [0xff]));

        expect(() => new ConfigInserter().insertConfig(firmware, "x")).toThrow(
            "Aborting data generation, free area too small.",
        );
    });
});
