import { describe, expect, it } from "vitest";
import {
    computeZeroThrottleValue,
    computeIdleThrottleValue,
} from "../../../../src/composables/motors/useMotorStopValue";

// Regression guard: MotorsTab.vue's stop paths must resolve through this fn, not minSliderValue (high reverse throttle in 3D).

describe("computeZeroThrottleValue", () => {
    it("returns the 3D neutral when 3D mode is enabled and neutral is in range", () => {
        expect(computeZeroThrottleValue(true, 1500, 1000)).toBe(1500);
    });

    it("does NOT fall back to minSliderValue when 3D mode is enabled", () => {
        // Regression guard: minSliderValue (1000) is high reverse throttle in 3D, not stop.
        expect(computeZeroThrottleValue(true, 1500, 1000)).not.toBe(1000);
    });

    it("clamps an out-of-sanity-range 3D neutral above 1575 to 1500", () => {
        expect(computeZeroThrottleValue(true, 1600, 1000)).toBe(1500);
    });

    it("clamps an out-of-sanity-range 3D neutral below 1425 to 1500", () => {
        expect(computeZeroThrottleValue(true, 1400, 1000)).toBe(1500);
    });

    it("accepts a non-default in-range 3D neutral unchanged", () => {
        expect(computeZeroThrottleValue(true, 1460, 1000)).toBe(1460);
    });

    it("treats the lower clamp boundary 1425 as in-range", () => {
        expect(computeZeroThrottleValue(true, 1425, 1000)).toBe(1425);
    });

    it("treats the upper clamp boundary 1575 as in-range", () => {
        expect(computeZeroThrottleValue(true, 1575, 1000)).toBe(1575);
    });

    it("falls back to minSliderValue when 3D mode is disabled", () => {
        expect(computeZeroThrottleValue(false, 1500, 1000)).toBe(1000);
    });

    it("falls back to the analog mincommand-derived minSliderValue when 3D mode is disabled", () => {
        expect(computeZeroThrottleValue(false, 1500, 1070)).toBe(1070);
    });
});

describe("computeIdleThrottleValue", () => {
    it("adds the motor-idle offset (tenths of a percent) on top of the stop value", () => {
        expect(computeIdleThrottleValue(1500, 6.5)).toBe(1565);
    });

    it("adds the offset on top of a non-default 3D neutral", () => {
        expect(computeIdleThrottleValue(1460, 6.5)).toBe(1525);
    });

    it("adds nothing when motor idle is zero", () => {
        expect(computeIdleThrottleValue(1000, 0)).toBe(1000);
    });
});
