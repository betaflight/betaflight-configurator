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

import { getCurrentInstance, onScopeDispose } from "vue";
import { useDialogStore } from "../stores/dialog";
import { useConnectionStore } from "../stores/connection";
import { useNavigationStore } from "../stores/navigation";
import { getConnectionState } from "./connection_state";
import { pinia } from "./pinia_instance";

/** Returns true while the source holds edits that have not been written to the FC. */
export type UnsavedChangesSource = () => boolean;

/**
 * The active tab's Save action: the same one its Save button runs. It may return a promise; one
 * that resolves false (as runSave does on failure) keeps the user on the tab.
 */
export type TabSaveAction = () => unknown;

const sources = new Set<UnsavedChangesSource>();

let tabSave: TabSaveAction | null = null;

/**
 * Registers a source of unsaved edits for the active tab.
 * @returns a function that removes the source again
 */
export function registerUnsavedChanges(source: UnsavedChangesSource): () => void {
    sources.add(source);
    return () => {
        sources.delete(source);
    };
}

/**
 * Registers a source for the lifetime of the calling component. Outside a component (e.g.
 * inside a Pinia store, which outlives every tab) this is a no-op: a store's dirty flag must
 * be registered by the tab that shows it, or it would keep warning after the tab is gone.
 */
export function registerUnsavedChangesForComponent(source: UnsavedChangesSource): void {
    if (!getCurrentInstance()) {
        return;
    }
    const unregister = registerUnsavedChanges(source);
    onScopeDispose(unregister);
}

/**
 * Registers the calling tab's Save action for the lifetime of the component, so the prompt can
 * offer "Save changes". A tab that registers none still gets the prompt, without that button.
 *
 * There is a single global slot, so the last component to call this wins. Call it from the tab
 * component itself, never from a sub-component, which would silently replace the tab's Save.
 */
export function registerTabSave(save: TabSaveAction): void {
    if (!getCurrentInstance()) {
        return;
    }
    tabSave = save;
    onScopeDispose(() => {
        if (tabSave === save) {
            tabSave = null;
        }
    });
}

export function hasUnsavedChanges(): boolean {
    for (const source of sources) {
        if (source()) {
            return true;
        }
    }
    return false;
}

/**
 * Runs the tab's Save and reports whether the user can now leave. A save that fails, or one the
 * user cancels part-way (a port conflict prompt, say), keeps the user on the tab with the edits
 * intact — runSave has already reported the failure. A save that reboots the FC drops the
 * connection; the target tab is then opened once the FC reconnects.
 */
async function saveThenLeave(save: TabSaveAction, tab: string, mode: string): Promise<boolean> {
    let result: unknown;
    try {
        result = await save();
    } catch (error) {
        console.error("Save before leaving the tab failed:", error);
        return false;
    }
    // A save that reboots the FC cancels its own in-flight MSP request, so runSave resolves false
    // even though the save went through. Inside the reboot window that false is expected; outside
    // it a false is a real failure (or a cancel), and the user stays on the tab. Checked as well as
    // the dirty state, because some steps mark their part clean before the EEPROM write (a port
    // assignment, say), so a save that fails at the last step can leave the tab looking clean.
    const rebooting = getConnectionState().isRebootWindowOpen;
    if (result === false && !rebooting) {
        return false;
    }
    if (rebooting || !useConnectionStore(pinia).connectionValid) {
        useNavigationStore(pinia).tabAfterReconnect = { tab, mode };
        return false;
    }
    return !hasUnsavedChanges();
}

/**
 * Resolves true straight away when nothing is unsaved; otherwise asks first. The user can save
 * and then leave, leave without saving, or stay. Used for user-driven navigation away from a tab
 * (see navigateToTab).
 *
 * Leaving without saving only navigates: it does not revert anything a tab has already sent to
 * the FC's RAM (a PID profile switch, reset or copy), so the prompt says "not saved" rather than
 * "discard".
 * @param tab the tab the user is heading for, and `mode` its sidebar mode: both are kept so a save
 * that reboots can still reach it once the FC reconnects
 * @returns true when the caller should go on to open the tab now
 */
export function confirmLeaveTab(tab: string, mode = "connected"): Promise<boolean> {
    if (!hasUnsavedChanges()) {
        return Promise.resolve(true);
    }
    const save = tabSave;
    const dialogStore = useDialogStore(pinia);
    return new Promise((resolve) => {
        dialogStore.open(
            "UnsavedChangesDialog",
            { canSave: save !== null },
            {
                save: () => {
                    dialogStore.close();
                    if (save) {
                        void saveThenLeave(save, tab, mode).then(resolve);
                    } else {
                        resolve(false);
                    }
                },
                leave: () => {
                    dialogStore.close();
                    resolve(true);
                },
                stay: () => {
                    dialogStore.close();
                    resolve(false);
                },
            },
        );
    });
}
