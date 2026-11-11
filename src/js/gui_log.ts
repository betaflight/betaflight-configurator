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

import { useLogStore } from "../stores/log";

// Not cached: a store held at module scope stays bound to the Pinia it came from, and calling its
// action makes that Pinia the active one again, under any caller that has since moved on.
function getStore(): ReturnType<typeof useLogStore> | null {
    try {
        return useLogStore();
    } catch {
        // Pinia may not yet be active during early boot; drop the message.
        return null;
    }
}

/**
 * Appends a message to the in-app log. The message is rendered as HTML by the log dialog, so
 * callers that interpolate user- or device-supplied text are responsible for escaping it.
 */
export function gui_log(message: string): void {
    const store = getStore();
    store?.add(message);
}
