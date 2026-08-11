import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import FC from "../../../src/js/fc.js";
import { usePidTuningStore } from "../../../src/stores/pidTuning.js";

describe("pidTuning store dirty tracking", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        FC.resetState();
        FC.CONFIG.profile = 0;
        FC.CONFIG.rateProfile = 0;
        FC.PIDS = [[42, 43, 44]];
    });

    it("reports nothing dirty before a baseline is taken", () => {
        const store = usePidTuningStore();

        expect(store.hasEdits).toBe(false);
        expect(store.hasChanges).toBe(false);
    });

    it("flags an edited value", () => {
        const store = usePidTuningStore();
        store.markEditsClean();
        store.markProfileClean();

        FC.PIDS[0][0] = 50;

        expect(store.hasEdits).toBe(true);
        expect(store.hasChanges).toBe(true);
    });

    it("flags a profile switch without touching hasEdits", () => {
        const store = usePidTuningStore();
        store.markEditsClean();
        store.markProfileClean();

        // MSP_SELECT_SETTING switches the profile in RAM only.
        FC.CONFIG.profile = 1;

        expect(store.hasEdits).toBe(false);
        expect(store.hasChanges).toBe(true);
    });

    it("flags a rate-profile switch", () => {
        const store = usePidTuningStore();
        store.markEditsClean();
        store.markProfileClean();

        FC.CONFIG.rateProfile = 2;

        expect(store.hasChanges).toBe(true);
    });

    it("keeps the tab dirty when the reload that follows a switch re-baselines the values", () => {
        const store = usePidTuningStore();
        store.markEditsClean();
        store.markProfileClean();

        FC.CONFIG.profile = 1;
        // The switch reloads the tab, which adopts the new profile's values as clean.
        FC.PIDS = [[10, 11, 12]];
        store.markEditsClean();

        expect(store.hasEdits).toBe(false);
        expect(store.hasChanges).toBe(true);
    });

    it("clears once the EEPROM write baselines both", () => {
        const store = usePidTuningStore();
        store.markEditsClean();
        store.markProfileClean();

        FC.CONFIG.profile = 1;
        FC.PIDS[0][0] = 50;
        expect(store.hasChanges).toBe(true);

        store.markEditsClean();
        store.markProfileClean();

        expect(store.hasChanges).toBe(false);
    });

    it("flags a renamed PID profile", () => {
        FC.CONFIG.pidProfileNames = ["one", "two", "three"];
        const store = usePidTuningStore();
        store.markEditsClean();
        store.markProfileClean();

        FC.CONFIG.pidProfileNames[FC.CONFIG.profile] = "renamed";

        expect(store.hasEdits).toBe(true);
    });
});
