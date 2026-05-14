import { beforeEach, describe, expect, it } from "vitest";
import { OSD } from "../../../src/components/tabs/osd/osd";
import FC from "../../../src/js/fc";
import { API_VERSION_1_47, API_VERSION_1_48 } from "../../../src/js/data_storage";

// Stub field: only the name property is needed for chooseFields assertions
function stubField(name) {
    return { name, text: name, desc: name, defaultPosition: -1, draw_order: 0, positionable: true, preview: name };
}

// Build a minimal ALL_DISPLAY_FIELDS with all fields that chooseFields references
function buildAllDisplayFields() {
    const fieldNames = [
        "RSSI_VALUE",
        "MAIN_BATT_VOLTAGE",
        "CROSSHAIRS",
        "ARTIFICIAL_HORIZON",
        "HORIZON_SIDEBARS",
        "TIMER_1",
        "TIMER_2",
        "FLYMODE",
        "CRAFT_NAME",
        "THROTTLE_POSITION",
        "VTX_CHANNEL",
        "CURRENT_DRAW",
        "MAH_DRAWN",
        "GPS_SPEED",
        "GPS_SATS",
        "ALTITUDE",
        "PID_ROLL",
        "PID_PITCH",
        "PID_YAW",
        "POWER",
        "PID_RATE_PROFILE",
        "WARNINGS",
        "AVG_CELL_VOLTAGE",
        "GPS_LON",
        "GPS_LAT",
        "DEBUG",
        "PITCH_ANGLE",
        "ROLL_ANGLE",
        "MAIN_BATT_USAGE",
        "DISARMED",
        "HOME_DIR",
        "HOME_DIST",
        "NUMERICAL_HEADING",
        "NUMERICAL_VARIO",
        "COMPASS_BAR",
        "ESC_TEMPERATURE",
        "ESC_RPM",
        "REMAINING_TIME_ESTIMATE",
        "RTC_DATE_TIME",
        "ADJUSTMENT_RANGE",
        "CORE_TEMPERATURE",
        "ANTI_GRAVITY",
        "G_FORCE",
        "MOTOR_DIAG",
        "LOG_STATUS",
        "FLIP_ARROW",
        "LINK_QUALITY",
        "FLIGHT_DIST",
        "STICK_OVERLAY_LEFT",
        "STICK_OVERLAY_RIGHT",
        "DISPLAY_NAME",
        "PILOT_NAME",
        "ESC_RPM_FREQ",
        "RATE_PROFILE_NAME",
        "PID_PROFILE_NAME",
        "OSD_PROFILE_NAME",
        "RSSI_DBM_VALUE",
        "RC_CHANNELS",
        "CAMERA_FRAME",
        "OSD_EFFICIENCY",
        "TOTAL_FLIGHTS",
        "OSD_UP_DOWN_REFERENCE",
        "OSD_TX_UPLINK_POWER",
        // API 1.45
        "WH_DRAWN",
        "AUX_VALUE",
        "READY_MODE",
        "RSNR_VALUE",
        "SYS_GOGGLE_VOLTAGE",
        "SYS_VTX_VOLTAGE",
        "SYS_BITRATE",
        "SYS_DELAY",
        "SYS_DISTANCE",
        "SYS_LQ",
        "SYS_GOGGLE_DVR",
        "SYS_VTX_DVR",
        "SYS_WARNINGS",
        "SYS_VTX_TEMP",
        "SYS_FAN_SPEED",
        // API 1.46
        "GPS_LAP_TIME_CURRENT",
        "GPS_LAP_TIME_PREVIOUS",
        "GPS_LAP_TIME_BEST3",
        // API 1.47
        "DEBUG2",
        "CUSTOM_MSG0",
        "CUSTOM_MSG1",
        "CUSTOM_MSG2",
        "CUSTOM_MSG3",
        "OSD_LIDAR_DIST",
        // API 1.48
        "OSD_CUSTOM_SERIAL_TEXT",
        "BATTERY_PROFILE_NAME",
    ];

    const fields = {};
    for (const name of fieldNames) {
        fields[name] = stubField(name);
    }
    return fields;
}

describe("OSD Battery Profile Fields", () => {
    beforeEach(() => {
        FC.resetState();
        OSD.ALL_DISPLAY_FIELDS = buildAllDisplayFields();
        OSD.constants = OSD.constants || {};
    });

    it("BATTERY_PROFILE_NAME is defined in ALL_DISPLAY_FIELDS", () => {
        expect(OSD.ALL_DISPLAY_FIELDS.BATTERY_PROFILE_NAME).toBeDefined();
        expect(OSD.ALL_DISPLAY_FIELDS.BATTERY_PROFILE_NAME.name).toEqual("BATTERY_PROFILE_NAME");
    });

    it("includes BATTERY_PROFILE_NAME in DISPLAY_FIELDS for API >= 1.48", () => {
        FC.CONFIG.apiVersion = API_VERSION_1_48;
        OSD.chooseFields();

        const fieldNames = OSD.constants.DISPLAY_FIELDS.map((f) => f.name);
        expect(fieldNames).toContain("BATTERY_PROFILE_NAME");
    });

    it("OSD_CUSTOM_SERIAL_TEXT appears before BATTERY_PROFILE_NAME in DISPLAY_FIELDS", () => {
        FC.CONFIG.apiVersion = API_VERSION_1_48;
        OSD.chooseFields();

        const fieldNames = OSD.constants.DISPLAY_FIELDS.map((f) => f.name);
        const customTextIndex = fieldNames.indexOf("OSD_CUSTOM_SERIAL_TEXT");
        const batteryProfileIndex = fieldNames.indexOf("BATTERY_PROFILE_NAME");
        expect(customTextIndex).toBeGreaterThanOrEqual(0);
        expect(batteryProfileIndex).toBeGreaterThan(customTextIndex);
    });

    it("does not include BATTERY_PROFILE_NAME in DISPLAY_FIELDS for API < 1.48", () => {
        FC.CONFIG.apiVersion = API_VERSION_1_47;
        OSD.chooseFields();

        const fieldNames = OSD.constants.DISPLAY_FIELDS.map((f) => f.name);
        expect(fieldNames).not.toContain("BATTERY_PROFILE_NAME");
    });

    it("BATTERY_PROFILE_NAME has correct draw_order and preview", () => {
        OSD.data = { video_system: 0 };
        OSD.loadDisplayFields();

        const field = OSD.ALL_DISPLAY_FIELDS.BATTERY_PROFILE_NAME;
        expect(field).toBeDefined();
        expect(field.name).toEqual("BATTERY_PROFILE_NAME");
        expect(field.draw_order).toEqual(620);
        expect(field.preview).toEqual("BAT1");
        expect(field.positionable).toEqual(true);
    });
});
