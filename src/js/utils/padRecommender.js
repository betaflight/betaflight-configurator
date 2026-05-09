// Phase 2.5 wing resource helpers. Two exports:
//
//   - candidatePadsForSlot(analysis, servoIndex, options)
//     Pure: ranks candidate pads for binding a single SERVO N. Feeds
//     the Mixer-tab Pin Assignment dropdowns.
//
//   - computePresetResourcePlan(analysis, preset, options)
//     Pure: returns the exact CLI batch (MOTOR/SERVO releases + binds)
//     to make the FC's resource claims match a preset's actual
//     usedMotorIndices / usedServoIndices. Used by WingTuningTab's
//     preset-apply and the Pin Assignment panel's direct-apply flow.
//
// Predecessor `computeWingRemap` (servoCount-based auto-picker) deleted
// 2026-04-19 after Phase 2.5 took over. See the plan file's Phase 2.5
// section for why that model was replaced.

import { predictDmaConflict } from "./dmaTopology.js";

// ─── Phase 2.5: per-slot candidate helper ─────────────────────────
//
// Ranking (motor-release ahead of free-PWM so the silkscreen-label
// expectation holds — picking SERVO 1 lands on the pad silkscreened
// MOTOR 2 / SERVO N lands on MOTOR (motorCount + N), which matches
// what most quad-FC users intuit when wiring an elevon to "M3"):
//   1. `currentPad` (zero-churn) — if the slot is already bound and the
//      existing pad is still safe.
//   2. Motor-release candidate — pad currently backs a MOTOR not in use
//      by the mixer; iterated in motor-index order so SERVO 1 → MOTOR 2's
//      pad on a 1-motor wing, etc. `requiresRelease` carries the CLI line
//      to free the motor before binding.
//   3. Free PWM pad, no timer conflict with in-use motors.
//   4. Free PWM pad sharing a timer with an in-use motor
//      (usable but flagged with sharesTimerWithMotor=true).
//   5. LED_STRIP pad (only if `allowLedStrip`).
//   6. UART TX/RX pad (only if its UART index is in `allowUartRelease`).
//
// Collision defense: any pad currently claimed by something we aren't
// releasing in this batch (another SERVO N, a hardware-fixed peripheral,
// a non-opted-in UART/LED_STRIP, or an in-use motor) is filtered out.
/**
 * @param {object} analysis - analyzer output (`analyzeResources`).
 * @param {number} servoIndex - 1-based SERVO N (e.g. 2 for SERVO 2).
 * @param {object} [options]
 * @param {number[]} [options.motorIndicesInUse] - motor indices backing
 *   live outputs in the target mixer (their pads are off-limits).
 *   Defaults to every motor index currently in analysis.motors.
 * @param {string|null} [options.currentPad] - pad this SERVO N is already
 *   bound to, if any. Gets a zero-churn bias.
 * @param {boolean} [options.allowLedStrip=false] - include LED_STRIP pad
 *   as a candidate (requires release).
 * @param {number[]} [options.allowUartRelease=[]] - UART indices whose
 *   TX/RX pads should be candidates (each requires release of that UART).
 * @returns {Array<{pad: string, timer: number|null, channel: number|null,
 *   dmaStream: object|null, source: string,
 *   requiresRelease: string[], sharesTimerWithMotor: boolean}>}
 */
export function candidatePadsForSlot(analysis, servoIndex, options = {}) {
    if (!analysis || typeof servoIndex !== "number") return [];

    const motorIndicesInUse = new Set(
        Array.isArray(options.motorIndicesInUse)
            ? options.motorIndicesInUse
            : (analysis.motors ?? []).map((m) => m.index),
    );
    const currentPad = options.currentPad ?? null;
    const allowLedStrip = options.allowLedStrip === true;
    const allowUartRelease = Array.isArray(options.allowUartRelease) ? options.allowUartRelease : [];
    // motorRebinds: motorIndex → newPad. Lets the caller signal that an
    // in-use motor is moving to a different pad as part of the same plan
    // (its CURRENT pad becomes releasable; its NEW pad becomes claimed).
    // Without this, a SERVO override targeting the moved-from pad would
    // be rejected as "not a valid candidate" and the plan would silently
    // fall back to a different pad. Bench-observed 2026-04-22 on TMOTORF7
    // when staging MOTOR 1 → A08 + SERVO 1 → C06 in the same Pin
    // Assignment edit.
    const motorRebinds = options.motorRebinds instanceof Map ? options.motorRebinds : null;

    // Partition motors three ways:
    //   - in-use & static:   pad off-limits (inUseMotorPads)
    //   - in-use & moving:   old pad releasable as motor-release (real
    //                        cost, label "releases MOTOR N"); new pad
    //                        claimed
    //   - not in MSP2 use:   firmware-bound but dormant. Emit as a
    //                        free-pwm candidate (label "free") with
    //                        a requiresRelease line so save still
    //                        clears the firmware-level resource entry.
    //                        Avoids the foot-gun where the dropdown
    //                        suggests "releases MOTOR N" for a motor
    //                        that isn't even active.
    const inUseMotorPads = new Set();
    const activeReleasableMotors = [];
    const dormantMotors = [];
    for (const m of analysis.motors ?? []) {
        if (motorIndicesInUse.has(m.index)) {
            const rebindPad = motorRebinds?.get(m.index) ?? null;
            if (rebindPad && rebindPad !== m.pad) {
                activeReleasableMotors.push(m);
                inUseMotorPads.add(rebindPad);
            } else {
                inUseMotorPads.add(m.pad);
            }
        } else {
            dormantMotors.push(m);
        }
    }

    // Timers used by in-use motors — for sharesTimerWithMotor flag.
    const motorTimers = new Set(
        (analysis.motors ?? [])
            .filter((m) => motorIndicesInUse.has(m.index))
            .map((m) => m.timer)
            .filter((t) => t !== null && t !== undefined),
    );

    // Claimed-pad set: everything off-limits without a release step.
    const claimedPads = new Set();
    for (const f of analysis.hardwareFixedPads ?? []) claimedPads.add(f.pad);
    for (const s of analysis.servos ?? []) {
        if (s.index !== servoIndex) claimedPads.add(s.pad);
    }
    for (const pad of inUseMotorPads) claimedPads.add(pad);
    if (!allowLedStrip) {
        for (const ls of analysis.ledStrips ?? []) claimedPads.add(ls.pad);
    }
    for (const srl of analysis.serials ?? []) {
        if (allowUartRelease.includes(srl.index)) continue;
        if (srl.txPad) claimedPads.add(srl.txPad);
        if (srl.rxPad) claimedPads.add(srl.rxPad);
    }

    const results = [];
    const seen = new Set();
    // Dedup key includes AF so the same pad can appear once per
    // viable alternate function. Default-AF entries use the pad
    // alone (af === null). Alt-AF entries from the post-pass below
    // key by `pad:af`, letting `B00 — TIM3 CH3` (default) coexist
    // with `B00 — TIM1 CH2N (alt AF1)` in the dropdown.
    const keyFor = (pad, af) => (af == null ? pad : `${pad}:${af}`);
    const push = (entry) => {
        const k = keyFor(entry.pad, entry.af ?? null);
        if (seen.has(k)) return;
        seen.add(k);
        results.push(entry);
    };

    // 1. Existing binding — zero-churn.
    if (currentPad && !claimedPads.has(currentPad)) {
        const existing = (analysis.servos ?? []).find((s) => s.index === servoIndex);
        const timer = existing?.timer ?? null;
        push({
            pad: currentPad,
            timer,
            channel: existing?.channel ?? null,
            dmaStream: null,
            source: "existing",
            requiresRelease: [],
            sharesTimerWithMotor: timer !== null && motorTimers.has(timer),
        });
    }

    // 2. Motor-release candidates — preferred so silkscreen labels stay
    //    intuitive (S1 → MOTOR 2 pad → silkscreen "M2" on the board).
    //    Iterated in motor-index order from the analyzer's sorted list.
    //
    //    Timer/channel fallback: on some targets (observed on TMOTORF7X2)
    //    the `timer show` output doesn't surface entries for currently-
    //    bound but not-in-use motors, so `m.timer` / `m.channel` arrive
    //    null. Falling back to `analysis.padTimers` (the full timer_dump)
    //    keeps the dropdown's "— TIMn CHn" suffix present regardless of
    //    which CLI view gave us the pad.
    const padTimers = analysis.padTimers instanceof Map ? analysis.padTimers : null;
    for (const m of activeReleasableMotors) {
        if (claimedPads.has(m.pad)) continue;
        const fallback = padTimers?.get(m.pad);
        push({
            pad: m.pad,
            timer: m.timer ?? fallback?.timer ?? null,
            channel: m.channel ?? fallback?.channel ?? null,
            dmaStream: m.dmaStream ?? null,
            source: "motor-release",
            requiresRelease: [`resource MOTOR ${m.index} NONE`],
            sharesTimerWithMotor: m.timer !== null && m.timer !== undefined && motorTimers.has(m.timer),
        });
    }

    // 2.5. Dormant-motor pads — pads firmware-bound to motors that aren't
    //      active in the MSP2 motor list. Functionally free; emit as
    //      free-pwm with a release line so save clears the firmware-level
    //      binding. Label reads "free" instead of "releases MOTOR N"
    //      since there's no real motor to lose.
    for (const m of dormantMotors) {
        if (claimedPads.has(m.pad)) continue;
        const fallback = padTimers?.get(m.pad);
        push({
            pad: m.pad,
            timer: m.timer ?? fallback?.timer ?? null,
            channel: m.channel ?? fallback?.channel ?? null,
            dmaStream: m.dmaStream ?? null,
            source: "free-pwm",
            requiresRelease: [`resource MOTOR ${m.index} NONE`],
            sharesTimerWithMotor: m.timer !== null && m.timer !== undefined && motorTimers.has(m.timer),
        });
    }

    // 3 + 4. Free PWM pads — partition by timer conflict.
    const freePwm = Array.isArray(analysis.pwmCapableFreePads) ? analysis.pwmCapableFreePads : [];
    const freeNonConflict = [];
    const freeConflict = [];
    for (const p of freePwm) {
        if (claimedPads.has(p.pad)) continue;
        if (p.timer !== null && p.timer !== undefined && motorTimers.has(p.timer)) {
            freeConflict.push(p);
        } else {
            freeNonConflict.push(p);
        }
    }
    for (const p of freeNonConflict) {
        push({
            pad: p.pad,
            timer: p.timer ?? null,
            channel: p.channel ?? null,
            dmaStream: null,
            source: "free-pwm",
            requiresRelease: [],
            sharesTimerWithMotor: false,
        });
    }
    for (const p of freeConflict) {
        push({
            pad: p.pad,
            timer: p.timer ?? null,
            channel: p.channel ?? null,
            dmaStream: null,
            source: "free-pwm",
            requiresRelease: [],
            sharesTimerWithMotor: true,
        });
    }

    // 5. LED_STRIP pad (opt-in). Same padTimers fallback as the motor-
    // release tier — `timer show` may not emit a CH line for LED_STRIP
    // (it's in WS2812 DMA mode, not PWM), but the pad is still in the
    // timer_dump and we want the dropdown to label it with TIMn.
    if (allowLedStrip) {
        for (const ls of analysis.ledStrips ?? []) {
            if (claimedPads.has(ls.pad)) continue;
            const fallback = padTimers?.get(ls.pad);
            push({
                pad: ls.pad,
                timer: ls.timer ?? fallback?.timer ?? null,
                channel: ls.channel ?? fallback?.channel ?? null,
                dmaStream: ls.dmaStream ?? null,
                source: "led-strip",
                requiresRelease: ["resource LED_STRIP 1 NONE"],
                sharesTimerWithMotor: ls.timer !== null && ls.timer !== undefined && motorTimers.has(ls.timer),
            });
        }
    }

    // 6. UART TX/RX pads (opt-in per UART).
    for (const uartIndex of allowUartRelease) {
        const spare = (analysis.spareUarts ?? []).find((u) => u.index === uartIndex);
        if (!spare) continue;
        if (spare.txPad && !claimedPads.has(spare.txPad)) {
            push({
                pad: spare.txPad,
                timer: null,
                channel: null,
                dmaStream: null,
                source: "uart-release",
                requiresRelease: [`resource SERIAL_TX ${uartIndex} NONE`],
                sharesTimerWithMotor: false,
            });
        }
        if (spare.rxPad && !claimedPads.has(spare.rxPad)) {
            push({
                pad: spare.rxPad,
                timer: null,
                channel: null,
                dmaStream: null,
                source: "uart-release",
                requiresRelease: [`resource SERIAL_RX ${uartIndex} NONE`],
                sharesTimerWithMotor: false,
            });
        }
    }

    // 7. Alt-AF expansion. For each pad already in results, emit
    // additional entries for every alternate AF the firmware reports
    // (via `analysis.padTimerOptions`). Lets the pilot manually park
    // a pad on a different (timer, channel) — useful when the
    // optimizer's automatic AF remap doesn't fire (e.g. tight DMA
    // boards) but the pilot knows a specific alt AF would help.
    // Each alt entry inherits the base pad's source/requiresRelease,
    // but carries the alt AF's (timer, channel, af) so the caller
    // can emit `timer <pad> AF<n>` ahead of the resource bind.
    const padTimerOptions = analysis.padTimerOptions instanceof Map ? analysis.padTimerOptions : null;
    const padCurrentAF = analysis.padCurrentAF instanceof Map ? analysis.padCurrentAF : null;
    if (padTimerOptions) {
        const altEntries = [];
        for (const base of results) {
            const opts = padTimerOptions.get(base.pad);
            if (!Array.isArray(opts) || opts.length === 0) continue;
            const currentAf = padCurrentAF?.get(base.pad);
            for (const opt of opts) {
                if (opt.af === currentAf) continue;
                altEntries.push({
                    pad: base.pad,
                    timer: opt.timer,
                    channel: opt.channel,
                    af: opt.af,
                    complementary: !!opt.complementary,
                    dmaStream: null,
                    source: "alt-af",
                    // Alt-AF requires a `timer <pad> AF <n>` CLI step in
                    // addition to whatever the base entry already needed.
                    // The caller (UI) must run requiresRelease[] commands
                    // before the resource bind so the FC re-routes the
                    // pad to the chosen alternate timer/channel.
                    requiresRelease: [...(base.requiresRelease ?? []), `timer ${base.pad} AF ${opt.af}`],
                    sharesTimerWithMotor: opt.timer !== null && motorTimers.has(opt.timer),
                });
            }
        }
        for (const e of altEntries) push(e);
    }

    return results;
}

// ─── Joint motor+servo pad optimizer ─────────────────────────────
//
// Picks the best assignment of (motorCount) motor pads + (servoCount)
// servo pads from the silkscreen pool — padDefaults.motors (M1..M8)
// plus padDefaults.ledStrips when allowLedStrip is true. Replaces the
// old silkscreen-first heuristic (M1 always on silkscreen M1 → causes
// TIM3 overclaim on quad boards like FLYWOOF405NANO) with a joint
// search over the entire pool.
//
// Scoring (high-to-low priority):
//   1. Servos placed on motor-disjoint timers (+100 each). Servos on
//      motor-shared timers are a hard conflict — BF can't run DSHOT
//      and 50Hz servo PWM on the same timer, so these layouts drop.
//   2. Silkscreen convention preserved (+10 per motor on its natural
//      silkscreen index). Keeps the default case visually clean while
//      letting the scorer override it when needed.
//   3. Low average motor silkscreen index (-0.01 * avg). Pure
//      tiebreaker so identical-score layouts resolve deterministically.
//
// Returns null when:
//   - padDefaults or analysis.padTimers missing (analyzer wasn't given
//     timerDump, or cached-snapshot source doesn't have motor defaults)
//   - Pool too small for motorCount + servoCount
//   - No motor placement leaves enough timer-disjoint pads for servos
// Callers fall back to the silkscreen-first logic in those cases.
function enumerateCombinations(arr, k) {
    const result = [];
    if (k === 0) return [[]];
    if (k > arr.length) return result;
    const indices = Array.from({ length: k }, (_, i) => i);
    // Classic increment-rightmost-expandable pattern. Small n only —
    // pool is <=9 on every target, motorCount <=2 on wings → <=36 combos.
    while (true) {
        result.push(indices.map((i) => arr[i]));
        let i = k - 1;
        while (i >= 0 && indices[i] === arr.length - k + i) i--;
        if (i < 0) break;
        indices[i]++;
        for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
    }
    return result;
}

// ─── Deterministic silkscreen-order layout ────────────────────────
//
// "Servo bank first" allocator used by `computePresetResourcePlan`.
// Servos take the lowest silkscreen-MOTOR pad indices, motors take
// the next ones up. Matches the wizard's final state (servos on
// silkscreen 1..N, motors on N+1..N+M) and is what most wing pilots
// expect: servos use the wider timer block, motors fall on whatever's
// left.
//
// Replaces the joint optimizer (`pickOptimalPadLayout`) for the
// preset path because the optimizer's scoring spreads motors across
// timers in ways that surprise users — bench-validated on TMOTORF7
// where the optimizer was placing M2 on C09 (different timer) instead
// of B08 (same timer as M1, ideal for bidir DSHOT TIMUP burst).
//
// Returns the same shape as `pickOptimalPadLayout` so it's a drop-in
// replacement at the call site.
//
// @param {boolean} [options.allowAfRemap=false] - when true and
//   `analysis.padTimerOptions` is present, motors that would
//   otherwise be skipped (timer shared with a servo) are recovered
//   by picking an alternate AF for the pad whose timer doesn't
//   collide. The chosen remap lands in the returned `remaps` Map and
//   the caller emits `timer <pin> AF<n>` CLI lines for it. Bench
//   case (MicoAir743): pad's current AF lands on TIM4 (LED_STRIP-
//   adjacent) but its alt AF lands on TIM3 — without remap, optimizer
//   skips the pad and may run out; with remap, pad is recovered.
//
// @returns {{motors: Map<number,string>, servos: Map<number,string>, score: number, remaps: Map<string,{af,timer,channel}>} | null}
export function pickSilkscreenOrderLayout(analysis, motorCount, usedServoIndices, options = {}) {
    const padDefaults = options.padDefaults;
    if (!padDefaults || !Array.isArray(padDefaults.motors) || padDefaults.motors.length === 0) return null;
    const allowLedStrip = options.allowLedStrip === true;

    // Pool: silkscreen-MOTOR pads in silkscreen order, then LED if allowed.
    const pool = [...padDefaults.motors].sort((a, b) => a.index - b.index).map((m) => m.pad);
    if (allowLedStrip && Array.isArray(padDefaults.ledStrips)) {
        for (const ls of padDefaults.ledStrips) {
            if (ls?.pad) pool.push(ls.pad);
        }
    }

    const servoCount = usedServoIndices.length;
    if (pool.length < servoCount + motorCount) return null;

    const padTimers = analysis?.padTimers instanceof Map ? analysis.padTimers : null;
    const padTimerOptions = analysis?.padTimerOptions instanceof Map ? analysis.padTimerOptions : null;
    const padCurrentAF = analysis?.padCurrentAF instanceof Map ? analysis.padCurrentAF : null;
    const padDmaDefaults = analysis?.padDmaDefaults instanceof Map ? analysis.padDmaDefaults : null;
    const allowAfRemap = options.allowAfRemap === true && padTimerOptions != null;

    // Streams claimed by non-motor non-servo consumers, derived from
    // `dma show`. Motor candidates that would land on one of these
    // streams will lose at firmware-init (the existing consumer wins,
    // motor falls back to bit-bang). Servos don't claim DMA at runtime
    // — their default-option overlap with a motor's stream is fine, so
    // we explicitly DON'T include MOTOR/SERVO peripherals here. Built
    // once per layout call, used by the motor placement loop and AF-
    // remap fallback below.
    const claimedStreams = new Set();
    if (Array.isArray(analysis?.dmaShow)) {
        for (const e of analysis.dmaShow) {
            if (!e || !e.peripheral) continue;
            if (e.peripheral === "FREE" || e.peripheral === "MOTOR" || e.peripheral === "SERVO") continue;
            // TIMUP burst entries are timer-side bookkeeping, not
            // peripheral claims that block motor DMA — skip.
            if (e.peripheral === "TIMUP") continue;
            if (typeof e.controller !== "number" || typeof e.stream !== "number") continue;
            claimedStreams.add(`${e.controller}:${e.stream}`);
        }
    }
    // Streams the optimizer's own motor picks have already grabbed.
    // Updated as each motor is placed; checked when picking the next.
    const plannedMotorStreams = new Set();

    // Helper: does a pad's default DMA option land on a stream that's
    // already taken by something else? Returns true to reject the pad.
    // Pads with no padDmaDefaults entry are accepted (caller may not
    // have populated DMA defaults — fall back to today's behavior).
    // Pads with a null payload (no DMA option at all, e.g. F7 TIM11
    // channel pins) are rejected for motor use — they can drive
    // servos but not DSHOT.
    const _motorDmaConflicts = (pad) => {
        if (!padDmaDefaults) return false;
        if (!padDmaDefaults.has(pad)) return false;
        const dma = padDmaDefaults.get(pad);
        if (dma == null) return true; // no DMA option → motor-ineligible
        const k = `${dma.controller}:${dma.stream}`;
        return claimedStreams.has(k) || plannedMotorStreams.has(k);
    };

    const servos = new Map();
    const motors = new Map();
    const servoTimers = new Set();
    // Pads whose final AF differs from current — caller emits
    // `timer <pad> AF<af>` for each.
    const remaps = new Map();
    // Final timer/channel per motor pad after AF resolution. Feeds the
    // F4 burst-DMA conflict check below.
    const motorTimerByPad = new Map();

    // Servos take the first servoCount pads in silkscreen order. Track
    // their timers so we can avoid landing motors on the same timer
    // group below.
    for (let i = 0; i < servoCount; i += 1) {
        const pad = pool[i];
        servos.set(usedServoIndices[i], pad);
        if (padTimers) {
            const t = padTimers.get(pad);
            if (t && t.timer != null) servoTimers.add(t.timer);
        }
    }

    // Motors take the next available pads, but SKIP pads sharing a
    // timer with any allocated servo. BF can't run DSHOT (motor) and
    // 50Hz servo PWM on the same TIM peripheral — bench-found on Flying
    // Wing (1-motor / 2-servo) where pool position 0+1 went to servos
    // (TIM3 CH1+CH2) and the strict "next pad" rule landed MOTOR 1 on
    // pool[2] = TIM3 CH3 → conflict. With this skip, MOTOR 1 walks past
    // TIM3 candidates and lands on TIM4. For 2-motor wings the motors
    // still land together (M5+M6 = TIM4 CH1+CH3) — preserves the
    // bench-preferred TIMUP-burst grouping.
    //
    // When allowAfRemap is true, a pad that would otherwise be skipped
    // can be RECOVERED by picking an alternate AF whose timer doesn't
    // collide with servoTimers. Recovery only fires when (a) the pad
    // has alternate AF options in `padTimerOptions`, and (b) at least
    // one option's timer is disjoint from servoTimers. Complementary
    // (CHnN) channels are filtered out — they can't drive DSHOT.
    let nextPoolIdx = servoCount;
    for (let m = 0; m < motorCount; m += 1) {
        let claimedPad = null;
        let claimedTimer = null;
        let claimedChannel = null;
        let claimedAf = null;
        while (nextPoolIdx < pool.length) {
            const pad = pool[nextPoolIdx];
            nextPoolIdx += 1;
            // DMA collision (with another motor / LED_STRIP / ADC /
            // UART / SPI peripheral) is INFORMATIONAL, not a hard
            // reject. Firmware handles it at boot: motor falls back
            // to bit-bang DSHOT — still works, just less efficient.
            // Bench-observed on TMOTORF7X2: rejecting motor pads on
            // DMA collision caused the optimizer to return null,
            // motor binding fell back to silkscreen-default
            // (C06+C07), and servos took leftovers including TIM3
            // pads → real timer conflict. Better to accept the soft
            // DMA degradation and emit a warning. (motorDmaConflicts
            // / claimedStreams / plannedMotorStreams kept around for
            // the F4 burst-DMA reject and as scaffolding for a
            // future v2 that scores rather than rejects.)
            if (!padTimers || servoTimers.size === 0) {
                claimedPad = pad;
                break;
            }
            const t = padTimers.get(pad);
            if (!t || t.timer == null) {
                claimedPad = pad;
                break;
            }
            if (!servoTimers.has(t.timer)) {
                claimedPad = pad;
                claimedTimer = t.timer;
                claimedChannel = t.channel;
                break;
            }
            if (!allowAfRemap) continue;
            const opts = padTimerOptions.get(pad);
            if (!Array.isArray(opts) || opts.length === 0) continue;
            const fit = opts.find((o) => !o.complementary && !servoTimers.has(o.timer));
            if (!fit) continue;
            claimedPad = pad;
            claimedTimer = fit.timer;
            claimedChannel = fit.channel;
            claimedAf = fit.af;
            break;
        }
        if (!claimedPad) return null;
        motors.set(m + 1, claimedPad);
        if (claimedTimer != null) {
            motorTimerByPad.set(claimedPad, { timer: claimedTimer, channel: claimedChannel });
        }
        // Track this motor's stream so subsequent motor picks won't
        // collide with it. Servos still don't contribute (above).
        if (padDmaDefaults && padDmaDefaults.has(claimedPad)) {
            const dma = padDmaDefaults.get(claimedPad);
            if (dma != null) {
                plannedMotorStreams.add(`${dma.controller}:${dma.stream}`);
            }
        }
        if (claimedAf != null) {
            const currentAf = padCurrentAF?.get(claimedPad);
            if (currentAf !== claimedAf) {
                remaps.set(claimedPad, { af: claimedAf, timer: claimedTimer, channel: claimedChannel });
            }
        }
    }

    // F4 burst-DMA reject: STM32F4xx routes DSHOT through timer-burst
    // DMA, and burst owns the stream across all of a timer's channels.
    // Two motors on the same timer can't both run independent DSHOT.
    // Caller falls back to the joint optimizer (which scores AF combos
    // more globally) when this rejects.
    if (analysis?.mcuFamily) {
        const motorPicks = [];
        for (const [motorIndex, pad] of motors) {
            const tInfo = motorTimerByPad.get(pad);
            if (tInfo) motorPicks.push({ motorIndex, pad, timer: tInfo.timer, channel: tInfo.channel });
        }
        const verdict = predictDmaConflict({ mcuFamily: analysis.mcuFamily, motorPicks });
        if (verdict.hasConflict) return null;
    }

    return { motors, servos, score: 0, remaps };
}

/**
 * @param {object} analysis - analyzer output. Requires `padTimers` Map.
 * @param {number} motorCount - motor slots to place (1..n).
 * @param {number[]} usedServoIndices - servo slot indices to place.
 * @param {object} options
 * @param {object} options.padDefaults - `{ motors: [{index, pad}], ledStrips: [{pad}] }`
 * @param {boolean} [options.allowLedStrip=false] - include LED_STRIP pad in pool.
 * @returns {{motors: Map<number,string>, servos: Map<number,string>, score: number} | null}
 */
export function pickOptimalPadLayout(analysis, motorCount, usedServoIndices, options = {}) {
    const padDefaults = options.padDefaults;
    if (!padDefaults || !Array.isArray(padDefaults.motors) || padDefaults.motors.length === 0) return null;
    const padTimers = analysis?.padTimers;
    if (!(padTimers instanceof Map) || padTimers.size === 0) return null;

    const allowLedStrip = options.allowLedStrip === true;

    // Build pool. silkscreenIndex lets the scorer reward "MOTOR N on
    // silkscreen M N"; LED gets a sentinel index (99) that never matches
    // a motor index, so LED never earns the silkscreen-preservation bonus.
    const pool = [];
    for (const m of padDefaults.motors) {
        const t = padTimers.get(m.pad);
        if (!t || t.timer == null) continue;
        pool.push({ pad: m.pad, silkscreenKind: "MOTOR", silkscreenIndex: m.index, timer: t.timer });
    }
    if (allowLedStrip && Array.isArray(padDefaults.ledStrips)) {
        for (const ls of padDefaults.ledStrips) {
            const t = padTimers.get(ls.pad);
            if (!t || t.timer == null) continue;
            pool.push({ pad: ls.pad, silkscreenKind: "LED_STRIP", silkscreenIndex: 99, timer: t.timer });
        }
    }
    if (pool.length === 0) return null;

    const servoCount = usedServoIndices.length;
    if (pool.length < motorCount + servoCount) return null;

    // Zero-churn reference: current motor/servo pads already bound on the
    // FC. The scorer weights "motor/servo stays on its existing pad"
    // HIGHER than silkscreen-preservation, so a valid current layout wins
    // over aesthetically-preferred re-shuffling. Without this the
    // optimizer would force MOTOR 1/2 onto silkscreen M1/M2 (B00/B01)
    // even when the user's already got motors on silkscreen M3/M4
    // (A03/A02) working with zero timer conflicts — observed on bench
    // 2026-04-22: user had configured TIM2 motors + TIM3/TIM8 servos,
    // optimizer kept offering to move everything to silkscreen-first.
    //
    // freshStart=true (set by the Plane Setup Wizard) treats the FC as
    // unconfigured: factory-default bindings DON'T count as zero-churn
    // anchors. Lets the wizard pick the cleanest layout for a brand-new
    // wing without being trapped by quad-default motor allocations
    // (Brian, 2026-04-29 — TMOTORF7 was sticking motors on M1/M2 even
    // for a wing because the factory defaults bound them there).
    const freshStart = options.freshStart === true;
    const currentMotorPads = freshStart ? new Set() : new Set((analysis.motors ?? []).map((m) => m.pad));
    const currentServoPads = freshStart ? new Set() : new Set((analysis.servos ?? []).map((s) => s.pad));

    const motorCombos = enumerateCombinations(pool, motorCount);
    let best = null;
    for (const motorSet of motorCombos) {
        const motorTimers = new Set(motorSet.map((p) => p.timer));
        const servoCandidates = pool.filter((p) => !motorSet.includes(p) && !motorTimers.has(p.timer));
        if (servoCandidates.length < servoCount) continue;

        // Servo pick: prefer pads currently bound to servos (zero-churn),
        // then fill with lowest-silkscreen-index candidates. Keeps the
        // user's existing servo wiring untouched whenever the motor
        // placement leaves those pads timer-safe.
        const currentInCands = servoCandidates.filter((p) => currentServoPads.has(p.pad));
        const nonCurrent = servoCandidates
            .filter((p) => !currentServoPads.has(p.pad))
            .sort((a, b) => a.silkscreenIndex - b.silkscreenIndex);
        const servoSet = currentInCands.concat(nonCurrent).slice(0, servoCount);

        let score = servoSet.length * 100;
        // Silkscreen-convention bonus (motor N naturally on silkscreen M N).
        for (const m of motorSet) {
            if (m.silkscreenKind === "MOTOR" && m.silkscreenIndex >= 1 && m.silkscreenIndex <= motorCount) {
                score += 10;
            }
        }
        // Zero-churn bonuses — weighted HIGHER than silkscreen so a
        // currently-valid layout wins even if motors aren't on silkscreen
        // M1/M2. Applied to both motor + servo sets so neither side gets
        // force-moved when the current FC state is already a good fit.
        for (const m of motorSet) {
            if (currentMotorPads.has(m.pad)) score += 15;
        }
        for (const s of servoSet) {
            if (currentServoPads.has(s.pad)) score += 15;
        }
        // Servo bank quality: wings have more servos than motors, so
        // prefer motor placements that leave servos on as few distinct
        // timer groups as possible. Servo-first prioritization without
        // flipping the enumerator (Brian, 2026-04-29 — chose this over a
        // full algorithm rewrite to preserve existing zero-churn behavior
        // and avoid bench re-validation across all wing targets).
        //
        // Bumped to +35 (was +25) so the 1-timer servo bank can edge out
        // silkscreen-motor (+20) once freshStart removes the zero-churn
        // anchor. Without freshStart, zero-churn (+15 per kept pad) still
        // dominates, so existing-user-setup behavior is unchanged.
        const servoTimerCount = new Set(servoSet.map((s) => s.timer)).size;
        if (servoSet.length > 0) {
            if (servoTimerCount === 1) score += 35;
            else if (servoTimerCount === 2) score += 10;
            // 3+ distinct timers: no bonus (fragmented servo bank)
        }
        // Motor grouping bonus when essentially free. Bidir DShot wants
        // motors on a shared timer; not a wing blocker, just cleaner
        // when it happens. Capped low so zero-churn still dominates.
        // Reuses the motorTimers Set already computed above (line ~350)
        // for servoCandidates filtering.
        if (motorSet.length > 1 && motorTimers.size === 1) score += 8;
        // Wasted-channel penalty: motor pads on a timer reserved for
        // motors block ALL other channels of that timer from being
        // servos (timer isolation). If the motor placement leaves
        // unused channels on its timer, those channels are dead weight
        // — penalize so the optimizer prefers placing motors on smaller
        // timer groups when feasible, freeing the bigger timers for
        // servos. Critical for 2-motor wings on quad-default boards
        // where motors silkscreen on TIM3's full 4-channel block.
        let wastedChannels = 0;
        for (const p of pool) {
            if (motorTimers.has(p.timer) && !motorSet.includes(p)) {
                wastedChannels += 1;
            }
        }
        score -= wastedChannels * 1;
        // Deterministic tiebreaker among equally-scored layouts: prefer
        // low avg motor silkscreen index.
        const avgMotorIdx = motorSet.reduce((s, m) => s + m.silkscreenIndex, 0) / motorSet.length;
        score -= avgMotorIdx * 0.01;

        if (!best || score > best.score) best = { motorSet, servoSet, score };
    }

    if (!best) return null;

    // Motor index assignment (three passes, each preserving earlier
    // assignments):
    //   Pass 0 — zero-churn: motor index N keeps its current pad when
    //            that pad is in motorSet.
    //   Pass 1 — silkscreen: remaining pads land on their natural
    //            silkscreen motor index.
    //   Pass 2 — fill: leftover motor indices get leftover pads in
    //            ascending silkscreen order.
    const motors = new Map();
    const assignedIdx = new Set();
    const takenPads = new Set();
    // Pass 0: zero-churn.
    for (const m of analysis.motors ?? []) {
        if (m.index < 1 || m.index > motorCount) continue;
        const match = best.motorSet.find((p) => p.pad === m.pad);
        if (match && !assignedIdx.has(m.index) && !takenPads.has(match.pad)) {
            motors.set(m.index, match.pad);
            assignedIdx.add(m.index);
            takenPads.add(match.pad);
        }
    }
    // Pass 1: silkscreen convention for remaining pads.
    const motorSetSorted = best.motorSet.slice().sort((a, b) => a.silkscreenIndex - b.silkscreenIndex);
    const leftoverPads = [];
    for (const p of motorSetSorted) {
        if (takenPads.has(p.pad)) continue;
        if (
            p.silkscreenKind === "MOTOR" &&
            p.silkscreenIndex >= 1 &&
            p.silkscreenIndex <= motorCount &&
            !assignedIdx.has(p.silkscreenIndex)
        ) {
            motors.set(p.silkscreenIndex, p.pad);
            assignedIdx.add(p.silkscreenIndex);
            takenPads.add(p.pad);
        } else {
            leftoverPads.push(p);
        }
    }
    // Pass 2: fill remaining motor indices.
    let nextIdx = 1;
    for (const p of leftoverPads) {
        if (takenPads.has(p.pad)) continue;
        while (nextIdx <= motorCount && assignedIdx.has(nextIdx)) nextIdx++;
        if (nextIdx > motorCount) break;
        motors.set(nextIdx, p.pad);
        assignedIdx.add(nextIdx);
        takenPads.add(p.pad);
        nextIdx++;
    }

    // Servo index assignment — same zero-churn-first logic as motors.
    // Pass 0: servo index N keeps its current pad when that pad is in
    //         servoSet.
    // Pass 1: remaining servo indices pair with remaining servo pads in
    //         ascending order (silkscreen pad → ascending servo index).
    const servos = new Map();
    const assignedServoIdx = new Set();
    const takenServoPads = new Set();
    for (const s of analysis.servos ?? []) {
        if (!usedServoIndices.includes(s.index)) continue;
        const match = best.servoSet.find((p) => p.pad === s.pad);
        if (match && !takenServoPads.has(match.pad)) {
            servos.set(s.index, match.pad);
            assignedServoIdx.add(s.index);
            takenServoPads.add(match.pad);
        }
    }
    const sortedServoIndicesLeft = [...usedServoIndices].filter((i) => !assignedServoIdx.has(i)).sort((a, b) => a - b);
    const sortedServoPadsLeft = best.servoSet
        .filter((p) => !takenServoPads.has(p.pad))
        .sort((a, b) => a.silkscreenIndex - b.silkscreenIndex);
    for (let i = 0; i < sortedServoIndicesLeft.length && i < sortedServoPadsLeft.length; i++) {
        servos.set(sortedServoIndicesLeft[i], sortedServoPadsLeft[i].pad);
    }

    return { motors, servos, score: best.score };
}

// ─── Preset-level resource plan (surgical, no-count) ──────────────
//
// Given a preset and the current analyzer state, compute the exact CLI
// batch to make the FC's resource claims match what the preset actually
// uses — no orphan SERVO 1 bound just because servoCount said so, no
// extra motors released into free pads unless the preset needs them.
//
// Consumers pass optional `picks` (user overrides from the Mixer-tab
// Pin Assignment dropdowns). Anything not in `picks` uses the
// top-ranked `candidatePadsForSlot` result.

/**
 * @param {object} analysis - analyzer output.
 * @param {{mmix: Array, rules: Array}} preset - plane preset.
 * @param {object} [options]
 * @param {Object<number,string>} [options.picks] - servoIndex → pad
 *   overrides.
 * @param {Object<number,string>} [options.motorPicks] - motorIndex → pad
 *   overrides (for motors that need a new binding).
 * @param {boolean} [options.allowLedStrip=false]
 * @param {number[]} [options.allowUartRelease=[]]
 * @param {Array} [options.effectiveRules] - overrides `preset.rules` for
 *   deriving `usedServoIndices`. Lets the Pin Assignment panel track
 *   rules the user has added/removed via the Function→Output editor.
 *   Falls through to preset.rules when not passed.
 * @param {number} [options.motorCount] - overrides `preset.mmix.length`
 *   for deriving `usedMotorIndices`. 1 = single motor, 2 = differential
 *   thrust. Defaults to preset.mmix.length so the standard preset-apply
 *   path keeps its old behavior.
 * @returns {{cliLines: string[], picks: Map, motorPicks: Map,
 *   usedMotorIndices: number[], usedServoIndices: number[],
 *   motorsToRelease: Array, servosToRelease: Array, warnings: Array}}
 */
export function computePresetResourcePlan(analysis, preset, options = {}) {
    const warnings = [];
    if (!analysis || !preset || !Array.isArray(preset.rules) || !Array.isArray(preset.mmix)) {
        return {
            cliLines: [],
            picks: new Map(),
            motorPicks: new Map(),
            usedMotorIndices: [],
            usedServoIndices: [],
            motorsToRelease: [],
            servosToRelease: [],
            warnings: [{ code: "invalid_input", message: "missing analysis or preset data" }],
        };
    }

    // usedMotorIndices: 1..motorCount (BF CLI uses 1-based MOTOR N).
    // motorCount defaults to preset.mmix.length; override lets the
    // diff-thrust toggle bump a single-motor preset up to 2 motors without
    // editing the preset itself.
    const motorCount =
        typeof options.motorCount === "number" && options.motorCount > 0 ? options.motorCount : preset.mmix.length;
    const usedMotorIndices = Array.from({ length: motorCount }, (_, i) => i + 1);

    // usedServoIndices: unique {rule.target - 1 : rule in rules}.
    // BF airplane slot → SERVO resource index: slot - 1 (slot 3 = SERVO 2).
    // effectiveRules override lets the Pin Assignment panel track the live
    // Function→Output Mapping state, including rules the user has added /
    // removed post-preset-apply. rate=0 rules are placeholders / deletions
    // in the editor; filter them out before computing indices.
    const rulesSource = Array.isArray(options.effectiveRules) ? options.effectiveRules : preset.rules;
    const usedServoIndicesSet = new Set();
    for (const rule of rulesSource) {
        if (typeof rule.target !== "number") continue;
        if (typeof rule.rate === "number" && rule.rate === 0) continue;
        const servoIndex = rule.target - 1;
        if (servoIndex >= 1) usedServoIndicesSet.add(servoIndex);
    }
    const usedServoIndices = [...usedServoIndicesSet].sort((a, b) => a - b);

    // Picks: pad per needed SERVO N, honoring overrides + zero-churn.
    const userPicks = options.picks ?? {};
    const motorUserPicks = options.motorPicks ?? {};
    const allowLedStrip = options.allowLedStrip === true;
    const allowUartRelease = Array.isArray(options.allowUartRelease) ? options.allowUartRelease : [];

    // Joint motor+servo optimizer runs first. When it produces a layout,
    // its picks feed the same priority-1 "user override" slot the picker
    // already respects — that way the motor + servo binding passes below
    // stay untouched. Optimizer output is merged beneath any real user
    // override so a hand-tweaked dropdown still wins.
    // Servo-bank-first allocator (silkscreen order). Servos take the
    // lowest silkscreen-MOTOR indices, motors take the next ones. Matches
    // the wizard's final state. The joint optimizer (`pickOptimalPadLayout`)
    // is still exported for paths that want global timer scoring, but
    // preset application uses the deterministic order.
    const optimized = pickSilkscreenOrderLayout(analysis, motorCount, usedServoIndices, {
        padDefaults: options.padDefaults,
        allowLedStrip,
        allowAfRemap: options.allowAfRemap === true,
    });
    const effectiveMotorPicks = { ...motorUserPicks };
    const effectiveServoPicks = { ...userPicks };
    // Pads whose final AF differs from current binding. Caller emits
    // `timer <pad> AF<af>` for each, BEFORE the resource binds.
    const optimizerRemaps = optimized?.remaps instanceof Map ? optimized.remaps : new Map();
    // User-supplied AF overrides win over optimizer auto-picks. Pilot
    // selects an alt-AF row from the Mixer-tab dropdown → caller passes
    // padAfOverrides Map<pad, af> here. Each entry produces a
    // `timer <pad> AF<af>` line ahead of the resource bind, identical
    // to the optimizer's automatic remap path.
    const userAfOverrides = options.padAfOverrides instanceof Map ? options.padAfOverrides : null;
    if (userAfOverrides) {
        const padCurrentAF = analysis?.padCurrentAF instanceof Map ? analysis.padCurrentAF : null;
        const padTimerOptions = analysis?.padTimerOptions instanceof Map ? analysis.padTimerOptions : null;
        for (const [pad, af] of userAfOverrides) {
            if (typeof af !== "number") continue;
            const currentAf = padCurrentAF?.get(pad);
            if (currentAf === af) {
                // Override matches current — no remap needed; remove
                // any optimizer-auto remap for this pad too.
                optimizerRemaps.delete(pad);
                continue;
            }
            // Look up timer/channel for the chosen AF so the planned
            // remap entry carries full info for downstream consumers.
            const opts = padTimerOptions?.get(pad);
            const opt = Array.isArray(opts) ? opts.find((o) => o.af === af) : null;
            optimizerRemaps.set(pad, {
                af,
                timer: opt?.timer ?? null,
                channel: opt?.channel ?? null,
            });
        }
    }
    if (optimized) {
        for (const [idx, pad] of optimized.motors) {
            if (effectiveMotorPicks[idx] == null) effectiveMotorPicks[idx] = pad;
        }
        for (const [idx, pad] of optimized.servos) {
            if (effectiveServoPicks[idx] == null) effectiveServoPicks[idx] = pad;
        }
    }

    const picks = new Map();
    const motorPicks = new Map(); // motorIndex → {pad, timer, channel, source}
    const alreadyPicked = new Set();
    const extraReleaseLines = new Set(); // LED_STRIP / SERIAL_TX / SERIAL_RX

    // ---- Motor binding pass (for ALL motors in usedMotorIndices) ----
    // Targets each used motor toward its silkscreen-default pad (from the
    // optional `padDefaults` snapshot) when that pad is free. Falls back to
    // existing binding (zero-churn) and finally to a free-PWM first-fit.
    // Handles both "motor never bound" (post-Flying-Wing-then-Diff-thrust)
    // and "motor bound but at wrong pad" (user wants M2 back at silkscreen
    // M2 even though it currently sits at B05).
    const padDefaultsMotors = Array.isArray(options.padDefaults?.motors) ? options.padDefaults.motors : [];
    const defaultPadForMotor = (idx) => padDefaultsMotors.find((m) => m.index === idx)?.pad ?? null;
    const existingMotorByIndex = new Map();
    for (const m of analysis.motors ?? []) existingMotorByIndex.set(m.index, m);

    // Pads off-limits for motor binding. Computed per-motor below so we can
    // exclude the current motor's own pad from its own claim set (that's
    // zero-churn territory, not a collision).
    //
    // User motor overrides win over "currently bound to a kept servo": if
    // the user explicitly picked a pad for a motor, the recommender must
    // NOT count it as claimed by a servo. The servo will get reassigned
    // to a different pad in the servo binding pass. Without this, picking
    // a servo's pad for MOTOR 1 then adding a SERVO pin (which expands
    // usedServoIndices) caused the motor's pick to fail padIsAvailable —
    // observed on bench TMTR/TMOTORF7 (Brian, 2026-04-29).
    const userClaimedMotorPads = new Set(Object.values(motorUserPicks).filter((p) => p));
    function buildMotorClaimedPads(forMotorIndex) {
        const claimed = new Set();
        for (const f of analysis.hardwareFixedPads ?? []) claimed.add(f.pad);
        for (const s of analysis.servos ?? []) {
            if (!usedServoIndices.includes(s.index)) continue;
            if (userClaimedMotorPads.has(s.pad)) continue;
            claimed.add(s.pad);
        }
        for (const m of analysis.motors ?? []) {
            if (m.index !== forMotorIndex && usedMotorIndices.includes(m.index)) {
                claimed.add(m.pad);
            }
        }
        if (!allowLedStrip) {
            for (const ls of analysis.ledStrips ?? []) claimed.add(ls.pad);
        }
        for (const srl of analysis.serials ?? []) {
            if (allowUartRelease.includes(srl.index)) continue;
            if (srl.txPad) claimed.add(srl.txPad);
            if (srl.rxPad) claimed.add(srl.rxPad);
        }
        return claimed;
    }

    // First-fit free-PWM pool, sorted "shared timer with already-bound kept
    // motor first" so bidir DSHOT stays grouped.
    const keptMotorTimers = new Set(
        (analysis.motors ?? [])
            .filter((m) => usedMotorIndices.includes(m.index))
            .map((m) => m.timer)
            .filter((t) => t !== null && t !== undefined),
    );
    const freePoolForFallback = (analysis.pwmCapableFreePads ?? []).slice().sort((a, b) => {
        const aShared = keptMotorTimers.has(a.timer) ? 0 : 1;
        const bShared = keptMotorTimers.has(b.timer) ? 0 : 1;
        return aShared - bShared;
    });

    // Track which pads each motor will end up using so subsequent motor +
    // servo picks don't collide.
    const motorTargets = new Map(); // motorIndex -> pad

    for (const motorIndex of usedMotorIndices) {
        const claimedForThis = buildMotorClaimedPads(motorIndex);
        const existing = existingMotorByIndex.get(motorIndex) ?? null;
        const padIsAvailable = (pad) => {
            if (!pad) return false;
            if (alreadyPicked.has(pad)) return false;
            if (claimedForThis.has(pad)) return false;
            return true;
        };

        let target = null;

        // 1. User override (optimizer picks folded in here too — the
        //    effective map merges user overrides atop optimizer output).
        const override = effectiveMotorPicks[motorIndex];
        if (override && padIsAvailable(override)) {
            target = override;
        } else if (override) {
            warnings.push({
                code: "motor_override_unavailable",
                message: `User picked ${override} for MOTOR ${motorIndex} but it isn't safe (claimed by another resource).`,
            });
        }

        // 2. Silkscreen default — strongly preferred so MOTOR N lands on
        //    the pad labeled "M N" on the board.
        if (!target) {
            const def = defaultPadForMotor(motorIndex);
            if (def && padIsAvailable(def)) target = def;
        }

        // 3. Existing binding — zero-churn fallback.
        if (!target && existing && padIsAvailable(existing.pad)) {
            target = existing.pad;
        }

        // 4. First-fit from free-PWM pool.
        if (!target) {
            for (const p of freePoolForFallback) {
                if (padIsAvailable(p.pad)) {
                    target = p.pad;
                    break;
                }
            }
        }

        if (!target) {
            warnings.push({
                code: "no_pad_for_motor",
                message: `No free PWM pad available for MOTOR ${motorIndex}. Preset's motor count exceeds what this board can bind — the user must pick a pad in the Mixer tab's Pin Assignment panel or reset resources first.`,
            });
            continue;
        }

        motorTargets.set(motorIndex, target);
        alreadyPicked.add(target);
        // Optimizer may park a motor on the LED_STRIP pad (allowLedStrip
        // case). Servo-side LED releases come from candidatePadsForSlot's
        // requiresRelease bubbling into extraReleaseLines; motor side has
        // no candidate helper, so detect the collision here explicitly.
        if ((analysis.ledStrips ?? []).some((ls) => ls.pad === target)) {
            extraReleaseLines.add("resource LED_STRIP 1 NONE");
        }
        // motorPicks stays scoped to motors that need an explicit bind line
        // (i.e. either no current binding or a different one than the target).
        if (!existing || existing.pad !== target) {
            motorPicks.set(motorIndex, { pad: target });
        }
    }

    // Distill motor rebinds (motorIndex → newPad) from the motor pass
    // above. Threaded into candidatePadsForSlot so SERVO overrides
    // targeting a moved-from motor pad pass the validity check (the
    // pad's current motor is releasing it, so it IS a valid candidate).
    const motorRebindsForServos = new Map();
    for (const [motorIndex, pick] of motorPicks) {
        motorRebindsForServos.set(motorIndex, pick.pad);
    }

    for (const servoIndex of usedServoIndices) {
        const existing = (analysis.servos ?? []).find((s) => s.index === servoIndex);
        const currentPad = existing?.pad ?? null;

        const cands = candidatePadsForSlot(analysis, servoIndex, {
            motorIndicesInUse: usedMotorIndices,
            currentPad,
            allowLedStrip,
            allowUartRelease,
            motorRebinds: motorRebindsForServos,
        });

        let pick = null;

        // User-supplied override (optimizer picks also merge in via
        // effectiveServoPicks) takes priority if it's a valid candidate.
        const override = effectiveServoPicks[servoIndex];
        if (override) {
            pick = cands.find((c) => c.pad === override && !alreadyPicked.has(c.pad));
            if (!pick) {
                warnings.push({
                    code: "override_unavailable",
                    message: `User picked ${override} for SERVO ${servoIndex} but it isn't a valid candidate — falling back to default.`,
                });
            }
        }
        // Default: top-ranked candidate not already taken by another slot.
        if (!pick) pick = cands.find((c) => !alreadyPicked.has(c.pad));

        if (!pick) {
            warnings.push({
                code: "no_pad_for_slot",
                message: `No candidate pad available for SERVO ${servoIndex}. Preset rules targeting this slot will have no physical output.`,
            });
            continue;
        }

        alreadyPicked.add(pick.pad);
        picks.set(servoIndex, pick);
        // Any non-motor release hints (LED_STRIP / UART) fold into the batch
        // ahead of the servo bind. Motor releases are handled by
        // motorsToRelease below (so we don't double-emit).
        for (const line of pick.requiresRelease) {
            if (/^resource MOTOR /.test(line)) continue;
            extraReleaseLines.add(line);
        }
    }

    // motorsToRelease: any currently-bound motor not in usedMotorIndices.
    const motorsToRelease = (analysis.motors ?? []).filter((m) => !usedMotorIndices.includes(m.index));

    // servosToRelease: currently-bound SERVO N not in usedServoIndices (orphan cleanup).
    const servosToRelease = (analysis.servos ?? []).filter((s) => !usedServoIndices.includes(s.index));

    // Defensive release set: every MOTOR/SERVO slot 1..MAX not in used
    // indices gets a `resource ... NONE` line, even if the analyzer didn't
    // see it bound. BF keeps a silkscreen default pad map per target, and
    // slots that *weren't* shown in `resource show` can still hold a pad
    // claim (seen on FLYWOOF405NANO where MOTOR 5–8 default to B05/C09/
    // B04/C08 but don't always surface in `resource show`). Without the
    // defensive release, binding SERVO 3 → B05 silently conflicts with
    // the phantom MOTOR 5 → B05 claim and the servo bind no-ops, leaving
    // the user with duplicate pad claims in `dump`.
    //
    // BF treats `resource MOTOR N NONE` against an already-empty slot as
    // a harmless no-op, so over-emitting is cheap.
    const MAX_MOTOR_SLOTS = 8;
    const MAX_SERVO_SLOTS = 8;
    const observedMotorReleaseIdx = new Set(motorsToRelease.map((m) => m.index));
    const observedServoReleaseIdx = new Set(servosToRelease.map((s) => s.index));
    const defensiveMotorReleases = [];
    for (let i = 1; i <= MAX_MOTOR_SLOTS; i++) {
        if (usedMotorIndices.includes(i)) continue;
        if (observedMotorReleaseIdx.has(i)) continue;
        defensiveMotorReleases.push(i);
    }
    const defensiveServoReleases = [];
    for (let i = 1; i <= MAX_SERVO_SLOTS; i++) {
        if (usedServoIndices.includes(i)) continue;
        if (observedServoReleaseIdx.has(i)) continue;
        defensiveServoReleases.push(i);
    }

    // Build CLI batch. Order matters: BF rejects `resource X N PAD`
    // while PAD is still claimed elsewhere, so all releases precede all binds.
    //
    // Two-phase construction:
    //   (1) "real work" lines: observed releases + LED/UART extras + motor/
    //       servo rebinds. If this list is empty, the plan is a true no-op
    //       and we return an empty cliLines (preserves the zero-churn case).
    //   (2) Defensive-release prefix: only prepended when real work exists.
    //       Clears phantom MOTOR/SERVO claims the analyzer missed before
    //       any new bind line lands on their pads.
    const realWork = [];
    for (const m of motorsToRelease) realWork.push(`resource MOTOR ${m.index} NONE`);
    for (const s of servosToRelease) realWork.push(`resource SERVO ${s.index} NONE`);
    for (const line of extraReleaseLines) realWork.push(line);

    // Rebind pre-release: any USED motor whose current pad differs from the
    // chosen target needs to be released first so its old pad becomes free
    // (for whichever resource is moving in there next, often a SERVO).
    const motorRebindReleases = [];
    for (const [motorIndex] of motorPicks) {
        const existing = existingMotorByIndex.get(motorIndex);
        if (existing) motorRebindReleases.push(`resource MOTOR ${motorIndex} NONE`);
    }

    // Bind phase. Motors first so their timer groupings are set before any
    // servo lands on a shared timer.
    const bindLines = [];
    for (const [motorIndex, pick] of motorPicks) {
        bindLines.push(`resource MOTOR ${motorIndex} ${pick.pad}`);
    }
    for (const [servoIndex, pick] of picks) {
        const existing = (analysis.servos ?? []).find((s) => s.index === servoIndex);
        if (existing && existing.pad === pick.pad) continue;
        bindLines.push(`resource SERVO ${servoIndex} ${pick.pad}`);
    }

    // Timer-remap phase. The optimizer's `pickSilkscreenOrderLayout` may
    // have planned an AF change for a motor pad whose current timer
    // collides with a servo's. Emit `timer <pad> AF<n>` AFTER releases
    // and BEFORE binds: pad must be free for the remap to apply cleanly,
    // and the new (timer, channel) needs to be in place before the
    // resource bind so BF wires up the right timer driver. We only
    // emit remaps for pads that ended up in final motor or servo picks
    // — picks the user explicitly overrode might land on the same pad
    // (in which case the remap is still needed) but pads NOT in the
    // final layout would be remapped for no reason if we didn't filter.
    const finalPickPads = new Set();
    for (const [, pick] of motorPicks) finalPickPads.add(pick.pad);
    for (const [, pick] of picks) finalPickPads.add(pick.pad);
    const timerRemapLines = [];
    for (const [pad, remap] of optimizerRemaps) {
        if (!finalPickPads.has(pad)) continue;
        timerRemapLines.push(`timer ${pad} AF${remap.af}`);
    }

    const cliLines = [];
    const hasRealWork =
        realWork.length > 0 || motorRebindReleases.length > 0 || bindLines.length > 0 || timerRemapLines.length > 0;
    if (hasRealWork) {
        // Defensive prefix goes first so phantom slot claims are cleared
        // before any observed release / rebind / bind line runs.
        for (const i of defensiveMotorReleases) cliLines.push(`resource MOTOR ${i} NONE`);
        for (const i of defensiveServoReleases) cliLines.push(`resource SERVO ${i} NONE`);
        cliLines.push(...realWork);
        cliLines.push(...motorRebindReleases);
        cliLines.push(...timerRemapLines);
        cliLines.push(...bindLines);
    }

    return {
        cliLines,
        picks,
        motorPicks,
        usedMotorIndices,
        usedServoIndices,
        motorsToRelease,
        servosToRelease,
        timerRemaps: optimizerRemaps,
        warnings,
    };
}
