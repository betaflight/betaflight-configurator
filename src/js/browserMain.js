import "../../libraries/flightindicators.css";

import "../css/theme.css";
import "../css/main.less";
import "../css/opensans_webfontkit/fonts.css";
import "switchery-latest/dist/switchery.min.css";
import "../css/switchery_custom.less";
import "@fortawesome/fontawesome-free/css/all.css";
import "../components/MotorOutputReordering/Styles.css";
import "../components/EscDshotDirection/Styles.css";
import "../css/dark-theme.less";
import "./main";

import { registerSW } from "virtual:pwa-register";
import { isAndroid } from "./utils/checkCompatibility.js";
import { createApp } from "vue";
import { pinia } from "./pinia_instance";
import { useDialogStore } from "../stores/dialog";
import { i18n } from "./localization";
import GlobalDialogs from "@/components/dialogs/GlobalDialogs.vue";

// Mount Global Dialogs App
const dialogApp = createApp(GlobalDialogs);
dialogApp.use(pinia);
dialogApp.mount("#dialog-container");

// Skip PWA update/offline prompts on Android native builds where they are unnecessary
if (!isAndroid()) {
    const dialogStore = useDialogStore();
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
                    title: i18n.getMessage("pwaOnOffilenReadyTitle"),
                    text: i18n.getMessage("pwaOnOffilenReadyText"),
                    confirmText: i18n.getMessage("OK"),
                },
                { confirm: () => dialogStore.close() },
            );
        },
    });
}
