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

const { callbacksCleanup, killAllIntervals } = vi.hoisted(() => ({
    callbacksCleanup: vi.fn(),
    killAllIntervals: vi.fn(),
}));

vi.mock("../../src/js/msp", () => ({ default: { callbacks_cleanup: callbacksCleanup } }));
vi.mock("../../src/js/timers", () => ({ killAllIntervals }));

import { TABS, tabSwitchCleanup } from "../../src/js/tab_adapters";
import { useNavigationStore } from "../../src/stores/navigation";

describe("tabSwitchCleanup", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        Object.keys(TABS).forEach((key) => delete TABS[key]);
        callbacksCleanup.mockReset();
        killAllIntervals.mockReset();
    });

    it("drops pending MSP callbacks and every interval", () => {
        tabSwitchCleanup(() => {});

        expect(callbacksCleanup).toHaveBeenCalledOnce();
        expect(killAllIntervals).toHaveBeenCalledOnce();
    });

    it("lets the active tab clean up and leaves the callback to it", () => {
        const cleanup = vi.fn();
        TABS.setup = { cleanup };
        useNavigationStore().activeTab = "setup";
        const callback = vi.fn();

        tabSwitchCleanup(callback);

        expect(cleanup).toHaveBeenCalledWith(callback);
        expect(callback).not.toHaveBeenCalled();
    });

    it("calls back straight away with no active tab, or one without an adapter or cleanup", () => {
        const callback = vi.fn();

        tabSwitchCleanup(callback);
        useNavigationStore().activeTab = "setup";
        tabSwitchCleanup(callback);
        TABS.setup = {};
        tabSwitchCleanup(callback);

        expect(callback).toHaveBeenCalledTimes(3);
    });
});
