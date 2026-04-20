import BatteryLegend from "../components/quad-status/BatteryLegend.vue";
import BetaflightLogo from "../components/betaflight-logo/BetaflightLogo.vue";
import StatusBar from "../components/status-bar/StatusBar.vue";
import BatteryIcon from "../components/quad-status/BatteryIcon.vue";
import PortPicker from "../components/port-picker/PortPicker.vue";
import UserSession from "../components/user-session/UserSession.vue";
import WikiButton from "../components/elements/WikiButton.vue";
import Dialog from "../components/elements/Dialog.vue";
import App from "../App.vue";
import { VueTabComponents } from "./vue_tab_registry.js";

// Create a Vue plugin that registers all components globally
export const BetaflightComponents = {
    install(app) {
        app.component("App", App);
        // Register all components globally
        app.component("BetaflightLogo", BetaflightLogo);
        app.component("BatteryLegend", BatteryLegend);
        app.component("StatusBar", StatusBar);
        app.component("BatteryIcon", BatteryIcon);
        app.component("PortPicker", PortPicker);
        app.component("UserSession", UserSession);
        app.component("WikiButton", WikiButton);
        app.component("Dialog", Dialog);
        // Register tab components
        app.component("HelpTab", VueTabComponents.help);
        app.component("LandingTab", VueTabComponents.landing);
        app.component("OptionsTab", VueTabComponents.options);
        app.component("PortsTab", VueTabComponents.ports);
        app.component("ServosTab", VueTabComponents.servos);
        app.component("ConfigurationTab", VueTabComponents.configuration);
        app.component("UserProfileTab", VueTabComponents.user_profile);
        app.component("BackupsTab", VueTabComponents.backups);
        app.component("LoggingTab", VueTabComponents.logging);
        app.component("GpsTab", VueTabComponents.gps);
        app.component("AuxiliaryTab", VueTabComponents.auxiliary);
        app.component("OnboardLoggingTab", VueTabComponents.onboard_logging);
        app.component("FirmwareFlasherTab", VueTabComponents.firmware_flasher);
        app.component("AdjustmentsTab", VueTabComponents.adjustments);
        app.component("CliTab", VueTabComponents.cli);
        app.component("PowerTab", VueTabComponents.power);
        app.component("SensorsTab", VueTabComponents.sensors);
        app.component("FlightPlanTab", VueTabComponents.flight_plan);
        app.component("LedStripTab", VueTabComponents.led_strip);
        app.component("FailsafeTab", VueTabComponents.failsafe);
        app.component("MotorsTab", VueTabComponents.motors);
        app.component("ReceiverTab", VueTabComponents.receiver);
        app.component("OsdTab", VueTabComponents.osd);
        app.component("SetupTab", VueTabComponents.setup);
        app.component("PidTuningTab", VueTabComponents.pid_tuning);
        app.component("PreflightTab", VueTabComponents.preflight);
        app.component("VtxTab", VueTabComponents.vtx);
        app.component("PresetsTab", VueTabComponents.presets);
    },
};
