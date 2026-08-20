import { describe, expect, it } from "vitest";
import semver from "semver";
import {
    getDebugFieldNames,
    decodeDebugFieldToFriendly,
    convertDebugFieldValue,
} from "../../../src/js/utils/debugModes";
import { FIRMWARE_DEBUG_FIELDS, FIRMWARE_DEBUG_FIELD_CONFLICTS } from "../../../src/js/debug_fields_table";
import { API_VERSION_1_48, API_VERSION_1_49 } from "../../../src/js/data_storage";

/*
 * The firmware annotates its DEBUG_SET() call sites with what each debug[n] holds
 * (`//!< <label> [<unit>]`, grammar in the firmware's src/main/build/debug.h), and
 * `npm run generate:debug-modes` turns those into src/js/debug_fields_table.js.
 * These tests cover what the app does with them: an annotated field takes its
 * label, unit and scaling from firmware, an unannotated one still comes from the
 * hand-written tables, and firmware that predates the annotations is untouched.
 */

// Enough context for the device-native units; the factors are arbitrary but
// exact, so a double conversion is visible rather than plausible.
const ctx = (apiVersion) => ({
    apiVersion,
    motorPoles: 14,
    accRawToGs: (value) => value / 2048,
    gyroRawToDegreesPerSecond: (value) => value / 16,
    rcCommandRawToThrottle: (value) => value / 10,
    throttleToRcCommandRaw: (value) => value * 10,
    fftCalcSteps: ["STEP_WINDOW", "STEP_DETECT_PEAKS"],
});

const ANNOTATED = API_VERSION_1_49;

describe("firmware debug field annotations", () => {
    describe("generated table", () => {
        it("covers the in-development firmware", () => {
            expect(Object.keys(FIRMWARE_DEBUG_FIELDS)).toContain(ANNOTATED);
        });

        it("gives every field a label, and a numeric scale for every unit", () => {
            for (const [apiVersion, modes] of Object.entries(FIRMWARE_DEBUG_FIELDS)) {
                expect(semver.valid(apiVersion)).toBeTruthy();
                for (const [mode, fields] of Object.entries(modes)) {
                    for (const [index, field] of Object.entries(fields)) {
                        const where = `${apiVersion} ${mode}[${index}]`;
                        expect(Number(index), where).toBeGreaterThanOrEqual(0);
                        expect(Number(index), where).toBeLessThan(8);
                        expect(field.label, where).toBeTruthy();
                        expect(field.label, where).not.toMatch(/[[\]{}]/);
                        if (field.values !== undefined) {
                            expect(field.values.length, where).toBeGreaterThan(0);
                            expect(field.unit, where).toBeNull();
                        }
                        expect(Number.isFinite(field.scale), where).toBe(true);
                        // Negative for a field that stores the magnitude of a
                        // negative quantity, as CRSF does with its RSSI in dBm.
                        expect(field.scale, where).not.toBe(0);
                    }
                }
            }
        });

        it("names both meanings of a field two subsystems write differently", () => {
            const battery = FIRMWARE_DEBUG_FIELD_CONFLICTS.find(
                (conflict) => conflict.mode === "BATTERY" && conflict.index === 3,
            );
            // battery.c writes the stable-voltage bits there, mixer.c the sag
            // compensation attenuation - betaflight/betaflight#15594.
            expect(battery).toBeDefined();
            expect(battery.meanings.map((meaning) => meaning.label)).toEqual([
                "Sag Compensation Attenuation",
                "Voltage Stable Bits",
            ]);
            expect(getDebugFieldNames(ANNOTATED).BATTERY["debug[3]"]).toBe(
                "Sag Compensation Attenuation / Voltage Stable Bits",
            );
        });

        it("shows every unit the firmware may use, with one suffix per unit", () => {
            // The generator accepts a documented set of unit symbols; the app has
            // to display all of them. A symbol it does not know would fall back to
            // no suffix, and the number would still look plausible. The suffix is
            // not the firmware symbol - centimetres are shown in metres, gyro ADC
            // counts in °/s - but it has to be the same one every time.
            const suffixes = new Map();

            for (const [apiVersion, modes] of Object.entries(FIRMWARE_DEBUG_FIELDS)) {
                const scaleContext = ctx(apiVersion);
                for (const [mode, fields] of Object.entries(modes)) {
                    for (const [index, field] of Object.entries(fields)) {
                        if (field.unit === null) {
                            continue;
                        }
                        const where = `${apiVersion} ${mode}[${index}] (${field.unit})`;
                        const decoded = decodeDebugFieldToFriendly(mode, `debug[${index}]`, 1, scaleContext);
                        const parsed = /^(-?[\d.]+) (\S+)$/.exec(decoded);
                        expect(parsed, `${where}: "${decoded}"`).not.toBeNull();
                        const seen = suffixes.get(field.unit);
                        if (seen === undefined) {
                            suffixes.set(field.unit, parsed[2]);
                        } else {
                            expect(parsed[2], where).toBe(seen);
                        }
                    }
                }
            }

            // Spot-check the mappings that are not the identity, since those are
            // the ones a display change could silently get wrong.
            expect(Object.fromEntries(suffixes)).toMatchObject({
                us: "μs",
                cm: "m",
                "cm/s": "m/s",
                deg: "°",
                dps: "°/s",
                degC: "°C",
                dBm: "dBm",
                gyroADC: "°/s",
                accADC: "g",
                eRPM: "rpm",
            });
        });

        it("names both meanings only when they differ", () => {
            // Two variants can disagree on the unit alone - the LIDAR-TF driver
            // reports centimetres where the UPT1 reports millimetres - and
            // "Distance / Distance" would name nothing.
            expect(getDebugFieldNames(ANNOTATED).LIDAR_TF["debug[0]"]).toBe("Distance");
            expect(
                FIRMWARE_DEBUG_FIELD_CONFLICTS.find(
                    (conflict) => conflict.mode === "LIDAR_TF" && conflict.index === 0,
                ).meanings.map((meaning) => meaning.unit),
            ).toEqual(["cm", "m"]);
        });

        it("reports the enum values of a conflicting meaning, which may be all that differs", () => {
            const rescue = FIRMWARE_DEBUG_FIELD_CONFLICTS.find(
                (conflict) => conflict.mode === "GPS_RESCUE_VELOCITY" && conflict.index === 1,
            );
            // gps_rescue_multirotor.c writes the ground speed there in one place
            // and the rescue phase in another; the phase names come from firmware.
            expect(rescue.meanings.map((meaning) => meaning.label)).toEqual(["Ground Speed", "Rescue Phase"]);
            expect(rescue.meanings[1].values).toContain("RESCUE_LANDING");
            expect(rescue.meanings[0].values).toBeUndefined();
        });

        it("drops the unit of a conflicting field, since it belongs to one meaning only", () => {
            for (const conflict of FIRMWARE_DEBUG_FIELD_CONFLICTS) {
                expect(FIRMWARE_DEBUG_FIELDS[conflict.apiVersion][conflict.mode][conflict.index].unit).toBeNull();
            }
        });
    });

    describe("labels", () => {
        it("replace a hand-written label the firmware disagrees with", () => {
            // debug[2] was labelled "Frame Jitter" long after firmware started
            // writing isRxRateValid there.
            expect(getDebugFieldNames(API_VERSION_1_48).RX_TIMING["debug[2]"]).toBe("Frame Jitter");
            expect(getDebugFieldNames(ANNOTATED).RX_TIMING["debug[2]"]).toBe("Frame Interval Within Limits");
        });

        it("expand a per-axis annotation into one label per index", () => {
            const labels = getDebugFieldNames(ANNOTATED).GYRO_FILTERED;
            expect(labels["debug[0]"]).toBe("Gyro Filtered (roll)");
            expect(labels["debug[1]"]).toBe("Gyro Filtered (pitch)");
            expect(labels["debug[2]"]).toBe("Gyro Filtered (yaw)");
        });

        it("keep the hand-written mode-level name, which firmware has no equivalent of", () => {
            expect(getDebugFieldNames(ANNOTATED).BATTERY["debug[all]"]).toBe("Debug Battery");
        });

        it("leave firmware that predates the annotations alone", () => {
            expect(getDebugFieldNames(API_VERSION_1_48).BATTERY["debug[1]"]).toBe("Battery Volt");
            expect(getDebugFieldNames(ANNOTATED).BATTERY["debug[1]"]).toBe("Battery Voltage");
        });
    });

    describe("decoding", () => {
        it("scales and labels from the annotated unit", () => {
            // [0.01V]: firmware stores hundredths of a volt.
            expect(decodeDebugFieldToFriendly("BATTERY", "debug[1]", 1650, ctx(ANNOTATED))).toBe("16.50 V");
            // [us] and [%] pass through.
            expect(decodeDebugFieldToFriendly("CYCLETIME", "debug[0]", 125, ctx(ANNOTATED))).toBe("125 μs");
            expect(decodeDebugFieldToFriendly("CYCLETIME", "debug[1]", 42, ctx(ANNOTATED))).toBe("42 %");
            // [cm] is shown in metres, [0.1m] in metres too.
            expect(decodeDebugFieldToFriendly("BARO", "debug[3]", 1234, ctx(ANNOTATED))).toBe("12.34 m");
            expect(decodeDebugFieldToFriendly("ALTITUDE", "debug[1]", 123, ctx(ANNOTATED))).toBe("12.3 m");
        });

        it("uses the flight controller's own scaling for a device-native unit", () => {
            // [gyroADC] and [accADC] are ADC counts: only the FC's configured
            // scale turns them into °/s and g.
            expect(decodeDebugFieldToFriendly("GYRO_RAW", "debug[0]", 160, ctx(ANNOTATED))).toBe("10 °/s");
            expect(decodeDebugFieldToFriendly("ACCELEROMETER", "debug[0]", 1024, ctx(ANNOTATED))).toBe("0.50 g");
            // [eRPM] needs the motor pole count.
            expect(decodeDebugFieldToFriendly("DSHOT_RPM_TELEMETRY", "debug[0]", 70, ctx(ANNOTATED))).toBe("1000 rpm");
        });

        it("prints a plain integer for a field the firmware gives no unit", () => {
            expect(decodeDebugFieldToFriendly("BATTERY", "debug[4]", 1, ctx(ANNOTATED))).toBe("1");
        });

        it("carries the sign of a field that stores a negative quantity as a magnitude", () => {
            // CRSF sends RSSI as a positive number of dBm below zero, and the
            // annotation says so with `[-1dBm]`, so the value reads as it should.
            expect(decodeDebugFieldToFriendly("CRSF_LINK_STATISTICS_DOWN", "debug[0]", 72, ctx(ANNOTATED))).toBe(
                "-72 dBm",
            );
            expect(convertDebugFieldValue("CRSF_LINK_STATISTICS_DOWN", "debug[0]", true, 72, ctx(ANNOTATED))).toBe(-72);
            expect(convertDebugFieldValue("CRSF_LINK_STATISTICS_DOWN", "debug[0]", false, -72, ctx(ANNOTATED))).toBe(
                72,
            );
        });

        it("names an enumerator from the firmware enum the annotation points at", () => {
            // `[enum:batteryState_e]` / `[enum:step_e]`: the names come from the
            // firmware enum, not from a list this repository keeps in step by hand.
            expect(decodeDebugFieldToFriendly("BATTERY", "debug[7]", 3, ctx(ANNOTATED))).toBe("BATTERY_NOT_PRESENT");
            expect(decodeDebugFieldToFriendly("FFT_TIME", "debug[0]", 1, ctx(ANNOTATED))).toBe("STEP_DETECT_PEAKS");
            expect(decodeDebugFieldToFriendly("FAILSAFE", "debug[3]", 2, ctx(ANNOTATED))).toBe("FAILSAFE_LANDING");
        });

        it("falls back to the number for a value outside the enum", () => {
            expect(decodeDebugFieldToFriendly("BATTERY", "debug[7]", 99, ctx(ANNOTATED))).toBe("99");
        });

        it("leaves an enumerator alone when converting for a chart", () => {
            expect(convertDebugFieldValue("BATTERY", "debug[7]", true, 3, ctx(ANNOTATED))).toBe(3);
        });

        it("decodes older firmware through the hand-written table", () => {
            expect(decodeDebugFieldToFriendly("BATTERY", "debug[1]", 1650, ctx(API_VERSION_1_48))).toBe("165.0 V");
        });
    });

    describe("converting", () => {
        it("applies the annotated scaling, and its inverse", () => {
            expect(convertDebugFieldValue("BATTERY", "debug[1]", true, 1650, ctx(ANNOTATED))).toBeCloseTo(16.5, 6);
            expect(convertDebugFieldValue("BATTERY", "debug[1]", false, 16.5, ctx(ANNOTATED))).toBeCloseTo(1650, 6);
        });

        it("round-trips every annotated field of the newest firmware", () => {
            const scaleContext = ctx(ANNOTATED);
            for (const [mode, fields] of Object.entries(FIRMWARE_DEBUG_FIELDS[ANNOTATED])) {
                for (const index of Object.keys(fields)) {
                    const field = `debug[${index}]`;
                    const friendly = convertDebugFieldValue(mode, field, true, 1234, scaleContext);
                    const raw = convertDebugFieldValue(mode, field, false, friendly, scaleContext);
                    expect(raw, `${mode}${field}`).toBeCloseTo(1234, 6);
                }
            }
        });

        it("passes an unscaled field through unchanged", () => {
            expect(convertDebugFieldValue("BATTERY", "debug[4]", true, 1, ctx(ANNOTATED))).toBe(1);
        });
    });
});
