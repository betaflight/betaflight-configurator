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

import { isMspCancelled } from "../js/msp/mspErrors";

/**
 * Shared tab-load guard: runs a tab's `loadConfig` MSP chain and swallows a benign
 * MspCancelledError — the queue is cleared (reason "cleanup"/"disconnected") when the tab is
 * switched away from or the link drops while the chain is still in flight, which is expected
 * and not a real failure. Any other error (timeout, CRC, ...) is passed to `onError`.
 * @param fn the async loadConfig work (the MSP chain)
 * @param onError genuine-failure handler
 * @returns fn's resolved value, or undefined if cancelled/failed
 */
export async function runTabLoad<T>(fn: () => Promise<T>, onError: (error: unknown) => void): Promise<T | undefined> {
    try {
        return await fn();
    } catch (error) {
        if (isMspCancelled(error)) {
            return undefined;
        }
        onError(error);
        return undefined;
    }
}
