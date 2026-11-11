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
import { SimpleStats } from "../../src/blackbox-viewer/simple-stats";
import { chunksOf } from "./fakeChunks";

const FIELDS = ["loopIteration", "time", "rcCommand[0]", "rcCommand[3]", "BaroAlt", "vbatLatest"];

function statsOf(rows: (number | null)[][][], fields = FIELDS) {
    return SimpleStats({
        getChunksInTimeRange: () => chunksOf(...rows),
        getMinTime: () => 0,
        getMaxTime: () => 1,
        getMainFieldNames: () => fields,
    }).calculate();
}

// Ten frames over two chunks, so every field index has a frame of its own.
const ROWS = [
    Array.from({ length: 5 }, (_, i) => [i, i * 10, i - 1, 1000 + i * 100, 50 + i, 1680 - i]),
    Array.from({ length: 5 }, (_, i) => [i + 5, (i + 5) * 10, i + 4, 1500 + i * 100, 55 + i, 1675 - i]),
];

describe("SimpleStats", () => {
    it("gives the range and mean of each summarised field over every chunk", () => {
        const stats = statsOf(ROWS);

        expect(stats.roll).toEqual({ name: "rcCommand[0]", min: -1, max: 8, mean: 3.5 });
        expect(stats.throttle).toEqual({ name: "rcCommand[3]", min: 1000, max: 1900, mean: 1450 });
        expect(stats.vbat).toEqual({ name: "vbatLatest", min: 1671, max: 1680, mean: 1675.5 });
    });

    it("reads the misspelt BaroAlt field as baroAlt", () => {
        expect(statsOf(ROWS).alt_baro).toEqual({ name: "baroAlt", min: 50, max: 59, mean: 54.5 });
    });

    it("leaves out a field the log does not have, and every field of an empty log", () => {
        expect(statsOf(ROWS).yaw).toBeUndefined();
        expect(statsOf(ROWS).alt_gps).toBeUndefined();
        expect(statsOf([[]]).roll).toBeUndefined();
    });

    it("keeps a field whose value happens to be 0 in the frame numbered by its index", () => {
        // rcCommand[0] is field 2; frame 2 has it at 0.
        const rows = [Array.from({ length: 5 }, (_, i) => [i, i * 10, i - 2, 1500, 50, 1680])];

        expect(statsOf(rows).roll).toEqual({ name: "rcCommand[0]", min: -2, max: 2, mean: 0 });
    });

    it("summarises a log with fewer frames than the field's index", () => {
        const rows = [[[0, 0, 5, 1500, 50, 1680]]];

        expect(statsOf(rows).vbat).toEqual({ name: "vbatLatest", min: 1680, max: 1680, mean: 1680 });
    });

    it("leaves null slots out of the range but counts them in the mean as 0", () => {
        const fields = ["loopIteration", "time", "GPS_altitude"];
        const rows = [
            [
                [0, 0, null],
                [1, 10, 100],
                [2, 20, 300],
                [3, 30, null],
            ],
        ];

        expect(statsOf(rows, fields).alt_gps).toEqual({ name: "GPS_altitude", min: 100, max: 300, mean: 100 });
        expect(statsOf([[[0, 0, null]]], fields).alt_gps).toBeUndefined();
    });
});
