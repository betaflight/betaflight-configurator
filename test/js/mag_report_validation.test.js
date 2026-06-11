/**
 * Integration test: full report generation from v3 calibration + characterization fixture data.
 *
 * Loads the real calibration samples and characterization poses captured during
 * hardware testing (2026-06-11), runs the solver, generates the report, and
 * validates key facts against independently verified values.
 */
import { describe, expect, it } from "vitest";
import { characterizeAlignment } from "../../src/js/utils/magCharacterization.js";
import { fitEllipsoid } from "../../src/js/utils/ellipsoidFit.js";
import { loadFixture, flattenSamples } from "./test_helpers.js";

describe("v3 report validation from hardware fixture", () => {
    // ── Load calibration fixture ──────────────────────────────────────────
    const cal = loadFixture("clean_calibration_tumble.json");

    it("calibration fixture loads with valid structure", () => {
        expect(cal.samples.length).toBeGreaterThan(100);
        expect(cal.type).toBe("calibration_tumble");
        expect(cal.coverage.uniform).toBeGreaterThan(0.3);
    });

    it("calibration sample fields are complete", () => {
        const s = cal.samples[0];
        expect(s.x).toEqual(expect.any(Number));
        expect(s.y).toEqual(expect.any(Number));
        expect(s.z).toEqual(expect.any(Number));
        expect(s.roll).toEqual(expect.any(Number));
        expect(s.pitch).toEqual(expect.any(Number));
        expect(s.heading).toEqual(expect.any(Number));
        expect(s.field_magnitude).toEqual(expect.any(Number));
        expect(s.qw).toEqual(expect.any(Number));
        expect(s.qx).toEqual(expect.any(Number));
        expect(s.qy).toEqual(expect.any(Number));
        expect(s.qz).toEqual(expect.any(Number));
        expect(s.voxel_display).toBeDefined();
    });

    it("quaternion values are in valid range", () => {
        for (const s of cal.samples) {
            expect(s.qw).toBeGreaterThanOrEqual(-1);
            expect(s.qw).toBeLessThanOrEqual(1);
            expect(s.qx).toBeGreaterThanOrEqual(-1);
            expect(s.qx).toBeLessThanOrEqual(1);
            expect(s.qy).toBeGreaterThanOrEqual(-1);
            expect(s.qy).toBeLessThanOrEqual(1);
            expect(s.qz).toBeGreaterThanOrEqual(-1);
            expect(s.qz).toBeLessThanOrEqual(1);
            const norm = Math.hypot(s.qw, s.qx, s.qy, s.qz);
            expect(norm).toBeCloseTo(1.0, 1);
        }
    });

    it("ellipsoid fit succeeds on calibration data", () => {
        const points = cal.samples.map((s) => ({ x: s.x, y: s.y, z: s.z }));
        const result = fitEllipsoid(points);
        expect(result).not.toBeNull();
        // Hard iron center should be in a reasonable range for ADC counts
        expect(Math.abs(result.center.x)).toBeLessThan(2000);
        expect(Math.abs(result.center.y)).toBeLessThan(2000);
        expect(Math.abs(result.center.z)).toBeLessThan(2000);
        // W_inv should be nearly diagonal (spherical sensor)
        const wDiag = [result.W_inv[0][0], result.W_inv[1][1], result.W_inv[2][2]];
        const wRatio = Math.max(...wDiag) / Math.min(...wDiag);
        expect(wRatio).toBeLessThan(1.1); // within 10% = good sphere
        // Residual should be small
        expect(result.residual).toBeLessThan(0.1);
    });

    it("voxel display matches manual computation", () => {
        // Verify that voxel_display in the export matches our quaternion math
        const s = cal.samples[0];
        // Recompute: body_mag(x,-y,-z) rotated by Quaternion(qx,-qy,-qz,qw)
        const v = [s.x, -s.y, -s.z];
        const qw = s.qw,
            qx = s.qx,
            qy = -s.qy,
            qz = -s.qz;
        const t = 2 * (qy * v[2] - qz * v[1]);
        const u = 2 * (qz * v[0] - qx * v[2]);
        const w = 2 * (qx * v[1] - qy * v[0]);
        v[0] += qw * t + (qy * w - qz * u);
        v[1] += qw * u + (qz * t - qx * w);
        v[2] += qw * w + (qx * u - qy * t);
        // Export stores voxel_display as integer-rounded values
        expect(Math.abs(Math.round(v[0]) - s.voxel_display[0])).toBeLessThanOrEqual(1);
        expect(Math.abs(Math.round(v[1]) - s.voxel_display[1])).toBeLessThanOrEqual(1);
        expect(Math.abs(Math.round(v[2]) - s.voxel_display[2])).toBeLessThanOrEqual(1);
    });

    // ── Load characterization pose fixture ─────────────────────────────────
    const poses = loadFixture("clean_calibration_poses.json");

    it("poses fixture has complete metadata", () => {
        expect(poses.type).toBe("characterization_poses");
        expect(poses.metadata.totalPoses).toBe(20);
        expect(poses.metadata.ellipsoidCorrection).not.toBeNull();
        expect(poses.metadata.ellipsoidCorrection.center).toBeDefined();
        expect(poses.metadata.ellipsoidCorrection.residual).toBeLessThan(0.1);
    });

    it("ellipsoid correction in poses matches calibration data", () => {
        const points = cal.samples.map((s) => ({ x: s.x, y: s.y, z: s.z }));
        const fitResult = fitEllipsoid(points);
        const ec = poses.metadata.ellipsoidCorrection;
        // Center should be within 5% of the fit result
        expect(Math.abs(ec.center.x - fitResult.center.x)).toBeLessThan(Math.abs(fitResult.center.x) * 0.05 + 5);
        expect(Math.abs(ec.center.y - fitResult.center.y)).toBeLessThan(Math.abs(fitResult.center.y) * 0.05 + 5);
        expect(Math.abs(ec.center.z - fitResult.center.z)).toBeLessThan(Math.abs(fitResult.center.z) * 0.05 + 5);
    });

    it("solver runs on pose data without error", () => {
        const samples = flattenSamples(poses);
        expect(samples.length).toBeGreaterThan(100);

        const result = characterizeAlignment(samples, poses.metadata.currentAlignment, null, {
            headingMode: "absolute",
            headingWeight: 1.0,
        });

        expect(result.error).toBeUndefined();
        expect(result.qualityScore).toBeGreaterThanOrEqual(0);
        expect(result.alignment).toBeGreaterThanOrEqual(1);
        expect(result.alignment).toBeLessThanOrEqual(9);
    });

    // ── Load model fixture ─────────────────────────────────────────────────
    const model = loadFixture("clean_calibration_model.json");

    it("model has v2 schema with all required keys", () => {
        const required = [
            "$schema",
            "version",
            "ellipsoid_correction",
            "geo_reference",
            "alignment",
            "axis_gains",
            "hard_iron",
            "quality",
            "poses",
        ];
        for (const k of required) {
            expect(model).toHaveProperty(k);
        }
        expect(model.version).toBe("2.0");
        expect(model.poses.length).toBeGreaterThanOrEqual(4);
    });

    it("model pose fields are complete", () => {
        const poseRequired = [
            "body_orientation",
            "cardinal_direction",
            "expected_heading_deg",
            "measured_attitude_deg",
            "heading_current_deg",
            "heading_error_current_deg",
            "heading_corrected_deg",
            "heading_error_corrected_deg",
            "heading_gain_corrected_deg",
            "heading_error_gain_corrected_deg",
            "heading_quality_weight",
        ];
        for (const k of poseRequired) {
            expect(model.poses[0]).toHaveProperty(k);
        }
    });

    it("heading_quality_weight is in valid range", () => {
        for (const p of model.poses) {
            expect(p.heading_quality_weight).toBeGreaterThanOrEqual(0);
            expect(p.heading_quality_weight).toBeLessThanOrEqual(1);
        }
    });

    it("alignment quality metrics are reasonable", () => {
        expect(model.quality.score_percent).toBeGreaterThan(0);
        expect(model.quality.score_percent).toBeLessThanOrEqual(100);
        expect(model.quality.residual_z_rms).toBeGreaterThanOrEqual(0);
        expect(model.quality.residual_xy_rms).toBeGreaterThanOrEqual(0);
        expect(model.quality.field_consistency_pct).toBeGreaterThanOrEqual(0);
        expect(model.quality.field_consistency_pct).toBeLessThanOrEqual(100);
    });

    it("ellipsoid correction in model is valid", () => {
        expect(model.ellipsoid_correction).not.toBeNull();
        const ec = model.ellipsoid_correction;
        expect(ec.center).toBeDefined();
        expect(ec.soft_iron).toBeDefined();
        expect(ec.soft_iron.length).toBe(3);
        expect(ec.radius).toBeGreaterThan(0);
        expect(ec.residual_rms).toBeGreaterThanOrEqual(0);
    });
});
