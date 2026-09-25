import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../../src/js/gui.js", () => {
    const TABS = {};

    return {
        __esModule: true,
        default: {
            active_tab: null,
            tab_switch_in_progress: false,
        },
        TABS,
    };
});

vi.mock("../../src/js/vue_components.js", () => ({
    __esModule: true,
    VueTabComponents: {},
}));

// A real instance: modules that read FC at import time resolve the FC store through it.
vi.mock("../../src/js/pinia_instance.js", async () => ({
    __esModule: true,
    pinia: (await import("pinia")).createPinia(),
}));

import { buildTabAdapter, unmountVueTab } from "../../src/js/vue_tab_mounter.js";
import GUI, { TABS } from "../../src/js/gui.js";
import { useNavigationStore } from "../../src/stores/navigation.js";

// vue_tab_mounter.js is unchecked JS, so the adapter it returns carries no hook types.
interface TabAdapter {
    cleanup: (callback?: () => void) => void;
    expertModeChanged: (enabled: boolean) => void;
    read?: unknown;
    _vueComponent?: unknown;
}

describe("unmountVueTab", () => {
    it("clears tab_switch_in_progress — an unmount cancels the mount that would have cleared it", () => {
        // Otherwise teardownConnectionUi's unmount + switchTab("landing") leaves the content
        // blank: the switch is silently refused and the flag never falls.
        GUI.tab_switch_in_progress = true;

        unmountVueTab();

        expect(GUI.tab_switch_in_progress).toBe(false);
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

        const adapter = buildTabAdapter("presets", componentInstance, existingAdapter) as unknown as TabAdapter;

        expect(adapter).toBe(existingAdapter);
        expect(adapter.read).toBe(existingRead);
        expect(adapter.cleanup).toBe(existingCleanup);
        expect(adapter._vueComponent).toBe(componentInstance);

        adapter.expertModeChanged(true);
        expect(navigationStore.expertMode).toBe(true);
    });

    it("creates a fallback cleanup handler when no adapter exists", () => {
        const componentCleanup = vi.fn();
        const callback = vi.fn();
        const componentInstance = {
            cleanup: componentCleanup,
        };

        // null, not undefined: undefined would pick up the TABS[tabName] default instead.
        const adapter = buildTabAdapter(
            "presets",
            componentInstance,
            null as unknown as undefined,
        ) as unknown as TabAdapter;

        adapter.cleanup(callback);

        expect(componentCleanup).toHaveBeenCalledWith(callback);
    });
});
