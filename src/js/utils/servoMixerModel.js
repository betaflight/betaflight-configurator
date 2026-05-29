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
};

// Firmware servoIndex_e names per mixer family (mirrors enum in
// src/main/flight/servos.h). Indices 0..7 reuse the same numeric ID
// across mixer families for different roles (e.g. 4 = FLAPPERON_2 on
// airplane, BICOPTER_LEFT on bicopter), so the mapping is mixer-aware.
// The plane family map (used by AIRPLANE / CUSTOM_AIRPLANE / FLYING_WING)
// is the default; other mixers override only the entries that differ.
const SERVO_ENUM_NAMES_PLANE = {
    0: "GIMBAL_PITCH",
    1: "GIMBAL_ROLL",
    2: "FLAPS",
    3: "FLAPPERON_1",
    4: "FLAPPERON_2",
    5: "RUDDER",
    6: "ELEVATOR",
    7: "THROTTLE",
};

const SERVO_ENUM_NAMES_BY_MIXER = {
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

// Returns the firmware servoIndex_e name (e.g. "FLAPPERON_1", "ELEVATOR")
// for a given target ID under the active mixer, or null when the target
// has no named role under that mixer. Surfaced in the Output dropdown
// labels so the bare S{n+1} stays the primary identifier (pilot wires
// their plane, picks the output whose bar physically moves) while the
// firmware enum name is still discoverable for users coming from CLI.
export function servoMixOutputEnumName(target, mixerMode) {
    const targetId = Number(target);
    if (!Number.isInteger(targetId) || targetId < 0 || targetId > 7) {
        return null;
    }
    const overrides = SERVO_ENUM_NAMES_BY_MIXER[mixerMode];
    if (overrides && overrides[targetId] != null) {
        return overrides[targetId];
    }
    // Plane-family default — applies to AIRPLANE/CUSTOM_AIRPLANE/FLYING_WING
    // and any unknown mixer (best-effort fallback rather than hiding the hint).
    return SERVO_ENUM_NAMES_PLANE[targetId] ?? null;
}

export const SERVO_OUTPUT_COLORS = [
    "#f5b700",
    "#19b7c7",
    "#65c84f",
    "#f05a9d",
    "#f28c28",
    "#6f9cff",
    "#a6c93a",
    "#a77cff",
];

function hexToRgba(hex, alpha) {
    const value = hex.replace("#", "");
    const r = Number.parseInt(value.slice(0, 2), 16);
    const g = Number.parseInt(value.slice(2, 4), 16);
    const b = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function servoOutputColor(outputIndex) {
    if (!Number.isInteger(outputIndex) || outputIndex < 0) {
        return SERVO_OUTPUT_COLORS[0];
    }
    return SERVO_OUTPUT_COLORS[outputIndex % SERVO_OUTPUT_COLORS.length];
}

export function servoOutputAccentStyle(outputIndex) {
    const color = servoOutputColor(outputIndex);
    return {
        "--servo-output-accent": color,
        "--servo-output-accent-bg": hexToRgba(color, 0.16),
    };
}

export function servoMixOutputIndexForTarget(target) {
    const targetId = Number(target);
    return targetId >= 0 && targetId <= 7 ? targetId : null;
}

const SERVO_PWM_SLOT_TO_INDEX = {
    [MIXER_IDS.TRI]: [5],
    [MIXER_IDS.CUSTOM_TRI]: [5],
    [MIXER_IDS.BICOPTER]: [4, 5],
    [MIXER_IDS.GIMBAL]: [0, 1],
    [MIXER_IDS.FLYING_WING]: [3, 4],
    [MIXER_IDS.AIRPLANE]: [2, 3, 4, 5, 6, 7],
    [MIXER_IDS.CUSTOM_AIRPLANE]: [2, 3, 4, 5, 6, 7],
    [MIXER_IDS.HELI_120_CCPM]: [0, 1, 2, 3],
    [MIXER_IDS.DUALCOPTER]: [4, 5],
    [MIXER_IDS.SINGLECOPTER]: [3, 4, 5, 6],
};

// Maps a firmware PWM-slot index (0..N-1 from MSP2_MOTOR_SERVO_RESOURCE) to
// the logical servoIndex_e the slot drives under `mixerMode`. Mirrors the
// switch in firmware writeServos() (src/main/flight/servos.c). Returns null
// when the slot isn't driven by the active mixer; falls back to slotIndex
// for unknown mixers so unfamiliar builds still get a deterministic color.
export function pwmSlotToServoIndex(slotIndex, mixerMode) {
    const map = SERVO_PWM_SLOT_TO_INDEX[mixerMode];
    if (!map) {
        return slotIndex;
    }
    if (slotIndex < 0 || slotIndex >= map.length) {
        return null;
    }
    return map[slotIndex];
}

// Servo output labels are based on firmware servoIndex_e (S1-S8), matching
// what the live bars and the top servo-config table show. We deliberately
// don't surface BF's "Flaps / Aileron / Rudder / Elevator" suffix on these
// labels: those names assume a default airframe wiring that most pilots
// don't actually have, and the firmware/wiki disagree on which target ID
// maps to which function across versions. Plain S1-S8 always matches the
// bar that physically responds — pilot wires their plane, picks the output
// number whose bar moves their servo.
export function servoMixOutputLabel(target /* mixerMode kept for caller compat */) {
    const targetId = Number(target);
    const outputIndex = servoMixOutputIndexForTarget(targetId);
    return Number.isInteger(outputIndex) ? `S${outputIndex + 1}` : `Target ${targetId}`;
}

export function servoMixTargetOptions(mixerMode, { planeOnly = false } = {}) {
    const start = planeOnly ? 2 : 0;
    const end = 7;
    const options = [];

    for (let target = start; target <= end; target += 1) {
        options.push({
            value: target,
            label: servoMixOutputLabel(target),
            outputIndex: servoMixOutputIndexForTarget(target),
            enumName: servoMixOutputEnumName(target, mixerMode),
        });
    }

    return options;
}

export function makeServoMixRule(target, input, rate, overrides = {}) {
    return {
        target,
        input,
        rate,
        speed: 0,
        min: -100,
        max: 100,
        box: 0,
        ...overrides,
    };
}

const Q_SLOT_ELEVATOR = 6;
const Q_SLOT_AILERON_1 = 3;
const Q_SLOT_AILERON_2 = 4;
const Q_SLOT_RUDDER = 5;
const Q_FULL_RATE = 100;
const Q_MIX_RATE = 50;
const Q_INPUT_ROLL = 0;
const Q_INPUT_PITCH = 1;
const Q_INPUT_YAW = 2;

export const AIRCRAFT_SERVO_MIX_TEMPLATES = [
    {
        id: "aileron_pair",
        labelKey: "servosMixerQuickAileron",
        mixerMode: MIXER_IDS.CUSTOM_AIRPLANE,
        rules: [
            makeServoMixRule(Q_SLOT_AILERON_1, Q_INPUT_ROLL, +Q_FULL_RATE),
            makeServoMixRule(Q_SLOT_AILERON_2, Q_INPUT_ROLL, -Q_FULL_RATE),
        ],
    },
    {
        id: "elevator",
        labelKey: "servosMixerQuickElevator",
        mixerMode: MIXER_IDS.CUSTOM_AIRPLANE,
        rules: [makeServoMixRule(Q_SLOT_ELEVATOR, Q_INPUT_PITCH, +Q_FULL_RATE)],
    },
    {
        id: "rudder",
        labelKey: "servosMixerQuickRudder",
        mixerMode: MIXER_IDS.CUSTOM_AIRPLANE,
        rules: [makeServoMixRule(Q_SLOT_RUDDER, Q_INPUT_YAW, +Q_FULL_RATE)],
    },
    {
        id: "elevons",
        labelKey: "servosMixerQuickElevons",
        mixerMode: MIXER_IDS.CUSTOM_AIRPLANE,
        rules: [
            makeServoMixRule(Q_SLOT_AILERON_1, Q_INPUT_ROLL, +Q_MIX_RATE),
            makeServoMixRule(Q_SLOT_AILERON_1, Q_INPUT_PITCH, +Q_MIX_RATE),
            makeServoMixRule(Q_SLOT_AILERON_2, Q_INPUT_ROLL, -Q_MIX_RATE),
            makeServoMixRule(Q_SLOT_AILERON_2, Q_INPUT_PITCH, +Q_MIX_RATE),
        ],
    },
    {
        id: "v_tail",
        labelKey: "servosMixerQuickVTail",
        mixerMode: MIXER_IDS.CUSTOM_AIRPLANE,
        rules: [
            makeServoMixRule(Q_SLOT_ELEVATOR, Q_INPUT_PITCH, +Q_MIX_RATE),
            makeServoMixRule(Q_SLOT_ELEVATOR, Q_INPUT_YAW, +Q_MIX_RATE),
            makeServoMixRule(Q_SLOT_RUDDER, Q_INPUT_PITCH, +Q_MIX_RATE),
            makeServoMixRule(Q_SLOT_RUDDER, Q_INPUT_YAW, -Q_MIX_RATE),
        ],
    },
    {
        id: "raw",
        labelKey: "servosMixerQuickRaw",
        rules: [makeServoMixRule(0, 0, +Q_FULL_RATE)],
    },
];

// A rule is "active" unless every byte matches the all-zero default-shape
// row sendServoMixRules emits for empty slots. Only filtering on
// rate/min/max would drop a user-authored rule with rate=0 but non-zero
// speed or box (e.g. "disabled-but-state-preserved" rows), so the check
// covers all seven fields — anything non-zero anywhere keeps the rule.
export function isActiveServoMixRule(rule) {
    if (!rule) {
        return false;
    }
    return (
        rule.target !== 0 ||
        rule.input !== 0 ||
        rule.rate !== 0 ||
        rule.speed !== 0 ||
        rule.min !== 0 ||
        rule.max !== 0 ||
        rule.box !== 0
    );
}

export function cloneServoMixRules(rules) {
    return (rules || []).filter(isActiveServoMixRule).map((rule) => ({ ...rule }));
}

export function padServoMixRulesToMax(rules, maxRules = MAX_SERVO_RULES) {
    const padded = (rules || []).slice(0, maxRules).map((rule) => ({ ...rule }));
    while (padded.length < maxRules) {
        padded.push({ target: 0, input: 0, rate: 0, speed: 0, min: 0, max: 0, box: 0 });
    }
    return padded;
}

// Returns the set of PWM slots already driven by `currentRules` under
// `targetMixer`. Pure helper — caller threads the template's own mixer
// (not the FC's current one) when staging a template, so the slot→servo
// resolver maps against the mixer the rule targets will encode under.
function findUsedPwmSlotsForRules(currentRules, targetMixer) {
    const used = new Set();
    for (const rule of currentRules || []) {
        for (let slot = 0; slot < 8; slot += 1) {
            if (pwmSlotToServoIndex(slot, targetMixer) === rule.target) {
                used.add(slot);
                break;
            }
        }
    }
    return used;
}

// Pure planner for the quick-add aircraft templates. Returns either
//   { ok: true, rules: [...] }                      — rules to append
//   { ok: false, errorKey: "...", errorParams: {} } — caller surfaces via gui_log
// Splitting this out of ServosTab.vue keeps the four abort conditions
// (unknown template, exceeds-limit, mixer mismatch, slot exhausted)
// testable without spinning up the full Vue component, and matches the
// "split helpers early" workspace rule for Cog growth.
//
// Templates are defined against firmware servoIndex_e values (e.g.
// FLAPPERON_1=3, ELEVATOR=6) which don't correspond 1:1 to the physical
// servos a pilot has plugged in. Each unique template target is remapped
// to the first unused PWM slot, then converted to the matching
// servoIndex_e under the TEMPLATE's mixer (not the FC's current one) —
// otherwise an elevon rule staged before the user switches mixers would
// land on the wrong servo enum. When the template names a different
// mixer than the FC currently runs, we hard-abort (option B from the
// CodeRabbit ask) rather than silently flipping the FC's mixer.
export function applyServoMixTemplate(currentRules, templateId, activeMixer, options = {}) {
    const templates = options.templates ?? AIRCRAFT_SERVO_MIX_TEMPLATES;
    const maxRules = options.maxRules ?? MAX_SERVO_RULES;
    const template = templates.find((tpl) => tpl.id === templateId);
    if (!template) {
        return { ok: false, errorKey: "servosMixerTemplateUnknown", errorParams: { id: templateId } };
    }
    const rules = currentRules || [];
    if (rules.length + template.rules.length > maxRules) {
        return {
            ok: false,
            errorKey: "servosMixerTemplateExceedsLimit",
            errorParams: { id: templateId, max: maxRules },
        };
    }
    if (template.mixerMode != null && template.mixerMode !== activeMixer) {
        return {
            ok: false,
            errorKey: "servosMixerTemplateMixerMismatch",
            errorParams: { id: templateId, templateMixer: template.mixerMode, activeMixer },
        };
    }
    const targetMixer = template.mixerMode ?? activeMixer;
    const usedSlots = findUsedPwmSlotsForRules(rules, targetMixer);
    const uniqueTargets = [...new Set(template.rules.map((r) => r.target))];
    const remap = new Map();
    let nextSlot = 0;
    for (const target of uniqueTargets) {
        while (nextSlot < 8 && usedSlots.has(nextSlot)) {
            nextSlot += 1;
        }
        if (nextSlot >= 8) {
            return {
                ok: false,
                errorKey: "servosMixerTemplateNoFreeSlots",
                errorParams: {
                    id: templateId,
                    needed: uniqueTargets.length,
                    mappable: uniqueTargets.length - remap.size,
                },
            };
        }
        const enumIdx = pwmSlotToServoIndex(nextSlot, targetMixer);
        if (enumIdx == null) {
            return {
                ok: false,
                errorKey: "servosMixerTemplateSlotNotDriven",
                errorParams: {
                    id: templateId,
                    slot: nextSlot,
                    targetMixer,
                    intendedMixer: template.mixerMode ?? "the template's intended mixer",
                },
            };
        }
        remap.set(target, enumIdx);
        usedSlots.add(nextSlot);
        nextSlot += 1;
    }

    const newRules = template.rules.map((rule) => ({ ...rule, target: remap.get(rule.target) }));
    return { ok: true, rules: newRules };
}
