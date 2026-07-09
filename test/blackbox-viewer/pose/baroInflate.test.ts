import { describe, it, expect } from 'vitest';
import { computeBaroInflate } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';

const GRAVITY_MPS2 = 9.80665;

describe('computeBaroInflate — physics-informed propwash/climb baro sigma inflation', () => {
    it('hover: level attitude, accel ~= g, near-zero climb rate -> no inflation', () => {
        const inflate = computeBaroInflate(GRAVITY_MPS2, 1.0, 0.2);
        expect(inflate).toBeCloseTo(1.0, 3);
    });

    it('punch-out: level attitude, ~2.5G vertical accel -> substantial inflation', () => {
        const accelAbsZ = 2.5 * GRAVITY_MPS2; // ~24.5 m/s^2
        const inflate = computeBaroInflate(accelAbsZ, 1.0, 0.5);
        // excess = 2.5g - g = 1.5g ~= 14.7 m/s^2 -> +1 sigma per 5 m/s^2 -> ~2.94
        expect(inflate).toBeGreaterThan(3.5);
        expect(inflate).toBeLessThan(4.5);
    });

    it('banked turn: 45 deg bank, accel matches the load-factor-correct reading for the tilt -> no false inflation', () => {
        // Standard aviation load-factor result: a level, coordinated turn at
        // bank angle phi needs thrust/mass = g / cos(phi) to support weight
        // against the tilted lift vector -- NOT flat g. At 45 deg bank that's
        // g/cos(45deg) ~= 13.87 m/s^2, which is the EXPECTED, non-anomalous
        // reading, not evidence of extra propwash-inducing thrust.
        const bankRad = Math.PI / 4;
        const rEst22 = Math.cos(bankRad);
        const accelAbsZ = GRAVITY_MPS2 / Math.cos(bankRad);
        const inflate = computeBaroInflate(accelAbsZ, rEst22, 0.3);
        expect(inflate).toBeCloseTo(1.0, 1);
    });

    it('banked turn WITHOUT load-factor correction would falsely inflate (regression guard)', () => {
        const bankRad = Math.PI / 4;
        const accelAbsZ = GRAVITY_MPS2 / Math.cos(bankRad);
        const naiveExcess = Math.max(0, accelAbsZ - GRAVITY_MPS2);
        const naiveInflate = 1.0 + naiveExcess * 0.2;
        expect(naiveInflate).toBeGreaterThan(1.5); // the bug this function fixes
    });

    it('high climb rate alone (no excess thrust) still inflates via the climb-rate term', () => {
        const inflate = computeBaroInflate(GRAVITY_MPS2, 1.0, 8.0);
        // (8-5)*0.5 = 1.5 -> baroInflate = 2.5
        expect(inflate).toBeCloseTo(2.5, 3);
    });

    it('descent: body-Z axis aligned with world-down but climbing fast -> only climb-rate term fires', () => {
        const inflate = computeBaroInflate(GRAVITY_MPS2 * 1.02, 1.0, 6.0);
        expect(inflate).toBeGreaterThan(1.5);
        expect(inflate).toBeLessThan(2.0);
    });
});
