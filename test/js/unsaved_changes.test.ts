import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, reactive } from "vue";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { pinia } from "../../src/js/pinia_instance";
import { useDialogStore } from "../../src/stores/dialog";
import { useDirtyState } from "../../src/composables/useDirtyState";
import { confirmDiscardUnsavedChanges, hasUnsavedChanges, registerUnsavedChanges } from "../../src/js/unsaved_changes";

/** A tab-like component whose dirty flag is driven from the test. */
function mountDirtyTab() {
    const state = reactive({ value: 1 });
    let tracker!: ReturnType<typeof useDirtyState>;
    const wrapper = mount(
        defineComponent({
            setup() {
                tracker = useDirtyState(() => JSON.stringify(state));
                tracker.markClean();
                return () => h("div");
            },
        }),
    );
    return { state, tracker, wrapper };
}

describe("unsaved changes", () => {
    beforeEach(() => {
        setActivePinia(pinia);
        useDialogStore(pinia).close();
    });

    afterEach(() => {
        useDialogStore(pinia).close();
    });

    it("reports a registered source until it is removed", () => {
        let dirty = true;
        const unregister = registerUnsavedChanges(() => dirty);

        expect(hasUnsavedChanges()).toBe(true);
        dirty = false;
        expect(hasUnsavedChanges()).toBe(false);

        dirty = true;
        unregister();
        expect(hasUnsavedChanges()).toBe(false);
    });

    it("tracks a tab's dirty state only while the tab is mounted", () => {
        const { state, wrapper } = mountDirtyTab();

        expect(hasUnsavedChanges()).toBe(false);
        state.value = 2;
        expect(hasUnsavedChanges()).toBe(true);

        wrapper.unmount();
        expect(hasUnsavedChanges()).toBe(false);
    });

    it("does not register a dirty state created outside a component", () => {
        const state = reactive({ value: 1 });
        const { markClean } = useDirtyState(() => JSON.stringify(state));
        markClean();
        state.value = 2;

        expect(hasUnsavedChanges()).toBe(false);
    });

    it("proceeds without asking when nothing is unsaved", () => {
        const proceed = vi.fn();

        confirmDiscardUnsavedChanges(proceed);

        expect(proceed).toHaveBeenCalledOnce();
        expect(useDialogStore(pinia).activeDialog).toBeNull();
    });

    it("asks first, and only proceeds when the user discards", () => {
        const unregister = registerUnsavedChanges(() => true);
        const proceed = vi.fn();
        const dialogStore = useDialogStore(pinia);

        confirmDiscardUnsavedChanges(proceed);
        expect(proceed).not.toHaveBeenCalled();
        expect(dialogStore.activeDialog?.type).toBe("YesNoDialog");

        (dialogStore.activeDialog?.listeners.no as () => void)();
        expect(proceed).not.toHaveBeenCalled();
        expect(dialogStore.activeDialog).toBeNull();

        confirmDiscardUnsavedChanges(proceed);
        (dialogStore.activeDialog?.listeners.yes as () => void)();
        expect(proceed).toHaveBeenCalledOnce();
        expect(dialogStore.activeDialog).toBeNull();

        unregister();
    });
});
