import { describe, expect, it } from "vitest";
import semver from "semver";
import fieldUsage from "../../generated/debug_field_usage.json";
import { DEBUG_MODE_ALIASES, FIRMWARE_DEBUG_MODES } from "../../../src/js/debug_modes_table";
import { FIRMWARE_DEBUG_FIELDS } from "../../../src/js/debug_fields_table";
import { getDebugFieldNames, getDebugModes } from "../../../src/js/utils/debugModes";

/*
 * Keeps the hand-written half of `src/js/utils/debugModes.js` honest against the
 * firmware, which is the single source of truth for debug modes.
 *
 * `src/js/debug_modes_table.js`, `src/js/debug_fields_table.js` and
 * `test/generated/debug_field_usage.json` are all produced by
 * `npm run generate:debug-modes` from the firmware sources: the mode table holds
 * the `debug_mode_e` enum per API version, the field table holds the label, unit
 * and scaling of every `debug[n]` the firmware annotates, and the fixture holds
 * the indices each mode's `DEBUG_SET()` call sites actually write.
 *
 * Firmware from API 1.49 on annotates its call sites, so its labels are generated
 * and cannot drift — that is asserted below. For older firmware the labels stay
 * hand-written, and this file holds them to what those firmwares really write.
 */

/*
 * Label gaps that exist today in the hand-written table, as
 * `<api> <mode>: <problem>`. Only firmware that predates the `//!<` field
 * annotations can appear here; an annotated version has no gaps by construction.
 *
 * "unlabelled fields"           - firmware writes the field, no label for it, so
 *                                 it shows as a bare "Debug [n]".
 * "labels for unwritten fields" — a label describes a field no firmware of that
 *                                 version writes any more (usually a leftover
 *                                 from before a mode was reworked).
 *
 * After re-running the generator, update this list along with any labels you
 * add: a new entry appearing here is the firmware having moved, and every entry
 * removed is a label gap closed. Modes whose index is computed at run time
 * (`DEBUG_SET(mode, axis, ...)`) are exempt from the unwritten-field half of the
 * check, because the scan cannot enumerate what they write.
 */
const KNOWN_LABEL_GAPS = [
    "1.44.0 BATTERY: unlabelled fields [2,3]",
    "1.44.0 SBUS: labels for unwritten fields [1]",
    "1.44.0 RANGEFINDER: labels for unwritten fields [0]",
    "1.44.0 RC_SMOOTHING: labels for unwritten fields [0]",
    "1.44.0 FEEDFORWARD_LIMIT: labels for unwritten fields [3]",
    "1.44.0 FEEDFORWARD: unlabelled fields [3]",
    "1.44.0 GYRO_SAMPLE: unlabelled fields [3]",
    "1.44.0 RX_TIMING: labels for unwritten fields [2,3]",
    "1.44.0 SCHEDULER_DETERMINISM: labels for unwritten fields [4,5,6,7]",
    "1.44.0 TIMING_ACCURACY: labels for unwritten fields [4,7]",
    "1.45.0 BATTERY: unlabelled fields [2,3]",
    "1.45.0 SBUS: labels for unwritten fields [1]",
    "1.45.0 RANGEFINDER: labels for unwritten fields [0]",
    "1.45.0 RC_SMOOTHING: labels for unwritten fields [0]",
    "1.45.0 FEEDFORWARD_LIMIT: labels for unwritten fields [3]",
    "1.45.0 FEEDFORWARD: unlabelled fields [3]",
    "1.45.0 GYRO_SAMPLE: unlabelled fields [3]",
    "1.45.0 RX_TIMING: labels for unwritten fields [2,3]",
    "1.45.0 SCHEDULER_DETERMINISM: labels for unwritten fields [4,5,6,7]",
    "1.45.0 TIMING_ACCURACY: labels for unwritten fields [4,7]",
    "1.46.0 SBUS: labels for unwritten fields [1]",
    "1.46.0 RANGEFINDER: labels for unwritten fields [0]",
    "1.46.0 FEEDFORWARD: unlabelled fields [3]",
    "1.46.0 GYRO_SAMPLE: unlabelled fields [3]",
    "1.46.0 GPS_RESCUE_HEADING: unlabelled fields [4]",
    "1.46.0 GPS_RESCUE_TRACKING: unlabelled fields [6]",
    "1.46.0 DSHOT_TELEMETRY_COUNTS: unlabelled fields [0,1,2]",
    "1.47.0 SBUS: labels for unwritten fields [1]",
    "1.47.0 RANGEFINDER: labels for unwritten fields [0]",
    "1.47.0 LIDAR_TF: unlabelled fields [4]",
    "1.47.0 GYRO_SAMPLE: unlabelled fields [3]",
    "1.47.0 GPS_RESCUE_HEADING: unlabelled fields [4]",
    "1.47.0 CHIRP: labels for unwritten fields [1,2,3]",
    "1.47.0 FLASH_TEST_PRBS: labels for unwritten fields [1]",
    "1.48.0 SBUS: labels for unwritten fields [1]",
    "1.48.0 RANGEFINDER: labels for unwritten fields [0]",
    "1.48.0 LIDAR_TF: unlabelled fields [4,5,6,7]",
    "1.48.0 RTH: unlabelled fields [4,5,6,7]",
    "1.48.0 GPS_RESCUE_VELOCITY: labels for unwritten fields [4,5,6,7]",
    "1.48.0 GPS_RESCUE_HEADING: unlabelled fields [4]",
    "1.48.0 GPS_RESCUE_HEADING: labels for unwritten fields [5,6]",
    "1.48.0 GPS_RESCUE_TRACKING: labels for unwritten fields [1,7]",
    "1.48.0 ATTITUDE: labels for unwritten fields [7]",
    "1.48.0 FLASH_TEST_PRBS: labels for unwritten fields [1]",
];

const generatedVersions = Object.keys(FIRMWARE_DEBUG_MODES);

function labelledFieldIndices(labels) {
    return Object.keys(labels)
        .filter((key) => key !== "debug[all]")
        .map((key) => Number(key.match(/\d+/)[0]));
}

function collectLabelGaps() {
    const gaps = [];

    for (const [apiVersion, version] of Object.entries(fieldUsage.versions)) {
        const labels = getDebugFieldNames(apiVersion);

        for (const mode of getDebugModes(apiVersion)) {
            const written = version.modes[mode];
            const modeLabels = labels[mode];

            if (!written) {
                // No DEBUG_SET() call site at all: a mode the firmware stopped
                // writing, or one that only ever writes through code this scan
                // does not follow. Only worth reporting if it has no labels either.
                if (!modeLabels) {
                    gaps.push(`${apiVersion} ${mode}: firmware writes nothing, no labels`);
                }
                continue;
            }
            if (!modeLabels) {
                gaps.push(
                    `${apiVersion} ${mode}: firmware writes [${written.fields}]${written.dynamic ? "+dynamic" : ""}, no labels`,
                );
                continue;
            }

            const labelled = labelledFieldIndices(modeLabels);
            const unlabelled = written.fields.filter((field) => !labelled.includes(field));
            const unwritten = written.dynamic ? [] : labelled.filter((field) => !written.fields.includes(field));

            if (unlabelled.length > 0) {
                gaps.push(`${apiVersion} ${mode}: unlabelled fields [${unlabelled}]`);
            }
            if (unwritten.length > 0) {
                gaps.push(`${apiVersion} ${mode}: labels for unwritten fields [${unwritten}]`);
            }
        }
    }

    return gaps;
}

describe("debug modes against the firmware source", () => {
    describe("generated mode table", () => {
        it("covers every API version the field-usage fixture was generated from", () => {
            expect(Object.keys(fieldUsage.versions)).toEqual(generatedVersions);
        });

        it("is what getDebugModes returns for each generated version", () => {
            for (const apiVersion of generatedVersions) {
                expect(getDebugModes(apiVersion)).toEqual([...FIRMWARE_DEBUG_MODES[apiVersion]]);
            }
        });

        it("starts every version at NONE and never repeats a mode inside one", () => {
            for (const apiVersion of generatedVersions) {
                const modes = FIRMWARE_DEBUG_MODES[apiVersion];
                expect(modes[0]).toBe("NONE");
                expect(new Set(modes).size).toBe(modes.length);
            }
        });

        it("only ever grows: a version never has fewer modes than an older one", () => {
            const sorted = [...generatedVersions].sort(semver.compare);
            for (let i = 1; i < sorted.length; i++) {
                expect(FIRMWARE_DEBUG_MODES[sorted[i]].length).toBeGreaterThanOrEqual(
                    FIRMWARE_DEBUG_MODES[sorted[i - 1]].length,
                );
            }
        });
    });

    describe("rename aliases", () => {
        it("map a name an older firmware used onto one the newest firmware has", () => {
            const newest = FIRMWARE_DEBUG_MODES[[...generatedVersions].sort(semver.compare).at(-1)];
            for (const [legacyName, currentName] of Object.entries(DEBUG_MODE_ALIASES)) {
                expect(newest).toContain(currentName);
                expect(newest).not.toContain(legacyName);
                expect(generatedVersions.some((version) => FIRMWARE_DEBUG_MODES[version].includes(legacyName))).toBe(
                    true,
                );
            }
        });

        it("keep the labels of a renamed mode reachable under both names", () => {
            for (const [legacyName, currentName] of Object.entries(DEBUG_MODE_ALIASES)) {
                for (const apiVersion of generatedVersions) {
                    const modes = FIRMWARE_DEBUG_MODES[apiVersion];
                    const labels = getDebugFieldNames(apiVersion);
                    const name = modes.includes(legacyName) ? legacyName : currentName;
                    if (modes.includes(name) && (labels[legacyName] || labels[currentName])) {
                        expect(labels[name]).toBeDefined();
                    }
                }
            }
        });
    });

    describe("field labels", () => {
        it("come from the firmware annotations for every version that carries them", () => {
            const annotated = Object.keys(FIRMWARE_DEBUG_FIELDS);
            expect(annotated.length).toBeGreaterThan(0);

            for (const apiVersion of annotated) {
                const labels = getDebugFieldNames(apiVersion);
                for (const [mode, fields] of Object.entries(FIRMWARE_DEBUG_FIELDS[apiVersion])) {
                    const generated = Object.fromEntries(
                        Object.entries(fields).map(([index, field]) => [`debug[${index}]`, field.label]),
                    );
                    const shown = Object.fromEntries(
                        Object.entries(labels[mode]).filter(([field]) => field !== "debug[all]"),
                    );
                    // Exactly the annotated fields, with exactly firmware's wording:
                    // nothing added by hand, and nothing left over from a rework.
                    expect(shown, `${apiVersion} ${mode}`).toEqual(generated);
                }
            }
        });

        it("leaves no gap on a version whose firmware is annotated", () => {
            for (const gap of collectLabelGaps()) {
                expect(Object.keys(FIRMWARE_DEBUG_FIELDS)).not.toContain(gap.split(" ")[0]);
            }
        });

        it("match the debug[n] indices the firmware writes, except for known gaps", () => {
            // Sorted on both sides: a mode inserted mid-enum reorders the report, and
            // the diff should show what changed, not where everything moved to.
            expect([...collectLabelGaps()].sort()).toEqual([...KNOWN_LABEL_GAPS].sort());
        });

        it("never label a field outside debug[0]..debug[7]", () => {
            for (const apiVersion of generatedVersions) {
                const labels = getDebugFieldNames(apiVersion);
                for (const modeLabels of Object.values(labels)) {
                    for (const index of labelledFieldIndices(modeLabels)) {
                        expect(index).toBeGreaterThanOrEqual(0);
                        expect(index).toBeLessThan(8);
                    }
                }
            }
        });

        it("give every labelled mode a debug[all] summary label", () => {
            for (const apiVersion of generatedVersions) {
                for (const [mode, modeLabels] of Object.entries(getDebugFieldNames(apiVersion))) {
                    expect(modeLabels["debug[all]"], `${apiVersion} ${mode}`).toBeDefined();
                }
            }
        });
    });
});
