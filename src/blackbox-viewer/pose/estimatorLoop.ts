import { createEskf, eskfPredict, eskfUpdate } from './eskf.js';
import type { EskfOptions, EskfState, RobustOpts } from './eskf.js';
import {
  createGpsPositionFactor,
  createGpsVelocityFactor,
  createBaroFactor,
  createQuaternionPrior,
  createColoredQuaternionFactor,
  quaternionLogResidual,
  createAccelTiltFactor,
  createMagFactor,
  createDeclinationFactor,
  computeAdaptiveSigmaYaw,
  computeAdaptiveSigmaTilt,
  computeGpsNoise,
  SIGMA_YAW_DEFAULT_MAX,
  quatToRotMat,
} from './measurements.js';
import type { NedMeas } from './measurements.js';
import { rtsSmooth } from './rtsSmoother.js';
import type { FilterResult, SmoothedResult, NominalState as RtsNominalState } from './rtsSmoother.js';
import { llhToNed, nedToLlh } from './geodesy.js';
import type { NedPos } from './geodesy.js';
import { createPoseTrack } from './poseTrack.js';
import type { PoseTrack } from './poseTrack.js';
import { quatToRot, quatFromAxisAngle, quatMultiply, eulerFromQuat, strapdownPropagate } from './imuMechanization.js';
import type { PoseSampleInternal, Vec3, Quat, LLA } from './poseSample.js';
import type {
  ImuEntry,
  GpsEntry,
  BaroEntry,
  QuatEntry,
  MagGaussEntry,
  CurrentEntry,
} from './flightIngestion.js';

type Mat = number[][];

const GRAVITY_MPS2 = 9.80665;

/**
 * Barometer measurement-noise inflation factor from propeller-thrust dynamic
 * pressure (propwash) and climb rate.
 *
 * Physics: propeller thrust T ~ k*rpm^2; in near-level flight, body-Z specific
 * force a_z ~ T/mass, so the accelerometer's body-Z reading directly tracks
 * thrust at IMU rate without the battery-voltage-sag or ESC-telemetry-rate
 * issues of a current-draw (currAmps) proxy. Downwash
 * dynamic pressure scales with thrust, so excess body-Z specific force is a
 * physics-informed proxy for the barometer disturbance.
 *
 * @param accelAbsZLpf   Low-pass filtered |accel_bodyZ| (m/s^2). MUST be
 *                        pre-filtered by the caller (not a raw single sample) --
 *                        raw IMU readings carry frame-vibration noise easily
 *                        1-3 m/s^2 even in calm flight.
 * @param rEst22         R_est[2][2]: the world-down component of the current
 *                        body-Z axis (from the attitude rotation matrix),
 *                        i.e. cos(tilt-from-vertical). Used to compute the
 *                        LOAD-FACTOR-correct baseline reading (g / cos(tilt),
 *                        the standard aviation result for a level coordinated
 *                        turn -- thrust must increase as 1/cos(bank) to
 *                        support weight against a tilted lift vector) instead
 *                        of a flat 9.81 m/s^2, which would misread a banked
 *                        turn's genuinely-higher-but-expected thrust as
 *                        propwash-inducing excess. Floored at cos(70deg) to
 *                        avoid a blow-up near-90-deg tilt.
 * @param climbRateMs    |vertical velocity| (m/s), NED D-axis magnitude.
 */
export function computeBaroInflate(accelAbsZLpf: number, rEst22: number, climbRateMs: number): number {
    const cosTiltFloor = 0.342; // cos(70 deg)
    const cosTilt = Math.max(cosTiltFloor, Math.abs(rEst22));
    const loadFactorBaseline = GRAVITY_MPS2 / cosTilt;
    const excessSpecificForce = Math.max(0, accelAbsZLpf - loadFactorBaseline);
    let baroInflate = 1.0;
    baroInflate += excessSpecificForce * 0.2;                    // +1 sigma per 5 m/s^2 excess thrust
    if (climbRateMs > 5) baroInflate += (climbRateMs - 5) * 0.5; // +0.5 sigma per m/s above 5 m/s
    return baroInflate;
}

export interface BaroBiasFogmState {
    bias: number;
    variance: number;
}

/**
 * Barometric bias FOGM (First-Order Gauss-Markov) tracker.
 *
 * ARCHITECTURE NOTE -- decoupled scalar tracker, NOT a joint ESKF state: the
 * "textbook" way to add a bias state (e.g. exactly how GPS position bias is
 * already done via `sigmaGpsBias`/`tauGps`/`bgps` in eskf.ts) is to extend the
 * shared error-state vector. That machinery hardcodes exact state DIMENSIONS
 * at several call sites (`dim === 18 ? 15 : (dim === 24 ? 21 : -1)` appears
 * verbatim in three places in eskf.ts) across an already-combinatorial set of
 * dims (15/18/21/24, from mag-on/off x gpsBias-on/off) -- extending that
 * pattern correctly for a 5th combination axis (baro-bias on/off) within the
 * time available for this feature risked a subtle, hard-to-detect indexing
 * bug that could have silently corrupted state updates for every feature, not
 * just baro. This standalone scalar (1-state) Kalman tracker is a deliberate,
 * documented scope trade: it is NOT jointly statistically optimal with the
 * main ESKF (no cross-covariance between the baro bias and, say, the GPS
 * position bias state), but it is far lower-risk to implement and verify
 * correctly, and delivers the real capability (a PERSISTENT, slowly-decaying
 * baro bias estimate, distinct from just inflating per-sample noise -- see
 * computeBaroInflate, which only widens uncertainty and never CORRECTS a
 * sustained offset).
 *
 * Time update (mean-reverting FOGM, exact discretization -- same form as
 * eskf.ts's GPS-bias state): bias decays toward 0 with time constant tauBaro;
 * variance follows the standard OU-process exact solution.
 *
 * Measurement update: a standard scalar Kalman update using the RAW baro
 * innovation (measured altitude minus the ESKF's own current altitude
 * estimate, which the caller must compute) as the observation, with
 * innovationVar being the caller's own effective baro measurement variance
 * (effectiveBaroSigma^2). This DOES reuse the same raw innovation the main
 * ESKF baro factor also consumes -- a standard two-timescale cascaded design
 * (this tracker reacts slowly, over tauBaro; the main filter reacts at
 * baroSigma's timescale), not unusual in practice, but it means the two
 * updates are not statistically independent -- a joint-state design would
 * avoid that at the cost of the implementation risk described above.
 */
export function updateBaroBiasFogm(
    prev: BaroBiasFogmState,
    dt: number,
    tauBaro: number,
    sigmaBaroBias: number,
    innovation: number,
    innovationVar: number,
): BaroBiasFogmState {
    const decay = Math.exp(-dt / tauBaro);
    const biasPred = prev.bias * decay;
    const varPred = prev.variance * decay * decay + sigmaBaroBias * sigmaBaroBias * (1 - decay * decay);

    const innovationAdjusted = innovation - biasPred;
    const S = varPred + innovationVar;
    const K = S > 1e-12 ? varPred / S : 0;
    const biasNew = biasPred + K * innovationAdjusted;
    const varNew = (1 - K) * varPred;

    return { bias: biasNew, variance: varNew };
}

export interface OnProgress {
  phase: string;
  iteration: number;
  totalIterations: number;
  fraction: number;
  detail: string;
}

export interface MagModelFusion {
  earthFieldNedGauss?: { n: number; e: number; d: number };
  qualityBounds?: {
    bounds_ok?: boolean;
    field_strength_mg?: number;
  };
  magNoiseGauss?: {
    sigma_xy?: number;
    sigma_z?: number;
    sigma?: number;
  };
}

export interface MagModelInput {
  version?: string | number;
  fusion?: MagModelFusion;
  [key: string]: unknown;
}

export interface EstimatorData {
  imu: ImuEntry[];
  gps: GpsEntry[];
  baro: BaroEntry[];
  quat: QuatEntry[];
  mag: MagGaussEntry[];
}

export interface EstimatorOrigin {
  lat: number;
  lon: number;
  alt: number;
}

export interface EstimatorOpts {
  outputHz?: number;
  gpsPosSigma?: number;
  gpsVelSigma?: number;
  baroSigma?: number;
  attSigma?: number;
  sigmaYaw?: number;
  sigmaYawMax?: number;
  maxIter?: number;
  magSigma?: number;
  declSigma?: number;
  magModel?: MagModelInput | null;
  useDcs?: boolean;
  /** Use Variational-Bayes adaptive R (RobustOpts.vbAdaptive in eskf.ts)
   *  instead of the capped R-inflation `useDcs` mechanism for GPS pos/vel
   *  updates. Default false (opt-in, like useDcs). Takes priority over
   *  useDcs if both are true. See the real-data comparison against useDcs
   *  (dropout window + full-flight) in eskf.ts's RobustOpts.vbAdaptive doc
   *  comment. */
  useVbAdaptiveR?: boolean;
  current?: CurrentEntry[] | null;
  procSigmaAcc?: number;
  procSigmaGyro?: number;
  gpsPosGate?: number;
  gpsVelGate?: number;
  magGate?: number;
  /** Model-free raw-mag heading-bias estimate (rad).  When set and useMag is
   *  false, every FC quaternion is corrected by this angle about world-Z
   *  before entering the quaternion prior.  Computed by computeMagHeadingBias(). */
  rawMagBiasRad?: number;
  sigmaBaInit?: number;
  sigmaBgInit?: number;
  sigmaBaRW?: number;
  sigmaBgRW?: number;
  sigmaBgPrior?: number;
  onProgress?: (progress: OnProgress) => void;
  /** GPS transport delay in milliseconds (subtracted from GPS timestamps).
   *  Default 0. u-blox M10: ~150-200 ms. Can be set to 'auto' to resolve latency. */
  gpsDelayMs?: number | 'auto';
  /** GPS position sigma floor in metres. Only used when useGpsAccuracyScaling=true.
   *  Per-fix sigma = max(floor, numSat-model). Default 1.0 m. */
  gpsPosSigmaFloor?: number;
  /** When true, scale GPS position sigma per-fix from satellite count.
   *  Good sats (≥12) → tighter (~1.5m); degraded → looser. Default false. */
  useGpsAccuracyScaling?: boolean;
  sigmaGpsBias?: number;
  sigmaGpsBiasInit?: number;
  tauGps?: number;
  /** GPS fix timestamping source. 'fc' (default): use the FC's own
   *  loop-iteration arrival timestamp -- simple, but bakes in serial-transport
   *  jitter (UART scheduling, FC parse loop timing) as position-update noise.
   *  'itow-rate-matched': reconstruct each fix's timestamp from the u-blox
   *  iTOW (GPS time-of-week) field via a linear fit to FC time (see
   *  rateMatchGpsTimestamps), removing that jitter. A prior *naive* attempt
   *  (assuming the FC and GPS clocks run at exactly 1:1 rate, i.e. a raw
   *  itow-to-FC-time offset with no rate correction) made things WORSE
   *  (reference_flight1: FC-time 0.9m vs raw-iTOW 1.1m median) because the
   *  two clocks' rates aren't quite identical and an uncorrected rate
   *  mismatch accumulates a progressive lag over the flight -- solving for
   *  the rate alongside the offset (this mode) is the fix. No effect if the
   *  log doesn't carry GPS_time (falls back to 'fc' silently). */
  gpsTimeMode?: 'fc' | 'itow-rate-matched';
  /** Rate limit (Hz) for fusing the FC's onboard quaternion (`createQuaternionPrior`)
   *  into the ESKF. Default 1000 Hz. The FC quaternion is itself the output of an
   *  onboard Mahony/Madgwick filter that has already integrated the SAME raw
   *  gyro/accel samples the ESKF's own prediction step consumes, so fusing every
   *  logged sample re-ingests the same gyro information many times per second --
   *  a real double-counting defect that makes the filter's attitude covariance
   *  substantially overconfident.
   *
   *  IMPORTANT, evidence-based limitation: this architecture has NO independent
   *  roll/pitch reference (no separate accelerometer-tilt factor) and, when mag
   *  is off/failed, no independent yaw reference either -- the FC quaternion is
   *  the ONLY absolute attitude anchor. Rate-limiting this prior too aggressively
   *  (down toward ~1 Hz) collapses real attitude accuracy, and none of the
   *  tested rates meaningfully improved the covariance-coverage number either
   *  (steady-state posterior covariance is set by the Riccati fixed point of
   *  process noise vs. per-update R, not simply by update count). WORSE: fusing
   *  too infrequently caused catastrophic divergence on aggressive acro/freestyle
   *  flights (see `acroFixture.test.ts`) that does NOT show up on gentle survey
   *  flights -- fast attitude excursions (flips) need much closer to the native
   *  fusion rate to track through. A rate sweep against that gate settled on
   *  1000 Hz for margin. At 1000 Hz the covariance-coverage defect is
   *  effectively UNCHANGED from unconditional fusion (barely fewer total
   *  updates over a multi-minute flight) -- this default is a near-no-op
   *  safety-first placeholder, not a working fix. Closing the actual defect
   *  requires an independent accel-tilt factor (so attitude isn't solely
   *  dependent on this one correlated source) or a properly-modeled
   *  correlated-noise treatment of the FC quaternion -- naive rate-limiting
   *  alone cannot get materially lower than ~1000 Hz without breaking real
   *  flights, gentle or aggressive. */
  fcQuatPriorHz?: number;
  /** Fixed multiplicative inflation applied to the FC-quaternion-prior's attSigma,
   *  on top of rate-limiting. Default 1.0 (no additional inflation). Real-data
   *  testing found any fixed multiplier beyond 1.0 measurably hurt real attitude
   *  accuracy without improving covariance coverage (see fcQuatPriorHz's doc
   *  comment), since coverage is gated by the process/measurement-noise Riccati
   *  fixed point, not by this scalar -- kept as a knob for future re-tuning once
   *  fcQuatPriorHz's underlying architectural limitation is addressed. */
  fcQuatSigmaInflate?: number;
  /** Per (m/s^2) scaling of the dynamic-flight de-weighting applied to the FC
   *  quaternion prior: effSigma *= min(cap, 1 + fcQuatDynWeightPerMps2 * max(0,
   *  |accel| - g)) (roll/pitch cap 2x, yaw cap 1.3x). Default 0 (DISABLED).
   *  The physical motivation is real (Mahony's tilt correction assumes the
   *  accelerometer measures gravity alone, violated when specific force departs
   *  from 1g), but real-data testing on `acroFixture.test.ts`'s aggressive
   *  reference_flight1 (backflips, sustained high specific force) found that
   *  de-weighting the ONE attitude anchor exactly during the highest-dynamics
   *  moments -- precisely when this option is designed to fire -- caused the
   *  same catastrophic divergence described in fcQuatPriorHz's doc comment,
   *  even with fcQuatPriorHz raised to a rate that is otherwise safe (1000 Hz
   *  passed with this disabled; failed with it enabled at 0.03/m/s^2). Left as
   *  an opt-in knob for gentler flights only; do not enable for acro/freestyle
   *  logs without re-validating against acroFixture.test.ts first. */
  fcQuatDynWeightPerMps2?: number;
  /** Enable the independent accelerometer-tilt factor (`createAccelTiltFactor`)
   *  fused once per keyframe, gated by `computeAdaptiveSigmaTilt`. Default
   *  true. Unlike the FC-quaternion prior, this is a fresh measurement of the
   *  CURRENT specific-force vector each time -- not derived from the FC's own
   *  gyro-integrated Mahony state -- so it can safely run every keyframe
   *  without contributing to the double-counting defect described in
   *  fcQuatPriorHz's doc comment. See the real-data validation below (this
   *  factor is what allows
   *  fcQuatPriorHz to be lowered again -- see accelTiltEnablesLowerQuatHz.
   *  integration.test.ts). */
  useAccelTilt?: boolean;
  /** Chi-square gate (mahalanobis-distance multiplier, same convention as
   *  gpsPosGate etc.) for the accel-tilt factor. Default 5.0 -- looser than
   *  the 3.0 used elsewhere because computeAdaptiveSigmaTilt already widens
   *  sigma during dynamics; the gate is a second line of defense against a
   *  single corrupted sample, not the primary dynamics-rejection mechanism. */
  accelTiltGate?: number;
  /** Colored-noise (AR(1)-whitened) treatment of the FC-quaternion prior.
   *  Default false.
   *
   *  DO NOT ENABLE without further work. Tested at phi=0.9 with full-rate
   *  fusion (no rate limit) against `acroFixture.test.ts`'s aggressive
   *  acro/freestyle gates: catastrophic divergence. The AR(1) whitening
   *  reduces the effective sigma fed to the Kalman update by sqrt(1-phi^2)
   *  (~0.44x at phi=0.9) relative to the RAW attSigma -- i.e. this path
   *  trusts the (whitened) residual MORE tightly than the already-tight
   *  unwhitened default, and with a fixed, unfit phi=0.9 guess (not measured
   *  from any specific flight's actual FC-quat autocorrelation), that tight
   *  trust combined with full-rate fusion overwhelmed the filter. This is
   *  very likely fixable (fit phi from real per-flight autocorrelation data
   *  rather than guessing a fixed value, and/or validate a single-lag AR(1)
   *  model is even sufficient for the Mahony filter's true correlation
   *  structure, which involves an integral term and could need a
   *  higher-order model) but that work was not completed. The code path is
   *  left in place (opt-in, off by default) as a documented starting point
   *  for that future work, not as a usable feature today. */
  fcQuatColoredNoise?: boolean;
  /** AR(1) coefficient for the colored-noise whitening filter, in (0,1).
   *  Default 0.9 -- a rough guess representing strong sample-to-sample
   *  correlation from the Mahony filter's slow PI dynamics, NOT fit to any
   *  specific flight's actual autocorrelation. See fcQuatColoredNoise's doc
   *  comment for the real-data divergence this caused -- fitting phi properly
   *  (or validating whether AR(1) is even the right model order) is required
   *  before this path is usable. */
  fcQuatArCoeff?: number;
  /** Enable the barometric bias FOGM tracker (`updateBaroBiasFogm`).
   *  Default false.
   *
   *  DO NOT ENABLE -- currently a net regression. Vertical error got worse at
   *  every tested parameterization, not better; a much slower/tighter tuning
   *  (tauBaro=180, sigmaBaroBias=0.5) improved things but did not recover the
   *  no-FOGM baseline's accuracy. Root cause: this tracker and the main ESKF
   *  baro update both consume the SAME raw innovation every step (see
   *  updateBaroBiasFogm's doc comment for why -- a documented, deliberate
   *  scope trade against the implementation risk of a joint ESKF state), and
   *  that shared dependency causes a form of double-counting/overcorrection
   *  in practice, not just in theory: it passes `acroFixture.test.ts`'s
   *  gates (doesn't crash or grossly diverge) but is measurably worse than
   *  doing nothing. Left in place, off by default, as a documented negative
   *  result and a starting point -- the likely fix is decorrelating the two
   *  updates (e.g. holding out alternating samples between the tracker and
   *  the main filter, or moving to the joint-state design after all) rather
   *  than further tuning tau/sigma, which only partially compensates. */
  useBaroFogm?: boolean;
  /** FOGM time constant (s) for the baro bias tracker. Default 45s. See
   *  useBaroFogm's doc comment -- even a much slower value (180s) did not
   *  fully recover the no-FOGM baseline's accuracy. */
  tauBaro?: number;
  /** Steady-state 1-sigma baro bias (m) for the FOGM tracker. Default 2.0m.
   *  See useBaroFogm's doc comment for the tuning results. */
  sigmaBaroBias?: number;
  /** Dynamic-pressure regressor coefficient: subtracts
   *  `baroDynPressureRegressorK * excessSpecificForce` (the same propwash
   *  proxy computeBaroInflate uses) from the raw baro reading before both the
   *  main ESKF update and the bias tracker see it. Default 0 (disabled) --
   *  the correct sign and magnitude need calibration against a known-good
   *  altitude reference that wasn't available to validate this coefficient;
   *  left as an explicit opt-in knob rather than guessing a nonzero default. */
  baroDynPressureRegressorK?: number;
}

interface SmoothedPose {
  tUs: number;
  p: Vec3;
  v: Vec3;
  q: Quat;
  ba?: Vec3;
  bg?: Vec3;
  P: Mat;
  mEarth?: Vec3;
  mBody?: Vec3;
}

interface EstimationResult {
  smoothed: SmoothedPose[];
  t0Us: number;
  lat0: number;
  lon0: number;
  alt0: number;
  nisHistory?: Record<string, { tUs: number; nis: number; df: number; logDetS: number }[]>;
  resolvedGpsDelayMs?: number;
}

interface StepState {
  p: Vec3;
  v: Vec3;
  q: Quat;
  ba: Vec3;
  bg: Vec3;
  bgps?: Vec3;
  mEarth?: Vec3;
  mBody?: Vec3;
  tUs: number;
}

interface Step {
  x: StepState;
  P: Mat;
  xPred: StepState;
  PPred: Mat;
  F: Mat;
  hasUpdate: boolean;
}

export interface LegacyPose {
  tMs: number;
  lat: number;
  lon: number;
  altMsl: number;
  q: Quat;
  vNed: Vec3;
  sigmaPos: number;
  sigmaAtt: number;
}

interface ConvergedParams {
  ba?: Vec3;
  bg?: Vec3;
  mEarth?: Vec3;
}

export function estimatePoses(
  data: EstimatorData,
  origin: EstimatorOrigin,
  opts: EstimatorOpts = {},
): LegacyPose[] {
  const track = estimatePoseTrack(data, origin, opts);
  const t0Us = track.samples.length > 0 ? track.samples[0].tUs : 0;
  return track.samples.map((s) => ({
    tMs: (s.tUs - t0Us) / 1000,
    lat: s.lla ? s.lla.lat : origin.lat,
    lon: s.lla ? s.lla.lon : origin.lon,
    altMsl: s.lla ? s.lla.alt : origin.alt,
    q: s.q,
    vNed: s.v,
    sigmaPos: Math.sqrt(
      Math.max(0, (s.covPos[0][0] + s.covPos[1][1] + s.covPos[2][2]) / 3),
    ),
    sigmaAtt:
      Math.sqrt(
        Math.max(0, (s.covAtt[0][0] + s.covAtt[1][1] + s.covAtt[2][2]) / 3),
      ) *
      (180 / Math.PI),
  }));
}

/**
 * Reconstruct GPS fix timestamps from the u-blox iTOW field (GPS-clock true
 * fix epoch) instead of the FC's loop-arrival timestamp, removing serial-
 * transport jitter (UART scheduling + FC parse loop timing) from every GPS
 * update. A naive version of this (assume the FC clock and GPS clock run at
 * exactly the same rate, so iTOW - constant = FC time) was tried previously
 * and made things WORSE (see EstimatorOpts.gpsTimeMode's doc comment) because
 * the two clocks' rates aren't quite identical -- an uncorrected rate
 * mismatch accumulates a progressive lag across the flight. This function
 * fits BOTH a rate and an offset (ordinary least squares: iTOW_ms = a *
 * tUs_fc + b) so the reconstructed timestamps track the FC clock's own rate,
 * with only the fix-to-fix jitter removed, not a slowly-drifting bias
 * introduced.
 *
 * Data policy:
 *   Input:  gps entries, each optionally carrying gpsTimeItoW (ms, u-blox
 *           GPS time-of-week, wraps every 7 days -- not handled here since a
 *           single flight never spans a rollover).
 *   Output: gps entries with tUs replaced by the rate-matched reconstruction,
 *           in original array order. Returns the ORIGINAL array unchanged
 *           (not a copy) if fewer than minFixes carry gpsTimeItoW, or if the
 *           fit is degenerate (near-zero variance in tUs, e.g. <2 distinct
 *           fixes) -- always safe to call speculatively.
 *   Loss:   None beyond the deliberate jitter removal that's the point of
 *           this transform.
 */
export function rateMatchGpsTimestamps(gps: GpsEntry[], minFixes = 10): GpsEntry[] {
  const withItow = gps
    .map((g, i) => ({ i, tUs: g.tUs, itowMs: g.gpsTimeItoW }))
    .filter((e): e is { i: number; tUs: number; itowMs: number } => e.itowMs !== undefined);
  if (withItow.length < minFixes) return gps;

  // OLS fit: itowMs = a * tUs + b. Center tUs for numerical conditioning
  // (raw tUs is microseconds-since-boot, potentially a large offset).
  const tUsMean = withItow.reduce((s, e) => s + e.tUs, 0) / withItow.length;
  let sxx = 0;
  let sxy = 0;
  for (const e of withItow) {
    const dx = e.tUs - tUsMean;
    sxx += dx * dx;
  }
  if (sxx < 1e-9) return gps; // degenerate: all fixes at (near-)identical tUs

  const itowMean = withItow.reduce((s, e) => s + e.itowMs, 0) / withItow.length;
  for (const e of withItow) {
    sxy += (e.tUs - tUsMean) * (e.itowMs - itowMean);
  }
  const a = sxy / sxx; // ms per us -- should be very close to 1e-3 if clocks are rate-matched
  const b = itowMean - a * tUsMean; // ms

  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) < 1e-9) return gps;

  const out = gps.slice();
  for (const e of withItow) {
    // Invert the fit to express the fix's true epoch back on the FC clock's
    // own timescale: tUs_reconstructed = (itowMs - b) / a.
    const tUsReconstructed = (e.itowMs - b) / a;
    out[e.i] = { ...out[e.i], tUs: tUsReconstructed };
  }
  return out;
}

function interpolateInsV(insV: { tUs: number; v: Vec3 }[], targetTUs: number): Vec3 {
  if (insV.length === 0) return [0, 0, 0];
  let lo = 0;
  let hi = insV.length - 1;
  if (targetTUs <= insV[lo].tUs) return insV[lo].v;
  if (targetTUs >= insV[hi].tUs) return insV[hi].v;

  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (insV[mid].tUs <= targetTUs) lo = mid;
    else hi = mid;
  }
  const s0 = insV[lo];
  const s1 = insV[hi];
  const dt = s1.tUs - s0.tUs;
  if (dt <= 0) return s0.v;
  const t = (targetTUs - s0.tUs) / dt;
  return [
    s0.v[0] + t * (s1.v[0] - s0.v[0]),
    s0.v[1] + t * (s1.v[1] - s0.v[1]),
    s0.v[2] + t * (s1.v[2] - s0.v[2]),
  ];
}

function solveGpsLatency(
  data: EstimatorData,
  origin: EstimatorOrigin,
  p0: Vec3,
  v0: Vec3,
  q0: Quat,
): number {
  const imu = data.imu;
  const gps = data.gps.filter((g) => g.velNed != null);
  if (gps.length < 10 || imu.length === 0) return 0;

  const insV: { tUs: number; v: Vec3 }[] = [];
  let p = [...p0] as Vec3;
  let v = [...v0] as Vec3;
  let q = [...q0] as Quat;
  const quat = data.quat;
  let qIdx = 0;
  let prevTUs = imu[0].tUs;

  for (let i = 0; i < imu.length; i++) {
    const s = imu[i];
    const dt = (s.tUs - prevTUs) / 1e6;
    prevTUs = s.tUs;
    if (dt <= 0) continue;

    while (qIdx < quat.length && quat[qIdx].tUs < s.tUs) {
      qIdx++;
    }
    if (qIdx < quat.length) {
      q = [...quat[qIdx].q] as Quat;
    }

    const next = strapdownPropagate(s.gyro, s.accel, q, v, p, dt, [0, 0, 0], [0, 0, 0]);
    p = next.p;
    v = next.v;
    q = next.q;

    insV.push({ tUs: s.tUs, v: [...v] as Vec3 });
  }

  let bestDelay = 0;
  let minMse = Infinity;

  for (let dMs = 0; dMs <= 300; dMs += 10) {
    let sumSqErr = 0;
    let count = 0;
    const delayUs = dMs * 1000;

    for (const g of gps) {
      const tShifted = g.tUs - delayUs;
      if (tShifted < insV[0].tUs || tShifted > insV[insV.length - 1].tUs) continue;
      const vIns = interpolateInsV(insV, tShifted);
      const vGps = g.velNed!;
      const err2 = (vIns[0] - vGps[0]) ** 2 + (vIns[1] - vGps[1]) ** 2 + (vIns[2] - vGps[2]) ** 2;
      sumSqErr += err2;
      count++;
    }

    if (count > 0) {
      const mse = sumSqErr / count;
      if (mse < minMse) {
        minMse = mse;
        bestDelay = dMs;
      }
    }
  }
  return bestDelay;
}

function _runEstimation(
  data: EstimatorData,
  origin: EstimatorOrigin,
  opts: EstimatorOpts = {},
): EstimationResult {
  const {
    outputHz = 20,
    // gpsPosSigma/gpsVelSigma/baroSigma re-tuned via NIS-consistency
    // leave-one-flight-out validation AFTER the FC-quat-prior decorrelation,
    // DCS chi2 phi + bounded R-inflation, and
    // physics-informed baro inflation fixes -- the previous frozen
    // values (gpsPosSigma=2.5, gpsVelSigma=0.95, baroSigma=2.5) were tuned
    // against the OLD, more-double-counted attitude/baro models and are stale
    // once those models changed the filter's own innovation statistics. This
    // pass: gpsVelSigma converged to EXACTLY 0.45 from both tuning directions
    // (A->B and B->A); gpsPosSigma converged to 3.375/2.25 (2.8 chosen
    // centrally); baroSigma converged to 1.875/1.25 (1.6 chosen centrally) --
    // the tighter baro value is consistent with the new az-based inflation
    // model being a better (less noisy) propwash proxy than currAmps, so the
    // filter can afford to trust the nominal (uninflated) reading more.
    gpsPosSigma = 2.8,
    gpsVelSigma = 0.45,
    baroSigma = 1.6,
    attSigma = 0.02,
    sigmaYaw = 0.15,
    sigmaYawMax = SIGMA_YAW_DEFAULT_MAX,
    maxIter = 3,
    magSigma = 0.05,
    declSigma = 0.34,
    magModel = null,
    useDcs = false,
    useVbAdaptiveR = false,
    current = null,
    procSigmaAcc = 5.5,
    procSigmaGyro = 0.08,
    gpsPosGate = 4.5,
    gpsVelGate = 15.0,
    magGate = 3.0,
    rawMagBiasRad = 0,
    sigmaBaInit = 0.5,
    sigmaBgInit = 0.01,
    sigmaBaRW = 2e-4,
    sigmaBgRW = 3e-5,
    sigmaBgPrior = 0,
    onProgress,
    gpsDelayMs = 0,
    gpsPosSigmaFloor = 2.0,
    useGpsAccuracyScaling = false,
    sigmaGpsBias = 1.5,
    sigmaGpsBiasInit = 0,
    tauGps = 60,
    gpsTimeMode = 'fc',
    fcQuatPriorHz = 1000,
    fcQuatSigmaInflate = 1.0,
    fcQuatDynWeightPerMps2 = 0,
    useAccelTilt = true,
    accelTiltGate = 5.0,
    fcQuatColoredNoise = false,
    fcQuatArCoeff = 0.9,
    useBaroFogm = false,
    tauBaro = 45,
    sigmaBaroBias = 2.0,
    baroDynPressureRegressorK = 0,
  } = opts;

  let { imu, gps, baro, quat, mag } = data;

  // ---- GPS position timing ----
  // Default: GPS position and velocity use the ingested FC (loop-iteration)
  // timestamps. Opt-in ('itow-rate-matched'): reconstruct each fix's timestamp
  // from the u-blox iTOW field via a rate+offset fit (rateMatchGpsTimestamps),
  // removing FC-side serial-transport jitter. A NAIVE version of this (raw
  // itow-to-FC-time offset, no rate correction) was tried previously and made
  // things worse -- see EstimatorOpts.gpsTimeMode's doc comment for why rate
  // matching (not just offset matching) is required.
  if (gpsTimeMode === 'itow-rate-matched') {
    gps = rateMatchGpsTimestamps(gps);
  }

  // Per-fix GPS position sigma from satellite count model (opt-in).
  // When enabled, GPS is trusted more tightly in good-sky conditions (~1.5m)
  // and loosened automatically when sats drop.
  const getGpsPosSigma = (numSat: number): number =>
    useGpsAccuracyScaling
      ? Math.max(gpsPosSigmaFloor, computeGpsNoise(numSat))
      : gpsPosSigma;
  if (!imu || imu.length === 0)
    return { smoothed: [], t0Us: 0, lat0: 0, lon0: 0, alt0: 0 };

  const { lat: lat0, lon: lon0, alt: alt0 } = origin;
  const t0Us = imu[0].tUs;

  // ---- Initial state from first GPS ----
  let p0: Vec3 = [0, 0, 0];
  let v0: Vec3 = [0, 0, 0];
  let q0: Quat = [1, 0, 0, 0];

  if (gps.length > 0) {
    const g0 = llhToNed(gps[0].lat, gps[0].lon, gps[0].alt ?? alt0, lat0, lon0, alt0);
    p0 = [g0.n, g0.e, g0.d];
    if (gps[0].velNed) v0 = [...gps[0].velNed] as Vec3;
    if (gps.length >= 2) {
      const dtS = (gps[1].tUs - gps[0].tUs) / 1e6;
      if (dtS > 0 && !gps[0].velNed) {
        const g1 = llhToNed(gps[1].lat, gps[1].lon, gps[1].alt ?? alt0, lat0, lon0, alt0);
        v0 = [
          (g1.n - g0.n) / dtS,
          (g1.e - g0.e) / dtS,
          (g1.d - g0.d) / dtS,
        ];
      }
    }
  }
  if (quat.length > 0) q0 = quat[0].q;

  let resolvedDelayMs = 0;
  if (typeof gpsDelayMs === 'number') {
    resolvedDelayMs = gpsDelayMs;
  } else if (gpsDelayMs === 'auto') {
    resolvedDelayMs = solveGpsLatency(data, origin, p0, v0, q0);
  }

  if (resolvedDelayMs > 0) {
    const delayUs = Math.round(resolvedDelayMs * 1000);
    gps = gps.map((entry) => ({ ...entry, tUs: entry.tUs - delayUs }));
  }

  // ---- Static-window bias initialization ----
  let bg0: Vec3 = [0, 0, 0];
  let _sigmaBgInit = sigmaBgInit;
  const staticWindowUs = 5e6;
  const staticImu = imu.filter((x) => x.tUs - imu[0].tUs <= staticWindowUs);
  if (staticImu.length > 100) {
    const sumG: Vec3 = [0, 0, 0];
    for (const x of staticImu) {
      sumG[0] += x.gyro[0];
      sumG[1] += x.gyro[1];
      sumG[2] += x.gyro[2];
    }
    const n = staticImu.length;
    bg0 = [sumG[0] / n, sumG[1] / n, sumG[2] / n];
    _sigmaBgInit = 0.01;
  }
  const ba0: Vec3 = [0, 0, 0];

  // Baro offset from first GPS altitude
  let baroOffset = 0;
  if (baro.length > 0 && gps.length > 0) {
    const baroAltAtGps0 = findBaroAtTime(baro, gps[0].tUs);
    if (baroAltAtGps0 !== null) {
      baroOffset = (gps[0].alt ?? alt0) - baroAltAtGps0;
    }
  }

  // ---- Build keyframe schedule ----
  const outputIntervalUs = 1e6 / outputHz;
  const kfTotal = Math.max(1, Math.ceil((imu[imu.length - 1].tUs - imu[0].tUs) / outputIntervalUs));

  const hasMag =
    magModel != null &&
    magModel.fusion?.earthFieldNedGauss != null &&
    mag != null &&
    mag.length > 0;
  const useMag = hasMag && magModel!.fusion?.qualityBounds?.bounds_ok !== false;
  let poses: SmoothedPose[] = [];

  const MIN_INFLIGHT_MAG_SIGMA = 0.02;
  let magSigmaXY = 0.05;
  let magSigmaZ = 0.05;
  const magFieldRefG =
    useMag && magModel!.fusion?.qualityBounds?.field_strength_mg != null
      ? magModel!.fusion!.qualityBounds!.field_strength_mg! / 1000
      : 0.539;

  if (useMag) {
    const mn = magModel!.fusion?.magNoiseGauss;
    magSigmaXY = mn?.sigma_xy != null ? mn.sigma_xy : (mn?.sigma ?? magSigma);
    magSigmaZ = mn?.sigma_z != null ? mn.sigma_z : magSigmaXY;
    if (magSigmaXY < MIN_INFLIGHT_MAG_SIGMA) magSigmaXY = MIN_INFLIGHT_MAG_SIGMA;
    if (magSigmaZ < MIN_INFLIGHT_MAG_SIGMA) magSigmaZ = MIN_INFLIGHT_MAG_SIGMA;
  }

  // ---- Find nearest current sample for mag disturbance gating ----
  const findCurrent = (tUs: number): number => {
    if (!current || !current.length) return 0;
    let best = current[0];
    let bestDt = Math.abs(current[0].tUs - tUs);
    for (let ci = 1; ci < current.length; ci++) {
      const dt = Math.abs(current[ci].tUs - tUs);
      if (dt < bestDt) {
        bestDt = dt;
        best = current[ci];
      }
    }
    return best.amps;
  };

  let lastEskf: EskfState | null = null;
  for (let iter = 0; iter < maxIter; iter++) {
    // Within-iteration decile tracker for progress cadence.
    // Emits ~10 events per forward pass across ~4500 keyframes, so the
    // progress bar advances roughly every 2 s instead of freezing for 20 s.
    let kfIndex = 0;
    let lastDecile = -1;

    const eskfOpts: EskfOptions = {
      p0,
      v0,
      q0,
      sigmaPos: 5,
      sigmaVel: 2,
      sigmaAtt: 0.2,
      ba0,
      bg0,
      sigmaBa: sigmaBaInit,
      sigmaBg: _sigmaBgInit,
      sigmaBaRW,
      sigmaBgRW,
      procSigmaAcc,
      procSigmaGyro,
      bgClamp: sigmaBgPrior > 0 ? sigmaBgPrior : 0,
    };
    if (sigmaGpsBiasInit > 0 && tauGps > 0) {
      eskfOpts.sigmaGpsBias = sigmaGpsBias;
      eskfOpts.sigmaGpsBiasInit = sigmaGpsBiasInit;
      eskfOpts.tauGps = tauGps;
    }
    if (useMag) {
      const me = magModel!.fusion!.earthFieldNedGauss!;
      eskfOpts.mEarth0 = [me.n, me.e, me.d];
      eskfOpts.mBody0 = [0, 0, 0];
    }
    const eskf: EskfState = createEskf(eskfOpts);
    const steps: Step[] = [];
    let gpsPosIdx = 0;
    let gpsVelIdx = 0;
    let baroIdx = 0;
    let quatIdx = 0;
    let magIdx = 0;
    let lastFcQuatFuseUs = -Infinity;
    let lastAccelNorm = GRAVITY_MPS2;
    let lastAccelZ_lpf1 = GRAVITY_MPS2;
    let lastAccelZ_lpf2 = GRAVITY_MPS2;
    let lastAccelAbsZLpf = GRAVITY_MPS2;
    let lastFcQuatRawResidual: Vec3 | null = null;
    let baroBiasState: BaroBiasFogmState = { bias: 0, variance: sigmaBaroBias * sigmaBaroBias };
    let lastBaroUpdateUs: number | null = null;

    let imuIdx = 0;
    let nextKfUs = imu[0].tUs + outputIntervalUs;
    let F_acc: Mat = buildIdentityF(eskf.dim);

    while (imuIdx < imu.length) {
      if (isNaN(eskf.p[0]) || isNaN(eskf.v[0]) || isNaN(eskf.P[0][0])) {
        console.error("NaN detected at IMU step start!", {
          p: eskf.p,
          v: eskf.v,
          q: eskf.q,
          bgps: eskf.bgps,
          P_diag: eskf.P.map((r, idx) => r[idx]),
        });
        throw new Error("NaN detected in estimator loop");
      }
      const nowUs = imu[imuIdx].tUs;
      // Low-pass filtered (not raw single-sample) accel norm/body-Z: raw IMU
      // samples carry frame vibration noise easily 1-3 m/s^2 even in calm
      // flight, which would otherwise make the dynamic-flight de-weight and
      // the baro propwash inflation below fire spuriously on every noisy
      // sample instead of tracking real maneuvering/thrust changes.
      {
        const instNorm = Math.hypot(
          imu[imuIdx].accel[0],
          imu[imuIdx].accel[1],
          imu[imuIdx].accel[2],
        );
        const instZ = imu[imuIdx].accel[2];
        const dtPrevS = imuIdx > 0 ? (imu[imuIdx].tUs - imu[imuIdx - 1].tUs) / 1e6 : 0;
        
        // Use a ~100ms 2-pole EMA for the baro dynamic pressure proxy.
        // This is 5x faster than the old 0.5s 1-pole filter, removing the punch-out delay.
        const tauAccelLpfS = 0.1;
        const alpha = dtPrevS > 0 ? dtPrevS / (tauAccelLpfS + dtPrevS) : 1.0;
        
        lastAccelNorm = lastAccelNorm + alpha * (instNorm - lastAccelNorm);
        
        // Crucial: Filter the SIGNED accel_z first to cancel out zero-mean motor vibration,
        // THEN take the absolute value. Rectifying (abs) before filtering turns high-frequency
        // vibration into a massive false DC altitude inflation.
        lastAccelZ_lpf1 = lastAccelZ_lpf1 + alpha * (instZ - lastAccelZ_lpf1);
        lastAccelZ_lpf2 = lastAccelZ_lpf2 + alpha * (lastAccelZ_lpf1 - lastAccelZ_lpf2);
        lastAccelAbsZLpf = Math.abs(lastAccelZ_lpf2);
      }

      const dtUs =
        imuIdx < imu.length - 1 ? imu[imuIdx + 1].tUs - imu[imuIdx].tUs : 0;
      let F_step: Mat | null = null;
      if (dtUs > 0) {
        const result = eskfPredict(eskf, imu[imuIdx].gyro, imu[imuIdx].accel, dtUs / 1e6);
        F_step = result.F;
      }

      if (F_step) {
        F_acc = matMulFn(F_step, F_acc);
      }

      // ---- Updates at keyframe boundary ----
      if (nowUs >= nextKfUs || imuIdx === imu.length - 1) {
        const xPred: StepState = {
          p: [...eskf.p] as Vec3,
          v: [...eskf.v] as Vec3,
          q: [...eskf.q] as Quat,
          ba: [...eskf.ba] as Vec3,
          bg: [...eskf.bg] as Vec3,
          bgps: eskf.bgps ? [...eskf.bgps] as Vec3 : undefined,
          tUs: nowUs,
        };
        if (useMag) {
          xPred.mEarth = eskf.mEarth ? ([...eskf.mEarth] as Vec3) : undefined;
          xPred.mBody = eskf.mBody ? ([...eskf.mBody] as Vec3) : undefined;
        }
        const PPred: Mat = eskf.P.map((r) => [...r]);

        let hasUpdate = false;

        const currAmps = current && current.length ? findCurrent(nowUs) : 0;

        // dcsPhi omitted: eskfUpdate defaults it to chi2_0.95(m) for the
        // measurement's own df (3 for GPS pos/vel), not a flat 1.0 -- the old
        // hardcoded 1.0 half-rejected (dcsScale=0.5) every perfectly healthy
        // 3-dof GPS fix, since E[mahal]=3 under normal operation (see
        // RobustOpts.dcsPhi's doc comment in eskf.ts). useVbAdaptiveR takes
        // priority over useDcs if both are set (see RobustOpts.vbAdaptive's
        // doc comment).
        const gpsRobustOpts: RobustOpts = useVbAdaptiveR
          ? { vbAdaptive: true, dcs: useDcs }
          : useDcs
            ? { dcs: true }
            : {};

        // ---- GPS position update (FC-timed) ----
        while (
          gpsPosIdx < gps.length &&
          gps[gpsPosIdx].tUs <= nextKfUs + outputIntervalUs * 0.5
        ) {
          const gpsF = gps[gpsPosIdx];
          const gNed = llhToNed(
            gpsF.lat,
            gpsF.lon,
            gpsF.alt ?? alt0,
            lat0,
            lon0,
            alt0,
          );
          const effectivePosSigma = getGpsPosSigma(gpsF.numSat);
          const idxGpsBias = eskf.dim === 18 ? 15 : (eskf.dim === 24 ? 21 : -1);
          const fP = createGpsPositionFactor(
            { n: gNed.n, e: gNed.e, d: gNed.d },
            effectivePosSigma,
            eskf.dim,
            idxGpsBias,
          );
          if (
            eskfUpdate(
              eskf,
              fP as any,
              { n: gNed.n, e: gNed.e, d: gNed.d },
              gpsPosGate,
              gpsRobustOpts,
              'gpsPos',
              gpsF.tUs,
            )
          )
            hasUpdate = true;

          gpsPosIdx++;
        }

        // ---- GPS velocity update (always FC-timed; Doppler is near-instant) ----
        while (
          gpsVelIdx < gps.length &&
          gps[gpsVelIdx].tUs <= nextKfUs + outputIntervalUs * 0.5
        ) {
          const gpsF = gps[gpsVelIdx];

          if (gpsF.velNed) {
            const fV = createGpsVelocityFactor(
              {
                n: gpsF.velNed[0],
                e: gpsF.velNed[1],
                d: gpsF.velNed[2],
              },
              gpsVelSigma,
            );
            if (
              eskfUpdate(
                eskf,
                fV as any,
                {
                  n: gpsF.velNed[0],
                  e: gpsF.velNed[1],
                  d: gpsF.velNed[2],
                },
                gpsVelGate,
                gpsRobustOpts,
                'gpsVel',
                gpsF.tUs,
              )
            )
              hasUpdate = true;
          }

          gpsVelIdx++;
        }

        // Baro update — only the LAST sample before this keyframe.
        // Dynamic baro R: inflates on high climb-rate and high propeller thrust
        // (propwash / dynamic-pressure spikes corrupt the barometer). Tight
        // σ=1.0–2.0 in steady level flight; widens to σ≈5–10 m during punch-outs
        // where pressure fluctuations dominate.
        {
          let lastBaro: BaroEntry | null = null;
          while (baroIdx < baro.length && baro[baroIdx].tUs <= nextKfUs) {
            lastBaro = baro[baroIdx];
            baroIdx++;
          }
          if (lastBaro) {
            // Climb rate from current ESKF state (NED D-axis; negative = climbing)
            const climbRateMs = Math.abs(eskf.v[2]);
            // Excess body-Z specific force, as a physics-informed proxy for
            // propeller thrust (and therefore downwash dynamic pressure):
            // thrust T ~ k*rpm^2, and in near-level flight a_z ~ T/mass, so the
            // body-Z accelerometer reading directly tracks thrust at IMU rate
            // (1kHz+) without battery-voltage-sag or ESC-telemetry-rate issues
            // that plague a current-draw (currAmps) proxy. Uses the LOW-PASS
            // FILTERED |accel_bodyZ| (see lastAccelAbsZLpf's assignment above),
            // not a raw single-sample reading which carries frame-vibration
            // noise. Subtracts a LOAD-FACTOR-correct baseline (g / cos(tilt),
            // not a flat 9.81) -- a banked, coordinated, level turn genuinely
            // needs thrust to scale as 1/cos(bank) to support weight against a
            // tilted lift vector (the standard aviation load-factor result), so
            // a flat-9.81 baseline would misread that expected, non-anomalous
            // thrust increase as propwash-inducing excess. currAmps is kept
            // ONLY for the magnetometer's electrical (Biot-Savart) compensation
            // below, not for this baro model.
            const R_estBaro = quatToRot(eskf.q);
            const baroInflate = computeBaroInflate(lastAccelAbsZLpf, R_estBaro[2][2], climbRateMs);
            const effectiveBaroSigma = baroSigma * Math.max(1.0, baroInflate);

            // Dynamic-pressure regressor correction (default coefficient 0 --
            // see EstimatorOpts.baroDynPressureRegressorK's doc comment for
            // why this isn't enabled by default). Reuses the same excess-
            // specific-force proxy as computeBaroInflate.
            let correctedAlt = lastBaro.alt;
            if (baroDynPressureRegressorK !== 0) {
              const cosTiltFloorLocal = 0.342;
              const cosTiltLocal = Math.max(cosTiltFloorLocal, Math.abs(R_estBaro[2][2]));
              const loadFactorBaselineLocal = GRAVITY_MPS2 / cosTiltLocal;
              const excessSpecificForce = Math.max(0, lastAccelAbsZLpf - loadFactorBaselineLocal);
              correctedAlt -= baroDynPressureRegressorK * excessSpecificForce;
            }

            // Baro bias FOGM tracker (opt-in, see updateBaroBiasFogm's doc
            // comment). Uses the SAME raw
            // innovation the main baro factor's residual computes internally
            // (createBaroFactor: h(x)=-p[2], residual=z-h(x)=z+p[2]).
            if (useBaroFogm) {
              const dtBaro = lastBaroUpdateUs !== null ? (lastBaro.tUs - lastBaroUpdateUs) / 1e6 : 0;
              lastBaroUpdateUs = lastBaro.tUs;
              if (dtBaro > 0) {
                const rawInnovation = correctedAlt + eskf.p[2];
                baroBiasState = updateBaroBiasFogm(
                  baroBiasState,
                  dtBaro,
                  tauBaro,
                  sigmaBaroBias,
                  rawInnovation,
                  effectiveBaroSigma * effectiveBaroSigma,
                );
              }
              correctedAlt -= baroBiasState.bias;
            }

            const fB = createBaroFactor(correctedAlt, baroOffset, effectiveBaroSigma);
            if (eskfUpdate(eskf, fB as any, correctedAlt, 3.0, {}, 'baro', lastBaro.tUs)) hasUpdate = true;
          }
        }

        // Quaternion prior — rate-limited to fcQuatPriorHz (default 1 Hz), not
        // every logged sample. The FC quaternion is Mahony/Madgwick output that
        // has already integrated the same raw gyro/accel the ESKF's own
        // prediction step consumes; fusing it unconditionally re-ingests the
        // same gyro information hundreds of times per second and collapses the
        // reported attitude covariance to well below its true uncertainty.
        // See EstimatorOpts.fcQuatPriorHz doc comment.
        // Adaptive sigma yaw: σ_yaw couples to yaw observability (|R[2][0]|)
        // and mag disturbance scale (|B| anomaly + motor current).

        // Pre-compute shared signals for mag disturbance and yaw observability
        let magDisturbScale = 1.0;
        let yawObsScale = 1.0;
        if (useMag) {
          const R_est = quatToRot(eskf.q);
          const col0zAbs = Math.abs(R_est[2][0]);

          yawObsScale =
            col0zAbs > 0.7
              ? 1.0 + Math.pow((col0zAbs - 0.7) / 0.3, 2) * 10.0
              : 1.0;

          let peekMag: MagGaussEntry | null = null;
          let peekMagIdx = magIdx;
          while (peekMagIdx < mag.length && mag[peekMagIdx].tUs <= nextKfUs) {
            peekMag = mag[peekMagIdx];
            peekMagIdx++;
          }
          if (peekMag) {
            const magMag = Math.hypot(
              peekMag.meas[0],
              peekMag.meas[1],
              peekMag.meas[2],
            );
            const bFrac = Math.abs(magMag - magFieldRefG) / magFieldRefG;
            const bScale =
              bFrac > 0.15 ? 1.0 + (bFrac - 0.15) * 20.0 : 1.0;
            const currScale =
              currAmps > 15.0
                ? 1.0 + Math.pow((currAmps - 15.0) / 15.0, 2) * 3.0
                : 1.0;
            magDisturbScale = Math.max(bScale, currScale);
          }
        }

        // Raw-mag heading-bias pre-rotation: when no model is loaded but an
        // in-flight hard-iron bias has been estimated, rotate every FC
        // quaternion by +bias about world-Z before the quaternion prior sees it.
        // bias = median(mag_heading − fc_heading), so adding it corrects the
        // FC heading toward the mag's estimate of true heading.
        const applyRawMagBias = !useMag && rawMagBiasRad !== 0;
        const qMagBiasCorr = applyRawMagBias
          ? quatFromAxisAngle([0, 0, 1] as Vec3, rawMagBiasRad)
          : null;

        const fcQuatMinIntervalUs = fcQuatPriorHz > 0 ? 1e6 / fcQuatPriorHz : 0;
        while (quatIdx < quat.length && quat[quatIdx].tUs <= nextKfUs) {
          const qSample = quat[quatIdx];
          if (fcQuatColoredNoise) {
            // Colored-noise (AR(1)-whitened) path. Fuses EVERY sample (no
            // rate limit) but whitens the residual
            // first so consecutive correlated samples don't double-count.
            // See createColoredQuaternionFactor's doc comment (measurements.ts).
            const adaptiveSigmaYaw = useMag
              ? computeAdaptiveSigmaYaw(eskf.q, magDisturbScale, sigmaYawMax)
              : sigmaYaw;
            const qMeas = applyRawMagBias
              ? quatMultiply(qMagBiasCorr!, qSample.q)
              : qSample.q;

            const rRaw = quaternionLogResidual(qMeas, eskf.q);
            const prev = lastFcQuatRawResidual ?? rRaw;
            const rWhite: Vec3 = [
              rRaw[0] - fcQuatArCoeff * prev[0],
              rRaw[1] - fcQuatArCoeff * prev[1],
              rRaw[2] - fcQuatArCoeff * prev[2],
            ];
            const whiteningFactor = Math.sqrt(1 - fcQuatArCoeff * fcQuatArCoeff);
            const sigmaTiltWhite = attSigma * whiteningFactor;
            const sigmaYawWhite = adaptiveSigmaYaw * whiteningFactor;

            const fQc = createColoredQuaternionFactor(qMeas, rWhite, sigmaTiltWhite, sigmaYawWhite);
            if (eskfUpdate(eskf, fQc as any, qMeas, Infinity))
              hasUpdate = true;
            lastFcQuatRawResidual = rRaw;
          } else if (qSample.tUs - lastFcQuatFuseUs >= fcQuatMinIntervalUs) {
            const adaptiveSigmaYaw = useMag
              ? computeAdaptiveSigmaYaw(eskf.q, magDisturbScale, sigmaYawMax)
              : sigmaYaw;

            const qMeas = applyRawMagBias
              ? quatMultiply(qMagBiasCorr!, qSample.q)
              : qSample.q;

            // Dynamic-flight de-weight (see fcQuatDynWeightPerMps2's doc
            // comment): DISABLED by default (coefficient 0) after real-data
            // testing on an aggressive acro flight (backflips) showed
            // de-weighting the sole attitude anchor during high-dynamics
            // moments causes catastrophic divergence, not the intended
            // robustness. The rate-limit (fcQuatPriorHz, see its doc comment
            // for the full real-data story across both gentle survey and
            // aggressive acro flights) is the only piece of this decorrelation
            // enabled by default; sigma inflation and dyn-weight remain as
            // opt-in knobs, capped here for safety if a caller does enable them.
            const dynFactor = Math.min(
              2.0,
              1.0 + fcQuatDynWeightPerMps2 * Math.max(0, Math.abs(lastAccelNorm - GRAVITY_MPS2)),
            );
            const effAttSigma = attSigma * fcQuatSigmaInflate * dynFactor;
            // Yaw does NOT get the fixed fcQuatSigmaInflate multiplier: unlike
            // attSigma (0.02 rad, extremely tight -- the primary driver of the
            // measured 30-40x roll/pitch over-confidence), sigmaYaw is already
            // an order of magnitude looser (0.15 rad) and was never the
            // over-confident axis. Only the physically-motivated dynamic-flight
            // de-weight applies, capped tighter (1.3x) than roll/pitch's since
            // yaw has no other anchor when mag is off.
            const effSigmaYaw = adaptiveSigmaYaw * Math.min(1.3, dynFactor);

            const fQ = createQuaternionPrior(
              qMeas,
              effAttSigma,
              effSigmaYaw,
            );
            if (eskfUpdate(eskf, fQ as any, qMeas, Infinity))
              hasUpdate = true;
            lastFcQuatFuseUs = qSample.tUs;
          }
          quatIdx++;
        }

        // Independent accelerometer-tilt update — 1 per keyframe. Unlike the
        // FC-quat prior above, this is a FRESH measurement of the current
        // specific-force vector each time, not derived from the FC's own
        // gyro-integrated Mahony state, so it does not contribute to the
        // double-counting defect and can safely run every keyframe. See
        // createAccelTiltFactor's doc comment (measurements.ts).
        if (useAccelTilt) {
          const accelBodyNow = imu[imuIdx].accel;
          const gyroBodyNow = imu[imuIdx].gyro;
          
          // Kinematic correction: isolate gravity by subtracting centripetal acceleration (ω × v_body)
          const R = quatToRotMat(eskf.q);
          const vBx = R[0]*eskf.v[0] + R[3]*eskf.v[1] + R[6]*eskf.v[2];
          const vBy = R[1]*eskf.v[0] + R[4]*eskf.v[1] + R[7]*eskf.v[2];
          const vBz = R[2]*eskf.v[0] + R[5]*eskf.v[1] + R[8]*eskf.v[2];

          const akinX = gyroBodyNow[1]*vBz - gyroBodyNow[2]*vBy;
          const akinY = gyroBodyNow[2]*vBx - gyroBodyNow[0]*vBz;
          const akinZ = gyroBodyNow[0]*vBy - gyroBodyNow[1]*vBx;

          const aGravityBody: Vec3 = [
            accelBodyNow[0] - akinX,
            accelBodyNow[1] - akinY,
            accelBodyNow[2] - akinZ
          ];

          const sigmaTiltNow = computeAdaptiveSigmaTilt(accelBodyNow, gyroBodyNow, eskf.v, eskf.q);
          
          // Pass the corrected gravity vector and state dimension to the new rank-2 measurement
          const fAccelTilt = createAccelTiltFactor(aGravityBody, eskf.q, sigmaTiltNow, eskf.dim);
          
          // The measurement `z` is now the normalized gravity vector, which the factor computes internally 
          // but eskfUpdate expects the `z` parameter to match the factor's residual(z) argument.
          const aNorm = Math.hypot(aGravityBody[0], aGravityBody[1], aGravityBody[2]);
          const zTilt: Vec3 = aNorm > 1e-6
            ? [aGravityBody[0] / aNorm, aGravityBody[1] / aNorm, aGravityBody[2] / aNorm]
            : [0, 0, 1];

          if (eskfUpdate(eskf, fAccelTilt as any, zTilt, accelTiltGate, {}, 'accelTilt', nowUs))
            hasUpdate = true;
        }

        // 3-axis mag update — 1 per keyframe (prevents over-counting)
        if (useMag) {
          let lastMag: MagGaussEntry | null = null;
          while (magIdx < mag.length && mag[magIdx].tUs <= nextKfUs) {
            lastMag = mag[magIdx];
            magIdx++;
          }
          if (lastMag) {
            const magRDisturbScale = magDisturbScale * yawObsScale;
            const effectiveSigmaXY = magSigmaXY * magRDisturbScale;
            const effectiveSigmaZ = magSigmaZ * magRDisturbScale;

            const fM = createMagFactor(
              lastMag.meas,
              effectiveSigmaXY,
              effectiveSigmaZ,
              currAmps,
            );
            if (eskfUpdate(eskf, fM as any, lastMag.meas, magGate, {}, 'mag', lastMag.tUs))
              hasUpdate = true;
          }

          if (hasUpdate && magModel!.fusion?.earthFieldNedGauss) {
            const me = eskf.mEarth;
            if (me) {
              const decl = Math.atan2(
                magModel!.fusion!.earthFieldNedGauss!.e,
                magModel!.fusion!.earthFieldNedGauss!.n,
              );
              const fD = createDeclinationFactor(decl, declSigma);
              eskfUpdate(eskf, fD as any, decl, 3.0, {}, 'decl', nextKfUs);
            }
          }
        }

        const F_for_rts: Mat = F_acc.map((r) => [...r]);

        steps.push({
          x: {
            p: [...eskf.p] as Vec3,
            v: [...eskf.v] as Vec3,
            q: [...eskf.q] as Quat,
            ba: [...eskf.ba] as Vec3,
            bg: [...eskf.bg] as Vec3,
            bgps: eskf.bgps ? [...eskf.bgps] as Vec3 : undefined,
            tUs: nowUs,
            ...(useMag
              ? {
                  mEarth: eskf.mEarth
                    ? ([...eskf.mEarth] as Vec3)
                    : undefined,
                  mBody: eskf.mBody ? ([...eskf.mBody] as Vec3) : undefined,
                }
              : {}),
          },
          P: eskf.P.map((r) => [...r]),
          xPred: {
            p: [...xPred.p] as Vec3,
            v: [...xPred.v] as Vec3,
            q: [...xPred.q] as Quat,
            ba: [...xPred.ba] as Vec3,
            bg: [...xPred.bg] as Vec3,
            bgps: xPred.bgps ? [...xPred.bgps] as Vec3 : undefined,
            tUs: xPred.tUs,
            ...(useMag
              ? {
                  mEarth: xPred.mEarth
                    ? ([...xPred.mEarth] as Vec3)
                    : undefined,
                  mBody: xPred.mBody
                    ? ([...xPred.mBody] as Vec3)
                    : undefined,
                }
              : {}),
          },
          PPred,
          F: F_for_rts,
          hasUpdate,
        });

        // Emit progress whenever the keyframe decile changes.
        // Cap at 9 so the smooth event at (iter + 0.95)/maxIter is always
        // strictly after the last forward decile and before the next iteration.
        const decile = Math.min(9, Math.floor((kfIndex / kfTotal) * 10));
        if (onProgress && decile > lastDecile) {
          lastDecile = decile;
          onProgress({
            phase: 'forward',
            iteration: iter,
            totalIterations: maxIter,
            fraction: (iter + decile / 10) / maxIter,
            detail: `Reconstructing flight path — pass ${iter + 1} of ${maxIter} (${decile * 10}%)`,
          });
        }
        kfIndex++;

        F_acc = buildIdentityF(eskf.dim);
        nextKfUs += outputIntervalUs;
      }

      imuIdx++;
    }

    // ---- RTS backward smooth ----
    if (onProgress) {
      onProgress({
        phase: 'smooth',
        iteration: iter,
        totalIterations: maxIter,
        fraction: (iter + 0.95) / maxIter,
        detail: `Smoothing pass ${iter + 1} of ${maxIter}…`,
      });
    }

    const filterResults: FilterResult[] = steps.map((s) => ({
      x: s.x as RtsNominalState,
      P: s.P,
      xPred: s.xPred as RtsNominalState,
      PPred: s.PPred,
    }));
    const Fmatrices: (Mat | null)[] = steps.slice(1).map((s) => s.F);
    const smoothed: SmoothedResult[] = rtsSmooth(filterResults, Fmatrices);

    // ---- Convert to output ----
    poses = smoothed.map((s) => ({
      tUs: s.x.tUs!,
      p: [...s.x.p] as Vec3,
      v: [...s.x.v] as Vec3,
      q: [...s.x.q] as Quat,
      ba: s.x.ba ? ([...s.x.ba] as Vec3) : undefined,
      bg: s.x.bg ? ([...s.x.bg] as Vec3) : undefined,
      P: s.P.map((r) => [...r]),
      mEarth: s.x.mEarth ? ([...s.x.mEarth] as Vec3) : undefined,
      mBody: s.x.mBody ? ([...s.x.mBody] as Vec3) : undefined,
    }));

    // Re-seed for next iteration
    if (poses.length > 0 && iter < maxIter - 1) {
      const first = smoothed[0];
      p0 = first.x.p;
      v0 = first.x.v;
      q0 = first.x.q;
    }
    lastEskf = eskf;
  }

  if (onProgress) {
    onProgress({
      phase: 'done',
      iteration: maxIter,
      totalIterations: maxIter,
      fraction: 1.0,
      detail: 'Flight path reconstructed',
    });
  }

  return { smoothed: poses, t0Us, lat0, lon0, alt0, nisHistory: lastEskf?.nisHistory, resolvedGpsDelayMs: resolvedDelayMs };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function estimatePoseTrack(
  data: EstimatorData,
  origin: EstimatorOrigin,
  opts: EstimatorOpts = {},
): PoseTrack {
  return estimatePoseTrackWithDiagnostics(data, origin, opts).track;
}

/**
 * Same as estimatePoseTrack, but also returns the per-sensor NIS (Normalized
 * Innovation Squared) history from the final Gauss-Newton iteration. Used by
 * NIS-consistency-based noise-parameter tuning (see tools/tune_eskf_nis).
 * Not attached to the PoseTrack itself so KML/GPX/CSV/JSON consumers of
 * estimatePoseTrack are unaffected.
 */
export function estimatePoseTrackWithDiagnostics(
  data: EstimatorData,
  origin: EstimatorOrigin,
  opts: EstimatorOpts = {},
): {
  track: PoseTrack;
  nisHistory?: Record<string, { tUs: number; nis: number; df: number; logDetS: number }[]>;
  resolvedGpsDelayMs?: number;
} {
  const { smoothed, lat0, lon0, alt0, nisHistory, resolvedGpsDelayMs } = _runEstimation(data, origin, opts);

  const trackSamples: PoseSampleInternal[] = smoothed.map((s) => {
    const lla = nedToLlh({ n: s.p[0], e: s.p[1], d: s.p[2] }, lat0, lon0, alt0);

    // Position/velocity/attitude covariance are extracted from the 15x15 error-state covariance P.
    const covPos: Mat = [
      s.P[0].slice(0, 3),
      s.P[1].slice(0, 3),
      s.P[2].slice(0, 3),
    ];

    const covVel: Mat = [
      s.P[3].slice(3, 6),
      s.P[4].slice(3, 6),
      s.P[5].slice(3, 6),
    ];

    const covAtt: Mat = [
      s.P[6].slice(6, 9),
      s.P[7].slice(6, 9),
      s.P[8].slice(6, 9),
    ];

    const euler = eulerFromQuat(s.q);

    return {
      tUs: s.tUs,
      p: s.p,
      v: s.v,
      q: s.q,
      lla,
      covPos,
      covVel,
      covAtt,
      euler,
    };
  });

  const estimatedParams = computeConvergedParams(smoothed);

  const track: PoseTrack = createPoseTrack({
    samples: trackSamples,
    georefOrigin: { lat: origin.lat, lon: origin.lon, alt: origin.alt },
    source: {
      log: 'Betaflight BBL',
      magModelSchema: opts.magModel
        ? String(opts.magModel.version || '2.x')
        : 'none',
      solverConfig: {
        outputHz: opts.outputHz || 20,
        gpsPosSigma: opts.gpsPosSigma || 2.5,
        gpsVelSigma: opts.gpsVelSigma || 0.95,
        gpsDelayMs: opts.gpsDelayMs || 0,
        gpsPosSigmaFloor: opts.gpsPosSigmaFloor ?? 1.0,
        baroSigma: opts.baroSigma || 2.5,
        attSigma: opts.attSigma || 0.1,
        useMag: !!(
          opts.magModel && opts.magModel.fusion?.earthFieldNedGauss
        ),
      },
      estimatedParams,
    },
  });
  return { track, nisHistory, resolvedGpsDelayMs };
}

// ---------------------------------------------------------------------------
// Converged nuisance parameters
// ---------------------------------------------------------------------------

function computeConvergedParams(smoothed: SmoothedPose[]): ConvergedParams {
  const n = smoothed.length;
  if (n === 0) return {};
  const start = Math.floor(n * 0.75);
  const tail = smoothed.slice(start);
  const out: ConvergedParams = {};
  if (tail[0].ba) {
    const acc: Vec3 = [0, 0, 0];
    for (const s of tail)
      for (let i = 0; i < 3; i++) acc[i] += s.ba![i];
    out.ba = acc.map((x) => x / tail.length) as Vec3;
  }
  if (tail[0].bg) {
    const acc: Vec3 = [0, 0, 0];
    for (const s of tail)
      for (let i = 0; i < 3; i++) acc[i] += s.bg![i];
    out.bg = acc.map((x) => x / tail.length) as Vec3;
  }
  if (tail[0].mEarth) {
    const acc: Vec3 = [0, 0, 0];
    for (const s of tail)
      for (let i = 0; i < 3; i++) acc[i] += s.mEarth![i];
    out.mEarth = acc.map((x) => x / tail.length) as Vec3;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildIdentityF(n: number): Mat {
  const F = new Array<number[]>(n);
  for (let i = 0; i < n; i++) {
    F[i] = new Array<number>(n).fill(0);
    F[i][i] = 1;
  }
  return F;
}

function matMulFn(A: Mat, B: Mat): Mat {
  const n = A.length;
  const C = new Array<number[]>(n);
  for (let i = 0; i < n; i++) {
    C[i] = new Array<number>(n).fill(0);
    for (let k = 0; k < n; k++) {
      const aik = A[i][k];
      if (aik === 0) continue;
      for (let j = 0; j < n; j++) C[i][j] += aik * B[k][j];
    }
  }
  return C;
}

function findBaroAtTime(baro: BaroEntry[], tUs: number): number | null {
  if (baro.length === 0) return null;
  let best = baro[0];
  let bestDt = Math.abs(baro[0].tUs - tUs);
  for (let i = 1; i < baro.length; i++) {
    const dt = Math.abs(baro[i].tUs - tUs);
    if (dt < bestDt) {
      bestDt = dt;
      best = baro[i];
    }
  }
  return best.alt;
}
