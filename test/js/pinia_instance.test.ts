import { describe, expect, it, vi } from "vitest";
import { getActivePinia, setActivePinia } from "pinia";

describe("app pinia instance", () => {
    it("is the active Pinia as soon as it is imported, before Vue installs it", async () => {
        vi.resetModules();
        setActivePinia(undefined);

        const { pinia } = await import("../../src/js/pinia_instance");

        expect(getActivePinia()).toBe(pinia);
    });
});
