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
 *   src/js/debug_fields_table.js    - shipped: the label, unit and scaling of
 *                                     each `debug[n]`, read from the `//!<`
 *                                     annotations the firmware carries on its
 *                                     DEBUG_SET() call sites (see
 *                                     `src/main/build/debug.h`). A field with no
 *                                     annotation is absent, and the
 *                                     hand-written table in
 *                                     `src/js/utils/debugModes.js` still
 *                                     supplies it.
 *   test/generated/debug_field_usage.json
 *                                   - test fixture: which `debug[n]` indices
 *                                     each firmware version actually writes,
 *                                     scraped from `DEBUG_SET()` call sites.
 *                                     `test/js/utils/debugModesFirmware.test.js`
 *                                     compares it against the hand-written
 *                                     field labels in `src/js/utils/debugModes.js`.
 *   generated/debug-fields.json     - published: the same definitions as one
 *                                     schema-validated JSON document, so a tool
 *                                     outside this repository never has to parse
 *                                     C or scrape the generated JS. Carries the
 *                                     mode list, the field labels, the unit
 *                                     vocabulary, the rename aliases and the
 *                                     conflicting fields, for every API version.
 *   generated/debug-fields.schema.json
 *                                   - published: the JSON Schema for the above,
 *                                     generated alongside it so its unit
 *                                     vocabulary cannot drift from
 *                                     `src/js/debug_units.ts`.
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
 *   --pr <number>       Read the newest API version from a firmware pull request
 *                       instead, fetching its head from the upstream project. The
 *                       debug annotations arrive that way long before they reach a
 *                       release, so this is how to see what a firmware change does
 *                       to the tables while it is still open, and how to regenerate
 *                       against the one that carries them.
 *   --worktree          Read the newest API version from the firmware checkout as
 *                       it sits on disk - uncommitted edits and all - instead of
 *                       from a commit, so a firmware developer can preview the
 *                       modes and annotations they are still writing. Older API
 *                       versions still come from committed history. The output
 *                       describes local firmware only and must not be committed;
 *                       every generated file says so in its header.
 *   --min-api <minor>   Lowest MSP API minor to emit (default: 44, the oldest
 *                       version the configurator connects to).
 *   --out <path>        Mode table output (default: src/js/debug_modes_table.js).
 *   --labels-out <path> Field label/unit output (default: src/js/debug_fields_table.js).
 *   --fields-out <path> Field-usage output (default: test/generated/debug_field_usage.json).
 *   --json-out <path>   Published artifact (default: generated/debug-fields.json).
 *   --schema-out <path> Published schema (default: generated/debug-fields.schema.json).
 *   --source-url <url>  Project URL recorded as provenance (default: the
 *                       upstream betaflight repository).
 *   --check             Do not write; exit 1 if the committed files are stale.
 *   --allow-rewrite     Permit non-append changes to an existing version.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { format, resolveConfig } from "prettier";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DEBUG_UNITS, debugUnitSymbols } from "../src/js/debug_units.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const DEFAULT_DEV_REF = "master";

/*
 * The in-development version can be read from the firmware checkout as it sits
 * on disk rather than from a commit, so a firmware developer sees the mode and
 * the annotations they are still editing. Used as a ref, it means "the working
 * tree": every older API version still comes from committed history, because
 * only the newest one can be what the developer is changing.
 */
const WORKTREE_REF = "WORKTREE";

// Opens the banner on every file built from a working tree, and is how a later
// run recognises its own preview output.
const WORKTREE_MARKER = "NOT FOR COMMIT";
const DEFAULT_MIN_API_MINOR = 44;
const DEFAULT_OUT = "src/js/debug_modes_table.js";
const DEFAULT_LABELS_OUT = "src/js/debug_fields_table.js";
const DEFAULT_FIELDS_OUT = "test/generated/debug_field_usage.json";
const DEFAULT_JSON_OUT = "generated/debug-fields.json";
const DEFAULT_SCHEMA_OUT = "generated/debug-fields.schema.json";
const DEBUG_HEADER = "src/main/build/debug.h";
const DEBUG_SOURCE = "src/main/build/debug.c";
const MSP_PROTOCOL_HEADER = "src/main/msp/msp_protocol.h";
const FIRMWARE_SOURCE_DIR = "src/main";

// What opens a firmware field annotation, used both by the scanner below and
// by the provenance query, which needs it before the scanner is defined.
const ANNOTATION_MARKER = "//!<";
const DEBUG_VALUE_COUNT = 8;

// A debug field is an int16_t, so a flag list cannot name more bits than it holds.
const DEBUG_VALUE_BITS = 15;

// Prettier's default printWidth, which this repository keeps, so the generated
// files come out already formatted.
const PRINT_WIDTH = 120;

// Recorded as provenance in the generated files. The commits below are the real
// provenance; the URL just names the project, so a fork or a mirror used as the
// working checkout does not leak into the generated header.
const SOURCE_URL = "https://github.com/betaflight/betaflight";

// Where the published schema is fetchable from, recorded as `$schema` in the
// artifact so an editor or a validator resolves it without local paths.
const SCHEMA_URL =
    "https://raw.githubusercontent.com/betaflight/betaflight-configurator/master/generated/debug-fields.schema.json";

// Candidate firmware checkouts, relative to this repository, tried in order.
const REPO_CANDIDATES = [
    "../betaflight",
    "../../betaflight",
    "../../../betaflight",
    "../../betaflight/master/betaflight",
    "../../../betaflight/master/betaflight",
];

const BOOLEAN_FLAGS = new Set(["check", "allow-rewrite", "worktree"]);
const VALUE_FLAGS = new Set([
    "repo",
    "dev-ref",
    "pr",
    "min-api",
    "out",
    "labels-out",
    "fields-out",
    "json-out",
    "schema-out",
    "source-url",
]);

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
// stderr is captured rather than inherited: resolving an include walks a list of
// candidate header paths, and the ones that do not exist at a given ref are
// expected misses, not something to print several hundred times per run.
const GIT_OPTIONS = Object.freeze({
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
});

function git(repo, gitArgs) {
    return execFileSync("git", ["-C", repo, ...gitArgs], GIT_OPTIONS); // NOSONAR javascript:S4036
}

function gitShow(repo, ref, path) {
    if (ref === WORKTREE_REF) {
        try {
            return readFileSync(join(repo, path), "utf8");
        } catch {
            throw new Error(`Cannot read ${path} in the working tree of ${repo}`);
        }
    }
    try {
        return git(repo, ["show", `${ref}:${path}`]);
    } catch {
        throw new Error(`Cannot read ${path} at ${ref} in ${repo}`);
    }
}

/*
 * Resolve a firmware pull request to the commit at its head.
 *
 * The debug annotations reach the configurator through a firmware pull request
 * long before they reach a release, so the useful question while one is open is
 * "what would the tables look like with this merged". GitHub publishes every pull
 * request head under refs/pull/<n>/head, which is fetchable whether or not the
 * branch belongs to a fork.
 *
 * Fetched from the canonical repository rather than from a remote of the local
 * checkout: pull requests live on the upstream project even when the branch
 * behind them does not, and a firmware checkout may well have no remote naming
 * it. The result is resolved to a hash rather than left as FETCH_HEAD, which the
 * next fetch would overwrite.
 */
function pullRequestHead(repo, number, sourceUrl) {
    console.log(`generate-debug-modes: fetching firmware pull request #${number}`);
    try {
        git(repo, ["fetch", "--quiet", sourceUrl, `refs/pull/${number}/head`]);
    } catch (error) {
        throw new Error(`Cannot fetch pull request #${number} from ${sourceUrl}: ${sanitiseMessage(error.message)}`);
    }
    return git(repo, ["rev-parse", "FETCH_HEAD"]).trim();
}

// The commit a working-tree read is based on, for provenance and for the history
// walk, which needs a real ref to follow.
function worktreeBase(repo, ref) {
    return ref === WORKTREE_REF ? "HEAD" : ref;
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
    const base = worktreeBase(repo, ref);
    const tables = git(repo, ["log", "-1", "--format=%H", base, "--", DEBUG_HEADER, DEBUG_SOURCE]).trim();
    return newerCommit(repo, tables, debugDataCommit(repo, ref)) || git(repo, ["rev-parse", base]).trim();
}

/*
 * The newest commit at `ref` whose diff touches something this generator reads
 * out of src/main: a `//!<` annotation, or a DEBUG_SET() call site.
 *
 * Both live wherever the debug data is written rather than in debug.h/debug.c,
 * so a label or a mode's set of written fields can change with those two files
 * untouched. `-G` picks out the commits that changed one of them and no others,
 * so provenance follows what was generated without churning on unrelated
 * firmware work - measured at 5 commits behind master's tip, not at the tip.
 */
const DEBUG_DATA_PATTERN = `${ANNOTATION_MARKER}|DEBUG_SET\\(`;

function debugDataCommit(repo, ref) {
    const base = worktreeBase(repo, ref);
    const args = ["log", "-1", "--format=%H", "--extended-regexp", `-G${DEBUG_DATA_PATTERN}`];
    return git(repo, [...args, base, "--", FIRMWARE_SOURCE_DIR]).trim();
}

// The later of two commits, by ancestry.
function newerCommit(repo, left, right) {
    if (!left || !right || left === right) {
        return left || right;
    }
    try {
        git(repo, ["merge-base", "--is-ancestor", left, right]);
        return right;
    } catch {
        return left;
    }
}

function buildVersionRefs(repo, devRef, minMinor) {
    const devMinor = apiMinorAt(repo, devRef);
    const base = worktreeBase(repo, devRef);
    const commits = git(repo, ["log", "--first-parent", "--format=%H", base, "--", MSP_PROTOCOL_HEADER])
        .split("\n")
        .filter(Boolean);

    const refs = new Map([[devMinor, { ref: devRef, commit: git(repo, ["rev-parse", base]).trim() }]]);
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

    const names = identifiers.map((identifier, index) => {
        const fromFirmware = byIdentifier.size > 0 ? byIdentifier.get(identifier) : byPosition[index];
        // A reserved slot carries no name in debug.c but still owns its index, so
        // fall back to the enum identifier to keep the positions aligned.
        return fromFirmware || identifier.replace(/^DEBUG_/, "");
    });

    /*
     * The call sites name a mode by its enum identifier, while everything the app
     * shows uses the name debug.c gives it. The two agree throughout the firmware
     * history read here, but rebuilding one from the other assumes they always
     * will: the day debug.c names a mode anything else, every DEBUG_SET() for it
     * would stop resolving and the mode would lose its fields with nothing said.
     * So carry the identifiers rather than reconstructing them.
     */
    return { names, identifierToMode: new Map(identifiers.map((identifier, index) => [identifier, names[index]])) };
}

// ---------------------------------------------------------------------------
// DEBUG_SET() call-site scan — which debug[n] each mode actually writes
// ---------------------------------------------------------------------------

// Every call that reaches the DEBUG_SET macro, including the wrapper macros that
// forward to it (GYRO_FILTER_AXIS_DEBUG_SET(axis, mode, index, ...)).
const DEBUG_SET_CALL = /(?<!\w)(?:[A-Z][A-Z0-9_]*_)?DEBUG_SET\s*\(/g;

/*
 * `enum { ... }` and `typedef enum { ... } tag_e;`. The optional identifiers keep
 * their separating whitespace inside the optional group, so no part of either
 * pattern can match the same input two ways - which is what makes a regex
 * backtrack (SonarCloud javascript:S8786).
 */
const ANY_ENUM_BLOCK = /\benum(?:[ \t\r\n]+[A-Za-z_]\w*)?[ \t\r\n]*\{([^}]*)\}/g;
const NAMED_ENUM_BLOCK =
    /\benum(?:[ \t\r\n]+([A-Za-z_]\w*))?[ \t\r\n]*\{([^}]*)\}[ \t\r\n]*(?:([A-Za-z_]\w*)[ \t\r\n]*)?;/g;

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
    let i = open;

    while (i < text.length) {
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
        i += 1;
    }

    return text.length;
}

// Split on the commas that are not nested inside brackets or a literal.
function splitTopLevel(inner) {
    const args = [];
    let depth = 0;
    let current = "";

    let i = 0;
    while (i < inner.length) {
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
        i += 1;
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
 * Resolve the constants used as debug indices: several files index their debug
 * slots through a file-local `enum { DEBUG_FOO_BAR, ... }` or a run of
 * `#define DEBUG_FOO_BAR 0`, some of which live in the driver's own header. Only
 * plain implicit/decimal enumerators and decimal defines are resolved; anything
 * else leaves the index unresolved, which marks the mode dynamic.
 */
function parseLocalConstants(source) {
    const constants = new Map();
    const stripped = stripComments(source);

    for (const block of stripped.matchAll(ANY_ENUM_BLOCK)) {
        const entries = parseEnumBlock(block[1]);
        if (entries === undefined) {
            continue;
        }
        for (const [name, value] of entries) {
            constants.set(name, value);
        }
    }

    for (const define of stripped.matchAll(/^[ \t]*#[ \t]*define[ \t]+([A-Za-z_]\w*)[ \t]+(\d+)[ \t]*$/gm)) {
        if (!constants.has(define[1])) {
            constants.set(define[1], Number(define[2]));
        }
    }

    return constants;
}

/*
 * The named enumerations in one file, as tag -> value names in index order, for
 * both `typedef enum { ... } tag_e;` and `enum tag { ... }`. A block this parser
 * cannot evaluate - a computed initialiser, or entries behind a preprocessor
 * conditional, where the value of a name depends on the build - is skipped rather
 * than recorded with indices the firmware may disagree with.
 */
function parseNamedEnums(source) {
    const enums = new Map();

    for (const block of stripComments(source).matchAll(NAMED_ENUM_BLOCK)) {
        const entries = parseEnumBlock(block[2]);
        if (entries === undefined) {
            continue;
        }
        const names = [];
        for (const [name, value] of entries) {
            names[value] = name;
        }
        // An enum that pins values can leave gaps, and a hole renders as an
        // elision in JS but as null in JSON. Name the gaps so both agree, the
        // way an unused flag bit is already named.
        for (let value = 0; value < names.length; value++) {
            if (!(value in names)) {
                names[value] = null;
            }
        }
        for (const tag of [block[1], block[3]]) {
            if (tag !== undefined) {
                enums.set(tag, names);
            }
        }
    }

    return enums;
}

// The headers a file includes by relative path, resolved against the file's own
// directory and then against the firmware source root.
function includedHeaders(path, source) {
    const directory = path.slice(0, path.lastIndexOf("/"));
    const headers = [];

    for (const include of stripComments(source).matchAll(/^[ \t]*#[ \t]*include[ \t]+"([^"]+)"/gm)) {
        headers.push(`${directory}/${include[1]}`, `${FIRMWARE_SOURCE_DIR}/${include[1]}`);
    }

    return headers;
}

/*
 * The mode and index arguments of one DEBUG_SET() call site. A wrapper macro puts
 * its own argument first, so the mode is either the first or the second argument;
 * neither being a known mode means this is a macro definition or a stale call site.
 */
function resolveDebugSetCall(text, call, identifierToMode) {
    const open = call.index + call[0].length - 1;
    const args = splitCallArguments(text, open);
    const modeArgument = identifierToMode.has(args[0]) ? 0 : 1;
    const mode = identifierToMode.get(args[modeArgument]);

    return mode === undefined ? undefined : { mode, rawIndex: args[modeArgument + 1], end: findCallEnd(text, open) };
}

/*
 * The debug[n] a call site writes, or undefined when the index is computed at run
 * time (`axis`, `2 * axis + 1`, ...) and this scan cannot enumerate it.
 */
function resolveFieldIndex(rawIndex, constants) {
    let index;
    if (/^\d+$/.test(rawIndex ?? "")) {
        index = Number(rawIndex);
    } else if (/^[A-Za-z_]\w*$/.test(rawIndex ?? "")) {
        index = constants.get(rawIndex);
    }

    return index !== undefined && index >= 0 && index < DEBUG_VALUE_COUNT ? index : undefined;
}

// ---------------------------------------------------------------------------
// `//!<` field annotations
//
// Firmware records what each debug[n] means in a trailing comment on the call
// site; `src/main/build/debug.h` carries the grammar. This is the only place the
// meaning of a field exists, so a malformed annotation is a hard error rather
// than a field silently dropped back onto the hand-written table.
// ---------------------------------------------------------------------------

/*
 * Each of these is greedy and unambiguous, with the trimming and the structure of
 * an index spec left to the code below: a pattern that could match the same input
 * two ways is a pattern that backtracks (SonarCloud javascript:S8786).
 */
const ANNOTATION = /\/\/!<(.*)$/;
const INDEX_SPEC = /^\[index:([\d \t,.]+)\][ \t]*/;
const SHAPE_SPEC = /\[([A-Za-z]+):([^[\]]+)\]$/;
const EXPANSION = /\{([^{}]*)\}/;
const BRACE = /[{}]/g;
const INDEX_BOUND = /^\d+$/;
const UNIT_FACTOR = /^-?\d+(?:\.\d+)?/;
const UNKEYED_BRACKET = /\[[^[\]]+\]$/;

// The accepted vocabulary is the shared unit table's keys, not a second copy of
// it: a firmware unit with no display rule then fails generation here rather than
// reaching the app as a bare number.
const UNIT_SYMBOLS = new Set(debugUnitSymbols());

// "0..2" -> [0, 1, 2], "0,2,4" -> [0, 2, 4], "3" -> [3]
function parseIndexSpec(spec) {
    const indices = [];

    for (const part of spec.split(",")) {
        const bounds = part.split("..").map((bound) => bound.trim());
        if (bounds.length > 2 || !bounds.every((bound) => INDEX_BOUND.test(bound))) {
            return undefined;
        }
        const [from, to] = bounds.length === 2 ? bounds.map(Number) : [Number(bounds[0]), Number(bounds[0])];
        if (to >= DEBUG_VALUE_COUNT || to < from) {
            return undefined;
        }
        for (let index = from; index <= to; index++) {
            indices.push(index);
        }
    }

    return indices.length === 0 ? undefined : [...new Set(indices)];
}

// "0.1deg" -> { unit: "deg", scale: 0.1 }, "%" -> { unit: "%", scale: 1 },
// "0.001" -> { unit: null, scale: 0.001 }, "-1dBm" -> { unit: "dBm", scale: -1 }
/*
 * One shape bracket, dispatched on its key. Every bracket in an annotation names
 * itself, so an unknown key is refused rather than guessed at - a field whose
 * shape the tooling cannot read would be shown as a bare integer, silently.
 */
function parseShapeSpec(key, raw) {
    switch (key) {
        case "unit":
            return parseUnitShape(raw);
        case "enum":
            return parseEnumShape(raw);
        case "flags":
            return parseFlagsShape(raw);
        default:
            return undefined;
    }
}

function parseEnumShape(raw) {
    const type = raw.trim().match(/^[A-Za-z_]\w*$/);
    // The field holds an enumerator, not a quantity: no unit scales it, and the
    // names come from the firmware's own enum.
    return type === null ? undefined : { unit: null, scale: 1, enumTag: type[0] };
}

function parseFlagsShape(raw) {
    // Bit flags, lowest bit first. The names are in the annotation rather than
    // read from the source because flag bits are `#define`s rather than an enum.
    // `-` marks a bit the field does not use.
    const flags = raw.split("|").map((name) => name.trim());
    if (flags.length > DEBUG_VALUE_BITS || flags.includes("")) {
        return undefined;
    }
    return { unit: null, scale: 1, flags: flags.map((name) => (name === "-" ? null : name)) };
}

function parseUnitShape(raw) {
    const trimmed = raw.trim();
    const factor = UNIT_FACTOR.exec(trimmed)?.[0];
    const symbol = trimmed.slice(factor?.length ?? 0).trim();
    const unit = symbol === "" ? null : symbol;

    if (unit !== null && !UNIT_SYMBOLS.has(unit)) {
        return undefined;
    }
    if (factor === undefined && unit === null) {
        return undefined;
    }
    const scale = factor === undefined ? 1 : Number(factor);
    if (scale === 0) {
        // Would read every sample as zero, and its inverse would diverge.
        return undefined;
    }

    return { unit, scale };
}

/*
 * One annotation as {indices, labels, unit, scale}, with the `{a|b|c}` group
 * expanded into one label per index. `indices` is null when the annotation gave
 * no index spec, in which case the caller uses the index from the call itself.
 */
/*
 * The `{a|b|c}` group of a label expanded into one label per index, or an error
 * when the group and the indices do not describe the same thing.
 */
function expandLabel(label, indices) {
    const expansion = label.match(EXPANSION);
    // Every brace has to belong to that one group, or the expansion would leave
    // some of them in the label it produces.
    const braces = label.match(BRACE)?.length ?? 0;
    if (braces !== (expansion ? 2 : 0)) {
        return { error: `label "${label}" needs exactly one {a|b|c} group or none, with both braces` };
    }
    if (!expansion) {
        return { labels: null };
    }

    const alternatives = expansion[1].split("|");
    if (alternatives.some((alternative) => alternative.trim() === "")) {
        return { error: `"{${expansion[1]}}" has an empty alternative` };
    }
    if (indices === null || alternatives.length !== indices.length) {
        const covered = indices === null ? "one implicit index" : `${indices.length} indices`;
        return {
            error: `"{${expansion[1]}}" spells out ${alternatives.length} labels, but the annotation covers ${covered}`,
        };
    }

    return {
        labels: alternatives.map((alternative) =>
            label
                .replace(EXPANSION, alternative)
                .replaceAll(/[ \t]+/g, " ")
                .trim(),
        ),
    };
}

/* The index spec, if the annotation opens with one, and the text after it. */
function takeIndexSpec(raw) {
    const match = raw.match(INDEX_SPEC);
    if (!match) {
        return { indices: null, rest: raw };
    }
    const indices = parseIndexSpec(match[1]);
    if (indices === undefined) {
        return { error: `index spec "${match[1]}" is not 0..${DEBUG_VALUE_COUNT - 1}` };
    }
    return { indices, rest: raw.slice(match[0].length) };
}

/* The shape bracket, if the annotation ends with one, and the text before it. */
function takeShapeSpec(raw) {
    const match = raw.match(SHAPE_SPEC);
    if (!match) {
        // Before the shapes were keyed, a bare `[us]` meant a unit. Refusing it
        // keeps one way to write an annotation, rather than two that drift.
        return UNKEYED_BRACKET.test(raw)
            ? { error: `bracket "${UNKEYED_BRACKET.exec(raw)[0]}" needs a key: unit:, enum: or flags:` }
            : { shape: { unit: null, scale: 1 }, rest: raw };
    }

    const shape = parseShapeSpec(match[1], match[2]);
    if (shape === undefined) {
        return { error: `"[${match[1]}:${match[2]}]" is not a unit, enum or flags shape` };
    }
    return { shape, rest: raw.slice(0, raw.length - match[0].length) };
}

function parseAnnotation(raw) {
    const index = takeIndexSpec(raw);
    if (index.error) {
        return index;
    }
    const shape = takeShapeSpec(index.rest);
    if (shape.error) {
        return shape;
    }

    const label = shape.rest.trim();
    if (label === "") {
        return { error: "no label" };
    }
    if (/[[\]]/.test(label)) {
        return { error: `label "${label}" contains a bracket, which delimits the index spec and the shape` };
    }

    const expanded = expandLabel(label, index.indices);
    if (expanded.error) {
        return expanded;
    }

    return { indices: index.indices, labels: expanded.labels, label, ...shape.shape };
}

// ---------------------------------------------------------------------------
// per-file scan
// ---------------------------------------------------------------------------

// The firmware files that carry `pattern` at `ref`, DEBUG_SET() call sites by default.
function debugSetFiles(repo, ref, pattern = "DEBUG_SET(") {
    const worktree = ref === WORKTREE_REF;
    // Without a ref git grep searches the working tree; --untracked also finds a
    // file the developer has added but not yet told git about.
    const args = worktree
        ? ["grep", "-l", "--untracked", pattern, "--", FIRMWARE_SOURCE_DIR]
        : ["grep", "-l", pattern, ref, "--", FIRMWARE_SOURCE_DIR];

    let output;
    try {
        output = git(repo, args);
    } catch (error) {
        // git grep exits 1 when nothing matched, which is not an error here.
        output = error.stdout ?? "";
    }

    return (
        output
            .split("\n")
            // A ref-qualified match is printed as `<ref>:<path>`; a working-tree one
            // is the bare path, which must not have a leading segment cut off it.
            .map((line) => (worktree ? line : line.replace(/^[^:]*:/, "")))
            .filter((path) => path !== "" && path !== DEBUG_HEADER)
    );
}

function lineNumberAt(text, offset) {
    let line = 1;
    for (let i = 0; i < offset; i++) {
        if (text[i] === "\n") {
            line += 1;
        }
    }
    return line;
}

/*
 * Fold the index constants and named enumerations of one included header into
 * `scope`. First definition wins, so the file's own always outranks a header's.
 */
function mergeScope(scope, source) {
    for (const [name, value] of parseLocalConstants(source)) {
        if (!scope.constants.has(name)) {
            scope.constants.set(name, value);
        }
    }
    for (const [tag, names] of parseNamedEnums(source)) {
        if (!scope.enums.has(tag)) {
            scope.enums.set(tag, names);
        }
    }
}

/*
 * The index constants and named enumerations visible in one file: its own, plus
 * those of the headers it includes by relative path.
 */
function readFileScope(repo, ref, path, text) {
    const scope = { constants: parseLocalConstants(text), enums: parseNamedEnums(text) };

    for (const header of includedHeaders(path, text)) {
        try {
            mergeScope(scope, gitShow(repo, ref, header));
        } catch {
            // not a path in this tree, or not readable at this ref
        }
    }

    return scope;
}

/*
 * The parsed `//!<` annotation on the line a call ends on, or null when there is
 * none, or when it is malformed - which is recorded in `problems` and fails the
 * run, since a field's meaning exists nowhere else.
 */
function annotationAt(text, resolved, where, readScope, problems) {
    const lineEnd = text.indexOf("\n", resolved.end);
    const trailing = text.slice(resolved.end, lineEnd === -1 ? text.length : lineEnd);
    const annotationText = trailing.match(ANNOTATION)?.[1]?.trim();
    if (annotationText === undefined) {
        return null;
    }
    if (annotationText === "") {
        problems.push(`${where}: the \`//!<\` marker carries no annotation`);
        return null;
    }

    const annotation = parseAnnotation(annotationText);
    if (annotation.error) {
        problems.push(`${where}: ${annotation.error}`);
        return null;
    }
    if (annotation.enumTag === undefined) {
        return annotation;
    }

    // The field holds an enumerator: take the names from the firmware enum the
    // annotation points at, so no tool has to keep its own copy of them.
    annotation.values = readScope().enums.get(annotation.enumTag);
    if (annotation.values !== undefined) {
        return annotation;
    }
    problems.push(
        `${where}: no enum "${annotation.enumTag}" reachable from ${where.split(":")[0]}` +
            " (or its enumerators are not plain decimal values)",
    );

    return null;
}

/*
 * Every DEBUG_SET() call site in one file: the mode it writes, the index it
 * writes to, and its annotation. Whole files are read rather than grepped lines
 * because a call may span several lines and its annotation sits on the last.
 */
/*
 * Blank out everything that is not code, keeping every offset: the scan reports
 * line numbers and finds a call's annotation by where the call ended, so deleting
 * text would move both. Annotations are themselves comments, so `//!<` survives.
 *
 * Without this a commented-out DEBUG_SET() counts as a field the mode writes, and
 * the fixture that records what each mode writes is what the label check uses to
 * decide whether a field is unlabelled - so a dead call can hide a real gap.
 *
 * String literals are left alone. Blanking them would take the filename out of
 * `#include "foo.h"` with it, and the scope walk needs that to reach the enum an
 * annotation names - which cost seven annotated fields when tried. A literal
 * holding text that parses as a whole DEBUG_SET() call is not a real risk.
 */
function maskNonCode(source) {
    const out = [...source];
    const blank = (from, to) => {
        for (let index = from; index < to; index++) {
            if (out[index] !== "\n") {
                out[index] = " ";
            }
        }
    };

    for (let index = 0; index < source.length; index++) {
        const pair = source.slice(index, index + 2);
        if (pair === "/*") {
            const close = source.indexOf("*/", index + 2);
            const end = close === -1 ? source.length : close + 2;
            blank(index, end);
            index = end - 1;
        } else if (pair === "//") {
            const newline = source.indexOf("\n", index);
            const end = newline === -1 ? source.length : newline;
            if (source.slice(index, index + 4) !== ANNOTATION_MARKER) {
                blank(index, end);
            }
            index = end - 1;
        }
    }

    return out.join("");
}

function scanFile(repo, ref, path, identifierToMode, problems) {
    const text = maskNonCode(gitShow(repo, ref, path));
    const calls = [];
    // Resolving an index constant or an enum needs the whole file and its
    // headers, so read them at most once, and only for a file that has one.
    let scope = null;
    const readScope = () => (scope ??= readFileScope(repo, ref, path, text));

    for (const call of text.matchAll(DEBUG_SET_CALL)) {
        const resolved = resolveDebugSetCall(text, call, identifierToMode);
        if (resolved?.rawIndex === undefined) {
            continue;
        }
        const index = resolveFieldIndex(resolved.rawIndex, readScope().constants);
        const where = `${path}:${lineNumberAt(text, resolved.end)}`;
        const annotation = annotationAt(text, resolved, where, readScope, problems);

        if (annotation?.indices && index !== undefined && !annotation.indices.includes(index)) {
            problems.push(
                `${where}: annotation covers debug[${annotation.indices.join(",")}] but the call writes debug[${index}]`,
            );
        }

        calls.push({ mode: resolved.mode, index, annotation, where });
    }

    return calls;
}

function usageEntry(usage, mode) {
    if (!usage.has(mode)) {
        usage.set(mode, { fields: new Set(), dynamic: false });
    }
    return usage.get(mode);
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

// Whether two annotations name the same enumerator list.
function sameValues(left, right) {
    if (left === right) {
        return true;
    }
    if (left === undefined || right === undefined || left.length !== right.length) {
        return false;
    }
    return left.every((name, index) => name === right[index]);
}

/*
 * Fold one call site into `usage` (which debug[n] the mode writes) and into
 * `fields` (what each of them means). A field written from two places has to mean
 * one thing in a given build, so disagreeing annotations are both kept as
 * variants rather than one being picked: the app shows both, and the disagreement
 * is reported as the firmware bug it is.
 */
function foldCall(call, usage, fields) {
    const entry = usageEntry(usage, call.mode);
    const annotation = call.annotation;
    const indices = annotation?.indices ?? (call.index === undefined ? null : [call.index]);

    if (indices === null) {
        entry.dynamic = true;
        return 1;
    }
    for (const index of indices) {
        entry.fields.add(index);
    }

    if (!annotation) {
        return 0;
    }

    const modeFields = (fields[call.mode] ??= {});
    indices.forEach((index, position) => {
        const label = annotation.labels ? annotation.labels[position] : annotation.label;
        const variants = (modeFields[index] ??= []);
        // Enum values are part of a variant's identity: two call sites that agree
        // on the label but name different enums do not agree on what the field
        // holds, and that has to surface as a conflict rather than the first one
        // winning.
        const existing = variants.find(
            (variant) =>
                variant.label === label &&
                variant.unit === annotation.unit &&
                variant.scale === annotation.scale &&
                sameValues(variant.values, annotation.values) &&
                sameValues(variant.flags, annotation.flags),
        );
        if (existing) {
            existing.sites.push(call.where);
        } else {
            variants.push({
                label,
                unit: annotation.unit,
                scale: annotation.scale,
                values: annotation.values,
                flags: annotation.flags,
                sites: [call.where],
            });
        }
    });

    return 0;
}

/*
 * Which debug[n] each mode writes at `version.ref`, and what each of them means.
 * `problems` collects malformed annotations, which fail the run.
 */
function extractFields(repo, version, problems) {
    const identifierToMode = version.identifierToMode;
    const usage = new Map();
    const fields = {};
    let unresolved = 0;

    for (const path of debugSetFiles(repo, version.ref)) {
        for (const call of scanFile(repo, version.ref, path, identifierToMode, problems)) {
            unresolved += foldCall(call, usage, fields);
        }
    }

    return { usage: renderUsage(usage), fields, unresolved };
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
    /*
     * The append-only guard protects index assignments that firmware in the wild
     * has already recorded into blackbox logs. A table built from someone's
     * working tree never left their machine, so it is not a baseline to protect -
     * and treating it as one makes the run back to the committed tables fail on a
     * mode that never existed anywhere else, teaching people to reach for
     * --allow-rewrite, which is the one habit this guard cannot survive.
     */
    if (readFileSync(outPath, "utf8").includes(WORKTREE_MARKER)) {
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

/*
 * Output built from a working tree describes firmware nobody else has. Say so in
 * every generated file, loudly enough that it is caught in review if one is ever
 * committed - `--check` fails on it in CI, but a banner needs no CI to be seen.
 */
/*
 * Marks a version read from a working tree, so a consumer of the published JSON
 * can tell a developer's local build from firmware anyone can check out.
 */
function worktreeMark(version) {
    return version.ref === WORKTREE_REF ? { worktree: true } : {};
}

// How a version's provenance reads in a generated header.
function refLabel(version) {
    return version.ref === WORKTREE_REF ? `${version.commit.slice(0, 10)}+worktree` : version.commit.slice(0, 10);
}

function worktreeBanner(versions) {
    if (!versions.some((version) => version.ref === WORKTREE_REF)) {
        return [];
    }

    return [
        " *",
        ` * ${WORKTREE_MARKER}: the newest version below was read from a firmware working`,
        " * tree, not from a commit. It describes uncommitted local firmware and will",
        " * not match what anyone else builds. Regenerate from a committed ref before",
        " * committing this file.",
    ];
}

function renderModule({ repoUrl, versions, aliases, renames }) {
    const lines = [
        "/*",
        " * WARNING: This is an auto-generated file, please do not edit directly!",
        ...worktreeBanner(versions),
        " *",
        " * Generator    : `scripts/generate-debug-modes.mjs`",
        ` * Source       : ${repoUrl} (${DEBUG_HEADER}, ${DEBUG_SOURCE})`,
        " * Firmware refs:",
        ...versions.map(
            (version) =>
                ` *   API ${version.apiVersion.padEnd(7)} ${refLabel(version)} ${version.date}  (${version.modes.length} modes)`,
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
        lines.push(`    ${quote(version.apiVersion)}: Object.freeze([`);
        version.modes.forEach((mode, index) => {
            lines.push(`        ${quote(mode)}, // ${index}`);
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
        // The key is left bare: every mode name is DEBUG_[A-Z0-9_]+ or the enum
        // parser refuses it, so it is always a valid identifier, and Prettier
        // strips quotes it does not need - which would fail `prettier --check`
        // on this generated file.
        lines.push(`    ${from}: ${quote(to)}, // renamed in ${renameNote.get(from)}`);
    }

    lines.push("});", "");

    return lines.join("\n");
}

/*
 * A string as a JavaScript literal. Field labels are free text from the firmware
 * comments, so a quote or a backslash in one must not break the generated module.
 */
function quote(text) {
    return JSON.stringify(text);
}

/*
 * `<key>: Object.freeze([...])` at `indent`, wrapped one item per line when the
 * single-line form would run past the print width - which is what Prettier does
 * to it, so the generated file comes out already formatted.
 */
function renderFrozenList(indent, key, items) {
    const quoted = items.map((item) => quote(item));
    const single = `${indent}${key}: Object.freeze([${quoted.join(", ")}]),`;
    if (single.length <= PRINT_WIDTH) {
        return [single];
    }

    return [`${indent}${key}: Object.freeze([`, ...quoted.map((item) => `${indent}    ${item},`), `${indent}]),`];
}

/*
 * One field of the shipped table, as Prettier would print it: on one line when it
 * fits, one property per line when it does not.
 */
function renderFieldEntry(index, { label, unit, scale, values, flags }) {
    const unitSource = unit === null ? "null" : quote(unit);
    const listSource = (name, list) =>
        list === undefined ? "" : `, ${name}: Object.freeze([${list.map((entry) => quote(entry)).join(", ")}])`;
    const tail = `${listSource("values", values)}${listSource("flags", flags)}`;
    const single = `            ${index}: Object.freeze({ label: ${quote(label)}, unit: ${unitSource}, scale: ${scale}${tail} }),`;
    if (single.length <= PRINT_WIDTH) {
        return [single];
    }

    return [
        `            ${index}: Object.freeze({`,
        `                label: ${quote(label)},`,
        `                unit: ${unitSource},`,
        `                scale: ${scale},`,
        ...(values === undefined ? [] : renderFrozenList("                ", "values", values)),
        ...(flags === undefined ? [] : renderFrozenList("                ", "flags", flags)),
        "            }),",
    ];
}

// The header of the generated field table, up to its first version.
function fieldsModuleHeader(repoUrl, annotated) {
    return [
        "/*",
        " * WARNING: This is an auto-generated file, please do not edit directly!",
        ...worktreeBanner(annotated),
        " *",
        " * Generator    : `scripts/generate-debug-modes.mjs`",
        ` * Source       : ${repoUrl} (\`//!<\` annotations on the DEBUG_SET() call sites)`,
        " * Firmware refs:",
        ...annotated.map((version) => {
            const fields = Object.values(version.fields).reduce((total, mode) => total + Object.keys(mode).length, 0);
            return ` *   API ${version.apiVersion.padEnd(7)} ${refLabel(version)} ${version.date}  (${fields} annotated fields)`;
        }),
        " */",
        "",
        "/**",
        " * What each `debug[n]` of each debug mode holds, per MSP API version, as the",
        " * firmware itself records it at the DEBUG_SET() call site:",
        " *",
        " *   label - the field name to show, firmware's own wording.",
        " *   unit  - unit symbol of the stored value, or null when it is a plain count,",
        " *           flag or enumeration. `gyroADC`, `accADC`, `accADC/s`, `rcCommand`",
        " *           and `eRPM` are device-native and need the FC's own scaling.",
        " *   scale - what one LSB is worth in that unit, so `deg` with scale 0.1 means",
        " *           the field holds decidegrees. Negative where the firmware stores",
        " *           the magnitude of a negative quantity, as CRSF does with dBm.",
        " *   flags  - present when the field holds bit flags: the name of each bit,",
        " *           lowest first, null for a bit the field does not use.",
        " *   values - present when the field holds an enumerator: the firmware enum's",
        " *           own names, indexed by value.",
        " *",
        " * A field the firmware does not annotate is absent here.",
        " */",
        "export const FIRMWARE_DEBUG_FIELDS = Object.freeze({",
    ];
}

/*
 * One mode's fields. A field two subsystems write with different meanings cannot
 * be labelled from one of them, so both names are kept and the unit dropped - it
 * belongs to one meaning only and would scale the other's samples wrongly - and
 * the disagreement is pushed onto `conflicts` for the caller to report. Identical
 * names are collapsed: the LIDAR-TF and UPT1 drivers both call debug[0] the
 * distance, in cm and in mm, and "Distance / Distance" names nothing.
 */
function renderModeFields(mode, fields, apiVersion, conflicts) {
    const lines = [`        ${mode}: Object.freeze({`];

    for (const index of Object.keys(fields).sort((left, right) => Number(left) - Number(right))) {
        const variants = fields[index];
        const agreed = variants.length === 1;
        lines.push(
            ...renderFieldEntry(index, {
                label: [...new Set(variants.map((variant) => variant.label))].join(" / "),
                unit: agreed ? variants[0].unit : null,
                scale: agreed ? variants[0].scale : 1,
                values: agreed ? variants[0].values : undefined,
                flags: agreed ? variants[0].flags : undefined,
            }),
        );
        if (!agreed) {
            conflicts.push({ apiVersion, mode, index: Number(index), variants });
        }
    }

    return [...lines, "        }),"];
}

// One conflict as a `FIRMWARE_DEBUG_FIELD_CONFLICTS` entry.
function renderConflict(conflict) {
    const lines = [
        "    Object.freeze({",
        `        apiVersion: ${quote(conflict.apiVersion)},`,
        `        mode: ${quote(conflict.mode)},`,
        `        index: ${conflict.index},`,
        "        meanings: Object.freeze([",
    ];

    for (const variant of conflict.variants) {
        lines.push(
            "            Object.freeze({",
            `                label: ${quote(variant.label)},`,
            `                unit: ${variant.unit === null ? "null" : quote(variant.unit)},`,
            `                scale: ${variant.scale},`,
            // Two meanings can differ by their enum or their flag names alone, so
            // both are part of what distinguishes them and belong in the report.
            ...(variant.values === undefined ? [] : renderFrozenList("                ", "values", variant.values)),
            ...(variant.flags === undefined ? [] : renderFrozenList("                ", "flags", variant.flags)),
            ...renderFrozenList("                ", "sites", variant.sites),
            "            }),",
        );
    }

    return [...lines, "        ]),", "    }),"];
}

/*
 * The shipped field table: what each `debug[n]` means, per API version, straight
 * from the firmware annotations. Only annotated fields appear; the hand-written
 * table in src/js/utils/debugModes.js still supplies the rest, so this file can
 * land incrementally as annotations do.
 */
function renderFieldsModule({ repoUrl, versions }) {
    const annotated = versions.filter((version) => Object.keys(version.fields).length > 0);
    const conflicts = [];
    const lines = fieldsModuleHeader(repoUrl, annotated);

    for (const version of annotated) {
        lines.push(`    ${quote(version.apiVersion)}: Object.freeze({`);
        for (const mode of Object.keys(version.fields).sort((left, right) => left.localeCompare(right))) {
            lines.push(...renderModeFields(mode, version.fields[mode], version.apiVersion, conflicts));
        }
        lines.push("    }),");
    }

    lines.push(
        "});",
        "",
        "/**",
        " * Indices two subsystems write with different meanings in the same build. A",
        " * logged debug[n] records only the number, never which code wrote it, so such a",
        " * field cannot be labelled: both meanings are kept here so the app can say so",
        " * rather than pick one. Every entry is a firmware bug.",
        " */",
        "export const FIRMWARE_DEBUG_FIELD_CONFLICTS = Object.freeze([",
    );

    for (const conflict of conflicts) {
        lines.push(...renderConflict(conflict));
    }

    lines.push("]);", "");

    return { source: lines.join("\n"), conflicts };
}

/*
 * Every generated JSON goes out through the repository's own Prettier
 * configuration, so a freshly generated file is already formatted the way
 * `npm run format` wants it and a reviewer never sees a formatting-only diff.
 * Prettier is a devDependency and this is a dev script, so the import costs the
 * app nothing.
 */
async function formatJson(source, filepath) {
    const options = await resolveConfig(filepath, { editorconfig: true });
    return format(source, { ...options, filepath, parser: "json" });
}

function renderFieldUsage({ repoUrl, versions }) {
    return `${JSON.stringify(
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
                    { commit: version.commit, date: version.date, ...worktreeMark(version), modes: version.usage },
                ]),
            ),
        },
        null,
        4,
    )}\n`;
}

// ---------------------------------------------------------------------------
// The published JSON artifact
// ---------------------------------------------------------------------------

/*
 * One JSON file holding everything a consumer needs to decode a debug field, so
 * that no tool outside this repository has to parse C or scrape the generated JS.
 *
 * The two shipped `.js` tables stay the app's own source: they are tree-shaken
 * into the bundle and carry no parse cost at runtime. This artifact is the same
 * data published for everyone else - the blackbox log viewer, third-party log
 * analysers, anything reading a log the configurator did not record - and is
 * generated from the same scan in the same run, so the two cannot disagree.
 */

/** One field's variants collapsed the way the shipped table collapses them. */
function jsonFieldEntry(variants) {
    const agreed = variants.length === 1;
    const entry = {
        label: [...new Set(variants.map((variant) => variant.label))].join(" / "),
        // A field two subsystems write with different meanings has no single unit
        // or scaling, so it is published as a plain integer and listed under
        // `conflicts`, where both meanings are kept.
        unit: agreed ? variants[0].unit : null,
        scale: agreed ? variants[0].scale : 1,
    };
    if (agreed && variants[0].values !== undefined) {
        entry.values = variants[0].values;
    }
    if (agreed && variants[0].flags !== undefined) {
        entry.flags = variants[0].flags;
    }
    return entry;
}

/** One API version's modes, in enum order: the array index is the debug_mode value. */
function jsonModes(version) {
    return version.modes.map((name, index) => {
        const usage = version.usage[name];
        const fields = version.fields[name] ?? {};
        return {
            index,
            name,
            // Which debug[n] the firmware writes for this mode, and whether it also
            // writes an index computed at run time that the scan cannot enumerate.
            writes: usage?.fields ?? [],
            dynamic: usage?.dynamic ?? false,
            fields: Object.fromEntries(
                Object.keys(fields)
                    .sort((left, right) => Number(left) - Number(right))
                    .map((index) => [index, jsonFieldEntry(fields[index])]),
            ),
        };
    });
}

function renderFieldsJson({ repoUrl, versions, aliases, renames, conflicts }) {
    return `${JSON.stringify(
        {
            $schema: SCHEMA_URL,
            _comment: [
                "Auto-generated by scripts/generate-debug-modes.mjs - do not edit.",
                "What each firmware debug mode is and what each of its debug[n] fields holds.",
                "A mode's position in `versions[api].modes` is its numeric debug_mode value.",
                "Read `units` to render a value: displayed = stored * scale, then the unit's own factor.",
            ],
            generator: "scripts/generate-debug-modes.mjs",
            source: repoUrl,
            units: DEBUG_UNITS,
            aliases,
            renames,
            versions: Object.fromEntries(
                versions.map((version) => [
                    version.apiVersion,
                    { commit: version.commit, date: version.date, ...worktreeMark(version), modes: jsonModes(version) },
                ]),
            ),
            conflicts: conflicts.map(({ apiVersion, mode, index, variants }) => ({
                apiVersion,
                mode,
                index,
                meanings: variants.map(({ label, unit, scale, values, flags, sites }) => ({
                    label,
                    unit,
                    scale,
                    ...(values === undefined ? {} : { values }),
                    ...(flags === undefined ? {} : { flags }),
                    sites,
                })),
            })),
        },
        null,
        4,
    )}\n`;
}

/*
 * The schema is generated rather than hand-written so its unit vocabulary cannot
 * drift from `src/js/debug_units.ts`: a unit added there is accepted by the
 * generator and described by the schema in the same run.
 */
function renderFieldsSchema() {
    const fieldEntry = {
        type: "object",
        description: "What one debug[n] of one mode holds, from the firmware's own annotation.",
        properties: {
            label: { type: "string", description: "Field name, in the firmware's wording." },
            unit: {
                description: "Unit of one LSB of the stored value, or null for a count, flag or enumeration.",
                oneOf: [
                    {
                        type: "string",
                        enum: [...debugUnitSymbols()].sort((left, right) => left.localeCompare(right)),
                    },
                    { type: "null" },
                ],
            },
            scale: {
                type: "number",
                description: "What one LSB is worth in `unit`: 0.1 means the field stores decidegrees.",
            },
            values: {
                type: "array",
                description:
                    "Enumerator names, lowest value first, for a field holding an enum. Null where the enum pins values and leaves a gap.",
                items: { type: ["string", "null"] },
            },
            flags: {
                type: "array",
                description: "Bit-flag names, lowest bit first, null for a bit the field does not use.",
                items: { type: ["string", "null"] },
            },
        },
        required: ["label", "unit", "scale"],
        additionalProperties: false,
    };

    return `${JSON.stringify(
        {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $id: SCHEMA_URL,
            title: "Betaflight debug field definitions",
            description:
                "Every Betaflight debug mode and debug[n] field, per MSP API version, generated from the " +
                "firmware's `//!<` annotations on its DEBUG_SET() call sites.",
            type: "object",
            properties: {
                $schema: { type: "string" },
                _comment: { type: "array", items: { type: "string" } },
                generator: { type: "string" },
                source: { type: "string", description: "Firmware project the definitions were read from." },
                units: {
                    type: "object",
                    description: "The unit vocabulary: how to display a value stored in each unit.",
                    additionalProperties: {
                        type: "object",
                        properties: {
                            suffix: { type: "string", description: "Printed after the displayed value." },
                            factor: {
                                type: "number",
                                description: "Multiplies the scaled value to reach `suffix`; defaults to 1.",
                            },
                            ctx: {
                                type: "string",
                                enum: ["gyro", "acc", "throttle", "erpm"],
                                description: "A device-native unit only the FC's own configuration can convert.",
                            },
                            decimals: {
                                type: "integer",
                                description: "Fixed decimal places, where derived reads badly.",
                            },
                            range: {
                                description: "The graph axis the unit implies, when it implies one.",
                                oneOf: [
                                    {
                                        type: "object",
                                        properties: { min: { type: "number" }, max: { type: "number" } },
                                        required: ["min", "max"],
                                        additionalProperties: false,
                                    },
                                    { type: "string", enum: ["gyro", "acc", "throttle"] },
                                ],
                            },
                        },
                        required: ["suffix"],
                        additionalProperties: false,
                    },
                },
                aliases: {
                    type: "object",
                    description: "Historical mode name -> the name the same enum slot has today.",
                    additionalProperties: { type: "string" },
                },
                renames: {
                    type: "array",
                    description: "Where each rename happened, so a log from either side resolves.",
                    items: {
                        type: "object",
                        properties: {
                            from: { type: "string" },
                            to: { type: "string" },
                            fromApi: { type: "string" },
                            toApi: { type: "string" },
                        },
                        required: ["from", "to", "fromApi", "toApi"],
                        additionalProperties: false,
                    },
                },
                versions: {
                    type: "object",
                    description: "Keyed by MSP API version, read from the newest firmware commit still on it.",
                    propertyNames: { pattern: String.raw`^\d+\.\d+\.\d+$` },
                    additionalProperties: {
                        type: "object",
                        properties: {
                            commit: { type: "string", description: "Firmware commit the definitions were read from." },
                            date: { type: "string", description: "Date of that commit, ISO 8601." },
                            worktree: {
                                type: "boolean",
                                description:
                                    "Present and true when read from a developer's working tree rather than a " +
                                    "commit, so it describes local firmware nobody else has.",
                            },
                            modes: {
                                type: "array",
                                description: "The debug_mode enum in order: a mode's position is its numeric value.",
                                items: {
                                    type: "object",
                                    properties: {
                                        index: { type: "integer", minimum: 0, description: "The debug_mode value." },
                                        name: { type: "string", description: "Name as the firmware CLI reports it." },
                                        writes: {
                                            type: "array",
                                            description: "Which debug[n] this mode writes.",
                                            items: { type: "integer", minimum: 0, maximum: DEBUG_VALUE_COUNT - 1 },
                                        },
                                        dynamic: {
                                            type: "boolean",
                                            description: "The mode also writes an index computed at run time.",
                                        },
                                        fields: {
                                            type: "object",
                                            description:
                                                "Annotated fields, keyed by index. Unannotated ones are absent.",
                                            propertyNames: { pattern: `^[0-${DEBUG_VALUE_COUNT - 1}]$` },
                                            additionalProperties: fieldEntry,
                                        },
                                    },
                                    required: ["index", "name", "writes", "dynamic", "fields"],
                                    additionalProperties: false,
                                },
                            },
                        },
                        required: ["commit", "date", "modes"],
                        additionalProperties: false,
                    },
                },
                conflicts: {
                    type: "array",
                    description:
                        "Indices two subsystems write with different meanings in one build. A log records only " +
                        "the number, so such a field cannot be labelled. Every entry is a firmware bug.",
                    items: {
                        type: "object",
                        properties: {
                            apiVersion: { type: "string" },
                            mode: { type: "string" },
                            index: { type: "integer", minimum: 0, maximum: DEBUG_VALUE_COUNT - 1 },
                            meanings: {
                                type: "array",
                                minItems: 2,
                                items: {
                                    type: "object",
                                    properties: {
                                        label: { type: "string" },
                                        unit: { oneOf: [{ type: "string" }, { type: "null" }] },
                                        scale: { type: "number" },
                                        values: { type: "array", items: { type: ["string", "null"] } },
                                        flags: { type: "array", items: { type: ["string", "null"] } },
                                        sites: {
                                            type: "array",
                                            description: "Firmware call sites, as path:line.",
                                            items: { type: "string" },
                                        },
                                    },
                                    required: ["label", "unit", "scale", "sites"],
                                    additionalProperties: false,
                                },
                            },
                        },
                        required: ["apiVersion", "mode", "index", "meanings"],
                        additionalProperties: false,
                    },
                },
            },
            required: ["generator", "source", "units", "aliases", "renames", "versions", "conflicts"],
            additionalProperties: false,
        },
        null,
        4,
    )}\n`;
}

// ---------------------------------------------------------------------------

// `if (debugMode == DEBUG_X)`, the guard a mode writing `debug[]` by hand sits behind.
const DIRECT_WRITE_GUARD = /debugMode\s*==\s*DEBUG_([A-Z0-9_]+)/g;
const BARE_DEBUG_WRITE = /(?<!DEBUG_SET\s*\()\bdebug\s*\[[^\]]*\]\s*=/;

/*
 * The statement the guard at `from` controls: a block if one follows, otherwise up
 * to the end of the single statement. Only that range can be attributed to the
 * mode the guard names - a file may guard several modes, and a bare `debug[]`
 * write elsewhere in it belongs to whichever guard encloses it.
 */
function guardedStatement(text, from) {
    const block = text.indexOf("{", from);
    const statementEnd = text.indexOf(";", from);
    if (block !== -1 && (statementEnd === -1 || block < statementEnd)) {
        return text.slice(block, findCallEnd(text, block) + 1);
    }
    return text.slice(from, statementEnd === -1 ? text.length : statementEnd + 1);
}

/*
 * Modes that write `debug[]` directly instead of through DEBUG_SET(), so neither
 * the annotation scan nor the usage scan can see their fields. They are reported
 * rather than silently counted as unwritten: a live mode with no annotation is a
 * gap in the contract, and the fix is in firmware - route the write through
 * DEBUG_SET() so it can carry an annotation.
 */
function directWriteModes(repo, ref, identifierToMode) {
    const found = new Set();

    for (const path of debugSetFiles(repo, ref, "debugMode ==")) {
        if (path === DEBUG_SOURCE) {
            continue;
        }
        // Comments are stripped so a mode named in prose cannot look like a guard.
        const text = stripComments(gitShow(repo, ref, path));
        for (const match of text.matchAll(DIRECT_WRITE_GUARD)) {
            const mode = identifierToMode.get(`DEBUG_${match[1]}`);
            if (mode !== undefined && BARE_DEBUG_WRITE.test(guardedStatement(text, match.index + match[0].length))) {
                found.add(mode);
            }
        }
    }

    return found;
}

/*
 * Every mode of a version that has no annotated field, split by what can be done
 * about it: written directly and so beyond the reach of an annotation, written
 * through the macro but not yet annotated, or not written at all.
 */
function unannotatedModes(repo, version, fields, usage) {
    const direct = directWriteModes(repo, version.ref, version.identifierToMode);
    const groups = { bare: [], unannotated: [], unwritten: [] };

    for (const mode of version.modes) {
        if (Object.keys(fields[mode] ?? {}).length > 0 || mode === "NONE") {
            continue;
        }
        const written = usage[mode];
        if (direct.has(mode)) {
            groups.bare.push(mode);
        } else if (written && (written.fields.length > 0 || written.dynamic)) {
            groups.unannotated.push(mode);
        } else {
            groups.unwritten.push(mode);
        }
    }

    return groups;
}

/*
 * Fill in the modes and the field usage of every version, in place, and report how
 * many DEBUG_SET() indices across all of them could not be enumerated.
 */
function collectVersionData(repo, versions) {
    let unresolvedTotal = 0;
    const problems = [];

    for (const version of versions) {
        const { names, identifierToMode } = extractModes(repo, version);
        version.modes = names;
        version.identifierToMode = identifierToMode;
        const { usage, fields, unresolved } = extractFields(repo, version, problems);
        version.usage = usage;
        version.fields = fields;
        unresolvedTotal += unresolved;
        const annotated = Object.values(fields).reduce((total, mode) => total + Object.keys(mode).length, 0);
        const written = Object.values(usage).reduce((total, mode) => total + mode.fields.length, 0);
        console.log(
            `generate-debug-modes: API ${version.apiVersion} <- ${version.commit.slice(0, 10)} (${version.date}), ` +
                `${version.modes.length} modes, ${annotated}/${written} fields annotated`,
        );

        // Only the newest version is actionable: an older one cannot gain annotations.
        if (annotated > 0 && version === versions.at(-1)) {
            const { bare, unannotated, unwritten } = unannotatedModes(repo, version, fields, usage);
            if (bare.length > 0) {
                console.warn(
                    `generate-debug-modes: WARNING ${bare.length} mode(s) write debug[] directly, so they cannot ` +
                        `carry an annotation and have no labels: ${bare.join(", ")}`,
                );
            }
            if (unannotated.length > 0) {
                console.warn(
                    `generate-debug-modes: WARNING ${unannotated.length} mode(s) write through DEBUG_SET() with no ` +
                        `annotation, so they have no labels: ${unannotated.join(", ")}`,
                );
            }
            if (unwritten.length > 0) {
                console.log(
                    `generate-debug-modes: ${unwritten.length} mode(s) hold an enum slot but write nothing: ` +
                        unwritten.join(", "),
                );
            }
        }
    }

    if (problems.length > 0) {
        throw new Error(
            [
                "Malformed `//!<` field annotations - see the grammar in src/main/build/debug.h:",
                ...problems.map((problem) => `  - ${problem}`),
            ].join("\n"),
        );
    }

    return unresolvedTotal;
}

async function assertUpToDate(outputs, flags) {
    const stale = [];
    for (const [path, expected] of outputs) {
        const actual = existsSync(path) ? await readFile(path, "utf8") : null;
        if (actual !== expected) {
            stale.push(relative(projectRoot, path));
        }
    }

    if (stale.length === 0) {
        console.log("generate-debug-modes: up to date with the firmware source");
        return;
    }

    /*
     * Name the firmware that was checked against. Bare advice to re-run the
     * generator is worse than none here: the default reads firmware master, and
     * for anything whose labels come from a firmware branch still in review that
     * silently regenerates a different table rather than the one being checked.
     * The checkout is the reader's own to name; every other flag that decides what
     * gets written is quoted back, so the command reproduces the run that failed.
     */
    const invocation = ["npm run generate:debug-modes --", "--repo <your betaflight checkout>", ...flags]
        .filter(Boolean)
        .join(" ");
    throw new Error(
        [
            "Out of date with the firmware source:",
            ...stale.map((path) => `  - ${path}`),
            "Regenerate against the same firmware and commit the result:",
            `  ${invocation}`,
        ].join("\n"),
    );
}

async function writeOutputs(outputs) {
    for (const [path, contents] of outputs) {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, contents, "utf8");
    }
}

// One meaning of a conflicting field, for the warning that reports it.
function describeMeaning(variant) {
    const factor = variant.scale === 1 ? "" : variant.scale;
    const unit = variant.unit === null ? "" : ` [${factor}${variant.unit}]`;

    return `"${variant.label}"${unit} at ${variant.sites.join(", ")}`;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const repo = resolveRepo(args.repo);
    // Three ways to name the in-development firmware, and they cannot be mixed.
    const sources = ["worktree", "dev-ref", "pr"].filter((flag) => args[flag] !== undefined);
    if (sources.length > 1) {
        throw new Error(`Name the in-development firmware once: ${sources.map((flag) => `--${flag}`).join(" and ")}`);
    }

    let devRef = args.worktree === true ? WORKTREE_REF : (args["dev-ref"] ?? DEFAULT_DEV_REF);

    /*
     * How to reproduce this run, quoted back when the committed files are stale.
     * Every option that decides what gets written belongs here - a hint missing
     * one regenerates something other than what was just rejected - and each
     * value is shell-quoted, since the line is meant to be pasted into a shell.
     *
     * --allow-rewrite is deliberately left out. It does not change what is
     * generated, only whether a rewrite of an already-published version is
     * allowed to proceed, and suggesting it would hand someone the way around
     * the one guard that protects indices already recorded into blackbox logs.
     */
    const shellQuote = (value) => (/^[\w./:@=-]+$/.test(value) ? value : `'${String(value).replaceAll("'", `'\\''`)}'`);
    const flagFor = (name) => (args[name] === undefined ? "" : `--${name} ${shellQuote(args[name])}`);

    let devRefFlag = flagFor("dev-ref");
    if (args.worktree === true) {
        devRefFlag = "--worktree";
    }
    const minMinor = Number(args["min-api"] ?? DEFAULT_MIN_API_MINOR);
    if (!Number.isInteger(minMinor) || minMinor < 1) {
        throw new Error(`--min-api must be a positive integer, got: ${args["min-api"]}`);
    }
    const outPath = resolve(projectRoot, args.out ?? DEFAULT_OUT);
    const labelsOutPath = resolve(projectRoot, args["labels-out"] ?? DEFAULT_LABELS_OUT);
    const fieldsOutPath = resolve(projectRoot, args["fields-out"] ?? DEFAULT_FIELDS_OUT);
    const jsonOutPath = resolve(projectRoot, args["json-out"] ?? DEFAULT_JSON_OUT);
    const schemaOutPath = resolve(projectRoot, args["schema-out"] ?? DEFAULT_SCHEMA_OUT);

    const repoUrl = args["source-url"] ?? SOURCE_URL;

    if (args.pr !== undefined) {
        // Interpolated into a git refspec, so accept nothing but a number.
        if (!/^\d+$/.test(args.pr)) {
            throw new Error(`--pr takes a pull request number, got: ${args.pr}`);
        }
        devRef = pullRequestHead(repo, args.pr, repoUrl);
        devRefFlag = `--pr ${args.pr}`;
        console.log(`generate-debug-modes: pull request #${args.pr} is at ${devRef}`);
    }

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
    const { source: fieldsModuleSource, conflicts } = renderFieldsModule({ repoUrl, versions });
    const fieldUsageSource = await formatJson(renderFieldUsage({ repoUrl, versions }), fieldsOutPath);

    for (const conflict of conflicts) {
        const meanings = conflict.variants.map(describeMeaning).join(" vs ");
        console.warn(
            `generate-debug-modes: WARNING ${conflict.mode}[${conflict.index}] has ${conflict.variants.length} meanings: ${meanings}`,
        );
    }

    // Rendered after the field module, which is what detects the conflicts.
    const fieldsJsonSource = await formatJson(
        renderFieldsJson({ repoUrl, versions, aliases, renames, conflicts }),
        jsonOutPath,
    );
    const fieldsSchemaSource = await formatJson(renderFieldsSchema(), schemaOutPath);

    const outputs = [
        [outPath, moduleSource],
        [labelsOutPath, fieldsModuleSource],
        [fieldsOutPath, fieldUsageSource],
        [jsonOutPath, fieldsJsonSource],
        [schemaOutPath, fieldsSchemaSource],
    ];

    if (args.check) {
        await assertUpToDate(outputs, [
            devRefFlag,
            ...["source-url", "min-api", "out", "labels-out", "fields-out", "json-out", "schema-out"].map(flagFor),
        ]);
        return;
    }

    await writeOutputs(outputs);

    if (devRef === WORKTREE_REF) {
        console.warn(
            "generate-debug-modes: WARNING built from the working tree of " +
                `${repo} - these tables describe uncommitted local firmware. Do not commit them; ` +
                "re-run without --worktree to restore the committed ones.",
        );
    }

    console.log(`generate-debug-modes: wrote ${versions.length} API versions to ${outPath}`);
    console.log(`generate-debug-modes: wrote the annotated field labels to ${labelsOutPath}`);
    console.log(
        `generate-debug-modes: wrote debug field usage to ${fieldsOutPath} (${unresolvedTotal} computed indices left unenumerated)`,
    );
    console.log(
        `generate-debug-modes: wrote the published artifact to ${jsonOutPath} and its schema to ${schemaOutPath}`,
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
