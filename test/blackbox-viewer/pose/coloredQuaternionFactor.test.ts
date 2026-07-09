import { describe, it, expect } from 'vitest';
import { createColoredQuaternionFactor, quaternionLogResidual } from '../../../src/blackbox-viewer/pose/measurements.js';
import type { Quat, Vec3 } from '../../../src/blackbox-viewer/pose/poseSample.js';

describe('createColoredQuaternionFactor / quaternionLogResidual — math sanity', () => {
    it('quaternionLogResidual is ~zero when measurement matches estimate', () => {
        const q: Quat = [1, 0, 0, 0];
        const r = quaternionLogResidual(q, q);
        expect(Math.hypot(r[0], r[1], r[2])).toBeLessThan(1e-9);
    });

    it('quaternionLogResidual recovers a known small-angle rotation', () => {
        const angle = 0.1; // rad, about world X
        const qMeas: Quat = [Math.cos(angle / 2), Math.sin(angle / 2), 0, 0];
        const qEst: Quat = [1, 0, 0, 0];
        const r = quaternionLogResidual(qMeas, qEst);
        expect(r[0]).toBeCloseTo(angle, 3);
        expect(Math.abs(r[1])).toBeLessThan(1e-9);
        expect(Math.abs(r[2])).toBeLessThan(1e-9);
    });

    it('the factor exposes the precomputed whitened residual unchanged (residual() ignores x)', () => {
        const qMeas: Quat = [1, 0, 0, 0];
        const rWhite: Vec3 = [0.01, -0.02, 0.03];
        const factor = createColoredQuaternionFactor(qMeas, rWhite, 0.02, 0.1);
        const r = factor.residual(qMeas, { p: [0, 0, 0], v: [0, 0, 0], q: [1, 0, 0, 0] });
        expect(r).toEqual(rWhite);
    });

    it('whitened sigma is smaller than raw sigma at phi=0.9 (sqrt(1-phi^2)~0.436x) -- documents why full-rate fusion needs this to be a CORRECT reduction, not just a guess', () => {
        const phi = 0.9;
        const whiteningFactor = Math.sqrt(1 - phi * phi);
        expect(whiteningFactor).toBeCloseTo(0.4359, 3);
        // A rough (unfit) phi=0.9 shrinks the trusted sigma to <44% of the raw
        // value -- this is the documented real-data divergence's root cause
        // (see EstimatorOpts.fcQuatColoredNoise's doc comment): an unfit,
        // guessed phi can make full-rate fusion trust the residual FAR more
        // tightly than intended, not less.
        expect(whiteningFactor).toBeLessThan(0.5);
    });
});
