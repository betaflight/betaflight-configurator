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

/**
 * Pure helpers that turn a Gamepad API snapshot into MSP RC channel values for the
 * Radio Emulator popup. Nothing in here touches the DOM, the Gamepad API or MSP, so it
 * can be unit-tested and reused by any other input source.
 *
 * Channel values are RC microseconds: 1000 (min) … 1500 (mid) … 2000 (max), the same
 * range the mouse-driven sticks produce.
 */

export const CHANNEL_MIN_VALUE = 1000;
export const CHANNEL_MID_VALUE = 1500;
export const CHANNEL_MAX_VALUE = 2000;

export type ChannelName =
    "Roll" | "Pitch" | "Throttle" | "Yaw" | "Aux1" | "Aux2" | "Aux3" | "Aux4" | "Aux5" | "Aux6" | "Aux7" | "Aux8";

// MSP_SET_RAW_RC order (index = position in the payload). Betaflight takes up to 18 channels;
// eight AUX covers every switch and dial a radio is likely to expose.
export const CHANNEL_NAMES: readonly ChannelName[] = [
    "Roll",
    "Pitch",
    "Throttle",
    "Yaw",
    "Aux1",
    "Aux2",
    "Aux3",
    "Aux4",
    "Aux5",
    "Aux6",
    "Aux7",
    "Aux8",
];
const AUX_CHANNEL_NAMES: readonly ChannelName[] = CHANNEL_NAMES.filter((name) => name.startsWith("Aux"));
const STICK_CHANNEL_NAMES: readonly ChannelName[] = ["Roll", "Pitch", "Throttle", "Yaw"];
/** AUX channels for a radio no preset knows. */
export const DEFAULT_AUX_COUNT = 4;

/** The channels a profile shows and sends: the sticks plus its AUX count (never fewer than its highest bound AUX). */
export function activeChannelNames(profile: Pick<GamepadProfile, "auxCount" | "bindings">): ChannelName[] {
    let aux = Math.min(Math.max(profile.auxCount, 1), AUX_CHANNEL_NAMES.length);
    AUX_CHANNEL_NAMES.forEach((name, i) => {
        if (profile.bindings[name]?.kind !== "none") {
            aux = Math.max(aux, i + 1);
        }
    });
    return [...STICK_CHANNEL_NAMES, ...AUX_CHANNEL_NAMES.slice(0, aux)];
}

export type ChannelValues = Record<ChannelName, number>;

// Safe rest values: sticks centred, throttle and AUX low (nothing armed).
export const DEFAULT_CHANNEL_VALUES: Readonly<ChannelValues> = Object.freeze({
    Roll: CHANNEL_MID_VALUE,
    Pitch: CHANNEL_MID_VALUE,
    Throttle: CHANNEL_MIN_VALUE,
    Yaw: CHANNEL_MID_VALUE,
    Aux1: CHANNEL_MIN_VALUE,
    Aux2: CHANNEL_MIN_VALUE,
    Aux3: CHANNEL_MIN_VALUE,
    Aux4: CHANNEL_MIN_VALUE,
    Aux5: CHANNEL_MIN_VALUE,
    Aux6: CHANNEL_MIN_VALUE,
    Aux7: CHANNEL_MIN_VALUE,
    Aux8: CHANNEL_MIN_VALUE,
});

export type BindingKind = "none" | "axis" | "button" | "switch";

/** Switch positions are told apart by the L1 distance of their signatures. */
const SWITCH_POSITION_TOLERANCE = 0.25;

/** One gamepad control a switch binding reads. */
export interface ControlRef {
    type: "axis" | "button";
    index: number;
}

/** One position of a multi-position switch: the control readings that identify it and the RC value it gives. */
export interface SwitchPosition {
    signature: number[];
    value: number;
}

/**
 * A binding ties one RC channel to a gamepad control:
 * - "axis": proportional, the stick axes (index = axis).
 * - "button": a momentary button (index = button).
 * - "switch": a multi-position switch recorded by the setup wizard. Radios expose these
 *   in many ways (an axis stepping -1/0/+1, one button per position, a pair of buttons for
 *   a three-position switch), so the binding keeps the controls involved and the signature
 *   each position produces; at run time the nearest recorded position wins.
 */
export interface Binding {
    kind: BindingKind;
    index: number;
    invert: boolean;
    controls?: ControlRef[];
    positions?: SwitchPosition[];
    /** What the control is called on the radio, when a preset knows (e.g. "C1 button"). */
    label?: string;
}

/** Learned range of one raw axis (Gamepad API units, -1..1). */
export interface AxisCalibration {
    min: number;
    center: number;
    max: number;
}

export type Calibration = Record<number, AxisCalibration>;

export interface GamepadProfile {
    gamepadId: string;
    /** Gamepad.mapping the profile was built for ("" raw, "standard" remapped). */
    mapping: string;
    presetName: string | null;
    /** AUX channels shown and sent (4 + auxCount channels in MSP_SET_RAW_RC). */
    auxCount: number;
    bindings: Record<ChannelName, Binding>;
    calibration: Calibration;
}

export interface ButtonSnapshot {
    pressed: boolean;
    value: number;
}

/** A plain copy of a Gamepad: Chromium updates the live object in place between polls. */
export interface GamepadSnapshot {
    index: number;
    id: string;
    connected: boolean;
    mapping: string;
    timestamp: number;
    axes: number[];
    buttons: ButtonSnapshot[];
}

/** Anything shaped like a GamepadButton, or a bare pressed flag/value. */
export type ButtonLike = { pressed?: boolean; value?: number } | number | boolean | null | undefined;

/** The slice of a Gamepad this module reads; the real one satisfies it. */
export interface GamepadLike {
    index: number;
    id: string;
    connected?: boolean;
    mapping?: string;
    timestamp?: number;
    axes: ArrayLike<number>;
    buttons: ArrayLike<ButtonLike>;
}

/** What a preset knows about one way the browser can present a device. */
export interface GamepadPresetLayout {
    bindings: Partial<Record<ChannelName, Binding>>;
    calibration?: Calibration;
}

export interface GamepadPreset {
    name: string;
    vendorId: number;
    productId: number;
    /** How many AUX channels the radio drives, as the DJI air unit's SBUS layout counts them. */
    auxCount: number;
    /** The raw HID order (Gamepad.mapping === "": Firefox, SDL-based tools). */
    raw: GamepadPresetLayout;
    /** The browser's remapped "standard" layout, when it has one for this device. */
    standard?: GamepadPresetLayout;
}

export function createBinding(kind: BindingKind = "none", index = -1, invert = false): Binding {
    return { kind, index, invert };
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

/**
 * Parse the vendor/product ids out of a Gamepad.id string.
 * Chromium: "C5 (Vendor: 2ca3 Product: 1020)", Firefox: "2ca3-1020-C5".
 * Either id is null when the string carries none.
 */
export function parseGamepadId(id: unknown): { vendorId: number | null; productId: number | null; name: string } {
    const text = String(id ?? "");
    let vendorId: number | null = null;
    let productId: number | null = null;
    let name = text;

    const chromium = /vendor:\s*([0-9a-f]{1,4})\s+product:\s*([0-9a-f]{1,4})/i.exec(text);
    const firefox = /^([0-9a-f]{1,4})-([0-9a-f]{1,4})-(.*)$/i.exec(text);
    if (chromium) {
        vendorId = parseInt(chromium[1], 16);
        productId = parseInt(chromium[2], 16);
        name = text.slice(0, chromium.index).trim().replace(/\($/, "").trim();
    } else if (firefox) {
        vendorId = parseInt(firefox[1], 16);
        productId = parseInt(firefox[2], 16);
        name = firefox[3].trim();
    }

    return { vendorId, productId, name: name || text };
}

/** A multi-position switch binding written out by hand, for presets. */
function presetSwitch(label: string, controls: ControlRef[], signatures: number[][], values?: number[]): Binding {
    const binding = createSwitchBinding(controls, signatures, false, values);
    if (!binding) {
        throw new Error("preset switch needs at least two positions");
    }
    return { ...binding, label };
}

function presetAxis(label: string, index: number, invert = false): Binding {
    return { ...createBinding("axis", index, invert), label };
}

function presetButton(label: string, index: number): Binding {
    return { ...createBinding("button", index), label };
}

const DJI_STICKS = {
    roll: "Right stick \u2194 (roll)",
    pitch: "Right stick \u2195 (pitch)",
    throttle: "Left stick \u2195 (throttle)",
    yaw: "Left stick \u2194 (yaw)",
};

/** DJI radios claim ±1024 on their analog axes while the sticks really reach ±660. */
const DJI_RAW_RANGE: AxisCalibration = { min: -660 / 1024, center: 0, max: 660 / 1024 };
const DJI_RAW_STICK_CALIBRATION: Calibration = {
    0: { ...DJI_RAW_RANGE },
    1: { ...DJI_RAW_RANGE },
    2: { ...DJI_RAW_RANGE },
    3: { ...DJI_RAW_RANGE },
    4: { ...DJI_RAW_RANGE },
};

/**
 * Known radios, by USB vendor/product id. A preset seeds a new profile; Calibrate rebuilds
 * it from what the radio actually does and the user can edit every entry.
 *
 * DJI's air units hand the radio's switches to the flight controller over SBUS in a fixed
 * order, which Betaflight users know as AUX1 … AUX5; the presets keep that order so a
 * radio driven through the emulator lands on the same channels as through the air unit:
 *   AUX1 flight mode switch (N / S / M), AUX2 C2 switch, AUX3 Flight Pause / RTH,
 *   AUX4 Start/Stop, AUX5 C1.
 *
 * DJI FPV Remote Controller 2 ("C5", 2ca3:1020): one 13-byte HID report, 24 button bits
 * then five int16 axes. Chromium ships a dedicated mapper for it (device/gamepad/
 * gamepad_standard_mappings_*.cc, MapperDjiFpv); what each control reads was recorded on
 * the bench (2026-10-16, position by position):
 *   raw HID             | Chromium "standard"        | control
 *   --------------------+----------------------------+-------------------------------
 *   axis 0              | axis 2                     | right stick left/right (roll)
 *   axis 1 (up = +)     | axis 3 (up = -)            | right stick up/down    (pitch)
 *   axis 2 (up = +)     | axis 1 (up = -)            | left stick up/down     (throttle)
 *   axis 3              | axis 0                     | left stick left/right  (yaw)
 *   axis 4              | axis 4                     | gimbal dial (never moved on the bench)
 *   buttons 6 / 7       | axis 5: top 0, mid -1, low +1 | three-position switch (flight mode)
 *   buttons 4 / 5       | axis 6: top +1, mid 0, low -1 | three-position switch (C2)
 *   button 3            | button 5 (pressed at rest) | Start/Stop: the radio latches it and
 *                       |                            | reports the state (arm toggle over SBUS)
 *   buttons 0, 1, 2     | buttons 8, 7, 4            | C1, Shutter/Record, Pause/RTH: never
 *                       |                            | seen to change over USB, not assigned
 * The channel order is the one the DJI air unit uses over SBUS, read back from a flight
 * controller set up for this radio: AUX1 flight mode (ANGLE in the middle), AUX2 the C2
 * switch, AUX3 Start/Stop as the arm toggle, AUX4 the beeper and AUX5 C1 (the last two
 * never reach USB).
 * The descriptor claims ±1024 for the analog axes while the sticks really reach ±660, so
 * the raw layout carries that range as calibration; Chromium already rescales it.
 *
 * DJI FPV Remote Controller 3 (2ca3:1021, "DJI Virtual Joystick") sends the same 13-byte
 * report on a vendor-defined HID usage page, so browsers' Gamepad API normally does not
 * list it; the entry documents its raw layout (v3rm0n/dji-fpv3, fpv-web) for the day it
 * does: buttons 1 C1, 2 C2, 3 one position of the left-centre switch, 5 Shutter / Record.
 */
const GAMEPAD_PRESETS: readonly GamepadPreset[] = [
    {
        name: "DJI FPV Remote Controller 2",
        vendorId: 0x2ca3,
        productId: 0x1020,
        auxCount: 5,
        raw: {
            bindings: {
                Roll: presetAxis(DJI_STICKS.roll, 0),
                Pitch: presetAxis(DJI_STICKS.pitch, 1),
                Throttle: presetAxis(DJI_STICKS.throttle, 2),
                Yaw: presetAxis(DJI_STICKS.yaw, 3),
                // Top (neither) / middle (button 6) / bottom (button 7)
                Aux1: presetSwitch(
                    "Flight mode switch (N / S / M)",
                    [
                        { type: "button", index: 6 },
                        { type: "button", index: 7 },
                    ],
                    [
                        [0, 0],
                        [1, 0],
                        [0, 1],
                    ],
                ),
                // Top (neither) / middle (button 4) / bottom (button 5)
                Aux2: presetSwitch(
                    "C2 switch",
                    [
                        { type: "button", index: 4 },
                        { type: "button", index: 5 },
                    ],
                    [
                        [0, 0],
                        [1, 0],
                        [0, 1],
                    ],
                ),
                // Latching push button, pressed at rest.
                Aux3: presetSwitch("Start/Stop button (latched)", [{ type: "button", index: 3 }], [[1], [0]]),
            },
            calibration: DJI_RAW_STICK_CALIBRATION,
        },
        standard: {
            bindings: {
                Yaw: presetAxis(DJI_STICKS.yaw, 0),
                Throttle: presetAxis(DJI_STICKS.throttle, 1, true),
                Roll: presetAxis(DJI_STICKS.roll, 2),
                Pitch: presetAxis(DJI_STICKS.pitch, 3, true),
                // Top / middle / bottom as the axis reads them.
                Aux1: presetSwitch("Flight mode switch (N / S / M)", [{ type: "axis", index: 5 }], [[0], [-1], [1]]),
                Aux2: presetSwitch("C2 switch", [{ type: "axis", index: 6 }], [[1], [0], [-1]]),
                // Latching push button, pressed at rest.
                Aux3: presetSwitch("Start/Stop button (latched)", [{ type: "button", index: 5 }], [[1], [0]]),
            },
        },
    },
    {
        name: "DJI FPV Remote Controller 3",
        vendorId: 0x2ca3,
        productId: 0x1021,
        auxCount: 5,
        raw: {
            bindings: {
                Roll: presetAxis(DJI_STICKS.roll, 0),
                Pitch: presetAxis(DJI_STICKS.pitch, 1),
                Throttle: presetAxis(DJI_STICKS.throttle, 2),
                Yaw: presetAxis(DJI_STICKS.yaw, 3),
                Aux3: presetButton("Shutter / Record button", 5),
                Aux5: presetButton("C1 button", 1),
            },
            calibration: DJI_RAW_STICK_CALIBRATION,
        },
    },
];

/** Mode 2 on the W3C "standard" layout: left stick throttle/yaw, right stick pitch/roll, up = -1. */
const UNKNOWN_STANDARD_STICKS: Record<string, Binding> = {
    Yaw: createBinding("axis", 0),
    Throttle: createBinding("axis", 1, true),
    Roll: createBinding("axis", 2),
    Pitch: createBinding("axis", 3, true),
};

/** AETR channel order, as EdgeTX/OpenTX radios send it in USB joystick mode. */
const UNKNOWN_RAW_STICKS: Record<string, Binding> = {
    Roll: createBinding("axis", 0),
    Pitch: createBinding("axis", 1),
    Throttle: createBinding("axis", 2),
    Yaw: createBinding("axis", 3),
};

export function findPreset(id: unknown): GamepadPreset | null {
    const { vendorId, productId } = parseGamepadId(id);
    if (vendorId === null) {
        return null;
    }
    return GAMEPAD_PRESETS.find((p) => p.vendorId === vendorId && p.productId === productId) ?? null;
}

function emptyBindings(): Record<ChannelName, Binding> {
    const bindings = {} as Record<ChannelName, Binding>;
    for (const name of CHANNEL_NAMES) {
        bindings[name] = createBinding();
    }
    return bindings;
}

/**
 * A fresh profile for the gamepad with this id, seeded from a preset when one matches.
 * `mapping` is Gamepad.mapping: "standard" picks the preset's remapped bindings.
 */
export function createProfile(id: unknown, mapping = ""): GamepadProfile {
    const preset = findPreset(id);
    const profile: GamepadProfile = {
        gamepadId: String(id ?? ""),
        mapping: mapping === "standard" ? "standard" : "",
        presetName: preset?.name ?? null,
        auxCount: preset?.auxCount ?? DEFAULT_AUX_COUNT,
        bindings: emptyBindings(),
        calibration: {},
    };
    if (!preset) {
        // No preset: assume the common stick orders. A browser that remapped the device to
        // the W3C "standard" layout puts the left stick on axes 0/1 and the right on 2/3 with
        // up = -1 (Mode 2); a raw joystick (EdgeTX/OpenTX in USB joystick mode) sends its
        // channels in AETR order with up = +.
        const sticks = mapping === "standard" ? UNKNOWN_STANDARD_STICKS : UNKNOWN_RAW_STICKS;
        for (const name of STICK_CHANNEL_NAMES) {
            profile.bindings[name] = { ...sticks[name] };
        }
    }
    if (preset) {
        const layout = (mapping === "standard" && preset.standard) || preset.raw;
        for (const name of CHANNEL_NAMES) {
            const binding = layout.bindings[name];
            if (binding) {
                profile.bindings[name] = JSON.parse(JSON.stringify(binding)) as Binding;
            }
        }
        for (const [axis, cal] of Object.entries(layout.calibration ?? {})) {
            profile.calibration[Number(axis)] = { ...cal };
        }
    }
    return profile;
}

/** Centre of each stick axis, keyed by axis index: what "Set centre" captured. */
export type StickCenters = Record<number, number>;

/** The sticks' current raw readings, keyed by axis index — the input for `applyStickCenters`. */
export function readStickCenters(profile: GamepadProfile, snapshot: GamepadSnapshot | null | undefined): StickCenters {
    const centers: StickCenters = {};
    if (!snapshot) {
        return centers;
    }
    for (const name of STICK_CHANNEL_NAMES) {
        const binding = profile.bindings[name];
        if (binding.kind !== "axis") {
            continue;
        }
        const raw = snapshot.axes?.[binding.index];
        if (raw !== undefined) {
            centers[binding.index] = sanitizeAxis(raw);
        }
    }
    return centers;
}

/**
 * Move the sticks' centres to the given readings, so a radio whose idle values sit off zero
 * (the DJI FPV RC 2 sends uncalibrated values over USB) rests at mid stick. The range stays
 * whatever the profile had, nominally ±1; entries that are not finite numbers or do not
 * belong to a stick axis are ignored. Returns a new profile and leaves the given one alone.
 */
export function applyStickCenters(profile: GamepadProfile, centers: StickCenters | null | undefined): GamepadProfile {
    const calibration: Calibration = {};
    for (const [axis, cal] of Object.entries(profile.calibration)) {
        calibration[Number(axis)] = { ...cal };
    }
    const stickAxes = new Set<number>();
    for (const name of STICK_CHANNEL_NAMES) {
        const binding = profile.bindings[name];
        if (binding.kind === "axis") {
            stickAxes.add(binding.index);
        }
    }
    for (const [key, center] of Object.entries(centers ?? {})) {
        const axis = Number(key);
        if (!stickAxes.has(axis) || !isFiniteNumber(center)) {
            continue;
        }
        const current = calibration[axis] ?? { min: -1, center: 0, max: 1 };
        calibration[axis] = { ...current, center: sanitizeAxis(center) };
    }
    return { ...profile, calibration };
}

/** Take the sticks' current positions as their centre; see `applyStickCenters`. */
export function setStickCenter(profile: GamepadProfile, snapshot: GamepadSnapshot | null | undefined): GamepadProfile {
    return applyStickCenters(profile, readStickCenters(profile, snapshot));
}

/** Clamp an axis reading to -1..1; NaN, undefined or a partial HID report reads as centre. */
export function sanitizeAxis(value: unknown): number {
    if (!isFiniteNumber(value)) {
        return 0;
    }
    return Math.min(Math.max(value, -1), 1);
}

/**
 * Map a raw axis through its calibration: min -> -1, center -> 0, max -> +1, each half
 * scaled on its own so an off-centre rest position still reads 0. Without calibration
 * (or with a degenerate one) the raw value passes through.
 */
export function calibrateAxis(value: unknown, cal: AxisCalibration | null | undefined): number {
    const v = sanitizeAxis(value);
    if (!cal) {
        return v;
    }
    const { min, center, max } = cal;
    if (!isFiniteNumber(min) || !isFiniteNumber(center) || !isFiniteNumber(max)) {
        return v;
    }
    if (v >= center) {
        const span = max - center;
        return span > 1e-6 ? Math.min((v - center) / span, 1) : 0;
    }
    const span = center - min;
    return span > 1e-6 ? Math.max((v - center) / span, -1) : 0;
}

/** -1..1 -> 1000..2000, rounded and clamped. */
export function axisToChannel(value: unknown): number {
    const v = sanitizeAxis(value);
    const channel = Math.round(CHANNEL_MID_VALUE + v * (CHANNEL_MAX_VALUE - CHANNEL_MID_VALUE));
    return Math.min(Math.max(channel, CHANNEL_MIN_VALUE), CHANNEL_MAX_VALUE);
}

function isButtonPressed(button: ButtonLike): boolean {
    if (button && typeof button === "object") {
        return button.pressed === true || (isFiniteNumber(button.value) && button.value > 0.5);
    }
    if (typeof button === "number") {
        return button > 0.5;
    }
    return button === true;
}

export function buttonToChannel(button: ButtonLike, invert = false): number {
    const pressed = isButtonPressed(button) !== !!invert;
    return pressed ? CHANNEL_MAX_VALUE : CHANNEL_MIN_VALUE;
}

/** Copy a live Gamepad into plain data (Chromium reuses the object between polls). */
export function snapshotGamepad(gamepad: GamepadLike | null | undefined): GamepadSnapshot | null {
    if (!gamepad) {
        return null;
    }
    return {
        index: gamepad.index,
        id: String(gamepad.id ?? ""),
        connected: gamepad.connected !== false,
        mapping: gamepad.mapping ?? "",
        timestamp: isFiniteNumber(gamepad.timestamp) ? gamepad.timestamp : 0,
        axes: Array.from(gamepad.axes ?? [], sanitizeAxis),
        buttons: Array.from(gamepad.buttons ?? [], (b): ButtonSnapshot => {
            const pressed = isButtonPressed(b);
            const value = b && typeof b === "object" && isFiniteNumber(b.value) ? b.value : pressed ? 1 : 0;
            return { pressed, value };
        }),
    };
}

/** Read one control of a snapshot: an axis as -1..1, a button as 0/1; null when the device lacks it. */
function readControl(snapshot: GamepadSnapshot | null | undefined, ref: ControlRef): number | null {
    if (!snapshot) {
        return null;
    }
    if (ref.type === "axis") {
        const v = snapshot.axes[ref.index];
        return v === undefined ? null : sanitizeAxis(v);
    }
    const b = snapshot.buttons[ref.index];
    return b === undefined ? null : b.pressed ? 1 : 0;
}

function signatureOf(snapshot: GamepadSnapshot | null | undefined, controls: ControlRef[]): number[] | null {
    const signature: number[] = [];
    for (const ref of controls) {
        const v = readControl(snapshot, ref);
        if (v === null) {
            return null;
        }
        signature.push(v);
    }
    return signature;
}

function signatureDistance(a: number[], b: number[]): number {
    let d = 0;
    for (let i = 0; i < a.length; i++) {
        d += Math.abs(a[i] - (b[i] ?? 0));
    }
    return d;
}

function sameSignature(a: number[], b: number[], tolerance = SWITCH_POSITION_TOLERANCE): boolean {
    return a.length === b.length && signatureDistance(a, b) <= tolerance;
}

/** RC values for an n-position switch, spread evenly from 1000 to 2000 (2: 1000/2000, 3: 1000/1500/2000). */
export function switchPositionValues(count: number): number[] {
    if (count <= 1) {
        return [CHANNEL_MIN_VALUE];
    }
    const step = (CHANNEL_MAX_VALUE - CHANNEL_MIN_VALUE) / (count - 1);
    return Array.from({ length: count }, (_, i) => Math.round(CHANNEL_MIN_VALUE + i * step));
}

/**
 * Build a switch binding from the signatures seen while the user moved the switch from
 * its first position to its last, in that order. Repeats are dropped; fewer than two
 * distinct positions is not a switch.
 */
export function createSwitchBinding(
    controls: ControlRef[],
    signatures: number[][],
    invert = false,
    explicitValues?: number[],
): Binding | null {
    const distinct: number[][] = [];
    for (const sig of signatures) {
        if (sig.length === controls.length && !distinct.some((d) => sameSignature(d, sig))) {
            distinct.push([...sig]);
        }
    }
    if (!controls.length || distinct.length < 2) {
        return null;
    }
    // Presets may give each position its own value (a momentary button read off a shared axis
    // wants 1000 for every state but "pressed"); otherwise positions spread evenly.
    const values = explicitValues?.length === distinct.length ? explicitValues : switchPositionValues(distinct.length);
    return {
        kind: "switch",
        index: -1,
        invert,
        controls: controls.map((c) => ({ ...c })),
        positions: distinct.map((signature, i) => ({ signature, value: values[i] })),
    };
}

/** The controls a switch reads, as "axis 5" / "buttons 6, 7" text for the UI. */
export function describeSwitchControls(binding: Binding | null | undefined): string {
    const controls = binding?.controls ?? [];
    const axes = controls.filter((c) => c.type === "axis").map((c) => c.index);
    const buttons = controls.filter((c) => c.type === "button").map((c) => c.index);
    const parts: string[] = [];
    if (axes.length) {
        parts.push(`${axes.length > 1 ? "axes" : "axis"} ${axes.join(", ")}`);
    }
    if (buttons.length) {
        parts.push(`${buttons.length > 1 ? "buttons" : "button"} ${buttons.join(", ")}`);
    }
    return parts.join(" + ");
}

export function switchPositionCount(binding: Binding | null | undefined): number {
    return binding?.kind === "switch" ? (binding.positions?.length ?? 0) : 0;
}

/** The recorded position nearest to the current readings decides the value. */
export function resolveSwitch(binding: Binding, snapshot: GamepadSnapshot | null | undefined): number | null {
    if (binding.kind !== "switch" || !binding.controls?.length || !binding.positions?.length) {
        return null;
    }
    const signature = signatureOf(snapshot, binding.controls);
    if (!signature) {
        return null;
    }
    let best = binding.positions[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const position of binding.positions) {
        const d = signatureDistance(signature, position.signature);
        if (d < bestDistance) {
            bestDistance = d;
            best = position;
        }
    }
    return binding.invert ? CHANNEL_MIN_VALUE + CHANNEL_MAX_VALUE - best.value : best.value;
}

/**
 * Resolve one channel's binding against a snapshot. Returns the channel value, or null
 * when the channel is unbound or the bound axis/button does not exist on this device.
 */
export function resolveBinding(
    name: ChannelName,
    binding: Binding | null | undefined,
    snapshot: GamepadSnapshot | null | undefined,
    profile: Pick<GamepadProfile, "calibration"> | null | undefined,
): number | null {
    if (!binding || binding.kind === "none" || !snapshot) {
        return null;
    }

    if (binding.kind === "switch") {
        return resolveSwitch(binding, snapshot);
    }

    if (binding.kind === "button") {
        const button = snapshot.buttons?.[binding.index];
        if (button === undefined) {
            return null;
        }
        return buttonToChannel(button, binding.invert);
    }

    if (binding.kind === "axis") {
        const raw = snapshot.axes?.[binding.index];
        if (raw === undefined) {
            return null;
        }
        let v = calibrateAxis(raw, profile?.calibration?.[binding.index]);
        if (binding.invert) {
            v = -v;
        }
        return axisToChannel(v);
    }

    return null;
}

/**
 * Channel values once the gamepad lets go: every channel the profile binds goes back to its
 * safe default (sticks centred, throttle and AUX low), the rest keep their current value.
 * Used when the input switches to the mouse, so the last gamepad frame (an armed AUX, a raised
 * throttle) is not transmitted on until the mouse happens to touch it.
 */
export function releaseBoundChannels(
    values: Readonly<ChannelValues>,
    profile: Pick<GamepadProfile, "bindings">,
): ChannelValues {
    const released: ChannelValues = { ...values };
    for (const name of CHANNEL_NAMES) {
        if ((profile.bindings[name]?.kind ?? "none") !== "none") {
            released[name] = DEFAULT_CHANNEL_VALUES[name];
        }
    }
    return released;
}

/**
 * Map a whole snapshot to channel values. Unbound or unresolvable channels keep the
 * value from `fallback` (the current slider/stick value, or the safe defaults).
 */
export function mapGamepadToChannels(
    snapshot: GamepadSnapshot | null | undefined,
    profile: GamepadProfile | null | undefined,
    fallback: Partial<Record<ChannelName, number>> = DEFAULT_CHANNEL_VALUES,
): ChannelValues {
    const values = {} as ChannelValues;
    for (const name of CHANNEL_NAMES) {
        const resolved = resolveBinding(name, profile?.bindings?.[name], snapshot, profile);
        const fallbackValue = fallback?.[name];
        values[name] = resolved ?? (isFiniteNumber(fallbackValue) ? fallbackValue : DEFAULT_CHANNEL_VALUES[name]);
    }
    return values;
}

/** Channel object -> MSP_SET_RAW_RC payload order, `count` channels long (all 12 by default). */
export function channelsToMspArray(
    values: Partial<Record<ChannelName, number>> | null | undefined,
    count = CHANNEL_NAMES.length,
): number[] {
    return CHANNEL_NAMES.slice(0, Math.min(Math.max(count, 4), CHANNEL_NAMES.length)).map((name) => {
        const v = values?.[name];
        return isFiniteNumber(v)
            ? Math.min(Math.max(Math.round(v), CHANNEL_MIN_VALUE), CHANNEL_MAX_VALUE)
            : DEFAULT_CHANNEL_VALUES[name];
    });
}
