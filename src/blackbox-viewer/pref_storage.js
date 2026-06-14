/**
 * A local key/value store for JSON-encodable values. Supports localStorage, chrome.storage.local, and in-memory backends.
 *
 * Supply keyPrefix if you want it automatically prepended to key names.
 */
export function PrefStorage(keyPrefix) {
    const LOCALSTORAGE = 0;
    const CHROME_STORAGE_LOCAL = 1;
    const MEMORY = 2;
    let mode;
    const memoryStorage = {};

    /**
     * Fetch the value with the given name, calling the onGet handler (possibly asynchronously) with the retrieved
     * value, or null if the value didn't exist.
     */
    this.get = function (name, onGet) {
        name = keyPrefix + name;

        switch (mode) {
            case LOCALSTORAGE: {
                let parsed = null;

                if (globalThis.localStorage) {
                    try {
                        parsed = JSON.parse(globalThis.localStorage[name]);
                    } catch {
                        // Invalid JSON in storage — return null
                    }
                }

                onGet(parsed);
                break;
            }
            case CHROME_STORAGE_LOCAL:
                chrome.storage.local.get(name, function (data) {
                    onGet(data[name]);
                });
                break;
            case MEMORY:
                onGet(memoryStorage[name] ?? null);
                break;
        }
    };

    /**
     * Set the given JSON-encodable value into storage using the given name.
     */
    this.set = function (name, value) {
        name = keyPrefix + name;

        switch (mode) {
            case LOCALSTORAGE:
                if (globalThis.localStorage) {
                    try {
                        globalThis.localStorage[name] = JSON.stringify(value);
                    } catch (e) {
                        // Storage quota exceeded or other error
                        console.warn("Failed to save to localStorage:", e.message);
                    }
                }
                break;
            case CHROME_STORAGE_LOCAL: {
                const data = {};

                data[name] = value;

                chrome.storage.local.set(data);
                break;
            }
            case MEMORY:
                memoryStorage[name] = value;
                break;
        }
    };

    // Determine which storage backend to use
    if (globalThis.chrome?.storage?.local) {
        mode = CHROME_STORAGE_LOCAL;
    } else if (globalThis.localStorage) {
        // Verify localStorage is actually usable (may be disabled in some browsers)
        try {
            const testKey = "__pref_storage_test__";
            globalThis.localStorage.setItem(testKey, "test");
            globalThis.localStorage.removeItem(testKey);
            mode = LOCALSTORAGE;
        } catch (e) {
            // localStorage exists but isn't usable (e.g., private browsing mode)
            console.warn("localStorage is not available, falling back to in-memory storage:", e.message);
            mode = MEMORY;
        }
    } else {
        // No persistent storage available, fall back to in-memory storage
        mode = MEMORY;
    }

    keyPrefix = keyPrefix || "";
}
