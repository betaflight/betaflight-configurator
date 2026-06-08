/**
 * Ellipsoid fitter for magnetometer diagnostics.
 *
 * Fits a 3D ellipsoid to body-frame mag samples via linear least-squares.
 * Extracts eigenvalues (for condition number — gain asymmetry detection),
 * determinant (for chirality detection), and off-diagonal terms
 * (for mounting skew detection).
 *
 * Based on the algebraic quadric fit from gemini-code-1780936799385.js.
 *
 * See implementation.md section 23 for the diagnostic framework.
 */

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fit an ellipsoid to 3D point cloud.
 * Returns diagnostic metrics, not a full correction matrix.
 *
 * @param {Array<{x: number, y: number, z: number}>} samples
 * @returns {{
 *   hardIron: {x:number,y:number,z:number},
 *   conditionNumber: number,
 *   determinant: number,
 *   chirality: 'right-handed'|'left-handed',
 *   offDiagonalRms: number,
 *   eigenvalues: [number,number,number],
 *   residualRms: number
 * } | null}
 */
export function fitEllipsoid(samples) {
    if (samples.length < 9) {
        return null;
    }

    // Normalize coordinates to improve numerical stability with large ADC values
    const cx = samples.reduce((s, p) => s + p.x, 0) / samples.length;
    const cy = samples.reduce((s, p) => s + p.y, 0) / samples.length;
    const cz = samples.reduce((s, p) => s + p.z, 0) / samples.length;
    const scale =
        Math.sqrt(
            samples.reduce((s, p) => s + (p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2, 0) / samples.length,
        ) || 1;
    const norm = samples.map((s) => ({ x: (s.x - cx) / scale, y: (s.y - cy) / scale, z: (s.z - cz) / scale }));

    const N = norm.length;

    // Design matrix columns: [x², y², z², 2yz, 2xz, 2xy, 2x, 2y, 2z]
    // Equation: ax² + by² + cz² + 2dyz + 2exz + 2fxy + 2gx + 2hy + 2iz = 1
    const D = [];
    const Y = new Array(N).fill(1.0);

    for (let i = 0; i < N; i++) {
        const { x, y, z } = norm[i];
        D.push([
            x * x, // a
            y * y, // b
            z * z, // c
            2.0 * y * z, // d
            2.0 * x * z, // e
            2.0 * x * y, // f
            2.0 * x, // g
            2.0 * y, // h
            2.0 * z, // i
        ]);
    }

    // Normal equations: (D^T * D) * v = D^T * Y
    const DtD = Array.from({ length: 9 }, () => new Array(9).fill(0));
    const DtY = new Array(9).fill(0);

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            let sum = 0;
            for (let i = 0; i < N; i++) {
                sum += D[i][r] * D[i][c];
            }
            DtD[r][c] = sum;
        }
        let sumY = 0;
        for (let i = 0; i < N; i++) {
            sumY += D[i][r] * Y[i];
        }
        DtY[r] = sumY;
    }

    const v = solveGaussian(DtD, DtY);
    if (!v) {
        return null;
    }

    // Reconstruct quadric matrices from normalized data
    // Q = [ a  f  e ]
    //     [ f  b  d ]
    //     [ e  d  c ]
    const Q = [
        [v[0], v[5], v[4]],
        [v[5], v[1], v[3]],
        [v[4], v[3], v[2]],
    ];
    const L = [v[6], v[7], v[8]];

    // Hard iron bias: B = -Q^-1 * L (in normalized space, then denormalize)
    const Qinv = matrixInvert3x3(Q);
    if (!Qinv) {
        return null;
    }
    const hardIronNorm = {
        x: -(Qinv[0][0] * L[0] + Qinv[0][1] * L[1] + Qinv[0][2] * L[2]),
        y: -(Qinv[1][0] * L[0] + Qinv[1][1] * L[1] + Qinv[1][2] * L[2]),
        z: -(Qinv[2][0] * L[0] + Qinv[2][1] * L[1] + Qinv[2][2] * L[2]),
    };
    // Denormalize hard iron
    const hardIron = {
        x: hardIronNorm.x * scale + cx,
        y: hardIronNorm.y * scale + cy,
        z: hardIronNorm.z * scale + cz,
    };

    // Normalize Q: M = Q / k where k = 1 + B^T * Q * B
    const BtQ = [
        hardIron.x * Q[0][0] + hardIron.y * Q[1][0] + hardIron.z * Q[2][0],
        hardIron.x * Q[0][1] + hardIron.y * Q[1][1] + hardIron.z * Q[2][1],
        hardIron.x * Q[0][2] + hardIron.y * Q[1][2] + hardIron.z * Q[2][2],
    ];
    const k = 1.0 + (BtQ[0] * hardIron.x + BtQ[1] * hardIron.y + BtQ[2] * hardIron.z);
    const M = Q.map((row) => row.map((val) => val / k));

    // Eigenvalues of M: solve cubic characteristic polynomial
    const eigenvalues = eigenvalues3x3(M);
    if (!eigenvalues) {
        return null;
    }

    // Condition number
    const lmin = Math.min(...eigenvalues.map(Math.abs));
    const lmax = Math.max(...eigenvalues.map(Math.abs));
    const conditionNumber = lmin > 1e-10 ? lmax / lmin : Infinity;

    // Determinant
    const det = determinant3x3(M);

    // Off-diagonal RMS (normalized by trace)
    const trace = M[0][0] + M[1][1] + M[2][2];
    const offDiagRms =
        trace > 1e-10 ? Math.sqrt(M[0][1] * M[0][1] + M[0][2] * M[0][2] + M[1][2] * M[1][2]) / Math.abs(trace) : 0;

    // Residual RMS
    let residualSum = 0;
    for (let i = 0; i < N; i++) {
        const { x, y, z } = samples[i];
        const dx = x - hardIron.x;
        const dy = y - hardIron.y;
        const dz = z - hardIron.z;
        // Apply Q to get corrected vector; should be on unit sphere
        const cx = Q[0][0] * dx + Q[0][1] * dy + Q[0][2] * dz;
        const cy = Q[1][0] * dx + Q[1][1] * dy + Q[1][2] * dz;
        const cz = Q[2][0] * dx + Q[2][1] * dy + Q[2][2] * dz;
        const rSq = cx * cx + cy * cy + cz * cz;
        residualSum += (1.0 - rSq) * (1.0 - rSq);
    }

    return {
        hardIron,
        conditionNumber,
        determinant: det,
        chirality: det >= 0 ? "right-handed" : "left-handed",
        offDiagonalRms: offDiagRms,
        eigenvalues,
        residualRms: Math.sqrt(residualSum / N),
    };
}

// ── Linear algebra helpers ──────────────────────────────────────────────────

function solveGaussian(A, B) {
    const n = B.length;
    const M = A.map((row) => [...row]); // copy
    const b = [...B];
    for (let i = 0; i < n; i++) {
        // Partial pivot
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
                maxRow = k;
            }
        }
        [M[i], M[maxRow]] = [M[maxRow], M[i]];
        [b[i], b[maxRow]] = [b[maxRow], b[i]];

        if (Math.abs(M[i][i]) < 1e-14) {
            return null;
        }

        for (let k = i + 1; k < n; k++) {
            const factor = M[k][i] / M[i][i];
            b[k] -= factor * b[i];
            for (let j = i; j < n; j++) {
                M[k][j] -= factor * M[i][j];
            }
        }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) {
            sum += M[i][j] * x[j];
        }
        x[i] = (b[i] - sum) / M[i][i];
    }
    return x;
}

function matrixInvert3x3(m) {
    const det = determinant3x3(m);
    if (Math.abs(det) < 1e-14) {
        return null;
    }
    const invdet = 1.0 / det;
    return [
        [
            (m[1][1] * m[2][2] - m[2][1] * m[1][2]) * invdet,
            (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * invdet,
            (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * invdet,
        ],
        [
            (m[1][2] * m[2][0] - m[1][0] * m[2][2]) * invdet,
            (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * invdet,
            (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * invdet,
        ],
        [
            (m[1][0] * m[2][1] - m[2][0] * m[1][1]) * invdet,
            (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * invdet,
            (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * invdet,
        ],
    ];
}

function determinant3x3(m) {
    return (
        m[0][0] * (m[1][1] * m[2][2] - m[2][1] * m[1][2]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    );
}

/**
 * Eigenvalues of a 3×3 symmetric matrix via characteristic polynomial.
 * det(M - λI) = -λ³ + trace(M)λ² - ½(tr(M)² - tr(M²))λ + det(M)
 * Solved via Cardano's formula for depressed cubic.
 */
function eigenvalues3x3(m) {
    const tr = m[0][0] + m[1][1] + m[2][2];
    const tr2 = tr * tr;
    const m2 = [
        m[0][0] * m[0][0] + m[0][1] * m[1][0] + m[0][2] * m[2][0],
        m[0][0] * m[0][1] + m[0][1] * m[1][1] + m[0][2] * m[2][1],
        m[0][0] * m[0][2] + m[0][1] * m[1][2] + m[0][2] * m[2][2],
    ];
    // tr(M²) = sum of diagonal of M*M
    const trM2 =
        m2[0] +
        (m[1][0] * m[0][1] + m[1][1] * m[1][1] + m[1][2] * m[2][1]) +
        (m[2][0] * m[0][2] + m[2][1] * m[1][2] + m[2][2] * m[2][2]);
    const det = determinant3x3(m);

    // Coefficients of λ³ + aλ² + bλ + c = 0
    const a = -tr;
    const b = 0.5 * (tr2 - trM2);
    const c = -det;

    // Depressed cubic: t³ + pt + q = 0
    const p = b - (a * a) / 3.0;
    const q = (2.0 * a * a * a) / 27.0 - (a * b) / 3.0 + c;

    // Discriminant
    const disc = (q * q) / 4.0 + (p * p * p) / 27.0;

    const shift = a / 3.0;
    let roots;

    if (disc > 1e-12) {
        // One real root
        const sqrtD = Math.sqrt(disc);
        const u = Math.cbrt(-q / 2.0 + sqrtD);
        const v = Math.cbrt(-q / 2.0 - sqrtD);
        const t1 = u + v;
        roots = [t1 - shift, t1 - shift, t1 - shift]; // placeholder for complex pair
    } else if (Math.abs(disc) < 1e-12) {
        // Multiple roots
        const u = Math.cbrt(-q / 2.0);
        roots = [2 * u - shift, -u - shift, -u - shift];
    } else {
        // Three real roots (trigonometric solution)
        const r = Math.sqrt((-p * p * p) / 27.0);
        const phi = Math.acos(-q / (2.0 * r));
        const root1 = 2.0 * Math.cbrt(r) * Math.cos(phi / 3.0) - shift;
        const root2 = 2.0 * Math.cbrt(r) * Math.cos((phi + 2.0 * Math.PI) / 3.0) - shift;
        const root3 = 2.0 * Math.cbrt(r) * Math.cos((phi + 4.0 * Math.PI) / 3.0) - shift;
        roots = [root1, root2, root3];
    }

    return roots.filter((r) => Number.isFinite(r));
}
