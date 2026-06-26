/**
 * Tilt + WMM-inclination alignment solve.
 *
 * Recovers the 3-dof sensor→body mount rotation from a single tilt-diverse tumble:
 * the calibrated mag must make a constant angle with gravity equal to the WMM dip
 * (π/2 − inclination) across all orientations. Heading is NOT used (the FC heading
 * is untrustworthy when the alignment is wrong); the magnetometer supplies magnetic
 * North at runtime.
 *
 * Handedness: a tilt-diverse tumble pins the full proper rotation with no E↔W twin
 * (the dip constraint across many gravity directions has a unique solution), and every
 * candidate is a proper rotation (det = +1) by construction. Handedness is therefore
 * guaranteed by the tilt-diversity coverage gate, not by a separate reflection test.
 */
import { ALIGNMENT_MATRICES, ALIGNMENT_LABELS, eulerToMatrix, mat3mulVec } from "./magAlignment.js";
import { snapToPreset, matrixToEuler } from "./magCharacterization.js";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// Robust M-estimator on the dip residual, in ANGLE space (latitude-independent).
const SLACK_RAD = 3.0 * DEG_TO_RAD; // residual below this is free
const CAP_RAD = 15.0 * DEG_TO_RAD; // residual above this is capped (outlier rejection)
const MAX_PENALTY = (CAP_RAD - SLACK_RAD) * (CAP_RAD - SLACK_RAD);

const MIN_SAMPLES = 20;
const GRID_SUBSAMPLE = 300; // cap samples used by the search (perf; full set used for final residual)
const COARSE_STEP = 15; // degrees
const REFINE_STEP = 2; // degrees
const REFINE_RADIUS = 12; // degrees
const REFINE_TOP_N = 8; // how many of the top coarse candidates to refine

function clamp(v, lo, hi) {
    if (v < lo) {
        return lo;
    }
    if (v > hi) {
        return hi;
    }
    return v;
}

function normalize3(v) {
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1e-12) {
        return [0, 0, 0];
    }
    return [v[0] / len, v[1] / len, v[2] / len];
}

function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Gravity (down) in the FLU body frame from roll/pitch (degrees). Level → [0,0,-1]. */
function gravityInBody(rollDeg, pitchDeg) {
    const r = rollDeg * DEG_TO_RAD;
    const p = pitchDeg * DEG_TO_RAD;
    return [Math.sin(p), -Math.sin(r) * Math.cos(p), -Math.cos(r) * Math.cos(p)];
}

/** |measured mag↔gravity angle − expected dip angle|, in radians, for one sample. */
function dipResidualRad(R, s, expectedAngleRad) {
    const mUnit = normalize3(mat3mulVec(R, s.m_cal));
    const gUnit = normalize3(gravityInBody(s.roll, s.pitch));
    const actualAngle = Math.acos(clamp(dot3(mUnit, gUnit), -1, 1));
    return Math.abs(actualAngle - expectedAngleRad);
}

function computeCost(R, samples, expectedAngleRad) {
    let loss = 0;
    for (const s of samples) {
        const r = dipResidualRad(R, s, expectedAngleRad);
        if (r > SLACK_RAD) {
            const e = r - SLACK_RAD;
            loss += Math.min(e * e, MAX_PENALTY);
        }
    }
    return loss;
}

function meanResidualDeg(R, samples, expectedAngleRad) {
    let sum = 0;
    for (const s of samples) {
        sum += dipResidualRad(R, s, expectedAngleRad);
    }
    return (sum / samples.length) * RAD_TO_DEG;
}

function evalGrid(rollVals, pitchVals, yawVals, samples, expectedAngleRad, sink) {
    for (const roll of rollVals) {
        for (const pitch of pitchVals) {
            for (const yaw of yawVals) {
                const R = eulerToMatrix(roll, pitch, yaw);
                sink({ roll, pitch, yaw, cost: computeCost(R, samples, expectedAngleRad) });
            }
        }
    }
}

function rangeDeg(start, end, step) {
    const out = [];
    const n = Math.round((end - start) / step);
    for (let i = 0; i <= n; i++) {
        out.push(start + i * step);
    }
    return out;
}

function subsample(samples, cap) {
    if (samples.length <= cap) {
        return samples;
    }
    const stride = Math.ceil(samples.length / cap);
    const out = [];
    for (let i = 0; i < samples.length; i += stride) {
        out.push(samples[i]);
    }
    return out;
}

/**
 * @param {Array<{m_cal:number[3], roll:number, pitch:number}>} mCalSamples - calibrated mag (unit) + tilt (deg)
 * @param {number} wmmInclinationRad - WMM inclination (rad), positive in the northern hemisphere
 * @returns {{preset,label,euler_zyx_deg,quality}|null} null if too few samples / no candidate
 */
export function solveTiltAlignment(mCalSamples, wmmInclinationRad) {
    if (!mCalSamples || mCalSamples.length < MIN_SAMPLES) {
        return null;
    }
    const expectedAngleRad = Math.PI / 2 - wmmInclinationRad; // mag↔gravity angle = dip complement
    const search = subsample(mCalSamples, GRID_SUBSAMPLE);

    // Coarse grid → keep the lowest-cost candidates (both chirality twins are low-cost).
    const coarse = [];
    evalGrid(
        rangeDeg(-180, 180, COARSE_STEP),
        rangeDeg(-90, 90, COARSE_STEP),
        rangeDeg(0, 360 - COARSE_STEP, COARSE_STEP),
        search,
        expectedAngleRad,
        (c) => coarse.push(c),
    );
    if (coarse.length === 0) {
        return null;
    }
    coarse.sort((a, b) => a.cost - b.cost);

    // Refine the top candidates.
    const refined = [];
    for (const seed of coarse.slice(0, REFINE_TOP_N)) {
        let best = seed;
        evalGrid(
            rangeDeg(seed.roll - REFINE_RADIUS, seed.roll + REFINE_RADIUS, REFINE_STEP),
            rangeDeg(seed.pitch - REFINE_RADIUS, seed.pitch + REFINE_RADIUS, REFINE_STEP),
            rangeDeg(seed.yaw - REFINE_RADIUS, seed.yaw + REFINE_RADIUS, REFINE_STEP),
            search,
            expectedAngleRad,
            (c) => {
                if (c.cost < best.cost) {
                    best = c;
                }
            },
        );
        refined.push(best);
    }

    // Unique minimum: a tilt-diverse tumble (enforced by the upstream coverage gate) pins the
    // full proper rotation with no chirality twin, so take the lowest-cost refined candidate.
    if (refined.length === 0) {
        return null;
    }
    const best = refined.reduce((a, b) => (a.cost < b.cost ? a : b), refined[0]);

    const bestMatrix = eulerToMatrix(best.roll, best.pitch, best.yaw);
    const snap = snapToPreset(bestMatrix);
    const appliedMatrix = snap.alignment !== 9 ? ALIGNMENT_MATRICES[snap.alignment] : bestMatrix;
    const euler = snap.alignment === 9 && snap.customAngles ? snap.customAngles : matrixToEuler(appliedMatrix);

    const round2 = (v) => Math.round(v * 100) / 100;
    return {
        preset: snap.alignment,
        label: snap.alignment === 9 ? "CUSTOM" : ALIGNMENT_LABELS[snap.alignment],
        euler_zyx_deg: { roll: round2(euler.roll), pitch: round2(euler.pitch), yaw: round2(euler.yaw) },
        quality: {
            cost: best.cost,
            meanResidualDeg: round2(meanResidualDeg(appliedMatrix, mCalSamples, expectedAngleRad)),
            sampleCount: mCalSamples.length,
            frobNorm: snap.frobNorm,
        },
    };
}
