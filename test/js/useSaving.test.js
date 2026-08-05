import { afterEach, describe, expect, it, vi } from "vitest";
import { useSaving } from "../../src/composables/useSaving";

describe("useSaving", () => {
    afterEach(() => {
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

    it("routes errors to onError and still resets isSaving", async () => {
        const { isSaving, runSave } = useSaving();
        const error = new Error("boom");
        const onError = vi.fn();

        await runSave(() => Promise.reject(error), { onError });

        expect(onError).toHaveBeenCalledWith(error);
        expect(isSaving.value).toBe(false);
    });

    it("falls back to console.error when no onError handler is given", async () => {
        const { isSaving, runSave } = useSaving();
        const error = new Error("boom");
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});

        await runSave(() => Promise.reject(error));

        expect(spy).toHaveBeenCalledWith(error);
        expect(isSaving.value).toBe(false);
    });
});
