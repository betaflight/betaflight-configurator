/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../../src/js/vue_tab_registry", () => ({
    __esModule: true,
    VueTabComponents: {},
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
