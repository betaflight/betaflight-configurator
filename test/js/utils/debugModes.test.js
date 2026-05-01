import { describe, expect, it } from "vitest";
import { getDebugModes, getDebugModeIndex } from "../../../src/js/utils/debugModes";
import { API_VERSION_1_46, API_VERSION_1_47, API_VERSION_1_48 } from "../../../src/js/data_storage";

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

        it("appends AUTOPILOT_PID at API 1.48", () => {
            const modes = getDebugModes(API_VERSION_1_48);
            expect(modes).toContain("AUTOPILOT_PID");
            expect(modes.indexOf("AUTOPILOT_PID")).toBe(modes.length - 1);
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

        it("places CHIRP at index 97 for API 1.48 as well", () => {
            // AUTOPILOT_PID is appended after CHIRP, so CHIRP's index is stable.
            expect(getDebugModeIndex("CHIRP", API_VERSION_1_48)).toBe(97);
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
});
