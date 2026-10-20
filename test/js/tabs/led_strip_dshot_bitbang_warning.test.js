import { describe, expect, it } from "vitest";
import { bit_set } from "../../../src/js/bit";
import { isDshotBitbangBlocked, DSHOT_BITBANG_BIT } from "../../../src/stores/fc.js";

// LedStripTab.vue shows a warning from `fcStore.dshotBitbangBlocked`, which reads the DSHOT_BITBANG arming
// disable flag (firmware ARMING_DISABLED_DSHOT_BITBANG = 1 << 22). The constant is a bit position, like the
// failsafe ones, so a mask value here would silently break the warning.

describe("LedStripTab DShot bitbang warning", () => {
    it("uses bit position 22", () => {
        expect(DSHOT_BITBANG_BIT).toBe(22);
    });

    it("is shown when the flag is set, with or without other flags", () => {
        expect(isDshotBitbangBlocked(1 << 22)).toBe(true);
        expect(isDshotBitbangBlocked(bit_set(bit_set(0, DSHOT_BITBANG_BIT), 13))).toBe(true);
    });

    it("is hidden without the flag, for neighbouring flags, and for missing flags", () => {
        expect(isDshotBitbangBlocked(0)).toBe(false);
        expect(isDshotBitbangBlocked(1 << 21)).toBe(false);
        expect(isDshotBitbangBlocked(1 << 23)).toBe(false);
        expect(isDshotBitbangBlocked()).toBe(false);
    });
});
