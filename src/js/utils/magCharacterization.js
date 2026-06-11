/**
 * magnetometer characterization solver — continuous alignment optimization.
 *
 * Unlike the discrete 8-preset test in magAlignment.js, this solver performs a
 * multi-resolution grid search over 3 Euler angles (ZYX convention, matching the
 * firmware's net effective transform) to find the optimal sensor-to-body rotation.
 * This enables detection of non-90° rotations (e.g. the ~66° yaw offset observed
 * on iFlight Blitz Mini M10 V2 modules with QMC5883L "HA-588" chips).
 *
 * Heading penalty uses robust M-estimator (slack 3°, cap 15°) — see computeHeadingVariance.
 *
 * FIRMWARE MATH (must match exactly):
 *   - 8 standard presets:  betaflight/src/main/sensors/boardalignment.c:98-139
 *   - buildRotationMatrix: betaflight/src/main/common/vector.c:214-236 (XYZ order)
 *     BUT the firmware negates angles (compass.c:419-422) and applies
 *     transpose-multiply, so the NET effective transform is ZYX with POSITIVE
 *     angles:  body = R_z(yaw) * R_y(pitch) * R_x(roll) * raw
 *   - Our eulerToMatrix() uses this ZYX net convention.
 *
 * ARCHITECTURE:
 *   Imported by: useMagCharacterization.js (composable, planned)
 *   Data source:  MagCharacterizationWizard.vue (pose samples)
 *   Sibling:      magAlignment.js (8-preset discrete detector)
 *
 * Algorithm: multi-resolution grid search over 3 ZYX Euler angles.
 * Coarse 15° grid, refine top 3 at 2° in ±12° neighborhood.
 * Cost = weighted variance of leveled Z + XY magnitude + heading error.
 * Snaps to nearest standard preset (Frobenius norm < 0.1) or returns CUSTOM.
 */

import {
    eulerToMatrix,
    ALIGNMENT_MATRICES,
    ALIGNMENT_LABELS,
    mat3transpose,
    mat3mul,
    mat3mulVec,
    undoRollPitch,
    computeWeightedVariance,
} from "./magAlignment.js";

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Characterize the magnetometer alignment from multi-pose samples.
 *
 * Performs a multi-resolution grid search over Euler angles (roll, pitch, yaw)
 * in ZYX convention.  The cost function minimises weighted variance of the
 * levelled vertical field component and horizontal-field magnitude.  When user
 * heading references are available the cost also includes circular variance of
 * the levelled horizontal direction, which breaks the yaw degeneracy that
 * variance-only optimisation cannot resolve.
 *
 * @param {Array<{mag: number[3], roll: number, pitch: number, headingRef?: number}>} samples
 *   Each sample has mag=[x,y,z] (raw from MSP_RAW_IMU, current firmware alignment
 *   already applied), roll and pitch in degrees (from MSP_ATTITUDE, accel-derived,
 *   reliable), and optional headingRef in degrees (user-indicated heading from
 *   compass-on-paper reference — 0 = North, 90 = East, etc.).
 *
 * @param {number} currentAlignment  Current align_mag value on the FC (0-9).
 *   Used to mathematically undo the firmware's rotation so we solve against the
 *   true sensor frame.
 *
 * @param {{ roll: number, pitch: number, yaw: number }} [customAngles]
 *   Required when currentAlignment === 9 (CUSTOM).  Angles in degrees.
 *
 * @param {object} [opts]
 * @param {'absolute'|'relative'|'none'} [opts.headingMode='none']
 *   - 'absolute': headingRef values are absolute (compass on paper).  Strong constraint.
 *   - 'relative': user faced the same unknown direction at all poses.  Solver
 *     enforces directional consistency across poses but cannot determine absolute yaw.
 *   - 'none': heading references ignored.  Yaw alignment cannot be determined.
 * @param {number} [opts.headingWeight=1.0]  Multiplier for heading-consistency term.
 *
 * @returns {{
 *   alignment: number,         // 1-8 for standard preset, 9 for CUSTOM
 *   label: string,
 *   customAngles: {roll:number, pitch:number, yaw:number}|null,
 *   qualityScore: number,      // 0-100
 *   residuals: {zRms: number, xyRms: number},
 *   fieldConsistency: {mean: number, maxDevPct: number, suspect: boolean},
 *   chiralityFlag: boolean,
 *   yawAbsolute: boolean,      // true if absolute heading was available
 * }}
 */
export function characterizeAlignment(samples, currentAlignment, customAngles, opts = {}) {
    const { headingMode = "none", headingWeight = 1.0 } = opts;

    if (samples.length < 30) {
        return { error: "not_enough_data" };
    }

    // Build the matrix that the firmware CURRENTLY applies (so we can undo it)
    const currentMat = buildCurrentMatrix(currentAlignment, customAngles);
    if (!currentMat) {
        return { error: "missing_custom_angles" };
    }
    const currentInv = mat3transpose(currentMat);

    // Coarse grid → refine best candidates
    const coarseCandidates = gridSearch(samples, currentInv, headingMode, headingWeight, 15);
    if (coarseCandidates.length === 0) {
        return { error: "optimization_failed" };
    }

    // Refine top 3 with 2° resolution in ±12° neighbourhood
    const topN = Math.min(3, coarseCandidates.length);
    let best = coarseCandidates[0];
    for (let i = 0; i < topN; i++) {
        const refined = refineSearch(samples, currentInv, headingMode, headingWeight, 2, coarseCandidates[i], 12);
        if (refined && refined.cost < best.cost) {
            best = refined;
        }
    }

    // Build final matrix from best angles
    const bestMatrix = eulerToMatrix(best.roll, best.pitch, best.yaw);

    // Snap to nearest standard preset
    const snap = snapToPreset(bestMatrix);

    // Quality checks
    const residuals = computeResiduals(samples, bestMatrix, currentInv);
    const fieldConsistency = checkFieldConsistency(samples);
    const chiralityFlag = checkChirality(samples, currentInv, best);

    // Quality score: based on heading cost normalized against worst-case M-estimator penalty
    const maxPenalty = 144; // (15 - 3)^2 = 144 — precomputed from constants

    // Spatial observability: fraction of cardinal quadrants with headingRef data
    const quadrantsSeen = new Set();
    for (const s of samples) {
        if (s.headingRef !== undefined && s.headingRef !== null) {
            const q = Math.round((((s.headingRef % 360) + 360) % 360) / 90) % 4;
            quadrantsSeen.add(q);
        }
    }
    const spatialBonus = Math.min(1, quadrantsSeen.size / 4);

    let qualityScore = 0;
    if (best.headingVar !== undefined && maxPenalty > 0) {
        const rawQuality = 100 * (1 - Math.min(1, best.headingVar / maxPenalty));
        qualityScore = Math.max(0, Math.min(100, Math.round(rawQuality * spatialBonus)));
    }
    if (fieldConsistency.suspect) {
        qualityScore = Math.min(qualityScore, 50);
    }

    return {
        alignment: snap.alignment,
        label: snap.alignment === 9 ? "CUSTOM" : ALIGNMENT_LABELS[snap.alignment],
        customAngles: snap.alignment === 9 ? snap.customAngles : null,
        qualityScore,
        residuals,
        fieldConsistency,
        chiralityFlag,
        yawAbsolute: headingMode === "absolute",
    };
}

/**
 * Decompose a 3×3 rotation matrix into ZYX Euler angles (degrees).
 * Inverse of eulerToMatrix().
 */
export function matrixToEuler(m) {
    // ZYX decomposition
    // m[2][0] = -sin(pitch)
    const pitch = -Math.asin(Math.max(-1, Math.min(1, m[2][0])));

    let roll, yaw;
    if (Math.abs(Math.cos(pitch)) > 1e-6) {
        roll = Math.atan2(m[2][1], m[2][2]);
        yaw = Math.atan2(m[1][0], m[0][0]);
    } else {
        // Gimbal lock at pitch = ±90°
        roll = 0;
        yaw = Math.atan2(-m[0][1], m[1][1]);
    }

    const radToDeg = 180 / Math.PI;
    return {
        roll: roll * radToDeg,
        pitch: pitch * radToDeg,
        yaw: yaw * radToDeg,
    };
}

/**
 * Snap a rotation matrix to the nearest of the 8 standard alignment presets.
 * Returns { alignment, frobNorm } or { alignment: 9, customAngles } if no
 * preset is close enough.
 */
export function snapToPreset(m, threshold = 0.1) {
    let bestAlign = 9;
    let bestNorm = Infinity;

    for (const [alignStr, presetMat] of Object.entries(ALIGNMENT_MATRICES)) {
        const align = Number.parseInt(alignStr, 10);
        const norm = frobeniusNorm(m, presetMat);
        if (norm < bestNorm) {
            bestNorm = norm;
            bestAlign = align;
        }
    }

    if (bestNorm < threshold) {
        return { alignment: bestAlign, frobNorm: bestNorm };
    }

    // No preset close enough — return custom angles
    const angles = matrixToEuler(m);
    return { alignment: 9, customAngles: angles, frobNorm: bestNorm };
}

/**
 * Check whether the magnetic field magnitude is consistent across samples.
 * Flags samples where |B| deviates >10 % from the mean (suspected environmental
 * interference — nearby metal, electronics, etc.).
 */
export function checkFieldConsistency(samples) {
    const magnitudes = samples.map((s) => Math.hypot(s.mag[0], s.mag[1], s.mag[2]));
    const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    const maxDev = Math.max(...magnitudes.map((m) => (Math.abs(m - mean) / mean) * 100));

    return {
        mean: Math.round(mean),
        maxDevPct: Math.round(maxDev * 10) / 10,
        suspect: maxDev > 10,
    };
}

// ── Internal helpers ────────────────────────────────────────────────────────

function buildCurrentMatrix(alignment, customAngles) {
    if (alignment === 9) {
        if (!customAngles) {
            return null;
        }
        return eulerToMatrix(customAngles.roll, customAngles.pitch, customAngles.yaw);
    }
    const al = alignment >= 1 && alignment <= 8 ? alignment : 1;
    return ALIGNMENT_MATRICES[al];
}

/**
 * Evaluate a candidate alignment (roll/pitch/yaw in degrees) against all samples.
 * Returns { verticalVar, horizontalVar, headingVar, cost }.
 */
function evaluateCandidate(rollDeg, pitchDeg, yawDeg, samples, currentInv, headingMode, headingWeight) {
    const candidateMat = eulerToMatrix(rollDeg, pitchDeg, yawDeg);
    const combined = mat3mul(candidateMat, currentInv);

    const verticals = [];
    const horizMags = [];
    const weights = [];
    const directions = [];

    for (const s of samples) {
        const bodyMag = mat3mulVec(combined, s.mag);
        const rollRad = s.roll * (Math.PI / 180);
        const pitchRad = s.pitch * (Math.PI / 180);
        const level = undoRollPitch(bodyMag, rollRad, pitchRad);

        verticals.push(level[2]);
        horizMags.push(Math.hypot(level[0], level[1]));
        directions.push(Math.atan2(level[1], level[0]));

        // Tilt weighting (same as magAlignment.js): level=1, 45°+ tilt=3
        const tilt = Math.hypot(rollRad, pitchRad);
        const tiltFrac = Math.min(tilt / (Math.PI / 4), 1);
        weights.push(1 + 2 * tiltFrac);
    }

    const verticalVar = computeWeightedVariance(verticals, weights);
    const horizontalVar = computeWeightedVariance(horizMags, weights);

    let headingVar = 0;
    if (headingMode === "absolute" || headingMode === "relative") {
        headingVar = computeHeadingVariance(directions, samples, headingMode);
    }

    return {
        verticalVar,
        horizontalVar,
        headingVar,
        cost: verticalVar + horizontalVar + headingWeight * headingVar,
    };
}

/**
 * Compute robust heading variance penalty using truncated quadratic loss.
 * Slack window forgives human jitter (±slack°); outer cap prevents outlier
 * poses from hijacking the optimizer.
 *
 * @param {Array<number>} directions  - Levelled heading direction per sample (radians)
 * @param {Array<object>} samples     - Original samples with headingRef (degrees)
 * @param {string} headingMode        - "absolute" | "relative" | "none"
 * @returns {number} Mean penalty per sample
 */
const HEADING_SLACK_DEG = 3.0;
const HEADING_OUTER_CAP_DEG = 15.0;

function computeHeadingVariance(directions, samples, headingMode) {
    const RAD_TO_DEG = 180 / Math.PI;

    if (headingMode === "absolute") {
        // Group samples by pose (contiguous blocks in the samples array)
        const poseErrors = [];
        let poseStart = 0;
        while (poseStart < samples.length) {
            const ref = samples[poseStart].headingRef;
            if (ref === undefined || ref === null) {
                poseStart++;
                continue;
            }

            // Find range of samples sharing the same headingRef (same pose)
            let poseEnd = poseStart + 1;
            while (
                poseEnd < samples.length &&
                samples[poseEnd].headingRef !== undefined &&
                samples[poseEnd].headingRef !== null &&
                Math.abs(samples[poseEnd].headingRef - ref) < 0.5
            ) {
                poseEnd++;
            }

            // Mean direction for this pose
            let sumSin = 0,
                sumCos = 0;
            for (let i = poseStart; i < poseEnd; i++) {
                sumSin += Math.sin(directions[i]);
                sumCos += Math.cos(directions[i]);
            }
            const meanDir = Math.atan2(sumSin, sumCos);
            const meanDeg = meanDir * RAD_TO_DEG;
            const expectedDeg = ref;

            let diffDeg = meanDeg - expectedDeg;
            // Wrap to [-180, 180]
            while (diffDeg > 180) {
                diffDeg -= 360;
            }
            while (diffDeg < -180) {
                diffDeg += 360;
            }

            const absError = Math.abs(diffDeg);
            const maxPenalty = Math.pow(HEADING_OUTER_CAP_DEG - HEADING_SLACK_DEG, 2);

            let poseLoss;
            if (absError <= HEADING_SLACK_DEG) {
                poseLoss = 0;
            } else if (absError <= HEADING_OUTER_CAP_DEG) {
                poseLoss = Math.pow(absError - HEADING_SLACK_DEG, 2);
            } else {
                poseLoss = maxPenalty;
            }
            poseErrors.push(poseLoss);
            poseStart = poseEnd;
        }

        if (poseErrors.length === 0) {
            return 0;
        }
        const totalLoss = poseErrors.reduce((a, b) => a + b, 0);
        return totalLoss / poseErrors.length;
    }

    // Relative mode: circular variance (unchanged)
    if (directions.length < 2) {
        return 0;
    }
    let sumSin = 0,
        sumCos = 0;
    for (const d of directions) {
        sumSin += Math.sin(d);
        sumCos += Math.cos(d);
    }
    const R = Math.hypot(sumSin, sumCos) / directions.length;
    return 1 - R;
}

/**
 * Coarse grid search.  Step in degrees.
 * Returns up to 10 candidates sorted by cost ascending.
 */
function gridSearch(samples, currentInv, headingMode, headingWeight, step) {
    const candidates = [];

    const rollRange = range(-180, 180, step);
    const pitchRange = range(-90, 90, step);
    const yawRange = range(0, 360 - step, step);

    for (const roll of rollRange) {
        for (const pitch of pitchRange) {
            for (const yaw of yawRange) {
                const ev = evaluateCandidate(roll, pitch, yaw, samples, currentInv, headingMode, headingWeight);
                candidates.push({ roll, pitch, yaw, cost: ev.cost, headingVar: ev.headingVar });
            }
        }
    }

    candidates.sort((a, b) => a.cost - b.cost);
    return candidates.slice(0, 10);
}

/**
 * Refine search around a candidate centre.  step in degrees, radius in degrees.
 * Returns the best candidate found (or null if none better).
 */
function refineSearch(samples, currentInv, headingMode, headingWeight, step, centre, radius) {
    let best = centre;

    const rollVals = range(centre.roll - radius, centre.roll + radius, step);
    const pitchVals = range(centre.pitch - radius, centre.pitch + radius, step);
    const yawVals = range(centre.yaw - radius, centre.yaw + radius, step);

    for (const roll of rollVals) {
        for (const pitch of pitchVals) {
            for (const yaw of yawVals) {
                const ev = evaluateCandidate(roll, pitch, yaw, samples, currentInv, headingMode, headingWeight);
                if (ev.cost < best.cost) {
                    best = { roll, pitch, yaw, cost: ev.cost, headingVar: ev.headingVar };
                }
            }
        }
    }

    return best;
}

function range(start, end, step) {
    const result = [];
    for (let v = start; v <= end + 1e-9; v += step) {
        result.push(v);
    }
    return result;
}

/**
 * Frobenius norm of (a - b).  Both are 3×3 matrices (array-of-arrays).
 */
function frobeniusNorm(a, b) {
    let sum = 0;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const d = a[i][j] - b[i][j];
            sum += d * d;
        }
    }
    return Math.sqrt(sum);
}

/**
 * Compute RMS residuals after applying the solved matrix.
 */
function computeResiduals(samples, bestMatrix, currentInv) {
    const combined = mat3mul(bestMatrix, currentInv);
    const zVals = [];
    const xyVals = [];

    for (const s of samples) {
        const bodyMag = mat3mulVec(combined, s.mag);
        const level = undoRollPitch(bodyMag, s.roll * (Math.PI / 180), s.pitch * (Math.PI / 180));
        zVals.push(level[2]);
        xyVals.push(Math.hypot(level[0], level[1]));
    }

    const zMean = zVals.reduce((a, b) => a + b, 0) / zVals.length;
    const xyMean = xyVals.reduce((a, b) => a + b, 0) / xyVals.length;

    const zRms = Math.sqrt(zVals.reduce((s, v) => s + (v - zMean) ** 2, 0) / zVals.length) / (Math.abs(zMean) || 1);
    const xyRms =
        Math.sqrt(xyVals.reduce((s, v) => s + (v - xyMean) ** 2, 0) / xyVals.length) / (Math.abs(xyMean) || 1);

    return { zRms, xyRms };
}

/**
 * Test whether a reflected (determinant -1) version of the optimal matrix
 * gives a significantly lower cost.  If the reflected cost is < 0.5× the
 * original cost, flag a possible chirality anomaly.
 */
function checkChirality(samples, currentInv, best) {
    // Reflect Z axis: negate the third column of the rotation matrix
    const bestMatrix = eulerToMatrix(best.roll, best.pitch, best.yaw);
    const reflected = bestMatrix.map((row) => [row[0], row[1], -row[2]]);

    const combinedOrig = mat3mul(bestMatrix, currentInv);
    const combinedRefl = mat3mul(reflected, currentInv);

    let origSum = 0;
    let reflSum = 0;
    for (const s of samples) {
        const bo = mat3mulVec(combinedOrig, s.mag);
        const lo = undoRollPitch(bo, s.roll * (Math.PI / 180), s.pitch * (Math.PI / 180));
        origSum += Math.abs(lo[2]);

        const br = mat3mulVec(combinedRefl, s.mag);
        const lr = undoRollPitch(br, s.roll * (Math.PI / 180), s.pitch * (Math.PI / 180));
        reflSum += Math.abs(lr[2]);
    }

    return reflSum < origSum * 0.3;
}
