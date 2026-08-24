import { describe, expect, it } from "vitest";
import { coarseMinMaxStep, FINE_MIN_MAX_STEP, needsFineStep } from "../../src/blackbox-viewer/curve_step.js";

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

describe("curve min/max fine step", () => {
    it("leaves bounds that sit on the coarse step alone", () => {
        expect(needsFineStep({ min: -500, max: 500 })).toBe(false);
        expect(needsFineStep({ min: -10, max: 10 })).toBe(false);
        expect(needsFineStep({ min: 0, max: 4000 })).toBe(false);
    });

    it("asks for the fine step when a bound falls between two coarse steps", () => {
        expect(needsFineStep({ min: -15.5, max: 15.5 })).toBe(true);
        expect(needsFineStep({ min: -505, max: 505 })).toBe(true);
    });

    it("does not trip over decimal bounds that are actually aligned", () => {
        // 0.3 % 0.1 is 0.09999999999999998, so a remainder test would call these misaligned.
        expect(needsFineStep({ min: -0.3, max: 0.7 })).toBe(false);
        expect(needsFineStep({ min: 0.1, max: 0.3 })).toBe(false);
        expect(needsFineStep({ min: -2, max: 2 })).toBe(false);
        expect(needsFineStep({ min: 0, max: 0.7 })).toBe(false);
    });

    it("still spots decimal bounds that are genuinely off the step", () => {
        expect(needsFineStep({ min: -0.25, max: 0.7 })).toBe(true);
        expect(needsFineStep({ min: 0, max: 0.05 })).toBe(true);
    });

    it("says no when the bounds are missing or not finite", () => {
        expect(needsFineStep(undefined)).toBe(false);
        expect(needsFineStep({})).toBe(false);
        expect(needsFineStep({ min: Number.NaN, max: 10 })).toBe(false);
    });
});
