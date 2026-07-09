import { describe, it, expect } from 'vitest';
import { detectMagDoubleCountRisk } from '../../../src/blackbox-viewer/pose/poseReconstruction.js';
import type { MagModelInput } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';

const activeModel: MagModelInput = {
    fusion: { earthFieldNedGauss: { n: 0.2, e: 0, d: 0.4 } },
};

describe('detectMagDoubleCountRisk — mag double-count audit', () => {
    it('flags risk when onboard mag_hardware is active AND our own mag factor is active', () => {
        const risk = detectMagDoubleCountRisk({ mag_hardware: 1 }, activeModel);
        expect(risk).toBe(true);
    });

    it('does NOT flag risk when onboard mag_hardware is NONE (0)', () => {
        const risk = detectMagDoubleCountRisk({ mag_hardware: 0 }, activeModel);
        expect(risk).toBe(false);
    });

    it('does NOT flag risk when our own mag factor is inactive (null), regardless of onboard mag', () => {
        const risk = detectMagDoubleCountRisk({ mag_hardware: 1 }, null);
        expect(risk).toBe(false);
    });

    it('does NOT flag risk when sysConfig is missing the field entirely', () => {
        const risk = detectMagDoubleCountRisk({}, activeModel);
        expect(risk).toBe(false);
    });

    it('does NOT flag risk when sysConfig itself is undefined', () => {
        const risk = detectMagDoubleCountRisk(undefined, activeModel);
        expect(risk).toBe(false);
    });
});
