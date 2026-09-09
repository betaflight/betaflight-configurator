import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import { useDirtyState } from "../../src/composables/useDirtyState";

function setup(initial = { a: 1 }) {
    const state = reactive({ ...initial });
    const tracker = useDirtyState(() => JSON.stringify(state));
    return { state, ...tracker };
}

describe("useDirtyState", () => {
    it("stays clean before the first markClean, so a failed load cannot enable Save", () => {
        const { state, dirty } = setup();

        expect(dirty.value).toBe(false);
        state.a = 2;
        expect(dirty.value).toBe(false);
    });

    it("reports a change once tracking has started", () => {
        const { state, dirty, markClean } = setup();

        markClean();
        expect(dirty.value).toBe(false);

        state.a = 2;
        expect(dirty.value).toBe(true);
    });

    it("goes clean again when the state returns to the baseline", () => {
        const { state, dirty, markClean } = setup();
        markClean();

        state.a = 2;
        expect(dirty.value).toBe(true);

        state.a = 1;
        expect(dirty.value).toBe(false);
    });

    it("adopts the current state on a bare markClean", () => {
        const { state, dirty, markClean } = setup();
        markClean();

        state.a = 2;
        markClean();
        expect(dirty.value).toBe(false);
    });

    it("keeps an edit made mid-save dirty when a pinned snapshot is adopted", () => {
        const { state, dirty, markClean, takeSnapshot } = setup();
        markClean();

        // What the save is about to write.
        state.a = 2;
        const inFlight = takeSnapshot();

        // The user edits again while the write is still going.
        state.a = 3;

        markClean(inFlight);
        expect(dirty.value).toBe(true);
    });

    it("treats an empty-string snapshot as tracked rather than untracked", () => {
        const state = reactive({ text: "" });
        const { dirty, markClean } = useDirtyState(() => state.text);

        markClean();
        expect(dirty.value).toBe(false);

        state.text = "x";
        expect(dirty.value).toBe(true);
    });
});
