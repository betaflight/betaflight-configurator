import BatteryLegend from "../components/quad-status/BatteryLegend.vue";
import BetaflightLogo from "../components/betaflight-logo/BetaflightLogo.vue";
import StatusBar from "../components/status-bar/StatusBar.vue";
import BatteryIcon from "../components/quad-status/BatteryIcon.vue";
import PortPicker from "../components/port-picker/PortPicker.vue";
import UserSession from "../components/user-session/UserSession.vue";
import WikiButton from "../components/elements/WikiButton.vue";
// Tab components
import HelpTab from "../components/tabs/HelpTab.vue";
import LandingTab from "../components/tabs/LandingTab.vue";
import OptionsTab from "../components/tabs/OptionsTab.vue";
import PortsTab from "../components/tabs/PortsTab.vue";
import ServosTab from "../components/tabs/ServosTab.vue";
import ConfigurationTab from "../components/tabs/ConfigurationTab.vue";
import UserProfileTab from "../components/tabs/UserProfile.vue";
import BackupsTab from "../components/tabs/Backups.vue";
import LoggingTab from "../components/tabs/LoggingTab.vue";
import GpsTab from "../components/tabs/GpsTab.vue";
import AuxiliaryTab from "../components/tabs/AuxiliaryTab.vue";
import OnboardLoggingTab from "../components/tabs/OnboardLoggingTab.vue";
import FirmwareFlasherTab from "../components/tabs/FirmwareFlasherTab.vue";
import AdjustmentsTab from "../components/tabs/AdjustmentsTab.vue";
import PowerTab from "../components/tabs/PowerTab.vue";

// Registry of Vue tab components - used by main.js for dynamic mounting
export const VueTabComponents = {
    help: HelpTab,
    landing: LandingTab,
    options: OptionsTab,
    ports: PortsTab,
    servos: ServosTab,
    configuration: ConfigurationTab,
    user_profile: UserProfileTab,
    backups: BackupsTab,
    logging: LoggingTab,
    gps: GpsTab,
    auxiliary: AuxiliaryTab,
    onboard_logging: OnboardLoggingTab,
    firmware_flasher: FirmwareFlasherTab,
    adjustments: AdjustmentsTab,
    power: PowerTab,
};

// Create a Vue plugin that registers all components globally
export const BetaflightComponents = {
    install(app) {
        // Register all components globally
        app.component("BetaflightLogo", BetaflightLogo);
        app.component("BatteryLegend", BatteryLegend);
        app.component("StatusBar", StatusBar);
        app.component("BatteryIcon", BatteryIcon);
        app.component("PortPicker", PortPicker);
        app.component("UserSession", UserSession);
        app.component("WikiButton", WikiButton);
        // Register tab components
        app.component("HelpTab", HelpTab);
        app.component("LandingTab", LandingTab);
        app.component("OptionsTab", OptionsTab);
        app.component("PortsTab", PortsTab);
        app.component("ServosTab", ServosTab);
        app.component("ConfigurationTab", ConfigurationTab);
        app.component("UserProfileTab", UserProfileTab);
        app.component("BackupsTab", BackupsTab);
        app.component("LoggingTab", LoggingTab);
        app.component("GpsTab", GpsTab);
        app.component("AuxiliaryTab", AuxiliaryTab);
        app.component("OnboardLoggingTab", OnboardLoggingTab);
    },
};
