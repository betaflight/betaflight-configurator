import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";
import { isAndroid, isTauri } from "../js/utils/checkCompatibility";

const STORAGE_KEY = "connectionBookmarks";
const HIDDEN_DEFAULTS_KEY = "connectionBookmarksHiddenDefaults";

// A saved manual target is a short string ("tcp://192.168.4.1:5761"), so a generous
// cap keeps a corrupted or hand-edited localStorage entry from flooding the connect menu.
const MAX_BOOKMARKS = 50;
const MAX_NAME_LENGTH = 64;
const MAX_URL_LENGTH = 253;

let idCounter = 0;

function createId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    idCounter += 1;
    return `bookmark-${idCounter}`;
}

/**
 * Manual targets are network addresses far more often than serial paths, so compare
 * them case-insensitively: "TCP://Quad.local" and "tcp://quad.local" are one bookmark.
 * @param {string} url
 * @returns {string} the comparison key for an address
 */
function normalizeUrl(url) {
    return String(url ?? "")
        .trim()
        .toLowerCase();
}

function clamp(value, maxLength) {
    return String(value ?? "")
        .trim()
        .slice(0, maxLength);
}

/**
 * Drop anything that is not a usable bookmark and give every survivor a unique id.
 * localStorage is user-writable and survives downgrades, so nothing here is trusted.
 * @param {*} stored - whatever was read back from storage
 * @returns {Array<{id: string, name: string, url: string}>}
 */
function sanitize(stored) {
    if (!Array.isArray(stored)) {
        return [];
    }

    const seenUrls = new Set();
    // Built-in ids are reserved: a stored bookmark carrying one would collide with the
    // entry it is listed next to.
    const seenIds = new Set(defaultBookmarks().map((entry) => entry.id));
    const bookmarks = [];

    for (const entry of stored) {
        if (!entry || typeof entry !== "object") {
            continue;
        }

        const url = clamp(entry.url, MAX_URL_LENGTH);
        const key = normalizeUrl(url);

        if (!url || seenUrls.has(key)) {
            continue;
        }

        let id = typeof entry.id === "string" && entry.id ? entry.id : createId();
        while (seenIds.has(id)) {
            id = createId();
        }

        seenUrls.add(key);
        seenIds.add(id);
        bookmarks.push({ id, name: clamp(entry.name, MAX_NAME_LENGTH) || url, url });

        if (bookmarks.length >= MAX_BOOKMARKS) {
            break;
        }
    }

    return bookmarks;
}

/**
 * Betaflight SITL speaks raw TCP on 127.0.0.1:5761 and nothing else. A shell with a
 * raw-TCP transport (Tauri desktop, Capacitor Android) connects to it directly. A
 * browser has no raw sockets, so the docs have the user put websockify in front of it
 * (`websockify 127.0.0.1:6761 127.0.0.1:5761`) and connect to the proxy's own port —
 * hence a different port here, not the same one with a ws:// scheme.
 * @see https://betaflight.com/docs/development/autopilot/SITL_Autopilot_Testing_Gazebo#connect-to-the-sitl
 * @returns {Array<{id: string, name: string, url: string, builtin: boolean}>} targets offered out of the box
 */
function defaultBookmarks() {
    const url = isTauri() || isAndroid() ? "tcp://127.0.0.1:5761" : "ws://127.0.0.1:6761";

    return [{ id: "default-sitl", name: "Betaflight SITL", url, builtin: true }];
}

/**
 * Dismissals are only meaningful for built-ins that still exist, so anything else is
 * dropped rather than kept around forever.
 * @param {*} stored - whatever was read back from storage
 * @returns {string[]} the ids of dismissed built-in bookmarks
 */
function sanitizeIds(stored) {
    if (!Array.isArray(stored)) {
        return [];
    }

    const known = new Set(defaultBookmarks().map((entry) => entry.id));

    return [...new Set(stored.filter((id) => known.has(id)))];
}

/**
 * Saved manual-connection targets ("bookmarks"): named addresses such as an ELRS
 * Wi-Fi module's `tcp://192.168.4.1:5761`, so they can be picked from the connect
 * menu instead of being typed again for every quad. Ships with a built-in SITL entry,
 * which the user can rename (saving over it) or dismiss (removing it).
 */
export const useConnectionBookmarksStore = defineStore("connectionBookmarks", () => {
    const bookmarks = ref(sanitize(getConfig(STORAGE_KEY).connectionBookmarks));
    const hiddenDefaults = ref(sanitizeIds(getConfig(HIDDEN_DEFAULTS_KEY).connectionBookmarksHiddenDefaults));

    const count = computed(() => bookmarks.value.length);
    const isFull = computed(() => bookmarks.value.length >= MAX_BOOKMARKS);

    // A saved bookmark for the same address replaces the built-in one, so renaming SITL
    // does not leave both entries in the list.
    const visibleDefaults = computed(() =>
        defaultBookmarks().filter(
            (entry) => !hiddenDefaults.value.includes(entry.id) && !findByUrl(entry.url, bookmarks.value),
        ),
    );

    /** The list to offer the user: everything they saved, then whatever is left of the built-ins. */
    const items = computed(() => [...bookmarks.value, ...visibleDefaults.value]);

    function persist() {
        setConfig({ [STORAGE_KEY]: bookmarks.value, [HIDDEN_DEFAULTS_KEY]: hiddenDefaults.value });
    }

    /**
     * @param {string} url
     * @param {Array<{url: string}>} [list] - defaults to the saved bookmarks
     * @returns {?{id: string, name: string, url: string}} the entry pointing at this address
     */
    function findByUrl(url, list = bookmarks.value) {
        const key = normalizeUrl(url);

        if (!key) {
            return null;
        }

        return list.find((bookmark) => normalizeUrl(bookmark.url) === key) ?? null;
    }

    /**
     * @param {string} url
     * @returns {?{id: string, name: string, url: string}} the saved or built-in entry for this address
     */
    function findItemByUrl(url) {
        return findByUrl(url, items.value);
    }

    /**
     * Save an address, or rename the bookmark that already points at it. Saving is
     * idempotent so the same button works whether or not the target is known.
     * @param {string} url - the manual target, e.g. "tcp://192.168.4.1:5761"
     * @param {string} [name] - a label; the address itself when left empty
     * @returns {?{id: string, name: string, url: string}} null when the address is empty or the list is full
     */
    function save(url, name = "") {
        const cleanUrl = clamp(url, MAX_URL_LENGTH);

        if (!cleanUrl) {
            return null;
        }

        const cleanName = clamp(name, MAX_NAME_LENGTH) || cleanUrl;
        const existing = findByUrl(cleanUrl);

        if (existing) {
            existing.name = cleanName;
            existing.url = cleanUrl;
            persist();
            return existing;
        }

        if (isFull.value) {
            return null;
        }

        const bookmark = { id: createId(), name: cleanName, url: cleanUrl };
        bookmarks.value.push(bookmark);
        persist();

        return bookmark;
    }

    /**
     * Remove a saved bookmark, or dismiss a built-in one. A dismissed built-in stays
     * gone until the list is cleared, so removing it is not undone on the next start.
     * @param {string} id
     * @returns {boolean} true when the list changed
     */
    function remove(id) {
        const index = bookmarks.value.findIndex((bookmark) => bookmark.id === id);

        if (index !== -1) {
            bookmarks.value.splice(index, 1);
            persist();
            return true;
        }

        if (visibleDefaults.value.some((entry) => entry.id === id)) {
            hiddenDefaults.value.push(id);
            persist();
            return true;
        }

        return false;
    }

    function clear() {
        bookmarks.value = [];
        hiddenDefaults.value = [];
        persist();
    }

    /**
     * Re-read storage. Only needed when another context wrote the keys (a second
     * window, or a settings reset) — every mutation here keeps storage in step.
     */
    function reload() {
        bookmarks.value = sanitize(getConfig(STORAGE_KEY).connectionBookmarks);
        hiddenDefaults.value = sanitizeIds(getConfig(HIDDEN_DEFAULTS_KEY).connectionBookmarksHiddenDefaults);
    }

    return {
        bookmarks,
        items,
        count,
        isFull,
        findByUrl,
        findItemByUrl,
        save,
        remove,
        clear,
        reload,
    };
});

export const __testing = {
    MAX_BOOKMARKS,
    MAX_NAME_LENGTH,
    MAX_URL_LENGTH,
    STORAGE_KEY,
    HIDDEN_DEFAULTS_KEY,
    defaultBookmarks,
};
