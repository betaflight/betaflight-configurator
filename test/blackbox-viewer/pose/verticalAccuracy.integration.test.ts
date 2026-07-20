/**
 * verticalAccuracy.integration.test.ts — vertical accuracy regression guard
 *
 * HEAVY integration test (test:full only, NOT CI). Verifies that the
 * reconstructed altitude tracks raw GPS altitude through the ~100 m
 * climb+drop maneuver on reference_flight1, using the **UI's exact estimator config**
 * (maxIter=3, outputHz=20, mag on, sigmaYawMax=0.10).
 *
 * The oracle is PHYSICS: reconstructed altitude must track GPS altitude
 * through the climb/drop and must never sink far below it.
 *
 * Run:  npm run test:full
 */
import { it, expect } from 'vitest';
import { describeIntegration } from './testHelpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestFlightLog, loadFlightLogFromBuffer, correctMagStream } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import { estimatePoseTrack } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import { loadMagCharacterizationModel } from '../../../src/blackbox-viewer/pose/mag_model.js';
import type { EstimatorOpts } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import type { PoseSampleInternal } from '../../../src/blackbox-viewer/pose/poseSample.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, './__fixtures__/reference_flight1/');
const BFL_PATH = path.join(DIR, 'LOG00007.BFL');
const MODEL_PATH = path.join(DIR, 'reference_flight1_mag_model.json');

function hasFiles(): boolean {
  try {
    fs.accessSync(BFL_PATH, fs.constants.R_OK);
    fs.accessSync(MODEL_PATH, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

interface AltSample {
  tUs: number;
  alt: number;
}

function validGpsAlts(gps: Array<{ tUs: number; alt: number | null }>): AltSample[] {
  return gps.filter((g) => g.alt != null).map((g) => ({ tUs: g.tUs, alt: g.alt! }));
}

function reconAlts(samples: PoseSampleInternal[]): AltSample[] {
  return samples.filter((s) => s.lla != null).map((s) => ({ tUs: s.tUs, alt: s.lla!.alt }));
}

function worstBelowGps(
  recon: AltSample[],
  gps: AltSample[],
  startUs: number,
  endUs: number,
): { maxBelow: number; reconAlt: number; gpsAlt: number; tUs: number } {
  let maxBelow = 0;
  let worstRecon = 0;
  let worstGps = 0;
  let worstT = 0;
  for (const r of recon) {
    if (r.tUs < startUs || r.tUs > endUs) continue;
    let bestAlt: number | null = null;
    let bestDt = Infinity;
    for (const g of gps) {
      const dt = Math.abs(g.tUs - r.tUs);
      if (dt < bestDt && dt < 2_000_000) {
        bestDt = dt;
        bestAlt = g.alt;
      }
    }
    if (bestAlt === null) continue;
    const below = bestAlt - r.alt;
    if (below > maxBelow) {
      maxBelow = below;
      worstRecon = r.alt;
      worstGps = bestAlt;
      worstT = r.tUs;
    }
  }
  return { maxBelow, reconAlt: worstRecon, gpsAlt: worstGps, tUs: worstT };
}

function closestByTime<T extends { tUs: number }>(samples: T[], targetUs: number): T | null {
  let best: T | null = null;
  let bestDt = Infinity;
  for (const s of samples) {
    const dt = Math.abs(s.tUs - targetUs);
    if (dt < bestDt) { bestDt = dt; best = s; }
  }
  return best;
}

// ── tolerances (metres) ────────────────────────────────────────────────────

const TOL_APEX = 10;
const TOL_DROP = 10;
const TOL_BELOW = 10;

// ── tests ──────────────────────────────────────────────────────────────────

describeIntegration('vertical accuracy vs GPS (UI config: maxIter=3)', () => {
  it(
    'recon altitude tracks GPS through climb+drop at TOL=8m',
    async () => {
      if (!hasFiles()) { console.warn('SKIP: reference_flight1 files not available'); return; }

      // ── Ingest & estimate (UI config: maxIter=3, mag on) ──────────────
      const fl = await loadFlightLogFromBuffer(new Uint8Array(fs.readFileSync(BFL_PATH)));
      const data = ingestFlightLog(fl as Parameters<typeof ingestFlightLog>[0]);

      const mr = loadMagCharacterizationModel(JSON.parse(fs.readFileSync(MODEL_PATH, 'utf-8')));
      const magGauss = mr.model
        ? correctMagStream(data.mag, mr.model as Parameters<typeof correctMagStream>[1])
        : [];
      const magModelForEst = mr.model && mr.model.fusion?.earthFieldNedGauss ? mr.model : null;

      const origin = data.gpsHome || { lat: data.gps[0].lat, lon: data.gps[0].lon, alt: data.gps[0].alt ?? 134.2 };

      const opts: EstimatorOpts = {
        outputHz: 20,
        maxIter: 3,
        magModel: magModelForEst as EstimatorOpts['magModel'],
        sigmaYawMax: 0.1,
      };

      const track = estimatePoseTrack({ ...data, mag: magGauss }, origin, opts);
      const gpsAlts = validGpsAlts(data.gps);
      const recon = reconAlts(track.samples);

      // ── Apex / drop ───────────────────────────────────────────────────
      let gpsApex = gpsAlts[0];
      for (const g of gpsAlts) if (g.alt > gpsApex.alt) gpsApex = g;

      let gpsDrop = gpsAlts[0];
      let dropSet = false;
      for (const g of gpsAlts) {
        if (g.tUs > gpsApex.tUs) {
          if (!dropSet || g.alt < gpsDrop.alt) { gpsDrop = g; dropSet = true; }
        }
      }

      const rApex = closestByTime(recon, gpsApex.tUs);
      const rDrop = closestByTime(recon, gpsDrop.tUs);

      // ── Full-flight worst-below-GPS scan ──────────────────────────────
      const flightStart = recon[0]?.tUs ?? 0;
      const flightEnd = recon[recon.length - 1]?.tUs ?? 0;
      const below = worstBelowGps(recon, gpsAlts, flightStart, flightEnd);

      const lastR = recon[recon.length - 1];

      console.log(
        `\n  GPS apex=${gpsApex.alt.toFixed(1)}  drop=${gpsDrop.alt.toFixed(1)}  delta=${(gpsApex.alt - gpsDrop.alt).toFixed(1)} m`,
      );
      console.log(
        `  Recon  apex=${rApex?.alt.toFixed(1) ?? 'N/A'}  drop=${rDrop?.alt.toFixed(1) ?? 'N/A'}  worst-below=${below.maxBelow.toFixed(1)} m  landing=${lastR?.alt.toFixed(1) ?? 'N/A'}`,
      );
      console.log(
        `  Diffs: apex=|${(rApex?.alt ?? 0) - gpsApex.alt}|=${Math.abs((rApex?.alt ?? 0) - gpsApex.alt).toFixed(1)} m  ` +
        `drop=|${(rDrop?.alt ?? 0) - gpsDrop.alt}|=${Math.abs((rDrop?.alt ?? 0) - gpsDrop.alt).toFixed(1)} m  ` +
        `landing=${lastR?.alt.toFixed(1) ?? 'N/A'} (launch=${origin.alt.toFixed(1)})`,
      );

      // ── Assertions ────────────────────────────────────────────────────
      const apexDiff = Math.abs((rApex?.alt ?? 0) - gpsApex.alt);
      expect(apexDiff, `Apex mismatch ${apexDiff.toFixed(1)} > ${TOL_APEX}`).toBeLessThanOrEqual(TOL_APEX);

      const dropDiff = Math.abs((rDrop?.alt ?? 0) - gpsDrop.alt);
      expect(dropDiff, `Drop-bottom mismatch ${dropDiff.toFixed(1)} > ${TOL_DROP}`).toBeLessThanOrEqual(TOL_DROP);

      expect(below.maxBelow, `Recon sinks ${below.maxBelow.toFixed(1)} m below GPS`).toBeLessThanOrEqual(TOL_BELOW);
    },
    180_000,
  );
});
