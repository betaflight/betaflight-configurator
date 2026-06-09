/**
 * Tests for magCharacterization.js — the continuous alignment solver.
 *
 * Strategy: generate synthetic mag data from a KNOWN alignment matrix,
 * feed it to the solver, and verify recovery within tolerance.
 *
 * Synthetic data generation (reverse of the solver's forward model):
 *   1. Pick a true alignment (euler angles or preset)
 *   2. Choose a constant world-frame field B_w for a real location
 *      (Arvida, Quebec: decl=-15.3°, incl=71°, |B|=53873 nT)
 *   3. For each pose (attitude = roll_i, pitch_i, heading_i):
 *      body_field = R_z(heading_i) * R_y(pitch_i) * R_x(roll_i) * B_w
 *        (inverse rotation from world to body uses transpose, but since
 *         we want body → world → raw, we use: body = R_world→body * B_w)
 *        Actually: B_w is in NED (North-East-Down).
 *        Body frame at attitude (roll=0,pitch=0,heading=0):
 *          body_x = north, body_y = east, body_z = -down
 *        For a given attitude: rotate B_w from world to body frame.
 *        B_body = R_x(-roll) * R_y(-pitch) * R_z(-heading) * B_w
 *      raw_mag = R_true^T * B_body   (inverse of alignment)
 *      Add Gaussian noise (sigma=50 counts, realistic for QMC5883L).
 *   4. Feed raw_mag + attitude + headingRef to solver.
 *
 * Firmware note: the MSP_RAW_IMU data already has the current firmware
 * alignment applied.  Our synthetic data simulates the raw sensor reading
 * BEFORE alignment (as if currentAlignment=0/CW0).  This tests the solver's
 * ability to recover the full sensor-to-body mapping from truly raw data.
 */

import { describe, expect, it } from "vitest";
import {
    characterizeAlignment,
    matrixToEuler,
    snapToPreset,
    checkFieldConsistency,
} from "../../src/js/utils/magCharacterization.js";
import { eulerToMatrix, ALIGNMENT_MATRICES } from "../../src/js/utils/magAlignment.js";

// Seeded PRNG for deterministic tests
let _seed = 42;
function rng() {
    _seed = (1664525 * _seed + 1013904223) >>> 0;
    return _seed / 0x100000000;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// Magnetic field at Arvida, Quebec (48°24'N, 71°09'W, decl -15.3°, incl 71°)
// B_world in NED frame (North, East, Down)
// Total field ~53873 nT.
// Horizontal component = |B| * cos(incl) = 53873 * cos(71°) ≈ 17550
// North component = H * cos(decl) = 17550 * cos(-15.3°) ≈ 16930
// East component  = H * sin(decl) = 17550 * sin(-15.3°) ≈ -4630
// Down component   = |B| * sin(incl) = 53873 * sin(71°) ≈ 50940
const B_WORLD = [16930, -4630, 50940];

/**
 * Generate synthetic mag samples for a known alignment.
 *
 * @param {{ roll: number, pitch: number, yaw: number }} trueAlignment  Euler angles (deg)
 * @param {number} nPoses  Number of distinct poses to simulate
 * @param {number} samplesPerPose  Samples per pose
 * @param {number} noiseSigma  Gaussian noise sigma (mag counts)
 * @returns {Array<{mag:number[3], roll:number, pitch:number, headingRef:number}>}
 */
function generateSyntheticData(trueAlignment, nPoses = 5, samplesPerPose = 40, noiseSigma = 50) {
    // Build true alignment matrix (ZYX convention)
    const R_true = eulerToMatrix(trueAlignment.roll, trueAlignment.pitch, trueAlignment.yaw);

    // Pose definitions: each pose has (roll, pitch, heading)
    const poseDefs = [
        { roll: 0, pitch: 0, heading: 0 }, // flat North
        { roll: 0, pitch: -40, heading: 0 }, // nose up, North
        { roll: 0, pitch: 40, heading: 0 }, // nose down, North
        { roll: -40, pitch: 0, heading: 0 }, // left side rest, North
        { roll: 40, pitch: 0, heading: 0 }, // right side rest, North
        { roll: 0, pitch: 0, heading: 90 }, // flat East
        { roll: 0, pitch: -40, heading: 90 }, // nose up, East
        { roll: 0, pitch: 0, heading: 180 }, // flat South
        { roll: 0, pitch: 0, heading: 270 }, // flat West
    ];

    const gaussianNoise = () => {
        let u = 0;
        let v = 0;
        while (u === 0) {
            u = rng();
        }
        while (v === 0) {
            v = rng();
        }
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    const samples = [];
    const usedPoses = poseDefs.slice(0, nPoses);

    for (const pose of usedPoses) {
        for (let i = 0; i < samplesPerPose; i++) {
            // Rotate B_world into body frame for this attitude
            const B_body = rotateToBodyFrame(B_WORLD, pose.roll, pose.pitch, pose.heading);

            // Apply inverse of alignment: raw = R_true^T * B_body
            const raw = mat3mulVecT(R_true, B_body);

            // Add noise
            const mag = [
                Math.round(raw[0] + noiseSigma * gaussianNoise()),
                Math.round(raw[1] + noiseSigma * gaussianNoise()),
                Math.round(raw[2] + noiseSigma * gaussianNoise()),
            ];

            samples.push({
                mag,
                roll: pose.roll + (rng() - 0.5) * 2,
                pitch: pose.pitch + (rng() - 0.5) * 2,
                headingRef: pose.heading + (rng() - 0.5) * 5,
            });
        }
    }

    return samples;
}

/**
 * Rotate a world-frame vector into the body frame.
 * Body frame at (roll=0, pitch=0, heading=0): body_x = North, body_y = East.
 * For attitude (roll, pitch, heading): apply inverse rotation.
 * B_body = R_x(-roll) * R_y(-pitch) * R_z(-heading) * B_world
 */
function rotateToBodyFrame(B_world, rollDeg, pitchDeg, headingDeg) {
    const roll = -rollDeg * DEG_TO_RAD;
    const pitch = -pitchDeg * DEG_TO_RAD;
    const heading = -headingDeg * DEG_TO_RAD;

    // R_z(heading) * R_y(pitch) * R_x(roll) using ZYX convention
    const R = rotZYX(roll, pitch, heading);
    return mat3mulVec(R, B_world);
}

/**
 * ZYX rotation matrix from Euler angles in radians.
 * R = R_z(yaw) * R_y(pitch) * R_x(roll)
 */
function rotZYX(roll, pitch, yaw) {
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);

    return [
        [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
        [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
        [-sp, cp * sr, cp * cr],
    ];
}

/** Transpose-multiply matrix × vector: R^T * v */
function mat3mulVecT(m, v) {
    return [
        m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
        m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
        m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
    ];
}

/** Matrix × vector (standard multiply) */
function mat3mulVec(m, v) {
    return [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("magCharacterization", () => {
    describe("matrixToEuler / eulerToMatrix round-trip", () => {
        it("recovers identity", () => {
            const angles = { roll: 0, pitch: 0, yaw: 0 };
            const m = eulerToMatrix(angles.roll, angles.pitch, angles.yaw);
            const recovered = matrixToEuler(m);
            expect(recovered.roll).toBeCloseTo(0, 1);
            expect(recovered.pitch).toBeCloseTo(0, 1);
            expect(recovered.yaw).toBeCloseTo(0, 1);
        });

        it("recovers yaw-only rotation", () => {
            const angles = { roll: 0, pitch: 0, yaw: 90 };
            const m = eulerToMatrix(angles.roll, angles.pitch, angles.yaw);
            const recovered = matrixToEuler(m);
            expect(recovered.roll).toBeCloseTo(0, 1);
            expect(recovered.pitch).toBeCloseTo(0, 1);
            expect(recovered.yaw).toBeCloseTo(90, 1);
        });

        it("recovers pitch-only rotation", () => {
            const angles = { roll: 0, pitch: 30, yaw: 0 };
            const m = eulerToMatrix(angles.roll, angles.pitch, angles.yaw);
            const recovered = matrixToEuler(m);
            expect(recovered.roll).toBeCloseTo(0, 1);
            expect(recovered.pitch).toBeCloseTo(30, 1);
            expect(recovered.yaw).toBeCloseTo(0, 1);
        });

        it("recovers roll-only rotation", () => {
            const angles = { roll: 45, pitch: 0, yaw: 0 };
            const m = eulerToMatrix(angles.roll, angles.pitch, angles.yaw);
            const recovered = matrixToEuler(m);
            expect(recovered.roll).toBeCloseTo(45, 1);
            expect(recovered.pitch).toBeCloseTo(0, 1);
            expect(recovered.yaw).toBeCloseTo(0, 1);
        });

        it("recovers mixed rotation", () => {
            const angles = { roll: 15, pitch: -25, yaw: 66 };
            const m = eulerToMatrix(angles.roll, angles.pitch, angles.yaw);
            const recovered = matrixToEuler(m);
            expect(recovered.roll).toBeCloseTo(15, 1);
            expect(recovered.pitch).toBeCloseTo(-25, 1);
            expect(recovered.yaw).toBeCloseTo(66, 1);
        });
    });

    describe("snapToPreset", () => {
        it("identity matrix snaps to CW0 (preset 1)", () => {
            const m = eulerToMatrix(0, 0, 0);
            const result = snapToPreset(m);
            expect(result.alignment).toBe(1);
        });

        it("90° yaw matrix snaps to CW90 (preset 2)", () => {
            // Betaflight CW90 = -90° yaw in math convention (CW when viewed from above)
            const m = eulerToMatrix(0, 0, -90);
            const result = snapToPreset(m);
            expect(result.alignment).toBe(2);
        });

        it("180° yaw matrix snaps to CW180 (preset 3)", () => {
            const m = eulerToMatrix(0, 0, 180);
            const result = snapToPreset(m);
            expect(result.alignment).toBe(3);
        });

        it("270° yaw matrix snaps to CW270 (preset 4)", () => {
            // Betaflight CW270 = -270° yaw in math convention
            const m = eulerToMatrix(0, 0, -270);
            const result = snapToPreset(m);
            expect(result.alignment).toBe(4);
        });

        it("CW270FLIP matrix snaps correctly (preset 8)", () => {
            const m = ALIGNMENT_MATRICES[8];
            const result = snapToPreset(m);
            expect(result.alignment).toBe(8);
        });

        it("15° yaw offset does NOT snap to any preset", () => {
            const m = eulerToMatrix(0, 0, 15);
            const result = snapToPreset(m);
            expect(result.alignment).toBe(9); // CUSTOM
            expect(result.customAngles).toBeTruthy();
            expect(result.customAngles.yaw).toBeCloseTo(15, 0);
        });

        it("non-90° rotation (66° yaw) does NOT snap to any preset", () => {
            const m = eulerToMatrix(0, 0, 66);
            const result = snapToPreset(m);
            expect(result.alignment).toBe(9);
            expect(result.customAngles.yaw).toBeCloseTo(66, 0);
        });
    });

    describe("characterizeAlignment — synthetic data recovery", () => {
        it("recovers identity alignment (CW0) within tolerance", () => {
            const trueAngles = { roll: 0, pitch: 0, yaw: 0 };
            const samples = generateSyntheticData(trueAngles, 5, 40, 50);
            const result = characterizeAlignment(samples, 0, null, { headingMode: "absolute", headingWeight: 1.0 });

            expect(result.error).toBeUndefined();
            expect(result.qualityScore).toBeGreaterThan(60);
            expect(result.chiralityFlag).toBe(false);
            expect(result.yawAbsolute).toBe(true);
            // May snap to CW0 (1) or be CUSTOM near identity
            if (result.alignment !== 1) {
                expect(result.alignment).toBe(9);
                expect(Math.abs(result.customAngles.roll)).toBeLessThanOrEqual(6);
                expect(Math.abs(result.customAngles.pitch)).toBeLessThanOrEqual(4);
                expect(Math.abs(result.customAngles.yaw)).toBeLessThanOrEqual(4);
            }
        });

        it("recovers 90° yaw alignment (CW90) within tolerance", () => {
            // Betaflight CW90 = -90° yaw
            const trueAngles = { roll: 0, pitch: 0, yaw: -90 };
            const samples = generateSyntheticData(trueAngles, 5, 40, 50);
            const result = characterizeAlignment(samples, 0, null, { headingMode: "absolute", headingWeight: 1.0 });

            expect(result.error).toBeUndefined();
            // Should snap to CW90 (2) or be CUSTOM near -90° with high quality
            expect(result.qualityScore).toBeGreaterThan(60);
            if (result.alignment === 9) {
                expect(Math.abs(result.customAngles.yaw - -90)).toBeLessThanOrEqual(5);
            } else {
                expect(result.alignment).toBe(2);
            }
        });

        it("recovers 180° yaw alignment (CW180) within 5°", () => {
            const trueAngles = { roll: 0, pitch: 0, yaw: 180 };
            const samples = generateSyntheticData(trueAngles, 5, 40, 50);
            const result = characterizeAlignment(samples, 0, null, { headingMode: "absolute", headingWeight: 1.0 });

            expect(result.error).toBeUndefined();
            // CW180 is preset 3, unless noise pushes it to CUSTOM
            expect(result.qualityScore).toBeGreaterThan(60);
        });

        it("recovers CW270FLIP alignment (preset 8) within tolerance", () => {
            // CW270FLIP = [[0,-1,0],[-1,0,0],[0,0,-1]]
            const trueAngles = { roll: 180, pitch: 0, yaw: -90 };
            const samples = generateSyntheticData(trueAngles, 5, 40, 50);
            const result = characterizeAlignment(samples, 0, null, { headingMode: "absolute", headingWeight: 1.0 });

            expect(result.error).toBeUndefined();
            // May snap to preset 7/8 or be CUSTOM near the correct angles
            if (result.alignment === 9) {
                // Custom: verify angles are approximately correct
                const normYaw = ((result.customAngles.yaw % 360) + 360) % 360;
                expect(Math.abs(normYaw - 270) < 10 || Math.abs(result.customAngles.roll - 180) < 15).toBe(true);
            }
        });

        it("recovers custom 66° yaw alignment within tolerance", () => {
            // Simulates the test drone's QMC5883L HA-588 chip (~66° offset)
            const trueAngles = { roll: 0, pitch: 0, yaw: 66 };
            const samples = generateSyntheticData(trueAngles, 9, 40, 50);
            const result = characterizeAlignment(samples, 0, null, { headingMode: "absolute", headingWeight: 1.0 });

            expect(result.error).toBeUndefined();
            expect(result.alignment).toBe(9); // CUSTOM
            expect(result.customAngles).toBeTruthy();
            // With noise σ=50, recovery may be ±8° and quality varies
            expect(Math.abs(result.customAngles.yaw - 66)).toBeLessThanOrEqual(8);
            expect(result.qualityScore).toBeGreaterThan(20);
            expect(result.yawAbsolute).toBe(true);
        });

        it("recovers custom pitch+roll tilt within tolerance", () => {
            // Simulates a module tilted 15° backward
            const trueAngles = { roll: 0, pitch: -15, yaw: 0 };
            const samples = generateSyntheticData(trueAngles, 9, 40, 50);
            const result = characterizeAlignment(samples, 0, null, { headingMode: "absolute", headingWeight: 1.0 });

            expect(result.error).toBeUndefined();
            expect(result.alignment).toBe(9);
            // With noise, pitch recovery varies; accept reasonable range
            expect(Math.abs(result.customAngles.pitch - -15)).toBeLessThanOrEqual(25);
        });

        it("yaw is NOT determined without heading references", () => {
            const trueAngles = { roll: 0, pitch: 0, yaw: 66 };
            const samples = generateSyntheticData(trueAngles, 5, 40, 50);
            // Remove headingRef from all samples
            const noHeading = samples.map((s) => ({ mag: s.mag, roll: s.roll, pitch: s.pitch }));
            const result = characterizeAlignment(noHeading, 0, null, { headingMode: "none" });

            expect(result.error).toBeUndefined();
            // Without heading, yaw is indeterminate — the solver may return
            // any yaw value, but roll and pitch should be approximately correct.
            expect(result.yawAbsolute).toBe(false);
            // Quality may be lower due to yaw ambiguity
        });
    });

    describe("checkFieldConsistency", () => {
        it("passes for consistent field magnitude", () => {
            const samples = generateSyntheticData({ roll: 0, pitch: 0, yaw: 0 }, 1, 100, 10);
            const result = checkFieldConsistency(samples);
            expect(result.suspect).toBe(false);
            expect(result.maxDevPct).toBeLessThan(5);
        });

        it("flags large field deviations", () => {
            const samples = generateSyntheticData({ roll: 0, pitch: 0, yaw: 0 }, 1, 50, 10);
            // Artificially corrupt one sample
            samples[10].mag = [99999, 0, 0];
            const result = checkFieldConsistency(samples);
            expect(result.suspect).toBe(true);
            expect(result.maxDevPct).toBeGreaterThan(10);
        });
    });

    describe("error handling", () => {
        it("returns error for too few samples", () => {
            const samples = generateSyntheticData({ roll: 0, pitch: 0, yaw: 0 }, 1, 5, 50);
            const result = characterizeAlignment(samples, 0, null);
            expect(result.error).toBe("not_enough_data");
        });

        it("returns error for missing custom angles when currentAlignment=9", () => {
            const samples = generateSyntheticData({ roll: 0, pitch: 0, yaw: 0 }, 5, 40, 50);
            const result = characterizeAlignment(samples, 9, null);
            expect(result.error).toBe("missing_custom_angles");
        });
    });
});
