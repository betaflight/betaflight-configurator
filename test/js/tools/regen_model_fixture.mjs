/**
 * Regenerate test/fixtures/clean_calibration_model.json from the raw capture
 * fixtures (clean_calibration_tumble.json + clean_calibration_poses.json),
 * running the CURRENT production pipeline via the same shared functions the
 * wizard uses (selectAlignmentPackage → computeCalFromEllipsoid →
 * computeReplayData → buildCharacterizationModel).
 *
 * Run whenever the pipeline math changes so the model fixture stays
 * consistent with what the wizard would actually export:
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
import { mat3mul, mat3transpose } from "../../../src/js/utils/magAlignment.js";
import {
    selectAlignmentPackage,
    currentMatrixOf,
    proposedMatrixOf,
    computeCalFromEllipsoid,
    computeReplayData,
} from "../../../src/js/utils/magCharacterizationCompute.js";
import { buildCharacterizationModel } from "../../../src/js/utils/magModelExport.js";
import { flattenSamples, captureDataFromPosesExport, directionsFromPosesExport } from "../test_helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../../fixtures");

const CAPTURE_ALIGNMENT = 8; // CW270FLIP — alignment active on the FC during capture
const CAPTURE_MAG_ZERO = { x: 0, y: 0, z: 0 }; // mag_calibration during capture

const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf-8"));

const cal = load("clean_calibration_tumble.json");
const poses = load("clean_calibration_poses.json");
const oldModel = load("clean_calibration_model.json");

// ── Pipeline (identical to runSolver) ───────────────────────────────────────

const ellipsoid = fitEllipsoid(cal.samples.map((s) => ({ x: s.x, y: s.y, z: s.z })));
if (!ellipsoid) throw new Error("ellipsoid fit failed");

const captureData = captureDataFromPosesExport(poses);
const directions = directionsFromPosesExport(poses);
const currentMat = currentMatrixOf(CAPTURE_ALIGNMENT, null);

const { result, usedCalibratedPackage, validation } = selectAlignmentPackage({
    samples: flattenSamples(poses),
    captureData,
    directions,
    currentAlignment: CAPTURE_ALIGNMENT,
    customAngles: null,
    currentMat,
    ellipsoidParams: ellipsoid,
});
if (result.error) throw new Error(`solver failed: ${result.error}`);
console.log(
    `package selection: calibrated ${validation?.fullCorrectedMeanErr.toFixed(1)}° vs ` +
        `alignment-only ${validation?.proposedMeanErr.toFixed(1)}° → ` +
        (usedCalibratedPackage ? "CALIBRATED PACKAGE" : "ALIGNMENT-ONLY"),
);

const newCombined = mat3mul(proposedMatrixOf(result, currentMat), mat3transpose(currentMat));
const calOffsets = computeCalFromEllipsoid(ellipsoid, newCombined, CAPTURE_MAG_ZERO);

const replay = computeReplayData(result, CAPTURE_ALIGNMENT, captureData, directions, {
    ellipsoidParams: ellipsoid,
    calibrationOffsets: calOffsets,
    currentMat,
    proposedIncludesCenter: usedCalibratedPackage,
});

const model = buildCharacterizationModel({
    solverResult: result,
    replayData: replay,
    capturedUnder: {
        alignment: CAPTURE_ALIGNMENT,
        custom_angles: null,
        mag_zero: CAPTURE_MAG_ZERO,
        mag_zero_known: true,
    },
    ellipsoidParams: ellipsoid,
    calibrationOffsets: calOffsets,
    geoReference: {
        declination: oldModel.geo_reference.declination_deg,
        inclination: oldModel.geo_reference.inclination_deg,
        fieldStrength: oldModel.geo_reference.field_strength_nt,
    },
    gpsFix: false,
    gpsLat: 0,
    gpsLon: 0,
});

const outPath = path.join(FIXTURES, "clean_calibration_model.json");
fs.writeFileSync(outPath, `${JSON.stringify(model, null, 2)}\n`);

console.log(`wrote ${outPath}`);
console.log(`  alignment: ${model.alignment.label} (${JSON.stringify(model.alignment.euler_zyx_deg)})`);
console.log(`  hard_iron: ${JSON.stringify(model.hard_iron)} (proposed-frame)`);
const meanErr = (key) => (model.poses.reduce((a, p) => a + Math.abs(p[key] ?? 0), 0) / model.poses.length).toFixed(1);
console.log(
    `  mean |error|: current=${meanErr("heading_error_current_deg")}°  proposed=${meanErr("heading_error_corrected_deg")}°  full=${meanErr("heading_error_full_corrected_deg")}°`,
);
