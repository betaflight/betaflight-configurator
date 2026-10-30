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

const LOCALSTORAGE = 0;
const CHROME_STORAGE_LOCAL = 1;
const MEMORY = 2;

/** The part of the Chrome Apps storage API this uses; absent everywhere else. */
interface ChromeStorageLocal {
    get(name: string, callback: (data: Record<string, unknown>) => void): void;
    set(data: Record<string, unknown>): void;
}

function chromeStorageLocal(): ChromeStorageLocal | undefined {
    return (globalThis as { chrome?: { storage?: { local?: ChromeStorageLocal } } }).chrome?.storage?.local;
}

/**
 * localStorage if this page may use it, else null. Where storage is blocked, reading the
 * `localStorage` property itself throws a SecurityError, so the read is inside the try too.
 */
function usableLocalStorage(): Storage | null {
    try {
        const storage = globalThis.localStorage;
        if (!storage) {
            // No persistent storage available
            return null;
        }
        // Verify localStorage is actually usable (may be disabled in some browsers)
        const testKey = "__pref_storage_test__";
        storage.setItem(testKey, "test");
        storage.removeItem(testKey);
        return storage;
    } catch (e) {
        // localStorage exists but isn't usable (e.g., private browsing mode, or blocked by the browser)
        console.warn(
            "localStorage is not available, falling back to in-memory storage:",
            (e as { message?: unknown }).message,
        );
        return null;
    }
}

/**
 * A local key/value store for JSON-encodable values. Supports localStorage, chrome.storage.local, and in-memory backends.
 *
 * Supply keyPrefix if you want it automatically prepended to key names.
 */
export class PrefStorage {
    private readonly keyPrefix: string;
    private readonly mode: typeof LOCALSTORAGE | typeof CHROME_STORAGE_LOCAL | typeof MEMORY;
    private readonly memoryStorage: Record<string, unknown> = {};
    /** Acquired once, safely; only set in LOCALSTORAGE mode. */
    private readonly localStorage: Storage | null = null;

    constructor(keyPrefix?: string) {
        // Determine which storage backend to use, falling back to in-memory storage
        if (chromeStorageLocal()) {
            this.mode = CHROME_STORAGE_LOCAL;
        } else {
            this.localStorage = usableLocalStorage();
            this.mode = this.localStorage ? LOCALSTORAGE : MEMORY;
        }

        this.keyPrefix = keyPrefix || "";
    }

    /**
     * Fetch the value with the given name, calling the onGet handler (possibly asynchronously) with the retrieved
     * value, or null if the value didn't exist. The value is whatever JSON was stored, so the caller checks its shape.
     */
    get(name: string, onGet: (value: unknown) => void): void {
        name = this.keyPrefix + name;

        switch (this.mode) {
            case LOCALSTORAGE: {
                let parsed: unknown = null;

                try {
                    parsed = JSON.parse(this.localStorage![name]);
                } catch {
                    // Invalid JSON in storage — return null
                }

                onGet(parsed);
                break;
            }
            case CHROME_STORAGE_LOCAL:
                chromeStorageLocal()!.get(name, function (data) {
                    onGet(data[name]);
                });
                break;
            case MEMORY:
                onGet(this.memoryStorage[name] ?? null);
                break;
        }
    }

    /**
     * Set the given JSON-encodable value into storage using the given name.
     */
    set(name: string, value: unknown): void {
        name = this.keyPrefix + name;

        switch (this.mode) {
            case LOCALSTORAGE:
                try {
                    this.localStorage![name] = JSON.stringify(value);
                } catch (e) {
                    // Storage quota exceeded or other error
                    console.warn("Failed to save to localStorage:", (e as { message?: unknown }).message);
                }
                break;
            case CHROME_STORAGE_LOCAL: {
                const data: Record<string, unknown> = {};

                data[name] = value;

                chromeStorageLocal()!.set(data);
                break;
            }
            case MEMORY:
                this.memoryStorage[name] = value;
                break;
        }
    }
}
