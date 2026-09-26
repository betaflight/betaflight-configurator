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
 * Pure computation helpers for the full magnetometer calibration: deriving the
 * firmware mag_calibration offsets from an ellipsoid fit, mapping align_mag
 * presets to/from rotation matrices, a firmware-capability check, and a tumble
 * quality verdict. The orchestrator characterizeTumble() ties them together.
 *
 * These take explicit data parameters (no Vue refs, no FC store) so they can be
 * unit-tested directly.
 */
import semver from "semver";
import { eulerToMatrix, ALIGNMENT_MATRICES, mat3mulVec, mat3transpose } from "./magAlignment.js";
import { fitEllipsoid } from "./ellipsoidFit.js";
import { check3DCoverage } from "./sphereFit.js";
import { solveTiltAlignment, type TiltAlignmentResult } from "./magTiltAlign";

type Mat3 = number[][];

/** ZYX Euler angles in degrees. */
export interface EulerAngles {
    roll: number;
    pitch: number;
    yaw: number;
}

/** A 3-vector in Cartesian sensor space (mag reading, offset, or fit center). */
export interface Vec3Point {
    x: number;
    y: number;
    z: number;
}

/** The ellipsoid fit as fitEllipsoid() reports it. */
export interface EllipsoidParams {
    center: Vec3Point;
    W_inv: number[][];
    radius: number;
    residual: number;
}

/** Just the fields proposedMatrixOf() needs from a tilt-solve result. */
export interface TiltProposal {
    preset: number;
    euler_zyx_deg?: EulerAngles;
}

/** One collected guided-mode sample: mag reading plus the tilt it was taken at. */
export interface TumbleSample {
    x: number;
    y: number;
    z: number;
    roll: number;
    pitch: number;
}

export interface CharacterizeTumbleArgs {
    samples: TumbleSample[];
    currentMatrix: Mat3;
    inclinationRad: number;
}

/** A successful characterizeTumble() run: the proposed alignment and the offsets that go with it. */
export interface TumbleCharacterization {
    ok: true;
    preset: number;
    label: string;
    euler_zyx_deg: EulerAngles;
    offsets: Vec3Point;
    ellipsoid: EllipsoidParams;
    quality: TiltAlignmentResult["quality"];
}

export type CharacterizeTumbleResult = TumbleCharacterization | { ok: false; error: string };

export type TumbleVerdict = "clean" | "suspect" | "contaminated";

// ALIGNMENT_MATRICES comes from the untyped JS module keyed by the 1..8 preset ids.
const alignmentMatrices = ALIGNMENT_MATRICES as Record<number, Mat3>;

// ── Firmware version gate ───────────────────────────────────────────────────
// "Fix mag_align_yaw" (betaflight#14849, merged 2025-12-30, first release
// 2026.6.0) negates angles before buildRotationMatrix so the net applied
// transform is Rz(yaw)*Ry(pitch)*Rx(roll). Older firmware applies the inverse.
export const MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN = "2026.6.0";

/**
 * Returns true when the firmware contains #14849 (angle negation + transpose).
 * semver.coerce strips pre-release tags; master builds like 2026.6.0-alpha
 * are accepted — their build date cannot be verified from the version string
 * alone. Unknown/unparseable versions safely return false.
 */
export function isFirmwareCustomMagAlignCapable(versionString: string | null | undefined): boolean {
    const v = semver.coerce(versionString ?? "");
    return !!v && semver.gte(v, MIN_FC_VERSION_FOR_CUSTOM_MAG_ALIGN);
}

/**
 * The 3x3 matrix the firmware is CURRENTLY applying for a given align_mag
 * configuration. Single home for the preset/CUSTOM branching.
 *
 * @param currentAlignment - align_mag value (0-9; 0 treated as CW0)
 * @param customAngles - degrees, required when currentAlignment === 9
 * @returns null when CUSTOM is selected but angles are missing
 */
export function currentMatrixOf(currentAlignment: number, customAngles: EulerAngles | null): Mat3 | null {
    if (currentAlignment === 9) {
        if (!customAngles) {
            return null;
        }
        return eulerToMatrix(customAngles.roll, customAngles.pitch, customAngles.yaw);
    }
    const al = currentAlignment >= 1 && currentAlignment <= 8 ? currentAlignment : 1;
    return alignmentMatrices[al];
}

/**
 * The 3x3 matrix a tilt-solve result proposes (sensor to body).
 * Single home for the result-to-matrix derivation.
 *
 * @param result - the tilt-solve result
 * @param fallbackMat - returned when the result carries no usable alignment (defaults to identity/CW0)
 */
export function proposedMatrixOf(result: TiltProposal, fallbackMat: Mat3 = alignmentMatrices[1]): Mat3 {
    if (result.preset === 9 && result.euler_zyx_deg) {
        return eulerToMatrix(result.euler_zyx_deg.roll, result.euler_zyx_deg.pitch, result.euler_zyx_deg.yaw);
    }
    return alignmentMatrices[result.preset] ?? fallbackMat;
}

/**
 * Derive firmware mag_calibration offsets from the ellipsoid fit center.
 *
 * Frame derivation (betaflight compass.c:492-550 — alignment is applied FIRST,
 * then mag_calibration is subtracted, so magZero lives in the ALIGNED BODY
 * frame of whatever alignment is active):
 *
 *   capture:  m = R_capture * s - magZero_capture   (what MSP_RAW_IMU streams)
 *   fit:      center ≈ R_capture * b - magZero_capture  (bias of m, capture frame)
 *   sensor bias:  b = R_captureT * (center + magZero_capture)
 *   after the proposed alignment R_proposed is applied, firmware needs:
 *     magZero_new = R_proposed * b = newCombined * (center + magZero_capture)
 *   where newCombined = R_proposed * R_captureT.
 *
 * @param newCombined - R_proposed * R_captureT (3x3); identity when the proposed
 *   alignment equals the alignment active during capture
 * @param magZeroAtCapture - mag_calibration values active on the FC during
 *   capture (null = assumed zero)
 */
export function computeCalFromEllipsoid(
    ellipsoidParams: EllipsoidParams | null,
    newCombined: Mat3 | null,
    magZeroAtCapture: Vec3Point | null = null,
): Vec3Point | null {
    if (!ellipsoidParams) {
        return null;
    }
    const c = ellipsoidParams.center;
    const z = magZeroAtCapture ?? { x: 0, y: 0, z: 0 };
    const b = [c.x + z.x, c.y + z.y, c.z + z.z];
    const m = newCombined ?? [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
    ];
    return {
        x: Math.round(m[0][0] * b[0] + m[0][1] * b[1] + m[0][2] * b[2]),
        y: Math.round(m[1][0] * b[0] + m[1][1] * b[1] + m[1][2] * b[2]),
        z: Math.round(m[2][0] * b[0] + m[2][1] * b[1] + m[2][2] * b[2]),
    };
}

/**
 * Run the full improved-tumble pipeline on the collected guided-mode samples.
 * Sync, pure — no Vue refs, no network. Unit-testable.
 *
 * Guided-mode collection already added the firmware mag_calibration offset back
 * into every sample, so samples are in the CURRENT ALIGNMENT FRAME (R_cur·raw_sensor).
 * This function un-applies R_cur to get raw-sensor frame, then fits the ellipsoid,
 * solves tilt+WMM alignment, and computes firmware offsets.
 */
export function characterizeTumble({
    samples,
    currentMatrix,
    inclinationRad,
}: CharacterizeTumbleArgs): CharacterizeTumbleResult {
    if (!samples || samples.length < 40) {
        return { ok: false, error: "Not enough samples — need at least 40. Spin longer." };
    }

    const R_curT = mat3transpose(currentMatrix);
    const rawSamples = samples.map((s) => {
        const raw = mat3mulVec(R_curT, [s.x, s.y, s.z]);
        return { x: raw[0], y: raw[1], z: raw[2], roll: s.roll, pitch: s.pitch };
    });

    const covCheck = check3DCoverage(rawSamples.map((s) => ({ x: s.x, y: s.y, z: s.z })));
    if (!covCheck.ok) {
        // check3DCoverage always sets `reason` on failure; the fallback only satisfies its
        // JSDoc typing where `reason` is optional regardless of `ok`.
        return { ok: false, error: covCheck.reason ?? "3D coverage check failed." };
    }

    const rawPoints = rawSamples.map((s) => ({ x: s.x, y: s.y, z: s.z }));
    const ep = fitEllipsoid(rawPoints);
    if (!ep) {
        return { ok: false, error: "Ellipsoid fit failed — spin through more orientations." };
    }

    const mCalSamples = rawSamples.map((s) => {
        const centered = [s.x - ep.center.x, s.y - ep.center.y, s.z - ep.center.z];
        const cal = mat3mulVec(ep.W_inv, centered);
        return { m_cal: cal, roll: s.roll, pitch: s.pitch };
    });

    const tilt = solveTiltAlignment(mCalSamples, inclinationRad);
    if (!tilt) {
        return { ok: false, error: "Alignment solve failed — ensure sufficient tilt diversity." };
    }

    const proposedMat = proposedMatrixOf(tilt);
    const offsets = computeCalFromEllipsoid(ep, proposedMat, null);

    if (!offsets) {
        return { ok: false, error: "Failed to compute calibration offsets." };
    }

    return {
        ok: true,
        preset: tilt.preset,
        label: tilt.label,
        euler_zyx_deg: tilt.euler_zyx_deg,
        offsets,
        ellipsoid: ep,
        quality: tilt.quality,
    };
}

// ── Quality assessment ──────────────────────────────────────────────────────

/**
 * Assess tumble quality from ellipsoid fit and coverage metrics.
 */
export function assessTumbleQuality({
    centerRatio,
    coverageFraction,
    ellipsoidResidual,
}: {
    centerRatio: number;
    coverageFraction: number;
    ellipsoidResidual: number;
}): { verdict: TumbleVerdict; reasons: string[] } {
    const reasons: string[] = [];
    if (centerRatio >= 0.5) {
        reasons.push(`center_ratio ${centerRatio.toFixed(2)} >= 0.50: world-frame interference likely (bench capture)`);
    } else if (centerRatio >= 0.15) {
        reasons.push(`center_ratio ${centerRatio.toFixed(2)} >= 0.15: some contamination or moderate hard iron`);
    }
    if (coverageFraction < 0.8) {
        reasons.push(
            `coverage ${(coverageFraction * 100).toFixed(0)}% < 80%: tumble did not cover enough sphere regions`,
        );
    }
    if (ellipsoidResidual >= 0.02) {
        reasons.push(`ellipsoid_residual ${(ellipsoidResidual * 100).toFixed(1)}% >= 2.0%: fit quality below target`);
    }

    let verdict: TumbleVerdict;
    if (centerRatio < 0.15 && coverageFraction >= 0.8 && ellipsoidResidual < 0.02) {
        verdict = "clean";
    } else if (centerRatio < 0.5 && coverageFraction >= 0.6) {
        verdict = "suspect";
    } else {
        verdict = "contaminated";
    }
    return { verdict, reasons };
}
