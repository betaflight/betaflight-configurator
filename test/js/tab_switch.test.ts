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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const { config, mountVueTab, vueTabState, confirmLeaveTab } = vi.hoisted(() => ({
    config: { rememberLastTab: true as boolean, lastTab: undefined as string | undefined },
    mountVueTab: vi.fn((_tabKey: string, _contentReady?: () => void) => true),
    vueTabState: { activeTabName: null as string | null },
    confirmLeaveTab: vi.fn(async (_tab: string, _mode?: string) => true),
}));

vi.mock("../../src/js/ConfigStorage", () => ({
    get: () => ({ rememberLastTab: config.rememberLastTab, lastTab: config.lastTab }),
    set: vi.fn(),
}));
vi.mock("../../src/js/Analytics", () => ({ checkSetupAnalytics: vi.fn() }));
vi.mock("../../src/js/tab_adapters", () => ({ tabSwitchCleanup: (callback: () => void) => callback() }));
vi.mock("../../src/js/vue_tab_mounter", () => ({ mountVueTab, vueTabState }));
vi.mock("../../src/js/unsaved_changes", () => ({ confirmLeaveTab }));
vi.mock("../../src/components/sidebar/sidebar_items", () => ({ sidebarItems: [] }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

import { navigateToTab, selectDefaultTabWhenConnected } from "../../src/js/tab_switch";
import { DEFAULT_ALLOWED_TABS, useNavigationStore } from "../../src/stores/navigation";
import { useConnectionStore } from "../../src/stores/connection";

function openedTab() {
    return mountVueTab.mock.calls.at(-1)?.[0];
}

describe("selectDefaultTabWhenConnected", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        const connectionStore = useConnectionStore();
        useNavigationStore().allowedTabs = [...DEFAULT_ALLOWED_TABS];
        connectionStore.connectionValid = true;
        config.rememberLastTab = true;
        config.lastTab = undefined;
        vueTabState.activeTabName = null;
        mountVueTab.mockClear();
    });

    it("reopens the remembered tab when it is allowed", () => {
        config.lastTab = "tab_pid_tuning";

        selectDefaultTabWhenConnected();

        expect(openedTab()).toBe("pid_tuning");
    });

    it("opens Setup when the remembered tab is not allowed on this board", () => {
        config.lastTab = "tab_osd";

        selectDefaultTabWhenConnected();

        expect(openedTab()).toBe("setup");
    });

    it("opens Setup when nothing is remembered", () => {
        selectDefaultTabWhenConnected();

        expect(openedTab()).toBe("setup");
    });

    it("opens Setup when remembering the last tab is off", () => {
        config.rememberLastTab = false;
        config.lastTab = "tab_pid_tuning";

        selectDefaultTabWhenConnected();

        expect(openedTab()).toBe("setup");
    });
});

describe("navigateToTab", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        useNavigationStore().allowedTabs = [...DEFAULT_ALLOWED_TABS];
        useConnectionStore().connectionValid = true;
        vueTabState.activeTabName = "pid_tuning";
        mountVueTab.mockClear();
        confirmLeaveTab.mockClear();
        confirmLeaveTab.mockResolvedValue(true);
    });

    it("does nothing for the tab that is already open", async () => {
        await expect(navigateToTab("pid_tuning", { mode: "connected" })).resolves.toBe(true);

        expect(confirmLeaveTab).not.toHaveBeenCalled();
        expect(mountVueTab).not.toHaveBeenCalled();
    });

    it("asks with the target tab and its mode, then opens it", async () => {
        await expect(navigateToTab("receiver", { mode: "connected" })).resolves.toBe(true);

        expect(confirmLeaveTab).toHaveBeenCalledWith("receiver", "connected");
        expect(openedTab()).toBe("receiver");
    });

    it("stays on the current tab when the prompt says not to leave", async () => {
        confirmLeaveTab.mockResolvedValue(false);

        await expect(navigateToTab("receiver", { mode: "connected" })).resolves.toBe(false);

        expect(mountVueTab).not.toHaveBeenCalled();
    });
});
