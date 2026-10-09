import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../../src/js/vue_components.js", () => ({
    __esModule: true,
    VueTabComponents: {},
}));

// A real instance: modules that read FC at import time resolve the FC store through it.
vi.mock("../../src/js/pinia_instance.js", async () => ({
    __esModule: true,
    pinia: (await import("pinia")).createPinia(),
}));

import { buildTabAdapter, unmountVueTab } from "../../src/js/vue_tab_mounter";
import { TABS } from "../../src/js/tab_adapters";
import { useNavigationStore } from "../../src/stores/navigation";

describe("unmountVueTab", () => {
    it("clears tabSwitchInProgress — an unmount cancels the mount that would have cleared it", () => {
        // Otherwise teardownConnectionUi's unmount + switchTab("landing") leaves the content
        // blank: the switch is silently refused and the flag never falls.
        setActivePinia(createPinia());
        const navigationStore = useNavigationStore();
        navigationStore.tabSwitchInProgress = true;

        unmountVueTab();

        expect(navigationStore.tabSwitchInProgress).toBe(false);
    });
});

describe("buildTabAdapter", () => {
    let navigationStore: ReturnType<typeof useNavigationStore>;

    beforeEach(() => {
        Object.keys(TABS).forEach((key) => delete TABS[key]);
        setActivePinia(createPinia());
        navigationStore = useNavigationStore();
        navigationStore.expertMode = false;
    });

    it("preserves an existing tab adapter and augments it with shared hooks", () => {
        const existingCleanup = vi.fn();
        const existingRead = vi.fn();
        const componentInstance = { cleanup: vi.fn() };
        const existingAdapter = {
            cleanup: existingCleanup,
            read: existingRead,
        };

        const adapter = buildTabAdapter("presets", componentInstance, existingAdapter);

        expect(adapter).toBe(existingAdapter);
        expect(adapter.read).toBe(existingRead);
        expect(adapter.cleanup).toBe(existingCleanup);
        expect(adapter._vueComponent).toBe(componentInstance);

        adapter.expertModeChanged?.(true);
        expect(navigationStore.expertMode).toBe(true);
    });

    it("creates a fallback cleanup handler when no adapter exists", () => {
        const componentCleanup = vi.fn();
        const callback = vi.fn();
        const componentInstance = {
            cleanup: componentCleanup,
        };

        // null, not undefined: undefined would pick up the TABS[tabName] default instead.
        const adapter = buildTabAdapter("presets", componentInstance, null);

        adapter.cleanup?.(callback);

        expect(componentCleanup).toHaveBeenCalledWith(callback);
    });
});
