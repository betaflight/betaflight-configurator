import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { GraphConfig } from "../../src/blackbox-viewer/graph_config.js";
import { getDebugModes } from "../../src/js/utils/debugModes.js";

// getDefaultCurveForField swallows every error and falls back to a +/-500 curve, so a missing
// import or a typo in the debug mode table degrades silently into a plausible looking graph
// instead of failing loudly. These tests pin the curves down instead.
const LOGGED_RANGE = { min: -123, max: 456 };

// A real log records the debug fields the firmware wrote, and the annotated axes
// ask which of them are present before putting a group of them on one axis. The
// default says all eight were recorded, all with the same range, so grouping a
// field with its neighbours cannot change what any existing case here asserts.
const ALL_DEBUG_FIELDS = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`debug[${index}]`, LOGGED_RANGE]));

function flightLogFor(apiVersion, debugMode, sysConfigOverrides = {}, loggedFields = ALL_DEBUG_FIELDS) {
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
        getMinMaxForFieldDuringAllTime: (field) => ({ ...(loggedFields[field] ?? LOGGED_RANGE) }),
        getMainFieldIndexByName: (name) => (loggedFields[name] === undefined ? undefined : 0),
        rcCommandRawToDegreesPerSecond: (value, axis) => value * (axis + 2) * 0.5,
        // The debug field unit conversions reach back into the flight log for hardware scaling.
        // Without these the conversion throws and the catch quietly hands back the fallback curve.
        gyroRawToDegreesPerSecond: (value) => value / 16.4,
        accRawToGs: (value) => value / 2048,
        rcCommandRawToThrottle: (value) => (value - 1000) / 10,
        ThrottleTorcCommandRaw: (value) => value * 10 + 1000,
        getMainFieldNames: () => [],
    };
}

function curveFor(apiVersion, debugModeName, fieldName, sysConfigOverrides, loggedFields) {
    const debugMode = getDebugModes(apiVersion).indexOf(debugModeName);
    expect(debugMode, `${debugModeName} is not a debug mode on API ${apiVersion}`).toBeGreaterThan(-1);
    return GraphConfig.getDefaultCurveForField(
        flightLogFor(apiVersion, debugMode, sysConfigOverrides, loggedFields),
        fieldName,
    );
}

function rangeFor(...args) {
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
        // debug[2] is a 0-100 goodness percentage, not a voltage: the firmware
        // annotation gives it its own axis instead of the mode's volts default.
        expect(rangeFor("1.49.0", "BATTERY", "debug[2]")).toEqual({ min: 0, max: 100 });
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

    it("keeps EZLANDING on its own curve shape", () => {
        expect(curveFor("1.49.0", "EZLANDING", "debug[0]")).toEqual({
            offset: -5000,
            power: 1,
            inputRange: 5000,
            outputRange: 1,
        });
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
                    if (curve.MinMax) {
                        expect(Number.isFinite(curve.MinMax.min), where).toBe(true);
                        expect(Number.isFinite(curve.MinMax.max), where).toBe(true);
                        expect(curve.MinMax.min, where).toBeLessThan(curve.MinMax.max);
                    } else {
                        expect(Number.isFinite(curve.inputRange), where).toBe(true);
                    }
                }
            }
        }
    });
});
