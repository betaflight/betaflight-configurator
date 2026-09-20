/**
 * Every key is stored under its own `{ [key]: value }` record rather than as a bare value, so
 * reading several keys at once merges those records into one object.
 */

/**
 * Gets one or more items from localStorage. `defaultValue` only applies to a single key, and only
 * when nothing was stored under it.
 */
export function get<T = unknown>(key: string, defaultValue?: T | null): Record<string, T>;
export function get<T = unknown>(keys: string[]): Record<string, T>;
export function get(key: string | string[], defaultValue: unknown = null): Record<string, unknown> {
    let result: Record<string, unknown> = {};
    if (Array.isArray(key)) {
        key.forEach(function (element) {
            const keyValue = localStorage.getItem(element);
            if (keyValue) {
                try {
                    result = { ...result, ...JSON.parse(keyValue) };
                } catch (e) {
                    console.error(e);
                }
            }
        });
    } else {
        const keyValue = localStorage.getItem(key);
        if (keyValue) {
            try {
                result = JSON.parse(keyValue);
            } catch (e) {
                console.error(e);
            }
        }

        // if default value is set and key is not found in localStorage, set default value
        if (!Object.keys(result).length && defaultValue !== null) {
            console.log("setting default value for", key, defaultValue);
            result[key] = defaultValue;
        }
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
