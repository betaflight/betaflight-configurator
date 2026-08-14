import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useConnectionBookmarksStore } from "../../src/stores/connectionBookmarks.js";
import { get as getConfig, set as setConfig } from "../../src/js/ConfigStorage.js";

// jsdom is neither Tauri nor Capacitor, so the seeded SITL target is the websockify address.
const SITL = { name: "Betaflight SITL", url: "ws://127.0.0.1:6761" };

const stored = () => getConfig("connectionBookmarks").connectionBookmarks;
const seed = (bookmarks) => setConfig({ connectionBookmarks: bookmarks });

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

describe("saving a manual target", () => {
    it("trims, falls back to the address as the name, and persists", () => {
        const store = useConnectionBookmarksStore();

        const bookmark = store.save("  tcp://quad.local:5761  ");

        expect(bookmark).toEqual({ name: "tcp://quad.local:5761", url: "tcp://quad.local:5761" });
        expect(stored()).toContainEqual(bookmark);
    });

    it("renames instead of duplicating, matching the address case-insensitively", () => {
        const store = useConnectionBookmarksStore();
        store.save("tcp://192.168.4.1:5761", "Quad");

        store.save("TCP://192.168.4.1:5761", "Racer");

        expect(store.bookmarks.filter((b) => b.url.toLowerCase().includes("192.168.4.1"))).toEqual([
            { name: "Racer", url: "tcp://192.168.4.1:5761" },
        ]);
    });

    it("refuses an empty address", () => {
        const store = useConnectionBookmarksStore();

        expect(store.save("   ", "Nothing")).toBeNull();
    });

    it("stops at the cap", () => {
        seed([]);
        const store = useConnectionBookmarksStore();

        for (let i = 0; i < 50; i++) {
            expect(store.save(`tcp://10.0.0.${i}:5761`)).not.toBeNull();
        }

        expect(store.save("tcp://10.9.9.9:5761")).toBeNull();
        // A known address is still renameable when the list is full.
        expect(store.save("tcp://10.0.0.0:5761", "First")?.name).toBe("First");
    });
});

describe("finding and removing", () => {
    it("finds by address, ignoring case and surrounding space", () => {
        const store = useConnectionBookmarksStore();
        store.save("tcp://Quad.local:5761", "Quad");

        expect(store.find("  tcp://quad.LOCAL:5761 ")?.name).toBe("Quad");
        expect(store.find("tcp://other:5761")).toBeNull();
        expect(store.find("")).toBeNull();
    });

    it("removes by address and persists the shortened list", () => {
        const store = useConnectionBookmarksStore();
        const keep = store.save("tcp://a:5761", "A");
        store.save("tcp://b:5761", "B");

        expect(store.remove("tcp://b:5761")).toBe(true);
        expect(store.remove("tcp://b:5761")).toBe(false);
        expect(stored()).toEqual([SITL, keep]);
    });
});

describe("the seeded SITL target", () => {
    it("is there on a first run, and saved so it is the user's from then on", () => {
        const store = useConnectionBookmarksStore();

        expect(store.bookmarks).toEqual([SITL]);
        expect(stored()).toEqual([SITL]);
    });

    it("does not come back once removed", () => {
        useConnectionBookmarksStore().remove(SITL.url);
        setActivePinia(createPinia());

        expect(useConnectionBookmarksStore().bookmarks).toEqual([]);
    });

    it("can be renamed like any other bookmark", () => {
        const store = useConnectionBookmarksStore();

        store.save(SITL.url, "My simulator");

        expect(store.bookmarks).toEqual([{ name: "My simulator", url: SITL.url }]);
    });
});

describe("reading back what was stored", () => {
    it("drops entries with no address, repeats of one address, and junk", () => {
        seed([
            { name: "Bad", url: "  " },
            { url: "tcp://ok:5761" },
            { url: "TCP://OK:5761" },
            // A non-string address must not be stringified into "[object Object]".
            { url: {} },
            { url: ["tcp://sneaky:5761"] },
            null,
            42,
        ]);

        expect(useConnectionBookmarksStore().bookmarks).toEqual([{ name: "tcp://ok:5761", url: "tcp://ok:5761" }]);
    });

    it("ignores a stored value that is not a list, without re-seeding", () => {
        seed({ nope: true });

        expect(useConnectionBookmarksStore().bookmarks).toEqual([]);
    });

    it("clamps an over-long name and address", () => {
        const store = useConnectionBookmarksStore();

        const bookmark = store.save("t".repeat(300), "n".repeat(300));

        expect(bookmark.url).toHaveLength(253);
        expect(bookmark.name).toHaveLength(253);
    });
});
