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

    it("handles missing alarm data", () => {
        expect(getVisibleAlarmEntries(null, true)).toEqual([]);
    });
});
