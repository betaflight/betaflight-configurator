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

// Servo mixer (smix) model for the Servos tab. Mirrors firmware
// src/main/flight/servos.c so the tab can show which physical output each
// rule drives and what a preset mixer does without a custom rule list.

import type { ServoRule } from "../../stores/fc.types";

/** Mixer mode from MSP_MIXER_CONFIG; null/undefined while unknown. */
export type MixerMode = number | null | undefined;

export interface SlotLayoutOptions {
    /** FEATURE_SERVO_TILT enabled */
    servoTilt?: boolean;
    /** servo indices whose indexOfChannelToForward is set (not 255) */
    forwardedServos?: number[];
}

/** A firmware servo target and the physical output carrying it (null: not driven). */
export interface ServoOutputItem {
    target: number;
    slot: number | null;
}

export const SERVO_MIX_INPUT_LABELS = [
    "STABILIZED_ROLL",
    "STABILIZED_PITCH",
    "STABILIZED_YAW",
    "STABILIZED_THROTTLE",
    "RC_ROLL",
    "RC_PITCH",
    "RC_YAW",
    "RC_THROTTLE",
    "RC_AUX1",
    "RC_AUX2",
    "RC_AUX3",
    "RC_AUX4",
    "GIMBAL_PITCH",
    "GIMBAL_ROLL",
];

export const SERVO_MIX_BOX_LABELS = ["Always", "BOXSERVO1", "BOXSERVO2", "BOXSERVO3"];
export const MAX_SERVO_RULES = 16;
// Firmware MAX_SUPPORTED_SERVOS: servo targets are 0..7.
const MAX_SUPPORTED_SERVOS = 8;

export const MIXER_IDS = {
    TRI: 1,
    BICOPTER: 4,
    GIMBAL: 5,
    FLYING_WING: 8,
    AIRPLANE: 14,
    HELI_120_CCPM: 15,
    HELI_90_DEG: 16,
    PPM_TO_SERVO: 19,
    DUALCOPTER: 20,
    SINGLECOPTER: 21,
    CUSTOM_AIRPLANE: 24,
    CUSTOM_TRI: 25,
} as const;

// Firmware servoIndex_e names per mixer family (enum in
// src/main/flight/servos.h). The same index means different things on
// different mixers (e.g. 4 = FLAPPERON_2 on airplane, BICOPTER_LEFT on
// bicopter). The plane names are the default; other mixers override only
// the entries that differ.
const SERVO_ENUM_NAMES_PLANE: Record<number, string> = {
    0: "GIMBAL_PITCH",
    1: "GIMBAL_ROLL",
    2: "FLAPS",
    3: "FLAPPERON_1",
    4: "FLAPPERON_2",
    5: "RUDDER",
    6: "ELEVATOR",
    7: "THROTTLE",
};

const SERVO_ENUM_NAMES_BY_MIXER: Record<number, Record<number, string>> = {
    [MIXER_IDS.TRI]: { 5: "RUDDER" },
    [MIXER_IDS.CUSTOM_TRI]: { 5: "RUDDER" },
    [MIXER_IDS.BICOPTER]: { 4: "BICOPTER_LEFT", 5: "BICOPTER_RIGHT" },
    [MIXER_IDS.DUALCOPTER]: { 4: "DUALCOPTER_LEFT", 5: "DUALCOPTER_RIGHT" },
    [MIXER_IDS.SINGLECOPTER]: {
        3: "SINGLECOPTER_1",
        4: "SINGLECOPTER_2",
        5: "SINGLECOPTER_3",
        6: "SINGLECOPTER_4",
    },
    [MIXER_IDS.GIMBAL]: { 0: "GIMBAL_PITCH", 1: "GIMBAL_ROLL" },
    [MIXER_IDS.HELI_120_CCPM]: { 0: "HELI_LEFT", 1: "HELI_RIGHT", 2: "HELI_TOP", 3: "HELI_RUD" },
    [MIXER_IDS.HELI_90_DEG]: { 0: "HELI_LEFT", 1: "HELI_RIGHT", 2: "HELI_TOP", 3: "HELI_RUD" },
};

/**
 * Firmware servoIndex_e name (e.g. "FLAPPERON_1") of `target` under
 * `mixerMode`, or null when the target is out of range.
 */
export function servoMixOutputEnumName(target: number, mixerMode: MixerMode): string | null {
    const targetId = Number(target);
    if (!Number.isInteger(targetId) || targetId < 0 || targetId >= MAX_SUPPORTED_SERVOS) {
        return null;
    }
    const overrides = mixerMode == null ? undefined : SERVO_ENUM_NAMES_BY_MIXER[mixerMode];
    return overrides?.[targetId] ?? SERVO_ENUM_NAMES_PLANE[targetId] ?? null;
}

// Fixed slots written by the mixer-specific switch in firmware writeServos().
// MIXER_GIMBAL is absent on purpose: firmware drives it through the same
// gimbal branch as FEATURE_SERVO_TILT (see servoSlotLayout).
const SERVO_PWM_SLOT_TO_INDEX: Record<number, number[]> = {
    [MIXER_IDS.TRI]: [5],
    [MIXER_IDS.CUSTOM_TRI]: [5],
    [MIXER_IDS.BICOPTER]: [4, 5],
    [MIXER_IDS.FLYING_WING]: [3, 4],
    [MIXER_IDS.AIRPLANE]: [2, 3, 4, 5, 6, 7],
    [MIXER_IDS.CUSTOM_AIRPLANE]: [2, 3, 4, 5, 6, 7],
    [MIXER_IDS.HELI_120_CCPM]: [0, 1, 2, 3],
    [MIXER_IDS.DUALCOPTER]: [4, 5],
    [MIXER_IDS.SINGLECOPTER]: [3, 4, 5, 6],
};

const SERVO_GIMBAL_PITCH = 0;
const SERVO_GIMBAL_ROLL = 1;

/**
 * Firmware servo index (servoIndex_e) driven by each physical servo output,
 * in output order. Mirrors firmware writeServos() (src/main/flight/servos.c):
 *   1. the mixer's fixed slots (default frames write none),
 *   2. the gimbal pair when SERVO_TILT is on or the mixer is GIMBAL,
 *   3. every servo with channel forwarding not already written, in index order,
 *   4. AUX channel forwarding (CHANNEL_FORWARDING), which drives raw RC
 *      channels rather than a servo -- those outputs are not listed.
 */
export function servoSlotLayout(
    mixerMode: MixerMode,
    { servoTilt = false, forwardedServos = [] }: SlotLayoutOptions = {},
): number[] {
    const layout = [...((mixerMode == null ? undefined : SERVO_PWM_SLOT_TO_INDEX[mixerMode]) ?? [])];
    if (servoTilt || mixerMode === MIXER_IDS.GIMBAL) {
        layout.push(SERVO_GIMBAL_PITCH, SERVO_GIMBAL_ROLL);
    }
    const written = new Set(layout);
    const forwarded = new Set(forwardedServos);
    for (let i = 0; i < MAX_SUPPORTED_SERVOS; i++) {
        if (forwarded.has(i) && !written.has(i)) {
            layout.push(i);
        }
    }
    return layout;
}

/**
 * Firmware servo index carried by physical output `slotIndex` (0-based), or
 * null when that output isn't driven. Identity while the mixer is unknown.
 */
export function pwmSlotToServoIndex(
    slotIndex: number,
    mixerMode: MixerMode,
    options: SlotLayoutOptions = {},
): number | null {
    if (mixerMode == null) {
        return slotIndex;
    }
    const layout = servoSlotLayout(mixerMode, options);
    if (slotIndex < 0 || slotIndex >= layout.length) {
        return null;
    }
    return layout[slotIndex];
}

/**
 * Physical output (0-based) carrying firmware servo `target`, or null when
 * the mixer doesn't drive it. Identity while the mixer is unknown.
 */
export function servoTargetToSlot(
    target: number,
    mixerMode: MixerMode,
    options: SlotLayoutOptions = {},
): number | null {
    if (mixerMode == null) {
        return target;
    }
    const slot = servoSlotLayout(mixerMode, options).indexOf(target);
    return slot < 0 ? null : slot;
}

/**
 * Every physical output with the firmware servo target it carries, in output
 * order, then the targets no output carries (slot null). A target can appear
 * twice: the gimbal pair (targets 0 and 1) is written after a mixer that
 * already drives them, e.g. HELI_120_CCPM with SERVO_TILT. Identity while
 * the mixer is unknown.
 */
export function servoOutputItems(mixerMode: MixerMode, options: SlotLayoutOptions = {}): ServoOutputItem[] {
    const allTargets = Array.from({ length: MAX_SUPPORTED_SERVOS }, (_, target) => target);
    const layout = mixerMode == null ? allTargets : servoSlotLayout(mixerMode, options);
    const driven = layout.map((target, slot) => ({ target, slot }));
    const carried = new Set(layout);
    const undriven = allTargets.filter((target) => !carried.has(target)).map((target) => ({ target, slot: null }));
    return [...driven, ...undriven];
}

// --- Built-in (preset) servo mixer rules ----------------------------------
//
// Mirrors servoMixers[] in firmware src/main/flight/servos.c. Preset mixers
// drive servos from these hard-coded rules; the custom smix list (what
// MSP_SERVO_MIX_RULES returns) is only read on CUSTOM_AIRPLANE / CUSTOM_TRI.
// BICOPTER, DUALCOPTER, SINGLECOPTER and HELI_120_CCPM only exist on builds
// with USE_UNCOMMON_MIXERS.
const IN_ROLL = 0;
const IN_PITCH = 1;
const IN_YAW = 2;
const IN_THROTTLE = 3;
const IN_RC_AUX1 = 8;
const IN_GIMBAL_PITCH = 12;
const IN_GIMBAL_ROLL = 13;

export const SERVO_MIX_INPUT_STABILIZED_THROTTLE = IN_THROTTLE;

function builtinRule(target: number, input: number, rate: number): ServoRule {
    return { target, input, rate, speed: 0, min: 0, max: 100, box: 0 };
}

const BUILTIN_SERVO_MIX_RULES: Record<number, ServoRule[]> = {
    [MIXER_IDS.TRI]: [builtinRule(5, IN_YAW, 100)],
    [MIXER_IDS.BICOPTER]: [
        builtinRule(4, IN_YAW, 100),
        builtinRule(4, IN_PITCH, -100),
        builtinRule(5, IN_YAW, 100),
        builtinRule(5, IN_PITCH, 100),
    ],
    [MIXER_IDS.GIMBAL]: [builtinRule(0, IN_GIMBAL_PITCH, 125), builtinRule(1, IN_GIMBAL_ROLL, 125)],
    [MIXER_IDS.FLYING_WING]: [
        builtinRule(3, IN_ROLL, 100),
        builtinRule(3, IN_PITCH, 100),
        builtinRule(4, IN_ROLL, -100),
        builtinRule(4, IN_PITCH, 100),
        builtinRule(7, IN_THROTTLE, 100),
    ],
    [MIXER_IDS.AIRPLANE]: [
        builtinRule(3, IN_ROLL, 100),
        builtinRule(4, IN_ROLL, 100),
        builtinRule(5, IN_YAW, 100),
        builtinRule(6, IN_PITCH, 100),
        builtinRule(7, IN_THROTTLE, 100),
    ],
    [MIXER_IDS.HELI_120_CCPM]: [
        builtinRule(0, IN_PITCH, -50),
        builtinRule(0, IN_ROLL, -87),
        builtinRule(0, IN_RC_AUX1, 100),
        builtinRule(1, IN_PITCH, -50),
        builtinRule(1, IN_ROLL, 87),
        builtinRule(1, IN_RC_AUX1, 100),
        builtinRule(2, IN_PITCH, 100),
        builtinRule(2, IN_RC_AUX1, 100),
        builtinRule(3, IN_YAW, 100),
    ],
    [MIXER_IDS.DUALCOPTER]: [builtinRule(4, IN_PITCH, 100), builtinRule(5, IN_ROLL, 100)],
    [MIXER_IDS.SINGLECOPTER]: [
        builtinRule(3, IN_YAW, 100),
        builtinRule(3, IN_PITCH, 100),
        builtinRule(4, IN_YAW, 100),
        builtinRule(4, IN_PITCH, 100),
        builtinRule(5, IN_YAW, 100),
        builtinRule(5, IN_ROLL, 100),
        builtinRule(6, IN_YAW, 100),
        builtinRule(6, IN_ROLL, 100),
    ],
};

/**
 * The hard-coded servo rules a preset mixer runs, or null when the mixer has
 * none (multirotors) or reads the custom smix list instead.
 */
export function builtinServoMixRules(mixerMode: MixerMode): ServoRule[] | null {
    const rules = mixerMode == null ? undefined : BUILTIN_SERVO_MIX_RULES[mixerMode];
    return rules ? rules.map((r) => ({ ...r })) : null;
}

/** True for the mixers whose servos follow the custom smix list. */
export function usesCustomServoRules(mixerMode: MixerMode): boolean {
    return mixerMode === MIXER_IDS.CUSTOM_AIRPLANE || mixerMode === MIXER_IDS.CUSTOM_TRI;
}

// --- Custom rule list ------------------------------------------------------

// min/max are percentages of servo travel, 0..100 (firmware servoMixer_t is
// uint8_t and the CLI rejects anything else); 0/100 = full travel.
export const SERVO_MIX_MIN = 0;
export const SERVO_MIX_MAX = 100;
// rate is int8_t; the CLI accepts -125..125.
export const SERVO_MIX_RATE_MIN = -125;
export const SERVO_MIX_RATE_MAX = 125;

const EMPTY_RULE: ServoRule = { target: 0, input: 0, rate: 0, speed: 0, min: 0, max: 0, box: 0 };

/** A new rule with full travel and no speed limit. */
export function makeServoMixRule(target: number, input: number, rate: number): ServoRule {
    return { target, input, rate, speed: 0, min: SERVO_MIX_MIN, max: SERVO_MIX_MAX, box: 0 };
}

/**
 * The rules the firmware actually runs: loadCustomServoMixer() stops at the
 * first rule with rate 0, so anything stored after it is ignored.
 */
export function activeServoMixRules<T extends { rate: number }>(rules: T[] | null | undefined): T[] {
    const active: T[] = [];
    for (const rule of rules ?? []) {
        if (rule.rate === 0) {
            break;
        }
        active.push({ ...rule });
    }
    return active;
}

/**
 * `rules` followed by empty rules up to `maxRules`, so a save also clears
 * slots left over from a longer list.
 */
export function padServoMixRulesToMax(
    rules: ServoRule[] | null | undefined,
    maxRules: number = MAX_SERVO_RULES,
): ServoRule[] {
    const padded = (rules ?? []).slice(0, maxRules).map((rule) => ({ ...rule }));
    while (padded.length < maxRules) {
        padded.push({ ...EMPTY_RULE });
    }
    return padded;
}

/**
 * Indices of rules the firmware would not run as shown: rate 0 (ends the
 * rule list, dropping every rule after it) or outside -125..125, and
 * min/max outside 0..100 or min >= max (the CLI rejects these, but
 * MSP_SET_SERVO_MIX_RULE stores them as-is, so a -100 min becomes 156).
 */
export function invalidServoMixRules(rules: ServoRule[] | null | undefined): number[] {
    const inRange = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;
    const bad: number[] = [];
    (rules ?? []).forEach((rule, i) => {
        const rateOk = rule.rate !== 0 && inRange(rule.rate, SERVO_MIX_RATE_MIN, SERVO_MIX_RATE_MAX);
        const rangeOk =
            inRange(rule.min, SERVO_MIX_MIN, SERVO_MIX_MAX) &&
            inRange(rule.max, SERVO_MIX_MIN, SERVO_MIX_MAX) &&
            rule.min < rule.max;
        if (!rateOk || !rangeOk) {
            bad.push(i);
        }
    });
    return bad;
}

/**
 * What a Save writes: the rules padded to MAX_SERVO_RULES, copied so edits
 * made while the save runs can't change or skip what gets validated and
 * sent. `invalid` lists the 0-based rules invalidServoMixRules() refuses;
 * Save writes nothing then.
 */
export function servoMixRulesToSave(rules: ServoRule[]): { invalid: number[]; rules: ServoRule[] } {
    return { invalid: invalidServoMixRules(rules), rules: padServoMixRulesToMax(rules) };
}
