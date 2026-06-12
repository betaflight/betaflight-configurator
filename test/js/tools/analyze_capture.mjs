/**
 * Offline analysis of a wizard capture session (tumble + poses) through the
 * CURRENT production pipeline. Read-only — prints what the wizard would
 * compute, including the comparison matrix and the calibration validation
 * verdict.
 *
 *   node test/js/tools/analyze_capture.mjs <dir> [captureAlignment]
 *
 * <dir> must contain calibration_samples_*.json and characterization_poses_*.json.
 * captureAlignment defaults to 8 (CW270FLIP).
 */
import fs from "node:fs";
import path from "node:path";

import { fitEllipsoid } from "../../../src/js/utils/ellipsoidFit.js";
import { fitSphere, computeDirectionalCoverage } from "../../../src/js/utils/sphereFit.js";
import { characterizeAlignment } from "../../../src/js/utils/magCharacterization.js";
import {
    eulerToMatrix,
    mat3mul,
    mat3mulVec,
    mat3transpose,
    undoRollPitch,
    ALIGNMENT_MATRICES,
} from "../../../src/js/utils/magAlignment.js";
import {
    computeReplayData,
    computeCalFromEllipsoid,
    headingError,
} from "../../../src/js/utils/magCharacterizationCompute.js";

const DEG = 180 / Math.PI;
const dir = process.argv[2];
const CAPTURE_ALIGNMENT = Number(process.argv[3] ?? 8);
if (!dir) {
    console.error("usage: node analyze_capture.mjs <dir> [captureAlignment]");
    process.exit(1);
}

const findFile = (prefix) => {
    const f = fs.readdirSync(dir).find((n) => n.startsWith(prefix) && n.endsWith(".json"));
    if (!f) throw new Error(`no ${prefix}*.json in ${dir}`);
    return JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
};

const cal = findFile("calibration_samples");
const poses = findFile("characterization_poses");

// ── Tumble ──────────────────────────────────────────────────────────────────
const pts = cal.samples.map((s) => ({ x: s.x, y: s.y, z: s.z }));
const sphere = fitSphere(pts);
const coverage = computeDirectionalCoverage(pts, sphere?.center ?? { x: 0, y: 0, z: 0 });
const ellipsoid = fitEllipsoid(pts);

console.log(`TUMBLE: ${pts.length} samples`);
console.log(
    `  sphere fit: center (${sphere.center.x.toFixed(0)}, ${sphere.center.y.toFixed(0)}, ${sphere.center.z.toFixed(0)})  radius ${sphere.radius.toFixed(0)}  residual ${sphere.residual.toFixed(1)}`,
);
console.log(
    `  coverage: ${(coverage.fraction * 100).toFixed(0)}% (${coverage.covered}/${coverage.totalFaces} sphere regions)`,
);
if (!ellipsoid) throw new Error("ellipsoid fit failed");
const c = ellipsoid.center;
const centerMag = Math.hypot(c.x, c.y, c.z);
console.log(
    `  ellipsoid: center (${c.x.toFixed(0)}, ${c.y.toFixed(0)}, ${c.z.toFixed(0)}) |C|=${centerMag.toFixed(0)}  radius ${ellipsoid.radius.toFixed(3)}  residual ${(ellipsoid.residual * 100).toFixed(1)}%`,
);
const W = ellipsoid.W_inv;
console.log(
    `  W_inv off-diag: [${W[0][1].toExponential(2)}, ${W[0][2].toExponential(2)}, ${W[1][2].toExponential(2)}] (diag ~${W[0][0].toExponential(2)})`,
);

// ── Poses + solver ──────────────────────────────────────────────────────────
const allSamples = [];
for (let di = 0; di < poses.directions.length; di++) {
    const d = poses.directions[di];
    for (let pi = 0; pi < d.poses.length; pi++) {
        const p = d.poses[pi];
        if (p.samples) {
            for (const sm of p.samples) allSamples.push({ ...sm, poseKey: `${di}:${pi}` });
        }
    }
}
let avgH = 0;
for (const s of allSamples) avgH += Math.hypot(s.mag[0], s.mag[1]);
avgH /= allSamples.length;
console.log(`\nPOSES: ${allSamples.length} samples across ${poses.metadata?.totalPoses ?? "?"} poses`);
console.log(`  center/|H| ratio: ${((centerMag / avgH) * 100).toFixed(0)}%  (avg |H| ${avgH.toFixed(0)} counts)`);

const solverOpts = { headingMode: "absolute", headingWeight: 1.0 };
const describeSolve = (s) =>
    `${s.label}` +
    (s.customAngles
        ? ` (roll ${s.customAngles.roll.toFixed(0)}, pitch ${s.customAngles.pitch.toFixed(0)}, yaw ${s.customAngles.yaw.toFixed(0)})`
        : "") +
    `  quality ${s.qualityScore}%`;

// Dual solve + package selection (mirrors runSolver)
const rawSolve = characterizeAlignment(allSamples, CAPTURE_ALIGNMENT, null, solverOpts);
if (rawSolve.error) throw new Error(`solver: ${rawSolve.error}`);
const correctedSamples = allSamples.map((s) => ({
    ...s,
    mag: [s.mag[0] - c.x, s.mag[1] - c.y, s.mag[2] - c.z],
}));
const corrSolve = characterizeAlignment(correctedSamples, CAPTURE_ALIGNMENT, null, solverOpts);

console.log(`  solve on raw:       ${describeSolve(rawSolve)}`);
console.log(`  solve on −center:   ${corrSolve.error ? corrSolve.error : describeSolve(corrSolve)}`);
console.log(`  fieldDev ${rawSolve.fieldConsistency.maxDevPct}%  chirality ${rawSolve.chiralityFlag}`);

const currentMat = ALIGNMENT_MATRICES[CAPTURE_ALIGNMENT];
const matOf = (s) =>
    s.alignment === 9 && s.customAngles
        ? eulerToMatrix(s.customAngles.roll, s.customAngles.pitch, s.customAngles.yaw)
        : ALIGNMENT_MATRICES[s.alignment];

const captureDataEarly = poses.directions.map((d) =>
    d.poses.map((p) =>
        p.captured && p.samples?.length ? { headingRef: p.samples[0]?.headingRef ?? 0, samples: p.samples } : null,
    ),
);
const dirsEarly = poses.directions.map((d) => ({
    label: d.label,
    heading: 0,
    poses: d.poses.map((p) => ({ label: p.label, isFlat: p.label.startsWith("Flat") })),
}));
const meanPackageErr = (res, includeCenter) => {
    const replayTmp = computeReplayData(res, CAPTURE_ALIGNMENT, captureDataEarly, dirsEarly, {
        ellipsoidParams: ellipsoid,
        calibrationOffsets: null,
        axisGains: null,
        currentMat,
        proposedIncludesCenter: includeCenter,
    });
    let sum = 0;
    for (const d of replayTmp) sum += headingError(d.newHeading, d.expectedHeading);
    return sum / replayTmp.length;
};
const packageErr = corrSolve.error ? Infinity : meanPackageErr(corrSolve, true);
const alignmentOnlyErr = meanPackageErr(rawSolve, false);
const usedCalibratedPackage = packageErr <= alignmentOnlyErr + 1.0;
const solver = usedCalibratedPackage ? corrSolve : rawSolve;
console.log(
    `  PACKAGE SELECTION: calibrated ${packageErr.toFixed(1)}° vs alignment-only ${alignmentOnlyErr.toFixed(1)}° → ` +
        (usedCalibratedPackage ? "CALIBRATED PACKAGE" : "ALIGNMENT-ONLY (bias deferred)"),
);

const proposedMat = matOf(solver);
const newCombined = mat3mul(proposedMat, mat3transpose(currentMat));

// ── Comparison matrix ───────────────────────────────────────────────────────
const COMBOS = ["C1", "C2", "C3", "P1", "P2", "P3"];
const sums = Object.fromEntries(COMBOS.map((k) => [k, { e: 0, n: 0 }]));
for (const d of poses.directions) {
    for (const p of d.poses) {
        if (!p.captured || !p.samples?.length) continue;
        const acc = Object.fromEntries(COMBOS.map((k) => [k, { s: 0, c: 0 }]));
        for (const s of p.samples) {
            const rollRad = (s.roll * Math.PI) / 180;
            const pitchRad = (s.pitch * Math.PI) / 180;
            const m = s.mag;
            const dvec = [m[0] - c.x, m[1] - c.y, m[2] - c.z];
            const wd = [
                W[0][0] * dvec[0] + W[0][1] * dvec[1] + W[0][2] * dvec[2],
                W[1][0] * dvec[0] + W[1][1] * dvec[1] + W[1][2] * dvec[2],
                W[2][0] * dvec[0] + W[2][1] * dvec[1] + W[2][2] * dvec[2],
            ];
            const vecs = {
                C1: m,
                C2: dvec,
                C3: wd,
                P1: mat3mulVec(newCombined, m),
                P2: mat3mulVec(newCombined, dvec),
                P3: mat3mulVec(newCombined, wd),
            };
            for (const k of COMBOS) {
                const lv = undoRollPitch(vecs[k], rollRad, pitchRad);
                const h = Math.atan2(lv[1], lv[0]);
                acc[k].s += Math.sin(h);
                acc[k].c += Math.cos(h);
            }
        }
        const expected = p.samples[0].headingRef;
        for (const k of COMBOS) {
            sums[k].e += headingError(Math.atan2(acc[k].s, acc[k].c) * DEG, expected);
            sums[k].n++;
        }
    }
}
const mean = Object.fromEntries(COMBOS.map((k) => [k, sums[k].e / sums[k].n]));
const f = (k) => `${mean[k].toFixed(1)}°`.padStart(8);
console.log("\nCOMPARISON MATRIX (mean heading error)");
console.log("                  raw    −center  W_inv·(−center)");
console.log(`  current     ${f("C1")} ${f("C2")} ${f("C3")}`);
console.log(`  proposed    ${f("P1")} ${f("P2")} ${f("P3")}`);

// ── What the wizard would apply ─────────────────────────────────────────────
const calOffsets = computeCalFromEllipsoid(ellipsoid, newCombined, { x: 0, y: 0, z: 0 });
console.log(`\nWIZARD WOULD APPLY: ${describeSolve(solver)}`);
if (usedCalibratedPackage) {
    console.log(`  set mag_calibration = ${calOffsets.x},${calOffsets.y},${calOffsets.z}`);
    console.log(`  expected firmware mean error after apply: ${packageErr.toFixed(1)}° (was ${mean.C1.toFixed(1)}°)`);
} else {
    console.log("  mag_calibration WITHHELD (bias deferred to per-flight self-calibration)");
    console.log(
        `  expected firmware mean error after apply: ${alignmentOnlyErr.toFixed(1)}° (was ${mean.C1.toFixed(1)}°)`,
    );
}
