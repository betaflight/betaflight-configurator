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

import { set as setConfig } from "../ConfigStorage";
import { checkSetupAnalytics } from "../Analytics";
import { updateTabList } from "./updateTabList";
import GUI, { TABS } from "../gui";
import { EventBus } from "../../components/eventBus";
import { useFlightControllerStore } from "../../stores/fc";

export function applyExpertMode(checked: boolean, { persist = true }: { persist?: boolean } = {}): void {
    if (globalThis.vm) {
        globalThis.vm.expertMode = checked;
    }

    checkSetupAnalytics(function (analyticsService) {
        analyticsService?.sendEvent(analyticsService.EVENT_CATEGORIES.APPLICATION, "ExpertMode", {
            status: checked ? "On" : "Off",
        });
    });

    const fcStore = useFlightControllerStore();
    updateTabList(fcStore.features?.features);

    if (GUI.active_tab) {
        // TABS is filled at runtime by the legacy tabs, so gui.js types it as `{}`.
        const tabs = TABS as Record<string, { expertModeChanged?: (checked: boolean) => void } | undefined>;
        tabs[GUI.active_tab]?.expertModeChanged?.(checked);
    }

    EventBus.$emit("expert-mode-change", checked);

    if (persist) {
        setConfig({ expertMode: checked });
    }
}
