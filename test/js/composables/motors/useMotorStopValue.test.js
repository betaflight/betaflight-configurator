import { describe, expect, it } from "vitest";
import {
    computeZeroThrottleValue,
    computeIdleThrottleValue,
} from "../../../../src/composables/motors/useMotorStopValue";

// Regression guard: firmware dshotConvertFromExternal() stops a 3D motor only at exactly 1500, so DShot 3D must send 1500, not motor3dConfig.neutral.

describe("computeZeroThrottleValue", () => {
    it("returns 1500 for DShot 3D regardless of the configured neutral", () => {
        expect(computeZeroThrottleValue(true, true, 1480, 1000)).toBe(1500);
    });

    it("returns 1500 for DShot 3D even when neutral is exactly 1500", () => {
        expect(computeZeroThrottleValue(true, true, 1500, 1000)).toBe(1500);
    });

    it("does NOT fall back to minSliderValue for DShot 3D", () => {
        // minSliderValue (1000) is high reverse throttle in 3D, not stop.
        expect(computeZeroThrottleValue(true, true, 1500, 1000)).not.toBe(1000);
    });

    it("returns the in-range configured neutral for analog PWM 3D", () => {
        expect(computeZeroThrottleValue(true, false, 1460, 1000)).toBe(1460);
    });

    it("clamps an analog 3D neutral above 1575 to 1500", () => {
        expect(computeZeroThrottleValue(true, false, 1600, 1000)).toBe(1500);
    });

    it("clamps an analog 3D neutral below 1425 to 1500", () => {
        expect(computeZeroThrottleValue(true, false, 1400, 1000)).toBe(1500);
    });

    it("treats analog 3D clamp boundary 1425 as in-range", () => {
        expect(computeZeroThrottleValue(true, false, 1425, 1000)).toBe(1425);
    });

    it("treats analog 3D clamp boundary 1575 as in-range", () => {
        expect(computeZeroThrottleValue(true, false, 1575, 1000)).toBe(1575);
    });

    it("falls back to minSliderValue when 3D mode is disabled (DShot)", () => {
        expect(computeZeroThrottleValue(false, true, 1500, 1000)).toBe(1000);
    });

    it("falls back to the analog mincommand-derived minSliderValue when 3D mode is disabled", () => {
        expect(computeZeroThrottleValue(false, false, 1500, 1070)).toBe(1070);
    });
});

describe("computeIdleThrottleValue", () => {
    it("adds the motor-idle offset (tenths of a percent) on top of the stop value", () => {
        expect(computeIdleThrottleValue(1500, 6.5)).toBe(1565);
    });

    it("adds the offset on top of an analog 3D neutral", () => {
        expect(computeIdleThrottleValue(1460, 6.5)).toBe(1525);
    });

    it("adds nothing when motor idle is zero", () => {
        expect(computeIdleThrottleValue(1000, 0)).toBe(1000);
    });
});
