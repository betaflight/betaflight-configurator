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

/**
 * Accumulate design-matrix normal equations for one point.
 * Updates DtD (upper triangle) and DtY in-place.
 */
function accumulatePoint(DtD, DtY, x, y, z) {
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
 * @param {Array<{x,y,z}>} points
 * @param {number[]} bias - [bx, by, bz] hard-iron center
 * @param {number[][]} W_inv - 3×3 soft-iron correction matrix
 * @returns {{ radius: number, residual: number }}
 */
function computeRadiusAndResidual(points, bias, W_inv) {
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
 * @param {Array<{x:number,y:number,z:number}>} points
 * @returns {{ center: {x,y,z}, W_inv: number[3][3], radius: number, residual: number } | null}
 */
export function fitEllipsoid(points) {
    const N = points.length;
    if (N < 9) {
        return null;
    }

    // Accumulate D^T*D (9×9) and D^T*Y (9×1) directly to avoid large N×9 matrix
    const DtD = Array.from({ length: 9 }, () => new Float64Array(9));
    const DtY = new Float64Array(9);

    for (const { x, y, z } of points) {
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

    const { radius, residual } = computeRadiusAndResidual(points, bias, W_inv);
    return { center: { x: bias[0], y: bias[1], z: bias[2] }, W_inv, radius, residual };
}

/**
 * Apply ellipsoid correction to a raw sensor reading.
 * m_clean = W_inv * (m_raw - center)
 *
 * @param {number[3]} raw - Raw mag reading [x, y, z]
 * @param {{ center: {x,y,z}, W_inv: number[3][3] }} params
 * @returns {number[3]}
 */
export function applyEllipsoidCorrection(raw, params) {
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
function findPivot9(aug, col) {
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
function eliminateBelow9(aug, col) {
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
 * Same pattern as sphereFit.js solveGaussian, extended to 9×9.
 *
 * @param {number[9][9]} A - coefficient matrix (modified in-place)
 * @param {Float64Array} b - right-hand side (modified in-place)
 * @returns {Float64Array|null} solution vector x
 */
function solve9x9(A, b) {
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
 *
 * @param {number[3][3]} m
 * @returns {number[3][3]|null}
 */
function invert3x3(m) {
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
 *
 * @param {number[3][3]} Q
 * @returns {number[3][3]|null}
 */
function cholesky3x3(Q) {
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
