/**
 * Re-validation of `useGpsAccuracyScaling` now that the FOGM GPS position-bias
 * state exists (see improvement_plan.md §5, §1's FOGM finding).
 *
 * Prior finding (pre-FOGM): enabling per-fix GPS sigma scaling from satellite
 * count regressed accuracy — the "good sky trap": a tight sigma (~1.5m) under
 * good sky conditions forces the filter to chase high-frequency GPS/multipath
 * noise it can no longer distinguish from real motion, since a white-noise
 * measurement model has nowhere else to put that noise but into position.
 *
 * Hypothesis this test checks: with the FOGM bias state active (an explicit
 * channel for time-correlated GPS error), tightening gpsPosSigma under good
 * sky conditions should no longer force the same chasing behavior, because
 * the correlated component has somewhere else to go. Checked via NIS
 * consistency (mean nis/df -> 1.0), not RMSE-against-an-external-reference,
 * per improvement_plan.md §3 — this keeps the check entirely self-contained
 * to blackbox log data, no external reference required.
 *
 * A meaningful check needs a flight where satellite count actually varies
 * (scaling is a no-op otherwise). The in-repo reference_flight1 fixture does
 * NOT vary (reported 14-20 throughout) — set TUNE_BFL_A to a flight with a
 * real GPS dropout/recovery segment for a result that actually exercises the
 * scaling logic; this test reports the observed numSat range either way so a
 * no-op run is visible rather than silently misleading.
 *
 * Run: RUN_INTEGRATION=1 TUNE_BFL_A=/path/to/flight.BFL npx vitest run src/pose/useGpsAccuracyScalingRevalidation.integration.test.ts
 */
import { describe, it, beforeAll } from 'vitest';
import { describeIntegration } from './testHelpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestFlightLog, loadFlightLogFromBuffer } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import type { IngestedData } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import { estimatePoseTrackWithDiagnostics } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import type { EstimatorData, EstimatorOrigin } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import { summarizeNis } from './tuneEskfNis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_BFL = path.resolve(__dirname, './__fixtures__/reference_flight1/LOG00007.BFL');
const BFL_PATH = process.env.TUNE_BFL_A || FALLBACK_BFL;

describeIntegration('useGpsAccuracyScaling re-validation with FOGM bias', () => {
  let data: EstimatorData | null = null;
  let origin: EstimatorOrigin | null = null;
  let numSatRange: [number, number] | null = null;

  beforeAll(async () => {
    try {
      fs.accessSync(BFL_PATH, fs.constants.R_OK);
    } catch {
      console.warn(`BFL not present at ${BFL_PATH}, skipping re-validation run`);
      return;
    }
    const flBuf = new Uint8Array(fs.readFileSync(BFL_PATH));
    const fl = await loadFlightLogFromBuffer(flBuf);
    const d: IngestedData = ingestFlightLog(fl as Parameters<typeof ingestFlightLog>[0]);
    data = { ...d, mag: [] } as unknown as EstimatorData;
    origin = d.gpsHome || { lat: d.gps[0].lat, lon: d.gps[0].lon, alt: d.gps[0].alt ?? 0 };

    const sats = d.gps.map((g) => g.numSat).filter((n): n is number => typeof n === 'number');
    if (sats.length > 0) numSatRange = [Math.min(...sats), Math.max(...sats)];
  }, 120_000);

  it('compares gpsPos NIS consistency across scaling x FOGM-bias configurations', () => {
    if (!data || !origin) {
      console.warn('Flight not loaded — skipping (see beforeAll warning above)');
      return;
    }
    console.log(`\nnumSat range observed: ${numSatRange ? numSatRange.join('-') : 'unknown'}`);
    if (numSatRange && numSatRange[1] - numSatRange[0] < 3) {
      console.warn(
        'numSat barely varies on this flight — useGpsAccuracyScaling is close to a ' +
          'no-op here. Re-run with TUNE_BFL_A pointed at a flight with a real GPS ' +
          'dropout/recovery segment for a meaningful result.',
      );
    }

    // gpsPosSigma held at a tight, FIXED value (not the loose 4.5m codebase
    // default) across every config so the comparison isolates the effect of
    // scaling/FOGM rather than being dominated by an already-underconfident
    // baseline sigma. This is deliberately close to computeGpsNoise's own
    // good-sky value (1.5m) so "scaling" mostly toggles the floor/gate
    // behavior rather than a large sigma jump.
    const baseOpts = { outputHz: 20, maxIter: 2, gpsPosSigma: 2.0, gpsPosSigmaFloor: 1.5 };
    const fogmOpts = { sigmaGpsBiasInit: 2.0, sigmaGpsBias: 2.0, tauGps: 30 };

    const configs: { label: string; opts: Record<string, unknown> }[] = [
      { label: 'baseline (no scaling, no FOGM)', opts: { ...baseOpts } },
      { label: 'scaling only (no FOGM)', opts: { ...baseOpts, useGpsAccuracyScaling: true } },
      { label: 'FOGM only (no scaling)', opts: { ...baseOpts, ...fogmOpts } },
      {
        label: 'scaling + FOGM',
        opts: { ...baseOpts, useGpsAccuracyScaling: true, ...fogmOpts },
      },
    ];

    console.log(
      '\nNote: mean(nis/df) is not perfectly comparable across FOGM on/off — adding the ' +
        'bias state changes the innovation covariance S itself (more state, more prior ' +
        'variance in the position-measurement direction), so a lower ratio with FOGM on ' +
        'partly reflects a larger S, not only a smaller residual. Read within-FOGM-state ' +
        'comparisons (baseline vs scaling; FOGM-only vs scaling+FOGM) as the fair pairs.',
    );

    for (const cfg of configs) {
      const result = estimatePoseTrackWithDiagnostics(data!, origin!, cfg.opts);
      const summary = summarizeNis(result.nisHistory);
      const gpsPos = summary.find((s) => s.sensor === 'gpsPos');
      console.log(
        `${cfg.label}: gpsPos mean(nis/df)=${gpsPos ? gpsPos.meanNisPerDf.toFixed(3) : 'n/a'} ` +
          `(n=${gpsPos ? gpsPos.n : 0})`,
      );
    }
  }, 600_000);
});
