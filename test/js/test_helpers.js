/**
 * Shared test helpers for magnetometer calibration tests.
 * Eliminates duplication between mag_gain, mag_hardiron, and mag_characterization_live tests.
 */
import { mat3mulVec } from "../../src/js/utils/magAlignment.js";
import fs from "node:fs";
import path from "node:path";

const DEG_TO_RAD = Math.PI / 180;

export function loadFixture(name) {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../fixtures", name), "utf-8"));
}

export function flattenSamples(data) {
    const s = [];
    for (const dir of data.directions) {
        for (const pose of dir.poses) {
            if (pose.samples) {
                for (const sm of pose.samples) {
                    s.push(sm);
                }
            }
        }
    }
    return s;
}

export function buildBWorld(declination, inclination, fieldStrength) {
    const inc = inclination * DEG_TO_RAD;
    const dec = declination * DEG_TO_RAD;
    const Bh = fieldStrength * Math.cos(inc);
    return [Bh * Math.cos(dec), Bh * Math.sin(dec), fieldStrength * Math.sin(inc)];
}

export function rotateNedToBody(B_ned, rollDeg, pitchDeg, headingDeg) {
    const r = -rollDeg * DEG_TO_RAD;
    const p = -pitchDeg * DEG_TO_RAD;
    const h = -headingDeg * DEG_TO_RAD;
    const cr = Math.cos(r),
        sr = Math.sin(r);
    const cp = Math.cos(p),
        sp = Math.sin(p);
    const cy = Math.cos(h),
        sy = Math.sin(h);
    const R = [
        [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
        [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
        [-sp, cp * sr, cp * cr],
    ];
    return mat3mulVec(R, B_ned);
}
