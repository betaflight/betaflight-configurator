import "../js/jqueryPlugins";
import "jbox/dist/jBox.min.css";
import "../../libraries/jquery.nouislider.min.css";
import "../../libraries/jquery.nouislider.pips.min.css";
import "../../libraries/flightindicators.css";

import "../css/theme.css";
import "../css/main.less";
import "../css/tabs/static_tab.less";
import "../css/tabs/landing.less";
import "../css/tabs/setup.less";
import "../css/tabs/help.less";
import "../css/tabs/ports.less";
import "../css/tabs/configuration.less";
import "../css/tabs/pid_tuning.less";
import "../css/tabs/receiver.less";
import "../css/tabs/servos.less";
import "../css/tabs/gps.less";
import "../css/tabs/motors.less";
import "../css/tabs/led_strip.less";
import "../css/tabs/sensors.less";
import "../css/tabs/cli.less";
import "../tabs/presets/presets.less";
import "../tabs/presets/TitlePanel/PresetTitlePanel.css";
import "../tabs/presets/DetailedDialog/PresetsDetailedDialog.less";
import "../tabs/presets/SourcesDialog/SourcesDialog.css";
import "../tabs/presets/SourcesDialog/SourcePanel.css";
import "../css/tabs/logging.less";
import "../css/tabs/onboard_logging.less";
import "../css/tabs/firmware_flasher.less";
import "../css/tabs/adjustments.less";
import "../css/tabs/auxiliary.less";
import "../css/tabs/failsafe.less";
import "../css/tabs/osd.less";
import "../css/tabs/vtx.less";
import "../css/tabs/power.less";
import "../css/tabs/transponder.less";
import "../css/tabs/privacy_policy.less";
import "../css/tabs/options.less";
import "../css/opensans_webfontkit/fonts.css";
import "switchery-latest/dist/switchery.min.css";
import "../css/switchery_custom.less";
import "@fortawesome/fontawesome-free/css/all.css";
import "../components/MotorOutputReordering/Styles.css";
import "../css/select2_custom.less";
import "select2/dist/css/select2.min.css";
import "multiple-select/dist/multiple-select.min.css";
import "../components/EscDshotDirection/Styles.css";
import "../css/dark-theme.less";
import "./main";

import GUI from "./gui";
import { registerSW } from "virtual:pwa-register";

const updateSW = registerSW({
    onNeedRefresh() {
        console.log("Detected onNeedRefresh");
        GUI.showYesNoDialog({
            title: i18n.getMessage("pwaOnNeedRefreshTitle"),
            text: i18n.getMessage("pwaOnNeedRefreshText"),
            buttonYesText: i18n.getMessage("yes"),
            buttonNoText: i18n.getMessage("no"),
            buttonYesCallback: () => updateSW(),
            buttonNoCallback: null,
        });
    },
    onOfflineReady() {
        console.log("Detected onOfflineReady");
        GUI.showInformationDialog({
            title: i18n.getMessage("pwaOnOffilenReadyTitle"),
            text: i18n.getMessage("pwaOnOffilenReadyText"),
            buttonConfirmText: i18n.getMessage("OK"),
        });
    },
});
