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

// The worker assigns self.onmessage and answers through self.postMessage. Under jsdom `self` is
// the window, so the test loads the file fresh, sends it a request and reads what it posts.
async function runWorker(data: unknown): Promise<string> {
    vi.resetModules();
    await import("../../../src/js/webworkers/csv-export-worker");
    const handler = (self as unknown as { onmessage: (event: { data: unknown }) => void }).onmessage;
    handler({ data });
    return vi.mocked(self.postMessage).mock.lastCall?.[0] as string;
}

const request = (opts: Partial<{ columnDelimiter: string; stringDelimiter: string; quoteStrings: boolean }> = {}) => ({
    sysConfig: { "Firmware revision": "Betaflight 4.5.0", looptime: 125, empty: null },
    fieldNames: ["time", "gyroADC[0]"],
    frames: [
        [
            [0, -12],
            [125, null],
        ],
        [[250, 0]],
    ],
    opts: { columnDelimiter: ",", stringDelimiter: '"', quoteStrings: true, ...opts },
});

describe("csv-export-worker", () => {
    beforeEach(() => {
        vi.spyOn(self, "postMessage").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("writes the header, the field names and one row per frame across chunks", async () => {
        expect(await runWorker(request())).toBe(
            [
                '"Firmware revision","Betaflight 4.5.0"',
                '"looptime",125',
                '"empty",""',
                '"time","gyroADC[0]"',
                "0,-12",
                "125,NaN",
                "250,0",
            ].join("\n"),
        );
    });

    it("uses the given delimiters, and no quotes when quoting is off", async () => {
        const csv = await runWorker(request({ columnDelimiter: ";", quoteStrings: false }));
        expect(csv.split("\n").slice(0, 4)).toEqual([
            "Firmware revision;Betaflight 4.5.0",
            "looptime;125",
            "empty;",
            "time;gyroADC[0]",
        ]);

        const tabbed = await runWorker(request({ columnDelimiter: "\t", stringDelimiter: "'" }));
        expect(tabbed.split("\n")[3]).toBe("'time'\t'gyroADC[0]'");
    });

    it("escapes embedded quotes, delimiters, and line breaks in string headers", async () => {
        const data = {
            ...request(),
            sysConfig: {
                'pilot"name': 'A,"B"\r\nC',
                "tab;name": "semi;colon",
            },
            fieldNames: ['time,"ms"', "line\nbreak"],
        };

        expect(await runWorker(data)).toBe(
            [
                '"pilot""name","A,""B""\r\nC"',
                '"tab;name","semi;colon"',
                '"time,""ms""","line\nbreak"',
                "0,-12",
                "125,NaN",
                "250,0",
            ].join("\n"),
        );
    });

    it("quotes only CSV-sensitive frame strings and leaves numbers and NaN unchanged", async () => {
        const data = {
            ...request(),
            frames: [[["ordinary", "a,b", 'say "hi"', "a\rb", "a\nb", 0, null]]],
        };

        expect((await runWorker(data)).split("\n").slice(4).join("\n")).toBe(
            ['ordinary,"a,b","say ""hi""","a\rb","a\nb",0,NaN'].join("\n"),
        );
    });

    it("supports custom column and quote delimiters", async () => {
        const data = {
            ...request({ columnDelimiter: ";", stringDelimiter: "'" }),
            sysConfig: { "key;name": "it's fine" },
            fieldNames: ["time", "value"],
            frames: [[["a;b", "it's", 1]]],
        };

        expect(await runWorker(data)).toBe(
            ["'key;name';'it''s fine'", "'time';'value'", "'a;b';'it''s';1"].join("\n"),
        );
    });

    it("preserves raw string output when quoteStrings is disabled", async () => {
        const data = {
            ...request({ columnDelimiter: ";", quoteStrings: false }),
            sysConfig: { "k;e;y": 'some "text"' },
            fieldNames: ["a;b", "second"],
            frames: [[["a;b", "value", 0, null]]],
        };

        expect(await runWorker(data)).toBe(
            ['k;e;y;some "text"', "a;b;second", "a;b;value;0;NaN"].join("\n"),
        );
    });
});
