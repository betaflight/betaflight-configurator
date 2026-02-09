
import { i18n } from "../localization";

export const OSD_CONSTANTS = {
    VISIBLE: 0x0800,
    VARIANTS: 0xc000,
    VIDEO_TYPES: ["AUTO", "PAL", "NTSC", "HD"],
    UNIT_TYPES: ["IMPERIAL", "METRIC", "BRITISH"],
    TIMER_PRECISION: ["SECOND", "HUNDREDTH", "TENTH"],
    AHISIDEBARWIDTHPOSITION: 7,
    AHISIDEBARHEIGHTPOSITION: 3,

    UNKNOWN_DISPLAY_FIELD: {
        name: "UNKNOWN",
        text: "osdTextElementUnknown",
        desc: "osdDescElementUnknown",
        defaultPosition: -1,
        positionable: true,
        preview: "UNKNOWN ",
    },
    ALL_STATISTIC_FIELDS: {
        MAX_SPEED: {
            name: "MAX_SPEED",
            text: "osdTextStatMaxSpeed",
            desc: "osdDescStatMaxSpeed",
        },
        MIN_BATTERY: {
            name: "MIN_BATTERY",
            text: "osdTextStatMinBattery",
            desc: "osdDescStatMinBattery",
        },
        MIN_RSSI: {
            name: "MIN_RSSI",
            text: "osdTextStatMinRssi",
            desc: "osdDescStatMinRssi",
        },
        MAX_CURRENT: {
            name: "MAX_CURRENT",
            text: "osdTextStatMaxCurrent",
            desc: "osdDescStatMaxCurrent",
        },
        USED_MAH: {
            name: "USED_MAH",
            text: "osdTextStatUsedMah",
            desc: "osdDescStatUsedMah",
        },
        USED_WH: {
            name: "USED_WH",
            text: "osdTextStatUsedWh",
            desc: "osdDescStatUsedWh",
        },
        MAX_ALTITUDE: {
            name: "MAX_ALTITUDE",
            text: "osdTextStatMaxAltitude",
            desc: "osdDescStatMaxAltitude",
        },
        BLACKBOX: {
            name: "BLACKBOX",
            text: "osdTextStatBlackbox",
            desc: "osdDescStatBlackbox",
        },
        END_BATTERY: {
            name: "END_BATTERY",
            text: "osdTextStatEndBattery",
            desc: "osdDescStatEndBattery",
        },
        FLYTIME: {
            name: "FLY_TIME",
            text: "osdTextStatFlyTime",
            desc: "osdDescStatFlyTime",
        },
        ARMEDTIME: {
            name: "ARMED_TIME",
            text: "osdTextStatArmedTime",
            desc: "osdDescStatArmedTime",
        },
        MAX_DISTANCE: {
            name: "MAX_DISTANCE",
            text: "osdTextStatMaxDistance",
            desc: "osdDescStatMaxDistance",
        },
        BLACKBOX_LOG_NUMBER: {
            name: "BLACKBOX_LOG_NUMBER",
            text: "osdTextStatBlackboxLogNumber",
            desc: "osdDescStatBlackboxLogNumber",
        },
        TIMER_1: {
            name: "TIMER_1",
            text: "osdTextStatTimer1",
            desc: "osdDescStatTimer1",
        },
        TIMER_2: {
            name: "TIMER_2",
            text: "osdTextStatTimer2",
            desc: "osdDescStatTimer2",
        },
        RTC_DATE_TIME: {
            name: "RTC_DATE_TIME",
            text: "osdTextStatRtcDateTime",
            desc: "osdDescStatRtcDateTime",
        },
        STAT_BATTERY: {
            name: "BATTERY_VOLTAGE",
            text: "osdTextStatBattery",
            desc: "osdDescStatBattery",
        },
        MAX_G_FORCE: {
            name: "MAX_G_FORCE",
            text: "osdTextStatGForce",
            desc: "osdDescStatGForce",
        },
        MAX_ESC_TEMP: {
            name: "MAX_ESC_TEMP",
            text: "osdTextStatEscTemperature",
            desc: "osdDescStatEscTemperature",
        },
        MAX_ESC_RPM: {
            name: "MAX_ESC_RPM",
            text: "osdTextStatEscRpm",
            desc: "osdDescStatEscRpm",
        },
        MIN_LINK_QUALITY: {
            name: "MIN_LINK_QUALITY",
            text: "osdTextStatMinLinkQuality",
            desc: "osdDescStatMinLinkQuality",
        },
        FLIGHT_DISTANCE: {
            name: "FLIGHT_DISTANCE",
            text: "osdTextStatFlightDistance",
            desc: "osdDescStatFlightDistance",
        },
        MAX_FFT: {
            name: "MAX_FFT",
            text: "osdTextStatMaxFFT",
            desc: "osdDescStatMaxFFT",
        },
        STAT_TOTAL_FLIGHTS: {
            name: "STAT_TOTAL_FLIGHTS",
            text: "osdTextStatTotalFlights",
            desc: "osdDescStatTotalFlights",
        },
        STAT_TOTAL_FLIGHT_TIME: {
            name: "STAT_TOTAL_FLIGHT_TIME",
            text: "osdTextStatTotalFlightTime",
            desc: "osdDescStatTotalFlightTime",
        },
        STAT_TOTAL_FLIGHT_DIST: {
            name: "STAT_TOTAL_FLIGHT_DIST",
            text: "osdTextStatTotalFlightDistance",
            desc: "osdDescStatTotalFlightDistance",
        },
        MIN_RSSI_DBM: {
            name: "MIN_RSSI_DBM",
            text: "osdTextStatMinRssiDbm",
            desc: "osdDescStatMinRssiDbm",
        },
        MIN_RSNR: {
            name: "MIN_RSNR",
            text: "osdTextStatMinRSNR",
            desc: "osdDescStatMinRSNR",
        },
        STAT_BEST_3_CONSEC_LAPS: {
            name: "STAT_BEST_3_CONSEC_LAPS",
            text: "osdTextStatBest3ConsecLaps",
            desc: "osdDescStatBest3ConsecLaps",
        },
        STAT_BEST_LAP: {
            name: "STAT_BEST_LAP",
            text: "osdTextStatBestLap",
            desc: "osdDescStatBestLap",
        },
        STAT_FULL_THROTTLE_TIME: {
            name: "STAT_FULL_THROTTLE_TIME",
            text: "osdTextStatFullThrottleTime",
            desc: "osdDescStatFullThrottleTime",
        },
        STAT_FULL_THROTTLE_COUNTER: {
            name: "STAT_FULL_THROTTLE_COUNTER",
            text: "osdTextStatFullThrottleCounter",
            desc: "osdDescStatFullThrottleCounter",
        },
        STAT_AVG_THROTTLE: {
            name: "STAT_AVG_THROTTLE",
            text: "osdTextStatAvgThrottle",
            desc: "osdDescStatAvgThrottle",
        },
    },
    ALL_WARNINGS: {
        ARMING_DISABLED: {
            name: "ARMING_DISABLED",
            text: "osdWarningTextArmingDisabled",
            desc: "osdWarningArmingDisabled",
        },
        BATTERY_NOT_FULL: {
            name: "BATTERY_NOT_FULL",
            text: "osdWarningTextBatteryNotFull",
            desc: "osdWarningBatteryNotFull",
        },
        BATTERY_WARNING: {
            name: "BATTERY_WARNING",
            text: "osdWarningTextBatteryWarning",
            desc: "osdWarningBatteryWarning",
        },
        BATTERY_CRITICAL: {
            name: "BATTERY_CRITICAL",
            text: "osdWarningTextBatteryCritical",
            desc: "osdWarningBatteryCritical",
        },
        VISUAL_BEEPER: {
            name: "VISUAL_BEEPER",
            text: "osdWarningTextVisualBeeper",
            desc: "osdWarningVisualBeeper",
        },
        CRASH_FLIP_MODE: {
            name: "CRASH_FLIP_MODE",
            text: "osdWarningTextCrashFlipMode",
            desc: "osdWarningCrashFlipMode",
        },
        ESC_FAIL: {
            name: "ESC_FAIL",
            text: "osdWarningTextEscFail",
            desc: "osdWarningEscFail",
        },
        CORE_TEMPERATURE: {
            name: "CORE_TEMPERATURE",
            text: "osdWarningTextCoreTemperature",
            desc: "osdWarningCoreTemperature",
        },
        RC_SMOOTHING_FAILURE: {
            name: "RC_SMOOTHING_FAILURE",
            text: "osdWarningTextRcSmoothingFailure",
            desc: "osdWarningRcSmoothingFailure",
        },
        FAILSAFE: {
            name: "FAILSAFE",
            text: "osdWarningTextFailsafe",
            desc: "osdWarningFailsafe",
        },
        LAUNCH_CONTROL: {
            name: "LAUNCH_CONTROL",
            text: "osdWarningTextLaunchControl",
            desc: "osdWarningLaunchControl",
        },
        GPS_RESCUE_UNAVAILABLE: {
            name: "GPS_RESCUE_UNAVAILABLE",
            text: "osdWarningTextGpsRescueUnavailable",
            desc: "osdWarningGpsRescueUnavailable",
        },
        GPS_RESCUE_DISABLED: {
            name: "GPS_RESCUE_DISABLED",
            text: "osdWarningTextGpsRescueDisabled",
            desc: "osdWarningGpsRescueDisabled",
        },
        RSSI: {
            name: "RSSI",
            text: "osdWarningTextRSSI",
            desc: "osdWarningRSSI",
        },
        LINK_QUALITY: {
            name: "LINK_QUALITY",
            text: "osdWarningTextLinkQuality",
            desc: "osdWarningLinkQuality",
        },
        RSSI_DBM: {
            name: "RSSI_DBM",
            text: "osdWarningTextRssiDbm",
            desc: "osdWarningRssiDbm",
        },
        OVER_CAP: {
            name: "OVER_CAP",
            text: "osdWarningTextOverCap",
            desc: "osdWarningOverCap",
        },
        RSNR: {
            name: "RSNR",
            text: "osdWarningTextRSNR",
            desc: "osdWarningRSNR",
        },
        LOAD: {
            name: "LOAD",
            text: "osdWarningTextLoad",
            desc: "osdWarningLoad",
        },
    },
    FONT_TYPES: [
        { file: "default", name: "osdSetupFontTypeDefault" },
        { file: "bold", name: "osdSetupFontTypeBold" },
        { file: "large", name: "osdSetupFontTypeLarge" },
        { file: "extra_large", name: "osdSetupFontTypeLargeExtra" },
        { file: "betaflight", name: "osdSetupFontTypeBetaflight" },
        { file: "digital", name: "osdSetupFontTypeDigital" },
        { file: "clarity", name: "osdSetupFontTypeClarity" },
        { file: "vision", name: "osdSetupFontTypeVision" },
        { file: "impact", name: "osdSetupFontTypeImpact" },
        { file: "impact_mini", name: "osdSetupFontTypeImpactMini" },
    ],
};
