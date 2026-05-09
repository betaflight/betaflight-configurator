// DMA conflict detection for the wing pad optimizer's AF-remap layer.
//
// Scope (v1) — F4 burst-DSHOT shared-timer reject. STM32F4xx routes
// DSHOT through timer-burst DMA (DMAR), and burst owns the timer's
// stream across all channels. Two motors landing on the same timer
// can't both run independent DSHOT (they'd share one burst protocol
// at best, and bidir-DSHOT telemetry can't be split). The optimizer
// can't verify what firmware will do, so reject conservatively when
// the planned AF picks place ≥2 motors on the same timer.
//
// F7 and later (stream+request, DMAMUX) don't carry this constraint.
// AT32 Artery clones inherit the F4-class peripheral block — treated
// as F4-like.
//
// What v1 deliberately skips:
//   - Per-MCU (timer, channel) → DMA stream prediction. Without
//     bundled DEF_TIM data we can't predict which stream a remapped
//     (timer, channel) WILL land on, so we can't reject "your remap
//     lands on a stream gyro SPI is using." Future v2 with bundled
//     `timer_def_stm32xxx.h` data closes this gap; bench-validate v1
//     first to see whether the gap bites in practice.
//
//   - DMAMUX request collisions on H7/G4 same-stream sharing.
//
// Pure: takes already-parsed inputs, returns a verdict object. No
// CLI I/O, no FC singleton access.

const F4_LIKE_FAMILIES = new Set(["F4", "AT32"]);

/**
 * @param {object} args
 * @param {string|null} args.mcuFamily - from mcuFamilyFromName.
 *   Anything not in F4_LIKE_FAMILIES skips DMA reasoning entirely.
 * @param {Array<{motorIndex: number, pad: string, timer: number, channel: number}>} args.motorPicks
 *   - the optimizer's planned motor placements after AF picks have
 *   been resolved (so timer/channel reflect the picked AF, not the
 *   pad's current binding).
 * @returns {{
 *   hasConflict: boolean,
 *   conflicts: Array<{type: string, message: string, motorIndices: number[], timer: number}>,
 * }}
 */
export function predictDmaConflict({ mcuFamily = null, motorPicks = [] } = {}) {
    const conflicts = [];

    if (!F4_LIKE_FAMILIES.has(mcuFamily)) {
        return { hasConflict: false, conflicts };
    }
    if (!Array.isArray(motorPicks) || motorPicks.length < 2) {
        return { hasConflict: false, conflicts };
    }

    const motorsByTimer = new Map();
    for (const m of motorPicks) {
        if (m == null || m.timer == null) continue;
        const list = motorsByTimer.get(m.timer) ?? [];
        list.push(m);
        motorsByTimer.set(m.timer, list);
    }
    for (const [timer, list] of motorsByTimer) {
        if (list.length > 1) {
            const indices = list.map((m) => m.motorIndex);
            conflicts.push({
                type: "f4_burst_shared_timer",
                message: `F4 burst-DMA: motors ${indices.join(", ")} share TIM${timer} — DSHOT can't drive both independently`,
                motorIndices: indices,
                timer,
            });
        }
    }

    return { hasConflict: conflicts.length > 0, conflicts };
}
