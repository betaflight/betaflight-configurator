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

const { config, mountVueTab } = vi.hoisted(() => ({
    config: { rememberLastTab: true as boolean, lastTab: undefined as string | undefined },
    mountVueTab: vi.fn((_tabKey: string, _contentReady?: () => void) => true),
}));

vi.mock("../../src/js/ConfigStorage", () => ({
    get: () => ({ rememberLastTab: config.rememberLastTab, lastTab: config.lastTab }),
    set: vi.fn(),
}));
vi.mock("../../src/js/Analytics", () => ({ checkSetupAnalytics: vi.fn() }));
vi.mock("../../src/js/tab_adapters", () => ({ tabSwitchCleanup: (callback: () => void) => callback() }));
vi.mock("../../src/js/vue_tab_mounter", () => ({ mountVueTab, vueTabState: { activeTabName: null } }));
vi.mock("../../src/components/sidebar/sidebar_items.js", () => ({ sidebarItems: [] }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

import { selectDefaultTabWhenConnected } from "../../src/js/tab_switch";
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
