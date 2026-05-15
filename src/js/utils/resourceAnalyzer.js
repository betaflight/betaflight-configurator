// Wing-specific interpretation of the raw output from cliOneShot's
// three show-command parsers. Feeds the Hardware sub-tab.
//
// Pure function — no CLI I/O, no DOM. Feed parsed objects in, get a
// structured report out. Golden-fixture-testable.
//
// The three inputs don't have pad info in common: resource-show is
// keyed on pad, timer-show and dma-show are keyed on (peripheral,
// index). We join on (peripheral, index) to resolve a given pad's
// timer + DMA stream.

// Pads whose role is physical / board-wired and should NEVER be
// auto-remapped. Everything else (MOTOR, SERVO, LED_STRIP) is fair
// game for the recommender.
const HARDWARE_FIXED_PERIPHERALS = new Set([
    "USB",
    "SPI_SCK",
    "SPI_SDI",
    "SPI_SDO",
    "I2C_SCL",
    "I2C_SDA",
    "ADC_BATT",
    "ADC_CURR",
    "ADC_RSSI",
    "SDCARD_CS",
    "GYRO_CS",
    "OSD_CS",
    "BEEPER",
    "LED", // status LED (distinct from LED_STRIP)
    "PINIO",
    "PREINIT",
    "CAMERA_CONTROL",
]);

function key(peripheral, index) {
    return `${peripheral}:${index ?? ""}`;
}

function buildTimerLookup(timerShow) {
    const m = new Map();
    for (const e of timerShow) {
        if (e.channel === null || e.peripheral === "FREE") {
            continue;
        }
        m.set(key(e.peripheral, e.index), {
            timer: e.timer,
            channel: e.channel,
            complementary: !!e.complementary,
        });
    }
    return m;
}

function buildDmaLookup(dmaShow) {
    const m = new Map();
    for (const e of dmaShow) {
        if (e.peripheral === "FREE" || e.peripheral === "TIMUP") {
            continue;
        }
        m.set(key(e.peripheral, e.index), {
            controller: e.controller,
            stream: e.stream,
        });
    }
    return m;
}

// UART DMA can show up in `dma show` under several peripheral names
// depending on BF version and MCU — USARTn_TX, UARTn_TX, SERIAL_TX, etc.
// Collapse those aliases into a single (direction, index) lookup so we
// can answer "is UARTn_TX using DMA" regardless of exact spelling.
function buildUartDmaLookup(dmaShow) {
    const m = new Map();
    for (const e of dmaShow) {
        if (e.peripheral === "FREE" || e.index === null) {
            continue;
        }
        const p = e.peripheral;
        const tx = /^(?:U?S?ART|SERIAL|UART)_?TX$|_TX$/i.test(p) && p.includes("TX");
        const rx = /^(?:U?S?ART|SERIAL|UART)_?RX$|_RX$/i.test(p) && p.includes("RX");
        if (!tx && !rx) {
            continue;
        }
        m.set(`${tx ? "tx" : "rx"}:${e.index}`, {
            controller: e.controller,
            stream: e.stream,
        });
    }
    return m;
}

function collectTimupStreams(dmaShow) {
    const s = new Set();
    for (const e of dmaShow) {
        if (e.peripheral === "TIMUP" && e.index !== null) {
            s.add(e.index);
        }
    }
    return s;
}

function collectSerials(txMap, rxMap, uartDmaLookup) {
    const indices = new Set([...txMap.keys(), ...rxMap.keys()]);
    const out = [];
    for (const idx of indices) {
        out.push({
            index: idx,
            txPad: txMap.get(idx) ?? null,
            rxPad: rxMap.get(idx) ?? null,
            txDma: uartDmaLookup.get(`tx:${idx}`) ?? null,
            rxDma: uartDmaLookup.get(`rx:${idx}`) ?? null,
        });
    }
    out.sort((a, b) => a.index - b.index);
    return out;
}

function deriveWarnings({ motors, servos, ledStrips, freeDmaStreams, padDmaDefaults }) {
    const w = [];

    for (const m of motors) {
        // Motor has DMA when (a) timer-burst is active for its
        // timer, (b) the resource has an explicit `dma MOTOR N <opt>`
        // binding visible in `dma show`, OR (c) the pin has a default
        // DMA option in the bare `dma` dump that the firmware
        // allocates at boot. Without (c) the configurator was
        // false-positive-warning every default-DMA motor: stock BF
        // doesn't emit `dma MOTOR N <opt>` lines for default options,
        // so `m.dmaStream` was null even when DMA was actually fine.
        // Bench-confirmed on TMOTORF7X2 where motors had clean DMA
        // via pin defaults but the warning fired anyway.
        const hasPinDefault =
            padDmaDefaults instanceof Map &&
            padDmaDefaults.get(m.pad) != null &&
            padDmaDefaults.get(m.pad).stream != null;
        if (!m.bidirBurst && !m.dmaStream && !hasPinDefault) {
            w.push({
                severity: "warn",
                code: "motor_no_dma",
                message: `MOTOR ${m.index} on ${m.pad} has no DMA stream or TIMUP burst — bidir DSHOT may fall back to bit-bang`,
            });
        }
    }

    const motorTimers = new Set(motors.map((m) => m.timer).filter((t) => t !== null));
    for (const s of servos) {
        if (s.timer !== null && motorTimers.has(s.timer)) {
            w.push({
                severity: "error",
                code: "servo_on_motor_timer",
                message: `SERVO ${s.index} on ${s.pad} shares TIM${s.timer} with a motor — servo PWM frequency will fight DSHOT timing`,
            });
        }
    }

    if (freeDmaStreams.length < 3) {
        w.push({
            severity: "info",
            code: "dma_tight",
            message: `Only ${freeDmaStreams.length} free DMA stream${freeDmaStreams.length === 1 ? "" : "s"} remaining — future peripherals may fail to allocate`,
        });
    }

    for (const ls of ledStrips) {
        w.push({
            severity: "info",
            code: "led_strip_cost",
            message: `LED_STRIP on ${ls.pad} claims TIM${ls.timer ?? "?"} + DMA${ls.dmaStream ? `${ls.dmaStream.controller}/S${ls.dmaStream.stream}` : "?"}. Release it if you need headroom.`,
        });
    }

    return w;
}

// Classify each `resource show` entry into motors / servos / ledStrips,
// the serial TX/RX index→pad maps, and hardware-fixed pads — resolving
// each entry's timer + DMA hit (with timerDump / dmaDump fallbacks for
// the bitbang and default-DMA cases documented inline). Extracted from
// analyzeResources to keep that function's cognitive complexity down.
function processResourceEntries(resourceShow, timerByKey, dmaByKey, timerDump, dmaDump, timupStreams) {
    const motors = [];
    const servos = [];
    const ledStrips = [];
    const serialTx = new Map();
    const serialRx = new Map();
    const hardwareFixedPads = [];
    let freePadsCount = 0;

    for (const entry of resourceShow) {
        if (entry.peripheral === "FREE") {
            freePadsCount++;
            continue;
        }
        const p = entry.peripheral;
        let timerHit = timerByKey.get(key(p, entry.index)) || null;
        // Bitbang fallback: when motors fall back to DSHOT bit-bang,
        // `timer show` reports the pin's slot under DSHOT_BITBANG <n>
        // instead of MOTOR <n>, so the (MOTOR, index) keyed lookup
        // above returns null even though the pin DOES have a timer
        // assignment. The bare `timer` dump (timerDump) is pin-keyed
        // and authoritative regardless of bitbang state — fall back
        // to it so the Hardware tab's Motor/Servo rows show the
        // actual TIMx CHy instead of `—`. Bench-confirmed on
        // TMOTORF7X2 where M1-M4 land on TIM3 but `timer show`
        // reports DSHOT_BITBANG 2 on TIM8.
        if (!timerHit && Array.isArray(timerDump)) {
            const dumpHit = timerDump.find((t) => t.pad === entry.pad);
            if (dumpHit && dumpHit.timer != null) {
                timerHit = { timer: dumpHit.timer, channel: dumpHit.channel, complementary: false };
            }
        }
        const dmaHit = dmaByKey.get(key(p, entry.index)) || null;

        if (p === "MOTOR") {
            const bidirBurst = timerHit?.timer != null && timupStreams.has(timerHit.timer);
            // dmaStream fallback: BF only emits `dma MOTOR N <opt>`
            // entries (which dmaHit reads) when a non-default option
            // is set. Default-DMA motors get DMA via their pin's
            // option-0 binding, surfaced via `dma pin <pad>` queries
            // into `padDmaDefaults` upstream. When the resource-keyed
            // dmaHit is null but the pin has a default, expose THAT
            // as the motor's dmaStream so the Hardware tab "DMA /
            // Mode" column shows the real stream instead of "no DMA".
            // Pre-fix: every default-DMA motor showed "no DMA";
            // post-fix: shows DMA1/S0 etc. matching the Pin
            // Assignment badge.
            let resolvedDma = dmaHit;
            if (!resolvedDma && dmaDump && Array.isArray(dmaDump.pads)) {
                const pinDma = dmaDump.pads.find((p2) => p2.pad === entry.pad);
                if (pinDma && pinDma.opt !== null && pinDma.stream !== null) {
                    resolvedDma = {
                        controller: pinDma.controller,
                        stream: pinDma.stream,
                    };
                }
            }
            motors.push({
                index: entry.index ?? 0,
                pad: entry.pad,
                timer: timerHit?.timer ?? null,
                channel: timerHit?.channel ?? null,
                dmaStream: resolvedDma,
                bidirBurst,
            });
        } else if (p === "SERVO") {
            servos.push({
                index: entry.index ?? 0,
                pad: entry.pad,
                timer: timerHit?.timer ?? null,
                channel: timerHit?.channel ?? null,
            });
        } else if (p === "LED_STRIP") {
            ledStrips.push({
                pad: entry.pad,
                timer: timerHit?.timer ?? null,
                channel: timerHit?.channel ?? null,
                dmaStream: dmaHit,
            });
        } else if (p === "SERIAL_TX") {
            if (entry.index !== null) {
                serialTx.set(entry.index, entry.pad);
            }
        } else if (p === "SERIAL_RX") {
            if (entry.index !== null) {
                serialRx.set(entry.index, entry.pad);
            }
        } else if (HARDWARE_FIXED_PERIPHERALS.has(p)) {
            hardwareFixedPads.push({
                pad: entry.pad,
                peripheral: p,
                index: entry.index,
            });
        }
    }

    return { motors, servos, ledStrips, serialTx, serialRx, hardwareFixedPads, freePadsCount };
}

// Spare UARTs: ports that exist (resource bound) but have no serial
// function assigned. For each, check whether the TX/RX pad is on a
// PWM-capable timer (timerDump cross-ref). Released UART pads can
// become servo outputs. UART# = identifier + 1 (BF SERIAL_PORT_USART1=0).
function buildSpareUarts(serialPorts, serials, timerDump) {
    const pwmPadSet = new Set((Array.isArray(timerDump) ? timerDump : []).map((t) => t.pad));
    const spareUarts = [];
    if (Array.isArray(serialPorts)) {
        for (const port of serialPorts) {
            if (!port) {
                continue;
            }
            const fns = Array.isArray(port.functions) ? port.functions : [];
            if (fns.length > 0) {
                continue;
            }
            const uartIndex = (port.identifier ?? -1) + 1;
            if (uartIndex <= 0) {
                continue;
            }
            const serial = serials.find((s) => s.index === uartIndex);
            if (!serial) {
                continue;
            }
            const txPwm = serial.txPad && pwmPadSet.has(serial.txPad);
            const rxPwm = serial.rxPad && pwmPadSet.has(serial.rxPad);
            if (!txPwm && !rxPwm) {
                continue;
            }
            spareUarts.push({
                index: uartIndex,
                txPad: txPwm ? serial.txPad : null,
                rxPad: rxPwm ? serial.rxPad : null,
            });
        }
    }
    return spareUarts;
}

// Pad-keyed lookups the padRecommender optimizer consumes: timer/channel
// for every pad in the `timer` dump, each pad's currently-bound AF, the
// firmware's default DMA option per pad, and the subset of timer-capable
// pads currently FREE in `resource show`.
function buildPadMaps(timerDump, dmaDump, freePads) {
    // Cross-reference timer dump with resource show to find
    // PWM-capable pads that are currently unclaimed — the pool the
    // AIO remap recommender picks from when assigning servos.
    const pwmCapableFreePads = Array.isArray(timerDump)
        ? timerDump.filter((t) => freePads.has(t.pad)).map((t) => ({ pad: t.pad, timer: t.timer, channel: t.channel }))
        : [];

    // padTimers: pad → {timer, channel} for EVERY pad that appears in
    // `timer` dump output, regardless of current claim state. The joint
    // motor+servo pad optimizer in padRecommender needs timer info
    // for silkscreen pads that aren't currently free (e.g. MOTOR 1 bound
    // at B00 — the optimizer still wants to know B00 is TIM3 CH3 so it
    // can decide whether to keep MOTOR 1 there or relocate it).
    const padTimers = new Map();
    // padCurrentAF: pad → AF number currently bound. parseTimerDump already
    // returns `af` per pad; the analyzer used to discard it. The timer-remap
    // layer in padRecommender compares planned AF picks against this
    // baseline to decide whether a `timer <pin> AF<n>` line needs emitting.
    const padCurrentAF = new Map();
    if (Array.isArray(timerDump)) {
        for (const t of timerDump) {
            padTimers.set(t.pad, { timer: t.timer, channel: t.channel });
            if (typeof t.af === "number") {
                padCurrentAF.set(t.pad, t.af);
            }
        }
    }

    // padDmaDefaults: pad → {controller, stream, channel} for the
    // firmware's default DMA option per pin. Null payload for pins
    // with no DMA option (e.g. TIM11 channel pins on F7 — servo
    // capable but DSHOT-incapable). Built from the bare `dma` (no
    // args) dump's `dma pin <pad>` entries via parseDmaPinDefaults.
    // The optimizer's DMA collision check + the motor_no_dma
    // warning fix both consume this. Empty Map when caller didn't
    // supply dmaDump (older firmware or skipped read).
    const padDmaDefaults = new Map();
    if (dmaDump && Array.isArray(dmaDump.pads)) {
        for (const p of dmaDump.pads) {
            if (p.opt === null || p.stream === null) {
                padDmaDefaults.set(p.pad, null);
            } else {
                padDmaDefaults.set(p.pad, {
                    controller: p.controller,
                    stream: p.stream,
                    channel: p.channel,
                });
            }
        }
    }

    return { padTimers, padCurrentAF, padDmaDefaults, pwmCapableFreePads };
}

/**
 * @param {object} input
 * @param {Array} input.resourceShow
 * @param {Array} input.timerShow
 * @param {Array} input.dmaShow
 * @param {Array} [input.timerDump] - optional `timer` (dump) output;
 *   when present, the analyzer returns pwmCapableFreePads (pads that
 *   have a PWM timer but currently show as FREE in resourceShow).
 *   Used by the AIO remap recommender to find servo-eligible pads
 *   without reassigning motor pads that are soldered to ESCs.
 * @param {Array} [input.serialPorts] - optional FC.SERIAL_CONFIG.ports
 *   ([{identifier, functions: string[]}]). When present, surfaces
 *   spareUarts: UARTs with no function assigned AND with at least one
 *   PWM-capable pad (TX or RX). Recommender's UART-release flow can
 *   repurpose those pads as servo outputs.
 * @param {Map<string, Array<{af, timer, channel, complementary}>>} [input.padTimerOptions]
 *   - optional pre-discovered AF options per pad (built by caller via
 *   `readTimerOptionsForPin` from cliOneShot). When present, surfaces
 *   `padTimerOptions` so the optimizer can plan `timer <pin> AF<n>`
 *   remaps. Discovery is a per-pad serial CLI roundtrip (~100ms each)
 *   so callers populate it lazily for the optimizer's candidate pool,
 *   not for every pad on the board.
 * @param {string|null} [input.mcuFamily] - optional MCU family tag
 *   ('F4'/'F7'/'H7'/'G4'/'AT32'/null) from `mcuFamilyFromName`.
 *   Required by the optimizer's F4 burst-DMA reject path.
 * @param {{resources: Array, pads: Array}|null} [input.dmaDump] -
 *   optional parsed bare `dma` (no args) dump output (from
 *   `parseDmaPinDefaults`). When present, the analyzer builds
 *   `padDmaDefaults: Map<pad, {controller, stream, channel} | null>`
 *   surfacing each pad's default DMA stream. Null payload means the
 *   pin has no DMA option (e.g. F7 TIM11 channel) — motor candidates
 *   should reject it. Source-of-truth for the optimizer's DMA
 *   collision check + the motor_no_dma warning's correctness fix.
 */
export function analyzeResources({
    resourceShow,
    timerShow,
    dmaShow,
    timerDump = [],
    serialPorts = [],
    padTimerOptions = null,
    mcuFamily = null,
    dmaDump = null,
}) {
    const timerByKey = buildTimerLookup(timerShow);
    const dmaByKey = buildDmaLookup(dmaShow);
    const uartDmaByDirIndex = buildUartDmaLookup(dmaShow);
    const timupStreams = collectTimupStreams(dmaShow);

    const { motors, servos, ledStrips, serialTx, serialRx, hardwareFixedPads, freePadsCount } = processResourceEntries(
        resourceShow,
        timerByKey,
        dmaByKey,
        timerDump,
        dmaDump,
        timupStreams,
    );

    const serials = collectSerials(serialTx, serialRx, uartDmaByDirIndex);
    const freeDmaStreams = dmaShow
        .filter((e) => e.peripheral === "FREE")
        .map(({ controller, stream }) => ({ controller, stream }));

    motors.sort((a, b) => a.index - b.index);
    servos.sort((a, b) => a.index - b.index);

    // Set<pad> of pads currently FREE. Feeds buildPadMaps' pwmCapableFreePads
    // cross-reference and is surfaced unchanged in the return object.
    const freePads = new Set(resourceShow.filter((e) => e.peripheral === "FREE").map((e) => e.pad));

    const { padTimers, padCurrentAF, padDmaDefaults, pwmCapableFreePads } = buildPadMaps(timerDump, dmaDump, freePads);

    const spareUarts = buildSpareUarts(serialPorts, serials, timerDump);

    const warnings = deriveWarnings({ motors, servos, ledStrips, freeDmaStreams, padDmaDefaults });

    return {
        motors,
        servos,
        ledStrips,
        serials,
        freePadsCount,
        // Set<pad> of pads currently FREE (peripheral === "FREE"). Used
        // by computeMotorScanPlan to gate Tier-A scratch candidates so
        // UART/PINIO/SPI bindings are never overwritten.
        freePads,
        freeDmaStreams,
        hardwareFixedPads,
        pwmCapableFreePads,
        padTimers,
        padCurrentAF,
        // padTimerOptions: pad → Array<{af, timer, channel, complementary}>.
        // Populated by caller when timer-remap planning is enabled. null
        // (default) means optimizer falls back to "treat AF as immutable."
        padTimerOptions: padTimerOptions instanceof Map ? padTimerOptions : null,
        padDmaDefaults,
        // Raw parsed `dma show` entries surfaced unchanged so the
        // optimizer can iterate non-motor non-servo consumers when
        // detecting motor-pick stream collisions. Read-only — modifying
        // this from a consumer breaks downstream lookups.
        dmaShow: Array.isArray(dmaShow) ? dmaShow : [],
        mcuFamily,
        spareUarts,
        warnings,
    };
}

export const _internal = { HARDWARE_FIXED_PERIPHERALS };
