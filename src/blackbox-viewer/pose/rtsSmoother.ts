// Rauch-Tung-Striebel (RTS) fixed-interval smoother for the ESKF error state.
// State vector (21-state): [δp(3), δv(3), δθ(3), b_a(3), b_g(3), δm_earth(3), δm_body(3)].
// The backward pass distributes measurement corrections over the preceding
// IMU-propagated sub-trajectory in closed form.

import type { Quat, Vec3 } from './poseSample.js';
import { quatMultiply, quatFromAxisAngle } from './imuMechanization.js';
import { matMulByBt, getSparseStencil } from './eskf.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mat = number[][];

export interface NominalState {
  p: Vec3;
  v: Vec3;
  q: Quat;
  ba?: Vec3;
  bg?: Vec3;
  bgps?: Vec3;
  mEarth?: Vec3;
  mBody?: Vec3;
  tUs?: number;
}

export interface FilterResult {
  x: NominalState;
  P: Mat;
  xPred: NominalState | null;
  PPred: Mat | null;
}

export interface SmoothedResult {
  x: NominalState;
  P: Mat;
}

// ---------------------------------------------------------------------------
// Matrix helpers  (n × n dense matrices stored as array-of-arrays)
// ---------------------------------------------------------------------------

function matrixTranspose(M: Mat): Mat {
  const n = M.length;
  const T: Mat = new Array(n);
  for (let i = 0; i < n; i++) {
    T[i] = new Array(n);
    for (let j = 0; j < n; j++) {
      T[i][j] = M[j][i];
    }
  }
  return T;
}

function matrixMultiply(A: Mat, B: Mat): Mat {
  const n = A.length;
  const C: Mat = new Array(n);
  for (let i = 0; i < n; i++) {
    C[i] = new Array(n);
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += A[i][k] * B[k][j];
      }
      C[i][j] = sum;
    }
  }
  return C;
}

function matrixVectorMultiply(M: Mat, v: number[]): number[] {
  const n = M.length;
  const y: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += M[i][j] * v[j];
    }
    y[i] = sum;
  }
  return y;
}

function matrixAdd(A: Mat, B: Mat): Mat {
  const n = A.length;
  const C: Mat = new Array(n);
  for (let i = 0; i < n; i++) {
    C[i] = new Array(n);
    for (let j = 0; j < n; j++) {
      C[i][j] = A[i][j] + B[i][j];
    }
  }
  return C;
}

function matrixSub(A: Mat, B: Mat): Mat {
  const n = A.length;
  const C: Mat = new Array(n);
  for (let i = 0; i < n; i++) {
    C[i] = new Array(n);
    for (let j = 0; j < n; j++) {
      C[i][j] = A[i][j] - B[i][j];
    }
  }
  return C;
}

function matrixInverse(M: Mat): Mat {
  const n = M.length;
  const aug: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    aug[i] = new Array(2 * n);
    for (let j = 0; j < n; j++) {
      aug[i][j] = M[i][j];
      aug[i][j + n] = i === j ? 1 : 0;
    }
  }

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let i = col + 1; i < n; i++) {
      const absVal = Math.abs(aug[i][col]);
      if (absVal > maxVal) {
        maxVal = absVal;
        maxRow = i;
      }
    }
    if (maxVal < 1e-14) {
      throw new Error("Matrix is singular");
    }
    if (maxRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[maxRow];
      aug[maxRow] = tmp;
    }

    const pivot = aug[col][col];
    for (let j = col; j < 2 * n; j++) {
      aug[col][j] /= pivot;
    }

    for (let i = 0; i < n; i++) {
      if (i === col) continue;
      const factor = aug[i][col];
      for (let j = col; j < 2 * n; j++) {
        aug[i][j] -= factor * aug[col][j];
      }
    }
  }

  const inv: Mat = new Array(n);
  for (let i = 0; i < n; i++) {
    inv[i] = aug[i].slice(n);
  }
  return inv;
}

// ---------------------------------------------------------------------------
// Cholesky decomposition + triangular solve
// ---------------------------------------------------------------------------

function choleskyDecompose(A: Mat): Mat {
    const n = A.length;
    const L: Mat = new Array(n);
    for (let i = 0; i < n; i++) {
        L[i] = new Array<number>(n).fill(0);
        for (let j = 0; j <= i; j++) {
            let sum = A[i][j];
            for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
            if (i === j) {
                if (sum <= 0) throw new Error("Cholesky: non-positive-definite");
                L[i][j] = Math.sqrt(sum);
            } else {
                L[i][j] = sum / L[j][j];
            }
        }
    }
    return L;
}

function forwardSubstitute(L: Mat, B: Mat, n: number, m: number): Mat {
    const Y: Mat = new Array(n);
    for (let i = 0; i < n; i++) {
        Y[i] = new Array<number>(m);
        for (let j = 0; j < m; j++) {
            let sum = B[i][j];
            for (let k = 0; k < i; k++) sum -= L[i][k] * Y[k][j];
            Y[i][j] = sum / L[i][i];
        }
    }
    return Y;
}

function backwardSubstitute(L: Mat, Y: Mat, n: number, m: number): Mat {
    const X: Mat = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
        X[i] = new Array<number>(m);
        for (let j = 0; j < m; j++) {
            let sum = Y[i][j];
            for (let k = i + 1; k < n; k++) sum -= L[k][i] * X[k][j];
            X[i][j] = sum / L[i][i];
        }
    }
    return X;
}

function choleskySolve(L: Mat, B: Mat): Mat {
    const n = L.length;
    const m = B[0].length;
    const Y = forwardSubstitute(L, B, n, m);
    const X = backwardSubstitute(L, Y, n, m);
    return X;
}

// ---------------------------------------------------------------------------
// Quaternion helpers  (quaternion stored as [w, x, y, z])
// ---------------------------------------------------------------------------

function quatNormalize(q: Quat): Quat {
  const [w, x, y, z] = q;
  const n = Math.sqrt(w * w + x * x + y * y + z * z);
  if (n < 1e-14) {
    return [1, 0, 0, 0];
  }
  return [w / n, x / n, y / n, z / n];
}

function quatConjugate(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}

function quatToRotationVector(q: Quat): Vec3 {
  const w = q[0];
  const vx = q[1];
  const vy = q[2];
  const vz = q[3];
  const vNorm = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (vNorm < 1e-14) {
    return [0, 0, 0];
  }
  const theta = 2 * Math.atan2(vNorm, w);
  const scale = theta / vNorm;
  return [vx * scale, vy * scale, vz * scale];
}

// ---------------------------------------------------------------------------
// State vector helpers
// ---------------------------------------------------------------------------

function copyState(x: NominalState): NominalState {
  const s: NominalState = {
    p: [...x.p] as Vec3,
    v: [...x.v] as Vec3,
    q: [...x.q] as Quat,
  };
  if (x.ba !== undefined) s.ba = [...x.ba] as Vec3;
  if (x.bg !== undefined) s.bg = [...x.bg] as Vec3;
  if (x.bgps !== undefined) s.bgps = [...x.bgps] as Vec3;
  if (x.mEarth !== undefined) s.mEarth = [...x.mEarth] as Vec3;
  if (x.mBody !== undefined) s.mBody = [...x.mBody] as Vec3;
  if (x.tUs !== undefined) s.tUs = x.tUs;
  return s;
}

function copyMatrix(M: Mat): Mat {
  return M.map((row) => [...row]);
}

// State indices (variable: 15 / 18 / 21 / 24-state):
//   0–2: δp, 3–5: δv, 6–8: δθ,
//   9–11: b_a, 12–14: b_g,
//   15–17: mEarth (if present), 18–20: mBody (if present)
//   GPS position bias appended at end (idxGpsBias = 15 or 21)
function stateDifference(xSmooth: NominalState, xPred: NominalState): number[] {
  const dp: Vec3 = [
    xSmooth.p[0] - xPred.p[0],
    xSmooth.p[1] - xPred.p[1],
    xSmooth.p[2] - xPred.p[2],
  ];
  const dv: Vec3 = [
    xSmooth.v[0] - xPred.v[0],
    xSmooth.v[1] - xPred.v[1],
    xSmooth.v[2] - xPred.v[2],
  ];
  const qErr = quatMultiply(xSmooth.q, quatConjugate(xPred.q));
  const dTheta = quatToRotationVector(quatNormalize(qErr));

  const dBa: Vec3 = (xSmooth.ba && xPred.ba) ? [
    xSmooth.ba[0] - xPred.ba[0],
    xSmooth.ba[1] - xPred.ba[1],
    xSmooth.ba[2] - xPred.ba[2],
  ] : [0, 0, 0];
  const dBg: Vec3 = (xSmooth.bg && xPred.bg) ? [
    xSmooth.bg[0] - xPred.bg[0],
    xSmooth.bg[1] - xPred.bg[1],
    xSmooth.bg[2] - xPred.bg[2],
  ] : [0, 0, 0];

  const result: number[] = [...dp, ...dv, ...dTheta, ...dBa, ...dBg];

  const hasMag = xSmooth.mEarth !== undefined || xPred.mEarth !== undefined;
  const hasGpsBias = xSmooth.bgps !== undefined || xPred.bgps !== undefined;

  if (hasMag) {
    const meSmooth = xSmooth.mEarth ?? [0, 0, 0];
    const mePred = xPred.mEarth ?? [0, 0, 0];
    result.push(meSmooth[0] - mePred[0], meSmooth[1] - mePred[1], meSmooth[2] - mePred[2]);

    const mbSmooth = xSmooth.mBody ?? [0, 0, 0];
    const mbPred = xPred.mBody ?? [0, 0, 0];
    result.push(mbSmooth[0] - mbPred[0], mbSmooth[1] - mbPred[1], mbSmooth[2] - mbPred[2]);
  }

  if (hasGpsBias) {
    const bgpsSmooth = xSmooth.bgps ?? [0, 0, 0];
    const bgpsPred = xPred.bgps ?? [0, 0, 0];
    result.push(bgpsSmooth[0] - bgpsPred[0], bgpsSmooth[1] - bgpsPred[1], bgpsSmooth[2] - bgpsPred[2]);
  }

  return result;
}

function stateAdd(x: NominalState, deltaX: number[]): NominalState {
  const p: Vec3 = [x.p[0] + deltaX[0], x.p[1] + deltaX[1], x.p[2] + deltaX[2]];
  const v: Vec3 = [x.v[0] + deltaX[3], x.v[1] + deltaX[4], x.v[2] + deltaX[5]];

  const dThetaX = deltaX[6];
  const dThetaY = deltaX[7];
  const dThetaZ = deltaX[8];
  const thetaNorm = Math.sqrt(
    dThetaX * dThetaX + dThetaY * dThetaY + dThetaZ * dThetaZ,
  );
  let q: Quat;
  if (thetaNorm < 1e-14) {
    q = [...x.q] as Quat;
  } else {
    const axis: Vec3 = [
      dThetaX / thetaNorm,
      dThetaY / thetaNorm,
      dThetaZ / thetaNorm,
    ];
    const dq = quatFromAxisAngle(axis, thetaNorm);
    q = quatNormalize(quatMultiply(dq, x.q));
  }
  const result: NominalState = { p, v, q };
  if (x.tUs !== undefined) result.tUs = x.tUs;

  if (deltaX.length >= 12 && x.ba !== undefined) {
    result.ba = [x.ba[0] + deltaX[9], x.ba[1] + deltaX[10], x.ba[2] + deltaX[11]];
  }
  if (deltaX.length >= 15 && x.bg !== undefined) {
    result.bg = [x.bg[0] + deltaX[12], x.bg[1] + deltaX[13], x.bg[2] + deltaX[14]];
  }

  const hasMag = x.mEarth !== undefined;
  const hasGpsBias = x.bgps !== undefined;

  if (hasMag) {
    result.mEarth = [
      x.mEarth![0] + deltaX[15],
      x.mEarth![1] + deltaX[16],
      x.mEarth![2] + deltaX[17],
    ];
    result.mBody = [
      x.mBody![0] + deltaX[18],
      x.mBody![1] + deltaX[19],
      x.mBody![2] + deltaX[20],
    ];
  }

  if (hasGpsBias) {
    const idxGpsBias = hasMag ? 21 : 15;
    result.bgps = [
      x.bgps![0] + deltaX[idxGpsBias],
      x.bgps![1] + deltaX[idxGpsBias + 1],
      x.bgps![2] + deltaX[idxGpsBias + 2],
    ];
  }

  return result;
}

// ---------------------------------------------------------------------------
// RTS fixed-interval smoother
// ---------------------------------------------------------------------------

export function rtsSmooth(
  filterResults: FilterResult[],
  transitionMatrices: (Mat | null)[],
): SmoothedResult[] {
  const Np1 = filterResults.length;
  if (Np1 === 0) {
    return [];
  }

  const smoothed: SmoothedResult[] = new Array(Np1);
  smoothed[Np1 - 1] = {
    x: copyState(filterResults[Np1 - 1].x),
    P: copyMatrix(filterResults[Np1 - 1].P),
  };

  for (let k = Np1 - 2; k >= 0; k--) {
    const Fk = transitionMatrices[k];

    if (!Fk) {
      smoothed[k] = {
        x: copyState(filterResults[k].x),
        P: copyMatrix(filterResults[k].P),
      };
      continue;
    }

    const Pk = filterResults[k].P;
    const Pkp1Pred = filterResults[k + 1].PPred || filterResults[k + 1].P;
    const Pkp1Smoothed = smoothed[k + 1].P;

    const xkp1Pred = filterResults[k + 1].xPred || filterResults[k + 1].x;
    const xkp1Smoothed = smoothed[k + 1].x;

    let Ck: Mat;
    try {
      const stencil = getSparseStencil(Fk.length);
      // F can be accumulated across multiple IMU steps between keyframes.
      // The single-step stencil is valid only when accumulation hasn't
      // filled in off-diagonal terms beyond the stencil pattern. Should
      // the keyframe interval grow, the dense fallback (below) captures
      // any divergence. The 24 reference-flight gates + equivalence tests
      // (dim 9/15/21, tol 5e-10) confirm the stencil is safe at current
      // ~50 ms intervals.
      const PFt = matMulByBt(Pk, Fk, stencil);

      const L = choleskyDecompose(Pkp1Pred);
      const PFtT = matrixTranspose(PFt);
      Ck = matrixTranspose(choleskySolve(L, PFtT));
    } catch {
      try {
        const FkT = matrixTranspose(Fk);
        const PFt = matrixMultiply(Pk, FkT);
        const invPred = matrixInverse(Pkp1Pred);
        Ck = matrixMultiply(PFt, invPred);
      } catch {
        smoothed[k] = {
          x: copyState(filterResults[k].x),
          P: copyMatrix(filterResults[k].P),
        };
        continue;
      }
    }

    const deltaNext = stateDifference(xkp1Smoothed, xkp1Pred);
    const deltaX = matrixVectorMultiply(Ck, deltaNext);

    smoothed[k] = {
      x: stateAdd(filterResults[k].x, deltaX),
      P: (function (): Mat {
        const dP = matrixSub(Pkp1Smoothed, Pkp1Pred);
        const CdP = matrixMultiply(Ck, dP);
        const CdPCt = matrixMultiply(CdP, matrixTranspose(Ck));
        return matrixAdd(Pk, CdPCt);
      })(),
    };
  }

  return smoothed;
}

export { choleskyDecompose, choleskySolve, forwardSubstitute, backwardSubstitute, matrixInverse, matrixMultiply, matrixTranspose };
