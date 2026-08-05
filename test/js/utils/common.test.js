import { describe, expect, it } from "vitest";
import { clamp, degToRad, radToDeg } from "../../../src/js/utils/common";

describe("common helpers", () => {
    describe("clamp", () => {
        it("returns the value when within range", () => {
            expect(clamp(5, 0, 10)).toBe(5);
        });

        it("clamps to the minimum", () => {
            expect(clamp(-5, 0, 10)).toBe(0);
        });

        it("clamps to the maximum", () => {
            expect(clamp(15, 0, 10)).toBe(10);
        });
    });

    describe("degToRad / radToDeg", () => {
        it("converts degrees to radians", () => {
            expect(degToRad(180)).toBeCloseTo(Math.PI);
            expect(degToRad(90)).toBeCloseTo(Math.PI / 2);
        });

        it("converts radians to degrees", () => {
            expect(radToDeg(Math.PI)).toBeCloseTo(180);
            expect(radToDeg(Math.PI / 2)).toBeCloseTo(90);
        });

        it("round-trips", () => {
            expect(radToDeg(degToRad(37))).toBeCloseTo(37);
        });
    });
});
