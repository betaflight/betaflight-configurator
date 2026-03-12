import { describe, expect, it } from "vitest";
import {
    collectUniqueValues,
    getCheckedOptionNames,
    getDefaultFirmwareSelections,
    getFitPresets,
    normalizeStoredSources,
} from "../../src/stores/presets_helpers";

describe("presets helpers", () => {
    it("normalizes sources and keeps the official source first", () => {
        const sources = normalizeStoredSources([{ name: "Custom", url: "https://example.com", gitHubBranch: "" }]);

        expect(sources).toHaveLength(2);
        expect(sources[0].name).toBe("Betaflight Official Presets");
        expect(sources[0].official).toBe(true);
        expect(sources[1].name).not.toBe("");
    });

    it("derives firmware defaults from the connected controller version", () => {
        const repositories = [
            {
                index: {
                    uniqueValues: {
                        firmware_version: ["4.5", "4.6"],
                    },
                },
            },
        ];

        expect(getDefaultFirmwareSelections(repositories, "4.5.2")).toEqual(["4.5"]);
    });

    it("collects checked option names from grouped and flat options", () => {
        const options = [
            { name: "Option A", checked: true },
            {
                name: "Group",
                childs: [
                    { name: "Child 1", checked: false },
                    { name: "Child 2", checked: true },
                ],
            },
        ];

        expect(getCheckedOptionNames(options)).toEqual(["Option A", "Child 2"]);
    });

    it("dedupes preset hashes and keeps favorites at the top", () => {
        const favoritePreset = {
            hash: "abc",
            title: "Favorite",
            priority: 1,
            lastPickDate: 20,
            status: "OFFICIAL",
            category: "Frames",
            keywords: ["freestyle"],
            author: "Eric",
            firmware_version: ["4.5"],
            description: ["favorite preset"],
        };
        const duplicatePreset = {
            ...favoritePreset,
            title: "Duplicate copy",
            lastPickDate: undefined,
        };
        const secondPreset = {
            hash: "xyz",
            title: "Second",
            priority: 5,
            status: "OFFICIAL",
            category: "Frames",
            keywords: ["freestyle"],
            author: "Eric",
            firmware_version: ["4.5"],
            description: ["second preset"],
        };

        const repositories = [
            { index: { presets: [favoritePreset, secondPreset] } },
            { index: { presets: [duplicatePreset] } },
        ];

        const results = getFitPresets(repositories, {
            categories: [],
            keywords: [],
            authors: [],
            firmwareVersions: [],
            status: [],
            searchString: "",
        });

        expect(results).toHaveLength(2);
        expect(results[0][0].title).toBe("Favorite");
        expect(results.map(([preset]) => preset.hash)).toEqual(["abc", "xyz"]);
    });

    it("collects and sorts unique values", () => {
        const repositories = [
            { index: { uniqueValues: { author: ["Zulu", "alpha"] } } },
            { index: { uniqueValues: { author: ["Bravo"] } } },
        ];

        expect(collectUniqueValues(repositories, (repository) => repository.index.uniqueValues.author)).toEqual([
            "alpha",
            "Bravo",
            "Zulu",
        ]);
    });
});
