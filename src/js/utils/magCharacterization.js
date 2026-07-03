/**
 * Rotation-matrix helpers shared by the alignment preset detector
 * (magAlignment.js) and the tilt-alignment solver (magTiltAlign.js): decompose a
 * rotation into Euler angles and snap a rotation to the nearest standard
 * align_mag preset.
 *
 * Firmware convention (must match exactly): the net transform the firmware applies
 * is ZYX with positive angles, body = Rz(yaw)·Ry(pitch)·Rx(roll)·raw, which is what
 * eulerToMatrix() in magAlignment.js produces.
 */

import { ALIGNMENT_MATRICES } from "./magAlignment.js";

/**
 * Frobenius norm of (a - b). Both are 3x3 matrices (array-of-arrays).
 * @param {number[][]} a
 * @param {number[][]} b
 * @returns {number}
 */
function frobeniusNorm(a, b) {
    let sum = 0;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const d = a[i][j] - b[i][j];
            sum += d * d;
        }
    }
    return Math.sqrt(sum);
}

/**
 * Decompose a 3x3 rotation matrix into ZYX Euler angles (degrees).
 * Inverse of eulerToMatrix() from magAlignment.js.
 * @param {number[][]} m - 3x3 rotation matrix
 * @returns {{ roll: number, pitch: number, yaw: number }}
 */
export function matrixToEuler(m) {
    // ZYX decomposition: m[2][0] = -sin(pitch)
    const pitch = -Math.asin(Math.max(-1, Math.min(1, m[2][0])));

    let roll, yaw;
    if (Math.abs(Math.cos(pitch)) > 1e-6) {
        roll = Math.atan2(m[2][1], m[2][2]);
        yaw = Math.atan2(m[1][0], m[0][0]);
    } else {
        // Gimbal lock at pitch = +-90 deg
        roll = 0;
        yaw = Math.atan2(-m[0][1], m[1][1]);
    }

    const radToDeg = 180 / Math.PI;
    return {
        roll: roll * radToDeg,
        pitch: pitch * radToDeg,
        yaw: yaw * radToDeg,
    };
}

/**
 * Snap a rotation matrix to the nearest of the 8 standard alignment presets.
 * Returns { alignment, frobNorm } for a matched preset, or
 * { alignment: 9, customAngles, frobNorm } when no preset is close enough.
 *
 * @param {number[][]} m - 3x3 rotation matrix
 * @param {number} [threshold=0.1] - Frobenius-norm threshold for preset match
 * @returns {{ alignment: number, frobNorm: number, customAngles?: object }}
 */
export function snapToPreset(m, threshold = 0.1) {
    let bestAlign = 9;
    let bestNorm = Infinity;

    for (const [alignStr, presetMat] of Object.entries(ALIGNMENT_MATRICES)) {
        const align = Number.parseInt(alignStr, 10);
        const norm = frobeniusNorm(m, presetMat);
        if (norm < bestNorm) {
            bestNorm = norm;
            bestAlign = align;
        }
    }

    if (bestNorm < threshold) {
        return { alignment: bestAlign, frobNorm: bestNorm };
    }

    // No preset close enough — return custom Euler angles
    const angles = matrixToEuler(m);
    return { alignment: 9, customAngles: angles, frobNorm: bestNorm };
}
