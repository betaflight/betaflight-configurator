/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

/*
 * WARNING: This is an auto-generated file, please do not edit directly!
 *
 * Generator    : `scripts/generate-build-options.mjs`
 * Source       : https://build.betaflight.com/api/options/2026.12
 * Input hash   : 305e9e75314878377cbadd2550bf4802
 */

export const FIRMWARE_BUILD_OPTIONS = {
    // Radio Protocols
    USE_SERIALRX_CRSF: 4097,
    USE_SERIALRX_FPORT: 4098,
    USE_SERIALRX_GHST: 4099,
    USE_SERIALRX_IBUS: 4100,
    USE_SERIALRX_JETIEXBUS: 4101,
    USE_SERIALRX_MAVLINK: 4109,
    USE_RX_PPM: 4102,
    USE_SERIALRX_SBUS: 4103,
    USE_SERIALRX_SPEKTRUM: 4104,
    USE_SERIALRX_SRXL2: 4105,
    USE_SERIALRX_SUMD: 4106,
    USE_SERIALRX_SUMH: 4107,
    USE_SERIALRX_XBUS: 4108,

    // Telemetry Protocols
    USE_TELEMETRY_FRSKY_HUB: 12301,
    USE_TELEMETRY_HOTT: 12302,
    USE_TELEMETRY_IBUS_EXTENDED: 12303,
    USE_TELEMETRY_LTM: 12304,
    USE_TELEMETRY_MAVLINK: 12305,
    USE_TELEMETRY_SMARTPORT: 12306,
    USE_TELEMETRY_SRXL: 12307,

    // General Options
    USE_ACRO_TRAINER: 16404,
    USE_AKK_SMARTAUDIO: 16405,
    USE_ALTITUDE_HOLD: 16422,
    USE_BATTERY_CONTINUE: 16406,
    USE_CAMERA_CONTROL: 16407,
    USE_CHIRP: 16426,
    USE_DASHBOARD: 16408,
    USE_DRONECAN: 16430,
    USE_EMFAT_TOOLS: 16409,
    USE_ESCSERIAL_SIMONK: 16410,
    USE_FLIGHT_PLAN: 16427,
    USE_GPS: 16412,
    USE_LED_STRIP: 16413,
    USE_LED_STRIP_64: 16414,
    USE_MAG: 16415,
    USE_OPTICALFLOW: 16428,
    USE_OSD_SD: 16416,
    USE_OSD_HD: 16417,
    USE_FRSKYOSD: 16411,
    USE_PINIO: 16418,
    USE_POSITION_HOLD: 16425,
    USE_RACE_PRO: 16419,
    USE_RANGEFINDER: 16429,
    USE_SOFTSERIAL: 16423,
    USE_SERVOS: 16420,
    USE_VTX: 16421,
    USE_WING: 16424,

    // Motor Protocols
    USE_BRUSHED: 8230,
    USE_DRONECAN_ESC: 8236,
    USE_DSHOT: 8231,
    USE_MULTISHOT: 8232,
    USE_ONESHOT: 8233,
    USE_PROSHOT: 8234,
    USE_PWM_OUTPUT: 8235,
    USE_PSAS: 16424, // TODO: set actual value from firmware build after firmwares PSAS PR merging
};
