import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// gui_log caches the store in module scope, so every test starts from a fresh module registry and
// imports both modules after it, keeping the test and gui_log on the same store module instance.
beforeEach(() => {
    vi.resetModules();
    setActivePinia(undefined);
});

async function loadModules() {
    const { useLogStore } = await import("../../src/stores/log");
    const { gui_log } = await import("../../src/js/gui_log");
    return { useLogStore, gui_log };
}

const messages = (useLogStore) => useLogStore().entries.map((entry) => entry.message);

describe("gui_log", () => {
    it("appends the message to the log store", async () => {
        setActivePinia(createPinia());
        const { useLogStore, gui_log } = await loadModules();

        gui_log("connected");

        expect(messages(useLogStore)).toEqual(["connected"]);
    });

    it("keeps messages in the order they were logged", async () => {
        setActivePinia(createPinia());
        const { useLogStore, gui_log } = await loadModules();

        gui_log("first");
        gui_log("second");

        expect(messages(useLogStore)).toEqual(["first", "second"]);
    });

    it("swallows the error when Pinia is not active yet", async () => {
        const { gui_log } = await loadModules();

        expect(() => gui_log("logged during early boot")).not.toThrow();
    });

    it("starts logging once Pinia becomes active after an early call", async () => {
        const { useLogStore, gui_log } = await loadModules();
        gui_log("dropped during early boot");

        setActivePinia(createPinia());
        gui_log("logged after boot");

        expect(messages(useLogStore)).toEqual(["logged after boot"]);
    });

    it("resolves the store only once", async () => {
        setActivePinia(createPinia());
        const logModule = await import("../../src/stores/log");
        const spy = vi.spyOn(logModule, "useLogStore");
        const { gui_log } = await import("../../src/js/gui_log");

        gui_log("first");
        gui_log("second");

        expect(spy).toHaveBeenCalledTimes(1);
    });
});
