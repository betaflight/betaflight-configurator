/**
 * Isolated forward-only ESKF regression test for the FOGM GPS position-bias
 * state, bypassing the RTS smoother and outer Gauss-Newton iterations.
 *
 * Key finding (kept as a permanent regression guard): a GPS position-bias
 * state sharing the exact same H row as position is fundamentally
 * unobservable relative to position when driven by position-only updates —
 * position has no decay (F=I, unconstrained integrator) while the bias
 * mean-reverts (F=exp(-dt/tau) < 1), so over many update cycles nearly all
 * persistent/slowly-varying signal gets attributed to position by default,
 * regardless of tau or process-noise tuning. This is not a bug in the
 * predict/update math (verified directly here) — it's a structural
 * observability gap. GPS *velocity* aiding breaks the degeneracy because
 * velocity carries no shared bias term, giving the filter an independent
 * constraint that pins position and forces the bias channel to actually
 * absorb the correlated residual.
 */
import { describe, it, expect } from 'vitest';
import { createEskf, eskfPredict, eskfUpdate } from '../../../src/blackbox-viewer/pose/eskf.js';
import { createGpsPositionFactor, createGpsVelocityFactor } from '../../../src/blackbox-viewer/pose/measurements.js';
import { createRng, randn } from './synthetic.js';

function runOuTest(opts: { withVelocity: boolean }): { rmsePos: number; rmseRaw: number; n: number } {
  const tauTrue = 30;
  const sigmaTrue = 2.0;
  const rng = createRng(777);

  const eskf = createEskf({
    p0: [0, 0, 0], v0: [0, 0, 0], q0: [1, 0, 0, 0],
    sigmaPos: 2, sigmaVel: 0.5, sigmaAtt: 0.05,
    sigmaGpsBias: sigmaTrue, sigmaGpsBiasInit: sigmaTrue, tauGps: tauTrue,
  });

  const dt = 0.02; // 50 Hz IMU
  const durationS = 100;
  const N = Math.round(durationS / dt);
  const gpsEveryNSteps = Math.round(0.2 / dt); // 5 Hz GPS

  let trueBiasN = 0;
  let trueBiasE = 0;
  const decayPerStep = Math.exp(-dt / tauTrue);
  const qStdPerStep = sigmaTrue * Math.sqrt(1 - decayPerStep * decayPerStep);

  let sumSqPos = 0;
  let sumSqRaw = 0; // "raw" = using the unfiltered GPS fix directly as position
  let n = 0;

  for (let i = 0; i < N; i++) {
    // Ground-truth bias evolves as the same OU process the filter assumes.
    trueBiasN = trueBiasN * decayPerStep + qStdPerStep * randn(rng);
    trueBiasE = trueBiasE * decayPerStep + qStdPerStep * randn(rng);

    eskfPredict(eskf, [0, 0, 0], [0, 0, 9.80665], dt);

    if (i % gpsEveryNSteps === 0) {
      const meas = { n: trueBiasN, e: trueBiasE, d: 0 };
      const factor = createGpsPositionFactor(meas, 1.0, eskf.dim, 15);
      eskfUpdate(eskf, factor, meas, 4.5, {}, 'gpsPos', Math.round(i * dt * 1e6));

      if (opts.withVelocity) {
        // True velocity is exactly zero throughout (stationary body); GPS
        // Doppler velocity has no shared bias term with position at all.
        const velMeas = { n: 0, e: 0, d: 0 };
        const velFactor = createGpsVelocityFactor(velMeas, 0.2);
        eskfUpdate(eskf, velFactor, velMeas, 4.5, {}, 'gpsVel', Math.round(i * dt * 1e6));
      }

      if (i * dt > tauTrue) {
        // Burn-in past ~1 tau before scoring.
        const errN = eskf.p[0]; // true position is (0,0,0) throughout
        const errE = eskf.p[1];
        sumSqPos += errN * errN + errE * errE;
        sumSqRaw += meas.n * meas.n + meas.e * meas.e;
        n++;
      }
    }
  }

  return {
    rmsePos: Math.sqrt(sumSqPos / Math.max(1, n)),
    rmseRaw: Math.sqrt(sumSqRaw / Math.max(1, n)),
    n,
  };
}

describe('isolated forward ESKF — FOGM GPS bias observability', () => {
  it('position-only updates: the bias state provides no benefit (unobservable vs. position)', () => {
    const { rmsePos, rmseRaw, n } = runOuTest({ withVelocity: false });
    expect(n).toBeGreaterThan(100);
    // Position ends up tracking the raw (biased) GPS fix almost exactly —
    // the bias channel absorbs essentially nothing. Document this rather
    // than silently assume the naive design works.
    expect(Math.abs(rmsePos - rmseRaw) / rmseRaw).toBeLessThan(0.05);
  });

  it('with GPS velocity aiding: the bias state meaningfully reduces position error', () => {
    const { rmsePos, rmseRaw, n } = runOuTest({ withVelocity: true });
    expect(n).toBeGreaterThan(100);
    // Velocity aiding decorrelates position from the bias channel — position
    // should end up substantially more accurate than just trusting raw GPS.
    expect(rmsePos).toBeLessThan(rmseRaw * 0.75);
  });
});
