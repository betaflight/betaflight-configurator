/**
 * Magnetometer characterization model loader.
 *
 * Loads and validates models from the Betaflight Configurator mag characterization
 * wizard. Supports schema versions 2.0, 2.1, and 2.2.
 *
 * Schema 2.2 adds a `downstream_fusion` block containing quantities needed for
 * 3-axis magnetometer fusion: the earth field vector in Gauss, the ADC-to-Gauss
 * scale factor, a noise model derived from the fit residuals, and quality bounds.
 * When loading an older (2.0/2.1) model these are computed from the existing fields.
 */

import { eulerToMatrix, ALIGNMENT_MATRICES } from "../../js/utils/magAlignment.js";
// The one deliberate exception to this directory's self-containment: a pure,
// dependency-free math function with no ties to app state, MSP, or the DOM,
// shared with the live tumble-calibration wizard (src/js/utils/magModelExport.js)
// so both calibration paths enforce the same acceptance thresholds.
import { computeMagQualityBounds } from "../../js/utils/magQualityBounds.js";

export { computeMagQualityBounds };

const SUPPORTED_VERSIONS = ["2.0", "2.1", "2.2"];

/**
 * Build the fusion block for 3-axis magnetometer estimation.
 *
 * When the JSON includes a `downstream_fusion` block (schema 2.2) it is used
 * directly. For older models (2.0/2.1) all values are computed from the existing
 * ellipsoid, geo-reference, and quality fields.
 *
 * @param {object|null} ellipsoid - { center, soft_iron (W_inv), radius, residual_rms }
 * @param {object|null} geoRef - { declination_deg, inclination_deg, field_strength_nt }
 * @param {object|null} quality - { residual_xy_rms, residual_z_rms } (or null)
 * @param {object|null} existingFusion - existing downstream_fusion block from JSON (may be null)
 * @returns {object}
 */
function buildFusionBlock(ellipsoid, geoRef, quality, existingFusion) {
    if (existingFusion) {
        // Schema 2.2 embeds downstream_fusion from the configurator. The configurator
        // computes mag_noise_gauss by multiplying the normalized quality residuals
        // (dimensionless fractions) by gauss_per_corrected_unit — the result IS the
        // correct per-axis noise fingerprint in physical Gauss.
        // E.g.: residual_xy_rms=0.063 (6.3% fraction) × gpu=0.539 G → sigma_xy=0.034 G.
        // Do NOT override with the raw quality fractions (1.86× too large — under-trusts mag).
        return existingFusion;
    }

    const fieldNt = geoRef?.field_strength_nt ?? null;
    const radius = ellipsoid?.radius ?? null;
    const softIron = ellipsoid?.soft_iron ?? null;
    const epResidual = ellipsoid?.residual_rms ?? null;

    let ntPerUnit = null;
    let gaussPerUnit = null;
    if (fieldNt != null && radius != null && Math.abs(radius) > 1e-9) {
        ntPerUnit = fieldNt / radius;
        gaussPerUnit = ntPerUnit / 1e5;
    }

    let earthFieldNedGauss = null;
    if (fieldNt != null && geoRef?.inclination_deg != null && geoRef?.declination_deg != null) {
        const incl = (geoRef.inclination_deg * Math.PI) / 180;
        const decl = (geoRef.declination_deg * Math.PI) / 180;
        const bTotalG = fieldNt / 1e5;
        const bH = bTotalG * Math.cos(incl);
        earthFieldNedGauss = {
            n: bH * Math.cos(decl),
            e: bH * Math.sin(decl),
            d: bTotalG * Math.sin(incl),
        };
    }

    // Ellipsoid residual_rms is NORMALIZED (unit-sphere) — scale to Gauss.
    const scaleNoise = (r) => (r != null && gaussPerUnit != null ? Math.abs(r) * gaussPerUnit : null);

    // Quality residuals (residual_xy_rms, residual_z_rms) are NORMALIZED fractions
    // (coefficient of variation). The configurator divides by |zMean| at export
    // (magCharacterization.js:480: zRms = sqrt(mean((z-zMean)^2)) / |zMean|).
    // Scale them through gauss_per_corrected_unit to get physical Gauss.
    const sigXY = scaleNoise(quality?.residual_xy_rms);
    const sigZ = scaleNoise(quality?.residual_z_rms);

    return {
        frame: "FRD",
        nt_per_corrected_unit: ntPerUnit,
        gauss_per_corrected_unit: gaussPerUnit,
        earth_field_ned_gauss: earthFieldNedGauss,
        mag_noise_gauss: {
            sigma: scaleNoise(epResidual), // ellipsoid residual (normalized → Gauss)
            sigma_xy: sigXY, // quality residual (normalized → Gauss)
            sigma_z: sigZ, // quality residual (normalized → Gauss)
        },
        quality_bounds: computeMagQualityBounds(softIron, fieldNt),
    };
}

/**
 * Load and validate a characterization model from parsed JSON.
 *
 * @param {object} json - Parsed characterization model JSON
 * @returns {{ valid: boolean, error?: string, model?: MagModel }}
 */
export function loadMagCharacterizationModel(json) {
    if (!json || !SUPPORTED_VERSIONS.includes(json.version)) {
        return { valid: false, error: `Unsupported model version. Expected one of: ${SUPPORTED_VERSIONS.join(", ")}.` };
    }

    const ec = json.ellipsoid_correction;
    const align = json.alignment;
    const geo = json.geo_reference;

    if (!ec) {
        return { valid: false, error: "Model missing ellipsoid_correction." };
    }
    if (!align) {
        return { valid: false, error: "Model missing alignment data." };
    }
    const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

    if (
        !geo ||
        !isFiniteNumber(geo.field_strength_nt) ||
        geo.field_strength_nt <= 0 ||
        !isFiniteNumber(geo.inclination_deg) ||
        !isFiniteNumber(geo.declination_deg)
    ) {
        return { valid: false, error: "Model missing geo_reference with field strength." };
    }
    if (
        !ec.center ||
        !isFiniteNumber(ec.center.x) ||
        !isFiniteNumber(ec.center.y) ||
        !isFiniteNumber(ec.center.z) ||
        !Array.isArray(ec.soft_iron)
    ) {
        return { valid: false, error: "Model missing valid ellipsoid_correction fields." };
    }

    let alignmentMatrix;
    if (align.preset === 9 && align.euler_zyx_deg) {
        const e = align.euler_zyx_deg;
        alignmentMatrix = eulerToMatrix(e.roll, e.pitch, e.yaw);
    } else if (align.preset >= 1 && align.preset <= 8 && ALIGNMENT_MATRICES[align.preset]) {
        alignmentMatrix = ALIGNMENT_MATRICES[align.preset];
    } else {
        alignmentMatrix = ALIGNMENT_MATRICES[1];
    }

    const DECL = Math.PI / 180;
    const incRad = geo.inclination_deg * DECL;
    const decRad = geo.declination_deg * DECL;
    const B_total = geo.field_strength_nt;
    const B_h = B_total * Math.cos(incRad);
    const B_world_ned = [B_h * Math.cos(decRad), B_h * Math.sin(decRad), B_total * Math.sin(incRad)];
    const B_unit_ned = [B_world_ned[0] / B_total, B_world_ned[1] / B_total, B_world_ned[2] / B_total];

    const fusionBlock = buildFusionBlock(ec, geo, json.quality, json.downstream_fusion);

    const model = {
        version: json.version,
        ellipsoid: {
            center: { x: ec.center.x, y: ec.center.y, z: ec.center.z },
            W_inv: ec.soft_iron,
            radius: ec.radius,
            residual_rms: ec.residual_rms,
        },
        alignment: {
            preset: align.preset,
            matrix: alignmentMatrix,
            euler: align.euler_zyx_deg || null,
        },
        geoReference: {
            declination: geo.declination_deg,
            inclination: geo.inclination_deg,
            fieldStrength: geo.field_strength_nt,
            B_unit_ned,
        },
        quality: json.quality
            ? {
                  score: json.quality.score_percent,
                  residualZ: json.quality.residual_z_rms,
                  residualXY: json.quality.residual_xy_rms,
                  fieldConsistency: json.quality.field_consistency_pct,
                  chirality: json.quality.chirality_flag,
              }
            : null,
        poses: json.poses
            ? json.poses.map((p) => ({
                  orientation: p.body_orientation,
                  direction: p.cardinal_direction,
                  qualityWeight: p.heading_quality_weight,
              }))
            : [],
        fusion: {
            frame: fusionBlock.frame,
            gaussPerCorrectedUnit: fusionBlock.gauss_per_corrected_unit,
            earthFieldNedGauss: fusionBlock.earth_field_ned_gauss,
            magNoiseGauss: fusionBlock.mag_noise_gauss,
            qualityBounds: fusionBlock.quality_bounds,
        },
    };

    return { valid: true, model };
}

/**
 * @typedef {object} MagModel
 * @property {string} version
 * @property {{ center: {x:number,y:number,z:number}, W_inv: number[3][3], radius: number, residual_rms: number }} ellipsoid
 * @property {{ preset: number, matrix: number[3][3], euler: {roll:number,pitch:number,yaw:number}|null }} alignment
 * @property {{ declination: number, inclination: number, fieldStrength: number, B_unit_ned: number[3] }} geoReference
 * @property {{ score: number, residualZ: number, residualXY: number, fieldConsistency: number, chirality: boolean }|null} quality
 * @property {Array<{ orientation: string, direction: string, qualityWeight: number }>} poses
 * @property {{ frame: string, gaussPerCorrectedUnit: number|null, earthFieldNedGauss: {n:number,e:number,d:number}|null, magNoiseGauss: {sigma:number|null,sigma_xy:number|null,sigma_z:number|null}, qualityBounds: object }} fusion
 */
