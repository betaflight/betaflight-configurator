/**
 * Regenerate test/fixtures/clean_calibration_model.json from the raw capture
 * fixtures (clean_calibration_tumble.json + clean_calibration_poses.json),
 * running the CURRENT production pipeline:
 *
 *   fitEllipsoid → characterizeAlignment → computeCalFromEllipsoid → computeReplayData
 *
 * Run whenever the pipeline math changes so the model fixture stays consistent
 * with what the wizard would actually export:
 *
 *   node test/js/tools/regen_model_fixture.mjs
 *
 * geo_reference is preserved from the existing fixture (it comes from the
 * WMM lookup at capture time, not from the pipeline).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fitEllipsoid } from "../../../src/js/utils/ellipsoidFit.js";
import { characterizeAlignment, matrixToEuler } from "../../../src/js/utils/magCharacterization.js";
import { eulerToMatrix, mat3mul, mat3transpose, ALIGNMENT_MATRICES } from "../../../src/js/utils/magAlignment.js";
import { computeReplayData, computeCalFromEllipsoid } from "../../../src/js/utils/magCharacterizationCompute.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../../fixtures");

const CAPTURE_ALIGNMENT = 8; // CW270FLIP — alignment active on the FC during capture
const CAPTURE_MAG_ZERO = { x: 0, y: 0, z: 0 }; // mag_calibration during capture

const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf-8"));

const cal = load("clean_calibration_tumble.json");
const poses = load("clean_calibration_poses.json");
const oldModel = load("clean_calibration_model.json");

// ── Pipeline ────────────────────────────────────────────────────────────────

const ellipsoid = fitEllipsoid(cal.samples.map((s) => ({ x: s.x, y: s.y, z: s.z })));
if (!ellipsoid) throw new Error("ellipsoid fit failed");

const allSamples = [];
for (let di = 0; di < poses.directions.length; di++) {
    const dir = poses.directions[di];
    for (let pi = 0; pi < dir.poses.length; pi++) {
        const pose = dir.poses[pi];
        if (pose.samples) {
            for (const sm of pose.samples) allSamples.push({ ...sm, poseKey: `${di}:${pi}` });
        }
    }
}

const solverResult = characterizeAlignment(allSamples, CAPTURE_ALIGNMENT, null, {
    headingMode: "absolute",
    headingWeight: 1.0,
});
if (solverResult.error) throw new Error(`solver failed: ${solverResult.error}`);

let proposedMat;
if (solverResult.alignment === 9 && solverResult.customAngles) {
    const a = solverResult.customAngles;
    proposedMat = eulerToMatrix(a.roll, a.pitch, a.yaw);
} else {
    proposedMat = ALIGNMENT_MATRICES[solverResult.alignment] || ALIGNMENT_MATRICES[1];
}
const currentMat = ALIGNMENT_MATRICES[CAPTURE_ALIGNMENT];
const newCombined = mat3mul(proposedMat, mat3transpose(currentMat));

const calOffsets = computeCalFromEllipsoid(ellipsoid, newCombined, CAPTURE_MAG_ZERO);
const axisGains = { x: 1.0, y: 1.0, z: 1.0 };

const captureData = poses.directions.map((dir) =>
    dir.poses.map((pose) =>
        pose.captured && pose.samples?.length
            ? { headingRef: pose.samples[0]?.headingRef ?? 0, samples: pose.samples }
            : null,
    ),
);
const directions = poses.directions.map((dir) => ({
    label: dir.label,
    heading: 0, // unused: every captured pose carries headingRef
    poses: dir.poses.map((p) => ({ label: p.label, isFlat: p.label.startsWith("Flat") })),
}));

const replay = computeReplayData(solverResult, CAPTURE_ALIGNMENT, captureData, directions, {
    ellipsoidParams: ellipsoid,
    calibrationOffsets: calOffsets,
    axisGains,
    currentMat,
});

// ── Export mapping (mirrors useMagCharacterization.exportCharacterizationData) ──

const normalizeHeading = (deg) => ((deg % 360) + 360) % 360;
const signedHeadingError = (actual, expected) => {
    if (expected === null || expected === undefined) return 0;
    let diff = actual - expected;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return diff;
};
const mapPoseType = (label) => {
    if (label.startsWith("Flat")) return "flat";
    if (label.startsWith("Nose Up")) return "nose_up";
    if (label.startsWith("Nose Down")) return "nose_down";
    if (label.includes("Roll right")) return "left_side";
    if (label.includes("Roll left")) return "right_side";
    if (label.includes("Inverted")) return "inverted";
    return "flat";
};
const getEulerAngles = (sr) => {
    if (sr.alignment === 9 && sr.customAngles) return { ...sr.customAngles };
    if (sr.alignment >= 1 && sr.alignment <= 8) return matrixToEuler(ALIGNMENT_MATRICES[sr.alignment]);
    return { roll: 0, pitch: 0, yaw: 0 };
};

const model = {
    $schema: "https://betaflight.com/blackbox/mag-characterization-model/2.1",
    version: "2.1",
    captured_under: {
        alignment: CAPTURE_ALIGNMENT,
        custom_angles: null,
        mag_zero: CAPTURE_MAG_ZERO,
    },
    ellipsoid_correction: {
        center: { x: ellipsoid.center.x, y: ellipsoid.center.y, z: ellipsoid.center.z },
        soft_iron: ellipsoid.W_inv,
        radius: ellipsoid.radius,
        residual_rms: ellipsoid.residual,
    },
    geo_reference: oldModel.geo_reference,
    alignment: {
        preset: solverResult.alignment,
        label: solverResult.label,
        euler_zyx_deg: getEulerAngles(solverResult),
    },
    axis_gains: axisGains,
    hard_iron: calOffsets,
    quality: {
        score_percent: solverResult.qualityScore,
        residual_z_rms: solverResult.residuals?.zRms ?? 0,
        residual_xy_rms: solverResult.residuals?.xyRms ?? 0,
        field_consistency_pct: solverResult.fieldConsistency?.maxDevPct ?? 0,
        chirality_flag: solverResult.chiralityFlag ?? false,
    },
    poses: replay.map((pose) => ({
        body_orientation: mapPoseType(pose.poseLabel),
        cardinal_direction: pose.dirLabel.charAt(0).toUpperCase(),
        expected_heading_deg: normalizeHeading(pose.expectedHeading),
        measured_attitude_deg: { roll: pose.roll, pitch: pose.pitch },
        heading_current_deg: normalizeHeading(pose.currentHeading),
        heading_error_current_deg: signedHeadingError(pose.currentHeading, pose.expectedHeading),
        heading_corrected_deg: normalizeHeading(pose.newHeading),
        heading_error_corrected_deg: signedHeadingError(pose.newHeading, pose.expectedHeading),
        heading_full_corrected_deg:
            pose.fullCorrectedHeading != null ? normalizeHeading(pose.fullCorrectedHeading) : null,
        heading_error_full_corrected_deg:
            pose.fullCorrectedHeading != null
                ? signedHeadingError(pose.fullCorrectedHeading, pose.expectedHeading)
                : null,
        heading_gain_corrected_deg:
            pose.gainCorrectedHeading != null ? normalizeHeading(pose.gainCorrectedHeading) : null,
        heading_error_gain_corrected_deg:
            pose.gainCorrectedHeading != null
                ? signedHeadingError(pose.gainCorrectedHeading, pose.expectedHeading)
                : null,
        heading_quality_weight: Math.max(
            0,
            Math.min(1, 1.0 - Math.abs(signedHeadingError(pose.newHeading, pose.expectedHeading)) / 30.0),
        ),
    })),
};

const outPath = path.join(FIXTURES, "clean_calibration_model.json");
fs.writeFileSync(outPath, `${JSON.stringify(model, null, 2)}\n`);

console.log(`wrote ${outPath}`);
console.log(`  alignment: ${model.alignment.label} (${JSON.stringify(model.alignment.euler_zyx_deg)})`);
console.log(`  hard_iron: ${JSON.stringify(model.hard_iron)} (proposed-frame, was ${JSON.stringify(oldModel.hard_iron)})`);
const meanErr = (key) =>
    (model.poses.reduce((a, p) => a + Math.abs(p[key] ?? 0), 0) / model.poses.length).toFixed(1);
console.log(`  mean |error|: current=${meanErr("heading_error_current_deg")}°  proposed=${meanErr("heading_error_corrected_deg")}°  full=${meanErr("heading_error_full_corrected_deg")}°`);
