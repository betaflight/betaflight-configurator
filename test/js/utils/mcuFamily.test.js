import { describe, it, expect } from "vitest";
import { mcuFamilyFromName } from "../../../src/js/utils/mcuFamily.js";

describe("mcuFamilyFromName", () => {
    it("returns null on missing/empty input", () => {
        expect(mcuFamilyFromName(null)).toBe(null);
        expect(mcuFamilyFromName(undefined)).toBe(null);
        expect(mcuFamilyFromName("")).toBe(null);
    });

    it("returns null on unrecognized MCUs", () => {
        expect(mcuFamilyFromName("STM32L4XYZ")).toBe(null);
        expect(mcuFamilyFromName("Cortex-M4")).toBe(null);
    });

    it("decodes STM32 families from the firmware-reported string", () => {
        expect(mcuFamilyFromName("STM32F405")).toBe("F4");
        expect(mcuFamilyFromName("STM32F411")).toBe("F4");
        expect(mcuFamilyFromName("STM32F722")).toBe("F7");
        expect(mcuFamilyFromName("STM32F745")).toBe("F7");
        expect(mcuFamilyFromName("STM32H743")).toBe("H7");
        expect(mcuFamilyFromName("STM32H750")).toBe("H7");
        expect(mcuFamilyFromName("STM32G473")).toBe("G4");
    });

    it("treats AT32 Artery clones as a distinct family (F4-like for DMA)", () => {
        expect(mcuFamilyFromName("AT32F435")).toBe("AT32");
        expect(mcuFamilyFromName("AT32F437")).toBe("AT32");
    });

    it("is case-insensitive", () => {
        expect(mcuFamilyFromName("stm32h743")).toBe("H7");
        expect(mcuFamilyFromName("Stm32F405")).toBe("F4");
    });
});
