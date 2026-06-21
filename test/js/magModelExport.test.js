/**
 * Synthetic oracle tests for buildCharacterizationModel.
 *
 * All inputs are planted — no fixtures, no Math.random.
 * Verifies: schema version, downstream_fusion presence and scaling, the quality
 * bounds, and round-trip serialization.
 */
import { describe, expect, it } from "vitest";
import {
    buildCharacterizationModel,
    computeDownstreamFusion,
    computeMagQualityBounds,
    MODEL_SCHEMA_VERSION,
    MODEL_SCHEMA_URL,
} from "../../src/js/utils/magModelExport.js";

// ── Synthetic inputs ────────────────────────────────────────────────────────

const MOCK_SOLVER_RESULT = {
    preset: 8, // CW270FLIP
    label: "CW270FLIP",
    euler_zyx_deg: { roll: 180, pitch: 0, yaw: 270 },
    quality: {
        meanResidualDeg: 1.8,
        sampleCount: 250,
        frobNorm: 0.04,
        cost: 0.021,
    },
};

const MOCK_ELLIPSOID = {
    center: { x: -62, y: -494, z: -73 },
    W_inv: [
        [6.108e-4, 2.1e-5, 0],
        [0, 6.125e-4, 0],
        [0, 0, 6.214e-4],
    ],
    radius: 1538,
    residual: 0.012,
};

const MOCK_GEO = {
    declination: -15.36,
    inclination: 70.89,
    fieldStrength: 53998,
};

const MOCK_CAPTURED_UNDER = {
    alignment: 8,
    custom_angles: null,
    mag_zero: { x: 0, y: 0, z: 0 },
    mag_zero_known: true,
};

const MOCK_OFFSETS = { x: -60, y: -490, z: -75 };

function buildModel(overrides = {}) {
    return buildCharacterizationModel({
        solverResult: MOCK_SOLVER_RESULT,
        capturedUnder: MOCK_CAPTURED_UNDER,
        ellipsoidParams: MOCK_ELLIPSOID,
        calibrationOffsets: MOCK_OFFSETS,
        geoReference: MOCK_GEO,
        gpsFix: false,
        gpsLat: 0,
        gpsLon: 0,
        qualityAssessment: null,
        ...overrides,
    });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("buildCharacterizationModel — schema 2.2", () => {
    it('emits version "2.2" and the correct $schema URL', () => {
        const model = buildModel();
        expect(model.version).toBe(MODEL_SCHEMA_VERSION);
        expect(model.version).toBe("2.2");
        expect(model.$schema).toBe(MODEL_SCHEMA_URL);
        expect(model.$schema).toContain("2.2");
    });

    it("has downstream_fusion with all required keys and correct frame", () => {
        const model = buildModel();
        const df = model.downstream_fusion;
        expect(df).toBeDefined();
        expect(df.frame).toBe("FRD");
        expect(df).toHaveProperty("nt_per_corrected_unit");
        expect(df).toHaveProperty("gauss_per_corrected_unit");
        expect(df).toHaveProperty("earth_field_ned_gauss");
        expect(df).toHaveProperty("mag_noise_gauss");
        expect(df).toHaveProperty("quality_bounds");
    });

    it("downstream_fusion ADC-to-field scaling: gauss_per_unit = fieldNt / (radius * 1e5)", () => {
        const model = buildModel();
        const df = model.downstream_fusion;
        const expectedNtPerUnit = MOCK_GEO.fieldStrength / MOCK_ELLIPSOID.radius;
        const expectedGaussPerUnit = expectedNtPerUnit / 1e5;
        expect(df.nt_per_corrected_unit).toBeCloseTo(expectedNtPerUnit, 3);
        expect(df.gauss_per_corrected_unit).toBeCloseTo(expectedGaussPerUnit, 9);
    });

    it("downstream_fusion earth_field_ned_gauss magnitude equals fieldStrength/1e5", () => {
        const model = buildModel();
        const { n, e, d } = model.downstream_fusion.earth_field_ned_gauss;
        expect(Math.hypot(n, e, d)).toBeCloseTo(MOCK_GEO.fieldStrength / 1e5, 4);
    });

    it("round-trips through JSON.parse without data loss", () => {
        const model = buildModel();
        const str = JSON.stringify(model, null, 2);
        const reparsed = JSON.parse(str);

        expect(reparsed.version).toBe("2.2");
        expect(reparsed.$schema).toBe(MODEL_SCHEMA_URL);
        expect(reparsed.alignment.preset).toBe(MOCK_SOLVER_RESULT.preset);
        expect(reparsed.ellipsoid_correction.center.x).toBe(MOCK_ELLIPSOID.center.x);
        expect(reparsed.hard_iron.x).toBe(MOCK_OFFSETS.x);

        // Serialization is deterministic
        expect(JSON.stringify(reparsed)).toBe(JSON.stringify(JSON.parse(str)));
    });

    it("quality block emits meanResidualDeg from solver result", () => {
        const model = buildModel();
        expect(model.quality.mean_residual_deg).toBeCloseTo(MOCK_SOLVER_RESULT.quality.meanResidualDeg, 5);
    });
});

describe("computeDownstreamFusion — null-safety", () => {
    it("returns all-null values gracefully when inputs are null", () => {
        const df = computeDownstreamFusion(null, null, null);
        expect(df.frame).toBe("FRD");
        expect(df.nt_per_corrected_unit).toBeNull();
        expect(df.gauss_per_corrected_unit).toBeNull();
        expect(df.earth_field_ned_gauss).toBeNull();
        expect(df.mag_noise_gauss.sigma).toBeNull();
        expect(df.quality_bounds.bounds_ok).toBe(false);
    });
});

describe("buildCharacterizationModel — null geoReference", () => {
    it("emits null geo_reference fields and a populated downstream_fusion when geoReference is null", () => {
        const model = buildModel({ geoReference: null });
        expect(model.geo_reference.declination_deg).toBeNull();
        expect(model.geo_reference.inclination_deg).toBeNull();
        expect(model.geo_reference.field_strength_nt).toBeNull();
        // downstream_fusion should still be present (computeDownstreamFusion is null-safe)
        expect(model.downstream_fusion).toBeDefined();
        expect(model.downstream_fusion.frame).toBe("FRD");
        expect(model.downstream_fusion.nt_per_corrected_unit).toBeNull();
        expect(model.downstream_fusion.earth_field_ned_gauss).toBeNull();
    });
});

describe("computeMagQualityBounds", () => {
    it("flags out-of-range field strength (too low)", () => {
        const q = computeMagQualityBounds(
            [
                [1, 0, 0],
                [0, 1, 0],
                [0, 0, 1],
            ],
            5000,
        );
        expect(q.field_strength_ok).toBe(false);
    });

    it("accepts typical field strength and near-isotropic soft iron", () => {
        const q = computeMagQualityBounds(MOCK_ELLIPSOID.W_inv, MOCK_GEO.fieldStrength);
        expect(q.field_strength_ok).toBe(true);
        expect(q.soft_iron_anisotropy_ok).toBe(true);
        expect(q.bounds_ok).toBe(true);
    });

    it("rejects a degenerate anisotropic soft iron", () => {
        const degenerate = [
            [5, 0, 0],
            [0, 0.1, 0],
            [0, 0, 1],
        ];
        const q = computeMagQualityBounds(degenerate, 53000);
        expect(q.soft_iron_anisotropy_ok).toBe(false);
        expect(q.bounds_ok).toBe(false);
    });
});
