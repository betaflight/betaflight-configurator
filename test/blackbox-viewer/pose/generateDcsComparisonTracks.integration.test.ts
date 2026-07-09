/**
 * One-shot generator (not a correctness gate): produces LOG00022 PoseTrack
 * JSON with useDcs=false (default) and useDcs=true, for an acceptance test
 * that compares both against GoPro GPS9 ground truth through the
 * t=340-365s dropout window.
 *
 * Run: RUN_INTEGRATION=1 REVIEW_BFL_B=... npx vitest run src/pose/generateDcsComparisonTracks.integration.test.ts
 */
import { describe, it } from 'vitest';
import { describeIntegration } from './testHelpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadFlightLogFromBuffer } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import { reconstructPose } from '../../../src/blackbox-viewer/pose/poseReconstruction.js';
import { poseTrackToJson } from '../../../src/blackbox-viewer/pose/serializers/jsonSerializer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../scratch/review');

describeIntegration('generate DCS comparison PoseTracks', () => {
  it('produces useDcs=false and useDcs=true PoseTrack JSON for LOG00022', async () => {
    const bflPath = process.env.REVIEW_BFL_B;
    if (!bflPath) {
      console.warn('REVIEW_BFL_B not set, skipping');
      return;
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const flBuf = new Uint8Array(fs.readFileSync(bflPath));
    const fl = await loadFlightLogFromBuffer(flBuf);

    const combos: { label: string; opts: Record<string, unknown> }[] = [
      { label: 'off', opts: { useDcs: false, useVbAdaptiveR: false } },
      { label: 'on', opts: { useDcs: true, useVbAdaptiveR: false } },
      { label: 'vb', opts: { useDcs: false, useVbAdaptiveR: true } },
    ];
    for (const combo of combos) {
      const track = reconstructPose(fl, {
        magMode: 'off',
        outputHz: 20,
        maxIter: 2,
        gpsPosSigma: 2.5,
        ...combo.opts,
      } as any);
      const json = poseTrackToJson(track);
      const outPath = path.join(OUT_DIR, `LOG00022_dcs_${combo.label}.json`);
      fs.writeFileSync(outPath, json, 'utf-8');
      console.log(`${combo.label}: ${track.samples.length} samples -> ${outPath}`);
    }
  }, 600_000);
});
