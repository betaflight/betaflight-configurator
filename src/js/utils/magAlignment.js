/**
 * Magnetometer alignment rotation matrices, Euler transformations, and 3x3 linear algebra helpers.
 *
 * Defines the standard Betaflight sensor-to-body alignment rotation matrices (presets 1-8)
 * and the ZYX intrinsic Euler transform matching the firmware convention (betaflight#14849).
 */

// Rotation matrices: sensor frame → body frame for each alignment value.
// Alignment 0 (DEFAULT) is treated as identity (same as CW0).
const ALIGNMENT_MATRICES = {
    1: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
    ], // CW 0°
    2: [
        [0, 1, 0],
        [-1, 0, 0],
        [0, 0, 1],
    ], // CW 90°
    3: [
        [-1, 0, 0],
        [0, -1, 0],
        [0, 0, 1],
    ], // CW 180°
    4: [
        [0, -1, 0],
        [1, 0, 0],
        [0, 0, 1],
    ], // CW 270°
    5: [
        [-1, 0, 0],
        [0, 1, 0],
        [0, 0, -1],
    ], // CW 0° flip
    6: [
        [0, 1, 0],
        [1, 0, 0],
        [0, 0, -1],
    ], // CW 90° flip
    7: [
        [1, 0, 0],
        [0, -1, 0],
        [0, 0, -1],
    ], // CW 180° flip
    8: [
        [0, -1, 0],
        [-1, 0, 0],
        [0, 0, -1],
    ], // CW 270° flip
};

const ALIGNMENT_LABELS = {
    1: "CW 0°",
    2: "CW 90°",
    3: "CW 180°",
    4: "CW 270°",
    5: "CW 0° flip",
    6: "CW 90° flip",
    7: "CW 180° flip",
    8: "CW 270° flip",
};

// --- Linear algebra helpers ---

/**
 * Transpose a 3x3 matrix.
 * @param {number[][]} m
 * @returns {number[][]}
 */
function mat3transpose(m) {
    return [
        [m[0][0], m[1][0], m[2][0]],
        [m[0][1], m[1][1], m[2][1]],
        [m[0][2], m[1][2], m[2][2]],
    ];
}

/**
 * Multiply two 3x3 matrices.
 * @param {number[][]} a
 * @param {number[][]} b
 * @returns {number[][]}
 */
function mat3mul(a, b) {
    const r = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
        }
    }
    return r;
}

/**
 * Multiply a 3x3 matrix by a 3D vector.
 * @param {number[][]} m
 * @param {number[]} v
 * @returns {number[]}
 */
function mat3mulVec(m, v) {
    return [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
}

/**
 * Build a 3×3 rotation matrix from Euler angles (degrees) using ZYX order,
 * matching Betaflight's custom alignment convention (Rz(yaw) * Ry(pitch) * Rx(roll)).
 * @param {number} rollDeg
 * @param {number} pitchDeg
 * @param {number} yawDeg
 * @returns {number[][]}
 */
function eulerToMatrix(rollDeg, pitchDeg, yawDeg) {
    const r = (rollDeg * Math.PI) / 180;
    const p = (pitchDeg * Math.PI) / 180;
    const y = (yawDeg * Math.PI) / 180;

    const cr = Math.cos(r);
    const sr = Math.sin(r);
    const cp = Math.cos(p);
    const sp = Math.sin(p);
    const cy = Math.cos(y);
    const sy = Math.sin(y);

    return [
        [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
        [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
        [-sp, cp * sr, cp * cr],
    ];
}

export { ALIGNMENT_LABELS, ALIGNMENT_MATRICES };
export { eulerToMatrix, mat3transpose, mat3mul, mat3mulVec };
