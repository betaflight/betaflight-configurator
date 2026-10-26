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
import { getVisibleAlarmEntries } from "../../../src/components/tabs/osd/osd_alarms";

describe("OSD alarm entries", () => {
    const alarms = {
        rssi: { value: 20 },
        cap: { value: 2200 },
        alt: { value: 100 },
    };

    it("shows capacity alarm for legacy firmware behaviour", () => {
        expect(getVisibleAlarmEntries(alarms, false).map((entry) => entry.key)).toEqual(["rssi", "cap", "alt"]);
    });

    it("hides capacity alarm when battery profile capacity owns OSD capacity warnings", () => {
        expect(getVisibleAlarmEntries(alarms, true).map((entry) => entry.key)).toEqual(["rssi", "alt"]);
    });

    it("pairs each key with its alarm object, not a copy", () => {
        const [first] = getVisibleAlarmEntries(alarms);

        expect(first.alarm).toBe(alarms.rssi);
    });

    it("handles missing alarm data", () => {
        expect(getVisibleAlarmEntries(null, true)).toEqual([]);
        expect(getVisibleAlarmEntries(undefined)).toEqual([]);
    });

    it("gives no entries for the empty array OSD.data.alarms starts out as", () => {
        const beforeFirstDecode = [] as unknown as Record<string, { value: number }>;

        expect(getVisibleAlarmEntries(beforeFirstDecode)).toEqual([]);
    });
});
