import { defineStore } from "pinia";
import { computed } from "vue";
import GUI from "../js/gui";

export const useNavigationStore = defineStore("navigation", () => {
    // Proxy state directly to legacy reactive objects
    // This ensures full bi-directional synchronization during migration

    const activeTab = computed({
        get: () => GUI.active_tab,
        set: (val) => (GUI.active_tab = val),
    });

    const tabSwitchInProgress = computed({
        get: () => GUI.tab_switch_in_progress,
        set: (val) => (GUI.tab_switch_in_progress = val),
    });

    function cleanup(callback) {
        GUI.tab_switch_cleanup(callback);
    }

    return {
        activeTab,
        tabSwitchInProgress,
        cleanup,
    };
});
