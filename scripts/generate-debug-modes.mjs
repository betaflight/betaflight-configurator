#!/usr/bin/env node
/*
 * Generate the firmware debug-mode tables from the Betaflight firmware source.
 *
 * The firmware is the single source of truth for debug modes: `debug_mode_e`
 * in `src/main/build/debug.h` fixes the numeric value stored in a blackbox log
 * header (and sent over MSP), and `debugModeNames[]` in `src/main/build/debug.c`
 * fixes the name shown in the CLI/OSD. This generator reads both, once per MSP
 * API version, and writes:
 *
 *   src/js/debug_modes_table.js     - shipped: per-API-version ordered mode
 *                                     names, plus the rename aliases needed to
 *                                     keep labels working for older firmware.
 *   test/generated/debug_field_usage.json
 *                                   - test fixture: which `debug[n]` indices
 *                                     each firmware version actually writes,
 *                                     scraped from `DEBUG_SET()` call sites.
 *                                     `test/js/utils/debugModesFirmware.test.js`
 *                                     compares it against the hand-written
 *                                     field labels in `src/js/utils/debugModes.js`.
 *
 * Backwards compatibility is the hard part and is enforced, not assumed:
 *
 *   - Each API version is read from the *newest* firmware commit that still
 *     carried that API version (master for the in-development one), because
 *     that is the largest enum any firmware reporting that API version can
 *     have. Release tags are not used: a released 4.5.x reports API 1.46, but
 *     so did master right up to the 1.47 bump, and the two enums differ.
 *   - A version already present in the committed table may only gain entries at
 *     the end. Any reorder, removal or rename inside an existing version would
 *     silently re-map every blackbox log recorded with it, so it aborts unless
 *     --allow-rewrite is passed.
 *   - Renames *between* versions are detected by diffing adjacent version
 *     lists and are emitted as aliases, so labels written for the current name
 *     still resolve for logs from firmware that used the old name.
 *
 * Usage:
 *   node scripts/generate-debug-modes.mjs [options]
 *
 *   --repo <path>       Betaflight firmware git checkout. Defaults to
 *                       $BETAFLIGHT_REPO, then to sibling checkouts of this
 *                       repository (../betaflight, ../../betaflight, ...).
 *   --dev-ref <ref>     Ref holding the in-development firmware (default: master).
 *   --min-api <minor>   Lowest MSP API minor to emit (default: 44, the oldest
 *                       version the configurator connects to).
 *   --out <path>        Mode table output (default: src/js/debug_modes_table.js).
 *   --fields-out <path> Field-usage output (default: test/generated/debug_field_usage.json).
 *   --source-url <url>  Project URL recorded as provenance (default: the
 *                       upstream betaflight repository).
 *   --check             Do not write; exit 1 if the committed files are stale.
 *   --allow-rewrite     Permit non-append changes to an existing version.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const DEFAULT_DEV_REF = "master";
const DEFAULT_MIN_API_MINOR = 44;
const DEFAULT_OUT = "src/js/debug_modes_table.js";
const DEFAULT_FIELDS_OUT = "test/generated/debug_field_usage.json";
const DEBUG_HEADER = "src/main/build/debug.h";
const DEBUG_SOURCE = "src/main/build/debug.c";
const MSP_PROTOCOL_HEADER = "src/main/msp/msp_protocol.h";
const FIRMWARE_SOURCE_DIR = "src/main";
const DEBUG_VALUE_COUNT = 8;

// Recorded as provenance in the generated files. The commits below are the real
// provenance; the URL just names the project, so a fork or a mirror used as the
// working checkout does not leak into the generated header.
const SOURCE_URL = "https://github.com/betaflight/betaflight";

// Candidate firmware checkouts, relative to this repository, tried in order.
const REPO_CANDIDATES = [
    "../betaflight",
    "../../betaflight",
    "../../../betaflight",
    "../../betaflight/master/betaflight",
    "../../../betaflight/master/betaflight",
];

const BOOLEAN_FLAGS = new Set(["check", "allow-rewrite"]);
const VALUE_FLAGS = new Set(["repo", "dev-ref", "min-api", "out", "fields-out", "source-url"]);

function parseArgs(argv) {
    const args = {};

    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (!flag.startsWith("--")) {
            throw new Error(`Expected a CLI flag starting with --, got: ${flag}`);
        }
        const key = flag.slice(2);
        if (BOOLEAN_FLAGS.has(key)) {
            args[key] = true;
            continue;
        }
        if (!VALUE_FLAGS.has(key)) {
            throw new Error(`Unknown CLI flag: ${flag}`);
        }
        const value = argv[++i];
        if (value === undefined || value.startsWith("--")) {
            throw new Error(`Missing value for CLI flag: ${flag}`);
        }
        args[key] = value;
    }

    return args;
}

// ---------------------------------------------------------------------------
// git plumbing
// ---------------------------------------------------------------------------

/*
 * NOSONAR javascript:S4036 — `git` is resolved through PATH deliberately. This is a
 * developer/CI tool run against a checkout the caller already trusts, and git has no
 * fixed install path across the platforms this repository is developed on (unlike
 * the Tauri toolchain probes in `check-tauri-prereqs.mjs`, which can name absolute
 * candidates). Hard-coding one would break the script, not secure it.
 */
function git(repo, gitArgs) {
    return execFileSync("git", ["-C", repo, ...gitArgs], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }); // NOSONAR javascript:S4036
}

function gitShow(repo, ref, path) {
    try {
        return git(repo, ["show", `${ref}:${path}`]);
    } catch {
        throw new Error(`Cannot read ${path} at ${ref} in ${repo}`);
    }
}

function resolveRepo(explicit) {
    const candidates = explicit
        ? [resolve(projectRoot, explicit)]
        : [
              ...(process.env.BETAFLIGHT_REPO ? [resolve(process.env.BETAFLIGHT_REPO)] : []),
              ...REPO_CANDIDATES.map((candidate) => resolve(projectRoot, candidate)),
          ];

    for (const candidate of candidates) {
        if (!existsSync(join(candidate, ".git"))) {
            continue;
        }
        try {
            git(candidate, ["cat-file", "-e", `HEAD:${DEBUG_HEADER}`]);
            return candidate;
        } catch {
            // A git repository, but not the firmware one.
        }
    }

    throw new Error(
        `No Betaflight firmware checkout found (tried ${candidates.join(", ")}). Pass --repo <path> or set BETAFLIGHT_REPO.`,
    );
}

function apiMinorAt(repo, ref) {
    const source = gitShow(repo, ref, MSP_PROTOCOL_HEADER);
    const match = source.match(/^[ \t]*#define[ \t]+API_VERSION_MINOR[ \t]+(\d+)/m);
    if (!match) {
        throw new Error(`Cannot find API_VERSION_MINOR in ${MSP_PROTOCOL_HEADER} at ${ref}`);
    }
    return Number(match[1]);
}

/*
 * Map each MSP API minor to the newest firmware commit that carried it.
 *
 * API_VERSION_MINOR only ever changes in a commit that touches msp_protocol.h,
 * so walking that file's first-parent history newest-first visits every value
 * the field ever held. The first commit seen with a given value is the oldest
 * commit of the newest run of that value; that run *ends* just before the
 * commit that changed it, i.e. at `<next change>^`. The minor is bumped right
 * after a release and occasionally reverted, hence "newest run" rather than
 * "only run".
 */
function debugTablesCommit(repo, ref) {
    const commit = git(repo, ["log", "-1", "--format=%H", ref, "--", DEBUG_HEADER, DEBUG_SOURCE]).trim();
    return commit || git(repo, ["rev-parse", ref]).trim();
}

function buildVersionRefs(repo, devRef, minMinor) {
    const devMinor = apiMinorAt(repo, devRef);
    const commits = git(repo, ["log", "--first-parent", "--format=%H", devRef, "--", MSP_PROTOCOL_HEADER])
        .split("\n")
        .filter(Boolean);

    const refs = new Map([[devMinor, { ref: devRef, commit: git(repo, ["rev-parse", devRef]).trim() }]]);
    let newerCommit = null;
    let newerMinor = devMinor;

    for (const commit of commits) {
        const minor = apiMinorAt(repo, commit);
        if (minor !== newerMinor) {
            if (!refs.has(minor) && newerCommit !== null) {
                // `newerCommit` is the oldest commit still carrying `newerMinor`, so
                // the commit before it is the newest one carrying `minor`.
                const ref = `${newerCommit}^`;
                refs.set(minor, { ref, commit: git(repo, ["rev-parse", ref]).trim() });
            }
            newerMinor = minor;
        }
        newerCommit = commit;
        if (minor < minMinor && refs.has(minMinor)) {
            break;
        }
    }

    return [...refs.entries()]
        .filter(([minor]) => minor >= minMinor)
        .sort(([left], [right]) => left - right)
        .map(([minor, { ref }]) => {
            // Provenance is the newest commit that actually touched debug.h/debug.c at
            // that ref, not the ref itself: recording master's tip would make the
            // generated header churn on every unrelated firmware commit, and `--check`
            // would report drift when nothing about the debug modes had moved.
            const commit = debugTablesCommit(repo, ref);
            return {
                apiVersion: `1.${minor}.0`,
                minor,
                ref,
                commit,
                date: git(repo, ["log", "-1", "--format=%ad", "--date=short", commit]).trim(),
            };
        });
}

// ---------------------------------------------------------------------------
// firmware parsing
// ---------------------------------------------------------------------------

function stripComments(source) {
    return source.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\/\/[^\n]*/g, "");
}

/*
 * The ordered `debug_mode_e` / `debugType_e` enum. This is the index authority:
 * a name's position here is the value the firmware reports over MSP and writes
 * into the blackbox log header.
 */
function parseDebugEnum(header, ref) {
    const match = stripComments(header).match(/typedef\s+enum\s*\{([\s\S]*?)\}\s*debug(?:Type|Mode)_e\s*;/);
    if (!match) {
        throw new Error(`Cannot find the debug mode enum in ${DEBUG_HEADER} at ${ref}`);
    }

    const identifiers = [];
    for (const rawEntry of match[1].split(",")) {
        const entry = rawEntry.trim();
        if (!entry) {
            continue;
        }
        const parsed = entry.match(/^(DEBUG_[A-Z0-9_]+)\s*(?:=\s*(\d+))?$/);
        if (!parsed) {
            throw new Error(`Unparsed debug enum entry ${JSON.stringify(entry)} at ${ref}`);
        }
        // An explicit value would break the "position is the value" assumption this
        // whole table rests on, so refuse rather than emit a wrong index.
        if (parsed[2] !== undefined && Number(parsed[2]) !== identifiers.length) {
            throw new Error(
                `Debug enum entry ${parsed[1]} at ${ref} pins a value (${parsed[2]}) that is not its position`,
            );
        }
        identifiers.push(parsed[1]);
    }

    const end = identifiers.indexOf("DEBUG_COUNT");
    return end === -1 ? identifiers : identifiers.slice(0, end);
}

/*
 * `debugModeNames[]` from debug.c. Older firmware lists the names positionally,
 * newer firmware uses designated initialisers — and leaves a hole for reserved
 * enum slots (DEBUG_POSITION_NAV owns an index but has no name).
 */
function parseDebugModeNames(source, ref) {
    const match = stripComments(source).match(
        /debugModeNames[ \t]*\[[^\]]*\][ \t]*=[ \t]*\{([\s\S]*?)\n[ \t]*\}[ \t]*;/,
    );
    if (!match) {
        throw new Error(`Cannot find debugModeNames[] in ${DEBUG_SOURCE} at ${ref}`);
    }

    const byIdentifier = new Map();
    const byPosition = [];
    const entry = /(?:\[\s*(DEBUG_[A-Z0-9_]+)\s*\]\s*=\s*)?"((?:[^"\\]|\\.)*)"/g;
    let parsed;
    while ((parsed = entry.exec(match[1])) !== null) {
        if (parsed[1]) {
            byIdentifier.set(parsed[1], parsed[2]);
        } else {
            byPosition.push(parsed[2]);
        }
    }

    if (byIdentifier.size > 0 && byPosition.length > 0) {
        throw new Error(`debugModeNames[] at ${ref} mixes designated and positional initialisers`);
    }

    return { byIdentifier, byPosition };
}

function extractModes(repo, version) {
    const identifiers = parseDebugEnum(gitShow(repo, version.ref, DEBUG_HEADER), version.ref);
    const { byIdentifier, byPosition } = parseDebugModeNames(gitShow(repo, version.ref, DEBUG_SOURCE), version.ref);

    return identifiers.map((identifier, index) => {
        const fromFirmware = byIdentifier.size > 0 ? byIdentifier.get(identifier) : byPosition[index];
        // A reserved slot carries no name in debug.c but still owns its index, so
        // fall back to the enum identifier to keep the positions aligned.
        return fromFirmware || identifier.replace(/^DEBUG_/, "");
    });
}

// ---------------------------------------------------------------------------
// DEBUG_SET() call-site scan — which debug[n] each mode actually writes
// ---------------------------------------------------------------------------

// Every call that reaches the DEBUG_SET macro, including the wrapper macros that
// forward to it (GYRO_FILTER_AXIS_DEBUG_SET(axis, mode, index, ...)).
const DEBUG_SET_CALL = /(?<!\w)(?:[A-Z][A-Z0-9_]*_)?DEBUG_SET\s*\(/g;

const OPENING_BRACKETS = new Set(["(", "[", "{"]);
const CLOSING_BRACKETS = new Set([")", "]", "}"]);

// Index of the quote that closes the literal opening at `start`, or the last index
// when the line is truncated mid-literal.
function findLiteralEnd(text, start) {
    const quote = text[start];
    for (let i = start + 1; i < text.length; i++) {
        if (text[i] === "\\") {
            i += 1;
        } else if (text[i] === quote) {
            return i;
        }
    }
    return text.length - 1;
}

// Index of the bracket closing the one at `open`, or `text.length` when the line is
// truncated before it.
function findCallEnd(text, open) {
    let depth = 0;

    for (let i = open; i < text.length; i++) {
        const character = text[i];
        if (character === '"' || character === "'") {
            i = findLiteralEnd(text, i);
        } else if (OPENING_BRACKETS.has(character)) {
            depth += 1;
        } else if (CLOSING_BRACKETS.has(character)) {
            depth -= 1;
            if (depth === 0) {
                return i;
            }
        }
    }

    return text.length;
}

// Split on the commas that are not nested inside brackets or a literal.
function splitTopLevel(inner) {
    const args = [];
    let depth = 0;
    let current = "";

    for (let i = 0; i < inner.length; i++) {
        const character = inner[i];
        if (character === '"' || character === "'") {
            const end = findLiteralEnd(inner, i);
            current += inner.slice(i, end + 1);
            i = end;
        } else if (OPENING_BRACKETS.has(character)) {
            depth += 1;
            current += character;
        } else if (CLOSING_BRACKETS.has(character)) {
            depth -= 1;
            current += character;
        } else if (character === "," && depth === 0) {
            args.push(current.trim());
            current = "";
        } else {
            current += character;
        }
    }

    args.push(current.trim());
    return args;
}

/*
 * Split the argument list that starts at `open` (the index of its "(").
 * Commas nested in parentheses, brackets or literals do not separate arguments:
 * `DEBUG_SET(DEBUG_SBUS, DEBUG_SBUS_FRAME_TIME, cmpTimeUs(nowUs, startUs))` has
 * three of them, not four. A truncated line yields the arguments it does carry,
 * which is all this scan needs — the mode and the index come first.
 */
function splitCallArguments(text, open) {
    return splitTopLevel(text.slice(open + 1, findCallEnd(text, open)));
}

/*
 * One `enum { ... }` body as a name -> value map, or undefined when it carries an
 * initialiser this parser cannot evaluate (`FOO = BAR + 1`, `FOO = (1 << 2)`). Such
 * an entry shifts every enumerator after it, so the whole block is discarded rather
 * than recording indices the firmware disagrees with.
 */
function parseEnumBlock(body) {
    const entries = new Map();
    let next = 0;

    for (const rawEntry of body.split(",")) {
        const entry = rawEntry.trim();
        if (!entry) {
            continue;
        }
        const parsed = entry.match(/^([A-Za-z_]\w*)\s*(?:=\s*(\d+))?$/);
        if (!parsed) {
            return undefined;
        }
        if (parsed[2] !== undefined) {
            next = Number(parsed[2]);
        }
        entries.set(parsed[1], next);
        next += 1;
    }

    return entries;
}

/*
 * Resolve enum constants used as debug indices: several files index their debug
 * slots through a file-local `enum { DEBUG_FOO_BAR, ... }`. Only plain
 * implicit/decimal enumerators are resolved; anything else leaves the index
 * unresolved, which marks the mode dynamic.
 */
function parseLocalEnumConstants(source) {
    const constants = new Map();

    for (const block of stripComments(source).matchAll(/enum\s*(?:[A-Za-z_]\w*\s*)?\{([^}]*)\}/g)) {
        const entries = parseEnumBlock(block[1]);
        if (entries === undefined) {
            continue;
        }
        for (const [name, value] of entries) {
            constants.set(name, value);
        }
    }

    return constants;
}

function groupDebugSetLines(grepOutput) {
    const byFile = new Map();

    for (const line of grepOutput.split("\n")) {
        if (!line) {
            continue;
        }
        // git grep <ref> prints "<ref>:<path>:<line>:<text>"
        const parsed = line.match(/^[^:]*:([^:]+):\d+:(.*)$/);
        if (!parsed) {
            continue;
        }
        const [, path, text] = parsed;
        if (path === DEBUG_HEADER) {
            // The DEBUG_SET macro definition itself.
            continue;
        }
        if (!byFile.has(path)) {
            byFile.set(path, []);
        }
        byFile.get(path).push(text);
    }

    return byFile;
}

/*
 * The mode and index arguments of one DEBUG_SET() call site. A wrapper macro puts
 * its own argument first, so the mode is either the first or the second argument;
 * neither being a known mode means this is a macro definition or a stale call site.
 */
function resolveDebugSetCall(text, call, identifierToMode) {
    const args = splitCallArguments(text, call.index + call[0].length - 1);
    const modeArgument = identifierToMode.has(args[0]) ? 0 : 1;
    const mode = identifierToMode.get(args[modeArgument]);

    return mode === undefined ? undefined : { mode, rawIndex: args[modeArgument + 1] };
}

/*
 * The debug[n] a call site writes, or undefined when the index is computed at run
 * time (`axis`, `2 * axis + 1`, ...) and this scan cannot enumerate it.
 * `readConstants` is called only for an identifier index, since resolving it needs
 * the whole file.
 */
function resolveFieldIndex(rawIndex, readConstants) {
    let index;
    if (/^\d+$/.test(rawIndex)) {
        index = Number(rawIndex);
    } else if (/^[A-Za-z_]\w*$/.test(rawIndex)) {
        index = readConstants().get(rawIndex);
    }

    return index !== undefined && index >= 0 && index < DEBUG_VALUE_COUNT ? index : undefined;
}

// Every DEBUG_SET() line in the firmware source at `ref`, by file.
function grepDebugSetLines(repo, ref) {
    try {
        return groupDebugSetLines(git(repo, ["grep", "-n", "DEBUG_SET(", ref, "--", FIRMWARE_SOURCE_DIR]));
    } catch (error) {
        // git grep exits 1 when nothing matched, which is not an error here.
        return groupDebugSetLines(error.stdout ?? "");
    }
}

function usageEntry(usage, mode) {
    if (!usage.has(mode)) {
        usage.set(mode, { fields: new Set(), dynamic: false });
    }
    return usage.get(mode);
}

/*
 * Fold every DEBUG_SET() call site on `lines` into `usage`, and report how many of
 * their indices could not be enumerated.
 */
function scanLinesForUsage(lines, identifierToMode, readConstants, usage) {
    let unresolved = 0;

    for (const text of lines) {
        for (const call of text.matchAll(DEBUG_SET_CALL)) {
            const resolved = resolveDebugSetCall(text, call, identifierToMode);
            if (resolved?.rawIndex === undefined) {
                continue;
            }
            const entry = usageEntry(usage, resolved.mode);
            const index = resolveFieldIndex(resolved.rawIndex, readConstants);
            if (index === undefined) {
                entry.dynamic = true;
                unresolved += 1;
            } else {
                entry.fields.add(index);
            }
        }
    }

    return unresolved;
}

function renderUsage(usage) {
    return Object.fromEntries(
        [...usage.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([mode, entry]) => [
                mode,
                { fields: [...entry.fields].sort((a, b) => a - b), dynamic: entry.dynamic },
            ]),
    );
}

function extractFieldUsage(repo, version, modes) {
    const identifierToMode = new Map(modes.map((mode) => [`DEBUG_${mode}`, mode]));
    const usage = new Map();
    let unresolved = 0;

    for (const [path, lines] of grepDebugSetLines(repo, version.ref)) {
        // Resolving an identifier index needs the whole file, so read it at most once
        // and only for a file that actually has one.
        let constants = null;
        const readConstants = () => (constants ??= parseLocalEnumConstants(gitShow(repo, version.ref, path)));

        unresolved += scanLinesForUsage(lines, identifierToMode, readConstants, usage);
    }

    return { usage: renderUsage(usage), unresolved };
}

// ---------------------------------------------------------------------------
// rename detection
// ---------------------------------------------------------------------------

/*
 * Longest common subsequence of two mode lists, used to tell a rename (the enum
 * slot kept its meaning, the name changed) apart from an insertion or removal
 * (every later index shifts). A replace hunk of equal length is read as a
 * positional rename; anything else is a structural change and yields no alias.
 */
function diffHunks(before, after) {
    const lengths = Array.from({ length: before.length + 1 }, () => new Array(after.length + 1).fill(0));
    for (let i = before.length - 1; i >= 0; i--) {
        for (let j = after.length - 1; j >= 0; j--) {
            lengths[i][j] =
                before[i] === after[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
        }
    }

    const hunks = [];
    let removed = [];
    let added = [];
    const flush = () => {
        if (removed.length > 0 || added.length > 0) {
            hunks.push({ removed, added });
            removed = [];
            added = [];
        }
    };

    let i = 0;
    let j = 0;
    while (i < before.length && j < after.length) {
        if (before[i] === after[j]) {
            flush();
            i++;
            j++;
        } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
            removed.push(before[i++]);
        } else {
            added.push(after[j++]);
        }
    }
    while (i < before.length) {
        removed.push(before[i++]);
    }
    while (j < after.length) {
        added.push(after[j++]);
    }
    flush();

    return hunks;
}

function detectRenames(versions) {
    const renames = [];

    for (let i = 1; i < versions.length; i++) {
        const before = versions[i - 1];
        const after = versions[i];
        for (const hunk of diffHunks(before.modes, after.modes)) {
            if (hunk.removed.length !== hunk.added.length) {
                continue;
            }
            hunk.removed.forEach((from, index) => {
                renames.push({ from, to: hunk.added[index], fromApi: before.apiVersion, toApi: after.apiVersion });
            });
        }
    }

    return renames;
}

/*
 * Collapse rename chains (A -> B -> C) so every historical name points at the
 * name the label tables are keyed by today.
 */
function buildAliases(renames, latestModes) {
    const direct = new Map(renames.map(({ from, to }) => [from, to]));
    const aliases = {};

    for (const from of direct.keys()) {
        let to = direct.get(from);
        const seen = new Set([from]);
        while (direct.has(to) && !seen.has(to)) {
            seen.add(to);
            to = direct.get(to);
        }
        if (to !== from && latestModes.includes(to)) {
            aliases[from] = to;
        }
    }

    return Object.fromEntries(Object.entries(aliases).sort(([left], [right]) => left.localeCompare(right)));
}

// ---------------------------------------------------------------------------
// backwards-compatibility guard
// ---------------------------------------------------------------------------

async function readCommittedTable(outPath) {
    if (!existsSync(outPath)) {
        return null;
    }
    try {
        const module = await import(pathToFileURL(outPath).href);
        return module.FIRMWARE_DEBUG_MODES ?? null;
    } catch (error) {
        throw new Error(`Cannot read the existing table at ${outPath}: ${error.message}`);
    }
}

function assertAppendOnly(committed, generated, allowRewrite) {
    if (!committed) {
        return [];
    }

    const problems = [];
    for (const [apiVersion, previous] of Object.entries(committed)) {
        const current = generated[apiVersion];
        if (!current) {
            problems.push(`${apiVersion}: dropped from the generated table (was ${previous.length} modes)`);
            continue;
        }
        previous.forEach((mode, index) => {
            if (current[index] !== mode) {
                problems.push(`${apiVersion}: index ${index} was "${mode}", now "${current[index] ?? "<missing>"}"`);
            }
        });
    }

    if (problems.length > 0 && !allowRewrite) {
        throw new Error(
            [
                "Refusing to rewrite an existing API version: every blackbox log recorded",
                "with it decodes its debug fields through these indices.",
                ...problems.map((problem) => `  - ${problem}`),
                "Re-run with --allow-rewrite once the change has been verified against firmware history.",
            ].join("\n"),
        );
    }

    return problems;
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

function renderModule({ repoUrl, versions, aliases, renames }) {
    const lines = [
        "/*",
        " * WARNING: This is an auto-generated file, please do not edit directly!",
        " *",
        " * Generator    : `scripts/generate-debug-modes.mjs`",
        ` * Source       : ${repoUrl} (${DEBUG_HEADER}, ${DEBUG_SOURCE})`,
        " * Firmware refs:",
        ...versions.map(
            (version) =>
                ` *   API ${version.apiVersion.padEnd(7)} ${version.commit.slice(0, 10)} ${version.date}  (${version.modes.length} modes)`,
        ),
        " */",
        "",
        "/**",
        " * Ordered `debug_mode_e` names per MSP API version. A name's index is the",
        " * numeric debug_mode the firmware reports over MSP and stores in the blackbox",
        " * log header, so these lists must never be reordered by hand.",
        " *",
        " * Each list comes from the newest firmware commit that still carried that API",
        " * version, which is the largest enum any firmware reporting it can have.",
        " */",
        "export const FIRMWARE_DEBUG_MODES = Object.freeze({",
    ];

    for (const version of versions) {
        lines.push(`    "${version.apiVersion}": Object.freeze([`);
        version.modes.forEach((mode, index) => {
            lines.push(`        "${mode}", // ${index}`);
        });
        lines.push("    ]),");
    }

    lines.push(
        "});",
        "",
        "/**",
        " * Debug modes the firmware renamed while keeping the enum slot. The label,",
        " * decode and convert tables are keyed by the current name, so a log from",
        " * firmware that used the old name resolves through this map.",
        " */",
        "export const DEBUG_MODE_ALIASES = Object.freeze({",
    );

    const renameNote = new Map(renames.map((rename) => [rename.from, `${rename.fromApi} -> ${rename.toApi}`]));
    for (const [from, to] of Object.entries(aliases)) {
        lines.push(`    ${from}: "${to}", // renamed in ${renameNote.get(from)}`);
    }

    lines.push("});", "");

    return lines.join("\n");
}

/*
 * Prettier collapses short numeric arrays onto one line, so do the same here and
 * the generated fixture is already formatted the way `npm run format` wants it.
 */
function collapseNumberArrays(json) {
    // Anchored to line breaks with no nested whitespace repetition: nothing in the
    // pattern can match the same characters two ways, so a near-match input has
    // nothing to backtrack over (SonarCloud javascript:S5852).
    return json.replaceAll(/\[\n *\d+(?:,\n *\d+)*\n *\]/g, (match) => `[${match.match(/\d+/g).join(", ")}]`);
}

function renderFieldUsage({ repoUrl, versions }) {
    return `${collapseNumberArrays(
        JSON.stringify(
            {
                _comment: [
                    "Auto-generated by scripts/generate-debug-modes.mjs - do not edit.",
                    "Which debug[n] indices each firmware debug mode writes, scraped from DEBUG_SET() call sites.",
                    "dynamic: the mode also writes a computed index this scan cannot enumerate.",
                    "A mode missing from a version writes no debug field there (or writes it through code this scan does not see).",
                ],
                source: repoUrl,
                versions: Object.fromEntries(
                    versions.map((version) => [
                        version.apiVersion,
                        { commit: version.commit, date: version.date, modes: version.usage },
                    ]),
                ),
            },
            null,
            4,
        ),
    )}\n`;
}

// ---------------------------------------------------------------------------

/*
 * Fill in the modes and the field usage of every version, in place, and report how
 * many DEBUG_SET() indices across all of them could not be enumerated.
 */
function collectVersionData(repo, versions) {
    let unresolvedTotal = 0;

    for (const version of versions) {
        version.modes = extractModes(repo, version);
        const { usage, unresolved } = extractFieldUsage(repo, version, version.modes);
        version.usage = usage;
        unresolvedTotal += unresolved;
        console.log(
            `generate-debug-modes: API ${version.apiVersion} <- ${version.commit.slice(0, 10)} (${version.date}), ${version.modes.length} modes`,
        );
    }

    return unresolvedTotal;
}

async function assertUpToDate(outputs) {
    const stale = [];
    for (const [path, expected] of outputs) {
        const actual = existsSync(path) ? await readFile(path, "utf8") : null;
        if (actual !== expected) {
            stale.push(path);
        }
    }

    if (stale.length > 0) {
        throw new Error(
            `Out of date with the firmware source: ${stale.join(", ")}. Re-run: node scripts/generate-debug-modes.mjs`,
        );
    }
    console.log("generate-debug-modes: up to date with the firmware source");
}

async function writeOutputs(outputs) {
    for (const [path, contents] of outputs) {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, contents, "utf8");
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const repo = resolveRepo(args.repo);
    const devRef = args["dev-ref"] ?? DEFAULT_DEV_REF;
    const minMinor = Number(args["min-api"] ?? DEFAULT_MIN_API_MINOR);
    if (!Number.isInteger(minMinor) || minMinor < 1) {
        throw new Error(`--min-api must be a positive integer, got: ${args["min-api"]}`);
    }
    const outPath = resolve(projectRoot, args.out ?? DEFAULT_OUT);
    const fieldsOutPath = resolve(projectRoot, args["fields-out"] ?? DEFAULT_FIELDS_OUT);

    const repoUrl = args["source-url"] ?? SOURCE_URL;

    const versions = buildVersionRefs(repo, devRef, minMinor);
    if (versions.length === 0) {
        throw new Error(`No firmware commits found for API 1.${minMinor} or newer in ${repo}`);
    }

    const unresolvedTotal = collectVersionData(repo, versions);

    const generated = Object.fromEntries(versions.map((version) => [version.apiVersion, version.modes]));
    const committed = await readCommittedTable(outPath);
    for (const rewrite of assertAppendOnly(committed, generated, args["allow-rewrite"] === true)) {
        console.warn(`generate-debug-modes: WARNING rewrote an existing version - ${rewrite}`);
    }

    const renames = detectRenames(versions);
    const aliases = buildAliases(renames, versions.at(-1).modes);
    for (const rename of renames) {
        console.log(
            `generate-debug-modes: renamed ${rename.from} -> ${rename.to} (${rename.fromApi} -> ${rename.toApi})`,
        );
    }

    const moduleSource = renderModule({ repoUrl, versions, aliases, renames });
    const fieldUsageSource = renderFieldUsage({ repoUrl, versions });

    const outputs = [
        [outPath, moduleSource],
        [fieldsOutPath, fieldUsageSource],
    ];

    if (args.check) {
        await assertUpToDate(outputs);
        return;
    }

    await writeOutputs(outputs);

    console.log(`generate-debug-modes: wrote ${versions.length} API versions to ${outPath}`);
    console.log(
        `generate-debug-modes: wrote debug field usage to ${fieldsOutPath} (${unresolvedTotal} computed indices left unenumerated)`,
    );
}

// Error messages interpolate CLI arguments and firmware paths. The compatibility
// report is deliberately multi-line, so newlines survive sanitising and every
// other control character — anything that could forge a log line — does not.
function sanitiseMessage(message) {
    return String(message).replaceAll(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ");
}

try {
    await main();
} catch (error) {
    console.error(`generate-debug-modes: ${sanitiseMessage(error.message)}`); // NOSONAR jssecurity:S5145 - sanitised above
    process.exit(1);
}
