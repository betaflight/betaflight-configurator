import { describe, expect, it } from "vitest";
import { MOTOR_DATABASE, MOTOR_GENERIC, findMotor, motorBrands, motorsOfBrand } from "../../src/js/motor_database";

describe("motor database", () => {
    it("has one entry per brand, model and KV", () => {
        const keys = MOTOR_DATABASE.map((m) => `${m.brand}|${m.model}|${m.kv}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("keeps every value inside the firmware ranges", () => {
        for (const m of MOTOR_DATABASE) {
            expect(m.kv).toBeGreaterThanOrEqual(1);
            expect(m.kv).toBeLessThanOrEqual(40000);
            expect(m.statorDiameterMm).toBeGreaterThanOrEqual(5);
            expect(m.statorDiameterMm).toBeLessThanOrEqual(60);
            expect(m.statorHeightDmm).toBeGreaterThanOrEqual(10);
            expect(m.statorHeightDmm).toBeLessThanOrEqual(250);
            expect(m.resistanceMohm).toBeGreaterThanOrEqual(0);
            expect(m.resistanceMohm).toBeLessThanOrEqual(5000);
            expect(m.magnets % 2).toBe(0);
        }
    });

    it("lists Generic first, then the brands sorted, and filters by brand", () => {
        const [first, ...brands] = motorBrands();
        expect(first).toBe(MOTOR_GENERIC);
        expect(brands).toEqual([...brands].sort((a, b) => a.localeCompare(b)));
        expect(brands).not.toContain(MOTOR_GENERIC);
        expect(motorsOfBrand(MOTOR_GENERIC)).toHaveLength(0);
        expect(motorsOfBrand("X-NOVA").every((m) => m.brand === "X-NOVA")).toBe(true);
    });

    it("finds the motor back from the flight controller values", () => {
        expect(findMotor(2800, 22, 35, 70)?.model).toBe("Lightning V2 2203.5");
        expect(findMotor(2800, 22, 35, 0)).toBeNull(); // no resistance: could be any 2203.5 2800KV
        expect(findMotor(2801, 22, 35, 70)).toBeNull();
    });
});
