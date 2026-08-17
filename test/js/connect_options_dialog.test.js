import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick, reactive } from "vue";

vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key) => key } }));

import ConnectOptionsDialog from "../../src/components/device-picker/ConnectOptionsDialog.vue";
import { useConnectionBookmarksStore } from "../../src/stores/connectionBookmarks.js";

// The dialog's bookmark handling lives entirely in setup(), so drive setup() directly:
// the repo has no component-rendering harness, and rendering Nuxt UI would test their
// widgets rather than this wiring.
function mountLogic(initialPortOverride = "") {
    const props = reactive({ modelValue: false, mode: "manual", initialVersion: "1.46.0", initialPortOverride });
    const emitted = [];
    const api = effectScope().run(() =>
        ConnectOptionsDialog.setup(props, { emit: (event, payload) => emitted.push([event, payload]) }),
    );

    // The dialog seeds its fields when it opens.
    const open = async () => {
        props.modelValue = true;
        await nextTick();
    };

    return { api, emitted, open };
}

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

describe("the connect dialog's bookmark row", () => {
    it("saves the typed address under the typed name", () => {
        const { api } = mountLogic();

        api.portOverride.value = "tcp://192.168.4.1:5761";
        api.bookmarkName.value = "Wi-Fi quad";
        api.onSaveBookmark();

        expect(useConnectionBookmarksStore().find("tcp://192.168.4.1:5761")?.name).toBe("Wi-Fi quad");
    });

    it("cannot save an empty address", () => {
        const { api } = mountLogic();

        api.portOverride.value = "   ";

        expect(api.canSaveBookmark.value).toBe(false);
    });

    it("offers the saved name back and updates in place", async () => {
        const store = useConnectionBookmarksStore();
        store.save("tcp://192.168.4.1:5761", "Wi-Fi quad");

        const { api } = mountLogic();
        expect(api.saveBookmarkLabel.value).toBe("connectBookmarkSave");

        api.portOverride.value = "tcp://192.168.4.1:5761";
        await nextTick();

        // Without the name coming back, saving would blank the label of an existing bookmark.
        expect(api.bookmarkName.value).toBe("Wi-Fi quad");
        expect(api.saveBookmarkLabel.value).toBe("connectBookmarkUpdate");

        api.bookmarkName.value = "Racer";
        api.onSaveBookmark();

        expect(store.bookmarks.filter((b) => b.url.includes("192.168"))).toEqual([
            { name: "Racer", url: "tcp://192.168.4.1:5761" },
        ]);
    });

    it("clears the name box when the address moves off a saved bookmark", async () => {
        useConnectionBookmarksStore().save("tcp://192.168.4.1:5761", "Wi-Fi quad");

        const { api, open } = mountLogic("tcp://192.168.4.1:5761");
        await open();
        expect(api.bookmarkName.value).toBe("Wi-Fi quad");

        api.portOverride.value = "tcp://10.0.0.7:5761";
        await nextTick();

        expect(api.bookmarkName.value).toBe("");
    });

    it("picking one fills the address in, and removing drops it from the list", () => {
        const store = useConnectionBookmarksStore();
        const bookmark = store.save("tcp://quad.local:5761", "Cinewhoop");

        const { api } = mountLogic();
        api.applyBookmark(bookmark);
        expect(api.portOverride.value).toBe("tcp://quad.local:5761");

        api.removeBookmark(bookmark);
        expect(api.bookmarks.value.map((b) => b.name)).not.toContain("Cinewhoop");
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
