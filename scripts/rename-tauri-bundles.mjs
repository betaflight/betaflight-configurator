#!/usr/bin/env node
/*
 * Normalises Tauri bundle filenames in a directory so they use a consistent
 * kebab-cased form: "Betaflight App" collapses to "betaflight-app", spaces
 * and underscores become dashes, and the x86_64 architecture token is left
 * intact. Optionally rewrites the version segment for nightly builds.
 *
 * Usage:
 *   node rename-tauri-bundles.mjs --dir <path>
 *                                [--from-version <v> --to-version <v>]
 */
import { readdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";

const ARCH_TOKEN = "x86_64";
const ARCH_PLACEHOLDER = "\u0000ARCH\u0000";
const ALLOWED_FLAGS = new Set(["dir", "from-version", "to-version"]);

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 2) {
        const flag = argv[i];
        if (!flag?.startsWith("--")) {
            throw new Error(`Expected a CLI flag starting with --, got: ${flag ?? "<missing>"}`);
        }
        const value = argv[i + 1];
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

function normalise(name) {
    let next = name.replaceAll("Betaflight App", "betaflight-app");
    next = next.replaceAll(ARCH_TOKEN, ARCH_PLACEHOLDER);
    next = next.replaceAll(" ", "-");
    next = next.replaceAll("_", "-");
    next = next.replaceAll(ARCH_PLACEHOLDER, ARCH_TOKEN);
    return next;
}

try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.dir) {
        throw new Error("--dir is required");
    }
    const fromVersion = args["from-version"];
    const toVersion = args["to-version"];
    if (Boolean(fromVersion) !== Boolean(toVersion)) {
        throw new Error("--from-version and --to-version must be provided together");
    }

    const entries = readdirSync(args.dir);
    let renamed = 0;
    for (const name of entries) {
        const full = join(args.dir, name);
        if (!statSync(full).isFile()) {
            continue;
        }
        let next = name;
        if (fromVersion && next.includes(fromVersion)) {
            next = next.replace(fromVersion, toVersion);
        }
        next = normalise(next);
        if (next !== name) {
            renameSync(full, join(args.dir, next));
            renamed++;
            console.log(`${name} -> ${next}`);
        }
    }
    console.log(`Renamed ${renamed} of ${entries.length} files`);
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
