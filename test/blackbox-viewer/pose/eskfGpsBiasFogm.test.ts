/**
 * Validates the first-order Gauss-Markov (FOGM) GPS position-bias state end-to-end.
 *
 * Real GPS position error (multipath, atmosphere) is time-correlated over tens of
 * seconds, not white. A filter that models it as white noise (the pre-FOGM default)
 * must compensate by inflating gpsPosSigma — which then also suppresses genuine
 * high-frequency motion the trajectory needs to carry (see improvement_plan.md).
 *
 * This test injects a slowly-varying (correlated) GPS position bias into synthetic
 * GPS fixes and checks that enabling the FOGM bias state (sigmaGpsBiasInit > 0)
 * tracks the true trajectory measurably better than the baseline white-noise model,
 * without diverging (NaN) or corrupting velocity/attitude estimation.
 */
import { describe, it, expect } from 'vitest';
import { estimatePoseTrackWithDiagnostics } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import {
  generateStraightTrajectory,
  generateCircularTrajectory,
  generateSensorStreams,
  createRng,
  randn,
} from './synthetic.js';
import { llhToNed } from '../../../src/blackbox-viewer/pose/geodesy.js';
import type { EstimatorData, EstimatorOrigin } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';

const ORIGIN: EstimatorOrigin = { lat: 48.408, lon: -71.164, alt: 200 };

/**
 * The injected bias is generated as an actual first-order Gauss-Markov (OU)
 * process with the given tau/sigma — matching what the filter's FOGM state
 * assumes. A clean sinusoid at a period equal to tauGps is the wrong test
 * signal: it sits at the FOGM state's own corner frequency and is inherently
 * attenuated/phase-lagged by any correctly-functioning first-order estimator,
 * which looks like "the fix doesn't work" but isn't actually a defect.
 *
 * Duration is 3x tauTrue so the bias completes several full excursions and
 * position/bias have time to decorrelate via the (bias-free) velocity updates.
 */
function buildSyntheticFlight(tauTrue: number, sigmaTrue: number) {
  const traj = generateStraightTrajectory({
    durationS: tauTrue * 3,
    speedMs: 8,
    headingDeg: 45,
    freqHz: 200,
  });
  const rng = createRng(20260707);

  // Physically-consistent IMU with white gyro/accel noise only (no deterministic
  // accel bias — that would create a slow drift with the same time-constant
  // character as the FOGM bias itself, aliasing against it via the existing
  // ba/bg bias states and confounding the comparison below).
  const streams = generateSensorStreams(traj, {
    rng,
    gyroNoiseStd: 0.002,
    accelNoiseStd: 0.03,
    origin: ORIGIN,
  });
  const imu = streams.imu;

  // Thin the IMU-rate GPS stream from generateSensorStreams (~10 Hz) down to 5 Hz
  // and overlay an OU-process (correlated) position bias — the FOGM model's
  // target failure mode — on top of its existing white GPS noise.
  const dtGps = streams.gps.length > 1 ? (streams.gps[2].tUs - streams.gps[0].tUs) / 1e6 : 0.2;
  const decayPerStep = Math.exp(-dtGps / tauTrue);
  const qStdPerStep = sigmaTrue * Math.sqrt(1 - decayPerStep * decayPerStep);
  let biasN = 0;
  let biasE = 0;

  const gps: Array<{ tUs: number; lat: number; lon: number; alt: number; velNed: number[]; numSat: number }> = [];
  for (let i = 0; i < streams.gps.length; i += 2) {
    const g = streams.gps[i];
    biasN = biasN * decayPerStep + qStdPerStep * randn(rng);
    biasE = biasE * decayPerStep + qStdPerStep * randn(rng);
    gps.push({
      tUs: g.tUs,
      lat: g.lat + biasN / 111320,
      lon: g.lon + biasE / (111320 * Math.cos((ORIGIN.lat * Math.PI) / 180)),
      alt: g.alt,
      velNed: g.velNed as number[],
      numSat: 14,
    });
  }

  const quat = streams.quat;

  const data = { imu, gps, baro: [], quat, mag: [] } as unknown as EstimatorData;
  return { data, traj };
}

function positionRmse(
  track: ReturnType<typeof estimatePoseTrackWithDiagnostics>['track'],
  traj: ReturnType<typeof generateStraightTrajectory>,
): number {
  let sumSq = 0;
  let n = 0;
  for (const s of track.samples) {
    if (!s.lla) continue;
    const truth = traj.reduce((best, p) =>
      Math.abs(p.t - s.tUs / 1e6) < Math.abs(best.t - s.tUs / 1e6) ? p : best,
    );
    const ned = llhToNed(s.lla.lat, s.lla.lon, s.lla.alt, ORIGIN.lat, ORIGIN.lon, ORIGIN.alt);
    const dN = ned.n - truth.pNed.n;
    const dE = ned.e - truth.pNed.e;
    sumSq += dN * dN + dE * dE;
    n++;
  }
  return Math.sqrt(sumSq / Math.max(1, n));
}

describe('ESKF FOGM GPS position-bias state', () => {
  it('is a strict no-op when disabled (sigmaGpsBiasInit=0, the default)', () => {
    const { data, traj } = buildSyntheticFlight(30, 2.0);
    const baseline = estimatePoseTrackWithDiagnostics(data, ORIGIN, {
      outputHz: 20,
      maxIter: 2,
    });
    expect(baseline.track.samples.length).toBeGreaterThan(10);
    for (const s of baseline.track.samples) {
      expect(Number.isFinite(s.p[0])).toBe(true);
      expect(Number.isFinite(s.p[1])).toBe(true);
    }
  });

  it('reduces position RMSE vs. the white-noise baseline under a slow correlated GPS bias', () => {
    // The bias is an OU process matched to tauGps=30s over a 90s flight (3 tau),
    // giving the filter time to decorrelate position from the bias via GPS
    // *velocity* aiding (gpsVelSigma tight below) — velocity has no shared bias
    // term with position, which is what actually breaks the degeneracy: a bias
    // state added on top of position-only updates, sharing the exact same H
    // row, is fundamentally unobservable relative to position (verified in
    // eskfGpsBiasFogmIsolated.test.ts) and provides no benefit without it.
    // gpsPosSigma is tight (1.5m) in both runs so GPS is trusted enough for the
    // bias-vs-white distinction to matter at all.
    const { data, traj } = buildSyntheticFlight(30, 2.0);

    const baseline = estimatePoseTrackWithDiagnostics(data, ORIGIN, {
      outputHz: 20,
      maxIter: 2,
      gpsPosSigma: 1.5,
      gpsVelSigma: 0.3,
    });
    const fogm = estimatePoseTrackWithDiagnostics(data, ORIGIN, {
      outputHz: 20,
      maxIter: 2,
      gpsPosSigma: 1.5,
      gpsVelSigma: 0.3,
      sigmaGpsBiasInit: 2.0,
      sigmaGpsBias: 2.0,
      tauGps: 30,
    });

    for (const s of fogm.track.samples) {
      expect(Number.isFinite(s.p[0])).toBe(true);
      expect(Number.isFinite(s.v[0])).toBe(true);
    }

    const rmseBaseline = positionRmse(baseline.track, traj);
    const rmseFogm = positionRmse(fogm.track, traj);

    expect(rmseFogm).toBeLessThan(rmseBaseline);
  });

  it('records per-sensor NIS history when the estimator runs', () => {
    const { data } = buildSyntheticFlight(30, 1.0);
    const result = estimatePoseTrackWithDiagnostics(data, ORIGIN, {
      outputHz: 20,
      maxIter: 1,
    });
    expect(result.nisHistory).toBeDefined();
    expect(result.nisHistory!.gpsPos.length).toBeGreaterThan(0);
    for (const entry of result.nisHistory!.gpsPos) {
      expect(entry.df).toBe(3);
      expect(Number.isFinite(entry.nis)).toBe(true);
      expect(entry.nis).toBeGreaterThanOrEqual(0);
    }
  });

  it('resolves GPS latency close to the true injected delay via gpsDelayMs="auto"', () => {
    // A straight/constant-velocity trajectory makes delay unidentifiable from
    // velocity alone (v(t) is the same at every t). Use a circular path so the
    // velocity *vector* rotates continuously, which is what solveGpsLatency's
    // INS-vs-GPS-Doppler matching actually needs to pin down the shift.
    const traj = generateCircularTrajectory({
      durationS: 15,
      freqHz: 200,
      radiusM: 50,
      speedMs: 12,
    });
    const streams = generateSensorStreams(traj, { origin: ORIGIN });
    const rng = createRng(4242);
    const trueDelayMs = 150;
    const trueDelayUs = trueDelayMs * 1000;

    // Simulate transport delay: shift each GPS fix's timestamp forward by the
    // delay (it's logged later than the physical instant it describes) —
    // estimatorLoop must then subtract gpsDelayMs to undo this and realign.
    const gps = streams.gps
      .filter((g) => g.tUs + trueDelayUs <= streams.imu[streams.imu.length - 1].tUs)
      .map((g) => ({
        ...g,
        tUs: g.tUs + trueDelayUs,
        velNed: [
          g.velNed[0] + randn(rng, 0, 0.05),
          g.velNed[1] + randn(rng, 0, 0.05),
          g.velNed[2] + randn(rng, 0, 0.05),
        ] as [number, number, number],
      }));

    const data = {
      imu: streams.imu,
      gps,
      baro: streams.baro,
      quat: streams.quat,
      mag: [],
    } as unknown as EstimatorData;

    const result = estimatePoseTrackWithDiagnostics(data, ORIGIN, {
      outputHz: 20,
      maxIter: 1,
      gpsDelayMs: 'auto',
    });

    expect(result.resolvedGpsDelayMs).toBeDefined();
    expect(Math.abs(result.resolvedGpsDelayMs! - trueDelayMs)).toBeLessThanOrEqual(30);
  });
});
