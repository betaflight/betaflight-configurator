import { describe, expect, it } from "vitest";
import {
    candidateSourceLabel,
    motorIndicesInUse,
    resourceOptions,
    stableResourcePins,
} from "../../../src/js/utils/motorServoResourceCandidates.js";

function analysis(extras = {}) {
    return {
        motors: [],
        servos: [],
        ledStrips: [],
        serials: [],
        freePadsCount: 0,
        freeDmaStreams: [],
        hardwareFixedPads: [],
        pwmCapableFreePads: [],
        warnings: [],
        ...extras,
    };
}

describe("motor/servo resource candidates", () => {
    it("keeps a stable selectable pin set across resource edits", () => {
        const motorResources = [{ index: 0, pin: "NONE" }];
        const servoResources = [{ index: 0, pin: "B03" }];

        expect(stableResourcePins(motorResources, servoResources, ["A08"])).toEqual(["A08", "B03"]);
    });

    it("derives in-use motor indices from assigned motor resources", () => {
        expect(
            motorIndicesInUse([
                { index: 0, pin: "A08" },
                { index: 1, pin: "NONE" },
                { index: 2, pin: "B03" },
            ]),
        ).toEqual([1, 3]);
    });

    it("adds timer-aware free PWM candidates for servo resources", () => {
        const options = resourceOptions({
            kind: "servo",
            resource: { index: 1, pin: "NONE" },
            motorResources: [{ index: 0, pin: "B00" }],
            hardwareAnalysis: analysis({
                motors: [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }],
                pwmCapableFreePads: [{ pad: "A03", timer: 2, channel: 4 }],
            }),
            fallbackPins: ["B00"],
        });

        expect(options.map((option) => option.value)).toEqual(["A03", "B00"]);
        expect(options[0].label).toBe("A03 - TIM2 CH4 - free");
    });

    it("labels releasable resources for dropdown hints", () => {
        expect(candidateSourceLabel({ source: "motor-release", requiresRelease: ["resource MOTOR 3 NONE"] })).toBe(
            "releases MOTOR 3",
        );
        expect(candidateSourceLabel({ source: "led-strip", requiresRelease: ["resource LED_STRIP 1 NONE"] })).toBe(
            "releases LED_STRIP",
        );
    });

    it("prefixes labels with silkscreen names when padDefaults.source is firmware", () => {
        const options = resourceOptions({
            kind: "motor",
            resource: { index: 0, pin: "B00" },
            motorResources: [{ index: 0, pin: "B00" }],
            hardwareAnalysis: analysis({
                motors: [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }],
                pwmCapableFreePads: [
                    { pad: "A09", timer: 1, channel: 2 },
                    { pad: "A03", timer: 2, channel: 4 },
                ],
                padDefaults: {
                    source: "firmware",
                    motors: [
                        { index: 1, pad: "B00" },
                        { index: 2, pad: "A09" },
                    ],
                    ledStrips: [{ pad: "A08" }],
                },
            }),
            fallbackPins: ["A08"],
            // expertMode: true keeps A03 visible in the dropdown so we
            // can verify the "pad with no silkscreen entry stays plain"
            // case independently of the pool-filter behaviour (covered
            // separately below).
            expertMode: true,
        });

        const findLabel = (pin) => options.find((option) => option.pin === pin)?.label;
        expect(findLabel("B00")).toContain("M1 (B00)");
        expect(findLabel("A09")).toContain("M2 (A09)");
        expect(findLabel("A08")).toContain("LED_STRIP (A08)");
        // Pad with no silkscreen entry stays plain.
        expect(findLabel("A03")).toBe("A03 - TIM2 CH4 - free");
    });

    it("suppresses silkscreen prefixes when padDefaults.source is not firmware", () => {
        const baseExtras = {
            motors: [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }],
            pwmCapableFreePads: [{ pad: "A09", timer: 1, channel: 2 }],
            padDefaults: {
                source: "scan",
                motors: [
                    { index: 1, pad: "B00" },
                    { index: 2, pad: "A09" },
                ],
                ledStrips: [],
            },
        };

        const options = resourceOptions({
            kind: "motor",
            resource: { index: 0, pin: "B00" },
            motorResources: [{ index: 0, pin: "B00" }],
            hardwareAnalysis: analysis(baseExtras),
            fallbackPins: [],
        });

        const findLabel = (pin) => options.find((option) => option.pin === pin)?.label;
        // Silkscreen map exists in padDefaults but source !== "firmware",
        // so no prefix should leak into labels.
        expect(findLabel("B00")).not.toContain("M1");
        expect(findLabel("A09")).not.toContain("M2");
    });

    it("annotates fallback pins with their current peripheral binding", () => {
        // Fallback pins resolve through addFallbackOptions, which has to
        // surface each pad's release cost: motor/servo numbers were already
        // there; LED_STRIP and UART <n> TX/RX get added by #1.5.
        const options = resourceOptions({
            kind: "servo",
            resource: { index: 0, pin: "NONE" },
            motorResources: [{ index: 0, pin: "B00" }],
            servoResources: [],
            hardwareAnalysis: analysis({
                motors: [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }],
                ledStrips: [{ pad: "A08", timer: 1, channel: 1, dmaStream: null }],
                serials: [{ index: 6, txPad: "B05", rxPad: "B07", txDma: null, rxDma: null }],
            }),
            fallbackPins: ["B00", "A08", "B05", "B07", "C09"],
        });

        const findOption = (pin) => options.find((option) => option.pin === pin);
        const findLabel = (pin) => findOption(pin)?.label;
        expect(findLabel("B00")).toContain("MOTOR 1");
        expect(findLabel("A08")).toContain("LED_STRIP");
        expect(findLabel("B05")).toContain("UART6 TX");
        expect(findLabel("B07")).toContain("UART6 RX");
        // Unbound pad keeps the bare label — no spurious annotation.
        expect(findLabel("C09")).toBe("C09");
        // LED/UART fallback pads must surface release lines so
        // onResourcePinChange clears the peripheral before binding.
        // MOTOR/SERVO assignments stay empty (filtered upstream by
        // isOptionViable); free pads have nothing to release.
        expect(findOption("A08")?.requiresRelease).toEqual(["resource LED_STRIP 1 NONE"]);
        expect(findOption("B05")?.requiresRelease).toEqual(["resource SERIAL_TX 6 NONE"]);
        expect(findOption("B07")?.requiresRelease).toEqual(["resource SERIAL_RX 6 NONE"]);
        expect(findOption("B00")?.requiresRelease).toEqual([]);
        expect(findOption("C09")?.requiresRelease).toEqual([]);
    });

    it("filters servo candidates outside the silkscreen pad pool by default", () => {
        // Pool: B00 (M1), A09 (M2), A08 (LED). C09 is PWM-capable but
        // not broken out on the silkscreen — default-mode dropdown should
        // omit it; expert mode brings it back.
        const baseAnalysis = analysis({
            motors: [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }],
            pwmCapableFreePads: [
                { pad: "A09", timer: 1, channel: 2 },
                { pad: "C09", timer: 8, channel: 4 },
            ],
            padDefaults: {
                source: "firmware",
                motors: [
                    { index: 1, pad: "B00" },
                    { index: 2, pad: "A09" },
                ],
                ledStrips: [{ pad: "A08" }],
            },
        });

        const defaultOptions = resourceOptions({
            kind: "servo",
            resource: { index: 0, pin: "NONE" },
            motorResources: [{ index: 0, pin: "B00" }],
            hardwareAnalysis: baseAnalysis,
            fallbackPins: [],
        });
        const expertOptions = resourceOptions({
            kind: "servo",
            resource: { index: 0, pin: "NONE" },
            motorResources: [{ index: 0, pin: "B00" }],
            hardwareAnalysis: baseAnalysis,
            fallbackPins: [],
            expertMode: true,
        });

        expect(defaultOptions.map((option) => option.pin)).not.toContain("C09");
        expect(expertOptions.map((option) => option.pin)).toContain("C09");
    });

    it("filters motor candidates outside the silkscreen pool by default", () => {
        const baseAnalysis = analysis({
            motors: [],
            pwmCapableFreePads: [
                { pad: "B00", timer: 3, channel: 3 },
                { pad: "C09", timer: 8, channel: 4 },
            ],
            padDefaults: {
                source: "firmware",
                motors: [{ index: 1, pad: "B00" }],
                ledStrips: [],
            },
        });

        const defaultOptions = resourceOptions({
            kind: "motor",
            resource: { index: 0, pin: "NONE" },
            motorResources: [],
            hardwareAnalysis: baseAnalysis,
            fallbackPins: [],
        });
        const expertOptions = resourceOptions({
            kind: "motor",
            resource: { index: 0, pin: "NONE" },
            motorResources: [],
            hardwareAnalysis: baseAnalysis,
            fallbackPins: [],
            expertMode: true,
        });

        expect(defaultOptions.map((option) => option.pin)).not.toContain("C09");
        expect(expertOptions.map((option) => option.pin)).toContain("C09");
    });

    it("preserves the current pin even when it falls outside the silkscreen pool", () => {
        // User is on B07 historically; B07 isn't in padDefaults. Filter
        // shouldn't strip the existing/current row — pilot must always be
        // able to see what they're currently bound to.
        const baseAnalysis = analysis({
            motors: [],
            pwmCapableFreePads: [{ pad: "B00", timer: 3, channel: 3 }],
            padDefaults: {
                source: "firmware",
                motors: [{ index: 1, pad: "B00" }],
                ledStrips: [],
            },
        });

        const options = resourceOptions({
            kind: "servo",
            resource: { index: 0, pin: "B07" },
            motorResources: [],
            hardwareAnalysis: baseAnalysis,
            fallbackPins: [],
        });

        expect(options.map((option) => option.pin)).toContain("B07");
    });

    it("hides candidates that share a timer with an in-use motor by default", () => {
        // Fixture: A03 is a free PWM pad, but its timer is shared with the
        // MOTOR 1 pad B00. Saving A03 onto a servo would steal MOTOR 1's
        // timer and brick the motor — pickOptimalPadLayout rejects this
        // shape, so the dropdown should hide it too.
        const baseAnalysis = analysis({
            motors: [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }],
            pwmCapableFreePads: [
                { pad: "A03", timer: 3, channel: 4, sharesTimerWithMotor: true },
                { pad: "A07", timer: 2, channel: 1 },
            ],
        });

        const defaultOptions = resourceOptions({
            kind: "servo",
            resource: { index: 0, pin: "NONE" },
            motorResources: [{ index: 0, pin: "B00" }],
            hardwareAnalysis: baseAnalysis,
            fallbackPins: [],
        });
        const expertOptions = resourceOptions({
            kind: "servo",
            resource: { index: 0, pin: "NONE" },
            motorResources: [{ index: 0, pin: "B00" }],
            hardwareAnalysis: baseAnalysis,
            fallbackPins: [],
            expertMode: true,
        });

        expect(defaultOptions.map((option) => option.pin)).not.toContain("A03");
        expect(expertOptions.map((option) => option.pin)).toContain("A03");
    });
});
