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

import { onScopeDispose } from "vue";
import GUI from "../js/gui";

export interface IntervalRegistry {
    addInterval: (name: string, code: () => void, interval: number, first?: boolean) => void;
    removeInterval: (name: string) => void;
    /** @returns false when no interval of that name is registered */
    pauseInterval: (name: string) => boolean;
    /** @returns false when no paused interval of that name is registered */
    resumeInterval: (name: string) => boolean;
    removeAllIntervals: () => void;
}

function pauseInterval(name: string): boolean {
    return GUI.interval_pause(name);
}

function resumeInterval(name: string): boolean {
    return GUI.interval_resume(name);
}

/**
 * A composable for managing named intervals via GUI's interval registry.
 * All intervals added through this composable are automatically removed
 * when the owning effect scope is disposed (component unmount or scope stop).
 *
 * Usage:
 *   const { addInterval, removeInterval } = useInterval();
 *   addInterval("my_poll", () => fetchData(), 1000, true);
 */
export function useInterval(): IntervalRegistry {
    const localIntervals: string[] = [];

    function addInterval(name: string, code: () => void, interval: number, first = false) {
        GUI.interval_add(name, code, interval, first);
        if (!localIntervals.includes(name)) {
            localIntervals.push(name);
        }
    }

    function removeInterval(name: string) {
        GUI.interval_remove(name);
        const idx = localIntervals.indexOf(name);
        if (idx !== -1) {
            localIntervals.splice(idx, 1);
        }
    }

    function removeAllIntervals() {
        localIntervals.forEach((name) => GUI.interval_remove(name));
        localIntervals.length = 0;
    }

    onScopeDispose(() => {
        removeAllIntervals();
    });

    return {
        addInterval,
        removeInterval,
        pauseInterval,
        resumeInterval,
        removeAllIntervals,
    };
}
