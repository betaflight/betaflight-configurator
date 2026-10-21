/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { pinia } from "../../src/js/pinia_instance";
import { useDialogStore } from "../../src/stores/dialog";
import { useDirtyState } from "../../src/composables/useDirtyState";
import { useConnectionStore } from "../../src/stores/connection";
import { useNavigationStore } from "../../src/stores/navigation";
import { getConnectionState } from "../../src/js/connection_state";
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
function mountSavingTab(save: () => Promise<unknown>) {
    const mounted = mountDirtyTab(save);
    return mounted;
}

/** A tab-like component whose dirty flag is driven from the test. */
function mountDirtyTab(save?: () => Promise<unknown>) {
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
        expect(navigationStore.tabAfterReconnect).toEqual({ tab: "ports", mode: "connected" });
        navigationStore.tabAfterReconnect = null;
        wrapper.unmount();
    });

    it("keeps the sidebar mode of the target for after the reconnect", async () => {
        const connectionStore = useConnectionStore(pinia);
        const navigationStore = useNavigationStore(pinia);
        const { state, wrapper } = mountSavingTab(async () => {
            connectionStore.connectionValid = false;
        });
        state.value = 2;

        confirmLeaveTab({ tab: "user_profile", mode: "loggedin" }, vi.fn());
        listener("save")();
        await flushPromises();

        expect(navigationStore.tabAfterReconnect).toEqual({ tab: "user_profile", mode: "loggedin" });
        navigationStore.tabAfterReconnect = null;
        wrapper.unmount();
    });

    it("stays on the tab when the save reports failure, even if it looks clean", async () => {
        const { state, tracker, wrapper } = mountSavingTab(async () => {
            tracker.markClean();
            return false;
        });
        state.value = 2;
        const proceed = vi.fn();

        confirmLeaveTab("ports", proceed);
        listener("save")();
        await flushPromises();

        expect(proceed).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it("does not queue a reconnect target when a save fails and drops the link", async () => {
        const connectionStore = useConnectionStore(pinia);
        const navigationStore = useNavigationStore(pinia);
        const { state, wrapper } = mountSavingTab(async () => {
            connectionStore.connectionValid = false;
            return false;
        });
        state.value = 2;

        confirmLeaveTab("ports", vi.fn());
        listener("save")();
        await flushPromises();

        expect(navigationStore.tabAfterReconnect).toBeNull();
        wrapper.unmount();
    });

    it("still queues the reconnect target when a save and reboot reports its own cancellation", async () => {
        const connectionStore = useConnectionStore(pinia);
        const navigationStore = useNavigationStore(pinia);
        const rebootWindow = vi.spyOn(getConnectionState(), "isRebootWindowOpen", "get").mockReturnValue(true);
        const { state, wrapper } = mountSavingTab(async () => {
            connectionStore.connectionValid = false;
            return false;
        });
        state.value = 2;

        confirmLeaveTab("ports", vi.fn());
        listener("save")();
        await flushPromises();

        expect(navigationStore.tabAfterReconnect).toEqual({ tab: "ports", mode: "connected" });
        navigationStore.tabAfterReconnect = null;
        rebootWindow.mockRestore();
        wrapper.unmount();
    });
});
