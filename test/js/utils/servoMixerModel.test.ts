import { describe, expect, it } from "vitest";
import {
    MAX_SERVO_RULES,
    MIXER_IDS,
    activeServoMixRules,
    builtinServoMixRules,
    invalidServoMixRules,
    makeServoMixRule,
    padServoMixRulesToMax,
    pwmSlotToServoIndex,
    servoMixOutputEnumName,
    servoOutputItems,
    servoTargetToSlot,
    usesCustomServoRules,
    servoMixRulesToSave,
} from "../../../src/js/utils/servoMixerModel";

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

    it("falls back to the slot index when mixer mode has not been loaded", () => {
        expect(pwmSlotToServoIndex(0, undefined)).toBe(0);
        expect(pwmSlotToServoIndex(3, null)).toBe(3);
    });

    // Mirrors writeServos() in firmware src/main/flight/servos.c: fixed mixer
    // slots first, then gimbal (SERVO_TILT or MIXER_GIMBAL), then every servo
    // with individual channel forwarding not already written, then AUX
    // channel forwarding (FEATURE_CHANNEL_FORWARDING).
    const QUADX = 3;

    it("leaves every slot undriven on a default frame with no forwarding", () => {
        expect(pwmSlotToServoIndex(0, QUADX)).toBeNull();
        expect(pwmSlotToServoIndex(3, 999)).toBeNull();
    });

    it("assigns individually forwarded servos to slots in servo-index order on default frames", () => {
        const options = { forwardedServos: [5, 2] };
        expect(pwmSlotToServoIndex(0, QUADX, options)).toBe(2);
        expect(pwmSlotToServoIndex(1, QUADX, options)).toBe(5);
        expect(pwmSlotToServoIndex(2, QUADX, options)).toBeNull();
    });

    it("appends forwarded servos after the mixer's fixed slots, skipping ones already written", () => {
        const options = { forwardedServos: [3, 6] };
        expect(pwmSlotToServoIndex(0, MIXER_IDS.FLYING_WING, options)).toBe(3);
        expect(pwmSlotToServoIndex(1, MIXER_IDS.FLYING_WING, options)).toBe(4);
        expect(pwmSlotToServoIndex(2, MIXER_IDS.FLYING_WING, options)).toBe(6);
        expect(pwmSlotToServoIndex(3, MIXER_IDS.FLYING_WING, options)).toBeNull();
    });

    it("appends the gimbal pair when SERVO_TILT is enabled", () => {
        const options = { servoTilt: true };
        expect(pwmSlotToServoIndex(5, MIXER_IDS.AIRPLANE, options)).toBe(7);
        expect(pwmSlotToServoIndex(6, MIXER_IDS.AIRPLANE, options)).toBe(0);
        expect(pwmSlotToServoIndex(7, MIXER_IDS.AIRPLANE, options)).toBe(1);
        expect(pwmSlotToServoIndex(0, QUADX, options)).toBe(0);
        expect(pwmSlotToServoIndex(1, QUADX, options)).toBe(1);
    });

    it("does not repeat a gimbal servo that is also individually forwarded", () => {
        const options = { servoTilt: true, forwardedServos: [0, 2] };
        expect(pwmSlotToServoIndex(0, QUADX, options)).toBe(0);
        expect(pwmSlotToServoIndex(1, QUADX, options)).toBe(1);
        expect(pwmSlotToServoIndex(2, QUADX, options)).toBe(2);
        expect(pwmSlotToServoIndex(3, QUADX, options)).toBeNull();
    });

    it("adds no servo for AUX channel forwarding", () => {
        // CHANNEL_FORWARDING drives raw RC channels, not a servo, so it isn't
        // a layout input: the wing still drives only its two elevons.
        expect(pwmSlotToServoIndex(0, MIXER_IDS.FLYING_WING)).toBe(3);
        expect(pwmSlotToServoIndex(2, MIXER_IDS.FLYING_WING)).toBeNull();
    });
});

describe("physical servo outputs", () => {
    it("maps firmware servo targets to the physical output carrying them", () => {
        expect(servoTargetToSlot(3, MIXER_IDS.FLYING_WING)).toBe(0);
        expect(servoTargetToSlot(4, MIXER_IDS.FLYING_WING)).toBe(1);
        expect(servoTargetToSlot(6, MIXER_IDS.FLYING_WING)).toBeNull();
        expect(servoTargetToSlot(2, MIXER_IDS.CUSTOM_AIRPLANE)).toBe(0);
        expect(servoTargetToSlot(5, null)).toBe(5);
    });

    it("lists driven outputs in physical order, then undriven targets", () => {
        expect(servoOutputItems(MIXER_IDS.FLYING_WING)).toEqual([
            { target: 3, slot: 0 },
            { target: 4, slot: 1 },
            { target: 0, slot: null },
            { target: 1, slot: null },
            { target: 2, slot: null },
            { target: 5, slot: null },
            { target: 6, slot: null },
            { target: 7, slot: null },
        ]);
    });

    it("names undriven targets with the mixer's firmware servo name", () => {
        expect(servoMixOutputEnumName(3, MIXER_IDS.AIRPLANE)).toBe("FLAPPERON_1");
        expect(servoMixOutputEnumName(4, MIXER_IDS.BICOPTER)).toBe("BICOPTER_LEFT");
        expect(servoMixOutputEnumName(8, MIXER_IDS.AIRPLANE)).toBeNull();
    });
});

describe("built-in servo mixer rules", () => {
    it("returns the firmware's fixed rules for preset mixers", () => {
        const wing = builtinServoMixRules(MIXER_IDS.FLYING_WING);
        expect(wing).toHaveLength(5);
        expect(wing?.[2]).toEqual({ target: 4, input: 0, rate: -100, speed: 0, min: 0, max: 100, box: 0 });
        expect(builtinServoMixRules(MIXER_IDS.AIRPLANE)?.map((r) => r.target)).toEqual([3, 4, 5, 6, 7]);
    });

    it("returns null for custom mixers and multirotors", () => {
        expect(builtinServoMixRules(MIXER_IDS.CUSTOM_AIRPLANE)).toBeNull();
        expect(builtinServoMixRules(MIXER_IDS.CUSTOM_TRI)).toBeNull();
        expect(builtinServoMixRules(3)).toBeNull();
    });

    it("returns a copy, not the shared table", () => {
        const tri = builtinServoMixRules(MIXER_IDS.TRI) ?? [];
        tri[0].rate = 1;
        expect(builtinServoMixRules(MIXER_IDS.TRI)?.[0].rate).toBe(100);
    });

    it("only reads custom rules on Custom Airplane and Custom Tri", () => {
        expect(usesCustomServoRules(MIXER_IDS.CUSTOM_AIRPLANE)).toBe(true);
        expect(usesCustomServoRules(MIXER_IDS.CUSTOM_TRI)).toBe(true);
        expect(usesCustomServoRules(MIXER_IDS.AIRPLANE)).toBe(false);
        expect(usesCustomServoRules(null)).toBe(false);
    });
});

describe("custom rule list", () => {
    const rule = (target: number, rate: number, min = 0, max = 100) => ({
        target,
        input: 0,
        rate,
        speed: 0,
        min,
        max,
        box: 0,
    });

    it("loads rules up to the first rate-0 rule, like firmware loadCustomServoMixer", () => {
        const stored = [rule(2, 100), rule(3, -50), rule(0, 0, 0, 0), rule(4, 100)];
        expect(activeServoMixRules(stored)).toEqual([rule(2, 100), rule(3, -50)]);
        expect(activeServoMixRules([])).toEqual([]);
    });

    it("pads the list with empty rules so a save clears trailing slots", () => {
        const padded = padServoMixRulesToMax([rule(2, 100)]);
        expect(padded).toHaveLength(MAX_SERVO_RULES);
        expect(padded[0]).toEqual(rule(2, 100));
        expect(padded[15]).toEqual({ target: 0, input: 0, rate: 0, speed: 0, min: 0, max: 0, box: 0 });
    });

    it("makes new rules with full travel", () => {
        expect(makeServoMixRule(5, 2, 100)).toEqual({
            target: 5,
            input: 2,
            rate: 100,
            speed: 0,
            min: 0,
            max: 100,
            box: 0,
        });
    });

    it("flags rules the firmware wouldn't run as shown", () => {
        const rules = [
            rule(2, 100),
            rule(3, 0), // rate 0 ends the list
            rule(4, 126), // rate out of range
            rule(5, 100, -100, 100), // min below 0
            rule(6, 100, 0, 156), // max above 100
            rule(7, 100, 50, 50), // min not below max
            rule(2, -125, 0, 100),
        ];
        expect(invalidServoMixRules(rules)).toEqual([1, 2, 3, 4, 5]);
    });
});

describe("servoOutputItems", () => {
    it("lists every driven output, then the targets nothing drives", () => {
        expect(servoOutputItems(MIXER_IDS.FLYING_WING)).toEqual([
            { target: 3, slot: 0 },
            { target: 4, slot: 1 },
            { target: 0, slot: null },
            { target: 1, slot: null },
            { target: 2, slot: null },
            { target: 5, slot: null },
            { target: 6, slot: null },
            { target: 7, slot: null },
        ]);
    });

    it("keeps outputs that repeat a target, like the gimbal pair after HELI_120_CCPM", () => {
        // firmware writeServos(): heli 0..3, then updateGimbalServos() writes 0 and 1 again.
        const items = servoOutputItems(MIXER_IDS.HELI_120_CCPM, { servoTilt: true });
        expect(items.filter((item) => item.slot != null)).toEqual([
            { target: 0, slot: 0 },
            { target: 1, slot: 1 },
            { target: 2, slot: 2 },
            { target: 3, slot: 3 },
            { target: 0, slot: 4 },
            { target: 1, slot: 5 },
        ]);
        expect(items.filter((item) => item.slot == null).map((item) => item.target)).toEqual([4, 5, 6, 7]);
    });
});

describe("servoMixRulesToSave", () => {
    const rule = (target: number, rate: number, min = 0, max = 100) => ({
        target,
        input: 0,
        rate,
        speed: 0,
        min,
        max,
        box: 0,
    });

    it("returns a padded copy that later edits can't reach", () => {
        const rules = [rule(2, 100)];
        const save = servoMixRulesToSave(rules);
        // Edits made while the save runs: a rate the validation would refuse.
        rules[0].rate = 0;
        rules.push(rule(3, 50));
        expect(save.invalid).toEqual([]);
        expect(save.rules).toHaveLength(MAX_SERVO_RULES);
        expect(save.rules[0]).toEqual(rule(2, 100));
        expect(save.rules[1].rate).toBe(0);
    });

    it("lists the rules Save must refuse", () => {
        expect(servoMixRulesToSave([rule(2, 100), rule(3, 0), rule(4, 50, 60, 40)]).invalid).toEqual([1, 2]);
    });
});
