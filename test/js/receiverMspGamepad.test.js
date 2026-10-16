import { describe, expect, it } from "vitest";
import {
    CHANNEL_NAMES,
    DEFAULT_CHANNEL_VALUES,
    axisToChannel,
    buttonToChannel,
    applyStickCenters,
    calibrateAxis,
    readStickCenters,
    releaseBoundChannels,
    setStickCenter,
    channelsToMspArray,
    createBinding,
    createProfile,
    createSwitchBinding,
    resolveSwitch,
    switchPositionValues,
    findPreset,
    mapGamepadToChannels,
    parseGamepadId,
    resolveBinding,
    sanitizeAxis,
    snapshotGamepad,
} from "../../src/components/tabs/receiver-msp/gamepadMapping.ts";

const DJI_ID = "C5 (Vendor: 2ca3 Product: 1020)";

function makeSnapshot({ axes = [0, 0, -1, 0, 0], buttons = [] } = {}) {
    return {
        index: 0,
        id: DJI_ID,
        connected: true,
        axes,
        buttons: buttons.map((pressed) => ({ pressed, value: pressed ? 1 : 0 })),
    };
}

describe("parseGamepadId", () => {
    it("reads the Chromium id format", () => {
        expect(parseGamepadId(DJI_ID)).toEqual({ vendorId: 0x2ca3, productId: 0x1020, name: "C5" });
    });

    it("reads the Firefox id format", () => {
        expect(parseGamepadId("2ca3-1020-C5")).toEqual({ vendorId: 0x2ca3, productId: 0x1020, name: "C5" });
    });

    it("returns null ids for an unknown string", () => {
        expect(parseGamepadId("Some Pad")).toEqual({ vendorId: null, productId: null, name: "Some Pad" });
        expect(parseGamepadId(undefined).vendorId).toBeNull();
    });
});

describe("presets and profiles", () => {
    it("matches the DJI FPV Remote Controller 2 by vendor/product", () => {
        expect(findPreset(DJI_ID)?.name).toBe("DJI FPV Remote Controller 2");
        expect(findPreset("Xbox (Vendor: 045e Product: 02ea)")).toBeNull();
        expect(findPreset("no ids")).toBeNull();
    });

    it("seeds a raw-HID profile from the bench table, with the ±660 range", () => {
        const profile = createProfile(DJI_ID);
        expect(profile.presetName).toBe("DJI FPV Remote Controller 2");
        expect(profile.auxCount).toBe(5);
        expect(profile.bindings.Roll).toMatchObject(createBinding("axis", 0));
        expect(profile.bindings.Pitch).toMatchObject(createBinding("axis", 1));
        expect(profile.bindings.Throttle).toMatchObject(createBinding("axis", 2));
        expect(profile.bindings.Yaw).toMatchObject(createBinding("axis", 3));
        expect(profile.calibration[2].max).toBeCloseTo(660 / 1024, 6);
        // Raw sticks: up = +, so full throttle up reads 2000 without inversion.
        const up = makeSnapshot({ axes: [0, 0, 0.65, 0, 0], buttons: Array(8).fill(false) });
        expect(mapGamepadToChannels(up, profile).Throttle).toBe(2000);
        // Flight mode switch on buttons 6/7: top (neither) / middle (6) / bottom (7).
        const at = (pressed) =>
            makeSnapshot({
                axes: [0, 0, -0.64, 0, 0],
                buttons: Array.from({ length: 8 }, (_, i) => pressed.includes(i)),
            });
        expect(mapGamepadToChannels(at([]), profile)).toMatchObject({ Aux1: 1000, Aux2: 1000, Aux3: 2000 });
        expect(mapGamepadToChannels(at([6]), profile).Aux1).toBe(1500);
        expect(mapGamepadToChannels(at([7]), profile).Aux1).toBe(2000);
        // C2 switch on buttons 4/5; the latched button 3 reads low while pressed (its rest).
        expect(mapGamepadToChannels(at([4, 3]), profile)).toMatchObject({ Aux2: 1500, Aux3: 1000 });
        expect(mapGamepadToChannels(at([5]), profile).Aux2).toBe(2000);
        expect(profile.bindings.Aux4.kind).toBe("none");
        expect(profile.bindings.Aux5.kind).toBe("none");
    });

    it("uses the remapped axis order when the browser reports the standard mapping", () => {
        const profile = createProfile("C5 (STANDARD GAMEPAD Vendor: 2ca3 Product: 1020)", "standard");
        expect(profile.presetName).toBe("DJI FPV Remote Controller 2");
        expect(profile.bindings.Yaw).toMatchObject(createBinding("axis", 0));
        expect(profile.bindings.Throttle).toMatchObject(createBinding("axis", 1, true));
        expect(profile.bindings.Roll).toMatchObject(createBinding("axis", 2));
        expect(profile.bindings.Pitch).toMatchObject(createBinding("axis", 3, true));
        // As recorded on the bench: axis 5 top 0 / middle -1 / bottom +1, axis 6 top +1 /
        // middle 0 / bottom -1, button 5 a latching button pressed at rest.
        const at = (a5, a6, pressed = [5]) =>
            makeSnapshot({
                axes: [0, 0.7, 0, 0, 0, a5, a6],
                buttons: Array.from({ length: 9 }, (_, i) => pressed.includes(i)),
            });
        expect(mapGamepadToChannels(at(0, 1), profile)).toMatchObject({
            Roll: 1500,
            Pitch: 1500,
            Yaw: 1500,
            Aux1: 1000,
            Aux2: 1000,
            Aux3: 1000,
        });
        expect(mapGamepadToChannels(at(-1, 0), profile)).toMatchObject({ Aux1: 1500, Aux2: 1500 });
        expect(mapGamepadToChannels(at(1, -1), profile)).toMatchObject({ Aux1: 2000, Aux2: 2000 });
        expect(mapGamepadToChannels(at(1, -1, []), profile).Aux3).toBe(2000);
        expect(mapGamepadToChannels(at(0, 1), profile).Throttle).toBeLessThan(1200);
        expect(profile.bindings.Aux4.kind).toBe("none");
        expect(profile.bindings.Aux5.kind).toBe("none");
        expect(profile.auxCount).toBe(5);
    });

    it("gives an unknown device the common stick order and no switches", () => {
        const raw = createProfile("Generic Pad");
        expect(raw.presetName).toBeNull();
        // Raw joystick (EdgeTX/OpenTX): AETR, up = +.
        expect(raw.bindings.Roll).toEqual(createBinding("axis", 0));
        expect(raw.bindings.Pitch).toEqual(createBinding("axis", 1));
        expect(raw.bindings.Throttle).toEqual(createBinding("axis", 2));
        expect(raw.bindings.Yaw).toEqual(createBinding("axis", 3));
        // Browser "standard" layout: Mode 2, up = -1.
        const std = createProfile("Pad (STANDARD GAMEPAD Vendor: 1234 Product: 0001)", "standard");
        expect(std.bindings.Yaw).toEqual(createBinding("axis", 0));
        expect(std.bindings.Throttle).toEqual(createBinding("axis", 1, true));
        expect(std.bindings.Roll).toEqual(createBinding("axis", 2));
        expect(std.bindings.Pitch).toEqual(createBinding("axis", 3, true));
        expect(
            CHANNEL_NAMES.filter((name) => name.startsWith("Aux")).every((name) => std.bindings[name].kind === "none"),
        ).toBe(true);
        expect(std.auxCount).toBe(4);
    });
});

describe("axis helpers", () => {
    it("sanitizes NaN and out-of-range readings", () => {
        expect(sanitizeAxis(Number.NaN)).toBe(0);
        expect(sanitizeAxis(undefined)).toBe(0);
        expect(sanitizeAxis(3)).toBe(1);
        expect(sanitizeAxis(-7)).toBe(-1);
        expect(sanitizeAxis(0.25)).toBe(0.25);
    });

    it("maps -1..1 to 1000..2000", () => {
        expect(axisToChannel(-1)).toBe(1000);
        expect(axisToChannel(0)).toBe(1500);
        expect(axisToChannel(1)).toBe(2000);
        expect(axisToChannel(0.5)).toBe(1750);
        expect(axisToChannel(Number.NaN)).toBe(1500);
    });

    it("calibrates an off-centre axis so centre reads 0 and the ends read ±1", () => {
        const cal = { min: -0.8, center: 0.1, max: 0.6 };
        expect(calibrateAxis(0.1, cal)).toBe(0);
        expect(calibrateAxis(0.6, cal)).toBe(1);
        expect(calibrateAxis(-0.8, cal)).toBe(-1);
        expect(calibrateAxis(0.35, cal)).toBeCloseTo(0.5, 6);
        expect(calibrateAxis(0.9, cal)).toBe(1); // beyond the learned range still clamps
        expect(calibrateAxis(0.3, null)).toBe(0.3);
        expect(calibrateAxis(0.3, { min: 0, center: 0, max: 0 })).toBe(0);
    });

    it("centres the throttle like any other stick", () => {
        // DJI FPV RC 2 over USB: the self-centring throttle idles a little below zero.
        const profile = createProfile(DJI_ID); // raw layout: Throttle = axis 2, up = +
        profile.calibration[2] = { min: -0.79, center: -0.03, max: 0.14 };
        const read = (v) =>
            resolveBinding("Throttle", profile.bindings.Throttle, makeSnapshot({ axes: [0, 0, v, 0, 0] }), profile);
        expect(read(-0.03)).toBe(1500);
        expect(read(0.14)).toBe(2000);
        expect(read(-0.79)).toBe(1000);
        expect(read(0.5)).toBe(2000);
    });

    it("setStickCenter takes the current stick readings as centre and nothing else", () => {
        const std = createProfile(DJI_ID, "standard"); // sticks on axes 0-3, no calibration
        const idle = makeSnapshot({ axes: [-0.052, 0.079, -0.055, 0.045, 0, 1, -1] });
        const centred = setStickCenter(std, idle);
        expect(std.calibration).toEqual({}); // the given profile is left alone
        expect(centred.calibration[0]).toEqual({ min: -1, center: -0.052, max: 1 });
        expect(centred.calibration[1]).toEqual({ min: -1, center: 0.079, max: 1 });
        expect(centred.calibration[3]).toEqual({ min: -1, center: 0.045, max: 1 });
        expect(centred.calibration[5]).toBeUndefined(); // switch axes are not sticks
        expect(centred.bindings).toEqual(std.bindings);
        // Idle now reads mid on every stick, full travel still reaches the ends.
        for (const name of ["Roll", "Pitch", "Throttle", "Yaw"]) {
            expect(resolveBinding(name, centred.bindings[name], idle, centred)).toBe(1500);
        }
        const full = makeSnapshot({ axes: [1.16, -1.26, 1.16, -1.26, 0, 1, -1] });
        expect(resolveBinding("Yaw", centred.bindings.Yaw, full, centred)).toBe(2000);
        expect(resolveBinding("Throttle", centred.bindings.Throttle, full, centred)).toBe(2000); // inverted
        expect(resolveBinding("Roll", centred.bindings.Roll, full, centred)).toBe(2000);
        expect(resolveBinding("Pitch", centred.bindings.Pitch, full, centred)).toBe(2000); // inverted
        // A preset range (raw layout, ±660/1024) keeps its ends and only moves the centre.
        const raw = setStickCenter(createProfile(DJI_ID), makeSnapshot({ axes: [-0.03, -0.03, -0.03, -0.03, 0] }));
        expect(raw.calibration[0].max).toBeCloseTo(660 / 1024, 6);
        expect(raw.calibration[0].center).toBe(-0.03);
        // Without a snapshot the profile comes back unchanged.
        expect(setStickCenter(std, null).calibration).toEqual({});
    });

    it("stored centres re-apply by axis and ignore junk", () => {
        const std = createProfile(DJI_ID, "standard");
        const idle = makeSnapshot({ axes: [-0.052, 0.079, -0.055, 0.045, 0, 1, -1] });
        const centers = readStickCenters(std, idle);
        expect(centers).toEqual({ 0: -0.052, 1: 0.079, 2: -0.055, 3: 0.045 });
        expect(readStickCenters(std, null)).toEqual({});
        // What was stored (JSON round trip: keys become strings) restores the same profile.
        const restored = applyStickCenters(std, JSON.parse(JSON.stringify(centers)));
        expect(restored).toEqual(setStickCenter(std, idle));
        // Entries for non-stick axes or with non-numeric values are dropped, nothing else changes.
        const junk = applyStickCenters(std, { 5: 1, 0: "x", 1: Number.NaN, 3: 0.045 });
        expect(junk.calibration).toEqual({ 3: { min: -1, center: 0.045, max: 1 } });
        expect(applyStickCenters(std, null).calibration).toEqual({});
    });

    it("turns buttons into min/max with optional inversion", () => {
        expect(buttonToChannel({ pressed: true })).toBe(2000);
        expect(buttonToChannel({ pressed: false })).toBe(1000);
        expect(buttonToChannel({ pressed: false }, true)).toBe(2000);
        expect(buttonToChannel(1)).toBe(2000);
        expect(buttonToChannel(0.2)).toBe(1000);
    });
});

describe("binding resolution", () => {
    const profile = createProfile(DJI_ID);

    it("reads a bound axis, with inversion and calibration", () => {
        // Standard-layout DJI profile: Chromium already scales the axes, no preset calibration.
        const std = createProfile(DJI_ID, "standard");
        const snapshot = makeSnapshot({ axes: [0.5, -0.5, 0.5, -1, 0, 0, 0] });
        expect(resolveBinding("Yaw", std.bindings.Yaw, snapshot, std)).toBe(1750);
        expect(resolveBinding("Throttle", std.bindings.Throttle, snapshot, std)).toBe(1750); // inverted
        expect(resolveBinding("Roll", std.bindings.Roll, snapshot, std)).toBe(1750);
        expect(resolveBinding("Pitch", std.bindings.Pitch, snapshot, std)).toBe(2000); // inverted
        // Raw layout: the ±660/1024 range calibration stretches 0.64 to full scale.
        expect(
            resolveBinding("Roll", profile.bindings.Roll, makeSnapshot({ axes: [0.6445, 0, 0, 0, 0] }), profile),
        ).toBe(2000);
    });

    it("returns null for unbound channels and for axes the device lacks", () => {
        const snapshot = makeSnapshot({ axes: [0, 0] });
        expect(resolveBinding("Aux1", profile.bindings.Aux1, snapshot, profile)).toBeNull();
        expect(resolveBinding("Throttle", profile.bindings.Throttle, snapshot, profile)).toBeNull();
        expect(resolveBinding("Roll", profile.bindings.Roll, null, profile)).toBeNull();
        expect(
            resolveBinding("Aux1", createBinding("button", 9), makeSnapshot({ buttons: [true] }), profile),
        ).toBeNull();
    });

    it("reads a bound button", () => {
        const snapshot = makeSnapshot({ buttons: [false, true] });
        expect(resolveBinding("Aux1", createBinding("button", 1), snapshot, profile)).toBe(2000);
        expect(resolveBinding("Aux1", createBinding("button", 0), snapshot, profile)).toBe(1000);
    });

    it("keeps fallback values for unbound or unresolvable channels", () => {
        const generic = createProfile("Generic Pad");
        generic.bindings.Roll = createBinding("axis", 0);
        generic.bindings.Aux2 = createBinding("button", 12); // beyond this device's buttons
        const snapshot = makeSnapshot({ axes: [0, 0, -1, 0, 0], buttons: [false] });
        const current = { ...DEFAULT_CHANNEL_VALUES, Aux1: 1300, Aux2: 1700 };
        const values = mapGamepadToChannels(snapshot, generic, current);
        expect(values.Roll).toBe(1500);
        expect(values.Throttle).toBe(1000);
        expect(values.Aux1).toBe(1300);
        expect(values.Aux2).toBe(1700);
        expect(mapGamepadToChannels(null, generic).Aux1).toBe(DEFAULT_CHANNEL_VALUES.Aux1);
    });

    it("produces the MSP payload order and clamps", () => {
        expect(
            channelsToMspArray({
                Roll: 1500,
                Pitch: 1600,
                Throttle: 999,
                Yaw: 2500,
                Aux1: 1000,
                Aux2: 1000,
                Aux3: 1000,
                Aux4: 2000,
            }),
        ).toEqual([1500, 1600, 1000, 2000, 1000, 1000, 1000, 2000, 1000, 1000, 1000, 1000]);
        expect(channelsToMspArray({})).toEqual([
            1500, 1500, 1000, 1500, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000,
        ]);
    });
});

describe("snapshots and calibration", () => {
    it("copies a live Gamepad object into plain data", () => {
        const snapshot = snapshotGamepad({
            index: 2,
            id: DJI_ID,
            mapping: "",
            timestamp: 12.5,
            axes: [0.1, Number.NaN, 2],
            buttons: [
                { pressed: true, value: 1 },
                { pressed: false, value: 0 },
            ],
        });
        expect(snapshot).toEqual({
            index: 2,
            id: DJI_ID,
            connected: true,
            mapping: "",
            timestamp: 12.5,
            axes: [0.1, 0, 1],
            buttons: [
                { pressed: true, value: 1 },
                { pressed: false, value: 0 },
            ],
        });
        expect(snapshotGamepad(null)).toBeNull();
    });
});

describe("multi-position switches", () => {
    it("spreads positions evenly over the channel range", () => {
        expect(switchPositionValues(1)).toEqual([1000]);
        expect(switchPositionValues(2)).toEqual([1000, 2000]);
        expect(switchPositionValues(3)).toEqual([1000, 1500, 2000]);
        expect(switchPositionValues(6)).toEqual([1000, 1200, 1400, 1600, 1800, 2000]);
    });

    it("records a three-position switch exposed as one axis", () => {
        const controls = [{ type: "axis", index: 5 }];
        const binding = createSwitchBinding(controls, [[-1], [-1], [0], [1], [0.98]]);
        expect(binding.kind).toBe("switch");
        expect(binding.positions).toEqual([
            { signature: [-1], value: 1000 },
            { signature: [0], value: 1500 },
            { signature: [1], value: 2000 },
        ]);
        expect(resolveSwitch(binding, makeSnapshot({ axes: [0, 0, 0, 0, 0, 0.05, 0] }))).toBe(1500);
        expect(resolveSwitch(binding, makeSnapshot({ axes: [0, 0, 0, 0, 0, 0.9, 0] }))).toBe(2000);
        expect(resolveSwitch({ ...binding, invert: true }, makeSnapshot({ axes: [0, 0, 0, 0, 0, -1, 0] }))).toBe(2000);
        // Device without that axis: unresolved, the caller keeps its fallback.
        expect(resolveSwitch(binding, makeSnapshot({ axes: [0, 0] }))).toBeNull();
    });

    it("records a three-position switch made of two buttons", () => {
        const controls = [
            { type: "button", index: 3 },
            { type: "button", index: 4 },
        ];
        const binding = createSwitchBinding(controls, [
            [1, 0],
            [0, 0],
            [0, 1],
        ]);
        expect(binding.positions.map((p) => p.value)).toEqual([1000, 1500, 2000]);
        const at = (b3, b4) => makeSnapshot({ buttons: [false, false, false, b3, b4] });
        expect(resolveSwitch(binding, at(true, false))).toBe(1000);
        expect(resolveSwitch(binding, at(false, false))).toBe(1500);
        expect(resolveSwitch(binding, at(false, true))).toBe(2000);
    });

    it("needs at least two distinct positions", () => {
        expect(createSwitchBinding([{ type: "axis", index: 5 }], [[-1], [-1], [-0.9]])).toBeNull();
        expect(createSwitchBinding([], [[1], [0]])).toBeNull();
    });

    it("resolves a switch through the generic channel mapping", () => {
        const profile = createProfile(DJI_ID, "standard");
        profile.bindings.Aux2 = createSwitchBinding([{ type: "axis", index: 5 }], [[-1], [0], [1]]);
        const snapshot = makeSnapshot({ axes: [0, 0.7, 0, 0, 0, 1, 0] });
        expect(mapGamepadToChannels(snapshot, profile).Aux2).toBe(2000);
    });
});

describe("switching away from the gamepad", () => {
    it("returns every bound channel to its safe default and keeps the rest", () => {
        const std = createProfile(DJI_ID, "standard"); // sticks + Aux1-3 bound, Aux4+ not
        const live = {
            ...DEFAULT_CHANNEL_VALUES,
            Roll: 1700,
            Pitch: 1300,
            Throttle: 1858,
            Yaw: 1600,
            Aux1: 1500,
            Aux2: 2000,
            Aux3: 2000, // armed
            Aux4: 1800, // set by its slider, not by the gamepad
        };
        const released = releaseBoundChannels(live, std);
        expect(released).toEqual({
            ...live,
            Roll: 1500,
            Pitch: 1500,
            Throttle: 1000,
            Yaw: 1500,
            Aux1: 1000,
            Aux2: 1000,
            Aux3: 1000,
        });
        expect(live.Aux3).toBe(2000); // the input is left alone
    });

    it("leaves everything as is for a profile with nothing bound", () => {
        const live = { ...DEFAULT_CHANNEL_VALUES, Throttle: 1400, Aux1: 2000 };
        const empty = createProfile("Unknown pad");
        for (const name of Object.keys(empty.bindings)) {
            empty.bindings[name] = { kind: "none", index: 0, invert: false };
        }
        expect(releaseBoundChannels(live, empty)).toEqual(live);
    });
});
