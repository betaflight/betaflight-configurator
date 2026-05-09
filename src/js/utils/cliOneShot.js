// Generic "send CLI command, capture output" helper + parsers for
// the three introspection commands we lean on: `resource show`,
// `timer show`, `dma show`. Wraps MSP.send_cli_command (msp.js) in
// a Promise so callers can await structured output.
//
// Use for READ-ONLY CLI introspection. Write operations (mmix,
// resource reassignment, save) keep going through wingMixerCli's
// raw-serial path since `save` / `reboot` mid-MSP-framed-CLI has
// edge cases.
//
// Format references below are from a bench-captured BF 4.6 session
// on SPEEDYBEEF405WING; formats have been stable across BF 4.x.

import MSP from "../msp";

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Run a single CLI command and resolve with its output.
 *
 * Accumulates lines across multiple cli_callback invocations and settles
 * on a short quiescence window. Older BF firmware (4.5 and below) emits
 * END_OF_TEXT mid-response for long commands like `resource show`, which
 * fires the callback before the full output has arrived. The previous
 * "settle on first callback" behavior truncated those responses — e.g.
 * `resource show` on a stock 8-motor target showed only the first 4
 * motors in the analyzer. Newer BF emits a single END_OF_TEXT at the
 * end so the quiescence path collapses to the same one-shot behavior.
 *
 * @param {string} command - CLI command (no trailing newline)
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=3000]   - hard ceiling
 * @param {number} [opts.quiescenceMs=250] - settle once no new chunks
 *   arrive for this long. 250ms is conservative enough to span the
 *   inter-chunk gap on slow USB links yet short enough to keep the
 *   Hardware tab snappy.
 * @returns {Promise<{lines: string[], raw: string}>}
 */
export function readCli(command, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
        let settled = false;
        const accumulated = [];

        const finish = (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(hardTimer);
            if (err) {
                reject(err);
                return;
            }
            resolve({
                lines: accumulated.map((l) => l.replace(/\s+$/, "")),
                raw: accumulated.join("\n"),
            });
        };

        const hardTimer = setTimeout(() => {
            finish(new Error(`CLI command "${command}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        MSP.send_cli_command(
            command,
            (lines, error) => {
                if (settled) return;
                if (error) {
                    finish(error);
                    return;
                }
                if (Array.isArray(lines)) {
                    for (const l of lines) accumulated.push(l);
                }
                // Master's send_cli_command fires the callback once with the
                // full lines array. Resolve immediately rather than waiting
                // for the quiescence timer — there are no more chunks coming.
                finish(null);
            },
            { timeoutMs },
        );
    });
}

// ─── parsers ─────────────────────────────────────────────────────

// Peripheral line body: "FREE" or "NAME" or "NAME INDEX".
// NAME is upper-case letters and underscores (GYRO_CS, SPI_SDI,
// LED_STRIP, USB, MOTOR, SERVO, SERIAL_TX, ADC_BATT, ...).
function parsePeripheralBody(body) {
    const trimmed = body.trim();
    if (!trimmed || trimmed === "FREE") {
        return { peripheral: "FREE", index: null };
    }
    const m = /^([A-Z][A-Z0-9_]*)(?:\s+(\d+))?$/.exec(trimmed);
    if (!m) return null;
    return {
        peripheral: m[1],
        index: m[2] ? Number(m[2]) : null,
    };
}

/**
 * Parse the body of `resource show`. Handles both BF output formats:
 *
 *   1. "PAD: NAME INDEX"                e.g. "B07: MOTOR 1"
 *      (classic `resource show` layout — used on older + stock BF builds)
 *
 *   2. "resource NAME INDEX PAD"        e.g. "resource MOTOR 1 B07"
 *      (dump-style `resource show` output — some BF forks emit this;
 *      also matches `diff all` / `dump` output verbatim)
 *
 * Lines that match neither (headers, blanks, comments) are skipped.
 * "resource NAME INDEX NONE" is treated as a released/empty binding and
 * filtered out (same as if the pad weren't listed at all), so downstream
 * analysis sees only currently-bound resources.
 *
 * Examples:
 *   "B07: MOTOR 1"          → { pad: "B07", peripheral: "MOTOR", index: 1 }
 *   "A00: FREE"             → { pad: "A00", peripheral: "FREE", index: null }
 *   "resource LED_STRIP 1 A00" → { pad: "A00", peripheral: "LED_STRIP", index: 1 }
 *   "resource MOTOR 5 NONE" → skipped (empty binding)
 *
 * @param {string[]|string} input - lines array or raw multi-line string
 * @returns {Array<{pad: string, peripheral: string, index: number|null}>}
 */
export function parseResourceShow(input) {
    const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
    const out = [];
    for (const line of lines) {
        // Classic PAD:BODY format first.
        const m = /^\s*([A-Z]\d{2})\s*:\s*(.+?)\s*$/i.exec(line);
        if (m) {
            const body = parsePeripheralBody(m[2]);
            if (!body) continue;
            out.push({ pad: m[1].toUpperCase(), ...body });
            continue;
        }
        // Dump-style `resource NAME INDEX PAD` format fallback.
        const dm = /^\s*resource\s+([A-Z][A-Z0-9_]*)\s+(\d+)\s+([A-Z]\d{2}|NONE)\s*$/i.exec(line);
        if (dm) {
            const pad = dm[3].toUpperCase();
            if (pad === "NONE") continue; // released binding — not a live claim
            out.push({
                pad,
                peripheral: dm[1].toUpperCase(),
                index: Number(dm[2]),
            });
        }
    }
    return out;
}

/**
 * Parse `timer show` — hierarchical TIMn / CH block format.
 *
 * Example input block:
 *   TIM4:
 *       CH1 : MOTOR 2
 *       CH2 : MOTOR 1
 *   TIM2: FREE
 *
 * A "TIM?: FREE" line stands on its own (no children).
 * A "TIM?:" line (no body) is followed by indented "CH? : X" lines
 * until the next TIM line or end of input.
 *
 * @param {string[]|string} input
 * @returns {Array<{timer: number, channel: number|null, peripheral: string, index: number|null}>}
 *   - For FREE timers with no channels declared: channel=null, peripheral="FREE"
 *   - For active timers: one entry per active channel
 */
export function parseTimerShow(input) {
    const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
    const out = [];
    let currentTimer = null;
    for (const line of lines) {
        const timerHeader = /^\s*TIM(\d+)\s*:\s*(.*?)\s*$/i.exec(line);
        if (timerHeader) {
            currentTimer = Number(timerHeader[1]);
            const body = timerHeader[2];
            if (body.length > 0) {
                const parsed = parsePeripheralBody(body);
                if (parsed) {
                    out.push({ timer: currentTimer, channel: null, ...parsed });
                    currentTimer = null; // standalone entry, no children expected
                }
            }
            continue;
        }
        const chMatch = /^\s+CH(\d+)(N?)\s*:\s*(.+?)\s*$/i.exec(line);
        if (chMatch && currentTimer !== null) {
            const body = parsePeripheralBody(chMatch[3]);
            if (!body) continue;
            out.push({
                timer: currentTimer,
                channel: Number(chMatch[1]),
                complementary: chMatch[2] === "N",
                ...body,
            });
        }
    }
    return out;
}

/**
 * Parse `dma show`.
 *
 * Example lines:
 *   DMA1 Stream 0: SPI_SDI 3
 *   DMA1 Stream 6: TIMUP 4
 *   DMA2 Stream 0: ADC 1
 *   DMA1 Stream 1: FREE
 *
 * @param {string[]|string} input
 * @returns {Array<{controller: number, stream: number, peripheral: string, index: number|null}>}
 */
export function parseDmaShow(input) {
    const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
    const out = [];
    for (const line of lines) {
        const m = /^\s*DMA(\d+)\s+Stream\s+(\d+)\s*:\s*(.+?)\s*$/i.exec(line);
        if (!m) continue;
        const body = parsePeripheralBody(m[3]);
        if (!body) continue;
        out.push({
            controller: Number(m[1]),
            stream: Number(m[2]),
            ...body,
        });
    }
    return out;
}

/**
 * Parse the full `timer` dump output (NOT `timer show`). Returns
 * the set of pads that have a timer AF declared — these are the
 * PWM-capable pads on the board, whether currently claimed or not.
 *
 * Example input lines:
 *   timer B07 AF2
 *   # pin B07: TIM4 CH2 (AF2)
 *   timer B06 AF2
 *   # pin B06: TIM4 CH1 (AF2)
 *
 * Comment lines starting with "#" carry the human-readable
 * TIM/CH mapping; we parse them too so the caller can get timer/
 * channel info per pad without needing a second dump.
 *
 * @param {string[]|string} input
 * @returns {Array<{pad: string, af: number, timer: number|null, channel: number|null}>}
 */
export function parseTimerDump(input) {
    const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
    const out = [];
    let pending = null;
    for (const line of lines) {
        const ti = /^\s*timer\s+(\S+)\s+AF(\d+)/i.exec(line);
        if (ti) {
            if (pending) out.push(pending);
            pending = { pad: ti[1].toUpperCase(), af: Number(ti[2]), timer: null, channel: null };
            continue;
        }
        if (pending) {
            const pm = /^\s*#\s*pin\s+(\S+)\s*:\s*TIM(\d+)\s+CH(\d+)N?/i.exec(line);
            if (pm && pm[1].toUpperCase() === pending.pad) {
                pending.timer = Number(pm[2]);
                pending.channel = Number(pm[3]);
            }
        }
    }
    if (pending) out.push(pending);
    return out;
}

/**
 * Parse `timer <pin> list` output. Lists every (timer, channel, AF)
 * tuple the firmware's DEF_TIM table allows for that pin on this MCU
 * — i.e. what timer remaps are physically possible. Distinct from
 * `parseTimerDump` which only reports the pin's CURRENT binding.
 *
 * Example input lines (from cli.c cliTimer "list" branch):
 *   # AF1: TIM2 CH1
 *   # AF2: TIM5 CH1
 *   # AF3: TIM8 CH1N
 *
 * The trailing "N" marks complementary channels. We capture it so
 * callers planning DShot remaps can avoid complementary outputs
 * (which can't drive DShot on most MCUs).
 *
 * @param {string[]|string} input
 * @returns {Array<{af: number, timer: number, channel: number, complementary: boolean}>}
 */
export function parseTimerOptions(input) {
    const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
    const out = [];
    for (const line of lines) {
        const m = /^\s*#\s*AF(\d+):\s*TIM(\d+)\s+CH(\d+)(N?)\s*$/i.exec(line);
        if (!m) continue;
        out.push({
            af: Number(m[1]),
            timer: Number(m[2]),
            channel: Number(m[3]),
            complementary: m[4].toUpperCase() === "N",
        });
    }
    return out;
}

/**
 * Issue `timer <pad> list` against the FC and return the parsed
 * available-AF options for that pad. Returns [] if the firmware
 * doesn't recognize the pin or the response is empty (older BF
 * builds without the `list` subcommand).
 *
 * @param {string} pad - port+pin string e.g. "B07", "A05"
 * @param {object} [opts] - passed through to readCli (timeout, abort, etc.)
 * @returns {Promise<Array<{af, timer, channel, complementary}>>}
 */
export async function readTimerOptionsForPin(pad, opts = {}) {
    if (typeof pad !== "string" || pad.length === 0) return [];
    const { lines } = await readCli(`timer ${pad} list`, opts);
    return parseTimerOptions(lines);
}

/**
 * Discover available timer/AF options for a list of pads. Issues
 * `timer <pad> list` serially for each pad and returns a Map keyed
 * by pad.
 *
 * Cost: ~100ms per pad (CLI_LINE_DELAY_MS in readCli). For a typical
 * wing optimizer pool of 8–12 pads this adds ~1–1.5s to Discovery
 * scan. Caller should populate this only for the candidate pool, not
 * every pad on the board.
 *
 * Pads that return no options (FC didn't recognize the pin, or older
 * firmware without the `list` subcommand) are still included with an
 * empty array so the caller can distinguish "checked, none available"
 * from "not checked yet."
 *
 * @param {string[]} pads - list of port+pin strings, e.g. ["B07", "A05"]
 * @param {object} [opts] - passed through to readCli
 * @returns {Promise<Map<string, Array<{af, timer, channel, complementary}>>>}
 */
export async function discoverPadTimerOptions(pads, opts = {}) {
    const out = new Map();
    if (!Array.isArray(pads)) return out;
    // Inter-command throttle: master's send_cli_command queues serially
    // but the FC needs a beat to drain its CLI buffer between back-to-back
    // `timer <pad> list` requests. Without this delay, later responses
    // can come back empty (or get mis-attributed to the previous pad).
    // 100ms matches what the pre-rebase quiescence timer effectively
    // gave us before we switched to single-shot resolve.
    const interCommandDelayMs = opts.interCommandDelayMs ?? 200;
    for (const pad of pads) {
        if (typeof pad !== "string" || pad.length === 0) continue;
        const upper = pad.toUpperCase();
        if (out.has(upper)) continue;
        out.set(upper, await readTimerOptionsForPin(upper, opts));
        if (interCommandDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, interCommandDelayMs));
        }
    }
    return out;
}
