import { defineStore } from "pinia";
import { ref } from "vue";

// Pinia store to hold CLI autocomplete cache and builder state
export const useCliAutocompleteStore = defineStore("cliAutocomplete", () => {
    const cache = ref({
        commands: [],
        resources: [],
        resourcesCount: {},
        settings: [],
        settingsAcceptedValues: {},
        feature: [],
        beeper: ["ALL"],
        mixers: [],
    });

    const builder = ref({ state: "reset", numFails: 0 });
    const forceOpen = ref(false);

    function setCache(newCache) {
        cache.value = Object.assign({}, cache.value, newCache);
    }

    function setBuilder(newBuilder) {
        builder.value = Object.assign({}, builder.value, newBuilder);
    }

    function syncFromCli() {
        // Copy data from the legacy CliAutoComplete module when available
        try {
            if (typeof window !== "undefined" && window.CliAutoComplete) {
                const c = window.CliAutoComplete.cache || {};
                setCache(c);
                const b = window.CliAutoComplete.builder || {};
                setBuilder(b);
            }
        } catch (e) {
            // ignore
        }
    }

    function openLater(force = false) {
        try {
            if (
                typeof window !== "undefined" &&
                window.CliAutoComplete &&
                typeof window.CliAutoComplete.openLater === "function"
            ) {
                window.CliAutoComplete.openLater(force);
                forceOpen.value = !!force;
            }
        } catch (e) {}
    }

    return {
        cache,
        builder,
        forceOpen,
        setCache,
        setBuilder,
        syncFromCli,
        openLater,
    };
});
