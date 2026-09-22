import { describe, expect, it } from "vitest";
import {
    DEBUG_VALUE_BITS,
    isDebugAnnotationError,
    parseDebugAnnotation,
    parseDebugFieldHeader,
} from "../../../src/js/debug_annotation.ts";
import type { DebugAnnotationError, ParsedDebugAnnotation } from "../../../src/js/debug_annotation.ts";
import { DEBUG_UNITS } from "../../../src/js/debug_units.ts";
import { FIRMWARE_DEBUG_FIELDS } from "../../../src/js/debug_fields_table.ts";
import type { FirmwareDebugField } from "../../../src/js/debug_fields_table.ts";

/*
 * Both parsers return a result-or-error union. These narrow it and fail with what
 * actually came back, so a test that gets the wrong branch says so instead of
 * reporting `undefined` against the expected value.
 */
function expectParsed(result: ParsedDebugAnnotation | DebugAnnotationError): ParsedDebugAnnotation {
    if (isDebugAnnotationError(result)) {
        throw new Error(`expected a successful parse, got error: ${result.error}`);
    }
    return result;
}

function expectRefused<T extends object>(result: T | DebugAnnotationError): DebugAnnotationError {
    if (!isDebugAnnotationError(result)) {
        throw new Error(`expected a refusal, got: ${JSON.stringify(result)}`);
    }
    return result;
}

/*
 * The grammar of the firmware's `//!<` debug field annotations.
 *
 * Two consumers parse it - the generator, against a firmware checkout, and the
 * blackbox log reader, against the `H debug_field[n]:` headers a log carries
 * about itself - and a disagreement between them mislabels a field without
 * saying so. They import one implementation; this is what pins it.
 */

describe("parseDebugAnnotation", () => {
    // The scan trims the text after `//!<` before parsing, so these do too.
    it("reads a label and the unit of one LSB", () => {
        expect(parseDebugAnnotation("Cycle Time [unit:us]")).toMatchObject({
            label: "Cycle Time",
            unit: "us",
            scale: 1,
        });
    });

    it("reads the factor, including a negative one", () => {
        expect(parseDebugAnnotation("Angle [unit:0.1deg]")).toMatchObject({ unit: "deg", scale: 0.1 });
        expect(parseDebugAnnotation("Pressure [unit:100Pa]")).toMatchObject({ unit: "Pa", scale: 100 });
        // CRSF sends RSSI as a positive count of dBm below zero.
        expect(parseDebugAnnotation("Uplink RSSI [unit:-1dBm]")).toMatchObject({ unit: "dBm", scale: -1 });
        // Scaled but dimensionless.
        expect(parseDebugAnnotation("Ratio [unit:0.001]")).toMatchObject({ unit: null, scale: 0.001 });
    });

    it("reads bit flags, naming an unused bit null", () => {
        expect(parseDebugAnnotation("Frame Flags [flags:Channel 17|-|Signal Loss]")).toMatchObject({
            label: "Frame Flags",
            unit: null,
            flags: ["Channel 17", null, "Signal Loss"],
        });
    });

    it("names the firmware enum an enumerator field holds", () => {
        expect(parseDebugAnnotation("Failsafe Phase [enum:failsafePhase_e]")).toMatchObject({
            label: "Failsafe Phase",
            unit: null,
            scale: 1,
            enumTag: "failsafePhase_e",
        });
    });

    it("spells out one label per index for a run-time index", () => {
        const parsed = expectParsed(parseDebugAnnotation("[index:0..2] Gyro ({roll|pitch|yaw}) [unit:dps]"));

        expect(parsed.indices).toEqual([0, 1, 2]);
        expect(parsed.labels).toEqual(["Gyro (roll)", "Gyro (pitch)", "Gyro (yaw)"]);
    });

    it("takes a field with no shape as a plain integer", () => {
        expect(parseDebugAnnotation("Failure Count")).toMatchObject({ label: "Failure Count", unit: null, scale: 1 });
    });

    it("refuses what it cannot describe rather than dropping the field", () => {
        // Each of these would otherwise leave a field silently unlabelled.
        expect(expectRefused(parseDebugAnnotation("[unit:us]")).error).toBeDefined();
        expect(expectRefused(parseDebugAnnotation("Label [furlongs]")).error).toBeDefined();
        expect(expectRefused(parseDebugAnnotation("Label [unit:furlongs]")).error).toBeDefined();
        expect(expectRefused(parseDebugAnnotation("Label [roll] [unit:us]")).error).toBeDefined();
        // Three alternatives for two indices.
        expect(
            expectRefused(parseDebugAnnotation("[index:0..1] Gyro ({roll|pitch|yaw}) [unit:dps]")).error,
        ).toBeDefined();
    });

    it("refuses a flag list longer than the field has bits", () => {
        const bits = Array.from({ length: DEBUG_VALUE_BITS + 1 }, (_, bit) => `Bit ${bit}`).join("|");
        expect(expectRefused(parseDebugAnnotation(`Flags [flags:${bits}]`)).error).toBeDefined();
    });
});

describe("parseDebugAnnotation, unit factors", () => {
    it("refuses a factor that overflows a double, which would scale every sample to Infinity", () => {
        const huge = "9".repeat(400);
        expect(expectRefused(parseDebugAnnotation(`Cycle Time [unit:${huge}us]`)).error).toMatch(
            /not a unit, enum or flags shape/,
        );
        expect(expectRefused(parseDebugAnnotation("Cycle Time [unit:0us]")).error).toMatch(
            /not a unit, enum or flags shape/,
        );
        expect(expectParsed(parseDebugAnnotation("Cycle Time [unit:0.1us]")).scale).toBe(0.1);
    });
});

describe("parseDebugFieldHeader", () => {
    it("reads the shapes a log header carries", () => {
        expect(parseDebugFieldHeader("Cycle Time [unit:us]")).toEqual({ label: "Cycle Time", unit: "us", scale: 1 });
        expect(parseDebugFieldHeader("Setpoint Rate (roll) [unit:dps]")).toEqual({
            label: "Setpoint Rate (roll)",
            unit: "dps",
            scale: 1,
        });
        expect(parseDebugFieldHeader("Failsafe Phase [enum:failsafePhase_e]")).toEqual({
            label: "Failsafe Phase",
            unit: null,
            scale: 1,
            enumTag: "failsafePhase_e",
        });
        expect(parseDebugFieldHeader("Loop Iteration")).toEqual({ label: "Loop Iteration", unit: null, scale: 1 });
    });

    it("keeps a flag list whole, separators and all", () => {
        expect(parseDebugFieldHeader("Frame Flags [flags:Channel 17|Channel 18|Signal Loss|Failsafe]")).toMatchObject({
            flags: ["Channel 17", "Channel 18", "Signal Loss", "Failsafe"],
        });
    });

    /*
     * The header key already names the slot and firmware expands the group before
     * it logs, so either of these means the firmware sent something it should not
     * have. Reading them leniently would put slot 0's label on slot 3 in silence.
     */
    it("refuses an index spec or a label group, which a log must not carry", () => {
        expect(expectRefused(parseDebugFieldHeader("[index:0..2] Gyro {roll|pitch|yaw} [unit:dps]")).error).toMatch(
            /\[index:/,
        );
        expect(expectRefused(parseDebugFieldHeader("Gyro {roll|pitch|yaw} [unit:dps]")).error).toBeDefined();
    });

    it("reports a malformed header rather than throwing", () => {
        for (const raw of ["", "[unit:us]", "Label [foo:bar]", "Label [unit:furlongs]", "Label [unit:]"]) {
            const parsed = parseDebugFieldHeader(raw);
            expect(isDebugAnnotationError(parsed), `expected "${raw}" to be refused`).toBe(true);
        }
    });
});

/*
 * The generator wrote every entry of the table below by parsing an annotation.
 * Rendering one back into the grammar and re-reading it has to return what the
 * generator stored, or firmware and the app disagree about what a field means -
 * which is the whole failure this shared parser removes.
 */
describe("the generated table round-trips through the grammar", () => {
    const render = (field: FirmwareDebugField) => {
        if (field.flags) {
            return `${field.label} [flags:${field.flags.map((name) => name ?? "-").join("|")}]`;
        }
        if (field.unit === null && field.scale === 1) {
            return field.label;
        }
        return `${field.label} [unit:${field.scale === 1 ? "" : field.scale}${field.unit ?? ""}]`;
    };

    const entries: [string, FirmwareDebugField][] = Object.entries(FIRMWARE_DEBUG_FIELDS["1.49.0"]).flatMap(
        ([mode, slots]) =>
            Object.entries(slots).map(([index, field]): [string, FirmwareDebugField] => [`${mode}[${index}]`, field]),
    );

    it("has entries to check", () => {
        expect(entries.length).toBeGreaterThan(400);
    });

    it.each(entries)("%s", (_where, field) => {
        // An enumerator field is named by its C type, which the table does not keep yet.
        if (field.values) {
            return;
        }
        const parsed = parseDebugFieldHeader(render(field));

        expect(isDebugAnnotationError(parsed)).toBe(false);
        expect(parsed).toMatchObject({ label: field.label, unit: field.unit, scale: field.scale });
    });

    it("only ever returns a unit the shared table can display", () => {
        for (const [where, field] of entries) {
            if (field.unit !== null) {
                expect(DEBUG_UNITS[field.unit], `${where} uses unit "${field.unit}"`).toBeDefined();
            }
        }
    });
});
