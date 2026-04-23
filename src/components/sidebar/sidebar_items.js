export const sidebarItems = [
    { key: "landing", mode: "disconnected", i18n: "tabLanding", icon: "i-lucide-home" },
    { key: "help", mode: "disconnected", i18n: "tabHelp", icon: "i-lucide-help-circle" },
    { key: "options", mode: "disconnected", i18n: "tabOptions", icon: "i-lucide-settings" },
    { key: "firmware_flasher", mode: "disconnected", i18n: "tabFirmwareFlasher", icon: "i-lucide-zap" },
    { key: "preflight", mode: "disconnected", i18n: "tabPreflight", icon: "i-lucide-clipboard-check" },
    { key: "flight_plan", mode: "disconnected", i18n: "tabFlightPlan", icon: "i-lucide-route", expert: true },

    { key: "setup", mode: "connected", i18n: "tabSetup", icon: "i-lucide-sliders-horizontal" },
    { key: "ports", mode: "connected", i18n: "tabPorts", icon: "i-lucide-cable" },
    { key: "configuration", mode: "connected", i18n: "tabConfiguration", icon: "i-lucide-settings" },
    { key: "power", mode: "connected", i18n: "tabPower", icon: "i-lucide-battery" },
    { key: "failsafe", mode: "connected", i18n: "tabFailsafe", icon: "i-lucide-shield-alert", expert: true },
    { key: "presets", mode: "connected", i18n: "tabPresets", icon: "i-lucide-wand-2" },
    { key: "pid_tuning", mode: "connected", i18n: "tabPidTuning", icon: "i-lucide-gauge" },
    { key: "receiver", mode: "connected", i18n: "tabReceiver", icon: "i-lucide-radio" },
    { key: "auxiliary", mode: "connected", i18n: "tabAuxiliary", icon: "i-lucide-toggle-right" },
    { key: "adjustments", mode: "connected", i18n: "tabAdjustments", icon: "i-lucide-sliders", expert: true },
    {
        key: "servos",
        mode: "connected",
        i18n: "tabServos",
        icon: "i-lucide-rotate-ccw",
        buildOptions: ["USE_SERVOS", "USE_WING"],
    },
    { key: "gps", mode: "connected", i18n: "tabGPS", icon: "i-lucide-map-pin", buildOptions: ["USE_GPS"] },
    { key: "motors", mode: "connected", i18n: "tabMotorTesting", icon: "i-lucide-fan" },
    { key: "osd", mode: "connected", i18n: "tabOsd", icon: "i-lucide-monitor", feature: "OSD" },
    { key: "vtx", mode: "connected", i18n: "tabVtx", icon: "i-lucide-radio-tower" },
    { key: "led_strip", mode: "connected", i18n: "tabLedStrip", icon: "i-lucide-lightbulb", feature: "LED_STRIP" },
    { key: "sensors", mode: "connected", i18n: "tabRawSensorData", icon: "i-lucide-activity", expert: true },
    {
        key: "flight_plan_connected",
        tab: "flight_plan",
        mode: "connected",
        i18n: "tabFlightPlan",
        icon: "i-lucide-route",
        buildOptions: ["USE_FLIGHT_PLAN"],
    },
    { key: "logging", mode: "connected", i18n: "tabLogging", icon: "i-lucide-file-text", expert: true },
    { key: "onboard_logging", mode: "connected", i18n: "tabOnboardLogging", icon: "i-lucide-database" },

    { key: "cli", mode: "cli", i18n: "tabCLI", icon: "i-lucide-terminal" },

    { key: "log", mode: "shared", i18n: "tabLog", icon: "i-lucide-file-text", expert: true },

    { key: "backups", mode: "loggedin", i18n: "tabBackups", icon: "i-lucide-database" },
    { key: "user_profile", mode: "loggedin", i18n: "tabUserProfile", icon: "i-lucide-user" },
];

export function isItemVisible(item, ctx) {
    if (item.expert && !ctx.expertMode) {
        return false;
    }
    if (item.buildOptions && !item.buildOptions.some((o) => ctx.buildOptions?.includes(o))) {
        return false;
    }
    if (item.feature && !ctx.features?.isEnabled?.(item.feature)) {
        return false;
    }
    return true;
}
