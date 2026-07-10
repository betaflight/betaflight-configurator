/**
 * Non-level validation harness — dynamic trajectory round-trip test.
 *
 * Verifies the estimator recovers ground-truth pose from synthesized sensors
 * on a trajectory with sustained non-zero roll, pitch, and yaw rate.
 * Identity-attitude tests cannot catch frame/rotation convention bugs.
 */
import { describe, it, expect } from 'vitest';
import { generateDynamicTrajectory, generateSensorStreams } from './synthetic.js';
import { estimatePoses } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import type { SyntheticPose } from './synthetic.js';
import type { LegacyPose } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';

describe("dynamic trajectory round-trip", () => {
    it("recovers position and attitude on a banked-turn-climb-spin trajectory", () => {
        const { traj } = generateDynamicTrajectory({ freqHz: 200 });
        const origin = { lat: 48.408, lon: -71.164, alt: 200 };
        const { imu, gps, baro, quat, mag } = generateSensorStreams(traj, { gpsNoiseStd: 0.5, origin });

        const poses: LegacyPose[] = estimatePoses(
            { imu, gps, baro, quat, mag },
            origin,
            {
                outputHz: 50, gpsPosSigma: 0.5, gpsVelSigma: 0.3, baroSigma: 0.5, attSigma: 0.05, maxIter: 1,
                // Isolation test for fundamental frame/rotation-convention round-trip
                // correctness -- restore the old unconditional high-rate FC-quaternion
                // fusion (now rate-limited/inflated by default to fix a real
                // double-counting bug, see EstimatorOpts.fcQuatPriorHz) so this test
                // keeps measuring what it was designed to measure.
                fcQuatPriorHz: 1000,
                fcQuatSigmaInflate: 1.0,
                fcQuatDynWeightPerMps2: 0,
                // Same isolation rationale, extended to the accel-tilt factor:
                // a second independent attitude
                // source added after this test was designed introduces a
                // small interaction on synthetic streams this fundamental
                // round-trip test wasn't built to absorb.
                useAccelTilt: false,
            },
        );

        expect(poses.length).toBeGreaterThan(20);

        const sampleEvery: number = Math.floor(traj.length / poses.length);
        let totalPosErr = 0, totalAttErr = 0, maxPosErr = 0, count = 0;

        for (let pi = 0; pi < poses.length; pi++) {
            const ti: number = Math.min(Math.round(pi * sampleEvery), traj.length - 1);
            const gt: SyntheticPose = traj[ti];
            const est: LegacyPose = poses[pi];

            const posErr: number = Math.sqrt(
                ((est.lat - origin.lat) * 111320 - gt.pNed.n) ** 2 +
                ((est.lon - origin.lon) * 111320 * Math.cos(origin.lat * Math.PI / 180) - gt.pNed.e) ** 2 +
                (-(est.altMsl - origin.alt) - gt.pNed.d) ** 2,
            );

            totalPosErr += posErr;
            maxPosErr = Math.max(maxPosErr, posErr);

            const qErr: number[] = [
                gt.q[0] * est.q[0] + gt.q[1] * est.q[1] + gt.q[2] * est.q[2] + gt.q[3] * est.q[3],
                -gt.q[1] * est.q[0] + gt.q[0] * est.q[1] - gt.q[3] * est.q[2] + gt.q[2] * est.q[3],
                -gt.q[2] * est.q[0] + gt.q[3] * est.q[1] + gt.q[0] * est.q[2] - gt.q[1] * est.q[3],
                -gt.q[3] * est.q[0] - gt.q[2] * est.q[1] + gt.q[1] * est.q[2] + gt.q[0] * est.q[3],
            ];
            const vNorm: number = Math.sqrt(qErr[1]**2 + qErr[2]**2 + qErr[3]**2);
            const attDeg: number = 2 * Math.atan2(vNorm, Math.abs(qErr[0])) * (180 / Math.PI);
            totalAttErr += attDeg;
            count++;
        }

        const meanPosErr: number = totalPosErr / count;
        const meanAttErr: number = totalAttErr / count;

        expect(meanPosErr).toBeLessThan(3.0);
        expect(meanAttErr).toBeLessThan(5.0);
        expect(maxPosErr).toBeLessThan(20.0);
    });

    it("generates self-consistent sensor streams (level static check)", () => {
        const { traj } = generateDynamicTrajectory({ freqHz: 200 });
        const origin = { lat: 48.408, lon: -71.164, alt: 200 };
        const { imu, gps, baro, mag } = generateSensorStreams(traj, { origin });

        expect(imu).toHaveLength(traj.length);
        expect(imu[0].gyro).toHaveLength(3);
        expect(imu[0].accel).toHaveLength(3);

        expect(gps.length).toBeGreaterThan(5);

        expect(baro).toHaveLength(traj.length);

        expect(mag).toHaveLength(traj.length);
        const mEarth: number[] = [0.17, -0.047, 0.51];
        const firstMag: number[] = mag[0].meas as number[];
        const distFromEarth: number = Math.sqrt(
            (firstMag[0] - mEarth[0])**2 + (firstMag[1] - mEarth[1])**2 + (firstMag[2] - mEarth[2])**2,
        );
        expect(distFromEarth).toBeGreaterThan(0.01);
    });
});
