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
import { Quaternion, Vector3 } from "three";
import { buildAttitudeTrack, decodeFcQuaternion, fcToScene } from "../../../src/blackbox-viewer/flight3d/fcAttitude";

const NOSE = new Vector3(1, 0, 0);
const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(0, 0, 1);

/** Firmware attitude semantics, as flightlog.js computeAttitude() derives them from the logged quaternion. */
function firmwareEuler(q: { x: number; y: number; z: number; w: number }) {
    const { x, y, z, w } = q;
    const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
    const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - x * z))));
    let heading = -Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    if (heading < 0) {
        heading += 2 * Math.PI;
    }
    return { roll, pitch, heading };
}

function toRaw(q: Quaternion): [number, number, number] {
    const s = q.w < 0 ? -1 : 1; // the log stores the w >= 0 representative
    return [Math.round(s * q.x * 0x7fff), Math.round(s * q.y * 0x7fff), Math.round(s * q.z * 0x7fff)];
}

function randomQuaternion(seed: number): Quaternion {
    let s = seed;
    const rnd = () => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s / 2147483648;
    };
    const [u1, u2, u3] = [rnd(), rnd(), rnd()];
    return new Quaternion(
        Math.sqrt(1 - u1) * Math.sin(2 * Math.PI * u2),
        Math.sqrt(1 - u1) * Math.cos(2 * Math.PI * u2),
        Math.sqrt(u1) * Math.sin(2 * Math.PI * u3),
        Math.sqrt(u1) * Math.cos(2 * Math.PI * u3),
    );
}

const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

describe("fcToScene", () => {
    it("is level and facing north for the identity quaternion", () => {
        const q = fcToScene(decodeFcQuaternion(0, 0, 0));
        expect(
            NOSE.clone()
                .applyQuaternion(q)
                .distanceTo(new Vector3(1, 0, 0)),
        ).toBeLessThan(1e-9);
        expect(
            UP.clone()
                .applyQuaternion(q)
                .distanceTo(new Vector3(0, 1, 0)),
        ).toBeLessThan(1e-9);
    });

    it("points the nose, right wing and up axis where the firmware attitude says", () => {
        for (let seed = 1; seed <= 200; seed++) {
            const truth = randomQuaternion(seed);
            const decoded = decodeFcQuaternion(...toRaw(truth));
            const { roll, pitch, heading } = firmwareEuler(decoded);
            if (Math.abs(pitch) > (80 * Math.PI) / 180) {
                continue; // heading is ill-defined when pointing straight up or down
            }
            const scene = fcToScene(decoded);
            const nose = NOSE.clone().applyQuaternion(scene);
            const right = RIGHT.clone().applyQuaternion(scene);

            // Scene z is East, so a clockwise-from-north azimuth is atan2(z, x).
            expect(Math.abs(angleDiff(Math.atan2(nose.z, nose.x), heading))).toBeLessThan(1e-3);
            expect(nose.y).toBeCloseTo(-Math.sin(pitch), 3); // pitch > 0 is nose down
            expect(right.y).toBeCloseTo(-Math.sin(roll) * Math.cos(pitch), 3); // roll > 0 is right wing down
        }
    });

    it("shows a 180° roll as upside down", () => {
        const invertedFc = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);
        const up = UP.clone().applyQuaternion(fcToScene(decodeFcQuaternion(...toRaw(invertedFc))));
        expect(up.y).toBeCloseTo(-1, 3);
    });

    it("stays finite pointing straight up or down", () => {
        for (const angle of [Math.PI / 2, -Math.PI / 2]) {
            const vertical = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle);
            const nose = NOSE.clone().applyQuaternion(fcToScene(decodeFcQuaternion(...toRaw(vertical))));
            expect(Math.abs(nose.y)).toBeCloseTo(1, 3);
        }
    });

    it("normalises a saturated int16 vector instead of producing NaN", () => {
        const q = decodeFcQuaternion(0x7fff, 0x7fff, 0);
        expect([q.x, q.y, q.z, q.w].every(Number.isFinite)).toBe(true);
        expect(q.length()).toBeCloseTo(1, 9);
    });
});

describe("buildAttitudeTrack", () => {
    const QUATERNION_FIELDS = ["loopIteration", "time", "imuQuaternion[0]", "imuQuaternion[1]", "imuQuaternion[2]"];

    // 500 Hz frames carrying a quaternion the FC refreshed at `updateHz`, yawing to `headingDegAt(t)`.
    function yawingLog(
        durationS: number,
        updateHz: number,
        headingDegAt: (tS: number) => number,
        fields = QUATERNION_FIELDS,
    ) {
        const frames: number[][] = [];
        let raw: [number, number, number] = [0, 0, 0];
        for (let i = 0; i <= durationS * 500; i++) {
            const tS = i / 500;
            if (i % (500 / updateHz) === 0) {
                // FC yaw is the negative of the compass heading, about its up axis.
                const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (-headingDegAt(tS) * Math.PI) / 180);
                raw = toRaw(q);
            }
            frames.push([0, tS * 1e6, ...raw]);
        }
        return {
            getMainFieldIndexByName: (name: string) => (fields.includes(name) ? fields.indexOf(name) : undefined),
            getChunksInTimeRange: () => [{ frames }],
            getMinTime: () => 0,
            getMaxTime: () => durationS * 1e6,
        };
    }
    const headingDeg = (q: Quaternion) => {
        const nose = NOSE.clone().applyQuaternion(q);
        return (Math.atan2(nose.z, nose.x) * 180) / Math.PI;
    };

    it("turns smoothly between 100 Hz updates instead of stepping", () => {
        const truth = (tS: number) => 90 * tS; // steady 90°/s yaw
        const track = buildAttitudeTrack(yawingLog(1, 100, truth))!;
        let worst = 0;
        for (let tS = 0.1; tS < 0.9; tS += 0.0013) {
            worst = Math.max(
                worst,
                Math.abs(angleDiff((headingDeg(track.at(tS * 1e6)) * Math.PI) / 180, (truth(tS) * Math.PI) / 180)),
            );
        }
        // Holding each value would lag up to 0.9° (90°/s over 10 ms).
        expect((worst * 180) / Math.PI).toBeLessThan(0.15);
    });

    it("does not start rotating early after the craft held still", () => {
        const truth = (tS: number) => (tS < 1 ? 0 : 45);
        const track = buildAttitudeTrack(yawingLog(2, 100, truth))!;
        expect(Math.abs(headingDeg(track.at(0.9e6)))).toBeLessThan(0.01);
    });

    it("gives no attitude for a log without the FC quaternion, whatever else it has", () => {
        // A gyro-only estimate or a GPS course would give a heading unrelated to the nose.
        const others = ["loopIteration", "time", "heading[0]", "heading[1]", "heading[2]", "GPS_ground_course"];
        expect(buildAttitudeTrack(yawingLog(1, 100, () => 0, others))).toBeNull();
    });
});
