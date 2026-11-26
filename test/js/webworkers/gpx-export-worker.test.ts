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

    it("writes a track point for each position, timed from the log start", async () => {
        const gpx = await runWorker({
            sysConfig: { "Log start datetime": "2024-01-02T03:04:05.000Z" },
            fieldNames,
            frames: [
                // No fix yet: latitude 0, so the frame is skipped.
                [[1000000, 0, 311342000, 100]],
                [
                    [1500999, 299792000, 311342000, 123],
                    [2000000, -337500000, -1500000, -5],
                ],
            ],
        });

        expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<gpx ')).toBe(true);
        expect(gpx.endsWith("  </trk>\n</gpx>")).toBe(true);
        expect(gpx.match(/<trkpt.*<\/trkpt>/g)).toEqual([
            '<trkpt lat="29.9792" lon="31.1342"><ele>12.3</ele><time>2024-01-02T03:04:06.500Z</time></trkpt>',
            '<trkpt lat="-33.75" lon="-0.15"><ele>-0.5</ele><time>2024-01-02T03:04:07.000Z</time></trkpt>',
        ]);
    });

    it("skips frames before the first GPS frame, and writes a missing altitude as 0", async () => {
        const gpx = await runWorker({
            sysConfig: { "Log start datetime": "2024-01-02T03:04:05.000Z" },
            fieldNames,
            frames: [
                [
                    [1000000, null, null, null],
                    [2000000, 299792000, 311342000, null],
                ],
            ],
        });

        expect(gpx.match(/<trkpt.*<\/trkpt>/g)).toEqual([
            '<trkpt lat="29.9792" lon="31.1342"><ele>0</ele><time>2024-01-02T03:04:07.000Z</time></trkpt>',
        ]);
    });

    it("writes a repeated fix once, at the frame it first appeared in, and ends at the last frame", async () => {
        const gpx = await runWorker({
            sysConfig: { "Log start datetime": "2024-01-02T03:04:05.000Z" },
            fieldNames,
            frames: [
                [
                    [1000000, 299792000, 311342000, 123],
                    [1001000, 299792000, 311342000, 123],
                ],
                [
                    // The same fix carried into the next chunk.
                    [1002000, 299792000, 311342000, 123],
                    // Only the altitude changed.
                    [1100000, 299792000, 311342000, 124],
                    [1101000, 299792000, 311342000, 124],
                    // Back to an earlier position: still a new point in the track.
                    [1200000, 299792000, 311342000, 123],
                    [1201000, 299792000, 311342000, 123],
                    // The last frame with a position, written although it repeats the fix.
                    [1300000, 299792000, 311342000, 123],
                    // No position: not the end of the track.
                    [1400000, 0, 0, 0],
                ],
            ],
        });

        expect(gpx.match(/<trkpt.*<\/trkpt>/g)).toEqual([
            '<trkpt lat="29.9792" lon="31.1342"><ele>12.3</ele><time>2024-01-02T03:04:06.000Z</time></trkpt>',
            '<trkpt lat="29.9792" lon="31.1342"><ele>12.4</ele><time>2024-01-02T03:04:06.100Z</time></trkpt>',
            '<trkpt lat="29.9792" lon="31.1342"><ele>12.3</ele><time>2024-01-02T03:04:06.200Z</time></trkpt>',
            '<trkpt lat="29.9792" lon="31.1342"><ele>12.3</ele><time>2024-01-02T03:04:06.300Z</time></trkpt>',
        ]);
    });

    it("skips a frame without a longitude", async () => {
        const gpx = await runWorker({
            sysConfig: { "Log start datetime": "2024-01-02T03:04:05.000Z" },
            fieldNames,
            frames: [[[1000000, 299792000, 0, 100]]],
        });

        expect(gpx).not.toContain("<trkpt");
    });
});
