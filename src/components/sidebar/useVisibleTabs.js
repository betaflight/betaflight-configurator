import { computed, inject } from "vue";
import { sidebarItems, isItemVisible } from "./sidebar_items.js";
import { useConnectionStore } from "@/stores/connection";
import { useAuthStore } from "@/stores/auth";
import GUI from "@/js/gui.js";
import FCModule from "@/js/fc.js";

/**
 * The tabs a user can reach right now, in sidebar order.
 *
 * Shared by the sidebar and the compact floating bar so the two can never disagree about
 * which tabs exist — the filters depend on connection state, expert mode, firmware features
 * and build options, and duplicating them was how they would drift.
 *
 * @returns {import("vue").ComputedRef<Array>} the visible entries from `sidebarItems`
 */
export function useVisibleTabs() {
    const connectionStore = useConnectionStore();
    const authStore = useAuthStore();
    const betaflightModel = inject("betaflightModel", null);

    const isModeVisible = (mode) => {
        switch (mode) {
            case "disconnected":
                return !connectionStore.connectionValid;
            case "connected":
            case "cli":
                return !!connectionStore.connectionValid;
            case "shared":
                return true;
            case "loggedin":
                return authStore.isLoggedIn;
            default:
                return false;
        }
    };

    const ctx = computed(() => {
        const model = betaflightModel ?? globalThis.vm;
        const fc = model?.FC ?? FCModule;
        return {
            expertMode: Boolean(model?.expertMode),
            config: fc?.CONFIG,
            features: fc?.FEATURE_CONFIG?.features,
        };
    });

    const isAllowed = (item) => {
        if (item.mode === "loggedin" || item.mode === "shared") {
            return true;
        }
        return GUI.allowedTabs.includes(item.tab ?? item.key);
    };

    return computed(() =>
        sidebarItems
            .filter((item) => isModeVisible(item.mode))
            .filter((item) => !item.hideInSidebar)
            .filter((item) => isAllowed(item))
            .filter((item) => isItemVisible(item, ctx.value)),
    );
}
