/**
 * Builds a portable, self-contained JSON description of a magnetometer
 * calibration: the hard-iron offsets, the soft-iron (ellipsoid) correction, the
 * solved mounting alignment, the geomagnetic reference captured at the time, and
 * a derived `downstream_fusion` block for external log-analysis tools that want
 * to apply this calibration in physical units. The configurator only produces
 * the file; nothing in the configurator reads it back.
 *
 * This module is the single home for the export shape and its helpers; the test
 * suite asserts against the same builders so the tested shape cannot drift from
 * the shipped shape.
 */
import { matrixToEuler } from "./magCharacterization.js";
import { ALIGNMENT_MATRICES } from "./magAlignment.js";
import { computeMagQualityBounds } from "./magQualityBounds.js";

export { computeMagQualityBounds };

export const MODEL_SCHEMA_VERSION = "2.2";
export const MODEL_SCHEMA_URL = `https://betaflight.com/blackbox/mag-characterization-model/${MODEL_SCHEMA_VERSION}`;

/** Normalize a heading to [0, 360). */
export function normalizeHeading(deg) {
    return ((deg % 360) + 360) % 360;
}

/** Signed wrapped heading error in (-180, 180]. */
export function signedHeadingError(actual, expected) {
    if (expected === null || expected === undefined) {
        return 0;
    }
    let diff = actual - expected;
    while (diff > 180) {
        diff -= 360;
    }
    while (diff < -180) {
        diff += 360;
    }
    return diff;
}

/** ZYX Euler angles (degrees) for a solver result, presets included. */
export function getEulerAngles(solverResultVal) {
    if (!solverResultVal) {
        return { roll: 0, pitch: 0, yaw: 0 };
    }
    const preset = solverResultVal.preset ?? solverResultVal.alignment;
    if (preset === 9 && solverResultVal.euler_zyx_deg) {
        return { ...solverResultVal.euler_zyx_deg };
    }
    if (preset === 9 && solverResultVal.customAngles) {
        const { roll, pitch, yaw } = solverResultVal.customAngles;
        return { roll, pitch, yaw };
    }
    if (preset >= 1 && preset <= 8 && ALIGNMENT_MATRICES[preset]) {
        return matrixToEuler(ALIGNMENT_MATRICES[preset]);
    }
    return { roll: 0, pitch: 0, yaw: 0 };
}

/**
 * Build the `downstream_fusion` block — everything a 3-axis magnetometer filter
 * needs to consume this calibration as a seed + noise model, not just a heading
 * correction. Every value is DERIVED from data the calibration already produced;
 * nothing here needs extra capture.
 *
 * Why each field exists (for a consumer that fuses 3-axis mag against a
 * WMM-seeded earth-field state):
 *  - nt/gauss_per_corrected_unit: the ellipsoid fit lands corrected samples on
 *    a sphere of magnitude `radius`, which physically equals the local field.
 *    So one corrected unit = field/radius nanotesla. This lets the estimator
 *    fuse mag in PHYSICAL units against a WMM earth field, instead of guessing
 *    a scale.
 *  - earth_field_ned_gauss: the WMM earth-field vector in the NED world frame,
 *    ready to SEED the estimator's earth-field state (no WMM re-implementation
 *    downstream).
 *  - mag_noise_gauss: the estimator's measurement noise R, set from THIS
 *    calibration's MEASURED residual (isotropic from the ellipsoid fit). A
 *    good calibration earns tight mag trust; a marginal one is auto-downweighted.
 *  - quality_bounds: independent sanity gates (computeMagQualityBounds).
 *  - frame: the body frame of center/soft_iron/hard_iron and of the live magADC
 *    the estimator applies them to (FRD — firmware-verified).
 *
 * @param {object|null} ellipsoidParams - { center, W_inv, radius, residual }
 * @param {object|null} geoReference - { declination, inclination, fieldStrength }
 * @param {object|null} solverResiduals - { xyRms, zRms } (unused currently,
 *   kept for future per-axis noise; pass null for now)
 * @returns {object} the downstream_fusion block (all keys present; null when unknown)
 */
export function computeDownstreamFusion(ellipsoidParams, geoReference, solverResiduals) {
    const fieldNt = geoReference?.fieldStrength ?? null;
    const radius = ellipsoidParams?.radius ?? null;
    const softIron = ellipsoidParams?.W_inv ?? null;
    const epResidual = ellipsoidParams?.residual ?? null;

    let ntPerUnit = null;
    let gaussPerUnit = null;
    if (fieldNt != null && radius != null && Math.abs(radius) > 1e-9) {
        ntPerUnit = fieldNt / radius;
        gaussPerUnit = ntPerUnit / 1e5; // 1 Gauss = 1e5 nT
    }

    let earthFieldNedGauss = null;
    if (fieldNt != null && geoReference?.inclination != null && geoReference?.declination != null) {
        const incl = (geoReference.inclination * Math.PI) / 180;
        const decl = (geoReference.declination * Math.PI) / 180;
        const bTotalG = fieldNt / 1e5; // nT to Gauss
        const bH = bTotalG * Math.cos(incl);
        earthFieldNedGauss = {
            n: bH * Math.cos(decl),
            e: bH * Math.sin(decl),
            d: bTotalG * Math.sin(incl),
        };
    }

    const scaleNoise = (r) => (r != null && gaussPerUnit != null ? Math.abs(r) * gaussPerUnit : null);

    return {
        frame: "FRD",
        nt_per_corrected_unit: ntPerUnit,
        gauss_per_corrected_unit: gaussPerUnit,
        earth_field_ned_gauss: earthFieldNedGauss,
        mag_noise_gauss: {
            sigma: scaleNoise(epResidual),
            sigma_xy: scaleNoise(solverResiduals?.xyRms ?? null),
            sigma_z: scaleNoise(solverResiduals?.zRms ?? null),
        },
        quality_bounds: computeMagQualityBounds(softIron, fieldNt),
    };
}

/**
 * Build the calibration model object.
 *
 * Frame conventions: `captured_under` is the FC configuration active during
 * capture; `ellipsoid_correction` (center, soft_iron) is expressed in that
 * CAPTURE frame; `hard_iron` is expressed in the PROPOSED alignment frame
 * (the literal `set mag_calibration` values). All are in the FRD body frame
 * (see `downstream_fusion.frame`).
 *
 * @param {object} args
 * @param {object|null} args.solverResult - solveTiltAlignment() result
 * @param {object|null} args.capturedUnder - { alignment, custom_angles, mag_zero, mag_zero_known }
 * @param {object|null} args.ellipsoidParams - { center, W_inv, radius, residual }
 * @param {{ x: number, y: number, z: number }|null} args.calibrationOffsets -
 *   PROPOSED-frame magZero values
 * @param {{ declination: number, inclination: number, fieldStrength: number }|null} args.geoReference
 * @param {boolean} args.gpsFix
 * @param {number} args.gpsLat - raw MSP value (deg x 1e7)
 * @param {number} args.gpsLon - raw MSP value (deg x 1e7)
 * @param {object|null} [args.qualityAssessment]
 * @returns {object} plain JSON-serializable model
 */
export function buildCharacterizationModel({
    solverResult,
    capturedUnder,
    ellipsoidParams,
    calibrationOffsets,
    geoReference,
    gpsFix,
    gpsLat,
    gpsLon,
    qualityAssessment = null,
}) {
    const sr = solverResult;
    const ep = ellipsoidParams;

    let alignmentBlock = null;
    if (sr && !sr.error) {
        alignmentBlock = {
            preset: sr.preset ?? sr.alignment,
            label: sr.label,
            euler_zyx_deg: getEulerAngles(sr),
        };
    }

    let qualityBlock = null;
    if (sr && !sr.error) {
        qualityBlock = {
            mean_residual_deg: sr.quality?.meanResidualDeg ?? null,
            sample_count: sr.quality?.sampleCount ?? null,
            frob_norm: sr.quality?.frobNorm ?? null,
            cost: sr.quality?.cost ?? null,
        };
    }

    return {
        $schema: MODEL_SCHEMA_URL,
        version: MODEL_SCHEMA_VERSION,
        captured_under: capturedUnder ?? null,
        ellipsoid_correction: ep
            ? {
                center: { x: ep.center.x, y: ep.center.y, z: ep.center.z },
                soft_iron: ep.W_inv,
                radius: ep.radius,
                residual_rms: ep.residual,
            }
            : null,
        geo_reference: {
            latitude_deg: gpsFix ? gpsLat / 10000000 : null,
            longitude_deg: gpsFix ? gpsLon / 10000000 : null,
            declination_deg: geoReference?.declination ?? null,
            inclination_deg: geoReference?.inclination ?? null,
            field_strength_nt: geoReference?.fieldStrength ?? null,
        },
        alignment: alignmentBlock,
        hard_iron: calibrationOffsets ?? null,
        quality: qualityBlock,
        quality_assessment: qualityAssessment,
        downstream_fusion: computeDownstreamFusion(ep, geoReference, null),
    };
}
