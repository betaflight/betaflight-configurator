/**
 * Pure computation functions extracted from useMagCharacterization.js.
 *
 * These functions take explicit data parameters (no Vue refs, no fcStore)
 * so they can be unit-tested directly with fixture data. The composable
 * becomes a thin state manager that calls these pure functions.
 *
 * Extracted 2026-06-11 to close the test coverage gap that let the
 * fullCorrectedHeading bug through three iterations undetected.
 */
import {
    eulerToMatrix,
    mat3mulVec,
    mat3transpose,
    mat3mul,
    undoRollPitch,
    ALIGNMENT_MATRICES,
} from "./magAlignment.js";

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

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Cross-validate the ellipsoid-derived calibration offsets against the
 * 20-pose data: the poses act as a held-out validation set for the
 * tumble-derived correction.
 *
 * Compares mean |heading error| of the proposed alignment on raw data (P1)
 * against the fully corrected pipeline (P3). When the correction makes the
 * validation poses WORSE, the ellipsoid center does not represent the bias
 * present in the pose data (typical cause: magnetic contamination during the
 * tumble — laptop, USB cable, rebar) and the offsets must not be sent to the
 * firmware.
 *
 * @param {Array<{newHeading:number, fullCorrectedHeading:number|null, expectedHeading:number}>} replayData
 * @param {number} [toleranceDeg=1.0] - calibration may degrade the mean by up
 *   to this much and still be considered neutral/acceptable
 * @returns {{ proposedMeanErr:number, fullCorrectedMeanErr:number, recommended:boolean }|null}
 *   null when there is no full-corrected data to validate against
 */
export function validateCalibrationOffsets(replayData, toleranceDeg = 1.0) {
    let pSum = 0;
    let fSum = 0;
    let n = 0;
    for (const d of replayData) {
        if (d.fullCorrectedHeading == null) continue;
        pSum += headingError(d.newHeading, d.expectedHeading);
        fSum += headingError(d.fullCorrectedHeading, d.expectedHeading);
        n++;
    }
    if (n === 0) return null;
    const proposedMeanErr = pSum / n;
    const fullCorrectedMeanErr = fSum / n;
    return {
        proposedMeanErr,
        fullCorrectedMeanErr,
        recommended: fullCorrectedMeanErr <= proposedMeanErr + toleranceDeg,
    };
}

/**
 * Compute per-pose heading comparison data from captured samples.
 *
 * For each pose, aggregates all samples into circular-mean headings for
 * four variants:
 *   - currentHeading:  current firmware alignment on raw mag
 *   - newHeading:      solver-proposed alignment on raw mag
 *   - fullCorrectedHeading: matches newHeading (calibration normalizes
 *     |B| uniformity, not heading direction)
 *   - gainCorrectedHeading: experimental (null in most cases)
 *
 * @param {object} result - characterizeAlignment() return value
 * @param {number} currentAlignment - firmware align_mag preset (1-9)
 * @param {Array<Array<{headingRef:number, samples:Array}>>} captureData
 * @param {Array<{label:string, heading:number, poses:Array}>} directions
 * @param {object} opts
 * @param {object|null} opts.ellipsoidParams
 * @param {object|null} opts.calibrationOffsets
 * @param {object|null} opts.axisGains
 * @param {number[][]} opts.currentMat - current firmware alignment matrix
 * @returns {Array<object>} replay data array (one entry per captured pose)
 */
export function computeReplayData(result, currentAlignment, captureData, directions, opts = {}) {
    const { ellipsoidParams = null, calibrationOffsets = null, axisGains = null, currentMat: _cm } = opts;

    const currentMat = _cm || ALIGNMENT_MATRICES[currentAlignment] || ALIGNMENT_MATRICES[1];
    const currentInv = mat3transpose(currentMat);

    let proposedMat;
    if (result.alignment === 9 && result.customAngles) {
        proposedMat = eulerToMatrix(result.customAngles.roll, result.customAngles.pitch, result.customAngles.yaw);
    } else {
        proposedMat = ALIGNMENT_MATRICES[result.alignment] || ALIGNMENT_MATRICES[1];
    }
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
            let gcSin = 0,
                gcCos = 0,
                fcSin = 0,
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

                // Proposed alignment heading
                const newBody = mat3mulVec(newCombined, s.mag);
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

                // Gain-corrected heading (experimental)
                if (axisGains && calOffsets) {
                    const gcBody = [
                        (newBody[0] - calOffsets.x) / Math.max(axisGains.x, 0.01),
                        (newBody[1] - calOffsets.y) / Math.max(axisGains.y, 0.01),
                        (newBody[2] - calOffsets.z) / Math.max(axisGains.z, 0.01),
                    ];
                    const gcLevel = undoRollPitch(gcBody, rollRad, pitchRad);
                    const gcDir = Math.atan2(gcLevel[1], gcLevel[0]);
                    gcSin += Math.sin(gcDir);
                    gcCos += Math.cos(gcDir);
                }

                n++;
            }

            const curHeading = Math.atan2(curSin, curCos) * RAD_TO_DEG;
            const newHeading = Math.atan2(newSin, newCos) * RAD_TO_DEG;
            const gcHeading = gcSin !== 0 || gcCos !== 0 ? Math.atan2(gcSin, gcCos) * RAD_TO_DEG : null;
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
                gainCorrectedHeading: gcHeading,
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
        if (d.gainCorrectedHeading != null) {
            d.gcScore = scoreHeading(headingError(d.gainCorrectedHeading, d.expectedHeading));
        }
        if (d.fullCorrectedHeading != null) {
            d.fullCorrectedScore = scoreHeading(headingError(d.fullCorrectedHeading, d.expectedHeading));
        }
        delete d._fieldSum;
        delete d._fieldCount;
    }

    return data;
}
