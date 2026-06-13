/**
 * Pure computation functions extracted from useMagCharacterization.js.
 *
 * These functions take explicit data parameters (no Vue refs, no fcStore)
 * so they can be unit-tested directly with fixture data. The composable
 * is a thin state manager around them, and the offline tools
 * (test/js/tools/*.mjs) import the SAME functions — there is exactly one
 * implementation of every pipeline step.
 */
import { characterizeAlignment } from "./magCharacterization.js";
import semver from "semver";
import {
    eulerToMatrix,
    mat3mulVec,
    mat3transpose,
    mat3mul,
    undoRollPitch,
    ALIGNMENT_MATRICES,
} from "./magAlignment.js";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// Solver options used by every production and offline caller. Single source —
// do not redefine these literals at call sites.
export const SOLVER_OPTS = { headingMode: "absolute", headingWeight: 1.0 };

/**
 * Wrapped heading error between two angles in degrees.
 * @param {number} actual
 * @param {number|null|undefined} expected
 * @returns {number} Absolute error in degrees [0, 180]
 */
export function headingError(actual, expected) {
    if (expected === null || expected === undefined) return 0;
    let diff = actual - expected;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return Math.abs(diff);
}

/**
 * Qualitative score label for a heading error.
 * @param {number} errorDeg
 * @returns {string} "EXCELLENT" | "GOOD" | "POOR" | "BAD" | "CRITICAL" | "FATAL"
 */
export function scoreHeading(errorDeg) {
    if (errorDeg < 3) return "EXCELLENT";
    if (errorDeg < 10) return "GOOD";
    if (errorDeg < 25) return "POOR";
    if (errorDeg < 60) return "BAD";
    if (errorDeg < 150) return "CRITICAL";
    return "FATAL";
}

/**
 * The 3×3 matrix the firmware is CURRENTLY applying for a given align_mag
 * configuration. Single home for the preset/CUSTOM branching.
 *
 * @param {number} currentAlignment - align_mag value (0-9; 0 treated as CW0)
 * @param {{roll:number,pitch:number,yaw:number}|null} customAngles - degrees,
 *   required when currentAlignment === 9
 * @returns {number[][]|null} null when CUSTOM is selected but angles missing
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
 * The 3×3 matrix a characterizeAlignment() result proposes (sensor → body).
 * Single home for the result→matrix derivation.
 *
 * @param {{alignment:number, customAngles?:{roll,pitch,yaw}|null}} result
 * @param {number[][]} [fallbackMat] - returned when the result carries no
 *   usable alignment (defaults to identity/CW0)
 * @returns {number[][]}
 */
export function proposedMatrixOf(result, fallbackMat = ALIGNMENT_MATRICES[1]) {
    if (result.alignment === 9 && result.customAngles) {
        return eulerToMatrix(result.customAngles.roll, result.customAngles.pitch, result.customAngles.yaw);
    }
    return ALIGNMENT_MATRICES[result.alignment] || fallbackMat;
}

/**
 * Derive firmware mag_calibration offsets from the ellipsoid fit center.
 *
 * Frame derivation (betaflight compass.c:492-550 — alignment is applied FIRST,
 * then mag_calibration is subtracted, so magZero lives in the ALIGNED BODY
 * frame of whatever alignment is active):
 *
 *   capture:  m = R_capture·s − magZero_capture        (what MSP_RAW_IMU streams)
 *   fit:      center ≈ R_capture·b − magZero_capture   (bias of m, capture frame)
 *   sensor bias:  b = R_captureᵀ·(center + magZero_capture)
 *   after the wizard applies R_proposed, firmware needs:
 *     magZero_new = R_proposed·b = newCombined·(center + magZero_capture)
 *   where newCombined = R_proposed·R_captureᵀ.
 *
 * @param {{ center: {x:number,y:number,z:number}, W_inv: number[][], radius: number, residual: number }|null} ellipsoidParams
 * @param {number[][]} newCombined - R_proposed·R_captureᵀ (3×3); identity when the
 *   proposed alignment equals the alignment active during capture
 * @param {{x:number,y:number,z:number}|null} [magZeroAtCapture] - mag_calibration
 *   values active on the FC while the tumble was captured (null → assumed zero)
 * @returns {{x:number,y:number,z:number}|null}
 */
export function computeCalFromEllipsoid(ellipsoidParams, newCombined, magZeroAtCapture = null) {
    if (!ellipsoidParams) return null;
    const c = ellipsoidParams.center;
    const z = magZeroAtCapture || { x: 0, y: 0, z: 0 };
    const b = [c.x + z.x, c.y + z.y, c.z + z.z];
    const m = newCombined || [
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

/**
 * Compute per-pose heading comparison data from captured samples.
 *
 * For each pose, aggregates all samples into circular-mean headings for
 * three variants:
 *   - currentHeading:  current firmware alignment on raw mag (status quo)
 *   - newHeading:      the proposed FIRMWARE PACKAGE. When the solver ran on
 *     center-subtracted data (opts.proposedIncludesCenter), this is
 *     newCombined·(m − center) — exactly what the firmware produces after
 *     `align_mag` AND `mag_calibration` are applied. Otherwise it is
 *     newCombined·m (alignment-only).
 *   - fullCorrectedHeading: + soft iron, newCombined·W_inv·(m − center) —
 *     the blackbox-log-viewer pipeline (firmware cannot apply W_inv)
 *
 * @param {object} result - characterizeAlignment() return value
 * @param {number} currentAlignment - firmware align_mag preset (1-9)
 * @param {Array<Array<{headingRef:number, samples:Array}>>} captureData
 * @param {Array<{label:string, heading:number, poses:Array}>} directions
 * @param {object} opts
 * @param {object|null} opts.ellipsoidParams
 * @param {object|null} opts.calibrationOffsets - PROPOSED-frame offsets; only
 *   used for fullCorrected when no ellipsoid exists
 * @param {number[][]} opts.currentMat - current firmware alignment matrix
 * @param {boolean} [opts.proposedIncludesCenter=false] - true when `result`
 *   was solved on center-subtracted samples (correct-then-solve package)
 * @returns {Array<object>} replay data array (one entry per captured pose)
 */
export function computeReplayData(result, currentAlignment, captureData, directions, opts = {}) {
    const { ellipsoidParams = null, calibrationOffsets = null, currentMat: _cm, proposedIncludesCenter = false } = opts;

    const currentMat = _cm || ALIGNMENT_MATRICES[currentAlignment] || ALIGNMENT_MATRICES[1];
    const currentInv = mat3transpose(currentMat);
    const proposedMat = proposedMatrixOf(result);
    const newCombined = mat3mul(proposedMat, currentInv);
    const calOffsets = calibrationOffsets;

    const data = [];

    for (let di = 0; di < directions.length; di++) {
        for (let pi = 0; pi < directions[di].poses.length; pi++) {
            const cap = captureData[di]?.[pi];
            if (!cap || !cap.samples || cap.samples.length === 0) continue;

            let sumRoll = 0,
                sumPitch = 0,
                sumField = 0;
            let curSin = 0,
                curCos = 0,
                newSin = 0,
                newCos = 0;
            let fcSin = 0,
                fcCos = 0;
            let hasFullCorrected = false,
                n = 0;

            for (const s of cap.samples) {
                sumRoll += s.roll;
                sumPitch += s.pitch;
                sumField += s.fieldStrength || Math.hypot(s.mag[0], s.mag[1], s.mag[2]);
                const rollRad = s.roll * DEG_TO_RAD;
                const pitchRad = s.pitch * DEG_TO_RAD;

                // Current alignment heading (identity: currentMat * currentInv = I)
                const curLevel = undoRollPitch(s.mag, rollRad, pitchRad);
                const curDir = Math.atan2(curLevel[1], curLevel[0]);
                curSin += Math.sin(curDir);
                curCos += Math.cos(curDir);

                // Proposed firmware package. With correct-then-solve the rotation
                // was solved on center-subtracted data, so the package heading is
                // newCombined·(m − center) — matching firmware behavior once both
                // align_mag and mag_calibration are applied.
                let propVec = s.mag;
                if (proposedIncludesCenter && ellipsoidParams) {
                    const pc = ellipsoidParams.center;
                    propVec = [s.mag[0] - pc.x, s.mag[1] - pc.y, s.mag[2] - pc.z];
                }
                const newBody = mat3mulVec(newCombined, propVec);
                const newLevel = undoRollPitch(newBody, rollRad, pitchRad);
                const newDir = Math.atan2(newLevel[1], newLevel[0]);
                newSin += Math.sin(newDir);
                newCos += Math.cos(newDir);

                // Full corrected heading: hard-iron + soft-iron correction applied in
                // the CAPTURE frame (the frame the ellipsoid was fit in), then rotated
                // into the proposed body frame:
                //   m_fc = newCombined · W_inv · (m_raw − center)
                // The operator order matters: W_inv and center live in the capture
                // body frame, so they must be applied before the frame change.
                if (ellipsoidParams) {
                    const ec = ellipsoidParams.center;
                    const w = ellipsoidParams.W_inv;
                    const dx = s.mag[0] - ec.x;
                    const dy = s.mag[1] - ec.y;
                    const dz = s.mag[2] - ec.z;
                    const corr = [
                        w[0][0] * dx + w[0][1] * dy + w[0][2] * dz,
                        w[1][0] * dx + w[1][1] * dy + w[1][2] * dz,
                        w[2][0] * dx + w[2][1] * dy + w[2][2] * dz,
                    ];
                    const fcBody = mat3mulVec(newCombined, corr);
                    const fcLevel = undoRollPitch(fcBody, rollRad, pitchRad);
                    const fcDir = Math.atan2(fcLevel[1], fcLevel[0]);
                    fcSin += Math.sin(fcDir);
                    fcCos += Math.cos(fcDir);
                    hasFullCorrected = true;
                } else if (calOffsets) {
                    // No ellipsoid fit: calOffsets are expressed in the PROPOSED
                    // alignment frame (computeCalFromEllipsoid output convention),
                    // so subtract after the frame change.
                    const fcBody = [newBody[0] - calOffsets.x, newBody[1] - calOffsets.y, newBody[2] - calOffsets.z];
                    const fcLevel = undoRollPitch(fcBody, rollRad, pitchRad);
                    const fcDir = Math.atan2(fcLevel[1], fcLevel[0]);
                    fcSin += Math.sin(fcDir);
                    fcCos += Math.cos(fcDir);
                    hasFullCorrected = true;
                }

                n++;
            }

            const curHeading = Math.atan2(curSin, curCos) * RAD_TO_DEG;
            const newHeading = Math.atan2(newSin, newCos) * RAD_TO_DEG;
            const fullCorrectedHeading = hasFullCorrected ? Math.atan2(fcSin, fcCos) * RAD_TO_DEG : null;

            data.push({
                dirLabel: directions[di].label,
                poseLabel: directions[di].poses[pi].label,
                isFlat: !!directions[di].poses[pi].isFlat,
                expectedHeading: cap.headingRef || directions[di].heading * RAD_TO_DEG,
                roll: sumRoll / n,
                pitch: sumPitch / n,
                currentHeading: curHeading,
                newHeading,
                fullCorrectedHeading,
                _fieldSum: sumField,
                _fieldCount: n,
            });
        }
    }

    // Global mean |B| for deviation
    let globalFieldSum = 0,
        globalFieldCount = 0;
    for (const d of data) {
        globalFieldSum += d._fieldSum;
        globalFieldCount += d._fieldCount;
    }
    const globalFieldMean = globalFieldCount > 0 ? globalFieldSum / globalFieldCount : 1;

    for (const d of data) {
        d.fieldMean = Math.round(d._fieldSum / d._fieldCount);
        d.fieldDevPct = Math.round((d.fieldMean / globalFieldMean - 1) * 1000) / 10;
        d.currentScore = scoreHeading(headingError(d.currentHeading, d.expectedHeading));
        d.score = scoreHeading(headingError(d.newHeading, d.expectedHeading));
        if (d.fullCorrectedHeading != null) {
            d.fullCorrectedScore = scoreHeading(headingError(d.fullCorrectedHeading, d.expectedHeading));
        }
        delete d._fieldSum;
        delete d._fieldCount;
    }

    return data;
}

/**
 * Mean |heading error| of the proposed package over a replay data array.
 * @param {Array<{newHeading:number, expectedHeading:number}>} replayRows
 * @returns {number} degrees; Infinity when the array is empty
 */
export function meanPackageError(replayRows) {
    let sum = 0;
    let n = 0;
    for (const d of replayRows) {
        sum += headingError(d.newHeading, d.expectedHeading);
        n++;
    }
    return n > 0 ? sum / n : Infinity;
}

// Pose-angle acceptance windows (degrees). Tilted poses must land within
// ANGLE_WINDOW of the target on both axes AND have a tilt magnitude inside
// [TILT_MIN, TILT_MAX]: below TILT_MIN the pose is effectively flat (no Z
// cross-coupling to observe); above TILT_MAX the accelerometer roll/pitch
// decomposition degrades toward gimbal lock. Flat poses accept any tilt up
// to ANGLE_WINDOW. Windows are deliberately permissive: the solver needs
// VARIED attitudes, not exact ones — household boxes give 20–45° of tilt.
export const POSE_ANGLE_WINDOW_DEG = 20;
export const POSE_TILT_MIN_DEG = 10;
export const POSE_TILT_MAX_DEG = 60;

/**
 * Validate that a captured pose's mean attitude matches the intended pose.
 *
 * @param {number} targetRoll - intended roll, degrees (0 for flat/pitch poses)
 * @param {number} targetPitch - intended pitch, degrees (0 for flat/roll poses)
 * @param {number} measuredRoll - mean captured roll, degrees
 * @param {number} measuredPitch - mean captured pitch, degrees
 * @returns {{accepted: boolean, reason?: string}} reason is an i18n key
 */
export function validatePoseAngle(targetRoll, targetPitch, measuredRoll, measuredPitch) {
    const tilt = Math.max(Math.abs(measuredRoll), Math.abs(measuredPitch));
    const isFlatTarget = targetRoll === 0 && targetPitch === 0;

    if (isFlatTarget) {
        return tilt <= POSE_ANGLE_WINDOW_DEG
            ? { accepted: true }
            : { accepted: false, reason: "magCharPoseRejectNotFlat" };
    }
    if (tilt < POSE_TILT_MIN_DEG) {
        return { accepted: false, reason: "magCharPoseRejectNearlyFlat" };
    }
    if (tilt > POSE_TILT_MAX_DEG) {
        return { accepted: false, reason: "magCharPoseRejectTooSteep" };
    }
    if (
        Math.abs(measuredRoll - targetRoll) > POSE_ANGLE_WINDOW_DEG ||
        Math.abs(measuredPitch - targetPitch) > POSE_ANGLE_WINDOW_DEG
    ) {
        return { accepted: false, reason: "magCharPoseRejectOffTarget" };
    }
    return { accepted: true };
}

/**
 * Estimate the horizontal hard-iron bias from the cardinal FLAT poses.
 *
 * With yaw-only rotation between the flat poses, the Earth-field contribution
 * to the horizontal components averages out across opposing/orthogonal
 * cardinal directions — the body-frame mean IS the horizontal bias. The
 * vertical (z) bias is unobservable this way (the field's vertical component
 * does not rotate with yaw), so only x/y are returned.
 *
 * Used by tumble-less wizard runs to detect "bias present but unobservable":
 * without an ellipsoid the solver would silently entangle this bias into a
 * phantom rotation (hardware-demonstrated on the 2026-06-12 rested run).
 *
 * @param {Array<Array<{headingRef:number, samples:Array}|null>>} captureData
 * @param {Array<{poses:Array<{label:string,isFlat?:boolean}>}>} directions
 * @returns {{x:number, y:number, avgH:number, ratio:number, flatPoseCount:number}|null}
 *   null when fewer than 3 flat poses were captured. `ratio` =
 *   |bias_xy| / avgH (avgH = mean horizontal magnitude of the flat samples).
 */
export function estimateFlatPoseBias(captureData, directions) {
    let bx = 0;
    let by = 0;
    let hSum = 0;
    let nSamples = 0;
    let flatPoseCount = 0;

    for (let di = 0; di < directions.length; di++) {
        for (let pi = 0; pi < directions[di].poses.length; pi++) {
            const poseDef = directions[di].poses[pi];
            if (!(poseDef.isFlat || poseDef.label.startsWith("Flat"))) continue;
            const cap = captureData[di]?.[pi];
            if (!cap?.samples?.length) continue;

            let sx = 0;
            let sy = 0;
            for (const s of cap.samples) {
                sx += s.mag[0];
                sy += s.mag[1];
                hSum += Math.hypot(s.mag[0], s.mag[1]);
                nSamples++;
            }
            bx += sx / cap.samples.length;
            by += sy / cap.samples.length;
            flatPoseCount++;
        }
    }

    if (flatPoseCount < 3 || nSamples === 0) return null;
    bx /= flatPoseCount;
    by /= flatPoseCount;
    const avgH = hSum / nSamples;
    return {
        x: Math.round(bx),
        y: Math.round(by),
        avgH: Math.round(avgH),
        ratio: avgH > 0 ? Math.hypot(bx, by) / avgH : 0,
        flatPoseCount,
    };
}

/**
 * Correct-then-solve: dual solve + package selection.
 *
 * Solving on RAW data entangles hard-iron compensation into the rotation
 * (hardware-proven: raw solve 11.1–12.7° vs corrected solve 4.4–5.4° mean
 * pose error across three capture sessions; cross-validated at 5.5° on a
 * held-out session). When an ellipsoid center is available this ALSO solves
 * on center-subtracted samples and picks the package with the lower measured
 * pose error:
 *
 *   package A (calibrated): alignment solved on (m − center), shipped WITH
 *       mag_calibration — firmware applies R·s − magZero ≡ R·(s − b)
 *   package B (alignment-only): alignment solved on raw, offsets withheld —
 *       the fallback when the tumble center is contaminated (world-frame
 *       interference) and does not transfer to the pose data
 *
 * This is the single implementation used by the wizard (runSolver), the
 * offline analysis tools, and the test suite.
 *
 * @param {object} args
 * @param {Array<{mag:number[],roll:number,pitch:number,headingRef:number,poseKey?:string}>} args.samples
 * @param {Array<Array<{headingRef:number, samples:Array}|null>>} args.captureData
 * @param {Array<{label:string, heading:number, poses:Array}>} args.directions
 * @param {number} args.currentAlignment
 * @param {{roll,pitch,yaw}|null} args.customAngles - required when currentAlignment === 9
 * @param {number[][]} args.currentMat - from currentMatrixOf()
 * @param {object|null} args.ellipsoidParams - null ⇒ raw solve only
 * @param {number} [args.toleranceDeg=1.0] - package may tie within this margin
 * @returns {{
 *   result: object,                  // the chosen characterizeAlignment() result
 *   usedCalibratedPackage: boolean,
 *   validation: { proposedMeanErr:number, fullCorrectedMeanErr:number, recommended:boolean } | null,
 * }}
 */
export function selectAlignmentPackage({
    samples,
    captureData,
    directions,
    currentAlignment,
    customAngles,
    currentMat,
    ellipsoidParams,
    toleranceDeg = 1.0,
}) {
    const rawResult = characterizeAlignment(samples, currentAlignment, customAngles, SOLVER_OPTS);

    if (!ellipsoidParams || rawResult.error) {
        return { result: rawResult, usedCalibratedPackage: false, validation: null };
    }

    const ec = ellipsoidParams.center;
    const correctedSamples = samples.map((s) => ({
        ...s,
        mag: [s.mag[0] - ec.x, s.mag[1] - ec.y, s.mag[2] - ec.z],
    }));
    const corrResult = characterizeAlignment(correctedSamples, currentAlignment, customAngles, SOLVER_OPTS);
    if (corrResult.error) {
        return { result: rawResult, usedCalibratedPackage: false, validation: null };
    }

    const evalErr = (res, includeCenter) =>
        meanPackageError(
            computeReplayData(res, currentAlignment, captureData, directions, {
                ellipsoidParams,
                currentMat,
                proposedIncludesCenter: includeCenter,
            }),
        );
    const packageErr = evalErr(corrResult, true);
    const alignmentOnlyErr = evalErr(rawResult, false);
    const usedCalibratedPackage = packageErr <= alignmentOnlyErr + toleranceDeg;

    return {
        result: usedCalibratedPackage ? corrResult : rawResult,
        usedCalibratedPackage,
        validation: {
            proposedMeanErr: alignmentOnlyErr,
            fullCorrectedMeanErr: packageErr,
            recommended: usedCalibratedPackage,
        },
    };
}

// ── Firmware version gate (F4) ──────────────────────────────────────────
// "Fix mag_align_yaw" (betaflight#14849, merged 2025-12-30, first release
// 2026.6.0) negates the angles before buildRotationMatrix so the net applied
// transform is Rz(yaw)·Ry(pitch)·Rx(roll). Older firmware applies the INVERSE.
export const MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN = "2026.6.0";

/**
 * Returns true when the firmware contains #14849 (angle negation + transpose).
 * semver.coerce strips prerelease tags; master builds like 2026.6.0-alpha
 * are accepted — their build date cannot be verified from the version string
 * alone.  Unknown/unparseable versions safely return false.
 */
export function isFirmwareCustomMagAlignCapable(versionString) {
    const v = semver.coerce(versionString || "");
    return !!v && semver.gte(v, MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN);
}

// ── Quality assessment (FP4 / P2.7) ────────────────────────────────────

/**
 * @param {{ centerRatio: number, coverageFraction: number, ellipsoidResidual: number }} params
 * @returns {{ verdict: "clean"|"suspect"|"contaminated", reasons: string[] }}
 */
export function assessTumbleQuality({ centerRatio, coverageFraction, ellipsoidResidual }) {
    const reasons = [];
    if (centerRatio >= 0.5)
        reasons.push(`center_ratio ${centerRatio.toFixed(2)} >= 0.50: world-frame interference likely (bench capture)`);
    else if (centerRatio >= 0.15)
        reasons.push(`center_ratio ${centerRatio.toFixed(2)} >= 0.15: some contamination or moderate hard iron`);
    if (coverageFraction < 0.8)
        reasons.push(
            `coverage ${(coverageFraction * 100).toFixed(0)}% < 80%: tumble did not cover enough sphere regions`,
        );
    if (ellipsoidResidual >= 0.02)
        reasons.push(`ellipsoid_residual ${(ellipsoidResidual * 100).toFixed(1)}% >= 2.0%: fit quality below target`);

    let verdict = "clean";
    if (centerRatio < 0.15 && coverageFraction >= 0.8 && ellipsoidResidual < 0.02) {
        verdict = "clean";
    } else if (centerRatio < 0.5 && coverageFraction >= 0.6) {
        verdict = "suspect";
    } else {
        verdict = "contaminated";
    }
    return { verdict, reasons };
}

/**
 * @param {{ currentErrorDeg: number, packageErrorDeg: number }} params
 * @returns {{ verdict: "clean"|"suspect"|"contaminated", reasons: string[] }}
 */
export function assessPoseQuality({ currentErrorDeg, packageErrorDeg }) {
    const reasons = [];
    if (currentErrorDeg >= 30)
        reasons.push(`current_error ${currentErrorDeg.toFixed(1)} deg >= 30: baseline alignment is very wrong`);
    else if (currentErrorDeg >= 15)
        reasons.push(`current_error ${currentErrorDeg.toFixed(1)} deg >= 15: baseline alignment needs correction`);
    if (packageErrorDeg >= 8)
        reasons.push(`package_error ${packageErrorDeg.toFixed(1)} deg >= 8: corrected heading still above target`);

    let verdict = "clean";
    if (currentErrorDeg < 5 && packageErrorDeg < 5) {
        verdict = "clean";
    } else if (packageErrorDeg < 12) {
        verdict = "suspect";
    } else {
        verdict = "contaminated";
    }
    return { verdict, reasons };
}
