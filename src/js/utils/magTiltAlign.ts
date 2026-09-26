/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

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
import { degToRad, radToDeg, clamp } from "./common";

type Vec3 = [number, number, number];
type Mat3 = number[][];
type Euler = { roll: number; pitch: number; yaw: number };

/** One tumble sample: calibrated mag (unit vector) and the tilt it was taken at (degrees). */
export interface MagTiltSample {
    m_cal: number[];
    roll: number;
    pitch: number;
}

/** A grid point in the search, with its accumulated robust cost. */
interface Candidate {
    roll: number;
    pitch: number;
    yaw: number;
    cost: number;
}

/** The recovered alignment plus a quality report on the fit. */
export interface TiltAlignmentResult {
    preset: number;
    label: string;
    euler_zyx_deg: { roll: number; pitch: number; yaw: number };
    quality: {
        cost: number;
        meanResidualDeg: number;
        sampleCount: number;
        frobNorm: number;
    };
}

// Robust M-estimator on the dip residual, in ANGLE space (latitude-independent).
const SLACK_RAD = degToRad(3.0); // residual below this is free
const CAP_RAD = degToRad(15.0); // residual above this is capped (outlier rejection)
const MAX_PENALTY = (CAP_RAD - SLACK_RAD) * (CAP_RAD - SLACK_RAD);

const MIN_SAMPLES = 20;
const GRID_SUBSAMPLE = 300; // cap samples used by the search (perf; full set used for final residual)
const COARSE_STEP = 15; // degrees
const REFINE_STEP = 2; // degrees
const REFINE_RADIUS = 12; // degrees
const REFINE_TOP_N = 8; // how many of the top coarse candidates to refine

function normalize3(v: number[]): Vec3 {
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1e-12) {
        return [0, 0, 0];
    }
    return [v[0] / len, v[1] / len, v[2] / len];
}

function dot3(a: number[], b: number[]): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Gravity (down) in the FLU body frame from roll/pitch (degrees). Level → [0,0,-1]. */
function gravityInBody(rollDeg: number, pitchDeg: number): Vec3 {
    const r = degToRad(rollDeg);
    const p = degToRad(pitchDeg);
    return [Math.sin(p), -Math.sin(r) * Math.cos(p), -Math.cos(r) * Math.cos(p)];
}

/** |measured mag↔gravity angle − expected dip angle|, in radians, for one sample. */
function dipResidualRad(R: Mat3, s: MagTiltSample, expectedAngleRad: number): number {
    const mUnit = normalize3(mat3mulVec(R, s.m_cal));
    const gUnit = normalize3(gravityInBody(s.roll, s.pitch));
    const actualAngle = Math.acos(clamp(dot3(mUnit, gUnit), -1, 1));
    return Math.abs(actualAngle - expectedAngleRad);
}

function computeCost(R: Mat3, samples: MagTiltSample[], expectedAngleRad: number): number {
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

function meanResidualDeg(R: Mat3, samples: MagTiltSample[], expectedAngleRad: number): number {
    let sum = 0;
    for (const s of samples) {
        sum += dipResidualRad(R, s, expectedAngleRad);
    }
    return radToDeg(sum / samples.length);
}

function evalGrid(
    rollVals: number[],
    pitchVals: number[],
    yawVals: number[],
    samples: MagTiltSample[],
    expectedAngleRad: number,
    sink: (candidate: Candidate) => void,
): void {
    for (const roll of rollVals) {
        for (const pitch of pitchVals) {
            for (const yaw of yawVals) {
                const R = eulerToMatrix(roll, pitch, yaw);
                sink({ roll, pitch, yaw, cost: computeCost(R, samples, expectedAngleRad) });
            }
        }
    }
}

function rangeDeg(start: number, end: number, step: number): number[] {
    const out: number[] = [];
    const n = Math.round((end - start) / step);
    for (let i = 0; i <= n; i++) {
        out.push(start + i * step);
    }
    return out;
}

function subsample(samples: MagTiltSample[], cap: number): MagTiltSample[] {
    if (samples.length <= cap) {
        return samples;
    }
    const stride = Math.ceil(samples.length / cap);
    const out: MagTiltSample[] = [];
    for (let i = 0; i < samples.length; i += stride) {
        out.push(samples[i]);
    }
    return out;
}

/**
 * @param mCalSamples - calibrated mag (unit) + tilt (deg)
 * @param wmmInclinationRad - WMM inclination (rad), positive in the northern hemisphere
 * @returns null if too few samples / no candidate
 */
export function solveTiltAlignment(
    mCalSamples: MagTiltSample[],
    wmmInclinationRad: number,
): TiltAlignmentResult | null {
    if (!mCalSamples || mCalSamples.length < MIN_SAMPLES) {
        return null;
    }
    const expectedAngleRad = Math.PI / 2 - wmmInclinationRad; // mag↔gravity angle = dip complement
    const search = subsample(mCalSamples, GRID_SUBSAMPLE);

    // Coarse grid → keep the lowest-cost candidates (both chirality twins are low-cost).
    const coarse: Candidate[] = [];
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
    const refined: Candidate[] = [];
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

    // ALIGNMENT_MATRICES / ALIGNMENT_LABELS come from the untyped JS module keyed by the 1..8
    // preset ids; snapToPreset only returns those (or 9, guarded here), so index by number.
    const alignmentMatrices = ALIGNMENT_MATRICES as Record<number, Mat3>;
    const alignmentLabels = ALIGNMENT_LABELS as Record<number, string>;

    const bestMatrix = eulerToMatrix(best.roll, best.pitch, best.yaw);
    const snap = snapToPreset(bestMatrix);
    const appliedMatrix = snap.alignment !== 9 ? alignmentMatrices[snap.alignment] : bestMatrix;
    const euler: Euler =
        snap.alignment === 9 && snap.customAngles ? (snap.customAngles as Euler) : matrixToEuler(appliedMatrix);

    const round2 = (v: number): number => Math.round(v * 100) / 100;
    return {
        preset: snap.alignment,
        label: snap.alignment === 9 ? "CUSTOM" : alignmentLabels[snap.alignment],
        euler_zyx_deg: { roll: round2(euler.roll), pitch: round2(euler.pitch), yaw: round2(euler.yaw) },
        quality: {
            cost: best.cost,
            meanResidualDeg: round2(meanResidualDeg(appliedMatrix, mCalSamples, expectedAngleRad)),
            sampleCount: mCalSamples.length,
            frobNorm: snap.frobNorm,
        },
    };
}
