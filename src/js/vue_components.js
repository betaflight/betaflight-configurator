import BatteryLegend from "../components/quad-status/BatteryLegend.vue";
import BetaflightLogo from "../components/betaflight-logo/BetaflightLogo.vue";
import StatusBar from "../components/status-bar/StatusBar.vue";
import BatteryIcon from "../components/quad-status/BatteryIcon.vue";
import PortPicker from "../components/port-picker/PortPicker.vue";
import ConfigurationTab from "../components/tabs/ConfigurationTab.vue";

// Registry of Vue tab components - used by main.js for dynamic mounting
export const VueTabComponents = {
    configuration: ConfigurationTab,
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
        app.component("ConfigurationTab", ConfigurationTab);
    },
};
