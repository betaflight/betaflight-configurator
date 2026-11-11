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

import { getPosition } from "suncalc";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const DEGREES_TO_RADIANS = Math.PI / 180;

// Meeus atmospheric-refraction approximation constants used by SunCalc 2 (radians).
const REFRACTION_COEFFICIENT = 0.0002967;
const REFRACTION_ANGLE_OFFSET = 0.00312536;
const REFRACTION_DENOMINATOR_OFFSET = 0.08901179;

export interface LightWindow {
    start: number;
    end: number;
    kind: "night" | "blue" | "golden" | "day";
    phase: "" | "preflightMorning" | "preflightEvening";
}

export interface FlightWindow {
    start: number;
    end: number;
    date: string;
    timeZone: string;
    periods: LightWindow[];
    daylight: LightWindow[];
    civilTwilight: LightWindow[];
    sunEvents: { time: number; label: "preflightSunrise" | "preflightSunset" }[];
    ticks: { time: number; label: string; major: boolean }[];
}

export function localDate(date: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}

function refineExtremum(low: number, high: number, maximum: boolean, altitudeAt: (time: number) => number): number {
    while (high - low > 1000) {
        const a = low + (high - low) / 3;
        const b = high - (high - low) / 3;
        if (maximum ? altitudeAt(a) < altitudeAt(b) : altitudeAt(a) > altitudeAt(b)) low = a;
        else high = b;
    }
    return Math.round((low + high) / 2);
}

function findTurningPoints(start: number, end: number, altitudeAt: (time: number) => number): number[] {
    // Daily rise/set solutions become unreliable near polar transitions. Find crossings from
    // SunCalc's position instead. Refine the extrema so even short grazing windows are included.
    const samples = [];
    for (let time = start - 30 * MINUTE; time < end + 30 * MINUTE; time += 30 * MINUTE) {
        samples.push({ time, altitude: altitudeAt(time) });
    }
    samples.push({ time: end + 30 * MINUTE, altitude: altitudeAt(end + 30 * MINUTE) });
    const turningPoints = [start];
    for (let i = 1; i < samples.length - 1; i++) {
        const previous = samples[i - 1];
        const current = samples[i];
        const next = samples[i + 1];
        const maximum = current.altitude > previous.altitude && current.altitude > next.altitude;
        const minimum = current.altitude < previous.altitude && current.altitude < next.altitude;
        if (!maximum && !minimum) continue;
        const extremum = refineExtremum(previous.time, next.time, maximum, altitudeAt);
        if (extremum > start && extremum < end) turningPoints.push(extremum);
    }
    turningPoints.push(end);
    return turningPoints;
}

function windowsAbove(altitude: number, turningPoints: number[], altitudeAt: (time: number) => number): LightWindow[] {
    const start = turningPoints[0];
    const end = turningPoints[turningPoints.length - 1];
    // SunCalc 2 returns apparent altitude. Convert our geometric thresholds using its
    // Meeus refraction correction so they match the angles used by getTimes.
    const h = Math.max(0, altitude) * DEGREES_TO_RADIANS;
    const refraction =
        REFRACTION_COEFFICIENT /
        Math.tan(h + REFRACTION_ANGLE_OFFSET / (h + REFRACTION_DENOMINATOR_OFFSET)) /
        DEGREES_TO_RADIANS;
    const apparentThreshold = altitude + refraction;
    const isAbove = (time: number) => altitudeAt(time) > apparentThreshold;
    let up = isAbove(start);
    const windows: LightWindow[] = [];
    let cursor = start;
    for (let i = 1; i < turningPoints.length; i++) {
        let low = turningPoints[i - 1];
        let high = turningPoints[i];
        if (up === isAbove(high)) continue;
        while (high - low > 1000) {
            const middle = Math.floor((low + high) / 2);
            if (isAbove(middle) === up) low = middle;
            else high = middle;
        }
        if (up && high > cursor) windows.push({ start: cursor, end: high, kind: "day", phase: "" });
        cursor = high;
        up = !up;
    }
    if (up && cursor < end) windows.push({ start: cursor, end, kind: "day", phase: "" });
    return windows;
}

function buildPeriods(
    start: number,
    end: number,
    turningPoints: number[],
    altitudeAt: (time: number) => number,
): LightWindow[] {
    const blue = windowsAbove(-8, turningPoints, altitudeAt);
    const golden = windowsAbove(-4, turningPoints, altitudeAt);
    const day = windowsAbove(6, turningPoints, altitudeAt);
    const contains = (windows: LightWindow[], time: number) =>
        windows.some((window) => time >= window.start && time < window.end);
    const kindAt = (time: number): LightWindow["kind"] => {
        if (contains(day, time)) return "day";
        if (contains(golden, time)) return "golden";
        if (contains(blue, time)) return "blue";
        return "night";
    };
    const boundaries = [
        ...new Set([
            start,
            end,
            ...[blue, golden, day].flatMap((windows) => windows.flatMap((window) => [window.start, window.end])),
            ...turningPoints,
        ]),
    ]
        .filter((time) => time >= start && time <= end)
        .sort((a, b) => a - b);
    const periods: LightWindow[] = [];
    for (let i = 1; i < boundaries.length; i++) {
        const a = boundaries[i - 1];
        const b = boundaries[i];
        const middle = (a + b) / 2;
        const kind = kindAt(middle);
        let phase: LightWindow["phase"] = "";
        if (kind === "blue" || kind === "golden") {
            phase = altitudeAt(b) > altitudeAt(a) ? "preflightMorning" : "preflightEvening";
        }
        const previous = periods.at(-1);
        if (previous?.kind === kind && previous.phase === phase) previous.end = b;
        else periods.push({ start: a, end: b, kind, phase });
    }
    if (periods.length === 1) periods[0].phase = "";
    return periods;
}

function buildTicks(start: number, end: number, timeFormatter: Intl.DateTimeFormat): FlightWindow["ticks"] {
    const ticks: FlightWindow["ticks"] = [{ time: start, label: timeFormatter.format(start), major: true }];
    // Quarter-hour steps cover fractional-hour zones and clock changes.
    for (let time = start + 15 * MINUTE; time < end; time += 15 * MINUTE) {
        const label = timeFormatter.format(time);
        const [hour, minute] = label.split(":").map(Number);
        if (minute === 0 && hour % 2 === 0) ticks.push({ time, label, major: hour % 4 === 0 });
    }
    ticks.push({ time: end, label: "24:00", major: true });
    return ticks;
}

export function calculateFlightWindow(
    latitude: number,
    longitude: number,
    date: string,
    timeZone: string,
): FlightWindow | null {
    const noon = Date.parse(`${date}T12:00:00Z`);
    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180 ||
        !Number.isFinite(noon) ||
        new Date(noon).toISOString().slice(0, 10) !== date
    )
        return null;
    let dateFormatter: Intl.DateTimeFormat;
    let timeFormatter: Intl.DateTimeFormat;
    try {
        dateFormatter = new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
        timeFormatter = new Intl.DateTimeFormat("en-GB", {
            timeZone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        });
    } catch {
        return null;
    }
    const dateAt = (timestamp: number) => {
        const parts = dateFormatter.formatToParts(timestamp);
        return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
    };
    // Search calendar-date boundaries rather than assuming midnight exists or that a day has 24 hours.
    const boundary = (after: boolean) => {
        let low = noon - 2 * DAY;
        let high = noon + 2 * DAY;
        while (high - low > 1) {
            const middle = Math.floor((low + high) / 2);
            if (after ? dateAt(middle) > date : dateAt(middle) >= date) high = middle;
            else low = middle;
        }
        return high;
    };
    const start = boundary(false);
    const end = boundary(true);
    if (start === end) return null;

    const altitudeAt = (time: number) => getPosition(new Date(time), latitude, longitude).altitude;
    const turningPoints = findTurningPoints(start, end, altitudeAt);
    const daylight = windowsAbove(-0.833, turningPoints, altitudeAt);
    const civilTwilight = windowsAbove(-6, turningPoints, altitudeAt);
    const periods = buildPeriods(start, end, turningPoints, altitudeAt);
    const sunEvents: FlightWindow["sunEvents"] = daylight.flatMap((window) => [
        ...(window.start > start ? [{ time: window.start, label: "preflightSunrise" as const }] : []),
        ...(window.end < end ? [{ time: window.end, label: "preflightSunset" as const }] : []),
    ]);
    const ticks = buildTicks(start, end, timeFormatter);
    return { start, end, date, timeZone, periods, daylight, civilTwilight, sunEvents, ticks };
}
