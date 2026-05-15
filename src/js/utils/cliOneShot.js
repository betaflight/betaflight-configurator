// Generic "send CLI command, capture output" helper + parsers for
// the introspection commands we lean on: `resource show`, `timer show`,
// `timer <pad> list`, `dma show`. Wraps MSP.send_cli_command (msp.js)
// in a Promise so callers can await structured output.
//
// Read AND single-shot write paths route through readCli — ServosTab's
// applyReleaseLine and applyAfRemap send `resource <peripheral> ... NONE`
// and `timer <pad> AF<n>` lines this way. The blanket "save / reboot"
// flow still uses the raw-serial path (wingMixerCli) because `save` /
// `reboot` mid-MSP-framed-CLI has edge cases that don't show up for
// individual write commands.
//
// Format references below are from a bench-captured BF 4.6 session
// on SPEEDYBEEF405WING; formats have been stable across BF 4.x.

import MSP from "../msp";

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Run a single CLI command and resolve with its output.
 *
 * Wraps master's queue-based MSP.send_cli_command, which delivers all
 * output to its callback in one shot when the FC's END_OF_TEXT fires.
 * Inter-command pacing (so the FC has time to drain its CLI buffer
 * between back-to-back calls) is the caller's responsibility — see
 * loadSmartResourceAnalysis for the throttle pattern this module's
 * callers use on first-tab-load.
 *
 * @param {string} command - CLI command (no trailing newline)
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=3000] - hard ceiling for the FC's
 *   response. Caller should size this to the slowest command they
 *   expect (`timer` dump on a busy board can take ~1.5s).
 * @returns {Promise<{lines: string[], raw: string}>}
 */
export function readCli(command, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
        let settled = false;
        const accumulated = [];

        const finish = (err) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(hardTimer);
            if (err) {
                reject(err);
                return;
            }
            resolve({
                lines: accumulated.map((l) => l.trimEnd()),
                raw: accumulated.join("\n"),
            });
        };

        const hardTimer = setTimeout(() => {
            finish(new Error(`CLI command "${command}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        MSP.send_cli_command(
            command,
            (lines, error) => {
                if (settled) {
                    return;
                }
                if (error) {
                    finish(error);
                    return;
                }
                if (Array.isArray(lines)) {
                    for (const l of lines) {
                        accumulated.push(l);
                    }
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
// Special case: `dma show` emits UART DMA names with the index embedded
// in the token (e.g. "USART2_TX", "UART6_RX") rather than space-separated.
// Without unwrapping that, the analyzer drops null-index UART entries and
// UART DMA disappears for boards that print this form.
function parsePeripheralBody(body) {
    const trimmed = body.trim();
    if (!trimmed || trimmed === "FREE") {
        return { peripheral: "FREE", index: null };
    }
    const m = /^([A-Z][A-Z0-9_]*)(?:\s+(\d+))?$/.exec(trimmed);
    if (!m) {
        return null;
    }
    const peripheral = m[1];
    let index = m[2] ? Number(m[2]) : null;
    if (index === null) {
        const uartMatch = /^(?:USART|UART)(\d+)_(?:TX|RX)$/.exec(peripheral);
        if (uartMatch) {
            index = Number(uartMatch[1]);
        }
    }
    return { peripheral, index };
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
const PAD_RE = /^[A-Z]\d{2}$/i;
const PERIPHERAL_NAME_RE = /^[A-Z][A-Z0-9_]*$/i;
const DIGITS_RE = /^\d+$/;

// Classic PAD:BODY format. Split on the first ":" with indexOf rather
// than regex backtracking against `\s*:\s*`. Returns the parsed entry
// or null when the line isn't this shape.
function parseClassicResourceLine(line) {
    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) {
        return null;
    }
    const head = line.slice(0, colonIdx).trim();
    if (!PAD_RE.test(head)) {
        return null;
    }
    const body = parsePeripheralBody(line.slice(colonIdx + 1).trim());
    if (!body) {
        return null;
    }
    return { pad: head.toUpperCase(), ...body };
}

// Dump-style `resource NAME INDEX PAD` format. Tokenise by whitespace
// and validate each piece; cheaper to reason about than a single multi-
// group anchored regex. Returns null for unrecognised shapes and for
// the explicit "NONE" pad (skipping released entries).
function parseDumpResourceLine(line) {
    if (!line.toLowerCase().startsWith("resource ")) {
        return null;
    }
    const tokens = line.split(/\s+/);
    if (
        tokens.length !== 4 ||
        !PERIPHERAL_NAME_RE.test(tokens[1]) ||
        !DIGITS_RE.test(tokens[2]) ||
        !(tokens[3].toUpperCase() === "NONE" || PAD_RE.test(tokens[3]))
    ) {
        return null;
    }
    const pad = tokens[3].toUpperCase();
    if (pad === "NONE") {
        return null;
    }
    return {
        pad,
        peripheral: tokens[1].toUpperCase(),
        index: Number(tokens[2]),
    };
}

export function parseResourceShow(input) {
    const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
    const out = [];
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }
        const entry = parseClassicResourceLine(line) ?? parseDumpResourceLine(line);
        if (entry) {
            out.push(entry);
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
// Returns { timer, standaloneEntry } if `head` is a TIM<digits> header
// (three-char prefix + digits, fully bounded), else null. `standaloneEntry`
// is the row to push immediately when the header carries an inline body
// (e.g. `TIM3: FREE`); null when the header only sets context for indented
// CH children below it.
function parseTimerHeader(head, tail) {
    if (head.length <= 3 || head.slice(0, 3).toUpperCase() !== "TIM" || !DIGITS_RE.test(head.slice(3))) {
        return null;
    }
    const timer = Number(head.slice(3));
    if (tail.length === 0) {
        return { timer, standaloneEntry: null };
    }
    const parsed = parsePeripheralBody(tail);
    if (!parsed) {
        return { timer, standaloneEntry: null };
    }
    return { timer, standaloneEntry: { timer, channel: null, ...parsed } };
}

// Returns the channel entry for a CH<digits>[N] line under `currentTimer`,
// or null if `head` isn't a valid channel line or `tail` doesn't parse.
function parseTimerChannelLine(currentTimer, head, tail) {
    if (head.length <= 2 || head.slice(0, 2).toUpperCase() !== "CH") {
        return null;
    }
    let chBody = head.slice(2);
    const complementary = chBody.endsWith("N") || chBody.endsWith("n");
    if (complementary) {
        chBody = chBody.slice(0, -1);
    }
    if (!DIGITS_RE.test(chBody)) {
        return null;
    }
    const parsed = parsePeripheralBody(tail);
    if (!parsed) {
        return null;
    }
    return {
        timer: currentTimer,
        channel: Number(chBody),
        complementary,
        ...parsed,
    };
}

export function parseTimerShow(input) {
    const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
    const out = [];
    let currentTimer = null;
    for (const rawLine of lines) {
        // Detect indent BEFORE trim so child CH lines stay distinguishable
        // from sibling TIM headers after we strip whitespace.
        const isIndented = rawLine.startsWith(" ") || rawLine.startsWith("\t");
        const line = rawLine.trim();
        if (!line) {
            continue;
        }

        const colonIdx = line.indexOf(":");
        if (colonIdx <= 0) {
            continue;
        }
        const head = line.slice(0, colonIdx).trim();
        const tail = line.slice(colonIdx + 1).trim();

        if (!isIndented) {
            const header = parseTimerHeader(head, tail);
            if (header) {
                if (header.standaloneEntry) {
                    out.push(header.standaloneEntry);
                    currentTimer = null;
                } else {
                    currentTimer = header.timer;
                }
                continue;
            }
        }
        if (currentTimer !== null) {
            const channelEntry = parseTimerChannelLine(currentTimer, head, tail);
            if (channelEntry) {
                out.push(channelEntry);
            }
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
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }

        // Format: "DMA<n> Stream <n>: BODY". Split on first ":" then
        // tokenise the head — avoids backtracking against `\s*:\s*`
        // patterns in a single regex.
        const colonIdx = line.indexOf(":");
        if (colonIdx <= 0) {
            continue;
        }
        const headTokens = line.slice(0, colonIdx).trim().split(/\s+/);
        if (
            headTokens.length !== 3 ||
            !headTokens[0].toUpperCase().startsWith("DMA") ||
            !DIGITS_RE.test(headTokens[0].slice(3)) ||
            headTokens[1].toUpperCase() !== "STREAM" ||
            !DIGITS_RE.test(headTokens[2])
        ) {
            continue;
        }
        const body = parsePeripheralBody(line.slice(colonIdx + 1).trim());
        if (!body) {
            continue;
        }
        out.push({
            controller: Number(headTokens[0].slice(3)),
            stream: Number(headTokens[2]),
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
            if (pending) {
                out.push(pending);
            }
            pending = { pad: ti[1].toUpperCase(), af: Number(ti[2]), timer: null, channel: null };
            continue;
        }
        if (pending) {
            const pm = /^\s*#\s*pin\s+(\S+)\s*:\s*TIM(\d+)\s+CH(\d+)N?/i.exec(line);
            if (pm?.[1].toUpperCase() === pending.pad) {
                pending.timer = Number(pm[2]);
                pending.channel = Number(pm[3]);
            }
        }
    }
    if (pending) {
        out.push(pending);
    }
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
        if (!m) {
            continue;
        }
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
    if (typeof pad !== "string") {
        return [];
    }
    // Strict pad validation. Caller-supplied strings flow into a CLI
    // command, so anything outside the BF pin shape (single letter +
    // two digits, e.g. "B07") could turn `timer <pad> list` into an
    // unintended command — defence-in-depth even though current callers
    // already feed parseResourceShow output.
    const trimmed = pad.trim();
    if (!PAD_RE.test(trimmed)) {
        return [];
    }
    const { lines } = await readCli(`timer ${trimmed} list`, opts);
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
// Per-pad worker for discoverPadTimerOptions. Returns true if a CLI
// command was issued (caller should apply the inter-command throttle),
// false when the pad was skipped (invalid string or already discovered).
async function discoverOnePadTimerOptions(out, pad, opts) {
    if (typeof pad !== "string" || pad.length === 0) {
        return false;
    }
    // Single normalize+trim pass: callers occasionally pass whitespace-
    // padded entries (older config-import paths). Without the trim,
    // " B07 " gets stored under " B07 " and later case-folded lookups
    // like `padTimerOptions.get("B07")` miss.
    const normalizedPad = pad.trim().toUpperCase();
    if (normalizedPad.length === 0 || out.has(normalizedPad)) {
        return false;
    }
    // Per-pad isolation: readCli rejects on timeout, so a single flaky
    // `timer <pad> list` (slow USB, FC mid-DMA, etc.) would otherwise
    // unwind the loop and silently drop every pad after it. Catch and
    // fall through with an empty array — that's the "checked, none
    // available" state the doc promises and matches the FC-didn't-
    // recognize-the-pin path.
    try {
        out.set(normalizedPad, await readTimerOptionsForPin(normalizedPad, opts));
    } catch (e) {
        console.warn(`Servos: timer ${normalizedPad} list failed, skipping pad`, e);
        out.set(normalizedPad, []);
    }
    return true;
}

export async function discoverPadTimerOptions(pads, opts = {}) {
    const out = new Map();
    if (!Array.isArray(pads)) {
        return out;
    }
    // Inter-command throttle: master's send_cli_command queues serially
    // but the FC needs a beat to drain its CLI buffer between back-to-back
    // `timer <pad> list` requests. Without this delay, later responses
    // can come back empty (or get mis-attributed to the previous pad).
    // 200ms is the bench-tuned floor — partial responses started showing
    // up below ~150ms on slower USB links.
    const interCommandDelayMs = opts.interCommandDelayMs ?? 200;
    // Optional cancellation hook: caller passes `() => isMounted.value` (or
    // an AbortSignal-style predicate). Checked at top of each pad iteration
    // AND after the inter-command throttle so a tab-switch mid-scan stops
    // queueing further `timer <pad> list` commands rather than bleeding
    // them into the next tab's CLI/MSP traffic. Falsy/missing predicate
    // means "always continue" — preserves the prior no-cancel behavior.
    const shouldContinue = typeof opts.shouldContinue === "function" ? opts.shouldContinue : () => true;
    for (const pad of pads) {
        if (!shouldContinue()) {
            break;
        }
        const issued = await discoverOnePadTimerOptions(out, pad, opts);
        if (issued && interCommandDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, interCommandDelayMs));
            // Re-check after the throttle wait: cancellation that lands
            // DURING the 200ms throttle would otherwise still send the next
            // pad's `timer <pad> list` command before the loop exits.
            if (!shouldContinue()) {
                break;
            }
        }
    }
    return out;
}
