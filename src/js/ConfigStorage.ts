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
 * Every key is stored under its own `{ [key]: value }` record rather than as a bare value, so
 * reading several keys at once merges those records into one object.
 */

/**
 * Anything that is not such a record — `null`, an array, a primitive, unparseable text — is
 * treated as absent, so a single-key read still falls back to its default.
 */
function readRecord(key: string): Record<string, unknown> | null {
    const keyValue = localStorage.getItem(key);
    if (!keyValue) {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(keyValue);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch (e) {
        console.error(e);
    }

    return null;
}

/**
 * Gets one or more items from localStorage. `defaultValue` only applies to a single key, and only
 * when nothing was stored under it.
 */
export function get<T = unknown>(key: string, defaultValue?: T | null): Record<string, T>;
export function get<T = unknown>(keys: string[]): Record<string, T>;
export function get(key: string | string[], defaultValue: unknown = null): Record<string, unknown> {
    if (Array.isArray(key)) {
        let result: Record<string, unknown> = {};
        key.forEach(function (element) {
            result = { ...result, ...readRecord(element) };
        });
        return result;
    }

    const result: Record<string, unknown> = readRecord(key) ?? {};

    // if default value is set and key is not found in localStorage, set default value
    if (!Object.keys(result).length && defaultValue !== null) {
        console.log("setting default value for", key, defaultValue);
        result[key] = defaultValue;
    }

    return result;
}

/**
 * Save dictionary of key/value pairs to localStorage
 */
export function set(input: Record<string, unknown>): void {
    Object.keys(input).forEach(function (element) {
        try {
            localStorage.setItem(element, JSON.stringify({ [element]: input[element] }));
        } catch (e) {
            console.error(e);
        }
    });
}

/**
 * Remove item from localStorage
 */
export function remove(item: string): void {
    localStorage.removeItem(item);
}

/**
 * Clear localStorage
 */
export function clear(): void {
    localStorage.clear();
}

/**
 * @deprecated this is a temporary solution to allow the use of the ConfigStorage module in old way
 */
const ConfigStorage = {
    get,
    set,
    remove,
    clear,
};

declare global {
    interface Window {
        ConfigStorage: typeof ConfigStorage;
    }
}

window.ConfigStorage = ConfigStorage;
