import { describe, expect, it } from "vitest";
import artifact from "../../../generated/debug-fields.json";
import schema from "../../../generated/debug-fields.schema.json";
import { DEBUG_MODE_ALIASES, FIRMWARE_DEBUG_MODES } from "../../../src/js/debug_modes_table";
import { FIRMWARE_DEBUG_FIELDS } from "../../../src/js/debug_fields_table";
import { DEBUG_UNITS, debugUnitSymbols } from "../../../src/js/debug_units";

/*
 * `generated/debug-fields.json` is published for tools outside this repository -
 * the blackbox log viewer, third-party log analysers, anything reading a log the
 * configurator did not record - so that none of them has to parse the firmware's
 * C or scrape the generated JS. It is produced by the same
 * `npm run generate:debug-modes` scan as the two shipped `.js` tables.
 *
 * Being published makes it an interface: a consumer that pins to its shape has
 * no way to notice a silent change. So these tests hold it to the two things a
 * consumer relies on - that it agrees with what the app itself ships, and that
 * it keeps the structure its schema promises.
 */

const DEBUG_VALUE_COUNT = 8;

describe("generated/debug-fields.json", () => {
    it("carries the same API versions as the shipped mode table", () => {
        expect(Object.keys(artifact.versions)).toEqual(Object.keys(FIRMWARE_DEBUG_MODES));
    });

    it("lists every mode in enum order, so a position is its debug_mode value", () => {
        for (const [apiVersion, version] of Object.entries(artifact.versions)) {
            expect(
                version.modes.map((mode) => mode.name),
                apiVersion,
            ).toEqual(FIRMWARE_DEBUG_MODES[apiVersion]);
            expect(
                version.modes.map((mode) => mode.index),
                apiVersion,
            ).toEqual(version.modes.map((_, index) => index));
        }
    });

    it("publishes exactly the field labels the app ships", () => {
        for (const [apiVersion, version] of Object.entries(artifact.versions)) {
            const shipped = FIRMWARE_DEBUG_FIELDS[apiVersion] ?? {};
            const published = Object.fromEntries(
                version.modes
                    .filter((mode) => Object.keys(mode.fields).length > 0)
                    .map((mode) => [mode.name, mode.fields]),
            );

            const byName = (left, right) => left.localeCompare(right);
            expect(Object.keys(published).sort(byName), apiVersion).toEqual(Object.keys(shipped).sort(byName));

            for (const [mode, fields] of Object.entries(published)) {
                // Assert the index sets first. Reaching straight for
                // shipped[mode][index] turns a published index the app does not
                // ship into a TypeError, which reports the drift as a crash
                // rather than as the mismatch it is.
                expect(Object.keys(fields).sort(byName), `${apiVersion} ${mode}`).toEqual(
                    Object.keys(shipped[mode]).sort(byName),
                );

                for (const [index, field] of Object.entries(fields)) {
                    // The shipped table carries the same three keys plus the
                    // optional enum/flag names; compare what both always have.
                    const { label, unit, scale } = shipped[mode][index];
                    expect({ label, unit, scale }, `${apiVersion} ${mode}[${index}]`).toEqual({
                        label: field.label,
                        unit: field.unit,
                        scale: field.scale,
                    });
                }
            }
        }
    });

    it("names only units from the shared vocabulary, at a real field index", () => {
        const symbols = new Set(debugUnitSymbols());
        for (const [apiVersion, version] of Object.entries(artifact.versions)) {
            for (const mode of version.modes) {
                for (const [index, field] of Object.entries(mode.fields)) {
                    const where = `${apiVersion} ${mode.name}[${index}]`;
                    expect(Number(index), where).toBeGreaterThanOrEqual(0);
                    expect(Number(index), where).toBeLessThan(DEBUG_VALUE_COUNT);
                    expect(field.label, where).not.toBe("");
                    if (field.unit !== null) {
                        expect(symbols.has(field.unit), `${where} unit "${field.unit}"`).toBe(true);
                    }
                }
                for (const index of mode.writes) {
                    expect(index, `${apiVersion} ${mode.name} writes`).toBeLessThan(DEBUG_VALUE_COUNT);
                }
            }
        }
    });

    it("resolves every alias and rename to a mode that exists", () => {
        expect(artifact.aliases).toEqual(DEBUG_MODE_ALIASES);

        const latest = new Set(
            Object.values(artifact.versions)
                .at(-1)
                .modes.map((mode) => mode.name),
        );
        for (const [legacy, current] of Object.entries(artifact.aliases)) {
            expect(latest.has(current), `alias ${legacy} -> ${current}`).toBe(true);
        }
        for (const rename of artifact.renames) {
            const from = new Set(artifact.versions[rename.fromApi].modes.map((mode) => mode.name));
            const to = new Set(artifact.versions[rename.toApi].modes.map((mode) => mode.name));
            expect(from.has(rename.from), `${rename.from} in ${rename.fromApi}`).toBe(true);
            expect(to.has(rename.to), `${rename.to} in ${rename.toApi}`).toBe(true);
        }
    });

    it("reports each conflicting field against a mode that has it", () => {
        for (const conflict of artifact.conflicts) {
            const where = `${conflict.apiVersion} ${conflict.mode}[${conflict.index}]`;
            const mode = artifact.versions[conflict.apiVersion].modes.find((entry) => entry.name === conflict.mode);
            expect(mode, where).toBeDefined();
            expect(Object.keys(mode.fields), where).toContain(String(conflict.index));
            // A field with two meanings cannot carry one unit or scaling.
            expect(mode.fields[conflict.index].unit, where).toBeNull();
            expect(conflict.meanings.length, where).toBeGreaterThan(1);
            for (const meaning of conflict.meanings) {
                expect(meaning.sites.length, where).toBeGreaterThan(0);
            }
        }
    });

    it("publishes the unit vocabulary the app itself uses", () => {
        expect(artifact.units).toEqual(JSON.parse(JSON.stringify(DEBUG_UNITS)));
    });
});

describe("generated/debug-fields.schema.json", () => {
    it("accepts exactly the units the generator does", () => {
        const units = schema.properties.versions.additionalProperties.properties.modes.items.properties.fields;
        expect(units.additionalProperties.properties.unit.oneOf[0].enum).toEqual(
            [...debugUnitSymbols()].sort((left, right) => left.localeCompare(right)),
        );
    });

    it("describes the document the generator writes", () => {
        expect(artifact.$schema).toBe(schema.$id);
        for (const key of schema.required) {
            expect(artifact, `required "${key}"`).toHaveProperty(key);
        }
        // additionalProperties is false throughout, so an unannounced top-level
        // key would make every consumer's validation fail.
        expect(Object.keys(artifact).sort()).toEqual(Object.keys(schema.properties).sort());
    });
});
