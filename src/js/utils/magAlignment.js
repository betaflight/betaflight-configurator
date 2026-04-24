/**
 * Magnetometer alignment detection using variance minimization.
 *
 * For each of 8 candidate rotations, we convert the raw mag reading to a
 * "level" frame (undoing roll and pitch from the accelerometer). If the
 * rotation is correct, the vertical field component and horizontal field
 * magnitude should be constant across all samples regardless of vehicle
 * orientation. The candidate with the lowest variance wins.
 *
 * Based on the approach from ArduPilot's CompassCalibrator::calculate_orientation().
 * We avoid using yaw (which depends on the alignment we're trying to detect)
 * by only using roll/pitch from the accelerometer.
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

/**
 * Detect the most likely magnetometer alignment.
 *
 * @param {Array<{mag: number[], roll: number, pitch: number}>} samples
 *   Each sample has mag=[x,y,z] (raw from MSP_RAW_IMU, current alignment applied),
 *   roll and pitch in degrees (from MSP_ATTITUDE).
 * @param {number} currentAlignment - Current align_mag value (0-9).
 *   Used to undo the firmware's rotation so we test against the true sensor frame.
 * @param {{ roll: number, pitch: number, yaw: number }} [customAngles] -
 *   Custom alignment angles in degrees, required when currentAlignment === 9.
 * @returns {{ alignment: number, label: string, confidence: number, reliable: boolean } | { error: string }}
 */
export function detectAlignment(samples, currentAlignment, customAngles) {
    if (samples.length < 30) {
        return { error: "not_enough_data" };
    }

    const currentMat = buildCurrentMatrix(currentAlignment, customAngles);
    if (!currentMat) {
        return { error: "missing_custom_angles" };
    }
    const currentInv = mat3transpose(currentMat);

    let bestAlignment = 1;
    let bestVariance = Infinity;
    let secondBestVariance = Infinity;

    for (const [alignStr, candidateMat] of Object.entries(ALIGNMENT_MATRICES)) {
        const totalVar = evaluateCandidate(candidateMat, currentInv, samples);

        if (totalVar < bestVariance) {
            secondBestVariance = bestVariance;
            bestVariance = totalVar;
            bestAlignment = Number.parseInt(alignStr, 10);
        } else if (totalVar < secondBestVariance) {
            secondBestVariance = totalVar;
        }
    }

    const confidence = computeConfidence(bestVariance, secondBestVariance);

    return {
        alignment: bestAlignment,
        label: ALIGNMENT_LABELS[bestAlignment],
        confidence: Math.round(confidence * 10) / 10,
        reliable: confidence > 2,
    };
}

function buildCurrentMatrix(currentAlignment, customAngles) {
    if (currentAlignment === 9) {
        if (!customAngles) {
            return null;
        }
        return eulerToMatrix(customAngles.roll, customAngles.pitch, customAngles.yaw);
    }
    const curAlign = currentAlignment >= 1 && currentAlignment <= 8 ? currentAlignment : 1;
    return ALIGNMENT_MATRICES[curAlign];
}

function evaluateCandidate(candidateMat, currentInv, samples) {
    const combined = mat3mul(candidateMat, currentInv);
    const verticals = [];
    const horizMags = [];

    for (const s of samples) {
        const bodyMag = mat3mulVec(combined, s.mag);
        const rollRad = s.roll * (Math.PI / 180);
        const pitchRad = s.pitch * (Math.PI / 180);
        const level = undoRollPitch(bodyMag, rollRad, pitchRad);

        verticals.push(level[2]);
        horizMags.push(Math.hypot(level[0], level[1]));
    }

    return computeVariance(verticals) + computeVariance(horizMags);
}

function computeConfidence(bestVariance, secondBestVariance) {
    if (bestVariance > 0) {
        return secondBestVariance / bestVariance;
    }
    return secondBestVariance > 0 ? Infinity : 0;
}

// --- Linear algebra helpers ---

function mat3transpose(m) {
    return [
        [m[0][0], m[1][0], m[2][0]],
        [m[0][1], m[1][1], m[2][1]],
        [m[0][2], m[1][2], m[2][2]],
    ];
}

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

function mat3mulVec(m, v) {
    return [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
}

/**
 * Undo body roll and pitch to get the field vector in a "level" frame.
 * This avoids needing yaw, which depends on the alignment we're detecting.
 */
function undoRollPitch(v, rollRad, pitchRad) {
    // V_level = Ry(pitch) · Rx(roll) · V_body
    // Apply roll first: Rx(roll)
    const cr = Math.cos(rollRad);
    const sr = Math.sin(rollRad);
    const y1 = cr * v[1] - sr * v[2];
    const z1 = sr * v[1] + cr * v[2];

    // Then pitch: Ry(pitch)
    const cp = Math.cos(pitchRad);
    const sp = Math.sin(pitchRad);
    return [cp * v[0] + sp * z1, y1, -sp * v[0] + cp * z1];
}

function computeVariance(values) {
    if (values.length < 2) {
        return 0;
    }
    let sum = 0;
    for (const v of values) {
        sum += v;
    }
    const mean = sum / values.length;

    let sumSq = 0;
    for (const v of values) {
        const d = v - mean;
        sumSq += d * d;
    }
    return sumSq / values.length;
}

/**
 * Build a 3×3 rotation matrix from Euler angles (degrees) using ZYX order,
 * matching Betaflight's custom alignment convention.
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

export { ALIGNMENT_LABELS };
