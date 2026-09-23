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

const MAX_ENTRIES = 1000;

export interface LogEntry {
    id: number;
    /** Local wall-clock time, formatted for display only. */
    timestamp: string;
    /** Rendered as HTML by LogDialog, so callers own any escaping. */
    message: string;
}

function pad(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}

function formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}-${month}-${day} @${hours}:${minutes}:${seconds}`;
}

export const useLogStore = defineStore("log", () => {
    const entries = ref<LogEntry[]>([]);

    function add(message: string): void {
        const entry: LogEntry = {
            id: entries.value.length ? entries.value[entries.value.length - 1].id + 1 : 1,
            timestamp: formatTimestamp(new Date()),
            message,
        };
        entries.value.push(entry);
        if (entries.value.length > MAX_ENTRIES) {
            entries.value.splice(0, entries.value.length - MAX_ENTRIES);
        }
    }

    function clear(): void {
        entries.value = [];
    }

    return { entries, add, clear };
});
