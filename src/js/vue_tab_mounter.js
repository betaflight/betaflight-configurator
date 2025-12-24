/**
 * Vue Tab Mounting Utility
 *
 * Provides a helper function to mount Vue tab components into the #content area.
 * This bridges the existing jQuery-based tab switching with Vue components.
 */
import { createApp, h } from "vue";
import i18next from "i18next";
import I18NextVue from "i18next-vue";
import { VueTabComponents } from "./vue_components.js";
import GUI from "./gui.js";

// Store the current mounted Vue app instance for cleanup
let currentTabApp = null;

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

    // Provide the global betaflight model
    if (globalThis.vm) {
        currentTabApp.provide("betaflightModel", globalThis.vm);
    }

    // Set active tab for legacy compatibility
    GUI.active_tab = tabName;

    // Mount to content
    currentTabApp.mount(contentEl);

    console.log(`[Vue Tab] Mounted: ${tabName}`);

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
    }
}
