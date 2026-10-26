/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import PresetParser, { type ParsedPreset } from "../../src/components/tabs/presets/PresetsRepoIndexed/PresetParser";
import { presetsIndexSettings } from "./presetsIndexSettings";

const parser = () => new PresetParser(structuredClone(presetsIndexSettings));

function read(lines: string[], preset: ParsedPreset = {}): ParsedPreset {
    parser().readPresetProperties(preset, lines);
    return preset;
}

describe("PresetParser.readPresetProperties", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("reads string, string-array, file-path-array, boolean and parser properties", () => {
        const preset = read([
            "#$ TITLE: ignored, already in the index",
            "#$ DESCRIPTION: first line",
            "#$ DESCRIPTION: second line",
            "#$ DISCUSSION: https://example.com/discussion",
            "#$ WARNING: careful",
            "#$ DISCLAIMER: no warranty",
            "#$ INCLUDE_WARNING: misc/warning.txt",
            "#$ INCLUDE_WARNING: misc/warning2.txt",
            "#$ INCLUDE_DISCLAIMER: misc/disclaimer.txt",
            "#$ FORCE_OPTIONS_REVIEW: TRUE",
            "#$ PARSER: MARKED",
            "set gyro_lpf1_static_hz = 250",
        ]);

        expect(preset).toEqual({
            options: [],
            description: ["first line", "second line"],
            discussion: "https://example.com/discussion",
            warning: "careful",
            disclaimer: "no warranty",
            include_warning: ["misc/warning.txt", "misc/warning2.txt"],
            include_disclaimer: ["misc/disclaimer.txt"],
            force_options_review: true,
            parser: "MARKED",
        });
    });

    it.each([
        ["yes", true],
        ["true", true],
        ["no", false],
        ["1", false],
    ])("reads the boolean %s as %s", (value, expected) => {
        expect(read([`#$ FORCE_OPTIONS_REVIEW: ${value}`]).force_options_review).toBe(expected);
    });

    it("clears the properties and options it reads before reading again", () => {
        const preset = read(["#$ DESCRIPTION: old", "#$ OPTION BEGIN (CHECKED): Old option", "#$ OPTION END"]);

        read(["#$ WARNING: new"], preset);

        expect(preset.description).toBeUndefined();
        expect(preset.warning).toBe("new");
        expect(preset.options).toEqual([]);
    });

    it("keeps the index fields it does not read", () => {
        const preset = read(["#$ WARNING: w"], { title: "From index", hash: "abc" });

        expect(preset.title).toBe("From index");
        expect(preset.hash).toBe("abc");
    });

    it("ignores lines that are not metadata, including indented ones", () => {
        expect(read(["# WARNING: plain comment", "  #$ WARNING: indented"]).warning).toBeUndefined();
    });

    it("reads options and groups, checked state and names", () => {
        const preset = read([
            "#$ OPTION BEGIN (UNCHECKED): Top level",
            "#$ OPTION END",
            "#$ OPTION_GROUP BEGIN: Filters",
            "#$ OPTION BEGIN (CHECKED): Medium Build Quality",
            "#$ OPTION END",
            "#$ OPTION BEGIN (unchecked): low Build Quality",
            "#$ OPTION END",
            "#$ OPTION_GROUP END",
            "#$ OPTION BEGIN (CHECKED): After the group",
            "#$ OPTION END",
        ]);

        expect(preset.options).toEqual([
            { name: "Top level", checked: false },
            {
                name: "Filters",
                isExclusive: false,
                childs: [
                    { name: "Medium Build Quality", checked: true },
                    { name: "low Build Quality", checked: false },
                ],
            },
            { name: "After the group", checked: true },
        ]);
        expect(preset).not.toHaveProperty("_currentOptionGroup");
    });

    it("reads an exclusive option group", () => {
        const preset = read([
            "#$ OPTION_GROUP BEGIN: (EXCLUSIVE) A Mutually Exclusive set of options",
            "#$ OPTION BEGIN (UNCHECKED): Option the first",
            "#$ OPTION END",
            "#$ OPTION_GROUP END",
        ]);

        expect(preset.options).toEqual([
            {
                name: "A Mutually Exclusive set of options",
                isExclusive: true,
                childs: [{ name: "Option the first", checked: false }],
            },
        ]);
    });

    it("logs, instead of throwing, for a property type it does not know", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const settings = structuredClone(presetsIndexSettings);
        settings.presetsFileMetadata.warning = { type: "NEW_TYPE", optional: true };
        const preset: ParsedPreset = {};

        new PresetParser(settings).readPresetProperties(preset, ["#$ WARNING: w", "#$ DISCLAIMER: d"]);

        expect(error).toHaveBeenCalledWith(expect.stringContaining("unknown property type 'NEW_TYPE'"));
        expect(preset.warning).toBeUndefined();
        expect(preset.disclaimer).toBe("d");
    });

    it("logs, instead of throwing, for a property the index has no metadata for", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const settings = structuredClone(presetsIndexSettings);
        delete settings.presetsFileMetadata.parser;
        const preset: ParsedPreset = {};

        new PresetParser(settings).readPresetProperties(preset, ["#$ PARSER: MARKED", "#$ DISCLAIMER: d"]);

        expect(error).toHaveBeenCalledWith(expect.stringContaining("no metadata for the property 'parser'"));
        expect(preset.parser).toBeUndefined();
        expect(preset.disclaimer).toBe("d");
    });
});

describe("PresetParser.removeUncheckedOptions", () => {
    const lines = [
        "#$ TITLE: t",
        "set a = 1",
        "#$ OPTION BEGIN (CHECKED): Keep me",
        "set b = 2",
        "#$ OPTION END",
        "",
        "#$ OPTION BEGIN (UNCHECKED): Drop me",
        "set c = 3",
        "",
        "#$ OPTION END",
        "",
        "",
        "set d = 4",
    ];

    it("keeps the bodies of checked options and drops the rest, without metadata lines", () => {
        expect(parser().removeUncheckedOptions(lines, ["Keep me"])).toEqual([
            "set a = 1",
            "set b = 2",
            "",
            "set d = 4",
        ]);
    });

    it("matches option names case-insensitively", () => {
        expect(parser().removeUncheckedOptions(lines, ["KEEP ME", "drop me"])).toEqual([
            "set a = 1",
            "set b = 2",
            "",
            "set c = 3",
            "",
            "set d = 4",
        ]);
    });

    it("drops every option when none is checked", () => {
        expect(parser().removeUncheckedOptions(lines, [])).toEqual(["set a = 1", "", "set d = 4"]);
    });

    it("recognises indented directive lines, as preset files write them", () => {
        const indented = [
            "    #$ OPTION BEGIN (UNCHECKED): Drop me",
            "        set c = 3",
            "    #$ OPTION END",
            "set d = 4",
        ];

        expect(parser().removeUncheckedOptions(indented, [])).toEqual(["set d = 4"]);
    });

    it("collapses runs of empty lines to one", () => {
        expect(parser().removeUncheckedOptions(["a", "", "", "", "b", ""], [])).toEqual(["a", "", "b", ""]);
    });
});

describe("PresetParser.isIncludeFound", () => {
    it("finds an #$ INCLUDE line", () => {
        expect(parser().isIncludeFound(["set a = 1", "#$ INCLUDE: presets/4.3/filters/defaults.txt"])).toBe(true);
    });

    it("ignores other lines", () => {
        expect(parser().isIncludeFound(["set a = 1", "#$ INCLUDE_WARNING: misc/w.txt", "# INCLUDE: x.txt"])).toBe(
            false,
        );
    });

    it("extracts the file path", () => {
        expect(PresetParser._sRegExpInclude.exec("#$ INCLUDE: presets/a b.txt")).toBeNull();
        expect(PresetParser._sRegExpInclude.exec("#$ INCLUDE: presets/a.txt")?.groups?.filePath).toBe("presets/a.txt");
    });
});
