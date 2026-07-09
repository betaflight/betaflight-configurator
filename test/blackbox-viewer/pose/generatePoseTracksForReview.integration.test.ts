/**
 * One-shot generator (not a correctness gate) producing fresh PoseTrack JSON
 * for accuracy review: LOG00021/LOG00022, x3 mag modes each
 * (manual/off/auto), using the CURRENT (post-freeze) estimator defaults.
 * Existing telemetry/*_posetrack_mag.json files predate this defaults
 * change and cannot be reused for accuracy comparisons.
 *
 * Run: RUN_INTEGRATION=1 REVIEW_BFL_A=... REVIEW_BFL_B=... REVIEW_MAG_MODEL=... \
 *   npx vitest run src/pose/generatePoseTracksForReview.integration.test.ts
 */
import { describe, it } from 'vitest';
import { describeIntegration } from './testHelpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadFlightLogFromBuffer } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import { reconstructPose } from '../../../src/blackbox-viewer/pose/poseReconstruction.js';
import type { MagMode } from '../../../src/blackbox-viewer/pose/poseReconstruction.js';
import { poseTrackToJson } from '../../../src/blackbox-viewer/pose/serializers/jsonSerializer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../scratch/review');

const FLIGHTS: { label: string; bflEnv: string }[] = [
  { label: 'LOG00021', bflEnv: 'REVIEW_BFL_A' },
  { label: 'LOG00022', bflEnv: 'REVIEW_BFL_B' },
];
const MODES: MagMode[] = ['manual', 'off', 'auto'];

describeIntegration('generate PoseTracks for accuracy review', () => {
  it('produces manual/off/auto PoseTrack JSON for both flights', async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const magModelPath = process.env.REVIEW_MAG_MODEL;
    const rawModelJson = magModelPath ? JSON.parse(fs.readFileSync(magModelPath, 'utf8')) : null;

    for (const flight of FLIGHTS) {
      const bflPath = process.env[flight.bflEnv];
      if (!bflPath) {
        console.warn(`${flight.bflEnv} not set, skipping ${flight.label}`);
        continue;
      }
      const flBuf = new Uint8Array(fs.readFileSync(bflPath));
      const fl = await loadFlightLogFromBuffer(flBuf);

      for (const mode of MODES) {
        const track = reconstructPose(fl, {
          magModel: mode === 'manual' ? rawModelJson : null,
          magMode: mode,
          outputHz: 20,
          maxIter: 2,
        });
        const json = poseTrackToJson(track);
        const outPath = path.join(OUT_DIR, `${flight.label}_${mode}.json`);
        fs.writeFileSync(outPath, json, 'utf-8');

        const ep = track.meta?.source?.estimatedParams as
          | { bg?: [number, number, number]; ba?: [number, number, number] }
          | undefined;
        const headings = track.samples
          .filter((s) => s.euler)
          .map((s) => s.euler!.headingDeg);
        console.log(
          `${flight.label} [${mode}]: ${track.samples.length} samples, ` +
            `bg=[${ep?.bg?.map((v) => ((v * 180) / Math.PI).toFixed(3)).join(', ') ?? 'n/a'}] deg/s, ` +
            `heading range=[${Math.min(...headings).toFixed(1)}, ${Math.max(...headings).toFixed(1)}] deg -> ${outPath}`,
        );
      }
    }
  }, 1_800_000);
});
