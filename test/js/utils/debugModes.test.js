import { describe, expect, it } from "vitest";
import {
    getDebugModes,
    getDebugModeIndex,
    getDebugFieldNames,
    decodeDebugFieldToFriendly,
    convertDebugFieldValue,
} from "../../../src/js/utils/debugModes";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47, API_VERSION_1_48 } from "../../../src/js/data_storage";

describe("debugModes helper", () => {
    describe("getDebugModes", () => {
        it("returns the pre-1.47 base list when no API version is given", () => {
            const modes = getDebugModes();
            expect(modes[0]).toBe("NONE");
            expect(modes).toContain("GYRO_SCALED");
            expect(modes).toContain("DUAL_GYRO_RAW");
            expect(modes).toContain("GPS_RESCUE_THROTTLE_PID");
            expect(modes).not.toContain("CHIRP");
            expect(modes).not.toContain("OPTICALFLOW");
            expect(modes).not.toContain("AUTOPILOT_PID");
        });

        it("returns the pre-1.47 base list for API 1.46", () => {
            const modes = getDebugModes(API_VERSION_1_46);
            expect(modes).toContain("GYRO_SCALED");
            expect(modes).not.toContain("CHIRP");
        });

        it("applies the 1.47 transformations", () => {
            const modes = getDebugModes(API_VERSION_1_47);
            // Removals / renames
            expect(modes).not.toContain("GYRO_SCALED");
            expect(modes).not.toContain("GPS_RESCUE_THROTTLE_PID");
            expect(modes).not.toContain("DUAL_GYRO_RAW");
            // Renames in place
            expect(modes).toContain("AUTOPILOT_ALTITUDE");
            expect(modes).toContain("MULTI_GYRO_RAW");
            expect(modes).toContain("MULTI_GYRO_DIFF");
            expect(modes).toContain("MULTI_GYRO_SCALED");
            // Insertions
            expect(modes).toContain("OPTICALFLOW");
            expect(modes).toContain("AUTOPILOT_POSITION");
            expect(modes).toContain("CHIRP");
            expect(modes).toContain("FLASH_TEST_PRBS");
            expect(modes).toContain("MAVLINK_TELEMETRY");
            // OPTICALFLOW sits directly after RANGEFINDER_QUALITY
            expect(modes.indexOf("OPTICALFLOW")).toBe(modes.indexOf("RANGEFINDER_QUALITY") + 1);
        });

        it("appends AUTOPILOT_PID, POSITION_NAV, AUTOPILOT_STOP and drops AUTOPILOT_POSITION at API 1.48", () => {
            const modes = getDebugModes(API_VERSION_1_48);
            // AUTOPILOT_POSITION was removed from the firmware enum in 1.48.
            expect(modes).not.toContain("AUTOPILOT_POSITION");
            // Tail must match the firmware debug_mode_e enum order exactly:
            // AUTOPILOT_PID(99), POSITION_NAV(100), AUTOPILOT_STOP(101).
            expect(getDebugModeIndex("AUTOPILOT_PID", API_VERSION_1_48)).toBe(99);
            expect(getDebugModeIndex("POSITION_NAV", API_VERSION_1_48)).toBe(100);
            expect(getDebugModeIndex("AUTOPILOT_STOP", API_VERSION_1_48)).toBe(101);
            // AUTOPILOT_STOP is the last entry.
            expect(modes.indexOf("AUTOPILOT_STOP")).toBe(modes.length - 1);
        });

        it("does not expose the 1.48 autopilot modes on 1.47 firmware", () => {
            const modes = getDebugModes(API_VERSION_1_47);
            expect(modes).toContain("AUTOPILOT_POSITION");
            expect(modes).not.toContain("AUTOPILOT_PID");
            expect(modes).not.toContain("POSITION_NAV");
            expect(modes).not.toContain("AUTOPILOT_STOP");
        });

        it("returns a fresh array each call (safe to mutate)", () => {
            const a = getDebugModes(API_VERSION_1_47);
            a.push("SENTINEL");
            const b = getDebugModes(API_VERSION_1_47);
            expect(b).not.toContain("SENTINEL");
        });
    });

    describe("getDebugModeIndex", () => {
        it("places CHIRP at index 97 for API 1.47 (matches firmware debug.h)", () => {
            expect(getDebugModeIndex("CHIRP", API_VERSION_1_47)).toBe(97);
        });

        it("places CHIRP at index 96 for API 1.48 (AUTOPILOT_POSITION removed)", () => {
            // AUTOPILOT_POSITION (index 96 in 1.47) was dropped from the firmware
            // enum in 1.48, so CHIRP shifts down one to index 96.
            expect(getDebugModeIndex("CHIRP", API_VERSION_1_48)).toBe(96);
        });

        it("returns -1 for CHIRP on pre-1.47 firmware", () => {
            expect(getDebugModeIndex("CHIRP", API_VERSION_1_46)).toBe(-1);
            expect(getDebugModeIndex("CHIRP")).toBe(-1);
        });

        it("returns the correct index for NONE", () => {
            expect(getDebugModeIndex("NONE", API_VERSION_1_47)).toBe(0);
        });

        it("returns -1 for unknown names", () => {
            expect(getDebugModeIndex("NOT_A_REAL_MODE", API_VERSION_1_47)).toBe(-1);
        });
    });

    describe("getDebugFieldNames", () => {
        it("returns the base labels when no API version is given", () => {
            const names = getDebugFieldNames();
            expect(names.NONE["debug[0]"]).toBe("Debug [0]");
            expect(names.CYCLETIME["debug[1]"]).toBe("CPU Load");
            // base list keeps the pre-1.47 modes
            expect(names.GYRO_SCALED).toBeDefined();
            expect(names.GPS_RESCUE_THROTTLE_PID).toBeDefined();
            expect(names.AUTOPILOT_PID).toBeUndefined();
        });

        it("applies the 1.46 ATTITUDE / GPS_RESCUE_THROTTLE_PID overrides", () => {
            const names = getDebugFieldNames(API_VERSION_1_46);
            expect(names.ATTITUDE["debug[7]"]).toBe("dcmKp Gain");
            expect(names.GPS_RESCUE_THROTTLE_PID["debug[7]"]).toBe("Throttle adjustment");
        });

        it("applies the 1.47 transformations", () => {
            const names = getDebugFieldNames(API_VERSION_1_47);
            expect(names.GPS_RESCUE_THROTTLE_PID).toBeUndefined();
            expect(names.GYRO_SCALED).toBeUndefined();
            expect(names.DUAL_GYRO_RAW).toBeUndefined();
            expect(names.MULTI_GYRO_RAW).toBeDefined();
            expect(names.AUTOPILOT_ALTITUDE).toBeDefined();
            expect(names.OPTICALFLOW).toBeDefined();
            expect(names.CHIRP).toBeDefined();
            expect(names.AUTOPILOT_POSITION).toBeDefined();
        });

        it("applies the 1.48 transformations", () => {
            const names = getDebugFieldNames(API_VERSION_1_48);
            expect(names.AUTOPILOT_PID["debug[0]"]).toBe("Velocity Error [dbg-axis]");
            expect(names.AUTOPILOT_STOP).toBeDefined();
            expect(names.GYRO_SAMPLE["debug[4]"]).toBe("CPU Load at Sample");
            expect(names.AUTOPILOT_POSITION).toBeUndefined();
        });

        it("uses the quality/raw/processed/delta-time OPTICALFLOW layout pre-1.48", () => {
            const names = getDebugFieldNames(API_VERSION_1_47);
            expect(names.OPTICALFLOW["debug[0]"]).toBe("Quality");
            expect(names.OPTICALFLOW["debug[5]"]).toBe("Delta time");
            expect(names.OPTICALFLOW["debug[6]"]).toBeUndefined();
        });

        it("switches OPTICALFLOW to the rotate/compensate/filter pipeline at 1.48", () => {
            const names = getDebugFieldNames(API_VERSION_1_48);
            expect(names.OPTICALFLOW["debug[0]"]).toBe("Rotated Flow Rate X");
            expect(names.OPTICALFLOW["debug[2]"]).toBe("Gyro Compensation X");
            expect(names.OPTICALFLOW["debug[6]"]).toBe("Filtered Flow Rate X");
            expect(names.OPTICALFLOW["debug[7]"]).toBe("Filtered Flow Rate Y");
        });

        it("keeps ITERM_RELAX debug[3] through 1.47, drops it at 1.48", () => {
            expect(getDebugFieldNames(API_VERSION_1_45).ITERM_RELAX["debug[3]"]).toBe("Axis Error [roll]");
            expect(getDebugFieldNames(API_VERSION_1_47).ITERM_RELAX["debug[3]"]).toBe("Axis Error [roll]");
            expect(getDebugFieldNames(API_VERSION_1_48).ITERM_RELAX["debug[3]"]).toBeUndefined();
        });

        it("keeps RC_SMOOTHING_RATE debug[1] through 1.46, drops it and reworks fields at 1.47", () => {
            expect(getDebugFieldNames(API_VERSION_1_46).RC_SMOOTHING_RATE["debug[1]"]).toBe("Training Step Count");
            expect(getDebugFieldNames(API_VERSION_1_47).RC_SMOOTHING_RATE["debug[1]"]).toBeUndefined();
            expect(getDebugFieldNames(API_VERSION_1_47).RC_SMOOTHING_RATE["debug[3]"]).toBe("Smoothing Update Flag");
        });

        it("only extends GPS_RESCUE_VELOCITY/HEADING/TRACKING to 8 fields from 1.46 onward", () => {
            expect(getDebugFieldNames(API_VERSION_1_45).GPS_RESCUE_VELOCITY["debug[4]"]).toBeUndefined();
            expect(getDebugFieldNames(API_VERSION_1_45).GPS_RESCUE_HEADING["debug[6]"]).toBeUndefined();
            expect(getDebugFieldNames(API_VERSION_1_45).GPS_RESCUE_TRACKING["debug[4]"]).toBeUndefined();
            expect(getDebugFieldNames(API_VERSION_1_46).GPS_RESCUE_VELOCITY["debug[4]"]).toBe("I term");
            expect(getDebugFieldNames(API_VERSION_1_46).GPS_RESCUE_HEADING["debug[6]"]).toBe(
                "Roll Angle Adjustment * 100",
            );
            expect(getDebugFieldNames(API_VERSION_1_46).GPS_RESCUE_TRACKING["debug[4]"]).toBe("Yaw Attitude");
        });

        it("only extends EZLANDING to 8 fields from 1.47 onward", () => {
            expect(getDebugFieldNames(API_VERSION_1_46).EZLANDING["debug[6]"]).toBeUndefined();
            expect(getDebugFieldNames(API_VERSION_1_47).EZLANDING["debug[6]"]).toBe("Max Stick Deflection");
        });

        it("only extends RANGEFINDER to 6 fields from 1.48 onward", () => {
            expect(getDebugFieldNames(API_VERSION_1_47).RANGEFINDER["debug[4]"]).toBeUndefined();
            expect(getDebugFieldNames(API_VERSION_1_48).RANGEFINDER["debug[4]"]).toBe("Cos Tilt Angle * 1000");
        });

        it("only reworks FEEDFORWARD/FEEDFORWARD_LIMIT/RC_SMOOTHING/RX_TIMING/GPS_CONNECTION from 1.47 (or 1.46) onward", () => {
            expect(getDebugFieldNames(API_VERSION_1_46).FEEDFORWARD["debug[0]"]).toBe("Feedforward Avg [roll]");
            expect(getDebugFieldNames(API_VERSION_1_47).FEEDFORWARD["debug[0]"]).toBe("Setpoint [dbg-axis]");
            expect(getDebugFieldNames(API_VERSION_1_46).RX_TIMING["debug[4]"]).toBeUndefined();
            expect(getDebugFieldNames(API_VERSION_1_47).RX_TIMING["debug[4]"]).toBe("Current RX Rate");
            expect(getDebugFieldNames(API_VERSION_1_45).GPS_CONNECTION["debug[0]"]).toBe("State");
            expect(getDebugFieldNames(API_VERSION_1_46).GPS_CONNECTION["debug[0]"]).toBe("GPS Model");
        });

        it("keys align with getDebugModes for the same API version", () => {
            const apiVersion = API_VERSION_1_48;
            const modes = getDebugModes(apiVersion);
            const names = getDebugFieldNames(apiVersion);
            // Every named mode that has fields should resolve through the mode list index.
            const cycletimeIndex = modes.indexOf("CYCLETIME");
            expect(names[modes[cycletimeIndex]]["debug[0]"]).toBe("Cycle Time");
        });
    });

    // Deterministic stub scaling so assertions are exact (gyro is identity).
    const stubCtx = (overrides = {}) => ({
        apiVersion: API_VERSION_1_48,
        motorPoles: 14,
        gyroRawToDegreesPerSecond: (v) => v,
        accRawToGs: (v) => v / 2048,
        rcCommandRawToThrottle: (v) => v,
        throttleToRcCommandRaw: (v) => v,
        ...overrides,
    });

    describe("decodeDebugFieldToFriendly", () => {
        it("formats units-only fields without touching ctx scaling", () => {
            expect(decodeDebugFieldToFriendly("BATTERY", "debug[1]", 123, stubCtx())).toBe("12.3 V");
            expect(decodeDebugFieldToFriendly("CYCLETIME", "debug[1]", 80, stubCtx())).toBe("80 %");
        });

        it("applies injected gyro scaling for gyro modes", () => {
            expect(decodeDebugFieldToFriendly("GYRO_FILTERED", "debug[0]", 100, stubCtx())).toBe("100 °/s");
            // a non-identity ctx is honoured
            expect(
                decodeDebugFieldToFriendly(
                    "GYRO_FILTERED",
                    "debug[0]",
                    10,
                    stubCtx({ gyroRawToDegreesPerSecond: (v) => v * 2 }),
                ),
            ).toBe("20 °/s");
        });

        it("uses ctx.motorPoles for DSHOT_RPM_TELEMETRY", () => {
            expect(decodeDebugFieldToFriendly("DSHOT_RPM_TELEMETRY", "debug[0]", 14, stubCtx())).toBe("200 rpm / 3 hz");
        });

        it("selects the FFT_FREQ field layout by ctx.apiVersion", () => {
            // 1.47+: debug[0] is the gyro field, others are Hz
            expect(
                decodeDebugFieldToFriendly("FFT_FREQ", "debug[0]", 100, stubCtx({ apiVersion: API_VERSION_1_47 })),
            ).toBe("100 °/s");
            expect(
                decodeDebugFieldToFriendly("FFT_FREQ", "debug[1]", 250, stubCtx({ apiVersion: API_VERSION_1_47 })),
            ).toBe("250 Hz");
            // pre-1.47: debug[3] is the gyro field
            expect(
                decodeDebugFieldToFriendly("FFT_FREQ", "debug[3]", 100, stubCtx({ apiVersion: API_VERSION_1_46 })),
            ).toBe("100 °/s");
            expect(
                decodeDebugFieldToFriendly("FFT_FREQ", "debug[0]", 250, stubCtx({ apiVersion: API_VERSION_1_46 })),
            ).toBe("250 Hz");
        });

        it("selects the OPTICALFLOW field layout by ctx.apiVersion", () => {
            // pre-1.48: debug[0]/debug[5] (quality/deltaTimeUs) are unscaled ints
            expect(
                decodeDebugFieldToFriendly("OPTICALFLOW", "debug[0]", 42, stubCtx({ apiVersion: API_VERSION_1_47 })),
            ).toBe("42");
            expect(
                decodeDebugFieldToFriendly("OPTICALFLOW", "debug[5]", 2000, stubCtx({ apiVersion: API_VERSION_1_47 })),
            ).toBe("2000");
            expect(
                decodeDebugFieldToFriendly("OPTICALFLOW", "debug[1]", 1500, stubCtx({ apiVersion: API_VERSION_1_47 })),
            ).toBe("1.5");
            // 1.48+: every field is the *1000 flow-rate pipeline, including debug[0]/debug[5]
            expect(decodeDebugFieldToFriendly("OPTICALFLOW", "debug[0]", 1500, stubCtx())).toBe("1.5");
            expect(decodeDebugFieldToFriendly("OPTICALFLOW", "debug[5]", 3000, stubCtx())).toBe("3.0");
        });

        it("uses ctx.fftCalcSteps for FFT_TIME debug[0], with graceful fallback", () => {
            expect(decodeDebugFieldToFriendly("FFT_TIME", "debug[0]", 1, stubCtx({ fftCalcSteps: ["A", "B"] }))).toBe(
                "B",
            );
            expect(decodeDebugFieldToFriendly("FFT_TIME", "debug[0]", 1, stubCtx())).toBe("1");
        });

        it("falls back to a plain integer for unknown modes/fields", () => {
            expect(decodeDebugFieldToFriendly("NOT_A_MODE", "debug[0]", 42, stubCtx())).toBe("42");
        });

        it("treats AIRMODE/BARO as aliases of NONE", () => {
            expect(decodeDebugFieldToFriendly("AIRMODE", "debug[1]", 1013, stubCtx())).toBe("1013 hPa");
            expect(decodeDebugFieldToFriendly("BARO", "debug[2]", 2500, stubCtx())).toBe("25.00 °C");
        });

        it("applies a per-mode default different from plain integer (GPS_DOP)", () => {
            expect(decodeDebugFieldToFriendly("GPS_DOP", "debug[0]", 12, stubCtx())).toBe("12");
            expect(decodeDebugFieldToFriendly("GPS_DOP", "debug[1]", 150, stubCtx())).toBe("1.50");
        });
    });

    describe("convertDebugFieldValue", () => {
        it("round-trips a scaled field (BATTERY)", () => {
            const friendly = convertDebugFieldValue("BATTERY", "debug[1]", true, 120, stubCtx());
            expect(friendly).toBe(12);
            expect(convertDebugFieldValue("BATTERY", "debug[1]", false, friendly, stubCtx())).toBe(120);
        });

        it("uses injected accel scaling and its inverse", () => {
            expect(convertDebugFieldValue("ACCELEROMETER", "debug[0]", true, 2048, stubCtx())).toBe(1);
            expect(convertDebugFieldValue("ACCELEROMETER", "debug[0]", false, 1, stubCtx())).toBe(2048);
        });

        it("passes unscaled fields through unchanged", () => {
            expect(convertDebugFieldValue("PIDLOOP", "debug[0]", true, 999, stubCtx())).toBe(999);
        });

        it("honours a null field entry as passthrough overriding _default (BATTERY debug[0])", () => {
            expect(convertDebugFieldValue("BATTERY", "debug[0]", true, 250, stubCtx())).toBe(250);
            // a non-listed field still hits the scaling _default
            expect(convertDebugFieldValue("BATTERY", "debug[1]", true, 250, stubCtx())).toBe(25);
        });

        it("applies a per-mode default scaling (GPS_DOP)", () => {
            expect(convertDebugFieldValue("GPS_DOP", "debug[0]", true, 12, stubCtx())).toBe(12);
            expect(convertDebugFieldValue("GPS_DOP", "debug[1]", true, 150, stubCtx())).toBe(1.5);
        });

        it("selects the OPTICALFLOW scaling by ctx.apiVersion", () => {
            // pre-1.48: debug[0]/debug[5] pass through unscaled
            expect(
                convertDebugFieldValue("OPTICALFLOW", "debug[0]", true, 42, stubCtx({ apiVersion: API_VERSION_1_47 })),
            ).toBe(42);
            expect(
                convertDebugFieldValue(
                    "OPTICALFLOW",
                    "debug[1]",
                    true,
                    1500,
                    stubCtx({ apiVersion: API_VERSION_1_47 }),
                ),
            ).toBe(1.5);
            // 1.48+: every field including debug[0]/debug[5] is scaled by 1000
            expect(convertDebugFieldValue("OPTICALFLOW", "debug[0]", true, 1500, stubCtx())).toBe(1.5);
            expect(convertDebugFieldValue("OPTICALFLOW", "debug[5]", false, 1.5, stubCtx())).toBe(1500);
        });
    });
});
