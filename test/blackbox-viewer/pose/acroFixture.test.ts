import { it, beforeAll, expect } from 'vitest';
import { describeIntegration } from './testHelpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestFlightLog, loadFlightLogFromBuffer, correctMagStream } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import type { IngestedData, MagRawEntry, MagGaussEntry, QuatEntry, GpsEntry, ImuEntry, BaroEntry } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import { estimatePoseTrack } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import type { PoseTrack } from '../../../src/blackbox-viewer/pose/poseTrack.js';
import type { EstimatorOpts, MagModelInput } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import { loadMagCharacterizationModel } from '../../../src/blackbox-viewer/pose/mag_model.js';
import { correctMagToBody } from '../../../src/blackbox-viewer/pose/mag_correction.js';
import { llhToNed } from '../../../src/blackbox-viewer/pose/geodesy.js';
import type { NedPos } from '../../../src/blackbox-viewer/pose/geodesy.js';
import {
  gateFinite, gateNotFrozen, gateAttitudeTracksFC, gatePositionTracksGPS, gateForwardCrab,
  runSegmentGate, gateLoopClosure, gateAltDelta, gateMaxClimb,
  gateMagHeadingTracksGPS,
  quatToR, pitchDeg, windowSamples, videoToTUs,
} from './acroGates.js';
import type { GateResult, GateContext, ManifestSegment } from './acroGates.js';
import type { PoseSampleInternal, Vec3, Quat } from '../../../src/blackbox-viewer/pose/poseSample.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ManifestAlignment {
  offsetSec: number;
  ccScore: number;
  timebase: string;
}

interface ManifestCoarse {
  loopClosureM: number;
  altLowerM: number;
  maxClimbM: number;
}

interface ThresholdOverrides {
  notFrozenMinDeg?: number;
  attitudeMedianMaxDeg?: number;
  posDriftMaxM?: number;
  forwardCrabMaxDeg?: number;
  loopMaxM?: number;
  altTolM?: number;
  maxClimbTolM?: number;
  magHeadingMaxErrDeg?: number;
}

interface Manifest {
  fixture: string;
  bfl: string;
  magModel: string;
  gpsHome: { lat: number; lon: number; altMSL: number };
  alignment: ManifestAlignment;
  coarse: ManifestCoarse;
  segments: ManifestSegment[];
  thresholds?: ThresholdOverrides;
}

interface TrackBounds {
  nMin: number; nMax: number;
  eMin: number; eMax: number;
  dMin: number; dMax: number;
}

interface FixtureContext {
  samples: PoseSampleInternal[];
  imu: ImuEntry[];
  baro: BaroEntry[];
  fcQuat: QuatEntry[];
  gpsNed: Array<{ tUs: number } & NedPos>;
  offsetSec: number;
  magRaw: MagRawEntry[];
  gps: Array<{ tUs: number; course?: number; speed?: number }>;
  magGauss: MagGaussEntry[];
  magModel: Record<string, unknown> | null;
  bounds: TrackBounds;
}

interface MagModelResult {
  valid: boolean;
  error?: string;
  model?: Record<string, unknown>;
}

interface FixtureEntry {
  id: string;
  dir: string;
  bfl: string;
  manifest: string;
}

const FIXTURES: FixtureEntry[] = [
  { id: 'reference_flight1', dir: './__fixtures__/reference_flight1', bfl: 'LOG00007.BFL', manifest: 'reference_flight1_manifest.json' },
];

function assertGate(skip: boolean, gateFn: () => GateResult): void {
  if (skip) { console.warn('SKIP: fixture BFL not present'); return; }
  const r = gateFn();
  expect(r.pass, r.message).toBe(true);
}

for (const fx of FIXTURES) {
  const dir = path.resolve(__dirname, fx.dir);
  const bflPath = path.join(dir, fx.bfl);
  const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(dir, fx.manifest), 'utf8'));
  const T: ThresholdOverrides = manifest.thresholds || {};
  const haveBfl = (): boolean => { try { fs.accessSync(bflPath, fs.constants.R_OK); return true; } catch { return false; } };

  describeIntegration(`acro fixture: ${fx.id}`, () => {
    let ctx: FixtureContext | null = null;
    let modelBoundsOk = false;
    let skip = false;

    beforeAll(async () => {
      if (!haveBfl()) { skip = true; return; }
      const fl = await loadFlightLogFromBuffer(new Uint8Array(fs.readFileSync(bflPath)));
      const d: IngestedData = ingestFlightLog(fl as Parameters<typeof ingestFlightLog>[0]);

      const model: Record<string, unknown> = JSON.parse(fs.readFileSync(path.join(dir, manifest.magModel), 'utf8'));
      const mr: MagModelResult = loadMagCharacterizationModel(model);
      modelBoundsOk = !!mr.model && (mr.model as any).fusion?.qualityBounds?.bounds_ok !== false;

      const origin = d.gpsHome || { lat: d.gps[0].lat, lon: d.gps[0].lon, alt: d.gps[0].alt ?? 0 };

      const magGauss: MagGaussEntry[] = mr.model ? correctMagStream(d.mag, mr.model as any) : [];

      const sigmaYawMax = 0.10;
      const magModelForEst: MagModelInput | null =
        mr.model && (mr.model as any).fusion?.earthFieldNedGauss ? mr.model as MagModelInput : null;

      const track: PoseTrack = estimatePoseTrack(
        { ...d, mag: magGauss },
        origin,
        {
          outputHz: 20,
          magModel: magModelForEst,
          sigmaYawMax,
          magGate: 3.0,
          procSigmaAcc: 5.5,
          gpsPosGate: 4.5,
          gpsVelGate: 15.0,
        },
      );

      ctx = {
        samples: track.samples,
        imu: d.imu,
        baro: d.baro,
        fcQuat: d.quat,
        gpsNed: d.gps.map((g) => ({
          tUs: g.tUs,
          ...llhToNed(g.lat, g.lon, g.alt ?? 0, origin.lat, origin.lon, origin.alt),
        })),
        offsetSec: manifest.alignment.offsetSec,
        magRaw: d.mag,
        gps: d.gps.map((g) => ({ tUs: g.tUs, course: g.course, speed: g.speed })),
        magGauss,
        magModel: mr.model ?? null,
        bounds: (() => {
          let nMin = Infinity, nMax = -Infinity, eMin = Infinity, eMax = -Infinity, dMin = Infinity, dMax = -Infinity;
          for (const s of track.samples) {
            if (s.p[0] < nMin) { nMin = s.p[0]; }
            if (s.p[0] > nMax) { nMax = s.p[0]; }
            if (s.p[1] < eMin) { eMin = s.p[1]; }
            if (s.p[1] > eMax) { eMax = s.p[1]; }
            if (s.p[2] < dMin) { dMin = s.p[2]; }
            if (s.p[2] > dMax) { dMax = s.p[2]; }
          }
          return { nMin, nMax, eMin, eMax, dMin, dMax };
        })(),
      };
    }, 120_000);

    it('mag model loads and is validly configured (bounds_ok)', () => {
      if (skip) { console.warn('SKIP'); return; }
      expect(modelBoundsOk, 'mag model must load with bounds_ok').toBe(true);
    });

    it('auto: samples finite', () => assertGate(skip, () => gateFinite(ctx!.samples)));
    it('auto: attitude not frozen', () => assertGate(skip, () => gateNotFrozen(ctx!.samples, T.notFrozenMinDeg)));
    it('auto: attitude tracks the FC quaternion', () => assertGate(skip, () => gateAttitudeTracksFC(ctx!.samples, ctx!.fcQuat, T.attitudeMedianMaxDeg)));
    it('auto: position tracks raw GPS', () => assertGate(skip, () => gatePositionTracksGPS(ctx!.samples, ctx!.gpsNed, T.posDriftMaxM)));
    it('auto: nose tracks course on straight legs', () => assertGate(skip, () => gateForwardCrab(ctx!.samples, T.forwardCrabMaxDeg)));

    for (const seg of manifest.segments) {
      it(`segment: ${seg.name} [${seg.type}]`, () => assertGate(skip, () => runSegmentGate(ctx as GateContext, seg)));
    }

    it('coarse: loop closure', () => assertGate(skip, () => gateLoopClosure(ctx!.samples, T.loopMaxM)));
    it('coarse: takeoff↔landing altitude', () => assertGate(skip, () => gateAltDelta(ctx!.samples, manifest.coarse.altLowerM, T.altTolM)));
    it('coarse: max climb height', () => assertGate(skip, () => gateMaxClimb(ctx!.samples, manifest.coarse.maxClimbM, T.maxClimbTolM)));

    it('pitch: climb nose NOT up (R[2][0] > -0.1 at 156s video)', () => {
      if (skip) { console.warn('SKIP'); return; }
      const tUsTarget = (156 - ctx!.offsetSec) * 1e6;
      let best = ctx!.samples[0];
      let bestDt = Math.abs(ctx!.samples[0].tUs - tUsTarget);
      for (const s of ctx!.samples) {
        const dt = Math.abs(s.tUs - tUsTarget);
        if (dt < bestDt) { best = s; bestDt = dt; }
      }
      const R = quatToR(best.q);
      const noseD = R[2][0];
      const pitchDegVal = pitchDeg(best.q);
      expect(noseD,
        `nose D-component ${noseD.toFixed(4)} at video 156s ` +
        `(BB ${(tUsTarget / 1e6).toFixed(3)}s, pitch ${pitchDegVal.toFixed(1)}°) — ` +
        `nose should NOT be pitched up (need R[2][0] > -0.1)`
      ).toBeGreaterThan(-0.1);
    });

    it('pitch: fall nose DOWN (median pitch < -20° in fall window [163,167]s)', () => {
      if (skip) { console.warn('SKIP'); return; }
      const fallSamples = windowSamples(ctx!.samples, 163, 167, ctx!.offsetSec);
      if (fallSamples.length === 0) {
        console.warn('SKIP: no samples in fall window');
        return;
      }
      const pitches = fallSamples.map((s) => pitchDeg(s.q));
      pitches.sort((a, b) => a - b);
      const medPitch = pitches[pitches.length >> 1];
      const minPitch = pitches[0];
      const maxPitch = pitches[pitches.length - 1];
      const fcInWindow = windowSamples(ctx!.fcQuat, 163, 167, ctx!.offsetSec)
        .map((q) => pitchDeg(q.q));
      fcInWindow.sort((a, b) => a - b);
      const fcMedPitch = fcInWindow.length ? fcInWindow[fcInWindow.length >> 1] : NaN;

      const passMsg = `recon median pitch ${medPitch.toFixed(0)}° (range [${minPitch.toFixed(0)}, ${maxPitch.toFixed(0)}]) ` +
        `vs FC median pitch ${Number.isFinite(fcMedPitch) ? fcMedPitch.toFixed(0) : 'n/a'}° — ` +
        `need < -20° (nose DOWN). KNOWN FAILURE: low-G AHRS drift causes FC quaternion to drift nose-up during freefall.`;
      expect(medPitch, passMsg).toBeLessThan(-20);
    });

    it('pitch: mag confirms nose-down at fall (max magADC[0] > 1000 within ±1s of 165s)', () => {
      if (skip) { console.warn('SKIP'); return; }
      const magRaw = ctx!.magRaw;
      if (!magRaw || magRaw.length === 0) {
        console.warn('SKIP: no raw mag data available');
        return;
      }
      const tCenter = (165 - ctx!.offsetSec) * 1e6;
      const tLo = tCenter - 1e6;
      const tHi = tCenter + 1e6;
      let maxMagX = -Infinity;
      let countInWindow = 0;
      for (const m of magRaw) {
        if (m.tUs < tLo || m.tUs > tHi) continue;
        countInWindow++;
        const mx = Array.isArray(m.meas) ? m.meas[0] : (m.meas as unknown as number);
        if (mx > maxMagX) maxMagX = mx;
      }
      const tCenterSample = ctx!.samples.reduce((best, s) =>
        Math.abs(s.tUs - tCenter) < Math.abs(best.tUs - tCenter) ? s : best,
        ctx!.samples[0],
      );
      const reconPitch = pitchDeg(tCenterSample.q);

      expect(maxMagX,
        `max magADC[0] = ${Number.isFinite(maxMagX) ? maxMagX.toFixed(0) : 'n/a'} ADC ` +
        `over ${countInWindow} samples in [164,166]s video. ` +
        `Recon pitch at 165s = ${reconPitch.toFixed(1)}° ` +
        `(${reconPitch < 0 ? 'nose-DOWN' : 'nose-UP'}). ` +
        `Northern site inclination +71° means earth field projects strongly onto body +X when nose is DOWN. ` +
        `Need max magADC[0] > 1000 to confirm physical nose-down.`
      ).toBeGreaterThan(1000);
    });

    it('coarse: bounds within expected envelope', () => {
      if (skip) { console.warn('SKIP'); return; }
      const b = ctx!.bounds;
      const msg = `NED bounds: N[${b.nMin.toFixed(0)},${b.nMax.toFixed(0)}] E[${b.eMin.toFixed(0)},${b.eMax.toFixed(0)}] alt[${b.dMin.toFixed(0)},${b.dMax.toFixed(0)}] ` +
        `(baseline N[-55,98] E[-85,28] alt[-8,96])`;
      const ok = b.nMin > -200 && b.nMax < 200 && b.eMin > -200 && b.eMax < 200 && b.dMin > -200 && b.dMax < 200;
      expect(ok, msg).toBe(true);
    });

    it('mag: tilt-compensated heading tracks GPS course (proper rotation, no mirror)', () => {
      if (skip) { console.warn('SKIP'); return; }
      const decl = (ctx!.magModel as any)?.geoReference?.declination_deg ?? -15.33;
      const tol = T.magHeadingMaxErrDeg ?? 50;
      const g = gateMagHeadingTracksGPS(ctx!.magGauss, ctx!.fcQuat, ctx!.gps as GpsEntry[], decl, tol);
      expect(g.pass, g.message).toBe(true);
    });

    it('mag: old reflection (-X,+Y,+Z) FAILS heading-vs-GPS (det=-1 mirror)', () => {
      if (skip) { console.warn('SKIP'); return; }
      if (!ctx!.magModel || !ctx!.magRaw) {
        console.warn('SKIP: no mag model or raw data');
        return;
      }
      const decl = (ctx!.magModel as any).geoReference?.declination_deg ?? -15.33;

      const magOld: MagGaussEntry[] = [];
      for (const m of ctx!.magRaw) {
        const r = correctMagToBody(m.meas, ctx!.magModel);
        if (!r) continue;
        const gpu: number = r.gaussPerCorrectedUnit ?? 1;
        magOld.push({
          tUs: m.tUs,
          meas: [-r.mBody[0] * gpu, r.mBody[1] * gpu, r.mBody[2] * gpu] as Vec3,
        });
      }

      const g = gateMagHeadingTracksGPS(magOld, ctx!.fcQuat, ctx!.gps as GpsEntry[], decl, 25);
      const passMsg = g.pass
        ? `UNEXPECTED PASS — old reflection passed mag-heading gate ` +
          `(${g.message}). This means mag is toothless.`
        : `Expected FAIL — old reflection ${g.message}. ` +
          `The X↔Y SWAP proper rotation fixes this.`;
      expect(g.pass, passMsg).toBe(false);
    });
  });
}
