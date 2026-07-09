/**
 * Synthetic trajectory generator and sensor simulator.
 *
 * Plants a known ground-truth trajectory then simulates the sensor logs
 * (GPS, IMU, baro, mag) that Betaflight would produce for that motion.
 * Used with a fixed PRNG seed to create deterministic test fixtures for the
 * estimator — the estimator must recover the planted pose within the injected
 * noise budget.
 *
 * Frame conventions:
 *  - Body: FRD (Forward=X, Right=Y, Down=Z)
 *  - World: NED (North, East, Down)
 *  - Quaternion: Hamilton, body(FRD) → world(NED), scalar-first [w, x, y, z]
 */

import type { LLA, Quat, Vec3 } from '../../../src/blackbox-viewer/pose/poseSample.js';

// ---------------------------------------------------------------------------
// PRNG
// ---------------------------------------------------------------------------

export type RngFn = () => number;

/** Simple deterministic PRNG (mulberry32). Returns a generator producing values in [0, 1). */
export function createRng(seed: number): RngFn {
  let s = seed | 0;
  return function (): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal distribution via Box-Muller. */
export function randn(rng: RngFn, mean = 0, std = 1): number {
  const u1 = rng() || 1e-9;
  const u2 = rng();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ---------------------------------------------------------------------------
// Synthetic pose
// ---------------------------------------------------------------------------

export interface SyntheticPose {
  t: number;               // time in seconds
  pNed: { n: number; e: number; d: number };
  vNed: { n: number; e: number; d: number };
  q: Quat;
  heading: number;         // yaw in radians
  bankAngle: number;       // roll in radians
  pitch?: number;
}

// ---------------------------------------------------------------------------
// Circular trajectory
// ---------------------------------------------------------------------------

export interface CircularTrajectoryOpts {
  durationS?: number;
  freqHz?: number;
  radiusM?: number;
  speedMs?: number;
  originAlt?: number;
}

export function generateCircularTrajectory(opts: CircularTrajectoryOpts = {}): SyntheticPose[] {
  const {
    durationS = 10,
    freqHz = 100,
    radiusM = 50,
    speedMs = 15,
    originAlt = 200,
  } = opts;

  const dt = 1 / freqHz;
  const N = Math.floor(durationS * freqHz);
  const poses: SyntheticPose[] = [];
  const angularRate = speedMs / radiusM;

  for (let i = 0; i < N; i++) {
    const t = i * dt;
    const heading = angularRate * t;
    const tn = heading;

    const pN = radiusM * Math.sin(tn);
    const pE = radiusM * (1 - Math.cos(tn));
    const pD = -originAlt;

    const vN = speedMs * Math.cos(tn);
    const vE = speedMs * Math.sin(tn);
    const vD = 0;

    const qSimple: Quat = [
      Math.cos(heading / 2),
      0,
      0,
      Math.sin(heading / 2),
    ];

    poses.push({
      t,
      pNed: { n: pN, e: pE, d: pD },
      vNed: { n: vN, e: vE, d: vD },
      q: qSimple,
      heading,
      bankAngle: 0,
    });
  }

  return poses;
}

// ---------------------------------------------------------------------------
// Straight trajectory
// ---------------------------------------------------------------------------

export interface StraightTrajectoryOpts {
  durationS?: number;
  speedMs?: number;
  headingDeg?: number;
  freqHz?: number;
}

export function generateStraightTrajectory(opts: StraightTrajectoryOpts = {}): SyntheticPose[] {
  const {
    durationS = 5,
    speedMs = 10,
    headingDeg = 45,
    freqHz = 100,
  } = opts;

  const heading = (headingDeg * Math.PI) / 180;
  const dt = 1 / freqHz;
  const N = Math.floor(durationS * freqHz);
  const poses: SyntheticPose[] = [];

  for (let i = 0; i < N; i++) {
    const t = i * dt;
    poses.push({
      t,
      pNed: {
        n: speedMs * Math.cos(heading) * t,
        e: speedMs * Math.sin(heading) * t,
        d: -200,
      },
      vNed: {
        n: speedMs * Math.cos(heading),
        e: speedMs * Math.sin(heading),
        d: 0,
      },
      q: [Math.cos(heading / 2), 0, 0, Math.sin(heading / 2)] as Quat,
      heading,
      bankAngle: 0,
    });
  }

  return poses;
}

// ---------------------------------------------------------------------------
// Quaternion helpers (local; uses same formulas as imuMechanization)
// ---------------------------------------------------------------------------

function eulerToQuatLocal(roll: number, pitch: number, yaw: number): Quat {
  const cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5);
  const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
  const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
  return [
    cr * cp * cy + sr * sp * sy,
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
  ];
}

function quatToRotMatrixLocal(q: Quat): number[][] {
  const [w, x, y, z] = q;
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  return [
    [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
    [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
    [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)],
  ];
}

// ---------------------------------------------------------------------------
// Dynamic trajectory
// ---------------------------------------------------------------------------

export interface DynamicTrajectoryOpts {
  freqHz?: number;
  durationS?: number;
}

export interface DynamicTrajectoryResult {
  traj: SyntheticPose[];
  params: {
    T1: number;
    T2: number;
    T3: number;
    speed: number;
    bankDeg: number;
    climbPitchDeg: number;
    radius: number;
    freqHz: number;
  };
}

/**
 * Generate a trajectory with dynamic attitudes:
 *  Segment 1 (0–T1): coordinated banked right turn
 *  Segment 2 (T1–T2): climbing straight
 *  Segment 3 (T2–T3): flat yaw sweep (hover)
 */
export function generateDynamicTrajectory(opts: DynamicTrajectoryOpts = {}): DynamicTrajectoryResult {
  const { freqHz = 200 } = opts;
  const dt = 1 / freqHz;
  const g = 9.80665;

  // Segment 1: banked turn
  const T1 = 2.0;
  const speed = 15;
  const bankDeg = 30;
  const bank = (bankDeg * Math.PI) / 180;
  const radius = (speed * speed) / (g * Math.tan(Math.abs(bank)));
  const yawRate = speed / radius;
  const N1 = Math.floor(T1 * freqHz);

  // Segment 2: climbing
  const T2 = T1 + 2.0;
  const climbPitchDeg = 15;
  const climbPitch = (climbPitchDeg * Math.PI) / 180;
  const N2 = Math.floor((T2 - T1) * freqHz);

  // Segment 3: yaw sweep
  const T3 = T2 + 1.5;
  const spinRate = Math.PI; // π rad/s
  const N3 = Math.floor((T3 - T2) * freqHz);

  const poses: SyntheticPose[] = [];

  let pN = 0, pE = 0, pD = -200;
  let vN: number, vE: number, vD: number;
  let roll = 0, pitch = 0, yaw = 0;

  // Segment 1: banked right turn
  for (let i = 0; i < N1; i++) {
    const t = i * dt;
    yaw += yawRate * dt;
    roll = -bank;
    pitch = 0;
    vD = 0;

    const q = eulerToQuatLocal(roll, pitch, yaw);
    vN = speed * Math.cos(yaw);
    vE = speed * Math.sin(yaw);

    pN = radius * Math.sin(yaw);
    pE = radius * (1 - Math.cos(yaw));

    poses.push({
      t, pNed: { n: pN, e: pE, d: pD },
      vNed: { n: vN, e: vE, d: vD },
      q, heading: yaw, bankAngle: roll,
    });
  }

  // Segment 2: climbing straight
  for (let i = 0; i < N2; i++) {
    const j = N1 + i;
    const t = j * dt;

    roll = -bank;
    pitch = climbPitch;

    const q = eulerToQuatLocal(roll, pitch, yaw);
    vN = speed * Math.cos(yaw) * Math.cos(climbPitch);
    vE = speed * Math.sin(yaw) * Math.cos(climbPitch);
    vD = -speed * Math.sin(climbPitch);

    pN += vN * dt;
    pE += vE * dt;
    pD += vD * dt;

    poses.push({
      t, pNed: { n: pN, e: pE, d: pD },
      vNed: { n: vN, e: vE, d: vD },
      q, heading: yaw, bankAngle: roll,
    });
  }

  // Segment 3: flat yaw sweep (hover)
  for (let i = 0; i < N3; i++) {
    const j = N1 + N2 + i;
    const t = j * dt;

    yaw += spinRate * dt;
    roll = 0;
    pitch = 0;

    const q = eulerToQuatLocal(roll, pitch, yaw);

    poses.push({
      t, pNed: { n: pN, e: pE, d: pD },
      vNed: { n: 0, e: 0, d: 0 },
      q, heading: yaw, bankAngle: roll,
    });
  }

  return {
    traj: poses,
    params: { T1, T2, T3, speed, bankDeg, climbPitchDeg, radius, freqHz },
  };
}

// ---------------------------------------------------------------------------
// Sensor stream synthesizer
// ---------------------------------------------------------------------------

export interface ImuSample {
  tUs: number;
  gyro: Vec3;
  accel: Vec3;
}

export interface GpsFix {
  tUs: number;
  lat: number;
  lon: number;
  alt: number;
  velNed: Vec3;
  numSat: number;
  fixType: number;
}

export interface BaroSample {
  tUs: number;
  alt: number;
}

export interface FcQuatSample {
  tUs: number;
  q: Quat;
}

export interface MagSample {
  tUs: number;
  meas: Vec3;
}

export interface SensorStreams {
  imu: ImuSample[];
  gps: GpsFix[];
  baro: BaroSample[];
  quat: FcQuatSample[];
  mag: MagSample[];
}

export interface SensorStreamOpts {
  mEarth?: Vec3;
  mBody?: Vec3;
  rng?: RngFn | null;
  gpsNoiseStd?: number;
  gyroNoiseStd?: number;
  accelNoiseStd?: number;
  origin?: LLA | null;
}

export function generateSensorStreams(
  traj: SyntheticPose[],
  opts: SensorStreamOpts = {},
): SensorStreams {
  const {
    mEarth = [0.17, -0.047, 0.51] as Vec3,
    mBody = [0, 0, 0] as Vec3,
    rng = null,
    gyroNoiseStd = 0,
    accelNoiseStd = 0,
    origin = null,
  } = opts;

  const g = 9.80665;
  const originAlt = origin ? origin.alt : 0;
  const imu: ImuSample[] = [];
  const gpsList: GpsFix[] = [];
  const baro: BaroSample[] = [];
  const quat: FcQuatSample[] = [];
  const mag: MagSample[] = [];
  let lastQ: Quat | null = null;
  const dt = traj.length > 1 ? traj[1].t - traj[0].t : 0.01;

  for (let i = 0; i < traj.length; i++) {
    const pose = traj[i];
    const tUs = Math.round(pose.t * 1e6);

    // Gyroscope: angular velocity in body FRD
    let gyro: Vec3 = [0, 0, 0];
    if (lastQ && dt > 0) {
      const qLastConj: Quat = [lastQ[0], -lastQ[1], -lastQ[2], -lastQ[3]];
      const qRel = quatMultLocal(qLastConj, pose.q);
      const rotVec = quatToRotVec(qRel);
      gyro = [
        rotVec[0] / dt + (rng ? randn(rng, 0, gyroNoiseStd) : 0),
        rotVec[1] / dt + (rng ? randn(rng, 0, gyroNoiseStd) : 0),
        rotVec[2] / dt + (rng ? randn(rng, 0, gyroNoiseStd) : 0),
      ];
    }
    lastQ = pose.q;

    // Accelerometer
    let aWorld: Vec3 = [0, 0, 0];
    if (i >= 2) {
      const dtA = traj[i].t - traj[i - 1].t;
      if (dtA > 0) {
        aWorld = [
          (pose.vNed.n - traj[i - 1].vNed.n) / dtA,
          (pose.vNed.e - traj[i - 1].vNed.e) / dtA,
          (pose.vNed.d - traj[i - 1].vNed.d) / dtA,
        ];
      }
    }
    const sfWorld: Vec3 = [aWorld[0], aWorld[1], aWorld[2] - g];
    const R = quatToRotMatrixLocal(pose.q);
    const sfBody: Vec3 = [
      R[0][0] * sfWorld[0] + R[1][0] * sfWorld[1] + R[2][0] * sfWorld[2],
      R[0][1] * sfWorld[0] + R[1][1] * sfWorld[1] + R[2][1] * sfWorld[2],
      R[0][2] * sfWorld[0] + R[1][2] * sfWorld[1] + R[2][2] * sfWorld[2],
    ];
    const accel: Vec3 = [
      -sfBody[0] + (rng ? randn(rng, 0, accelNoiseStd) : 0),
      -sfBody[1] + (rng ? randn(rng, 0, accelNoiseStd) : 0),
      -sfBody[2] + (rng ? randn(rng, 0, accelNoiseStd) : 0),
    ];

    imu.push({ tUs, gyro, accel });

    // GPS at ~10 Hz
    if (i % Math.round(1 / (10 * dt)) === 0) {
      gpsList.push({
        tUs,
        lat: 48.408 + pose.pNed.n / 111320,
        lon: -71.164 + pose.pNed.e / (111320 * Math.cos((48.408 * Math.PI) / 180)),
        alt: originAlt - pose.pNed.d,
        velNed: [
          pose.vNed.n + (rng ? randn(rng, 0, 0.3) : 0),
          pose.vNed.e + (rng ? randn(rng, 0, 0.3) : 0),
          pose.vNed.d + (rng ? randn(rng, 0, 0.3) : 0),
        ],
        numSat: 12,
        fixType: 3,
      });
    }

    // Baro
    baro.push({ tUs, alt: -pose.pNed.d });

    // FC quaternion
    quat.push({ tUs, q: pose.q });

    // Magnetometer (3-axis in body)
    const meB: Vec3 = [
      R[0][0] * mEarth[0] + R[1][0] * mEarth[1] + R[2][0] * mEarth[2],
      R[0][1] * mEarth[0] + R[1][1] * mEarth[1] + R[2][1] * mEarth[2],
      R[0][2] * mEarth[0] + R[1][2] * mEarth[1] + R[2][2] * mEarth[2],
    ];
    mag.push({
      tUs,
      meas: [meB[0] + mBody[0], meB[1] + mBody[1], meB[2] + mBody[2]],
    });
  }

  return { imu, gps: gpsList, baro, quat, mag };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function quatMultLocal(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

function quatToRotVec(q: Quat): Vec3 {
  const w = q[0];
  const vNorm = Math.sqrt(q[1] ** 2 + q[2] ** 2 + q[3] ** 2);
  if (vNorm < 1e-14) return [0, 0, 0];
  const theta = 2 * Math.atan2(vNorm, w);
  const scale = theta / vNorm;
  return [q[1] * scale, q[2] * scale, q[3] * scale];
}
