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

// throttle-debounce ships no types; this covers only what the blackbox viewer calls:
// debounce in the spectrum analyser, throttle in playback. @types/throttle-debounce would replace it.
declare module "throttle-debounce" {
    /** The wrapped callback, plus cancel() to drop a pending call. */
    type Debounced<T extends (...args: never[]) => void> = T & { cancel(options?: { upcomingOnly?: boolean }): void };

    export function debounce<T extends (...args: never[]) => void>(
        delay: number,
        callback: T,
        options?: { atBegin?: boolean },
    ): Debounced<T>;

    export function throttle<T extends (...args: never[]) => void>(
        delay: number,
        callback: T,
        options?: { noTrailing?: boolean; noLeading?: boolean; debounceMode?: boolean },
    ): Debounced<T>;
}
