/**
 * Mag transform validation probe.
 *
 * Loads reference_flight1 BFL, applies correctMagToBody (raw body vectors from the
 * wizard), then tests TWO transforms against the frame-adapted quaternion:
 *
 *   OLD (reflection):  (-mBody[0], +mBody[1], +mBody[2])  det = -1
 *   NEW (X↔Y SWAP):    (-mBody[1], +mBody[0], +mBody[2])  det = +1  [90° about +Z]
 *
 * For each transform we compute e_i = R(q_Q1_i) · m_body_FRD_i across ALL
 * available samples where both mag and quat are present at matching timestamps,
 * then report:
 *   (a) 3D consistency = |mean(e)| / mean(|e|)  — Rayleigh-style vector alignment
 *   (b) Horizontal field bearing mean and std vs WMM declination -15.33°
 *   (c) Determinant of the transform matrix
 *   (d) |m_earth| estimate (|mean(e)|) vs WMM 0.539 G
 *   (e) dot(WMM_NED, individual e_i) stats (median, p90, CV)
 *
 * Quantitative output goes to the console.log summary lines below.
 */
import { it, beforeAll, expect } from 'vitest';
import { describeIntegration } from './testHelpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestFlightLog, loadFlightLogFromBuffer } from '../../../src/blackbox-viewer/pose/flightIngestion.js';
import { correctMagToBody } from '../../../src/blackbox-viewer/pose/mag_correction.js';
import { loadMagCharacterizationModel } from '../../../src/blackbox-viewer/pose/mag_model.js';
import type { Quat, Vec3 } from '../../../src/blackbox-viewer/pose/poseSample.js';

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
const BFL_DIR: string = path.resolve(__dirname, './__fixtures__/reference_flight1');
const BFL_PATH: string = path.join(BFL_DIR, 'LOG00007.BFL');
const MODEL_PATH: string = path.join(BFL_DIR, 'reference_flight1_mag_model.json');

const D: number = 180 / Math.PI;

interface MagCorrectionResult {
    mBody: number[];
    gaussPerCorrectedUnit: number | null;
}

interface MagSample {
    tUs: number;
    meas: Vec3;
}

interface QuatSample {
    tUs: number;
    q: Quat;
}

interface MagQuatPair {
    tUs: number;
    mag: MagSample;
    quat: QuatSample;
    dtMs: number;
}

function quatToR(q: Quat): number[][] {
    const [w, x, y, z] = q;
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    ];
}

function rotVec(R: number[][], v: number[]): number[] {
    return [
        R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
        R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
        R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
    ];
}

function mag3(v: number[]): number { return Math.hypot(v[0], v[1], v[2]); }
function median(xs: number[]): number { const a: number[] = [...xs].sort((p: number, q: number) => p - q); return a.length ? a[a.length >> 1] : NaN; }
function mean(xs: number[]): number {
    if (!xs.length) return NaN;
    let s = 0;
    for (const x of xs) { s += x; }
    return s / xs.length;
}
function std(xs: number[], mu?: number): number {
    if (xs.length < 2) return NaN;
    const m: number = mu ?? mean(xs);
    let s = 0;
    for (const x of xs) { s += (x - m) ** 2; }
    return Math.sqrt(s / (xs.length - 1));
}
function wrap180(d: number): number {
    let v: number = d;
    while (v > 180) { v -= 360; }
    while (v < -180) { v += 360; }
    return v;
}
function det3x3(M: number[][]): number {
    return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
         - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
         + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
}

function pairMagQuat(magSamples: MagSample[], quatSamples: QuatSample[]): MagQuatPair[] {
    const pairs: MagQuatPair[] = [];
    for (const m of magSamples) {
        let bestQ: QuatSample | null = null;
        let bestDt: number = Infinity;
        for (const q of quatSamples) {
            const dt: number = Math.abs(q.tUs - m.tUs);
            if (dt < bestDt) { bestDt = dt; bestQ = q; }
        }
        if (bestQ && bestDt < 0.2e6) {
            pairs.push({ tUs: m.tUs, mag: m, quat: bestQ, dtMs: bestDt / 1000 });
        }
    }
    return pairs;
}

interface TransformResult {
    n: number;
    consistency: number;
    meanEarth_gauss: number[];
    meanMagGauss: number;
    pctWmm: number;
    dotWMM_median: number;
    dotWMM_p90: number;
    horizBearingMean: number;
    horizBearingStd: number;
    horizBearingErrorDecl: number;
    cvMagnitudes: number;
    det: number;
}

interface ValidationResults {
    wmm: {
        field_gauss: number;
        declination_deg: number;
        inclination_deg: number;
        ned_gauss: { n: number; e: number; d: number };
    };
    old_reflection: TransformResult;
    new_xswap_y: TransformResult;
    comparison: {
        consistency_improvement: string;
        pctWmm_improvement: string;
        bearing_std_improvement: string;
        bearing_mean_new: string;
        bearing_error_new: string;
        old_is_reflection: boolean;
        new_is_proper_rotation: boolean;
    };
}

describeIntegration("mag transform validation", () => {
    let wmmNed: number[];
    let wmmDecl: number;
    let wmmMag: number;
    let results: ValidationResults;

    beforeAll(async () => {
        const fl: unknown = await loadFlightLogFromBuffer(new Uint8Array(fs.readFileSync(BFL_PATH)));
        const d = ingestFlightLog(fl as Parameters<typeof ingestFlightLog>[0]);

        const modelJson = JSON.parse(fs.readFileSync(MODEL_PATH, "utf8"));
        const mr = loadMagCharacterizationModel(modelJson);
        const model = mr.model;
        const geo = modelJson.geo_reference;
        const incl: number = geo.inclination_deg * Math.PI / 180;
        const decl: number = geo.declination_deg * Math.PI / 180;
        const fieldG: number = geo.field_strength_nt / 1e5;
        const bH: number = fieldG * Math.cos(incl);
        wmmNed = [
            bH * Math.cos(decl),
            bH * Math.sin(decl),
            fieldG * Math.sin(incl),
        ];
        wmmDecl = geo.declination_deg;
        wmmMag = fieldG;

        const pairs: MagQuatPair[] = pairMagQuat(d.mag as MagSample[], d.quat as QuatSample[]);
        console.log(`paired ${pairs.length} mag+quat samples`);

        function evaluate(
            name: string,
            txFn: (mBody: number[], gpu: number) => number[],
            matrix: number[][] | null,
        ): TransformResult {
            const eWorld: number[][] = [];
            for (const p of pairs) {
                const r: MagCorrectionResult | null = correctMagToBody(p.mag.meas, model!);
                if (!r) continue;
                const gpu: number = r.gaussPerCorrectedUnit ?? 1;
                const mFrd: number[] = txFn(r.mBody, gpu);
                const R: number[][] = quatToR(p.quat.q);
                const ew: number[] = rotVec(R, mFrd);
                eWorld.push(ew);
            }
            const n: number = eWorld.length;

            const meanE: number[] = [0, 0, 0];
            for (const e of eWorld) { meanE[0] += e[0]; meanE[1] += e[1]; meanE[2] += e[2]; }
            meanE[0] /= n; meanE[1] /= n; meanE[2] /= n;
            const meanMag: number = mag3(meanE);

            const mags: number[] = eWorld.map(mag3);
            const meanOfMags: number = mean(mags);
            const consistency: number = meanMag / meanOfMags;

            const dots: number[] = eWorld.map((e: number[]) => e[0] * wmmNed[0] + e[1] * wmmNed[1] + e[2] * wmmNed[2]);
            const dotMedian: number = median(dots);
            const dotP90: number = [...dots].sort((a: number, b: number) => a - b)[Math.floor(0.9 * (n - 1))];

            const bearings: number[] = eWorld.map((e: number[]) => Math.atan2(e[1], e[0]) * D);
            const bearingMean: number = mean(bearings);
            const bearingStd: number = std(bearings, bearingMean);
            const bearingError: number = wrap180(bearingMean - wmmDecl);

            const pctWmm: number = (meanMag / wmmMag) * 100;

            const detM: number = matrix ? det3x3(matrix) : NaN;

            const cvMags: number = std(mags, meanOfMags) / meanOfMags;

            return {
                n,
                consistency,
                meanEarth_gauss: meanE,
                meanMagGauss: meanMag,
                pctWmm,
                dotWMM_median: dotMedian,
                dotWMM_p90: dotP90,
                horizBearingMean: bearingMean,
                horizBearingStd: bearingStd,
                horizBearingErrorDecl: bearingError,
                cvMagnitudes: cvMags,
                det: detM,
            };
        }

        const oldMatrix: number[][] = [[-1, 0, 0], [0, 1, 0], [0, 0, 1]];
        const oldResult: TransformResult = evaluate("old-reflection", (mBody: number[], gpu: number) => [
            -mBody[0] * gpu,
            mBody[1] * gpu,
            mBody[2] * gpu,
        ], oldMatrix);

        const newMatrix: number[][] = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];
        const newResult: TransformResult = evaluate("new-xswap-y", (mBody: number[], gpu: number) => [
            -mBody[1] * gpu,
            mBody[0] * gpu,
            mBody[2] * gpu,
        ], newMatrix);

        results = {
            wmm: {
                field_gauss: wmmMag,
                declination_deg: wmmDecl,
                inclination_deg: geo.inclination_deg,
                ned_gauss: { n: wmmNed[0], e: wmmNed[1], d: wmmNed[2] },
            },
            old_reflection: oldResult,
            new_xswap_y: newResult,
            comparison: {
                consistency_improvement: (newResult.consistency - oldResult.consistency).toFixed(4),
                pctWmm_improvement: (newResult.pctWmm - oldResult.pctWmm).toFixed(1),
                bearing_std_improvement: (oldResult.horizBearingStd - newResult.horizBearingStd).toFixed(1),
                bearing_mean_new: newResult.horizBearingMean.toFixed(1),
                bearing_error_new: newResult.horizBearingErrorDecl.toFixed(1),
                old_is_reflection: Math.abs(oldResult.det + 1) < 0.001,
                new_is_proper_rotation: Math.abs(newResult.det - 1) < 0.001,
            },
        };

        console.log(`OLD (-X,+Y,+Z): consistency=${oldResult.consistency.toFixed(3)}, WMM=${oldResult.pctWmm.toFixed(0)}%, bearing err=${oldResult.horizBearingErrorDecl.toFixed(1)}°`);
        console.log(`NEW (-Y,+X,+Z): consistency=${newResult.consistency.toFixed(3)}, WMM=${newResult.pctWmm.toFixed(0)}%, bearing err=${newResult.horizBearingErrorDecl.toFixed(1)}°`);
    }, 240_000);

    it("new X↔Y SWAP is a proper rotation (det = +1)", () => {
        expect(Math.abs(results.new_xswap_y.det - 1)).toBeLessThan(0.01);
    });

    it("old transform is a reflection (det = -1)", () => {
        expect(Math.abs(results.old_reflection.det + 1)).toBeLessThan(0.01);
    });

    it("new transform improves 3D consistency over old reflection", () => {
        expect(results.new_xswap_y.consistency).toBeGreaterThan(results.old_reflection.consistency);
    });

    it("new transform gives higher WMM alignment", () => {
        expect(results.new_xswap_y.pctWmm).toBeGreaterThan(results.old_reflection.pctWmm);
    });

    it("new transform horizontal bearing std is lower (better consistency) than old reflection", () => {
        expect(results.new_xswap_y.horizBearingStd).toBeLessThan(results.old_reflection.horizBearingStd);
    });
});
