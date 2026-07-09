import { describe, expect, it } from "vitest";
import {
    AIRCRAFT_SERVO_MIX_TEMPLATES,
    MIXER_IDS,
    SERVO_MIX_INPUT_LABELS,
    padServoMixRulesToMax,
    pwmSlotToServoIndex,
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
});
