import { i18n } from "../../../js/localization";
import { bit_check } from "../../../js/bit";
import FC from "../../../js/fc";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47, API_VERSION_1_48 } from "../../../js/data_storage";
import semver from "semver";
import { have_sensor } from "../../../js/sensor_helpers";
import { OSD_CONSTANTS } from "./osd_constants";
import { FONT, SYM } from "../../../js/utils/osdFont";

const OSD = {};

// FONT and SYM are now imported from osdFont.js (see import above)

OSD.getNumberOfProfiles = function () {
    return OSD.data.osd_profiles.number;
};

// parsed fc output and output to fc, used by to OSD.msp.encode
OSD.initData = function () {
    OSD.data = {
        video_system: null,
        unit_mode: null,
        alarms: [],
        statItems: [],
        warnings: [],
        displayItems: [],
        timers: [],
        osd_profiles: {},
        VIDEO_COLS: {
            PAL: 30,
            NTSC: 30,
            HD: 53,
        },
        VIDEO_ROWS: {
            PAL: 16,
            NTSC: 13,
            HD: 20,
        },
        VIDEO_BUFFER_CHARS: {
            PAL: 480,
            NTSC: 390,
            HD: 1590,
        },
    };
};
OSD.initData();

OSD.getVariantForPreview = function (osdData, elementName) {
    return osdData.displayItems.find((element) => element.name === elementName).variant;
};

OSD.generateAltitudePreview = function (osdData) {
    const unit = FONT.symbol(osdData.unit_mode === 0 ? SYM.FEET : SYM.METRE);
    const variantSelected = OSD.getVariantForPreview(osdData, "ALTITUDE");
    return `${FONT.symbol(SYM.ALTITUDE)}399${variantSelected === 0 ? ".7" : ""}${unit}`;
};

OSD.generateVTXChannelPreview = function (osdData) {
    const variantSelected = OSD.getVariantForPreview(osdData, "VTX_CHANNEL");
    let value;
    switch (variantSelected) {
        case 0:
            value = "R:2:200:P";
            break;

        case 1:
            value = "200";
            break;
    }
    return value;
};

OSD.generateBatteryUsagePreview = function (osdData) {
    const variantSelected = OSD.getVariantForPreview(osdData, "MAIN_BATT_USAGE");

    let value;
    switch (variantSelected) {
        case 0:
            value =
                FONT.symbol(SYM.PB_START) +
                FONT.symbol(SYM.PB_FULL).repeat(9) +
                FONT.symbol(SYM.PB_END) +
                FONT.symbol(SYM.PB_EMPTY) +
                FONT.symbol(SYM.PB_CLOSE);
            break;

        case 1:
            value =
                FONT.symbol(SYM.PB_START) +
                FONT.symbol(SYM.PB_FULL).repeat(5) +
                FONT.symbol(SYM.PB_END) +
                FONT.symbol(SYM.PB_EMPTY).repeat(5) +
                FONT.symbol(SYM.PB_CLOSE);
            break;

        case 2:
            value = `${FONT.symbol(SYM.MAH)}67%`;
            break;

        case 3:
            value = `${FONT.symbol(SYM.MAH)}33%`;
            break;
    }
    return value;
};

OSD.generateGpsLatLongPreview = function (osdData, elementName) {
    const variantSelected = OSD.getVariantForPreview(osdData, elementName);

    let value;
    switch (variantSelected) {
        case 0:
            value =
                elementName === "GPS_LON"
                    ? `${FONT.symbol(SYM.GPS_LON)}-000.0000000`
                    : `${FONT.symbol(SYM.GPS_LAT)}-00.0000000 `;
            break;

        case 1:
            value =
                elementName === "GPS_LON"
                    ? `${FONT.symbol(SYM.GPS_LON)}-000.0000`
                    : `${FONT.symbol(SYM.GPS_LAT)}-00.0000 `;
            break;

        case 2:
            const degreesSymbol = FONT.symbol(SYM.STICK_OVERLAY_SPRITE_HIGH);
            value =
                elementName === "GPS_LON"
                    ? `${FONT.symbol(SYM.GPS_LON)}00${degreesSymbol}000'00.0"N`
                    : `${FONT.symbol(SYM.GPS_LAT)}00${degreesSymbol}00'00.0"E `;
            break;

        case 3:
            value = `${FONT.symbol(SYM.GPS_SAT_L)}${FONT.symbol(SYM.GPS_SAT_R)}000000AA+BBB`;
            break;
    }
    return value;
};

OSD.generateTimerPreview = function (osdData, timerIndex) {
    let preview = "";
    switch (osdData.timers[timerIndex].src) {
        case 0:
        case 3:
            preview += FONT.symbol(SYM.ON_M);
            break;
        case 1:
        case 2:
            preview += FONT.symbol(SYM.FLY_M);
            break;
    }
    switch (osdData.timers[timerIndex].precision) {
        case 0:
            preview += "00:00";
            break;
        case 1:
            preview += "00:00.00";
            break;
        case 2:
            preview += "00:00.0";
            break;
    }
    return preview;
};

OSD.generateTemperaturePreview = function (osdData, temperature) {
    let preview = FONT.symbol(SYM.TEMPERATURE);
    switch (osdData.unit_mode) {
        case 0:
            let temperatureConversion = temperature * (9.0 / 5.0);
            temperatureConversion += 32.0;
            preview += Math.floor(temperatureConversion) + FONT.symbol(SYM.TEMP_F);
            break;
        case 1:
        case 2:
            preview += temperature + FONT.symbol(SYM.TEMP_C);
            break;
    }
    return preview;
};

OSD.generateLQPreview = function () {
    const crsfIndex = FC.getSerialRxTypes().indexOf("CRSF");
    const isXF = crsfIndex === FC.RX_CONFIG.serialrx_provider;
    return FONT.symbol(SYM.LINK_QUALITY) + (isXF ? "2:100" : "8");
};

OSD.generateCraftName = function () {
    let preview = "CRAFT_NAME";

    const craftName = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) ? FC.CONFIG.craftName : FC.CONFIG.name;
    if (craftName !== "") {
        preview = craftName.toUpperCase();
    }
    return preview;
};

// for backwards compatibility before API_VERSION_1_45
OSD.generateDisplayName = function () {
    let preview = "DISPLAY_NAME";
    if (FC.CONFIG.displayName) {
        preview = FC.CONFIG.displayName?.toUpperCase();
    }
    return preview;
};

// added in API_VERSION_1_45
OSD.generatePilotName = function () {
    let preview = "PILOT_NAME";
    if (FC.CONFIG.pilotName) {
        preview = FC.CONFIG.pilotName?.toUpperCase();
    }
    return preview;
};

OSD.drawStickOverlayPreview = function () {
    function randomInt(count) {
        return Math.floor(Math.random() * Math.floor(count));
    }

    const STICK_OVERLAY_SPRITE = [
        SYM.STICK_OVERLAY_SPRITE_HIGH,
        SYM.STICK_OVERLAY_SPRITE_MID,
        SYM.STICK_OVERLAY_SPRITE_LOW,
    ];

    const OVERLAY_WIDTH = 7;
    const OVERLAY_HEIGHT = 5;

    const stickX = randomInt(OVERLAY_WIDTH);
    const stickY = randomInt(OVERLAY_HEIGHT);
    const stickSymbol = randomInt(3);

    // From 'osdDrawStickOverlayAxis' in 'src/main/io/osd.c'
    const stickOverlay = [];
    for (let x = 0; x < OVERLAY_WIDTH; x++) {
        for (let y = 0; y < OVERLAY_HEIGHT; y++) {
            let symbol = null;

            if (x === stickX && y === stickY) {
                symbol = STICK_OVERLAY_SPRITE[stickSymbol];
            } else if (x === (OVERLAY_WIDTH - 1) / 2 && y === (OVERLAY_HEIGHT - 1) / 2) {
                symbol = SYM.STICK_OVERLAY_CENTER;
            } else if (x === (OVERLAY_WIDTH - 1) / 2) {
                symbol = SYM.STICK_OVERLAY_VERTICAL;
            } else if (y === (OVERLAY_HEIGHT - 1) / 2) {
                symbol = SYM.STICK_OVERLAY_HORIZONTAL;
            }

            if (symbol !== null) {
                const element = {
                    x,
                    y,
                    sym: symbol,
                };
                stickOverlay.push(element);
            }
        }
    }
    return stickOverlay;
};

OSD.drawCameraFramePreview = function () {
    const FRAME_WIDTH = OSD.data.parameters.cameraFrameWidth;
    const FRAME_HEIGHT = OSD.data.parameters.cameraFrameHeight;

    const cameraFrame = [];

    for (let x = 0; x < FRAME_WIDTH; x++) {
        const sym = x === 0 || x === FRAME_WIDTH - 1 ? SYM.STICK_OVERLAY_CENTER : SYM.STICK_OVERLAY_HORIZONTAL;
        const frameUp = { x, y: 0, sym };
        const frameDown = { x, y: FRAME_HEIGHT - 1, sym };

        cameraFrame.push(frameUp, frameDown);
    }

    for (let y = 1; y < FRAME_HEIGHT - 1; y++) {
        const sym = SYM.STICK_OVERLAY_VERTICAL;
        const frameLeft = { x: 0, y, sym };
        const frameRight = { x: FRAME_WIDTH - 1, y, sym };

        cameraFrame.push(frameLeft, frameRight);
    }

    return cameraFrame;
};

OSD.formatPidsPreview = function (axis) {
    const pidDefaults = FC.getPidDefaults();
    const p = pidDefaults[axis * 5].toString().padStart(3);
    const i = pidDefaults[axis * 5 + 1].toString().padStart(3);
    const d = pidDefaults[axis * 5 + 2].toString().padStart(3);
    const f = pidDefaults[axis * 5 + 4].toString().padStart(3);
    return `${p} ${i} ${d} ${f}`;
};

OSD.loadDisplayFields = function () {
    let videoType = OSD.constants.VIDEO_TYPES[OSD.data.video_system];

    // All display fields, from every version, do not remove elements, only add!
    OSD.ALL_DISPLAY_FIELDS = {
        MAIN_BATT_VOLTAGE: {
            name: "MAIN_BATT_VOLTAGE",
            text: "osdTextElementMainBattVoltage",
            desc: "osdDescElementMainBattVoltage",
            defaultPosition: -29,
            draw_order: 20,
            positionable: true,
            preview: `${FONT.symbol(SYM.BATTERY)}16.8${FONT.symbol(SYM.VOLT)}`,
        },
        RSSI_VALUE: {
            name: "RSSI_VALUE",
            text: "osdTextElementRssiValue",
            desc: "osdDescElementRssiValue",
            defaultPosition: -59,
            draw_order: 30,
            positionable: true,
            preview: `${FONT.symbol(SYM.RSSI)}99`,
        },
        TIMER: {
            name: "TIMER",
            text: "osdTextElementTimer",
            desc: "osdDescElementTimer",
            defaultPosition: -39,
            positionable: true,
            preview: `${FONT.symbol(SYM.ON_M)} 11:11`,
        },
        THROTTLE_POSITION: {
            name: "THROTTLE_POSITION",
            text: "osdTextElementThrottlePosition",
            desc: "osdDescElementThrottlePosition",
            defaultPosition: -9,
            draw_order: 110,
            positionable: true,
            preview: `${FONT.symbol(SYM.THR)} 69`,
        },
        CPU_LOAD: {
            name: "CPU_LOAD",
            text: "osdTextElementCpuLoad",
            desc: "osdDescElementCpuLoad",
            defaultPosition: 26,
            positionable: true,
            preview: "15",
        },
        VTX_CHANNEL: {
            name: "VTX_CHANNEL",
            text: "osdTextElementVtxChannel",
            desc: "osdDescElementVtxChannel",
            defaultPosition: 1,
            draw_order: 120,
            positionable: true,
            variants: ["osdTextElementVTXchannelVariantFull", "osdTextElementVTXchannelVariantPower"],
            preview(osdData) {
                return OSD.generateVTXChannelPreview(osdData);
            },
        },
        VOLTAGE_WARNING: {
            name: "VOLTAGE_WARNING",
            text: "osdTextElementVoltageWarning",
            desc: "osdDescElementVoltageWarning",
            defaultPosition: -80,
            positionable: true,
            preview: "LOW VOLTAGE",
        },
        ARMED: {
            name: "ARMED",
            text: "osdTextElementArmed",
            desc: "osdDescElementArmed",
            defaultPosition: -107,
            positionable: true,
            preview: "ARMED",
        },
        DISARMED: {
            name: "DISARMED",
            text: "osdTextElementDisarmed",
            desc: "osdDescElementDisarmed",
            defaultPosition: -109,
            draw_order: 280,
            positionable: true,
            preview: "DISARMED",
        },
        CROSSHAIRS: {
            name: "CROSSHAIRS",
            text: "osdTextElementCrosshairs",
            desc: "osdDescElementCrosshairs",
            defaultPosition() {
                return (
                    (OSD.data.VIDEO_COLS[videoType] >> 1) +
                    ((OSD.data.VIDEO_ROWS[videoType] >> 1) - 2) * OSD.data.VIDEO_COLS[videoType] -
                    2
                );
            },
            draw_order: 40,
            positionable() {
                return true;
            },
            preview() {
                return (
                    FONT.symbol(SYM.AH_CENTER_LINE) + FONT.symbol(SYM.AH_CENTER) + FONT.symbol(SYM.AH_CENTER_LINE_RIGHT)
                );
            },
        },
        ARTIFICIAL_HORIZON: {
            name: "ARTIFICIAL_HORIZON",
            text: "osdTextElementArtificialHorizon",
            desc: "osdDescElementArtificialHorizon",
            defaultPosition() {
                return (
                    (OSD.data.VIDEO_COLS[videoType] >> 1) +
                    ((OSD.data.VIDEO_ROWS[videoType] >> 1) - 5) * OSD.data.VIDEO_COLS[videoType] -
                    1
                );
            },
            draw_order: 10,
            positionable() {
                return true;
            },
            preview() {
                const artificialHorizon = [];

                for (let j = 1; j < 8; j++) {
                    for (let i = -4; i <= 4; i++) {
                        let element;

                        // Blank char to mark the size of the element
                        if (j !== 4) {
                            element = { x: i, y: j, sym: SYM.BLANK };

                            // Sample of horizon
                        } else {
                            element = { x: i, y: j, sym: SYM.AH_BAR9_0 + 4 };
                        }
                        artificialHorizon.push(element);
                    }
                }
                return artificialHorizon;
            },
        },
        HORIZON_SIDEBARS: {
            name: "HORIZON_SIDEBARS",
            text: "osdTextElementHorizonSidebars",
            desc: "osdDescElementHorizonSidebars",
            defaultPosition() {
                return (
                    (OSD.data.VIDEO_COLS[videoType] >> 1) +
                    ((OSD.data.VIDEO_ROWS[videoType] >> 1) - 2) * OSD.data.VIDEO_COLS[videoType] -
                    1
                );
            },
            draw_order: 50,
            positionable() {
                return true;
            },
            preview() {
                const horizonSidebar = [];

                const hudwidth = OSD.constants.AHISIDEBARWIDTHPOSITION;
                const hudheight = OSD.constants.AHISIDEBARHEIGHTPOSITION;
                let element;
                for (let i = -hudheight; i <= hudheight; i++) {
                    element = { x: -hudwidth, y: i, sym: SYM.AH_DECORATION };
                    horizonSidebar.push(element);

                    element = { x: hudwidth, y: i, sym: SYM.AH_DECORATION };
                    horizonSidebar.push(element);
                }

                // AH level indicators
                element = {
                    x: -hudwidth + 1,
                    y: 0,
                    sym: SYM.AH_LEFT,
                };
                horizonSidebar.push(element);

                element = {
                    x: hudwidth - 1,
                    y: 0,
                    sym: SYM.AH_RIGHT,
                };
                horizonSidebar.push(element);

                return horizonSidebar;
            },
        },
        CURRENT_DRAW: {
            name: "CURRENT_DRAW",
            text: "osdTextElementCurrentDraw",
            desc: "osdDescElementCurrentDraw",
            defaultPosition: -23,
            draw_order: 130,
            positionable: true,
            preview() {
                return ` 42.00${FONT.symbol(SYM.AMP)}`;
            },
        },
        MAH_DRAWN: {
            name: "MAH_DRAWN",
            text: "osdTextElementMahDrawn",
            desc: "osdDescElementMahDrawn",
            defaultPosition: -18,
            draw_order: 140,
            positionable: true,
            preview() {
                return ` 690${FONT.symbol(SYM.MAH)}`;
            },
        },
        CRAFT_NAME: {
            name: "CRAFT_NAME",
            text: "osdTextElementCraftName",
            desc: "osdDescElementCraftName",
            defaultPosition: -77,
            draw_order: 150,
            positionable: true,
            preview: OSD.generateCraftName,
        },
        ALTITUDE: {
            name: "ALTITUDE",
            text: "osdTextElementAltitude",
            desc: "osdDescElementAltitude",
            defaultPosition: 62,
            draw_order: 160,
            positionable: true,
            variants: ["osdTextElementAltitudeVariant1DecimalAGL", "osdTextElementAltitudeVariantNoDecimalAGL"],
            preview(osdData) {
                return OSD.generateAltitudePreview(osdData);
            },
        },
        ONTIME: {
            name: "ONTIME",
            text: "osdTextElementOnTime",
            desc: "osdDescElementOnTime",
            defaultPosition: -1,
            positionable: true,
            preview: `${FONT.symbol(SYM.ON_M)}05:42`,
        },
        FLYTIME: {
            name: "FLYTIME",
            text: "osdTextElementFlyTime",
            desc: "osdDescElementFlyTime",
            defaultPosition: -1,
            positionable: true,
            preview: `${FONT.symbol(SYM.FLY_M)}04:11`,
        },
        FLYMODE: {
            name: "FLYMODE",
            text: "osdTextElementFlyMode",
            desc: "osdDescElementFlyMode",
            defaultPosition: -1,
            draw_order: 90,
            positionable: true,
            preview: "ANGL",
        },
        GPS_SPEED: {
            name: "GPS_SPEED",
            text: "osdTextElementGPSSpeed",
            desc: "osdDescElementGPSSpeed",
            defaultPosition: -1,
            draw_order: 810,
            positionable: true,
            preview(osdData) {
                const UNIT_METRIC = OSD.constants.UNIT_TYPES.indexOf("METRIC");
                const unit = FONT.symbol(osdData.unit_mode === UNIT_METRIC ? SYM.KPH : SYM.MPH);
                return `${FONT.symbol(SYM.SPEED)}40${unit}`;
            },
        },
        GPS_SATS: {
            name: "GPS_SATS",
            text: "osdTextElementGPSSats",
            desc: "osdDescElementGPSSats",
            defaultPosition: -1,
            draw_order: 800,
            positionable: true,
            preview: `${FONT.symbol(SYM.GPS_SAT_L)}${FONT.symbol(SYM.GPS_SAT_R)}14`,
        },
        GPS_LON: {
            name: "GPS_LON",
            text: "osdTextElementGPSLon",
            desc: "osdDescElementGPSLon",
            defaultPosition: -1,
            draw_order: 830,
            positionable: true,
            variants: [
                "osdTextElementGPSVariant7Decimals",
                "osdTextElementGPSVariant4Decimals",
                "osdTextElementGPSVariantDegMinSec",
                "osdTextElementGPSVariantOpenLocation",
            ],
            preview(osdData) {
                return OSD.generateGpsLatLongPreview(osdData, "GPS_LON");
            },
        },
        GPS_LAT: {
            name: "GPS_LAT",
            text: "osdTextElementGPSLat",
            desc: "osdDescElementGPSLat",
            defaultPosition: -1,
            draw_order: 820,
            positionable: true,
            variants: [
                "osdTextElementGPSVariant7Decimals",
                "osdTextElementGPSVariant4Decimals",
                "osdTextElementGPSVariantDegMinSec",
                "osdTextElementGPSVariantOpenLocation",
            ],
            preview(osdData) {
                return OSD.generateGpsLatLongPreview(osdData, "GPS_LAT");
            },
        },
        DEBUG: {
            name: "DEBUG",
            text: "osdTextElementDebug",
            desc: "osdDescElementDebug",
            defaultPosition: -1,
            draw_order: 240,
            positionable: true,
            preview: "DBG     0     0     0     0",
        },
        PID_ROLL: {
            name: "PID_ROLL",
            text: "osdTextElementPIDRoll",
            desc: "osdDescElementPIDRoll",
            defaultPosition: 0x800 | (10 << 5) | 2, // 0x0800 | (y << 5) | x
            draw_order: 170,
            positionable: true,
            preview: `ROL ${OSD.formatPidsPreview(0)}`,
        },
        PID_PITCH: {
            name: "PID_PITCH",
            text: "osdTextElementPIDPitch",
            desc: "osdDescElementPIDPitch",
            defaultPosition: 0x800 | (11 << 5) | 2, // 0x0800 | (y << 5) | x
            draw_order: 180,
            positionable: true,
            preview: `PIT ${OSD.formatPidsPreview(1)}`,
        },
        PID_YAW: {
            name: "PID_YAW",
            text: "osdTextElementPIDYaw",
            desc: "osdDescElementPIDYaw",
            defaultPosition: 0x800 | (12 << 5) | 2, // 0x0800 | (y << 5) | x
            draw_order: 190,
            positionable: true,
            preview: `YAW ${OSD.formatPidsPreview(2)}`,
        },
        POWER: {
            name: "POWER",
            text: "osdTextElementPower",
            desc: "osdDescElementPower",
            defaultPosition: (15 << 5) | 2,
            draw_order: 200,
            positionable: true,
            preview() {
                return " 142W";
            },
        },
        PID_RATE_PROFILE: {
            name: "PID_RATE_PROFILE",
            text: "osdTextElementPIDRateProfile",
            desc: "osdDescElementPIDRateProfile",
            defaultPosition: 0x800 | (13 << 5) | 2, // 0x0800 | (y << 5) | x
            draw_order: 210,
            positionable: true,
            preview: "1-2",
        },
        BATTERY_WARNING: {
            name: "BATTERY_WARNING",
            text: "osdTextElementBatteryWarning",
            desc: "osdDescElementBatteryWarning",
            defaultPosition: -1,
            positionable: true,
            preview: "LOW VOLTAGE",
        },
        AVG_CELL_VOLTAGE: {
            name: "AVG_CELL_VOLTAGE",
            text: "osdTextElementAvgCellVoltage",
            desc: "osdDescElementAvgCellVoltage",
            defaultPosition: 12 << 5,
            draw_order: 230,
            positionable: true,
            preview: `${FONT.symbol(SYM.BATTERY)}3.98${FONT.symbol(SYM.VOLT)}`,
        },
        PITCH_ANGLE: {
            name: "PITCH_ANGLE",
            text: "osdTextElementPitchAngle",
            desc: "osdDescElementPitchAngle",
            defaultPosition: -1,
            draw_order: 250,
            positionable: true,
            preview: `${FONT.symbol(SYM.PITCH)}-00.0`,
        },
        ROLL_ANGLE: {
            name: "ROLL_ANGLE",
            text: "osdTextElementRollAngle",
            desc: "osdDescElementRollAngle",
            defaultPosition: -1,
            draw_order: 260,
            positionable: true,
            preview: `${FONT.symbol(SYM.ROLL)}-00.0`,
        },
        MAIN_BATT_USAGE: {
            name: "MAIN_BATT_USAGE",
            text: "osdTextElementMainBattUsage",
            desc: "osdDescElementMainBattUsage",
            defaultPosition: -17,
            draw_order: 270,
            positionable: true,
            variants: [
                "osdTextElementMainBattUsageVariantGraphrRemain",
                "osdTextElementMainBattUsageVariantGraphUsage",
                "osdTextElementMainBattUsageVariantValueRemain",
                "osdTextElementMainBattUsageVariantValueUsage",
            ],
            preview(osdData) {
                return OSD.generateBatteryUsagePreview(osdData);
            },
        },
        ARMED_TIME: {
            name: "ARMED_TIME",
            text: "osdTextElementArmedTime",
            desc: "osdDescElementArmedTime",
            defaultPosition: -1,
            positionable: true,
            preview: `${FONT.symbol(SYM.FLY_M)}02:07`,
        },
        HOME_DIR: {
            name: "HOME_DIRECTION",
            text: "osdTextElementHomeDirection",
            desc: "osdDescElementHomeDirection",
            defaultPosition: -1,
            draw_order: 850,
            positionable: true,
            preview: FONT.symbol(SYM.ARROW_SOUTH + 2),
        },
        HOME_DIST: {
            name: "HOME_DISTANCE",
            text: "osdTextElementHomeDistance",
            desc: "osdDescElementHomeDistance",
            defaultPosition: -1,
            draw_order: 840,
            positionable: true,
            preview(osdData) {
                const unit = FONT.symbol(osdData.unit_mode === 0 ? SYM.FEET : SYM.METRE);
                return `${FONT.symbol(SYM.HOMEFLAG)}432${unit}`;
            },
        },
        NUMERICAL_HEADING: {
            name: "NUMERICAL_HEADING",
            text: "osdTextElementNumericalHeading",
            desc: "osdDescElementNumericalHeading",
            defaultPosition: -1,
            draw_order: 290,
            positionable: true,
            preview: `${FONT.symbol(SYM.ARROW_EAST)}90`,
        },
        NUMERICAL_VARIO: {
            name: "NUMERICAL_VARIO",
            text: "osdTextElementNumericalVario",
            desc: "osdDescElementNumericalVario",
            defaultPosition: -1,
            draw_order: 300,
            positionable: true,
            preview(osdData) {
                const unit = FONT.symbol(osdData.unit_mode === 0 ? SYM.FTPS : SYM.MPS);
                return `${FONT.symbol(SYM.ARROW_SMALL_UP)}8.7${unit}`;
            },
        },
        COMPASS_BAR: {
            name: "COMPASS_BAR",
            text: "osdTextElementCompassBar",
            desc: "osdDescElementCompassBar",
            defaultPosition: -1,
            draw_order: 310,
            positionable: true,
            preview() {
                return (
                    FONT.symbol(SYM.HEADING_W) +
                    FONT.symbol(SYM.HEADING_LINE) +
                    FONT.symbol(SYM.HEADING_DIVIDED_LINE) +
                    FONT.symbol(SYM.HEADING_LINE) +
                    FONT.symbol(SYM.HEADING_N) +
                    FONT.symbol(SYM.HEADING_LINE) +
                    FONT.symbol(SYM.HEADING_DIVIDED_LINE) +
                    FONT.symbol(SYM.HEADING_LINE) +
                    FONT.symbol(SYM.HEADING_E)
                );
            },
        },
        WARNINGS: {
            name: "WARNINGS",
            text: "osdTextElementWarnings",
            desc: "osdDescElementWarnings",
            defaultPosition: -1,
            draw_order: 220,
            positionable: true,
            preview: "LOW VOLTAGE",
        },
        ESC_TEMPERATURE: {
            name: "ESC_TEMPERATURE",
            text: "osdTextElementEscTemperature",
            desc: "osdDescElementEscTemperature",
            defaultPosition: -1,
            draw_order: 900,
            positionable: true,
            preview(osdData) {
                return `E${OSD.generateTemperaturePreview(osdData, 45)}`;
            },
        },
        ESC_RPM: {
            name: "ESC_RPM",
            text: "osdTextElementEscRpm",
            desc: "osdDescElementEscRpm",
            defaultPosition: -1,
            draw_order: 1000,
            positionable: true,
            preview: ["22600", "22600", "22600", "22600"],
        },
        REMAINING_TIME_ESTIMATE: {
            name: "REMAINING_TIME_ESTIMATE",
            text: "osdTextElementRemainingTimeEstimate",
            desc: "osdDescElementRemainingTimeEstimate",
            defaultPosition: -1,
            draw_order: 80,
            positionable: true,
            preview: "01:13",
        },
        RTC_DATE_TIME: {
            name: "RTC_DATE_TIME",
            text: "osdTextElementRtcDateTime",
            desc: "osdDescElementRtcDateTime",
            defaultPosition: -1,
            draw_order: 360,
            positionable: true,
            preview(osdData) {
                const variantSelected = OSD.getVariantForPreview(osdData, "RTC_DATE_TIME");
                switch (variantSelected) {
                    case 0:
                        return "2025-11-11 16:20:00";
                    case 1:
                        return "11-11 16:20";
                    case 2:
                        return "16:20:00";
                }
            },
        },
        ADJUSTMENT_RANGE: {
            name: "ADJUSTMENT_RANGE",
            text: "osdTextElementAdjustmentRange",
            desc: "osdDescElementAdjustmentRange",
            defaultPosition: -1,
            draw_order: 370,
            positionable: true,
            preview: "PITCH/ROLL P: 42",
        },
        TIMER_1: {
            name: "TIMER_1",
            text: "osdTextElementTimer1",
            desc: "osdDescElementTimer1",
            defaultPosition: -1,
            draw_order: 60,
            positionable: true,
            preview(osdData) {
                return OSD.generateTimerPreview(osdData, 0);
            },
        },
        TIMER_2: {
            name: "TIMER_2",
            text: "osdTextElementTimer2",
            desc: "osdDescElementTimer2",
            defaultPosition: -1,
            draw_order: 70,
            positionable: true,
            preview(osdData) {
                return OSD.generateTimerPreview(osdData, 1);
            },
        },
        CORE_TEMPERATURE: {
            name: "CORE_TEMPERATURE",
            text: "osdTextElementCoreTemperature",
            desc: "osdDescElementCoreTemperature",
            defaultPosition: -1,
            draw_order: 380,
            positionable: true,
            preview(osdData) {
                return `C${OSD.generateTemperaturePreview(osdData, 33)}`;
            },
        },
        ANTI_GRAVITY: {
            name: "ANTI_GRAVITY",
            text: "osdTextAntiGravity",
            desc: "osdDescAntiGravity",
            defaultPosition: -1,
            draw_order: 320,
            positionable: true,
            preview: "AG",
        },
        G_FORCE: {
            name: "G_FORCE",
            text: "osdTextGForce",
            desc: "osdDescGForce",
            defaultPosition: -1,
            draw_order: 15,
            positionable: true,
            preview: "1.0G",
        },
        MOTOR_DIAG: {
            name: "MOTOR_DIAGNOSTICS",
            text: "osdTextElementMotorDiag",
            desc: "osdDescElementMotorDiag",
            defaultPosition: -1,
            draw_order: 335,
            positionable: true,
            preview: FONT.symbol(0x84) + FONT.symbol(0x85) + FONT.symbol(0x84) + FONT.symbol(0x83),
        },
        LOG_STATUS: {
            name: "LOG_STATUS",
            text: "osdTextElementLogStatus",
            desc: "osdDescElementLogStatus",
            defaultPosition: -1,
            draw_order: 330,
            positionable: true,
            preview: `${FONT.symbol(SYM.BBLOG)}16`,
        },
        FLIP_ARROW: {
            name: "FLIP_ARROW",
            text: "osdTextElementFlipArrow",
            desc: "osdDescElementFlipArrow",
            defaultPosition: -1,
            draw_order: 340,
            positionable: true,
            preview: FONT.symbol(SYM.ARROW_EAST),
        },
        LINK_QUALITY: {
            name: "LINK_QUALITY",
            text: "osdTextElementLinkQuality",
            desc: "osdDescElementLinkQuality",
            defaultPosition: -1,
            draw_order: 390,
            positionable: true,
            preview: OSD.generateLQPreview,
        },
        FLIGHT_DIST: {
            name: "FLIGHT_DISTANCE",
            text: "osdTextElementFlightDist",
            desc: "osdDescElementFlightDist",
            defaultPosition: -1,
            draw_order: 860,
            positionable: true,
            preview(osdData) {
                const unit = FONT.symbol(osdData.unit_mode === 0 ? SYM.FEET : SYM.METRE);
                return `${FONT.symbol(SYM.TOTAL_DIST)}653${unit}`;
            },
        },
        STICK_OVERLAY_LEFT: {
            name: "STICK_OVERLAY_LEFT",
            text: "osdTextElementStickOverlayLeft",
            desc: "osdDescElementStickOverlayLeft",
            defaultPosition: -1,
            draw_order: 400,
            positionable: true,
            preview: OSD.drawStickOverlayPreview,
        },
        STICK_OVERLAY_RIGHT: {
            name: "STICK_OVERLAY_RIGHT",
            text: "osdTextElementStickOverlayRight",
            desc: "osdDescElementStickOverlayRight",
            defaultPosition: -1,
            draw_order: 410,
            positionable: true,
            preview: OSD.drawStickOverlayPreview,
        },
        ...(semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_45)
            ? {
                DISPLAY_NAME: {
                    name: "DISPLAY_NAME",
                    text: "osdTextElementDisplayName",
                    desc: "osdDescElementDisplayName",
                    defaultPosition: -77,
                    draw_order: 350,
                    positionable: true,
                    preview(osdData) {
                        return OSD.generateDisplayName(osdData, 1);
                    },
                },
            }
            : {}),
        ...(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)
            ? {
                PILOT_NAME: {
                    name: "PILOT_NAME",
                    text: "osdTextElementPilotName",
                    desc: "osdDescElementPilotName",
                    defaultPosition: -77,
                    draw_order: 350,
                    positionable: true,
                    preview(osdData) {
                        return OSD.generatePilotName(osdData, 1);
                    },
                },
            }
            : {}),
        ESC_RPM_FREQ: {
            name: "ESC_RPM_FREQ",
            text: "osdTextElementEscRpmFreq",
            desc: "osdDescElementEscRpmFreq",
            defaultPosition: -1,
            draw_order: 1010,
            positionable: true,
            preview: ["22600", "22600", "22600", "22600"],
        },
        RATE_PROFILE_NAME: {
            name: "RATE_PROFILE_NAME",
            text: "osdTextElementRateProfileName",
            desc: "osdDescElementRateProfileName",
            defaultPosition: -1,
            draw_order: 420,
            positionable: true,
            preview: "RATE_1",
        },
        PID_PROFILE_NAME: {
            name: "PID_PROFILE_NAME",
            text: "osdTextElementPidProfileName",
            desc: "osdDescElementPidProfileName",
            defaultPosition: -1,
            draw_order: 430,
            positionable: true,
            preview: "PID_1",
        },
        OSD_PROFILE_NAME: {
            name: "OSD_PROFILE_NAME",
            text: "osdTextElementOsdProfileName",
            desc: "osdDescElementOsdProfileName",
            defaultPosition: -1,
            draw_order: 440,
            positionable: true,
            preview: "OSD_1",
        },
        RSSI_DBM_VALUE: {
            name: "RSSI_DBM_VALUE",
            text: "osdTextElementRssiDbmValue",
            desc: "osdDescElementRssiDbmValue",
            defaultPosition: -1,
            draw_order: 395,
            positionable: true,
            preview: `${FONT.symbol(SYM.RSSI)}-130`,
        },
        RC_CHANNELS: {
            name: "OSD_RC_CHANNELS",
            text: "osdTextElementRcChannels",
            desc: "osdDescElementRcChannels",
            defaultPosition: -1,
            draw_order: 445,
            positionable: true,
            preview: ["-1000", "  545", "  689", " 1000"],
        },
        CAMERA_FRAME: {
            name: "OSD_CAMERA_FRAME",
            text: "osdTextElementCameraFrame",
            desc: "osdDescElementCameraFrame",
            defaultPosition: -1,
            draw_order: 450,
            positionable: true,
            preview: OSD.drawCameraFramePreview,
        },
        OSD_EFFICIENCY: {
            name: "OSD_EFFICIENCY",
            text: "osdTextElementEfficiency",
            desc: "osdDescElementEfficiency",
            defaultPosition: -1,
            draw_order: 455,
            positionable: true,
            preview(osdData) {
                const unit = FONT.symbol(osdData.unit_mode === 0 ? SYM.MILES : SYM.KM);
                return `1234${FONT.symbol(SYM.MAH)}/${unit}`;
            },
        },
        TOTAL_FLIGHTS: {
            name: "OSD_TOTAL_FLIGHTS",
            text: "osdTextTotalFlights",
            desc: "osdDescTotalFlights",
            defaultPosition: -1,
            draw_order: 460,
            positionable: true,
            preview: "#9876",
        },
        OSD_UP_DOWN_REFERENCE: {
            name: "OSD_UP_DOWN_REFERENCE",
            text: "osdTextElementUpDownReference",
            desc: "osdDescUpDownReference",
            defaultPosition: 238,
            draw_order: 465,
            positionable: true,
            preview: "U",
        },
        OSD_TX_UPLINK_POWER: {
            name: "OSD_TX_UPLINK_POWER",
            text: "osdTextElementTxUplinkPower",
            desc: "osdDescTxUplinkPower",
            defaultPosition: -1,
            draw_order: 470,
            positionable: true,
            preview: `${FONT.symbol(SYM.RSSI)}250MW`,
        },
        WH_DRAWN: {
            name: "WH_DRAWN",
            text: "osdTextElementWhDrawn",
            desc: "osdDescElementWhDrawn",
            defaultPosition: -1,
            draw_order: 475,
            positionable: true,
            preview: "1.10 WH",
        },
        AUX_VALUE: {
            name: "AUX_VALUE",
            text: "osdTextElementAuxValue",
            desc: "osdDescElementAuxValue",
            defaultPosition: -1,
            draw_order: 480,
            positionable: true,
            preview: "AUX",
        },
        READY_MODE: {
            name: "READY_MODE",
            text: "osdTextElementReadyMode",
            desc: "osdDescElementReadyMode",
            defaultPosition: -1,
            draw_order: 485,
            positionable: true,
            preview: "READY",
        },
        RSNR_VALUE: {
            name: "RSNR_VALUE",
            text: "osdTextElementRSNRValue",
            desc: "osdDescElementRSNRValue",
            defaultPosition: -1,
            draw_order: 490,
            positionable: true,
            preview: `${FONT.symbol(SYM.RSSI)}15`,
        },
        SYS_GOGGLE_VOLTAGE: {
            name: "SYS_GOGGLE_VOLTAGE",
            text: "osdTextElementSysGoggleVoltage",
            desc: "osdDescElementSysGoggleVoltage",
            defaultPosition: -1,
            draw_order: 485,
            positionable: true,
            preview: "G 16.8V",
        },
        SYS_VTX_VOLTAGE: {
            name: "SYS_VTX_VOLTAGE",
            text: "osdTextElementSysVtxVoltage",
            desc: "osdDescElementSysVtxVoltage",
            defaultPosition: -1,
            draw_order: 490,
            positionable: true,
            preview: "A 12.6V",
        },
        SYS_BITRATE: {
            name: "SYS_BITRATE",
            text: "osdTextElementSysBitrate",
            desc: "osdDescElementSysBitrate",
            defaultPosition: -1,
            draw_order: 495,
            positionable: true,
            preview: "50MBPS",
        },
        SYS_DELAY: {
            name: "SYS_DELAY",
            text: "osdTextElementSysDelay",
            desc: "osdDescElementSysDelay",
            defaultPosition: -1,
            draw_order: 500,
            positionable: true,
            preview: "24.5MS",
        },
        SYS_DISTANCE: {
            name: "SYS_DISTANCE",
            text: "osdTextElementSysDistance",
            desc: "osdDescElementSysDistance",
            defaultPosition: -1,
            draw_order: 505,
            positionable: true,
            preview: `10${FONT.symbol(SYM.METRE)}`,
        },
        SYS_LQ: {
            name: "SYS_LQ",
            text: "osdTextElementSysLQ",
            desc: "osdDescElementSysLQ",
            defaultPosition: -1,
            draw_order: 510,
            positionable: true,
            preview: `G${FONT.symbol(SYM.LINK_QUALITY)}100`,
        },
        SYS_GOGGLE_DVR: {
            name: "SYS_GOGGLE_DVR",
            text: "osdTextElementSysGoggleDVR",
            desc: "osdDescElementSysGoggleDVR",
            defaultPosition: -1,
            draw_order: 515,
            positionable: true,
            preview: `${FONT.symbol(SYM.ARROW_SMALL_RIGHT)}G DVR 8.4G`,
        },
        SYS_VTX_DVR: {
            name: "SYS_VTX_DVR",
            text: "osdTextElementSysVtxDVR",
            desc: "osdDescElementSysVtxDVR",
            defaultPosition: -1,
            draw_order: 520,
            positionable: true,
            preview: `${FONT.symbol(SYM.ARROW_SMALL_RIGHT)}A DVR 1.6G`,
        },
        SYS_WARNINGS: {
            name: "SYS_WARNINGS",
            text: "osdTextElementSysWarnings",
            desc: "osdDescElementSysWarnings",
            defaultPosition: -1,
            draw_order: 525,
            positionable: true,
            preview: "VTX WARNINGS",
        },
        SYS_VTX_TEMP: {
            name: "SYS_VTX_TEMP",
            text: "osdTextElementSysVtxTemp",
            desc: "osdDescElementSysVtxTemp",
            defaultPosition: -1,
            draw_order: 530,
            positionable: true,
            preview(osdData) {
                return `V${OSD.generateTemperaturePreview(osdData, 45)}`;
            },
        },
        SYS_FAN_SPEED: {
            name: "SYS_FAN_SPEED",
            text: "osdTextElementSysFanSpeed",
            desc: "osdDescElementSysFanSpeed",
            defaultPosition: -1,
            draw_order: 535,
            positionable: true,
            preview: `F${FONT.symbol(SYM.TEMPERATURE)}5`,
        },
        GPS_LAP_TIME_CURRENT: {
            name: "GPS_LAP_TIME_CURRENT",
            text: "osdTextElementLapTimeCurrent",
            desc: "osdDescElementLapTimeCurrent",
            defaultPosition: -1,
            draw_order: 540,
            positionable: true,
            preview: "1:23.456",
        },
        GPS_LAP_TIME_PREVIOUS: {
            name: "GPS_LAP_TIME_PREVIOUS",
            text: "osdTextElementLapTimePrevious",
            desc: "osdDescElementLapTimePrevious",
            defaultPosition: -1,
            draw_order: 545,
            positionable: true,
            preview: "1:23.456",
        },
        GPS_LAP_TIME_BEST3: {
            name: "GPS_LAP_TIME_BEST3",
            text: "osdTextElementLapTimeBest3",
            desc: "osdDescElementLapTimeBest3",
            defaultPosition: -1,
            draw_order: 550,
            positionable: true,
            preview: "1:23.456",
        },
        DEBUG2: {
            name: "DEBUG2",
            text: "osdTextElementDebug2",
            desc: "osdDescElementDebug2",
            defaultPosition: -1,
            draw_order: 560,
            positionable: true,
            preview: "DBG2     0     0     0     0",
        },
        CUSTOM_MSG0: {
            name: "CUSTOM_MSG1",
            text: "osdTextElementCustomMsg0",
            desc: "osdDescElementCustomMsg0",
            defaultPosition: -1,
            draw_order: 570,
            positionable: true,
            preview: "CUSTOM MSG1",
        },
        CUSTOM_MSG1: {
            name: "CUSTOM_MSG2",
            text: "osdTextElementCustomMsg1",
            desc: "osdDescElementCustomMsg1",
            defaultPosition: -1,
            draw_order: 580,
            positionable: true,
            preview: "CUSTOM MSG2",
        },
        CUSTOM_MSG2: {
            name: "CUSTOM_MSG3",
            text: "osdTextElementCustomMsg2",
            desc: "osdDescElementCustomMsg2",
            defaultPosition: -1,
            draw_order: 590,
            positionable: true,
            preview: "CUSTOM MSG3",
        },
        CUSTOM_MSG3: {
            name: "CUSTOM_MSG4",
            text: "osdTextElementCustomMsg3",
            desc: "osdDescElementCustomMsg3",
            defaultPosition: -1,
            draw_order: 600,
            positionable: true,
            preview: "CUSTOM MSG4",
        },
        OSD_LIDAR_DIST: {
            name: "OSD_LIDAR_DIST",
            text: "osdTextElementLidar",
            desc: "osdDescElementLidar",
            defaultPosition: -1,
            draw_order: 610,
            positionable: true,
            preview: "RF:---",
        },
        OSD_CUSTOM_SERIAL_TEXT: {
            name: "OSD_CUSTOM_SERIAL_TEXT",
            text: "osdTextElementCustomSerialText",
            desc: "osdDescElementCustomSerialText",
            defaultPosition: -1,
            draw_order: 615,
            positionable: true,
            preview: "---",
        },
        BATTERY_PROFILE_NAME: {
            name: "BATTERY_PROFILE_NAME",
            text: "osdTextElementBatteryProfileName",
            desc: "osdDescElementBatteryProfileName",
            defaultPosition: -1,
            draw_order: 620,
            positionable: true,
            preview: "BAT1",
        },
    };

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
        if (have_sensor(FC.CONFIG.activeSensors, "gps")) {
            OSD.ALL_DISPLAY_FIELDS.ALTITUDE.variants.push(
                "osdTextElementAltitudeVariant1DecimalASL",
                "osdTextElementAltitudeVariantNoDecimalASL",
            );
        }
        OSD.ALL_DISPLAY_FIELDS.RTC_DATE_TIME.variants = [
            "osdTextElementRtcDateTimeVariantFullDate",
            "osdTextElementRtcDateTimeVariantShortDate",
        ];
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_48)) {
        OSD.ALL_DISPLAY_FIELDS.RTC_DATE_TIME.variants.push("osdTextElementRtcDateTimeVariantTimeOnly");
    }
};

OSD.constants = OSD_CONSTANTS;

// Pick display fields by version, order matters, so these are going in an array... pry could iterate the example map instead
OSD.chooseFields = function () {
    let F = OSD.ALL_DISPLAY_FIELDS;

    OSD.constants.DISPLAY_FIELDS = [
        F.RSSI_VALUE,
        F.MAIN_BATT_VOLTAGE,
        F.CROSSHAIRS,
        F.ARTIFICIAL_HORIZON,
        F.HORIZON_SIDEBARS,
        F.TIMER_1,
        F.TIMER_2,
        F.FLYMODE,
        F.CRAFT_NAME,
        F.THROTTLE_POSITION,
        F.VTX_CHANNEL,
        F.CURRENT_DRAW,
        F.MAH_DRAWN,
        F.GPS_SPEED,
        F.GPS_SATS,
        F.ALTITUDE,
        F.PID_ROLL,
        F.PID_PITCH,
        F.PID_YAW,
        F.POWER,
        F.PID_RATE_PROFILE,
        F.WARNINGS,
        F.AVG_CELL_VOLTAGE,
        F.GPS_LON,
        F.GPS_LAT,
        F.DEBUG,
        F.PITCH_ANGLE,
        F.ROLL_ANGLE,
        F.MAIN_BATT_USAGE,
        F.DISARMED,
        F.HOME_DIR,
        F.HOME_DIST,
        F.NUMERICAL_HEADING,
        F.NUMERICAL_VARIO,
        F.COMPASS_BAR,
        F.ESC_TEMPERATURE,
        F.ESC_RPM,
        F.REMAINING_TIME_ESTIMATE,
        F.RTC_DATE_TIME,
        F.ADJUSTMENT_RANGE,
        F.CORE_TEMPERATURE,
        F.ANTI_GRAVITY,
        F.G_FORCE,
        F.MOTOR_DIAG,
        F.LOG_STATUS,
        F.FLIP_ARROW,
        F.LINK_QUALITY,
        F.FLIGHT_DIST,
        F.STICK_OVERLAY_LEFT,
        F.STICK_OVERLAY_RIGHT,
        // show either DISPLAY_NAME or PILOT_NAME depending on the MSP version
        semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) ? F.PILOT_NAME : F.DISPLAY_NAME,
        F.ESC_RPM_FREQ,
        F.RATE_PROFILE_NAME,
        F.PID_PROFILE_NAME,
        F.OSD_PROFILE_NAME,
        F.RSSI_DBM_VALUE,
        F.RC_CHANNELS,
        F.CAMERA_FRAME,
        F.OSD_EFFICIENCY,
        F.TOTAL_FLIGHTS,
        F.OSD_UP_DOWN_REFERENCE,
        F.OSD_TX_UPLINK_POWER,
    ];

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
        OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
            F.WH_DRAWN,
            F.AUX_VALUE,
            F.READY_MODE,
            F.RSNR_VALUE,
            F.SYS_GOGGLE_VOLTAGE,
            F.SYS_VTX_VOLTAGE,
            F.SYS_BITRATE,
            F.SYS_DELAY,
            F.SYS_DISTANCE,
            F.SYS_LQ,
            F.SYS_GOGGLE_DVR,
            F.SYS_VTX_DVR,
            F.SYS_WARNINGS,
            F.SYS_VTX_TEMP,
            F.SYS_FAN_SPEED,
        ]);
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
        OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
            F.GPS_LAP_TIME_CURRENT,
            F.GPS_LAP_TIME_PREVIOUS,
            F.GPS_LAP_TIME_BEST3,
        ]);
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
        OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
            F.DEBUG2,
            F.CUSTOM_MSG0,
            F.CUSTOM_MSG1,
            F.CUSTOM_MSG2,
            F.CUSTOM_MSG3,
            F.OSD_LIDAR_DIST,
        ]);
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_48)) {
        OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
            F.OSD_CUSTOM_SERIAL_TEXT,
            F.BATTERY_PROFILE_NAME,
        ]);
    }
    // Choose statistic fields
    // Nothing much to do here, I'm preempting there being new statistics
    F = OSD.constants.ALL_STATISTIC_FIELDS;

    // ** IMPORTANT **
    //
    // Starting with 1.39.0 (Betaflight 3.4) the OSD stats selection options
    // are ordered in the same sequence as displayed on-screen in the OSD.
    // If future versions of the firmware implement changes to the on-screen ordering,
    // that needs to be implemented here as well. Simply appending new stats does not
    // require a completely new section for the version - only reordering.

    // Starting with 1.39.0 OSD stats are reordered to match how they're presented on screen
    OSD.constants.STATISTIC_FIELDS = [
        F.RTC_DATE_TIME,
        F.TIMER_1,
        F.TIMER_2,
        F.MAX_SPEED,
        F.MAX_DISTANCE,
        F.MIN_BATTERY,
        F.END_BATTERY,
        F.STAT_BATTERY,
        F.MIN_RSSI,
        F.MAX_CURRENT,
        F.USED_MAH,
        F.MAX_ALTITUDE,
        F.BLACKBOX,
        F.BLACKBOX_LOG_NUMBER,
        F.MAX_G_FORCE,
        F.MAX_ESC_TEMP,
        F.MAX_ESC_RPM,
        F.MIN_LINK_QUALITY,
        F.FLIGHT_DISTANCE,
        F.MAX_FFT,
        F.STAT_TOTAL_FLIGHTS,
        F.STAT_TOTAL_FLIGHT_TIME,
        F.STAT_TOTAL_FLIGHT_DIST,
        F.MIN_RSSI_DBM,
    ];

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
        OSD.constants.STATISTIC_FIELDS = OSD.constants.STATISTIC_FIELDS.concat([F.USED_WH, F.MIN_RSNR]);
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
        OSD.constants.STATISTIC_FIELDS = OSD.constants.STATISTIC_FIELDS.concat([
            F.STAT_BEST_3_CONSEC_LAPS,
            F.STAT_BEST_LAP,
            F.STAT_FULL_THROTTLE_TIME,
            F.STAT_FULL_THROTTLE_COUNTER,
            F.STAT_AVG_THROTTLE,
        ]);
    }

    // Choose warnings
    // Nothing much to do here, I'm preempting there being new warnings
    F = OSD.constants.ALL_WARNINGS;

    OSD.constants.WARNINGS = [
        F.ARMING_DISABLED,
        F.BATTERY_NOT_FULL,
        F.BATTERY_WARNING,
        F.BATTERY_CRITICAL,
        F.VISUAL_BEEPER,
        F.CRASH_FLIP_MODE,
        F.ESC_FAIL,
        F.CORE_TEMPERATURE,
        F.RC_SMOOTHING_FAILURE,
        F.FAILSAFE,
        F.LAUNCH_CONTROL,
        F.GPS_RESCUE_UNAVAILABLE,
        F.GPS_RESCUE_DISABLED,
        F.RSSI,
        F.LINK_QUALITY,
        F.RSSI_DBM,
        F.OVER_CAP,
    ];

    OSD.constants.TIMER_TYPES = ["ON_TIME", "TOTAL_ARMED_TIME", "LAST_ARMED_TIME", "ON_ARM_TIME"];

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
        OSD.constants.WARNINGS = OSD.constants.WARNINGS.concat([F.RSNR]);
    }
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
        OSD.constants.WARNINGS = OSD.constants.WARNINGS.concat([F.LOAD]);
    }
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
        OSD.constants.WARNINGS = OSD.constants.WARNINGS.filter((w) => w.name !== "RC_SMOOTHING_FAILURE");
        OSD.constants.WARNINGS = OSD.constants.WARNINGS.concat([F.POSHOLD_FAILED]);
    }
};

OSD.updateDisplaySize = function () {
    let videoType = OSD.constants.VIDEO_TYPES[OSD.data.video_system];
    if (videoType === "AUTO") {
        videoType = "PAL";
    }

    // compute the size
    OSD.data.displaySize = {
        x: OSD.data.VIDEO_COLS[videoType],
        y: OSD.data.VIDEO_ROWS[videoType],
        total: null,
    };
};

OSD.msp = {
    /**
     * Note, unsigned 16 bit int for position ispacked:
     * 0: unused
     * v: visible flag
     * b: blink flag
     * y: y coordinate
     * x: x coordinate
     * p: profile
     * t: variant type
     * ttpp vbyy yyyx xxxx
     */
    helpers: {
        unpack: {
            position(bits, c) {
                const displayItem = {};

                const positionable = typeof c.positionable === "function" ? c.positionable() : c.positionable;
                const defaultPosition =
                    typeof c.defaultPosition === "function" ? c.defaultPosition() : c.defaultPosition;

                displayItem.positionable = positionable;

                OSD.updateDisplaySize();

                // size * y + x
                const xpos = ((bits >> 5) & 0x0020) | (bits & 0x001f);
                const ypos = (bits >> 5) & 0x001f;

                displayItem.position = positionable ? OSD.data.displaySize.x * ypos + xpos : defaultPosition;

                displayItem.isVisible = [];
                for (let osd_profile = 0; osd_profile < OSD.getNumberOfProfiles(); osd_profile++) {
                    displayItem.isVisible[osd_profile] = (bits & (OSD.constants.VISIBLE << osd_profile)) !== 0;
                }

                displayItem.variant = (bits & OSD.constants.VARIANTS) >> 14;

                return displayItem;
            },
            timer(bits) {
                return {
                    src: bits & 0x0f,
                    precision: (bits >> 4) & 0x0f,
                    alarm: (bits >> 8) & 0xff,
                };
            },
        },
    },
    processOsdElements(data, itemPositions) {
        // Now we have the number of profiles, process the OSD elements
        for (const item of itemPositions) {
            const j = data.displayItems.length;
            let c;
            let suffix;
            let ignoreSize = false;
            if (data.displayItems.length < OSD.constants.DISPLAY_FIELDS.length) {
                c = OSD.constants.DISPLAY_FIELDS[j];
            } else {
                c = OSD.constants.UNKNOWN_DISPLAY_FIELD;
                suffix = (1 + data.displayItems.length - OSD.constants.DISPLAY_FIELDS.length).toString();
                ignoreSize = true;
            }
            data.displayItems.push({
                name: c.name,
                text: c.text,
                textParams: suffix ? { 1: suffix } : undefined,
                desc: c.desc,
                index: j,
                draw_order: c.draw_order,
                preview: suffix ? c.preview + suffix : c.preview,
                variants: c.variants,
                ignoreSize,
                ...this.helpers.unpack.position(item, c),
            });
        }

        // Generate OSD element previews and positionable that are defined by a function
        for (const item of data.displayItems) {
            if (typeof item.preview === "function") {
                item.preview = item.preview(data);
            }
        }
    },
    // Currently only parses MSP_MAX_OSD responses, add a switch on payload.code if more codes are handled
    decode(payload) {
        const view = payload.data;
        const d = OSD.data;

        let displayItemsCountActual = OSD.constants.DISPLAY_FIELDS.length;

        d.flags = view.readU8();

        if (d.flags > 0 && payload.length > 1) {
            d.video_system = view.readU8();
            if (bit_check(d.flags, 0)) {
                d.unit_mode = view.readU8();
                d.alarms = {};
                d.alarms["rssi"] = {
                    display_name: i18n.getMessage("osdTimerAlarmOptionRssi"),
                    value: view.readU8(),
                    min: 0,
                    max: 100,
                };
                d.alarms["cap"] = {
                    display_name: i18n.getMessage("osdTimerAlarmOptionCapacity"),
                    value: view.readU16(),
                    min: 0,
                    max: 20000,
                };
                // This value was obsoleted by the introduction of configurable timers, and has been reused to encode the number of display elements sent in this command
                view.readU8();
                displayItemsCountActual = view.readU8();

                d.alarms["alt"] = {
                    display_name: i18n.getMessage("osdTimerAlarmOptionAltitude"),
                    value: view.readU16(),
                    min: 0,
                    max: 10000,
                };
            }
        }

        d.state = {};
        d.state.haveSomeOsd = d.flags !== 0;
        d.state.haveMax7456Configured = bit_check(d.flags, 4);
        d.state.haveFrSkyOSDConfigured = bit_check(d.flags, 3);
        d.state.haveMax7456FontDeviceConfigured = d.state.haveMax7456Configured || d.state.haveFrSkyOSDConfigured;
        d.state.haveAirbotTheiaOsdDevice = bit_check(d.flags, 7) && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47);
        d.state.isMax7456FontDeviceDetected = bit_check(d.flags, 5);
        d.state.haveOsdFeature = bit_check(d.flags, 0);
        d.state.isOsdSlave = bit_check(d.flags, 1);
        d.state.isMspDevice = bit_check(d.flags, 6) && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45);

        d.displayItems = [];
        d.statItems = [];
        d.warnings = [];
        d.timers = [];

        d.parameters = {};
        d.parameters.overlayRadioMode = 0;
        d.parameters.cameraFrameWidth = 24;
        d.parameters.cameraFrameHeight = 11;

        // Read display element positions, the parsing is done later because we need the number of profiles
        const itemsPositionsRead = [];
        while (view.offset < view.byteLength && itemsPositionsRead.length < displayItemsCountActual) {
            const v = view.readU16();
            itemsPositionsRead.push(v);
        }

        // Parse statistics display enable
        const expectedStatsCount = view.readU8();
        if (expectedStatsCount !== OSD.constants.STATISTIC_FIELDS.length) {
            console.error(
                `Firmware is transmitting a different number of statistics (${expectedStatsCount}) to what the configurator ` +
                    `is expecting (${OSD.constants.STATISTIC_FIELDS.length})`,
            );
        }

        for (let i = 0; i < expectedStatsCount; i++) {
            const v = view.readU8();

            // Known statistics field
            if (i < OSD.constants.STATISTIC_FIELDS.length) {
                const c = OSD.constants.STATISTIC_FIELDS[i];
                d.statItems.push({
                    name: c.name,
                    text: c.text,
                    desc: c.desc,
                    index: i,
                    enabled: v === 1,
                });

                // Read all the data for any statistics we don't know about
            } else {
                const statisticNumber = i - OSD.constants.STATISTIC_FIELDS.length + 1;
                d.statItems.push({
                    name: "UNKNOWN",
                    text: "osdTextStatUnknown",
                    textParams: { 1: statisticNumber },
                    desc: "osdDescStatUnknown",
                    index: i,
                    enabled: v === 1,
                });
            }
        }

        // Parse configurable timers
        let expectedTimersCount = view.readU8();
        while (view.offset < view.byteLength && expectedTimersCount > 0) {
            const v = view.readU16();
            const j = d.timers.length;
            d.timers.push({ index: j, ...this.helpers.unpack.timer(v) });
            expectedTimersCount--;
        }
        // Read all the data for any timers we don't know about
        while (expectedTimersCount > 0) {
            view.readU16();
            expectedTimersCount--;
        }

        // Parse enabled warnings
        view.readU16(); // obsolete
        const warningCount = view.readU8();
        // the flags were replaced with a 32bit version
        const warningFlags = view.readU32();

        for (let i = 0; i < warningCount; i++) {
            const enabled = (warningFlags & (1 << i)) !== 0;

            // Known warning field
            if (i < OSD.constants.WARNINGS.length) {
                const warning = { ...OSD.constants.WARNINGS[i], enabled, index: i };
                d.warnings.push(warning);

                // Push Unknown Warning field
            } else {
                const warningNumber = i - OSD.constants.WARNINGS.length + 1;
                d.warnings.push({
                    name: "UNKNOWN",
                    text: "osdWarningTextUnknown",
                    textParams: { 1: warningNumber },
                    desc: "osdWarningUnknown",
                    enabled,
                    index: i,
                });
            }
        }

        // OSD profiles
        d.osd_profiles.number = view.readU8();
        d.osd_profiles.selected = view.readU8() - 1;

        // Overlay radio mode
        d.parameters.overlayRadioMode = view.readU8();

        // Camera frame size
        d.parameters.cameraFrameWidth = view.readU8();
        d.parameters.cameraFrameHeight = view.readU8();

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            d.alarms["link_quality"] = {
                display_name: i18n.getMessage("osdTimerAlarmOptionLinkQuality"),
                value: view.readU16(),
                min: 0,
                max: 100,
            };
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            d.alarms["rssi_dbm"] = {
                display_name: i18n.getMessage("osdTimerAlarmOptionRssiDbm"),
                value: view.read16(),
                min: -130,
                max: 0,
            };
        }

        this.processOsdElements(d, itemsPositionsRead);

        OSD.updateDisplaySize();
    },
    decodeVirtual() {
        const d = OSD.data;

        d.displayItems = [];
        d.statItems = [];
        d.warnings = [];
        d.timers = [];

        // Parse statistics display enable
        const expectedStatsCount = OSD.constants.STATISTIC_FIELDS.length;

        for (let i = 0; i < expectedStatsCount; i++) {
            const v = OSD.virtualMode.statisticsState[i] ? 1 : 0;

            // Known statistics field
            if (i < expectedStatsCount) {
                const c = OSD.constants.STATISTIC_FIELDS[i];
                d.statItems.push({
                    name: c.name,
                    text: c.text,
                    desc: c.desc,
                    index: i,
                    enabled: v === 1,
                });

                // Read all the data for any statistics we don't know about
            } else {
                const statisticNumber = i - expectedStatsCount + 1;
                d.statItems.push({
                    name: "UNKNOWN",
                    text: "osdTextStatUnknown",
                    textParams: { 1: statisticNumber },
                    desc: "osdDescStatUnknown",
                    index: i,
                    enabled: v === 1,
                });
            }
        }

        // Parse configurable timers
        const expectedTimersCount = 3;
        for (let i = 0; i < expectedTimersCount; i++) {
            d.timers.push({ index: i, ...OSD.virtualMode.timerData[i] });
        }

        // Parse enabled warnings
        const warningCount = OSD.constants.WARNINGS.length;
        const warningFlags = OSD.virtualMode.warningFlags;

        for (let i = 0; i < warningCount; i++) {
            const enabled = (warningFlags & (1 << i)) !== 0;

            // Known warning field
            if (i < warningCount) {
                const warning = { ...OSD.constants.WARNINGS[i], enabled, index: i };
                d.warnings.push(warning);

                // Push Unknown Warning field
            } else {
                const warningNumber = i - warningCount + 1;
                d.warnings.push({
                    name: "UNKNOWN",
                    text: "osdWarningTextUnknown",
                    textParams: { 1: warningNumber },
                    desc: "osdWarningUnknown",
                    enabled,
                    index: i,
                });
            }
        }

        this.processOsdElements(OSD.data, OSD.virtualMode.itemPositions);

        OSD.updateDisplaySize();
    },
};

export { OSD };
