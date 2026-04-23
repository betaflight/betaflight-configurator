import { reactive } from "vue";
import { VueTabComponents } from "./vue_tab_registry.js";
import GUI, { TABS } from "./gui.js";
import { useNavigationStore } from "../stores/navigation";
export const TAB_ADAPTER_REGISTRATION_KEY = "tabAdapterRegistration";
export const vueTabState = reactive({
    activeTabName: null,
    activeTabKey: 0,
});
export const tabAdapterRegistration = reactive({ current: null });
let pendingContentReadyCallback = null;

function clearTabAdapter(tabName) {
    if (tabName && TABS[tabName]) {
        delete TABS[tabName];
    }
    tabAdapterRegistration.current = null;
}

export function buildTabAdapter(tabName, componentInstance, existingAdapter = TABS[tabName]) {
    const fallbackCleanup = (callback) => {
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

    tabAdapter.expertModeChanged = (enabled) => {
        // Update navigation store state that Vue components watch
        const navigationStore = useNavigationStore();
        navigationStore.expertMode = enabled;
    };
    tabAdapter._vueComponent = componentInstance;

    return tabAdapter;
}

/**
 * Check if a tab has a Vue component available
 * @param {string} tabName - The tab name (e.g., "help", "landing")
 * @returns {boolean} True if tab has a Vue component
 */
export function hasVueTab(tabName) {
    return tabName in VueTabComponents;
}

/**
 * Select the active Vue tab inside the root app tree.
 * @param {string} tabName - The tab name to mount
 * @param {Function} contentReadyCallback - Callback when tab is ready (for compatibility)
 * @returns {boolean} True if the tab exists and was scheduled
 */
export function mountVueTab(tabName, contentReadyCallback) {
    if (!hasVueTab(tabName)) {
        console.warn(`[Vue Tab] No Vue component found for tab: ${tabName}`);
        return false;
    }

    const previousTab = vueTabState.activeTabName ?? GUI.active_tab;
    clearTabAdapter(previousTab);

    pendingContentReadyCallback = contentReadyCallback ?? null;
    GUI.active_tab = tabName;
    vueTabState.activeTabName = tabName;
    vueTabState.activeTabKey += 1;
    return true;
}

/**
 * Finalize tab registration after the root app renders the selected component.
 */
export function completeVueTabMount(componentInstance) {
    const tabName = vueTabState.activeTabName;
    if (!tabName) {
        return;
    }

    const tabAdapter = buildTabAdapter(tabName, componentInstance, tabAdapterRegistration.current);

    // Spread the generic adapter first so component-defined handlers win.
    TABS[tabName] = { ...tabAdapter, ...TABS[tabName] };

    GUI.content_ready(() => {
        GUI.tab_switch_in_progress = false;
        pendingContentReadyCallback?.();
        pendingContentReadyCallback = null;
    });
}

/**
 * Clear the active Vue tab so the root app can unmount it naturally.
 */
export function unmountVueTab() {
    pendingContentReadyCallback = null;
    clearTabAdapter(vueTabState.activeTabName ?? GUI.active_tab);
    vueTabState.activeTabName = null;
    vueTabState.activeTabKey += 1;
}
