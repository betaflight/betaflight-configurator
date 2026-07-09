/**
 * One-shot comparison (not a correctness gate): does 'itow-rate-matched' GPS
 * timestamping actually improve gpsPos NIS consistency on a real flight,
 * versus the default 'fc' timestamping?
 *
 * Run: RUN_INTEGRATION=1 npx vitest run src/pose/gpsTimeModeComparison.integration.test.ts
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
const BFL_PATH = path.resolve(__dirname, './__fixtures__/reference_flight1/LOG00007.BFL');

describeIntegration('gpsTimeMode comparison: fc vs itow-rate-matched', () => {
  let data: EstimatorData | null = null;
  let origin: EstimatorOrigin | null = null;
  let nWithItow = 0;

  beforeAll(async () => {
    try {
      fs.accessSync(BFL_PATH, fs.constants.R_OK);
    } catch {
      return;
    }
    const flBuf = new Uint8Array(fs.readFileSync(BFL_PATH));
    const fl = await loadFlightLogFromBuffer(flBuf);
    const d: IngestedData = ingestFlightLog(fl as Parameters<typeof ingestFlightLog>[0]);
    data = { ...d, mag: [] } as unknown as EstimatorData;
    origin = d.gpsHome || { lat: d.gps[0].lat, lon: d.gps[0].lon, alt: d.gps[0].alt ?? 0 };
    nWithItow = d.gps.filter((g) => g.gpsTimeItoW !== undefined).length;
  }, 60_000);

  it('compares gpsPos NIS consistency between timestamping modes', () => {
    if (!data || !origin) {
      console.warn('reference_flight1 BFL not present — skipping');
      return;
    }
    console.log(`GPS fixes carrying iTOW: ${nWithItow}`);
    if (nWithItow < 10) {
      console.warn('Fewer than 10 iTOW-bearing fixes — itow-rate-matched will no-op (falls back to fc).');
    }

    const baseOpts = { outputHz: 20, maxIter: 2, gpsPosSigma: 2.5 };
    for (const mode of ['fc', 'itow-rate-matched'] as const) {
      const result = estimatePoseTrackWithDiagnostics(data!, origin!, { ...baseOpts, gpsTimeMode: mode });
      const summary = summarizeNis(result.nisHistory);
      const gpsPos = summary.find((s) => s.sensor === 'gpsPos');
      console.log(
        `gpsTimeMode=${mode}: gpsPos mean(nis/df)=${gpsPos ? gpsPos.meanNisPerDf.toFixed(4) : 'n/a'} ` +
          `(n=${gpsPos ? gpsPos.n : 0})`,
      );
    }
  }, 120_000);
});
