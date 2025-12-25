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
                    if (onYes) onYes();
                },
                no: () => {
                    store.close();
                    if (onNo) onNo();
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
                    if (onConfirm) onConfirm();
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
                    if (onCancel) onCancel();
                },
            },
        );
    };

    const close = () => {
        store.close();
    };

    return {
        openYesNo,
        openInfo,
        openWait,
        close,
    };
}
