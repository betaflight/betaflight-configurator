/**
 * Measurement models (factors) for a drone body-pose ESKF estimator.
 *
 * Error state δx = [δp(3), δv(3), δθ(3), b_a(3), b_g(3), m_earth(3), m_body(3), τ(1), k_I(3)]
 *   δp  = position error (NED, m)
 *   δv  = velocity error (NED, m/s)
 *   δθ  = attitude error (rotation vector in world frame, rad)
 *   b_a = accelerometer bias (FRD, m/s²)
 *   b_g = gyroscope bias (FRD, rad/s)
 *
 * Nominal state x = { p, v, q, ba, bg, mEarth?, mBody?, tauGps?, kI? }
 *   p = position in NED (m)
 *   v = velocity in NED (m/s)
 *   q = [w,x,y,z] scalar-first, body(FRD) → world(NED)
 *
 * Gravity: [0, 0, +9.80665] in NED
 *
 * State indices (25-state):
 *   0-2: δp, 3-5: δv, 6-8: δθ, 9-11: b_a, 12-14: b_g,
 *   15-17: m_earth, 18-20: m_body, 21: τ_gps, 22-24: k_I
 *
 * Jacobian row layout: each row is length matched to the state dimension.
 * Each factory returns an object with:
 *   h(x)         – measurement prediction
 *   H            – 1D N-element array per measurement row
 *   R            – noise covariance matrix
 *   residual(z,x)– computes r = z − h(x)
 */

import type { Quat, Vec3 } from './poseSample.js';

/** ESKF nominal state as seen by measurement factories: position/velocity in
 *  NED (m, m/s), attitude q body(FRD)->world(NED), and the optional bias/mag
 *  states depending on which are carried by the current state dimension. */
export interface NominalState {
  p: Vec3;
  v: Vec3;
  q: Quat;
  ba?: Vec3;
  bg?: Vec3;
  bgps?: Vec3;
  mEarth?: Vec3;
  mBody?: Vec3;
  tauGps?: number;
  kI?: Vec3;
}

/** A position or velocity measurement in NED (m or m/s). */
export interface NedMeas {
  n: number;
  e: number;
  d: number;
}

/** A single measurement update: predicted-measurement function h(x),
 *  Jacobian H, noise covariance R, and the residual function z - h(x). */
export interface MeasurementFactor<Z = number[]> {
  h(x: NominalState): number | number[];
  readonly H: number[][];
  readonly R: number[][];
  residual(z: Z, x: NominalState): number[];
}

/** Standard gravity magnitude (m/s^2), WGS84 conventional value. */
export const GRAVITY_MAG = 9.80665;

// --- Quaternion math helpers (flat row-major) --------------------------------

function quatMultiply(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

function quatConjugate(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}

/** Quaternion to 3x3 rotation matrix, row-major flat (9 elements), body(FRD)->world(NED). */
export function quatToRotMat(q: Quat): number[] {
  const [w, x, y, z] = q;
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;

  const m = new Array<number>(9);
  m[0] = 1 - 2 * (yy + zz);
  m[1] = 2 * (xy - wz);
  m[2] = 2 * (xz + wy);

  m[3] = 2 * (xy + wz);
  m[4] = 1 - 2 * (xx + zz);
  m[5] = 2 * (yz - wx);

  m[6] = 2 * (xz - wy);
  m[7] = 2 * (yz + wx);
  m[8] = 1 - 2 * (xx + yy);

  return m;
}

/** SO(3) logarithm: rotation matrix (row-major flat, 9 elements) to axis-angle
 *  rotation vector (rad). Handles the theta->0 and theta->pi singularities. */
export function logMap(R: number[]): Vec3 {
  const trace = R[0] + R[4] + R[8];
  const cosTheta = (trace - 1) / 2;
  const theta = Math.acos(Math.max(-1, Math.min(1, cosTheta)));

  if (Math.abs(theta) < 1e-12) {
    return [
      (R[7] - R[5]) / 2,
      (R[2] - R[6]) / 2,
      (R[3] - R[1]) / 2,
    ];
  }

  if (Math.PI - theta < 1e-6) {
    // Near θ=π the antisymmetric part of R vanishes. Recover the axis from
    // R = −I + 2aaᵀ: diagonal gives |aᵢ|, symmetric off-diagonals give signs
    // relative to the largest component.
    const ax2 = Math.max(0, (R[0] + 1) / 2);
    const ay2 = Math.max(0, (R[4] + 1) / 2);
    const az2 = Math.max(0, (R[8] + 1) / 2);
    let a: Vec3;
    if (ax2 >= ay2 && ax2 >= az2) {
      const ax = Math.sqrt(ax2);
      a = [ax, (R[1] + R[3]) / (4 * ax), (R[2] + R[6]) / (4 * ax)];
    } else if (ay2 >= az2) {
      const ay = Math.sqrt(ay2);
      a = [(R[1] + R[3]) / (4 * ay), ay, (R[5] + R[7]) / (4 * ay)];
    } else {
      const az = Math.sqrt(az2);
      a = [(R[2] + R[6]) / (4 * az), (R[5] + R[7]) / (4 * az), az];
    }
    const n = Math.hypot(a[0], a[1], a[2]) || 1;
    return [(a[0] / n) * theta, (a[1] / n) * theta, (a[2] / n) * theta];
  }

  const factor = theta / (2 * Math.sin(theta));
  return [
    (R[7] - R[5]) * factor,
    (R[2] - R[6]) * factor,
    (R[3] - R[1]) * factor,
  ];
}

function matMul3x3(A: number[][], B: number[][]): number[][] {
    const C = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i = 0; i < 3; i++)
        for (let k = 0; k < 3; k++)
            for (let j = 0; j < 3; j++)
                C[i][j] += A[i][k] * B[k][j];
    return C;
}

// --- Factory functions --------------------------------------------------------

/**
 * GPS position measurement in NED.
 *
 * @param meas  NED position (m)
 * @param sigma  1σ noise in metres
 */
export function createGpsPositionFactor(meas: NedMeas, sigma = 2.5, dim = 9, idxGpsBias = -1): MeasurementFactor<NedMeas> {
  const varP = sigma * sigma;

  function h(x: NominalState): number[] {
    const bp = x.bgps ?? [0, 0, 0];
    return [x.p[0] + bp[0], x.p[1] + bp[1], x.p[2] + bp[2]];
  }

  const H = new Array<number[]>(3);
  for (let i = 0; i < 3; i++) {
    H[i] = new Array<number>(dim).fill(0);
    H[i][i] = 1; // position
    if (idxGpsBias >= 0 && idxGpsBias + i < dim) {
      H[i][idxGpsBias + i] = 1; // GPS bias state
    }
  }

  const R: number[][] = [
    [varP,    0,    0],
    [   0, varP,    0],
    [   0,    0, varP],
  ];

  function residual(z: NedMeas, x: NominalState): number[] {
    const hp = h(x);
    return [z.n - hp[0], z.e - hp[1], z.d - hp[2]];
  }

  return { h, H, R, residual };
}

/**
 * GPS velocity measurement in NED.
 *
 * @param meas  NED velocity (m/s)
 * @param sigma  1σ noise in m/s
 */
export function createGpsVelocityFactor(meas: NedMeas, sigma = 0.5): MeasurementFactor<NedMeas> {
  const varV = sigma * sigma;

  function h(x: NominalState): number[] {
    return [x.v[0], x.v[1], x.v[2]];
  }

  const H: number[][] = [
    [0, 0, 0,  1, 0, 0,  0, 0, 0],
    [0, 0, 0,  0, 1, 0,  0, 0, 0],
    [0, 0, 0,  0, 0, 1,  0, 0, 0],
  ];

  const R: number[][] = [
    [varV,    0,    0],
    [   0, varV,    0],
    [   0,    0, varV],
  ];

  function residual(z: NedMeas, x: NominalState): number[] {
    const hv = h(x);
    return [z.n - hv[0], z.e - hv[1], z.d - hv[2]];
  }

  return { h, H, R, residual };
}

/**
 * Barometer altitude measurement.
 *
 * The barometer reads altitude relative to the arming point.
 * baroOffset = GPS_alt_at_arm − baroAlt_at_arm converts baro-relative to MSL-absolute.
 * Measurement model: z ≈ −p_D.
 *
 * The baro reading is relative to the arm point; p_D is the NED down coordinate
 * relative to the origin. Since origin and arm are approximately the same physical
 * location, they match without an offset. Adding baroOffset (~GPS MSL altitude,
 * typically >100 m) creates a constant innovation offset that saturates the 3σ gate
 * and silently rejects all baro measurements — the D coordinate then drifts uncorrected.
 * Adding baroOffset creates a constant innovation offset that saturates the gate.
 *
 * @param baroAlt     Raw barometer altitude (m, relative to arm point)
 * @param baroOffset  (UNUSED — retained for API compat only)
 * @param sigma       1σ noise in metres
 */
export function createBaroFactor(baroAlt: number, baroOffset: number, sigma = 1.0): MeasurementFactor<number> {
  const varZ = sigma * sigma;

  function h(x: NominalState): number {
    return -x.p[2];
  }

  const H: number[][] = [[0, 0, -1, 0, 0, 0, 0, 0, 0]];

  const R: number[][] = [[varZ]];

  function residual(z: number, x: NominalState): number[] {
    return [z - h(x)];
  }

  return { h, H, R, residual };
}

/**
 * Quaternion attitude prior (soft prior from FC fused attitude).
 *
 * Supports both isotropic (single sigma) and anisotropic (sigmaTilt + sigmaYaw)
 * noise models. In anisotropic mode, the measurement covariance R is the
 * body-frame noise diag(σ_tilt², σ_tilt², σ_yaw²) rotated to the world frame
 * of the residual:  R_world = R_bw · R_body · R_bwᵀ.
 * The FC's tilt is gravity-bounded (~1°); yaw is gyro-only dead-reckoned
 * (drifting 10–30°/flight). The anisotropic R lets the quat-prior and mag
 * factor coexist: the prior owns tilt, the mag owns yaw.
 *
 * @param qMeas      Measured quaternion [w,x,y,z] scalar-first
 * @param sigmaTilt  1σ noise for tilt axes (roll, pitch) in radians
 * @param sigmaYaw   1σ noise for yaw axis in radians. If null,
 *                   isotropic mode: all axes use sigmaTilt.
 */
export function createQuaternionPrior(
  qMeas: Quat,
  sigmaTilt = 0.1,
  sigmaYaw: number | null = null,
): MeasurementFactor<Quat> {
  const anisotropic = (sigmaYaw !== null && sigmaYaw !== sigmaTilt);

  const H: number[][] = [
    [0, 0, 0,  0, 0, 0,  1, 0, 0],
    [0, 0, 0,  0, 0, 0,  0, 1, 0],
    [0, 0, 0,  0, 0, 0,  0, 0, 1],
  ];

  let R: number[][];
  if (anisotropic) {
    const varTilt = sigmaTilt * sigmaTilt;
    const varYaw = sigmaYaw! * sigmaYaw!;
    const Rbody: number[][] = [[varTilt, 0, 0], [0, varTilt, 0], [0, 0, varYaw]];

    const m = quatToRotMat(qMeas);
    const Rbw: number[][] = [[m[0], m[1], m[2]], [m[3], m[4], m[5]], [m[6], m[7], m[8]]];
    const RbwT: number[][] = [[m[0], m[3], m[6]], [m[1], m[4], m[7]], [m[2], m[5], m[8]]];

    const Rtemp = matMul3x3(Rbw, Rbody);
    R = matMul3x3(Rtemp, RbwT);
  } else {
    const varQ = sigmaTilt * sigmaTilt;
    R = [[varQ, 0, 0], [0, varQ, 0], [0, 0, varQ]];
  }

  function h(x: NominalState): Quat {
    return x.q.slice() as Quat;
  }

  function residual(_z: Quat, x: NominalState): number[] {
    const qRel = quatMultiply(qMeas, quatConjugate(x.q));
    const Rrel = quatToRotMat(qRel);
    const omega = logMap(Rrel);
    return [omega[0], omega[1], omega[2]];
  }

  return { h, H, R, residual };
}

/**
 * Raw (un-whitened) rotation-vector residual between a measured quaternion
 * and the current estimate -- the same computation createQuaternionPrior's
 * residual() does internally, exposed standalone so a caller can pre-whiten
 * it (see createColoredQuaternionFactor) before it ever reaches the Kalman
 * update.
 */
export function quaternionLogResidual(qMeas: Quat, qEst: Quat): Vec3 {
  const qRel = quatMultiply(qMeas, quatConjugate(qEst));
  const Rrel = quatToRotMat(qRel);
  const omega = logMap(Rrel);
  return [omega[0], omega[1], omega[2]];
}

/**
 * Colored-noise (AR(1)-whitened) FC-quaternion factor.
 *
 * The root cause of the FC-quat-prior double-counting defect (see
 * fcQuatPriorHz's doc comment in estimatorLoop.ts) is that consecutive FC
 * quaternion samples are NOT independent: the Mahony filter's own PI
 * (proportional-integral) structure gives its output error a slow, colored
 * (autocorrelated) character, but the ESKF's standard measurement update
 * assumes each sample is fresh, independent (white) information -- feeding a
 * correlated sequence in as if it were white causes the posterior covariance
 * to collapse far below the truth. Naive rate-limiting (the shipped default,
 * fcQuatPriorHz) works around this by spacing samples out in TIME, hoping
 * they become approximately independent -- but real-data testing found this
 * doesn't work well below ~1000 Hz (see fcQuatPriorHz's doc comment for the
 * full real-flight evidence, including a catastrophic acro-flight divergence).
 *
 * This factory instead removes the correlation AT THE RESIDUAL LEVEL via a
 * classical whitening/decorrelation filter for AR(1)-colored measurement
 * noise (Bryson & Henrikson, 1968, "Estimation using sampled data containing
 * sequentially correlated noise" -- the standard reference for this
 * technique): if the FC-quat error is modeled as n_k = phi*n_{k-1} + w_k
 * (w_k white, phi the AR(1) coefficient), then the DIFFERENCED residual
 * r_white = r_k - phi*r_{k-1} has noise contribution n_k - phi*n_{k-1} = w_k,
 * which IS white by construction, with stationary variance (1-phi^2) times
 * the apparent (collapsed) per-sample variance. Feeding r_white (not the raw
 * r_k) into the Kalman update means every fused sample now carries genuinely
 * new information, at whatever rate the log provides -- no time-domain
 * spacing required.
 *
 * @param qMeasForAlignment  The FC quaternion sample (used only to build the
 *                            anisotropic tilt/yaw R rotation, exactly as
 *                            createQuaternionPrior does).
 * @param rWhite              Precomputed whitened residual (caller computes
 *                            r_k via quaternionLogResidual, then differences
 *                            against phi times the PREVIOUS raw residual).
 * @param sigmaTiltWhite      Whitened tilt sigma = sigmaTilt * sqrt(1-phi^2).
 * @param sigmaYawWhite       Whitened yaw sigma = sigmaYaw * sqrt(1-phi^2).
 */
export function createColoredQuaternionFactor(
  qMeasForAlignment: Quat,
  rWhite: Vec3,
  sigmaTiltWhite: number,
  sigmaYawWhite: number,
): MeasurementFactor<Quat> {
  const H: number[][] = [
    [0, 0, 0,  0, 0, 0,  1, 0, 0],
    [0, 0, 0,  0, 0, 0,  0, 1, 0],
    [0, 0, 0,  0, 0, 0,  0, 0, 1],
  ];

  const varTilt = sigmaTiltWhite * sigmaTiltWhite;
  const varYaw = sigmaYawWhite * sigmaYawWhite;
  const Rbody: number[][] = [[varTilt, 0, 0], [0, varTilt, 0], [0, 0, varYaw]];

  const m = quatToRotMat(qMeasForAlignment);
  const Rbw: number[][] = [[m[0], m[1], m[2]], [m[3], m[4], m[5]], [m[6], m[7], m[8]]];
  const RbwT: number[][] = [[m[0], m[3], m[6]], [m[1], m[4], m[7]], [m[2], m[5], m[8]]];
  const Rtemp = matMul3x3(Rbw, Rbody);
  const R = matMul3x3(Rtemp, RbwT);

  function h(x: NominalState): Quat {
    return x.q.slice() as Quat;
  }

  function residual(_z: Quat, _x: NominalState): number[] {
    return [rWhite[0], rWhite[1], rWhite[2]];
  }

  return { h, H, R, residual };
}

/**
 * Independent accelerometer-tilt factor: observes roll/pitch DIRECTLY from
 * the current raw accelerometer reading, with yaw left unobserved (accel
 * cannot see rotation about the gravity vector).
 *
 * Why this exists: the FC-quaternion prior
 * (`createQuaternionPrior`) is built from the FC's own Mahony filter, which
 * has already integrated the SAME raw gyro/accel the ESKF's own prediction
 * step consumes -- fusing it at high rate causes real covariance double-
 * counting (the reported attitude covariance ends up well below its true
 * uncertainty), but rate-limiting it was found to be unsafe below
 * ~1000 Hz on real flights (see estimatorLoop.ts's EstimatorOpts.fcQuatPriorHz
 * doc comment -- both a gentle-survey attitude-accuracy failure at low rates
 * AND a catastrophic acro-flight divergence at 500 Hz). This factor gives
 * roll/pitch an anchor that is NOT derived from the FC's gyro-integrated
 * state at all -- it is a fresh, direct measurement of the CURRENT specific
 * force vector, computed independently every time it's called. It can
 * therefore run at full rate without re-ingesting old gyro information,
 * unlike the FC-quat prior.
 *
 * Convention (matches imuMechanization.ts's strapdownPropagate exactly):
 * accelBody is the raw, specific-force reading (level+static reads [0,0,+g]
 * on body FRD +Z). Under near-static conditions (no true acceleration),
 * accelBody ≈ R(q)ᵀ·[0,0,g].
 *
 * IMPLEMENTATION NOTE -- gimbal lock: an earlier version of this factory
 * reconstructed roll/pitch via `atan2` (Euler angles) and recombined with the
 * current yaw via Euler-to-quaternion composition. That is WRONG during a
 * fast flip: a ZYX Euler decomposition has roll and yaw couple degenerately
 * as pitch approaches ±90°, so even though yaw's sigma was set huge, the
 * RECOMBINED roll came out corrupted right at the gimbal singularity --
 * exactly where a backflip passes through. Measured on `acroFixture.test.ts`
 * (real acro flight, backflips): this Euler-based version still diverged
 * catastrophically at fcQuatPriorHz=500 (position drift >1500m), no better
 * than not having the factor at all. Fixed by computing the correction as a
 * direct shortest-arc quaternion between the predicted and measured gravity
 * DIRECTIONS (no Euler angles, no gimbal singularity at any attitude).
 *
 * Caller MUST gate sigmaTilt via `computeAdaptiveSigmaTilt` (or an equivalent
 * dynamics check) -- this factory does not gate internally, since true
 * acceleration (punch-outs, banked turns, freefall) corrupts the accel-derived
 * tilt exactly like it corrupts the Mahony filter's own accel reference.
 *
 * @param accelBody    Raw accel reading, body FRD (m/s²), specific-force convention.
 * @param aGravityBody Raw accel reading, body FRD (m/s²), normalized.
 * @param currentQ     Current ESKF attitude estimate [qw,qx,qy,qz] (body->world).
 * @param sigmaTilt    1σ roll/pitch noise (rad).
 * @param dim          Total state vector dimension.
 */
export function createAccelTiltFactor(
  aGravityBody: Vec3,
  currentQ: Quat,
  sigmaTilt: number,
  dim: number,
): MeasurementFactor<Vec3> {
  const aNorm = Math.hypot(aGravityBody[0], aGravityBody[1], aGravityBody[2]);
  const z: Vec3 = aNorm > 1e-6
    ? [aGravityBody[0] / aNorm, aGravityBody[1] / aNorm, aGravityBody[2] / aNorm]
    : [0, 0, 1];

  const R2 = sigmaTilt * sigmaTilt;
  const R: number[][] = [
    [R2, 0, 0],
    [0, R2, 0],
    [0, 0, R2],
  ];

  const H = new Array<number[]>(3);
  for (let i = 0; i < 3; i++) {
    H[i] = new Array<number>(dim).fill(0);
  }

  // Predicted body-frame down vector: u = R(q)ᵀ · e_D, e_D = [0,0,1].
  const m = quatToRotMat(currentQ);

  // δθ is a WORLD-frame error (injection is q ← δq ⊗ q, eskf.ts): with
  // R_true = exp([δθ]×)·R_nom and h(q) = R(q)ᵀ·e_D,
  //   h ≈ u + R_nomᵀ·[e_D]×·δθ  ⇒  H = Rᵀ·[e_D]×.
  H[0][6] = m[3]; H[0][7] = -m[0]; H[0][8] = 0;
  H[1][6] = m[4]; H[1][7] = -m[1]; H[1][8] = 0;
  H[2][6] = m[5]; H[2][7] = -m[2]; H[2][8] = 0;

  return {
    H,
    R,
    h(x: NominalState): number[] {
      const rm = quatToRotMat(x.q);
      return [rm[6], rm[7], rm[8]];
    },
    residual(zMeas: Vec3, x: NominalState): number[] {
      const pred = this.h(x) as number[];
      return [
        zMeas[0] - pred[0],
        zMeas[1] - pred[1],
        zMeas[2] - pred[2],
      ];
    },
  };
}

/** FC-quaternion-prior yaw sigmas (rad) and the mag-observability blend
 *  thresholds (dimensionless field-quality ratio) that interpolate between
 *  them: below LO uses DEFAULT_MAX (mag unreliable, trust FC yaw loosely),
 *  above HI uses DEFAULT_TIGHT (mag reliable, trust FC yaw tightly). */
export const SIGMA_YAW_DEFAULT_TIGHT = 0.025;
export const SIGMA_YAW_DEFAULT_MAX   = 0.10;
export const SIGMA_YAW_OBS_THRESH_LO = 0.70;
export const SIGMA_YAW_OBS_THRESH_HI = 1.00;

// Adaptive sigma tilt constants
export const SIGMA_TILT_NOMINAL  = 0.02;   // rad — clean gravity, low spin
export const SIGMA_TILT_FREEFALL = 1.0;    // rad — true freefall (no gravity reference)

/**
 * Adaptive sigma tilt — modulates quat-prior tilt (roll/pitch) trust on
 * three regimes, with kinematic ω×v correction to isolate gravity.
 *
 * Branch 1 (clean gravity):            σ_tilt = NOMINAL (0.02 rad)
 *   when |a_gravity| ≈ g AND |ω| < 0.5 rad/s
 * Branch 2 (true freefall):            σ_tilt = FREEFALL (1.0 rad)
 *   when |a_gravity| < 0.5·g
 * Branch 3 (high-G spinning):          σ_tilt = linear interpolation
 *   between NOMINAL and FREEFALL
 *
 * The kinematic correction subtracts ω × v_body from measured accel to
 * isolate gravity.  This prevents false freefall detection during banked
 * turns (a 3g turn has |a_raw| ≈ 1.15g but |a_gravity| ≈ 1.0g after
 * correction).
 *
 * @param accelBody   Measured accel, body FRD [m/s²] (includes gravity)
 * @param gyroBody    Measured gyro, body FRD [rad/s]
 * @param vNed        Current ESKF velocity, world NED [m/s]
 * @param qEst        Current ESKF attitude [qw,qx,qy,qz] body→world
 * @returns           adapted sigma tilt in radians
 */
export function computeAdaptiveSigmaTilt(
  accelBody: Vec3,
  gyroBody: Vec3,
  vNed: Vec3,
  qEst: Quat,
): number {
    const g = GRAVITY_MAG;
    const R = quatToRotMat(qEst);

    // Rotate world velocity to body frame: v_body = Rᵀ · v_world
    const vBx = R[0]*vNed[0] + R[3]*vNed[1] + R[6]*vNed[2];
    const vBy = R[1]*vNed[0] + R[4]*vNed[1] + R[7]*vNed[2];
    const vBz = R[2]*vNed[0] + R[5]*vNed[1] + R[8]*vNed[2];

    // a_kinematic = ω × v_body
    const akinX = gyroBody[1]*vBz - gyroBody[2]*vBy;
    const akinY = gyroBody[2]*vBx - gyroBody[0]*vBz;
    const akinZ = gyroBody[0]*vBy - gyroBody[1]*vBx;

    // Gravity direction = accel + ω×v_body (accel convention: rest reads +g
    // on body-down; the ω×v turn term enters with a minus sign, so we add it
    // back to isolate gravity — see strapdownPropagate's convention note).
    const agX = accelBody[0] + akinX;
    const agY = accelBody[1] + akinY;
    const agZ = accelBody[2] + akinZ;
    const agMag = Math.hypot(agX, agY, agZ);
    const delta = Math.abs(agMag - g);

    const gyroMag = Math.hypot(gyroBody[0], gyroBody[1], gyroBody[2]);

    if (delta < 1.0 && gyroMag < 0.5) {
        return SIGMA_TILT_NOMINAL;               // 0.02 rad — clean gravity, low spin
    } else if (agMag < 0.5 * g) {
        return SIGMA_TILT_FREEFALL;              // 1.0 rad — true freefall
    } else {
        // High-G spinning: interpolate
        const t = Math.min(1.0, delta / (2.0 * g));
        return SIGMA_TILT_NOMINAL + t * (SIGMA_TILT_FREEFALL - SIGMA_TILT_NOMINAL);
    }
}

/**
 * Adaptive sigma yaw — modulates quat-prior yaw trust on TWO independent signals:
 *
 * 1. |R[2][0]| (= |world-Down component of nose|) — yaw observability from attitude.
 *    When the nose is near-level, the mag factor's ∂h/∂δθ_yaw is full-rank and the
 *    mag provides yaw information. During flips/dives (|R[2][0]| → 1), the mag's
 *    yaw-bearing projection collapses → trust the FC quat-prior more tightly.
 *
 * 2. Mag disturbance scale (|B| anomaly, motor current): when the mag is disturbed,
 *    the quat-prior must tighten EVEN at level flight because mag anchoring is
 *    unreliable. When disturbance is low, the prior can fully loosen, letting the
 *    mag override the FC's gyro-only dead-reckoned yaw.
 *
 * @param qEst             ESKF attitude [qw,qx,qy,qz] body(FRD)→world(NED)
 * @param magDisturbScale  mag-related disturbance scale (>=1, 1=clean)
 * @param sigmaYawMax      maximum σ_yaw at level flight when mag is clean (rad)
 * @returns adapted sigma yaw in radians
 */
export function computeAdaptiveSigmaYaw(
  qEst: Quat,
  magDisturbScale = 1.0,
  sigmaYawMax = SIGMA_YAW_DEFAULT_MAX,
): number {
    const m = quatToRotMat(qEst);
    const col0zAbs = Math.abs(m[6]);

    const range = SIGMA_YAW_OBS_THRESH_HI - SIGMA_YAW_OBS_THRESH_LO;
    const t = Math.max(0, Math.min(1, (col0zAbs - SIGMA_YAW_OBS_THRESH_LO) / range));
    const baseSigma = sigmaYawMax + t * (SIGMA_YAW_DEFAULT_TIGHT - sigmaYawMax);

    const d = Math.max(1.0, magDisturbScale);
    const sigma = Math.max(SIGMA_YAW_DEFAULT_TIGHT, Math.min(sigmaYawMax, baseSigma / d));

    return sigma;
}

/**
 * 3-axis magnetometer measurement (body frame, in Gauss).
 *
 * Measurement model: z_mag = R(q)^T · m_earth + m_body + k_I · I(t)
 *
 * H rows are dimensioned for the 21-state layout (15 base + 6 mag: m_earth[3], m_body[3]).
 *
 * The mag noise is ANISOTROPIC by the calibration fingerprint:
 *   sigma_xy = horizontal (heading-bearing) components (X,Y in body FRD)
 *   sigma_z  = vertical component (Z in body FRD)
 *
 * @param meas            mag reading [bx,by,bz] body FRD (Gauss)
 * @param sigmaOrSigmaXY  measurement noise 1σ (Gauss), scalar isotropic if
 *                         sigmaZ not provided, or sigma_xy if sigmaZ is provided
 * @param sigmaZ           vertical noise 1σ (Gauss). If provided, anisotropic
 *                         R = diag(sigma_xy²,sigma_xy²,sigma_z²) is used.
 * @param currentAmps     battery current in Amps (drives k_I term)
 */
export function createMagFactor(
  meas: Vec3,
  sigmaOrSigmaXY = 0.05,
  sigmaZ?: number,
  currentAmps = 0,
): MeasurementFactor<Vec3> {
    let Rnoise: number[][];
    if (sigmaZ !== undefined && sigmaZ !== null) {
        const varXY = sigmaOrSigmaXY * sigmaOrSigmaXY;
        const varZ = sigmaZ * sigmaZ;
        Rnoise = [[varXY, 0, 0], [0, varXY, 0], [0, 0, varZ]];
    } else {
        const varM = sigmaOrSigmaXY * sigmaOrSigmaXY;
        Rnoise = [[varM, 0, 0], [0, varM, 0], [0, 0, varM]];
    }

    let cachedH: number[][] | null = null;

    function h(x: NominalState): number[] {
        const m = quatToRotMat(x.q);
        const me = x.mEarth || [0, 0, 0];
        const mb = x.mBody || [0, 0, 0];
        const kI = x.kI || [0, 0, 0];
        return [
            m[0]*me[0] + m[3]*me[1] + m[6]*me[2] + mb[0] + kI[0] * currentAmps,
            m[1]*me[0] + m[4]*me[1] + m[7]*me[2] + mb[1] + kI[1] * currentAmps,
            m[2]*me[0] + m[5]*me[1] + m[8]*me[2] + mb[2] + kI[2] * currentAmps,
        ];
    }

    function residual(z: Vec3, x: NominalState): number[] {
        const m = quatToRotMat(x.q);
        const me = x.mEarth || [0, 0, 0];
        const me0 = me[0], me1 = me[1], me2 = me[2];

        const rowSkew = (r0: number, r1: number, r2: number): Vec3 => [
            r1*me2 - r2*me1,
            -r0*me2 + r2*me0,
            r0*me1 - r1*me0,
        ];
        const t0 = rowSkew(m[0], m[3], m[6]);
        const t1 = rowSkew(m[1], m[4], m[7]);
        const t2 = rowSkew(m[2], m[5], m[8]);

        cachedH = [
            [0,0,0, 0,0,0, t0[0],t0[1],t0[2], 0,0,0, 0,0,0, m[0],m[3],m[6], 1,0,0, 0, currentAmps,0,0],
            [0,0,0, 0,0,0, t1[0],t1[1],t1[2], 0,0,0, 0,0,0, m[1],m[4],m[7], 0,1,0, 0, 0,currentAmps,0],
            [0,0,0, 0,0,0, t2[0],t2[1],t2[2], 0,0,0, 0,0,0, m[2],m[5],m[8], 0,0,1, 0, 0,0,currentAmps],
        ];
        const hp = h(x);
        return [z[0]-hp[0], z[1]-hp[1], z[2]-hp[2]];
    }

    const defaultH: number[][] = [
        [0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0, 0,0,0,1,0,0, 0,currentAmps,0,0],
        [0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0, 0,0,0,0,1,0, 0,0,currentAmps,0],
        [0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0, 0,0,0,0,0,1, 0,0,0,currentAmps],
    ];

    return {
        h,
        get H() { return cachedH || defaultH; },
        R: Rnoise,
        residual,
    };
}

/**
 * Declination pseudo-measurement.
 *
 * Soft constraint: atan2(magE, magN) ≈ WMM_declination (radians).
 * Keeps the earth field vector from drifting.
 *
 * @param declRad  WMM declination at flight location (radians)
 * @param sigma    noise in radians
 */
export function createDeclinationFactor(declRad: number, sigma = 0.34): MeasurementFactor<number> {
    const varD = sigma * sigma;
    let cachedH: number[][] | null = null;

    function h(x: NominalState): number {
        const me = x.mEarth || [0,0,0];
        return Math.atan2(me[1], me[0]);
    }

    const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

    function residual(z: number, x: NominalState): number[] {
        const me = x.mEarth || [0,0,0];
        const n2e2 = me[0]*me[0] + me[1]*me[1];
        const dHdN = n2e2 > 1e-12 ? -me[1]/n2e2 : 0;
        const dHdE = n2e2 > 1e-12 ? me[0]/n2e2 : 0;
        cachedH = [[0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0, dHdN,dHdE,0, 0,0,0]];
        return [wrapAngle(z - h(x))];
    }

    return {
        h,
        get H() { return cachedH || [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]]; },
        R: [[varD]],
        residual,
    };
}

/**
 * Map GPS satellite count to 1σ position noise in metres.
 *
 * @param numSat  Number of satellites in view
 * @returns 1σ position noise (m)
 */
export function computeGpsNoise(numSat: number): number {
  if (numSat >= 12) return 1.5;
  if (numSat >= 8)  return 2.5;
  if (numSat >= 5)  return 4.0;
  return 8.0;
}
