/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Rotation-matrix helpers shared by the alignment preset detector
 * (magAlignment.ts) and the tilt-alignment solver (magTiltAlign.ts): decompose a
 * rotation into Euler angles and snap a rotation to the nearest standard
 * align_mag preset.
 *
 * Firmware convention (must match exactly): the net transform the firmware applies
 * is ZYX with positive angles, body = Rz(yaw)·Ry(pitch)·Rx(roll)·raw, which is what
 * eulerToMatrix() in magAlignment.ts produces.
 */

import { ALIGNMENT_MATRICES, type Mat3 } from "./magAlignment";
import type { EulerAngles } from "./boardAlignment";
import { radToDeg } from "./common";

/** snapToPreset()'s result: a standard preset, or 9 (custom) with the Euler angles to use. */
export interface PresetSnap {
    alignment: number;
    frobNorm: number;
    customAngles?: EulerAngles;
}

/**
 * Frobenius norm of (a - b). Both are 3x3 matrices (array-of-arrays).
 */
function frobeniusNorm(a: Mat3, b: Mat3): number {
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
 * Inverse of eulerToMatrix() from magAlignment.ts.
 * @param m - 3x3 rotation matrix
 */
export function matrixToEuler(m: Mat3): EulerAngles {
    // ZYX decomposition: m[2][0] = -sin(pitch)
    const pitch = -Math.asin(Math.max(-1, Math.min(1, m[2][0])));

    let roll: number;
    let yaw: number;
    if (Math.abs(Math.cos(pitch)) > 1e-6) {
        roll = Math.atan2(m[2][1], m[2][2]);
        yaw = Math.atan2(m[1][0], m[0][0]);
    } else {
        // Gimbal lock at pitch = +-90 deg
        roll = 0;
        yaw = Math.atan2(-m[0][1], m[1][1]);
    }

    return {
        roll: radToDeg(roll),
        pitch: radToDeg(pitch),
        yaw: radToDeg(yaw),
    };
}

/**
 * Snap a rotation matrix to the nearest of the 8 standard alignment presets.
 * Returns { alignment, frobNorm } for a matched preset, or
 * { alignment: 9, customAngles, frobNorm } when no preset is close enough.
 *
 * @param m - 3x3 rotation matrix
 * @param threshold - Frobenius-norm threshold for preset match
 */
export function snapToPreset(m: Mat3, threshold = 0.1): PresetSnap {
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
