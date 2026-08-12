import { describe, expect, it } from "vitest";
import { getFailsafeLimits } from "../../src/js/failsafe_limits.js";

// ---------------------------------------------------------------------------
// The Failsafe tab input limits must match the firmware CLI limits of the
// connected board. When the tab was migrated to Vue the API version dependent
// limits were dropped and only the API 1.44 values survived, which made the
// inputs clamp valid values (reported: minimum start distance forced to 50m
// while the firmware range is 5-30m).
//
// The expectations below are taken from src/main/cli/settings.c of the matching
// firmware release, converted to the units shown in the UI.
// ---------------------------------------------------------------------------

describe("getFailsafeLimits", () => {
    describe("minimum start distance (gps_rescue_min_start_dist)", () => {
        it("uses the 4.3 gps_rescue_min_dth range on API 1.44", () => {
            expect(getFailsafeLimits("1.44.0").minStartDist).toEqual({ min: 50, max: 1000 });
        });

        it("uses 20-1000 on API 1.45", () => {
            expect(getFailsafeLimits("1.45.0").minStartDist).toEqual({ min: 20, max: 1000 });
        });

        it("uses 10-30 on API 1.46 and 1.47", () => {
            expect(getFailsafeLimits("1.46.0").minStartDist).toEqual({ min: 10, max: 30 });
            expect(getFailsafeLimits("1.47.0").minStartDist).toEqual({ min: 10, max: 30 });
        });

        it("uses 5-30 on API 1.48", () => {
            expect(getFailsafeLimits("1.48.0").minStartDist).toEqual({ min: 5, max: 30 });
        });
    });

    describe("failsafe off delay (failsafe_off_delay / failsafe_landing_time)", () => {
        // failsafe_off_delay is 0-200 in tenths of a second, so 0-20s in the UI.
        it("allows up to 20s in tenths of a second before API 1.47", () => {
            expect(getFailsafeLimits("1.46.0").offDelay).toEqual({ min: 0, max: 20, step: 0.1, scale: 10 });
        });

        // 254da8f46 renamed it to failsafe_landing_time and changed the unit to whole
        // seconds: 0-250 seconds, default 60. Dividing by 10 here would show 6.0s and
        // lock the user out of most of the range.
        it("allows up to 250s in whole seconds from API 1.47", () => {
            expect(getFailsafeLimits("1.47.0").offDelay).toEqual({ min: 0, max: 250, step: 1, scale: 1 });
            expect(getFailsafeLimits("1.48.0").offDelay).toEqual({ min: 0, max: 250, step: 1, scale: 1 });
        });
    });

    describe("return altitude (gps_rescue_return_alt)", () => {
        it("follows the firmware range per API version", () => {
            expect(getFailsafeLimits("1.44.0").returnAltitude).toEqual({ min: 20, max: 100 });
            expect(getFailsafeLimits("1.45.0").returnAltitude).toEqual({ min: 2, max: 255 });
            expect(getFailsafeLimits("1.46.0").returnAltitude).toEqual({ min: 5, max: 1000 });
            expect(getFailsafeLimits("1.48.0").returnAltitude).toEqual({ min: 5, max: 1000 });
        });
    });

    describe("descent distance (gps_rescue_descent_dist)", () => {
        it("follows the firmware range per API version", () => {
            expect(getFailsafeLimits("1.44.0").descentDistance).toEqual({ min: 30, max: 500 });
            expect(getFailsafeLimits("1.45.0").descentDistance).toEqual({ min: 5, max: 500 });
            expect(getFailsafeLimits("1.46.0").descentDistance).toEqual({ min: 10, max: 500 });
            expect(getFailsafeLimits("1.48.0").descentDistance).toEqual({ min: 5, max: 500 });
        });
    });

    describe("maximum rescue angle (gps_rescue_max_rescue_angle / autopilot_max_angle)", () => {
        it("follows the firmware range per API version", () => {
            expect(getFailsafeLimits("1.44.0").angle).toEqual({ min: 0, max: 200 });
            expect(getFailsafeLimits("1.45.0").angle).toEqual({ min: 0, max: 80 });
            expect(getFailsafeLimits("1.46.0").angle).toEqual({ min: 30, max: 60 });
            expect(getFailsafeLimits("1.48.0").angle).toEqual({ min: 10, max: 70 });
        });
    });

    describe("rates entered in m/s", () => {
        it("converts the cm/s firmware limits", () => {
            expect(getFailsafeLimits("1.44.0").ascendRate).toEqual({ min: 1, max: 25 });
            expect(getFailsafeLimits("1.45.0").ascendRate).toEqual({ min: 0.5, max: 25 });
            expect(getFailsafeLimits("1.44.0").descendRate).toEqual({ min: 1, max: 5 });
            expect(getFailsafeLimits("1.45.0").descendRate).toEqual({ min: 0.25, max: 5 });
            expect(getFailsafeLimits("1.44.0").groundSpeed).toEqual({ min: 0.3, max: 30 });
            expect(getFailsafeLimits("1.45.0").groundSpeed).toEqual({ min: 0, max: 30 });
        });
    });

    // MSP_GPS_RESCUE still carries these, but from 1.47 msp.c reads and writes them
    // through autopilotConfig, which has its own narrower ranges.
    describe("throttle limits, backed by the autopilot settings from 1.47", () => {
        it("follows the firmware range per API version", () => {
            expect(getFailsafeLimits("1.46.0").throttleMin).toEqual({ min: 1000, max: 2000 });
            expect(getFailsafeLimits("1.46.0").throttleMax).toEqual({ min: 1000, max: 2000 });
            expect(getFailsafeLimits("1.46.0").throttleHover).toEqual({ min: 1000, max: 2000 });
            expect(getFailsafeLimits("1.47.0").throttleMin).toEqual({ min: 1050, max: 1400 });
            expect(getFailsafeLimits("1.47.0").throttleMax).toEqual({ min: 1400, max: 2000 });
            expect(getFailsafeLimits("1.47.0").throttleHover).toEqual({ min: 1100, max: 1700 });
            expect(getFailsafeLimits("1.48.0").throttleMin).toEqual({ min: 1050, max: 1400 });
            expect(getFailsafeLimits("1.48.0").throttleMax).toEqual({ min: 1400, max: 2000 });
            expect(getFailsafeLimits("1.48.0").throttleHover).toEqual({ min: 0, max: 1700 });
        });
    });

    describe("unknown API version", () => {
        it("falls back to the baseline limits instead of throwing", () => {
            expect(getFailsafeLimits(undefined).minStartDist).toEqual({ min: 50, max: 1000 });
            expect(getFailsafeLimits("not-a-version").minStartDist).toEqual({ min: 50, max: 1000 });
            expect(getFailsafeLimits("0.0.0").minStartDist).toEqual({ min: 50, max: 1000 });
        });
    });
});
