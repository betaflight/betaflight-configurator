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

// Builds small synthetic blackbox logs for parser, index and FlightLog tests.

export const START_MARKER = "H Product:Blackbox flight data recorder by Nicholas Sherlock";

/** Main-frame fields of the synthetic logs; all but rcCommand are unsigned. */
export const FIELDS = ["loopIteration", "time", "motor[0]", "motor[1]", "rcCommand[0]"];

export const HEADER = [
    START_MARKER,
    "H Data version:2",
    "H Firmware revision:Betaflight 4.5.0 (abcdef) STM32F405",
    `H Field I name:${FIELDS.join(",")}`,
    "H Field I signed:0,0,0,0,1",
    "H Field I predictor:0,0,0,0,0",
    "H Field I encoding:1,1,1,1,0",
    "H Field P predictor:6,2,1,1,1",
    "H Field P encoding:9,0,0,0,0",
];

export function unsignedVB(value: number): number[] {
    const out: number[] = [];
    let v = value >>> 0;
    while (v >= 0x80) {
        out.push((v & 0x7f) | 0x80);
        v >>>= 7;
    }
    out.push(v);
    return out;
}

export function signedVB(value: number): number[] {
    return unsignedVB((value << 1) ^ (value >> 31));
}

export function headerBytes(lines: string[] = HEADER): number[] {
    return [...`${lines.join("\n")}\n`].map((c) => c.codePointAt(0)!);
}

export interface MainFrame {
    iteration: number;
    time: number;
    motors: [number, number];
    rc: number;
}

export function intraFrame({ iteration, time, motors, rc }: MainFrame): number[] {
    return [
        "I".codePointAt(0)!,
        ...unsignedVB(iteration),
        ...unsignedVB(time),
        ...unsignedVB(motors[0]),
        ...unsignedVB(motors[1]),
        ...signedVB(rc),
    ];
}

export function logEndEvent(): number[] {
    return ["E".codePointAt(0)!, 255, ...[..."End of log\0"].map((c) => c.codePointAt(0)!)];
}

/** I-frames 32 iterations and 1 ms apart, which the default I interval of 32 expects. */
export function intraFrames(count: number, start = 0): MainFrame[] {
    return Array.from({ length: count }, (_, i) => ({
        iteration: (start + i) * 32,
        time: 1_000_000 + (start + i) * 1000,
        motors: [1100 + i * 10, 1100 + i * 20] as [number, number],
        // Negative on even frames, so a chunk start (every 4th) has a negative stick.
        rc: i % 2 ? i * 5 : -(i * 5 + 3),
    }));
}

export function log(frames: MainFrame[], extra: number[] = []): number[] {
    return [...headerBytes(), ...frames.flatMap(intraFrame), ...extra];
}

/**
 * A P-frame after `previous`: iteration +1 (predicted), time +`timeStep` (straight-line predicted,
 * so the step is the delta from the frame before), motors and rc as deltas from `previous`.
 */
export function interFrame(previous: MainFrame, next: MainFrame, timeStep: number, previousStep: number): number[] {
    return [
        "P".codePointAt(0)!,
        ...signedVB(timeStep - previousStep),
        ...signedVB(next.motors[0] - previous.motors[0]),
        ...signedVB(next.motors[1] - previous.motors[1]),
        ...signedVB(next.rc - previous.rc),
    ];
}

/**
 * A log of `groups` runs of one I-frame and three P-frames, 4 iterations and 4 ms per run
 * (the header sets "I interval:4"), with every main frame returned for checking.
 */
/** A flight mode change event, which carries no time of its own. */
export function flightModeEvent(newFlags: number, lastFlags: number): number[] {
    return ["E".codePointAt(0)!, 30, ...unsignedVB(newFlags), ...unsignedVB(lastFlags)];
}

/** `afterGroup` inserts bytes (an event, say) after the given run. Every 4th run starts a chunk. */
export function mixedLog(
    groups: number,
    extraHeader: string[] = [],
    afterGroup: Record<number, number[]> = {},
): { bytes: number[]; frames: MainFrame[] } {
    const bytes = headerBytes([...HEADER, "H I interval:4", ...extraHeader]);
    const frames: MainFrame[] = [];
    for (let g = 0; g < groups; g++) {
        const run = Array.from({ length: 4 }, (_, k) => ({
            iteration: g * 4 + k,
            time: 1_000_000 + g * 4000 + k * 1000,
            // motor[0] is lowest in a P-frame (the 3rd of each run), so merged stats need both frame types.
            motors: [(k === 2 ? 1000 : 1100) + g * 4 + k, 1200 - ((g * 4 + k) % 5) * 10] as [number, number],
            rc: ((g * 4 + k) % 3) * 50 - 50,
        }));
        bytes.push(...intraFrame(run[0]));
        for (let k = 1; k < 4; k++) {
            // The straight-line predictor extends the previous step; the I-frame counts as a step of 0.
            bytes.push(...interFrame(run[k - 1], run[k], 1000, k === 1 ? 0 : 1000));
        }
        bytes.push(...(afterGroup[g] ?? []));
        frames.push(...run);
    }
    return { bytes, frames };
}
