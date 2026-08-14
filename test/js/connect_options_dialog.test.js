import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick, reactive } from "vue";

vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key) => key } }));

import ConnectOptionsDialog from "../../src/components/device-picker/ConnectOptionsDialog.vue";
import { useConnectionBookmarksStore } from "../../src/stores/connectionBookmarks.js";

// The dialog's bookmark handling lives entirely in setup(), so drive setup() directly:
// the repo has no component-rendering harness, and rendering Nuxt UI would test their
// widgets rather than this wiring.
function mountLogic({ mode = "manual", initialPortOverride = "" } = {}) {
    const props = reactive({ modelValue: false, mode, initialVersion: "1.46.0", initialPortOverride });
    const emitted = [];
    const scope = effectScope();
    const api = scope.run(() =>
        ConnectOptionsDialog.setup(props, { emit: (event, payload) => emitted.push([event, payload]) }),
    );

    // The dialog seeds its fields when it opens, so tests that care about that path open it.
    const open = async () => {
        props.modelValue = true;
        await nextTick();
    };

    return { api, props, emitted, scope, open };
}

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

describe("saving from the connect dialog", () => {
    it("saves the typed address under the typed name", () => {
        const { api } = mountLogic();
        const store = useConnectionBookmarksStore();

        api.portOverride.value = "tcp://192.168.4.1:5761";
        api.bookmarkName.value = "Wi-Fi quad";
        api.onSaveBookmark();

        expect(store.bookmarks).toEqual([
            expect.objectContaining({ name: "Wi-Fi quad", url: "tcp://192.168.4.1:5761" }),
        ]);
    });

    it("cannot save an empty address", () => {
        const { api } = mountLogic();
        const store = useConnectionBookmarksStore();

        api.portOverride.value = "   ";

        expect(api.canSaveBookmark.value).toBe(false);
        api.onSaveBookmark();
        expect(store.bookmarks).toHaveLength(0);
    });

    it("offers to update, not duplicate, an address that is already saved", async () => {
        const store = useConnectionBookmarksStore();
        store.save("tcp://192.168.4.1:5761", "Wi-Fi quad");

        const { api } = mountLogic();
        expect(api.saveBookmarkLabel.value).toBe("connectBookmarkSave");

        api.portOverride.value = "tcp://192.168.4.1:5761";
        await nextTick();

        expect(api.saveBookmarkLabel.value).toBe("connectBookmarkUpdate");
        // The saved name is offered back, so updating cannot silently blank it.
        expect(api.bookmarkName.value).toBe("Wi-Fi quad");

        api.bookmarkName.value = "Racer";
        api.onSaveBookmark();

        expect(store.bookmarks).toHaveLength(1);
        expect(store.bookmarks[0].name).toBe("Racer");
    });

    it("opens on the last manual address with its saved name", async () => {
        const store = useConnectionBookmarksStore();
        store.save("tcp://192.168.4.1:5761", "Wi-Fi quad");

        const { api, open } = mountLogic({ initialPortOverride: "tcp://192.168.4.1:5761" });
        await open();

        expect(api.portOverride.value).toBe("tcp://192.168.4.1:5761");
        expect(api.bookmarkName.value).toBe("Wi-Fi quad");
    });

    it("clears the name box when the address moves off a saved bookmark", async () => {
        const store = useConnectionBookmarksStore();
        store.save("tcp://192.168.4.1:5761", "Wi-Fi quad");

        const { api, open } = mountLogic({ initialPortOverride: "tcp://192.168.4.1:5761" });
        await open();
        expect(api.bookmarkName.value).toBe("Wi-Fi quad");

        api.portOverride.value = "tcp://10.0.0.7:5761";
        await nextTick();

        expect(api.bookmarkName.value).toBe("");
    });
});

describe("the built-in SITL target", () => {
    it("is offered without anything saved, and picking it fills in address and name", async () => {
        const { api } = mountLogic();

        const sitl = api.bookmarks.value.find((entry) => entry.builtin);
        expect(sitl).toMatchObject({ name: "Betaflight SITL", url: "ws://127.0.0.1:6761" });

        api.applyBookmark(sitl);
        await nextTick();

        expect(api.portOverride.value).toBe("ws://127.0.0.1:6761");
        expect(api.bookmarkName.value).toBe("Betaflight SITL");
        // Saving it makes the user's own copy, so the button offers to save, not to update.
        expect(api.saveBookmarkLabel.value).toBe("connectBookmarkSave");
    });

    it("saving over it renames it in place instead of listing it twice", async () => {
        const { api } = mountLogic();
        const store = useConnectionBookmarksStore();

        api.applyBookmark(api.bookmarks.value.find((entry) => entry.builtin));
        await nextTick();
        api.bookmarkName.value = "My simulator";
        api.onSaveBookmark();
        await nextTick();

        expect(api.bookmarks.value).toEqual([
            expect.objectContaining({ name: "My simulator", url: "ws://127.0.0.1:6761" }),
        ]);
        expect(store.bookmarks).toHaveLength(1);
    });

    it("can be dismissed", async () => {
        const { api } = mountLogic();

        api.removeBookmark(api.bookmarks.value.find((entry) => entry.builtin));
        await nextTick();

        expect(api.bookmarks.value).toHaveLength(0);
    });
});

describe("using and removing bookmarks", () => {
    it("picking a bookmark fills the address field", () => {
        const store = useConnectionBookmarksStore();
        const bookmark = store.save("tcp://quad.local:5761", "Cinewhoop");

        const { api } = mountLogic();
        api.applyBookmark(bookmark);

        expect(api.portOverride.value).toBe("tcp://quad.local:5761");
    });

    it("removing drops it from the list the dialog shows", () => {
        const store = useConnectionBookmarksStore();
        const bookmark = store.save("tcp://quad.local:5761", "Cinewhoop");

        const { api } = mountLogic();
        expect(api.bookmarks.value.map((entry) => entry.name)).toContain("Cinewhoop");

        api.removeBookmark(bookmark);

        expect(api.bookmarks.value.map((entry) => entry.name)).not.toContain("Cinewhoop");
        expect(store.bookmarks).toHaveLength(0);
    });

    it("confirming emits the trimmed address for the manual connect path", () => {
        const { api, emitted } = mountLogic();

        api.portOverride.value = "  tcp://quad.local:5761  ";
        api.onConfirm();

        expect(emitted).toContainEqual([
            "confirm",
            { mode: "manual", version: "1.46.0", portOverride: "tcp://quad.local:5761" },
        ]);
    });
});
