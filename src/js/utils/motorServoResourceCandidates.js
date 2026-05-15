import { candidatePadsForSlot } from "./padRecommender.js";

export const RESOURCE_NONE = "NONE";

// Encode (pin, af) into a string the HTML <select> can carry as its value.
// Default AF is the bare pin (`"B00"`); alternate AFs append the suffix
// (`"B00@AF2"`). Caller decodes via `parseResourceOptionValue` before
// emitting MSP / CLI writes.
export function encodeResourceOptionValue(pin, af) {
    const normalizedPin = typeof pin === "string" ? pin.toUpperCase() : pin;
    if (af == null || !Number.isFinite(Number(af))) {
        return normalizedPin;
    }
    return `${normalizedPin}@AF${Number(af)}`;
}

export function parseResourceOptionValue(value) {
    if (typeof value !== "string") {
        return { pin: RESOURCE_NONE, af: null };
    }
    const match = /^([A-Z0-9]+)(?:@AF(\d+))?$/i.exec(value);
    if (!match) {
        return { pin: value.toUpperCase(), af: null };
    }
    return {
        pin: match[1].toUpperCase(),
        af: match[2] == null ? null : Number(match[2]),
    };
}

function normalizePin(pin) {
    if (typeof pin !== "string") {
        return RESOURCE_NONE;
    }
    const trimmed = pin.trim();
    return trimmed.length > 0 ? trimmed.toUpperCase() : RESOURCE_NONE;
}

// Build a Map<1-based index, newPad> from the live edited resources vs the
// FC analysis snapshot. Used to feed motorRebinds / servoRebinds into
// candidatePadsForSlot so its claimedPads check sees pads as released when
// the user has moved a row but hasn't saved yet. Skips the row being edited
// (skipIndex, 1-based) — that's currentPad's job and a same-row "rebind"
// would just block its own zero-churn candidate.
function buildRebindsMap(liveResources, analysisItems, skipIndex = null) {
    const map = new Map();
    if (!Array.isArray(liveResources) || !Array.isArray(analysisItems)) {
        return map;
    }
    for (const live of liveResources) {
        const liveIndex = (live?.index ?? -1) + 1;
        if (liveIndex < 1 || liveIndex === skipIndex) {
            continue;
        }
        const livePin = normalizePin(live?.pin);
        if (livePin === RESOURCE_NONE) {
            continue;
        }
        const snapshot = analysisItems.find((entry) => entry?.index === liveIndex);
        if (!snapshot || normalizePin(snapshot.pad) === livePin) {
            continue;
        }
        map.set(liveIndex, livePin);
    }
    return map;
}

function addOption(options, seen, option) {
    const pin = normalizePin(option.pin ?? option.value);
    if (!pin) {
        return;
    }
    const af = option.af != null && Number.isFinite(Number(option.af)) ? Number(option.af) : null;
    // Dedup by pin+af so default-AF and each alt-AF entry for the same
    // pad each get their own dropdown row.
    const afKey = `af${af}`;
    const dedupKey = `${pin}|${af == null ? "default" : afKey}`;
    if (seen.has(dedupKey)) {
        return;
    }
    seen.add(dedupKey);
    options.push({
        value: encodeResourceOptionValue(pin, af),
        pin,
        af,
        label: option.label ?? pin,
        source: option.source ?? "generic",
        timer: option.timer ?? null,
        channel: option.channel ?? null,
        sharesTimerWithMotor: option.sharesTimerWithMotor === true,
        requiresRelease: Array.isArray(option.requiresRelease) ? option.requiresRelease : [],
    });
}

export function stableResourcePins(motorResources = [], servoResources = [], initialPins = []) {
    const pins = new Set((Array.isArray(initialPins) ? initialPins : []).map(normalizePin));
    for (const resource of [...(motorResources ?? []), ...(servoResources ?? [])]) {
        const pin = normalizePin(resource?.pin);
        if (pin !== RESOURCE_NONE && pin !== "INVALID") {
            pins.add(pin);
        }
    }
    return [...pins].filter((pin) => pin !== RESOURCE_NONE && pin !== "INVALID").sort((a, b) => a.localeCompare(b));
}

export function motorIndicesInUse(motorResources = []) {
    return (motorResources ?? [])
        .filter((resource) => normalizePin(resource?.pin) !== RESOURCE_NONE)
        .map((resource) => resource.index + 1);
}

// Returns the source tag rendered into each candidate dropdown label. The
// strings mirror Betaflight CLI resource names verbatim ("MOTOR <n>",
// "SERVO <n>", "LED_STRIP", "UART<n> TX|RX", "AF", "TIM", "CH") so a pilot
// who reads "releases MOTOR 3" can paste the same token into a CLI
// `resource list` query or `timer <pad> AF<n>` command. We deliberately
// don't route these through i18next — translating the firmware vocabulary
// (e.g. "MOTOR" → "MOTEUR") would diverge from what the CLI accepts and
// what `resource list` prints, breaking the dropdown ↔ CLI workflow that
// debug-savvy pilots rely on. The connective verbs ("current", "free",
// "releases", "shares motor timer", "alt") are kept English-only for
// consistency with the surrounding CLI tokens.
export function candidateSourceLabel(candidate) {
    if (!candidate) {
        return "";
    }
    if (candidate.source === "existing") {
        return "current";
    }
    if (candidate.source === "free-pwm") {
        return "free";
    }
    if (candidate.source === "alt-af") {
        // Fallback label for alt-AF entries whose base had no underlying
        // source (synthetic rescue bases from currentPad-with-collision).
        // Real alt-AF entries now preserve their base's source string so
        // they route through the motor-release/uart-release/etc branches
        // below and pick up the "(alt AF)" suffix layered on by
        // labelForCandidate via the `af` field.
        return "alt AF";
    }
    if (candidate.source === "motor-release") {
        const line = (candidate.requiresRelease ?? []).find((c) => /^resource MOTOR /i.test(c)) ?? "";
        const match = /^resource MOTOR (\d+) /i.exec(line);
        return match ? `releases MOTOR ${match[1]}` : "releases motor";
    }
    if (candidate.source === "servo-release") {
        const line = (candidate.requiresRelease ?? []).find((c) => /^resource SERVO /i.test(c)) ?? "";
        const match = /^resource SERVO (\d+) /i.exec(line);
        return match ? `releases SERVO ${match[1]}` : "releases servo";
    }
    if (candidate.source === "led-strip") {
        return "releases LED_STRIP";
    }
    if (candidate.source === "uart-release") {
        const line = (candidate.requiresRelease ?? []).find((c) => /^resource SERIAL_/i.test(c)) ?? "";
        const match = /^resource SERIAL_(TX|RX) (\d+) /i.exec(line);
        return match ? `releases UART${match[2]} ${match[1]}` : "UART pad";
    }
    return "";
}

// Builds `pad → "M<n>"` / `pad → "LED_STRIP"` lookup from the analyzer's
// padDefaults block. Gated on `source === "firmware"` — when source is
// "scan" or "fallback" the silkscreen attribution is heuristic, so we
// suppress the prefix entirely rather than show a wrong M<n> label and
// have the pilot trust it. The padDefaults.source banner (#7) makes
// this gate visible to the user.
function buildSilkscreenMap(hardwareAnalysis) {
    const map = new Map();
    const padDefaults = hardwareAnalysis?.padDefaults;
    if (padDefaults?.source !== "firmware") {
        return map;
    }
    for (const motor of padDefaults.motors ?? []) {
        if (motor?.pad && Number.isFinite(motor.index)) {
            map.set(normalizePin(motor.pad), `M${motor.index}`);
        }
    }
    for (const led of padDefaults.ledStrips ?? []) {
        if (led?.pad) {
            map.set(normalizePin(led.pad), "LED_STRIP");
        }
    }
    return map;
}

// Builds the set of pads broken out to silkscreen as motors or LED strip
// (the same pool pickOptimalPadLayout draws from). Default-on filter:
// candidates outside the pool are dropped from the dropdown unless expert
// mode is enabled. Pool inclusion is independent of `padDefaults.source`
// — even a scan-derived map tells us which pads the board breaks out;
// only the silkscreen LABEL is suppressed when source != "firmware".
function buildPadPool(hardwareAnalysis) {
    const pool = new Set();
    const padDefaults = hardwareAnalysis?.padDefaults;
    if (!padDefaults) {
        return pool;
    }
    for (const motor of padDefaults.motors ?? []) {
        if (motor?.pad) {
            pool.add(normalizePin(motor.pad));
        }
    }
    for (const led of padDefaults.ledStrips ?? []) {
        if (led?.pad) {
            pool.add(normalizePin(led.pad));
        }
    }
    return pool;
}

function padDisplayLabel(pin, silkscreenMap) {
    if (!(silkscreenMap instanceof Map)) {
        return pin;
    }
    const silkscreen = silkscreenMap.get(normalizePin(pin));
    return silkscreen ? `${silkscreen} (${pin})` : pin;
}

function labelForCandidate(candidate, silkscreenMap = null) {
    const parts = [padDisplayLabel(candidate.pad, silkscreenMap)];
    if (candidate.timer != null) {
        const channelSuffix = candidate.channel == null ? "" : ` CH${candidate.channel}`;
        parts.push(`TIM${candidate.timer}${channelSuffix}`);
    }
    const source = candidateSourceLabel(candidate);
    if (source) {
        parts.push(source);
    }
    // Alt-AF rows preserve the base candidate's source ("motor-release",
    // "uart-release", "existing", …) so the source label above still
    // surfaces the underlying side-effect. Layer "(alt AF)" on top via the
    // `af` field. The bare "alt-af" source label (synthetic rescue bases
    // with no underlying source) already says "alt AF" itself, so skip
    // the suffix there to avoid "alt AF (alt AF)" duplication.
    if (candidate.af != null && candidate.source !== "alt-af") {
        parts.push("alt AF");
    }
    if (candidate.sharesTimerWithMotor) {
        parts.push("shares motor timer");
    }
    return parts.join(" - ");
}

function addCurrentOption(options, seen, currentPin, padTimers, silkscreenMap = null) {
    if (currentPin && currentPin !== RESOURCE_NONE) {
        const timer = timerSuffixForPin(currentPin, padTimers);
        const head = padDisplayLabel(currentPin, silkscreenMap);
        const label = timer ? `${head} - ${timer} - current` : `${head} - current`;
        addOption(options, seen, { pin: currentPin, label, source: "existing" });
    }
}

// Returns "MOTOR N" / "SERVO N" / "LED_STRIP" / "UARTn TX|RX" if `pin` is
// currently bound to that peripheral (excluding the resource being edited
// so we don't shadow the "- current" label). Used to annotate fallback
// options so pilots see what they'd be releasing if they pick that pad.
function describeCurrentAssignment(pin, ctx) {
    if (!ctx) {
        return null;
    }
    const editingMotor = ctx.kind === "motor";
    for (const m of ctx.motorResources ?? []) {
        if (normalizePin(m?.pin) === pin && !(editingMotor && m.index === ctx.resource?.index)) {
            return `MOTOR ${m.index + 1}`;
        }
    }
    for (const s of ctx.servoResources ?? []) {
        if (normalizePin(s?.pin) === pin && !(!editingMotor && s.index === ctx.resource?.index)) {
            return `SERVO ${s.index + 1}`;
        }
    }
    for (const led of ctx.ledStrips ?? []) {
        if (normalizePin(led?.pad) === pin) {
            return "LED_STRIP";
        }
    }
    for (const serial of ctx.serials ?? []) {
        if (normalizePin(serial?.txPad) === pin) {
            return `UART${serial.index} TX`;
        }
        if (normalizePin(serial?.rxPad) === pin) {
            return `UART${serial.index} RX`;
        }
    }
    return null;
}

// Maps a describeCurrentAssignment() string ("LED_STRIP", "UART2 TX",
// "UART6 RX") to the CLI release line(s) onResourcePinChange must run
// before binding a row to that pad. MOTOR/SERVO assignments don't get
// release lines here — those are owned by Vue rows and isOptionViable
// drops conflicting options upstream, so the dropdown should never
// surface a motor/servo-owned pad as a viable pick anyway.
function releaseLinesForAssignment(assignment) {
    if (typeof assignment !== "string") {
        return [];
    }
    if (assignment === "LED_STRIP") {
        return ["resource LED_STRIP 1 NONE"];
    }
    const uart = /^UART(\d+)\s+(TX|RX)$/i.exec(assignment);
    if (uart) {
        return [`resource SERIAL_${uart[2].toUpperCase()} ${uart[1]} NONE`];
    }
    return [];
}

// Returns "TIMx CHy" if the pad is in the analyzer's per-pad timer lookup,
// else null. Used to surface timer correlation on labels for current /
// already-assigned pads (we already show it for free PWM pads via
// labelForCandidate).
function timerSuffixForPin(pin, padTimers) {
    if (!(padTimers instanceof Map)) {
        return null;
    }
    const entry = padTimers.get(pin);
    if (entry?.timer == null) {
        return null;
    }
    return entry.channel == null ? `TIM${entry.timer}` : `TIM${entry.timer} CH${entry.channel}`;
}

function addFallbackOptions(options, seen, fallbackPins, ctx) {
    for (const pin of fallbackPins ?? []) {
        const normalized = normalizePin(pin);
        const assignment = describeCurrentAssignment(normalized, ctx);
        // Honor caller release whitelists — same guards as the silkscreen-
        // motor loop. A fallback pad owned by LED_STRIP or a UART must not
        // surface a release line unless the caller opted into releasing it
        // (allowLedStrip / allowUartRelease); otherwise picking the row
        // could emit `resource LED_STRIP 1 NONE` / `resource SERIAL_* NONE`
        // outside the guards the main candidate builders enforce.
        const uartMatch = /^UART(\d+)\s+(TX|RX)$/i.exec(assignment ?? "");
        if (uartMatch && !(ctx?.allowUartRelease ?? []).includes(Number(uartMatch[1]))) {
            continue;
        }
        if (assignment === "LED_STRIP" && !ctx?.allowLedStrip) {
            continue;
        }
        const timer = timerSuffixForPin(normalized, ctx?.padTimers);
        const head = padDisplayLabel(normalized, ctx?.silkscreenMap);
        const parts = [head];
        if (timer) {
            parts.push(timer);
        }
        if (assignment) {
            parts.push(assignment);
        }
        // Same rationale as the silkscreen-motor block above: LED/UART-owned
        // fallback pads need requiresRelease metadata so onResourcePinChange
        // emits the `resource <peripheral> N NONE` line before binding.
        // Without this, fallback rows pointing at LED_STRIP or a UART pad
        // surface the option but the FC bind silently no-ops.
        addOption(options, seen, {
            pin: normalized,
            label: parts.join(" - "),
            requiresRelease: releaseLinesForAssignment(assignment),
        });
    }
}

function genericOptions(currentPin, fallbackPins, ctx) {
    const options = [];
    const seen = new Set();
    addCurrentOption(options, seen, currentPin, ctx?.padTimers, ctx?.silkscreenMap);
    addFallbackOptions(options, seen, fallbackPins, ctx);
    return options;
}

function motorOptions({
    resource,
    motorResources,
    servoResources,
    hardwareAnalysis,
    fallbackPins,
    expertMode,
    allowLedStrip = true,
    allowUartRelease = [],
}) {
    const currentPin = normalizePin(resource?.pin);
    const padTimers = hardwareAnalysis?.padTimers instanceof Map ? hardwareAnalysis.padTimers : null;
    const silkscreenMap = buildSilkscreenMap(hardwareAnalysis);
    const padPool = buildPadPool(hardwareAnalysis);
    const poolFilter = !expertMode && padPool.size > 0;
    const ledStrips = hardwareAnalysis?.ledStrips ?? [];
    const serials = hardwareAnalysis?.serials ?? [];
    const ctx = {
        kind: "motor",
        resource,
        motorResources,
        servoResources,
        padTimers,
        silkscreenMap,
        ledStrips,
        serials,
        allowLedStrip,
        allowUartRelease,
    };
    const options = [];
    const seen = new Set();
    addCurrentOption(options, seen, currentPin, padTimers, silkscreenMap);
    if (!hardwareAnalysis) {
        return genericOptions(currentPin, fallbackPins, ctx);
    }

    const existing = (hardwareAnalysis.motors ?? []).find((motor) => motor.index === (resource?.index ?? -1) + 1);
    // Only add the analyzer-snapshot pad as an "existing" option when it
    // still matches the row's live value. After a local edit the live pin
    // has already been emitted by addCurrentOption() above; re-adding the
    // stale snapshot here would surface the old FC pad as a second
    // "current" entry alongside the user's pending pick.
    if (existing?.pad && normalizePin(existing.pad) === currentPin) {
        addOption(options, seen, {
            pin: existing.pad,
            label: labelForCandidate({ ...existing, source: "existing" }, silkscreenMap),
            source: "existing",
            timer: existing.timer,
            channel: existing.channel,
        });
    }
    for (const pad of hardwareAnalysis.pwmCapableFreePads ?? []) {
        if (poolFilter && !padPool.has(normalizePin(pad.pad))) {
            continue;
        }
        const pin = normalizePin(pad.pad);
        const assignment = describeCurrentAssignment(pin, ctx);
        if (assignment) {
            // Pad is bound now (e.g. user just picked it for another row).
            // Annotate with the binding rather than the stale "free" label
            // from the captured CLI scan.
            const head = padDisplayLabel(pin, silkscreenMap);
            const parts = [head];
            if (pad.timer != null) {
                const channelSuffix = pad.channel == null ? "" : ` CH${pad.channel}`;
                parts.push(`TIM${pad.timer}${channelSuffix}`);
            }
            parts.push(assignment);
            addOption(options, seen, { pin, label: parts.join(" - "), timer: pad.timer, channel: pad.channel });
        } else {
            addOption(options, seen, {
                pin,
                label: labelForCandidate({ ...pad, source: "free-pwm" }, silkscreenMap),
                source: "free-pwm",
                timer: pad.timer,
                channel: pad.channel,
            });
        }
    }
    // Always include every silkscreen-motor pad from the bundle as a
    // candidate. DSHOT motors can share a timer (each on its own
    // channel), so any motor-labeled pad is a valid swap target for any
    // motor row. Belt-and-suspenders against partial CLI scans dropping
    // pads from pwmCapableFreePads.
    for (const m of hardwareAnalysis?.padDefaults?.motors ?? []) {
        if (!m?.pad) {
            continue;
        }
        const pin = normalizePin(m.pad);
        if (pin === RESOURCE_NONE) {
            continue;
        }
        const assignment = describeCurrentAssignment(pin, ctx);
        // Honor caller-supplied release whitelists. LED_STRIP releases need
        // allowLedStrip; UART releases need the UART's index in
        // allowUartRelease. Without these guards the silkscreen-motor pad
        // loop could silently emit `resource SERIAL_TX 3 NONE` for an
        // MSP/GPS/telemetry port the caller never opted to release.
        const uartMatch = /^UART(\d+)\s+(TX|RX)$/i.exec(assignment ?? "");
        if (uartMatch && !allowUartRelease.includes(Number(uartMatch[1]))) {
            continue;
        }
        if (assignment === "LED_STRIP" && !allowLedStrip) {
            continue;
        }
        const timer = timerSuffixForPin(pin, padTimers);
        const head = padDisplayLabel(pin, silkscreenMap);
        const parts = [head];
        if (timer) {
            parts.push(timer);
        }
        if (assignment) {
            parts.push(assignment);
        }
        // When the silkscreen-motor pad is currently bound to a peripheral
        // (LED_STRIP / UART TX or RX), the bind will fail unless we release
        // that peripheral first. MOTOR/SERVO assignments are already filtered
        // out by isOptionViable in ServosTab, but LED/UART aren't in those
        // live arrays — they need explicit requiresRelease metadata so
        // onResourcePinChange runs the `resource <peripheral> N NONE` step
        // before binding. Without this, picking an LED/UART-owned silkscreen
        // pad surfaced the entry but the FC bind silently no-op'd.
        const requiresRelease = releaseLinesForAssignment(assignment);
        addOption(options, seen, {
            pin,
            label: parts.join(" - "),
            source: "silkscreen-motor",
            requiresRelease,
        });
    }
    addFallbackOptions(options, seen, fallbackPins, ctx);
    return options;
}

function servoOptions({
    resource,
    motorResources,
    servoResources,
    hardwareAnalysis,
    fallbackPins,
    allowLedStrip,
    allowUartRelease,
    expertMode,
}) {
    const currentPin = normalizePin(resource?.pin);
    const padTimers = hardwareAnalysis?.padTimers instanceof Map ? hardwareAnalysis.padTimers : null;
    const silkscreenMap = buildSilkscreenMap(hardwareAnalysis);
    const padPool = buildPadPool(hardwareAnalysis);
    const poolFilter = !expertMode && padPool.size > 0;
    const ledStrips = hardwareAnalysis?.ledStrips ?? [];
    const serials = hardwareAnalysis?.serials ?? [];
    const ctx = {
        kind: "servo",
        resource,
        motorResources,
        servoResources,
        padTimers,
        silkscreenMap,
        ledStrips,
        serials,
        allowLedStrip,
        allowUartRelease,
    };
    const options = [];
    const seen = new Set();
    addCurrentOption(options, seen, currentPin, padTimers, silkscreenMap);
    if (!hardwareAnalysis) {
        return genericOptions(currentPin, fallbackPins, ctx);
    }

    const servoIndex = (resource?.index ?? -1) + 1;
    // Build rebind maps from the live edited resources vs the FC analysis
    // snapshot. Without these, candidatePadsForSlot's claimedPads check
    // sees the FC's old SERVO/MOTOR positions and blocks pads that have
    // been freed in the live UI but not yet committed (e.g. user moved
    // SERVO 2 to a new pad — its old pad shouldn't block SERVO 1's
    // candidate list).
    const motorRebinds = buildRebindsMap(motorResources, hardwareAnalysis?.motors);
    const servoRebinds = buildRebindsMap(servoResources, hardwareAnalysis?.servos, servoIndex);
    // Servo rows the user has set to NONE in the dropdown. The release will
    // run before any new bind, so candidatePadsForSlot must NOT treat their
    // FC-snapshot pads as still claimed; without this, a freed servo pad
    // remains blocked from other rows' candidate lists. Only count rows
    // that actually had an FC binding to release.
    const releasedServoIndices = new Set();
    for (const live of servoResources ?? []) {
        const liveIndex = (live?.index ?? -1) + 1;
        if (liveIndex < 1 || liveIndex === servoIndex) {
            continue;
        }
        if (normalizePin(live?.pin) !== RESOURCE_NONE) {
            continue;
        }
        const snapshot = (hardwareAnalysis?.servos ?? []).find((s) => s?.index === liveIndex);
        if (snapshot) {
            releasedServoIndices.add(liveIndex);
        }
    }
    const candidates = candidatePadsForSlot(hardwareAnalysis, servoIndex, {
        motorIndicesInUse: motorIndicesInUse(motorResources),
        currentPad: currentPin === RESOURCE_NONE ? null : currentPin,
        allowLedStrip: allowLedStrip === true,
        allowUartRelease: Array.isArray(allowUartRelease) ? allowUartRelease : [],
        motorRebinds,
        servoRebinds,
        releasedServoIndices,
    });

    for (const candidate of candidates) {
        // Drop candidates that share a timer with an in-use motor unless
        // expert mode is on. Saving such a pick silently steals the timer
        // and bricks the motor — mirrors pickOptimalPadLayout's reject rule.
        // The "existing" source is preserved so a user already on a
        // shared-timer pad still sees their current row.
        if (!expertMode && candidate.sharesTimerWithMotor === true && candidate.source !== "existing") {
            continue;
        }
        // Silkscreen-pool filter: drop candidates whose pad isn't broken
        // out as a motor or LED-strip pad on this board (the pool
        // pickOptimalPadLayout draws from). Existing-source candidates
        // are exempt so a user currently on an off-pool pad still sees
        // their row.
        if (poolFilter && candidate.source !== "existing" && !padPool.has(normalizePin(candidate.pad))) {
            continue;
        }
        addOption(options, seen, {
            pin: candidate.pad,
            af: candidate.af,
            label: labelForCandidate(candidate, silkscreenMap),
            source: candidate.source,
            timer: candidate.timer,
            channel: candidate.channel,
            sharesTimerWithMotor: candidate.sharesTimerWithMotor,
            requiresRelease: candidate.requiresRelease,
        });
    }
    addFallbackOptions(options, seen, fallbackPins, ctx);
    return options;
}

export function resourceOptions({
    kind,
    resource,
    motorResources = [],
    servoResources = [],
    hardwareAnalysis = null,
    fallbackPins = [],
    allowLedStrip = true,
    allowUartRelease = [],
    expertMode = false,
}) {
    if (kind === "servo") {
        return servoOptions({
            resource,
            motorResources,
            servoResources,
            hardwareAnalysis,
            fallbackPins,
            allowLedStrip,
            allowUartRelease,
            expertMode,
        });
    }
    return motorOptions({
        resource,
        motorResources,
        servoResources,
        hardwareAnalysis,
        fallbackPins,
        expertMode,
        allowLedStrip,
        allowUartRelease,
    });
}
