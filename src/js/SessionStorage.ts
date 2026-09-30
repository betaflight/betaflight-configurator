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
 * Gets one or more items from sessionStorage. Each item is stored as a `{ [key]: value }` record,
 * so the result maps the requested keys to their values; a key never stored is simply absent.
 */
export function get<T = unknown>(key: string | string[]): Record<string, T | undefined> {
    let result: Record<string, T | undefined> = {};
    if (Array.isArray(key)) {
        key.forEach(function (element) {
            try {
                // JSON.parse(null) parses "null", which spreads to nothing — kept as it was.
                result = { ...result, ...JSON.parse(sessionStorage.getItem(element) ?? "null") };
            } catch (e) {
                console.error(e);
            }
        });
    } else {
        const keyValue = sessionStorage.getItem(key);
        if (keyValue) {
            try {
                result = JSON.parse(keyValue);
            } catch (e) {
                console.error(e);
            }
        }
    }

    return result;
}

/**
 * Save dictionary of key/value pairs to sessionStorage
 * @param input object which keys are strings and values are serializable objects
 */
export function set(input: Record<string, unknown>) {
    Object.keys(input).forEach(function (element) {
        const tmpObj: Record<string, unknown> = {};
        tmpObj[element] = input[element];
        try {
            sessionStorage.setItem(element, JSON.stringify(tmpObj));
        } catch (e) {
            console.error(e);
        }
    });
}

/**
 * Remove item from sessionStorage
 * @param item key to remove from storage
 */
export function remove(item: string) {
    sessionStorage.removeItem(item);
}

/**
 * Clear sessionStorage
 */
export function clear() {
    sessionStorage.clear();
}
