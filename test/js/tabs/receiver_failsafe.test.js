import { describe, expect, it } from "vitest";
import { bit_check, bit_set } from "../../../src/js/bit.js";
import { isFailsafeActive, FAILSAFE_BIT, RX_FAILSAFE_BIT, BOXFAILSAFE_BIT } from "../../../src/stores/fc.js";

// ---------------------------------------------------------------------------
// ReceiverTab.vue adds a failsafe / RX-loss warning banner driven by
// `fcStore.failsafeActive`, whose detection lives in `isFailsafeActive` in
// src/stores/fc.js. We import the REAL detector (and the REAL bit constants)
// here, so this is a genuine regression guard: if someone "corrects" a
// constant to a firmware mask value (1 << 1 etc.), these tests go red.
//
// The constants are BIT POSITIONS (the second arg to bit_check), not the
// firmware mask values.
// ---------------------------------------------------------------------------

describe("ReceiverTab failsafe detection", () => {
    describe("bit constants are positions, not masks", () => {
        it("uses positions 1 / 2 / 4", () => {
            expect(FAILSAFE_BIT).toBe(1);
            expect(RX_FAILSAFE_BIT).toBe(2);
            expect(BOXFAILSAFE_BIT).toBe(4);
        });

        it("bit_check checks bit POSITION, not mask value", () => {
            // value 2 == bit position 1 set
            expect(bit_check(0b10, 1)).toBe(true);
            // value 2 does NOT have bit position 2 set
            expect(bit_check(0b10, 2)).toBe(false);
        });
    });

    describe("active flags (banner shown)", () => {
        it("returns true when only FAILSAFE (pos 1) is set", () => {
            expect(isFailsafeActive(bit_set(0, FAILSAFE_BIT))).toBe(true); // value 2
        });

        it("returns true when only RX_FAILSAFE (pos 2) is set", () => {
            expect(isFailsafeActive(bit_set(0, RX_FAILSAFE_BIT))).toBe(true); // value 4
        });

        it("returns true when only BOXFAILSAFE (pos 4) is set", () => {
            expect(isFailsafeActive(bit_set(0, BOXFAILSAFE_BIT))).toBe(true); // value 16
        });

        it("returns true for raw mask values 2, 4 and 16", () => {
            expect(isFailsafeActive(2)).toBe(true);
            expect(isFailsafeActive(4)).toBe(true);
            expect(isFailsafeActive(16)).toBe(true);
        });

        it("returns true when multiple failsafe bits are set together", () => {
            let flags = 0;
            flags = bit_set(flags, FAILSAFE_BIT);
            flags = bit_set(flags, RX_FAILSAFE_BIT);
            flags = bit_set(flags, BOXFAILSAFE_BIT);
            expect(isFailsafeActive(flags)).toBe(true); // value 22
        });

        it("returns true when a failsafe bit is set alongside unrelated bits", () => {
            let flags = 0;
            flags = bit_set(flags, 7); // THROTTLE
            flags = bit_set(flags, 12); // CALIBRATING
            flags = bit_set(flags, RX_FAILSAFE_BIT); // the only relevant one
            expect(isFailsafeActive(flags)).toBe(true);
        });
    });

    describe("inactive flags (banner hidden)", () => {
        it("returns false when no flags are set", () => {
            expect(isFailsafeActive(0)).toBe(false);
        });

        it("returns false for undefined/null flags (optional chaining fallback)", () => {
            expect(isFailsafeActive(undefined)).toBe(false);
            expect(isFailsafeActive(null)).toBe(false);
        });

        it("returns false for unrelated bit ARMED (pos 0, value 1)", () => {
            expect(isFailsafeActive(bit_set(0, 0))).toBe(false); // value 1
        });

        it("returns false for unrelated bit at pos 3 (value 8, between our bits)", () => {
            expect(isFailsafeActive(bit_set(0, 3))).toBe(false); // value 8
        });

        it("returns false for THROTTLE (pos 7) only", () => {
            expect(isFailsafeActive(bit_set(0, 7))).toBe(false); // value 128
        });

        it("returns false for CALIBRATING (pos 12) only", () => {
            expect(isFailsafeActive(bit_set(0, 12))).toBe(false); // value 4096
        });

        it("returns false for several unrelated bits set together", () => {
            let flags = 0;
            flags = bit_set(flags, 0); // ARMED
            flags = bit_set(flags, 3);
            flags = bit_set(flags, 7); // THROTTLE
            flags = bit_set(flags, 12); // CALIBRATING
            expect(isFailsafeActive(flags)).toBe(false);
        });
    });
});
