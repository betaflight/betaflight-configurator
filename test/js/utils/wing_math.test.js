import { describe, it, expect } from "vitest";
import {
    tpaCurveHyperbolic,
    computeTpaCurve,
    spaSmoothStepDown,
    computeSpaCurve,
    SPA_SETPOINT_MAX,
} from "../../../src/js/utils/wing_math.js";

describe("tpaCurveHyperbolic", () => {
    it("returns pidThr0 / 100 when throttle is below stall threshold", () => {
        expect(tpaCurveHyperbolic(0, 20, 200, 70, -10)).toBeCloseTo(2, 5);
        expect(tpaCurveHyperbolic(0.1, 20, 200, 70, -10)).toBeCloseTo(2, 5);
        expect(tpaCurveHyperbolic(0.2, 20, 200, 70, -10)).toBeCloseTo(2, 5);
    });

    it("monotonically decreases from stall to full throttle", () => {
        const stall = 20,
            thr0 = 200,
            thr100 = 70,
            expo = -10;
        let prev = Infinity;
        for (let x = 0.21; x <= 1; x += 0.05) {
            const v = tpaCurveHyperbolic(x, stall, thr0, thr100, expo);
            expect(v).toBeLessThanOrEqual(prev + 1e-9);
            prev = v;
        }
    });

    it("approaches pidThr100 / 100 near x=1", () => {
        const v = tpaCurveHyperbolic(1, 20, 200, 70, -10);
        expect(v).toBeCloseTo(0.7, 1);
    });

    it("handles expoParam near the singularity (expoDivider ≈ 0)", () => {
        // expo=10 → expoDivider = 10/10 - 1 = 0 → code uses large fallback
        const v = tpaCurveHyperbolic(0.5, 20, 200, 70, 10);
        expect(Number.isFinite(v)).toBe(true);
    });
});

describe("computeTpaCurve", () => {
    it("returns points+1 samples from throttle 0..100", () => {
        const points = computeTpaCurve(20, 200, 70, -10, 50);
        expect(points.length).toBe(51);
        expect(points[0].throttle).toBe(0);
        expect(points.at(-1).throttle).toBe(100);
    });

    it("first point matches tpaCurveHyperbolic(0, ...) * 100", () => {
        const points = computeTpaCurve(20, 200, 70, -10, 100);
        const expected = tpaCurveHyperbolic(0, 20, 200, 70, -10) * 100;
        expect(points[0].multiplier).toBeCloseTo(expected, 5);
    });
});

describe("spaSmoothStepDown", () => {
    it("returns 1.0 for setpoint below left limit", () => {
        // center=500, width=200 → leftLimit=400, rightLimit=600
        expect(spaSmoothStepDown(0, 500, 200)).toBe(1);
        expect(spaSmoothStepDown(399, 500, 200)).toBe(1);
        expect(spaSmoothStepDown(400, 500, 200)).toBe(1);
    });

    it("returns 0.0 for setpoint above right limit", () => {
        expect(spaSmoothStepDown(600, 500, 200)).toBe(0);
        expect(spaSmoothStepDown(601, 500, 200)).toBe(0);
        expect(spaSmoothStepDown(1000, 500, 200)).toBe(0);
    });

    it("returns ~0.5 at the center of the transition", () => {
        // At center, t = 0.5, smooth = 0.5 * 0.5 * (3 - 1) = 0.5 → y = 1 - 0.5 = 0.5
        expect(spaSmoothStepDown(500, 500, 200)).toBeCloseTo(0.5, 5);
    });

    it("is monotonically non-increasing", () => {
        let prev = Infinity;
        for (let s = 0; s <= 1000; s += 10) {
            const v = spaSmoothStepDown(s, 500, 200);
            expect(v).toBeLessThanOrEqual(prev + 1e-9);
            prev = v;
        }
    });

    it("handles zero width without dividing by zero", () => {
        const v = spaSmoothStepDown(500, 500, 0);
        expect(Number.isFinite(v)).toBe(true);
    });
});

describe("computeSpaCurve", () => {
    it("returns points+1 samples over 0..SPA_SETPOINT_MAX", () => {
        const points = computeSpaCurve(500, 200, 100);
        expect(points.length).toBe(101);
        expect(points[0].setpoint).toBe(0);
        expect(points.at(-1).setpoint).toBe(SPA_SETPOINT_MAX);
    });

    it("first point equals 1.0 when center is above 0", () => {
        const points = computeSpaCurve(500, 200);
        expect(points[0].multiplier).toBe(1);
    });

    it("last point equals 0.0 when center is well below max", () => {
        const points = computeSpaCurve(300, 100);
        expect(points.at(-1).multiplier).toBe(0);
    });
});
