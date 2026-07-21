import GUI from "./gui.js";
import CONFIGURATOR from "./data_storage.js";
import { i18n } from "./localization.js";
import { gui_log } from "./gui_log.js";
import { set as setConfig } from "./ConfigStorage.js";
import { checkSetupAnalytics } from "./Analytics.js";
import { mountVueTab, vueTabState } from "./vue_tab_mounter.js";
import { sidebarItems } from "../components/sidebar/sidebar_items.js";

function defaultLabel(tabKey) {
    const item = sidebarItems.find((i) => (i.tab ?? i.key) === tabKey);
    return item ? i18n.getMessage(item.i18n) : tabKey;
}

function canSwitchTab(requiresConnection) {
    if (requiresConnection && !CONFIGURATOR.connectionValid) {
        gui_log(i18n.getMessage("tabSwitchConnectionRequired"));
        return false;
    }
    if (GUI.connect_lock) {
        gui_log(i18n.getMessage("tabSwitchWaitForOperation"));
        return false;
    }
    if (GUI.flashingInProgress) {
        gui_log(i18n.getMessage("tabSwitchWaitForOperation"));
        return false;
    }
    return true;
}

function handleDisallowedTab(tabKey, tabLabel) {
    const disconnectedFlasherTabs = ["firmware_flasher", "giglrs_flasher", "am32_flasher"];
    if (!disconnectedFlasherTabs.includes(tabKey)) {
        gui_log(i18n.getMessage("tabSwitchUpgradeRequired", [tabLabel]));
        return;
    }
    if (GUI.connected_to || GUI.connecting_to) {
        GUI.pendingTab = tabKey;
        import("./serial_backend.js").then(({ connectDisconnect }) => connectDisconnect());
    } else {
        switchTab(tabKey, { mode: "disconnected", label: tabLabel });
    }
}

export function switchTab(tabKey, options = {}) {
    const mode = options.mode ?? "disconnected";
    const label = options.label ?? defaultLabel(tabKey);

    // Dedup only when the target is both the active tab and actually mounted: after
    // unmountVueTab() the content area is blank while GUI.active_tab still names the
    // old tab, and refusing to remount would leave it blank.
    const alreadyMounted = GUI.active_tab === tabKey && vueTabState.activeTabName === tabKey;
    if (alreadyMounted || GUI.tab_switch_in_progress) {
        return false;
    }

    const requiresConnection = mode === "connected" || mode === "cli";
    if (!canSwitchTab(requiresConnection)) {
        return false;
    }

    if (!GUI.allowedTabs.includes(tabKey)) {
        handleDisallowedTab(tabKey, label);
        return false;
    }

    if (mode === "connected" && tabKey !== "cli") {
        setConfig({ lastTab: `tab_${tabKey}` });
    }

    GUI.tab_switch_in_progress = true;
    GUI.tab_switch_cleanup(function () {
        checkSetupAnalytics(function (analyticsService) {
            analyticsService.sendAppView(tabKey);
        });

        const contentReady = () => {
            GUI.tab_switch_in_progress = false;
        };

        if (!mountVueTab(tabKey, contentReady)) {
            console.log(`Tab not found: ${tabKey}`);
            GUI.tab_switch_in_progress = false;
        }
    });

    return true;
}
