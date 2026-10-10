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

import { reactive } from "vue";
import { VueTabComponents } from "./vue_tab_registry.js";
import { TABS, type TabAdapter } from "./tab_adapters";
import { useNavigationStore } from "../stores/navigation";

/** The part of a mounted tab component the adapter calls into. */
interface TabComponentInstance {
    cleanup?: (callback?: () => void) => void;
}

export const TAB_ADAPTER_REGISTRATION_KEY = "tabAdapterRegistration";
export const vueTabState = reactive({
    activeTabName: null as string | null,
    activeTabKey: 0,
});
export const tabAdapterRegistration = reactive({ current: null as TabAdapter | null });
let pendingContentReadyCallback: (() => void) | null = null;

function clearTabAdapter(tabName: string | null): void {
    if (tabName && TABS[tabName]) {
        delete TABS[tabName];
    }
    tabAdapterRegistration.current = null;
}

export function buildTabAdapter(
    tabName: string,
    componentInstance: TabComponentInstance | null | undefined,
    existingAdapter: TabAdapter | null | undefined = TABS[tabName],
): TabAdapter {
    const fallbackCleanup = (callback?: () => void) => {
        if (typeof componentInstance?.cleanup === "function") {
            componentInstance.cleanup(callback);
        } else if (callback) {
            callback();
        }
    };

    const tabAdapter =
        existingAdapter && typeof existingAdapter === "object" ? existingAdapter : { cleanup: fallbackCleanup };

    if (typeof tabAdapter.cleanup !== "function") {
        tabAdapter.cleanup = fallbackCleanup;
    }

    tabAdapter.expertModeChanged = (enabled: boolean) => {
        // Update navigation store state that Vue components watch
        const navigationStore = useNavigationStore();
        navigationStore.expertMode = enabled;
    };
    tabAdapter._vueComponent = componentInstance;

    return tabAdapter;
}

/**
 * Check if a tab has a Vue component available
 * @param tabName - The tab name (e.g., "help", "landing")
 * @returns True if tab has a Vue component
 */
export function hasVueTab(tabName: string): boolean {
    return tabName in VueTabComponents;
}

/**
 * Select the active Vue tab inside the root app tree.
 * @param tabName - The tab name to mount
 * @param contentReadyCallback - Called once the tab has mounted
 * @returns True if the tab exists and was scheduled
 */
export function mountVueTab(tabName: string, contentReadyCallback?: () => void): boolean {
    if (!hasVueTab(tabName)) {
        console.warn(`[Vue Tab] No Vue component found for tab: ${tabName}`);
        return false;
    }

    const navigationStore = useNavigationStore();
    const previousTab = vueTabState.activeTabName ?? navigationStore.activeTab;
    clearTabAdapter(previousTab);

    pendingContentReadyCallback = contentReadyCallback ?? null;
    navigationStore.activeTab = tabName;
    vueTabState.activeTabName = tabName;
    vueTabState.activeTabKey += 1;
    return true;
}

/**
 * Finalize tab registration after the root app renders the selected component.
 */
export function completeVueTabMount(componentInstance: TabComponentInstance | null | undefined): void {
    const tabName = vueTabState.activeTabName;
    if (!tabName) {
        return;
    }

    const tabAdapter = buildTabAdapter(tabName, componentInstance, tabAdapterRegistration.current);

    // Spread the generic adapter first so component-defined handlers win.
    TABS[tabName] = { ...tabAdapter, ...TABS[tabName] };

    useNavigationStore().tabSwitchInProgress = false;
    pendingContentReadyCallback?.();
    pendingContentReadyCallback = null;
}

/**
 * Clear the active Vue tab so the root app can unmount it naturally.
 */
export function unmountVueTab(): void {
    // An unmount cancels whatever mount was in flight, and the callback dropped on the next
    // line is the only thing that clears tab_switch_in_progress. Leaving that flag set makes
    // every later switchTab() a silent no-op — blank content, no error — until something else
    // happens to clear it, which is why the disconnect/connect dance appeared to fix it.
    pendingContentReadyCallback = null;
    const navigationStore = useNavigationStore();
    navigationStore.tabSwitchInProgress = false;
    clearTabAdapter(vueTabState.activeTabName ?? navigationStore.activeTab);
    vueTabState.activeTabName = null;
    vueTabState.activeTabKey += 1;
}
