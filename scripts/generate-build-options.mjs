#!/usr/bin/env node
/*
 * Generate src/js/build_options.js from the Betaflight cloud build API.
 *
 * This mirrors the firmware's `src/utils/make-build-info.py`, which generates
 * `src/main/msp/msp_build_info.{c,h}` from the same endpoint. The two tables
 * must agree: the firmware reports build options as numeric MSP codes and the
 * configurator maps those codes back to `USE_*` names.
 *
 * Usage:
 *   node scripts/generate-build-options.mjs [<version>|<url>] [--out <path>]
 *
 *   <version>      Release version served by the options API (default: 2026.12).
 *                  Expanded to https://build.betaflight.com/api/options/<version>.
 *   <url>          A full http(s) URL, used verbatim instead of the default endpoint.
 *   --out <path>   Output file (default: src/js/build_options.js).
 *
 * The "Input hash" recorded in the generated header is the md5 of python's
 * `json.dumps(data, sort_keys=True)`, reimplemented here so the configurator
 * and the firmware record the exact same hash for the same payload.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const DEFAULT_VERSION = "2026.12";
const DEFAULT_OUT = "src/js/build_options.js";
const ENDPOINT_BASE = "https://build.betaflight.com/api/options";
const FETCH_TIMEOUT_MS = 10000;

const ALLOWED_FLAGS = new Set(["out"]);

function parseArgs(argv) {
    const args = {};
    const rest = [...argv];

    if (rest.length > 0 && !rest[0].startsWith("--")) {
        args.target = rest.shift();
    }

    for (let i = 0; i < rest.length; i += 2) {
        const flag = rest[i];
        if (!flag?.startsWith("--")) {
            throw new Error(`Expected a CLI flag starting with --, got: ${flag ?? "<missing>"}`);
        }
        const value = rest[i + 1];
        if (value === undefined || value.startsWith("--")) {
            throw new Error(`Missing value for CLI flag: ${flag}`);
        }
        const key = flag.slice(2);
        if (!ALLOWED_FLAGS.has(key)) {
            throw new Error(`Unknown CLI flag: ${flag}`);
        }
        args[key] = value;
    }

    return args;
}

function endpointUrl(target) {
    const version = target ?? DEFAULT_VERSION;
    if (/^https?:\/\//i.test(version)) {
        return version;
    }
    return `${ENDPOINT_BASE}/${version}`;
}

const JSON_STRING_ESCAPES = {
    '"': String.raw`\"`,
    "\\": String.raw`\\`,
    "\n": String.raw`\n`,
    "\r": String.raw`\r`,
    "\t": String.raw`\t`,
    "\b": String.raw`\b`,
    "\f": String.raw`\f`,
};

function unicodeEscape(codePoint) {
    return String.raw`\u${codePoint.toString(16).padStart(4, "0")}`;
}

// Mirrors python's json string encoder with ensure_ascii=True.
function pythonJsonString(value) {
    let out = '"';
    for (const character of value) {
        const codePoint = character.codePointAt(0);
        if (JSON_STRING_ESCAPES[character]) {
            out += JSON_STRING_ESCAPES[character];
        } else if (codePoint < 0x20) {
            out += unicodeEscape(codePoint);
        } else if (codePoint < 0x7f) {
            out += character;
        } else if (codePoint > 0xffff) {
            const offset = codePoint - 0x10000;
            out += unicodeEscape(0xd800 + (offset >> 10));
            out += unicodeEscape(0xdc00 + (offset & 0x3ff));
        } else {
            out += unicodeEscape(codePoint);
        }
    }
    return `${out}"`;
}

// python sorts strings by code point; JS `Array.prototype.sort` compares UTF-16
// code units, which differs once astral characters are involved.
function compareCodePoints(left, right) {
    const a = Array.from(left, (character) => character.codePointAt(0));
    const b = Array.from(right, (character) => character.codePointAt(0));
    const shared = Math.min(a.length, b.length);
    for (let i = 0; i < shared; i++) {
        if (a[i] !== b[i]) {
            return a[i] - b[i];
        }
    }
    return a.length - b.length;
}

/*
 * Mirrors python's `json.dumps(value, sort_keys=True)`: recursively sorted keys,
 * python's default separators (", " and ": ") and ensure_ascii=True.
 *
 * Numbers are deliberately restricted to safe integers, which is all the options
 * API serves. python's float repr (`1.0`, `1e+16`, `-0.0`) and its arbitrary
 * precision integers do not round-trip through `String(value)`, so a payload
 * carrying one would silently produce a hash the firmware generator disagrees
 * with. Refuse loudly instead.
 */
function pythonJsonDumps(value) {
    if (value === null) {
        return "null";
    }
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value)) {
            throw new TypeError(
                `Cannot reproduce python's json.dumps() for the number ${value}: the input hash serializer supports safe integers only`,
            );
        }
        return String(value);
    }
    if (typeof value === "string") {
        return pythonJsonString(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(pythonJsonDumps).join(", ")}]`;
    }
    const entries = Object.keys(value)
        .sort(compareCodePoints)
        .map((key) => `${pythonJsonString(key)}: ${pythonJsonDumps(value[key])}`);
    return `{${entries.join(", ")}}`;
}

function inputHash(data) {
    // NOSONAR javascript:S4790 — md5 here is a content fingerprint recorded in the
    // generated header, chosen to match the firmware generator's hash for the same
    // payload. It guards nothing and is never used in a security context.
    return createHash("md5").update(pythonJsonDumps(data), "utf8").digest("hex"); // NOSONAR
}

// Mirrors camel_case_to_title() in the firmware generator.
function camelCaseToTitle(value) {
    if (!value) {
        return "Unspecified";
    }
    return value
        .replaceAll(" ", "")
        .replace(/[A-Z]/g, (character) => ` ${character}`)
        .trimStart()
        .replace(/[A-Za-z]+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

async function fetchBuildOptions(url) {
    let response;
    try {
        response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (error) {
        throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`);
    }

    const body = await response.text();
    let data;
    try {
        data = JSON.parse(body);
    } catch (error) {
        throw new Error(`Response from ${url} is not valid JSON: ${error.message}`);
    }
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
        throw new TypeError(`Response from ${url} is not a JSON object of option groups`);
    }

    return data;
}

// A define is emitted as a bare object key, so it has to be a valid JS identifier.
const DEFINE_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// A group name is emitted as a `//` comment, so anything that could end that line
// would escape the comment and land in the module as code.
const GROUP_PATTERN = /^[A-Za-z0-9 _-]+$/;

function validateOption(option, group, url) {
    if (option === null || typeof option !== "object") {
        throw new TypeError(`Group "${group}" from ${url} contains a malformed option entry`);
    }

    const define = option.value;
    // The "[None]" entry carries neither a define nor a key, and is not an option.
    // Anything else that is missing one of the two is malformed, not skippable.
    if (!define && option.key === undefined) {
        return undefined;
    }
    if (typeof define !== "string" || define.length === 0) {
        throw new TypeError(`Group "${group}" from ${url} has an option without a usable string value`);
    }
    if (!DEFINE_PATTERN.test(define)) {
        throw new Error(
            `Group "${group}" from ${url} has option value "${define}", which is not a valid JavaScript identifier`,
        );
    }
    // An option that lost its numeric key would silently shrink the table, which is
    // the drift this generator exists to prevent.
    if (!Number.isInteger(option.key)) {
        throw new TypeError(`Group "${group}" from ${url} has option "${define}" without an integer key`);
    }

    return { define, key: option.key };
}

function collectGroupOptions(group, optionList, url, seenDefines) {
    if (!Array.isArray(optionList)) {
        throw new TypeError(`Group "${group}" from ${url} is not an array of options`);
    }
    if (!GROUP_PATTERN.test(group)) {
        throw new Error(`Group name ${JSON.stringify(group)} from ${url} is not a plain group name`);
    }

    const options = [];
    for (const option of optionList) {
        const validated = validateOption(option, group, url);
        if (!validated) {
            continue;
        }
        const seenIn = seenDefines.get(validated.define);
        if (seenIn !== undefined) {
            throw new Error(
                `Option value "${validated.define}" from ${url} appears in both group "${seenIn}" and group "${group}"`,
            );
        }
        seenDefines.set(validated.define, group);
        options.push(validated);
    }

    return options;
}

function collectOptions(data, url) {
    const groups = [];
    const seenDefines = new Map();

    for (const [group, optionList] of Object.entries(data)) {
        const options = collectGroupOptions(group, optionList, url, seenDefines);
        if (options.length > 0) {
            groups.push({ title: camelCaseToTitle(group), options });
        }
    }

    if (groups.length === 0) {
        throw new Error(`Response from ${url} contained no usable build options`);
    }

    return groups;
}

function renderModule(url, hash, groups) {
    const lines = [
        "/*",
        " * WARNING: This is an auto-generated file, please do not edit directly!",
        " *",
        " * Generator    : `scripts/generate-build-options.mjs`",
        ` * Source       : ${url}`,
        ` * Input hash   : ${hash}`,
        " */",
        "",
        "export const FIRMWARE_BUILD_OPTIONS = {",
    ];

    groups.forEach((group, index) => {
        if (index > 0) {
            lines.push("");
        }
        lines.push(`    // ${group.title}`);
        for (const option of group.options) {
            lines.push(`    ${option.define}: ${option.key},`);
        }
    });

    lines.push("};", "");

    return lines.join("\n");
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const url = endpointUrl(args.target);
    const outPath = resolve(projectRoot, args.out ?? DEFAULT_OUT);

    const data = await fetchBuildOptions(url);
    const hash = inputHash(data);
    const groups = collectOptions(data, url);
    const contents = renderModule(url, hash, groups);

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, contents, "utf8");

    const count = groups.reduce((total, group) => total + group.options.length, 0);
    console.log(`generate-build-options: input hash ${hash}`);
    console.log(`generate-build-options: wrote ${count} options to ${outPath}`);
}

// Error messages interpolate CLI arguments and the endpoint URL, so strip anything
// that could forge a second line before the message reaches stderr.
function singleLine(message) {
    return String(message).replace(/[\u0000-\u001f\u007f]/g, " ");
}

try {
    await main();
} catch (error) {
    console.error(`generate-build-options: ${singleLine(error.message)}`); // NOSONAR jssecurity:S5145 — sanitised above
    process.exit(1);
}
