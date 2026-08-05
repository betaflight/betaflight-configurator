/**
 * Oracle for solveTiltAlignment — the one piece of math with no prior-branch proof.
 *
 * Synthetic, planted ground truth (no committed capture fixtures): we plant a mount
 * rotation R_align and a WMM inclination, generate a tilt-diverse tumble whose mag↔gravity
 * angle is exactly the dip, and assert the solver recovers R_align — at high AND low latitude
 * (proves the angle-space cost), with a proper det=+1, chirality-resolved result.
 */
import { describe, expect, it } from "vitest";
import {
    eulerToMatrix,
    mat3mul,
    mat3mulVec,
    mat3transpose,
    ALIGNMENT_MATRICES,
} from "../../src/js/utils/magAlignment.js";
import { solveTiltAlignment } from "../../src/js/utils/magTiltAlign.js";

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Deterministic PRNG (mulberry32) — never Math.random in tests.
function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Geodesic angle between two rotation matrices, degrees. */
function rotationAngleDeg(A, B) {
    const M = mat3mul(mat3transpose(A), B);
    const tr = M[0][0] + M[1][1] + M[2][2];
    return Math.acos(clamp((tr - 1) / 2, -1, 1)) / DEG;
}

function det3(m) {
    return (
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    );
}

/**
 * Generate a tilt-diverse tumble for a planted mount + inclination.
 * World (FLU): gravity down = [0,0,-1]; field at inclination I = [cos I, 0, -sin I]
 * (angle to gravity = 90°−I = the dip). For each body orientation R_i we rotate both
 * into the body frame, recover roll/pitch from gravity (so they match gravityInBody),
 * and the sensor reads m_cal = R_alignᵀ · field_body.
 */
function makeTumble(rAlign, inclDeg, { noise = 0, rng = null } = {}) {
    const I = inclDeg * DEG;
    const gWorld = [0, 0, -1];
    const fWorld = [Math.cos(I), 0, -Math.sin(I)];
    const rAlignT = mat3transpose(rAlign);
    const samples = [];
    const rolls = [-50, -25, 0, 25, 50];
    const pitches = [-50, -25, 0, 25, 50];
    const yaws = [0, 72, 144, 216, 288];
    for (const rl of rolls) {
        for (const pt of pitches) {
            for (const yw of yaws) {
                const Ri = eulerToMatrix(rl, pt, yw); // arbitrary body orientation
                const gBody = mat3mulVec(Ri, gWorld);
                let fBody = mat3mulVec(Ri, fWorld);
                if (noise > 0 && rng) {
                    fBody = fBody.map((c) => c + (rng() - 0.5) * 2 * noise);
                }
                // Recover roll/pitch so gravityInBody(roll,pitch) === gBody.
                const pitch = Math.asin(clamp(gBody[0], -1, 1)) / DEG;
                const roll = Math.atan2(-gBody[1], -gBody[2]) / DEG;
                const mCal = mat3mulVec(rAlignT, fBody);
                samples.push({ m_cal: mCal, roll, pitch });
            }
        }
    }
    return samples;
}

function recoveredMatrix(result) {
    return result.preset !== 9
        ? ALIGNMENT_MATRICES[result.preset]
        : eulerToMatrix(result.euler_zyx_deg.roll, result.euler_zyx_deg.pitch, result.euler_zyx_deg.yaw);
}

describe("solveTiltAlignment — synthetic oracle", () => {
    it("recovers a planted CUSTOM mount at high inclination (71°)", () => {
        const rAlign = eulerToMatrix(20, 10, 35);
        const result = solveTiltAlignment(makeTumble(rAlign, 71), 71 * DEG);
        expect(result).not.toBeNull();
        expect(rotationAngleDeg(recoveredMatrix(result), rAlign)).toBeLessThan(5);
        expect(result.quality.meanResidualDeg).toBeLessThan(2); // good fit on clean data
        expect(det3(recoveredMatrix(result))).toBeCloseTo(1, 2);
    });

    it("recovers at LOW inclination (20°) — proves the angle-space cost is latitude-independent", () => {
        const rAlign = eulerToMatrix(-15, 25, 80);
        const result = solveTiltAlignment(makeTumble(rAlign, 20), 20 * DEG);
        expect(result).not.toBeNull();
        expect(rotationAngleDeg(recoveredMatrix(result), rAlign)).toBeLessThan(6);
    });

    it("recovers under measurement noise", () => {
        const rAlign = eulerToMatrix(5, -20, 110);
        const samples = makeTumble(rAlign, 71, { noise: 0.03, rng: mulberry32(0x1a2b3c4d) });
        const result = solveTiltAlignment(samples, 71 * DEG);
        expect(result).not.toBeNull();
        expect(rotationAngleDeg(recoveredMatrix(result), rAlign)).toBeLessThan(8);
    });

    it("returns a proper rotation (det = +1)", () => {
        const rAlign = eulerToMatrix(0, 40, 200);
        const result = solveTiltAlignment(makeTumble(rAlign, 71), 71 * DEG);
        expect(det3(recoveredMatrix(result))).toBeCloseTo(1, 2);
        expect(rotationAngleDeg(recoveredMatrix(result), rAlign)).toBeLessThan(5);
    });

    it("returns null below the minimum sample count", () => {
        const rAlign = eulerToMatrix(0, 0, 0);
        const few = makeTumble(rAlign, 71).slice(0, 10);
        expect(solveTiltAlignment(few, 71 * DEG)).toBeNull();
    });
});
