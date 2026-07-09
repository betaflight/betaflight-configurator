import BatteryLegend from "../components/quad-status/BatteryLegend.vue";
import BetaflightLogo from "../components/betaflight-logo/BetaflightLogo.vue";
import StatusBar from "../components/status-bar/StatusBar.vue";
import BatteryIcon from "../components/quad-status/BatteryIcon.vue";
import BottomStatusIcons from "../components/quad-status/BottomStatusIcons.vue";
import DataFlash from "../components/data-flash/DataFlash.vue";
import SensorStatus from "../components/sensor-status/SensorStatus.vue";
import PortPicker from "../components/port-picker/PortPicker.vue";
import UserSession from "../components/user-session/UserSession.vue";
import WikiButton from "../components/elements/WikiButton.vue";
import Dialog from "../components/elements/Dialog.vue";
import App from "../App.vue";

// Create a Vue plugin that registers all components globally
export const BetaflightComponents = {
    install(app) {
        app.component("App", App);
        // Register all components globally
        app.component("BetaflightLogo", BetaflightLogo);
        app.component("BatteryLegend", BatteryLegend);
        app.component("StatusBar", StatusBar);
        app.component("BatteryIcon", BatteryIcon);
        app.component("BottomStatusIcons", BottomStatusIcons);
        app.component("DataFlash", DataFlash);
        app.component("SensorStatus", SensorStatus);
        app.component("PortPicker", PortPicker);
        app.component("UserSession", UserSession);
        app.component("WikiButton", WikiButton);
        app.component("Dialog", Dialog);
    },
};
