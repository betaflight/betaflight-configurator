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
// Partition motors three ways:
//   - in-use & static:   pad off-limits (inUseMotorPads)
//   - in-use & moving:   old pad releasable as motor-release (real
//                        cost, label "releases MOTOR N"); new pad
//                        claimed (added to inUseMotorPads)
//   - not in MSP2 use:   firmware-bound but dormant. Emit as a
//                        free-pwm candidate (label "free") with a
//                        requiresRelease line so save still clears
//                        the firmware-level resource entry. Avoids
//                        the foot-gun where the dropdown suggests
//                        "releases MOTOR N" for an inactive motor.
function buildMotorClaimContext(analysis, motorIndicesInUse, motorRebinds) {
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
    return { inUseMotorPads, activeReleasableMotors, dormantMotors };
}

// Timers used by in-use motors — for sharesTimerWithMotor flag.
// Rebind-aware: when an in-use motor is moving to a different pad in
// the same plan (motorRebinds), the relevant timer is the destination
// pad's, not the original. PadPlannedTimers takes priority so an AF
// remap (whether driven by user override or the silkscreen optimizer)
// shifts the motor's timer claim to the new value, not the stale
// pre-batch one.
function buildMotorTimerSet(analysis, motorIndicesInUse, motorRebinds, padPlannedTimers, motorTimerLookup) {
    const motorTimers = new Set();
    for (const m of analysis.motors ?? []) {
        if (!motorIndicesInUse.has(m.index)) {
            continue;
        }
        const rebindPad = motorRebinds?.get(m.index) ?? null;
        const effectivePad = rebindPad && rebindPad !== m.pad ? rebindPad : m.pad;
        const resolvedTimer =
            padPlannedTimers?.get(effectivePad) ??
            (rebindPad && rebindPad !== m.pad
                ? (motorTimerLookup?.get(rebindPad)?.timer ?? null)
                : (m.timer ?? motorTimerLookup?.get(m.pad)?.timer ?? null));
        if (resolvedTimer != null) {
            motorTimers.add(resolvedTimer);
        }
    }
    return motorTimers;
}

// True if this servo entry should NOT contribute to the claimed-pad
// set: it's the slot we're picking for, OR it's moving to a different
// pad in the same plan, OR it's being released in this batch.
function isServoClaimSkippable(s, servoIndex, servoRebinds, releasedServoIndices) {
    if (s.index === servoIndex) {
        return true;
    }
    const rebindPad = servoRebinds?.get(s.index) ?? null;
    if (rebindPad && rebindPad !== s.pad) {
        return true;
    }
    return releasedServoIndices?.has(s.index) === true;
}

function addProtectedSerialClaims(claimedPads, analysis, allowUartRelease) {
    for (const srl of analysis.serials ?? []) {
        if (allowUartRelease.includes(srl.index)) {
            continue;
        }
        if (srl.txPad) {
            claimedPads.add(srl.txPad);
        }
        if (srl.rxPad) {
            claimedPads.add(srl.rxPad);
        }
    }
}

// Claimed-pad set: everything off-limits without a release step.
function buildClaimedPadsForServo(analysis, servoIndex, ctx) {
    const { inUseMotorPads, servoRebinds, releasedServoIndices, allowLedStrip, allowUartRelease } = ctx;
    const claimedPads = new Set();
    for (const f of analysis.hardwareFixedPads ?? []) {
        claimedPads.add(f.pad);
    }
    for (const s of analysis.servos ?? []) {
        if (!isServoClaimSkippable(s, servoIndex, servoRebinds, releasedServoIndices)) {
            claimedPads.add(s.pad);
        }
    }
    for (const pad of inUseMotorPads) {
        claimedPads.add(pad);
    }
    if (!allowLedStrip) {
        for (const ls of analysis.ledStrips ?? []) {
            claimedPads.add(ls.pad);
        }
    }
    addProtectedSerialClaims(claimedPads, analysis, allowUartRelease);
    return claimedPads;
}

// Dedup key includes AF so the same pad can appear once per viable
// alternate function. Default-AF entries use the pad alone (af === null).
// Alt-AF entries from the post-pass key by `pad:af`, letting
// `B00 — TIM3 CH3` (default) coexist with `B00 — TIM1 CH2N (alt AF1)`.
function createCandidateAccumulator() {
    const results = [];
    const seen = new Set();
    const keyFor = (pad, af) => (af == null ? pad : `${pad}:${af}`);
    const push = (entry) => {
        const k = keyFor(entry.pad, entry.af ?? null);
        if (seen.has(k)) {
            return;
        }
        seen.add(k);
        results.push(entry);
    };
    return { results, push };
}

// 1. Existing binding — zero-churn. Resolve the row's timer with the
// same padTimers fallback the motor-release / dormant-motor branches
// use: on targets where `timer show` omits the row's entry, existing
// timer info is null and the bare flag would silently say "no motor
// conflict" even when the pad shares a timer with an in-use motor.
// On collision, drop the base entry but record the pad in
// altAfRescuePads so the alt-AF expansion still covers it (same-pad
// path out of timer conflict).
function addExistingCandidate(push, altAfRescuePads, ctx) {
    const { currentPad, claimedPads, analysis, servoIndex, motorTimerLookup, motorTimers } = ctx;
    if (!currentPad || claimedPads.has(currentPad)) {
        return;
    }
    // existing.pad is the analyzer snapshot's pad for THIS slot — may
    // differ from the live currentPad if the Vue layer has already
    // moved the row to a new pad. Only inherit existing.timer/channel
    // when snapshot still matches currentPad.
    const existing = (analysis.servos ?? []).find((s) => s.index === servoIndex);
    const existingMatchesCurrent = existing?.pad === currentPad;
    const fallback = motorTimerLookup?.get(currentPad);
    const resolvedTimer = (existingMatchesCurrent ? existing?.timer : null) ?? fallback?.timer ?? null;
    const resolvedChannel = (existingMatchesCurrent ? existing?.channel : null) ?? fallback?.channel ?? null;
    if (resolvedTimer == null || !motorTimers.has(resolvedTimer)) {
        push({
            pad: currentPad,
            timer: resolvedTimer,
            channel: resolvedChannel,
            dmaStream: null,
            source: "existing",
            requiresRelease: [],
            sharesTimerWithMotor: resolvedTimer != null && motorTimers.has(resolvedTimer),
        });
        return;
    }
    altAfRescuePads.add(currentPad);
}

// 2. Motor-release candidates — preferred so silkscreen labels stay
// intuitive (S1 → MOTOR 2 pad → silkscreen "M2" on the board).
// Iterated in motor-index order from the analyzer's sorted list.
// Timer/channel fallback to padTimers since some targets (e.g.
// TMOTORF7X2) don't surface dormant motors in `timer show`.
function addMotorReleaseCandidates(push, activeReleasableMotors, ctx) {
    const { claimedPads, motorTimerLookup, motorTimers } = ctx;
    for (const m of activeReleasableMotors) {
        if (claimedPads.has(m.pad)) {
            continue;
        }
        const fallback = motorTimerLookup?.get(m.pad);
        const resolvedTimer = m.timer ?? fallback?.timer ?? null;
        push({
            pad: m.pad,
            timer: resolvedTimer,
            channel: m.channel ?? fallback?.channel ?? null,
            dmaStream: m.dmaStream ?? null,
            source: "motor-release",
            requiresRelease: [`resource MOTOR ${m.index} NONE`],
            sharesTimerWithMotor: resolvedTimer != null && motorTimers.has(resolvedTimer),
        });
    }
}

// 2.5. Dormant-motor pads — pads firmware-bound to motors that aren't
// active in the MSP2 motor list. Functionally free; emit as free-pwm
// with a release line so save clears the firmware-level binding.
// Label reads "free" instead of "releases MOTOR N" since there's no
// real motor to lose.
function addDormantMotorCandidates(push, dormantMotors, ctx) {
    const { claimedPads, motorTimerLookup, motorTimers } = ctx;
    for (const m of dormantMotors) {
        if (claimedPads.has(m.pad)) {
            continue;
        }
        const fallback = motorTimerLookup?.get(m.pad);
        const resolvedTimer = m.timer ?? fallback?.timer ?? null;
        push({
            pad: m.pad,
            timer: resolvedTimer,
            channel: m.channel ?? fallback?.channel ?? null,
            dmaStream: m.dmaStream ?? null,
            source: "free-pwm",
            requiresRelease: [`resource MOTOR ${m.index} NONE`],
            sharesTimerWithMotor: resolvedTimer != null && motorTimers.has(resolvedTimer),
        });
    }
}

// 3 + 4. Free PWM pads — partition by timer conflict. Non-conflict
// pads first so the dropdown ranks safe options higher than ones that
// share a timer with an in-use motor.
function addFreePwmCandidates(push, ctx) {
    const { analysis, claimedPads, motorTimers } = ctx;
    const freePwm = Array.isArray(analysis.pwmCapableFreePads) ? analysis.pwmCapableFreePads : [];
    const freeNonConflict = [];
    const freeConflict = [];
    for (const p of freePwm) {
        if (claimedPads.has(p.pad)) {
            continue;
        }
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
}

// 5. LED_STRIP pad (opt-in). Same padTimers fallback as motor-release —
// `timer show` may not emit a CH line for LED_STRIP (it's in WS2812
// DMA mode, not PWM), but the pad is still in the timer_dump and we
// want the dropdown to label it with TIMn.
function addLedStripCandidates(push, ctx) {
    const { analysis, allowLedStrip, claimedPads, motorTimerLookup, motorTimers } = ctx;
    if (!allowLedStrip) {
        return;
    }
    for (const ls of analysis.ledStrips ?? []) {
        if (claimedPads.has(ls.pad)) {
            continue;
        }
        const fallback = motorTimerLookup?.get(ls.pad);
        const resolvedTimer = ls.timer ?? fallback?.timer ?? null;
        push({
            pad: ls.pad,
            timer: resolvedTimer,
            channel: ls.channel ?? fallback?.channel ?? null,
            dmaStream: ls.dmaStream ?? null,
            source: "led-strip",
            requiresRelease: ["resource LED_STRIP 1 NONE"],
            sharesTimerWithMotor: resolvedTimer != null && motorTimers.has(resolvedTimer),
        });
    }
}

// 6. UART TX/RX pads (opt-in per UART). A UART pad reaches us when
// the analyzer's serials/spareUarts list includes it, but the firmware
// build may have NO PWM-capable timer AF on that physical pin (e.g.
// A09/USART1_TX on TMOTORF7). Releasing such a UART would never
// produce a working servo PWM line, so drop it before it can surface.
// PWM-capable means: pad is in padTimers (current AF IS a timer), OR
// pad has at least one entry in padTimerOptions (alt AF could give it
// one — alt-AF expansion below would surface it).
function addUartReleaseCandidates(push, ctx) {
    const { analysis, allowUartRelease, claimedPads, motorTimerLookup, padTimerOptionsMap, motorTimers } = ctx;
    const padHasPwmCapability = (pad) => {
        if (!pad) {
            return false;
        }
        if (motorTimerLookup?.has(pad)) {
            return true;
        }
        const opts = padTimerOptionsMap?.get(pad);
        return Array.isArray(opts) && opts.length > 0;
    };
    for (const uartIndex of allowUartRelease) {
        // Check the full `serials` list before falling back to `spareUarts`.
        // An opt-in release for a UART that DOES have a function (caller
        // explicitly OK'd releasing it) was previously invisible here.
        const serial =
            (analysis.serials ?? []).find((u) => u.index === uartIndex) ??
            (analysis.spareUarts ?? []).find((u) => u.index === uartIndex);
        if (!serial) {
            continue;
        }
        if (serial.txPad && !claimedPads.has(serial.txPad) && padHasPwmCapability(serial.txPad)) {
            const fallback = motorTimerLookup?.get(serial.txPad);
            const resolvedTimer = fallback?.timer ?? null;
            push({
                pad: serial.txPad,
                timer: resolvedTimer,
                channel: fallback?.channel ?? null,
                dmaStream: null,
                source: "uart-release",
                requiresRelease: [`resource SERIAL_TX ${uartIndex} NONE`],
                sharesTimerWithMotor: resolvedTimer != null && motorTimers.has(resolvedTimer),
            });
        }
        if (serial.rxPad && !claimedPads.has(serial.rxPad) && padHasPwmCapability(serial.rxPad)) {
            const fallback = motorTimerLookup?.get(serial.rxPad);
            const resolvedTimer = fallback?.timer ?? null;
            push({
                pad: serial.rxPad,
                timer: resolvedTimer,
                channel: fallback?.channel ?? null,
                dmaStream: null,
                source: "uart-release",
                requiresRelease: [`resource SERIAL_RX ${uartIndex} NONE`],
                sharesTimerWithMotor: resolvedTimer != null && motorTimers.has(resolvedTimer),
            });
        }
    }
}

// 7. Alt-AF expansion. For each pad already in results, emit
// additional entries for every alternate AF the firmware reports
// (via analysis.padTimerOptions). Lets the pilot manually park a pad
// on a different (timer, channel) — useful when the optimizer's
// automatic AF remap doesn't fire (e.g. tight DMA boards) but the
// pilot knows a specific alt AF would help. Each alt entry inherits
// the base pad's source/requiresRelease but adds a `timer <pad>
// AF<n>` step.
function addAltAfCandidates(push, results, altAfRescuePads, ctx) {
    const { analysis, motorTimers } = ctx;
    const padTimerOptions = analysis.padTimerOptions instanceof Map ? analysis.padTimerOptions : null;
    if (!padTimerOptions) {
        return;
    }
    const padCurrentAF = analysis.padCurrentAF instanceof Map ? analysis.padCurrentAF : null;
    // Synthesize a minimal "base" for rescue pads dropped from results
    // (e.g. currentPad with timer collision) so alt-AF expansion still
    // covers them. Synthetic base has no requiresRelease — staying on
    // same pad, just retargeting AF.
    const expansionBases = [
        ...results,
        ...[...altAfRescuePads]
            .filter((pad) => !results.some((r) => r.pad === pad))
            .map((pad) => ({ pad, requiresRelease: [] })),
    ];
    const altEntries = [];
    for (const base of expansionBases) {
        const opts = padTimerOptions.get(base.pad);
        if (!Array.isArray(opts) || opts.length === 0) {
            continue;
        }
        const currentAf = padCurrentAF?.get(base.pad);
        for (const opt of opts) {
            if (opt.af === currentAf) {
                continue;
            }
            altEntries.push({
                pad: base.pad,
                timer: opt.timer,
                channel: opt.channel,
                af: opt.af,
                complementary: !!opt.complementary,
                dmaStream: null,
                // Preserve the base candidate's source so downstream
                // labelers can still surface the underlying side-effect
                // ("releases MOTOR N", "releases UART2 TX", etc.). The
                // `af` field flags the row as an alt-AF variant; labels
                // layer "(alt AF)" on top of the base source. The bare
                // "alt-af" fallback covers synthetic rescue bases that
                // have no underlying source.
                source: base.source ?? "alt-af",
                requiresRelease: [...(base.requiresRelease ?? []), `timer ${base.pad} AF${opt.af}`],
                sharesTimerWithMotor: opt.timer != null && motorTimers.has(opt.timer),
            });
        }
    }
    for (const e of altEntries) {
        push(e);
    }
}

export function candidatePadsForSlot(analysis, servoIndex, options = {}) {
    if (!analysis || typeof servoIndex !== "number") {
        return [];
    }

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
    // fall back to a different pad.
    const motorRebinds = options.motorRebinds instanceof Map ? options.motorRebinds : null;
    // servoRebinds: servoIndex → newPad. Mirror of motorRebinds for the
    // servo side — when another SERVO N in the same plan is moving to a
    // different pad, its CURRENT pad is releasable in this batch.
    const servoRebinds = options.servoRebinds instanceof Map ? options.servoRebinds : null;
    // releasedServoIndices: servo indices the caller is dropping in this
    // batch. Their pads will be cleared by release CLI lines, so they
    // should NOT block as if still claimed.
    const releasedServoArray = Array.isArray(options.releasedServoIndices)
        ? new Set(options.releasedServoIndices)
        : null;
    const releasedServoIndices =
        options.releasedServoIndices instanceof Set ? options.releasedServoIndices : releasedServoArray;
    // padPlannedTimers: pad → planned timer AFTER the batch's
    // `timer <pad> AF<n>` lines apply. Built by the planner from
    // optimizerRemaps; Vue-side dropdown caller doesn't have planned-
    // remap info and omits this option.
    const padPlannedTimers = options.padPlannedTimers instanceof Map ? options.padPlannedTimers : null;

    const motorTimerLookup = analysis.padTimers instanceof Map ? analysis.padTimers : null;
    const padTimerOptionsMap = analysis.padTimerOptions instanceof Map ? analysis.padTimerOptions : null;

    const { inUseMotorPads, activeReleasableMotors, dormantMotors } = buildMotorClaimContext(
        analysis,
        motorIndicesInUse,
        motorRebinds,
    );
    const motorTimers = buildMotorTimerSet(
        analysis,
        motorIndicesInUse,
        motorRebinds,
        padPlannedTimers,
        motorTimerLookup,
    );
    const claimedPads = buildClaimedPadsForServo(analysis, servoIndex, {
        inUseMotorPads,
        servoRebinds,
        releasedServoIndices,
        allowLedStrip,
        allowUartRelease,
    });

    const { results, push } = createCandidateAccumulator();
    // Pads dropped from results for timer collision but still deserving
    // alt-AF rescue entries (same-pad path out of timer conflict).
    const altAfRescuePads = new Set();

    const ctx = {
        analysis,
        servoIndex,
        currentPad,
        claimedPads,
        motorTimers,
        motorTimerLookup,
        padTimerOptionsMap,
        allowLedStrip,
        allowUartRelease,
    };
    addExistingCandidate(push, altAfRescuePads, ctx);
    addMotorReleaseCandidates(push, activeReleasableMotors, ctx);
    addDormantMotorCandidates(push, dormantMotors, ctx);
    addFreePwmCandidates(push, ctx);
    addLedStripCandidates(push, ctx);
    addUartReleaseCandidates(push, ctx);
    addAltAfCandidates(push, results, altAfRescuePads, ctx);

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
    if (k === 0) {
        return [[]];
    }
    if (k > arr.length) {
        return result;
    }
    const indices = Array.from({ length: k }, (_, i) => i);
    // Classic increment-rightmost-expandable pattern. Small n only —
    // pool is <=9 on every target, motorCount <=2 on wings → <=36 combos.
    while (true) {
        result.push(indices.map((i) => arr[i]));
        let i = k - 1;
        while (i >= 0 && indices[i] === arr.length - k + i) {
            i--;
        }
        if (i < 0) {
            break;
        }
        indices[i]++;
        for (let j = i + 1; j < k; j++) {
            indices[j] = indices[j - 1] + 1;
        }
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
// Pool: silkscreen-MOTOR pads in silkscreen order, then LED if allowed.
// Dedup so a pad with both MOTOR and LED_STRIP entries in padDefaults
// (e.g. boards where LED_STRIP shares M-labeled silkscreen) doesn't
// appear twice and inflate apparent pool capacity.
function buildSilkscreenPool(padDefaults, allowLedStrip) {
    const pool = [];
    const seen = new Set();
    for (const m of [...padDefaults.motors].sort((a, b) => a.index - b.index)) {
        if (m?.pad && !seen.has(m.pad)) {
            seen.add(m.pad);
            pool.push(m.pad);
        }
    }
    if (allowLedStrip && Array.isArray(padDefaults.ledStrips)) {
        for (const ls of padDefaults.ledStrips) {
            if (ls?.pad && !seen.has(ls.pad)) {
                seen.add(ls.pad);
                pool.push(ls.pad);
            }
        }
    }
    return pool;
}

// Servos take the first servoCount pads in silkscreen order. Mutates
// `servos` in place and returns the set of timers those servos occupy
// — the motor pass uses it to skip same-timer pads.
function assignServoPadsInOrder(servos, pool, servoCount, usedServoIndices, padTimers) {
    const servoTimers = new Set();
    for (let i = 0; i < servoCount; i += 1) {
        const pad = pool[i];
        servos.set(usedServoIndices[i], pad);
        if (padTimers) {
            const t = padTimers.get(pad);
            if (t?.timer != null) {
                servoTimers.add(t.timer);
            }
        }
    }
    return servoTimers;
}

// Returns the first non-complementary alt-AF whose timer is disjoint
// from servoTimers, or null. Complementary (CHnN) channels are
// filtered out — they can't drive DSHOT.
function findAfRemapFit(pad, padTimerOptions, servoTimers) {
    const opts = padTimerOptions.get(pad);
    if (!Array.isArray(opts) || opts.length === 0) {
        return null;
    }
    return opts.find((o) => !o.complementary && !servoTimers.has(o.timer)) ?? null;
}

// Walks the pool from startIdx forward, finding the first pad that's
// either timer-disjoint from servoTimers or recoverable via alt-AF.
// Returns { pad, timer, channel, af, nextIdx } on success; null when
// the pool is exhausted. `af` is null for non-remap claims; only set
// when an alt-AF was selected (caller emits `timer <pad> AF<af>` for
// those).
function claimNextMotorPad(pool, startIdx, padTimers, servoTimers, padTimerOptions, allowAfRemap) {
    let nextIdx = startIdx;
    while (nextIdx < pool.length) {
        const pad = pool[nextIdx];
        nextIdx += 1;
        // Fast-path: no padTimers map or no servo timers to avoid.
        // Still record the pad's timer/channel from padTimers (when
        // available) so motorTimerByPad gets populated for the F4
        // burst-DMA check downstream — otherwise that check runs on
        // an empty map and silently passes through layouts that
        // share a DMA stream.
        //
        // DMA collision (with another motor / LED_STRIP / ADC /
        // UART / SPI peripheral) is INFORMATIONAL, not a hard reject
        // here. Firmware handles it at boot: motor falls back to
        // bit-bang DSHOT — still works, just less efficient.
        // Bench-observed on TMOTORF7X2: rejecting motor pads on DMA
        // collision caused the optimizer to return null, motor binding
        // fell back to silkscreen-default (C06+C07), and servos took
        // leftovers including TIM3 pads → real timer conflict. Better
        // to accept the soft DMA degradation and emit a warning.
        if (!padTimers || servoTimers.size === 0) {
            const tInfo = padTimers?.get(pad);
            return { pad, timer: tInfo?.timer ?? null, channel: tInfo?.channel ?? null, af: null, nextIdx };
        }
        const t = padTimers.get(pad);
        if (t?.timer == null) {
            return { pad, timer: null, channel: null, af: null, nextIdx };
        }
        if (!servoTimers.has(t.timer)) {
            return { pad, timer: t.timer, channel: t.channel, af: null, nextIdx };
        }
        if (!allowAfRemap) {
            continue;
        }
        const fit = findAfRemapFit(pad, padTimerOptions, servoTimers);
        if (!fit) {
            continue;
        }
        return { pad, timer: fit.timer, channel: fit.channel, af: fit.af, nextIdx };
    }
    return null;
}

// Records a successful per-motor claim into the running maps. Splits
// out of pickSilkscreenOrderLayout's motor for-loop so the parent reads
// as a flat sequence of claim → record steps instead of nested ifs.
function applyMotorClaim(motors, motorTimerByPad, remaps, claim, motorIndex, padCurrentAF) {
    motors.set(motorIndex, claim.pad);
    if (claim.timer != null) {
        motorTimerByPad.set(claim.pad, { timer: claim.timer, channel: claim.channel });
    }
    if (claim.af == null) {
        return;
    }
    const currentAf = padCurrentAF?.get(claim.pad);
    if (currentAf !== claim.af) {
        remaps.set(claim.pad, { af: claim.af, timer: claim.timer, channel: claim.channel });
    }
}

// F4 burst-DMA reject: STM32F4xx routes DSHOT through timer-burst DMA,
// and burst owns the stream across all of a timer's channels. Two
// motors on the same timer can't both run independent DSHOT. Caller
// falls back to the joint optimizer (which scores AF combos more
// globally) when this rejects.
function rejectF4BurstDmaConflict(analysis, motors, motorTimerByPad) {
    if (!analysis?.mcuFamily) {
        return false;
    }
    const motorPicks = [];
    for (const [motorIndex, pad] of motors) {
        const tInfo = motorTimerByPad.get(pad);
        if (tInfo) {
            motorPicks.push({ motorIndex, pad, timer: tInfo.timer, channel: tInfo.channel });
        }
    }
    const verdict = predictDmaConflict({ mcuFamily: analysis.mcuFamily, motorPicks });
    return verdict.hasConflict;
}

export function pickSilkscreenOrderLayout(analysis, motorCount, usedServoIndices, options = {}) {
    const padDefaults = options.padDefaults;
    if (!padDefaults || !Array.isArray(padDefaults.motors) || padDefaults.motors.length === 0) {
        return null;
    }
    const allowLedStrip = options.allowLedStrip === true;
    const pool = buildSilkscreenPool(padDefaults, allowLedStrip);

    const servoCount = usedServoIndices.length;
    if (pool.length < servoCount + motorCount) {
        return null;
    }

    const padTimers = analysis?.padTimers instanceof Map ? analysis.padTimers : null;
    const padTimerOptions = analysis?.padTimerOptions instanceof Map ? analysis.padTimerOptions : null;
    const padCurrentAF = analysis?.padCurrentAF instanceof Map ? analysis.padCurrentAF : null;
    // Note: when padTimers is null this function falls back to strict
    // silkscreen order without timer-disjoint enforcement. That's an
    // intentional graceful-degradation path for boards whose analyzer
    // didn't surface timer info (covered by the
    // "works without padTimers" test) — bailing here would break that
    // contract. The caller still gets a deterministic layout; safety
    // checks downstream (DMA conflict prediction, etc.) handle the rest.
    const allowAfRemap = options.allowAfRemap === true && padTimerOptions != null;

    const servos = new Map();
    const motors = new Map();
    // Pads whose final AF differs from current — caller emits
    // `timer <pad> AF<af>` for each.
    const remaps = new Map();
    // Final timer/channel per motor pad after AF resolution. Feeds the
    // F4 burst-DMA conflict check below.
    const motorTimerByPad = new Map();

    const servoTimers = assignServoPadsInOrder(servos, pool, servoCount, usedServoIndices, padTimers);

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
    // collide with servoTimers (see findAfRemapFit).
    let nextPoolIdx = servoCount;
    for (let m = 0; m < motorCount; m += 1) {
        const claim = claimNextMotorPad(pool, nextPoolIdx, padTimers, servoTimers, padTimerOptions, allowAfRemap);
        if (!claim) {
            return null;
        }
        nextPoolIdx = claim.nextIdx;
        applyMotorClaim(motors, motorTimerByPad, remaps, claim, m + 1, padCurrentAF);
    }

    if (rejectF4BurstDmaConflict(analysis, motors, motorTimerByPad)) {
        return null;
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
// Build pool. silkscreenIndex lets the scorer reward "MOTOR N on
// silkscreen M N"; LED gets a sentinel index (99) that never matches
// a motor index, so LED never earns the silkscreen-preservation bonus.
// Pads without timer info in `padTimers` are dropped — pickOptimalPadLayout
// requires timer data for scoring. Dedup so a pad listed under both
// motors and ledStrips (some boards expose LED_STRIP on an M-labeled
// silkscreen pad) doesn't get pushed twice and let the optimizer assign
// the same physical pin to two different MOTOR/SERVO indices.
function buildTimedSilkscreenPool(padDefaults, padTimers, allowLedStrip) {
    const pool = [];
    const seen = new Set();
    for (const m of padDefaults.motors) {
        if (seen.has(m.pad)) {
            continue;
        }
        const t = padTimers.get(m.pad);
        if (t?.timer == null) {
            continue;
        }
        seen.add(m.pad);
        pool.push({ pad: m.pad, silkscreenKind: "MOTOR", silkscreenIndex: m.index, timer: t.timer });
    }
    if (allowLedStrip && Array.isArray(padDefaults.ledStrips)) {
        for (const ls of padDefaults.ledStrips) {
            if (!ls?.pad || seen.has(ls.pad)) {
                continue;
            }
            const t = padTimers.get(ls.pad);
            if (t?.timer == null) {
                continue;
            }
            seen.add(ls.pad);
            pool.push({ pad: ls.pad, silkscreenKind: "LED_STRIP", silkscreenIndex: 99, timer: t.timer });
        }
    }
    return pool;
}

// +10 per motor placed on its silkscreen MOTOR index.
function scoreSilkscreenBonus(motorSet, motorCount) {
    let s = 0;
    for (const m of motorSet) {
        if (m.silkscreenKind === "MOTOR" && m.silkscreenIndex >= 1 && m.silkscreenIndex <= motorCount) {
            s += 10;
        }
    }
    return s;
}

// +15 per motor pad already bound to that motor + per servo pad already
// bound to a used servo on the FC. Weighted HIGHER than silkscreen so
// a currently-valid layout wins over aesthetically-preferred re-shuffling.
function scoreZeroChurnBonus(motorSet, servoSet, currentMotorPads, currentServoPads) {
    let s = 0;
    for (const m of motorSet) {
        if (currentMotorPads.has(m.pad)) {
            s += 15;
        }
    }
    for (const x of servoSet) {
        if (currentServoPads.has(x.pad)) {
            s += 15;
        }
    }
    return s;
}

// +35 when the servo bank fits on a single timer; +10 for two timers;
// 3+ distinct timers earns no bonus (fragmented servo bank).
function scoreServoBankBonus(servoSet) {
    if (servoSet.length === 0) {
        return 0;
    }
    const distinctTimers = new Set(servoSet.map((s) => s.timer)).size;
    if (distinctTimers === 1) {
        return 35;
    }
    if (distinctTimers === 2) {
        return 10;
    }
    return 0;
}

// +8 when all motors share a single timer (bidir DSHOT grouping).
// Capped low so zero-churn still dominates.
function scoreMotorGroupingBonus(motorSet, motorTimers) {
    return motorSet.length > 1 && motorTimers.size === 1 ? 8 : 0;
}

// -1 per motor-timer channel left unused by this layout. Motor pads
// on a timer reserved for motors block ALL other channels of that
// timer from being servos (timer isolation). Penalize so the optimizer
// prefers placing motors on smaller timer groups when feasible,
// freeing the bigger timers for servos. Critical for 2-motor wings on
// quad-default boards where motors silkscreen on TIM3's full 4-channel
// block.
function scoreWastedChannelPenalty(pool, motorSet, motorTimers) {
    let count = 0;
    for (const p of pool) {
        if (motorTimers.has(p.timer) && !motorSet.includes(p)) {
            count += 1;
        }
    }
    return count;
}

// -0.01 * avg(motorSet silkscreenIndex). Deterministic tiebreaker
// among equally-scored layouts: prefer low silkscreen indices.
function scoreTiebreakAvgMotorIdx(motorSet) {
    return (motorSet.reduce((s, m) => s + m.silkscreenIndex, 0) / motorSet.length) * 0.01;
}

// Score a candidate layout. Higher = better. Weights are bench-tuned —
// do not alter without re-validating against existing wing setups.
//
// Bonus structure:
//   +100/servo         placed (selection participation)
//   +10/motor          on its silkscreen MOTOR index
//   +15/motor pad      already bound to that motor on the FC (zero-churn)
//   +15/servo pad      already bound to a used servo on the FC (zero-churn)
//   +35 if servoSet    fits on a single timer (1-timer servo bank)
//   +10 if servoSet    fits across two timers
//   +8  if all motors  share a single timer (bidir DSHOT grouping)
//   -1/wasted channel  motor-timer channels left unused by this layout
//   -0.01*avgMotorIdx  deterministic tiebreaker (prefer low silkscreen idx)
function scoreLayoutCandidate({
    motorSet,
    servoSet,
    motorTimers,
    motorCount,
    pool,
    currentMotorPads,
    currentServoPads,
}) {
    return (
        servoSet.length * 100 +
        scoreSilkscreenBonus(motorSet, motorCount) +
        scoreZeroChurnBonus(motorSet, servoSet, currentMotorPads, currentServoPads) +
        scoreServoBankBonus(servoSet) +
        scoreMotorGroupingBonus(motorSet, motorTimers) -
        scoreWastedChannelPenalty(pool, motorSet, motorTimers) -
        scoreTiebreakAvgMotorIdx(motorSet)
    );
}

// Enumerate motor combinations, build the corresponding zero-churn-first
// servo pick for each, score the layout, return the highest-scoring
// {motorSet, servoSet, score} or null if no layout has enough timer-safe
// servo candidates.
function selectBestLayout(pool, motorCount, servoCount, currentMotorPads, currentServoPads) {
    const motorCombos = enumerateCombinations(pool, motorCount);
    let best = null;
    for (const motorSet of motorCombos) {
        const motorTimers = new Set(motorSet.map((p) => p.timer));
        const servoCandidates = pool.filter((p) => !motorSet.includes(p) && !motorTimers.has(p.timer));
        if (servoCandidates.length < servoCount) {
            continue;
        }

        // Servo pick: prefer pads currently bound to servos (zero-churn),
        // then fill with lowest-silkscreen-index candidates. Keeps the
        // user's existing servo wiring untouched whenever the motor
        // placement leaves those pads timer-safe.
        const currentInCands = servoCandidates.filter((p) => currentServoPads.has(p.pad));
        const nonCurrent = servoCandidates
            .filter((p) => !currentServoPads.has(p.pad))
            .sort((a, b) => a.silkscreenIndex - b.silkscreenIndex);
        const servoSet = currentInCands.concat(nonCurrent).slice(0, servoCount);

        const score = scoreLayoutCandidate({
            motorSet,
            servoSet,
            motorTimers,
            motorCount,
            pool,
            currentMotorPads,
            currentServoPads,
        });
        if (!best || score > best.score) {
            best = { motorSet, servoSet, score };
        }
    }
    return best;
}

// Pass 0 — zero-churn: motor index N keeps its current pad when that
// pad is in motorSet. Skipped on freshStart so the Plane Setup Wizard
// genuinely starts from silkscreen convention rather than inheriting
// factory-default MOTOR N→pad bindings.
function applyMotorZeroChurnPass(state, motorSet, motorCount, analysisMotors) {
    for (const m of analysisMotors ?? []) {
        if (m.index < 1 || m.index > motorCount) {
            continue;
        }
        const match = motorSet.find((p) => p.pad === m.pad);
        if (match && !state.assignedIdx.has(m.index) && !state.takenPads.has(match.pad)) {
            state.motors.set(m.index, match.pad);
            state.assignedIdx.add(m.index);
            state.takenPads.add(match.pad);
        }
    }
}

// Pass 1 — silkscreen: remaining pads land on their natural silkscreen
// motor index. Returns pads that didn't fit silkscreen convention so
// the fill pass can place them.
function applyMotorSilkscreenPass(state, motorSet, motorCount) {
    const sorted = motorSet.slice().sort((a, b) => a.silkscreenIndex - b.silkscreenIndex);
    const leftover = [];
    for (const p of sorted) {
        if (state.takenPads.has(p.pad)) {
            continue;
        }
        if (
            p.silkscreenKind === "MOTOR" &&
            p.silkscreenIndex >= 1 &&
            p.silkscreenIndex <= motorCount &&
            !state.assignedIdx.has(p.silkscreenIndex)
        ) {
            state.motors.set(p.silkscreenIndex, p.pad);
            state.assignedIdx.add(p.silkscreenIndex);
            state.takenPads.add(p.pad);
        } else {
            leftover.push(p);
        }
    }
    return leftover;
}

// Pass 2 — fill: leftover motor indices get leftover pads in ascending
// silkscreen order.
function applyMotorFillPass(state, leftoverPads, motorCount) {
    let nextIdx = 1;
    for (const p of leftoverPads) {
        if (state.takenPads.has(p.pad)) {
            continue;
        }
        while (nextIdx <= motorCount && state.assignedIdx.has(nextIdx)) {
            nextIdx++;
        }
        if (nextIdx > motorCount) {
            break;
        }
        state.motors.set(nextIdx, p.pad);
        state.assignedIdx.add(nextIdx);
        state.takenPads.add(p.pad);
        nextIdx++;
    }
}

// Three-pass motor index assignment (each pass preserves earlier picks).
function assignMotorIndices(motorSet, motorCount, analysisMotors, freshStart) {
    const state = { motors: new Map(), assignedIdx: new Set(), takenPads: new Set() };
    if (!freshStart) {
        applyMotorZeroChurnPass(state, motorSet, motorCount, analysisMotors);
    }
    const leftover = applyMotorSilkscreenPass(state, motorSet, motorCount);
    applyMotorFillPass(state, leftover, motorCount);
    return state.motors;
}

// Two-pass servo index assignment — same zero-churn-first logic as
// motors. Pass 0 (skipped on freshStart): servo index N keeps its
// current pad when that pad is in servoSet. Pass 1: remaining servo
// indices pair with remaining servo pads in ascending order
// (silkscreen pad → ascending servo index).
function assignServoIndices(servoSet, usedServoIndices, analysisServos, freshStart) {
    const servos = new Map();
    const assignedServoIdx = new Set();
    const takenServoPads = new Set();
    if (!freshStart) {
        for (const s of analysisServos ?? []) {
            if (!usedServoIndices.includes(s.index)) {
                continue;
            }
            const match = servoSet.find((p) => p.pad === s.pad);
            if (match && !takenServoPads.has(match.pad)) {
                servos.set(s.index, match.pad);
                assignedServoIdx.add(s.index);
                takenServoPads.add(match.pad);
            }
        }
    }
    const sortedServoIndicesLeft = [...usedServoIndices].filter((i) => !assignedServoIdx.has(i)).sort((a, b) => a - b);
    const sortedServoPadsLeft = servoSet
        .filter((p) => !takenServoPads.has(p.pad))
        .sort((a, b) => a.silkscreenIndex - b.silkscreenIndex);
    for (let i = 0; i < sortedServoIndicesLeft.length && i < sortedServoPadsLeft.length; i++) {
        servos.set(sortedServoIndicesLeft[i], sortedServoPadsLeft[i].pad);
    }
    return servos;
}

export function pickOptimalPadLayout(analysis, motorCount, usedServoIndices, options = {}) {
    const padDefaults = options.padDefaults;
    if (!padDefaults || !Array.isArray(padDefaults.motors) || padDefaults.motors.length === 0) {
        return null;
    }
    const padTimers = analysis?.padTimers;
    if (!(padTimers instanceof Map) || padTimers.size === 0) {
        return null;
    }
    const allowLedStrip = options.allowLedStrip === true;
    const pool = buildTimedSilkscreenPool(padDefaults, padTimers, allowLedStrip);
    if (pool.length === 0) {
        return null;
    }
    const servoCount = usedServoIndices.length;
    if (pool.length < motorCount + servoCount) {
        return null;
    }

    // Zero-churn reference: current motor/servo pads already bound on the
    // FC. The scorer weights "motor/servo stays on its existing pad"
    // HIGHER than silkscreen-preservation, so a valid current layout wins
    // over aesthetically-preferred re-shuffling.
    //
    // freshStart=true (set by the Plane Setup Wizard) treats the FC as
    // unconfigured: factory-default bindings DON'T count as zero-churn
    // anchors. Lets the wizard pick the cleanest layout for a brand-new
    // wing without being trapped by quad-default motor allocations.
    //
    // Zero-churn anchors only count for outputs the current plan will
    // actually drive. Without these filters, a board with bound but
    // unused MOTOR 5-8 / SERVO 5-8 would have their pads rewarded by
    // the scorer even though no rule routes through them, biasing the
    // optimizer toward layouts that "preserve" pads we don't care about.
    const freshStart = options.freshStart === true;
    const currentMotorPads = freshStart
        ? new Set()
        : new Set((analysis.motors ?? []).filter((m) => m.index >= 1 && m.index <= motorCount).map((m) => m.pad));
    const currentServoPads = freshStart
        ? new Set()
        : new Set((analysis.servos ?? []).filter((s) => usedServoIndices.includes(s.index)).map((s) => s.pad));

    const best = selectBestLayout(pool, motorCount, servoCount, currentMotorPads, currentServoPads);
    if (!best) {
        return null;
    }

    const motors = assignMotorIndices(best.motorSet, motorCount, analysis.motors, freshStart);
    const servos = assignServoIndices(best.servoSet, usedServoIndices, analysis.servos, freshStart);

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
 *   motorsToRelease: Array, servosToRelease: Array, timerRemaps: Map,
 *   warnings: Array}}
 */
// Build the set of pads `forMotorIndex` MUST avoid binding to: hardware-fixed
// pads, kept-servo pads (minus servos vacating their pad as part of this
// plan), planned servo destinations, kept-other-motor pads (minus motors
// vacating), LED_STRIP pads when allowLedStrip is false, and UART TX/RX
// pads not on the allowUartRelease whitelist. Extracted from
// computePresetResourcePlan; ctx carries the closure-borrowed deps so
// the helper sits at module scope.
// Kept-servo pads block motor claims, but skip:
//   - servos vacating their current pad in this plan (their s.pad will
//     be free by bind time; without skip a servo↔motor swap where
//     SERVO N moves OFF its pad gets rejected)
//   - pads the motor pass has explicitly been told to use (motor↔servo
//     swap the override logic already validated)
function addKeptServoMotorClaims(claimed, analysis, ctx) {
    const { usedServoIndices, effectiveServoPicks, motorClaimedPadsForExemption } = ctx;
    for (const s of analysis.servos ?? []) {
        if (!usedServoIndices.includes(s.index)) {
            continue;
        }
        const plannedServoPad = pickPad(effectiveServoPicks[s.index]);
        if (plannedServoPad && plannedServoPad !== s.pad) {
            continue;
        }
        if (motorClaimedPadsForExemption.has(s.pad)) {
            continue;
        }
        claimed.add(s.pad);
    }
}

// Other in-use motors' pads block motor claims, but skip motors
// vacating their current pad in this plan — their `m.pad` will be
// free by bind time, so it's a valid target for forMotorIndex.
// Without this exemption, legitimate motor↔motor swaps fall into
// "no_pad_for_motor".
function addOtherKeptMotorClaims(claimed, forMotorIndex, analysis, ctx) {
    const { usedMotorIndices, effectiveMotorPicks } = ctx;
    for (const m of analysis.motors ?? []) {
        if (m.index === forMotorIndex || !usedMotorIndices.includes(m.index)) {
            continue;
        }
        const planned = effectiveMotorPicks[m.index];
        if (planned && planned !== m.pad) {
            continue;
        }
        claimed.add(m.pad);
    }
}

function buildMotorClaimedPads(forMotorIndex, ctx) {
    const { analysis, motorClaimedPadsForExemption, servoClaimedPadsForReservation, allowLedStrip, allowUartRelease } =
        ctx;

    const claimed = new Set();
    for (const f of analysis.hardwareFixedPads ?? []) {
        claimed.add(f.pad);
    }
    addKeptServoMotorClaims(claimed, analysis, ctx);
    // Reserve planned servo destinations. Skip pads the motor pass has
    // explicitly been told to use (effectiveMotorPicks) — that's a
    // motor↔servo swap the override logic already validated.
    for (const pad of servoClaimedPadsForReservation) {
        if (!motorClaimedPadsForExemption.has(pad)) {
            claimed.add(pad);
        }
    }
    addOtherKeptMotorClaims(claimed, forMotorIndex, analysis, ctx);
    if (!allowLedStrip) {
        for (const ls of analysis.ledStrips ?? []) {
            claimed.add(ls.pad);
        }
    }
    addProtectedSerialClaims(claimed, analysis, allowUartRelease);
    return claimed;
}

// Override values may be bare pad strings ("B07") or {pad, af}
// objects ("B07@AF3") for AF-aware picks. Centralizes extraction so
// the legacy string path keeps working alongside the AF object form
// without duplicating null/typeof checks at every call site.
function pickPad(override) {
    if (override == null) {
        return null;
    }
    return typeof override === "string" ? override : (override.pad ?? null);
}

// Returned when computePresetResourcePlan is called with missing or
// malformed inputs (no analysis / no preset / no rules / no mmix).
// Match the normal path's Map shape so callers can iterate
// result.timerRemaps unconditionally without a typeof guard.
function invalidPresetPlanResult() {
    return {
        cliLines: [],
        picks: new Map(),
        motorPicks: new Map(),
        usedMotorIndices: [],
        usedServoIndices: [],
        motorsToRelease: [],
        servosToRelease: [],
        timerRemaps: new Map(),
        warnings: [{ code: "invalid_input", message: "missing analysis or preset data" }],
    };
}

// usedMotorIndices: 1..motorCount (BF CLI uses 1-based MOTOR N).
// motorCount defaults to preset.mmix.length; override lets the
// diff-thrust toggle bump a single-motor preset up to 2 motors
// without editing the preset itself.
function deriveUsedMotorIndices(preset, options) {
    const motorCount =
        typeof options.motorCount === "number" && options.motorCount > 0 ? options.motorCount : preset.mmix.length;
    return { motorCount, usedMotorIndices: Array.from({ length: motorCount }, (_, i) => i + 1) };
}

// usedServoIndices: unique {rule.target - 1 : rule in rules}.
// BF airplane slot → SERVO resource index: slot - 1 (slot 3 = SERVO 2).
// effectiveRules override lets the Pin Assignment panel track the live
// Function→Output Mapping state, including rules the user has added /
// removed post-preset-apply. rate=0 rules are placeholders / deletions
// in the editor; filter them out before computing indices.
function deriveUsedServoIndices(preset, options) {
    const rulesSource = Array.isArray(options.effectiveRules) ? options.effectiveRules : preset.rules;
    const usedServoIndicesSet = new Set();
    for (const rule of rulesSource) {
        if (typeof rule.target !== "number") {
            continue;
        }
        if (typeof rule.rate === "number" && rule.rate === 0) {
            continue;
        }
        const servoIndex = rule.target - 1;
        if (servoIndex >= 1) {
            usedServoIndicesSet.add(servoIndex);
        }
    }
    return [...usedServoIndicesSet].sort((a, b) => a - b);
}

// Folds the joint optimizer's motor/servo picks into the effective
// pick maps, but only where the user hasn't already specified an
// override. Real user overrides keep priority.
function mergeOptimizerPicks(optimized, effectiveMotorPicks, effectiveServoPicks) {
    if (!optimized) {
        return;
    }
    for (const [idx, pad] of optimized.motors) {
        if (effectiveMotorPicks[idx] == null) {
            effectiveMotorPicks[idx] = pad;
        }
    }
    for (const [idx, pad] of optimized.servos) {
        if (effectiveServoPicks[idx] == null) {
            effectiveServoPicks[idx] = pad;
        }
    }
}

// User-supplied AF overrides win over optimizer auto-picks. Pilot
// selects an alt-AF row from the Mixer-tab dropdown → caller passes
// padAfOverrides Map<pad, af>. Each entry produces a `timer <pad>
// AF<af>` line ahead of the resource bind, identical to the
// optimizer's automatic remap path. Mutates optimizerRemaps and
// pushes warnings for AFs that don't exist on the current target.
function applyUserAfOverrides(options, analysis, optimizerRemaps, warnings) {
    const userAfOverrides = options.padAfOverrides instanceof Map ? options.padAfOverrides : null;
    if (!userAfOverrides) {
        return;
    }
    const padCurrentAF = analysis?.padCurrentAF instanceof Map ? analysis.padCurrentAF : null;
    const padTimerOptions = analysis?.padTimerOptions instanceof Map ? analysis.padTimerOptions : null;
    for (const [pad, af] of userAfOverrides) {
        if (typeof af !== "number") {
            continue;
        }
        const currentAf = padCurrentAF?.get(pad);
        if (currentAf === af) {
            // Override matches current — no remap needed; remove any
            // optimizer-auto remap for this pad too.
            optimizerRemaps.delete(pad);
            continue;
        }
        // Look up timer/channel for the chosen AF. If the override names
        // an AF that doesn't exist (stale dropdown after a board swap, or
        // hand-edited config), skip the remap rather than emit `timer
        // <pad> AF<n>` with null timer/channel — that would partially
        // apply on save and leave the FC in an inconsistent state.
        const opts = padTimerOptions?.get(pad);
        const opt = Array.isArray(opts) ? opts.find((o) => o.af === af) : null;
        if (!opt) {
            // Skip with a warning, but DON'T delete an existing
            // optimizer-auto remap — that remap was validated against
            // padTimerOptions earlier and may still represent a useful
            // planned change. Falling back to the optimizer pick is
            // safer than reverting to the pad's current (potentially
            // conflicting) AF.
            warnings.push({
                code: "invalid_pad_af_override",
                message: `Ignoring AF${af} override for ${pad}; that AF isn't available on this target.`,
            });
            continue;
        }
        optimizerRemaps.set(pad, { af, timer: opt.timer, channel: opt.channel });
    }
}

// Motor binding pass setup. Builds the context the per-motor target
// resolver needs:
//   - defaultPadForMotor: silkscreen-MOTOR pad lookup (preferred target)
//   - existingMotorByIndex: zero-churn fallback source
//   - motorClaimedPadsCtx: arg for buildMotorClaimedPads (which pads
//     are off-limits for THIS motor — exempts the motor's own pad,
//     planned servo destinations, and other in-use motors)
//   - freePoolForFallback: free PWM pads sorted to favor pads sharing
//     a timer with already-bound kept motors (keeps bidir DSHOT
//     grouped). Last-resort fallback when silkscreen + zero-churn fail.
//
// motorClaimedPadsForExemption: motor picks (user OR optimizer) win
// over "currently bound to a kept servo". The servo will get
// reassigned in the servo binding pass; without this, picking a
// servo's pad for MOTOR 1 then adding a SERVO pin caused the motor's
// pick to fail padIsAvailable (bench TMOTORF7, 2026-04-29). Filter
// by usedMotorIndices: stale dropdown picks for motor rows not in the
// active plan would otherwise leak in and permanently exempt their
// pads from servo claim.
//
// servoClaimedPadsForReservation: pads the servo binding pass plans
// to claim. Reserve them so motor target selection doesn't steal a
// pad the servo is heading for. Filter by usedServoIndices: leftover
// dropdown state for inactive rows would otherwise make motors see
// those pads as permanently claimed.
function buildMotorSelectionContext(analysis, options, ctx) {
    const {
        usedMotorIndices,
        usedServoIndices,
        effectiveMotorPicks,
        effectiveServoPicks,
        allowLedStrip,
        allowUartRelease,
    } = ctx;
    const padDefaultsMotors = Array.isArray(options.padDefaults?.motors) ? options.padDefaults.motors : [];
    const defaultPadForMotor = (idx) => padDefaultsMotors.find((m) => m.index === idx)?.pad ?? null;
    const existingMotorByIndex = new Map();
    for (const m of analysis.motors ?? []) {
        existingMotorByIndex.set(m.index, m);
    }

    const motorClaimedPadsForExemption = new Set();
    for (const [idx, pad] of Object.entries(effectiveMotorPicks)) {
        if (pad && usedMotorIndices.includes(Number(idx))) {
            motorClaimedPadsForExemption.add(pad);
        }
    }
    const servoClaimedPadsForReservation = new Set();
    for (const [idx, override] of Object.entries(effectiveServoPicks)) {
        const pad = pickPad(override);
        if (pad && usedServoIndices.includes(Number(idx))) {
            servoClaimedPadsForReservation.add(pad);
        }
    }
    const motorClaimedPadsCtx = {
        analysis,
        usedMotorIndices,
        usedServoIndices,
        effectiveMotorPicks,
        effectiveServoPicks,
        motorClaimedPadsForExemption,
        servoClaimedPadsForReservation,
        pickPad,
        allowLedStrip,
        allowUartRelease,
    };

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

    return { defaultPadForMotor, existingMotorByIndex, motorClaimedPadsCtx, freePoolForFallback };
}

// Resolve the target pad for ONE motor in priority order:
//   1. user override (effectiveMotorPicks; optimizer picks merged here)
//   2. silkscreen default — preferred so MOTOR N lands on pad "M N"
//   3. existing binding — zero-churn fallback
//   4. first-fit from free-PWM pool
// Returns the chosen pad, or null when no pad is available (caller
// emits a no_pad_for_motor warning). Pushes a motor_override_unavailable
// warning when the user named a pad that's currently claimed.
function resolveMotorTarget(motorIndex, padIsAvailable, ctx, warnings) {
    const { effectiveMotorPicks, defaultPadForMotor, existingMotorByIndex, freePoolForFallback } = ctx;
    const override = effectiveMotorPicks[motorIndex];
    if (override && padIsAvailable(override)) {
        return override;
    }
    if (override) {
        warnings.push({
            code: "motor_override_unavailable",
            message: `User picked ${override} for MOTOR ${motorIndex} but it isn't safe (claimed by another resource).`,
        });
    }
    const def = defaultPadForMotor(motorIndex);
    if (def && padIsAvailable(def)) {
        return def;
    }
    const existing = existingMotorByIndex.get(motorIndex);
    if (existing && padIsAvailable(existing.pad)) {
        return existing.pad;
    }
    for (const p of freePoolForFallback) {
        if (padIsAvailable(p.pad)) {
            return p.pad;
        }
    }
    return null;
}

// Records side-effect releases the motor target may have triggered.
// Optimizer may park a motor on the LED_STRIP pad (allowLedStrip case);
// servo-side LED releases come from candidatePadsForSlot's
// requiresRelease bubbling into extraReleaseLines, but motor side has
// no candidate helper so detect the collision here. Mirror for UART
// pads: when a motor override (or optimizer pick) lands on a spare-
// UART TX/RX pad, padIsAvailable passes because the UART is on
// allowUartRelease, but no SERIAL_TX/RX release line gets emitted
// unless we add it here — bind would fail at runtime with the serial
// resource still owning the pad.
function addMotorTargetReleaseLines(target, analysis, allowUartRelease, extraReleaseLines) {
    if ((analysis.ledStrips ?? []).some((ls) => ls.pad === target)) {
        extraReleaseLines.add("resource LED_STRIP 1 NONE");
    }
    for (const srl of analysis.serials ?? []) {
        if (!allowUartRelease.includes(srl.index)) {
            continue;
        }
        if (srl.txPad === target) {
            extraReleaseLines.add(`resource SERIAL_TX ${srl.index} NONE`);
        }
        if (srl.rxPad === target) {
            extraReleaseLines.add(`resource SERIAL_RX ${srl.index} NONE`);
        }
    }
}

// Motor binding pass — runs the per-motor target resolution loop.
// Mutates the accumulator's motorPicks (motorIndex → {pad}),
// alreadyPicked, and extraReleaseLines. Pushes warnings on
// no_pad_for_motor and motor_override_unavailable.
//
// motorPicks stays scoped to motors that need an explicit bind line
// (i.e. either no current binding or a different pad than current).
function selectMotorPicks(
    analysis,
    usedMotorIndices,
    effectiveMotorPicks,
    allowUartRelease,
    accumulator,
    setupCtx,
    warnings,
) {
    const { motorPicks, alreadyPicked, extraReleaseLines } = accumulator;
    const { defaultPadForMotor, existingMotorByIndex, motorClaimedPadsCtx, freePoolForFallback } = setupCtx;
    const resolverCtx = { effectiveMotorPicks, defaultPadForMotor, existingMotorByIndex, freePoolForFallback };

    for (const motorIndex of usedMotorIndices) {
        const claimedForThis = buildMotorClaimedPads(motorIndex, motorClaimedPadsCtx);
        const padIsAvailable = (pad) => Boolean(pad) && !alreadyPicked.has(pad) && !claimedForThis.has(pad);

        const target = resolveMotorTarget(motorIndex, padIsAvailable, resolverCtx, warnings);
        if (!target) {
            warnings.push({
                code: "no_pad_for_motor",
                message: `No free PWM pad available for MOTOR ${motorIndex}. Preset's motor count exceeds what this board can bind — the user must pick a pad in the Mixer tab's Pin Assignment panel or reset resources first.`,
            });
            continue;
        }

        alreadyPicked.add(target);
        addMotorTargetReleaseLines(target, analysis, allowUartRelease, extraReleaseLines);
        const existing = existingMotorByIndex.get(motorIndex);
        if (!existing || existing.pad !== target) {
            motorPicks.set(motorIndex, { pad: target });
        }
    }
}

// Builds the per-pass context the servo binding loop needs:
//   - motorRebindsForServos: motorIndex → newPad (from motor pass).
//     Threaded into candidatePadsForSlot so SERVO overrides targeting a
//     moved-from motor pad pass the validity check.
//   - servoRebindsForOthers: servoIndex → plannedPad. Lets
//     candidatePadsForSlot exempt servos vacating their current pad in
//     the same plan (avoids servo↔servo swap rejection).
//   - releasedServoIndices: servos currently bound but not in the kept
//     set. Their pads must not block other rows' candidates.
//   - padPlannedTimers: pad → planned timer AFTER `timer <pad> AF<n>`
//     lines apply. Covers (1) motor stays on pad but AF changes, and
//     (2) motor moves to a new pad whose AF is also being remapped.
//     candidatePadsForSlot's motorTimers conflict set consults this
//     first so servos see the post-batch timer landscape.
function buildServoSelectionContext(analysis, optimizerRemaps, motorPicks, effectiveServoPicks, usedServoIndices) {
    const motorRebindsForServos = new Map();
    for (const [motorIndex, pick] of motorPicks) {
        motorRebindsForServos.set(motorIndex, pick.pad);
    }

    const servoRebindsForOthers = new Map();
    for (const [idx, override] of Object.entries(effectiveServoPicks)) {
        const plannedPad = pickPad(override);
        if (!plannedPad) {
            continue;
        }
        const existing = (analysis.servos ?? []).find((s) => s.index === Number(idx));
        if (existing && existing.pad !== plannedPad) {
            servoRebindsForOthers.set(Number(idx), plannedPad);
        }
    }

    const releasedServoIndices = new Set();
    for (const s of analysis.servos ?? []) {
        if (!usedServoIndices.includes(s.index)) {
            releasedServoIndices.add(s.index);
        }
    }

    const padPlannedTimers = new Map();
    for (const [pad, remap] of optimizerRemaps) {
        if (remap?.timer != null) {
            padPlannedTimers.set(pad, remap.timer);
        }
    }

    return { motorRebindsForServos, servoRebindsForOthers, releasedServoIndices, padPlannedTimers };
}

// Match a user/optimizer override against the candidate list. Override
// can be a bare pad string ("B07" — match any AF row for that pad) or
// a {pad, af} object ("B07@AF3" — match the specific AF row). Without
// the AF-aware match, an alt-AF override silently lands on the
// default-AF row and the user's `pad@AFn` selection collapses back to
// `pad` on save. alreadyPicked stays keyed by pad alone — BF can only
// bind one row per pad regardless of AF. Returns the matched candidate
// or null; pushes override_unavailable warning on miss.
function resolveServoOverridePick(override, cands, alreadyPicked, servoIndex, warnings) {
    const overridePad = pickPad(override);
    const overrideAf = typeof override === "string" ? null : (override?.af ?? null);
    const pick = cands.find((c) => {
        if (c.pad !== overridePad || alreadyPicked.has(c.pad)) {
            return false;
        }
        if (overrideAf != null) {
            return c.af === overrideAf;
        }
        return true;
    });
    if (pick) {
        return pick;
    }
    const overrideLabel = overrideAf == null ? overridePad : `${overridePad}@AF${overrideAf}`;
    warnings.push({
        code: "override_unavailable",
        message: `User picked ${overrideLabel} for SERVO ${servoIndex} but it isn't a valid candidate — falling back to default.`,
    });
    return null;
}

// Records the side-effect releases bundled with this servo pick.
// LED_STRIP / UART-release lines fold into the early release block.
// Motor-release hints are dropped here — motorsToRelease handles them
// below to avoid double-emit. `timer <pad> AF<n>` remap lines route
// into pickTimerRemapLines so they emit AFTER motor/servo rebind
// releases (alongside optimizerRemaps' timer remap lines), otherwise
// a pad sharing a timer with a motor being moved gets retargeted
// before the motor releases its old pad.
function addServoPickSideEffects(pick, extraReleaseLines, pickTimerRemapLines) {
    for (const line of pick.requiresRelease) {
        if (line.startsWith("resource MOTOR ")) {
            continue;
        }
        if (/^timer\s+\S+\s+AF/i.test(line)) {
            pickTimerRemapLines.add(line);
            continue;
        }
        extraReleaseLines.add(line);
    }
}

// Servo binding pass — runs the per-servo candidate-and-pick loop.
// For each used servo: ask candidatePadsForSlot for a ranked candidate
// list, pick best (override → top-ranked-available), accumulate the
// pick + side-effect releases. Mutates the accumulator's picks /
// alreadyPicked / extraReleaseLines / pickTimerRemapLines and pushes
// override_unavailable / no_pad_for_slot warnings.
function selectServoPicks(analysis, ctx, accumulator, warnings) {
    const {
        usedMotorIndices,
        usedServoIndices,
        effectiveServoPicks,
        allowLedStrip,
        allowUartRelease,
        motorRebindsForServos,
        servoRebindsForOthers,
        releasedServoIndices,
        padPlannedTimers,
    } = ctx;
    const { picks, alreadyPicked, extraReleaseLines, pickTimerRemapLines } = accumulator;

    for (const servoIndex of usedServoIndices) {
        const existing = (analysis.servos ?? []).find((s) => s.index === servoIndex);
        const currentPad = existing?.pad ?? null;
        const cands = candidatePadsForSlot(analysis, servoIndex, {
            motorIndicesInUse: usedMotorIndices,
            currentPad,
            allowLedStrip,
            allowUartRelease,
            motorRebinds: motorRebindsForServos,
            servoRebinds: servoRebindsForOthers,
            releasedServoIndices,
            padPlannedTimers,
        });

        let pick = null;
        const override = effectiveServoPicks[servoIndex];
        if (override) {
            pick = resolveServoOverridePick(override, cands, alreadyPicked, servoIndex, warnings);
        }
        if (!pick) {
            pick = cands.find((c) => !alreadyPicked.has(c.pad));
        }
        if (!pick) {
            warnings.push({
                code: "no_pad_for_slot",
                message: `No candidate pad available for SERVO ${servoIndex}. Preset rules targeting this slot will have no physical output.`,
            });
            continue;
        }

        alreadyPicked.add(pick.pad);
        picks.set(servoIndex, pick);
        addServoPickSideEffects(pick, extraReleaseLines, pickTimerRemapLines);
    }
}

// Returns motorsToRelease + servosToRelease (currently-bound slots not
// in usedIndices — observed-release source for realWork) and defensive
// {motor,servo} release index lists. Defensive set covers slots BF
// keeps a silkscreen default pad map for that *weren't* in
// `resource show` but can still hold a phantom pad claim (seen on
// FLYWOOF405NANO where MOTOR 5–8 default to B05/C09/B04/C08). Without
// the defensive prefix, binding SERVO 3 → B05 silently conflicts with
// the phantom MOTOR 5 → B05 claim and the bind no-ops, leaving
// duplicate pad claims in `dump`. BF treats `resource MOTOR N NONE`
// against an already-empty slot as a harmless no-op so over-emitting
// is cheap.
function collectReleaseLines(analysis, usedMotorIndices, usedServoIndices) {
    const motorsToRelease = (analysis.motors ?? []).filter((m) => !usedMotorIndices.includes(m.index));
    const servosToRelease = (analysis.servos ?? []).filter((s) => !usedServoIndices.includes(s.index));

    const MAX_MOTOR_SLOTS = 8;
    const MAX_SERVO_SLOTS = 8;
    const observedMotorReleaseIdx = new Set(motorsToRelease.map((m) => m.index));
    const observedServoReleaseIdx = new Set(servosToRelease.map((s) => s.index));
    const defensiveMotorReleases = [];
    for (let i = 1; i <= MAX_MOTOR_SLOTS; i++) {
        if (usedMotorIndices.includes(i) || observedMotorReleaseIdx.has(i)) {
            continue;
        }
        defensiveMotorReleases.push(i);
    }
    const defensiveServoReleases = [];
    for (let i = 1; i <= MAX_SERVO_SLOTS; i++) {
        if (usedServoIndices.includes(i) || observedServoReleaseIdx.has(i)) {
            continue;
        }
        defensiveServoReleases.push(i);
    }
    return { motorsToRelease, servosToRelease, defensiveMotorReleases, defensiveServoReleases };
}

// Rebind pre-release lines + AF-rebind tracking. Pad-changing
// motors/servos need their old pad freed before any new bind lands on
// it. AF-only rebinds (pad stays, AF changes) ALSO need release+rebind:
// BF won't accept the `timer pad AFn` write while the pad is still
// bound to a peripheral, so without the release the FC silently drops
// the timer remap and the row keeps the old AF after save.
//
// Two flavors of "AF changed":
//   1. Optimizer-driven — optimizerRemaps has the pad (the
//      `optimizerRemaps.delete(pad)` path upstream removes pads whose
//      current AF already matches, so anything still in the map
//      genuinely needs to change).
//   2. User-driven — pick.af is set on the chosen alt-AF row.
//      candidatePadsForSlot's alt-AF expansion already filters out
//      entries matching current AF, so a non-null pick.af means a
//      real change.
function collectRebindReleaseLines(
    analysis,
    motorPicks,
    picks,
    usedMotorIndices,
    existingMotorByIndex,
    optimizerRemaps,
) {
    const motorRebindReleases = [];
    for (const [motorIndex] of motorPicks) {
        const existing = existingMotorByIndex.get(motorIndex);
        if (existing) {
            motorRebindReleases.push(`resource MOTOR ${motorIndex} NONE`);
        }
    }

    const motorsNeedingAfRebind = new Map();
    for (const motorIndex of usedMotorIndices) {
        if (motorPicks.has(motorIndex)) {
            continue;
        }
        const existing = existingMotorByIndex.get(motorIndex);
        if (!existing || !optimizerRemaps.has(existing.pad)) {
            continue;
        }
        motorsNeedingAfRebind.set(motorIndex, existing.pad);
        motorRebindReleases.push(`resource MOTOR ${motorIndex} NONE`);
    }

    const servoRebindReleases = [];
    const servosNeedingAfRebind = new Map();
    for (const [servoIndex, pick] of picks) {
        const existing = (analysis.servos ?? []).find((s) => s.index === servoIndex);
        if (!existing) {
            continue;
        }
        // Pad-changing servo: free old binding before motors rebind.
        // Without this, motor/servo and servo/servo swaps fail because
        // the destination pad is still owned by the old servo when
        // motors run their bind step. The new pad's bind comes via
        // bindLines, so this loop only emits the release here.
        if (existing.pad !== pick.pad) {
            servoRebindReleases.push(`resource SERVO ${servoIndex} NONE`);
            continue;
        }
        const needsAfRebind = optimizerRemaps.has(pick.pad) || pick.af != null;
        if (!needsAfRebind) {
            continue;
        }
        servosNeedingAfRebind.set(servoIndex, pick.pad);
        servoRebindReleases.push(`resource SERVO ${servoIndex} NONE`);
    }

    return { motorRebindReleases, motorsNeedingAfRebind, servoRebindReleases, servosNeedingAfRebind };
}

// Bind phase. Motors first so their timer groupings are set before any
// servo lands on a shared timer. Servos whose pad didn't change AND
// don't need an AF rebind are skipped (no bind line needed).
function collectBindLines(analysis, motorPicks, motorsNeedingAfRebind, picks, servosNeedingAfRebind) {
    const bindLines = [];
    for (const [motorIndex, pick] of motorPicks) {
        bindLines.push(`resource MOTOR ${motorIndex} ${pick.pad}`);
    }
    for (const [motorIndex, pad] of motorsNeedingAfRebind) {
        bindLines.push(`resource MOTOR ${motorIndex} ${pad}`);
    }
    for (const [servoIndex, pick] of picks) {
        const existing = (analysis.servos ?? []).find((s) => s.index === servoIndex);
        if (existing && existing.pad === pick.pad && !servosNeedingAfRebind.has(servoIndex)) {
            continue;
        }
        bindLines.push(`resource SERVO ${servoIndex} ${pick.pad}`);
    }
    return bindLines;
}

// Timer-remap phase. Emit `timer <pad> AF<n>` AFTER releases and
// BEFORE binds: pad must be free for the remap to apply cleanly, and
// the new (timer, channel) needs to be in place before the resource
// bind so BF wires up the right timer driver. Filter to pads that
// ended up in the final layout — picks the user explicitly overrode
// might land on the same pad (in which case the remap is still
// needed) but pads NOT in the final layout would be remapped for no
// reason if we didn't filter.
//
// motorPicks covers pad-changing motors; motorsNeedingAfRebind covers
// motors staying on the same pad with a changed AF; the union is
// exactly the motors whose layout actually survived selection. A
// previous version added every entry from effectiveMotorPicks, which
// leaked rejected user-overrides into finalPickPads.
function collectTimerRemapLines(motorPicks, picks, motorsNeedingAfRebind, optimizerRemaps, pickTimerRemapLines) {
    const finalPickPads = new Set();
    for (const [, pick] of motorPicks) {
        finalPickPads.add(pick.pad);
    }
    for (const [, pick] of picks) {
        finalPickPads.add(pick.pad);
    }
    for (const pad of motorsNeedingAfRebind.values()) {
        if (pad) {
            finalPickPads.add(pad);
        }
    }
    const timerRemapLines = [];
    const timerLinesEmitted = new Set();
    for (const [pad, remap] of optimizerRemaps) {
        if (!finalPickPads.has(pad)) {
            continue;
        }
        const line = `timer ${pad} AF${remap.af}`;
        if (timerLinesEmitted.has(line)) {
            continue;
        }
        timerLinesEmitted.add(line);
        timerRemapLines.push(line);
    }
    // Alt-AF picks from candidatePadsForSlot (already routed away from
    // realWork upstream). Dedup against optimizer-driven lines so a
    // pad claimed by both paths isn't remapped twice.
    for (const line of pickTimerRemapLines) {
        if (timerLinesEmitted.has(line)) {
            continue;
        }
        timerLinesEmitted.add(line);
        timerRemapLines.push(line);
    }
    return { timerRemapLines, finalPickPads };
}

// Assemble the final CLI batch. Order matters: BF rejects `resource X
// N PAD` while PAD is still claimed elsewhere, so all releases precede
// all binds.
//
// Two-phase construction:
//   (1) realWork: observed releases + LED/UART extras + motor/servo
//       rebinds. If empty, the plan is a true no-op and we return an
//       empty cliLines (preserves the zero-churn case).
//   (2) Defensive-release prefix: only prepended when real work
//       exists. Clears phantom MOTOR/SERVO claims the analyzer
//       missed before any new bind line lands on their pads.
function assembleCliLines(parts) {
    const {
        defensiveMotorReleases,
        defensiveServoReleases,
        motorsToRelease,
        servosToRelease,
        extraReleaseLines,
        motorRebindReleases,
        servoRebindReleases,
        timerRemapLines,
        bindLines,
    } = parts;

    const realWork = [];
    for (const m of motorsToRelease) {
        realWork.push(`resource MOTOR ${m.index} NONE`);
    }
    for (const s of servosToRelease) {
        realWork.push(`resource SERVO ${s.index} NONE`);
    }
    for (const line of extraReleaseLines) {
        realWork.push(line);
    }

    const cliLines = [];
    const hasRealWork =
        realWork.length > 0 ||
        motorRebindReleases.length > 0 ||
        servoRebindReleases.length > 0 ||
        bindLines.length > 0 ||
        timerRemapLines.length > 0;
    if (!hasRealWork) {
        return cliLines;
    }
    for (const i of defensiveMotorReleases) {
        cliLines.push(`resource MOTOR ${i} NONE`);
    }
    for (const i of defensiveServoReleases) {
        cliLines.push(`resource SERVO ${i} NONE`);
    }
    cliLines.push(...realWork, ...motorRebindReleases, ...servoRebindReleases, ...timerRemapLines, ...bindLines);
    return cliLines;
}

// Expose ALL planned timer remaps to callers, not just optimizer-driven
// ones. cliLines (above) merges optimizerRemaps (filtered to
// finalPickPads) + manual alt-AF picks, so the returned set must match
// what gets sent: filter optimizerRemaps the same way here, otherwise
// a caller using `timerRemaps` to preview/UI-render the plan would
// show remaps for pads that never made it into cliLines.
function mergeReturnedTimerRemaps(optimizerRemaps, finalPickPads, picks) {
    const mergedTimerRemaps = new Map();
    for (const [pad, remap] of optimizerRemaps) {
        if (finalPickPads.has(pad)) {
            mergedTimerRemaps.set(pad, remap);
        }
    }
    for (const [, pick] of picks) {
        if (pick.af != null) {
            mergedTimerRemaps.set(pick.pad, {
                af: pick.af,
                timer: pick.timer ?? null,
                channel: pick.channel ?? null,
            });
        }
    }
    return mergedTimerRemaps;
}

export function computePresetResourcePlan(analysis, preset, options = {}) {
    const warnings = [];
    if (!analysis || !preset || !Array.isArray(preset.rules) || !Array.isArray(preset.mmix)) {
        return invalidPresetPlanResult();
    }

    const { motorCount, usedMotorIndices } = deriveUsedMotorIndices(preset, options);
    const usedServoIndices = deriveUsedServoIndices(preset, options);

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
    applyUserAfOverrides(options, analysis, optimizerRemaps, warnings);
    mergeOptimizerPicks(optimized, effectiveMotorPicks, effectiveServoPicks);

    const picks = new Map();
    const motorPicks = new Map(); // motorIndex → {pad, timer, channel, source}
    const alreadyPicked = new Set();
    const extraReleaseLines = new Set(); // LED_STRIP / SERIAL_TX / SERIAL_RX
    // Alt-AF candidates surface `timer <pad> AF<n>` remap hints alongside
    // their releases. Collected separately so they emit AFTER motor/servo
    // rebind releases (same ordering as optimizerRemaps' timerRemapLines).
    const pickTimerRemapLines = new Set();

    const { defaultPadForMotor, existingMotorByIndex, motorClaimedPadsCtx, freePoolForFallback } =
        buildMotorSelectionContext(analysis, options, {
            usedMotorIndices,
            usedServoIndices,
            effectiveMotorPicks,
            effectiveServoPicks,
            allowLedStrip,
            allowUartRelease,
        });

    selectMotorPicks(
        analysis,
        usedMotorIndices,
        effectiveMotorPicks,
        allowUartRelease,
        { motorPicks, alreadyPicked, extraReleaseLines },
        { defaultPadForMotor, existingMotorByIndex, motorClaimedPadsCtx, freePoolForFallback },
        warnings,
    );

    const servoSelectCtx = buildServoSelectionContext(
        analysis,
        optimizerRemaps,
        motorPicks,
        effectiveServoPicks,
        usedServoIndices,
    );
    selectServoPicks(
        analysis,
        {
            usedMotorIndices,
            usedServoIndices,
            effectiveServoPicks,
            allowLedStrip,
            allowUartRelease,
            ...servoSelectCtx,
        },
        { picks, alreadyPicked, extraReleaseLines, pickTimerRemapLines },
        warnings,
    );

    const { motorsToRelease, servosToRelease, defensiveMotorReleases, defensiveServoReleases } = collectReleaseLines(
        analysis,
        usedMotorIndices,
        usedServoIndices,
    );
    const { motorRebindReleases, motorsNeedingAfRebind, servoRebindReleases, servosNeedingAfRebind } =
        collectRebindReleaseLines(analysis, motorPicks, picks, usedMotorIndices, existingMotorByIndex, optimizerRemaps);
    const bindLines = collectBindLines(analysis, motorPicks, motorsNeedingAfRebind, picks, servosNeedingAfRebind);
    const { timerRemapLines, finalPickPads } = collectTimerRemapLines(
        motorPicks,
        picks,
        motorsNeedingAfRebind,
        optimizerRemaps,
        pickTimerRemapLines,
    );

    const cliLines = assembleCliLines({
        defensiveMotorReleases,
        defensiveServoReleases,
        motorsToRelease,
        servosToRelease,
        extraReleaseLines,
        motorRebindReleases,
        servoRebindReleases,
        timerRemapLines,
        bindLines,
    });

    const mergedTimerRemaps = mergeReturnedTimerRemaps(optimizerRemaps, finalPickPads, picks);

    return {
        cliLines,
        picks,
        motorPicks,
        usedMotorIndices,
        usedServoIndices,
        motorsToRelease,
        servosToRelease,
        timerRemaps: mergedTimerRemaps,
        warnings,
    };
}
