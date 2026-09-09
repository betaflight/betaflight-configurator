import { defineStore } from "pinia";
import { ref } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";
import { isAndroid, isTauri } from "../js/utils/checkCompatibility";

const STORAGE_KEY = "connectionBookmarks";

// A saved target is a short string ("tcp://192.168.4.1:5761"), so a generous cap keeps a
// corrupted or hand-edited localStorage entry from flooding the connect menu.
const MAX_BOOKMARKS = 50;
const MAX_LENGTH = 253;

/**
 * SITL speaks raw TCP on 127.0.0.1:5761 and nothing else. A shell with a raw-TCP transport
 * (Tauri desktop, Capacitor Android) connects straight to it; a browser has no raw sockets,
 * so the docs put websockify in front (`websockify 127.0.0.1:6761 127.0.0.1:5761`) and the
 * app connects to the proxy's own port — a different port, not 5761 with a ws:// scheme.
 * @see https://betaflight.com/docs/development/autopilot/SITL_Autopilot_Testing_Gazebo#connect-to-the-sitl
 */
function sitlBookmark() {
    return {
        name: "Betaflight SITL",
        url: isTauri() || isAndroid() ? "tcp://127.0.0.1:5761" : "ws://127.0.0.1:6761",
    };
}

// Non-strings are dropped rather than stringified: a stored `{"url": {}}` would otherwise
// become the bookmark "[object Object]" and be offered in the connect menu.
const clean = (value) => (typeof value === "string" ? value.trim().slice(0, MAX_LENGTH) : "");

// Manual targets are network addresses far more often than serial paths, so they compare
// case-insensitively: "TCP://Quad.local" and "tcp://quad.local" are one bookmark.
const key = (url) => clean(url).toLowerCase();

/**
 * localStorage is user-writable and survives downgrades, so nothing read back is trusted.
 * @param {*} stored - whatever was in storage
 * @returns {Array<{name: string, url: string}>} usable bookmarks, one per address
 */
function sanitize(stored) {
    const bookmarks = [];
    const seen = new Set();

    for (const entry of Array.isArray(stored) ? stored : []) {
        const url = clean(entry?.url);

        if (!url || seen.has(key(url)) || bookmarks.length >= MAX_BOOKMARKS) {
            continue;
        }

        seen.add(key(url));
        bookmarks.push({ name: clean(entry?.name) || url, url });
    }

    return bookmarks;
}

/**
 * Saved manual-connection targets ("bookmarks"): named addresses such as an ELRS Wi-Fi
 * module's `tcp://192.168.4.1:5761`, so they can be picked from the connect menu instead of
 * being typed again for every quad. The address is the identity — one bookmark per target.
 */
export const useConnectionBookmarksStore = defineStore("connectionBookmarks", () => {
    const stored = getConfig(STORAGE_KEY).connectionBookmarks;

    // First run seeds SITL, so a simulator connection needs no typing. It is an ordinary
    // bookmark from then on: renameable, and gone for good once removed — the seeding
    // condition is "storage has never been written", not "the list is empty".
    const bookmarks = ref(stored === undefined ? [sitlBookmark()] : sanitize(stored));

    function persist() {
        setConfig({ [STORAGE_KEY]: bookmarks.value });
    }

    if (stored === undefined) {
        persist();
    }

    /**
     * @param {string} url
     * @returns {?{name: string, url: string}} the bookmark pointing at this address
     */
    function find(url) {
        const wanted = key(url);

        return wanted ? (bookmarks.value.find((bookmark) => key(bookmark.url) === wanted) ?? null) : null;
    }

    /**
     * Save an address, or rename the bookmark that already points at it. Saving is
     * idempotent so the same button works whether or not the target is known.
     * @param {string} url - the manual target, e.g. "tcp://192.168.4.1:5761"
     * @param {string} [name] - a label; the address itself when left empty
     * @returns {?{name: string, url: string}} null when the address is empty or the list is full
     */
    function save(url, name = "") {
        const address = clean(url);
        const existing = find(address);

        if (!address || (!existing && bookmarks.value.length >= MAX_BOOKMARKS)) {
            return null;
        }

        const bookmark = existing ?? { url: address, name: "" };
        bookmark.name = clean(name) || address;

        if (!existing) {
            bookmarks.value.push(bookmark);
        }

        persist();

        return bookmark;
    }

    /**
     * @param {string} url
     * @returns {boolean} true when a bookmark was removed
     */
    function remove(url) {
        const index = bookmarks.value.indexOf(find(url));

        if (index === -1) {
            return false;
        }

        bookmarks.value.splice(index, 1);
        persist();

        return true;
    }

    return { bookmarks, find, save, remove };
});
