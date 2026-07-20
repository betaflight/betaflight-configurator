import { describe, it, expect } from 'vitest';
import { createEskf, eskfPredict, eskfUpdate } from '../../../src/blackbox-viewer/pose/eskf.js';
import { createGpsPositionFactor, createGpsVelocityFactor, createQuaternionPrior, createMagFactor, logMap, quatToRotMat } from '../../../src/blackbox-viewer/pose/measurements.js';
import { quatMultiply, quatFromAxisAngle, quatToEuler, quatToRot } from '../../../src/blackbox-viewer/pose/imuMechanization.js';
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

function eulerToQuat(yaw: number, pitch: number, roll: number): Quat {
    const qz = quatFromAxisAngle([0, 0, 1] as Vec3, yaw);
    const qy = quatFromAxisAngle([0, 1, 0] as Vec3, pitch);
    const qx = quatFromAxisAngle([1, 0, 0] as Vec3, roll);
    return quatMultiply(qz, quatMultiply(qy, qx));
}

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function yawErrDeg(qa: Quat, qb: Quat): number {
    let d = (quatToEuler(qa).yaw - quatToEuler(qb).yaw) * R2D;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return Math.abs(d);
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

describe("world-frame attitude-error convention (tilted-attitude regression)", () => {
    it("recovers yaw from 3-axis mag at a NON-level attitude", () => {
        const qTrue = eulerToQuat(40 * D2R, 15 * D2R, 10 * D2R);

        const mEarth: Vec3 = [0.45, 0.05, 0.12];

        const Rt = quatToRot(qTrue);
        const magMeas: Vec3 = [
            Rt[0][0] * mEarth[0] + Rt[1][0] * mEarth[1] + Rt[2][0] * mEarth[2],
            Rt[0][1] * mEarth[0] + Rt[1][1] * mEarth[1] + Rt[2][1] * mEarth[2],
            Rt[0][2] * mEarth[0] + Rt[1][2] * mEarth[1] + Rt[2][2] * mEarth[2],
        ];

        const qEst0 = eulerToQuat(0, 15 * D2R, 10 * D2R);

        const eskf = createEskf({
            p0: [0, 0, -100] as Vec3,
            v0: [0, 0, 0] as Vec3,
            q0: qEst0,
            mEarth0: mEarth,
            mBody0: [0, 0, 0] as Vec3,
            sigmaMagEarth: 0.0005,
            sigmaMagBody: 0.0005,
            sigmaAtt: 0.6,
        });

        const before = yawErrDeg(eskf.q, qTrue);
        expect(before).toBeGreaterThan(35);

        for (let i = 0; i < 60; i++) {
            const factor = createMagFactor(magMeas, 0.002);
            eskfUpdate(eskf, factor, magMeas, 1e6);
        }

        const after = yawErrDeg(eskf.q, qTrue);
        expect(after).toBeLessThan(3.0);
    });

    it("recovers attitude from the quaternion prior at a NON-level attitude", () => {
        const qTrue = eulerToQuat(-35 * D2R, 20 * D2R, -12 * D2R);
        const qEst0 = eulerToQuat(10 * D2R, 20 * D2R, -12 * D2R);

        const eskf = createEskf({
            p0: [0, 0, -100] as Vec3,
            v0: [0, 0, 0] as Vec3,
            q0: qEst0,
            sigmaAtt: 0.8,
        });

        const before = yawErrDeg(eskf.q, qTrue);
        expect(before).toBeGreaterThan(40);

        for (let i = 0; i < 40; i++) {
            const factor = createQuaternionPrior(qTrue, 0.05);
            eskfUpdate(eskf, factor, qTrue, 1e6);
        }

        const after = yawErrDeg(eskf.q, qTrue);
        expect(after).toBeLessThan(2.0);

        const qrel = quatMultiply(qTrue, [eskf.q[0], -eskf.q[1], -eskf.q[2], -eskf.q[3]] as Quat);
        const angle = 2 * Math.acos(Math.min(1, Math.abs(qrel[0]))) * R2D;
        expect(angle).toBeLessThan(2.0);
    });
});

describe("logMap near the theta=pi singularity (flip attitude residuals)", () => {
    it("recovers a pi rotation about a non-axis-aligned direction", () => {
        // An FPV quad mid-flip can present an attitude residual arbitrarily
        // close to 180 deg; before the near-pi branch was added, the
        // antisymmetric-part extraction returned ~0 there -- worst-possible
        // error read as a perfect match.
        const axis: Vec3 = [1 / 3, 2 / 3, 2 / 3]; // normalized [1,2,2]/3
        const q = quatFromAxisAngle(axis, Math.PI);
        const R = quatToRotMat(q);
        const v = logMap(R);

        // +-pi about an axis is the same rotation; accept either sign of the
        // whole vector.
        const expected: Vec3 = [axis[0] * Math.PI, axis[1] * Math.PI, axis[2] * Math.PI];
        const errPlus = Math.hypot(v[0] - expected[0], v[1] - expected[1], v[2] - expected[2]);
        const errMinus = Math.hypot(v[0] + expected[0], v[1] + expected[1], v[2] + expected[2]);
        expect(Math.min(errPlus, errMinus)).toBeLessThan(1e-6);
    });
});
