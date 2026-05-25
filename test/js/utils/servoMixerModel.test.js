import { describe, expect, it } from "vitest";
import {
    AIRCRAFT_SERVO_MIX_TEMPLATES,
    MIXER_IDS,
    SERVO_MIX_INPUT_LABELS,
    applyServoMixTemplate,
    cloneServoMixRules,
    isActiveServoMixRule,
    padServoMixRulesToMax,
    pwmSlotToServoIndex,
    servoMixOutputEnumName,
    servoMixOutputIndexForTarget,
    servoMixOutputLabel,
    servoMixTargetOptions,
} from "../../../src/js/utils/servoMixerModel.js";

describe("pwmSlotToServoIndex", () => {
    it("maps airplane PWM slots to logical servoIndex_e (FLAPS..THROTTLE)", () => {
        expect(pwmSlotToServoIndex(0, MIXER_IDS.AIRPLANE)).toBe(2);
        expect(pwmSlotToServoIndex(1, MIXER_IDS.AIRPLANE)).toBe(3);
        expect(pwmSlotToServoIndex(2, MIXER_IDS.AIRPLANE)).toBe(4);
        expect(pwmSlotToServoIndex(3, MIXER_IDS.AIRPLANE)).toBe(5);
        expect(pwmSlotToServoIndex(4, MIXER_IDS.AIRPLANE)).toBe(6);
        expect(pwmSlotToServoIndex(5, MIXER_IDS.AIRPLANE)).toBe(7);
        expect(pwmSlotToServoIndex(0, MIXER_IDS.CUSTOM_AIRPLANE)).toBe(2);
    });

    it("maps flying-wing PWM slots to FLAPPERON_1/FLAPPERON_2", () => {
        expect(pwmSlotToServoIndex(0, MIXER_IDS.FLYING_WING)).toBe(3);
        expect(pwmSlotToServoIndex(1, MIXER_IDS.FLYING_WING)).toBe(4);
    });

    it("maps tri/bicopter/heli/singlecopter slots correctly", () => {
        expect(pwmSlotToServoIndex(0, MIXER_IDS.TRI)).toBe(5);
        expect(pwmSlotToServoIndex(0, MIXER_IDS.CUSTOM_TRI)).toBe(5);
        expect(pwmSlotToServoIndex(0, MIXER_IDS.BICOPTER)).toBe(4);
        expect(pwmSlotToServoIndex(1, MIXER_IDS.BICOPTER)).toBe(5);
        expect(pwmSlotToServoIndex(2, MIXER_IDS.HELI_120_CCPM)).toBe(2);
        expect(pwmSlotToServoIndex(3, MIXER_IDS.SINGLECOPTER)).toBe(6);
        expect(pwmSlotToServoIndex(0, MIXER_IDS.GIMBAL)).toBe(0);
        expect(pwmSlotToServoIndex(1, MIXER_IDS.GIMBAL)).toBe(1);
    });

    it("returns null when the slot is beyond the mixer's used PWM channels", () => {
        expect(pwmSlotToServoIndex(6, MIXER_IDS.AIRPLANE)).toBeNull();
        expect(pwmSlotToServoIndex(2, MIXER_IDS.FLYING_WING)).toBeNull();
        expect(pwmSlotToServoIndex(1, MIXER_IDS.TRI)).toBeNull();
        expect(pwmSlotToServoIndex(-1, MIXER_IDS.AIRPLANE)).toBeNull();
    });

    it("falls back to the slot index when mixer mode is unknown", () => {
        expect(pwmSlotToServoIndex(3, 999)).toBe(3);
        expect(pwmSlotToServoIndex(0, undefined)).toBe(0);
    });
});

describe("servo mixer model", () => {
    it("covers every Betaflight servo mixer input source", () => {
        expect(SERVO_MIX_INPUT_LABELS).toHaveLength(14);
        expect(SERVO_MIX_INPUT_LABELS[12]).toBe("GIMBAL_PITCH");
        expect(SERVO_MIX_INPUT_LABELS[13]).toBe("GIMBAL_ROLL");
    });

    it("maps raw servo targets to physical servo output indexes", () => {
        expect(servoMixOutputIndexForTarget(2, MIXER_IDS.CUSTOM_AIRPLANE)).toBe(2);
        expect(servoMixOutputIndexForTarget(5, MIXER_IDS.CUSTOM_TRI)).toBe(5);
        expect(servoMixOutputIndexForTarget(4, MIXER_IDS.BICOPTER)).toBe(4);
        expect(servoMixOutputIndexForTarget(7, 0)).toBe(7);
    });

    it("builds mixer-aware target options without changing raw target ids", () => {
        const allAirplaneOptions = servoMixTargetOptions(MIXER_IDS.CUSTOM_AIRPLANE);
        const planeOnlyOptions = servoMixTargetOptions(MIXER_IDS.CUSTOM_AIRPLANE, { planeOnly: true });

        expect(allAirplaneOptions).toHaveLength(8);
        expect(planeOnlyOptions).toHaveLength(6);
        expect(planeOnlyOptions[0]).toMatchObject({ value: 2, outputIndex: 2 });
        // Plain S<N> labels — no aircraft-function suffix (BF's "Flaps /
        // Elevator / Rudder" defaults assume a default wiring most pilots
        // don't have; pilot picks the output number whose bar physically
        // moves their servo).
        expect(servoMixOutputLabel(2, MIXER_IDS.CUSTOM_AIRPLANE)).toBe("S3");
        expect(servoMixOutputLabel(6, MIXER_IDS.CUSTOM_AIRPLANE)).toBe("S7");
        expect(servoMixOutputLabel(0)).toBe("S1");
        expect(servoMixOutputLabel(7)).toBe("S8");
    });

    it("pads active rules to the firmware table size with disabled rows", () => {
        const paddedRules = padServoMixRulesToMax([
            {
                target: 2,
                input: 1,
                rate: 100,
                speed: 0,
                min: -100,
                max: 100,
                box: 0,
            },
        ]);

        expect(paddedRules).toHaveLength(16);
        expect(paddedRules[0].target).toBe(2);
        expect(paddedRules[1]).toEqual({
            target: 0,
            input: 0,
            rate: 0,
            speed: 0,
            min: 0,
            max: 0,
            box: 0,
        });
    });

    it("keeps reusable aircraft helpers available for the generic mapper", () => {
        const elevons = AIRCRAFT_SERVO_MIX_TEMPLATES.find((template) => template.id === "elevons");
        const elevator = AIRCRAFT_SERVO_MIX_TEMPLATES.find((template) => template.id === "elevator");

        expect(elevons.rules).toHaveLength(4);
        expect(elevons.mixerMode).toBe(MIXER_IDS.CUSTOM_AIRPLANE);
        expect(elevator.rules[0].target).toBe(6);
    });

    it("registers HELI_90_DEG (16) so it doesn't fall back to the identity slot map", () => {
        expect(MIXER_IDS.HELI_90_DEG).toBe(16);
    });

    it("annotates target options with firmware servoIndex_e names", () => {
        const planeOptions = servoMixTargetOptions(MIXER_IDS.CUSTOM_AIRPLANE);
        const bicopterOptions = servoMixTargetOptions(MIXER_IDS.BICOPTER);
        const heliOptions = servoMixTargetOptions(MIXER_IDS.HELI_120_CCPM);

        // Plane family: bare plane enum names
        expect(planeOptions[3]).toMatchObject({ value: 3, enumName: "FLAPPERON_1" });
        expect(planeOptions[6]).toMatchObject({ value: 6, enumName: "ELEVATOR" });
        // Bicopter overrides 4/5; other slots still fall through to plane defaults
        expect(bicopterOptions[4]).toMatchObject({ value: 4, enumName: "BICOPTER_LEFT" });
        expect(bicopterOptions[5]).toMatchObject({ value: 5, enumName: "BICOPTER_RIGHT" });
        // Heli reuses slots 0..3 with heli names
        expect(heliOptions[0].enumName).toBe("HELI_LEFT");
        expect(heliOptions[3].enumName).toBe("HELI_RUD");

        // Direct helper: explicit unknown / out-of-range returns null
        expect(servoMixOutputEnumName(0, MIXER_IDS.GIMBAL)).toBe("GIMBAL_PITCH");
        expect(servoMixOutputEnumName(9, MIXER_IDS.AIRPLANE)).toBeNull();
        expect(servoMixOutputEnumName(-1, MIXER_IDS.AIRPLANE)).toBeNull();
    });
});

describe("isActiveServoMixRule / cloneServoMixRules", () => {
    it("drops only fully zero default-shape rules (the padding rows)", () => {
        const padded = { target: 0, input: 0, rate: 0, speed: 0, min: 0, max: 0, box: 0 };
        expect(isActiveServoMixRule(padded)).toBe(false);
        expect(isActiveServoMixRule(null)).toBe(false);
        expect(isActiveServoMixRule(undefined)).toBe(false);
    });

    it("preserves rate=0 rules that carry non-zero speed/box (disabled-but-staged)", () => {
        // The previous filter (rate||min||max only) silently dropped these on
        // the next load, even though the user-authored speed/box would have
        // round-tripped fine through MSP.
        const stagedDisabled = { target: 3, input: 1, rate: 0, speed: 20, min: 0, max: 0, box: 1 };
        expect(isActiveServoMixRule(stagedDisabled)).toBe(true);

        const cloned = cloneServoMixRules([
            stagedDisabled,
            { target: 0, input: 0, rate: 0, speed: 0, min: 0, max: 0, box: 0 },
        ]);
        expect(cloned).toHaveLength(1);
        expect(cloned[0]).toEqual(stagedDisabled);
        // Defensive: clone returns fresh objects so caller mutations don't
        // leak into the source array (FC.SERVO_RULES is reused on reload).
        expect(cloned[0]).not.toBe(stagedDisabled);
    });
});

describe("applyServoMixTemplate", () => {
    it("happy path: remaps unique template targets to the first free PWM slots", () => {
        const result = applyServoMixTemplate([], "elevons", MIXER_IDS.CUSTOM_AIRPLANE);
        expect(result.ok).toBe(true);
        // elevons template has 2 unique targets (FLAPPERON_1=3, FLAPPERON_2=4)
        // → first free PWM slots are 0,1 → under CUSTOM_AIRPLANE those map
        // back to servoIndex 2,3 (FLAPS, FLAPPERON_1)
        expect(result.rules).toHaveLength(4);
        const targets = new Set(result.rules.map((r) => r.target));
        expect(targets.size).toBe(2);
        expect([...targets].sort()).toEqual([2, 3]);
    });

    it("skips PWM slots already used by existing rules when remapping", () => {
        const existing = [{ target: 2, input: 0, rate: 100, speed: 0, min: -100, max: 100, box: 0 }];
        const result = applyServoMixTemplate(existing, "elevons", MIXER_IDS.CUSTOM_AIRPLANE);
        expect(result.ok).toBe(true);
        // Slot 0 → servoIndex 2 is taken; planner skips it and lands the two
        // unique elevon targets on slots 1,2 → servoIndex 3,4.
        const targets = new Set(result.rules.map((r) => r.target));
        expect([...targets].sort()).toEqual([3, 4]);
    });

    it("hard-aborts on mixer mismatch instead of auto-flipping the FC mixer", () => {
        // Template wants CUSTOM_AIRPLANE; FC is on TRI
        const result = applyServoMixTemplate([], "elevons", MIXER_IDS.TRI);
        expect(result.ok).toBe(false);
        expect(result.errorKey).toBe("servosMixerTemplateMixerMismatch");
        expect(result.errorParams).toMatchObject({
            id: "elevons",
            templateMixer: MIXER_IDS.CUSTOM_AIRPLANE,
            activeMixer: MIXER_IDS.TRI,
        });
    });

    it("refuses templates that would push past MAX_SERVO_RULES", () => {
        const fullRules = Array.from({ length: 15 }, () => ({
            target: 2,
            input: 0,
            rate: 100,
            speed: 0,
            min: -100,
            max: 100,
            box: 0,
        }));
        // elevons has 4 rules → 15 + 4 > 16 → reject
        const result = applyServoMixTemplate(fullRules, "elevons", MIXER_IDS.CUSTOM_AIRPLANE);
        expect(result.ok).toBe(false);
        expect(result.errorKey).toBe("servosMixerTemplateExceedsLimit");
        expect(result.errorParams).toMatchObject({ id: "elevons", max: 16 });
    });

    it("falls into slot-not-driven when the next free PWM slot isn't wired for the mixer", () => {
        // Pre-occupy all 6 driven PWM slots under CUSTOM_AIRPLANE (slots 0..5
        // → servoIndex 2..7). The planner's nextSlot advances to slot 6, but
        // CUSTOM_AIRPLANE only drives slots 0..5 — pwmSlotToServoIndex(6,
        // CUSTOM_AIRPLANE) is null. We surface the more-specific "slot not
        // driven" error so the user knows the mixer choice is the constraint,
        // not the rule count.
        const existing = [2, 3, 4, 5, 6, 7].map((target) => ({
            target,
            input: 0,
            rate: 100,
            speed: 0,
            min: -100,
            max: 100,
            box: 0,
        }));
        const result = applyServoMixTemplate(existing, "elevons", MIXER_IDS.CUSTOM_AIRPLANE);
        expect(result.ok).toBe(false);
        expect(result.errorKey).toBe("servosMixerTemplateSlotNotDriven");
    });

    it("aborts with no-free-slots when all 8 PWM slots are already occupied", () => {
        // Identity-fallback mixer (unknown ID) drives all 8 slots — pre-fill
        // them with rules targeting servoIndex 0..7 and the planner runs out
        // of slots before remapping the template's single rule. Use the
        // "raw" template (mixerMode = null) so the mixer-mismatch check
        // doesn't fire first.
        const unknownMixer = 999;
        const existing = [0, 1, 2, 3, 4, 5, 6, 7].map((target) => ({
            target,
            input: 0,
            rate: 100,
            speed: 0,
            min: -100,
            max: 100,
            box: 0,
        }));
        const result = applyServoMixTemplate(existing, "raw", unknownMixer);
        expect(result.ok).toBe(false);
        expect(result.errorKey).toBe("servosMixerTemplateNoFreeSlots");
        expect(result.errorParams).toMatchObject({ id: "raw", needed: 1 });
    });

    it("returns servosMixerTemplateUnknown for an unrecognized template id", () => {
        const result = applyServoMixTemplate([], "does-not-exist", MIXER_IDS.CUSTOM_AIRPLANE);
        expect(result.ok).toBe(false);
        expect(result.errorKey).toBe("servosMixerTemplateUnknown");
    });
});
