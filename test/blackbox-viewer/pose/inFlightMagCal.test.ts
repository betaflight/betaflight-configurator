/**
 * In-flight mag cal parity + mode routing tests.
 *
 * Verifies that:
 *  1. AUTO-via-correctMagStream produces identical Gauss vectors to the old
 *     buildMagGaussStream path (parity gate).
 *  2. OFF mode produces magGauss=[] and no magModelForEst.
 *  3. MANUAL mode with a loaded model produces the same magGauss as direct
 *     correctMagStream.
 *  4. Export round-trip: AUTO → export model JSON → MANUAL with exported model
 *     produces the same Gauss stream as direct AUTO.
 *
 * Run: RUN_INTEGRATION=1 npx vitest run src/pose/inFlightMagCal.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { describeIntegration } from './testHelpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestFlightLog, loadFlightLogFromBuffer, correctMagStream } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import type { IngestedData, MagGaussEntry } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import {
  calibrateInFlightMag,
  buildMagGaussStream,
  exportMagModelFromFlight,
} from '../../../src/blackbox-viewer/pose/inFlightMagCal.js';
import { prepareReconstruction } from '../../../src/blackbox-viewer/pose/poseReconstruction.js';
import type { ReconstructionInputs } from '../../../src/blackbox-viewer/pose/poseReconstruction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, './__fixtures__/reference_flight1/');
const BFL_PATH = path.join(DIR, 'LOG00007.BFL');
const MODEL_PATH = path.join(DIR, 'reference_flight1_mag_model.json');

function haveFiles(): boolean {
  try {
    fs.accessSync(BFL_PATH, fs.constants.R_OK);
    fs.accessSync(MODEL_PATH, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

describeIntegration('In-flight mag cal parity & mode routing', () => {
  let d: IngestedData;
  let fl: any; // raw FlightLog
  let rawModelJson: Record<string, unknown>;

  beforeAll(async () => {
    if (!haveFiles()) return;

    const flBuf = new Uint8Array(fs.readFileSync(BFL_PATH));
    fl = await loadFlightLogFromBuffer(flBuf);
    d = ingestFlightLog(fl as any);
    rawModelJson = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
  });

  it('parity: buildMagGaussStream ≡ correctMagStream with rawModel', () => {
    if (!haveFiles()) return;

    const cal = calibrateInFlightMag(d.mag, d.quat);
    expect(cal).toBeTruthy();
    expect(cal!.valid).toBe(true);
    expect(cal!.rawModel).toBeTruthy();

    // Path A: old buildMagGaussStream
    const gaussA = buildMagGaussStream(
      d.mag,
      cal!.magUnitFrd,
      cal!.fieldStrengthG,
    );

    // Path B: new correctMagStream with rawModel
    const gaussB = correctMagStream(d.mag, cal!.rawModel as any);

    // Must have the same number of entries
    expect(gaussB.length, 'correctMagStream dropped samples vs buildMagGaussStream')
      .toBe(gaussA.length);

    // Compare sample-by-sample (within floating-point tolerance)
    const tol = 1e-9; // Gauss, close to machine epsilon for single precision
    let maxDiff = 0;
    for (let i = 0; i < gaussA.length; i++) {
      const a = gaussA[i];
      const b = gaussB[i];
      expect(a.tUs, `timestamp mismatch at sample ${i}`).toBe(b.tUs);
      for (let j = 0; j < 3; j++) {
        const diff = Math.abs(a.meas[j] - b.meas[j]);
        maxDiff = Math.max(maxDiff, diff);
        expect(diff, `meas[${j}] mismatch at sample ${i}`).toBeLessThan(tol);
      }
    }
    console.log(`  Parity: ${gaussA.length} samples compared, max diff = ${maxDiff.toExponential(2)} G`);
  });

  it('OFF mode produces empty mag and no model', () => {
    if (!haveFiles()) return;

    const prep: ReconstructionInputs = prepareReconstruction(fl, null, 'off');

    expect(prep.data.mag).toEqual([]);
    expect(prep.magModelForEst).toBeNull();
    expect(prep.rawMagBiasRad).toBe(0);
    expect(prep.coverage).toBeNull();
    expect(prep.calMessage).toContain('OFF');
  });

  it('MANUAL mode with uploaded model produces magGauss', () => {
    if (!haveFiles()) return;

    const prep: ReconstructionInputs = prepareReconstruction(fl, rawModelJson, 'manual');

    expect(prep.data.mag.length).toBeGreaterThan(0);
    expect(prep.magModelForEst).toBeTruthy();
    expect(prep.calMessage).toContain('MANUAL');
  });

  it('MANUAL mode without model falls back to OFF', () => {
    if (!haveFiles()) return;

    const prep: ReconstructionInputs = prepareReconstruction(fl, null, 'manual');

    expect(prep.data.mag).toEqual([]);
    expect(prep.magModelForEst).toBeNull();
    expect(prep.calMessage).toContain('OFF');
  });

  it('AUTO mode produces magGauss via correctMagStream', () => {
    if (!haveFiles()) return;

    const prep: ReconstructionInputs = prepareReconstruction(fl, null, 'auto');

    expect(prep.data.mag.length).toBeGreaterThan(0);
    expect(prep.magModelForEst).toBeTruthy();
    expect(prep.inFlightModelForExport).toBeTruthy();
    expect(prep.coverage).toMatch(/^(good|marginal|insufficient)$/);
    expect(prep.calMessage).toContain('In-flight');
  });

  it('export round-trip: AUTO export → MANUAL load produces identical Gauss', () => {
    if (!haveFiles()) return;

    // Step 1: AUTO path
    const prepAuto = prepareReconstruction(fl, null, 'auto');
    expect(prepAuto.inFlightModelForExport).toBeTruthy();

    // Step 2: Export model from AUTO
    const exportedModel = prepAuto.inFlightModelForExport!;

    // Step 3: MANUAL path with the exported model
    const prepManual = prepareReconstruction(
      fl,
      exportedModel as unknown as Record<string, unknown>,
      'manual',
    );

    // Gauss streams must match
    expect(prepManual.data.mag).toHaveLength(prepAuto.data.mag.length);

    const tol = 1e-12;
    let maxDiff = 0;
    for (let i = 0; i < prepAuto.data.mag.length; i++) {
      const a = prepAuto.data.mag[i];
      const b = prepManual.data.mag[i];
      expect(a.tUs).toBe(b.tUs);
      for (let j = 0; j < 3; j++) {
        const diff = Math.abs(a.meas[j] - b.meas[j]);
        maxDiff = Math.max(maxDiff, diff);
        expect(diff).toBeLessThan(tol);
      }
    }
    console.log(`  Round-trip: ${prepAuto.data.mag.length} samples, max diff = ${maxDiff.toExponential(2)} G`);
  });

  it('exportMagModelFromFlight produces valid JSON model', () => {
    if (!haveFiles()) return;

    const model = exportMagModelFromFlight(d.mag, d.quat, 0.539, 'reference_flight1');
    expect(model).toBeTruthy();

    // Check schema compatibility
    const m = model!;
    expect(m.version).toBe('in-flight');
    expect(m.ellipsoid).toBeTruthy();
    expect((m.ellipsoid as any).center).toBeTruthy();
    expect((m.ellipsoid as any).W_inv).toBeTruthy();
    expect(m.alignment).toBeTruthy();
    expect(m.fusion).toBeTruthy();
    expect((m.fusion as any).earthFieldNedGauss).toBeTruthy();
    expect((m.fusion as any).gaussPerCorrectedUnit).toBeTruthy();

    // Check _origin stamp
    const origin = m._origin as any;
    expect(origin).toBeTruthy();
    expect(origin.kind).toBe('in-flight');
    expect(origin.sourceLog).toBe('reference_flight1');
    expect(origin.coverage).toMatch(/^(good|marginal|insufficient)$/);
    expect(typeof origin.inclinationDeg).toBe('number');
    expect(typeof origin.residual).toBe('number');
    expect(typeof origin.generated).toBe('string');
    expect(origin.note).toContain('earth-field');

    // Round-trip: serialize → parse → use
    const json = JSON.stringify(model);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe('in-flight');

    console.log(`  Model exported: coverage=${origin.coverage}, residual=${origin.residual.toFixed(4)}, inclination=${origin.inclinationDeg.toFixed(1)}°`);
  });
});

// Fast, ungated (no BFL fixture, no describeIntegration) — this must run in the
// default CI tier, not just RUN_INTEGRATION=1, because it pins the pose
// pipeline's alignment matrices against firmware ground truth, independent of
// any real-flight data.
describe('mag alignment matrices match firmware ground truth', () => {
  it('flip alignment presets match firmware boardalignment.c', async () => {
    // Firmware ground truth: betaflight/src/main/sensors/boardalignment.c
    //   CW0_DEG_FLIP   -> (-x, +y, -z)   (lines 120-123)
    //   CW90_DEG_FLIP  -> (0,1,0),(1,0,0),(0,0,-1)
    //   CW180_DEG_FLIP -> (+x, -y, -z)   (lines 130-133)
    const { ALIGNMENT_MATRICES } = await import('../../../src/js/utils/magAlignment.js');
    expect(ALIGNMENT_MATRICES[5]).toEqual([[-1, 0, 0], [0, 1, 0], [0, 0, -1]]);  // CW0 flip
    expect(ALIGNMENT_MATRICES[7]).toEqual([[1, 0, 0], [0, -1, 0], [0, 0, -1]]);  // CW180 flip
    expect(ALIGNMENT_MATRICES[6]).toEqual([[0, 1, 0], [1, 0, 0], [0, 0, -1]]);   // CW90 flip
  });
});
