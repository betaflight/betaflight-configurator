import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import GUI from "../../src/js/gui";
import FC from "../../src/js/fc";
import { favoritePresets } from "../../src/tabs/presets/FavoritePresets";
import { usePresetsStore } from "../../src/stores/presets";

const settings = {
    MetadataTypes: {
        STRING_ARRAY: "STRING_ARRAY",
        STRING: "STRING",
        FILE_PATH: "FILE_PATH",
        FILE_PATH_ARRAY: "FILE_PATH_ARRAY",
        BOOLEAN: "BOOLEAN",
        PARSER: "PARSER",
    },
    presetsFileMetadata: {
        description: { type: "STRING_ARRAY" },
        discussion: { type: "STRING" },
        warning: { type: "STRING" },
        disclaimer: { type: "STRING" },
        include_warning: { type: "FILE_PATH_ARRAY" },
        include_disclaimer: { type: "FILE_PATH_ARRAY" },
        force_options_review: { type: "BOOLEAN" },
        parser: { type: "PARSER" },
    },
    MetapropertyDirective: "#$",
    OptionsDirectives: {
        OPTION_DIRECTIVE: "option",
        BEGIN_OPTION_DIRECTIVE: "option begin",
        END_OPTION_DIRECTIVE: "option end",
        BEGIN_OPTION_GROUP_DIRECTIVE: "option group begin",
        END_OPTION_GROUP_DIRECTIVE: "option group end",
        OPTION_CHECKED: "selected",
        OPTION_UNCHECKED: "cleared",
        EXCLUSIVE_OPTION_GROUP: "exclusive",
    },
    PresetStatusEnum: ["OFFICIAL", "COMMUNITY", "EXPERIMENTAL"],
};

function mockFetchImplementation() {
    return vi.fn().mockImplementation((url) => {
        if (url.endsWith("index.json")) {
            return Promise.resolve({
                json: () =>
                    Promise.resolve({
                        majorVersion: 1,
                        minorVersion: 0,
                        settings,
                        uniqueValues: {
                            category: ["Frames"],
                            keywords: ["freestyle"],
                            author: ["Eric"],
                            firmware_version: ["4.5"],
                        },
                        presets: [
                            {
                                hash: "preset-a",
                                fullPath: "preset-a.txt",
                                title: "Preset A",
                                priority: 3,
                                status: "OFFICIAL",
                                category: "Frames",
                                keywords: ["freestyle"],
                                author: "Eric",
                                firmware_version: ["4.5"],
                            },
                        ],
                    }),
            });
        }

        if (url.endsWith("preset-a.txt")) {
            return Promise.resolve({
                text: () =>
                    Promise.resolve(`#$ description: Demo preset
#$ parser: MARKED
#$ option begin selected: Option A
set foo = on
#$ option end
#$ option begin cleared: Option B
set bar = on
#$ option end`),
            });
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
    });
}

describe("usePresetsStore", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        localStorage.clear();
        favoritePresets.loadFromStorage();
        FC.CONFIG.flightControllerVersion = "4.5.1";
        vi.restoreAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.stubGlobal("fetch", mockFetchImplementation());
        vi.spyOn(GUI, "showYesNoDialog").mockImplementation((settings) => settings.buttonYesCallback?.());
    });

    it("loads repositories, preselects firmware filters, and opens preset details", async () => {
        const store = usePresetsStore();

        store.initialize();
        await store.reloadRepositories();

        expect(store.repositories).toHaveLength(1);
        expect(store.filterOptions.categories).toEqual(["Frames"]);
        expect(store.filters.firmwareVersions).toEqual(["4.5"]);
        expect(store.visiblePresetEntries).toHaveLength(1);

        const { preset, repository } = store.visiblePresetEntries[0];
        await store.openPresetDetails(preset, repository);

        expect(store.detailsState.loading).toBe(false);
        expect(store.selectedPreset.title).toBe("Preset A");
        expect(store.detailsState.selectedOptionIds).toEqual(["0"]);
        expect(store.selectedPresetOptionLabels).toEqual(["Option A"]);
        expect(store.selectedPresetCliStrings).toEqual(["set foo = on"]);

        store.setOptionChecked("1", true);
        expect(store.selectedPresetCliStrings).toEqual(["set foo = on", "set bar = on"]);
    });

    it("falls back to the primary source if all active indexes become invalid", () => {
        localStorage.setItem(
            "PresetSources",
            JSON.stringify({
                PresetSources: [{ name: "Only custom", url: "https://example.com", gitHubBranch: "" }],
            }),
        );
        localStorage.setItem(
            "PresetSourcesActiveIndexes",
            JSON.stringify({
                PresetSourcesActiveIndexes: [99],
            }),
        );

        const store = usePresetsStore();
        store.initialize();

        expect(store.sources[0].official).toBe(true);
        expect(store.activeSourceIndexes).toEqual([0]);
    });

    it("closes the sources dialog when transient state is reset", () => {
        const store = usePresetsStore();

        store.initialize();
        store.openSourcesManager();
        store.resetTransientState();

        expect(store.showSourcesDialog).toBe(false);
    });

    it("gracefully marks a blank-branch GitHub source as failed instead of crashing reload", async () => {
        const store = usePresetsStore();

        store.initialize();
        store.sources = [
            {
                id: "github-source",
                name: "GitHub Source",
                url: "https://github.com/betaflight/firmware-presets",
                gitHubBranch: "",
                official: false,
            },
        ];
        store.activeSourceIds = ["github-source"];

        vi.stubGlobal(
            "fetch",
            vi.fn().mockRejectedValue(new Error("Missing branch index fetch should fail gracefully.")),
        );

        await store.reloadRepositories();

        expect(store.isLoading).toBe(false);
        expect(store.failedRepositoryNames).toEqual(["GitHub Source"]);
    });

    it("ignores stale preset-details responses when a newer preset is opened", async () => {
        const store = usePresetsStore();
        const resolvers = new Map();
        const repository = {
            getPresetOnlineLink: (preset) => `https://example.com/${preset.hash}.txt`,
            removeUncheckedOptions: (strings) => strings,
            loadPreset: vi.fn(
                (preset) =>
                    new Promise((resolve) => {
                        resolvers.set(preset.hash, () => {
                            preset.originalPresetCliStrings = [`set ${preset.hash} = on`];
                            preset.options = [{ name: `Option ${preset.hash.toUpperCase()}`, checked: true }];
                            resolve();
                        });
                    }),
            ),
        };
        const presetA = { hash: "a", fullPath: "preset-a.txt", title: "Preset A" };
        const presetB = { hash: "b", fullPath: "preset-b.txt", title: "Preset B" };

        const openPresetA = store.openPresetDetails(presetA, repository);
        const openPresetB = store.openPresetDetails(presetB, repository);

        resolvers.get("b")();
        await openPresetB;
        resolvers.get("a")();
        await openPresetA;

        expect(store.selectedPreset.title).toBe("Preset B");
        expect(store.selectedPresetCliStrings).toEqual(["set b = on"]);
        expect(store.detailsState.selectedOptionIds).toEqual(["0"]);
        expect(store.selectedPresetOptionLabels).toEqual(["Option B"]);
    });
});
