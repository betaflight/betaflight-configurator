import { describe, it, expect } from 'vitest';
import {
  evaluateCandidate,
  tuneByNisConsistency,
  summarizeNis,
  findRegressedSensors,
} from './tuneEskfNis.js';
import type { TuneResult } from './tuneEskfNis.js';
import { generateStraightTrajectory, generateSensorStreams, createRng } from './synthetic.js';
import type { EstimatorData, EstimatorOrigin } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';

const ORIGIN: EstimatorOrigin = { lat: 48.408, lon: -71.164, alt: 200 };

function buildFlight() {
  const traj = generateStraightTrajectory({ durationS: 30, speedMs: 8, headingDeg: 30, freqHz: 200 });
  const rng = createRng(9001);
  const streams = generateSensorStreams(traj, {
    rng,
    gyroNoiseStd: 0.003,
    accelNoiseStd: 0.05,
    origin: ORIGIN,
  });
  const data = { ...streams } as unknown as EstimatorData;
  return { data, traj };
}

describe('summarizeNis', () => {
  it('returns empty array when no history is present', () => {
    expect(summarizeNis(undefined)).toEqual([]);
  });

  it('computes mean(NIS/df) and its log-deviation per sensor', () => {
    const summary = summarizeNis({
      gpsPos: [
        { tUs: 0, nis: 3, df: 3, logDetS: 1.0 },
        { tUs: 1, nis: 6, df: 3, logDetS: 2.0 },
      ],
    });
    expect(summary).toHaveLength(1);
    expect(summary[0].sensor).toBe('gpsPos');
    expect(summary[0].n).toBe(2);
    // mean(nis/df) = mean(1, 2) = 1.5
    expect(summary[0].meanNisPerDf).toBeCloseTo(1.5, 6);
    expect(summary[0].logDeviation).toBeCloseTo(Math.log(1.5), 6);
    // negTwoLogLik = sum(logDetS + nis + df*log(2pi)) over both entries
    const expected = (1.0 + 3 + 3 * Math.log(2 * Math.PI)) + (2.0 + 6 + 3 * Math.log(2 * Math.PI));
    expect(summary[0].negTwoLogLik).toBeCloseTo(expected, 6);
  });
});

describe('evaluateCandidate', () => {
  it('produces a finite objective and per-sensor NIS summaries for a synthetic flight', () => {
    const { data } = buildFlight();
    const result = evaluateCandidate(
      data,
      ORIGIN,
      { gpsPosSigma: 2.5, gpsVelSigma: 0.5, baroSigma: 2.0 },
      { outputHz: 20, maxIter: 1 },
    );
    expect(Number.isFinite(result.objective)).toBe(true);
    expect(result.perSensor.length).toBeGreaterThan(0);
    const gpsPos = result.perSensor.find((s) => s.sensor === 'gpsPos');
    expect(gpsPos).toBeDefined();
    expect(gpsPos!.n).toBeGreaterThan(0);
  });
});

describe('tuneByNisConsistency', () => {
  it('does not collapse gpsPosSigma toward the sigma=0 degeneracy from a pathologically-tight start', () => {
    const { data } = buildFlight();
    // Deliberately mis-tuned: gpsPosSigma far too tight for this synthetic
    // flight's actual GPS noise (0.3 m std baked in by generateSensorStreams),
    // which should show up as an inconsistent (non-unity) NIS ratio.
    //
    // Without the empirical-Bayes prior (priorWeight below), an UNCONSTRAINED
    // innovation log-likelihood objective drives gpsPosSigma to collapse
    // *further* toward 0 from this already-too-tight start: trusting GPS
    // completely makes the filter copy it, driving the apparent residual
    // toward 0 too, so log det S -> -infinity dominates the bounded NIS term
    // and the objective "improves" without limit (confirmed empirically
    // during development: with priorWeight=0 the search ran all the way to
    // the grid floor, 0.05 -> 0.0125, a 4x further collapse). The n-scaled
    // prior in priorPenalty() exists specifically to rule this out — the
    // property under test is "does not collapse further", not "must fully
    // self-correct toward the true 0.3 in one pass", which isn't guaranteed
    // by a single coordinate-descent pass against a strong degeneracy.
    const initial = { gpsPosSigma: 0.05, gpsVelSigma: 0.5, baroSigma: 2.0 };
    const { best, history } = tuneByNisConsistency(data, ORIGIN, initial, {
      baseOpts: { outputHz: 20, maxIter: 1 },
      sweeps: 2,
      priorWeight: 50,
    });

    const initialResult = history[0];
    expect(initialResult.candidate).toEqual(initial);
    // Coordinate descent must never regress relative to its own starting point.
    expect(best.objective).toBeLessThanOrEqual(initialResult.objective);
    // Must not collapse further toward the sigma=0 degeneracy.
    expect(best.candidate.gpsPosSigma).toBeGreaterThanOrEqual(initial.gpsPosSigma);
  });
});

describe('findRegressedSensors', () => {
  it('returns empty when every sensor moves closer to (or stays at) consistency', () => {
    const initial: TuneResult = {
      candidate: { gpsPosSigma: 4.5, gpsVelSigma: 0.6, baroSigma: 2.5 },
      objective: 0,
      perSensor: [
        { sensor: 'gpsPos', n: 100, meanNisPerDf: 0.5, logDeviation: Math.log(0.5), negTwoLogLik: 0 },
        { sensor: 'gpsVel', n: 100, meanNisPerDf: 2.0, logDeviation: Math.log(2.0), negTwoLogLik: 0 },
      ],
    };
    const final: TuneResult = {
      candidate: { gpsPosSigma: 3.0, gpsVelSigma: 0.6, baroSigma: 2.5 },
      objective: 0,
      perSensor: [
        { sensor: 'gpsPos', n: 100, meanNisPerDf: 0.9, logDeviation: Math.log(0.9), negTwoLogLik: 0 },
        { sensor: 'gpsVel', n: 100, meanNisPerDf: 1.2, logDeviation: Math.log(1.2), negTwoLogLik: 0 },
      ],
    };
    expect(findRegressedSensors(initial, final)).toEqual([]);
  });

  it('flags a sensor whose own consistency got worse even though the joint objective improved', () => {
    // Reproduces the real anomaly found during development: gpsVelSigma tuned
    // from 0.6 (NIS ~1) down to 0.345 (NIS ~9.25) while gpsPos/baro improved
    // enough that the summed objective still looked better overall.
    const initial: TuneResult = {
      candidate: { gpsPosSigma: 4.5, gpsVelSigma: 0.6, baroSigma: 2.5 },
      objective: 10,
      perSensor: [
        { sensor: 'gpsPos', n: 100, meanNisPerDf: 0.5, logDeviation: Math.log(0.5), negTwoLogLik: 0 },
        { sensor: 'gpsVel', n: 100, meanNisPerDf: 1.02, logDeviation: Math.log(1.02), negTwoLogLik: 0 },
        { sensor: 'baro', n: 100, meanNisPerDf: 0.4, logDeviation: Math.log(0.4), negTwoLogLik: 0 },
      ],
    };
    const final: TuneResult = {
      candidate: { gpsPosSigma: 3.31, gpsVelSigma: 0.345, baroSigma: 0.625 },
      objective: 1, // lower/better sum, despite gpsVel individually regressing
      perSensor: [
        { sensor: 'gpsPos', n: 100, meanNisPerDf: 0.775, logDeviation: Math.log(0.775), negTwoLogLik: 0 },
        { sensor: 'gpsVel', n: 100, meanNisPerDf: 9.253, logDeviation: Math.log(9.253), negTwoLogLik: 0 },
        { sensor: 'baro', n: 100, meanNisPerDf: 1.127, logDeviation: Math.log(1.127), negTwoLogLik: 0 },
      ],
    };
    const regressed = findRegressedSensors(initial, final);
    expect(regressed).toHaveLength(1);
    expect(regressed[0].sensor).toBe('gpsVel');
    expect(regressed[0].finalMeanNisPerDf).toBeCloseTo(9.253, 3);
  });
});
