import { characterizeAlignment } from "../../src/js/utils/magCharacterization.js";
import { fitEllipsoid, applyEllipsoidCorrection } from "../../src/js/utils/ellipsoidFit.js";
import {
    eulerToMatrix,
    mat3mulVec,
    mat3transpose,
    mat3mul,
    undoRollPitch,
    ALIGNMENT_MATRICES,
} from "../../src/js/utils/magAlignment.js";
import { loadFixture, flattenSamples } from "./test_helpers.js";
import { computeCalFromEllipsoid } from "../../src/js/utils/magCharacterizationCompute.js";
import fs from "node:fs";

const DEG_TO_RAD = Math.PI / 180,
    RAD_TO_DEG = 180 / Math.PI;

function hErr(a, e) {
    if (e == null) return 0;
    let d = a - e;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return Math.abs(d);
}

// Load new tumble
const calRaw = JSON.parse(
    fs.readFileSync("C:/code/betaflightz/calibration_samples_2026-06-11T22-05-16-920Z.json", "utf-8"),
);
const points = calRaw.samples.map((s) => ({ x: s.x, y: s.y, z: s.z }));
const ellipsoid = fitEllipsoid(points);

// Load samples4 poses
const poses = loadFixture("clean_calibration_poses.json");
const poseSamples = flattenSamples(poses);

// Run solver on raw data
const solverResult = characterizeAlignment(poseSamples, 8, null, {
    headingMode: "absolute",
    headingWeight: 1.0,
});

// Build alignment matrices
const currentMat = ALIGNMENT_MATRICES[8]; // CW270FLIP
const currentInv = mat3transpose(currentMat);

let proposedMat;
if (solverResult.alignment === 9 && solverResult.customAngles) {
    proposedMat = eulerToMatrix(
        solverResult.customAngles.roll,
        solverResult.customAngles.pitch,
        solverResult.customAngles.yaw,
    );
} else {
    proposedMat = ALIGNMENT_MATRICES[solverResult.alignment] || ALIGNMENT_MATRICES[1];
}
const newCombined = mat3mul(proposedMat, currentInv);

// Compute calibration offsets from ellipsoid
const calOffsets = computeCalFromEllipsoid(ellipsoid, currentMat);

console.log("=== ELLIPSOID ===");
console.log(
    `  Center: x=${ellipsoid.center.x.toFixed(0)} y=${ellipsoid.center.y.toFixed(0)} z=${ellipsoid.center.z.toFixed(0)}`,
);
console.log(`  Residual: ${ellipsoid.residual.toFixed(4)}  Radius: ${ellipsoid.radius.toFixed(4)}`);
console.log(`  Cal offsets: x=${calOffsets.x} y=${calOffsets.y} z=${calOffsets.z}`);
console.log("");

console.log("=== SOLVER ===");
console.log(`  Alignment: ${solverResult.label}`);
if (solverResult.customAngles) {
    console.log(
        `  Euler: roll=${solverResult.customAngles.roll.toFixed(0)}° pitch=${solverResult.customAngles.pitch.toFixed(0)}° yaw=${solverResult.customAngles.yaw.toFixed(0)}°`,
    );
}
console.log(`  Quality: ${solverResult.qualityScore}%`);
console.log("");

// Per-pose comparison
console.log("POSE  DIR   EXPECTED   CURRENT(err)   PROPOSED(err)   CALIBRATED(err)");
console.log("----  ---   --------   ------------   -------------   ---------------");

let sumCur = 0,
    sumNew = 0,
    sumCal = 0;
let flatCur = 0,
    flatNew = 0,
    flatCal = 0;
let flatCount = 0;

for (const dir of poses.directions) {
    for (const pose of dir.poses) {
        if (!pose.captured || !pose.samples || pose.samples.length === 0) continue;

        let curSin = 0,
            curCos = 0,
            newSin = 0,
            newCos = 0,
            calSin = 0,
            calCos = 0;
        for (const s of pose.samples) {
            const rr = s.roll * DEG_TO_RAD,
                pr = s.pitch * DEG_TO_RAD;

            // Current (CW270FLIP identity: currentMat * currentInv = I)
            const cl = undoRollPitch(s.mag, rr, pr);
            curSin += Math.sin(Math.atan2(cl[1], cl[0]));
            curCos += Math.cos(Math.atan2(cl[1], cl[0]));

            // Proposed
            const nb = mat3mulVec(newCombined, s.mag);
            const nl = undoRollPitch(nb, rr, pr);
            newSin += Math.sin(Math.atan2(nl[1], nl[0]));
            newCos += Math.cos(Math.atan2(nl[1], nl[0]));

            // Calibrated: sensor-frame W_inv correction + proposed alignment
            const sensorMag = mat3mulVec(currentInv, s.mag);
            const rotatedCenter = mat3mulVec(currentInv, [ellipsoid.center.x, ellipsoid.center.y, ellipsoid.center.z]);
            const sensorCal = applyEllipsoidCorrection(sensorMag, {
                center: { x: rotatedCenter[0], y: rotatedCenter[1], z: rotatedCenter[2] },
                W_inv: ellipsoid.W_inv,
            });
            const cb = mat3mulVec(proposedMat, sensorCal);
            const clv = undoRollPitch(cb, rr, pr);
            calSin += Math.sin(Math.atan2(clv[1], clv[0]));
            calCos += Math.cos(Math.atan2(clv[1], clv[0]));
        }

        const expected = pose.samples[0].headingRef;
        const curH = Math.atan2(curSin, curCos) * RAD_TO_DEG;
        const newH = Math.atan2(newSin, newCos) * RAD_TO_DEG;
        const calH = Math.atan2(calSin, calCos) * RAD_TO_DEG;
        const curE = hErr(curH, expected);
        const newE = hErr(newH, expected);
        const calE = hErr(calH, expected);

        sumCur += curE;
        sumNew += newE;
        sumCal += calE;

        const dirShort = dir.label.split(" ")[0];
        const id = `${(`${pose.label  }               `).substring(0, 12)}`;
        console.log(
            `  ${id} ${dirShort.padEnd(5)} ${expected.toFixed(0).padStart(4)}°    ${curH.toFixed(1).padStart(7)}° (${curE.toFixed(1).padStart(5)}°)  ${newH.toFixed(1).padStart(7)}° (${newE.toFixed(1).padStart(5)}°)  ${calH.toFixed(1).padStart(7)}° (${calE.toFixed(1).padStart(5)}°)`,
        );

        if (pose.label.startsWith("Flat")) {
            flatCur += curE;
            flatNew += newE;
            flatCal += calE;
            flatCount++;
        }
    }
}

const n = 20;
console.log("");
console.log("=== SUMMARY ===");
console.log(
    `  ALL 20 POSES:  current=${(sumCur / n).toFixed(1)}°  proposed=${(sumNew / n).toFixed(1)}°  calibrated=${(sumCal / n).toFixed(1)}°`,
);
console.log(
    `  FLAT ${flatCount} POSES: current=${(flatCur / flatCount).toFixed(1)}°  proposed=${(flatNew / flatCount).toFixed(1)}°  calibrated=${(flatCal / flatCount).toFixed(1)}°`,
);

// Tilted breakdown
let tiltedCur = sumCur - flatCur,
    tiltedNew = sumNew - flatNew,
    tiltedCal = sumCal - flatCal;
let tiltedCount = n - flatCount;
console.log(
    `  TILTED ${tiltedCount} POSES: current=${(tiltedCur / tiltedCount).toFixed(1)}°  proposed=${(tiltedNew / tiltedCount).toFixed(1)}°  calibrated=${(tiltedCal / tiltedCount).toFixed(1)}°`,
);

// Count improvements
let propBetter = 0,
    calBetter = 0,
    calBetterThanProp = 0;
for (const dir of poses.directions) {
    for (const pose of dir.poses) {
        if (!pose.captured || !pose.samples || pose.samples.length === 0) continue;
        // recompute (lazy - just trust the sums above logic)
    }
}
// Quick re-loop for counts
for (const dir of poses.directions) {
    for (const pose of dir.poses) {
        if (!pose.captured || !pose.samples || pose.samples.length === 0) continue;
        let curSin = 0,
            curCos = 0,
            newSin = 0,
            newCos = 0,
            calSin = 0,
            calCos = 0;
        for (const s of pose.samples) {
            const rr = s.roll * DEG_TO_RAD,
                pr = s.pitch * DEG_TO_RAD;
            const cl = undoRollPitch(s.mag, rr, pr);
            curSin += Math.sin(Math.atan2(cl[1], cl[0]));
            curCos += Math.cos(Math.atan2(cl[1], cl[0]));
            const nb = mat3mulVec(newCombined, s.mag);
            const nl = undoRollPitch(nb, rr, pr);
            newSin += Math.sin(Math.atan2(nl[1], nl[0]));
            newCos += Math.cos(Math.atan2(nl[1], nl[0]));
            const sm = mat3mulVec(currentInv, s.mag);
            const rc = mat3mulVec(currentInv, [ellipsoid.center.x, ellipsoid.center.y, ellipsoid.center.z]);
            const sc = applyEllipsoidCorrection(sm, {
                center: { x: rc[0], y: rc[1], z: rc[2] },
                W_inv: ellipsoid.W_inv,
            });
            const cb = mat3mulVec(proposedMat, sc);
            const clv = undoRollPitch(cb, rr, pr);
            calSin += Math.sin(Math.atan2(clv[1], clv[0]));
            calCos += Math.cos(Math.atan2(clv[1], clv[0]));
        }
        const e = pose.samples[0].headingRef;
        const ce = hErr(Math.atan2(curSin, curCos) * RAD_TO_DEG, e),
            ne = hErr(Math.atan2(newSin, newCos) * RAD_TO_DEG, e),
            xe = hErr(Math.atan2(calSin, calCos) * RAD_TO_DEG, e);
        if (ne < ce) propBetter++;
        if (xe < ce) calBetter++;
        if (xe < ne) calBetterThanProp++;
    }
}
console.log("");
console.log("=== WINS ===");
console.log(`  Proposed beats current: ${propBetter}/${n} poses`);
console.log(`  Calibrated beats current: ${calBetter}/${n} poses`);
console.log(`  Calibrated beats proposed: ${calBetterThanProp}/${n} poses`);

// Magnitude uniformity
let allRaw = [],
    allCorr = [];
for (const dir of poses.directions)
    for (const pose of dir.poses)
        if (pose.captured && pose.samples)
            for (const s of pose.samples) {
                allRaw.push(Math.hypot(s.mag[0], s.mag[1], s.mag[2]));
                allCorr.push(Math.hypot(...applyEllipsoidCorrection(s.mag, ellipsoid)));
            }
const meanR = allRaw.reduce((a, b) => a + b, 0) / allRaw.length,
    meanC = allCorr.reduce((a, b) => a + b, 0) / allCorr.length;
const stdR = Math.sqrt(allRaw.reduce((s, v) => s + (v - meanR) ** 2, 0) / allRaw.length),
    stdC = Math.sqrt(allCorr.reduce((s, v) => s + (v - meanC) ** 2, 0) / allCorr.length);
console.log("");
console.log("=== |B| UNIFORMITY ===");
console.log(`  Raw |B| CoV: ${((stdR / meanR) * 100).toFixed(1)}%`);
console.log(`  Corrected |B| CoV: ${((stdC / meanC) * 100).toFixed(1)}%`);

// Center ratio diagnostic
const avgH = allRaw.reduce((s, v) => s + v, 0) / allRaw.length;
const centerMag = Math.hypot(ellipsoid.center.x, ellipsoid.center.y, ellipsoid.center.z);
console.log(`  Center/horizontal ratio: ${((centerMag / avgH) * 100).toFixed(0)}%`);
if (centerMag / avgH > 0.15) console.log("  ⚠ Center >15% of avg |B| — calibration shifts heading");
else console.log("  ✓ Center <15% of avg |B| — heading shift is minimal");
