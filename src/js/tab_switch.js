import GUI from "./gui.js";
import CONFIGURATOR from "./data_storage.js";
import { i18n } from "./localization.js";
import { gui_log } from "./gui_log.js";
import { set as setConfig } from "./ConfigStorage.js";
import { checkSetupAnalytics } from "./Analytics.js";
import { mountVueTab } from "./vue_tab_mounter.js";

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
    if (tabKey !== "firmware_flasher") {
        gui_log(i18n.getMessage("tabSwitchUpgradeRequired", [tabLabel]));
        return;
    }
    if (GUI.connected_to || GUI.connecting_to) {
        GUI.pendingTab = "firmware_flasher";
        import("./serial_backend.js").then(({ connectDisconnect }) => connectDisconnect());
    } else {
        switchTab("firmware_flasher", { mode: "disconnected", label: tabLabel });
    }
}

export function switchTab(tabKey, { mode = "disconnected", label = tabKey } = {}) {
    if (GUI.active_tab === tabKey || GUI.tab_switch_in_progress) {
        return false;
    }

    const requiresConnection = mode === "connected";
    if (!canSwitchTab(requiresConnection)) {
        return false;
    }

    const isLoginSectionTab = mode === "loggedin";
    if (!GUI.allowedTabs.includes(tabKey) && !isLoginSectionTab) {
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
