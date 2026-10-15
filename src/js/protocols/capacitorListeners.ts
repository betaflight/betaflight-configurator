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

import type { PluginListenerHandle } from "@capacitor/core";

/**
 * Waits for a transport's native listener registrations, all or nothing. If any of them
 * rejects, the ones that did register are removed again, so a transport that cannot hear
 * all of its events hears none of them, and the first failure is rethrown.
 * @param registrations - the promises `addListener` returned.
 */
export async function registerListeners(registrations: Promise<PluginListenerHandle>[]): Promise<void> {
    const results = await Promise.allSettled(registrations);
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (!failure) {
        return;
    }

    await Promise.all(
        results.map(async (result) => {
            if (result.status === "fulfilled") {
                try {
                    await result.value.remove();
                } catch (error) {
                    // The registration already failed; a failed cleanup must not hide why.
                    console.warn("[CAPACITOR] Failed to remove a native listener:", error);
                }
            }
        }),
    );
    throw failure.reason;
}
