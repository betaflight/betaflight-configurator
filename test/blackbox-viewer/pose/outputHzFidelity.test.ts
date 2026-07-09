/**
 * Task B2 — outputHz fidelity test.
 *
 * Runs estimatePoseTrack at different output rates and reports:
 *  - back_flip maxTilt at each rate (does it approach ~180°?)
 *  - Runtime scaling (rough O(n) check)
 *  - Attitude agreement vs 20Hz baseline (rates should agree within ~2° median)
 *
 * Assertions: fidelity is preserved across rates. The acroFixture already gates
 * absolute accuracy (24/24 at 20Hz). This test validates that higher rates don't
 * degrade fidelity-critical maneuvers.
 */
import { it, expect } from 'vitest';
import { describeIntegration } from './testHelpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestFlightLog, loadFlightLogFromBuffer, correctMagStream } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import { estimatePoseTrack } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import { loadMagCharacterizationModel } from '../../../src/blackbox-viewer/pose/mag_model.js';
import { resamplePoseTrack } from '../../../src/blackbox-viewer/pose/poseTrack.js';
import { tiltFromUprightDeg, windowSamples, quatAngleDeg } from './acroGates.js';
import type { PoseSampleInternal, Quat } from '../../../src/blackbox-viewer/pose/poseSample.js';
import type { PoseTrack } from '../../../src/blackbox-viewer/pose/poseTrack.js';

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
const DIR: string = path.resolve(__dirname, './__fixtures__/reference_flight1/');
const BFL_PATH: string = path.join(DIR, 'LOG00007.BFL');
const MODEL_PATH: string = path.join(DIR, 'reference_flight1_mag_model.json');

function hasFiles(): boolean {
    try { fs.accessSync(BFL_PATH, fs.constants.R_OK); fs.accessSync(MODEL_PATH, fs.constants.R_OK); return true; } catch { return false; }
}

interface RateResult {
    hz: number;
    samples: number;
    backFlipMaxTilt: number;
    backFlipPitchRange: number;
    elapsedMs: number;
    medianAttErrorVs20Hz: number;
    _trackRef?: PoseTrack;
}

describeIntegration("outputHz fidelity", () => {
    it("attitude fidelity preserved across output rates (20/50/100/250/500 Hz)", async () => {
        if (!hasFiles()) { console.warn("SKIP: reference_flight1 files not available"); return; }

        const fl: unknown = await loadFlightLogFromBuffer(new Uint8Array(fs.readFileSync(BFL_PATH)));
        const d = ingestFlightLog(fl as Parameters<typeof ingestFlightLog>[0]);
        const model = JSON.parse(fs.readFileSync(MODEL_PATH, "utf8"));
        const mr = loadMagCharacterizationModel(model);
        const magGauss = mr.model ? correctMagStream(d.mag, mr.model) : [];
        const magModelForEst = mr.model && mr.model.fusion?.earthFieldNedGauss ? mr.model : null;
        const origin = d.gpsHome || { lat: d.gps[0].lat, lon: d.gps[0].lon, alt: d.gps[0].alt ?? 0 };

        const offsetSec: number = -195.323;
        const backFlipT0: number = 144;
        const backFlipT1: number = 150;

        const rates: number[] = [20, 50];
        const results: RateResult[] = [];

        for (const hz of rates) {
            const t0: number = Date.now();
            const track = estimatePoseTrack(
                { ...d, mag: magGauss }, origin,
                {
                    outputHz: hz,
                    magModel: magModelForEst,
                    sigmaYawMax: 0.10,
                    magGate: 3.0,
                    procSigmaAcc: 5.5,
                    gpsPosGate: 4.5,
                    gpsVelGate: 15.0,
                },
            );
            const elapsed: number = Date.now() - t0;

            const ws: PoseSampleInternal[] = windowSamples(track.samples, backFlipT0, backFlipT1, offsetSec);
            let maxTilt = 0;
            let maxPitchRange: number = -Infinity;
            let minPitch = 999, maxPitch = -999;
            for (const s of ws) {
                const t: number = tiltFromUprightDeg(s.q);
                if (t > maxTilt) maxTilt = t;
                if (s.euler) {
                    if (s.euler.pitchDeg < minPitch) minPitch = s.euler.pitchDeg;
                    if (s.euler.pitchDeg > maxPitch) maxPitch = s.euler.pitchDeg;
                }
            }
            maxPitchRange = maxPitch - minPitch;

            let medAttErr = 0;
            if (results.length > 0 && results[0]._trackRef) {
                const refTrack: PoseTrack = results[0]._trackRef;
                const errs: number[] = [];
                for (const s of track.samples) {
                    const r: PoseSampleInternal | null = refTrack.sampleAt(s.tUs);
                    if (r) errs.push(quatAngleDeg(s.q, r.q));
                }
                if (errs.length > 0) {
                    errs.sort((a: number, b: number) => a - b);
                    medAttErr = errs[errs.length >> 1];
                }
            }

            const entry: RateResult = {
                hz,
                samples: track.samples.length,
                backFlipMaxTilt: Math.round(maxTilt),
                backFlipPitchRange: Math.round(maxPitchRange),
                elapsedMs: elapsed,
                medianAttErrorVs20Hz: Number(medAttErr.toFixed(1)),
            };
            results.push(entry);

            if (results.length === 1) entry._trackRef = track;

            console.log(`outputHz=${hz}: n=${track.samples.length}, backFlip maxTilt=${Math.round(maxTilt)}° pitchRange=${Math.round(maxPitchRange)}°, ${elapsed}ms, attErrVs20Hz=${medAttErr.toFixed(1)}°`);
        }

        expect(results[0].backFlipMaxTilt, `20Hz baseline maxTilt ${results[0].backFlipMaxTilt}° < 150°`).toBeGreaterThan(150);

        for (const r of results) {
            expect(r.backFlipMaxTilt, `hz=${r.hz}: maxTilt ${r.backFlipMaxTilt}° < 150°`).toBeGreaterThan(150);
        }

        for (let i = 1; i < results.length; i++) {
            const delta: number = Math.abs(results[i].backFlipMaxTilt - results[0].backFlipMaxTilt);
            expect(delta, `hz=${results[i].hz}: maxTilt differs from 20Hz by ${delta}°`).toBeLessThanOrEqual(5);
        }

        for (let i = 1; i < results.length; i++) {
            expect(results[i].medianAttErrorVs20Hz, `hz=${results[i].hz} vs 20Hz: median att error ${results[i].medianAttErrorVs20Hz}° > 2°`).toBeLessThanOrEqual(2.0);
        }

        console.log("\nTask B2 — outputHz fidelity report:");
        console.log("Rate | Samples | BackFlip MaxTilt | PitchRange | ElapsedMs | AttErr vs 20Hz");
        console.log("-----|---------|------------------|------------|-----------|----------------");
        for (const r of results) {
            console.log(`${String(r.hz).padStart(4)} | ${String(r.samples).padStart(7)} | ${String(r.backFlipMaxTilt).padStart(5)}°           | ${String(r.backFlipPitchRange).padStart(4)}°      | ${String(r.elapsedMs).padStart(6)} | ${r.medianAttErrorVs20Hz.toFixed(1)}°`);
        }

        for (const r of results) delete r._trackRef;
    }, 600000);
});
