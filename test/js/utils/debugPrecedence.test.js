import { describe, expect, it } from "vitest";
import {
    convertDebugFieldValue,
    debugContextFromSysConfig,
    decodeDebugFieldToFriendly,
    getDebugFieldAxis,
    getDebugModes,
    resolveDebugField,
} from "../../../src/js/utils/debugModes";
import { API_VERSION_1_46, API_VERSION_1_48, API_VERSION_1_49 } from "../../../src/js/data_storage";

/*
 * Which source wins when the log and the app's tables disagree.
 *
 * A log records `debug_mode` as a bare index into an enum the app can only guess
 * at from the firmware revision string, so firmware carrying a mode the app has
 * never seen mislabels every field. Firmware records its own mode name and, where
 * it has the flash, one annotation per slot; both win here, because they came
 * from the firmware that wrote the data.
 *
 * Resolution is per slot, not per log: a 512 kB target logs the name but no
 * annotations, and a mode annotates only the slots it writes.
 */

const sysConfig = (overrides) => ({
    apiVersion: API_VERSION_1_49,
    debug_mode: null,
    debug_mode_name: null,
    debugFields: null,
    ...overrides,
});

const ctx = (overrides) => debugContextFromSysConfig(sysConfig(overrides));

// CYCLETIME[0] is "Cycle Time" in μs in the generated table for 1.49.
const CYCLETIME = getDebugModes(API_VERSION_1_49).indexOf("CYCLETIME");

describe("the mode name", () => {
    it("comes from the log when the firmware logged it", () => {
        const context = ctx({ debug_mode: 0, debug_mode_name: "GPS_RESCUE_HEADING" });

        expect(context.modeName).toBe("GPS_RESCUE_HEADING");
        expect(context.modeNameSource).toBe("header");
    });

    /*
     * The failure this exists to remove: a mode inserted mid-enum shifts every
     * later index, so the app's guessed table names a different mode than the
     * firmware did. The log's own name has to win outright.
     */
    it("wins over the index when the app's table disagrees about that slot", () => {
        const context = ctx({ debug_mode: CYCLETIME, debug_mode_name: "GPS_RESCUE_HEADING" });

        expect(context.tableName).toBe("CYCLETIME");
        expect(context.modeName).toBe("GPS_RESCUE_HEADING");
    });

    it("falls back to the guessed table for a log recorded before firmware said so", () => {
        const context = ctx({ debug_mode: CYCLETIME });

        expect(context.modeName).toBe("CYCLETIME");
        expect(context.modeNameSource).toBe("table");
    });

    it("keeps a name this build has never heard of, rather than dropping to the index", () => {
        expect(ctx({ debug_mode: 0, debug_mode_name: "CHIRP_V2" }).modeName).toBe("CHIRP_V2");
    });
});

describe("per-slot resolution", () => {
    it("prefers the log's own annotation over the generated table", () => {
        const context = ctx({
            debug_mode: CYCLETIME,
            debugFields: { 0: { label: "Something Else Entirely", unit: "ms", scale: 1 } },
        });

        expect(resolveDebugField("debug[0]", context).label).toBe("Something Else Entirely");
    });

    it("falls back per slot, not per log", () => {
        const context = ctx({
            debug_mode: CYCLETIME,
            debug_mode_name: "CYCLETIME",
            debugFields: { 0: { label: "Logged Slot", unit: "us", scale: 1 } },
        });

        expect(resolveDebugField("debug[0]", context).label).toBe("Logged Slot");
        // Slot 1 carries no header line, so the generated table still answers.
        expect(resolveDebugField("debug[1]", context).label).toBe("CPU Load");
    });

    it("answers nothing for a log with neither, leaving the hand-written tables to it", () => {
        expect(
            resolveDebugField("debug[0]", ctx({ debug_mode: CYCLETIME, apiVersion: API_VERSION_1_46 })),
        ).toBeUndefined();
    });
});

describe("a logged shape drives display and axis", () => {
    it("scales and suffixes a logged unit", () => {
        const context = ctx({
            debug_mode: 1,
            debug_mode_name: "SOMETHING_NEW",
            debugFields: { 0: { label: "Heading", unit: "deg", scale: 0.1 } },
        });

        // A scale of 0.1 implies one decimal place; more would invent precision.
        expect(decodeDebugFieldToFriendly(undefined, "debug[0]", 1800, context)).toBe("180.0 °");
        expect(convertDebugFieldValue(undefined, "debug[0]", true, 1800, context)).toBeCloseTo(180);
    });

    it("bounds the axis of a logged flag field by its bits", () => {
        const context = ctx({
            debug_mode: 1,
            debug_mode_name: "SOMETHING_NEW",
            debugFields: { 0: { label: "Frame Flags", unit: null, scale: 1, flags: ["A", "B", "C"] } },
        });

        expect(getDebugFieldAxis("debug[0]", context)).toEqual({ range: { min: 0, max: 7 } });
        expect(decodeDebugFieldToFriendly(undefined, "debug[0]", 5, context)).toBe("A | C");
    });

    /*
     * Header presence follows the target's flash size, not the firmware version,
     * so a self-describing log must be honoured even where the app has no
     * generated table for its API version at all.
     */
    it("honours a logged shape below the generated-table floor", () => {
        const context = ctx({
            apiVersion: API_VERSION_1_46,
            debug_mode: 1,
            debug_mode_name: "SOMETHING_NEW",
            debugFields: { 0: { label: "Frame Flags", unit: null, scale: 1, flags: ["A", "B"] } },
        });

        expect(getDebugFieldAxis("debug[0]", context)).toEqual({ range: { min: 0, max: 3 } });
    });
});

describe("a logged enumerator", () => {
    it("resolves its names through the enum registry", () => {
        const context = ctx({
            debug_mode: 1,
            debug_mode_name: "SOMETHING_NEW",
            debugFields: { 0: { label: "Failsafe Phase", unit: null, scale: 1, enumTag: "failsafePhase_e" } },
        });

        expect(resolveDebugField("debug[0]", context).values[0]).toBe("FAILSAFE_IDLE");
        expect(decodeDebugFieldToFriendly(undefined, "debug[0]", 1, context)).toBe("FAILSAFE_RX_LOSS_DETECTED");
    });

    /*
     * The firmware named an enum this build does not have. Borrowing names from a
     * different enum would be exactly the silent mislabel this change removes, so
     * the raw value is shown instead.
     */
    it("shows the raw value for an enum this build has never seen", () => {
        const context = ctx({
            debug_mode: 1,
            debug_mode_name: "SOMETHING_NEW",
            debugFields: { 0: { label: "New Phase", unit: null, scale: 1, enumTag: "notAnEnum_e" } },
        });

        expect(resolveDebugField("debug[0]", context).values).toBeUndefined();
        expect(decodeDebugFieldToFriendly(undefined, "debug[0]", 3, context)).toBe("3");
        expect(getDebugFieldAxis("debug[0]", context)).toEqual({ fit: ["debug[0]"] });
    });
});

describe("a log with none of the new headers", () => {
    /*
     * Every log recorded before this change has to decode exactly as it did. The
     * generated table is the authority there, reached through the API version
     * guessed from the revision string.
     */
    it("decodes through the generated table, as it always has", () => {
        const context = ctx({ debug_mode: CYCLETIME });

        expect(resolveDebugField("debug[0]", context).label).toBe("Cycle Time");
        expect(decodeDebugFieldToFriendly(undefined, "debug[0]", 125, context)).toBe("125 μs");
        expect(getDebugFieldAxis("debug[1]", context)).toEqual({ range: { min: 0, max: 100 } });
    });

    it("still decodes a firmware version that predates the annotations", () => {
        const context = ctx({ debug_mode: CYCLETIME, apiVersion: API_VERSION_1_48 });

        expect(resolveDebugField("debug[0]", context)).toBeUndefined();
        expect(getDebugFieldAxis("debug[0]", context)).toBeUndefined();
    });
});
