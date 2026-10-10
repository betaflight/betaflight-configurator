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

import MSP from "./msp";
import { killAllIntervals } from "./timers";
import { useNavigationStore } from "../stores/navigation";

/**
 * What a mounted tab registers in TABS. vue_tab_mounter fills in `cleanup` and
 * `expertModeChanged`; some tabs add their own members (CliTab's `read`, the firmware flasher's
 * progress API), which their callers narrow to.
 */
export interface TabAdapter {
    cleanup?: (callback?: () => void) => void;
    expertModeChanged?: (enabled: boolean) => void;
    [member: string]: unknown;
}

/** The adapters of the mounted tabs, keyed by tab name (was GUI's TABS). */
export const TABS: Record<string, TabAdapter | undefined> = {};

/**
 * Runs on every tab switch: drops pending MSP callbacks and every interval (mostly data pulling),
 * then lets the active tab clean up before `callback` runs.
 */
export function tabSwitchCleanup(callback: () => void): void {
    MSP.callbacks_cleanup(); // we don't care about any old data that might or might not arrive
    killAllIntervals();

    const activeTab = useNavigationStore().activeTab;
    const cleanup = activeTab ? TABS[activeTab]?.cleanup : undefined;
    if (cleanup) {
        cleanup(callback);
    } else {
        callback();
    }
}
