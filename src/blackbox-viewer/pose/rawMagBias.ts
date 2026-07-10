/**
 * Model-free raw-mag heading-bias estimator.
 *
 * When no mag characterization model is uploaded, this module performs an
 * in-flight hard-iron sphere fit from raw magADC, tilt-compensates with the
 * FC quaternion's trusted tilt, and estimates a constant heading bias:
 *
 *   bias = median(mag_heading − fc_heading)
 *
 * Applying this bias corrects the FC's sustained heading error (typically
 * ~2–3°) without needing the configurator calibration wizard.
 *
 * Scope vs. the uploaded characterization model:
 *  - This estimator removes HARD-IRON only (a constant offset: m − center).
 *    The full characterization model additionally captures SOFT-IRON — the
 *    scale/cross-axis distortion that warps the field sphere into an ellipsoid —
 *    as a 3×3 matrix W_inv applied as newCombined·W_inv·(m − center). Soft iron
 *    makes the heading error orientation-dependent, so a single scalar bias
 *    cannot represent it. Fitting an ellipsoid here (and threading W_inv into
 *    the estimator as a per-sample correction rather than a constant yaw offset)
 *    is the known next step for full parity with the model path; it is
 *    deliberately not attempted yet to keep this path simple and robust.
 *  - We subtract the hard-iron center BEFORE deriving heading (a "correct-then-
 *    compare" order). Comparing on raw, un-centered data entangles the offset
 *    into the heading estimate — the configurator measured this as roughly
 *    11–13° vs ~5° error, so the ordering here is the important part.
 *  - The bias is aggregated with a MEDIAN, not a circular mean: motor-EMI
 *    spikes produce occasional large outliers, and the median rejects them
 *    where a mean would be dragged. The residual angles are small (a few
 *    degrees), so wrap-around bias near ±180° is not a concern.
 *
 * Frame conventions:
 *  - Raw magADC: post-firmware-alignment, already in FRD body frame
 *  - Hard-iron center: computed in the same FRD frame as the raw data
 *  - Calibrated mag: FRD after hard-iron removal (no frame swap needed)
 *  - FC quaternion: standard body FRD → world NED
 *  - Heading: 0°=North, CW+
 */

import type { Vec3, Quat } from './poseSample.js';
import { quatToRot } from './imuMechanization.js';

// ---------------------------------------------------------------------------
// Hard-iron sphere fit
// ---------------------------------------------------------------------------

export interface HardIronResult {
  center: Vec3;
  radius: number;
  rms: number;
  valid: boolean;
}

/**
 * Fit a sphere to raw mag ADC data using linear least squares.
 *
 * Model: |m_i − c|² = R²
 * Expands to: |m_i|² = 2·m_i·c + (R² − |c|²)
 * Linear in [c_x, c_y, c_z, d] where d = R² − |c|².
 *
 * Returns the hard-iron center in the same frame as the input data.
 */
export function fitHardIron(samples: Vec3[]): HardIronResult {
  const n = samples.length;
  if (n < 20) {
    return { center: [0, 0, 0], radius: 0, rms: 0, valid: false };
  }

  // Build normal equations ATA·x = ATb
  const ATA = zeros4();
  const ATb = [0, 0, 0, 0];

  for (const m of samples) {
    const m2 = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
    const row = [2 * m[0], 2 * m[1], 2 * m[2], 1];
    for (let j = 0; j < 4; j++) {
      ATb[j] += row[j] * m2;
      for (let k = 0; k < 4; k++) {
        ATA[j][k] += row[j] * row[k];
      }
    }
  }

  const x = solve4x4(ATA, ATb);
  if (!x) {
    return { center: [0, 0, 0], radius: 0, rms: 0, valid: false };
  }

  const [cx, cy, cz] = x;
  const d = x[3];
  const R = Math.sqrt(Math.max(0, d + cx * cx + cy * cy + cz * cz));

  // RMS residual
  let rmsSum = 0;
  for (const m of samples) {
    const dx = m[0] - cx;
    const dy = m[1] - cy;
    const dz = m[2] - cz;
    const dist = Math.hypot(dx, dy, dz);
    rmsSum += (dist - R) * (dist - R);
  }

  return { center: [cx, cy, cz], radius: R, rms: Math.sqrt(rmsSum / n), valid: true };
}

/** Solve 4×4 linear system via Gaussian elimination with partial pivoting */
function solve4x4(A: number[][], b: number[]): number[] | null {
  const M = A.map((row, i) => [...row, b[i]]);
  const n = 4;

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(M[row][col]);
      if (val > maxVal) { maxVal = val; maxRow = row; }
    }
    if (maxVal < 1e-14) return null;

    if (maxRow !== col) [M[col], M[maxRow]] = [M[maxRow], M[col]];

    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }

  const x = [0, 0, 0, 0];
  for (let row = n - 1; row >= 0; row--) {
    let s = M[row][n];
    for (let j = row + 1; j < n; j++) s -= M[row][j] * x[j];
    x[row] = s / M[row][row];
  }
  return x;
}

function zeros4(): number[][] {
  return [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
}

// ---------------------------------------------------------------------------
// Heading coverage
// ---------------------------------------------------------------------------

/** Minimum heading spread (degrees) for a reliable sphere fit + bias estimate */
const MIN_COVERAGE_SPREAD_DEG = 90;

/**
 * Maximum normalized sphere-fit residual (RMS / radius) we accept. Above this
 * the raw mag does not lie on a sphere — strong soft-iron warp, environmental
 * interference, or bad data — and a hard-iron-only center is not meaningful, so
 * we decline rather than inject a bogus bias. The configurator targets ~2% for a
 * controlled bench tumble; in-flight data is noisier, so this bound is looser.
 */
const MAX_NORMALIZED_RESIDUAL = 0.15;

export interface CoverageCheck {
  minDeg: number;
  maxDeg: number;
  spreadDeg: number;
  sufficient: boolean;
}

/**
 * Check whether the flight includes enough heading diversity for a reliable
 * hard-iron fit and bias estimate.  Computes the angular spread of FC headings
 * (circular gap method).
 */
export function checkHeadingCoverage(
  fcQuat: Array<{ tUs: number; q: Quat }>,
): CoverageCheck {
  if (fcQuat.length < 10) {
    return { minDeg: 0, maxDeg: 0, spreadDeg: 0, sufficient: false };
  }

  const headings = fcQuat.map((entry) => {
    const R = quatToRot(entry.q);
    return Math.atan2(R[1][0], R[0][0]);
  });

  const sorted = [...headings].sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i];
    if (gap > maxGap) maxGap = gap;
  }
  const wrapGap = sorted[0] + 2 * Math.PI - sorted.at(-1)!;
  if (wrapGap > maxGap) maxGap = wrapGap;

  const spreadDeg = ((2 * Math.PI - maxGap) * 180) / Math.PI;
  return {
    minDeg: (sorted[0] * 180) / Math.PI,
    maxDeg: (sorted.at(-1)! * 180) / Math.PI,
    spreadDeg,
    sufficient: spreadDeg >= MIN_COVERAGE_SPREAD_DEG,
  };
}

// ---------------------------------------------------------------------------
// Tilt-compensated mag heading (FRD body frame)
// ---------------------------------------------------------------------------

/**
 * Undo roll and pitch to level a body-frame (FRD) vector into a frame where
 * the X–Y plane is horizontal.  Matches `undoRollPitch` from mag_alignment.js
 * but adapted for FRD (Y = right → East after leveling).
 *
 * Leveling: Ry(−pitch) × Rx(−roll) × v
 */
function levelBodyVector(v: Vec3, rollRad: number, pitchRad: number): Vec3 {
  const cr = Math.cos(-rollRad);
  const sr = Math.sin(-rollRad);
  const cp = Math.cos(-pitchRad);
  const sp = Math.sin(-pitchRad);

  // X: first apply Rx(−roll), then Ry(−pitch)
  const x1 = +v[0] * cp        + v[1] * (sp * sr) + v[2] * (sp * cr);
  const y1 = +v[0] * 0         + v[1] * cr        + v[2] * -sr;
  const z1 = +v[0] * -sp       + v[1] * (cp * sr) + v[2] * (cp * cr);

  return [x1, y1, z1];
}

/**
 * Extract roll and pitch (radians) from a body(FRD)→world(NED) quaternion.
 *
 * Standard ZYX intrinsic decomposition:
 *   R[2][0] = −sin(pitch)
 *   R[2][1] =  cos(pitch)·sin(roll)
 *   R[2][2] =  cos(pitch)·cos(roll)
 */
function extractRollPitch(q: Quat): { roll: number; pitch: number } {
  const R = quatToRot(q);
  const pitch = -Math.asin(clamp(R[2][0], -1, 1));
  const roll = Math.atan2(R[2][1], R[2][2]);
  return { roll, pitch };
}

/**
 * Compute tilt-compensated magnetic heading from body-frame (FRD) mag vector
 * and FC quaternion.
 *
 * @returns heading in degrees (0 = North, CW+)
 */
export function tiltCompensatedMagHeadingDeg(
  magBodyFrd: Vec3,
  fcQuat: Quat,
): number {
  const { roll, pitch } = extractRollPitch(fcQuat);
  const leveled = levelBodyVector(magBodyFrd, roll, pitch);
  // In leveled FRD: X=forward, Y=right(East).
  // Earth's horizontal field points North, so in body frame:
  //   m_leveled_x = H·cos(ψ),  m_leveled_y = −H·sin(ψ)
  //   → ψ = atan2(−m_leveled_y, m_leveled_x)
  // (Matches mag_correction.js: h_mag = atan2(−m_leveled[1], m_leveled[0]))
  return (Math.atan2(-leveled[1], leveled[0]) * 180) / Math.PI;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface MagHeadingBiasResult {
  /** Estimated heading bias in radians: median(mag_heading − fc_heading). */
  biasRad: number;
  /** Hard-iron sphere center (ADC counts, raw FRD body frame). */
  hardIronCenter: Vec3;
  /** Hard-iron sphere radius (ADC counts). */
  hardIronRadius: number;
  /** Hard-iron fit RMS residual (ADC counts). */
  hardIronRms: number;
  /** Heading coverage diagnostics. */
  coverage: CoverageCheck;
  /** Whether the bias estimate is valid for use. */
  valid: boolean;
  /** Human-readable status message. */
  message: string;
}

/**
 * Compute a model-free heading bias by fitting a hard-iron sphere to raw mag
 * data, tilt-compensating with the FC quaternion, and computing the median
 * difference between mag heading and FC heading.
 *
 * @param magRaw  Raw mag ADC entries (FRD body frame, post alignment)
 * @param fcQuat  FC quaternion stream (body FRD → world NED)
 * @returns       Bias estimate with full diagnostics
 */
export function computeMagHeadingBias(
  magRaw: Array<{ tUs: number; meas: Vec3 }>,
  fcQuat: Array<{ tUs: number; q: Quat }>,
): MagHeadingBiasResult {
  const fail = (msg: string): MagHeadingBiasResult => ({
    biasRad: 0,
    hardIronCenter: [0, 0, 0],
    hardIronRadius: 0,
    hardIronRms: 0,
    coverage: { minDeg: 0, maxDeg: 0, spreadDeg: 0, sufficient: false },
    valid: false,
    message: msg,
  });

  if (magRaw.length < 100) return fail(`Too few mag samples (${magRaw.length} < 100)`);

  // ----- Hard-iron sphere fit (raw sensor frame) -----
  const hi = fitHardIron(magRaw.map((m) => m.meas));
  if (!hi.valid) return fail('Hard-iron sphere fit failed (singular matrix)');

  // ----- Fit-quality gate -----
  // Reject a poorly-fitting sphere: a high residual means the data is not
  // sphere-like (soft iron / interference), so the hard-iron center — and any
  // bias derived from it — would be unreliable.
  const normResidual = hi.radius > 0 ? hi.rms / hi.radius : Infinity;
  if (normResidual > MAX_NORMALIZED_RESIDUAL) {
    return fail(
      `Sphere fit residual ${(normResidual * 100).toFixed(1)}% > ` +
      `${(MAX_NORMALIZED_RESIDUAL * 100).toFixed(0)}% (data not sphere-like; ` +
      `likely soft-iron warp or interference). Falling back to FC-only heading.`,
    );
  }

  // ----- Heading coverage -----
  const coverage = checkHeadingCoverage(fcQuat);

  // ----- Match mag and FC quaternion on time -----
  const MAX_MATCH_DT_US = 100_000; // 100 ms — reject stale attitude during dropouts
  const diffs: number[] = [];
  const D = 180 / Math.PI;
  let fcIdx = 0;

  for (const mag of magRaw) {
    // Advance FC index to closest sample before or at mag sample time
    while (fcIdx + 1 < fcQuat.length && fcQuat[fcIdx + 1].tUs <= mag.tUs) {
      fcIdx++;
    }
    if (fcIdx >= fcQuat.length) break;
    const a = fcQuat[fcIdx];
    const b = fcIdx + 1 < fcQuat.length ? fcQuat[fcIdx + 1] : null;
    const fc = b && Math.abs(b.tUs - mag.tUs) < Math.abs(a.tUs - mag.tUs) ? b : a;
    if (Math.abs(fc.tUs - mag.tUs) > MAX_MATCH_DT_US) continue;

    // Hard-iron removal.  The raw magADC from the blackbox log is in the
    // FC's native body frame.  We do NOT apply a frame swap here — instead
    // we rotate the centered vector to world NED using the FC quaternion
    // and read heading from the horizontal world-frame components.  This
    // avoids the pitch-deck problem of tilt-compensating in an unknown
    // body-frame alignment.
    const mCentered: Vec3 = [
      mag.meas[0] - hi.center[0],
      mag.meas[1] - hi.center[1],
      mag.meas[2] - hi.center[2],
    ];

    // Rotate centered mag to world NED via the FC quaternion
    const Rfc = quatToRot(fc.q);
    const mWorldN = Rfc[0][0] * mCentered[0] + Rfc[0][1] * mCentered[1] + Rfc[0][2] * mCentered[2];
    const mWorldE = Rfc[1][0] * mCentered[0] + Rfc[1][1] * mCentered[1] + Rfc[1][2] * mCentered[2];
    // mWorldD not needed for heading

    // Magnetic heading from world-frame horizontal components:
    //   North = mWorldN, East = mWorldE  →  heading = atan2(East, North)
    const magHeadingRad = Math.atan2(mWorldE, mWorldN);
    const magHeadingDeg = magHeadingRad * D;

    // FC heading from quaternion (nose direction in world NED)
    const fcHeadingDeg = (Math.atan2(Rfc[1][0], Rfc[0][0]) * D + 360) % 360;

    // Wrapped difference: mag − FC
    let diffDeg = magHeadingDeg - fcHeadingDeg;
    while (diffDeg > 180) diffDeg -= 360;
    while (diffDeg < -180) diffDeg += 360;
    diffs.push(diffDeg);
  }

  if (diffs.length < 50) return fail(`Too few matched mag/FC samples (${diffs.length} < 50)`);

  // ----- Median bias -----
  const sorted = [...diffs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const biasDeg = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  if (!coverage.sufficient) {
    return {
      biasRad: (biasDeg * Math.PI) / 180,
      hardIronCenter: hi.center,
      hardIronRadius: hi.radius,
      hardIronRms: hi.rms,
      coverage,
      valid: false,
      message: `Insufficient heading coverage: spread ${coverage.spreadDeg.toFixed(0)}° < ${MIN_COVERAGE_SPREAD_DEG}°. Falling back to FC-only heading.`,
    };
  }

  return {
    biasRad: (biasDeg * Math.PI) / 180,
    hardIronCenter: hi.center,
    hardIronRadius: hi.radius,
    hardIronRms: hi.rms,
    coverage,
    valid: true,
    message: `Hard-iron center [${hi.center.map(c => c.toFixed(0)).join(', ')}] ADC, ` +
      `radius ${hi.radius.toFixed(0)}, RMS ${hi.rms.toFixed(1)}, ` +
      `bias ${biasDeg.toFixed(1)}°, ` +
      `coverage spread ${coverage.spreadDeg.toFixed(0)}° (n=${diffs.length})`,
  };
}
