import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../../src/js/tab_state.js", () => ({
    __esModule: true,
    tabState: {
        expertMode: false,
    },
}));

vi.mock("../../src/js/vue_components.js", () => ({
    __esModule: true,
    VueTabComponents: {},
}));

vi.mock("../../src/js/pinia_instance.js", () => ({
    __esModule: true,
    pinia: {},
}));

import { buildTabAdapter } from "../../src/js/vue_tab_mounter.js";
import { TABS } from "../../src/js/gui.js";
import { tabState } from "../../src/js/tab_state.js";

describe("buildTabAdapter", () => {
    beforeEach(() => {
        Object.keys(TABS).forEach((key) => delete TABS[key]);
        tabState.expertMode = false;
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

        adapter.expertModeChanged(true);
        expect(tabState.expertMode).toBe(true);
    });

    it("creates a fallback cleanup handler when no adapter exists", () => {
        const componentCleanup = vi.fn();
        const callback = vi.fn();
        const componentInstance = {
            cleanup: componentCleanup,
        };

        const adapter = buildTabAdapter("presets", componentInstance, null);

        adapter.cleanup(callback);

        expect(componentCleanup).toHaveBeenCalledWith(callback);
    });
});
