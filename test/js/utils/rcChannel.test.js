import { describe, expect, it } from "vitest";
import { CHANNEL_MIN, CHANNEL_MAX, clampChannel, channelPercent } from "../../../src/js/utils/rcChannel";

describe("rcChannel helpers", () => {
    describe("clampChannel", () => {
        it("returns the value when within range", () => {
            expect(clampChannel(1500)).toBe(1500);
        });

        it("clamps below CHANNEL_MIN", () => {
            expect(clampChannel(500)).toBe(CHANNEL_MIN);
        });

        it("clamps above CHANNEL_MAX", () => {
            expect(clampChannel(3000)).toBe(CHANNEL_MAX);
        });

        it("falls back to the midpoint for NaN/undefined/null", () => {
            expect(clampChannel(NaN)).toBe(1500);
            expect(clampChannel(undefined)).toBe(1500);
            expect(clampChannel(null)).toBe(1500);
        });
    });

    describe("channelPercent", () => {
        it("returns 0 at CHANNEL_MIN and 100 at CHANNEL_MAX", () => {
            expect(channelPercent(CHANNEL_MIN)).toBe(0);
            expect(channelPercent(CHANNEL_MAX)).toBe(100);
        });

        it("returns 50 for the midpoint channel value", () => {
            expect(channelPercent(1500)).toBe(50);
        });

        it("returns 50 for a NaN fallback", () => {
            expect(channelPercent(NaN)).toBe(50);
        });
    });
});
