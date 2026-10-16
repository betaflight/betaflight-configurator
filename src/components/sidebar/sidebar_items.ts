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

import { configHasBuildOption, type BuildOptionsConfig } from "../../composables/useBuildOptions";

/**
 * When an entry is listed: `disconnected` before a connection, `connected` and
 * `cli` with one, `shared` always, `loggedin` with a user session.
 */
export type SidebarMode = "disconnected" | "connected" | "cli" | "shared" | "loggedin";

export interface SidebarItem {
    key: string;
    /** The tab to open, when it differs from `key` (one tab listed under two modes). */
    tab?: string;
    mode: SidebarMode;
    i18n: string;
    icon: string;
    expert?: boolean;
    /** Shown when the firmware has any of these build options. */
    buildOptions?: string[];
    /** Shown when this firmware feature is enabled. */
    feature?: string;
    hideInSidebar?: boolean;
}

export interface SidebarVisibilityContext {
    expertMode: boolean;
    config?: BuildOptionsConfig | null;
    features?: { isEnabled?: (featureName: string) => boolean } | null;
}

export const sidebarItems: SidebarItem[] = [
    { key: "landing", mode: "disconnected", i18n: "tabLanding", icon: "i-lucide-home" },
    { key: "firmware_flasher", mode: "disconnected", i18n: "tabFirmwareFlasher", icon: "i-lucide-zap" },
    { key: "help", mode: "disconnected", i18n: "tabHelp", icon: "i-lucide-help-circle" },
    { key: "preflight", mode: "disconnected", i18n: "tabPreflight", icon: "i-lucide-clipboard-check" },
    { key: "flight_plan", mode: "disconnected", i18n: "tabFlightPlan", icon: "i-lucide-route", expert: true },

    { key: "setup", mode: "connected", i18n: "tabSetup", icon: "i-lucide-sliders-horizontal" },
    { key: "sensors", mode: "connected", i18n: "tabSensorConfig", icon: "i-lucide-cpu" },
    { key: "ports", mode: "connected", i18n: "tabPorts", icon: "i-lucide-cable" },
    { key: "configuration", mode: "connected", i18n: "tabConfiguration", icon: "i-lucide-settings" },
    { key: "power", mode: "connected", i18n: "tabPower", icon: "i-lucide-battery" },
    { key: "failsafe", mode: "connected", i18n: "tabFailsafe", icon: "i-lucide-shield-alert", expert: true },
    { key: "presets", mode: "connected", i18n: "tabPresets", icon: "i-lucide-wand-2" },
    { key: "pid_tuning", mode: "connected", i18n: "tabPidTuning", icon: "i-lucide-gauge" },
    { key: "receiver", mode: "connected", i18n: "tabReceiver", icon: "i-lucide-radio" },
    { key: "auxiliary", mode: "connected", i18n: "tabAuxiliary", icon: "i-lucide-toggle-right" },
    { key: "adjustments", mode: "connected", i18n: "tabAdjustments", icon: "i-lucide-sliders", expert: true },
    {
        key: "servos",
        mode: "connected",
        i18n: "tabServos",
        icon: "i-lucide-rotate-ccw",
        buildOptions: ["USE_SERVOS", "USE_WING"],
    },
    { key: "gps", mode: "connected", i18n: "tabGPS", icon: "i-lucide-map-pin", buildOptions: ["USE_GPS"] },
    { key: "motors", mode: "connected", i18n: "tabMotorTesting", icon: "i-lucide-fan" },
    { key: "osd", mode: "connected", i18n: "tabOsd", icon: "i-lucide-monitor", feature: "OSD" },
    { key: "vtx", mode: "connected", i18n: "tabVtx", icon: "i-lucide-radio-tower" },
    { key: "led_strip", mode: "connected", i18n: "tabLedStrip", icon: "i-lucide-lightbulb", feature: "LED_STRIP" },
    {
        key: "flight_plan_connected",
        tab: "flight_plan",
        mode: "connected",
        i18n: "tabFlightPlan",
        icon: "i-lucide-route",
        buildOptions: ["USE_FLIGHT_PLAN"],
    },
    { key: "logging", mode: "connected", i18n: "tabLogging", icon: "i-lucide-file-text", expert: true },
    { key: "onboard_logging", mode: "connected", i18n: "tabOnboardLogging", icon: "i-lucide-database" },
    { key: "blackbox_viewer", mode: "shared", i18n: "tabBlackboxViewer", icon: "i-lucide-line-chart" },
    { key: "autotune", mode: "shared", i18n: "tabAutotune", icon: "i-lucide-gauge", expert: true },

    { key: "cli", mode: "cli", i18n: "tabCLI", icon: "i-lucide-terminal" },

    { key: "log", mode: "shared", i18n: "tabLog", icon: "i-lucide-file-text", expert: true, hideInSidebar: true },

    { key: "backups", mode: "loggedin", i18n: "tabBackups", icon: "i-lucide-database", hideInSidebar: true },
    { key: "user_profile", mode: "loggedin", i18n: "tabUserProfile", icon: "i-lucide-user", hideInSidebar: true },
];

export function isItemVisible(item: SidebarItem, ctx: SidebarVisibilityContext): boolean {
    if (item.expert && !ctx.expertMode) {
        return false;
    }
    if (item.buildOptions && !item.buildOptions.some((o) => configHasBuildOption(ctx.config, o))) {
        return false;
    }
    if (item.feature && !ctx.features?.isEnabled?.(item.feature)) {
        return false;
    }
    return true;
}
