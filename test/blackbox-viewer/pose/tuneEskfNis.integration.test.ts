/**
 * Real-log NIS-consistency tuning + leave-one-flight-out validation.
 *
 * Replaces the earlier approach of grid-searching sigmas against an RMSE
 * versus an externally-derived, similarity-aligned reference trajectory with
 * the dataset-independent NIS-consistency objective from tuneEskfNis.ts.
 *
 * Flight pair is configurable via env vars so this runs against whatever
 * dual-pass mission the operator is currently investigating:
 *   TUNE_BFL_A / TUNE_BFL_B   — absolute paths to two BFL logs of the same
 *                                or similar mission.
 *   TUNE_MAG_MODEL            — optional path to a magnetometer
 *                                characterization JSON, shared by both logs.
 *
 * Falls back to the in-repo reference_flight1 fixture (tuning and validating
 * on the same log — not true cross-validation, but keeps this runnable
 * without any external paths) when the env vars are absent.
 *
 * Run: RUN_INTEGRATION=1 TUNE_BFL_A=... TUNE_BFL_B=... npx vitest run src/pose/tuneEskfNis.integration.test.ts
 */
import { describe, it, beforeAll } from 'vitest';
import { describeIntegration } from './testHelpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestFlightLog, loadFlightLogFromBuffer, correctMagStream } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import type { IngestedData, MagGaussEntry } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import type { EstimatorData, EstimatorOrigin, MagModelInput } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import { loadMagCharacterizationModel } from '../../../src/blackbox-viewer/pose/mag_model.js';
import { leaveOneFlightOutValidation, findRegressedSensors, type TuneCandidate } from './tuneEskfNis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, './__fixtures__/reference_flight1/');
const FALLBACK_BFL = path.join(FIXTURE_DIR, 'LOG00007.BFL');
const FALLBACK_MAG_MODEL = path.join(FIXTURE_DIR, 'reference_flight1_mag_model.json');

const BFL_A = process.env.TUNE_BFL_A || FALLBACK_BFL;
const BFL_B = process.env.TUNE_BFL_B || FALLBACK_BFL;
const MAG_MODEL_PATH = process.env.TUNE_MAG_MODEL || FALLBACK_MAG_MODEL;
const USING_FALLBACK = !process.env.TUNE_BFL_A || !process.env.TUNE_BFL_B;

async function loadFlight(
  bflPath: string,
  magModel: MagModelInput | null,
): Promise<{ data: EstimatorData; origin: EstimatorOrigin }> {
  const flBuf = new Uint8Array(fs.readFileSync(bflPath));
  const fl = await loadFlightLogFromBuffer(flBuf);
  const d: IngestedData = ingestFlightLog(fl as Parameters<typeof ingestFlightLog>[0]);

  const magGauss: MagGaussEntry[] = magModel ? correctMagStream(d.mag, magModel as never) : [];

  const origin: EstimatorOrigin = d.gpsHome || {
    lat: d.gps[0].lat,
    lon: d.gps[0].lon,
    alt: d.gps[0].alt ?? 0,
  };

  const data = { ...d, mag: magGauss } as unknown as EstimatorData;
  return { data, origin };
}

describeIntegration('NIS-consistency ESKF tuning (leave-one-flight-out)', () => {
  const haveA = (): boolean => {
    try {
      fs.accessSync(BFL_A, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  };
  const haveB = (): boolean => {
    try {
      fs.accessSync(BFL_B, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  };

  let flightA: { data: EstimatorData; origin: EstimatorOrigin } | null = null;
  let flightB: { data: EstimatorData; origin: EstimatorOrigin } | null = null;

  beforeAll(async () => {
    if (!haveA() || !haveB()) {
      console.warn(`BFL(s) not present (A=${BFL_A}, B=${BFL_B}), skipping NIS tuning run`);
      return;
    }
    let magModel: MagModelInput | null = null;
    try {
      const rawModel = JSON.parse(fs.readFileSync(MAG_MODEL_PATH, 'utf8'));
      const mr = loadMagCharacterizationModel(rawModel);
      magModel =
        mr.model && (mr.model as { fusion?: { earthFieldNedGauss?: unknown } }).fusion?.earthFieldNedGauss
          ? (mr.model as MagModelInput)
          : null;
    } catch {
      magModel = null;
    }

    flightA = await loadFlight(BFL_A, magModel);
    flightB = await loadFlight(BFL_B, magModel);
  }, 120_000);

  it('tunes on flight A, validates NIS consistency on flight B (and vice versa)', () => {
    if (!flightA || !flightB) {
      console.warn('Flights not loaded — skipping (see beforeAll warning above)');
      return;
    }
    if (USING_FALLBACK) {
      console.warn(
        'TUNE_BFL_A / TUNE_BFL_B not set — tuning and validating on the same ' +
          'in-repo fixture. Set both env vars to two BFL logs of the same or ' +
          'similar mission for genuine cross-validation.',
      );
    }

    // Estimator defaults as the starting point (estimatorLoop.ts).
    const initial: TuneCandidate = { gpsPosSigma: 4.5, gpsVelSigma: 0.6, baroSigma: 2.5 };
    // maxIter:1 (forward pass only, skip the extra Gauss-Newton re-linearization)
    // keeps this tractable on a real multi-minute BFL — each candidate is a full
    // filter pass. Sweep count/grid default to a quick 2-sweep/5-factor pass for
    // casual local runs; override with TUNE_SWEEPS / TUNE_FACTORS (comma list)
    // for a wider production tuning pass.
    const sweeps = process.env.TUNE_SWEEPS ? Number(process.env.TUNE_SWEEPS) : 2;
    const factors = process.env.TUNE_FACTORS
      ? process.env.TUNE_FACTORS.split(',').map(Number)
      : [0.5, 0.75, 1.0, 1.5, 2.0];
    const baseOpts = { outputHz: 20, maxIter: 1 };
    const tuneOpts = { baseOpts, sweeps, factors };

    const aToB = leaveOneFlightOutValidation(flightA, flightB, initial, tuneOpts);
    const bToA = leaveOneFlightOutValidation(flightB, flightA, initial, tuneOpts);

    function report(label: string, result: ReturnType<typeof leaveOneFlightOutValidation>) {
      console.log(`\n=== ${label} ===`);
      console.log('Tuned candidate:', result.tuned.candidate);
      console.log('Tuned-flight NIS (mean nis/df, ~1.0 = consistent):');
      for (const s of result.tuned.perSensor) {
        console.log(`  ${s.sensor}: ${s.meanNisPerDf.toFixed(3)} (n=${s.n})`);
      }
      console.log('Held-out-flight NIS with the SAME tuned parameters:');
      for (const s of result.validation.perSensor) {
        console.log(`  ${s.sensor}: ${s.meanNisPerDf.toFixed(3)} (n=${s.n})`);
      }
      const regressed = findRegressedSensors(result.initial, result.tuned);
      if (regressed.length > 0) {
        console.warn(
          `  WARNING: the joint objective improved overall but these sensor(s) got ` +
            `LESS individually consistent than the untuned starting point — the ` +
            `coordinate descent traded their fit away for the others' (see ` +
            `improvement_plan.md §8 / findRegressedSensors doc comment):`,
        );
        for (const r of regressed) {
          console.warn(
            `    ${r.sensor}: ${r.initialMeanNisPerDf.toFixed(3)} -> ${r.finalMeanNisPerDf.toFixed(3)}`,
          );
        }
      }
    }

    report('Tune on A, validate on B', aToB);
    report('Tune on B, validate on A', bToA);
  }, 1_800_000); // real-BFL coordinate descent runs ~40 full filter passes; can take 10+ min
});
