/**
 * Vue Tab Mounting Utility
 *
 * Provides a helper function to mount Vue tab components into the #content area.
 * This bridges the existing jQuery-based tab switching with Vue components.
 */
import { createApp, h } from "vue";
import { pinia } from "./pinia_instance.js";
import i18next from "i18next";
import I18NextVue from "i18next-vue";
import { VueTabComponents } from "./vue_components.js";
import GUI, { TABS } from "./gui.js";
import { tabState } from "./tab_state.js";

// Store the current mounted Vue app instance for cleanup
let currentTabApp = null;
export const TAB_ADAPTER_REGISTRATION_KEY = "tabAdapterRegistration";

export function buildTabAdapter(tabName, componentInstance, existingAdapter = TABS[tabName]) {
    const fallbackCleanup = (callback) => {
        if (componentInstance.cleanup) {
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
        // Update global reactive state that Vue components watch
        tabState.expertMode = enabled;
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
 * Mount a Vue tab component into the #content container
 * @param {string} tabName - The tab name to mount
 * @param {Function} contentReadyCallback - Callback when tab is ready (for compatibility)
 * @returns {boolean} True if mounted successfully
 */
export function mountVueTab(tabName, contentReadyCallback) {
    const TabComponent = VueTabComponents[tabName];
    if (!TabComponent) {
        console.warn(`[Vue Tab] No Vue component found for tab: ${tabName}`);
        return false;
    }

    // Clear any previous content
    const contentEl = document.getElementById("content");
    if (!contentEl) {
        console.error("[Vue Tab] #content element not found");
        return false;
    }

    // Unmount previous Vue tab app if exists
    unmountVueTab();

    // Clear content
    contentEl.innerHTML = "";

    // Create new Vue app for this tab
    currentTabApp = createApp({
        render() {
            return h(TabComponent);
        },
    });

    // Use i18n plugin
    currentTabApp.use(I18NextVue, { i18next });
    currentTabApp.use(pinia);
    currentTabApp.provide("gui", GUI);
    const tabAdapterRegistration = { current: null };
    currentTabApp.provide(TAB_ADAPTER_REGISTRATION_KEY, tabAdapterRegistration);

    // Provide the global betaflight model
    if (globalThis.vm) {
        currentTabApp.provide("betaflightModel", globalThis.vm);
    }

    // Set active tab for legacy compatibility
    GUI.active_tab = tabName;

    // Mount to content
    const componentInstance = currentTabApp.mount(contentEl);

    console.log(`[Vue Tab] Mounted: ${tabName}`);
    // Preserve any adapter the tab explicitly registered during setup, then add the generic hooks
    const tabAdapter = buildTabAdapter(tabName, componentInstance, tabAdapterRegistration.current);

    // Merge the adapter into TABS. The adapter provides default handlers
    // (cleanup, expertModeChanged, etc.). We intentionally spread the
    // adapter first so that any properties the component itself sets on
    // `TABS[tabName]` during its mount will override the adapter defaults.
    //
    // Note: this ordering is subtle — a component that writes `TABS[tabName].cleanup`
    // synchronously during its mount will replace the adapter's cleanup. This
    // is expected: adapter supplies defaults, components supply concrete
    // implementations. If a component needs to preserve adapter behavior it
    // should explicitly call or compose with the adapter's methods instead of
    // relying on the merge ordering.
    TABS[tabName] = { ...tabAdapter, ...TABS[tabName] };

    // Reset tab switch flag and call content ready callback after next tick
    setTimeout(() => {
        GUI.tab_switch_in_progress = false;
        if (contentReadyCallback) {
            contentReadyCallback();
        }
    }, 0);

    return true;
}

/**
 * Unmount the current Vue tab app (cleanup)
 */
export function unmountVueTab() {
    if (currentTabApp) {
        currentTabApp.unmount();
        currentTabApp = null;

        // Clean up TABS registry
        if (GUI.active_tab && TABS[GUI.active_tab]) {
            delete TABS[GUI.active_tab];
        }
    }
}
