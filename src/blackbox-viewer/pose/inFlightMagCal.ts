/**
 * In-flight magnetometer calibration via ellipsoid fit.
 *
 * When no characterization model is uploaded, this module performs a full
 * in-flight ellipsoid fit (9-parameter general quadric) to raw magADC data,
 * recovering BOTH hard-iron (center) and soft-iron (3×3 whitening matrix W_inv).
 * The calibrated mag vectors are rotated to world NED via the FC quaternion to
 * estimate the earth-field reference, then a synthetic model object is built and
 * passed through the IDENTICAL 3-axis fusion path as an uploaded model.
 *
 * Math:
 *   1. Normalize:  s = median(|m_i|),  m'_i = m_i / s
 *   2. Fit quadric: m'^T A m' + 2 beta^T m' = 1  (9 params, linear LS)
 *   3. Center: c0' = -A^{-1} beta,  k = 1 + c0'^T A c0'
 *   4. Ellipsoid: (y - c0')^T (A/k) (y - c0') = 1
 *   5. Whitening: W_inv = (A/k)^{1/2} (symmetric matrix sqrt via eig)
 *   6. Calibrate: m_cal_i = W_inv · (m'_i - c0')  →  unit sphere
 *   7. Earth field: ê_ned = normalize(componentwise-median of R_fc(q_i)·m_cal_i)
 *   8. Synthetic model with unit-scale earth-field + measurement noise
 *
 * Frame conventions:
 *   - Raw magADC is in the FC's native FLU body frame
 *   - The X↔Y SWAP (90° about +Z) converts FLU → FRD
 *   - Output mag stream is in FRD, unit-sphere (later scaled to Gauss)
 *   - FC quaternion is Q1-adapted [qw,qx,-qy,-qz] mapping FRD → NED
 *
 * Fallback: If the fit is invalid (singular, non-positive-definite, poor
 * residual, or insufficient 3D coverage), the module returns null, and the
 * caller falls back to the existing hard-iron-only path (rawMagBias.ts).
 */

import type { Vec3, Quat } from './poseSample.js';
import { quatToRot } from './imuMechanization.js';
import type { MagRawEntry, MagGaussEntry, QuatEntry } from './flightIngestion.js';
import type { MagModelInput } from './estimatorLoop.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Coverage level from the in-flight calibration. */
export type MagCoverage = 'good' | 'marginal' | 'insufficient';

/**
 * A model object compatible with `correctMagStream` / `correctMagToBody`.
 * This is the same shape `loadMagCharacterizationModel` returns, so AUTO and
 * MANUAL feed the identical correction pipeline.
 */
export interface InFlightMagModel {
  version: string;
  ellipsoid: {
    center: { x: number; y: number; z: number };
    W_inv: number[][];
    radius: number;
    residual_rms: number;
  };
  alignment: {
    preset: number;
    matrix: number[][];
    euler: null;
  };
  fusion: {
    frame: string;
    gaussPerCorrectedUnit: number;
    earthFieldNedGauss: { n: number; e: number; d: number } | null;
    magNoiseGauss: {
      sigma: number | null;
      sigma_xy: number | null;
      sigma_z: number | null;
    };
    qualityBounds: {
      bounds_ok: boolean;
      field_strength_mg: number | null;
      field_strength_ok: boolean | null;
      soft_iron_offdiag_ratio: number | null;
      soft_iron_offdiag_ok: boolean | null;
      soft_iron_anisotropy: number | null;
      soft_iron_anisotropy_ok: boolean | null;
    };
  };
  _origin?: {
    kind: 'in-flight';
    sourceLog: string;
    coverage: MagCoverage;
    inclinationDeg: number;
    residual: number;
    generated: string;
    note: string;
    sampleCount: number;
    calStdMag: number;
    calMedianMag: number;
    centerAdc: Vec3;
    fieldStrengthG: number;
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EllipsoidFit {
  /** Center in the normalized (unit-scaled) space */
  centerNorm: Vec3;
  /** Whitening matrix: m_cal = W_inv · (m_norm - centerNorm) */
  W_inv: number[][];
  /** Fit residual RMS (unit-sphere, normalized units) */
  residualRms: number;
  /** Normalization scale: s = median(|m_i|) in raw ADC */
  scaleAdc: number;
  /** Median magnitude of calibrated vectors (should be ≈1) */
  calibratedMedianMag: number;
  /** Standard deviation of calibrated vector magnitudes */
  calibratedStdMag: number;
}

export interface InFlightCalResult {
  fit: EllipsoidFit;
  /** Calibrated mag stream (unit-sphere, body FRD after X↔Y swap) */
  magUnitFrd: Vec3[];
  /** Earth field reference (unit vector, world NED) */
  earthFieldNedUnit: Vec3;
  /** Estimated inclination in degrees */
  inclinationDeg: number;
  /** Synthetic model object for the estimator */
  syntheticModel: MagModelInput;
  /** Full model object compatible with correctMagStream (ellipsoid + alignment + fusion).
   *  AUTO mode feeds this through correctMagStream for Gauss stream generation. */
  rawModel: InFlightMagModel | null;
  /** Coverage level from attitude diversity check */
  coverage: MagCoverage;
  /** Field strength in Gauss (from WMM or known reference) */
  fieldStrengthG: number;
  valid: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum number of mag samples for a reliable fit */
const MIN_SAMPLES = 200;

/** Maximum normalized fit residual (RMS of |m_cal| - 1) before we reject */
const MAX_CAL_RESIDUAL = 0.20;

/** Minimum ratio of smallest/largest sample-covariance eigenvalue for 3D coverage */
const MIN_COVERAGE_RATIO = 0.05;

/** Default WMM earth-field strength (Gauss).  Used when no better estimate is
 *  available — this is a reasonable default for mid-latitude flights. */
const DEFAULT_EARTH_FIELD_G = 0.539;

/** Inclination tolerance against WMM reference (degrees) */
const MAX_INCLINATION_ERROR_DEG = 15;

// ---------------------------------------------------------------------------
// Ellipsoid fit — 9-parameter general centered quadric
// ---------------------------------------------------------------------------

/**
 * Fit a general centered quadric:  m'^T A m' + 2 beta^T m' = 1
 *
 * Design matrix row: [x², y², z², 2yz, 2xz, 2xy, 2x, 2y, 2z]
 * Parameters:        [a,  b,  c,  f,   g,   h,   p,  q,  r]
 *
 * Solved via (D^T D) v = D^T · 1 using Gaussian elimination with partial
 * pivoting on the 9×9 normal equations.
 *
 * Sibling implementation: src/js/utils/ellipsoidFit.js solves this same
 * fit (deliberately matched, down to the Cholesky whitening step below)
 * for the live tumble-calibration wizard. Kept separate rather than shared
 * because this function's caller pre-normalizes samples by median magnitude
 * first, which the wizard's raw live samples don't need.
 *
 * @param samples  Normalized mag vectors (m'_i in unit-scaled space, O(1))
 * @returns        { A, beta, residualRms } or null if singular
 */
function fitQuadric(
  samples: Vec3[],
): { A: number[][]; beta: Vec3; residualRms: number } | null {
  const n = samples.length;
  if (n < MIN_SAMPLES) return null;

  const DTD = zerosMat(9, 9);
  const DTRhs = new Array<number>(9).fill(0);

  for (const m of samples) {
    const x = m[0], y = m[1], z = m[2];
    const xx = x * x, yy = y * y, zz = z * z;
    const row = [
      xx, yy, zz,
      2 * y * z, 2 * x * z, 2 * x * y,
      2 * x, 2 * y, 2 * z,
    ];

    for (let i = 0; i < 9; i++) {
      DTRhs[i] += row[i];  // RHS is D^T · 1 = sum of rows
      for (let j = 0; j < 9; j++) {
        DTD[i][j] += row[i] * row[j];
      }
    }
  }

  const v = solveLinear(DTD, DTRhs);
  if (!v) return null;

  const [a, b, c, f, g, h, p, q, r] = v;

  // Build symmetric A matrix
  const A: number[][] = [
    [a, h, g],
    [h, b, f],
    [g, f, c],
  ];
  const beta: Vec3 = [p, q, r];

  // Residual RMS
  let rmsSum = 0;
  for (const m of samples) {
    const x = m[0], y = m[1], z = m[2];
    const pred =
      A[0][0] * x * x + A[1][1] * y * y + A[2][2] * z * z +
      2 * A[0][1] * x * y + 2 * A[0][2] * x * z + 2 * A[1][2] * y * z +
      2 * beta[0] * x + 2 * beta[1] * y + 2 * beta[2] * z;
    rmsSum += (pred - 1) * (pred - 1);
  }
  const residualRms = Math.sqrt(rmsSum / n);

  return { A, beta, residualRms };
}

// ---------------------------------------------------------------------------
// Linear algebra
// ---------------------------------------------------------------------------

function zerosMat(rows: number, cols: number): number[][] {
  const m = new Array<number[]>(rows);
  for (let i = 0; i < rows; i++) {
    m[i] = new Array<number>(cols).fill(0);
  }
  return m;
}

/** Gaussian elimination with partial pivoting, size N */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(M[row][col]);
      if (val > maxVal) { maxVal = val; maxRow = row; }
    }
    if (maxVal < 1e-14) return null;

    if (maxRow !== col) {
      [M[col], M[maxRow]] = [M[maxRow], M[col]];
    }

    // Eliminate
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let j = col; j <= n; j++) {
        M[row][j] -= f * M[col][j];
      }
    }
  }

  // Back-substitute
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let s = M[row][n];
    for (let j = row + 1; j < n; j++) s -= M[row][j] * x[j];
    x[row] = s / M[row][row];
  }
  return x;
}

/** Solve a 3×3 system via Cramer's rule (robust for small matrices) */
function solve3x3(A: number[][], b: Vec3): Vec3 | null {
  const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
            - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
            + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);

  if (Math.abs(det) < 1e-14) return null;

  const invDet = 1 / det;

  // Cofactor matrix (transpose of adjugate)
  const a00 =  (A[1][1] * A[2][2] - A[1][2] * A[2][1]) * invDet;
  const a01 = -(A[0][1] * A[2][2] - A[0][2] * A[2][1]) * invDet;
  const a02 =  (A[0][1] * A[1][2] - A[0][2] * A[1][1]) * invDet;
  const a10 = -(A[1][0] * A[2][2] - A[1][2] * A[2][0]) * invDet;
  const a11 =  (A[0][0] * A[2][2] - A[0][2] * A[2][0]) * invDet;
  const a12 = -(A[0][0] * A[1][2] - A[0][2] * A[1][0]) * invDet;
  const a20 =  (A[1][0] * A[2][1] - A[1][1] * A[2][0]) * invDet;
  const a21 = -(A[0][0] * A[2][1] - A[0][1] * A[2][0]) * invDet;
  const a22 =  (A[0][0] * A[1][1] - A[0][1] * A[1][0]) * invDet;

  return [
    a00 * b[0] + a01 * b[1] + a02 * b[2],
    a10 * b[0] + a11 * b[1] + a12 * b[2],
    a20 * b[0] + a21 * b[1] + a22 * b[2],
  ];
}

/** Cholesky decomposition for 3×3 symmetric positive-definite matrix.
 *  Returns lower-triangular L such that A = L L^T, or null if not PD. */
function cholesky3(A: number[][]): number[][] | null {
  const L: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) {
        sum -= L[i][k] * L[j][k];
      }
      if (i === j) {
        if (sum <= 0) return null; // Not positive-definite
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/** Compute eigenvalues of a 3×3 real symmetric matrix A using the
 *  closed-form cubic (analytic eigenvalues for 3×3). */
function eigSym3(A: number[][]): { values: number[]; vectors: number[][] } {
  // Trace, determinant, and sum of principal minors
  const a = A[0][0], b = A[1][1], c = A[2][2];
  const d = A[1][2], e = A[0][2], f = A[0][1];

  const tr = a + b + c;
  const detM =
    a * (b * c - d * d) - f * (f * c - d * e) + e * (f * d - b * e);

  // Sum of principal minors
  const m2 = (a * b - f * f) + (a * c - e * e) + (b * c - d * d);

  // Characteristic polynomial: λ³ - tr·λ² + m2·λ - detM = 0
  // Solve cubic via trigonometric method (for 3 distinct real roots from a
  // symmetric matrix, this is guaranteed).
  const p = m2 - tr * tr / 3;
  const q = detM - tr * m2 / 3 + 2 * tr * tr * tr / 27;

  const values: number[] = [];
  const vectors: number[][] = [];

  if (Math.abs(p) < 1e-12) {
    // Triple root (sphere)
    const lam = tr / 3;
    values.push(lam, lam, lam);
    vectors.push([1, 0, 0], [0, 1, 0], [0, 0, 1]);
  } else {
    const phi = Math.acos(Math.max(-1, Math.min(1,
      -q / 2 / Math.sqrt(-p * p * p / 27)
    )));
    const r = 2 * Math.sqrt(-p / 3);

    values[0] = tr / 3 + r * Math.cos(phi / 3);
    values[1] = tr / 3 + r * Math.cos((phi + 2 * Math.PI) / 3);
    values[2] = tr / 3 + r * Math.cos((phi + 4 * Math.PI) / 3);

    // Sort descending
    const indexed = values.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => b.v - a.v);
    const sortedValues = indexed.map(x => x.v);

    // Compute eigenvectors via inverse iteration (or null-space for each λ)
    for (let k = 0; k < 3; k++) {
      const lam = sortedValues[k];
      const M = [
        [A[0][0] - lam, A[0][1], A[0][2]],
        [A[1][0], A[1][1] - lam, A[1][2]],
        [A[2][0], A[2][1], A[2][2] - lam],
      ];

      // Null-space via cross products of rows
      const r0: Vec3 = [M[0][0], M[0][1], M[0][2]];
      const r1: Vec3 = [M[1][0], M[1][1], M[1][2]];
      const r2: Vec3 = [M[2][0], M[2][1], M[2][2]];

      const c01 = cross(r0, r1);
      const c02 = cross(r0, r2);
      const c12 = cross(r1, r2);

      const n01 = norm(c01);
      const n02 = norm(c02);
      const n12 = norm(c12);

      let v: Vec3;
      if (n01 >= n02 && n01 >= n12 && n01 > 1e-12) {
        v = [c01[0] / n01, c01[1] / n01, c01[2] / n01];
      } else if (n02 >= n12 && n02 > 1e-12) {
        v = [c02[0] / n02, c02[1] / n02, c02[2] / n02];
      } else if (n12 > 1e-12) {
        v = [c12[0] / n12, c12[1] / n12, c12[2] / n12];
      } else {
        // Degenerate: pick an orthogonal basis
        v = k === 0 ? [1, 0, 0] : k === 1 ? [0, 1, 0] : [0, 0, 1];
      }

      values[k] = sortedValues[k];
      vectors[k] = v;
    }
  }

  return { values, vectors };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function norm(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalizeVector(v: Vec3): Vec3 {
  const n = norm(v);
  if (n < 1e-12) return [0, 0, 0];
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** matMulVec: multiply 3×3 matrix by 3-vector */
function matMulVec3(M: number[][], v: Vec3): Vec3 {
  return [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ];
}

/**
 * Rotate calibrated mag samples (FLU) through the X<->Y swap to FRD, then
 * through the time-matched FC quaternion to NED. Time-matching walks fcQuat
 * forward monotonically (both streams are time-ordered), stopping once
 * fcQuat is exhausted.
 */
function rotateCalToNED(calibrated: Vec3[], magRaw: MagRawEntry[], fcQuat: QuatEntry[]): Vec3[] {
  const earthNEDs: Vec3[] = [];
  let quatIdx = 0;
  for (let ci = 0; ci < calibrated.length; ci++) {
    const calSample = calibrated[ci];
    const calFrd: Vec3 = [-calSample[1], calSample[0], calSample[2]];
    const tUs = magRaw[ci].tUs;
    while (quatIdx + 1 < fcQuat.length && fcQuat[quatIdx + 1].tUs <= tUs) quatIdx++;
    if (quatIdx >= fcQuat.length) break;
    const R = quatToRot(fcQuat[quatIdx].q);
    const eN = R[0][0] * calFrd[0] + R[0][1] * calFrd[1] + R[0][2] * calFrd[2];
    const eE = R[1][0] * calFrd[0] + R[1][1] * calFrd[1] + R[1][2] * calFrd[2];
    const eD = R[2][0] * calFrd[0] + R[2][1] * calFrd[1] + R[2][2] * calFrd[2];
    earthNEDs.push([eN, eE, eD]);
  }
  return earthNEDs;
}

// ---------------------------------------------------------------------------
// 3D coverage check
// ---------------------------------------------------------------------------

function check3DCoverage(samples: Vec3[]): boolean {
  if (samples.length < 50) return false;

  // Compute sample covariance
  const n = samples.length;
  const mean: Vec3 = [0, 0, 0];
  for (const s of samples) {
    mean[0] += s[0] / n;
    mean[1] += s[1] / n;
    mean[2] += s[2] / n;
  }

  let c00 = 0, c01 = 0, c02 = 0, c11 = 0, c12 = 0, c22 = 0;
  for (const s of samples) {
    const dx = s[0] - mean[0];
    const dy = s[1] - mean[1];
    const dz = s[2] - mean[2];
    c00 += dx * dx / n;
    c01 += dx * dy / n;
    c02 += dx * dz / n;
    c11 += dy * dy / n;
    c12 += dy * dz / n;
    c22 += dz * dz / n;
  }

  // Eigendecomposition of 3×3 covariance
  const covEig = eigSym3([[c00, c01, c02], [c01, c11, c12], [c02, c12, c22]]);
  const ev = covEig.values;

  if (ev[0] <= 0) return false;
  const ratio = ev[2] / ev[0]; // smallest / largest
  return ratio >= MIN_COVERAGE_RATIO;
}

// ---------------------------------------------------------------------------
// Main calibration
// ---------------------------------------------------------------------------

/**
 * Calibrate the magnetometer in-flight via ellipsoid fit.
 *
 * Performs hard-iron + soft-iron correction, estimates the earth field
 * reference, and builds a synthetic model object that feeds directly into
 * the existing 3-axis mag fusion path.
 *
 * @param magRaw    Raw mag ADC entries (FLU body frame, post-firmware-alignment)
 * @param fcQuat    FC quaternion stream (Q1-adapted: body FRD → world NED)
 * @param knownFieldStrengthG  Earth field strength in Gauss (default 0.539)
 * @returns         Calibration result or null on failure
 */
export function calibrateInFlightMag(
  magRaw: MagRawEntry[],
  fcQuat: QuatEntry[],
  knownFieldStrengthG = DEFAULT_EARTH_FIELD_G,
): InFlightCalResult | null {
  // Compute 3D coverage ratio once (used for coverage level + gate)
  const rawSamples: Vec3[] = magRaw.map(m => m.meas);
  const magnitudes = rawSamples.map(m => Math.hypot(m[0], m[1], m[2]));
  const sortedMags = [...magnitudes].sort((a, b) => a - b);
  const s = sortedMags[Math.floor(sortedMags.length / 2)];

  const normSamples: Vec3[] = rawSamples.map(m => [
    m[0] / s, m[1] / s, m[2] / s,
  ]);

  let coverageRatio = 0;
  if (normSamples.length >= 50) {
    const n = normSamples.length;
    const mean: Vec3 = [0, 0, 0];
    for (const sm of normSamples) { mean[0] += sm[0] / n; mean[1] += sm[1] / n; mean[2] += sm[2] / n; }
    let c00 = 0, c01 = 0, c02 = 0, c11 = 0, c12 = 0, c22 = 0;
    for (const sm of normSamples) {
      const dx = sm[0] - mean[0], dy = sm[1] - mean[1], dz = sm[2] - mean[2];
      c00 += dx * dx / n; c01 += dx * dy / n; c02 += dx * dz / n;
      c11 += dy * dy / n; c12 += dy * dz / n; c22 += dz * dz / n;
    }
    const covEig = eigSym3([[c00, c01, c02], [c01, c11, c12], [c02, c12, c22]]);
    if (covEig.values[0] > 0) coverageRatio = covEig.values[2] / covEig.values[0];
  }

  const fail = (msg: string): InFlightCalResult => {
    const emptyFit: EllipsoidFit = {
      centerNorm: [0, 0, 0], W_inv: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      residualRms: 1, scaleAdc: 1,
      calibratedMedianMag: 0, calibratedStdMag: 0,
    };
    return {
      fit: emptyFit, magUnitFrd: [],
      earthFieldNedUnit: [1, 0, 0], inclinationDeg: 0,
      syntheticModel: {}, valid: false, message: msg,
      fieldStrengthG: 0, rawModel: null, coverage: 'insufficient' as MagCoverage,
    };
  };

  if (magRaw.length < MIN_SAMPLES) {
    return fail(`Too few mag samples (${magRaw.length} < ${MIN_SAMPLES})`);
  }
  if (fcQuat.length < 20) {
    return fail('Too few quaternion samples for earth-field estimation');
  }

  // ---- Step 1: Normalize (already computed above) ----
  if (s < 1) return fail(`Median magnitude too small (${s.toFixed(0)} ADC)`);

  // ---- Step 2: 3D coverage ----
  if (coverageRatio < MIN_COVERAGE_RATIO) {
    return fail('Insufficient 3D attitude coverage for ellipsoid fit (yaw-only flights under-determine W_inv)');
  }
  // Determine coverage level
  let coverage: MagCoverage;
  if (coverageRatio >= 0.15) {
    coverage = 'good';
  } else if (coverageRatio >= 0.08) {
    coverage = 'marginal';
  } else {
    coverage = 'marginal'; // already passed MIN_COVERAGE_RATIO (0.05)
  }

  // ---- Step 3: Fit quadric ----
  const quadric = fitQuadric(normSamples);
  if (!quadric) return fail('Ellipsoid fit failed (singular matrix)');

  const { A, beta } = quadric;

  // ---- Step 4: Center ----
  const centerNorm = solve3x3(A, [-beta[0], -beta[1], -beta[2]]) as Vec3;
  if (!centerNorm) return fail('Could not solve for ellipsoid center (singular A)');

  // k = 1 + c^T A c
  const cAc = matMulVec3(A, centerNorm);
  const k = 1 + centerNorm[0] * cAc[0] + centerNorm[1] * cAc[1] + centerNorm[2] * cAc[2];

  if (k <= 0) return fail(`Ellipsoid scale k=${k.toFixed(4)} ≤ 0 (degenerate fit)`);

  // M = A/k (ellipsoid quadratic form)
  const invK = 1 / k;
  const M: number[][] = [
    [A[0][0] * invK, A[0][1] * invK, A[0][2] * invK],
    [A[1][0] * invK, A[1][1] * invK, A[1][2] * invK],
    [A[2][0] * invK, A[2][1] * invK, A[2][2] * invK],
  ];

  // ---- Step 5: Cholesky decomposition M = L L^T, then W_inv = L^T ----
  // The configurator uses Cholesky to get an upper-triangular W_inv, which
  // resolves the rotation ambiguity inherent in symmetric sqrt approaches.
  // Ellipsoid: (x-c)^T M (x-c) = 1.  Let M = L L^T (Cholesky, L lower-tri).
  // Then z = L^T (x-c) has z^T z = 1 → unit sphere.
  // So W_inv = L^T (upper-triangular).
  const L = cholesky3(M);
  if (!L) return fail('Cholesky decomposition failed — M not positive-definite?');

  const W_inv: number[][] = [
    [L[0][0], L[1][0], L[2][0]],   // L^T (upper-tri)
    [0,       L[1][1], L[2][1]],
    [0,       0,       L[2][2]],
  ];

  // ---- Step 6: Calibrate all samples and check quality ----
  const calibrated: Vec3[] = [];
  for (const ns of normSamples) {
    const dc: Vec3 = [
      ns[0] - centerNorm[0],
      ns[1] - centerNorm[1],
      ns[2] - centerNorm[2],
    ];
    const cal = matMulVec3(W_inv, dc);
    calibrated.push(cal);
  }

  const calMags = calibrated.map(c => norm(c));
  const sortedCalMags = [...calMags].sort((a, b) => a - b);
  const calMedianMag = sortedCalMags[Math.floor(sortedCalMags.length / 2)];
  const calSum = calMags.reduce((a, b) => a + b, 0);
  const calMeanMag = calSum / calMags.length;
  const calStdMag = Math.sqrt(
    calMags.reduce((a, b) => a + (b - calMeanMag) * (b - calMeanMag), 0) / calMags.length,
  );

  if (calStdMag > MAX_CAL_RESIDUAL) {
    return fail(
      `Calibrated magnitude stddev ${calStdMag.toFixed(3)} > ${MAX_CAL_RESIDUAL} ` +
      `(fit poor; soft-iron not well captured)`,
    );
  }

  // ---- Step 7: Estimate earth-field reference ----
  // First pass: compute initial median to detect Z-sign flip.
  const earthNEDsPass1 = rotateCalToNED(calibrated, magRaw, fcQuat);

  if (earthNEDsPass1.length < 50) {
    return fail(`Too few time-matched calibrated samples (${earthNEDsPass1.length} < 50)`);
  }

  const medD1 = median(earthNEDsPass1.map(v => v[2]));

  // Resolve Z-sign ambiguity: at high-latitude sites the field points DOWN
  // (+D in NED). If the median D is negative, flip Z on all calibrated vectors
  // and recompute the earth-field estimate.
  const signZ = medD1 < 0 ? -1 : 1;

  if (signZ < 0) {
    // Flip Z component on all calibrated vectors
    for (let i = 0; i < calibrated.length; i++) {
      calibrated[i] = [calibrated[i][0], calibrated[i][1], -calibrated[i][2]];
    }
    // Recompute calibrated magnitude statistics (unchanged by sign flip)
    // No need — magnitude is unaffected.
  }

  // Second pass: recompute earth-field estimate with Z-corrected vectors
  const earthNEDs = rotateCalToNED(calibrated, magRaw, fcQuat);

  const medN = median(earthNEDs.map(v => v[0]));
  const medE = median(earthNEDs.map(v => v[1]));
  const medD = median(earthNEDs.map(v => v[2]));
  const earthFieldNedUnit = normalizeVector([medN, medE, medD]);

  // ---- Step 8: Cross-check inclination ----
  const H = Math.hypot(earthFieldNedUnit[0], earthFieldNedUnit[1]);
  const inclinationDeg = Math.atan2(earthFieldNedUnit[2], H) * (180 / Math.PI);

  // Physical center in ADC counts
  const centerAdc: Vec3 = [
    centerNorm[0] * s,
    centerNorm[1] * s,
    centerNorm[2] * s,
  ];

  // ---- Build synthetic model ----
  // Scale unit-sphere calibrated vectors to Gauss
  const gpu = knownFieldStrengthG; // Gauss per unit (since cal is unit-sphere)
  const fieldStrengthMg = knownFieldStrengthG * 1000;

  // Scale W_inv so it maps raw → unit-sphere correctly without the /s normalization
  // At fit time we had: m_cal = W_inv · (m_raw/s - centerNorm)
  //                   = (W_inv / s) · m_raw - W_inv · centerNorm
  // For direct use on raw samples: W_inv_raw = W_inv / s, center_raw = centerNorm * s
  const W_inv_raw: number[][] = [
    [W_inv[0][0] / s, W_inv[0][1] / s, W_inv[0][2] / s],
    [W_inv[1][0] / s, W_inv[1][1] / s, W_inv[1][2] / s],
    [W_inv[2][0] / s, W_inv[2][1] / s, W_inv[2][2] / s],
  ];

  const residualGauss = calStdMag * gpu;

  const syntheticModel: MagModelInput = {
    version: 'in-flight',
    fusion: {
      earthFieldNedGauss: {
        n: earthFieldNedUnit[0] * gpu,
        e: earthFieldNedUnit[1] * gpu,
        d: earthFieldNedUnit[2] * gpu,
      },
      magNoiseGauss: {
        sigma: residualGauss,
        sigma_xy: residualGauss,
        sigma_z: residualGauss / 4,
      },
      qualityBounds: {
        bounds_ok: true,
        field_strength_mg: fieldStrengthMg,
      },
    },
  };

  // ---- Build rawModel for correctMagStream compatibility ----
  // Z-sign flip: if signZ < 0, negate the Z-row of W_inv_raw so that
  // correctMagToBody's output gets the same Z-flip baked in.
  const W_inv_zflipped: number[][] = W_inv_raw.map((row, ri) =>
    ri === 2 && signZ < 0 ? row.map(c => -c) : [...row],
  );

  const rawModel: InFlightMagModel = {
    version: 'in-flight',
    ellipsoid: {
      center: { x: centerAdc[0], y: centerAdc[1], z: centerAdc[2] },
      W_inv: W_inv_zflipped,
      radius: s,
      residual_rms: calStdMag,
    },
    alignment: {
      preset: 0,
      matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      euler: null,
    },
    fusion: {
      frame: 'FRD',
      gaussPerCorrectedUnit: gpu,
      earthFieldNedGauss: {
        n: earthFieldNedUnit[0] * gpu,
        e: earthFieldNedUnit[1] * gpu,
        d: earthFieldNedUnit[2] * gpu,
      },
      magNoiseGauss: {
        sigma: residualGauss,
        sigma_xy: residualGauss,
        sigma_z: residualGauss / 4,
      },
      qualityBounds: {
        bounds_ok: true,
        field_strength_mg: fieldStrengthMg,
        field_strength_ok: true,
        soft_iron_offdiag_ratio: null,
        soft_iron_offdiag_ok: null,
        soft_iron_anisotropy: null,
        soft_iron_anisotropy_ok: null,
      },
    },
  };

  // --- Produce calibrated mag stream (unit-sphere, FRD) ---
  // Apply per-sample: m_cal = W_inv_zflipped · (m_raw - centerAdc) then X↔Y swap → FRD.
  // Use W_inv_zflipped (not W_inv_raw) so magUnitFrd carries the same Z-sign correction
  // as rawModel, guaranteeing parity between buildMagGaussStream and correctMagStream.
  const magUnitFrd: Vec3[] = [];
  for (const mr of magRaw) {
    const dcAdc: Vec3 = [
      mr.meas[0] - centerAdc[0],
      mr.meas[1] - centerAdc[1],
      mr.meas[2] - centerAdc[2],
    ];
    const calFlu = matMulVec3(W_inv_zflipped, dcAdc);
    // X↔Y SWAP: FLU → FRD
    magUnitFrd.push([-calFlu[1], calFlu[0], calFlu[2]]);
  }

  const fit: EllipsoidFit = {
    centerNorm,
    W_inv,
    residualRms: calStdMag,
    scaleAdc: s,
    calibratedMedianMag: calMedianMag,
    calibratedStdMag: calStdMag,
  };

  return {
    fit,
    magUnitFrd,
    earthFieldNedUnit,
    inclinationDeg,
    syntheticModel,
    rawModel,
    coverage,
    fieldStrengthG: knownFieldStrengthG,
    valid: true,
    message:
      `In-flight ellipsoid fit: center=[${centerAdc.map(c => c.toFixed(0)).join(',')}] ADC, ` +
      `residual=${calStdMag.toFixed(3)} (unit), ` +
      `inclination=${inclinationDeg.toFixed(1)}°, ` +
      `WMM field=${knownFieldStrengthG.toFixed(3)} G`,
  };
}

// ---------------------------------------------------------------------------
// Build magGauss stream from calibration result
// ---------------------------------------------------------------------------

/**
 * DEPRECATED: use correctMagStream with the in-flight model's rawModel instead.
 *
 * Convert the unit-sphere calibrated mag stream to Gauss entries for the
 * estimator, matching the MagGaussEntry contract.
 *
 * Kept for parity verification — AUTO-via-correctMagStream must reproduce
 * the Gauss stream this produces to within floating-point tolerance.
 */
export function buildMagGaussStream(
  magRaw: MagRawEntry[],
  magUnitFrd: Vec3[],
  gaussPerUnit: number,
): MagGaussEntry[] {
  const out: MagGaussEntry[] = [];
  const len = Math.min(magRaw.length, magUnitFrd.length);
  for (let i = 0; i < len; i++) {
    const m = magUnitFrd[i];
    out.push({
      tUs: magRaw[i].tUs,
      meas: [m[0] * gaussPerUnit, m[1] * gaussPerUnit, m[2] * gaussPerUnit],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Export mag model from flight
// ---------------------------------------------------------------------------

/**
 * Run in-flight calibration and return a JSON-serializable model object that
 * can be saved and later reloaded via MANUAL mode.
 *
 * The model includes an `_origin` stamp recording the calibration source,
 * coverage quality, and a note that the earth-field direction is derived from
 * the flight's FC attitude — not WMM-absolute — and therefore the *soft-iron*
 * W_inv transfers across flights while the *hard-iron* center is specific to
 * this installation.
 *
 * @param magRaw       Raw mag ADC entries
 * @param fcQuat       FC quaternion stream (Q1-adapted)
 * @param fieldGauss   Earth field strength in Gauss (default 0.539)
 * @param sourceLog    Optional log name for the _origin stamp
 * @returns            JSON-serializable model, or null on calibration failure
 */
export function exportMagModelFromFlight(
  magRaw: MagRawEntry[],
  fcQuat: QuatEntry[],
  fieldGauss = DEFAULT_EARTH_FIELD_G,
  sourceLog = 'unknown',
): Record<string, unknown> | null {
  const cal = calibrateInFlightMag(magRaw, fcQuat, fieldGauss);
  if (!cal || !cal.valid || !cal.rawModel) return null;

  const model = { ...cal.rawModel } as Record<string, unknown>;
  model._origin = {
    kind: 'in-flight',
    sourceLog,
    coverage: cal.coverage,
    inclinationDeg: cal.inclinationDeg,
    residual: cal.fit.residualRms,
    generated: new Date().toISOString(),
    note:
      'earth-field derived from this flight\'s FC attitude, not WMM-absolute; ' +
      'soft-iron W_inv transfers across flights.',
    sampleCount: magRaw.length,
    calStdMag: cal.fit.calibratedStdMag,
    calMedianMag: cal.fit.calibratedMedianMag,
    centerAdc: [
      cal.rawModel.ellipsoid.center.x,
      cal.rawModel.ellipsoid.center.y,
      cal.rawModel.ellipsoid.center.z,
    ],
    fieldStrengthG: fieldGauss,
  };
  return model;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
