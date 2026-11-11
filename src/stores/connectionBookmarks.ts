import { defineStore } from "pinia";
import { ref } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";
import { isAndroid, isTauri } from "../js/utils/checkCompatibility";

const STORAGE_KEY = "connectionBookmarks";

// A saved target is a short string ("tcp://192.168.4.1:5761"), so a generous cap keeps a
// corrupted or hand-edited localStorage entry from flooding the connect menu.
const MAX_BOOKMARKS = 50;
const MAX_LENGTH = 253;

export interface ConnectionBookmark {
    /** the label shown in the connect menu */
    name: string;
    /** the manual target, e.g. "tcp://192.168.4.1:5761" */
    url: string;
}

/**
 * SITL speaks raw TCP on 127.0.0.1:5761 and nothing else. A shell with a raw-TCP transport
 * (Tauri desktop, Capacitor Android) connects straight to it; a browser has no raw sockets,
 * so the docs put websockify in front (`websockify 127.0.0.1:6761 127.0.0.1:5761`) and the
 * app connects to the proxy's own port — a different port, not 5761 with a ws:// scheme.
 * @see https://betaflight.com/docs/development/autopilot/SITL_Autopilot_Testing_Gazebo#connect-to-the-sitl
 */
function sitlBookmark(): ConnectionBookmark {
    return {
        name: "Betaflight SITL",
        url: isTauri() || isAndroid() ? "tcp://127.0.0.1:5761" : "ws://127.0.0.1:6761",
    };
}

// Non-strings are dropped rather than stringified: a stored `{"url": {}}` would otherwise
// become the bookmark "[object Object]" and be offered in the connect menu.
const clean = (value: unknown): string => (typeof value === "string" ? value.trim().slice(0, MAX_LENGTH) : "");

// Manual targets are network addresses far more often than serial paths, so they compare
// case-insensitively: "TCP://Quad.local" and "tcp://quad.local" are one bookmark.
const key = (url: string): string => clean(url).toLowerCase();

const field = (entry: unknown, name: keyof ConnectionBookmark): unknown =>
    typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>)[name] : undefined;

/**
 * localStorage is user-writable and survives downgrades, so nothing read back is trusted.
 * @param stored - whatever was in storage
 * @returns usable bookmarks, one per address
 */
function sanitize(stored: unknown): ConnectionBookmark[] {
    const bookmarks: ConnectionBookmark[] = [];
    const seen = new Set<string>();

    for (const entry of Array.isArray(stored) ? stored : []) {
        const url = clean(field(entry, "url"));

        if (!url || seen.has(key(url)) || bookmarks.length >= MAX_BOOKMARKS) {
            continue;
        }

        seen.add(key(url));
        bookmarks.push({ name: clean(field(entry, "name")) || url, url });
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
    const bookmarks = ref<ConnectionBookmark[]>(stored === undefined ? [sitlBookmark()] : sanitize(stored));

    function persist(): void {
        setConfig({ [STORAGE_KEY]: bookmarks.value });
    }

    if (stored === undefined) {
        persist();
    }

    /**
     * @returns the bookmark pointing at this address
     */
    function find(url: string): ConnectionBookmark | null {
        const wanted = key(url);

        return wanted ? (bookmarks.value.find((bookmark) => key(bookmark.url) === wanted) ?? null) : null;
    }

    /**
     * Save an address, or rename the bookmark that already points at it. Saving is
     * idempotent so the same button works whether or not the target is known.
     * @param url - the manual target, e.g. "tcp://192.168.4.1:5761"
     * @param name - a label; the address itself when left empty
     * @returns null when the address is empty or the list is full
     */
    function save(url: string, name = ""): ConnectionBookmark | null {
        const address = clean(url);
        const existing = find(address);

        if (!address || (!existing && bookmarks.value.length >= MAX_BOOKMARKS)) {
            return null;
        }

        const bookmark: ConnectionBookmark = existing ?? { url: address, name: "" };
        bookmark.name = clean(name) || address;

        if (!existing) {
            bookmarks.value.push(bookmark);
        }

        persist();

        return bookmark;
    }

    /**
     * @returns true when a bookmark was removed
     */
    function remove(url: string): boolean {
        const existing = find(url);
        const index = existing ? bookmarks.value.indexOf(existing) : -1;

        if (index === -1) {
            return false;
        }

        bookmarks.value.splice(index, 1);
        persist();

        return true;
    }

    return { bookmarks, find, save, remove };
});
