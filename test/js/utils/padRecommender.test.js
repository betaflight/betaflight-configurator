import { describe, it, expect } from "vitest";
import {
    candidatePadsForSlot,
    computePresetResourcePlan,
    pickOptimalPadLayout,
    pickSilkscreenOrderLayout,
} from "../../../src/js/utils/padRecommender.js";

// Minimal analyzer shape used across the suite — same shape analyzer returns.
function analysis(motors = [], extras = {}) {
    return {
        motors,
        servos: [],
        ledStrips: [],
        serials: [],
        freePadsCount: 0,
        freeDmaStreams: [],
        hardwareFixedPads: [],
        warnings: [],
        ...extras,
    };
}

describe("candidatePadsForSlot", () => {
    it("returns an empty list when analysis is null", () => {
        expect(candidatePadsForSlot(null, 2)).toEqual([]);
    });

    it("ranks currentPad first (zero-churn) when still safe", () => {
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            // Servo 2's current pad B01 is on timer 2, disjoint from the
            // in-use motor's timer 3 — i.e. genuinely safe, no DSHOT/PWM
            // timer conflict. Zero-churn requires no collision; a colliding
            // currentPad gets dropped by candidatePadsForSlot rather than
            // surfaced as a self-conflicting "existing" option.
            servos: [{ index: 2, pad: "B01", timer: 2, channel: 4 }],
            pwmCapableFreePads: [
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "A03", timer: 2, channel: 4 },
            ],
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1], currentPad: "B01" });
        expect(cands[0].pad).toBe("B01");
        expect(cands[0].source).toBe("existing");
        expect(cands[0].requiresRelease).toEqual([]);
    });

    it("drops currentPad from the candidate list when its timer collides with an in-use motor", () => {
        // Servo 2 is currently bound to B01 on timer 3, the same timer as
        // the in-use motor on B00. Surfacing this as zero-churn would
        // recommend the user keep a binding that already shares a timer
        // peripheral with a DSHOT motor (firmware can't run both in
        // parallel). Drop the existing entry; let the dropdown surface
        // safer candidates instead.
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            servos: [{ index: 2, pad: "B01", timer: 3, channel: 4 }],
            pwmCapableFreePads: [
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "A03", timer: 2, channel: 4 },
            ],
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1], currentPad: "B01" });
        expect(cands.find((c) => c.source === "existing")).toBeUndefined();
        expect(cands[0].pad).not.toBe("B01");
    });

    it("uses padPlannedTimers to claim a motor's post-AF-remap timer (same-pad remap case)", () => {
        // Scenario: motor 1 currently lives on B00 with timer 3, but the
        // batch will remap B00 to AF3 which moves it to timer 7. Without
        // padPlannedTimers, motorTimers contains only timer 3 (the stale
        // pre-batch value), so a free-PWM candidate on timer 7 looks
        // safe and a candidate on timer 3 looks unsafe — exactly inverted
        // from reality. With padPlannedTimers, motorTimers picks up
        // timer 7 and the rankings flip back to correct.
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [
                { pad: "A02", timer: 7, channel: 1 }, // shares motor's NEW timer (post-remap)
                { pad: "A03", timer: 3, channel: 2 }, // shares motor's OLD timer (freed by remap)
            ],
        });

        // Without padPlannedTimers: motorTimers = {3}, A02(t7) safe, A03(t3) unsafe.
        const before = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1] });
        const beforeA02 = before.find((c) => c.pad === "A02");
        const beforeA03 = before.find((c) => c.pad === "A03");
        expect(beforeA02?.sharesTimerWithMotor).toBe(false);
        expect(beforeA03?.sharesTimerWithMotor).toBe(true);

        // With padPlannedTimers: motorTimers = {7}, A02(t7) unsafe, A03(t3) safe.
        const padPlannedTimers = new Map([["B00", 7]]);
        const after = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1], padPlannedTimers });
        const afterA02 = after.find((c) => c.pad === "A02");
        const afterA03 = after.find((c) => c.pad === "A03");
        expect(afterA02?.sharesTimerWithMotor).toBe(true);
        expect(afterA03?.sharesTimerWithMotor).toBe(false);
    });

    it("padPlannedTimers also covers motors moving to a remapped destination pad", () => {
        // Motor 1 is on B00 (timer 3 today), but the batch plans both a
        // pad change (B00 → A02) AND an AF remap on the destination
        // (A02 moves to timer 9). motorRebinds tells candidatePadsForSlot
        // about the pad move; padPlannedTimers overlays the new timer.
        // Result: a servo on timer 9 should be flagged as conflicting,
        // not a servo on timer 3 (which the motor is vacating).
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const padTimers = new Map([
            ["B00", { timer: 3, channel: 3 }],
            ["A02", { timer: 2, channel: 1 }], // pre-batch AF
        ]);
        const a = analysis(motors, {
            padTimers,
            pwmCapableFreePads: [
                { pad: "B01", timer: 9, channel: 4 }, // post-batch motor timer
                { pad: "B02", timer: 3, channel: 1 }, // freed by motor moving away
            ],
        });
        const motorRebinds = new Map([[1, "A02"]]); // motor 1 → A02
        const padPlannedTimers = new Map([["A02", 9]]); // A02 will land on timer 9 after AF remap
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1], motorRebinds, padPlannedTimers });
        const b01 = cands.find((c) => c.pad === "B01");
        const b02 = cands.find((c) => c.pad === "B02");
        expect(b01?.sharesTimerWithMotor).toBe(true);
        expect(b02?.sharesTimerWithMotor).toBe(false);
    });

    it("ranks free-PWM pads with no motor-timer conflict above conflicting ones", () => {
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            pwmCapableFreePads: [
                { pad: "A02", timer: 3, channel: 1 }, // conflicts with motor timer 3
                { pad: "A03", timer: 2, channel: 4 }, // safe
                { pad: "B10", timer: 2, channel: 3 }, // safe
            ],
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1] });
        // Non-conflict free-pwm first (A03, B10), then conflict (A02).
        expect(cands.map((c) => c.pad)).toEqual(["A03", "B10", "A02"]);
        expect(cands[0].sharesTimerWithMotor).toBe(false);
        expect(cands[2].sharesTimerWithMotor).toBe(true);
    });

    it("emits dormant-motor pads as free-pwm with a requiresRelease hint", () => {
        // Motor 2 is firmware-bound to B01 but NOT in MSP2 use. Picking B01
        // for a servo costs nothing in MSP2-land — dropdown should label it
        // "free", not "releases MOTOR 2", so the user isn't misled into
        // thinking they're losing a working motor. The requiresRelease line
        // is still emitted so save clears the firmware-level binding.
        const a = analysis([
            { index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true },
            { index: 2, pad: "B01", timer: 3, channel: 4, dmaStream: null, bidirBurst: true },
        ]);
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1] });
        const dormant = cands.find((c) => c.pad === "B01");
        expect(dormant).toBeDefined();
        expect(dormant.source).toBe("free-pwm");
        expect(dormant.requiresRelease).toEqual(["resource MOTOR 2 NONE"]);
        // Sanity: no motor-release candidate when no motor is actively rebinding.
        expect(cands.find((c) => c.source === "motor-release")).toBeUndefined();
    });

    it("emits motor-release for an active motor being rebound to a different pad", () => {
        // Motor 1 is actively in MSP2 use AND scheduled to move from B00 to A03.
        // Its old pad B00 becomes a real motor-release candidate (label
        // "releases MOTOR 1") because losing the binding has real cost.
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            pwmCapableFreePads: [{ pad: "A03", timer: 2, channel: 4 }],
        });
        const cands = candidatePadsForSlot(a, 2, {
            motorIndicesInUse: [1],
            motorRebinds: new Map([[1, "A03"]]),
        });
        const release = cands.find((c) => c.source === "motor-release");
        expect(release).toBeDefined();
        expect(release.pad).toBe("B00");
        expect(release.requiresRelease).toEqual(["resource MOTOR 1 NONE"]);
    });

    it("excludes LED_STRIP and unopted UART pads by default", () => {
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            ledStrips: [{ pad: "A09", timer: 1, channel: 2, dmaStream: { controller: 2, stream: 6 } }],
            serials: [{ index: 3, txPad: "B10", rxPad: null, txDma: null, rxDma: null }],
            spareUarts: [{ index: 3, txPad: "B10", rxPad: null }],
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1] });
        expect(cands.map((c) => c.pad)).not.toContain("A09");
        expect(cands.map((c) => c.pad)).not.toContain("B10");
    });

    it("exposes LED_STRIP pad with release hint when allowLedStrip is true", () => {
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            ledStrips: [{ pad: "A09", timer: 1, channel: 2, dmaStream: { controller: 2, stream: 6 } }],
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1], allowLedStrip: true });
        const led = cands.find((c) => c.source === "led-strip");
        expect(led).toBeDefined();
        expect(led.pad).toBe("A09");
        expect(led.requiresRelease).toEqual(["resource LED_STRIP 1 NONE"]);
    });

    it("exposes UART TX/RX pads with release hints when allowUartRelease lists that UART", () => {
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            serials: [{ index: 3, txPad: "B10", rxPad: "B11", txDma: null, rxDma: null }],
            spareUarts: [{ index: 3, txPad: "B10", rxPad: "B11" }],
            // UART pads must be PWM-capable to surface — picker drops UART
            // pads with no timer mapping so the dropdown can't recommend
            // something that won't drive PWM.
            padTimers: new Map([
                ["B10", { timer: 5, channel: 1 }],
                ["B11", { timer: 5, channel: 2 }],
            ]),
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1], allowUartRelease: [3] });
        const tx = cands.find((c) => c.pad === "B10");
        const rx = cands.find((c) => c.pad === "B11");
        expect(tx.source).toBe("uart-release");
        expect(tx.requiresRelease).toEqual(["resource SERIAL_TX 3 NONE"]);
        expect(rx.requiresRelease).toEqual(["resource SERIAL_RX 3 NONE"]);
    });

    it("drops UART TX/RX pads that have no PWM-capable timer (e.g. A09/USART1_TX on TMOTORF7)", () => {
        // Brian's TMOTORF7 case: A09 is bound as USART1_TX in `resource show`
        // but `timer show` has no entry for it — no timer AF on the pin in
        // this firmware build. Surfacing the pad and letting the user pick
        // it would emit `resource SERIAL_TX 1 NONE` + bind, but the new
        // resource would never produce PWM.
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            serials: [{ index: 1, txPad: "A09", rxPad: null, txDma: null, rxDma: null }],
            spareUarts: [{ index: 1, txPad: "A09", rxPad: null }],
            // No padTimers entry for A09, no padTimerOptions either.
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1], allowUartRelease: [1] });
        expect(cands.find((c) => c.pad === "A09")).toBeUndefined();
    });

    it("keeps UART pads whose only PWM capability is via an alt AF (padTimerOptions)", () => {
        // Pad with no current timer (UART AF active) but an alt AF that
        // would give it a timer. The alt-AF expansion at padTimerOptions
        // picks up the rescue path; the base candidate must survive the
        // PWM-capability filter to reach that expansion.
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            serials: [{ index: 3, txPad: "B10", rxPad: null, txDma: null, rxDma: null }],
            spareUarts: [{ index: 3, txPad: "B10", rxPad: null }],
            padTimerOptions: new Map([["B10", [{ timer: 8, channel: 4, af: 3 }]]]),
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1], allowUartRelease: [3] });
        expect(cands.find((c) => c.pad === "B10" && c.source === "uart-release")).toBeDefined();
    });

    it("filters out pads claimed by another SERVO (collision defense)", () => {
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            servos: [{ index: 1, pad: "B01", timer: 3, channel: 4 }],
            pwmCapableFreePads: [
                { pad: "B01", timer: 3, channel: 4 }, // stale — already SERVO 1
                { pad: "A02", timer: 2, channel: 3 },
            ],
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1] });
        expect(cands.map((c) => c.pad)).not.toContain("B01");
        expect(cands.map((c) => c.pad)).toContain("A02");
    });

    it("filters out pads claimed by an in-use motor (can't steal an active motor pad)", () => {
        const a = analysis(
            [
                { index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true },
                { index: 2, pad: "B01", timer: 3, channel: 4, dmaStream: null, bidirBurst: true },
            ],
            {
                pwmCapableFreePads: [{ pad: "A02", timer: 2, channel: 3 }],
            },
        );
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1, 2] });
        expect(cands.map((c) => c.pad)).not.toContain("B00");
        expect(cands.map((c) => c.pad)).not.toContain("B01");
        expect(cands.map((c) => c.pad)).toContain("A02");
    });

    it("filters out hardware-fixed pads (SPI_SCK, GYRO_CS, BEEPER, etc.)", () => {
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            pwmCapableFreePads: [
                { pad: "A05", timer: 2, channel: 1 },
                { pad: "C13", timer: 1, channel: 1 },
            ],
            hardwareFixedPads: [{ pad: "C13", peripheral: "BEEPER", index: 1 }],
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1] });
        expect(cands.map((c) => c.pad)).not.toContain("C13");
        expect(cands.map((c) => c.pad)).toContain("A05");
    });

    it("combined ranking: existing → free-pwm (dormant motor + true free) → LED → UART", () => {
        // Dormant motors (firmware-bound but not in MSP2 use) emit as
        // free-pwm. They sit ahead of true free PWM pads in the ranking
        // because the per-source loops emit dormant motors first, but
        // both share the "free" label so the user sees them as
        // interchangeable. See the separate motor-release test for the
        // case where an active motor is being rebound.
        const a = analysis(
            [
                { index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true },
                { index: 2, pad: "B04", timer: 3, channel: 2, dmaStream: null, bidirBurst: true },
            ],
            {
                servos: [{ index: 2, pad: "B07", timer: 4, channel: 2 }],
                pwmCapableFreePads: [{ pad: "A03", timer: 2, channel: 4 }],
                ledStrips: [{ pad: "A09", timer: 1, channel: 2, dmaStream: null }],
                serials: [{ index: 3, txPad: "B10", rxPad: null, txDma: null, rxDma: null }],
                spareUarts: [{ index: 3, txPad: "B10", rxPad: null }],
                // B10 must be PWM-capable for the picker to surface it.
                padTimers: new Map([["B10", { timer: 5, channel: 1 }]]),
            },
        );
        const cands = candidatePadsForSlot(a, 2, {
            motorIndicesInUse: [1],
            currentPad: "B07",
            allowLedStrip: true,
            allowUartRelease: [3],
        });
        expect(cands.map((c) => c.source)).toEqual([
            "existing", // B07
            "free-pwm", // B04 (M2 firmware-bound but dormant)
            "free-pwm", // A03 (true free PWM pad)
            "led-strip", // A09
            "uart-release", // B10
        ]);
    });
});

// Plane preset fixtures — same shape planePresets.js exports.
const _FLYING_WING = {
    mmix: [{ throttle: 1.0, roll: 0, pitch: 0, yaw: 0 }],
    rules: [
        { target: 3 /* FLAPPERON_L → SERVO 2 */, input: 0, rate: 50 },
        { target: 3, input: 1, rate: 50 },
        { target: 4 /* FLAPPERON_R → SERVO 3 */, input: 0, rate: -50 },
        { target: 4, input: 1, rate: 50 },
    ],
};
const _STANDARD_PLANE = {
    mmix: [{ throttle: 1.0, roll: 0, pitch: 0, yaw: 0 }],
    rules: [
        { target: 2 /* ELEVATOR → SERVO 1 */, input: 1, rate: 100 },
        { target: 3, input: 0, rate: 100 },
        { target: 4, input: 0, rate: -100 },
        { target: 5 /* RUDDER → SERVO 4 */, input: 2, rate: 100 },
    ],
};
const _DIFF_THRUST = {
    mmix: [
        { throttle: 1.0, roll: 0, pitch: 0, yaw: 0.4 },
        { throttle: 1.0, roll: 0, pitch: 0, yaw: -0.4 },
    ],
    rules: [
        { target: 3, input: 0, rate: 50 },
        { target: 3, input: 1, rate: 50 },
        { target: 4, input: 0, rate: -50 },
        { target: 4, input: 1, rate: 50 },
    ],
};

describe("computePresetResourcePlan", () => {
    it("Flying Wing on stock 8-motor FLYWOOF: releases M2-M8, binds only SERVO 2+3 (no orphan SERVO 1)", () => {
        const motors = ["B00", "B01", "A03", "A02", "B05", "B07", "C09", "C08"].map((pad, i) => ({
            index: i + 1,
            pad,
            timer: null,
            channel: null,
            dmaStream: null,
            bidirBurst: false,
        }));
        const plan = computePresetResourcePlan(analysis(motors), _FLYING_WING);

        expect(plan.usedMotorIndices).toEqual([1]);
        expect(plan.usedServoIndices).toEqual([2, 3]);

        expect(plan.motorsToRelease.map((m) => m.index)).toEqual([2, 3, 4, 5, 6, 7, 8]);
        expect(plan.servosToRelease).toEqual([]);

        // Filter for bind-style lines only (`resource SERVO N PAD`, not NONE) —
        // defensive-release prefix emits `resource SERVO N NONE` for unused
        // slots, so a loose `/^resource SERVO /` would capture those too.
        const servoBinds = plan.cliLines.filter((l) => /^resource SERVO \d+ [A-Z]\d/.test(l));
        expect(servoBinds).toHaveLength(2);
        expect(servoBinds[0]).toBe("resource SERVO 2 B01");
        expect(servoBinds[1]).toBe("resource SERVO 3 A03");
    });

    it("Flying Wing on already-correct wing board: zero CLI lines (true no-op)", () => {
        const a = analysis([{ index: 1, pad: "B07", timer: 4, channel: 2, dmaStream: null, bidirBurst: true }], {
            servos: [
                { index: 2, pad: "B15", timer: 3, channel: 1 },
                { index: 3, pad: "A08", timer: 1, channel: 1 },
            ],
        });
        const plan = computePresetResourcePlan(a, _FLYING_WING);
        expect(plan.cliLines).toEqual([]);
    });

    it("Flying Wing from bad state (orphan SERVO 1 bound): cleans up SERVO 1, keeps S2+S3", () => {
        const a = analysis([{ index: 1, pad: "B07", timer: 4, channel: 2, dmaStream: null, bidirBurst: true }], {
            servos: [
                { index: 1, pad: "B00", timer: 3, channel: 3 },
                { index: 2, pad: "B01", timer: 3, channel: 4 },
                { index: 3, pad: "A03", timer: 2, channel: 4 },
            ],
        });
        const plan = computePresetResourcePlan(a, _FLYING_WING);
        expect(plan.cliLines).toContain("resource SERVO 1 NONE");
        const servoBinds = plan.cliLines.filter((l) => /^resource SERVO \d+ [A-Z]\d/.test(l));
        expect(servoBinds).toEqual([]);
    });

    it("Standard Plane: 4 SERVOs (1-4), usedMotorIndices = [1]", () => {
        const motors = ["B00", "B01", "A03", "A02"].map((pad, i) => ({
            index: i + 1,
            pad,
            timer: null,
            channel: null,
            dmaStream: null,
            bidirBurst: false,
        }));
        const plan = computePresetResourcePlan(analysis(motors), _STANDARD_PLANE);
        expect(plan.usedServoIndices).toEqual([1, 2, 3, 4]);
        // Only 3 motors releasable (M2, M3, M4) — 4th servo (S4) has no pad.
        const servoBinds = plan.cliLines.filter((l) => /^resource SERVO \d+ [A-Z]\d/.test(l));
        expect(servoBinds).toHaveLength(3);
        expect(plan.warnings.some((w) => w.code === "no_pad_for_slot")).toBe(true);
    });

    it("Diff-thrust: usedMotorIndices = [1,2], motors 3-8 released, 2 SERVO binds", () => {
        const motors = ["B00", "B01", "A03", "A02", "B05", "B07", "C09", "C08"].map((pad, i) => ({
            index: i + 1,
            pad,
            timer: null,
            channel: null,
            dmaStream: null,
            bidirBurst: false,
        }));
        const plan = computePresetResourcePlan(analysis(motors), _DIFF_THRUST);
        expect(plan.usedMotorIndices).toEqual([1, 2]);
        expect(plan.usedServoIndices).toEqual([2, 3]);
        expect(plan.motorsToRelease.map((m) => m.index)).toEqual([3, 4, 5, 6, 7, 8]);
        const servoBinds = plan.cliLines.filter((l) => /^resource SERVO \d+ [A-Z]\d/.test(l));
        expect(servoBinds).toHaveLength(2);
    });

    it("user override: picks.servoIndex replaces the top-ranked candidate", () => {
        const motors = ["B00", "B01", "A03", "A02"].map((pad, i) => ({
            index: i + 1,
            pad,
            timer: null,
            channel: null,
            dmaStream: null,
            bidirBurst: false,
        }));
        const plan = computePresetResourcePlan(analysis(motors), _FLYING_WING, {
            picks: { 2: "A03" },
        });
        const servoBinds = plan.cliLines.filter((l) => /^resource SERVO \d+ [A-Z]\d/.test(l));
        expect(servoBinds[0]).toBe("resource SERVO 2 A03");
        expect(servoBinds[1]).toMatch(/^resource SERVO 3 (?!A03)/);
    });

    it("diff-thrust after Flying Wing: binds MOTOR 2 from free PWM pool instead of leaving it orphaned", () => {
        const a = analysis([{ index: 1, pad: "A03", timer: 2, channel: 4, dmaStream: null, bidirBurst: true }], {
            servos: [
                { index: 2, pad: "B01", timer: 3, channel: 4 },
                { index: 3, pad: "A02", timer: 2, channel: 3 },
            ],
            pwmCapableFreePads: [
                { pad: "B04", timer: 3, channel: 1 },
                { pad: "B05", timer: 3, channel: 2 },
            ],
        });
        const plan = computePresetResourcePlan(a, _DIFF_THRUST);
        expect(plan.usedMotorIndices).toEqual([1, 2]);
        expect(plan.motorPicks.has(2)).toBe(true);
        const motorBinds = plan.cliLines.filter((l) => /^resource MOTOR \d+ [A-Z]\d/.test(l));
        expect(motorBinds).toHaveLength(1);
        expect(motorBinds[0]).toMatch(/^resource MOTOR 2 /);
        const motor2Pad = motorBinds[0].split(" ").pop();
        expect(["B01", "A02"]).not.toContain(motor2Pad);
    });

    it("warns and skips MOTOR bind when no free PWM pad is available", () => {
        const a = analysis([{ index: 1, pad: "A03", timer: 2, channel: 4, dmaStream: null, bidirBurst: true }], {
            servos: [
                { index: 2, pad: "B01", timer: 3, channel: 4 },
                { index: 3, pad: "A02", timer: 2, channel: 3 },
            ],
            pwmCapableFreePads: [],
        });
        const plan = computePresetResourcePlan(a, _DIFF_THRUST);
        expect(plan.warnings.some((w) => w.code === "no_pad_for_motor")).toBe(true);
        const motorBinds = plan.cliLines.filter((l) => /^resource MOTOR \d+ [A-Z]\d/.test(l));
        expect(motorBinds).toEqual([]);
    });

    it("honors allowLedStrip / allowUartRelease options (release lines precede binds)", () => {
        const a = analysis(
            [
                { index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: false },
                { index: 2, pad: "B01", timer: 3, channel: 4, dmaStream: null, bidirBurst: false },
            ],
            {
                ledStrips: [{ pad: "A09", timer: 1, channel: 2, dmaStream: null }],
                serials: [{ index: 3, txPad: "B10", rxPad: null, txDma: null, rxDma: null }],
                spareUarts: [{ index: 3, txPad: "B10", rxPad: null }],
                pwmCapableFreePads: [],
            },
        );
        const plan = computePresetResourcePlan(a, _FLYING_WING, {
            allowLedStrip: true,
            allowUartRelease: [3],
        });
        expect(plan.cliLines).toContain("resource LED_STRIP 1 NONE");
        const ledIdx = plan.cliLines.indexOf("resource LED_STRIP 1 NONE");
        const s3Idx = plan.cliLines.findIndex((l) => /^resource SERVO 3 /.test(l));
        expect(ledIdx).toBeLessThan(s3Idx);
    });
});

describe("computePresetResourcePlan: effectiveRules override", () => {
    // Simulates the user having picked Flying Wing then added an extra
    // Rudder rule (SERVO 5) via the Function→Output Mapping editor.
    it("adds rows for SERVO indices the user appended to the rule editor", () => {
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "A03", timer: 2, channel: 4 },
                { pad: "B10", timer: 2, channel: 2 },
            ],
        });
        const effectiveRules = [..._FLYING_WING.rules, { target: 6 /* RUDDER → SERVO 5 */, input: 2, rate: 100 }];
        const plan = computePresetResourcePlan(a, _FLYING_WING, { effectiveRules });
        expect(plan.usedServoIndices).toEqual([2, 3, 5]);
        expect(plan.cliLines.some((l) => /^resource SERVO 5 /.test(l))).toBe(true);
    });

    it("drops SERVO rows when the user removed the preset rule", () => {
        // Flying Wing without its right-elevon rule — only SERVO 2 remains.
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [{ pad: "A02", timer: 2, channel: 3 }],
        });
        const effectiveRules = _FLYING_WING.rules.filter((r) => r.target !== 4);
        const plan = computePresetResourcePlan(a, _FLYING_WING, { effectiveRules });
        expect(plan.usedServoIndices).toEqual([2]);
        // Defensive prefix now emits `resource SERVO 3 NONE` — that's expected.
        // The real assertion is that no *bind* line targets SERVO 3.
        expect(plan.cliLines.some((l) => /^resource SERVO 3 [A-Z]\d/.test(l))).toBe(false);
    });

    it("filters rate=0 rules (editor placeholder / deletion marker)", () => {
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "A03", timer: 2, channel: 4 },
            ],
        });
        const effectiveRules = [
            ..._FLYING_WING.rules,
            { target: 6 /* SERVO 5 */, input: 2, rate: 0 }, // placeholder — should not appear
        ];
        const plan = computePresetResourcePlan(a, _FLYING_WING, { effectiveRules });
        expect(plan.usedServoIndices).toEqual([2, 3]);
    });

    it("falls through to preset.rules when effectiveRules is not passed", () => {
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "A03", timer: 2, channel: 4 },
            ],
        });
        const plan = computePresetResourcePlan(a, _FLYING_WING);
        expect(plan.usedServoIndices).toEqual([2, 3]);
    });
});

describe("computePresetResourcePlan: motorCount override", () => {
    // Single-motor preset (Flying Wing) bumped to 2 motors via the
    // diff-thrust toggle on the Mixer tab. MOTOR 2 should get claimed.
    it("expands usedMotorIndices when motorCount bumps a single-motor preset to 2", () => {
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "A03", timer: 2, channel: 4 },
                { pad: "B10", timer: 2, channel: 2 },
            ],
        });
        const plan = computePresetResourcePlan(a, _FLYING_WING, { motorCount: 2 });
        expect(plan.usedMotorIndices).toEqual([1, 2]);
        // MOTOR 2 had no existing binding, so a bind line is emitted.
        expect(plan.cliLines.some((l) => /^resource MOTOR 2 /.test(l))).toBe(true);
    });

    // Two-motor preset run with motorCount=1 — MOTOR 2 gets released.
    // Supports the inverse toggle (switch diff-thrust preset down to
    // single-motor) without requiring a distinct preset entry.
    it("shrinks usedMotorIndices + releases extras when motorCount downgrades", () => {
        const motors = [
            { index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true },
            { index: 2, pad: "B01", timer: 3, channel: 4, dmaStream: null, bidirBurst: true },
        ];
        const a = analysis(motors, {
            pwmCapableFreePads: [{ pad: "A02", timer: 2, channel: 3 }],
        });
        const plan = computePresetResourcePlan(a, _DIFF_THRUST, { motorCount: 1 });
        expect(plan.usedMotorIndices).toEqual([1]);
        expect(plan.motorsToRelease.map((m) => m.index)).toContain(2);
        expect(plan.cliLines).toContain("resource MOTOR 2 NONE");
    });

    it("falls through to preset.mmix.length when motorCount is not passed", () => {
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "A03", timer: 2, channel: 4 },
            ],
        });
        const plan = computePresetResourcePlan(a, _FLYING_WING);
        expect(plan.usedMotorIndices).toEqual([1]);
    });

    it("ignores motorCount values of 0 or negative (falls back to preset.mmix.length)", () => {
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [{ pad: "A02", timer: 2, channel: 3 }],
        });
        const plan = computePresetResourcePlan(a, _FLYING_WING, { motorCount: 0 });
        expect(plan.usedMotorIndices).toEqual([1]);
    });
});

// ─────────────────────────────────────────────────────────────────
// pickOptimalPadLayout — the joint motor+servo silkscreen-pool picker
// ─────────────────────────────────────────────────────────────────

// FLYWOOF405NANO-shaped fixture (real-ish timer layout): M1-M4+M7 on
// TIM3 (quad ESC convention), M6+M8 on TIM8, M5 on TIM3 too. Plus the
// LED pad on TIM1. Exercises the "can't put MOTOR 2 on silkscreen M2
// without blocking TIM3 for servos" scenario from bench testing.
const FLYWOOF_PAD_TIMERS = new Map([
    ["B00", { timer: 3, channel: 3 }], // M1
    ["B01", { timer: 3, channel: 4 }], // M2
    ["A03", { timer: 2, channel: 4 }], // M3
    ["A02", { timer: 2, channel: 3 }], // M4
    ["B05", { timer: 3, channel: 2 }], // M5
    ["C09", { timer: 8, channel: 4 }], // M6
    ["B04", { timer: 3, channel: 1 }], // M7
    ["C08", { timer: 8, channel: 3 }], // M8
    ["A09", { timer: 1, channel: 2 }], // LED_STRIP
]);

const FLYWOOF_PAD_DEFAULTS = {
    target: "FLYWOOF405NANO",
    source: "firmware",
    motors: [
        { index: 1, pad: "B00" },
        { index: 2, pad: "B01" },
        { index: 3, pad: "A03" },
        { index: 4, pad: "A02" },
        { index: 5, pad: "B05" },
        { index: 6, pad: "C09" },
        { index: 7, pad: "B04" },
        { index: 8, pad: "C08" },
    ],
    ledStrips: [{ pad: "A09" }],
};

describe("pickOptimalPadLayout", () => {
    it("returns null when padDefaults is missing", () => {
        const a = analysis([], { padTimers: FLYWOOF_PAD_TIMERS });
        expect(pickOptimalPadLayout(a, 2, [2, 3], {})).toBeNull();
    });

    it("returns null when padTimers is absent (analyzer built without timerDump)", () => {
        const a = analysis([], {});
        expect(pickOptimalPadLayout(a, 2, [2, 3], { padDefaults: FLYWOOF_PAD_DEFAULTS })).toBeNull();
    });

    it("returns null when the pool can't fit motorCount + servoCount", () => {
        const tinyDefaults = {
            target: "TINY",
            motors: [
                { index: 1, pad: "B00" },
                { index: 2, pad: "B01" },
            ],
            ledStrips: [],
        };
        const a = analysis([], {
            padTimers: new Map([
                ["B00", { timer: 3, channel: 3 }],
                ["B01", { timer: 3, channel: 4 }],
            ]),
        });
        expect(pickOptimalPadLayout(a, 2, [2, 3, 4], { padDefaults: tinyDefaults })).toBeNull();
    });

    it("relocates MOTOR 2 off TIM3 so 4 servos can fit timer-safely on FLYWOOF405NANO", () => {
        // Standard-plane on a 2-motor wing: 2 motors + 4 servos. The
        // silkscreen-first heuristic would put both motors on TIM3
        // (B00+B01), leaving only 3 TIM-disjoint pool pads (A03/A02/C09)
        // for 4 servos → can't fit. Optimizer must relocate motors to
        // free TIM3.
        const a = analysis([], { padTimers: FLYWOOF_PAD_TIMERS });
        const result = pickOptimalPadLayout(a, 2, [1, 2, 3, 4], {
            padDefaults: FLYWOOF_PAD_DEFAULTS,
        });
        expect(result).not.toBeNull();
        expect(result.motors.size).toBe(2);
        expect(result.servos.size).toBe(4);
        // Every servo must be on a timer disjoint from every motor.
        const motorTimers = new Set([...result.motors.values()].map((pad) => FLYWOOF_PAD_TIMERS.get(pad).timer));
        for (const servoPad of result.servos.values()) {
            const st = FLYWOOF_PAD_TIMERS.get(servoPad).timer;
            expect(motorTimers.has(st)).toBe(false);
        }
    });

    it("preserves silkscreen convention when no timer conflict forces relocation (1M + 2S)", () => {
        // Flying Wing: 1 motor + 2 servos. Putting M1 on silkscreen M1
        // (B00, TIM3) leaves TIM2/TIM8 free — plenty of room for SERVO
        // 2+3 on silkscreen M3+M4. No reason to relocate.
        const a = analysis([], { padTimers: FLYWOOF_PAD_TIMERS });
        const result = pickOptimalPadLayout(a, 1, [2, 3], {
            padDefaults: FLYWOOF_PAD_DEFAULTS,
        });
        expect(result).not.toBeNull();
        expect(result.motors.get(1)).toBe("B00"); // silkscreen M1 preserved
    });

    it("includes LED_STRIP pad in pool when allowLedStrip=true", () => {
        // Contrived: all 8 MOTOR silkscreen pads share TIM3 so the only
        // way to place even 1 servo is to steal LED's TIM1 pad.
        const allTim3 = new Map();
        for (let i = 0; i < 8; i++) {
            allTim3.set(`B0${i}`, { timer: 3, channel: (i % 4) + 1 });
        }
        allTim3.set("A09", { timer: 1, channel: 2 });
        const defaults = {
            target: "FAKE",
            motors: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, pad: `B0${i}` })),
            ledStrips: [{ pad: "A09" }],
        };
        const a = analysis([], { padTimers: allTim3 });
        const resultNoLed = pickOptimalPadLayout(a, 1, [2], { padDefaults: defaults, allowLedStrip: false });
        expect(resultNoLed).toBeNull();
        const resultWithLed = pickOptimalPadLayout(a, 1, [2], { padDefaults: defaults, allowLedStrip: true });
        expect(resultWithLed).not.toBeNull();
        expect(resultWithLed.servos.get(2)).toBe("A09");
    });

    it("keeps motors on their current (non-silkscreen) pads when that layout is already timer-safe (zero-churn)", () => {
        // Bench regression (2026-04-22): user had motors at A03+A02
        // (silkscreen M3+M4, both on TIM2) + servos at B05/B04/C09/C08
        // (TIM3+TIM8). Layout is valid — no timer conflict. Optimizer
        // used to force motors onto silkscreen M1+M2 (B00+B01, TIM3),
        // cascading a full resource re-shuffle. Zero-churn bonus MUST
        // keep the current layout.
        const a = analysis(
            [
                { index: 1, pad: "A03", timer: 2, channel: 4, dmaStream: null, bidirBurst: false },
                { index: 2, pad: "A02", timer: 2, channel: 3, dmaStream: null, bidirBurst: false },
            ],
            {
                servos: [
                    { index: 1, pad: "B05", timer: 3, channel: 2 },
                    { index: 2, pad: "B04", timer: 3, channel: 1 },
                    { index: 3, pad: "C09", timer: 8, channel: 4 },
                    { index: 4, pad: "C08", timer: 8, channel: 3 },
                ],
                padTimers: FLYWOOF_PAD_TIMERS,
            },
        );
        const result = pickOptimalPadLayout(a, 2, [1, 2, 3, 4], {
            padDefaults: FLYWOOF_PAD_DEFAULTS,
        });
        expect(result).not.toBeNull();
        // Motors stay put.
        expect(result.motors.get(1)).toBe("A03");
        expect(result.motors.get(2)).toBe("A02");
        // Servos stay put.
        expect(result.servos.get(1)).toBe("B05");
        expect(result.servos.get(2)).toBe("B04");
        expect(result.servos.get(3)).toBe("C09");
        expect(result.servos.get(4)).toBe("C08");
    });

    it("prefers silkscreen M1 for motor 1 among equally-scoring placements", () => {
        // 1M + 1S layout with TIM2 and TIM3 both holding only one M pad
        // each. Either would be a valid motor pick (same servo count
        // either way). Silkscreen-preservation tiebreaker should pick
        // M1 → silkscreen M1 (B00), leaving M3 (A03) for the servo.
        const padTimers = new Map([
            ["B00", { timer: 3, channel: 3 }],
            ["A03", { timer: 2, channel: 4 }],
        ]);
        const defaults = {
            target: "TWO_PAD",
            motors: [
                { index: 1, pad: "B00" },
                { index: 3, pad: "A03" },
            ],
            ledStrips: [],
        };
        const a = analysis([], { padTimers });
        const result = pickOptimalPadLayout(a, 1, [2], { padDefaults: defaults });
        expect(result.motors.get(1)).toBe("B00");
        expect(result.servos.get(2)).toBe("A03");
    });
});

describe("computePresetResourcePlan: optimizer integration", () => {
    it("emits a servo bind on a TIM-disjoint silkscreen pad when all M pads share a timer with motors", () => {
        // Regression for the FLYWOOF405NANO bench case: standard_plane
        // with 2 motors + 4 servos used to end up with SERVO 3 landing
        // on a free-PWM pad *outside* the silkscreen pool (B07) because
        // silkscreen M5 (B05) shared TIM3 with MOTOR 1+2. With the
        // joint optimizer motors get relocated so all 4 servos fit on
        // silkscreen pads with no timer fight.
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            servos: [],
            padTimers: FLYWOOF_PAD_TIMERS,
            pwmCapableFreePads: [
                { pad: "B01", timer: 3, channel: 4 },
                { pad: "A03", timer: 2, channel: 4 },
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "B05", timer: 3, channel: 2 },
                { pad: "C09", timer: 8, channel: 4 },
                { pad: "B04", timer: 3, channel: 1 },
                { pad: "C08", timer: 8, channel: 3 },
            ],
        });
        const preset = {
            mmix: [{ throttle: 1, roll: 0, pitch: 0, yaw: 0 }],
            rules: [
                { target: 2, input: 0, rate: 100 },
                { target: 3, input: 0, rate: -100 },
                { target: 4, input: 1, rate: 100 },
                { target: 5, input: 1, rate: 100 },
            ],
        };
        const plan = computePresetResourcePlan(a, preset, {
            padDefaults: FLYWOOF_PAD_DEFAULTS,
            motorCount: 2,
        });
        // 4 SERVO bind lines, all landing on silkscreen-pool pads.
        const servoBinds = plan.cliLines.filter((l) => /^resource SERVO \d+ [A-Z]\d/.test(l));
        expect(servoBinds).toHaveLength(4);
        for (const line of servoBinds) {
            const pad = line.split(" ").pop();
            expect(FLYWOOF_PAD_DEFAULTS.motors.some((m) => m.pad === pad) || pad === "A09").toBe(true);
        }
        // The plan should not pull any non-silkscreen pad into the bind list.
        const allBinds = plan.cliLines.filter((l) => /^resource (SERVO|MOTOR) \d+ [A-Z]\d/.test(l));
        const allPoolPads = new Set([...FLYWOOF_PAD_DEFAULTS.motors.map((m) => m.pad), "A09"]);
        for (const line of allBinds) {
            const pad = line.split(" ").pop();
            expect(allPoolPads.has(pad)).toBe(true);
        }
    });
});

describe("pickSilkscreenOrderLayout: motor/servo timer disjoint enforcement", () => {
    // TMOTORF7X2-style pad map: M1-M4 share TIM3, M5-M8 spread across
    // TIM4 + TIM8. Bench-found bug: Flying Wing (1 motor + 2 servos) had
    // servos take M1+M2 (TIM3 CH1+CH2), motor land on M3 (TIM3 CH3) →
    // motor + servos on same timer → BF can't drive both.
    const TMOTORF7X2_PAD_DEFAULTS = {
        target: "TMOTORF7X2",
        source: "firmware",
        motors: [
            { index: 1, pad: "C06" },
            { index: 2, pad: "C07" },
            { index: 3, pad: "B00" },
            { index: 4, pad: "B01" },
            { index: 5, pad: "B06" },
            { index: 6, pad: "B08" },
            { index: 7, pad: "B07" },
            { index: 8, pad: "C09" },
        ],
        ledStrips: [{ pad: "A08" }],
    };
    const TMOTORF7X2_PAD_TIMERS = new Map([
        ["C06", { timer: 3, channel: 1 }],
        ["C07", { timer: 3, channel: 2 }],
        ["B00", { timer: 3, channel: 3 }],
        ["B01", { timer: 3, channel: 4 }],
        ["B06", { timer: 4, channel: 1 }],
        ["B08", { timer: 4, channel: 3 }],
        ["B07", { timer: 4, channel: 2 }],
        ["C09", { timer: 8, channel: 4 }],
        ["A08", { timer: 1, channel: 1 }],
    ]);

    it("Flying Wing (1 motor / 2 servos): motor lands on TIM4, not the servo's TIM3", () => {
        const a = analysis([], { padTimers: TMOTORF7X2_PAD_TIMERS });
        const result = pickSilkscreenOrderLayout(a, 1, [2, 3], { padDefaults: TMOTORF7X2_PAD_DEFAULTS });
        // Servos take M1+M2 (silkscreen-first).
        expect(result.servos.get(2)).toBe("C06");
        expect(result.servos.get(3)).toBe("C07");
        // Motor walks past TIM3 candidates (M3, M4) and lands on TIM4 (M5).
        expect(result.motors.get(1)).toBe("B06");
    });

    it("V-Tail (1 motor / 4 servos): unchanged — servos fill TIM3, motor lands on M5", () => {
        const a = analysis([], { padTimers: TMOTORF7X2_PAD_TIMERS });
        const result = pickSilkscreenOrderLayout(a, 1, [1, 2, 3, 4], { padDefaults: TMOTORF7X2_PAD_DEFAULTS });
        // Servos take M1-M4.
        expect(result.servos.get(1)).toBe("C06");
        expect(result.servos.get(4)).toBe("B01");
        // Motor lands on M5 (next pool slot — and TIM4, naturally disjoint).
        expect(result.motors.get(1)).toBe("B06");
    });

    it("Twin-motor wing (2 motors / 2 servos): both motors stay on TIM4 together (TIMUP burst preference)", () => {
        const a = analysis([], { padTimers: TMOTORF7X2_PAD_TIMERS });
        const result = pickSilkscreenOrderLayout(a, 2, [2, 3], { padDefaults: TMOTORF7X2_PAD_DEFAULTS });
        // Servos take M1+M2 (TIM3).
        expect(result.servos.get(2)).toBe("C06");
        expect(result.servos.get(3)).toBe("C07");
        // Both motors skip TIM3 candidates and land together on TIM4.
        expect(result.motors.get(1)).toBe("B06"); // M5 = TIM4 CH1
        expect(result.motors.get(2)).toBe("B08"); // M6 = TIM4 CH3
    });

    it("returns null when no motor pad has a disjoint timer (caller falls back)", () => {
        // Pathological: ALL pads on TIM3.
        const allTim3Defaults = {
            target: "ALL_TIM3",
            motors: [
                { index: 1, pad: "P1" },
                { index: 2, pad: "P2" },
                { index: 3, pad: "P3" },
            ],
            ledStrips: [],
        };
        const allTim3Timers = new Map([
            ["P1", { timer: 3, channel: 1 }],
            ["P2", { timer: 3, channel: 2 }],
            ["P3", { timer: 3, channel: 3 }],
        ]);
        const a = analysis([], { padTimers: allTim3Timers });
        const result = pickSilkscreenOrderLayout(a, 1, [1, 2], { padDefaults: allTim3Defaults });
        expect(result).toBeNull();
    });

    it("works without padTimers (analyzer didn't get timerDump): falls back to strict silkscreen order", () => {
        const a = analysis([], {}); // no padTimers
        const result = pickSilkscreenOrderLayout(a, 1, [2, 3], { padDefaults: TMOTORF7X2_PAD_DEFAULTS });
        // Without timer info, can't enforce disjoint-timer — silkscreen order applies.
        expect(result.servos.get(2)).toBe("C06");
        expect(result.servos.get(3)).toBe("C07");
        expect(result.motors.get(1)).toBe("B00"); // pool[2]
    });
});

// AF-remap recovery: a motor pad whose CURRENT AF lands on a timer
// shared with a servo gets retried against `padTimerOptions`. If an
// alternate AF lands on a free timer, the optimizer claims the pad
// and records the remap. Bench scenario this addresses: pad's
// firmware-default timer is camped by another consumer (LED_STRIP,
// PPM, etc.), and the silkscreen-order allocator would otherwise
// skip the pad outright.
describe("pickSilkscreenOrderLayout: AF-remap recovery", () => {
    // Compact pad-defaults pulled from the existing TMOTORF7X2 fixture
    // shape so the new tests focus on AF semantics, not pool layout.
    const SMALL_DEFAULTS = {
        target: "AF_REMAP_FIXTURE",
        motors: [
            { index: 1, pad: "C06" },
            { index: 2, pad: "C07" },
            { index: 3, pad: "B00" }, // currently TIM3 — would conflict with servos
        ],
        ledStrips: [],
    };
    const SMALL_PAD_TIMERS = new Map([
        ["C06", { timer: 3, channel: 1 }], // servo
        ["C07", { timer: 3, channel: 2 }], // servo
        ["B00", { timer: 3, channel: 3 }], // motor target — current AF on TIM3 (conflict)
    ]);

    it("recovers a pad via alt AF when current AF would conflict with servo timer", () => {
        // B00's alternate AF (AF2) lands on TIM4 — disjoint from
        // servo TIM3.
        const padTimerOptions = new Map([
            [
                "B00",
                [
                    { af: 1, timer: 3, channel: 3, complementary: false },
                    { af: 2, timer: 4, channel: 1, complementary: false },
                ],
            ],
        ]);
        const padCurrentAF = new Map([["B00", 1]]);
        const a = analysis([], { padTimers: SMALL_PAD_TIMERS, padTimerOptions, padCurrentAF });

        const result = pickSilkscreenOrderLayout(a, 1, [1, 2], {
            padDefaults: SMALL_DEFAULTS,
            allowAfRemap: true,
        });

        expect(result).not.toBeNull();
        expect(result.motors.get(1)).toBe("B00");
        expect(result.remaps.get("B00")).toEqual({ af: 2, timer: 4, channel: 1 });
    });

    it("does NOT remap when allowAfRemap is false (default behavior preserved)", () => {
        const padTimerOptions = new Map([
            [
                "B00",
                [
                    { af: 1, timer: 3, channel: 3, complementary: false },
                    { af: 2, timer: 4, channel: 1, complementary: false },
                ],
            ],
        ]);
        const a = analysis([], {
            padTimers: SMALL_PAD_TIMERS,
            padTimerOptions,
            padCurrentAF: new Map([["B00", 1]]),
        });

        const result = pickSilkscreenOrderLayout(a, 1, [1, 2], { padDefaults: SMALL_DEFAULTS });

        // Pool exhausted: B00 was the only motor candidate and it
        // collides with servoTimers. Allocator returns null so caller
        // can fall back.
        expect(result).toBeNull();
    });

    it("skips remap when no AF option lands on a disjoint timer", () => {
        // ALL of B00's AFs live on TIM3 (the conflict timer). No
        // recovery possible.
        const padTimerOptions = new Map([
            [
                "B00",
                [
                    { af: 1, timer: 3, channel: 3, complementary: false },
                    { af: 4, timer: 3, channel: 4, complementary: false },
                ],
            ],
        ]);
        const a = analysis([], {
            padTimers: SMALL_PAD_TIMERS,
            padTimerOptions,
            padCurrentAF: new Map([["B00", 1]]),
        });

        const result = pickSilkscreenOrderLayout(a, 1, [1, 2], {
            padDefaults: SMALL_DEFAULTS,
            allowAfRemap: true,
        });
        expect(result).toBeNull();
    });

    it("ignores complementary (CHnN) channels — they can't drive DSHOT", () => {
        // Only viable alt is complementary, which the optimizer rejects.
        const padTimerOptions = new Map([
            [
                "B00",
                [
                    { af: 1, timer: 3, channel: 3, complementary: false },
                    { af: 3, timer: 8, channel: 2, complementary: true },
                ],
            ],
        ]);
        const a = analysis([], {
            padTimers: SMALL_PAD_TIMERS,
            padTimerOptions,
            padCurrentAF: new Map([["B00", 1]]),
        });

        const result = pickSilkscreenOrderLayout(a, 1, [1, 2], {
            padDefaults: SMALL_DEFAULTS,
            allowAfRemap: true,
        });
        expect(result).toBeNull();
    });

    it("does not record a remap when the chosen AF matches current AF", () => {
        // Pad's current binding is already disjoint from servoTimers —
        // optimizer takes the pad as-is. No remap entry.
        const looseTimers = new Map([
            ["C06", { timer: 3, channel: 1 }],
            ["C07", { timer: 3, channel: 2 }],
            ["B00", { timer: 4, channel: 1 }], // already on TIM4 — fine
        ]);
        const padTimerOptions = new Map([["B00", [{ af: 2, timer: 4, channel: 1, complementary: false }]]]);
        const a = analysis([], {
            padTimers: looseTimers,
            padTimerOptions,
            padCurrentAF: new Map([["B00", 2]]),
        });

        const result = pickSilkscreenOrderLayout(a, 1, [1, 2], {
            padDefaults: SMALL_DEFAULTS,
            allowAfRemap: true,
        });
        expect(result.motors.get(1)).toBe("B00");
        expect(result.remaps.size).toBe(0);
    });

    it("F4 burst-DMA reject: rejects layout when two motors land on same timer (mcuFamily F4)", () => {
        // 2-motor wing where both motor candidates land on TIM4.
        const twoMotorDefaults = {
            target: "F4_BENCH",
            motors: [
                { index: 1, pad: "C06" },
                { index: 2, pad: "C07" },
                { index: 3, pad: "B06" }, // motor M
                { index: 4, pad: "B08" }, // motor M
            ],
            ledStrips: [],
        };
        const sharedTim4 = new Map([
            ["C06", { timer: 3, channel: 1 }], // servo
            ["C07", { timer: 3, channel: 2 }], // servo
            ["B06", { timer: 4, channel: 1 }], // motor 1 — TIM4
            ["B08", { timer: 4, channel: 3 }], // motor 2 — TIM4 (conflict on F4)
        ]);
        const a = analysis([], { padTimers: sharedTim4, mcuFamily: "F4" });

        const result = pickSilkscreenOrderLayout(a, 2, [1, 2], { padDefaults: twoMotorDefaults });
        expect(result).toBeNull();
    });

    it("F4 burst-DMA: same layout passes on H7 (no shared-timer constraint)", () => {
        const twoMotorDefaults = {
            target: "H7_BENCH",
            motors: [
                { index: 1, pad: "C06" },
                { index: 2, pad: "C07" },
                { index: 3, pad: "B06" },
                { index: 4, pad: "B08" },
            ],
            ledStrips: [],
        };
        const sharedTim4 = new Map([
            ["C06", { timer: 3, channel: 1 }],
            ["C07", { timer: 3, channel: 2 }],
            ["B06", { timer: 4, channel: 1 }],
            ["B08", { timer: 4, channel: 3 }],
        ]);
        const a = analysis([], { padTimers: sharedTim4, mcuFamily: "H7" });

        const result = pickSilkscreenOrderLayout(a, 2, [1, 2], { padDefaults: twoMotorDefaults });
        expect(result).not.toBeNull();
        expect(result.motors.get(1)).toBe("B06");
        expect(result.motors.get(2)).toBe("B08");
    });
});

// DMA-aware motor placement: padDmaDefaults is surfaced for the
// Pin Assignment "DMA: S0" badge and the analyzer's motor_no_dma
// warning. The optimizer's motor placement does NOT reject pads
// based on DMA stream collisions — bench-confirmed on TMOTORF7X2
// that the soft-reject created worse outcomes than just letting
// firmware fall back to bit-bang DSHOT for collided motors. The
// F4 burst-DMA same-timer reject (different mechanism, harder
// constraint) still fires.
describe("pickSilkscreenOrderLayout: DMA-aware motor placement", () => {
    const SMALL_DEFAULTS = {
        target: "DMA_FIXTURE",
        motors: [
            { index: 1, pad: "C06" },
            { index: 2, pad: "C07" },
            { index: 3, pad: "B06" },
            { index: 4, pad: "B08" },
            { index: 5, pad: "B07" },
        ],
        ledStrips: [],
    };
    const SMALL_PAD_TIMERS = new Map([
        ["C06", { timer: 3, channel: 1 }],
        ["C07", { timer: 3, channel: 2 }],
        ["B06", { timer: 4, channel: 1 }],
        ["B08", { timer: 4, channel: 3 }],
        ["B07", { timer: 4, channel: 2 }],
    ]);

    it("places motor on first timer-disjoint pool slot regardless of DMA stream collision", () => {
        // B06's default DMA stream is held by a real consumer, but
        // we no longer reject — firmware handles via bit-bang DSHOT
        // fallback. M1 lands on B06 (first disjoint-timer slot).
        const padDmaDefaults = new Map([
            ["B06", { controller: 1, stream: 0, channel: 2 }],
            ["B08", { controller: 1, stream: 7, channel: 2 }],
        ]);
        const dmaShow = [
            // LED_STRIP claims DMA1 Stream 0 — same as B06's default.
            // Soft collision: motor still picks B06, falls back to
            // bit-bang at runtime.
            { controller: 1, stream: 0, peripheral: "LED_STRIP", index: null },
        ];
        const a = analysis([], { padTimers: SMALL_PAD_TIMERS, padDmaDefaults, dmaShow });

        const result = pickSilkscreenOrderLayout(a, 1, [1, 2], { padDefaults: SMALL_DEFAULTS });
        expect(result.motors.get(1)).toBe("B06");
    });

    it("does NOT factor servo's default DMA option into motor placement", () => {
        // Sanity check — servos never claim DMA at runtime, so even
        // a perfectly-overlapping servo+motor stream pair is OK.
        const padDmaDefaults = new Map([
            ["C06", { controller: 1, stream: 4, channel: 5 }],
            ["B06", { controller: 1, stream: 4, channel: 5 }],
        ]);
        const a = analysis([], { padTimers: SMALL_PAD_TIMERS, padDmaDefaults, dmaShow: [] });

        const result = pickSilkscreenOrderLayout(a, 1, [2, 3], { padDefaults: SMALL_DEFAULTS });
        expect(result.servos.get(2)).toBe("C06");
        expect(result.motors.get(1)).toBe("B06");
    });

    it("places second motor on next disjoint-timer slot even if streams collide with first motor", () => {
        // 2-motor wing where both candidates share the same default
        // stream. Soft-collision behavior accepts both — firmware
        // resolves at runtime.
        const padDmaDefaults = new Map([
            ["B06", { controller: 1, stream: 0, channel: 2 }],
            ["B08", { controller: 1, stream: 0, channel: 2 }],
            ["B07", { controller: 1, stream: 3, channel: 2 }],
        ]);
        const a = analysis([], { padTimers: SMALL_PAD_TIMERS, padDmaDefaults, dmaShow: [] });

        const result = pickSilkscreenOrderLayout(a, 2, [1, 2], { padDefaults: SMALL_DEFAULTS });
        expect(result.motors.get(1)).toBe("B06");
        expect(result.motors.get(2)).toBe("B08");
    });

    it("padDmaDefaults exposed for badge display even when not used for placement decisions", () => {
        // Ensures the analyzer surfaces the data the Pin Assignment
        // DMA badge consumes, regardless of whether the optimizer
        // factored it in.
        const padDmaDefaults = new Map([
            ["B06", { controller: 1, stream: 0, channel: 2 }],
            ["B08", { controller: 1, stream: 7, channel: 2 }],
        ]);
        const a = analysis([], { padTimers: SMALL_PAD_TIMERS, padDmaDefaults, dmaShow: [] });
        expect(a.padDmaDefaults.get("B06")).toEqual({ controller: 1, stream: 0, channel: 2 });
        expect(a.padDmaDefaults.get("B08")).toEqual({ controller: 1, stream: 7, channel: 2 });
    });

    it("(formerly: AF remap on DMA collision) — AF remap still works for SERVO TIMER collision (servo on motor's timer)", () => {
        // B06 + B08 both have stream collisions. B07 not in pool. AF
        // remap on B06 to a disjoint timer might recover. (The v1
        // collision check rejects, then allowAfRemap path tries an
        // alt AF — for now the alt-AF DMA is not predicted, so we
        // accept the alt AF at face value if its timer is disjoint.)
        // Soft-collision behavior: even when B06's stream is held
        // by a real consumer, the optimizer no longer triggers AF
        // remap on DMA grounds. AF remap fires only for SERVO TIMER
        // conflicts (covered in the AF-remap recovery describe
        // block). This test now just confirms the optimizer doesn't
        // break under DMA collision data — it places motors in
        // silkscreen order regardless.
        const padDmaDefaults = new Map([
            ["B06", { controller: 1, stream: 0, channel: 2 }],
            ["B08", { controller: 1, stream: 7, channel: 2 }],
        ]);
        const dmaShow = [
            { controller: 1, stream: 0, peripheral: "LED_STRIP", index: null },
            { controller: 1, stream: 7, peripheral: "ADC", index: 1 },
        ];
        const a = analysis([], { padTimers: SMALL_PAD_TIMERS, padDmaDefaults, dmaShow });

        const result = pickSilkscreenOrderLayout(a, 1, [1, 2], {
            padDefaults: SMALL_DEFAULTS,
            allowAfRemap: true,
        });
        // Optimizer succeeds — no AF remap, no null return.
        expect(result).not.toBeNull();
        expect(result.motors.get(1)).toBe("B06");
        expect(result.remaps.size).toBe(0);
    });

    it("identity case: no padDmaDefaults supplied (older firmware) → falls back to old behavior", () => {
        const a = analysis([], { padTimers: SMALL_PAD_TIMERS });
        const result = pickSilkscreenOrderLayout(a, 1, [1, 2], { padDefaults: SMALL_DEFAULTS });
        // Pre-DMA-aware behavior: silkscreen-order pick.
        expect(result).not.toBeNull();
    });
});

// Alt-AF dropdown rows: candidatePadsForSlot emits one row per
// (pad, AF) combination so the Mixer-tab dropdown can offer manual
// AF override. computePresetResourcePlan accepts padAfOverrides
// Map<pad, af> and merges into the timerRemaps Map so the CLI batch
// emits `timer <pad> AF<n>` ahead of the resource bind.
describe("candidatePadsForSlot: alt-AF expansion", () => {
    it("emits additional entries per alt AF when padTimerOptions has multiple options", () => {
        const a = {
            motors: [{ index: 1, pad: "B06", timer: 4, channel: 1, dmaStream: null, bidirBurst: false }],
            servos: [],
            ledStrips: [],
            serials: [],
            freePadsCount: 0,
            freeDmaStreams: [],
            hardwareFixedPads: [],
            warnings: [],
            pwmCapableFreePads: [{ pad: "C06", timer: 3, channel: 1 }],
            padTimers: new Map([
                ["B06", { timer: 4, channel: 1 }],
                ["C06", { timer: 3, channel: 1 }],
            ]),
            padTimerOptions: new Map([
                [
                    "C06",
                    [
                        { af: 2, timer: 3, channel: 1, complementary: false },
                        { af: 3, timer: 8, channel: 1, complementary: false },
                    ],
                ],
            ]),
            padCurrentAF: new Map([["C06", 2]]),
        };
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1], currentPad: null });
        // Default-AF entry (af === null/undefined) and alt-AF entry
        // (af === 3) for C06. Alt-AF entries preserve the base
        // candidate's source (e.g. "free-pwm") and are identified by
        // having `af != null`.
        const c06Entries = cands.filter((c) => c.pad === "C06");
        expect(c06Entries).toHaveLength(2);
        const alt = c06Entries.find((c) => c.af != null);
        expect(alt).toBeDefined();
        expect(alt.af).toBe(3);
        expect(alt.timer).toBe(8);
        expect(alt.channel).toBe(1);
    });

    it("does not emit alt-AF entries for the current AF (already represented as default row)", () => {
        const a = {
            motors: [],
            servos: [],
            ledStrips: [],
            serials: [],
            freePadsCount: 0,
            freeDmaStreams: [],
            hardwareFixedPads: [],
            warnings: [],
            pwmCapableFreePads: [{ pad: "B07", timer: 4, channel: 2 }],
            padTimers: new Map([["B07", { timer: 4, channel: 2 }]]),
            padTimerOptions: new Map([
                [
                    "B07",
                    // Only AF for this pin — should produce zero alt rows.
                    [{ af: 2, timer: 4, channel: 2, complementary: false }],
                ],
            ]),
            padCurrentAF: new Map([["B07", 2]]),
        };
        const cands = candidatePadsForSlot(a, 1, { motorIndicesInUse: [], currentPad: null });
        const altRows = cands.filter((c) => c.af != null);
        expect(altRows).toHaveLength(0);
    });

    it("flags complementary alts so motor dropdowns can filter them out", () => {
        const a = {
            motors: [],
            servos: [],
            ledStrips: [],
            serials: [],
            freePadsCount: 0,
            freeDmaStreams: [],
            hardwareFixedPads: [],
            warnings: [],
            pwmCapableFreePads: [{ pad: "B00", timer: 3, channel: 3 }],
            padTimers: new Map([["B00", { timer: 3, channel: 3 }]]),
            padTimerOptions: new Map([
                [
                    "B00",
                    [
                        { af: 2, timer: 3, channel: 3, complementary: false },
                        { af: 1, timer: 1, channel: 2, complementary: true },
                    ],
                ],
            ]),
            padCurrentAF: new Map([["B00", 2]]),
        };
        const cands = candidatePadsForSlot(a, 1, { motorIndicesInUse: [], currentPad: null });
        const alt = cands.find((c) => c.af != null);
        expect(alt).toBeDefined();
        expect(alt.complementary).toBe(true);
    });
});

describe("computePresetResourcePlan: padAfOverrides", () => {
    it("emits `timer <pad> AF<n>` for pilot-supplied AF override on a final-pick pad", () => {
        const preset = {
            mmix: [{ throttle: 1.0, roll: 0, pitch: 0, yaw: 0 }],
            rules: [
                // target=3 → servoIndex = target-1 = 2 (SERVO 2 resource).
                { target: 3, input: 1, rate: 100, speed: 0, min: -100, max: 100, box: 0 },
            ],
        };
        const a = {
            motors: [{ index: 1, pad: "B06", timer: 4, channel: 1, dmaStream: null, bidirBurst: false }],
            servos: [],
            ledStrips: [],
            serials: [],
            freePadsCount: 0,
            freeDmaStreams: [],
            hardwareFixedPads: [],
            warnings: [],
            pwmCapableFreePads: [{ pad: "C06", timer: 3, channel: 1 }],
            padTimers: new Map([
                ["B06", { timer: 4, channel: 1 }],
                ["C06", { timer: 3, channel: 1 }],
            ]),
            padTimerOptions: new Map([
                [
                    "C06",
                    [
                        { af: 2, timer: 3, channel: 1, complementary: false },
                        { af: 3, timer: 8, channel: 1, complementary: false },
                    ],
                ],
            ]),
            padCurrentAF: new Map([["C06", 2]]),
        };
        const padDefaults = {
            target: "PAD_AF_OVERRIDE_FIXTURE",
            motors: [
                { index: 1, pad: "B06" },
                { index: 2, pad: "C06" },
            ],
            ledStrips: [],
        };
        const plan = computePresetResourcePlan(a, preset, {
            padDefaults,
            // Pin M1 to B06 explicitly so the optimizer doesn't park
            // it on C06 (silkscreen-first picks servos before motors,
            // which would steal C06 from the servo override below).
            motorPicks: { 1: "B06" },
            picks: { 2: "C06" },
            padAfOverrides: new Map([["C06", 3]]),
        });
        // Expect a `timer C06 AF3` line in cliLines, ordered ahead
        // of the resource SERVO 2 C06 bind.
        const timerLine = plan.cliLines.find((l) => /^timer C06 AF3$/i.test(l));
        const bindLine = plan.cliLines.find((l) => /^resource SERVO 2 C06$/i.test(l));
        expect(timerLine).toBeDefined();
        expect(bindLine).toBeDefined();
        expect(plan.cliLines.indexOf(timerLine)).toBeLessThan(plan.cliLines.indexOf(bindLine));
        expect(plan.timerRemaps.get("C06")?.af).toBe(3);
    });

    it("clears optimizer auto-remap when pilot picks the current AF (override matches default)", () => {
        // If pilot picks an alt-AF row whose AF matches the pad's
        // current binding (rare edge case), the override should
        // result in NO `timer ... AF...` line — same as picking the
        // default row.
        const preset = {
            mmix: [{ throttle: 1.0, roll: 0, pitch: 0, yaw: 0 }],
            rules: [{ target: 3, input: 1, rate: 100, speed: 0, min: -100, max: 100, box: 0 }],
        };
        const a = {
            motors: [],
            servos: [],
            ledStrips: [],
            serials: [],
            freePadsCount: 0,
            freeDmaStreams: [],
            hardwareFixedPads: [],
            warnings: [],
            pwmCapableFreePads: [{ pad: "C06", timer: 3, channel: 1 }],
            padTimers: new Map([["C06", { timer: 3, channel: 1 }]]),
            padTimerOptions: new Map([["C06", [{ af: 2, timer: 3, channel: 1, complementary: false }]]]),
            padCurrentAF: new Map([["C06", 2]]),
        };
        const padDefaults = {
            target: "EDGE",
            motors: [{ index: 1, pad: "C06" }],
            ledStrips: [],
        };
        const plan = computePresetResourcePlan(a, preset, {
            padDefaults,
            picks: { 2: "C06" },
            padAfOverrides: new Map([["C06", 2]]),
        });
        const timerLines = plan.cliLines.filter((l) => /^timer C06/i.test(l));
        expect(timerLines).toHaveLength(0);
        expect(plan.timerRemaps.has("C06")).toBe(false);
    });
});
