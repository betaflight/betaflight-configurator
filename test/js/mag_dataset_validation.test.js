/**
 * scaling test: every dataset in test/fixtures/datasets/ discovers itself.
 * adding a sensor/drone/site = fixtures + one expected.json, zero test-code changes.
 *
 * canonical pipeline recipe — the production call sequence verbatim (FP0.1):
 * deviating from it is how frame bugs happen.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { fitEllipsoid } from "../../src/js/utils/ellipsoidFit.js";
import { fitSphere, computeDirectionalCoverage } from "../../src/js/utils/sphereFit.js";
import { mat3mul, mat3mulVec, mat3transpose } from "../../src/js/utils/magAlignment.js";
import {
    selectAlignmentPackage,
    currentMatrixOf,
    proposedMatrixOf,
    computeReplayData,
    computeCalFromEllipsoid,
    headingError,
} from "../../src/js/utils/magCharacterizationCompute.js";
import {
    loadFixture,
    captureDataFromPosesExport,
    directionsFromPosesExport,
    flattenSamples,
    rotationDelta,
} from "./test_helpers.js";

const DATASETS_DIR = path.resolve(import.meta.dirname, "../fixtures/datasets");

const dsFiles = fs
    .readdirSync(DATASETS_DIR)
    .filter((f) => f.endsWith(".expected.json"))
    .map((f) => {
        const raw = JSON.parse(fs.readFileSync(path.join(DATASETS_DIR, f), "utf-8"));
        return { file: f, data: raw };
    });

for (const { data: ds } of dsFiles) {
    describe(ds.name, () => {
        let tumble, poses, samples, captureData, directions, points, ellipsoid, currentMat;
        let result, usedCalibratedPackage, validation;
        let proposedMat, newCombined, magZero, cal, rows, currentErr;

        beforeAll(() => {
            tumble = loadFixture(ds.fixtures.tumble);
            poses = loadFixture(ds.fixtures.poses);

            samples = flattenSamples(poses);
            captureData = captureDataFromPosesExport(poses);
            directions = directionsFromPosesExport(poses);
            points = tumble.samples.map((s) => ({ x: s.x, y: s.y, z: s.z }));
            ellipsoid = fitEllipsoid(points);
            currentMat = currentMatrixOf(ds.capture.alignment, ds.capture.custom_angles);

            const pkg = selectAlignmentPackage({
                samples,
                captureData,
                directions,
                currentAlignment: ds.capture.alignment,
                customAngles: ds.capture.custom_angles || null,
                currentMat,
                ellipsoidParams: ellipsoid,
            });
            result = pkg.result;
            usedCalibratedPackage = pkg.usedCalibratedPackage;
            validation = pkg.validation;

            proposedMat = proposedMatrixOf(result, currentMat);
            newCombined = mat3mul(proposedMat, mat3transpose(currentMat));
            magZero = poses.metadata.magZeroAtCapture ?? { x: 0, y: 0, z: 0 };
            cal = computeCalFromEllipsoid(ellipsoid, newCombined, magZero);
            rows = computeReplayData(result, ds.capture.alignment, captureData, directions, {
                ellipsoidParams: ellipsoid,
                currentMat,
                proposedIncludesCenter: usedCalibratedPackage,
            });
            currentErr = rows.reduce((s, r) => s + headingError(r.currentHeading, r.expectedHeading), 0) / rows.length;
        }, 120_000);

        // --- fixture/config consistency guard ---
        it("fixtures match the expected capture config", () => {
            expect(poses.metadata.currentAlignment).toBe(ds.capture.alignment);
            expect(poses.metadata.customAngles || null).toEqual(ds.capture.custom_angles || null);
        });

        // --- universal assertions (every class) ---
        it("ellipsoid fit succeeds", () => {
            expect(ellipsoid).not.toBeNull();
            expect(ellipsoid.residual).toBeLessThan(ds.expected.ellipsoid_residual_max);
        });

        it("tumble coverage meets target", () => {
            const sphere = fitSphere(points);
            expect(sphere).not.toBeNull();
            const cov = computeDirectionalCoverage(points, sphere.center);
            expect(cov.fraction).toBeGreaterThanOrEqual(ds.expected.coverage_min);
        });

        it("solver returns valid result", () => {
            expect(result.error).toBeFalsy();
            expect(result.qualityScore).toBeGreaterThanOrEqual(ds.expected.quality_min);
        });

        it("determinism: same inputs produce same result", () => {
            const pkg2 = selectAlignmentPackage({
                samples,
                captureData,
                directions,
                currentAlignment: ds.capture.alignment,
                customAngles: ds.capture.custom_angles || null,
                currentMat,
                ellipsoidParams: ellipsoid,
            });
            expect(pkg2.result.alignment).toBe(result.alignment);
            expect(pkg2.usedCalibratedPackage).toBe(usedCalibratedPackage);
            if (result.customAngles) {
                expect(pkg2.result.customAngles).not.toBeNull();
                expect(Math.abs(pkg2.result.customAngles.roll - result.customAngles.roll)).toBeLessThan(0.1);
                expect(Math.abs(pkg2.result.customAngles.pitch - result.customAngles.pitch)).toBeLessThan(0.1);
                expect(Math.abs(pkg2.result.customAngles.yaw - result.customAngles.yaw)).toBeLessThan(0.1);
            }
        });

        // F2 round-trip: newCombined^T * cal ~= center + magZero (frame-algebra identity)
        // +-2 counts because cal is integer-rounded
        it("offsets round-trip to ellipsoid center + magZero (F2 frame algebra)", () => {
            const back = mat3mulVec(mat3transpose(newCombined), [cal.x, cal.y, cal.z]);
            expect(Math.abs(back[0] - (ellipsoid.center.x + magZero.x))).toBeLessThan(2);
            expect(Math.abs(back[1] - (ellipsoid.center.y + magZero.y))).toBeLessThan(2);
            expect(Math.abs(back[2] - (ellipsoid.center.z + magZero.z))).toBeLessThan(2);
        });

        // --- baseline-class assertions ---
        if (ds.class === "baseline") {
            it("current heading error is above minimum (baseline must be measurably wrong)", () => {
                expect(currentErr).toBeGreaterThanOrEqual(ds.expected.current_error_min_deg);
            });

            it("package error is below maximum", () => {
                expect(validation).not.toBeNull();
                expect(validation.fullCorrectedMeanErr).toBeLessThanOrEqual(ds.expected.package_error_max_deg);
            });

            it("package improves over current (F10: corrected < raw)", () => {
                expect(validation.fullCorrectedMeanErr).toBeLessThan(currentErr);
            });

            it("package wins when expected", () => {
                if (ds.expected.package_wins) {
                    expect(usedCalibratedPackage).toBe(true);
                }
            });

            it("center ratio within expected range", () => {
                const H_vals = samples.map((s) => Math.hypot(s.mag[0], s.mag[1]));
                const avgH = H_vals.reduce((a, b) => a + b, 0) / H_vals.length;
                const c = ellipsoid.center;
                const ratio = Math.hypot(c.x, c.y, c.z) / avgH;
                expect(ratio).toBeGreaterThanOrEqual(ds.expected.center_ratio_range[0]);
                expect(ratio).toBeLessThanOrEqual(ds.expected.center_ratio_range[1]);
            });

            it("solved angles within expected ranges", () => {
                expect(result.alignment).toBe(9);
                expect(result.customAngles).not.toBeNull();
                const ar = ds.expected.angle_ranges;
                expect(Math.abs(result.customAngles.roll)).toBeGreaterThanOrEqual(ar.roll_abs[0]);
                expect(Math.abs(result.customAngles.roll)).toBeLessThanOrEqual(ar.roll_abs[1]);
                expect(result.customAngles.pitch).toBeGreaterThanOrEqual(ar.pitch[0]);
                expect(result.customAngles.pitch).toBeLessThanOrEqual(ar.pitch[1]);
                expect(result.customAngles.yaw).toBeGreaterThanOrEqual(ar.yaw[0]);
                expect(result.customAngles.yaw).toBeLessThanOrEqual(ar.yaw[1]);
            });
        }

        // --- applied-class assertions ---
        if (ds.class === "applied") {
            it("current heading error is below maximum (calibration working in-hardware)", () => {
                expect(currentErr).toBeLessThanOrEqual(ds.expected.current_error_max_deg);
            });

            it("residual hard iron center is small (firmware removed the bias)", () => {
                const c = ellipsoid.center;
                expect(Math.hypot(c.x, c.y, c.z)).toBeLessThanOrEqual(ds.expected.residual_center_max_counts);
            });

            it("proposal does not drift from the applied config", () => {
                expect(rotationDelta(proposedMat, currentMat)).toBeLessThanOrEqual(ds.expected.rotation_delta_max_deg);
            });

            it("composed proposal stays close to the captured magZero (idempotence)", () => {
                expect(Math.abs(cal.x - magZero.x)).toBeLessThanOrEqual(ds.expected.proposal_composes_max_counts);
                expect(Math.abs(cal.y - magZero.y)).toBeLessThanOrEqual(ds.expected.proposal_composes_max_counts);
                expect(Math.abs(cal.z - magZero.z)).toBeLessThanOrEqual(ds.expected.proposal_composes_max_counts);
            });

            it("magZero provenance is known (F12 fix)", () => {
                expect(poses.metadata.magZeroKnown).toBe(true);
            });
        }
    });
}
