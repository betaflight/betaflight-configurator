import { describe, it, expect } from 'vitest';
import { rateMatchGpsTimestamps } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import { createRng, randn } from './synthetic.js';
import type { GpsEntry } from '../../../src/blackbox-viewer/pose/flightIngestion.js';

function makeGps(tUs: number, itowMs: number): GpsEntry {
  return { tUs, lat: 48.4, lon: -71.1, alt: 200, velNed: [0, 0, 0], numSat: 12, gpsTimeItoW: itowMs };
}

describe('rateMatchGpsTimestamps', () => {
  it('returns the original array unchanged when too few fixes carry gpsTimeItoW', () => {
    const gps = [makeGps(0, 1000), makeGps(1e6, 2000)]; // only 2, default minFixes=10
    const out = rateMatchGpsTimestamps(gps);
    expect(out).toBe(gps);
  });

  it('recovers the true rate and removes per-fix FC-arrival jitter', () => {
    // Simulate: FC clock runs at rate `rateFactor` relative to the GPS clock
    // (a genuine, small crystal mismatch), plus FC-side jitter on tUs (serial
    // transport / parse-loop scheduling noise) that shouldn't appear in the
    // true iTOW epoch at all.
    const rng = createRng(42);
    const rateFactor = 1.00007; // FC seconds per GPS second -- a small, realistic mismatch
    const n = 60;
    const gps: GpsEntry[] = [];
    const trueFcUs: number[] = [];
    for (let i = 0; i < n; i++) {
      const trueItowMs = i * 200; // 5 Hz fixes
      const trueFcUsExact = (trueItowMs / 1000) * rateFactor * 1e6;
      const jitterUs = randn(rng, 0, 5000); // +-5ms-class FC arrival jitter
      trueFcUs.push(trueFcUsExact);
      gps.push(makeGps(trueFcUsExact + jitterUs, trueItowMs));
    }

    const out = rateMatchGpsTimestamps(gps);
    expect(out).not.toBe(gps);

    // Reconstructed timestamps should track the true (jitter-free) FC time
    // far more closely than the raw jittered tUs did.
    let sumSqRaw = 0;
    let sumSqReconstructed = 0;
    for (let i = 0; i < n; i++) {
      sumSqRaw += (gps[i].tUs - trueFcUs[i]) ** 2;
      sumSqReconstructed += (out[i].tUs - trueFcUs[i]) ** 2;
    }
    const rmsRaw = Math.sqrt(sumSqRaw / n);
    const rmsReconstructed = Math.sqrt(sumSqReconstructed / n);
    expect(rmsReconstructed).toBeLessThan(rmsRaw * 0.5);
    // The OLS fit averages over many noisy fixes, so residual jitter should
    // be a small fraction of the injected 5ms-class noise, not just "better".
    expect(rmsReconstructed).toBeLessThan(2000); // well under the 5000us injected std
  });

  it('does not introduce a progressive lag when the rate mismatch is significant', () => {
    // This is the failure mode the naive (offset-only) attempt hit: without
    // solving for rate, error should GROW over the flight. With rate-matching,
    // error at the end of a long fit should not be systematically worse than
    // at the start.
    const rateFactor = 1.0002; // deliberately larger mismatch
    const n = 100;
    const gps: GpsEntry[] = [];
    const trueFcUs: number[] = [];
    for (let i = 0; i < n; i++) {
      const trueItowMs = i * 200;
      const trueFcUsExact = (trueItowMs / 1000) * rateFactor * 1e6;
      trueFcUs.push(trueFcUsExact);
      gps.push(makeGps(trueFcUsExact, trueItowMs)); // no jitter -- isolate the rate effect
    }
    const out = rateMatchGpsTimestamps(gps);
    const errStart = Math.abs(out[5].tUs - trueFcUs[5]);
    const errEnd = Math.abs(out[n - 5].tUs - trueFcUs[n - 5]);
    // Both should be tiny (near-exact recovery since there's no noise at all).
    expect(errStart).toBeLessThan(10);
    expect(errEnd).toBeLessThan(10);
  });
});
