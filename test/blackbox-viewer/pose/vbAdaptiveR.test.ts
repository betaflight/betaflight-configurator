import { describe, it, expect } from 'vitest';
import { createEskf, eskfPredict, eskfUpdate } from '../../../src/blackbox-viewer/pose/eskf.js';
import { createGpsPositionFactor } from '../../../src/blackbox-viewer/pose/measurements.js';
import { seededRng } from './testHelpers.js';
import type { Vec3, Quat } from '../../../src/blackbox-viewer/pose/poseSample.js';

describe('VB adaptive R (RobustOpts.vbAdaptive) — synthetic convergence sandbox', () => {
    it('Rbar converges toward the TRUE noise variance when the nominal factor sigma is wrong', () => {
        const rng = seededRng(42);
        const trueSigma = 5.0; // true GPS noise std -- deliberately far from the nominal factor sigma
        const nominalSigma = 1.0; // what the factor is told to assume

        const q0: Quat = [1, 0, 0, 0];
        const eskf = createEskf({ p0: [0, 0, 0] as Vec3, v0: [0, 0, 0] as Vec3, q0 });

        // Gaussian noise via Box-Muller from the seeded uniform RNG.
        function gauss(): number {
            const u1 = Math.max(1e-12, rng());
            const u2 = rng();
            return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        }

        let tUs = 0;
        for (let i = 0; i < 500; i++) {
            tUs += 100_000; // 10 Hz
            eskfPredict(eskf, [0, 0, 0], [0, 0, 9.80665], 0.1);
            const meas: Vec3 = [trueSigma * gauss(), trueSigma * gauss(), trueSigma * gauss()];
            const factor = createGpsPositionFactor({ n: meas[0], e: meas[1], d: meas[2] }, nominalSigma, eskf.dim);
            eskfUpdate(eskf, factor as any, { n: meas[0], e: meas[1], d: meas[2] }, 10.0, { vbAdaptive: true }, 'gpsPos', tUs);
        }

        expect(eskf.vbAdaptiveR).toBeTruthy();
        const rbar = eskf.vbAdaptiveR!['gpsPos'].Rbar;
        const recoveredSigma = Math.sqrt((rbar[0][0] + rbar[1][1] + rbar[2][2]) / 3);

        // Should have moved substantially away from the wrong nominal (1.0)
        // toward the true value (5.0) -- allow a wide band since this is a
        // single noisy realization, not an exact-convergence proof.
        expect(recoveredSigma).toBeGreaterThan(2.5);
        expect(recoveredSigma).toBeLessThan(8.0);
    });

    it('a single spurious outlier contributes bounded influence (does not blow up Rbar)', () => {
        const rng = seededRng(7);
        const q0: Quat = [1, 0, 0, 0];
        const eskf = createEskf({ p0: [0, 0, 0] as Vec3, v0: [0, 0, 0] as Vec3, q0 });
        const nominalSigma = 1.0;

        function gauss(): number {
            const u1 = Math.max(1e-12, rng());
            const u2 = rng();
            return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        }

        let tUs = 0;
        // 20 updates with real (matching-nominal-sigma) noise, establishing a
        // stable Rbar near the nominal -- NOT exactly-zero residuals, which
        // would trivially floor Rbar and make the outlier comparison meaningless.
        for (let i = 0; i < 20; i++) {
            tUs += 100_000;
            eskfPredict(eskf, [0, 0, 0], [0, 0, 9.80665], 0.1);
            const n = nominalSigma * gauss(), e = nominalSigma * gauss(), d = nominalSigma * gauss();
            const factor = createGpsPositionFactor({ n, e, d }, nominalSigma, eskf.dim);
            eskfUpdate(eskf, factor as any, { n, e, d }, 10.0, { vbAdaptive: true }, 'gpsPos', tUs);
        }
        const rbarBefore = eskf.vbAdaptiveR!['gpsPos'].Rbar[0][0];

        // One wild 100m outlier.
        tUs += 100_000;
        eskfPredict(eskf, [0, 0, 0], [0, 0, 9.80665], 0.1);
        const outlierFactor = createGpsPositionFactor({ n: 100, e: 0, d: 0 }, nominalSigma, eskf.dim);
        eskfUpdate(eskf, outlierFactor as any, { n: 100, e: 0, d: 0 }, 1000.0, { vbAdaptive: true }, 'gpsPos', tUs);

        const rbarAfter = eskf.vbAdaptiveR!['gpsPos'].Rbar[0][0];
        // A single outlier at nu~20 contributes ~1/21 weight -- should move
        // Rbar noticeably but stay bounded, nowhere near the ~100^2=10000 a
        // naive single-sample estimate would give.
        expect(rbarAfter).toBeGreaterThan(rbarBefore);
        expect(rbarAfter).toBeLessThan(1000);
    });
});
