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
        [0, -1, 0],
        [1, 0, 0],
        [0, 0, 1],
    ], // CW 90°
    3: [
        [-1, 0, 0],
        [0, -1, 0],
        [0, 0, 1],
    ], // CW 180°
    4: [
        [0, 1, 0],
        [-1, 0, 0],
        [0, 0, 1],
    ], // CW 270°
    5: [
        [1, 0, 0],
        [0, -1, 0],
        [0, 0, -1],
    ], // CW 0° flip
    6: [
        [0, 1, 0],
        [1, 0, 0],
        [0, 0, -1],
    ], // CW 90° flip
    7: [
        [-1, 0, 0],
        [0, 1, 0],
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
 * @returns {{ alignment: number, label: string, confidence: number, reliable: boolean } | null}
 */
export function detectAlignment(samples, currentAlignment) {
    if (samples.length < 30) {
        return null;
    }

    // Get current alignment matrix (DEFAULT/0 treated as CW0/identity)
    const curAlign = currentAlignment >= 1 && currentAlignment <= 8 ? currentAlignment : 1;
    const currentMat = ALIGNMENT_MATRICES[curAlign];
    const currentInv = mat3transpose(currentMat);

    let bestAlignment = 1;
    let bestVariance = Infinity;
    let secondBestVariance = Infinity;

    for (const [alignStr, candidateMat] of Object.entries(ALIGNMENT_MATRICES)) {
        const align = parseInt(alignStr, 10);

        // Combined rotation: undo current alignment, apply candidate
        const combined = mat3mul(candidateMat, currentInv);

        const verticals = [];
        const horizMags = [];

        for (const s of samples) {
            // Apply combined rotation to get body-frame mag under this candidate
            const bodyMag = mat3mulVec(combined, s.mag);

            // Undo roll and pitch to get level-frame field
            const rollRad = s.roll * (Math.PI / 180);
            const pitchRad = s.pitch * (Math.PI / 180);
            const level = undoRollPitch(bodyMag, rollRad, pitchRad);

            verticals.push(level[2]);
            horizMags.push(Math.sqrt(level[0] * level[0] + level[1] * level[1]));
        }

        const totalVar = computeVariance(verticals) + computeVariance(horizMags);

        if (totalVar < bestVariance) {
            secondBestVariance = bestVariance;
            bestVariance = totalVar;
            bestAlignment = align;
        } else if (totalVar < secondBestVariance) {
            secondBestVariance = totalVar;
        }
    }

    const confidence = bestVariance > 0 ? secondBestVariance / bestVariance : 0;

    return {
        alignment: bestAlignment,
        label: ALIGNMENT_LABELS[bestAlignment],
        confidence: Math.round(confidence * 10) / 10,
        reliable: confidence > 2.0,
    };
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
    // Undo pitch: Ry(-pitch)
    const cp = Math.cos(-pitchRad);
    const sp = Math.sin(-pitchRad);
    const x1 = cp * v[0] + sp * v[2];
    const y1 = v[1];
    const z1 = -sp * v[0] + cp * v[2];

    // Undo roll: Rx(-roll)
    const cr = Math.cos(-rollRad);
    const sr = Math.sin(-rollRad);
    return [x1, cr * y1 - sr * z1, sr * y1 + cr * z1];
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

export { ALIGNMENT_LABELS };
