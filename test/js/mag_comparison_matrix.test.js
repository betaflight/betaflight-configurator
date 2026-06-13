/**
 * 3×2 comparison matrix — heading error under all combinations of
 * {current, proposed} alignment × {raw, −center, W_inv·(−center)} correction,
 * evaluated on the 20-pose reference dataset (samples4, Saguenay QC, CW270FLIP).
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
 * baseline of the reference dataset. If a code change moves them, understand why
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

const calFixture = loadFixture("high-inclination_tumble.json");
const poses = loadFixture("high-inclination_poses.json");

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

describe("3×2 comparison matrix (samples4 dataset)", () => {
    it("logs the full matrix and asserts the measured baseline", () => {
        const f = (k) => `${mean[k].toFixed(1)}°`.padStart(7);
        console.log("  COMPARISON MATRIX (mean heading error, 20 poses)");
        console.log("                    raw     −center  W_inv·(−center)");
        console.log(`  CW270FLIP     ${f("C1")} ${f("C2")} ${f("C3")}`);
        console.log(`  CUSTOM        ${f("P1")} ${f("P2")} ${f("P3")}`);
        const best = COMBOS.reduce((a, b) => (mean[a] <= mean[b] ? a : b), COMBOS[0]);
        console.log(`  best: ${best} at ${mean[best].toFixed(1)}°`);
        // measured baseline (samples4, CW270FLIP, raw solve)
        // C1=36.1 C2=20.7 C3=18.5  P1=11.5 P2=59.4 P3=61.7
        expect(mean.C1).toBeGreaterThan(34);
        expect(mean.C1).toBeLessThan(39);
        expect(mean.P1).toBeGreaterThan(9);
        expect(mean.P1).toBeLessThan(14);
        expect(mean.P2).toBeGreaterThan(55);
        expect(mean.P3).toBeGreaterThan(55);
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
        // Soft iron on this sensor is mild; on sensors with genuine cross-axis
        // terms the shift can be larger. Per-dataset in expected.json:
        // soft_iron_heading_shift_max_deg = 5.0 (this clone), widen for others.
        expect(Math.abs(mean.C3 - mean.C2)).toBeLessThan(15.0);
        expect(Math.abs(mean.P3 - mean.P2)).toBeLessThan(15.0);
    });

    it("documents the raw-solve entanglement (P3 > P1 for the RAW-solved rotation)", () => {
        // The proposal in this matrix was solved on RAW data, so it carries
        // hard-iron compensation inside the rotation: subtracting the (real,
        // session-reproducible) center then double-corrects and degrades
        // heading. This is the pathology that correct-then-solve resolves —
        // see the describe below and mag_pipeline_proof.test.js.
        expect(mean.P3).toBeGreaterThan(mean.P1);
    });
});

describe("correct-then-solve resolves the entanglement", () => {
    it("the package (alignment solved on −center, plus offsets) beats every raw-solve cell", () => {
        const ec = ellipsoid.center;
        const corrected = poseSamples.map((s) => ({
            ...s,
            mag: [s.mag[0] - ec.x, s.mag[1] - ec.y, s.mag[2] - ec.z],
        }));
        const corrResult = characterizeAlignment(corrected, 8, null, {
            headingMode: "absolute",
            headingWeight: 1.0,
        });
        expect(corrResult.error).toBeUndefined();
        const a = corrResult.customAngles;
        const pm = eulerToMatrix(a.roll, a.pitch, a.yaw);
        const nc = mat3mul(pm, mat3transpose(currentMat));

        let errSum = 0;
        let n = 0;
        for (const dir of poses.directions) {
            for (const pose of dir.poses) {
                if (!pose.captured || !pose.samples?.length) continue;
                let si = 0;
                let co = 0;
                for (const s of pose.samples) {
                    const d = [s.mag[0] - ec.x, s.mag[1] - ec.y, s.mag[2] - ec.z];
                    const body = mat3mulVec(nc, d);
                    const lv = undoRollPitch(body, s.roll * DEG_TO_RAD, s.pitch * DEG_TO_RAD);
                    const h = Math.atan2(lv[1], lv[0]);
                    si += Math.sin(h);
                    co += Math.cos(h);
                }
                errSum += headingError(Math.atan2(si, co) * RAD_TO_DEG, pose.samples[0].headingRef);
                n++;
            }
        }
        const packageErr = errSum / n;
        console.log(`  correct-then-solve package: ${packageErr.toFixed(1)}° (raw-solve matrix best was P1)`);
        // Measured baseline: 4.4° — beats every cell of the raw-solve matrix
        expect(packageErr).toBeLessThan(8);
        for (const k of COMBOS) {
            expect(packageErr).toBeLessThan(mean[k]);
        }
    });
});
