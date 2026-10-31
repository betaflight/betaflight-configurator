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
import { parseSpinCheck, spinVerdict } from "../../src/stores/frameSpinCheck";

/** Writes like the firmware's sbuf: little endian. */
class Sbuf {
    bytes: number[] = [];
    u8(v: number) {
        this.bytes.push(v & 0xff);
        return this;
    }
    u16(v: number) {
        return this.u8(v).u8(v >> 8);
    }
}

// writeSpinCheck(): motors 1 and 4 one way, 2 and 3 the other (Quad X); motor 3 here turns the wrong way
function spinPayload(): number[] {
    const b = new Sbuf().u8(2).u8(1).u8(36).u16(150).u8(0b0100);
    const signs = [1, -1, 1, 1];
    signs.forEach((sign, m) => {
        b.u8(sign)
            .u16(Math.round((sign > 0 ? 12.5 : -167.5) * 10))
            .u16(50 + m)
            .u16(10)
            .u16(470);
    });
    return b.bytes;
}

describe("spin direction check", () => {
    it("parses the tone, the wrong-way mask and each motor's yaw answer", () => {
        const s = parseSpinCheck(spinPayload())!;
        expect(s).toMatchObject({ done: true, toneHz: 36, amplitude: 150, wrongMask: 0b0100 });
        expect(s.motors.map((m) => m.yawSign)).toEqual([1, -1, 1, 1]);
        expect(s.motors[1]).toMatchObject({ yawPhaseDeg: -167.5, roll: 0.0051, pitch: 0.001, yaw: 0.047 });
    });

    it("says nothing when the FC holds no check, or for the old rigid-body page", () => {
        expect(parseSpinCheck([2, 0])).toBeNull();
        expect(parseSpinCheck([1, 1, 4])).toBeNull();
    });

    it("names the motor turning the wrong way, and one that gave no answer", () => {
        const s = parseSpinCheck(spinPayload())!;
        expect(spinVerdict(s)).toEqual({ ok: false, wrongWay: [2], silent: [] });
        const silent = {
            ...s,
            wrongMask: 0b1000,
            motors: s.motors.map((m, i) => (i === 3 ? { ...m, yawSign: 0 } : m)),
        };
        expect(spinVerdict(silent)).toEqual({ ok: false, wrongWay: [], silent: [3] });
        expect(spinVerdict({ ...s, wrongMask: 0 }).ok).toBe(true);
    });
});
