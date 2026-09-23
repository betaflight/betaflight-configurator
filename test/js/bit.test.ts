import { describe, expect, it } from "vitest";

import { bit_check, bit_clear, bit_set } from "../../src/js/bit";

// These back the 32-bit masks the firmware sends over MSP (feature flags, beeper disable
// masks, gyro enable masks, OSD warning flags), so the edges of the int32 coercion matter
// more than the happy path.

describe("bit_check", () => {
    it.each([
        [0b0001, 0, true],
        [0b0001, 1, false],
        [0b1010, 1, true],
        [0b1010, 2, false],
        [0b1010, 3, true],
    ])("bit_check(%i, %i) is %s", (num, bit, expected) => {
        expect(bit_check(num, bit)).toBe(expected);
    });

    it("reads a mask that arrived from MSP as an unsigned 2**31", () => {
        // `>>` coerces to int32 first, so the unsigned form a JSON/MSP decode produces still
        // reads correctly even though it is outside the signed range.
        expect(bit_check(2147483648, 31)).toBe(true);
    });

    it("is sign-propagating, so every bit of -1 reads as set", () => {
        expect(bit_check(-1, 0)).toBe(true);
        expect(bit_check(-1, 31)).toBe(true);
    });
});

describe("bit_set and bit_clear", () => {
    it("sets and clears without disturbing the neighbours", () => {
        expect(bit_set(0b0100, 0)).toBe(0b0101);
        expect(bit_clear(0b0101, 0)).toBe(0b0100);
    });

    it("is idempotent in both directions", () => {
        expect(bit_set(bit_set(0, 3), 3)).toBe(bit_set(0, 3));
        expect(bit_clear(bit_clear(0b1000, 3), 3)).toBe(bit_clear(0b1000, 3));
    });

    it("clearing an already-clear bit is a no-op", () => {
        expect(bit_clear(0b0100, 0)).toBe(0b0100);
    });

    it.each([0, 1, 15, 28, 30, 31])("round-trips bit %i through set -> check -> clear", (bit) => {
        const set = bit_set(0, bit);

        expect(bit_check(set, bit)).toBe(true);
        expect(bit_check(bit_clear(set, bit), bit)).toBe(false);
    });
});

describe("int32 edges", () => {
    // Documented rather than fixed: bit_set returns a *signed* int32, so the top bit comes back
    // negative. Reads still round-trip (covered above), but anything that stores or re-transmits
    // the result needs `>>> 0`. Nothing hits this yet — the highest bit in use is feature bit 28.
    it("bit_set on the top bit returns a negative number", () => {
        expect(bit_set(0, 31)).toBe(-2147483648);
        expect(bit_set(0, 30)).toBe(1073741824);
    });

    it("clearing the top bit of -1 yields the positive maximum", () => {
        expect(bit_clear(-1, 31)).toBe(2147483647);
    });

    // Shift counts are taken mod 32: an out-of-range bit silently wraps rather than throwing or
    // returning false. Worth pinning so a future caller that computes a bit index knows that an
    // off-by-32 is invisible rather than loud.
    it("wraps a bit index of 32 back onto bit 0", () => {
        expect(bit_check(1, 32)).toBe(bit_check(1, 0));
        expect(bit_set(0, 32)).toBe(bit_set(0, 0));
        expect(bit_clear(1, 32)).toBe(bit_clear(1, 0));
    });
});
