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

import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { FlightLog } from "../../src/blackbox-viewer/flightlog";
import { useSettingsStore } from "../../src/blackbox-viewer/stores/settings";
import { mixedLog } from "./syntheticLog";
import { FlightLogFieldPresenter } from "../../src/blackbox-viewer/flightlog_fields_presenter";
import {
    adjustFieldDefsList,
    FIRMWARE_TYPE_BETAFLIGHT,
    FLIGHT_LOG_FLIGHT_MODE_NAME,
} from "../../src/blackbox-viewer/flightlog_fielddefs";

// `flightModeFlags` carries the firmware's rcModeActivationMask, so bit 31 is a real
// mode: PREARM on 2025.12, CRASHFLIP on 2026.6. presentFlags used a signed `>>=`,
// which coerces to int32 and turns a set bit 31 negative, ending the `flags > 0` loop
// after one iteration and silently hiding every other flag. A pilot flying 2025.12
// with a toggle PREARM switch sees the mode field read "ARM" for the whole log.
// These pin the high bit down.

// A stand-in table, long enough for a 32-bit field like every resolved table is.
const NAMES = Array.from({ length: 40 }, (_, i) => `B${i}`);

describe("presentFlags", () => {
    it("reports no flags for zero", () => {
        expect(FlightLogFieldPresenter.presentFlags(0, NAMES)).toBe("0");
    });

    it("decodes low bits", () => {
        expect(FlightLogFieldPresenter.presentFlags(0x00100001, NAMES)).toBe("B0|B20");
    });

    it("keeps the remaining flags when bit 31 is set", () => {
        expect(FlightLogFieldPresenter.presentFlags(0x80100001, NAMES)).toBe("B0|B20|B31");
    });

    it("does not report an empty set when only high bits are set", () => {
        expect(FlightLogFieldPresenter.presentFlags(0x80000000, NAMES)).toBe("B31");
        expect(FlightLogFieldPresenter.presentFlags(0x80000002, NAMES)).toBe("B1|B31");
    });

    it("decodes every bit of a full mask", () => {
        const all = Array.from({ length: 32 }, (_, i) => `B${i}`).join("|");
        expect(FlightLogFieldPresenter.presentFlags(0xffffffff, NAMES)).toBe(all);
    });

    it("names the real 2025.12 bit 31 alongside ARM", () => {
        adjustFieldDefsList(FIRMWARE_TYPE_BETAFLIGHT, "2025.12.0");
        expect(FlightLogFieldPresenter.presentFlags(0x80000001, FLIGHT_LOG_FLIGHT_MODE_NAME)).toBe("ARM|PREARM");
    });

    // 2026.6 inserts AUTOPILOT after GPSRESCUE, which shifts the table up one and
    // moves FLIPOVERAFTERCRASH (firmware BOXCRASHFLIP) into bit 31.
    it("names the real 2026.6 bit 31 alongside ARM", () => {
        adjustFieldDefsList(FIRMWARE_TYPE_BETAFLIGHT, "2026.6.0");
        expect(FlightLogFieldPresenter.presentFlags(0x80000001, FLIGHT_LOG_FLIGHT_MODE_NAME)).toBe(
            "ARM|FLIPOVERAFTERCRASH",
        );
    });

    // 4.0 dropped BARO, GPSHOME and GPSHOLD from boxId_e, which pulls BOXPARALYZE
    // down to boxId 31 for the whole 4.0-4.5 range. PARALYZE is a sticky mode
    // (rc_modes.c puts it in stickyModes), so once the switch fires the bit latches
    // until the next power cycle and the mode field carries it for the rest of the log.
    it("names the real 4.0 bit 31 alongside ARM", () => {
        adjustFieldDefsList(FIRMWARE_TYPE_BETAFLIGHT, "4.0.0");
        expect(FlightLogFieldPresenter.presentFlags(0x80000001, FLIGHT_LOG_FLIGHT_MODE_NAME)).toBe("ARM|PARALYZE");
    });

    it("names the real 4.5 bit 31 alongside ARM", () => {
        adjustFieldDefsList(FIRMWARE_TYPE_BETAFLIGHT, "4.5.0");
        expect(FlightLogFieldPresenter.presentFlags(0x80000001, FLIGHT_LOG_FLIGHT_MODE_NAME)).toBe("ARM|PARALYZE");
    });

    // On 3.5 PARALYZE sits past boxId 31, outside the 32-bit field, so naming it
    // must not disturb what bit 31 resolves to there.
    it("leaves the 3.5 bit 31 as PREARM", () => {
        adjustFieldDefsList(FIRMWARE_TYPE_BETAFLIGHT, "3.5.0");
        expect(FlightLogFieldPresenter.presentFlags(0x80000001, FLIGHT_LOG_FLIGHT_MODE_NAME)).toBe("ARM|PREARM");
    });
});

function openLog(...extraHeader: string[]): FlightLog {
    const flightLog = new FlightLog(new Uint8Array(mixedLog(2, extraHeader).bytes));
    flightLog.openLog(0);
    return flightLog;
}

describe("decodeFieldToFriendly", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    const log = () => openLog("H minthrottle:1000", "H maxthrottle:2000", "H motor_pwm_protocol:0", "H acc_1G:2048");

    it("shows nothing for a field the frame does not have", () => {
        expect(FlightLogFieldPresenter.decodeFieldToFriendly(log(), "motor[0]", undefined)).toBe("");
    });

    it("formats each field in its unit", () => {
        const flightLog = log();
        const decode = (field: string, value: number) =>
            FlightLogFieldPresenter.decodeFieldToFriendly(flightLog, field, value);

        expect(decode("time", 61_234_000)).toBe("01:01.234");
        expect(decode("rcCommand[0]", 100)).toBe("1600 us");
        expect(decode("motor[0]", 1500)).toBe("50.00 %");
        expect(decode("axisP[0]", 255)).toBe("25.5 %");
        expect(decode("accSmooth[2]", 4096)).toBe("2.00 g");
        expect(decode("heading[0]", Math.PI)).toBe("180.0°");
        expect(decode("GPS_coord[0]", 525_000_000)).toBe("52.50000");
        expect(decode("rssi", 512)).toBe("50.00 %");
        expect(decode("someOtherField", 12.6)).toBe("13");
    });

    it("adds a decimal and divides by 10 for a high-resolution log", () => {
        const flightLog = openLog("H blackbox_high_resolution:1");

        expect(FlightLogFieldPresenter.decodeFieldToFriendly(flightLog, "rcCommand[3]", 1234)).toBe("123.4 us");
    });

    // A GPS slot is null until the first GPS frame; the arithmetic reads it as 0.
    it("reads a null slot as 0 where the value goes through arithmetic", () => {
        expect(FlightLogFieldPresenter.decodeFieldToFriendly(log(), "GPS_speed", null)).toBe("0.00 m/s");
    });

    it("follows the user's units for altitude and speed", () => {
        const flightLog = log();
        const settings = useSettingsStore();

        settings.userSettings.altitudeUnits = 2;
        settings.userSettings.speedUnits = 2;

        expect(FlightLogFieldPresenter.decodeFieldToFriendly(flightLog, "baroAlt", 1000)).toBe("32.80 ft");
        expect(FlightLogFieldPresenter.decodeFieldToFriendly(flightLog, "GPS_speed", 1000)).toBe("36.00 kph");
    });

    it("converts to chart units and back", () => {
        const flightLog = log();
        const there = (field: string, value: number) =>
            FlightLogFieldPresenter.ConvertFieldValue(flightLog, field, true, value);
        const back = (field: string, value: number) =>
            FlightLogFieldPresenter.ConvertFieldValue(flightLog, field, false, value);

        for (const [field, raw] of [
            ["rcCommand[1]", 120],
            ["motor[2]", 1500],
            ["GPS_altitude", 1234],
            ["heading[1]", 1],
            ["axisD[2]", 300],
        ] as const) {
            expect(back(field, there(field, raw))).toBeCloseTo(raw, 9);
        }
        expect(there("rcCommand[1]", 120)).toBe(1620);
        expect(there("flightModeFlags", 5)).toBe(5);
        expect(there("motor[0]", undefined as unknown as number)).toBe(0);
    });
});

describe("presenter helpers", () => {
    it("lists only the modes that changed, or ACRO when none did", () => {
        const names = ["ARM", "ANGLE", "HORIZON"];

        expect(FlightLogFieldPresenter.presentChangeEvent(0b011, 0b001, names)).toBe("ANGLE ON");
        expect(FlightLogFieldPresenter.presentChangeEvent(0b100, 0b011, names)).toBe("ARM OFF|ANGLE OFF|HORIZON ON");
        expect(FlightLogFieldPresenter.presentChangeEvent(0b001, 0b001, names)).toBe(" | ACRO");
    });

    it("names an enum value, or shows the number when it has no name", () => {
        expect(FlightLogFieldPresenter.presentEnum(1, ["IDLE", "RX_LOSS"])).toBe("RX_LOSS");
        expect(FlightLogFieldPresenter.presentEnum(7, ["IDLE", "RX_LOSS"])).toBe(7);
    });

    it("gives the friendly name of a field, or the field name itself", () => {
        expect(FlightLogFieldPresenter.fieldNameToFriendly("motor[0]")).toBe("Motor [1]");
        expect(FlightLogFieldPresenter.fieldNameToFriendly("notAField")).toBe("notAField");
    });

    it("writes altitude in metres or feet, and nothing for an unknown unit", () => {
        expect(FlightLogFieldPresenter.decodeCorrectAltitude(10, 1)).toBe("10.00 m");
        expect(FlightLogFieldPresenter.decodeCorrectAltitude(10, 2)).toBe("32.80 ft");
        expect(FlightLogFieldPresenter.decodeCorrectAltitude(10, 3)).toBeUndefined();
    });
});
