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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ALTITUDE_TRAIL_COLORS, MapGrapher } from "../../src/blackbox-viewer/graph_map";
import type { FlightLog, LogFrame } from "../../src/blackbox-viewer/flightlog";
import { useSettingsStore } from "../../src/blackbox-viewer/stores/settings";

// Frames are [iteration, time, lat, lng, alt, course]; the log's field indexes below match.
const FIELDS: Record<string, number> = {
    "GPS_coord[0]": 2,
    "GPS_coord[1]": 3,
    GPS_altitude: 4,
    GPS_ground_course: 5,
};
const frame = (...fields: (number | null)[]): LogFrame => [0, 0, ...fields];
const GPS = (alt: number): LogFrame => frame(473000000, 85000000, alt, 900);

type Call = [name: string, ...args: unknown[]];

/** A Leaflet that only records what it is asked to draw. */
function fakeLeaflet(calls: Call[]) {
    const record =
        (name: string) =>
        (...args: unknown[]) => {
            calls.push([name, ...args]);
            return { addTo: () => ({}), getBounds: () => ({}) };
        };
    return {
        icon: record("icon"),
        map: record("map"),
        tileLayer: record("tileLayer"),
        polyline: record("polyline"),
        multiOptionsPolyline: record("multiOptionsPolyline"),
        marker: record("marker"),
        rotatedMarker: record("rotatedMarker"),
        circle: record("circle"),
        latLng: (lat: number, lng: number, alt: number) => ({ lat, lng, alt }),
    };
}

/**
 * Only what MapGrapher reads. Lacks everything else a FlightLog does: no parsing, no
 * smoothing, and getChunksInTimeRange ignores the range and returns the given chunks.
 */
function fakeLog(chunks: LogFrame[][], logIndex = 0, homeMin: number[] = [473000000, 85000000]) {
    const getChunksInTimeRange = vi.fn(() => chunks.map((frames) => ({ frames })));
    const log = {
        getSysConfig: () => ({ "Log start datetime": "2026-01-01" }),
        getLogIndex: () => logIndex,
        getMainFieldIndexByName: (name: string) => FIELDS[name],
        getMinTime: () => 0,
        getMaxTime: () => 1,
        getChunksInTimeRange,
        getStats: () => ({ frame: { H: { field: homeMin.map((min) => ({ min, max: min + 1 })) } } }),
    } as unknown as FlightLog;
    return { log, getChunksInTimeRange };
}

describe("MapGrapher", () => {
    let calls: Call[];
    let map: MapGrapher;

    beforeEach(() => {
        setActivePinia(createPinia());
        calls = [];
        vi.stubGlobal("L", fakeLeaflet(calls));
        map = new MapGrapher();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.innerHTML = "";
    });

    const callsTo = (name: string) => calls.filter(([n]) => n === name);

    it("turns a frame's raw coordinates into degrees and metres", () => {
        expect(map.getCoordinatesFromFrame(GPS(125), 2, 3, 4)).toEqual({ lat: 47.3, lng: 8.5, alt: 12.5 });
    });

    it("gives no coordinates for a frame without a numeric position", () => {
        expect(map.getCoordinatesFromFrame(frame(null, 85000000, 1), 2, 3, 4)).toBeNull();
        expect(map.getCoordinatesFromFrame(frame(473000000, Number.NaN, 1), 2, 3, 4)).toBeNull();
        expect(map.getCoordinatesFromFrame(GPS(1), undefined, 3, 4)).toBeNull();
    });

    it("keeps the position when the altitude is missing: null reads as 0, no field as NaN", () => {
        expect(map.getCoordinatesFromFrame(frame(1, 2, null), 2, 3, 4)).toMatchObject({ alt: 0 });
        expect(map.getCoordinatesFromFrame(frame(1, 2, 3), 2, 3, undefined)?.alt).toBeNaN();
    });

    it("reads the ground course in tenths of a degree, or 0 when there is none", () => {
        expect(map.getGroundCourseFromFrame(GPS(0), 5)).toBe(90);
        expect(map.getGroundCourseFromFrame(frame(1, 2, 3, null), 5)).toBe(0);
        expect(map.getGroundCourseFromFrame(GPS(0), undefined)).toBe(0);
    });

    it("takes the home position from the minimum of the H frame fields", () => {
        const { log } = fakeLog([], 0, [473000000, 85000000]);
        expect(map.getHomeCoordinatesFromFlightLog(log)).toEqual([47.3, 8.5]);
    });

    it("throws for a log with no H frames, as it always has", () => {
        const log = { getStats: () => ({ frame: {} }) } as unknown as FlightLog;
        expect(() => map.getHomeCoordinatesFromFlightLog(log)).toThrow(TypeError);
    });

    it("colours the trail in equal altitude bands, each upper bound inclusive", () => {
        map.createAltitudeColoredPolyline([], 54, 5);

        const [, latlngs, options] = callsTo("multiOptionsPolyline")[0] as [string, unknown[], Record<string, unknown>];
        const { optionIdxFn, options: colors } = options.multiOptions as {
            optionIdxFn: (p: { alt: number }) => number;
            options: unknown;
        };
        expect(latlngs).toEqual([]);
        expect(colors).toBe(ALTITUDE_TRAIL_COLORS);
        // 7 bands of 7 m above 5 m: the thresholds are 12, 19, ... 54.
        const band = (alt: number) => optionIdxFn({ alt });
        expect([band(5), band(12), band(12.5), band(19), band(54), band(54.5)]).toEqual([0, 0, 1, 1, 6, 7]);
    });

    it("samples every 4th frame, counting frames without a position, over the full altitude range", () => {
        const noFix = frame(null, null, 0);
        // Counted frames 0..8 over two chunks; 0, 4 and 8 are drawn. The lowest (5 m)
        // and highest (54 m) are on frames that are not.
        const chunks = [
            [GPS(100), GPS(540), noFix, GPS(50)],
            [GPS(200), GPS(300), GPS(310), noFix, GPS(400)],
        ];
        map.setFlightLog(fakeLog(chunks).log);

        const [, latlngs] = callsTo("polyline")[0] as [string, { alt: number }[]];
        expect(latlngs.map((p) => p.alt)).toEqual([10, 20, 40]);
        const [, , options] = callsTo("multiOptionsPolyline")[0] as [string, unknown, Record<string, unknown>];
        const { optionIdxFn } = options.multiOptions as { optionIdxFn: (p: { alt: number }) => number };
        expect([optionIdxFn({ alt: 12 }), optionIdxFn({ alt: 12.5 }), optionIdxFn({ alt: 54 })]).toEqual([0, 1, 6]);
    });

    it("draws nothing and marks the container for a log with no GPS data", () => {
        document.body.innerHTML = '<div id="mapContainer"></div>';
        map.setFlightLog(fakeLog([[frame(null, null, null)]]).log);

        expect(callsTo("polyline")).toEqual([]);
        expect(document.getElementById("mapContainer")?.classList.contains("no-gps-data")).toBe(true);
    });

    it("skips a log index it has already processed", () => {
        const first = fakeLog([[GPS(100)]], 0);
        map.setFlightLog(first.log);
        map.setFlightLog(first.log);
        expect(first.getChunksInTimeRange).toHaveBeenCalledTimes(1);

        const other = fakeLog([[GPS(100)]], 1);
        map.setFlightLog(other.log);
        expect(other.getChunksInTimeRange).toHaveBeenCalledTimes(1);
    });

    it("sizes and places the map container as a percentage of the viewer", () => {
        document.body.innerHTML = '<div id="mapContainer"></div>';
        useSettingsStore().userSettings.map = { size: "50%", left: "10%", top: "20%" };

        map.resize(1000, 400);

        const { style } = document.getElementById("mapContainer") as HTMLElement;
        expect([style.width, style.height, style.left, style.top]).toEqual(["500px", "200px", "100px", "80px"]);
    });
});
