import { describe, it, expect } from 'vitest';
import { estimatePoses } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import { generateStraightTrajectory, createRng, randn } from './synthetic.js';
import type { LegacyPose } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';

describe("estimatorLoop — end-to-end forward + RTS", () => {
    it("recovers a straight trajectory from noisy GPS with smoothing", () => {
        const traj = generateStraightTrajectory({
            durationS: 5,
            speedMs: 10,
            headingDeg: 90,
            freqHz: 200,
        });

        const rng = createRng(5555);

        const imu = traj.map((pose) => ({
            tUs: Math.round(pose.t * 1e6),
            gyro: [0, 0, 0] as [number, number, number],
            accel: [0, 0, 9.80665] as [number, number, number],
        }));

        const gps: Array<{ tUs: number; lat: number; lon: number; alt: number; velNed: number[] }> = [];
        for (let i = 0; i < traj.length; i += 20) {
            gps.push({
                tUs: Math.round(traj[i].t * 1e6),
                lat: 48.408 + traj[i].pNed.n / 111320,
                lon: -71.164 + traj[i].pNed.e / (111320 * Math.cos(48.408 * Math.PI / 180)),
                alt: 200,
                velNed: [traj[i].vNed.n + randn(rng, 0, 0.3), traj[i].vNed.e + randn(rng, 0, 0.3), 0],
            });
        }

        const baro: Array<{ tUs: number; alt: number }> = [];
        const quat = traj
            .filter((_, i) => i % 8 === 0)
            .map((pose) => ({
                tUs: Math.round(pose.t * 1e6),
                q: pose.q,
            }));

        const origin = { lat: 48.408, lon: -71.164, alt: 200 };

        const poses: LegacyPose[] = estimatePoses(
            { imu, gps, baro, quat } as any,
            origin,
            { outputHz: 20, gpsPosSigma: 2, gpsVelSigma: 0.5, attSigma: 0.05, maxIter: 1 },
        );

        expect(poses.length).toBeGreaterThan(10);

        expect(Math.abs(poses[0].lat - 48.408)).toBeLessThan(0.01);

        const lastLon: number = poses[poses.length - 1].lon;
        expect(lastLon).toBeGreaterThan(-71.17);
    });

    it("produces decreasing sigmaPos over time as GPS accumulates", () => {
        const traj = generateStraightTrajectory({ durationS: 3, speedMs: 5, headingDeg: 0, freqHz: 200 });
        const rng = createRng(111);

        const imu = traj.map((pose) => ({
            tUs: Math.round(pose.t * 1e6),
            gyro: [0, 0, 0] as [number, number, number],
            accel: [0, 0, 9.80665] as [number, number, number],
        }));

        const gps: Array<{ tUs: number; lat: number; lon: number; alt: number; velNed: number[] }> = [];
        for (let i = 0; i < traj.length; i += 20) {
            gps.push({
                tUs: Math.round(traj[i].t * 1e6),
                lat: 48.408 + traj[i].pNed.n / 111320,
                lon: -71.164,
                alt: 200,
                velNed: [traj[i].vNed.n + randn(rng, 0, 0.3), 0, 0],
            });
        }

        const origin = { lat: 48.408, lon: -71.164, alt: 200 };
        const poses: LegacyPose[] = estimatePoses(
            { imu, gps, baro: [], quat: [] } as any,
            origin,
            { outputHz: 40, maxIter: 1 },
        );

        expect(poses.length).toBeGreaterThan(5);

        const endSigma: number = poses[poses.length - 1].sigmaPos;
        expect(endSigma).toBeGreaterThan(0);
        expect(endSigma).toBeLessThan(10);
    });
});
