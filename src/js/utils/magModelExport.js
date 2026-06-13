/**
 * Characterization model (schema 2.2) assembly — the JSON consumed by the
 * blackbox-log-viewer for post-flight heading correction and, as of schema 2.2,
 * for full 3-axis magnetometer fusion in a post-flight pose estimator.
 *
 * Single home for the export shape and its helpers; used by the wizard
 * composable, the export test suite, and the fixture-regeneration tool so the
 * tested shape can never drift from the shipped shape.
 *
 * Schema 2.2 adds a `downstream_fusion` block (all values DERIVED from existing
 * capture data — no extra capture). See computeDownstreamFusion() for the why.
 */
import { matrixToEuler } from "./magCharacterization.js";
import { ALIGNMENT_MATRICES } from "./magAlignment.js";

export const MODEL_SCHEMA_VERSION = "2.2";
export const MODEL_SCHEMA_URL = `https://betaflight.com/blackbox/mag-characterization-model/${MODEL_SCHEMA_VERSION}`;

/** Map a wizard pose label to the schema body_orientation enum. */
export function mapPoseType(poseLabel) {
    if (poseLabel.startsWith("Flat")) return "flat";
    if (poseLabel.startsWith("Nose Up")) return "nose_up";
    if (poseLabel.startsWith("Nose Down")) return "nose_down";
    if (poseLabel.includes("Roll right")) return "left_side";
    if (poseLabel.includes("Roll left")) return "right_side";
    if (poseLabel.includes("Inverted")) return "inverted";
    return "flat";
}

/** Normalize a heading to [0, 360). */
export function normalizeHeading(deg) {
    return ((deg % 360) + 360) % 360;
}

/** Signed wrapped heading error in (−180, 180]. */
export function signedHeadingError(actual, expected) {
    if (expected === null || expected === undefined) return 0;
    let diff = actual - expected;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return diff;
}

/** ZYX Euler angles (degrees) for a solver result, presets included. */
export function getEulerAngles(solverResultVal) {
    if (!solverResultVal) return { roll: 0, pitch: 0, yaw: 0 };
    const preset = solverResultVal.alignment;
    if (preset === 9 && solverResultVal.customAngles) {
        const { roll, pitch, yaw } = solverResultVal.customAngles;
        return { roll, pitch, yaw };
    }
    if (preset >= 1 && preset <= 8 && ALIGNMENT_MATRICES[preset]) {
        const euler = matrixToEuler(ALIGNMENT_MATRICES[preset]);
        return { roll: euler.roll, pitch: euler.pitch, yaw: euler.yaw };
    }
    return { roll: 0, pitch: 0, yaw: 0 };
}

/**
 * Soft-iron sanity bounds (schema 2.2).
 *
 * Attribution: the numeric acceptance thresholds — field-strength range
 * (150–950 milliGauss) and per-axis soft-iron scale range (0.67–1.5, applied below
 * as a max/min diagonal ratio < 2.24) — originate from ArduPilot's CompassCalibrator
 * (libraries/AP_Compass/CompassCalibrator.cpp, GPLv3). This is an INDEPENDENT
 * reimplementation in JavaScript: no ArduPilot source was copied — only its published
 * threshold values are reused as functional parameters. ArduPilot and this project are
 * both GPLv3, so the reuse is license-compatible.
 *
 * These are scale-invariant ratios on the soft-iron matrix plus a physical field-
 * magnitude range, so they hold whether `soft_iron` is normalized (unit-sphere) or in
 * raw ADC scale. They catch degenerate/pathological fits that a residual-only score can
 * miss (e.g. a near-singular soft-iron matrix).
 *
 * @param {number[3][3]|null} softIron - the W_inv soft-iron matrix
 * @param {number|null} fieldNt - local field strength (nanotesla)
 * @returns {object} per-check values + booleans + overall bounds_ok
 */
export function computeMagQualityBounds(softIron, fieldNt) {
    const fieldMg = fieldNt != null ? fieldNt / 100 : null; // 1 milliGauss = 100 nT
    const fieldOk = fieldMg != null ? fieldMg >= 150 && fieldMg <= 950 : null;

    let offdiagRatio = null;
    let anisotropy = null;
    if (Array.isArray(softIron) && softIron.length === 3) {
        const diag = [Math.abs(softIron[0][0]), Math.abs(softIron[1][1]), Math.abs(softIron[2][2])];
        const offdiag = [
            Math.abs(softIron[0][1]),
            Math.abs(softIron[0][2]),
            Math.abs(softIron[1][2]),
            Math.abs(softIron[1][0]),
            Math.abs(softIron[2][0]),
            Math.abs(softIron[2][1]),
        ];
        const meanDiag = (diag[0] + diag[1] + diag[2]) / 3;
        const maxDiag = Math.max(...diag);
        const minDiag = Math.min(...diag);
        offdiagRatio = meanDiag > 1e-12 ? Math.max(...offdiag) / meanDiag : null;
        anisotropy = minDiag > 1e-12 ? maxDiag / minDiag : null;
    }
    const offdiagOk = offdiagRatio != null ? offdiagRatio < 1.0 : null;
    // AP per-axis scale bound 0.67–1.5 ⇒ max/min diagonal ratio < 1.5/0.67 ≈ 2.24.
    const anisotropyOk = anisotropy != null ? anisotropy < 2.24 : null;
    const boundsOk = [fieldOk, offdiagOk, anisotropyOk].every((b) => b === true);

    return {
        field_strength_mg: fieldMg,
        field_strength_ok: fieldOk,
        soft_iron_offdiag_ratio: offdiagRatio,
        soft_iron_offdiag_ok: offdiagOk,
        soft_iron_anisotropy: anisotropy,
        soft_iron_anisotropy_ok: anisotropyOk,
        bounds_ok: boundsOk,
    };
}

/**
 * Build the schema-2.2 `downstream_fusion` block — everything a post-flight 3-axis
 * magnetometer EKF needs to consume this static bench calibration as a *seed +
 * noise model*, not just a heading correction. Every value is DERIVED from data the
 * wizard already produced; nothing here needs extra capture.
 *
 * Why each field exists (the downstream consumer is the blackbox-log-viewer pose
 * estimator, which fuses 3-axis mag against a WMM-seeded earth-field state):
 *  - nt/gauss_per_corrected_unit: the ellipsoid fit lands corrected samples on a
 *    sphere of magnitude `radius`, which physically equals the local field. So one
 *    corrected unit = field/radius nanotesla. This lets the estimator fuse mag in
 *    PHYSICAL units against a WMM earth field, instead of guessing a scale.
 *  - earth_field_ned_gauss: the WMM earth-field vector in the NED world frame,
 *    ready to SEED the estimator's earth-field state (no WMM re-implementation
 *    downstream).
 *  - mag_noise_gauss: the estimator's measurement noise R, set from THIS cal's
 *    MEASURED residual (isotropic from the ellipsoid fit; per-axis xy/z from the
 *    solver). A good cal earns tight mag trust; a marginal one is auto-downweighted
 *    — far better than a generic constant.
 *  - quality_bounds: independent sanity gates (computeMagQualityBounds).
 *  - frame: the body frame of center/soft_iron/hard_iron and of the live magADC the
 *    estimator applies them to (FRD — firmware-verified; see planv5/01).
 *
 * @param {object|null} ellipsoidParams - { center, W_inv, radius, residual }
 * @param {object|null} geoReference - { declination, inclination, fieldStrength }
 * @param {object|null} solverResiduals - { xyRms, zRms } per-axis fit residuals
 * @returns {object} the downstream_fusion block (all keys present; values null when unknown)
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
        const bTotalG = fieldNt / 1e5; // nT → Gauss
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
            sigma_xy: scaleNoise(solverResiduals?.xyRms),
            sigma_z: scaleNoise(solverResiduals?.zRms),
        },
        quality_bounds: computeMagQualityBounds(softIron, fieldNt),
    };
}

/**
 * Build the characterization model object (schema 2.2).
 *
 * Frame conventions: `captured_under` is the FC configuration active during
 * capture; `ellipsoid_correction` (center, soft_iron) is expressed in that
 * CAPTURE frame; `hard_iron` is expressed in the PROPOSED alignment frame
 * (the literal `set mag_calibration` values). All are in the FRD body frame
 * (see `downstream_fusion.frame`). Schema 2.2 adds the `downstream_fusion`
 * block (computeDownstreamFusion) for 3-axis-fusion consumers.
 *
 * @param {object} args
 * @param {object|null} args.solverResult - characterizeAlignment() result
 * @param {Array<object>} args.replayData - computeReplayData() rows
 * @param {object|null} args.capturedUnder - { alignment, custom_angles, mag_zero, mag_zero_known }
 * @param {object|null} args.ellipsoidParams - { center, W_inv, radius, residual }
 * @param {{x,y,z}|null} args.calibrationOffsets - PROPOSED-frame magZero values
 * @param {{declination,inclination,fieldStrength}|null} args.geoReference
 * @param {boolean} args.gpsFix
 * @param {number} args.gpsLat - raw MSP value (deg × 1e7)
 * @param {number} args.gpsLon - raw MSP value (deg × 1e7)
 * @returns {object} plain JSON-serializable model
 */
export function buildCharacterizationModel({
    solverResult,
    replayData,
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
            declination_deg: geoReference?.declination ?? 0,
            inclination_deg: geoReference?.inclination ?? 0,
            field_strength_nt: geoReference?.fieldStrength ?? null,
        },
        alignment:
            sr && !sr.error
                ? {
                    preset: sr.alignment,
                    label: sr.label,
                    euler_zyx_deg: getEulerAngles(sr),
                }
                : null,
        // Deprecated: per-axis gains came from the removed WMM regression path.
        // Constant retained for schema 2.1 compatibility (W_inv carries soft iron).
        axis_gains: { x: 1.0, y: 1.0, z: 1.0 },
        hard_iron: calibrationOffsets ?? null,
        quality:
            sr && !sr.error
                ? {
                    score_percent: sr.qualityScore,
                    residual_z_rms: sr.residuals?.zRms ?? 0,
                    residual_xy_rms: sr.residuals?.xyRms ?? 0,
                    field_consistency_pct: sr.fieldConsistency?.maxDevPct ?? 0,
                    chirality_flag: sr.chiralityFlag ?? false,
                }
                : null,
        poses: replayData.map((pose) => ({
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
            // Deprecated with the WMM regression path; keys retained for schema
            // 2.1 compatibility (the viewer treats null as absent).
            heading_gain_corrected_deg: null,
            heading_error_gain_corrected_deg: null,
            heading_quality_weight: Math.max(
                0,
                Math.min(1, 1.0 - Math.abs(signedHeadingError(pose.newHeading, pose.expectedHeading)) / 30.0),
            ),
        })),
        quality_assessment: qualityAssessment,
        downstream_fusion: computeDownstreamFusion(ep, geoReference, sr && !sr.error ? sr.residuals : null),
    };
}
