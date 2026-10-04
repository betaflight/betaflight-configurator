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

import { Quaternion, Vector3 } from "three";
import { FRAME_TIME_INDEX } from "./flightTrack";

// Attitude comes only from the flight controller's logged quaternion (imuQuaternion): what the FC
// believed, including its magnetometer when one is fitted (without one, Betaflight corrects yaw
// from the GPS course while moving). Logs without it show the craft as a plain position marker:
// a gyro-only estimate or the direction of travel would give a heading unrelated to the nose.
//
// Scene frame: x = North, y = Up, z = East (the GPS_transform local frame). The craft is modelled
// with nose = +x, up = +y, right = +z, so an identity quaternion is level and facing north.
//
// The FC logs the body(FLU) -> earth(NWU) quaternion, as implied by the firmware's attitude
// formulas mirrored in flightlog.js: heading = -yaw, pitch > 0 is nose down, roll > 0 is right
// wing down. NWU and FLU both map onto the scene axes by the same -90° rotation about x, so the
// scene attitude is BASIS * q * BASIS^-1.
const BASIS = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const BASIS_INV = BASIS.clone().invert();

const INT16_SCALE = 0x7fff;

/** Longest span blended across; a longer unchanged stretch means the craft simply held still. */
const MAX_BLEND_US = 20_000;

/** Decode the logged imuQuaternion x/y/z (int16 fixed point; w is implied positive). */
export function decodeFcQuaternion(rawX: number, rawY: number, rawZ: number): Quaternion {
    let x = rawX / INT16_SCALE;
    let y = rawY / INT16_SCALE;
    let z = rawZ / INT16_SCALE;
    const vv = x * x + y * y + z * z;
    let w = 0;
    if (vv < 1) {
        w = Math.sqrt(1 - vv);
    } else {
        const m = Math.sqrt(vv);
        x /= m;
        y /= m;
        z /= m;
    }
    return new Quaternion(x, y, z, w);
}

export function fcToScene(fc: Quaternion, out = new Quaternion()): Quaternion {
    return out.copy(BASIS).multiply(fc).multiply(BASIS_INV);
}

export interface AttitudeTrack {
    at(tUs: number, out?: Quaternion): Quaternion;
}

/**
 * The FC's attitude over the log, or null when the log has no quaternion. The logged quaternion
 * updates slower than the main frames, which hold each value in between; this keeps only the
 * updates and blends between them, so slow-motion playback rotates smoothly instead of stepping.
 */
export function buildAttitudeTrack(flightLog: {
    getMainFieldIndexByName(name: string): number | undefined;
    getChunksInTimeRange(startTime: number, endTime: number): { frames: ArrayLike<number>[] }[];
    getMinTime(): number;
    getMaxTime(): number;
}): AttitudeTrack | null {
    const [ix, iy, iz] = [0, 1, 2].map((i) => flightLog.getMainFieldIndexByName(`imuQuaternion[${i}]`));
    if (ix === undefined || iy === undefined || iz === undefined) {
        return null;
    }
    const times: number[] = [];
    const raw: number[] = [];
    for (const chunk of flightLog.getChunksInTimeRange(flightLog.getMinTime(), flightLog.getMaxTime())) {
        for (const frame of chunk.frames) {
            const k = raw.length;
            if (k && raw[k - 3] === frame[ix] && raw[k - 2] === frame[iy] && raw[k - 1] === frame[iz]) {
                continue;
            }
            times.push(frame[FRAME_TIME_INDEX]);
            raw.push(frame[ix], frame[iy], frame[iz]);
        }
    }
    if (!times.length) {
        return null;
    }
    const scene = (i: number) => fcToScene(decodeFcQuaternion(raw[3 * i], raw[3 * i + 1], raw[3 * i + 2]));

    return {
        at(tUs, out = new Quaternion()) {
            let lo = 0;
            let hi = times.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (times[mid] <= tUs) {
                    lo = mid + 1;
                } else {
                    hi = mid;
                }
            }
            const i = Math.max(0, lo - 1);
            if (i >= times.length - 1 || tUs <= times[0]) {
                return out.copy(scene(i));
            }
            const blendStart = Math.max(times[i], times[i + 1] - MAX_BLEND_US);
            const f = tUs <= blendStart ? 0 : (tUs - blendStart) / (times[i + 1] - blendStart);
            return out.slerpQuaternions(scene(i), scene(i + 1), f);
        },
    };
}
