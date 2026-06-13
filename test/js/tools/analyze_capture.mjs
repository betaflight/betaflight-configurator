/**
 * Offline analysis of a wizard capture session (tumble + poses) through the
 * CURRENT production pipeline — the same shared functions the wizard runs
 * (selectAlignmentPackage etc.), so its output IS what the wizard would do.
 *
 *   node test/js/tools/analyze_capture.mjs <dir>
 *
 * <dir> must contain calibration_samples_*.json (or high-inclination_tumble)
 * and characterization_poses_*.json (or high-inclination_poses). The FC
 * configuration active during capture (alignment, custom angles) is read from
 * the poses export metadata — no manual argument, no human error vector.
 */
import fs from "node:fs";
import path from "node:path";

import { fitEllipsoid } from "../../../src/js/utils/ellipsoidFit.js";
import { fitSphere, computeDirectionalCoverage } from "../../../src/js/utils/sphereFit.js";
import { mat3mul, mat3mulVec, mat3transpose, undoRollPitch } from "../../../src/js/utils/magAlignment.js";
import {
    selectAlignmentPackage,
    currentMatrixOf,
    proposedMatrixOf,
    computeCalFromEllipsoid,
    headingError,
    assessTumbleQuality,
    assessPoseQuality,
} from "../../../src/js/utils/magCharacterizationCompute.js";
import { flattenSamples, captureDataFromPosesExport, directionsFromPosesExport } from "../test_helpers.js";

const DEG = 180 / Math.PI;
const dir = process.argv[2];
if (!dir) {
    console.error("usage: node analyze_capture.mjs <dir>");
    process.exit(1);
}

const findFile = (...prefixes) => {
    const f = fs.readdirSync(dir).find((n) => prefixes.some((p) => n.startsWith(p)) && n.endsWith(".json"));
    if (!f) throw new Error(`no ${prefixes.join("|")}*.json in ${dir}`);
    return JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
};

const cal = findFile("calibration_samples", "high-inclination_tumble");
const poses = findFile("characterization_poses", "high-inclination_poses");

// FC configuration during capture, from export metadata
const CAPTURE_ALIGNMENT = poses.metadata?.currentAlignment ?? 8;
const CAPTURE_CUSTOM_ANGLES = poses.metadata?.customAngles ?? null;
// mag_calibration active during capture: the fitted center is the RESIDUAL
// bias, so the proposal must compose newCombined·(center + magZero_capture).
// Older exports (and failed CLI reads) carry no value — assume zero, but say so.
const CAPTURE_MAG_ZERO = poses.metadata?.magZeroAtCapture ?? null;

// ── Tumble ──────────────────────────────────────────────────────────────────
const pts = cal.samples.map((s) => ({ x: s.x, y: s.y, z: s.z }));
const sphere = fitSphere(pts);
const coverage = computeDirectionalCoverage(pts, sphere?.center ?? { x: 0, y: 0, z: 0 });
const ellipsoid = fitEllipsoid(pts);
if (!ellipsoid) throw new Error("ellipsoid fit failed");
const c = ellipsoid.center;
const W = ellipsoid.W_inv;
const centerMag = Math.hypot(c.x, c.y, c.z);

console.log(`TUMBLE: ${pts.length} samples  (captured under alignment ${CAPTURE_ALIGNMENT})`);
console.log(
    `  sphere fit: center (${sphere.center.x.toFixed(0)}, ${sphere.center.y.toFixed(0)}, ${sphere.center.z.toFixed(0)})  radius ${sphere.radius.toFixed(0)}  residual ${sphere.residual.toFixed(1)}`,
);
console.log(
    `  coverage: ${(coverage.fraction * 100).toFixed(0)}% (${coverage.covered}/${coverage.totalFaces} sphere regions)`,
);
console.log(
    `  ellipsoid: center (${c.x.toFixed(0)}, ${c.y.toFixed(0)}, ${c.z.toFixed(0)}) |C|=${centerMag.toFixed(0)}  radius ${ellipsoid.radius.toFixed(3)}  residual ${(ellipsoid.residual * 100).toFixed(1)}%`,
);

// ── Poses + dual solve (the production path) ────────────────────────────────
const allSamples = flattenSamples(poses);
let avgH = 0;
for (const s of allSamples) avgH += Math.hypot(s.mag[0], s.mag[1]);
avgH /= allSamples.length;
console.log(`\nPOSES: ${allSamples.length} samples across ${poses.metadata?.totalPoses ?? "?"} poses`);
console.log(`  center/|H| ratio: ${((centerMag / avgH) * 100).toFixed(0)}%  (avg |H| ${avgH.toFixed(0)} counts)`);

const captureData = captureDataFromPosesExport(poses);
const dirsConst = directionsFromPosesExport(poses);
const currentMat = currentMatrixOf(CAPTURE_ALIGNMENT, CAPTURE_CUSTOM_ANGLES);
if (!currentMat) throw new Error("CUSTOM capture alignment but no customAngles in poses metadata");

const { result, usedCalibratedPackage, validation } = selectAlignmentPackage({
    samples: allSamples,
    captureData,
    directions: dirsConst,
    currentAlignment: CAPTURE_ALIGNMENT,
    customAngles: CAPTURE_CUSTOM_ANGLES,
    currentMat,
    ellipsoidParams: ellipsoid,
});
if (result.error) throw new Error(`solver: ${result.error}`);

const describeSolve = (s) =>
    `${s.label}` +
    (s.customAngles
        ? ` (roll ${s.customAngles.roll.toFixed(0)}, pitch ${s.customAngles.pitch.toFixed(0)}, yaw ${s.customAngles.yaw.toFixed(0)})`
        : "") +
    `  quality ${s.qualityScore}%`;

console.log(`  chosen: ${describeSolve(result)}  fieldDev ${result.fieldConsistency.maxDevPct}%`);
if (validation) {
    console.log(
        `  PACKAGE SELECTION: calibrated ${validation.fullCorrectedMeanErr.toFixed(1)}° vs ` +
            `alignment-only ${validation.proposedMeanErr.toFixed(1)}° → ` +
            (usedCalibratedPackage ? "CALIBRATED PACKAGE" : "ALIGNMENT-ONLY (bias deferred)"),
    );
}

const newCombined = mat3mul(proposedMatrixOf(result, currentMat), mat3transpose(currentMat));

// ── Comparison matrix (diagnostic characterization, chosen proposal) ────────
const COMBOS = ["C1", "C2", "C3", "P1", "P2", "P3"];
const sums = Object.fromEntries(COMBOS.map((k) => [k, { e: 0, n: 0 }]));
for (const row of captureData) {
    for (const cap of row) {
        if (!cap?.samples?.length) continue;
        const acc = Object.fromEntries(COMBOS.map((k) => [k, { s: 0, c: 0 }]));
        for (const s of cap.samples) {
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
        const expected = cap.samples[0].headingRef;
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
const calOffsets = computeCalFromEllipsoid(ellipsoid, newCombined, CAPTURE_MAG_ZERO ?? { x: 0, y: 0, z: 0 });
console.log(`\nWIZARD WOULD APPLY: ${describeSolve(result)}`);
if (CAPTURE_MAG_ZERO) {
    console.log(
        `  composes mag_calibration active during capture: (${CAPTURE_MAG_ZERO.x}, ${CAPTURE_MAG_ZERO.y}, ${CAPTURE_MAG_ZERO.z})`,
    );
} else {
    console.log("  WARNING: mag_calibration during capture unknown (assumed 0,0,0) — older export or failed CLI read");
}
if (usedCalibratedPackage) {
    console.log(`  set mag_calibration = ${calOffsets.x},${calOffsets.y},${calOffsets.z}`);
    console.log(
        `  expected firmware mean error after apply: ${validation.fullCorrectedMeanErr.toFixed(1)}° (was ${mean.C1.toFixed(1)}°)`,
    );
} else {
    console.log("  mag_calibration WITHHELD (bias deferred to per-flight self-calibration)");
    console.log(
        `  expected firmware mean error after apply: ${(validation?.proposedMeanErr ?? mean.P1).toFixed(1)}° (was ${mean.C1.toFixed(1)}°)`,
    );
}
// Quality verdicts (matches wizard export)
const pts = cal.samples.map((s) => ({ x: s.x, y: s.y, z: s.z }));
const avgH = pts.reduce((s, v) => s + Math.hypot(v.x, v.y), 0) / pts.length || 1;
const cRatio = Math.hypot(c.x, c.y, c.z) / avgH;
const tumbleQ = assessTumbleQuality({ centerRatio: cRatio, coverageFraction: coverage, ellipsoidResidual: ellipsoid.residual });
const currentErr = validation ? validation.proposedMeanErr : mean.C1;
const pkgErr = validation?.fullCorrectedMeanErr ?? currentErr;
const poseQ = assessPoseQuality({ currentErrorDeg: currentErr, packageErrorDeg: pkgErr, fieldDevMaxPct: result.fieldConsistency?.maxDevPct });
console.log(`\nQUALITY: tumble=${tumbleQ.verdict}  pose=${poseQ.verdict}`);
if (tumbleQ.reasons.length) tumbleQ.reasons.forEach((r) => console.log(`  tumble: ${r}`));
if (poseQ.reasons.length) poseQ.reasons.forEach((r) => console.log(`  pose: ${r}`));
