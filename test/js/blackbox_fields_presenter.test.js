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

import { describe, expect, it } from "vitest";
import { FlightLogFieldPresenter } from "../../src/blackbox-viewer/flightlog_fields_presenter.js";
import {
    adjustFieldDefsList,
    FIRMWARE_TYPE_BETAFLIGHT,
    FLIGHT_LOG_FLIGHT_MODE_NAME,
} from "../../src/blackbox-viewer/flightlog_fielddefs.js";

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
});
