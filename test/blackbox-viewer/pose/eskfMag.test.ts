import { describe, it, expect } from 'vitest';
import { createEskf, eskfUpdate } from '../../../src/blackbox-viewer/pose/eskf.js';
import { createMagFactor, createDeclinationFactor } from '../../../src/blackbox-viewer/pose/measurements.js';
import type { Vec3, Quat } from '../../../src/blackbox-viewer/pose/poseSample.js';

describe("eskf — 21-state with mag fusion (15-state base + 6 mag states)", () => {
    it("initializes with magnetic field states", () => {
        const eskf = createEskf({
            p0: [0, 0, -200] as Vec3,
            v0: [0, 0, 0] as Vec3,
            q0: [1, 0, 0, 0] as Quat,
            mEarth0: [0.17, -0.047, 0.51] as Vec3,
            mBody0: [0, 0, 0] as Vec3,
        });

        expect(eskf.dim).toBe(21);
        expect(eskf.mEarth).toEqual([0.17, -0.047, 0.51]);
        expect(eskf.mBody).toEqual([0, 0, 0]);
        expect(eskf.P).toHaveLength(21);
        expect(eskf.P[0]).toHaveLength(21);
        expect(eskf.ba).toEqual([0, 0, 0]);
        expect(eskf.bg).toEqual([0, 0, 0]);
    });

    it("15-state base ESKF works (no mag; b_a/b_g always-on)", () => {
        const eskf = createEskf({
            p0: [0, 0, -200] as Vec3,
            v0: [7, 7, 0] as Vec3,
            q0: [1, 0, 0, 0] as Quat,
        });

        expect(eskf.dim).toBe(15);
        expect(eskf.mEarth).toBeUndefined();
        expect(eskf.P).toHaveLength(15);
        expect(eskf.ba).toEqual([0, 0, 0]);
        expect(eskf.bg).toEqual([0, 0, 0]);
    });

    it("mag factor updates m_earth toward measurement", () => {
        const eskf = createEskf({
            p0: [0, 0, -200] as Vec3,
            v0: [0, 0, 0] as Vec3,
            q0: [1, 0, 0, 0] as Quat,
            mEarth0: [0.17, -0.047, 0.51] as Vec3,
            mBody0: [0, 0, 0] as Vec3,
            sigmaMagEarth: 0.05,
        });

        const magMeas: Vec3 = [0.18, -0.05, 0.50];
        const factor = createMagFactor(magMeas, 0.01);
        const accepted = eskfUpdate(eskf, factor, magMeas);

        expect(accepted).toBe(true);

        expect(eskf.mEarth![0]).toBeGreaterThan(0.17);
        expect(eskf.mEarth![0]).toBeLessThan(0.18);
    });

    it("declination factor constrains m_earth direction", () => {
        const eskf = createEskf({
            p0: [0, 0, -200] as Vec3,
            v0: [0, 0, 0] as Vec3,
            q0: [1, 0, 0, 0] as Quat,
            mEarth0: [0.18, -0.04, 0.51] as Vec3,
            mBody0: [0, 0, 0] as Vec3,
            sigmaMagEarth: 0.05,
        });

        const declMeas = -0.27;
        const factor = createDeclinationFactor(declMeas, 0.1);
        const accepted = eskfUpdate(eskf, factor, declMeas);

        expect(accepted).toBe(true);
        expect(eskf.mEarth![1]).toBeLessThan(-0.04);
    });

    it("mag outlier is rejected by chi-square gate", () => {
        const eskf = createEskf({
            p0: [0, 0, -200] as Vec3,
            v0: [0, 0, 0] as Vec3,
            q0: [1, 0, 0, 0] as Quat,
            mEarth0: [0.17, -0.047, 0.51] as Vec3,
            mBody0: [0, 0, 0] as Vec3,
            sigmaMagEarth: 0.01,
            sigmaMagBody: 0.01,
        });

        const factor = createMagFactor([0.17, -0.047, 0.51] as Vec3, 0.001);
        for (let i = 0; i < 5; i++) {
            eskfUpdate(eskf, factor, [0.17, -0.047, 0.51]);
        }

        const outlier: Vec3 = [10, 0, 0];
        const outlierFactor = createMagFactor(outlier, 0.01);
        const accepted = eskfUpdate(eskf, outlierFactor, outlier);

        expect(accepted).toBe(false);
        expect(Math.abs(eskf.mEarth![0] - 0.17)).toBeLessThan(0.02);
    });
});
