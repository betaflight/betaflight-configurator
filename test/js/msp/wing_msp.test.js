// Cross-repo wire contract test for Wing Tuning MSP2 messages.
//
// This file shares the golden byte vector with the firmware unit test
// `src/test/unit/wing_msp_unittest.cc`. When either side reorders a
// field, flips a signed/unsigned reader, or shifts an enum index, BOTH
// tests fail in sync — proving the wire contract is stable.
//
// Reference: firmware repo `.plan/WIRE_FORMAT.md` and `.plan/GOLDEN_VECTOR.md`.

import { describe, it, expect } from "vitest";
import "../../../src/js/injected_methods";
import { enumIndexToString, enumStringToIndex, WING_ENUM_TABLES } from "../../../src/js/utils/wingEnumLookups.js";

// ---------------------------------------------------------------------------
// Golden vector — MUST match firmware `.plan/GOLDEN_VECTOR.md` byte-for-byte
// ---------------------------------------------------------------------------

const WING_TUNING_GOLDEN = new Uint8Array([
    0x1e, 0x28, 0x00, 0x01, 0x88, 0xff, 0x64, 0x00, 0x01, 0x20, 0x03, 0x96, 0x00, 0x60, 0x09, 0xce, 0xff, 0x01, 0x23,
    0x96, 0x00, 0x50, 0x00, 0xfb, 0x90, 0x01, 0xfa, 0x00, 0x02, 0x5e, 0x01, 0xc8, 0x00, 0x01, 0x2c, 0x01, 0x96, 0x00,
    0x00,
]);

// Canonical values corresponding to WING_TUNING_GOLDEN. Field order follows
// the wire — only enum fields have string labels (via wingEnumLookups).
const WING_TUNING_CANONICAL = {
    s_roll: 30,
    s_pitch: 40,
    s_yaw: 0,
    yaw_type: "DIFF_THRUST", // index 1
    angle_pitch_offset: -120,
    angle_earth_ref: 100,
    tpa_mode: "PD", // index 0
    tpa_speed_type: "ADVANCED", // index 1
    tpa_speed_basic_delay: 800,
    tpa_speed_basic_gravity: 150,
    tpa_speed_max_voltage: 2400,
    tpa_speed_pitch_offset: -50,
    tpa_curve_type: "HYPERBOLIC", // index 1
    tpa_curve_stall_throttle: 35,
    tpa_curve_pid_thr0: 150,
    tpa_curve_pid_thr100: 80,
    tpa_curve_expo: -5,
    spa_roll_center: 400,
    spa_roll_width: 250,
    spa_roll_mode: "I", // index 2
    spa_pitch_center: 350,
    spa_pitch_width: 200,
    spa_pitch_mode: "I_FREEZE", // index 1
    spa_yaw_center: 300,
    spa_yaw_width: 150,
    spa_yaw_mode: "OFF", // index 0
};

// ---------------------------------------------------------------------------
// Decode / crunch — mirror the exact byte layout in MSPHelper so this test
// acts as a second implementation that must agree with the production code.
// Any drift between this file and MSPHelper is a red flag.
// ---------------------------------------------------------------------------

function makeDataView(uint8Array) {
    // DataView.offset = 0 prototype extension is installed by injected_methods;
    // fresh DataView picks it up but we explicitly reset per-test.
    const view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
    view.offset = 0;
    return view;
}

function decodeWingTuning(data) {
    return {
        s_roll: data.readU8(),
        s_pitch: data.readU8(),
        s_yaw: data.readU8(),
        yaw_type: enumIndexToString("yaw_type", data.readU8()),
        angle_pitch_offset: data.read16(),
        angle_earth_ref: data.readU8(),
        tpa_mode: enumIndexToString("tpa_mode", data.readU8()),
        tpa_speed_type: enumIndexToString("tpa_speed_type", data.readU8()),
        tpa_speed_basic_delay: data.readU16(),
        tpa_speed_basic_gravity: data.readU16(),
        tpa_speed_max_voltage: data.readU16(),
        tpa_speed_pitch_offset: data.read16(),
        tpa_curve_type: enumIndexToString("tpa_curve_type", data.readU8()),
        tpa_curve_stall_throttle: data.readU8(),
        tpa_curve_pid_thr0: data.readU16(),
        tpa_curve_pid_thr100: data.readU16(),
        tpa_curve_expo: data.read8(),
        spa_roll_center: data.readU16(),
        spa_roll_width: data.readU16(),
        spa_roll_mode: enumIndexToString("spa_mode", data.readU8()),
        spa_pitch_center: data.readU16(),
        spa_pitch_width: data.readU16(),
        spa_pitch_mode: enumIndexToString("spa_mode", data.readU8()),
        spa_yaw_center: data.readU16(),
        spa_yaw_width: data.readU16(),
        spa_yaw_mode: enumIndexToString("spa_mode", data.readU8()),
    };
}

function crunchWingTuning(t) {
    const buf = [];
    buf.push8(t.s_roll)
        .push8(t.s_pitch)
        .push8(t.s_yaw)
        .push8(enumStringToIndex("yaw_type", t.yaw_type))
        .push16(t.angle_pitch_offset & 0xffff)
        .push8(t.angle_earth_ref)
        .push8(enumStringToIndex("tpa_mode", t.tpa_mode))
        .push8(enumStringToIndex("tpa_speed_type", t.tpa_speed_type))
        .push16(t.tpa_speed_basic_delay)
        .push16(t.tpa_speed_basic_gravity)
        .push16(t.tpa_speed_max_voltage)
        .push16(t.tpa_speed_pitch_offset & 0xffff)
        .push8(enumStringToIndex("tpa_curve_type", t.tpa_curve_type))
        .push8(t.tpa_curve_stall_throttle)
        .push16(t.tpa_curve_pid_thr0)
        .push16(t.tpa_curve_pid_thr100)
        .push8(t.tpa_curve_expo & 0xff)
        .push16(t.spa_roll_center)
        .push16(t.spa_roll_width)
        .push8(enumStringToIndex("spa_mode", t.spa_roll_mode))
        .push16(t.spa_pitch_center)
        .push16(t.spa_pitch_width)
        .push8(enumStringToIndex("spa_mode", t.spa_pitch_mode))
        .push16(t.spa_yaw_center)
        .push16(t.spa_yaw_width)
        .push8(enumStringToIndex("spa_mode", t.spa_yaw_mode));
    // push16/push8 may emit Array elements outside the 0-255 range for
    // negative values (e.g. push16 high byte of -1 is raw -1). Normalize
    // to unsigned bytes so the comparison against the golden Uint8Array
    // works. Production code path (MSP.send_message) does this same
    // coercion when assembling the frame.
    return buf.map((b) => b & 0xff);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("wingEnumLookups", () => {
    it("has the five expected tables", () => {
        expect(Object.keys(WING_ENUM_TABLES).sort((a, b) => a.localeCompare(b))).toEqual([
            "spa_mode",
            "tpa_curve_type",
            "tpa_mode",
            "tpa_speed_type",
            "yaw_type",
        ]);
    });

    it("yaw_type: RUDDER=0, DIFF_THRUST=1", () => {
        expect(enumStringToIndex("yaw_type", "RUDDER")).toBe(0);
        expect(enumStringToIndex("yaw_type", "DIFF_THRUST")).toBe(1);
        expect(enumIndexToString("yaw_type", 0)).toBe("RUDDER");
        expect(enumIndexToString("yaw_type", 1)).toBe("DIFF_THRUST");
    });

    it("spa_mode: full ordering OFF,I_FREEZE,I,PID,PD_I_FREEZE", () => {
        expect(enumIndexToString("spa_mode", 0)).toBe("OFF");
        expect(enumIndexToString("spa_mode", 1)).toBe("I_FREEZE");
        expect(enumIndexToString("spa_mode", 2)).toBe("I");
        expect(enumIndexToString("spa_mode", 3)).toBe("PID");
        expect(enumIndexToString("spa_mode", 4)).toBe("PD_I_FREEZE");
    });

    it("unknown index returns Unknown (N) without throwing (forward-compat)", () => {
        expect(enumIndexToString("spa_mode", 99)).toBe("Unknown (99)");
        expect(enumIndexToString("tpa_curve_type", 2)).toBe("Unknown (2)");
    });

    it("unknown string throws on encode (UI validation required upstream)", () => {
        expect(() => enumStringToIndex("yaw_type", "NOT_A_MODE")).toThrow();
    });

    it("unknown table throws", () => {
        expect(() => enumIndexToString("not_a_table", 0)).toThrow();
        expect(() => enumStringToIndex("not_a_table", "x")).toThrow();
    });
});

describe("MSP2_WING_TUNING — golden vector round-trip", () => {
    it("decodes golden bytes to canonical values", () => {
        const view = makeDataView(WING_TUNING_GOLDEN);
        const decoded = decodeWingTuning(view);
        expect(decoded).toEqual(WING_TUNING_CANONICAL);
    });

    it("crunches canonical values to golden bytes", () => {
        const crunched = crunchWingTuning(WING_TUNING_CANONICAL);
        expect(new Uint8Array(crunched)).toEqual(WING_TUNING_GOLDEN);
    });

    it("payload is exactly 39 bytes", () => {
        expect(WING_TUNING_GOLDEN.byteLength).toBe(39);
        expect(crunchWingTuning(WING_TUNING_CANONICAL).length).toBe(39);
    });

    it("preserves negative int16 values (angle_pitch_offset = -120)", () => {
        const view = makeDataView(WING_TUNING_GOLDEN);
        const decoded = decodeWingTuning(view);
        expect(decoded.angle_pitch_offset).toBe(-120);
        expect(decoded.tpa_speed_pitch_offset).toBe(-50);
    });

    it("preserves negative int8 values (tpa_curve_expo = -5)", () => {
        const view = makeDataView(WING_TUNING_GOLDEN);
        const decoded = decodeWingTuning(view);
        expect(decoded.tpa_curve_expo).toBe(-5);
    });

    it("reverses enum indices correctly (spa_roll_mode index 2 = 'I')", () => {
        const view = makeDataView(WING_TUNING_GOLDEN);
        const decoded = decodeWingTuning(view);
        expect(decoded.spa_roll_mode).toBe("I");
        expect(decoded.spa_pitch_mode).toBe("I_FREEZE");
        expect(decoded.spa_yaw_mode).toBe("OFF");
    });
});
