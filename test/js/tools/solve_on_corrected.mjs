/**
 * Experiment: does solving alignment on bias-CORRECTED samples recover the
 * true geometric rotation (instead of a rotation entangled with hard iron)?
 *
 *   node test/js/tools/solve_on_corrected.mjs <dir> [captureAlignment]
 *
 * Solves three ways: raw (current production), center-subtracted, and fully
 * ellipsoid-corrected; prints the proposed angles and the resulting
 * comparison-matrix row for each.
 */
import fs from "node:fs";
import path from "node:path";

import { fitEllipsoid } from "../../../src/js/utils/ellipsoidFit.js";
import { characterizeAlignment } from "../../../src/js/utils/magCharacterization.js";
import {
    eulerToMatrix,
    mat3mul,
    mat3mulVec,
    mat3transpose,
    undoRollPitch,
    ALIGNMENT_MATRICES,
} from "../../../src/js/utils/magAlignment.js";
import { headingError } from "../../../src/js/utils/magCharacterizationCompute.js";

const DEGR = 180 / Math.PI;
const dir = process.argv[2];
const CUR = Number(process.argv[3] ?? 8);

const findFile = (...prefixes) => {
    const f = fs.readdirSync(dir).find((n) => prefixes.some((p) => n.startsWith(p)) && n.endsWith(".json"));
    if (!f) throw new Error(`no ${prefixes.join("|")}*.json in ${dir}`);
    return JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
};
const cal = findFile("calibration_samples", "clean_calibration_tumble");
const poses = findFile("characterization_poses", "clean_calibration_poses");

const ellipsoid = fitEllipsoid(cal.samples.map((s) => ({ x: s.x, y: s.y, z: s.z })));
const c = ellipsoid.center;
const W = ellipsoid.W_inv;

const correctCenter = (m) => [m[0] - c.x, m[1] - c.y, m[2] - c.z];
const correctFull = (m) => {
    const d = correctCenter(m);
    return [
        W[0][0] * d[0] + W[0][1] * d[1] + W[0][2] * d[2],
        W[1][0] * d[0] + W[1][1] * d[1] + W[1][2] * d[2],
        W[2][0] * d[0] + W[2][1] * d[1] + W[2][2] * d[2],
    ];
};

function buildSamples(transform) {
    const out = [];
    for (let di = 0; di < poses.directions.length; di++) {
        const d = poses.directions[di];
        for (let pi = 0; pi < d.poses.length; pi++) {
            const p = d.poses[pi];
            if (!p.samples) continue;
            for (const sm of p.samples) {
                out.push({ ...sm, mag: transform ? transform(sm.mag) : sm.mag, poseKey: `${di}:${pi}` });
            }
        }
    }
    return out;
}

// Mean per-pose heading error for a given proposal matrix and sample transform
function meanError(proposedMat, transform) {
    const newCombined = mat3mul(proposedMat, mat3transpose(ALIGNMENT_MATRICES[CUR]));
    let eSum = 0;
    let n = 0;
    for (const d of poses.directions) {
        for (const p of d.poses) {
            if (!p.captured || !p.samples?.length) continue;
            let s = 0;
            let co = 0;
            for (const sm of p.samples) {
                const m = transform ? transform(sm.mag) : sm.mag;
                const body = mat3mulVec(newCombined, m);
                const lv = undoRollPitch(body, (sm.roll * Math.PI) / 180, (sm.pitch * Math.PI) / 180);
                const h = Math.atan2(lv[1], lv[0]);
                s += Math.sin(h);
                co += Math.cos(h);
            }
            eSum += headingError(Math.atan2(s, co) * DEGR, p.samples[0].headingRef);
            n++;
        }
    }
    return eSum / n;
}

function report(label, transform) {
    const solver = characterizeAlignment(buildSamples(transform), CUR, null, {
        headingMode: "absolute",
        headingWeight: 1.0,
    });
    let proposedMat;
    let angles = "";
    if (solver.alignment === 9 && solver.customAngles) {
        const a = solver.customAngles;
        proposedMat = eulerToMatrix(a.roll, a.pitch, a.yaw);
        angles = `CUSTOM (${a.roll.toFixed(0)}, ${a.pitch.toFixed(0)}, ${a.yaw.toFixed(0)})`;
    } else {
        proposedMat = ALIGNMENT_MATRICES[solver.alignment];
        angles = solver.label;
    }
    // Error of this proposal evaluated on the SAME data it was solved on,
    // and on raw data (what firmware sees before mag_calibration kicks in)
    const errOnSolved = meanError(proposedMat, transform);
    console.log(
        `${label.padEnd(22)} → ${angles.padEnd(22)} quality ${String(solver.qualityScore).padStart(3)}%  ` +
            `meanErr(on its data) ${errOnSolved.toFixed(1)}°`,
    );
    return { proposedMat, solver };
}

console.log(`ellipsoid center (${c.x.toFixed(0)}, ${c.y.toFixed(0)}, ${c.z.toFixed(0)})\n`);
report("solve on RAW", null);
report("solve on −center", correctCenter);
report("solve on W_inv·(−ctr)", correctFull);

// Reference: how good is keeping the CURRENT alignment with center subtraction?
console.log(
    `\nreference: CURRENT alignment, −center data → meanErr ${meanError(ALIGNMENT_MATRICES[CUR], correctCenter).toFixed(1)}°`,
);
