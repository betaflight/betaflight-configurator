import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useConnectionBookmarksStore, __testing } from "../../src/stores/connectionBookmarks.js";
import { get as getConfig, set as setConfig } from "../../src/js/ConfigStorage.js";

const { STORAGE_KEY, HIDDEN_DEFAULTS_KEY, MAX_BOOKMARKS, MAX_NAME_LENGTH, MAX_URL_LENGTH } = __testing;

function storedBookmarks() {
    return getConfig(STORAGE_KEY).connectionBookmarks;
}

function seed(bookmarks) {
    setConfig({ [STORAGE_KEY]: bookmarks });
}

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

describe("saving a manual target", () => {
    it("keeps the address and falls back to it as the name", () => {
        const store = useConnectionBookmarksStore();

        const bookmark = store.save("tcp://192.168.4.1:5761");

        expect(bookmark).toMatchObject({ name: "tcp://192.168.4.1:5761", url: "tcp://192.168.4.1:5761" });
        expect(store.bookmarks).toHaveLength(1);
        expect(storedBookmarks()).toEqual([bookmark]);
    });

    it("trims the address and the name", () => {
        const store = useConnectionBookmarksStore();

        const bookmark = store.save("  tcp://quad.local:5761  ", "  Cinewhoop  ");

        expect(bookmark).toMatchObject({ name: "Cinewhoop", url: "tcp://quad.local:5761" });
    });

    it("renames instead of duplicating when the address is already saved", () => {
        const store = useConnectionBookmarksStore();

        const first = store.save("tcp://192.168.4.1:5761", "Quad");
        const second = store.save("TCP://192.168.4.1:5761", "Racer");

        expect(store.bookmarks).toHaveLength(1);
        expect(second.id).toBe(first.id);
        expect(store.bookmarks[0].name).toBe("Racer");
        expect(storedBookmarks()).toHaveLength(1);
    });

    it("refuses an empty address", () => {
        const store = useConnectionBookmarksStore();

        expect(store.save("   ", "Nothing")).toBeNull();
        expect(store.bookmarks).toHaveLength(0);
    });

    it("stops at the maximum and reports being full", () => {
        const store = useConnectionBookmarksStore();

        for (let i = 0; i < MAX_BOOKMARKS; i++) {
            expect(store.save(`tcp://10.0.0.${i}:5761`)).not.toBeNull();
        }

        expect(store.isFull).toBe(true);
        expect(store.save("tcp://10.9.9.9:5761")).toBeNull();
        expect(store.count).toBe(MAX_BOOKMARKS);
    });

    it("still renames a known address when the list is full", () => {
        const store = useConnectionBookmarksStore();

        for (let i = 0; i < MAX_BOOKMARKS; i++) {
            store.save(`tcp://10.0.0.${i}:5761`);
        }

        expect(store.save("tcp://10.0.0.0:5761", "First quad")?.name).toBe("First quad");
    });

    it("clamps over-long names and addresses", () => {
        const store = useConnectionBookmarksStore();

        const bookmark = store.save("t".repeat(MAX_URL_LENGTH + 10), "n".repeat(MAX_NAME_LENGTH + 10));

        expect(bookmark.url).toHaveLength(MAX_URL_LENGTH);
        expect(bookmark.name).toHaveLength(MAX_NAME_LENGTH);
    });
});

// crypto.randomUUID needs a secure context, which the configurator does not get over plain
// HTTP on a LAN address. There the store falls back to a counter that restarts at 1 on every
// load, so these cover the ids it mints without it.
describe("ids without crypto.randomUUID", () => {
    let randomUUID;

    beforeEach(() => {
        randomUUID = crypto.randomUUID;
        crypto.randomUUID = undefined;
    });

    afterEach(() => {
        crypto.randomUUID = randomUUID;
    });

    it("does not reuse an id already held by a stored bookmark", () => {
        seed([{ id: "bookmark-1", name: "From last session", url: "tcp://a:5761" }]);

        const store = useConnectionBookmarksStore();
        const saved = store.save("tcp://b:5761", "New one");

        expect(saved.id).not.toBe("bookmark-1");
        expect(new Set(store.items.map((entry) => entry.id)).size).toBe(store.items.length);
    });

    it("does not hand out a built-in id", () => {
        const store = useConnectionBookmarksStore();

        for (let i = 0; i < 5; i++) {
            expect(store.save(`tcp://${i}.example:5761`).id).not.toBe("default-sitl");
        }
    });
});

describe("looking a target up", () => {
    it("matches case-insensitively and ignores surrounding space", () => {
        const store = useConnectionBookmarksStore();
        store.save("tcp://Quad.local:5761", "Quad");

        expect(store.findByUrl("  tcp://quad.LOCAL:5761 ")?.name).toBe("Quad");
        expect(store.findByUrl("tcp://other:5761")).toBeNull();
        expect(store.findByUrl("")).toBeNull();
        expect(store.findByUrl(undefined)).toBeNull();
    });
});

describe("removing", () => {
    it("removes by id and persists the shortened list", () => {
        const store = useConnectionBookmarksStore();
        const keep = store.save("tcp://a:5761", "A");
        const drop = store.save("tcp://b:5761", "B");

        expect(store.remove(drop.id)).toBe(true);
        expect(store.bookmarks).toEqual([keep]);
        expect(storedBookmarks()).toEqual([keep]);
    });

    it("reports an unknown id", () => {
        const store = useConnectionBookmarksStore();

        expect(store.remove("nope")).toBe(false);
    });

    it("clear empties the list and storage", () => {
        const store = useConnectionBookmarksStore();
        store.save("tcp://a:5761");

        store.clear();

        expect(store.bookmarks).toEqual([]);
        expect(storedBookmarks()).toEqual([]);
    });
});

describe("the built-in SITL target", () => {
    // jsdom is neither Tauri nor Capacitor, so the default is the websockify proxy address.
    const SITL_URL = "ws://127.0.0.1:6761";

    it("is offered when nothing is saved", () => {
        const store = useConnectionBookmarksStore();

        expect(store.bookmarks).toEqual([]);
        expect(store.items).toEqual([{ id: "default-sitl", name: "Betaflight SITL", url: SITL_URL, builtin: true }]);
    });

    it("is not persisted, so a later release can change it", () => {
        useConnectionBookmarksStore();

        expect(storedBookmarks()).toBeUndefined();
    });

    it("is listed after the user's own bookmarks", () => {
        const store = useConnectionBookmarksStore();
        store.save("tcp://192.168.4.1:5761", "Quad");

        expect(store.items.map((entry) => entry.name)).toEqual(["Quad", "Betaflight SITL"]);
    });

    it("is replaced by a saved bookmark for the same address", () => {
        const store = useConnectionBookmarksStore();
        store.save(SITL_URL, "My simulator");

        expect(store.items).toEqual([expect.objectContaining({ name: "My simulator", url: SITL_URL })]);
        expect(store.items.some((entry) => entry.builtin)).toBe(false);
    });

    it("stays gone once dismissed, across a reload", () => {
        const store = useConnectionBookmarksStore();

        expect(store.remove("default-sitl")).toBe(true);
        expect(store.items).toEqual([]);
        expect(getConfig(HIDDEN_DEFAULTS_KEY).connectionBookmarksHiddenDefaults).toEqual(["default-sitl"]);

        store.reload();
        expect(store.items).toEqual([]);
    });

    it("comes back after the list is cleared", () => {
        const store = useConnectionBookmarksStore();
        store.remove("default-sitl");

        store.clear();

        expect(store.items.some((entry) => entry.builtin)).toBe(true);
    });

    it("keeps its id to itself when storage claims it", () => {
        seed([{ id: "default-sitl", name: "Impostor", url: "tcp://192.168.4.1:5761" }]);

        const store = useConnectionBookmarksStore();

        expect(store.bookmarks[0].id).not.toBe("default-sitl");
        expect(new Set(store.items.map((entry) => entry.id)).size).toBe(2);
    });

    it("honours a stored dismissal and forgets ids that name no built-in", () => {
        setConfig({ [HIDDEN_DEFAULTS_KEY]: ["default-sitl", "default-gone", 7] });

        const store = useConnectionBookmarksStore();
        expect(store.items).toEqual([]);

        store.save("tcp://a:5761");

        expect(getConfig(HIDDEN_DEFAULTS_KEY).connectionBookmarksHiddenDefaults).toEqual(["default-sitl"]);
    });

    it("does not count towards the saved-bookmark limit", () => {
        const store = useConnectionBookmarksStore();

        expect(store.count).toBe(0);
        expect(store.findByUrl(SITL_URL)).toBeNull();
        expect(store.findItemByUrl(SITL_URL)?.builtin).toBe(true);
    });
});

describe("reading back what was stored", () => {
    it("restores saved bookmarks", () => {
        seed([{ id: "one", name: "Quad", url: "tcp://192.168.4.1:5761" }]);

        const store = useConnectionBookmarksStore();

        expect(store.bookmarks).toEqual([{ id: "one", name: "Quad", url: "tcp://192.168.4.1:5761" }]);
    });

    it("drops entries with no usable address", () => {
        seed([{ id: "a", name: "Bad", url: "   " }, { id: "b", url: "tcp://ok:5761" }, null, "nonsense", 42]);

        const store = useConnectionBookmarksStore();

        expect(store.bookmarks).toEqual([{ id: "b", name: "tcp://ok:5761", url: "tcp://ok:5761" }]);
    });

    it("keeps the first of duplicate addresses and de-duplicates ids", () => {
        seed([
            { id: "dup", name: "First", url: "tcp://a:5761" },
            { id: "dup", name: "Second", url: "tcp://b:5761" },
            { id: "other", name: "Third", url: "TCP://A:5761" },
        ]);

        const store = useConnectionBookmarksStore();

        expect(store.bookmarks.map((b) => b.name)).toEqual(["First", "Second"]);
        expect(new Set(store.bookmarks.map((b) => b.id)).size).toBe(2);
    });

    it("ignores a stored value that is not a list", () => {
        seed({ nope: true });

        expect(useConnectionBookmarksStore().bookmarks).toEqual([]);
    });

    it("reload picks up a write from another context", () => {
        const store = useConnectionBookmarksStore();
        expect(store.bookmarks).toEqual([]);

        seed([{ id: "x", name: "Elsewhere", url: "tcp://x:5761" }]);
        store.reload();

        expect(store.bookmarks).toEqual([{ id: "x", name: "Elsewhere", url: "tcp://x:5761" }]);
    });
});
