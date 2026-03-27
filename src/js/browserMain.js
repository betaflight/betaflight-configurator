import "../../libraries/flightindicators.css";

import "../css/theme.css";
import "../css/main.less";
import "../css/tabs/help.less";
import "../css/tabs/ports.less";
import "../css/tabs/configuration.less";
import "../css/tabs/servos.less";
import "../css/tabs/gps.less";
import "../css/tabs/logging.less";
import "../css/tabs/onboard_logging.less";
import "../css/tabs/auxiliary.less";
import "../css/tabs/failsafe.less";
import "../css/tabs/transponder.less";
import "../css/tabs/options.less";
import "../css/tabs/aerotune.less";
import "../css/opensans_webfontkit/fonts.css";
import "switchery-latest/dist/switchery.min.css";
import "../css/switchery_custom.less";
import "@fortawesome/fontawesome-free/css/all.css";
import "../components/MotorOutputReordering/Styles.css";
import "../components/EscDshotDirection/Styles.css";
import "../css/dark-theme.less";
import "./main";

import GUI from "./gui";
import { i18n } from "./localization";
import { Workbox } from "workbox-window";
import { isAndroid } from "./utils/checkCompatibility.js";
import { createApp } from "vue";
import { pinia } from "./pinia_instance";
import GlobalDialogs from "@/components/dialogs/GlobalDialogs.vue";

// Mount Global Dialogs App
const dialogApp = createApp(GlobalDialogs);
dialogApp.use(pinia);
dialogApp.mount("#dialog-container");

// Skip PWA update/offline prompts on Android native builds where they are unnecessary
if (!isAndroid() && "serviceWorker" in navigator) {
    // Use workbox-window directly so we can attach waiting + externalwaiting,
    // wire controlling → reload, and run a periodic update poll.
    // BASE_URL resolves correctly for both dev (/) and the gh-pages deploy (/betaflight-configurator/).
    const wb = new Workbox(`${import.meta.env.BASE_URL}sw.js`);

    // Guard against showing the dialog twice (e.g. waiting fires then externalwaiting fires).
    let updatePromptShown = false;

    const showUpdatePrompt = () => {
        if (updatePromptShown) return;
        updatePromptShown = true;
        console.log("PWA: new service worker waiting — prompting user to update");
        GUI.showYesNoDialog({
            title: i18n.getMessage("pwaOnNeedRefreshTitle"),
            text: i18n.getMessage("pwaOnNeedRefreshText"),
            buttonYesText: i18n.getMessage("yes"),
            buttonNoText: i18n.getMessage("no"),
            buttonYesCallback: () => {
                // Tell the waiting SW to skip waiting, then reload once it takes control.
                wb.addEventListener("controlling", () => window.location.reload());
                wb.messageSkipWaiting();
            },
            buttonNoCallback: () => {
                // Allow the prompt to reappear next time a new SW is detected.
                updatePromptShown = false;
            },
        });
    };

    // waiting  — a new SW installed and is queued behind the current one.
    // externalwaiting — the same situation but triggered from another tab.
    // Both must be wired to catch every real-world update path.
    wb.addEventListener("waiting", showUpdatePrompt);
    wb.addEventListener("externalwaiting", showUpdatePrompt);

    // First-install path: SW activates with no predecessor → app is now offline-ready.
    wb.addEventListener("activated", (event) => {
        if (!event.isUpdate) {
            console.log("PWA: service worker activated for the first time — app is offline-ready");
            GUI.showInformationDialog({
                title: i18n.getMessage("pwaOnOffilenReadyTitle"),
                text: i18n.getMessage("pwaOnOffilenReadyText"),
                buttonConfirmText: i18n.getMessage("OK"),
            });
        }
    });

    await wb.register();
    // GitHub Pages cannot set Cache-Control: no-cache on sw.js, so the browser
    // may serve a stale copy.  Calling wb.update() forces an unconditional network
    // fetch and byte-for-byte diff — the most reliable client-side workaround.
    setInterval(() => wb.update(), 60 * 60 * 1000);
}
