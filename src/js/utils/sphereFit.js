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

    // Pre-subtract centroid for numerical stability with large coordinates
    const centroid = computeCentroid(points);
    const centered = points.map((p) => ({
        x: p.x - centroid.x,
        y: p.y - centroid.y,
        z: p.z - centroid.z,
    }));

    const matrix = buildNormalEquations(centered);
    const params = solveGaussian(matrix, 4, 5);
    if (!params) {
        return null;
    }

    const [a, b, c, d] = params;
    const radiusSq = d + a * a + b * b + c * c;

    if (radiusSq <= 0) {
        return null;
    }

    const radius = Math.sqrt(radiusSq);
    // Translate center back to original coordinate system
    const cx = a + centroid.x;
    const cy = b + centroid.y;
    const cz = c + centroid.z;
    const residual = computeResidual(points, cx, cy, cz, radius);

    return {
        center: { x: cx, y: cy, z: cz },
        radius,
        residual,
    };
}

function computeCentroid(points) {
    let sx = 0,
        sy = 0,
        sz = 0;
    for (const { x, y, z } of points) {
        sx += x;
        sy += y;
        sz += z;
    }
    const n = points.length;
    return { x: sx / n, y: sy / n, z: sz / n };
}

function buildNormalEquations(points) {
    const n = points.length;

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
    let sumS = 0;

    for (const { x, y, z } of points) {
        const xx = x * x;
        const yy = y * y;
        const zz = z * z;

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
        sumS += xx + yy + zz;
    }

    return [
        [4 * sumXX, 4 * sumXY, 4 * sumXZ, 2 * sumX, 2 * (sumXXX + sumXYY + sumXZZ)],
        [4 * sumXY, 4 * sumYY, 4 * sumYZ, 2 * sumY, 2 * (sumYXX + sumYYY + sumYZZ)],
        [4 * sumXZ, 4 * sumYZ, 4 * sumZZ, 2 * sumZ, 2 * (sumZXX + sumZYY + sumZZZ)],
        [2 * sumX, 2 * sumY, 2 * sumZ, n, sumS],
    ];
}

/**
 * Gaussian elimination with partial pivoting on an augmented matrix.
 * @returns {Array<number>|null} Solution vector or null if singular.
 */
function solveGaussian(matrix, rows, cols) {
    for (let col = 0; col < rows; col++) {
        const pivotRow = findPivotRow(matrix, col, rows);
        if (Math.abs(matrix[pivotRow][col]) < 1e-12) {
            return null;
        }
        if (pivotRow !== col) {
            [matrix[col], matrix[pivotRow]] = [matrix[pivotRow], matrix[col]];
        }
        eliminateBelow(matrix, col, rows, cols);
    }

    return backSubstitute(matrix, rows, cols);
}

function findPivotRow(matrix, col, rows) {
    let maxVal = Math.abs(matrix[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < rows; row++) {
        const val = Math.abs(matrix[row][col]);
        if (val > maxVal) {
            maxVal = val;
            maxRow = row;
        }
    }
    return maxRow;
}

function eliminateBelow(matrix, col, rows, cols) {
    for (let row = col + 1; row < rows; row++) {
        const factor = matrix[row][col] / matrix[col][col];
        for (let j = col; j < cols; j++) {
            matrix[row][j] -= factor * matrix[col][j];
        }
    }
}

function backSubstitute(matrix, rows, cols) {
    const params = new Array(rows);
    for (let row = rows - 1; row >= 0; row--) {
        let sum = matrix[row][cols - 1];
        for (let col = row + 1; col < rows; col++) {
            sum -= matrix[row][col] * params[col];
        }
        params[row] = sum / matrix[row][row];
    }
    return params;
}

function computeResidual(points, a, b, c, radius) {
    let sumResidualSq = 0;
    for (const { x, y, z } of points) {
        const dist = Math.hypot(x - a, y - b, z - c);
        const err = dist - radius;
        sumResidualSq += err * err;
    }
    return Math.sqrt(sumResidualSq / points.length);
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

    for (const pt of points) {
        const zone = classifyZone(pt, center);
        zones[zone]++;
    }

    const total = points.length;
    const zoneValues = Object.values(zones);
    const nonZero = zoneValues.filter((c) => c > 0);

    let uniform = 0;
    if (nonZero.length > 0) {
        const min = Math.min(...nonZero);
        const max = Math.max(...nonZero);
        uniform = max > 0 ? (min / max) * (nonZero.length / 6) : 0;
    }

    return { zones, total, uniform };
}

function classifyZone(pt, center) {
    const dx = pt.x - center.x;
    const dy = pt.y - center.y;
    const dz = pt.z - center.z;

    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const az = Math.abs(dz);

    if (ax >= ay && ax >= az) {
        return dx >= 0 ? "+X" : "-X";
    }
    if (ay >= ax && ay >= az) {
        return dy >= 0 ? "+Y" : "-Y";
    }
    return dz >= 0 ? "+Z" : "-Z";
}

// 20 icosahedron-face directions = the 20 dodecahedron vertices, normalized.
// Generated once at module load.
const ICOSA_FACE_DIRS = (() => {
    const phi = (1 + Math.sqrt(5)) / 2;
    const inv = 1 / phi;
    const raw = [];
    for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
            for (const sz of [-1, 1]) {
                raw.push([sx, sy, sz]);
            }
        }
    }
    for (const a of [-inv, inv]) {
        for (const b of [-phi, phi]) {
            raw.push([0, a, b], [a, b, 0], [b, 0, a]);
        }
    }
    return raw.map(([x, y, z]) => {
        const n = Math.hypot(x, y, z);
        return [x / n, y / n, z / n];
    });
})();

/**
 * Directional sphere coverage: what fraction of the sphere of directions
 * (as seen from `center`) has been sampled?
 *
 * Unlike computeCoverage()'s min/max dwell ratio — which punishes spending
 * extra time in any orientation and therefore goes DOWN with more data —
 * this metric is presence-based and monotonically non-decreasing for a
 * fixed center: directions are binned onto the 20 icosahedron faces and a
 * face counts as covered once it has `minHits` samples. A thorough tumble
 * reaches 100%.
 *
 * @param {Array<{x:number,y:number,z:number}>} points
 * @param {{x:number,y:number,z:number}} center - best available cloud center
 *   (running sphere-fit center; falls back to origin early in a capture)
 * @param {number} [minHits=3] - samples required before a face counts
 * @returns {{ covered: number, totalFaces: number, fraction: number,
 *             faceCounts: number[], uniform: number }}
 *   `uniform` aliases `fraction` for backward compatibility with consumers
 *   of computeCoverage()'s shape.
 */
export function computeDirectionalCoverage(points, center, minHits = 3) {
    const faceCounts = new Array(ICOSA_FACE_DIRS.length).fill(0);

    for (const pt of points) {
        const dx = pt.x - center.x;
        const dy = pt.y - center.y;
        const dz = pt.z - center.z;
        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-9) continue;
        const nx = dx / len;
        const ny = dy / len;
        const nz = dz / len;

        let best = 0;
        let bestDot = -2;
        for (let f = 0; f < ICOSA_FACE_DIRS.length; f++) {
            const d = ICOSA_FACE_DIRS[f];
            const dot = nx * d[0] + ny * d[1] + nz * d[2];
            if (dot > bestDot) {
                bestDot = dot;
                best = f;
            }
        }
        faceCounts[best]++;
    }

    const covered = faceCounts.filter((c) => c >= minHits).length;
    const fraction = covered / ICOSA_FACE_DIRS.length;
    return { covered, totalFaces: ICOSA_FACE_DIRS.length, fraction, faceCounts, uniform: fraction };
}
