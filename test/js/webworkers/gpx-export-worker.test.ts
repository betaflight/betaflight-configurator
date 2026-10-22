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
    await import("../../../src/js/webworkers/gpx-export-worker");
    const handler = (self as unknown as { onmessage: (event: { data: unknown }) => void }).onmessage;
    handler({ data });
    return vi.mocked(self.postMessage).mock.lastCall?.[0] as string;
}

const fieldNames = ["time", "GPS_coord[0]", "GPS_coord[1]", "GPS_altitude"];

describe("gpx-export-worker", () => {
    beforeEach(() => {
        vi.spyOn(self, "postMessage").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("writes one track point per frame with a position, timed from the log start", async () => {
        const gpx = await runWorker({
            sysConfig: { "Log start datetime": "2024-01-02T03:04:05.000Z" },
            fieldNames,
            frames: [
                // No fix yet: latitude 0, so the frame is skipped.
                [[1000000, 0, 47500000, 100]],
                [
                    [1500999, 525000000, 47500000, 123],
                    [2000000, -337500000, -1500000, -5],
                ],
            ],
        });

        expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<gpx ')).toBe(true);
        expect(gpx.endsWith("  </trk>\n</gpx>")).toBe(true);
        expect(gpx.match(/<trkpt.*<\/trkpt>/g)).toEqual([
            '<trkpt lat="52.5" lon="4.75"><ele>12.3</ele><time>2024-01-02T03:04:06.500Z</time></trkpt>',
            '<trkpt lat="-33.75" lon="-0.15"><ele>-0.5</ele><time>2024-01-02T03:04:07.000Z</time></trkpt>',
        ]);
    });

    it("skips a frame without a longitude", async () => {
        const gpx = await runWorker({
            sysConfig: { "Log start datetime": "2024-01-02T03:04:05.000Z" },
            fieldNames,
            frames: [[[1000000, 525000000, 0, 100]]],
        });

        expect(gpx).not.toContain("<trkpt");
    });
});
