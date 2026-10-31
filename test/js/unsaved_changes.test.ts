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
import { mount } from "@vue/test-utils";
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

    it("lets the user leave without asking when nothing is unsaved", async () => {
        await expect(confirmLeaveTab("ports")).resolves.toBe(true);
        expect(useDialogStore(pinia).activeDialog).toBeNull();
    });

    it("asks first; Stay keeps the tab and Leave lets the user go", async () => {
        const unregister = registerUnsavedChanges(() => true);
        const dialogStore = useDialogStore(pinia);

        const stayed = confirmLeaveTab("ports");
        expect(dialogStore.activeDialog?.type).toBe("UnsavedChangesDialog");
        expect(dialogStore.activeDialog?.props).toEqual({ canSave: false });

        listener("stay")();
        await expect(stayed).resolves.toBe(false);
        expect(dialogStore.activeDialog).toBeNull();

        const left = confirmLeaveTab("ports");
        listener("leave")();
        await expect(left).resolves.toBe(true);
        expect(dialogStore.activeDialog).toBeNull();

        unregister();
    });

    it("saves and then leaves once the tab is clean", async () => {
        const { state, tracker, wrapper } = mountDirtyTab(async () => tracker.markClean());
        state.value = 2;

        const leaving = confirmLeaveTab("ports");
        expect(useDialogStore(pinia).activeDialog?.props.canSave).toBe(true);
        listener("save")();

        await expect(leaving).resolves.toBe(true);
        wrapper.unmount();
    });

    it("stays on the tab when the save leaves it dirty", async () => {
        const { state, wrapper } = mountDirtyTab(async () => {});
        state.value = 2;

        const leaving = confirmLeaveTab("ports");
        listener("save")();

        await expect(leaving).resolves.toBe(false);
        wrapper.unmount();
    });

    it.each([
        { tab: "ports", mode: undefined, expected: { tab: "ports", mode: "connected" } },
        { tab: "user_profile", mode: "loggedin", expected: { tab: "user_profile", mode: "loggedin" } },
    ])("opens $tab ($expected.mode) after reconnecting when the save reboots", async ({ tab, mode, expected }) => {
        const connectionStore = useConnectionStore(pinia);
        const navigationStore = useNavigationStore(pinia);
        const { state, wrapper } = mountDirtyTab(async () => {
            connectionStore.connectionValid = false;
        });
        state.value = 2;

        const leaving = confirmLeaveTab(tab, mode);
        listener("save")();

        await expect(leaving).resolves.toBe(false);
        expect(navigationStore.tabAfterReconnect).toEqual(expected);
        navigationStore.tabAfterReconnect = null;
        wrapper.unmount();
    });

    it("stays on the tab when the save reports failure, even if it looks clean", async () => {
        const { state, tracker, wrapper } = mountDirtyTab(async () => {
            tracker.markClean();
            return false;
        });
        state.value = 2;

        const leaving = confirmLeaveTab("ports");
        listener("save")();

        await expect(leaving).resolves.toBe(false);
        wrapper.unmount();
    });

    it("does not queue a reconnect target when a save fails and drops the link", async () => {
        const connectionStore = useConnectionStore(pinia);
        const navigationStore = useNavigationStore(pinia);
        const { state, wrapper } = mountDirtyTab(async () => {
            connectionStore.connectionValid = false;
            return false;
        });
        state.value = 2;

        const leaving = confirmLeaveTab("ports");
        listener("save")();
        await expect(leaving).resolves.toBe(false);

        expect(navigationStore.tabAfterReconnect).toBeNull();
        wrapper.unmount();
    });

    it("still queues the reconnect target when a save and reboot reports its own cancellation", async () => {
        const connectionStore = useConnectionStore(pinia);
        const navigationStore = useNavigationStore(pinia);
        const rebootWindow = vi.spyOn(getConnectionState(), "isRebootWindowOpen", "get").mockReturnValue(true);
        const { state, wrapper } = mountDirtyTab(async () => {
            connectionStore.connectionValid = false;
            return false;
        });
        state.value = 2;

        const leaving = confirmLeaveTab("ports");
        listener("save")();
        await expect(leaving).resolves.toBe(false);

        expect(navigationStore.tabAfterReconnect).toEqual({ tab: "ports", mode: "connected" });
        navigationStore.tabAfterReconnect = null;
        rebootWindow.mockRestore();
        wrapper.unmount();
    });
});
