/**
 * Pure computation helpers for the improved-tumble mag-calibration pipeline.
 *
 * These functions take explicit data parameters (no Vue refs, no fcStore)
 * so they can be unit-tested directly. The composable (useMagCharacterization.js)
 * is a thin state manager around them.
 *
 * Kept: computeCalFromEllipsoid, currentMatrixOf, proposedMatrixOf,
 *       assessTumbleQuality, isFirmwareCustomMagAlignCapable.
 * Removed: computeReplayData, selectAlignmentPackage, estimateFlatPoseBias,
 *          meanPackageError, headingError, scoreHeading, validatePoseAngle
 *          (pose-only; replaced by solveTiltAlignment in magTiltAlign.js).
 */
import semver from "semver";
import { eulerToMatrix, ALIGNMENT_MATRICES } from "./magAlignment.js";

// ── Firmware version gate ───────────────────────────────────────────────────
// "Fix mag_align_yaw" (betaflight#14849, merged 2025-12-30, first release
// 2026.6.0) negates angles before buildRotationMatrix so the net applied
// transform is Rz(yaw)*Ry(pitch)*Rx(roll). Older firmware applies the inverse.
export const MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN = "2026.6.0";

/**
 * Returns true when the firmware contains #14849 (angle negation + transpose).
 * semver.coerce strips pre-release tags; master builds like 2026.6.0-alpha
 * are accepted — their build date cannot be verified from the version string
 * alone. Unknown/unparseable versions safely return false.
 * @param {string|null|undefined} versionString
 * @returns {boolean}
 */
export function isFirmwareCustomMagAlignCapable(versionString) {
    const v = semver.coerce(versionString ?? "");
    return !!v && semver.gte(v, MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN);
}

/**
 * The 3x3 matrix the firmware is CURRENTLY applying for a given align_mag
 * configuration. Single home for the preset/CUSTOM branching.
 *
 * @param {number} currentAlignment - align_mag value (0-9; 0 treated as CW0)
 * @param {{ roll: number, pitch: number, yaw: number }|null} customAngles -
 *   degrees, required when currentAlignment === 9
 * @returns {number[][]|null} null when CUSTOM is selected but angles are missing
 */
export function currentMatrixOf(currentAlignment, customAngles) {
    if (currentAlignment === 9) {
        if (!customAngles) return null;
        return eulerToMatrix(customAngles.roll, customAngles.pitch, customAngles.yaw);
    }
    const al = currentAlignment >= 1 && currentAlignment <= 8 ? currentAlignment : 1;
    return ALIGNMENT_MATRICES[al];
}

/**
 * The 3x3 matrix a tilt-solve result proposes (sensor to body).
 * Single home for the result-to-matrix derivation.
 *
 * @param {{ preset: number, euler_zyx_deg?: { roll, pitch, yaw } }} result
 * @param {number[][]} [fallbackMat] - returned when the result carries no
 *   usable alignment (defaults to identity/CW0)
 * @returns {number[][]}
 */
export function proposedMatrixOf(result, fallbackMat = ALIGNMENT_MATRICES[1]) {
    if (result.preset === 9 && result.euler_zyx_deg) {
        return eulerToMatrix(result.euler_zyx_deg.roll, result.euler_zyx_deg.pitch, result.euler_zyx_deg.yaw);
    }
    return ALIGNMENT_MATRICES[result.preset] ?? fallbackMat;
}

/**
 * Derive firmware mag_calibration offsets from the ellipsoid fit center.
 *
 * Frame derivation (betaflight compass.c:492-550 — alignment is applied FIRST,
 * then mag_calibration is subtracted, so magZero lives in the ALIGNED BODY
 * frame of whatever alignment is active):
 *
 *   capture:  m = R_capture * s - magZero_capture   (what MSP_RAW_IMU streams)
 *   fit:      center ≈ R_capture * b - magZero_capture  (bias of m, capture frame)
 *   sensor bias:  b = R_captureT * (center + magZero_capture)
 *   after the wizard applies R_proposed, firmware needs:
 *     magZero_new = R_proposed * b = newCombined * (center + magZero_capture)
 *   where newCombined = R_proposed * R_captureT.
 *
 * @param {{ center: { x: number, y: number, z: number }, W_inv: number[][], radius: number, residual: number }|null} ellipsoidParams
 * @param {number[][]} newCombined - R_proposed * R_captureT (3x3); identity when
 *   the proposed alignment equals the alignment active during capture
 * @param {{ x: number, y: number, z: number }|null} [magZeroAtCapture] -
 *   mag_calibration values active on the FC during capture (null = assumed zero)
 * @returns {{ x: number, y: number, z: number }|null}
 */
export function computeCalFromEllipsoid(ellipsoidParams, newCombined, magZeroAtCapture = null) {
    if (!ellipsoidParams) return null;
    const c = ellipsoidParams.center;
    const z = magZeroAtCapture ?? { x: 0, y: 0, z: 0 };
    const b = [c.x + z.x, c.y + z.y, c.z + z.z];
    const m = newCombined ?? [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
    ];
    return {
        x: Math.round(m[0][0] * b[0] + m[0][1] * b[1] + m[0][2] * b[2]),
        y: Math.round(m[1][0] * b[0] + m[1][1] * b[1] + m[1][2] * b[2]),
        z: Math.round(m[2][0] * b[0] + m[2][1] * b[1] + m[2][2] * b[2]),
    };
}

// ── Quality assessment ──────────────────────────────────────────────────────

/**
 * Assess tumble quality from ellipsoid fit and coverage metrics.
 * @param {{ centerRatio: number, coverageFraction: number, ellipsoidResidual: number }} params
 * @returns {{ verdict: "clean"|"suspect"|"contaminated", reasons: string[] }}
 */
export function assessTumbleQuality({ centerRatio, coverageFraction, ellipsoidResidual }) {
    const reasons = [];
    if (centerRatio >= 0.5) {
        reasons.push(`center_ratio ${centerRatio.toFixed(2)} >= 0.50: world-frame interference likely (bench capture)`);
    } else if (centerRatio >= 0.15) {
        reasons.push(`center_ratio ${centerRatio.toFixed(2)} >= 0.15: some contamination or moderate hard iron`);
    }
    if (coverageFraction < 0.8) {
        reasons.push(
            `coverage ${(coverageFraction * 100).toFixed(0)}% < 80%: tumble did not cover enough sphere regions`,
        );
    }
    if (ellipsoidResidual >= 0.02) {
        reasons.push(`ellipsoid_residual ${(ellipsoidResidual * 100).toFixed(1)}% >= 2.0%: fit quality below target`);
    }

    let verdict;
    if (centerRatio < 0.15 && coverageFraction >= 0.8 && ellipsoidResidual < 0.02) {
        verdict = "clean";
    } else if (centerRatio < 0.5 && coverageFraction >= 0.6) {
        verdict = "suspect";
    } else {
        verdict = "contaminated";
    }
    return { verdict, reasons };
}
