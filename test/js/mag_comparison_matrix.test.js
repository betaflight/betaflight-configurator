/**
 * 3×2 comparison matrix — heading error under all combinations of
 * {current, proposed} alignment × {raw, −center, W_inv·(−center)} correction,
 * evaluated on the 20-pose gold fixture (samples4, Saguenay QC, CW270FLIP).
 *
 * Frame conventions (the part v3task.md Appendix K originally got wrong):
 * the ellipsoid (center, W_inv) is fit on CAPTURE-frame data, so the
 * correction is applied in the capture frame and the frame change comes last:
 *
 *   C1 = heading(m)                                  current, raw
 *   C2 = heading(m − center)                          current, hard iron
 *   C3 = heading(W_inv·(m − center))                  current, full ellipsoid
 *   P1 = heading(newCombined·m)                       proposed, raw
 *   P2 = heading(newCombined·(m − center))            proposed, hard iron
 *   P3 = heading(newCombined·W_inv·(m − center))      proposed, full ellipsoid
 *
 * This is a CHARACTERIZATION test: the numeric thresholds are the measured
 * baseline of the gold fixture. If a code change moves them, understand why
 * before adjusting — see PullRequest.md "Comparison matrix".
 */
import { describe, expect, it } from "vitest";
import { characterizeAlignment } from "../../src/js/utils/magCharacterization.js";
import { fitEllipsoid } from "../../src/js/utils/ellipsoidFit.js";
import {
    eulerToMatrix,
    mat3mulVec,
    mat3transpose,
    mat3mul,
    undoRollPitch,
    ALIGNMENT_MATRICES,
} from "../../src/js/utils/magAlignment.js";
import { headingError } from "../../src/js/utils/magCharacterizationCompute.js";
import { loadFixture, flattenSamples } from "./test_helpers.js";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// ── Shared setup ────────────────────────────────────────────────────────────

const calFixture = loadFixture("clean_calibration_tumble.json");
const poses = loadFixture("clean_calibration_poses.json");

const ellipsoid = fitEllipsoid(calFixture.samples.map((s) => ({ x: s.x, y: s.y, z: s.z })));
const poseSamples = flattenSamples(poses);
const solverResult = characterizeAlignment(poseSamples, 8, null, {
    headingMode: "absolute",
    headingWeight: 1.0,
});

let proposedMat;
if (solverResult.alignment === 9 && solverResult.customAngles) {
    const a = solverResult.customAngles;
    proposedMat = eulerToMatrix(a.roll, a.pitch, a.yaw);
} else {
    proposedMat = ALIGNMENT_MATRICES[solverResult.alignment] || ALIGNMENT_MATRICES[1];
}
const currentMat = ALIGNMENT_MATRICES[8]; // CW270FLIP
const newCombined = mat3mul(proposedMat, mat3transpose(currentMat));
const center = ellipsoid.center;
const W = ellipsoid.W_inv;

const COMBOS = ["C1", "C2", "C3", "P1", "P2", "P3"];

function correctedVectors(m) {
    const d = [m[0] - center.x, m[1] - center.y, m[2] - center.z];
    const wd = [
        W[0][0] * d[0] + W[0][1] * d[1] + W[0][2] * d[2],
        W[1][0] * d[0] + W[1][1] * d[1] + W[1][2] * d[2],
        W[2][0] * d[0] + W[2][1] * d[1] + W[2][2] * d[2],
    ];
    return {
        C1: m,
        C2: d,
        C3: wd,
        P1: mat3mulVec(newCombined, m),
        P2: mat3mulVec(newCombined, d),
        P3: mat3mulVec(newCombined, wd),
    };
}

// Per-pose circular-mean heading error for each combination
function computeMatrix() {
    const sums = {};
    for (const k of COMBOS) sums[k] = { err: 0, n: 0 };

    for (const dir of poses.directions) {
        for (const pose of dir.poses) {
            if (!pose.captured || !pose.samples?.length) continue;
            const acc = {};
            for (const k of COMBOS) acc[k] = { sin: 0, cos: 0 };

            for (const s of pose.samples) {
                const rollRad = s.roll * DEG_TO_RAD;
                const pitchRad = s.pitch * DEG_TO_RAD;
                const vecs = correctedVectors(s.mag);
                for (const k of COMBOS) {
                    const level = undoRollPitch(vecs[k], rollRad, pitchRad);
                    const h = Math.atan2(level[1], level[0]);
                    acc[k].sin += Math.sin(h);
                    acc[k].cos += Math.cos(h);
                }
            }

            const expected = pose.samples[0].headingRef;
            for (const k of COMBOS) {
                const heading = Math.atan2(acc[k].sin, acc[k].cos) * RAD_TO_DEG;
                sums[k].err += headingError(heading, expected);
                sums[k].n++;
            }
        }
    }

    const mean = {};
    for (const k of COMBOS) mean[k] = sums[k].err / sums[k].n;
    return mean;
}

const mean = computeMatrix();

// ── Tests ───────────────────────────────────────────────────────────────────

describe("3×2 comparison matrix (gold fixture)", () => {
    it("logs the full matrix", () => {
        const f = (k) => `${mean[k].toFixed(1)}°`.padStart(7);
        console.log("  COMPARISON MATRIX (mean heading error, 20 poses)");
        console.log("                    raw     −center  W_inv·(−center)");
        console.log(`  CW270FLIP     ${f("C1")} ${f("C2")} ${f("C3")}`);
        console.log(`  CUSTOM        ${f("P1")} ${f("P2")} ${f("P3")}`);
        const best = COMBOS.reduce((a, b) => (mean[a] <= mean[b] ? a : b));
        console.log(`  best: ${best} at ${mean[best].toFixed(1)}°`);
        expect(Number.isFinite(mean.C1)).toBe(true);
    });

    it("evaluated all 20 poses for every combination", () => {
        // computeMatrix divides by n — re-derive n to assert coverage
        let n = 0;
        for (const dir of poses.directions) {
            for (const pose of dir.poses) {
                if (pose.captured && pose.samples?.length) n++;
            }
        }
        expect(n).toBe(20);
    });

    it("proposed alignment beats current on raw data (P1 < C1)", () => {
        expect(mean.P1).toBeLessThan(mean.C1 - 2.0);
    });

    it("center subtraction helps under the CURRENT alignment (C2 < C1)", () => {
        expect(mean.C2).toBeLessThan(mean.C1 - 2.0);
    });

    it("best combination beats the starting point C1 by a meaningful margin", () => {
        const best = Math.min(...COMBOS.map((k) => mean[k]));
        expect(best).toBeLessThan(mean.C1 - 2.0);
    });

    it("W_inv is a small perturbation on top of center subtraction", () => {
        // Soft iron on this sensor is mild — the full-ellipsoid column should
        // sit near the hard-iron column in both frames.
        expect(Math.abs(mean.C3 - mean.C2)).toBeLessThan(5.0);
        expect(Math.abs(mean.P3 - mean.P2)).toBeLessThan(5.0);
    });

    it("documents the calibration transfer failure on this dataset (P3 > P1)", () => {
        // The tumble-derived center does NOT transfer to the pose data
        // (capture contamination; |center| ≈ 76% of |H|). Applying it under
        // the corrected alignment makes heading WORSE — this is the measured
        // basis for the wizard's calibration cross-validation guard.
        // A clean re-capture is expected to flip this relation; when it does,
        // update this test and the guard threshold together.
        expect(mean.P3).toBeGreaterThan(mean.P1);
    });
});
