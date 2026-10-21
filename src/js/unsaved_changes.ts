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
import { pinia } from "./pinia_instance";
import { i18n } from "./localization";

/** Returns true while the source holds edits that have not been written to the FC. */
export type UnsavedChangesSource = () => boolean;

const sources = new Set<UnsavedChangesSource>();

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

export function hasUnsavedChanges(): boolean {
    for (const source of sources) {
        if (source()) {
            return true;
        }
    }
    return false;
}

/**
 * Runs `proceed` straight away when nothing is unsaved; otherwise asks first and runs it only
 * when the user chooses to discard the edits. Used for user-driven navigation away from a tab.
 */
export function confirmDiscardUnsavedChanges(proceed: () => void): void {
    if (!hasUnsavedChanges()) {
        proceed();
        return;
    }
    const dialogStore = useDialogStore(pinia);
    dialogStore.open(
        "YesNoDialog",
        {
            title: i18n.getMessage("unsavedChangesTitle"),
            text: i18n.getMessage("unsavedChangesText"),
            yesText: i18n.getMessage("unsavedChangesDiscard"),
            noText: i18n.getMessage("unsavedChangesStay"),
            destructive: true,
        },
        {
            yes: () => {
                dialogStore.close();
                proceed();
            },
            no: () => dialogStore.close(),
        },
    );
}
