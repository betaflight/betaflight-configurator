/**
 * Magnetometer alignment matrix utilities.
 * Ported from Betaflight Configurator src/js/utils/magAlignment.js.
 *
 * BF mag alignment presets match betaflight/src/main/sensors/boardalignment.c:98-139.
 * Matrix order matches betaflight/src/main/common/vector.c:214-236 (ZYX convention).
 */

const DEG_TO_RAD = Math.PI / 180;

// 8 standard preset rotation matrices (sensor → body frame)
const CW0 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
];
const CW90 = [
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, 1],
];
const CW180 = [
    [-1, 0, 0],
    [0, -1, 0],
    [0, 0, 1],
];
const CW270 = [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1],
];
const CW0FLIP = [
    [1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
];
const CW90FLIP = [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, -1],
];
const CW180FLIP = [
    [-1, 0, 0],
    [0, 1, 0],
    [0, 0, -1],
];
const CW270FLIP = [
    [0, -1, 0],
    [-1, 0, 0],
    [0, 0, -1],
];

export const ALIGNMENT_MATRICES = [null, CW0, CW90, CW180, CW270, CW0FLIP, CW90FLIP, CW180FLIP, CW270FLIP];

/**
 * Build ZYX intrinsic rotation matrix from Euler angles (degrees).
 * R = Rz(yaw) × Ry(pitch) × Rx(roll) — standard BF/Cleanflight convention.
 */
export function eulerToMatrix(rollDeg, pitchDeg, yawDeg) {
    const roll = rollDeg * DEG_TO_RAD;
    const pitch = pitchDeg * DEG_TO_RAD;
    const yaw = yawDeg * DEG_TO_RAD;

    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);

    return [
        [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
        [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
        [-sp, cp * sr, cp * cr],
    ];
}

/** Matrix transpose */
export function mat3transpose(m) {
    return [
        [m[0][0], m[1][0], m[2][0]],
        [m[0][1], m[1][1], m[2][1]],
        [m[0][2], m[1][2], m[2][2]],
    ];
}

/** Matrix × vector */
export function mat3mulVec(m, v) {
    return [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
}

/**
 * Undo roll and pitch to level a body-frame vector.
 * levelled = Ry(−pitch) × Rx(−roll) × v_body
 */
export function undoRollPitch(v, rollRad, pitchRad) {
    const cr = Math.cos(-rollRad);
    const sr = Math.sin(-rollRad);
    const cp = Math.cos(-pitchRad);
    const sp = Math.sin(-pitchRad);

    const x1 = v[0] * cp + v[1] * (sp * sr) + v[2] * (sp * cr);
    const y1 = v[0] * 0 + v[1] * cr + v[2] * -sr;
    const z1 = v[0] * -sp + v[1] * (cp * sr) + v[2] * (cp * cr);

    return [x1, y1, z1];
}
