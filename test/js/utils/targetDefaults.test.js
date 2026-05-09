import { describe, expect, it } from "vitest";
import { lookupTargetDefaults, normaliseBoardName } from "../../../src/js/utils/targetDefaults.js";

describe("normaliseBoardName", () => {
    it("strips trailing silicon-package suffix", () => {
        expect(normaliseBoardName("TMTR_TMOTORF7(STM32F7X2)")).toBe("TMTR_TMOTORF7");
        expect(normaliseBoardName("TMTR_TMOTORF7 (STM32F7X2)")).toBe("TMTR_TMOTORF7");
    });

    it("uppercases mixed case input", () => {
        expect(normaliseBoardName("tmtr_tmotorf7")).toBe("TMTR_TMOTORF7");
    });

    it("trims surrounding whitespace", () => {
        expect(normaliseBoardName("  TMTR_TMOTORF7  ")).toBe("TMTR_TMOTORF7");
    });

    it("returns empty string for non-string input", () => {
        expect(normaliseBoardName(null)).toBe("");
        expect(normaliseBoardName(undefined)).toBe("");
        expect(normaliseBoardName(42)).toBe("");
    });
});

describe("lookupTargetDefaults", () => {
    it("returns the bundled entry for a manufacturer-prefixed board name", () => {
        // TMTR_TMOTORF7 lives in the bundle with 8 motors + 1 LED strip.
        // Use a real bundled target as a smoke test that the JSON import
        // wires through correctly. Specific motor pads are validated by
        // the parser tests; here we just assert shape + non-empty data.
        const result = lookupTargetDefaults("TMTR_TMOTORF7");
        expect(result).not.toBeNull();
        expect(result.source).toBe("firmware");
        expect(result.motors.length).toBeGreaterThan(0);
        expect(result.motors[0]).toMatchObject({
            index: expect.any(Number),
            pad: expect.any(String),
        });
        expect(result.ledStrips.length).toBeGreaterThanOrEqual(0);
    });

    it("strips silicon suffix before lookup", () => {
        const result = lookupTargetDefaults("TMTR_TMOTORF7(STM32F7X2)");
        expect(result).not.toBeNull();
        expect(result.motors.length).toBe(8);
    });

    it("falls back to bare boardName when manufacturer prefix is absent", () => {
        // Older firmware drops the `<MFGR>_` prefix and reports just the
        // board name. The bare-board index path should still find it.
        const result = lookupTargetDefaults("TMOTORF7");
        expect(result).not.toBeNull();
        expect(result.source).toBe("firmware");
        expect(result.motors.length).toBe(8);
    });

    it("returns null for unknown boards", () => {
        expect(lookupTargetDefaults("UNKNOWN_BOARD_XYZ")).toBeNull();
    });

    it("returns null for empty / non-string input", () => {
        expect(lookupTargetDefaults("")).toBeNull();
        expect(lookupTargetDefaults(null)).toBeNull();
        expect(lookupTargetDefaults(undefined)).toBeNull();
    });

    it("handles mixed case board names", () => {
        const result = lookupTargetDefaults("tmtr_tmotorf7");
        expect(result).not.toBeNull();
        expect(result.motors.length).toBe(8);
    });
});
