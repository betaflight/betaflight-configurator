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
