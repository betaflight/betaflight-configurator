import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { pinia } from "../../src/js/pinia_instance";
import { useDialogStore } from "../../src/stores/dialog";
import { useDirtyState } from "../../src/composables/useDirtyState";
import { useConnectionStore } from "../../src/stores/connection";
import { useNavigationStore } from "../../src/stores/navigation";
import {
    confirmLeaveTab,
    hasUnsavedChanges,
    registerTabSave,
    registerUnsavedChanges,
} from "../../src/js/unsaved_changes";

function listener(name: string): () => void {
    return useDialogStore(pinia).activeDialog?.listeners[name] as () => void;
}

/** A tab with a dirty flag and a registered Save action. */
function mountSavingTab(save: () => Promise<void>) {
    const mounted = mountDirtyTab(save);
    return mounted;
}

/** A tab-like component whose dirty flag is driven from the test. */
function mountDirtyTab(save?: () => Promise<void>) {
    const state = reactive({ value: 1 });
    let tracker!: ReturnType<typeof useDirtyState>;
    const wrapper = mount(
        defineComponent({
            setup() {
                tracker = useDirtyState(() => JSON.stringify(state));
                tracker.markClean();
                if (save) {
                    registerTabSave(save);
                }
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
        useConnectionStore(pinia).connectionValid = true;
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

        confirmLeaveTab("ports", proceed);

        expect(proceed).toHaveBeenCalledOnce();
        expect(useDialogStore(pinia).activeDialog).toBeNull();
    });

    it("asks first; Stay keeps the tab and Leave proceeds", () => {
        const unregister = registerUnsavedChanges(() => true);
        const proceed = vi.fn();
        const dialogStore = useDialogStore(pinia);

        confirmLeaveTab("ports", proceed);
        expect(proceed).not.toHaveBeenCalled();
        expect(dialogStore.activeDialog?.type).toBe("UnsavedChangesDialog");
        expect(dialogStore.activeDialog?.props.canSave).toBe(false);

        listener("stay")();
        expect(proceed).not.toHaveBeenCalled();
        expect(dialogStore.activeDialog).toBeNull();

        confirmLeaveTab("ports", proceed);
        listener("leave")();
        expect(proceed).toHaveBeenCalledOnce();
        expect(dialogStore.activeDialog).toBeNull();

        unregister();
    });

    it("saves and then leaves once the tab is clean", async () => {
        const { state, tracker, wrapper } = mountSavingTab(async () => tracker.markClean());
        state.value = 2;
        const proceed = vi.fn();

        confirmLeaveTab("ports", proceed);
        expect(useDialogStore(pinia).activeDialog?.props.canSave).toBe(true);
        listener("save")();
        await flushPromises();

        expect(proceed).toHaveBeenCalledOnce();
        wrapper.unmount();
    });

    it("stays on the tab when the save leaves it dirty", async () => {
        const { state, wrapper } = mountSavingTab(async () => {});
        state.value = 2;
        const proceed = vi.fn();

        confirmLeaveTab("ports", proceed);
        listener("save")();
        await flushPromises();

        expect(proceed).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it("opens the target tab after reconnecting when the save reboots", async () => {
        const connectionStore = useConnectionStore(pinia);
        const navigationStore = useNavigationStore(pinia);
        const { state, wrapper } = mountSavingTab(async () => {
            connectionStore.connectionValid = false;
        });
        state.value = 2;
        const proceed = vi.fn();

        confirmLeaveTab("ports", proceed);
        listener("save")();
        await flushPromises();

        expect(proceed).not.toHaveBeenCalled();
        expect(navigationStore.tabAfterReconnect).toBe("ports");
        navigationStore.tabAfterReconnect = null;
        wrapper.unmount();
    });
});
