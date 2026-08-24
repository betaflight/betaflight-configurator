import { describe, expect, it } from "vitest";
import { coarseMinMaxStep, FINE_MIN_MAX_STEP } from "../../src/blackbox-viewer/curve_step.js";

describe("curve min/max spinner step", () => {
    it("keeps tens for wide ranges", () => {
        expect(coarseMinMaxStep({ min: -500, max: 500 })).toBe(10);
        expect(coarseMinMaxStep({ min: 0, max: 4000 })).toBe(10);
        expect(coarseMinMaxStep({ min: -50, max: 50 })).toBe(10);
    });

    it("drops to ones where tens would overshoot the range", () => {
        // The autopilot velocity curves sit at +/-10, where a step of 10 only reaches 0 or 20.
        expect(coarseMinMaxStep({ min: -10, max: 10 })).toBe(1);
        expect(coarseMinMaxStep({ min: -5, max: 5 })).toBe(1);
        expect(coarseMinMaxStep({ min: 0, max: 20 })).toBe(1);
    });

    it("drops to the fine step for very small ranges", () => {
        expect(coarseMinMaxStep({ min: -2, max: 2 })).toBe(FINE_MIN_MAX_STEP);
        expect(coarseMinMaxStep({ min: 0, max: 1 })).toBe(FINE_MIN_MAX_STEP);
    });

    it("falls back to tens when the bounds are missing or not finite", () => {
        expect(coarseMinMaxStep(undefined)).toBe(10);
        expect(coarseMinMaxStep({})).toBe(10);
        expect(coarseMinMaxStep({ min: Number.NaN, max: 10 })).toBe(10);
    });
});
