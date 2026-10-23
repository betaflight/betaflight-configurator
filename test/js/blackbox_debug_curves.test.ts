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
import { GraphConfig } from "../../src/blackbox-viewer/graph_config";
import type { FlightLog } from "../../src/blackbox-viewer/flightlog";
import { getDebugModes } from "../../src/js/utils/debugModes";

// getDefaultCurveForField swallows every error and falls back to a +/-500 curve, so a missing
// import or a typo in the debug mode table degrades silently into a plausible looking graph
// instead of failing loudly. These tests pin the curves down instead.
const LOGGED_RANGE = { min: -123, max: 456 };

// A real log records the debug fields the firmware wrote, and the annotated axes
// ask which of them are present before putting a group of them on one axis. The
// default says all eight were recorded, all with the same range, so grouping a
// field with its neighbours cannot change what any existing case here asserts.
const ALL_DEBUG_FIELDS = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`debug[${index}]`, LOGGED_RANGE]));

type LoggedFields = Record<string, { min: number; max: number }>;

// Only the FlightLog members getDefaultCurveForField and the unit conversions call are faked: the stats,
// the main field table and the scaling helpers. Anything else (isFieldDisabled, getMinTime, ...) is absent.
function flightLogFor(
    apiVersion: string,
    debugMode: number,
    sysConfigOverrides: Record<string, unknown> = {},
    loggedFields: LoggedFields = ALL_DEBUG_FIELDS,
): FlightLog {
    return {
        getSysConfig: () => ({
            apiVersion,
            debug_mode: debugMode,
            rates_type: 0,
            rates: [7, 8, 9],
            blackbox_high_resolution: 0,
            motor_poles: 14,
            ...sysConfigOverrides,
        }),
        getMinMaxForFieldDuringAllTime: (field: string) => ({ ...(loggedFields[field] ?? LOGGED_RANGE) }),
        getMainFieldIndexByName: (name: string) => (loggedFields[name] === undefined ? undefined : 0),
        rcCommandRawToDegreesPerSecond: (value: number, axis: number) => value * (axis + 2) * 0.5,
        // The debug field unit conversions reach back into the flight log for hardware scaling.
        // Without these the conversion throws and the catch quietly hands back the fallback curve.
        gyroRawToDegreesPerSecond: (value: number) => value / 16.4,
        accRawToGs: (value: number) => value / 2048,
        rcCommandRawToThrottle: (value: number) => (value - 1000) / 10,
        ThrottleTorcCommandRaw: (value: number) => value * 10 + 1000,
        getMainFieldNames: () => [],
    } as unknown as FlightLog;
}

function curveFor(
    apiVersion: string,
    debugModeName: string,
    fieldName: string,
    sysConfigOverrides?: Record<string, unknown>,
    loggedFields?: LoggedFields,
) {
    const debugMode = getDebugModes(apiVersion).indexOf(debugModeName);
    expect(debugMode, `${debugModeName} is not a debug mode on API ${apiVersion}`).toBeGreaterThan(-1);
    return GraphConfig.getDefaultCurveForField(
        flightLogFor(apiVersion, debugMode, sysConfigOverrides, loggedFields),
        fieldName,
    );
}

function rangeFor(...args: Parameters<typeof curveFor>) {
    return curveFor(...args).MinMax;
}

describe("blackbox debug mode curves", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("scales fixed range fields from the debug mode table", () => {
        expect(rangeFor("1.49.0", "MAG_CALIB", "debug[3]")).toEqual({ min: -2000, max: 2000 });
        expect(rangeFor("1.49.0", "MAG_CALIB", "debug[7]")).toEqual({ min: 0, max: 4000 });
        expect(rangeFor("1.49.0", "MAG_TASK_RATE", "debug[2]")).toEqual({ min: -10000, max: 10000 });
        expect(rangeFor("1.49.0", "RTH", "debug[0]")).toEqual({ min: -4000, max: 4000 });
        expect(rangeFor("1.49.0", "POSITION_EST", "debug[6]")).toEqual({ min: 0, max: 1000 });
    });

    it("falls back to the per-mode default, then to the field's own range", () => {
        expect(rangeFor("1.49.0", "CYCLETIME", "debug[1]")).toEqual({ min: 0, max: 100 });
        expect(rangeFor("1.49.0", "CYCLETIME", "debug[4]")).toEqual({ min: 0, max: 2000 });
        expect(rangeFor("1.49.0", "BATTERY", "debug[0]")).toEqual({ min: 0, max: 4096 });
        // Battery goodness is a 0-100 percentage with no per-mode default: the
        // firmware annotation gives it its own axis.
        expect(rangeFor("1.49.0", "SAG_COMPENSATION", "debug[0]")).toEqual({ min: 0, max: 100 });
        // MAG_CALIB has no entry beyond debug[7], so debug[8] auto-scales to the logged range.
        expect(rangeFor("1.49.0", "MAG_CALIB", "debug[8]")).toEqual(LOGGED_RANGE);
        expect(rangeFor("1.49.0", "GPS_CONNECTION", "debug[2]")).toEqual({ min: -200, max: 200 });
    });

    it("scales gyro derived fields from the configured rates", () => {
        // The stubbed rates put the fastest axis at 1000 deg/s, plus the 20% gyro graph margin.
        const gyro = rangeFor("1.49.0", "GYRO_FILTERED", "debug[0]");
        expect(gyro).toEqual({ min: -1200, max: 1200 });
        expect(rangeFor("1.49.0", "GYRO_SAMPLE", "debug[0]")).toEqual(gyro);
        // GYRO_SAMPLE picks up the extra decade when high resolution logging is on.
        expect(rangeFor("1.49.0", "GYRO_SAMPLE", "debug[0]", { blackbox_high_resolution: 1 })).toEqual({
            min: -12000,
            max: 12000,
        });
        expect(rangeFor("1.49.0", "GYRO_SAMPLE", "debug[4]")).toEqual({ min: 0, max: 100 });
    });

    it("keeps gyro scaling across the multi gyro rename in API 1.47", () => {
        const gyro = { min: -1200, max: 1200 };
        expect(rangeFor("1.46.0", "DUAL_GYRO_RAW", "debug[0]")).toEqual(gyro);
        expect(rangeFor("1.46.0", "DUAL_GYRO_DIFF", "debug[0]")).toEqual(gyro);
        expect(rangeFor("1.46.0", "DUAL_GYRO_SCALED", "debug[0]")).toEqual(gyro);
        expect(rangeFor("1.47.0", "MULTI_GYRO_RAW", "debug[0]")).toEqual(gyro);
        expect(rangeFor("1.48.0", "MULTI_GYRO_RAW", "debug[0]")).toEqual(gyro);
        expect(rangeFor("1.49.0", "MULTI_GYRO_RAW", "debug[0]")).toEqual(gyro);
        expect(rangeFor("1.49.0", "MULTI_GYRO_DIFF", "debug[0]")).toEqual(gyro);
        expect(rangeFor("1.49.0", "MULTI_GYRO_SCALED", "debug[0]")).toEqual(gyro);
        expect(rangeFor("1.49.0", "GYRO_RAW", "debug[0]")).toEqual(gyro);
    });

    it("scales a gyro field to the fastest axis plus the 20% margin", () => {
        // The stubbed rcCommand conversion puts the fastest axis at 1000 deg/s.
        expect(rangeFor("1.49.0", "CYCLETIME", "gyroADC[0]")).toEqual({ min: -1200, max: 1200 });
        expect(rangeFor("1.49.0", "CYCLETIME", "gyroUnfilt[1]")).toEqual({ min: -1200, max: 1200 });
    });

    it("centres a zero-centred debug field on zero, at least one unit wide", () => {
        const flat = { "debug[2]": { min: 0, max: 0 } };
        expect(rangeFor("1.49.0", "ITERM_RELAX", "debug[2]", undefined, flat)).toEqual({ min: -1, max: 1 });
        expect(rangeFor("1.49.0", "ITERM_RELAX", "debug[2]", undefined, { "debug[2]": { min: -30, max: 20 } })).toEqual(
            {
                min: -30,
                max: 30,
            },
        );
    });

    // EZLANDING used to give an offset/inputRange curve with no MinMax, which the grapher and the
    // graph dialog's reset both read unguarded, so adding an EZ Landing field threw.
    it("gives EZLANDING the 0-100 % range its fields log, as percent * 100", () => {
        expect(curveFor("1.49.0", "EZLANDING", "debug[0]")).toEqual({ power: 1, MinMax: { min: 0, max: 10000 } });
    });

    it("picks the API 1.49 field layout only for API 1.49 and later logs", () => {
        expect(rangeFor("1.49.0", "ALTITUDE", "debug[3]")).toEqual({ min: -10, max: 10 });
        expect(rangeFor("1.48.0", "ALTITUDE", "debug[3]")).toEqual({ min: -5, max: 5 });

        expect(rangeFor("1.49.0", "GPS_RESCUE_VELOCITY", "debug[2]")).toEqual({ min: -1000, max: 1000 });
        expect(rangeFor("1.48.0", "GPS_RESCUE_VELOCITY", "debug[2]")).toEqual({ min: -5, max: 5 });

        expect(rangeFor("1.49.0", "GPS_RESCUE_HEADING", "debug[0]")).toEqual({ min: -20, max: 20 });
        expect(rangeFor("1.48.0", "GPS_RESCUE_HEADING", "debug[0]")).toEqual({ min: -100, max: 100 });

        expect(rangeFor("1.49.0", "GPS_RESCUE_TRACKING", "debug[2]")).toEqual({ min: -10, max: 10 });
        expect(rangeFor("1.48.0", "GPS_RESCUE_TRACKING", "debug[2]")).toEqual({ min: -50, max: 50 });

        expect(rangeFor("1.49.0", "AUTOPILOT_ALTITUDE", "debug[0]")).toEqual({ min: 1000, max: 2000 });
        expect(rangeFor("1.49.0", "AUTOPILOT_PID", "debug[7]")).toEqual({ min: 0, max: 500 });
        expect(rangeFor("1.49.0", "AUTOPILOT_STOP", "debug[0]")).toEqual({ min: -5, max: 5 });
        expect(rangeFor("1.49.0", "POSITION_NAV", "debug[7]")).toEqual({ min: 0, max: 500 });

        // Before 1.49 these four modes logged a different field layout, so they auto-scale instead.
        for (const debugModeName of ["AUTOPILOT_ALTITUDE", "AUTOPILOT_PID", "AUTOPILOT_STOP", "POSITION_NAV"]) {
            expect(rangeFor("1.48.0", debugModeName, "debug[0]"), debugModeName).toEqual(LOGGED_RANGE);
        }
    });

    it("puts the fields sharing an annotated unit on one axis", () => {
        // ESC_SENSOR_TMP has no DEBUG_MODE_CURVES entry, so from API 1.49 the
        // firmware annotation is what decides: the four ESC temperatures share a
        // unit, so they share an axis and one hot motor stays readable against
        // the others instead of each graph being scaled to its own spread.
        const temperatures = {
            "debug[0]": { min: -5, max: 10 },
            "debug[1]": { min: -20, max: 30 },
            "debug[2]": { min: -1, max: 4 },
            "debug[3]": { min: -2, max: 8 },
        };
        expect(rangeFor("1.49.0", "ESC_SENSOR_TMP", "debug[0]", undefined, temperatures)).toEqual({
            min: -20,
            max: 30,
        });

        // A log that recorded only one of the group has nothing to share an axis
        // with, so the field falls back to its own range.
        expect(
            rangeFor("1.49.0", "ESC_SENSOR_TMP", "debug[0]", undefined, { "debug[0]": { min: -5, max: 10 } }),
        ).toEqual({ min: -5, max: 10 });
    });

    it("returns a usable curve for every debug field of every debug mode", () => {
        for (const apiVersion of ["1.44.0", "1.47.0", "1.48.0", "1.49.0"]) {
            const debugModes = getDebugModes(apiVersion);
            for (let debugMode = 0; debugMode < debugModes.length; debugMode++) {
                const flightLog = flightLogFor(apiVersion, debugMode);
                for (let index = 0; index < 8; index++) {
                    const fieldName = `debug[${index}]`;
                    const where = `${apiVersion} ${debugModes[debugMode]} ${fieldName}`;
                    const curve = GraphConfig.getDefaultCurveForField(flightLog, fieldName);
                    expect(curve.power, where).toBe(1);
                    // The grapher reads MinMax for every field.
                    expect(Number.isFinite(curve.MinMax.min), where).toBe(true);
                    expect(Number.isFinite(curve.MinMax.max), where).toBe(true);
                    expect(curve.MinMax.min, where).toBeLessThan(curve.MinMax.max);
                }
            }
        }
    });
});
