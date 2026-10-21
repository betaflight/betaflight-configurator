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
import { i18n } from "./localization";

/** Returns true while the source holds edits that have not been written to the FC. */
export type UnsavedChangesSource = () => boolean;

/** The active tab's Save action: the same one its Save button runs. It may return a promise. */
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
 * Runs the tab's Save, then leaves. A save that fails, or one the user cancels part-way (a port
 * conflict prompt, say), leaves the tab dirty, so the user stays on it with the edits intact —
 * runSave has already reported the failure. A save that reboots the FC drops the connection;
 * the target tab is then opened once the FC reconnects.
 */
async function saveThenLeave(save: TabSaveAction, targetTab: string, proceed: () => void): Promise<void> {
    try {
        await save();
    } catch (error) {
        console.error("Save before leaving the tab failed:", error);
        return;
    }
    if (getConnectionState().isRebootWindowOpen || !useConnectionStore(pinia).connectionValid) {
        useNavigationStore(pinia).tabAfterReconnect = targetTab;
        return;
    }
    if (!hasUnsavedChanges()) {
        proceed();
    }
}

/**
 * Runs `proceed` straight away when nothing is unsaved; otherwise asks first. The user can save
 * and then leave, leave without saving, or stay. Used for user-driven navigation away from a tab.
 *
 * Leaving without saving only navigates: it does not revert anything a tab has already sent to
 * the FC's RAM (a PID profile switch, reset or copy), so the prompt says "not saved" rather than
 * "discard".
 * @param targetTab the tab `proceed` opens, kept so a save that reboots can still reach it
 */
export function confirmLeaveTab(targetTab: string, proceed: () => void): void {
    if (!hasUnsavedChanges()) {
        proceed();
        return;
    }
    const save = tabSave;
    const dialogStore = useDialogStore(pinia);
    dialogStore.open(
        "UnsavedChangesDialog",
        {
            title: i18n.getMessage("unsavedChangesTitle"),
            text: i18n.getMessage("unsavedChangesText"),
            saveText: i18n.getMessage("unsavedChangesSave"),
            leaveText: i18n.getMessage("unsavedChangesLeave"),
            stayText: i18n.getMessage("unsavedChangesStay"),
            canSave: save !== null,
        },
        {
            save: () => {
                dialogStore.close();
                if (save) {
                    void saveThenLeave(save, targetTab, proceed);
                }
            },
            leave: () => {
                dialogStore.close();
                proceed();
            },
            stay: () => dialogStore.close(),
        },
    );
}
