import { describe, it, expect } from 'vitest';
import { createEskf, eskfUpdate } from '../../../src/blackbox-viewer/pose/eskf.js';
import { createMagFactor, createQuaternionPrior } from '../../../src/blackbox-viewer/pose/measurements.js';
import { quatMultiply, quatFromAxisAngle, quatToEuler, quatToRot } from '../../../src/blackbox-viewer/pose/imuMechanization.js';
import type { Quat, Vec3 } from '../../../src/blackbox-viewer/pose/poseSample.js';

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

describe("ESKF global attitude-error convention (tilted-attitude regression)", () => {
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
