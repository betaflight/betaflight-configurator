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
    PPM_TO_SERVO: 19,
    DUALCOPTER: 20,
    SINGLECOPTER: 21,
    CUSTOM_AIRPLANE: 24,
    CUSTOM_TRI: 25,
};

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

export function servoMixTargetOptions(_mixerMode, { planeOnly = false } = {}) {
    const start = planeOnly ? 2 : 0;
    const end = 7;
    const options = [];

    for (let target = start; target <= end; target += 1) {
        options.push({
            value: target,
            label: servoMixOutputLabel(target),
            outputIndex: servoMixOutputIndexForTarget(target),
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

export function isActiveServoMixRule(rule) {
    if (!rule) {
        return false;
    }
    return rule.rate !== 0 || rule.min !== 0 || rule.max !== 0;
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
