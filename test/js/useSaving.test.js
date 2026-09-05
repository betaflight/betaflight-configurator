import { afterEach, describe, expect, it, vi } from "vitest";
import { useSaving } from "../../src/composables/useSaving";
import { MspCancelledError } from "../../src/js/msp/mspErrors.js";
import { gui_log } from "../../src/js/gui_log.js";

vi.mock("../../src/js/gui_log.js", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization.js", () => ({
    i18n: { getMessage: vi.fn((key) => `t:${key}`) },
}));

describe("useSaving", () => {
    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it("sets isSaving true while running and false after completion", async () => {
        const { isSaving, runSave } = useSaving();
        expect(isSaving.value).toBe(false);

        let resolveFn;
        const fn = vi.fn(() => new Promise((resolve) => (resolveFn = resolve)));

        const pending = runSave(fn);
        expect(isSaving.value).toBe(true);

        resolveFn();
        await pending;

        expect(fn).toHaveBeenCalledTimes(1);
        expect(isSaving.value).toBe(false);
    });

    it("blocks re-entry while a save is in progress", async () => {
        const { isSaving, runSave } = useSaving();

        let resolveFirst;
        const first = vi.fn(() => new Promise((resolve) => (resolveFirst = resolve)));
        const second = vi.fn().mockResolvedValue();

        const pending = runSave(first);
        expect(isSaving.value).toBe(true);

        await runSave(second);
        expect(second).not.toHaveBeenCalled();

        resolveFirst();
        await pending;
        expect(isSaving.value).toBe(false);
    });

    it("surfaces a genuine failure to the user and the console, then resets isSaving", async () => {
        const { isSaving, runSave } = useSaving();
        const error = new Error("boom");
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});

        await runSave(() => Promise.reject(error));

        expect(spy).toHaveBeenCalledWith("Save failed:", error);
        expect(gui_log).toHaveBeenCalledTimes(1);
        expect(gui_log).toHaveBeenCalledWith("t:configurationSaveFailed");
        expect(isSaving.value).toBe(false);
    });

    it("still notifies the user when an onError follow-up is given, and runs it afterwards", async () => {
        const { isSaving, runSave } = useSaving();
        const error = new Error("boom");
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        const onError = vi.fn(() => {
            // by the time the tab-specific follow-up runs, the shared notification is already out
            expect(gui_log).toHaveBeenCalledWith("t:configurationSaveFailed");
        });

        await runSave(() => Promise.reject(error), { onError });

        expect(onError).toHaveBeenCalledWith(error);
        expect(spy).toHaveBeenCalledWith("Save failed:", error);
        expect(gui_log).toHaveBeenCalledTimes(1);
        expect(isSaving.value).toBe(false);
    });

    it("swallows a benign MSP cancellation without notifying anyone", async () => {
        const { isSaving, runSave } = useSaving();
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        const onError = vi.fn();

        await runSave(() => Promise.reject(new MspCancelledError()), { onError });

        expect(onError).not.toHaveBeenCalled();
        expect(gui_log).not.toHaveBeenCalled();
        expect(spy).not.toHaveBeenCalled();
        expect(isSaving.value).toBe(false);
    });
});
