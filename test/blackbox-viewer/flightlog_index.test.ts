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
import { FlightLogIndex } from "../../src/blackbox-viewer/flightlog_index";
import { HEADER, headerBytes, intraFrame, intraFrames, log, logEndEvent } from "./syntheticLog";

const index = (bytes: number[]) => new FlightLogIndex(new Uint8Array(bytes));

describe("FlightLogIndex", () => {
    it("finds every log in the file by its start marker", () => {
        const first = log(intraFrames(2));
        const bytes = [...first, ...log(intraFrames(3))];

        const idx = index(bytes);

        expect(idx.getLogCount()).toBe(2);
        expect(idx.getLogBeginOffset(0)).toBe(0);
        expect(idx.getLogBeginOffset(1)).toBe(first.length);
        expect(idx.getLogBeginOffset(2)).toBe(bytes.length);
    });

    it("starts a chunk on every 4th I-frame, with its time, offset and activity summary", () => {
        const frames = intraFrames(9);
        const bytes = log(frames);
        const header = headerBytes().length;
        const offsetOf = (n: number) => header + frames.slice(0, n).flatMap(intraFrame).length;

        const dir = index(bytes).getIntraframeDirectory(0);

        expect(dir.times).toEqual([frames[0].time, frames[4].time, frames[8].time]);
        expect(dir.offsets).toEqual([offsetOf(0), offsetOf(4), offsetOf(8)]);
        expect(dir.minTime).toBe(frames[0].time);
        expect(dir.maxTime).toBe(frames[8].time);
        expect(dir.avgThrottle).toEqual(
            [0, 4, 8].map((n) => Math.round((frames[n].motors[0] + frames[n].motors[1]) / 2)),
        );
        expect(dir.maxMotorDiff).toEqual([0, 4, 8].map((n) => frames[n].motors[1] - frames[n].motors[0]));
        expect(dir.maxRC).toEqual([0, 4, 8].map((n) => Math.abs(frames[n].rc)));
        expect(dir.initialIMU).toHaveLength(3);
        expect(dir.error).toBeUndefined();
    });

    it("keeps the GPS state per chunk but drops the slow and home states the log has no frames for", () => {
        const dir = index(log(intraFrames(5))).getIntraframeDirectory(0);

        expect(dir.initialGPS).toEqual([[], []]);
        expect("initialSlow" in dir).toBe(false);
        expect("initialGPSHome" in dir).toBe(false);
    });

    it("marks the chunk an event falls in", () => {
        const frames = intraFrames(6);
        const bytes = [...log(frames.slice(0, 5)), ...logEndEvent(), ...frames.slice(5).flatMap(intraFrame)];

        expect(index(bytes).getIntraframeDirectory(0).hasEvent).toEqual([undefined, true]);
    });

    it("marks a log with a corrupt header as bad and does not parse it", () => {
        const noIFrameDefs = HEADER.filter((line) => !line.startsWith("H Field I"));
        const bytes = [...headerBytes(noIFrameDefs), ...intraFrames(2).flatMap(intraFrame)];

        const dir = index(bytes).getIntraframeDirectory(0);

        expect(dir.error).toBeTruthy();
        expect(dir.stats).toBeUndefined();
        expect(dir.times).toEqual([]);
    });

    it("tells a log that ended before any data from one that was only truncated", () => {
        expect(index(log([], logEndEvent())).getIntraframeDirectory(0).error).toBe("Logging paused, no data");
        expect(index(log([])).getIntraframeDirectory(0).error).toBe("Log truncated, no data");
    });

    it("leaves out a frame the parser rejects", () => {
        const frames = intraFrames(4);
        // Time running backwards fails the parser's I-frame check.
        const backwards = { ...intraFrames(1, 4)[0], time: frames[0].time - 1 };

        const dir = index(log([...frames, backwards])).getIntraframeDirectory(0);

        expect(dir.times).toEqual([frames[0].time]);
        expect(dir.maxTime).toBe(frames[3].time);
    });

    it("builds each directory once", () => {
        const idx = index(log(intraFrames(2)));

        expect(idx.getIntraframeDirectory(0)).toBe(idx.getIntraframeDirectory(0));
    });
});
