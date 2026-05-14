import { describe, expect, it } from "vitest";
import {
    attachOptionIds,
    collectUniqueValues,
    getCheckedOptionNames,
    getOptionNamesByIds,
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
        const options = attachOptionIds([
            { name: "Option A", checked: true },
            {
                name: "Group",
                childs: [
                    { name: "Child 1", checked: false },
                    { name: "Child 2", checked: true },
                ],
            },
        ]);

        expect(getCheckedOptionNames(options)).toEqual(["Option A", "Child 2"]);
        expect(getOptionNamesByIds(options, ["0", "1.1"])).toEqual(["Option A", "Child 2"]);
    });

    it("dedupes preset hashes and keeps favorites at the top", () => {
        const favoritePreset = {
            hash: "abc",
            title: "Favorite",
            priority: 1,
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
            {
                index: { presets: [favoritePreset, secondPreset] },
                getPresetOnlineLink: (preset) => `https://example.com/${preset.hash}`,
            },
            {
                index: { presets: [duplicatePreset] },
                getPresetOnlineLink: (preset) => `https://example.com/dup-${preset.hash}`,
            },
        ];

        const results = getFitPresets(
            repositories,
            {
                categories: [],
                keywords: [],
                authors: [],
                firmwareVersions: [],
                status: [],
                searchString: "",
            },
            (preset, repository, key) => ({
                favoriteDate: key === "https://example.com/abc" ? 20 : undefined,
                isPicked: false,
            }),
        );

        expect(results).toHaveLength(2);
        expect(results[0].preset.title).toBe("Favorite");
        expect(results.map((entry) => entry.preset.hash)).toEqual(["abc", "xyz"]);
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
