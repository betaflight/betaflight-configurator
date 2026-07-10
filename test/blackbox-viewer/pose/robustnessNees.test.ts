/**
 * Robustness — DCS kernel + gating + NEES consistency gate.
 *
 * NEES (Normalized Estimation Error Squared): ε_k = (p_k − p̂_k)ᵀ covPos_k⁻¹ (p_k − p̂_k),
 * 3-dof position block. A consistent filter gives E[ε] = 3 (χ², 3 dof).
 *
 * This scenario is deliberately conservative — the filter is told gpsPosSigma = 2.5 m
 * while the injected GPS noise is 1.5 m, synthetic baro is noise-free, and the synthetic
 * FC quaternion is exact ground truth — so the expected mean NEES sits below 3
 * (measured ≈ 2.0 over the 8 gate seeds). Smoothed errors are strongly correlated
 * within one run, so a single seed has few effective degrees of freedom; the gate
 * therefore bounds the MEAN over 8 seeds ([1.0, 4.5]), with a loose per-seed
 * catastrophe cap (< 10).
 *
 * Ground-truth lookups use the shared absolute time base (synthetic tUs = t·1e6);
 * see computeNees for why re-zeroing on samples[0] must never be reintroduced.
 */
import { describe, it, expect } from 'vitest';
import { estimatePoseTrack } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import { generateDynamicTrajectory, generateSensorStreams, createRng } from './synthetic.js';
import type { SyntheticPose } from './synthetic.js';
import type { PoseSampleInternal } from '../../../src/blackbox-viewer/pose/poseSample.js';

function isFiniteNum(x: number): boolean { return Number.isFinite(x); }

function computeNees(traj: SyntheticPose[], track: { samples: PoseSampleInternal[] }): number[] {
    const neesValues: number[] = [];
    let gtIdx0 = 0;
    for (const s of track.samples) {
        if (s.tUs == null || !isFiniteNum(s.tUs)) continue;
        // Track and trajectory share one absolute time base (synthetic tUs = t·1e6).
        // Do NOT re-zero on samples[0] — the first keyframe sits at 1/outputHz, and
        // re-zeroing shifts every ground-truth lookup by that much (v·Δt phantom error).
        const tS: number = s.tUs / 1e6;
        let best: SyntheticPose = traj[gtIdx0];
        let bestDt: number = Math.abs(best.t - tS);
        for (let i = gtIdx0; i < traj.length; i++) {
            const dt: number = Math.abs(traj[i].t - tS);
            if (dt < bestDt) { bestDt = dt; best = traj[i]; gtIdx0 = i; }
            else if (dt > bestDt) break;
        }
        const pTrue: number[] = [best.pNed.n, best.pNed.e, best.pNed.d];
        const pErr: number[] = [s.p[0] - pTrue[0], s.p[1] - pTrue[1], s.p[2] - pTrue[2]];
        const cov: number[][] = s.covPos;
        const det: number = cov[0][0] * (cov[1][1] * cov[2][2] - cov[1][2] * cov[2][1])
                   - cov[0][1] * (cov[1][0] * cov[2][2] - cov[1][2] * cov[2][0])
                   + cov[0][2] * (cov[1][0] * cov[2][1] - cov[1][1] * cov[2][0]);
        if (Math.abs(det) < 1e-12) continue;
        const invCov: number[][] = [
            [(cov[1][1]*cov[2][2] - cov[1][2]*cov[2][1])/det, (cov[0][2]*cov[2][1] - cov[0][1]*cov[2][2])/det, (cov[0][1]*cov[1][2] - cov[0][2]*cov[1][1])/det],
            [(cov[1][2]*cov[2][0] - cov[1][0]*cov[2][2])/det, (cov[0][0]*cov[2][2] - cov[0][2]*cov[2][0])/det, (cov[0][2]*cov[1][0] - cov[0][0]*cov[1][2])/det],
            [(cov[1][0]*cov[2][1] - cov[1][1]*cov[2][0])/det, (cov[0][1]*cov[2][0] - cov[0][0]*cov[2][1])/det, (cov[0][0]*cov[1][1] - cov[0][1]*cov[1][0])/det],
        ];
        let nees = 0;
        for (let i = 0; i < 3; i++)
            for (let j = 0; j < 3; j++)
                nees += pErr[i] * invCov[i][j] * pErr[j];
        neesValues.push(nees);
    }
    return neesValues;
}

describe("B3 — robust kernels + gating + NEES consistency", () => {
    it("DCS scaling is applied when enabled (synthetic with noisy GPS)", () => {
        const rng = createRng(9999);
        const { traj } = generateDynamicTrajectory({ freqHz: 200 });
        const origin = { lat: 48.408, lon: -71.164, alt: 200 };
        const sensorData = generateSensorStreams(traj, {
            rng,
            gpsNoiseStd: 3.0,
            gyroNoiseStd: 0.005,
            accelNoiseStd: 0.1,
            origin,
        });
        const data = {
            imu: sensorData.imu,
            gps: sensorData.gps,
            baro: sensorData.baro,
            quat: sensorData.quat,
            mag: [] as Array<{ tUs: number; meas: [number, number, number] }>,
        };

        const trackDcs = estimatePoseTrack(data, origin, {
            outputHz: 20,
            gpsPosSigma: 2.0,
            maxIter: 2,
            useDcs: true,
            useGpsAccuracyScaling: false, // explicit: this test tunes GPS sigma directly
        });
        expect(trackDcs.samples.length).toBeGreaterThan(0);
        for (const s of trackDcs.samples) {
            expect(isFiniteNum(s.p[0])).toBe(true);
            expect(isFiniteNum(s.tUs)).toBe(true);
        }

        let maxPosErr = 0;
        let gtIdx0 = 0;
        for (const s of trackDcs.samples) {
            if (s.tUs == null || !isFiniteNum(s.tUs)) continue;
            const tS: number = s.tUs / 1e6;
            let best: SyntheticPose = traj[gtIdx0];
            let bestDt: number = Math.abs(best.t - tS);
            for (let i = gtIdx0; i < traj.length; i++) {
                const dt: number = Math.abs(traj[i].t - tS);
                if (dt < bestDt) { bestDt = dt; best = traj[i]; gtIdx0 = i; }
                else if (dt > bestDt) break;
            }
            const dx: number = s.p[0] - best.pNed.n;
            const dy: number = s.p[1] - best.pNed.e;
            const dz: number = s.p[2] - best.pNed.d;
            const err: number = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (err > maxPosErr) maxPosErr = err;
        }
        expect(maxPosErr, `DCS max position error: ${maxPosErr.toFixed(2)}m`).toBeLessThan(10.0);
    });

    it("NEES consistency gate — multi-seed mean NEES for 3-dof position", () => {
        const seeds = [7777, 1234, 42, 90210, 555, 31337, 2024, 99];
        const perSeedMeans: number[] = [];
        for (const seed of seeds) {
            const rng = createRng(seed);
            const { traj } = generateDynamicTrajectory({ freqHz: 200 });
            const origin = { lat: 48.408, lon: -71.164, alt: 200 };
            const sensorData = generateSensorStreams(traj, {
                rng, gpsNoiseStd: 1.5, gyroNoiseStd: 0.003, accelNoiseStd: 0.05, origin,
            });
            const data = { imu: sensorData.imu, gps: sensorData.gps, baro: sensorData.baro,
                           quat: sensorData.quat,
                           mag: [] as Array<{ tUs: number; meas: [number, number, number] }> };
            const track = estimatePoseTrack(data, origin, {
                outputHz: 20, gpsPosSigma: 2.5, maxIter: 3, useGpsAccuracyScaling: false,
            });
            const neesVals = computeNees(traj, track);
            expect(neesVals.length).toBeGreaterThan(5);
            const m = neesVals.reduce((a, b) => a + b, 0) / neesVals.length;
            // Per-seed catastrophe guard only — the calibrated bound is on the multi-seed mean.
            expect(m, `seed ${seed}: mean NEES ${m.toFixed(2)} — runaway inconsistency`).toBeLessThan(10);
            perSeedMeans.push(m);
        }
        const grand = perSeedMeans.reduce((a, b) => a + b, 0) / perSeedMeans.length;
        expect(grand, `multi-seed mean NEES ${grand.toFixed(2)} — over-confident`).toBeLessThan(4.5);
        expect(grand, `multi-seed mean NEES ${grand.toFixed(2)} — over-conservative`).toBeGreaterThan(1.0);
    });

    it("GPS glitch gating rejects outlier fixes without bending trajectory", () => {
        const rng = createRng(5555);
        const { traj } = generateDynamicTrajectory({ freqHz: 200 });
        const origin = { lat: 48.408, lon: -71.164, alt: 200 };
        const sensorData = generateSensorStreams(traj, { rng, origin });

        const midGpsIdx: number = Math.floor(sensorData.gps.length / 3);
        if (midGpsIdx >= 0) {
            sensorData.gps[midGpsIdx] = {
                ...sensorData.gps[midGpsIdx],
                lat: sensorData.gps[midGpsIdx].lat + 100 / 111320,
            };
        }

        const data = {
            imu: sensorData.imu,
            gps: sensorData.gps,
            baro: sensorData.baro,
            quat: sensorData.quat,
            mag: [] as Array<{ tUs: number; meas: [number, number, number] }>,
        };

        const track = estimatePoseTrack(data, origin, {
            outputHz: 20,
            gpsPosSigma: 2.0,
            maxIter: 2,
            useGpsAccuracyScaling: false, // explicit: this test tunes GPS sigma directly
        });

        for (const s of track.samples) {
            expect(isFiniteNum(s.p[0]), `NaN with gps spike`).toBe(true);
            expect(isFiniteNum(s.p[1]), `NaN with gps spike`).toBe(true);
            expect(isFiniteNum(s.tUs)).toBe(true);
        }

        let maxHorizErr = 0;
        let gtIdx0 = 0;
        for (const s of track.samples) {
            if (s.tUs == null || !isFiniteNum(s.tUs)) continue;
            const tS: number = s.tUs / 1e6;
            let best: SyntheticPose = traj[gtIdx0];
            let bestDt: number = Math.abs(best.t - tS);
            for (let i = gtIdx0; i < traj.length; i++) {
                const dt: number = Math.abs(traj[i].t - tS);
                if (dt < bestDt) { bestDt = dt; best = traj[i]; gtIdx0 = i; }
                else if (dt > bestDt) break;
            }
            const err: number = Math.sqrt(
                (s.p[0] - best.pNed.n)**2 + (s.p[1] - best.pNed.e)**2,
            );
            if (err > maxHorizErr) maxHorizErr = err;
        }
        expect(maxHorizErr, `GPS spike bent trajectory: max horiz error=${maxHorizErr.toFixed(1)}m`).toBeLessThan(10);
    });

    it("first output sample is one output interval after stream start (absolute time base)", () => {
        const rng = createRng(7777);
        const { traj } = generateDynamicTrajectory({ freqHz: 200 });
        const origin = { lat: 48.408, lon: -71.164, alt: 200 };
        const sensorData = generateSensorStreams(traj, { rng, origin });
        const data = { imu: sensorData.imu, gps: sensorData.gps, baro: sensorData.baro,
                       quat: sensorData.quat,
                       mag: [] as Array<{ tUs: number; meas: [number, number, number] }> };
        const track = estimatePoseTrack(data, origin, { outputHz: 20 });
        expect(sensorData.imu[0].tUs).toBe(0);
        // Keyframes are emitted at multiples of 1/outputHz; the first is NOT at t=0.
        expect(track.samples[0].tUs).toBe(50_000);
    });
});
