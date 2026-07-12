/**
 * reference_flight1 KML producer — runs the full pipeline and writes a KML + PoseTrack JSON for
 * visual inspection (Google Earth). One-shot producer, not a correctness gate; the gates
 * live in acroFixture.test.ts. Skips when the (uncommitted) BFL is absent.
 */
import { it, expect } from 'vitest';
import { describeIntegration } from './testHelpers.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestFlightLog, loadFlightLogFromBuffer } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import { estimatePoseTrack } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import { loadMagCharacterizationModel } from '../../../src/blackbox-viewer/pose/mag_model.js';
import { correctMagStream } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import { poseTrackToKml, poseTrackToJson } from '../../../src/blackbox-viewer/pose/serializers.js';
import type { EstimatorOpts } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';

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

describeIntegration('reference_flight1 KML output', () => {
  it(
    'produces a valid KML from the real reference_flight1 log',
    async () => {
      if (!hasFiles()) {
        console.warn('SKIP: reference_flight1 files not available');
        return;
      }

      const fl = await loadFlightLogFromBuffer(new Uint8Array(fs.readFileSync(BFL_PATH)));
      const data = ingestFlightLog(fl as Parameters<typeof ingestFlightLog>[0]);

      // Load and validate the mag characterization model. The corrected mag stream
      // provides 3-axis body-frame Gauss measurements for the ESKF mag factor.
      const mr = loadMagCharacterizationModel(JSON.parse(fs.readFileSync(MODEL_PATH, 'utf-8')));
      const magGauss = mr.model ? correctMagStream(data.mag, mr.model as Parameters<typeof correctMagStream>[1]) : [];
      const magModelForEst = mr.model && mr.model.fusion?.earthFieldNedGauss ? mr.model : null;

      const origin = data.gpsHome || {
        lat: data.gps[0].lat,
        lon: data.gps[0].lon,
        alt: data.gps[0].alt ?? 0,
      };
      const opts: EstimatorOpts = {
        outputHz: 20,
        maxIter: 1,
        magModel: magModelForEst as EstimatorOpts['magModel'],
        sigmaYawMax: 0.1,
      };
      const track = estimatePoseTrack({ ...data, mag: magGauss }, origin, opts);

      // Triads every 8 samples (~0.4 s at 20 Hz) — double the previous density. 2 m axes.
      const kml = poseTrackToKml(track, {
        everyN: 8,
        showTriads: true,
        showPath: true,
        showRawGps: true,
        rawGps: data.gps.map((g) => ({ lat: g.lat, lon: g.lon, alt: g.alt ?? 0 })),
        axisLengthMeters: 2.0,
      });
      const json = poseTrackToJson(track);

      console.log(`  KML ${kml.length} B, JSON ${json.length} B, ${track.samples.length} samples`);

      // EXTRACT b_g[2] from meta.source
      const ep = track.meta?.source?.estimatedParams as
        | { bg?: [number, number, number] }
        | undefined;
      if (ep?.bg) {
        console.log(
          `  b_g converged: [${ep.bg.map((v: number) => ((v * 180) / Math.PI).toFixed(2)).join(', ')}] °/s`,
        );
      } else {
        console.log(
          `  b_g NOT in source.estimatedParams. source keys: ${
            track.meta?.source ? Object.keys(track.meta.source) : 'null'
          }`,
        );
      }

      expect(kml).toContain('kml');
      expect(json).toContain('schemaVersion');
      expect(track.samples.length).toBeGreaterThan(0);

      // Byte-drift gate: fingerprint the freshly generated outputs. Quality is
      // guarded by the physical gates (acroFixture.test.ts); this catches
      // unintended numeric drift from refactors.
      const digest = (s: string): string =>
        crypto.createHash('sha256').update(Buffer.from(s, 'utf-8')).digest('hex').toUpperCase();
      const actual: Record<string, string> = {
        'reference_flight1_track.kml': digest(kml),
        'reference_flight1_posetrack.json': digest(json),
      };
      const checksumsPath = path.join(DIR, 'checksums.json');
      if (process.env.UPDATE_POSE_FIXTURES === '1') {
        fs.writeFileSync(
          checksumsPath,
          JSON.stringify(
            {
              files: Object.entries(actual).map(([file, sha256]) => ({ sha256, file })),
              description:
                'SHA-256 of the serialized reference_flight1 outputs (computed in-memory by acroKml.test.ts). Regenerate with UPDATE_POSE_FIXTURES=1 after an intentional output change.',
              generated: new Date().toISOString(),
            },
            null,
            2,
          ) + '\n',
          'utf-8',
        );
      }
      let raw = fs.readFileSync(checksumsPath, 'utf-8');
      if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
      const checksums = JSON.parse(raw);
      for (const entry of checksums.files) {
        expect(
          actual[entry.file],
          `checksum mismatch for ${entry.file}: regenerated ${actual[entry.file]}, expected ${entry.sha256}. ` +
            'If the output changed intentionally, rerun with UPDATE_POSE_FIXTURES=1.',
        ).toBe(entry.sha256);
      }
    },
    60000,
  );
});
