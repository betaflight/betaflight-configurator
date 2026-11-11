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

/**
 * The app's registry of named intervals and timeouts (was GUI.interval_* / GUI.timeout_*).
 *
 * Names let unrelated code stop a timer it did not start (serial_backend kills every timer on
 * disconnect, a tab switch kills every interval), so this stays a module-level registry rather
 * than per-caller handles. Components and composables use it through useInterval / useTimeout,
 * which also remove their own timers when their scope is disposed.
 */

export interface IntervalEntry {
    name: string;
    timer: ReturnType<typeof setInterval> | null;
    code: () => void;
    interval: number;
    fired: number;
    paused: boolean;
}

export interface TimeoutEntry {
    name: string;
    timer: ReturnType<typeof setTimeout> | null;
    timeout: number;
}

const intervals: IntervalEntry[] = [];
let timeouts: TimeoutEntry[] = [];

function fire(entry: IntervalEntry): void {
    entry.code();
    entry.fired++;
}

/**
 * Starts a named interval, replacing any running interval of the same name.
 * @param first run `code` once immediately, before the first tick
 */
export function addInterval(name: string, code: () => void, interval: number, first?: boolean): IntervalEntry {
    const entry: IntervalEntry = { name, timer: null, code, interval, fired: 0, paused: false };

    if (intervals.some((element) => element.name === name)) {
        removeInterval(name);
    }

    if (first === true) {
        fire(entry);
    }

    entry.timer = setInterval(fire, interval, entry);

    intervals.push(entry);

    return entry;
}

/** @returns false when no interval of that name is registered */
export function removeInterval(name: string): boolean {
    const index = intervals.findIndex((entry) => entry.name === name);
    if (index === -1) {
        return false;
    }

    clearInterval(intervals[index].timer ?? undefined);
    intervals.splice(index, 1);

    return true;
}

/** @returns false when no interval of that name is registered */
export function pauseInterval(name: string): boolean {
    const entry = intervals.find((element) => element.name === name);
    if (!entry) {
        return false;
    }

    clearInterval(entry.timer ?? undefined);
    entry.paused = true;

    return true;
}

/** @returns false when no paused interval of that name is registered */
export function resumeInterval(name: string): boolean {
    const entry = intervals.find((element) => element.name === name && element.paused);
    if (!entry) {
        return false;
    }

    entry.timer = setInterval(fire, entry.interval, entry);
    entry.paused = false;

    return true;
}

/**
 * Stops every interval except those named in `keep`.
 * @returns how many intervals were stopped
 */
export function killAllIntervals(keep: readonly string[] = []): number {
    let killed = 0;

    for (let i = intervals.length - 1; i >= 0; i--) {
        if (!keep.includes(intervals[i].name)) {
            clearInterval(intervals[i].timer ?? undefined);
            intervals.splice(i, 1);
            killed++;
        }
    }

    return killed;
}

/**
 * Starts a named timeout. Unlike addInterval this does not replace an existing timeout of the
 * same name; removeTimeout stops the oldest one.
 */
export function addTimeout(name: string, code: () => void, timeout: number): TimeoutEntry {
    const entry: TimeoutEntry = { name, timer: null, timeout };

    entry.timer = setTimeout(() => {
        code();

        const index = timeouts.indexOf(entry);
        if (index > -1) {
            timeouts.splice(index, 1);
        }
    }, timeout);

    timeouts.push(entry);

    return entry;
}

/** @returns false when no timeout of that name is registered */
export function removeTimeout(name: string): boolean {
    const index = timeouts.findIndex((entry) => entry.name === name);
    if (index === -1) {
        return false;
    }

    clearTimeout(timeouts[index].timer ?? undefined);
    timeouts.splice(index, 1);

    return true;
}

/** @returns how many timeouts were stopped */
export function killAllTimeouts(): number {
    for (const entry of timeouts) {
        clearTimeout(entry.timer ?? undefined);
    }

    const killed = timeouts.length;
    timeouts = [];

    return killed;
}
