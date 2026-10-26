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

import { defineStore } from "pinia";
import { ref } from "vue";

/** Tabs usable without a flight controller. */
export const DEFAULT_ALLOWED_TABS_WHEN_DISCONNECTED: readonly string[] = [
    "landing",
    "firmware_flasher",
    "preflight",
    "help",
    "user_profile",
    "backups",
    "flight_plan",
    "autotune",
    "blackbox_viewer",
];

/** Tabs every connected flight controller gets. */
export const DEFAULT_ALLOWED_TABS: readonly string[] = [
    "setup",
    "failsafe",
    "power",
    "adjustments",
    "auxiliary",
    "presets",
    "cli",
    "configuration",
    "logging",
    "onboard_logging",
    "modes",
    "motors",
    "pid_tuning",
    "autotune",
    "ports",
    "receiver",
    "sensors",
    "blackbox_viewer",
];

/** Tabs that depend on a cloud build option, shown only when the firmware was built with it. */
export const DEFAULT_CLOUD_BUILD_TAB_OPTIONS: readonly string[] = [
    "gps",
    "led_strip",
    "osd",
    "servos",
    "vtx",
    "flight_plan",
];

/** Every flight controller tab, for firmware that does not report its build options. */
export const DEFAULT_ALLOWED_FC_TABS_WHEN_CONNECTED: readonly string[] = [
    ...DEFAULT_ALLOWED_TABS,
    ...DEFAULT_CLOUD_BUILD_TAB_OPTIONS,
];

export const useNavigationStore = defineStore("navigation", () => {
    /** The mounted tab's key, or null before the first tab mounts. */
    const activeTab = ref<string | null>(null);

    const tabSwitchInProgress = ref(false);

    /** A tab to open once the current connection has been torn down (set to reach the flasher). */
    const pendingTab = ref<string | null>(null);

    /** The tabs the sidebar shows and switchTab accepts. */
    const allowedTabs = ref<string[]>([...DEFAULT_ALLOWED_TABS_WHEN_DISCONNECTED]);

    const expertMode = ref(false);

    // Set to true to imperatively open the OptionsDialog (e.g. on first run).
    // Sidebar.vue consumes and resets this flag.
    const optionsDialogOpen = ref(false);

    // Same contract for the log dialog.
    const logDialogOpen = ref(false);

    return {
        activeTab,
        tabSwitchInProgress,
        pendingTab,
        allowedTabs,
        expertMode,
        optionsDialogOpen,
        logDialogOpen,
    };
});
