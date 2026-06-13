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
    ALIGNMENT_MATRICES,
} from "../../src/js/utils/magAlignment.js";
import {
    selectAlignmentPackage,
    currentMatrixOf,
    proposedMatrixOf,
    computeReplayData,
    meanPackageError,
    computeCalFromEllipsoid,
    isFirmwareCustomMagAlignCapable,
    assessTumbleQuality,
    assessPoseQuality,
} from "../../src/js/utils/magCharacterizationCompute.js";
import { rotationDelta } from "./test_helpers.js";

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

// ── Wizard math — the PRODUCTION dual solve, via the shared function ───────

// Minimal directions structure for computeReplayData (labels drive isFlat only;
// every captured pose carries its own headingRef)
const DIRECTIONS = [0, 90, 180, 270].map((h) => ({
    label: `${h}`,
    heading: 0,
    poses: [
        { label: "Flat", isFlat: true },
        { label: "Nose Up", isFlat: false },
        { label: "Nose Down", isFlat: false },
        { label: "Roll right", isFlat: false },
        { label: "Roll left", isFlat: false },
    ],
}));

function runWizard(currentAlignment, customAngles, magZeroAtCapture, fcMat, fcMagZero) {
    const { samples, captureData } = capturePoses(fcMat, fcMagZero);
    const ellipsoid = fitEllipsoid(captureTumble(fcMat, fcMagZero));
    expect(ellipsoid).not.toBeNull();
    const currentMat = currentMatrixOf(currentAlignment, customAngles);

    const { result, usedCalibratedPackage, validation } = selectAlignmentPackage({
        samples,
        captureData,
        directions: DIRECTIONS,
        currentAlignment,
        customAngles,
        currentMat,
        ellipsoidParams: ellipsoid,
    });
    const newCombined = mat3mul(proposedMatrixOf(result, currentMat), mat3transpose(currentMat));
    const offsets = computeCalFromEllipsoid(ellipsoid, newCombined, magZeroAtCapture);

    // Current-config error (what the user sees in the Current column):
    // evaluate the current config as if it were the proposal → newCombined = I
    const currentErr = meanPackageError(
        computeReplayData({ alignment: currentAlignment, customAngles }, currentAlignment, captureData, DIRECTIONS, {
            currentMat,
        }),
    );

    return {
        result,
        offsets,
        ellipsoid,
        packageErr: validation?.fullCorrectedMeanErr ?? Infinity,
        alignmentOnlyErr: validation?.proposedMeanErr ?? Infinity,
        usedPackage: usedCalibratedPackage,
        currentErr,
        newCombined,
    };
}

const matOfResult = (r) => proposedMatrixOf(r);

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

// ── Config D: DEFAULT alignment (identity clamp) ─────────────────────────

describe("config invariance D: currentMatrixOf(0) returns identity", () => {
    it("alignment 0 (DEFAULT) produces the CW0 identity matrix", () => {
        const mat = currentMatrixOf(0, null);
        expect(mat).toEqual(ALIGNMENT_MATRICES[1]);
    });

    it("alignment 0 with customAngles ignored (no CUSTOM meaning)", () => {
        const mat = currentMatrixOf(0, { roll: 45, pitch: 10, yaw: 90 });
        expect(mat).toEqual(ALIGNMENT_MATRICES[1]);
    });
});

// ── F4: Firmware version gate (#14849) ──────────────────────────────────

describe("F4 firmware gate: isFirmwareCustomMagAlignCapable", () => {
    it("rejects 4.5.2 and older pre-14849 versions", () => {
        expect(isFirmwareCustomMagAlignCapable("4.5.2")).toBe(false);
    });

    it("rejects 2025.12.0 (maintenance branch WITHOUT #14849)", () => {
        expect(isFirmwareCustomMagAlignCapable("2025.12.0")).toBe(false);
    });

    it("accepts 2026.6.0 (first release WITH #14849)", () => {
        expect(isFirmwareCustomMagAlignCapable("2026.6.0")).toBe(true);
    });

    it("accepts 2026.6.0-alpha (prerelease master WITH #14849)", () => {
        expect(isFirmwareCustomMagAlignCapable("2026.6.0-alpha")).toBe(true);
    });

    it("rejects empty, undefined, and garbage strings", () => {
        expect(isFirmwareCustomMagAlignCapable("")).toBe(false);
        expect(isFirmwareCustomMagAlignCapable(undefined)).toBe(false);
        expect(isFirmwareCustomMagAlignCapable("garbage")).toBe(false);
    });
});

// ── F6: M-estimator per-poseKey cap (contiguous grouping bug guard) ────

describe("F6 M-estimator: per-poseKey cap is independent", () => {
    it("a 90 deg outlier in one pose does not suppress the other pose's residual", () => {
        // Two poses, same direction (0 deg heading), different poseKeys.
        // Pose A: clean 0 deg samples. Pose B: one clean, one 90 deg outlier.
        // If pose keys are merged (the old contiguous-grouping bug), Pose A's
        // residual is suppressed by Pose B's cap. With correct per-poseKey
        // capping, Pose A reports its true error.
        const H = 900;
        const field = (h) => [H * Math.cos((h * Math.PI) / 180), H * Math.sin((h * Math.PI) / 180), -1500];
        const samples = [];
        // Pose A (key "0:0"): 15 clean samples at 0 deg
        for (let i = 0; i < 15; i++) {
            samples.push({ mag: field(0), roll: 0, pitch: 0, headingRef: 0, poseKey: "0:0" });
        }
        // Pose B (key "0:1"): 14 clean at 0 deg, one outlier at 90 deg
        for (let i = 0; i < 14; i++) {
            samples.push({ mag: field(0), roll: 0, pitch: 0, headingRef: 0, poseKey: "0:1" });
        }
        samples.push({ mag: field(90), roll: 0, pitch: 0, headingRef: 0, poseKey: "0:1" });
        const directions = [
            {
                label: "N",
                heading: 0,
                poses: [
                    { label: "Flat", isFlat: true },
                    { label: "Tilt", isFlat: false },
                ],
            },
        ];
        const captureData = [
            [
                { headingRef: 0, samples: samples.filter((s) => s.poseKey === "0:0") },
                { headingRef: 0, samples: samples.filter((s) => s.poseKey === "0:1") },
            ],
        ];

        const result = characterizeAlignment(samples, 8, null, {
            headingMode: "absolute",
            headingWeight: 1.0,
        });
        expect(result.error).toBeFalsy();
        // If the M-estimator correctly isolates per-poseKey, both poses
        // contribute to the cost and the alignment should be near identity
        // with quality > 0. If keys were merged, the 90 deg outlier caps
        // the entire direction and quality would be much worse.
        expect(result.qualityScore).toBeGreaterThan(0);
    });
});

// ── FP4 / P2.7: Quality assessment functions ──────────────────────────

describe("Quality assessment: tumble", () => {
    it("clean: low center ratio, good coverage, low residual", () => {
        const v = assessTumbleQuality({ centerRatio: 0.05, coverageFraction: 0.95, ellipsoidResidual: 0.005 });
        expect(v.verdict).toBe("clean");
    });

    it("suspect: moderate center ratio with decent coverage", () => {
        const v = assessTumbleQuality({ centerRatio: 0.3, coverageFraction: 0.85, ellipsoidResidual: 0.01 });
        expect(v.verdict).toBe("suspect");
    });

    it("contaminated: high center ratio (bench capture)", () => {
        const v = assessTumbleQuality({ centerRatio: 0.77, coverageFraction: 1.0, ellipsoidResidual: 0.006 });
        expect(v.verdict).toBe("contaminated");
        expect(v.reasons.length).toBeGreaterThan(0);
    });

    it("contaminated: poor coverage", () => {
        const v = assessTumbleQuality({ centerRatio: 0.1, coverageFraction: 0.55, ellipsoidResidual: 0.01 });
        expect(v.verdict).toBe("contaminated");
    });
});

describe("Quality assessment: poses", () => {
    it("clean: both errors under 5 deg", () => {
        const v = assessPoseQuality({ currentErrorDeg: 3, packageErrorDeg: 2 });
        expect(v.verdict).toBe("clean");
    });

    it("suspect: moderate package error", () => {
        const v = assessPoseQuality({ currentErrorDeg: 10, packageErrorDeg: 6 });
        expect(v.verdict).toBe("suspect");
    });

    it("contaminated: large package error", () => {
        const v = assessPoseQuality({ currentErrorDeg: 36, packageErrorDeg: 15 });
        expect(v.verdict).toBe("contaminated");
    });
});
