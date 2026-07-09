import { describe, expect, it } from "vitest";
import Beepers from "../src/js/Beepers";
import { bit_set } from "../src/js/bit";

describe("Beepers", () => {
    describe("isEnabled", () => {
        it("returns true for a beeper whose bit is not in the disabled mask", () => {
            const beepers = new Beepers();
            expect(beepers.isEnabled("RX_LOST")).toBe(true);
        });

        it("returns false for a beeper whose bit is in the disabled mask", () => {
            const beepers = new Beepers();
            beepers.setDisabledMask(bit_set(0, 1));
            expect(beepers.isEnabled("RX_LOST")).toBe(false);
            expect(beepers.isEnabled("GYRO_CALIBRATED")).toBe(true);
        });

        it("returns false for an unknown beeper name", () => {
            const beepers = new Beepers();
            expect(beepers.isEnabled("NOT_A_BEEPER")).toBe(false);
        });

        it("respects the supported conditions filter", () => {
            const beepers = new Beepers(undefined, ["RX_LOST"]);
            expect(beepers.isEnabled("RX_LOST")).toBe(true);
            expect(beepers.isEnabled("ARMING")).toBe(false);
        });
    });

    describe("updateData", () => {
        it("round-trips through the disabled mask", () => {
            const beepers = new Beepers();
            beepers.updateData({ type: "checkbox", checked: false, dataset: { bit: "3" } });
            expect(beepers.isEnabled("DISARMING")).toBe(false);
            expect(beepers.getDisabledMask()).toBe(bit_set(0, 3));

            beepers.updateData({ type: "checkbox", checked: true, dataset: { bit: "3" } });
            expect(beepers.isEnabled("DISARMING")).toBe(true);
            expect(beepers.getDisabledMask()).toBe(0);
        });
    });

    describe("setEnabled", () => {
        it("clears the disabled bit when enabling a beeper by name", () => {
            const beepers = new Beepers();
            beepers.setDisabledMask(bit_set(0, 3));
            beepers.setEnabled("DISARMING", true);
            expect(beepers.isEnabled("DISARMING")).toBe(true);
            expect(beepers.getDisabledMask()).toBe(0);
        });

        it("sets the disabled bit when disabling a beeper by name", () => {
            const beepers = new Beepers();
            beepers.setEnabled("DISARMING", false);
            expect(beepers.isEnabled("DISARMING")).toBe(false);
            expect(beepers.getDisabledMask()).toBe(bit_set(0, 3));
        });

        it("leaves the mask untouched for an unknown beeper name", () => {
            const beepers = new Beepers();
            beepers.setEnabled("NOT_A_BEEPER", false);
            expect(beepers.getDisabledMask()).toBe(0);
        });
    });
});
