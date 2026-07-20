import { describe, it, expect } from 'vitest';
import { createAccelTiltFactor } from '../../../src/blackbox-viewer/pose/measurements.js';
import { quatMultiply as quatMultiplyImu, quatFromAxisAngle } from '../../../src/blackbox-viewer/pose/imuMechanization.js';
import type { Quat, Vec3 } from '../../../src/blackbox-viewer/pose/poseSample.js';

const G = 9.80665;

function quatMultiply(a: Quat, b: Quat): Quat {
    const [aw, ax, ay, az] = a;
    const [bw, bx, by, bz] = b;
    return [
        aw * bw - ax * bx - ay * by - az * bz,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
    ];
}

function quatConjugate(q: Quat): Quat {
    return [q[0], -q[1], -q[2], -q[3]];
}

function quatAngleDeg(qa: Quat, qb: Quat): number {
    const qrel = quatMultiply(qa, quatConjugate(qb));
    const vNorm = Math.sqrt(qrel[1] ** 2 + qrel[2] ** 2 + qrel[3] ** 2);
    return 2 * Math.atan2(vNorm, Math.abs(qrel[0])) * (180 / Math.PI);
}

function eulerToQuat(roll: number, pitch: number, yaw: number): Quat {
    const cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5);
    const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
    const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
    return [
        cr * cp * cy + sr * sp * sy,
        sr * cp * cy - cr * sp * sy,
        cr * sp * cy + sr * cp * sy,
        cr * cp * sy - sr * sp * cy,
    ];
}

// Predict body-frame gravity direction the same way createAccelTiltFactor does:
// row 2 of R(q) = R(q)^T * [0,0,1].
function predictedAccelForQuat(q: Quat): Vec3 {
    const [w, x, y, z] = q;
    const r20 = 2 * (x * z - w * y);
    const r21 = 2 * (y * z + w * x);
    const r22 = 1 - 2 * (x * x + y * y);
    return [G * r20, G * r21, G * r22];
}

describe('createAccelTiltFactor — gimbal-lock-free accel-tilt anchor', () => {
    it('residual is ~zero when accel exactly matches the current (level) attitude', () => {
        const qEst: Quat = [1, 0, 0, 0];
        const accel: Vec3 = predictedAccelForQuat(qEst);
        const factor = createAccelTiltFactor(accel, qEst, 0.02, 15);
        const aNorm = Math.hypot(accel[0], accel[1], accel[2]);
        const zMeas: Vec3 = [accel[0]/aNorm, accel[1]/aNorm, accel[2]/aNorm];
        const r = factor.residual(zMeas, { p: [0, 0, 0], v: [0, 0, 0], q: qEst } as any);
        const rNorm = Math.hypot(r[0], r[1], r[2]);
        expect(rNorm).toBeLessThan(1e-9);
    });

    it('residual is ~zero when accel exactly matches a 30 deg banked attitude', () => {
        const qEst: Quat = eulerToQuat(Math.PI / 6, 0, Math.PI / 3);
        const accel: Vec3 = predictedAccelForQuat(qEst);
        const factor = createAccelTiltFactor(accel, qEst, 0.02, 15);
        const aNorm = Math.hypot(accel[0], accel[1], accel[2]);
        const zMeas: Vec3 = [accel[0]/aNorm, accel[1]/aNorm, accel[2]/aNorm];
        const r = factor.residual(zMeas, { p: [0, 0, 0], v: [0, 0, 0], q: qEst } as any);
        const rNorm = Math.hypot(r[0], r[1], r[2]);
        expect(rNorm).toBeLessThan(1e-6);
    });

    it('detects a genuine roll mismatch (estimate level, accel says 20 deg banked)', () => {
        const qEst: Quat = [1, 0, 0, 0];
        const qTrue: Quat = eulerToQuat((20 * Math.PI) / 180, 0, 0);
        const accel: Vec3 = predictedAccelForQuat(qTrue);
        const factor = createAccelTiltFactor(accel, qEst, 0.02, 15);
        const aNorm = Math.hypot(accel[0], accel[1], accel[2]);
        const zMeas: Vec3 = [accel[0]/aNorm, accel[1]/aNorm, accel[2]/aNorm];
        const r = factor.residual(zMeas, { p: [0, 0, 0], v: [0, 0, 0], q: qEst } as any);
        const rNorm = Math.asin(Math.hypot(r[0], r[1], r[2])) * (180 / Math.PI); // Convert norm of cross product back to angle
        expect(rNorm).toBeGreaterThan(15);
        expect(rNorm).toBeLessThan(25);
    });

    it('regression guard: stays finite and yaw-preserving through a near-gimbal-lock pitch (89.9 deg)', () => {
        const pitchNearVertical = (89.9 * Math.PI) / 180;
        const trueYaw = (45 * Math.PI) / 180;
        const qEst: Quat = eulerToQuat(0, pitchNearVertical, trueYaw);
        const accel: Vec3 = predictedAccelForQuat(qEst);

        const factor = createAccelTiltFactor(accel, qEst, 0.02, 15);
        const aNorm = Math.hypot(accel[0], accel[1], accel[2]);
        const zMeas: Vec3 = [accel[0]/aNorm, accel[1]/aNorm, accel[2]/aNorm];
        const r = factor.residual(zMeas, { p: [0, 0, 0], v: [0, 0, 0], q: qEst } as any);
        expect(r.every((v) => Number.isFinite(v))).toBe(true);
        const rNorm = Math.hypot(r[0], r[1], r[2]);
        expect(rNorm).toBeLessThan(1e-4);
    });

    it('R matrix is cleanly isotropic because rank-2 H inherently blocks yaw observability', () => {
        // The new direct gravity-vector measurement relies on the Jacobian `H` having zero sensitivity
        // to yaw rotations (rank 2) rather than trying to mask it with an anisotropic R matrix and a
        // fake quaternion measurement. This means R can (and should) be perfectly isotropic, eliminating
        // the previous spherical variance leak.
        const qEst: Quat = eulerToQuat(0.05, 0.02, (123 * Math.PI) / 180);
        const accel: Vec3 = predictedAccelForQuat(qEst);
        const factor = createAccelTiltFactor(accel, qEst, 0.02, 15);
        
        expect(factor.R[0][0]).toBeCloseTo(0.02 * 0.02);
        expect(factor.R[1][1]).toBeCloseTo(0.02 * 0.02);
        expect(factor.R[2][2]).toBeCloseTo(0.02 * 0.02);
        
        // Ensure off-diagonals are zero
        expect(factor.R[0][1]).toBe(0);
        expect(factor.R[0][2]).toBe(0);
        expect(factor.R[1][0]).toBe(0);
        expect(factor.R[2][0]).toBe(0);
        expect(factor.R[1][2]).toBe(0);
        expect(factor.R[2][1]).toBe(0);
    });

    it('H is the world-frame Jacobian of h(q) w.r.t. left-multiplied attitude error (finite-difference check)', () => {
        // Attitude error is injected as q <- dq (x) q (world-frame, eskf.ts), so
        // perturbing q by q_perturbed_k = quatFromAxisAngle(e_k, eps) * q must match
        // column k of H via a forward finite difference, at a non-trivial attitude
        // (yaw 90 deg + roll 30 deg) where the old body-frame Jacobian would be wrong.
        const qEst: Quat = eulerToQuat(Math.PI / 6, 0, Math.PI / 2);
        const accel: Vec3 = predictedAccelForQuat(qEst);
        const factor = createAccelTiltFactor(accel, qEst, 0.02, 15);

        const eps = 1e-6;
        const h0 = factor.h({ p: [0, 0, 0], v: [0, 0, 0], q: qEst } as any) as number[];

        const axes: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        axes.forEach((axis, k) => {
            const dq = quatFromAxisAngle(axis, eps);
            const qPerturbed = quatMultiplyImu(dq, qEst);
            const h1 = factor.h({ p: [0, 0, 0], v: [0, 0, 0], q: qPerturbed } as any) as number[];
            for (let row = 0; row < 3; row++) {
                const fd = (h1[row] - h0[row]) / eps;
                expect(fd).toBeCloseTo(factor.H[row][6 + k], 4);
            }
        });
    });
});
