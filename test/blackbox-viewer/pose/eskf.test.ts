import { describe, it, expect } from 'vitest';
import { createEskf, eskfPredict, eskfUpdate } from '../../../src/blackbox-viewer/pose/eskf.js';
import { createGpsPositionFactor, createGpsVelocityFactor, createQuaternionPrior } from '../../../src/blackbox-viewer/pose/measurements.js';
import { generateStraightTrajectory, createRng, randn } from './synthetic.js';
import type { Vec3, Quat } from '../../../src/blackbox-viewer/pose/poseSample.js';

interface TracePoint {
    t: number;
    estN: number;
    estE: number;
    estD: number;
    trueN: number;
    trueE: number;
    trueD: number;
}

describe("eskf — forward pass on synthetic data", () => {
    it("recovers a straight trajectory from noisy GPS + perfect IMU", () => {
        const traj = generateStraightTrajectory({
            durationS: 5,
            speedMs: 10,
            headingDeg: 45,
            freqHz: 100,
        });

        const dt = 1 / 100;
        const rng = createRng(12345);

        const p0: Vec3 = [traj[0].pNed.n, traj[0].pNed.e, traj[0].pNed.d];
        const v0: Vec3 = [traj[0].vNed.n, traj[0].vNed.e, traj[0].vNed.d];
        const q0: Quat = traj[0].q;

        const eskf = createEskf({
            p0,
            v0: [v0[0] + randn(rng, 0, 1), v0[1] + randn(rng, 0, 1), v0[2] + randn(rng, 0, 0.5)] as Vec3,
            q0,
            sigmaPos: 5,
            sigmaVel: 2,
            sigmaAtt: 0.1,
        });

        const trace: TracePoint[] = [];

        for (let i = 0; i < traj.length; i++) {
            const pose = traj[i];

            const accelBody: Vec3 = [0, 0, 9.80665];
            const gyro: Vec3 = [0, 0, 0];

            eskfPredict(eskf, gyro, accelBody, dt);

            if (i % 10 === 0) {
                const gpsSigma = 2.0;
                const gpsMeas = {
                    n: pose.pNed.n + randn(rng, 0, gpsSigma),
                    e: pose.pNed.e + randn(rng, 0, gpsSigma),
                    d: pose.pNed.d + randn(rng, 0, gpsSigma),
                };

                const posFactor = createGpsPositionFactor(gpsMeas, gpsSigma);
                eskfUpdate(eskf, posFactor, gpsMeas);

                const vMeas = {
                    n: pose.vNed.n + randn(rng, 0, 0.3),
                    e: pose.vNed.e + randn(rng, 0, 0.3),
                    d: pose.vNed.d + randn(rng, 0, 0.3),
                };
                const velFactor = createGpsVelocityFactor(vMeas, 0.3);
                eskfUpdate(eskf, velFactor, vMeas);
            }

            if (i % 5 === 0) {
                const qFactor = createQuaternionPrior(pose.q, 0.05);
                eskfUpdate(eskf, qFactor, pose.q);
            }

            trace.push({
                t: pose.t,
                estN: eskf.p[0],
                estE: eskf.p[1],
                estD: eskf.p[2],
                trueN: pose.pNed.n,
                trueE: pose.pNed.e,
                trueD: pose.pNed.d,
            });
        }

        const last = trace[trace.length - 1];
        const posError = Math.sqrt(
            (last.estN - last.trueN) ** 2 +
                (last.estE - last.trueE) ** 2 +
                (last.estD - last.trueD) ** 2,
        );

        expect(posError).toBeLessThan(5.0);

        const state = eskf.p;
        const trueEnd = traj[traj.length - 1].pNed;
        const endError = Math.sqrt(
            (state[0] - trueEnd.n) ** 2 +
                (state[1] - trueEnd.e) ** 2 +
                (state[2] - trueEnd.d) ** 2,
        );
        expect(endError).toBeLessThan(3.0);
    });

    it("covariance decreases with more GPS updates", () => {
        const traj = generateStraightTrajectory({ durationS: 2, freqHz: 100, speedMs: 10, headingDeg: 0 });

        const p0: Vec3 = [0, 0, -200];
        const v0: Vec3 = [10, 0, 0];
        const q0: Quat = [1, 0, 0, 0];

        const eskf = createEskf({ p0, v0, q0, sigmaPos: 10 });

        const initialSigmaPos = Math.sqrt(
            (eskf.P[0][0] + eskf.P[1][1] + eskf.P[2][2]) / 3,
        );
        expect(initialSigmaPos).toBeCloseTo(10, 0);

        const dt = 1 / 100;
        const rng = createRng(999);

        for (let i = 0; i < traj.length; i++) {
            const pose = traj[i];
            const accelBody: Vec3 = [0, 0, 9.80665];
            const gyro: Vec3 = [0, 0, 0];

            eskfPredict(eskf, gyro, accelBody, dt);

            if (i % 10 === 0) {
                const gpsMeas = {
                    n: pose.pNed.n + randn(rng, 0, 1),
                    e: pose.pNed.e + randn(rng, 0, 1),
                    d: pose.pNed.d + randn(rng, 0, 1),
                };
                const factor = createGpsPositionFactor(gpsMeas, 1.0);
                eskfUpdate(eskf, factor, gpsMeas);
            }
        }

        const finalSigmaPos = Math.sqrt(
            Math.max(0, (eskf.P[0][0] + eskf.P[1][1] + eskf.P[2][2]) / 3),
        );
        expect(finalSigmaPos).toBeLessThan(initialSigmaPos);
    });

    it("rejects measurements outside the chi-square gate", () => {
        const traj = generateStraightTrajectory({ durationS: 3, freqHz: 100, speedMs: 5, headingDeg: 90 });
        const p0: Vec3 = [0, 0, -200];
        const v0: Vec3 = [0, 5, 0];
        const q0: Quat = traj[0].q;

        const eskf = createEskf({ p0, v0, q0, sigmaPos: 1 });
        const dt = 1 / 100;

        const rng = createRng(42);
        for (let i = 0; i < 100; i++) {
            const pose = traj[i];
            const accelBody: Vec3 = [0, 0, 9.80665];
            const gyro: Vec3 = [0, 0, 0];
            eskfPredict(eskf, gyro, accelBody, dt);

            if (i % 10 === 0) {
                const meas = { n: pose.pNed.n + randn(rng, 0, 0.5), e: pose.pNed.e + randn(rng, 0, 0.5), d: pose.pNed.d + randn(rng, 0, 0.5) };
                const factor = createGpsPositionFactor(meas, 0.5);
                eskfUpdate(eskf, factor, meas);
            }
        }

        const outlier = { n: 100, e: 0, d: -200 };
        const factor = createGpsPositionFactor(outlier, 0.5);
        const accepted = eskfUpdate(eskf, factor, outlier);
        expect(accepted).toBe(false);

        expect(Math.abs(eskf.p[0])).toBeLessThan(50);
    });
});
