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
                    if (onYes) onYes();
                    store.close();
                },
                no: () => {
                    if (onNo) onNo();
                    store.close();
                },
            },
        );
    };

    const close = () => {
        store.close();
    };

    return {
        openYesNo,
        close,
    };
}
