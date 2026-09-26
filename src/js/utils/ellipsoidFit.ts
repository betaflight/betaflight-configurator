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
 * 3D ellipsoid fit via algebraic least-squares + Cholesky decomposition.
 *
 * General ellipsoid:  (m - b)^T * Q * (m - b) = R^2
 * Expanded:           A*x^2 + B*y^2 + C*z^2 + 2*D*xy + 2*E*xz + 2*F*yz
 *                     + 2*G*x + 2*H*y + 2*I*z = 1
 *
 * 9 unknowns [A,B,C,D,E,F,G,H,I].  Design matrix D is N×9, target Y is N×1 of 1s.
 * Solve (D^T*D) * p = D^T*Y.  Reconstruct Q, extract bias = -inv(Q)*u,
 * normalize Q, Cholesky → W_inv (upper-triangular soft-iron calibration matrix).
 *
 * Requires >= 9 non-coplanar points.  Returns null on failure.
 */

import type { Point3 } from "./sphereFit";

type Mat3 = number[][];

export interface EllipsoidFit {
    center: Point3;
    /** Upper-triangular soft-iron correction: |W_inv·(m − center)| = 1 on the ellipsoid. */
    W_inv: Mat3;
    radius: number;
    residual: number;
}

/**
 * Accumulate design-matrix normal equations for one point.
 * Updates DtD (upper triangle) and DtY in-place.
 */
function accumulatePoint(DtD: Float64Array[], DtY: Float64Array, x: number, y: number, z: number): void {
    const xx = x * x,
        yy = y * y,
        zz = z * z;
    const row = [xx, yy, zz, 2 * x * y, 2 * x * z, 2 * y * z, 2 * x, 2 * y, 2 * z];
    for (let r = 0; r < 9; r++) {
        for (let c = r; c < 9; c++) {
            DtD[r][c] += row[r] * row[c];
        }
        DtY[r] += row[r];
    }
}

/**
 * Compute radius (mean corrected magnitude) and RMS residual from the fit.
 * @param bias - [bx, by, bz] hard-iron center
 * @param W_inv - 3×3 soft-iron correction matrix
 */
function computeRadiusAndResidual(points: Point3[], bias: number[], W_inv: Mat3): { radius: number; residual: number } {
    let sumR = 0;
    let sumResid = 0;
    for (const { x, y, z } of points) {
        const dx = x - bias[0],
            dy = y - bias[1],
            dz = z - bias[2];
        const cx = W_inv[0][0] * dx + W_inv[0][1] * dy + W_inv[0][2] * dz;
        const cy = W_inv[1][0] * dx + W_inv[1][1] * dy + W_inv[1][2] * dz;
        const cz = W_inv[2][0] * dx + W_inv[2][1] * dy + W_inv[2][2] * dz;
        const r = Math.hypot(cx, cy, cz);
        sumR += r;
        const err = r - 1;
        sumResid += err * err;
    }
    const N = points.length;
    return { radius: sumR / N, residual: Math.sqrt(sumResid / N) };
}

/**
 * Fit a 3D ellipsoid to a set of points.
 *
 * The algebraic form fixes the quadric's constant term, which only describes an
 * ellipsoid while the origin lies inside it. Raw magnetometer data with a hard-iron
 * bias larger than the field puts the origin outside, so the fit runs on points
 * centered on their centroid (always inside, since the samples lie on the ellipsoid)
 * and the centroid is added back to the center.
 */
export function fitEllipsoid(points: Point3[]): EllipsoidFit | null {
    const N = points.length;
    if (N < 9) {
        return null;
    }

    let mx = 0,
        my = 0,
        mz = 0;
    for (const { x, y, z } of points) {
        mx += x / N;
        my += y / N;
        mz += z / N;
    }
    const centered = points.map(({ x, y, z }) => ({ x: x - mx, y: y - my, z: z - mz }));

    // Accumulate D^T*D (9×9) and D^T*Y (9×1) directly to avoid large N×9 matrix
    const DtD = Array.from({ length: 9 }, () => new Float64Array(9));
    const DtY = new Float64Array(9);

    for (const { x, y, z } of centered) {
        accumulatePoint(DtD, DtY, x, y, z);
    }

    // Fill lower triangle of DtD
    for (let r = 1; r < 9; r++) {
        for (let c = 0; c < r; c++) {
            DtD[r][c] = DtD[c][r];
        }
    }

    // Solve 9×9 linear system DtD * p = DtY via Gaussian elimination with partial pivoting
    const p = solve9x9(DtD, DtY);
    if (!p) {
        return null;
    }

    const A = p[0],
        B = p[1],
        C = p[2];
    const D = p[3],
        E = p[4],
        F = p[5];
    const G = p[6],
        H = p[7],
        I = p[8];

    // Reconstruct shape matrix Q (3×3) and linear vector u (3×1)
    const Q = [
        [A, D, E],
        [D, B, F],
        [E, F, C],
    ];
    const u = [G, H, I];

    // Extract hard-iron bias: b = -inv(Q) * u
    const Q_inv = invert3x3(Q);
    if (!Q_inv) {
        return null;
    }

    const bias = [
        -(Q_inv[0][0] * u[0] + Q_inv[0][1] * u[1] + Q_inv[0][2] * u[2]),
        -(Q_inv[1][0] * u[0] + Q_inv[1][1] * u[1] + Q_inv[1][2] * u[2]),
        -(Q_inv[2][0] * u[0] + Q_inv[2][1] * u[1] + Q_inv[2][2] * u[2]),
    ];

    // Normalize Q: offset = 1 + b^T*Q*b, Q_norm = Q / offset
    const bx = bias[0],
        by = bias[1],
        bz = bias[2];
    const bQb =
        bx * (Q[0][0] * bx + Q[0][1] * by + Q[0][2] * bz) +
        by * (Q[1][0] * bx + Q[1][1] * by + Q[1][2] * bz) +
        bz * (Q[2][0] * bx + Q[2][1] * by + Q[2][2] * bz);
    const offset = 1.0 + bQb;
    if (offset <= 0) {
        return null;
    }

    const Q_norm = [
        [Q[0][0] / offset, Q[0][1] / offset, Q[0][2] / offset],
        [Q[1][0] / offset, Q[1][1] / offset, Q[1][2] / offset],
        [Q[2][0] / offset, Q[2][1] / offset, Q[2][2] / offset],
    ];

    // Cholesky decomposition: Q_norm = L * L^T
    // W_inv = L^T (the upper-triangular Cholesky factor), so that
    // |W_inv·(m−b)|² = (m−b)ᵀ·L·Lᵀ·(m−b) = (m−b)ᵀ·Q_norm·(m−b) = 1.
    // L is lower-triangular: its off-diagonal terms live at [1][0], [2][0], [2][1].
    const L = cholesky3x3(Q_norm);
    if (!L) {
        return null;
    }

    // cholesky3x3 already guarantees L[0][0], L[1][1], L[2][2] > 0
    // (it returns null for any non-positive pivot), so no further negativity check is needed.
    const W_inv = [
        [L[0][0], L[1][0], L[2][0]],
        [0, L[1][1], L[2][1]],
        [0, 0, L[2][2]],
    ];

    const { radius, residual } = computeRadiusAndResidual(centered, bias, W_inv);
    return { center: { x: bias[0] + mx, y: bias[1] + my, z: bias[2] + mz }, W_inv, radius, residual };
}

/**
 * Apply ellipsoid correction to a raw sensor reading.
 * m_clean = W_inv * (m_raw - center)
 *
 * @param raw - Raw mag reading [x, y, z]
 */
export function applyEllipsoidCorrection(raw: number[], params: Pick<EllipsoidFit, "center" | "W_inv">): number[] {
    const { center, W_inv } = params;
    const dx = raw[0] - center.x;
    const dy = raw[1] - center.y;
    const dz = raw[2] - center.z;
    return [
        W_inv[0][0] * dx + W_inv[0][1] * dy + W_inv[0][2] * dz,
        W_inv[1][0] * dx + W_inv[1][1] * dy + W_inv[1][2] * dz,
        W_inv[2][0] * dx + W_inv[2][1] * dy + W_inv[2][2] * dz,
    ];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Find the row with the largest absolute value in column `col`, starting from `col`. */
function findPivot9(aug: Float64Array[], col: number): { maxVal: number; maxRow: number } {
    let maxVal = Math.abs(aug[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < 9; row++) {
        const val = Math.abs(aug[row][col]);
        if (val > maxVal) {
            maxVal = val;
            maxRow = row;
        }
    }
    return { maxVal, maxRow };
}

/** Eliminate all rows below `col` using the pivot at aug[col][col]. */
function eliminateBelow9(aug: Float64Array[], col: number): void {
    const pivot = aug[col][col];
    for (let row = col + 1; row < 9; row++) {
        const factor = aug[row][col] / pivot;
        for (let c = col; c <= 9; c++) {
            aug[row][c] -= factor * aug[col][c];
        }
    }
}

/**
 * Solve 9×9 system with partial pivoting.  Returns null if singular.
 * Same pattern as sphereFit.ts solveGaussian, extended to 9×9.
 *
 * @param A - coefficient matrix
 * @param b - right-hand side
 * @returns solution vector x
 */
function solve9x9(A: Float64Array[], b: Float64Array): Float64Array | null {
    const n = 9;
    // Build augmented matrix [A|b]
    const aug = Array.from({ length: n }, (_, r) => {
        const row = new Float64Array(n + 1);
        for (let c = 0; c < n; c++) {
            row[c] = A[r][c];
        }
        row[n] = b[r];
        return row;
    });

    // Forward elimination with partial pivoting
    for (let col = 0; col < n; col++) {
        const { maxVal, maxRow } = findPivot9(aug, col);
        if (maxVal < 1e-12) {
            return null; // Singular
        }
        if (maxRow !== col) {
            const tmp = aug[col];
            aug[col] = aug[maxRow];
            aug[maxRow] = tmp;
        }
        eliminateBelow9(aug, col);
    }

    // Back substitution
    const x = new Float64Array(n);
    for (let row = n - 1; row >= 0; row--) {
        let sum = aug[row][n];
        for (let col = row + 1; col < n; col++) {
            sum -= aug[row][col] * x[col];
        }
        x[row] = sum / aug[row][row];
    }

    return x;
}

/**
 * 3×3 matrix inverse via cofactors.  Returns null if det ≈ 0.
 */
function invert3x3(m: Mat3): Mat3 | null {
    const a = m[0][0],
        b = m[0][1],
        c = m[0][2];
    const d = m[1][0],
        e = m[1][1],
        f = m[1][2];
    const g = m[2][0],
        h = m[2][1],
        i = m[2][2];

    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (Math.abs(det) < 1e-24) {
        return null;
    }

    const invDet = 1 / det;
    return [
        [(e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet],
        [(f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet],
        [(d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet],
    ];
}

/**
 * Cholesky-Banachiewicz 3×3 decomposition: Q = L * L^T.
 * L is lower-triangular.  Returns null if Q is not positive-definite.
 */
function cholesky3x3(Q: Mat3): Mat3 | null {
    const L = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ];

    // Each pivot must be a finite positive number. A non-positive-definite Q drives
    // the sqrt radicand to zero/negative (→ 0 or NaN), and a pathological input could
    // overflow to Infinity; `Number.isFinite(x) && x > 0` rejects NaN, ±Infinity, zero
    // and negatives alike (i.e. non-positive-definite or degenerate Q).
    L[0][0] = Math.sqrt(Q[0][0]);
    if (!(Number.isFinite(L[0][0]) && L[0][0] > 0)) {
        return null;
    }

    L[1][0] = Q[1][0] / L[0][0];
    L[2][0] = Q[2][0] / L[0][0];

    L[1][1] = Math.sqrt(Q[1][1] - L[1][0] * L[1][0]);
    if (!(Number.isFinite(L[1][1]) && L[1][1] > 0)) {
        return null;
    }

    L[2][1] = (Q[2][1] - L[2][0] * L[1][0]) / L[1][1];

    L[2][2] = Math.sqrt(Q[2][2] - L[2][0] * L[2][0] - L[2][1] * L[2][1]);
    if (!(Number.isFinite(L[2][2]) && L[2][2] > 0)) {
        return null;
    }

    return L;
}
