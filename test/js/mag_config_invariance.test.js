/**
 * Config-invariance proof — the wizard must recover the SAME sensor-frame
 * physics (mount rotation R_true, intrinsic bias b_s) no matter what
 * alignment + mag_calibration the FC is running during capture.
 *
 * MSP streams post-alignment, post-magZero data, so the capture frame is
 * config-dependent BY DESIGN; the pipeline claims to invert it via
 * buildCurrentMatrix(currentAlignment) and the magZero_at_capture
 * composition. Until this file, no test exercised that claim with a
 * CUSTOM + calibrated baseline — every hardware capture before 2026-06-12
 * was made under CW270FLIP with magZero 0.
 *
 * Three FC configurations over identical planted physics:
 *   A: preset CW270FLIP, magZero 0            (the historical baseline)
 *   B: CUSTOM R_true applied + correct magZero (post-apply re-run, all good)
 *   C: CUSTOM R_true applied, magZero MISSING  (the silent-failure scenario)
 *
 * Invariants asserted:
 *   - A proposes ≈ R_true and offsets ≈ R_true·b_s
 *   - B measures ≈ 0° current error, proposes ≈ no change, offsets reproduce
 *     the same physical magZero (composition of center + magZero_at_capture)
 *   - C detects the missing bias: tumble center ≈ R_true·b_s, package wins,
 *     offsets ≈ R_true·b_s again — a tumbled re-run self-heals
 */
import { describe, expect, it } from "vitest";
import { characterizeAlignment } from "../../src/js/utils/magCharacterization.js";
import { fitEllipsoid } from "../../src/js/utils/ellipsoidFit.js";
import {
    eulerToMatrix,
    mat3mul,
    mat3mulVec,
    mat3transpose,
    undoRollPitch,
    ALIGNMENT_MATRICES,
} from "../../src/js/utils/magAlignment.js";
import { computeCalFromEllipsoid, headingError } from "../../src/js/utils/magCharacterizationCompute.js";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// Seeded PRNG (same generator as the export tests) for deterministic noise
let _seed = 1337;
function rng() {
    _seed = (1664525 * _seed + 1013904223) >>> 0;
    return _seed / 0x100000000;
}

// ── Planted ground truth (≈ the real drone) ────────────────────────────────

// 71° dip in the BF body convention (Z up, field dips into the ground →
// z negative), scaled to QMC5883L ADC counts (|B| ≈ 1800) — the ellipsoid
// fit's normal equations are ill-conditioned at nT scale (x⁴ ≈ 8e18).
const H_FIELD = 586; // horizontal: |B|·cos(71°)
const V_FIELD = 1700; // vertical:   |B|·sin(71°)
const R_TRUE = eulerToMatrix(-173, 5, -88); // sensor→body mount rotation
const B_SENSOR = [-91, -716, -114]; // intrinsic hard iron, sensor frame
const NOISE = 6;

/**
 * True-body-frame field for a given attitude, constructed as the EXACT
 * inverse of the solver's leveling: undoRollPitch computes
 * level = Ry(pitch)·Rx(roll)·body, and heading = atan2(level_y, level_x)
 * must equal headingDeg. So:
 *   level = (H·cosψ, H·sinψ, −V)
 *   body  = Rx(−roll)·Ry(−pitch)·level
 */
function bodyField(rollDeg, pitchDeg, headingDeg) {
    const psi = headingDeg * DEG_TO_RAD;
    let v = [H_FIELD * Math.cos(psi), H_FIELD * Math.sin(psi), -V_FIELD];
    const p = -pitchDeg * DEG_TO_RAD;
    const cp = Math.cos(p);
    const sp = Math.sin(p);
    v = [cp * v[0] + sp * v[2], v[1], -sp * v[0] + cp * v[2]];
    const r = -rollDeg * DEG_TO_RAD;
    const cr = Math.cos(r);
    const sr = Math.sin(r);
    return [v[0], cr * v[1] - sr * v[2], sr * v[1] + cr * v[2]];
}

// Raw SENSOR reading for a given true attitude: s = R_trueᵀ·B_body + b_s
function sensorReading(rollDeg, pitchDeg, headingDeg) {
    const bBody = bodyField(rollDeg, pitchDeg, headingDeg);
    const rt = mat3transpose(R_TRUE);
    const s = mat3mulVec(rt, bBody);
    return [
        s[0] + B_SENSOR[0] + NOISE * (rng() - 0.5),
        s[1] + B_SENSOR[1] + NOISE * (rng() - 0.5),
        s[2] + B_SENSOR[2] + NOISE * (rng() - 0.5),
    ];
}

// What MSP streams under a given FC config: m = R_fc·s − magZero
function fcOutput(s, fcMat, magZero) {
    const m = mat3mulVec(fcMat, s);
    return [m[0] - magZero[0], m[1] - magZero[1], m[2] - magZero[2]];
}

// ── Capture simulation ──────────────────────────────────────────────────────

const POSE_DEFS = [];
for (const heading of [0, 90, 180, 270]) {
    for (const att of [
        { roll: 0, pitch: 0 },
        { roll: 0, pitch: -40 },
        { roll: 0, pitch: 40 },
        { roll: -40, pitch: 0 },
        { roll: 40, pitch: 0 },
    ]) {
        POSE_DEFS.push({ heading, ...att });
    }
}

function capturePoses(fcMat, magZero) {
    const samples = [];
    const captureData = [[], [], [], []];
    POSE_DEFS.forEach((pose, idx) => {
        const di = Math.floor(idx / 5);
        const poseSamples = [];
        for (let i = 0; i < 25; i++) {
            const roll = pose.roll + (rng() - 0.5) * 2;
            const pitch = pose.pitch + (rng() - 0.5) * 2;
            const mag = fcOutput(sensorReading(roll, pitch, pose.heading), fcMat, magZero);
            const s = { mag, roll, pitch, headingRef: pose.heading, poseKey: `${di}:${idx % 5}` };
            samples.push(s);
            poseSamples.push(s);
        }
        captureData[di][idx % 5] = { headingRef: pose.heading, samples: poseSamples };
    });
    return { samples, captureData };
}

function captureTumble(fcMat, magZero) {
    const pts = [];
    for (let roll = -180; roll < 180; roll += 30) {
        for (let pitch = -80; pitch <= 80; pitch += 20) {
            for (let heading = 0; heading < 360; heading += 45) {
                const m = fcOutput(sensorReading(roll, pitch, heading), fcMat, magZero);
                pts.push({ x: m[0], y: m[1], z: m[2] });
            }
        }
    }
    return pts;
}

// ── Wizard math (mirrors runSolver's dual solve + package selection) ───────

function runWizard(currentAlignment, customAngles, magZeroAtCapture, fcMat, fcMagZero) {
    const { samples, captureData } = capturePoses(fcMat, fcMagZero);
    const tumble = captureTumble(fcMat, fcMagZero);
    const ellipsoid = fitEllipsoid(tumble);
    expect(ellipsoid).not.toBeNull();

    const currentMat =
        currentAlignment === 9
            ? eulerToMatrix(customAngles.roll, customAngles.pitch, customAngles.yaw)
            : ALIGNMENT_MATRICES[currentAlignment];

    const opts = { headingMode: "absolute", headingWeight: 1.0 };
    const rawResult = characterizeAlignment(samples, currentAlignment, customAngles, opts);
    const ec = ellipsoid.center;
    const corrected = samples.map((s) => ({
        ...s,
        mag: [s.mag[0] - ec.x, s.mag[1] - ec.y, s.mag[2] - ec.z],
    }));
    const corrResult = characterizeAlignment(corrected, currentAlignment, customAngles, opts);

    const matOf = (r) =>
        r.alignment === 9 && r.customAngles
            ? eulerToMatrix(r.customAngles.roll, r.customAngles.pitch, r.customAngles.yaw)
            : ALIGNMENT_MATRICES[r.alignment];

    const meanErr = (r, includeCenter) => {
        const nc = mat3mul(matOf(r), mat3transpose(currentMat));
        let sum = 0;
        let n = 0;
        for (const row of captureData) {
            for (const cap of row) {
                let si = 0;
                let co = 0;
                for (const s of cap.samples) {
                    const m = includeCenter ? [s.mag[0] - ec.x, s.mag[1] - ec.y, s.mag[2] - ec.z] : s.mag;
                    const body = mat3mulVec(nc, m);
                    const lv = undoRollPitch(body, s.roll * DEG_TO_RAD, s.pitch * DEG_TO_RAD);
                    const h = Math.atan2(lv[1], lv[0]);
                    si += Math.sin(h);
                    co += Math.cos(h);
                }
                sum += headingError(Math.atan2(si, co) * RAD_TO_DEG, cap.headingRef);
                n++;
            }
        }
        return sum / n;
    };

    const packageErr = meanErr(corrResult, true);
    const alignmentOnlyErr = meanErr(rawResult, false);
    const usedPackage = packageErr <= alignmentOnlyErr + 1.0;
    const result = usedPackage ? corrResult : rawResult;
    const newCombined = mat3mul(matOf(result), mat3transpose(currentMat));
    const offsets = computeCalFromEllipsoid(ellipsoid, newCombined, magZeroAtCapture);

    // Current-config error (what the user sees in the Current column)
    const currentErr = meanErr(
        currentAlignment === 9 ? { alignment: 9, customAngles } : { alignment: currentAlignment },
        false,
    );

    return { result, offsets, ellipsoid, packageErr, alignmentOnlyErr, usedPackage, currentErr, newCombined };
}

// Angle between two rotations (degrees) — representation-independent
function rotationDelta(matA, matB) {
    const r = mat3mul(matA, mat3transpose(matB));
    const trace = r[0][0] + r[1][1] + r[2][2];
    return Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2))) * RAD_TO_DEG;
}

const matOfResult = (r) =>
    r.alignment === 9 && r.customAngles
        ? eulerToMatrix(r.customAngles.roll, r.customAngles.pitch, r.customAngles.yaw)
        : ALIGNMENT_MATRICES[r.alignment];

// Physical magZero the FC needs once R_TRUE is applied
const TRUE_MAGZERO = mat3mulVec(R_TRUE, B_SENSOR);

// ── Config A: CW270FLIP baseline, magZero 0 (the historical scenario) ──────

describe("config invariance A: capture under CW270FLIP, magZero 0", () => {
    const A = runWizard(8, null, { x: 0, y: 0, z: 0 }, ALIGNMENT_MATRICES[8], [0, 0, 0]);

    it("recovers the planted mount rotation", () => {
        expect(rotationDelta(matOfResult(A.result), R_TRUE)).toBeLessThan(4);
    });

    it("package wins and lands near zero error", () => {
        expect(A.usedPackage).toBe(true);
        expect(A.packageErr).toBeLessThan(2);
    });

    it("offsets reproduce the physical magZero R_true·b_s", () => {
        expect(Math.abs(A.offsets.x - TRUE_MAGZERO[0])).toBeLessThan(15);
        expect(Math.abs(A.offsets.y - TRUE_MAGZERO[1])).toBeLessThan(15);
        expect(Math.abs(A.offsets.z - TRUE_MAGZERO[2])).toBeLessThan(15);
    });
});

// ── Config B: CUSTOM + correct magZero applied (post-apply re-run) ─────────

describe("config invariance B: capture under CUSTOM R_true + correct magZero", () => {
    const angles = { roll: -173, pitch: 5, yaw: -88 };
    const B = runWizard(
        9,
        angles,
        { x: TRUE_MAGZERO[0], y: TRUE_MAGZERO[1], z: TRUE_MAGZERO[2] },
        R_TRUE,
        TRUE_MAGZERO,
    );

    it("current config already measures near-zero error", () => {
        expect(B.currentErr).toBeLessThan(2);
    });

    it("tumble center is near zero (bias already removed by the FC)", () => {
        const c = B.ellipsoid.center;
        expect(Math.hypot(c.x, c.y, c.z)).toBeLessThan(25);
    });

    it("proposes no meaningful rotation change", () => {
        expect(rotationDelta(matOfResult(B.result), R_TRUE)).toBeLessThan(4);
    });

    it("offsets reproduce the SAME physical magZero via center + magZero_at_capture composition", () => {
        expect(Math.abs(B.offsets.x - TRUE_MAGZERO[0])).toBeLessThan(15);
        expect(Math.abs(B.offsets.y - TRUE_MAGZERO[1])).toBeLessThan(15);
        expect(Math.abs(B.offsets.z - TRUE_MAGZERO[2])).toBeLessThan(15);
    });
});

// ── Config C: CUSTOM applied but magZero silently missing (the rested run) ─

describe("config invariance C: capture under CUSTOM R_true, magZero MISSING", () => {
    const angles = { roll: -173, pitch: 5, yaw: -88 };
    const C = runWizard(9, angles, { x: 0, y: 0, z: 0 }, R_TRUE, [0, 0, 0]);

    it("current column exposes the missing bias (large error)", () => {
        expect(C.currentErr).toBeGreaterThan(8);
    });

    it("tumble center recovers the un-subtracted bias R_true·b_s", () => {
        const c = C.ellipsoid.center;
        expect(Math.abs(c.x - TRUE_MAGZERO[0])).toBeLessThan(15);
        expect(Math.abs(c.y - TRUE_MAGZERO[1])).toBeLessThan(15);
        expect(Math.abs(c.z - TRUE_MAGZERO[2])).toBeLessThan(15);
    });

    it("package self-heals: rotation unchanged, offsets restore the physical magZero", () => {
        expect(C.usedPackage).toBe(true);
        expect(C.packageErr).toBeLessThan(2);
        expect(rotationDelta(matOfResult(C.result), R_TRUE)).toBeLessThan(4);
        expect(Math.abs(C.offsets.x - TRUE_MAGZERO[0])).toBeLessThan(15);
        expect(Math.abs(C.offsets.y - TRUE_MAGZERO[1])).toBeLessThan(15);
        expect(Math.abs(C.offsets.z - TRUE_MAGZERO[2])).toBeLessThan(15);
    });

    it("raw solve under CUSTOM entangles the bias exactly like it did under presets", () => {
        // The rested-run pathology, reproduced synthetically: without the
        // tumble the raw solve proposes a phantom rotation away from R_true
        expect(C.alignmentOnlyErr).toBeGreaterThan(C.packageErr);
    });
});
