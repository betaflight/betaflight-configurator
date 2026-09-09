import "../../libraries/flightindicators.css";

import "../css/theme.css";
import "../css/main.less";
import "../css/opensans_webfontkit/fonts.css";
import "../components/MotorOutputReordering/Styles.css";
import "../components/EscDshotDirection/Styles.css";
import "../css/dark-theme.less";
import "./main";

import { i18n } from "./localization";
import { pinia } from "./pinia_instance";
import { useDialogStore } from "../stores/dialog";
import { registerSW } from "virtual:pwa-register";
import { isPwaContext } from "./utils/checkCompatibility.js";

if (isPwaContext()) {
    const dialogStore = useDialogStore(pinia);
    const updateSW = registerSW({
        onNeedRefresh() {
            console.log("Detected onNeedRefresh");
            dialogStore.open(
                "YesNoDialog",
                {
                    title: i18n.getMessage("pwaOnNeedRefreshTitle"),
                    text: i18n.getMessage("pwaOnNeedRefreshText"),
                    yesText: i18n.getMessage("yes"),
                    noText: i18n.getMessage("no"),
                },
                {
                    yes: () => {
                        dialogStore.close();
                        updateSW();
                    },
                    no: () => dialogStore.close(),
                },
            );
        },
        onOfflineReady() {
            console.log("Detected onOfflineReady");
            dialogStore.open(
                "InformationDialog",
                {
                    title: i18n.getMessage("pwaOnOfflineReadyTitle"),
                    text: i18n.getMessage("pwaOnOfflineReadyText"),
                    confirmText: i18n.getMessage("OK"),
                },
                { confirm: () => dialogStore.close() },
            );
        },
    });
}
