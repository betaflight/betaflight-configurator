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
import { FlightLogParser } from "../../src/blackbox-viewer/flightlog_parser";

// A minimal log: two fields, an I-frame at iteration 0 and a P-frame after it. The P-frame's
// iteration is predicted from the sampling interval, which is what these tests vary.
const HEADER = [
    "H Product:Blackbox flight data recorder by Nicholas Sherlock",
    "H Data version:2",
    "H Field I name:loopIteration,time",
    "H Field I signed:0,0",
    "H Field I predictor:0,0",
    "H Field I encoding:1,1",
    "H Field P predictor:6,2",
    "H Field P encoding:9,0",
];

function logBytes(...extraHeader: string[]): Uint8Array {
    const text = `${[...HEADER, ...extraHeader].join("\n")}\n`;
    const bytes = [...text].map((c) => c.codePointAt(0)!);
    // I-frame: loopIteration 0, time 1000 (unsigned VB); P-frame: time delta 0 (signed VB).
    bytes.push(0x49, 0, 0xe8, 0x07, 0x50, 0);
    return new Uint8Array(bytes);
}

function parse(...extraHeader: string[]) {
    const bytes = logBytes(...extraHeader);
    const parser = new FlightLogParser(bytes);
    const frames: { type: string; iteration: number }[] = [];
    parser.onFrameReady = (valid, frame, frameType, _offset, _size) => {
        if (frameType !== "E" && valid) {
            frames.push({ type: frameType, iteration: frame[0] });
        }
    };
    parser.parseHeader(0, bytes.length);
    parser.parseLogData(false, undefined, bytes.length);
    return { parser, frames };
}

describe("FlightLogParser sampling interval", () => {
    it("predicts the next logged iteration from a valid P interval", () => {
        const { parser, frames } = parse("H P interval:1/2");

        expect(frames).toEqual([
            { type: "I", iteration: 0 },
            { type: "P", iteration: 2 },
        ]);
        expect(parser.stats.intentionallyAbsentIterations).toBe(1);
    });

    // Each of these used to make shouldHaveFrame() false for every iteration, so the first
    // P-frame looped forever in countIntentionallySkippedFrames() and froze the viewer.
    it.each([["H P interval:0"], ["H P interval:1/0"], ["H P interval:0/2"], ["H P interval:x"], ["H I interval:x"]])(
        "treats a garbled %s as logging every frame",
        (line) => {
            const { parser, frames } = parse(line);

            expect(frames).toEqual([
                { type: "I", iteration: 0 },
                { type: "P", iteration: 1 },
            ]);
            expect(parser.sysConfig.frameIntervalPNum).toBeGreaterThanOrEqual(1);
            expect(parser.sysConfig.frameIntervalPDenom).toBeGreaterThanOrEqual(1);
            expect(parser.sysConfig.frameIntervalI).toBeGreaterThanOrEqual(1);
        },
    );

    it("still clamps an I interval below 1", () => {
        expect(parse("H I interval:0").parser.sysConfig.frameIntervalI).toBe(1);
    });
});
