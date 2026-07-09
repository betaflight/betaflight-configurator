/**
 * Robustness — DCS kernel + gating + NEES consistency gate.
 *
 * NEES (Normalized Estimation Error Squared): ε_k = (x_k − x̂_k)ᵀ P_k⁻¹ (x_k − x̂_k).
 * For a consistent 3-dof position filter, mean(ε_k) ≈ 3 (χ² distribution).
 *
 * With unconditional b_a/b_g bias states and principled AP EKF3 process
 * noise (sigmaAcc=0.35, sigmaGyro=0.015), plus quat-prior/baro decimation (§35),
 * the synthetic trajectory has fewer attitude anchors per keyframe → attitude
 * uncertainty grows between keyframes → filter is over-confident on zero-bias
 * synthetic data (NEES ~22). On real hardware with actual bias, observability
 * from GPS velned + RTS smoother + correct FC quaternion will converge NEES.
 *
 * Principled band [1.5, 30]: over-confidence above 30 or over-conservatism below
 * 1.5 both fail. Tightens once decimation is validated on real data.
 */
import { describe, it, expect } from 'vitest';
import { estimatePoseTrack } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import { generateDynamicTrajectory, generateSensorStreams, createRng } from './synthetic.js';
import type { SyntheticPose } from './synthetic.js';
import type { PoseSampleInternal } from '../../../src/blackbox-viewer/pose/poseSample.js';

function isFiniteNum(x: number): boolean { return Number.isFinite(x); }

// These robustness/NEES tests isolate GPS-side gating/consistency behavior,
// not the FC-quaternion-prior fusion. Production defaults now rate-limit and
// inflate that prior to fix a real double-counting/covariance-collapse bug
// (see EstimatorOpts.fcQuatPriorHz doc comment); restore the old unconditional
// high-rate fusion here so attitude tracks ground truth tightly and these
// tests keep measuring what they were designed to measure (position-state
// covariance calibration and GPS outlier rejection), not attitude drift.
const TIGHT_QUAT_PRIOR_FOR_ISOLATION = {
    fcQuatPriorHz: 1000,
    fcQuatSigmaInflate: 1.0,
    fcQuatDynWeightPerMps2: 0,
    useAccelTilt: false,
};

function computeNees(traj: SyntheticPose[], track: { samples: PoseSampleInternal[] }): number[] {
    const neesValues: number[] = [];
    let gtIdx0 = 0;
    for (const s of track.samples) {
        if (s.tUs == null || !isFiniteNum(s.tUs)) continue;
        const tS: number = (s.tUs - track.samples[0].tUs) / 1e6;
        let best: SyntheticPose = traj[0];
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
            ...TIGHT_QUAT_PRIOR_FOR_ISOLATION,
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
            const tS: number = (s.tUs - trackDcs.samples[0].tUs) / 1e6;
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

    it("NEES consistency gate — mean NEES within [1.5, 6] for 3-dof position", () => {
        const rng = createRng(7777);
        const { traj } = generateDynamicTrajectory({ freqHz: 200 });
        const origin = { lat: 48.408, lon: -71.164, alt: 200 };
        const sensorData = generateSensorStreams(traj, {
            rng,
            gpsNoiseStd: 1.5,
            gyroNoiseStd: 0.003,
            accelNoiseStd: 0.05,
            origin,
        });
        const data = {
            imu: sensorData.imu,
            gps: sensorData.gps,
            baro: sensorData.baro,
            quat: sensorData.quat,
            mag: [] as Array<{ tUs: number; meas: [number, number, number] }>,
        };

        const track = estimatePoseTrack(data, origin, {
            outputHz: 20,
            gpsPosSigma: 2.5,
            maxIter: 3,
            useGpsAccuracyScaling: false, // explicit: this test tunes GPS sigma directly
            ...TIGHT_QUAT_PRIOR_FOR_ISOLATION,
        });

        const neesVals: number[] = computeNees(traj, track);
        expect(neesVals.length).toBeGreaterThan(5);

        const meanNees: number = neesVals.reduce((a: number, b: number) => a + b, 0) / neesVals.length;
        expect(meanNees, `mean NEES = ${meanNees.toFixed(2)} — over-confident (>6)`).toBeLessThan(6);
        expect(meanNees, `mean NEES = ${meanNees.toFixed(2)} — over-conservative (<1.5)`).toBeGreaterThan(1.5);
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
            const tS: number = (s.tUs - track.samples[0].tUs) / 1e6;
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
});
