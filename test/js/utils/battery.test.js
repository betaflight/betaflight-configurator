import { describe, expect, it } from "vitest";
import { estimateCellCount } from "../../../src/js/utils/battery";

describe("estimateCellCount", () => {
    it("returns 1 cell when voltage is 0", () => {
        expect(estimateCellCount(0, 4.2)).toBe(1);
    });

    it("estimates a single-cell pack", () => {
        expect(estimateCellCount(4.1, 4.2)).toBe(1);
    });

    it("estimates a multi-cell pack", () => {
        expect(estimateCellCount(16.4, 4.2)).toBe(4);
    });

    it("rounds down within a cell boundary", () => {
        expect(estimateCellCount(8.39, 4.2)).toBe(2);
    });

    it("does not overestimate at an exact cell boundary", () => {
        expect(estimateCellCount(8.4, 4.2)).toBe(2);
    });

    it("returns 1 cell when vbatmaxcellvoltage is unset", () => {
        expect(estimateCellCount(12.6, 0)).toBe(1);
    });
});
