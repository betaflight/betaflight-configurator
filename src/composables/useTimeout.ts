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
import * as timers from "../js/timers";

export interface TimeoutRegistry {
    addTimeout: (name: string, code: () => void, timeout: number) => void;
    removeTimeout: (name: string) => void;
    removeAllTimeouts: () => void;
}

/**
 * A composable for managing named timeouts via the app's timeout registry (js/timers).
 * All timeouts added through this composable are automatically removed
 * when the owning effect scope is disposed (component unmount or scope stop).
 *
 * Usage:
 *   const { addTimeout, removeTimeout } = useTimeout();
 *   addTimeout("my_delay", () => doSomething(), 5000);
 */
export function useTimeout(): TimeoutRegistry {
    const localTimeouts: string[] = [];

    function addTimeout(name: string, code: () => void, timeout: number) {
        timers.addTimeout(name, code, timeout);
        if (!localTimeouts.includes(name)) {
            localTimeouts.push(name);
        }
    }

    function removeTimeout(name: string) {
        timers.removeTimeout(name);
        const idx = localTimeouts.indexOf(name);
        if (idx !== -1) {
            localTimeouts.splice(idx, 1);
        }
    }

    function removeAllTimeouts() {
        localTimeouts.forEach((name) => timers.removeTimeout(name));
        localTimeouts.length = 0;
    }

    onScopeDispose(() => {
        removeAllTimeouts();
    });

    return {
        addTimeout,
        removeTimeout,
        removeAllTimeouts,
    };
}
