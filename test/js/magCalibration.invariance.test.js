/**
 * Settings-independence (invariance) oracle for the improved-tumble pipeline.
 *
 * (a) Idempotence: plant raw sensor physics (true mount R_true + hard-iron bias b_s),
 *     simulate an "applied" FC config (apply a known align_mag + magZero to the stream),
 *     run the pipeline's un-apply + ellipsoid fit + solveTiltAlignment, and assert the
 *     recovered alignment is within a few degrees of R_true.
 *
 * (b) Gate blocks: feed a planar (level-only, no tilt) sample set through the composable's
 *     check3DCoverage gate and assert it is refused (not merely warned).
 *
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
import { fitEllipsoid } from "../../src/js/utils/ellipsoidFit.js";
import { solveTiltAlignment } from "../../src/js/utils/magTiltAlign.js";
import { check3DCoverage } from "../../src/js/utils/sphereFit.js";

// Deterministic PRNG (mulberry32).
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

/** Geodesic distance between two rotation matrices (degrees). */
function rotationAngleDeg(A, B) {
    const M = mat3mul(mat3transpose(A), B);
    const tr = M[0][0] + M[1][1] + M[2][2];
    return Math.acos(clamp((tr - 1) / 2, -1, 1)) / DEG;
}

/**
 * Generate a tilt-diverse tumble in the SENSOR frame, then apply an FC config
 * (R_capture applied, magZero subtracted), so the stream looks like what
 * MSP_RAW_IMU reports in the field.
 *
 * Physics:
 *   sensor_raw = R_true * field_body - b_s      (sensor reads R_true-rotated field minus bias)
 *   streamed   = R_capture * sensor_raw - magZero   (firmware applies R_capture then subtracts magZero)
 *
 * The pipeline should invert: raw ≈ R_captureT * (streamed + magZero),
 * then fitEllipsoid to recover b_s (as center), then solveTiltAlignment to recover R_true.
 */
function makeCapturedTumble(rTrue, bSensor, inclDeg, rCapture, magZero, rng) {
    const rTrueT = mat3transpose(rTrue);

    const I = inclDeg * DEG;
    // WMM field in world frame (NED-like, Z down): scaled to ADC counts (~1800 total).
    // Using 1800 keeps units consistent with the bias vector (ADC counts).
    const MAG_SCALE = 1800;
    const fWorld = [Math.cos(I) * MAG_SCALE, 0, -Math.sin(I) * MAG_SCALE];
    const gWorld = [0, 0, -1];

    const samples = [];
    const rolls = [-55, -30, -10, 10, 30, 55];
    const pitches = [-50, -25, 0, 25, 50];
    const yaws = [0, 60, 120, 180, 240, 300];

    for (const rl of rolls) {
        for (const pt of pitches) {
            for (const yw of yaws) {
                const Ri = eulerToMatrix(rl, pt, yw);
                const gBody = mat3mulVec(Ri, gWorld);
                const fBody = mat3mulVec(Ri, fWorld);

                // Sensor reading: R_trueT rotates field_body into sensor frame, subtract bias
                const sensorRaw = mat3mulVec(rTrueT, fBody).map((v, i) => v - bSensor[i]);

                // What MSP_RAW_IMU emits: R_capture * sensor_raw - magZero
                const streamed = mat3mulVec(rCapture, sensorRaw).map(
                    (v, i) => v - [magZero.x, magZero.y, magZero.z][i],
                );

                // Tilt angles from gravity in body frame
                const pitch = Math.asin(clamp(gBody[0], -1, 1)) / DEG;
                const roll = Math.atan2(-gBody[1], -gBody[2]) / DEG;

                // Add a tiny seeded perturbation (1 ADC count peak) to avoid degenerate point sets
                const noise = 1;
                samples.push({
                    x: streamed[0] + (rng() - 0.5) * noise,
                    y: streamed[1] + (rng() - 0.5) * noise,
                    z: streamed[2] + (rng() - 0.5) * noise,
                    roll,
                    pitch,
                });
            }
        }
    }
    return samples;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("magCalibration invariance", () => {
    it("(a) idempotence: recovers true mount R_true under an applied capture config", () => {
        const rng = mulberry32(0xf00dcafe);

        // Planted ground truth
        const R_TRUE = eulerToMatrix(20, -15, 95); // custom mount, not a preset
        const B_SENSOR = [120, -85, 40]; // hard-iron bias in sensor frame (ADC counts scaled)
        const INCL_DEG = 71; // Saguenay QC high inclination

        // FC has CW270FLIP applied with some magZero
        const R_CAPTURE = ALIGNMENT_MATRICES[8]; // CW270FLIP
        const MAG_ZERO = { x: 50, y: -30, z: 20 };

        const capturedSamples = makeCapturedTumble(R_TRUE, B_SENSOR, INCL_DEG, R_CAPTURE, MAG_ZERO, rng);

        // Un-apply live config (mirror of the composable's computeResults)
        const R_capT = mat3transpose(R_CAPTURE);
        const z = MAG_ZERO;
        const rawSamples = capturedSamples.map((s) => {
            const streamed = [s.x + z.x, s.y + z.y, s.z + z.z];
            const raw = mat3mulVec(R_capT, streamed);
            return { x: raw[0], y: raw[1], z: raw[2], roll: s.roll, pitch: s.pitch };
        });

        // Coverage gate must pass (tilt-diverse tumble)
        const cov = check3DCoverage(rawSamples);
        expect(cov.ok).toBe(true);

        // Ellipsoid fit
        const ep = fitEllipsoid(rawSamples.map((s) => ({ x: s.x, y: s.y, z: s.z })));
        expect(ep).not.toBeNull();

        // Build calibrated samples for tilt solve
        const { W_inv, center } = ep;
        const mCalSamples = rawSamples.map((s) => {
            const centered = [s.x - center.x, s.y - center.y, s.z - center.z];
            const cal = mat3mulVec(W_inv, centered);
            return { m_cal: cal, roll: s.roll, pitch: s.pitch };
        });

        // Solve tilt alignment
        const tiltResult = solveTiltAlignment(mCalSamples, INCL_DEG * DEG);
        expect(tiltResult).not.toBeNull();

        // Recovered alignment must be within 8 degrees of R_true
        const recoveredR =
            tiltResult.preset !== 9
                ? ALIGNMENT_MATRICES[tiltResult.preset]
                : eulerToMatrix(
                    tiltResult.euler_zyx_deg.roll,
                    tiltResult.euler_zyx_deg.pitch,
                    tiltResult.euler_zyx_deg.yaw,
                );
        const angleDeg = rotationAngleDeg(recoveredR, R_TRUE);
        expect(angleDeg).toBeLessThan(8);
    });

    it("(b) gate blocks a planar (level-only) sample set", () => {
        // Generate a purely flat (roll=0, pitch=0) set of samples — no tilt diversity.
        // The coverage gate must refuse this and not call solveTiltAlignment.
        const rng = mulberry32(0xbad0feed);
        const flatSamples = [];
        for (let i = 0; i < 60; i++) {
            // All samples at level orientation — vary only yaw (rotation about Z only)
            const yaw = i * 6 * DEG; // 0..354 degrees
            const field = [Math.cos(yaw) * 1000, Math.sin(yaw) * 1000, -500 + (rng() - 0.5) * 20];
            flatSamples.push({
                x: field[0],
                y: field[1],
                z: field[2],
                roll: 0,
                pitch: 0,
            });
        }

        const cov = check3DCoverage(flatSamples);
        expect(cov.ok).toBe(false);
        // The reason message should mention "planar" or similar
        expect(cov.reason).toBeTruthy();
    });
});
