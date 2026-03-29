import { useDialogStore } from "@/stores/dialog";

export function useDialog() {
    const store = useDialogStore();

    const openYesNo = (title, text, onYes, onNo, options = {}) => {
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

    const openInfo = (title, text, onConfirm, options = {}) => {
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

    const openWait = (title, onCancel, options = {}) => {
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
        title,
        message,
        options,
        onConfirm,
        onCancel,
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
                confirm: (selectedValue) => {
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

    const openCopyProfile = (title, note, profileOptions, rateOptions, onConfirm, onCancel, options = {}) => {
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
                confirm: (selected) => {
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
    const showYesNo = (title, text, options = {}) => {
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
    const showInfo = (title, text, options = {}) => {
        return new Promise((resolve) => {
            openInfo(title, text, () => resolve(), options);
        });
    };

    /**
     * Opens a wait dialog and returns a close function.
     */
    const showWait = (title, onCancel, options = {}) => {
        openWait(title, onCancel, options);
        return { close: () => store.close() };
    };

    const close = () => {
        store.close();
    };

    const open = (type, props = {}, listeners = {}) => {
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
