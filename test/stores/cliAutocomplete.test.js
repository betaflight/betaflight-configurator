import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useCliAutocompleteStore } from "../../src/stores/cliAutocomplete";

describe("cliAutocomplete store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        // ensure legacy module is not set by default
        // clear any existing global
        try {
            globalThis.CliAutoComplete = undefined;
        } catch (e) {}
    });

    it("syncFromCli copies cache and builder from legacy module", () => {
        setActivePinia(createPinia());
        const store = useCliAutocompleteStore();
        // Prepare legacy module
        globalThis.CliAutoComplete = {
            cache: { commands: ["foo"], resources: ["BAR"], resourcesCount: { BAR: 2 } },
            builder: { state: "done", numFails: 0 },
        };

        store.syncFromCli();

        expect(store.cache.commands).toContain("foo");
        expect(store.cache.resources).toContain("BAR");
        expect(store.cache.resourcesCount.BAR).toBe(2);
        expect(store.builder.state).toBe("done");
    });
});
