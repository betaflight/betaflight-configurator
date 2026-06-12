/**
 * Shared test helpers for magnetometer calibration tests.
 * Eliminates duplication between mag_gain, mag_hardiron, and mag_characterization_live tests.
 */
import { mat3mulVec } from "../../src/js/utils/magAlignment.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEG_TO_RAD = Math.PI / 180;

export function loadFixture(name) {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../fixtures", name), "utf-8"));
}

/**
 * Reconstruct the wizard's captureData structure from a characterization_poses
 * export: Array<Array<{headingRef, samples}|null>> indexed [direction][pose].
 */
export function captureDataFromPosesExport(posesJson) {
    return posesJson.directions.map((dir) =>
        dir.poses.map((pose) =>
            pose.captured !== false && pose.samples?.length
                ? { headingRef: pose.samples[0]?.headingRef ?? 0, samples: pose.samples }
                : null,
        ),
    );
}

/**
 * Reconstruct the wizard's directions constant (labels + isFlat flags) from a
 * characterization_poses export. `heading` is unused downstream because every
 * captured pose carries its own headingRef.
 */
export function directionsFromPosesExport(posesJson) {
    return posesJson.directions.map((dir) => ({
        label: dir.label,
        heading: 0,
        poses: dir.poses.map((p) => ({ label: p.label, isFlat: p.label.startsWith("Flat") })),
    }));
}

/**
 * Angle between two rotation matrices in degrees — representation-independent
 * (Euler triples near flips can look wildly different for similar rotations).
 */
export function rotationDelta(matA, matB) {
    let trace = 0;
    for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 3; k++) {
            // (A·Bᵀ)[i][i] summed = Σ A[i][k]·B[i][k]
            trace += matA[i][k] * matB[i][k];
        }
    }
    return Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2))) * (180 / Math.PI);
}

export function flattenSamples(data) {
    const s = [];
    for (let di = 0; di < data.directions.length; di++) {
        const dir = data.directions[di];
        for (let pi = 0; pi < dir.poses.length; pi++) {
            const pose = dir.poses[pi];
            if (pose.samples) {
                for (const sm of pose.samples) {
                    // poseKey mirrors the wizard's per-pose tagging so the
                    // M-estimator groups by true pose, not by headingRef block
                    s.push({ ...sm, poseKey: `${di}:${pi}` });
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

/**
 * Rotate a NED world-frame vector into the drone body frame.
 * Input:  B_ned in NED (X=North, Y=East, Z=Down)
 * Output: body frame (X=forward/nose, Y=right/starboard, Z=down)
 * Angles are negated because this transforms FROM reference (NED) TO rotated (body) frame.
 * Rotation order is ZYX: Yaw(heading) → Pitch → Roll, applied via mat3mulVec.
 */
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
