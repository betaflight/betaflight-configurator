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

import type { RadioGroupItem, RadioGroupValue } from "@nuxt/ui";
import { useDialogStore } from "@/stores/dialog";

/** A dialog button handler; callers pass null or omit it when the button only closes. */
type DialogCallback = (() => void) | null | undefined;

// `never[]` lets a listener declare whatever payload its dialog emits.
type DialogListener = (...args: never[]) => unknown;

export interface YesNoOptions {
    yesText?: string;
    noText?: string;
    destructive?: boolean;
}

export interface InfoOptions {
    confirmText?: string;
}

export interface WaitOptions {
    cancelText?: string;
    showCancel?: boolean;
}

export interface CopyProfileOptions {
    profileText?: string;
    rateProfileText?: string;
    confirmText?: string;
    cancelText?: string;
}

export interface CopyProfileOption {
    label: string;
    value: number;
}

/** What CopyProfileDialog confirms with; null for a list that offered nothing. */
export interface CopyProfileSelection {
    profile: number | null;
    rateProfile: number | null;
}

export interface WaitHandle {
    close: () => void;
}

export function useDialog() {
    const store = useDialogStore();

    const openYesNo = (
        title: string,
        text: string,
        onYes?: DialogCallback,
        onNo?: DialogCallback,
        options: YesNoOptions = {},
    ) => {
        store.open(
            "YesNoDialog",
            {
                title,
                text,
                yesText: options.yesText || "Yes",
                noText: options.noText || "No",
                ...options,
            },
            {
                yes: () => {
                    store.close();
                    if (onYes) {
                        onYes();
                    }
                },
                no: () => {
                    store.close();
                    if (onNo) {
                        onNo();
                    }
                },
            },
        );
    };

    const openInfo = (title: string, text: string, onConfirm?: DialogCallback, options: InfoOptions = {}) => {
        store.open(
            "InformationDialog",
            {
                title,
                text,
                confirmText: options.confirmText || "OK",
                ...options,
            },
            {
                confirm: () => {
                    store.close();
                    if (onConfirm) {
                        onConfirm();
                    }
                },
            },
        );
    };

    const openWait = (title: string, onCancel?: DialogCallback, options: WaitOptions = {}) => {
        store.open(
            "WaitDialog",
            {
                title,
                showCancel: !!onCancel,
                cancelText: options.cancelText || "Cancel",
                ...options,
            },
            {
                cancel: () => {
                    store.close();
                    if (onCancel) {
                        onCancel();
                    }
                },
            },
        );
    };

    const openProfileSelection = (
        title: string,
        message: string,
        options: RadioGroupItem[],
        onConfirm?: ((selectedValue: RadioGroupValue | null) => void) | null,
        onCancel?: DialogCallback,
        confirmText = "OK",
        cancelText = "Cancel",
    ) => {
        store.open(
            "ProfileSelectionDialog",
            {
                title,
                message,
                options,
                confirmText,
                cancelText,
            },
            {
                confirm: (selectedValue: RadioGroupValue | null) => {
                    store.close();
                    if (onConfirm) {
                        onConfirm(selectedValue);
                    }
                },
                cancel: () => {
                    store.close();
                    if (onCancel) {
                        onCancel();
                    }
                },
            },
        );
    };

    const openCopyProfile = (
        title: string,
        note: string,
        profileOptions: CopyProfileOption[],
        rateOptions: CopyProfileOption[],
        onConfirm?: ((selected: CopyProfileSelection) => void) | null,
        onCancel?: DialogCallback,
        options: CopyProfileOptions = {},
    ) => {
        store.open(
            "CopyProfileDialog",
            {
                title,
                note,
                profileOptions,
                rateOptions,
                ...options,
            },
            {
                confirm: (selected: CopyProfileSelection) => {
                    store.close();
                    if (onConfirm) {
                        onConfirm(selected);
                    }
                },
                cancel: () => {
                    store.close();
                    if (onCancel) {
                        onCancel();
                    }
                },
            },
        );
    };

    /**
     * Promise-based yes/no dialog — resolves true (yes) or false (no).
     */
    const showYesNo = (title: string, text: string, options: YesNoOptions = {}): Promise<boolean> => {
        return new Promise((resolve) => {
            openYesNo(
                title,
                text,
                () => resolve(true),
                () => resolve(false),
                options,
            );
        });
    };

    /**
     * Promise-based information dialog — resolves when confirmed.
     */
    const showInfo = (title: string, text: string, options: InfoOptions = {}): Promise<void> => {
        return new Promise((resolve) => {
            openInfo(title, text, () => resolve(), options);
        });
    };

    /**
     * Opens a wait dialog and returns a close function.
     */
    const showWait = (title: string, onCancel?: DialogCallback, options: WaitOptions = {}): WaitHandle => {
        openWait(title, onCancel, options);
        return { close: () => store.close() };
    };

    const close = () => {
        store.close();
    };

    /** Open any dialog component by name, for the ones without a dedicated helper above. */
    const open = (
        type: string,
        props: Record<string, unknown> = {},
        listeners: Record<string, DialogListener> = {},
    ) => {
        store.open(type, props, listeners);
    };

    return {
        openYesNo,
        openInfo,
        openWait,
        openProfileSelection,
        openCopyProfile,
        showYesNo,
        showInfo,
        showWait,
        close,
        open,
    };
}
