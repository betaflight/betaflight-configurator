/**
 * Characterization model (schema 2.1) assembly — the JSON consumed by the
 * blackbox-log-viewer for post-flight heading correction.
 *
 * Single home for the export shape and its helpers; used by the wizard
 * composable, the export test suite, and the fixture-regeneration tool so the
 * tested shape can never drift from the shipped shape.
 */
import { matrixToEuler } from "./magCharacterization.js";
import { ALIGNMENT_MATRICES } from "./magAlignment.js";

export const MODEL_SCHEMA_VERSION = "2.1";
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
 * Build the characterization model object (schema 2.1).
 *
 * Frame conventions: `captured_under` is the FC configuration active during
 * capture; `ellipsoid_correction` (center, soft_iron) is expressed in that
 * CAPTURE frame; `hard_iron` is expressed in the PROPOSED alignment frame
 * (the literal `set mag_calibration` values).
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
    };
}
