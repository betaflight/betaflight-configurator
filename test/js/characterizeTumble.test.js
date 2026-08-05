/**
 * characterizeTumble oracle:
 *  (a) recovers a planted alignment from a synthetic tilt-diverse tumble
 *  (b) refuses a planar (level-only) sample set via check3DCoverage gate
 *
 * Convention: matches magTiltAlign.js (FLU world: gravity=[0,0,-1], field=[cos I,0,-sin I]).
 * Uses seeded mulberry32 PRNG — never Math.random.
 */
import { describe, expect, it } from "vitest";
import {
    eulerToMatrix,
    mat3mul,
    mat3mulVec,
    mat3transpose,
    ALIGNMENT_MATRICES,
} from "../../src/js/utils/magAlignment.js";
import { characterizeTumble } from "../../src/js/utils/magCharacterizationCompute.js";

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

const DEG = Math.PI / 180;

function clamp(v, lo, hi) {
    if (v < lo) {
        return lo;
    }
    if (v > hi) {
        return hi;
    }
    return v;
}

function det3(m) {
    return (
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    );
}

function rotationAngleDeg(A, B) {
    const M = mat3mul(mat3transpose(A), B);
    const tr = M[0][0] + M[1][1] + M[2][2];
    return Math.acos(clamp((tr - 1) / 2, -1, 1)) / DEG;
}

/**
 * Generate a tilt-diverse synthetic tumble in the SAME convention as magTiltAlign.js:
 * world: gravity down = [0,0,-1], field at inclination I = [cos I, 0, -sin I].
 * For each body orientation R_i we rotate into the body frame, recover roll/pitch
 * from the gravity vector (matching gravityInBody), and the sensor reads
 * raw = R_cur · (R_alignT · field_body) in current-alignment frame.
 */
function generateTumble(rng, { R_plant, inclDeg, numSamples = 400 }) {
    const I = inclDeg * DEG;
    const gWorld = [0, 0, -1];
    const fWorld = [Math.cos(I), 0, -Math.sin(I)];
    const R_plantT = mat3transpose(R_plant);
    const samples = [];

    for (let i = 0; i < numSamples; i++) {
        // Random body orientation with tilt diversity
        const roll = (rng() - 0.5) * 120;
        const pitch = (rng() - 0.5) * 120;
        const yaw = rng() * 360;

        const Ri = eulerToMatrix(roll, pitch, yaw);
        // Gravity and field in body frame
        const gBody = mat3mulVec(Ri, gWorld);
        let fBody = mat3mulVec(Ri, fWorld);
        // Small noise
        fBody = fBody.map((c) => c + (rng() - 0.5) * 0.02);

        // Recover the roll/pitch that gravityInBody would produce
        const p = Math.asin(clamp(gBody[0], -1, 1)) / DEG;
        const r = Math.atan2(-gBody[1], -gBody[2]) / DEG;

        // Field in sensor frame: R_plantT · fBody
        const fSensor = mat3mulVec(R_plantT, fBody);

        // In guided mode collection, the current alignment is applied (identity here),
        // so the streamed values = fSensor (currentMatrix = identity).
        samples.push({
            x: fSensor[0],
            y: fSensor[1],
            z: fSensor[2],
            roll: r,
            pitch: p,
        });
    }
    return samples;
}

describe("characterizeTumble — synthetic oracle", () => {
    const rng = mulberry32(42);

    // Plant a known mount: 30° yaw rotation about Z (CW30 preset)
    const R_plant = eulerToMatrix(0, 0, 30);

    it("recovers a planted mount rotation from a tilt-diverse tumble", () => {
        const samples = generateTumble(rng, {
            R_plant,
            inclDeg: 71,
            numSamples: 400,
        });

        const result = characterizeTumble({
            samples,
            currentMatrix: [
                [1, 0, 0],
                [0, 1, 0],
                [0, 0, 1],
            ],
            inclinationRad: 71 * DEG,
        });

        expect(result.ok).toBe(true);
        expect(result.preset).toBeGreaterThanOrEqual(1);
        expect(result.preset).toBeLessThanOrEqual(9);
        expect(result.offsets).toBeDefined();
        expect(Number.isFinite(result.offsets.x)).toBe(true);

        // Recovered alignment matrix
        const recovered =
            result.preset === 9
                ? eulerToMatrix(result.euler_zyx_deg.roll, result.euler_zyx_deg.pitch, result.euler_zyx_deg.yaw)
                : ALIGNMENT_MATRICES[result.preset];

        // det = +1 (proper rotation)
        expect(Math.abs(det3(recovered) - 1)).toBeLessThan(0.01);

        // Recovered alignment within a few degrees of R_plant
        const errDeg = rotationAngleDeg(recovered, R_plant);
        expect(errDeg).toBeLessThan(15);
    });

    it("refuses a planar (level-only) sample set", () => {
        const I = 71 * DEG;
        const fWorld = [Math.cos(I), 0, -Math.sin(I)];
        const R_plantT = mat3transpose(R_plant);
        const samples = [];

        // Level poses: roll=0, pitch=0, varying yaw only
        for (let i = 0; i < 200; i++) {
            const yaw = (i / 200) * 360;
            const Ri = eulerToMatrix(0, 0, yaw);
            const fBody = mat3mulVec(Ri, fWorld);
            const fSensor = mat3mulVec(R_plantT, fBody);
            samples.push({
                x: fSensor[0],
                y: fSensor[1],
                z: fSensor[2],
                roll: 0,
                pitch: 0,
            });
        }

        const result = characterizeTumble({
            samples,
            currentMatrix: [
                [1, 0, 0],
                [0, 1, 0],
                [0, 0, 1],
            ],
            inclinationRad: I,
        });

        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
    });
});
