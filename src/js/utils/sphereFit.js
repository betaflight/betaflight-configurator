/**
 * Least-squares sphere fitting using the algebraic method.
 *
 * Given N 3D points, finds the center (a, b, c) and radius r that minimizes
 * the sum of squared residuals from the sphere surface.
 *
 * The problem is linearized by expanding (x-a)² + (y-b)² + (z-c)² = r²
 * into: x² + y² + z² = 2ax + 2by + 2cz + (r² - a² - b² - c²)
 * which is linear in unknowns [a, b, c, d] where d = r² - a² - b² - c².
 *
 * This gives the normal equations A^T A [a,b,c,d]^T = A^T b
 * solved via Gaussian elimination (no iterative solver needed).
 *
 * @param {Array<{x: number, y: number, z: number}>} points - Input points (minimum 4)
 * @returns {{ center: {x: number, y: number, z: number}, radius: number, residual: number } | null}
 *   Returns null if fewer than 4 points or the system is singular.
 */
export function fitSphere(points) {
    if (points.length < 4) {
        return null;
    }

    const n = points.length;

    // Build normal equations: A^T A * params = A^T b
    // where A row = [2x, 2y, 2z, 1] and b row = x² + y² + z²
    // params = [a, b, c, d] where center=(a,b,c), d = r² - a² - b² - c²

    let sumX = 0,
        sumY = 0,
        sumZ = 0;
    let sumXX = 0,
        sumYY = 0,
        sumZZ = 0;
    let sumXY = 0,
        sumXZ = 0,
        sumYZ = 0;
    let sumXXX = 0,
        sumYYY = 0,
        sumZZZ = 0;
    let sumXYY = 0,
        sumXZZ = 0;
    let sumYXX = 0,
        sumYZZ = 0;
    let sumZXX = 0,
        sumZYY = 0;
    let sumS = 0; // sum of x² + y² + z²

    for (let i = 0; i < n; i++) {
        const { x, y, z } = points[i];
        const xx = x * x;
        const yy = y * y;
        const zz = z * z;
        const s = xx + yy + zz;

        sumX += x;
        sumY += y;
        sumZ += z;
        sumXX += xx;
        sumYY += yy;
        sumZZ += zz;
        sumXY += x * y;
        sumXZ += x * z;
        sumYZ += y * z;
        sumXXX += x * xx;
        sumYYY += y * yy;
        sumZZZ += z * zz;
        sumXYY += x * yy;
        sumXZZ += x * zz;
        sumYXX += y * xx;
        sumYZZ += y * zz;
        sumZXX += z * xx;
        sumZYY += z * yy;
        sumS += s;
    }

    // Normal equations matrix (4x5 augmented matrix)
    // Row 0: 4*sumXX, 4*sumXY, 4*sumXZ, 2*sumX | 2*(sumXXX + sumXYY + sumXZZ)
    // Row 1: 4*sumXY, 4*sumYY, 4*sumYZ, 2*sumY | 2*(sumYXX + sumYYY + sumYZZ)
    // Row 2: 4*sumXZ, 4*sumYZ, 4*sumZZ, 2*sumZ | 2*(sumZXX + sumZYY + sumZZZ)
    // Row 3: 2*sumX,  2*sumY,  2*sumZ,  n       | sumS
    const matrix = [
        [4 * sumXX, 4 * sumXY, 4 * sumXZ, 2 * sumX, 2 * (sumXXX + sumXYY + sumXZZ)],
        [4 * sumXY, 4 * sumYY, 4 * sumYZ, 2 * sumY, 2 * (sumYXX + sumYYY + sumYZZ)],
        [4 * sumXZ, 4 * sumYZ, 4 * sumZZ, 2 * sumZ, 2 * (sumZXX + sumZYY + sumZZZ)],
        [2 * sumX, 2 * sumY, 2 * sumZ, n, sumS],
    ];

    // Gaussian elimination with partial pivoting
    const rows = 4;
    const cols = 5;
    for (let col = 0; col < rows; col++) {
        // Find pivot
        let maxVal = Math.abs(matrix[col][col]);
        let maxRow = col;
        for (let row = col + 1; row < rows; row++) {
            const val = Math.abs(matrix[row][col]);
            if (val > maxVal) {
                maxVal = val;
                maxRow = row;
            }
        }

        if (maxVal < 1e-12) {
            return null; // Singular matrix
        }

        // Swap rows
        if (maxRow !== col) {
            [matrix[col], matrix[maxRow]] = [matrix[maxRow], matrix[col]];
        }

        // Eliminate below
        for (let row = col + 1; row < rows; row++) {
            const factor = matrix[row][col] / matrix[col][col];
            for (let j = col; j < cols; j++) {
                matrix[row][j] -= factor * matrix[col][j];
            }
        }
    }

    // Back substitution
    const params = new Array(rows);
    for (let row = rows - 1; row >= 0; row--) {
        let sum = matrix[row][cols - 1];
        for (let col = row + 1; col < rows; col++) {
            sum -= matrix[row][col] * params[col];
        }
        params[row] = sum / matrix[row][row];
    }

    const [a, b, c, d] = params;
    const radiusSq = d + a * a + b * b + c * c;

    if (radiusSq <= 0) {
        return null;
    }

    const radius = Math.sqrt(radiusSq);

    // Compute RMS residual (distance from each point to sphere surface)
    let sumResidualSq = 0;
    for (let i = 0; i < n; i++) {
        const { x, y, z } = points[i];
        const dist = Math.sqrt((x - a) ** 2 + (y - b) ** 2 + (z - c) ** 2);
        const err = dist - radius;
        sumResidualSq += err * err;
    }
    const residual = Math.sqrt(sumResidualSq / n);

    return {
        center: { x: a, y: b, z: c },
        radius,
        residual,
    };
}

/**
 * Classify points into 6 directional zones relative to a center point.
 * Zones correspond to the 6 faces of a cube: +X, -X, +Y, -Y, +Z, -Z.
 * Each point is assigned to the zone of its dominant axis direction from center.
 *
 * @param {Array<{x: number, y: number, z: number}>} points
 * @param {{x: number, y: number, z: number}} center
 * @returns {{ zones: Object<string, number>, total: number, uniform: number }}
 *   zones: count per zone, total: total classified points, uniform: 0-1 score (1 = perfectly uniform)
 */
export function computeCoverage(points, center) {
    const zones = { "+X": 0, "-X": 0, "+Y": 0, "-Y": 0, "+Z": 0, "-Z": 0 };

    for (let i = 0; i < points.length; i++) {
        const dx = points[i].x - center.x;
        const dy = points[i].y - center.y;
        const dz = points[i].z - center.z;

        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        const az = Math.abs(dz);

        if (ax >= ay && ax >= az) {
            zones[dx >= 0 ? "+X" : "-X"]++;
        } else if (ay >= ax && ay >= az) {
            zones[dy >= 0 ? "+Y" : "-Y"]++;
        } else {
            zones[dz >= 0 ? "+Z" : "-Z"]++;
        }
    }

    const total = points.length;
    const zoneValues = Object.values(zones);
    const filledZones = zoneValues.filter((c) => c > 0).length;

    // Uniformity: ratio of min-populated zone to max-populated zone (among non-empty)
    // Score 0-1 where 1 means all zones have equal counts
    let uniform = 0;
    if (filledZones > 0) {
        const nonZero = zoneValues.filter((c) => c > 0);
        const min = Math.min(...nonZero);
        const max = Math.max(...nonZero);
        uniform = max > 0 ? (min / max) * (filledZones / 6) : 0;
    }

    return { zones, total, uniform };
}
