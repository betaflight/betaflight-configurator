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

    it("keeps a profile reset dirty through the reload it triggers", () => {
        const store = usePidTuningStore();
        store.markEditsClean();
        store.markProfileClean();

        // MSP_SET_RESET_CURR_PID rewrites the profile in RAM, then the tab reloads the defaults
        // and adopts them as the clean value baseline.
        store.markProfileUnsaved();
        FC.PIDS = [[45, 80, 40]];
        store.markEditsClean();

        expect(store.hasEdits).toBe(false);
        expect(store.hasChanges).toBe(true);
    });

    it("keeps a profile reset dirty across a refresh", () => {
        const store = usePidTuningStore();
        store.markEditsClean();
        store.markProfileClean();

        store.markProfileUnsaved();
        store.markEditsClean();
        // Refresh only re-reads the FC — it cannot put the pre-reset values back.
        store.markEditsClean();

        expect(store.hasChanges).toBe(true);
    });

    it("flags a copy into another profile, which leaves the shown values untouched", () => {
        const store = usePidTuningStore();
        store.markEditsClean();
        store.markProfileClean();

        // MSP_COPY_PROFILE writes the destination profile in RAM; nothing on screen changes.
        store.markProfileUnsaved();

        expect(store.hasEdits).toBe(false);
        expect(store.hasChanges).toBe(true);
    });

    it("clears a profile reset once it is persisted", () => {
        const store = usePidTuningStore();
        store.markEditsClean();
        store.markProfileClean();

        store.markProfileUnsaved();
        expect(store.hasChanges).toBe(true);

        store.markProfileClean();

        expect(store.hasChanges).toBe(false);
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

    it("keeps a pending reset when the FC switches profile by itself", () => {
        const store = usePidTuningStore();
        store.markEditsClean();
        store.markProfileClean();

        store.markProfileUnsaved();
        // A TX adjustment moved the FC to another profile; the tab reloads and adopts it. That
        // says nothing about whether the earlier reset reached EEPROM.
        FC.CONFIG.profile = 1;
        store.markEditsClean();
        store.markProfileSelectionClean();

        expect(store.hasChanges).toBe(true);
    });

    it("keeps an edit made while the save was in flight dirty", () => {
        const store = usePidTuningStore();
        store.markEditsClean();
        store.markProfileClean();

        FC.PIDS[0][0] = 50;
        // The save crunches its payload, then writes — pin what it is about to send.
        const pending = store.takeEditsSnapshot();
        FC.PIDS[0][1] = 60; // typed while the MSP writes were in flight
        store.markEditsClean(pending);

        expect(store.hasEdits).toBe(true);
    });

    it("ignores the FC's slider validity verdict, which a save re-reads", () => {
        FC.TUNING_SLIDERS.slider_pids_valid = 1;
        const store = usePidTuningStore();
        store.markEditsClean();
        store.markProfileClean();

        // MSP_VALIDATE_SIMPLIFIED_TUNING after the write: hand-edited PIDs no longer match what
        // the sliders would produce. Not an edit, and not a reason to keep Save lit.
        FC.TUNING_SLIDERS.slider_pids_valid = 0;

        expect(store.hasEdits).toBe(false);
        expect(store.hasChanges).toBe(false);
    });

    it("still flags a slider position change", () => {
        const store = usePidTuningStore();
        store.markEditsClean();
        store.markProfileClean();

        FC.TUNING_SLIDERS.slider_pids_mode = 2;

        expect(store.hasEdits).toBe(true);
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
