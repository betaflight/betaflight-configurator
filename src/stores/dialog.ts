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

import { defineStore } from "pinia";
import { ref } from "vue";

/** Component names GlobalDialogs.vue can render. */
export type DialogType =
    | "YesNoDialog"
    | "UnsavedChangesDialog"
    | "InformationDialog"
    | "WaitDialog"
    | "RebootDialog"
    | "EscDshotDirectionDialog"
    | "MotorOutputReorderingDialog"
    | "ProfileSelectionDialog"
    | "RatesTypeDialog"
    | "CopyProfileDialog"
    | "ReportProblemsDialog"
    | "InteractiveDialog"
    | "BoardAlignmentWizardDialog";

export type DialogProps = Record<string, unknown>;

// `never[]` lets a listener declare whatever payload its dialog emits.
export type DialogListener = (...args: never[]) => unknown;

/** Keyed by emitted event name (e.g. `yes`), bound with `v-on`. */
export type DialogListeners = Record<string, DialogListener>;

export interface ActiveDialog {
    id: number;
    type: DialogType;
    props: DialogProps;
    listeners: DialogListeners;
}

export const useDialogStore = defineStore("dialog", () => {
    const activeDialog = ref<ActiveDialog | null>(null);

    function open(type: DialogType, props: DialogProps = {}, listeners: DialogListeners = {}): void {
        activeDialog.value = {
            id: Date.now(), // specific ID if we want to track stack later
            type,
            props,
            listeners,
        };
    }

    function close(): void {
        activeDialog.value = null;
    }

    function updateProps(newProps: DialogProps): void {
        if (activeDialog.value) {
            activeDialog.value.props = { ...activeDialog.value.props, ...newProps };
        }
    }

    return {
        activeDialog,
        open,
        close,
        updateProps,
    };
});
