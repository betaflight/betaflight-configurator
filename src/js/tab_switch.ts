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

import { i18n } from "./localization";
import { gui_log } from "./gui_log";
import { get as getConfig, set as setConfig } from "./ConfigStorage";
import { checkSetupAnalytics } from "./Analytics";
import { tabSwitchCleanup } from "./tab_adapters";
import { mountVueTab, vueTabState } from "./vue_tab_mounter";
import { sidebarItems } from "../components/sidebar/sidebar_items.js";
import { useConnectionStore } from "../stores/connection";
import { useNavigationStore } from "../stores/navigation";

export interface SwitchTabOptions {
    /**
     * The sidebar mode the tab is opened from (sidebar_items.js): `connected` and `cli` need a
     * valid connection, `loggedin` tabs bypass the allowed-tabs list, and anything else
     * (`disconnected`, `shared`) is treated as disconnected. Defaults to `disconnected`.
     */
    mode?: string;
    /** Shown in the "upgrade required" message; defaults to the tab's sidebar label. */
    label?: string;
}

function defaultLabel(tabKey: string): string {
    const item = sidebarItems.find((i) => (i.tab ?? i.key) === tabKey);
    return item ? i18n.getMessage(item.i18n) : tabKey;
}

function canSwitchTab(requiresConnection: boolean): boolean {
    const connectionStore = useConnectionStore();
    if (requiresConnection && !connectionStore.connectionValid) {
        gui_log(i18n.getMessage("tabSwitchConnectionRequired"));
        return false;
    }
    if (connectionStore.connectLock) {
        gui_log(i18n.getMessage("tabSwitchWaitForOperation"));
        return false;
    }
    if (connectionStore.flashingInProgress) {
        gui_log(i18n.getMessage("tabSwitchWaitForOperation"));
        return false;
    }
    return true;
}

function handleDisallowedTab(tabKey: string, tabLabel: string): void {
    if (tabKey !== "firmware_flasher") {
        gui_log(i18n.getMessage("tabSwitchUpgradeRequired", [tabLabel]));
        return;
    }
    const connectionStore = useConnectionStore();
    if (connectionStore.connectedTo || connectionStore.connectingTo) {
        useNavigationStore().pendingTab = "firmware_flasher";
        // Dynamic import: serial_backend.ts imports this module statically, so a static
        // import back would cycle.
        void import("./serial_backend").then(({ connectDisconnect }) => connectDisconnect());
    } else {
        switchTab("firmware_flasher", { mode: "disconnected", label: tabLabel });
    }
}

function resetPageZoom(): void {
    // iOS zooms in on a focused field and never zooms back out by itself, so without this the
    // next tab inherits the scale. Clamping maximum-scale for one frame is the only way to
    // restore it from script; the clamp is lifted again so pinch zoom still works.
    if (!document.body.classList.contains("mobile-app-shell")) {
        return;
    }
    // Only a focused field zooms iOS in. Blurring anything else would take keyboard focus
    // off the tab the user just activated.
    const active = document.activeElement;
    if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
    ) {
        active.blur();
    }
    const meta = document.querySelector("meta[name=viewport]");
    if (!meta) {
        return;
    }
    const content = meta.getAttribute("content") ?? "";
    meta.setAttribute("content", `${content},maximum-scale=1`);
    requestAnimationFrame(() => meta.setAttribute("content", content));
}

/**
 * Opens a tab, cleaning up the active one first.
 * @returns false when the switch was refused (already open, a switch or lock in progress, not
 * connected, or not allowed); true once the switch has started
 */
export function switchTab(tabKey: string, options: SwitchTabOptions = {}): boolean {
    const mode = options.mode ?? "disconnected";
    const label = options.label ?? defaultLabel(tabKey);

    // Dedup only when the target is both the active tab and actually mounted: after
    // unmountVueTab() the content area is blank while activeTab still names the
    // old tab, and refusing to remount would leave it blank.
    const navigationStore = useNavigationStore();
    const alreadyMounted = navigationStore.activeTab === tabKey && vueTabState.activeTabName === tabKey;
    if (alreadyMounted || navigationStore.tabSwitchInProgress) {
        return false;
    }

    const requiresConnection = mode === "connected" || mode === "cli";
    if (!canSwitchTab(requiresConnection)) {
        return false;
    }

    const isLoginSectionTab = mode === "loggedin";
    if (!navigationStore.allowedTabs.includes(tabKey) && !isLoginSectionTab) {
        handleDisallowedTab(tabKey, label);
        return false;
    }

    if (mode === "connected" && tabKey !== "cli") {
        setConfig({ lastTab: `tab_${tabKey}` });
    }

    resetPageZoom();

    navigationStore.tabSwitchInProgress = true;
    tabSwitchCleanup(function () {
        checkSetupAnalytics(function (analyticsService) {
            analyticsService?.sendAppView(tabKey);
        });

        const contentReady = () => {
            navigationStore.tabSwitchInProgress = false;
        };

        if (!mountVueTab(tabKey, contentReady)) {
            console.log(`Tab not found: ${tabKey}`);
            navigationStore.tabSwitchInProgress = false;
        }
    });

    return true;
}

/** Opens the remembered last tab after connecting, when that option is on and the tab is allowed, else Setup. */
export function selectDefaultTabWhenConnected(): void {
    const result = getConfig(["rememberLastTab", "lastTab"]);
    const lastTab = typeof result.lastTab === "string" ? result.lastTab.substring(4) : "";
    const tabKey =
        result.rememberLastTab && lastTab && useNavigationStore().allowedTabs.includes(lastTab) ? lastTab : "setup";

    if (!switchTab(tabKey, { mode: "connected" })) {
        switchTab("setup", { mode: "connected" });
    }
}
