import { describe, it, expect } from 'vitest';
import { updateBaroBiasFogm } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import type { BaroBiasFogmState } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';

describe('updateBaroBiasFogm — barometric bias FOGM tracker', () => {
    it('converges toward a sustained constant bias over repeated updates', () => {
        const trueBias = 5.0; // m
        let state: BaroBiasFogmState = { bias: 0, variance: 4.0 };
        for (let i = 0; i < 200; i++) {
            state = updateBaroBiasFogm(state, 1.0, 45, 2.0, trueBias, 1.0);
        }
        expect(state.bias).toBeGreaterThan(3.5);
        expect(state.bias).toBeLessThan(trueBias + 0.5);
    });

    it('decays toward zero (mean-reverting) once the sustained bias disappears', () => {
        let state: BaroBiasFogmState = { bias: 5.0, variance: 1.0 };
        // Feed zero-innovation (bias gone) for many samples, several time constants.
        for (let i = 0; i < 300; i++) {
            state = updateBaroBiasFogm(state, 1.0, 45, 2.0, 0, 1.0);
        }
        expect(Math.abs(state.bias)).toBeLessThan(1.0);
    });

    it('variance decreases as evidence accumulates (never grows unboundedly with consistent innovations)', () => {
        let state: BaroBiasFogmState = { bias: 0, variance: 4.0 };
        const variances: number[] = [state.variance];
        for (let i = 0; i < 50; i++) {
            state = updateBaroBiasFogm(state, 1.0, 45, 2.0, 3.0, 1.0);
            variances.push(state.variance);
        }
        // Variance should settle to a steady value, not grow.
        expect(variances[variances.length - 1]).toBeLessThanOrEqual(variances[0]);
        expect(Number.isFinite(state.variance)).toBe(true);
    });

    it('is a no-op-ish single-step sanity check: small dt, small innovation gives a small bias update', () => {
        const state: BaroBiasFogmState = { bias: 0, variance: 4.0 };
        const next = updateBaroBiasFogm(state, 0.05, 45, 2.0, 0.1, 1.0);
        expect(Math.abs(next.bias)).toBeLessThan(0.1);
        expect(next.bias).toBeGreaterThan(0); // should move toward the (small, positive) innovation
    });
});
