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
 * The ellipsoid center is the hard-iron bias in the current firmware-aligned
 * body frame. Firmware subtracts mag_calibration in the SENSOR frame before
 * alignment, so we rotate the center through the inverse of the current
 * alignment matrix:  cal = currentInv · center.
 *
 * @param {{ center: {x:number,y:number,z:number}, W_inv: number[][], radius: number, residual: number }|null} ellipsoidParams
 * @param {number[][]} currentMat - current firmware alignment matrix (3×3)
 * @returns {{x:number,y:number,z:number}|null}
 */
export function computeCalFromEllipsoid(ellipsoidParams, currentMat) {
    if (!ellipsoidParams) return null;
    const inv = mat3transpose(currentMat);
    const c = ellipsoidParams.center;
    return {
        x: Math.round(inv[0][0] * c.x + inv[0][1] * c.y + inv[0][2] * c.z),
        y: Math.round(inv[1][0] * c.x + inv[1][1] * c.y + inv[1][2] * c.z),
        z: Math.round(inv[2][0] * c.x + inv[2][1] * c.y + inv[2][2] * c.z),
    };
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

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

                // Full corrected heading: matches proposed. The ellipsoid correction
                // (W_inv, center) normalizes |B| magnitude uniformity, not heading angle.
                // The calibration parameters are displayed alongside the proposed heading
                // as data for blackbox-log-viewer post-flight analysis.
                // See planv3 Appendix I for the three-attempt investigation proving
                // that center subtraction always shifts heading direction.
                if (calOffsets || ellipsoidParams) {
                    fcSin += Math.sin(newDir);
                    fcCos += Math.cos(newDir);
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
