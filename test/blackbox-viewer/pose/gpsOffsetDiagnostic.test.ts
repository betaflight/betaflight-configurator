/**
 * GPS Offset Diagnostic — classification.
 *
 * Runs the full estimator on reference_flight1, extracts smoothed-vs-GPS data, and
 * classifies the horizontal offset: along-track (latency) vs static/radial
 * (projection/datum) vs noisy-wander (weighting).
 *
 * Output: __fixtures__/reference_flight1/gps_offset_diagnostic.json
 *
 * Run: npx vitest run src/pose/gpsOffsetDiagnostic.test.ts
 *   or: RUN_INTEGRATION=1 npx vitest run src/pose/gpsOffsetDiagnostic.test.ts
 */

import { it, expect, beforeAll } from 'vitest';
import { describeIntegration } from './testHelpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestFlightLog, loadFlightLogFromBuffer, correctMagStream } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import type { IngestedData, MagGaussEntry, GpsEntry } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import { estimatePoseTrack } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import type { EstimatorOpts, MagModelInput } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import { loadMagCharacterizationModel } from '../../../src/blackbox-viewer/pose/mag_model.js';
import { llhToNed } from '../../../src/blackbox-viewer/pose/geodesy.js';
import { quatToR, noseBearingDeg, speed as vecSpeed, videoToTUs } from './acroGates.js';
import type { PoseSampleInternal, Quat, Vec3 } from '../../../src/blackbox-viewer/pose/poseSample.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, './__fixtures__/reference_flight1/');
const BFL_PATH = path.join(DIR, 'LOG00007.BFL');
const MODEL_PATH = path.join(DIR, 'reference_flight1_mag_model.json');
const MANIFEST_PATH = path.join(DIR, 'reference_flight1_manifest.json');
const OUT_PATH = path.join(DIR, 'gps_offset_diagnostic.json');

interface OffsetPoint {
  tUs: number;
  videoS: number;
  /** Smoothed (fused) position NED [n, e, d] meters */
  smN: number;
  smE: number;
  smD: number;
  /** Nearest GPS position NED [n, e, d] meters */
  gpsN: number;
  gpsE: number;
  gpsD: number;
  /** Horizontal offset (sm - gps) in NED */
  dN: number;
  dE: number;
  /** Horizontal offset magnitude */
  offsetM: number;
  /** Along-track component: projection onto heading (positive = sm ahead of gps = lag) */
  alongTrackM: number;
  /** Cross-track component: perpendicular to heading */
  crossTrackM: number;
  /** Nose bearing (deg) */
  headingDeg: number;
  /** Speed (m/s) */
  speedMs: number;
  /** GPS numSat */
  numSat: number;
  /** Fraction: alongTrackM / offsetM (1 = pure along-track, 0 = pure cross-track) */
  alongFraction: number;
}

interface SegmentReport {
  name: string;
  videoRange: [number, number];
  n: number;
  offsetMedianM: number;
  offsetP95M: number;
  alongTrackMedianM: number;
  crossTrackMedianM: number;
  offsetSpeedCorr: number;
  alongTrackSpeedCorr: number;
  meanSpeedMs: number;
  meanHeadingDeg: number;
  headingSpanDeg: number;
  points: OffsetPoint[];
}

interface DiagnosticReport {
  source: string;
  timestamp: string;
  summary: {
    totalPoints: number;
    offsetMedianM: number;
    offsetP95M: number;
    alongTrackMedianM: number;
    alongTrackP95M: number;
    crossTrackMedianM: number;
    crossTrackP95M: number;
    offsetSpeedCorr: number;
    alongTrackSpeedCorr: number;
  };
  classification: string;
  benignSegments: SegmentReport[];
  /** All points (for full-flight analysis) */
  allPoints: OffsetPoint[];
}

// ── Stats helpers ────────────────────────────────────────────────────────
function pearsonR(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 3) return NaN;
  let sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i]; sumB += b[i];
    sumAA += a[i] ** 2; sumBB += b[i] ** 2;
    sumAB += a[i] * b[i];
  }
  const num = n * sumAB - sumA * sumB;
  const den = Math.sqrt((n * sumAA - sumA ** 2) * (n * sumBB - sumB ** 2));
  return den === 0 ? 0 : num / den;
}

function medianSorted(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function median(arr: number[]): number {
  return medianSorted([...arr].sort((a, b) => a - b));
}

function p95(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.95)];
}

function wrap180(d: number): number {
  return ((d + 180) % 360 + 360) % 360 - 180;
}

// ── Build per-point data ─────────────────────────────────────────────────
function buildOffsetPoints(
  samples: PoseSampleInternal[],
  gps: GpsEntry[],
  lat0: number, lon0: number, alt0: number,
  offsetSec: number,
): OffsetPoint[] {
  const points: OffsetPoint[] = [];

  for (const s of samples) {
    // Find nearest GPS entry in time (within 2s)
    let best: GpsEntry | null = null;
    let bestDt = Infinity;
    for (const g of gps) {
      const dt = Math.abs(g.tUs - s.tUs);
      if (dt < bestDt && dt < 2_000_000) {
        bestDt = dt;
        best = g;
      }
    }
    if (!best) continue;

    const gNed = llhToNed(best.lat, best.lon, best.alt ?? alt0, lat0, lon0, alt0);
    const dN = s.p[0] - gNed.n;
    const dE = s.p[1] - gNed.e;
    const offsetM = Math.hypot(dN, dE);

    const headingDeg = noseBearingDeg(s.q);
    const headingRad = headingDeg * Math.PI / 180;
    // Along-track: project [dN, dE] onto [cos(h), sin(h)]
    const alongTrackM = dN * Math.cos(headingRad) + dE * Math.sin(headingRad);
    const crossTrackM = dN * (-Math.sin(headingRad)) + dE * Math.cos(headingRad);
    const alongFraction = offsetM > 0.01 ? alongTrackM / offsetM : 0;

    const speedMs = vecSpeed(s.v);
    const videoS = s.tUs / 1e6 + offsetSec;

    points.push({
      tUs: s.tUs,
      videoS: Math.round(videoS * 100) / 100,
      smN: s.p[0], smE: s.p[1], smD: s.p[2],
      gpsN: gNed.n, gpsE: gNed.e, gpsD: gNed.d,
      dN, dE,
      offsetM,
      alongTrackM,
      crossTrackM,
      headingDeg,
      speedMs,
      numSat: best.numSat,
      alongFraction,
    });
  }
  return points;
}

function buildSegmentReport(
  name: string,
  t0Video: number, t1Video: number,
  points: OffsetPoint[],
  offsetSec: number,
): SegmentReport {
  const t0Us = videoToTUs(t0Video, offsetSec);
  const t1Us = videoToTUs(t1Video, offsetSec);
  const seg = points.filter(p => p.tUs >= t0Us && p.tUs < t1Us);

  const offsets = seg.map(p => p.offsetM);
  const alongs = seg.map(p => p.alongTrackM);
  const crosses = seg.map(p => p.crossTrackM);
  const speeds = seg.map(p => p.speedMs);
  const headings = seg.map(p => p.headingDeg);

  const os = [...offsets].sort((a, b) => a - b);
  const als = [...alongs].sort((a, b) => a - b);
  const cs = [...crosses].sort((a, b) => a - b);

  return {
    name,
    videoRange: [t0Video, t1Video],
    n: seg.length,
    offsetMedianM: medianSorted(os),
    offsetP95M: os[Math.floor(os.length * 0.95)] ?? NaN,
    alongTrackMedianM: medianSorted(als),
    crossTrackMedianM: medianSorted(cs),
    offsetSpeedCorr: pearsonR(offsets, speeds),
    alongTrackSpeedCorr: pearsonR(alongs, speeds),
    meanSpeedMs: seg.length ? speeds.reduce((a, b) => a + b, 0) / seg.length : NaN,
    meanHeadingDeg: seg.length ? headings.reduce((a, b) => a + b, 0) / seg.length : NaN,
    headingSpanDeg: seg.length ? Math.max(...headings) - Math.min(...headings) : NaN,
    points: seg,
  };
}

// ── Main diagnostic ──────────────────────────────────────────────────────
describeIntegration('GPS Offset Diagnostic', () => {
  let report: DiagnosticReport | null = null;

  const haveBfl = (): boolean => { try { fs.accessSync(BFL_PATH, fs.constants.R_OK); return true; } catch { return false; } };

  beforeAll(async () => {
    if (!haveBfl()) {
      console.warn('BFL not present, skipping GPS offset diagnostic');
      return;
    }

    // ---- 1. Ingest ----
    const flBuf = new Uint8Array(fs.readFileSync(BFL_PATH));
    const fl = await loadFlightLogFromBuffer(flBuf);
    const d: IngestedData = ingestFlightLog(fl as any);

    // ---- 2. Mag model ----
    const rawModel = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
    const mr = loadMagCharacterizationModel(rawModel);
    const magGauss: MagGaussEntry[] = mr.model
      ? correctMagStream(d.mag, mr.model as any)
      : [];
    const magModelForEst: MagModelInput | null =
      mr.model && (mr.model as any).fusion?.earthFieldNedGauss
        ? (mr.model as MagModelInput)
        : null;

    const origin = d.gpsHome || {
      lat: d.gps[0].lat,
      lon: d.gps[0].lon,
      alt: d.gps[0].alt ?? 0,
    };

    // ---- 3. Estimate ----
    const opts: EstimatorOpts = {
      outputHz: 20,
      magModel: magModelForEst,
      sigmaYawMax: 0.10,
      magGate: 3.0,
      procSigmaAcc: 5.5,
      gpsPosGate: 4.5,
      gpsVelGate: 15.0,
      gpsDelayMs: 0,            // no delay applied here; latency is analyzed separately
      useGpsAccuracyScaling: false,
    };
    const track = estimatePoseTrack(
      { ...d, mag: magGauss },
      origin,
      opts,
    );

    // ---- 4. Manifest for time mapping ----
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const offsetSec = manifest.alignment.offsetSec;

    // ---- 5. Build per-point analysis ----
    const allPoints = buildOffsetPoints(
      track.samples,
      d.gps,
      origin.lat, origin.lon, origin.alt,
      offsetSec,
    );

    const offsets = allPoints.map(p => p.offsetM);
    const alongs = allPoints.map(p => p.alongTrackM);
    const crosses = allPoints.map(p => p.crossTrackM);
    const speeds = allPoints.map(p => p.speedMs);

    const os = [...offsets].sort((a, b) => a - b);
    const als = [...alongs].sort((a, b) => a - b);
    const cs = [...crosses].sort((a, b) => a - b);

    // ---- 6. Benign segment definitions ----
    // From the flight narrative, we want:
    // (a) ORBIT segments — gentle, constant-speed, circling (~78-108s)
    // (b) Turn/climb gap — between back_flip and high_climb (~150-154s)
    // (c) Post-takeoff cruise — between takeoff and orbit1 (~9-78s, excluding any aggressive)
    // (d) Post-climb cruise — between climb_fall end and backward_flight (~167-190s)

    const benignSegments: SegmentReport[] = [
      // Orbit 1 (left crab): 78-94s
      buildSegmentReport('orbit1_look_left', 78, 94, allPoints, offsetSec),
      // Orbit 2 (right crab): 96-108s
      buildSegmentReport('orbit2_look_right', 96, 108, allPoints, offsetSec),
      // Turn before climb: 150-154s (between back_flip end and climb start)
      buildSegmentReport('turn_before_climb', 150, 154, allPoints, offsetSec),
      // Post-climb cruise: 167-190s
      buildSegmentReport('post_climb_cruise', 167, 190, allPoints, offsetSec),
      // Entire orbit phase: 78-108s
      buildSegmentReport('orbits_combined', 78, 108, allPoints, offsetSec),
    ];

    // ---- 7. Classification ----
    // Key tests:
    // - If offset is mostly along-track AND scales with speed → LATENCY
    // - If offset is mostly static/radial AND invariant with heading → PROJECTION/DATUM
    // - If offset is noisy with no speed/heading correlation → WEIGHTING

    const alongFractionMedian = median(allPoints.filter(p => p.offsetM > 0.5)
      .map(p => Math.abs(p.alongFraction)));
    const alongSpeedCorr = pearsonR(alongs, speeds);
    const offsetSpeedCorr = pearsonR(offsets, speeds);

    // Check heading modulation: group points by heading octant, see if offset varies
    const headingGroups: Record<string, number[]> = {};
    for (const p of allPoints) {
      if (p.offsetM < 0.5 || p.speedMs < 1) continue;
      const octant = Math.floor(p.headingDeg / 45) * 45;
      const key = String(octant);
      if (!headingGroups[key]) headingGroups[key] = [];
      headingGroups[key].push(p.offsetM);
    }
    const headingMeans = Object.values(headingGroups).map(arr => arr.reduce((a, b) => a + b, 0) / arr.length);
    const headingModulation = headingMeans.length >= 2
      ? Math.max(...headingMeans) - Math.min(...headingMeans)
      : 0;

    let classification = '';
    if (Math.abs(alongSpeedCorr) > 0.3 && alongFractionMedian > 0.5) {
      classification = 'ALONG-TRACK (LATENCY-DOMINANT): offset projects onto heading direction and correlates with speed.';
    } else if (headingModulation > 2 && alongFractionMedian < 0.4) {
      classification = 'STATIC/RADIAL (PROJECTION/DATUM): offset varies with heading direction, weakly correlated with speed.';
    } else if (Math.abs(offsetSpeedCorr) < 0.2 && headingModulation < 1.5) {
      classification = 'NOISY-WANDER (WEIGHTING): offset is weakly correlated with both speed and heading. Filter under-trusts GPS.';
    } else {
      classification = `MIXED: alongFractionMedian=${alongFractionMedian.toFixed(2)}, offsetSpeedCorr=${offsetSpeedCorr.toFixed(3)}, headingModulation=${headingModulation.toFixed(2)}m, alongSpeedCorr=${alongSpeedCorr.toFixed(3)}`;
    }

    report = {
      source: 'gpsOffsetDiagnostic.test.ts',
      timestamp: new Date().toISOString(),
      summary: {
        totalPoints: allPoints.length,
        offsetMedianM: medianSorted(os),
        offsetP95M: os[Math.floor(os.length * 0.95)] ?? NaN,
        alongTrackMedianM: medianSorted(als),
        alongTrackP95M: als[Math.floor(als.length * 0.95)] ?? NaN,
        crossTrackMedianM: medianSorted(cs),
        crossTrackP95M: cs[Math.floor(cs.length * 0.95)] ?? NaN,
        offsetSpeedCorr,
        alongTrackSpeedCorr: alongSpeedCorr,
      },
      classification,
      benignSegments,
      allPoints,
    };

    fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n=== GPS Offset Diagnostic written to ${OUT_PATH} ===`);
  });

  it('writes diagnostic report', () => {
    if (!report) {
      console.warn('Report not generated (BFL missing or beforeAll skipped)');
      return;
    }
    console.log('\n=== GPS OFFSET CLASSIFICATION ===');
    console.log(`Total points: ${report.summary.totalPoints}`);
    console.log(`Offset median: ${report.summary.offsetMedianM.toFixed(2)} m, p95: ${report.summary.offsetP95M.toFixed(2)} m`);
    console.log(`Along-track median: ${report.summary.alongTrackMedianM.toFixed(2)} m, p95: ${report.summary.alongTrackP95M.toFixed(2)} m`);
    console.log(`Cross-track median: ${report.summary.crossTrackMedianM.toFixed(2)} m, p95: ${report.summary.crossTrackP95M.toFixed(2)} m`);
    console.log(`Offset-speed correlation: ${report.summary.offsetSpeedCorr.toFixed(3)}`);
    console.log(`Along-track-speed correlation: ${report.summary.alongTrackSpeedCorr.toFixed(3)}`);
    console.log(`\nCLASSIFICATION: ${report.classification}`);
    console.log('\n--- Benign segment breakdown ---');
    for (const seg of report.benignSegments) {
      console.log(`  ${seg.name} [${seg.videoRange[0]}-${seg.videoRange[1]}s]: n=${seg.n}, offset median=${seg.offsetMedianM.toFixed(2)}m p95=${seg.offsetP95M.toFixed(2)}m, along=${seg.alongTrackMedianM.toFixed(2)}m, cross=${seg.crossTrackMedianM.toFixed(2)}m, speedCorr=${seg.offsetSpeedCorr.toFixed(3)}, alongSpeedCorr=${seg.alongTrackSpeedCorr.toFixed(3)}, meanSpeed=${seg.meanSpeedMs.toFixed(1)}m/s, meanHeading=${seg.meanHeadingDeg.toFixed(1)}°`);
    }

    // Publish key statistics for report
    console.log('\n=== KEY NUMBERS FOR REPORT ===');
    console.log(`Global offset median: ${report.summary.offsetMedianM.toFixed(2)} m`);
    console.log(`Global along-track median: ${report.summary.alongTrackMedianM.toFixed(2)} m`);
    console.log(`Global offset-speed corr: ${report.summary.offsetSpeedCorr.toFixed(3)}`);
    console.log(`Global along-speed corr: ${report.summary.alongTrackSpeedCorr.toFixed(3)}`);

    // Also print along-track sign distribution
    const alongSigns = report.allPoints.filter(p => p.offsetM > 0.5).map(p => Math.sign(p.alongTrackM));
    const posCount = alongSigns.filter(s => s > 0).length;
    const negCount = alongSigns.filter(s => s < 0).length;
    console.log(`Along-track sign: ${posCount} positive (sm ahead of GPS), ${negCount} negative (sm behind GPS)`);
    if (posCount > alongSigns.length * 0.7) {
      console.log('>>> Consistent positive along-track: ESTIMATOR LEADS GPS (latency hypothesis SUPPORTED)');
    } else if (negCount > alongSigns.length * 0.7) {
      console.log('>>> Consistent negative along-track: ESTIMATOR LAGS GPS');
    }

    expect(report.summary.totalPoints).toBeGreaterThan(0);
  });
});
