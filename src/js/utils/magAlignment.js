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
 * Uses a two-phase strategy:
 *   Phase 1 — Resolve flip state by comparing tilt-weighted vertical variance
 *             between non-flipped (1-4) and flipped (5-8) candidates. Tilted
 *             samples are weighted higher because they are most discriminative
 *             for flip detection.
 *   Phase 2 — Within the winning flip group, resolve CW rotation angle by
 *             comparing total (vertical + horizontal) variance.
 *
 * @param {Array<{mag: number[], roll: number, pitch: number}>} samples
 *   Each sample has mag=[x,y,z] (raw from MSP_RAW_IMU, current alignment applied),
 *   roll and pitch in degrees (from MSP_ATTITUDE).
 * @param {number} currentAlignment - Current align_mag value (0-9).
 *   Used to undo the firmware's rotation so we test against the true sensor frame.
 * @param {{ roll: number, pitch: number, yaw: number }} [customAngles] -
 *   Custom alignment angles in degrees, required when currentAlignment === 9.
 * @returns {{ alignment: number, label: string, confidence: number, reliable: boolean, tiltCoverage: number } | { error: string }}
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

    // Evaluate all 8 candidates with separate vertical/horizontal variance
    const candidates = [];
    for (const [alignStr, candidateMat] of Object.entries(ALIGNMENT_MATRICES)) {
        const align = Number.parseInt(alignStr, 10);
        const { verticalVar, horizontalVar } = evaluateCandidateDetailed(candidateMat, currentInv, samples);
        candidates.push({ align, verticalVar, horizontalVar, totalVar: verticalVar + horizontalVar });
    }

    // Phase 1 — Resolve flip state
    // Non-flipped = alignments 1-4 (Z unchanged), flipped = 5-8 (Z negated)
    const normal = candidates.filter((c) => c.align <= 4);
    const flipped = candidates.filter((c) => c.align > 4);

    const bestNormalVert = Math.min(...normal.map((c) => c.verticalVar));
    const bestFlippedVert = Math.min(...flipped.map((c) => c.verticalVar));

    const isFlipped = bestFlippedVert < bestNormalVert;
    const group = isFlipped ? flipped : normal;

    // Phase 2 — Resolve CW angle within the winning flip group
    group.sort((a, b) => a.totalVar - b.totalVar);
    const best = group[0];

    // Confidence: compare best total variance to second-best across ALL candidates
    const sorted = [...candidates].sort((a, b) => a.totalVar - b.totalVar);
    const confidence = computeConfidence(sorted[0].totalVar, sorted[1].totalVar);

    const tiltCoverage = computeTiltCoverage(samples);

    return {
        alignment: best.align,
        label: ALIGNMENT_LABELS[best.align],
        confidence: Math.round(confidence * 10) / 10,
        reliable: confidence > 2,
        tiltCoverage,
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

/**
 * Evaluate a candidate alignment, returning separate vertical and horizontal
 * variance. Uses tilt-weighted variance so tilted samples (which are most
 * discriminative for flip detection) have more influence.
 */
function evaluateCandidateDetailed(candidateMat, currentInv, samples) {
    const combined = mat3mul(candidateMat, currentInv);
    const verticals = [];
    const horizMags = [];
    const weights = [];

    for (const s of samples) {
        const bodyMag = mat3mulVec(combined, s.mag);
        const rollRad = s.roll * (Math.PI / 180);
        const pitchRad = s.pitch * (Math.PI / 180);
        const level = undoRollPitch(bodyMag, rollRad, pitchRad);

        verticals.push(level[2]);
        horizMags.push(Math.hypot(level[0], level[1]));

        // Weight by tilt magnitude: level samples get weight 1,
        // samples tilted 45°+ get weight 3. This breaks the degeneracy
        // between flipped and non-flipped orientations that occurs
        // when most samples are near-level.
        const tilt = Math.hypot(rollRad, pitchRad);
        const tiltFrac = Math.min(tilt / (Math.PI / 4), 1);
        weights.push(1 + 2 * tiltFrac);
    }

    return {
        verticalVar: computeWeightedVariance(verticals, weights),
        horizontalVar: computeWeightedVariance(horizMags, weights),
    };
}

/**
 * Fraction of samples with tilt > 15°. Low coverage means flip detection
 * may be unreliable.
 */
function computeTiltCoverage(samples) {
    const TILT_THRESHOLD_RAD = (15 * Math.PI) / 180;
    let tilted = 0;
    for (const s of samples) {
        const rollRad = s.roll * (Math.PI / 180);
        const pitchRad = s.pitch * (Math.PI / 180);
        const tilt = Math.hypot(rollRad, pitchRad);
        if (tilt > TILT_THRESHOLD_RAD) {
            tilted++;
        }
    }
    return tilted / samples.length;
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

function computeWeightedVariance(values, weights) {
    if (values.length < 2) {
        return 0;
    }
    let wSum = 0;
    let wvSum = 0;
    for (let i = 0; i < values.length; i++) {
        wSum += weights[i];
        wvSum += weights[i] * values[i];
    }
    const mean = wvSum / wSum;

    let wSqSum = 0;
    for (let i = 0; i < values.length; i++) {
        const d = values[i] - mean;
        wSqSum += weights[i] * d * d;
    }
    return wSqSum / wSum;
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

export { ALIGNMENT_LABELS, ALIGNMENT_MATRICES };
export { eulerToMatrix, mat3transpose, mat3mul, mat3mulVec, undoRollPitch, computeWeightedVariance };
