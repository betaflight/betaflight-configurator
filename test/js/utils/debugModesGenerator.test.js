import { describe, expect, it } from "vitest";
import {
    maskNonCode,
    parseAnnotation,
    parseEnumBlock,
    parseNamedEnums,
    resolveFieldIndex,
} from "../../../scripts/generate-debug-modes.mjs";

/*
 * The text-handling half of `scripts/generate-debug-modes.mjs`: what it treats as
 * code, what it reads out of a `//!<` annotation, and how it resolves an index.
 *
 * These were reachable only by running the generator against a firmware checkout,
 * so the way to see a change in them was to regenerate and read the diff. Two
 * bugs got in that way - a comment marker inside a string literal, and blanking a
 * literal that held an `#include` filename, which silently cost seven annotated
 * fields - and both are pinned below.
 */

const DEBUG_SET_CALLS = (text) => [...text.matchAll(/DEBUG_SET\s*\(/g)].length;

describe("maskNonCode", () => {
    it("keeps every offset, so line numbers and annotation positions still hold", () => {
        const source = ["int a; // one", "/* two", "   still two */ int b;", "int c; //!< keep"].join("\n");
        const masked = maskNonCode(source);

        expect(masked).toHaveLength(source.length);
        expect(masked.split("\n")).toHaveLength(source.split("\n").length);
        // Code either side of a masked region stays where it was.
        expect(masked.indexOf("int b;")).toBe(source.indexOf("int b;"));
        expect(masked.indexOf("int c;")).toBe(source.indexOf("int c;"));
    });

    it("hides a commented-out call, in either comment form", () => {
        // rpm_filter.c really carries the block-commented form, and it published
        // RPM_FILTER as writing four fields that the firmware never writes.
        const source = [
            "    DEBUG_SET(DEBUG_REAL, 0, x);",
            "//  DEBUG_SET(DEBUG_LINE_COMMENTED, 1, y);",
            "    /* DEBUG_SET(DEBUG_BLOCK_COMMENTED, 2, z); */",
        ].join("\n");

        expect(DEBUG_SET_CALLS(maskNonCode(source))).toBe(1);
    });

    it("keeps an annotation, which is a comment it must not discard", () => {
        const source = "    DEBUG_SET(DEBUG_A, 0, x);  //!< Cycle Time [unit:us]";

        expect(maskNonCode(source)).toContain("//!< Cycle Time [unit:us]");
    });

    it("does not read a comment marker inside a string literal", () => {
        // A `//` in a URL used to open a line comment and blank the rest of the
        // line; a `/*` in a literal used to blank on to the next `*/` in the file.
        const url = 'const char *u = "http://example.com";  DEBUG_SET(DEBUG_A, 0, x);  //!< A [unit:cm]';
        const block = 'const char *b = "/* not a comment";  DEBUG_SET(DEBUG_B, 1, y);  //!< B [unit:cm]';

        expect(DEBUG_SET_CALLS(maskNonCode(url))).toBe(1);
        expect(maskNonCode(url)).toContain("//!< A [unit:cm]");
        expect(DEBUG_SET_CALLS(maskNonCode(block))).toBe(1);
        expect(maskNonCode(block)).toContain("//!< B [unit:cm]");
    });

    it("leaves an include filename alone, which the enum lookup needs", () => {
        // Blanking literals instead of stepping over them broke the scope walk and
        // cost seven annotated fields, every one of them an `[enum:...]` field.
        expect(maskNonCode('#include "failsafe.h"')).toContain('"failsafe.h"');
    });

    it("handles an unterminated comment and an escaped quote without running away", () => {
        expect(DEBUG_SET_CALLS(maskNonCode("/* DEBUG_SET(DEBUG_A, 0, x);"))).toBe(0);
        expect(DEBUG_SET_CALLS(maskNonCode(`char q = '\\'';  DEBUG_SET(DEBUG_A, 0, x);`))).toBe(1);
    });
});

describe("parseAnnotation", () => {
    // The scan trims the text after `//!<` before parsing, so these do too.
    it("reads a label and the unit of one LSB", () => {
        expect(parseAnnotation("Cycle Time [unit:us]")).toMatchObject({
            label: "Cycle Time",
            unit: "us",
            scale: 1,
        });
    });

    it("reads the factor, including a negative one", () => {
        expect(parseAnnotation("Angle [unit:0.1deg]")).toMatchObject({ unit: "deg", scale: 0.1 });
        expect(parseAnnotation("Pressure [unit:100Pa]")).toMatchObject({ unit: "Pa", scale: 100 });
        // CRSF sends RSSI as a positive count of dBm below zero.
        expect(parseAnnotation("Uplink RSSI [unit:-1dBm]")).toMatchObject({ unit: "dBm", scale: -1 });
        // Scaled but dimensionless.
        expect(parseAnnotation("Ratio [unit:0.001]")).toMatchObject({ unit: null, scale: 0.001 });
    });

    it("reads bit flags, naming an unused bit null", () => {
        expect(parseAnnotation("Frame Flags [flags:Channel 17|-|Signal Loss]")).toMatchObject({
            label: "Frame Flags",
            unit: null,
            flags: ["Channel 17", null, "Signal Loss"],
        });
    });

    it("spells out one label per index for a run-time index", () => {
        const parsed = parseAnnotation("[index:0..2] Gyro ({roll|pitch|yaw}) [unit:dps]");

        expect(parsed.indices).toEqual([0, 1, 2]);
        expect(parsed.labels).toEqual(["Gyro (roll)", "Gyro (pitch)", "Gyro (yaw)"]);
    });

    it("takes a field with no shape as a plain integer", () => {
        expect(parseAnnotation("Failure Count")).toMatchObject({ label: "Failure Count", unit: null, scale: 1 });
    });

    it("refuses what it cannot describe rather than dropping the field", () => {
        // Each of these would otherwise leave a field silently unlabelled.
        expect(parseAnnotation("[unit:us]").error).toBeDefined();
        expect(parseAnnotation("Label [furlongs]").error).toBeDefined();
        expect(parseAnnotation("Label [unit:furlongs]").error).toBeDefined();
        expect(parseAnnotation("Label [roll] [unit:us]").error).toBeDefined();
        // Three alternatives for two indices.
        expect(parseAnnotation("[index:0..1] Gyro ({roll|pitch|yaw}) [unit:dps]").error).toBeDefined();
    });
});

describe("parseEnumBlock and parseNamedEnums", () => {
    it("numbers enumerators from zero, honouring an explicit value", () => {
        expect([...parseEnumBlock("A, B, C")]).toEqual([
            ["A", 0],
            ["B", 1],
            ["C", 2],
        ]);
        expect([...parseEnumBlock("A, B = 5, C")]).toEqual([
            ["A", 0],
            ["B", 5],
            ["C", 6],
        ]);
    });

    it("rejects an entry it cannot evaluate, rather than guessing what follows", () => {
        expect(parseEnumBlock("A, B = (1 << 2), C")).toBeUndefined();
    });

    it("names a gap left by explicit values, so JS and JSON agree", () => {
        // A hole renders as an elision in the generated JS but as null in the
        // generated JSON, and the schema's own `values` rejects a hole.
        const names = parseNamedEnums("typedef enum { A, B = 3 } gappy_e;").get("gappy_e");

        expect(names).toEqual(["A", null, null, "B"]);
        expect(JSON.parse(JSON.stringify(names))).toEqual(names);
    });
});

describe("resolveFieldIndex", () => {
    it("resolves a literal and a named constant, and gives up on an expression", () => {
        const constants = new Map([["DEBUG_SBUS_FRAME_FLAGS", 0]]);

        expect(resolveFieldIndex("3", constants)).toBe(3);
        expect(resolveFieldIndex("DEBUG_SBUS_FRAME_FLAGS", constants)).toBe(0);
        expect(resolveFieldIndex("axis", constants)).toBeUndefined();
        expect(resolveFieldIndex("2 * axis + 1", constants)).toBeUndefined();
    });
});
