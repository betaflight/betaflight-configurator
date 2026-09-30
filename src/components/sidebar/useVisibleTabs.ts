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

import { computed, inject, type ComputedRef } from "vue";
import { sidebarItems, isItemVisible } from "./sidebar_items.js";
import { useConnectionStore } from "@/stores/connection";
import { useAuthStore } from "@/stores/auth";
import GUI from "@/js/gui.js";
import FCModule from "@/js/fc";
import type { BetaflightModel } from "../init";

type SidebarItem = (typeof sidebarItems)[number];

/**
 * The tabs a user can reach right now, in sidebar order.
 *
 * Shared by the sidebar and the compact floating bar so the two can never disagree about
 * which tabs exist — the filters depend on connection state, expert mode, firmware features
 * and build options, and duplicating them was how they would drift.
 *
 * @returns the visible entries from `sidebarItems`
 */
export function useVisibleTabs(): ComputedRef<SidebarItem[]> {
    const connectionStore = useConnectionStore();
    const authStore = useAuthStore();
    const betaflightModel = inject<Partial<BetaflightModel> | null>("betaflightModel", null);

    const isModeVisible = (mode: string) => {
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

    const isAllowed = (item: SidebarItem) => {
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
