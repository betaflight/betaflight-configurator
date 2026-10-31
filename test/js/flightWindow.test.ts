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
import { calculateFlightWindow, localDate, type FlightWindow } from "../../src/js/utils/flightWindow";

const hours = (window: FlightWindow) => (window.end - window.start) / 3_600_000;
const daylightHours = (window: FlightWindow) =>
    window.daylight.reduce((total, period) => total + (period.end - period.start) / 3_600_000, 0);
const format = (time: number, timeZone: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(time);

function expectContinuous(window: FlightWindow) {
    expect(window.periods[0].start).toBe(window.start);
    expect(window.periods.at(-1)?.end).toBe(window.end);
    for (const [i, period] of window.periods.entries()) {
        expect(Number.isFinite(period.start)).toBe(true);
        expect(Number.isFinite(period.end)).toBe(true);
        expect(period.end).toBeGreaterThan(period.start);
        if (i) expect(period.start).toBe(window.periods[i - 1].end);
    }
    for (const periods of [window.daylight, window.civilTwilight]) {
        for (const [i, period] of periods.entries()) {
            expect(period.start).toBeGreaterThanOrEqual(window.start);
            expect(period.end).toBeLessThanOrEqual(window.end);
            expect(period.end).toBeGreaterThan(period.start);
            if (i) expect(period.start).toBeGreaterThanOrEqual(periods[i - 1].end);
        }
    }
}

describe("flight window calculations", () => {
    it("uses the selected zone's calendar date, including either side of the date line", () => {
        const instant = new Date("2026-06-21T10:30:00Z");
        expect(localDate(instant, "Pacific/Kiritimati")).toBe("2026-06-22");
        expect(localDate(instant, "Pacific/Pago_Pago")).toBe("2026-06-20");
    });

    it("calculates Berlin summer and winter instead of reusing sample times", () => {
        const summer = calculateFlightWindow(52.52, 13.405, "2026-06-21", "Europe/Berlin")!;
        const winter = calculateFlightWindow(52.52, 13.405, "2026-12-21", "Europe/Berlin")!;
        expect(daylightHours(summer)).toBeGreaterThan(16.8);
        expect(daylightHours(winter)).toBeLessThan(7.7);
        expect(format(summer.sunEvents[0].time, summer.timeZone)).toBe("04:43");
        expect(format(winter.sunEvents[0].time, winter.timeZone)).toBe("08:14");
        expect(summer.periods.map((period) => period.kind)).toEqual([
            "night",
            "blue",
            "golden",
            "day",
            "golden",
            "blue",
            "night",
        ]);
        for (const window of [summer, winter]) expectContinuous(window);
    });

    it.each([
        ["America/New_York", 40.71, -74.01, "2026-03-08", 23, "2026-03-08T05:00:00Z"],
        ["America/New_York", 40.71, -74.01, "2026-11-01", 25, "2026-11-01T04:00:00Z"],
        ["Australia/Lord_Howe", -31.55, 159.08, "2026-10-04", 23.5, "2026-10-03T13:30:00Z"],
        ["Australia/Lord_Howe", -31.55, 159.08, "2026-04-05", 24.5, "2026-04-04T13:00:00Z"],
        ["Asia/Kathmandu", 27.72, 85.32, "2026-06-21", 24, "2026-06-20T18:15:00Z"],
        ["Pacific/Kiritimati", 1.87, -157.4, "2026-06-21", 24, "2026-06-20T10:00:00Z"],
    ])("handles civil-day boundaries in %s on %s", (zone, lat, lon, date, length, start) => {
        const window = calculateFlightWindow(lat, lon, date, zone)!;
        expect(hours(window)).toBe(length);
        expect(window.start).toBe(Date.parse(start));
        expect(localDate(new Date(window.start), zone)).toBe(date);
        expect(localDate(new Date(window.end - 1), zone)).toBe(date);
        expect(localDate(new Date(window.end), zone)).not.toBe(date);
        expectContinuous(window);
        expect(window.ticks[0].time).toBe(window.start);
        expect(window.ticks.at(-1)?.time).toBe(window.end);
        for (const tick of window.ticks.slice(1, -1)) expect(format(tick.time, zone)).toBe(tick.label);
    });

    it("preserves real elapsed spacing across a repeated hour", () => {
        const window = calculateFlightWindow(52.52, 13.405, "2026-10-25", "Europe/Berlin")!;
        const four = window.ticks.find((tick) => tick.label === "04:00")!;
        expect((four.time - window.start) / 3_600_000).toBe(5);
        expect(window.ticks.filter((tick) => tick.label === "02:00")).toHaveLength(2);
    });

    it("places ticks on local hours in quarter-hour-offset timezones", () => {
        const window = calculateFlightWindow(27.72, 85.32, "2026-06-21", "Asia/Kathmandu")!;
        expect(window.ticks.map((tick) => tick.label)).toContain("04:00");
        expect(window.ticks.map((tick) => tick.label)).toContain("08:00");
    });

    it("classifies twilight at the start of a day from the Sun's altitude", () => {
        const window = calculateFlightWindow(60, 0, "2026-06-02", "UTC")!;
        expect(window.periods[0]).toMatchObject({ start: window.start, kind: "blue", phase: "preflightMorning" });
        expect(window.sunEvents[0].label).toBe("preflightSunrise");
    });

    it("uses elapsed time for a 26-hour local day at 85 degrees south", () => {
        const window = calculateFlightWindow(-85, 0, "2026-10-25", "Antarctica/Troll")!;
        expect(hours(window)).toBe(26);
        expect(daylightHours(window)).toBe(26);
        expect(window.ticks.filter((tick) => tick.label === "02:00")).toHaveLength(2);
        expectContinuous(window);
    });

    it("shows polar daylight without inventing sunrise or sunset", () => {
        const window = calculateFlightWindow(69.65, 18.96, "2026-06-21", "Europe/Oslo")!;
        expect(window.sunEvents).toEqual([]);
        expect(daylightHours(window)).toBe(24);
        expect(window.periods.some((period) => period.kind === "night")).toBe(false);
        expect(window.periods.some((period) => period.kind === "golden")).toBe(true);
        expectContinuous(window);
    });

    it("keeps daylight when the Sun stays above the horizon near a seasonal pole transition", () => {
        const window = calculateFlightWindow(89.9, 0, "2026-09-06", "UTC")!;
        expect(window.sunEvents).toEqual([]);
        expect(daylightHours(window)).toBe(24);
        expect(window.periods).toEqual([{ start: window.start, end: window.end, kind: "day", phase: "" }]);
    });

    it("keeps twilight and low-sun golden periods during polar night", () => {
        const window = calculateFlightWindow(69.65, 18.96, "2026-12-21", "Europe/Oslo")!;
        expect(window.sunEvents).toEqual([]);
        expect(daylightHours(window)).toBe(0);
        expect(window.civilTwilight).toHaveLength(1);
        expect(window.periods.some((period) => period.kind === "day")).toBe(false);
        expect(window.periods.filter((period) => period.kind === "blue")).toHaveLength(2);
        expectContinuous(window);
    });

    it("clips daylight across civil midnight without a negative-width segment", () => {
        const window = calculateFlightWindow(64.15, -21.94, "2026-06-21", "Atlantic/Reykjavik")!;
        expect(window.daylight).toHaveLength(2);
        expect(window.daylight[0].start).toBe(window.start);
        expect(window.daylight[1].end).toBe(window.end);
        expectContinuous(window);
    });

    it.each([90, -90])("handles the geographic pole at latitude %s", (latitude) => {
        for (const date of ["2026-03-20", "2026-06-21", "2026-09-22", "2026-12-21"]) {
            const window = calculateFlightWindow(latitude, 0, date, "UTC")!;
            expectContinuous(window);
            expect(daylightHours(window)).toBeGreaterThanOrEqual(0);
            expect(daylightHours(window)).toBeLessThanOrEqual(24);
        }
    });

    it("marks seasonal sunrise at the pole instead of labelling the whole day as polar daylight", () => {
        const window = calculateFlightWindow(90, 0, "2026-03-18", "UTC")!;
        expect(daylightHours(window)).toBeGreaterThan(11);
        expect(daylightHours(window)).toBeLessThan(13);
        expect(window.sunEvents).toHaveLength(1);
        expect(window.sunEvents[0].label).toBe("preflightSunrise");
        expect(window.sunEvents[0].time).toBe(window.daylight[0].start);
        expect(window.periods).toHaveLength(1);
        expect(window.periods[0].phase).toBe("");
    });

    it("does not invent a date that was skipped by a timezone change", () => {
        expect(calculateFlightWindow(-13.8, -171.8, "2011-12-30", "Pacific/Apia")).toBeNull();
    });

    it("rejects invalid coordinates, dates and timezone data", () => {
        expect(calculateFlightWindow(NaN, 0, "2026-06-21", "UTC")).toBeNull();
        expect(calculateFlightWindow(91, 0, "2026-06-21", "UTC")).toBeNull();
        expect(calculateFlightWindow(0, 181, "2026-06-21", "UTC")).toBeNull();
        expect(calculateFlightWindow(0, 0, "2026-02-30", "UTC")).toBeNull();
        expect(calculateFlightWindow(0, 0, "2026-06-21", "invalid-zone")).toBeNull();
    });
});
