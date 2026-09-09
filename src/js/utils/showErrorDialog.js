import { useDialogStore } from "../../stores/dialog";
import { pinia } from "../pinia_instance";
import { i18n } from "../localization";

export function showErrorDialog(message) {
    const dialogStore = useDialogStore(pinia);
    dialogStore.open(
        "InformationDialog",
        {
            title: i18n.getMessage("errorTitle"),
            text: message,
            confirmText: i18n.getMessage("close"),
        },
        {
            confirm: () => dialogStore.close(),
        },
    );
}
