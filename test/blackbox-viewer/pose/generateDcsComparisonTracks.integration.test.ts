/**
 * One-shot generator (not a correctness gate): produces PoseTrack JSON for a
 * user-supplied flight log with useDcs=false (default), useDcs=true, and
 * useVbAdaptiveR=true, so the outputs can be diffed against an external
 * ground-truth source when evaluating a GPS-dropout window by hand.
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
  it('produces useDcs=false and useDcs=true PoseTrack JSON for the supplied flight log', async () => {
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
      const logName = path.basename(bflPath, path.extname(bflPath));
      const outPath = path.join(OUT_DIR, `${logName}_dcs_${combo.label}.json`);
      fs.writeFileSync(outPath, json, 'utf-8');
      console.log(`${combo.label}: ${track.samples.length} samples -> ${outPath}`);
    }
  }, 600_000);
});
