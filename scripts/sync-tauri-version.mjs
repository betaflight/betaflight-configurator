#!/usr/bin/env node
/**
 * Syncs the version from package.json into the Tauri bundle metadata
 * (src-tauri/tauri.conf.json and src-tauri/Cargo.toml).
 *
 * Tauri requires a plain SemVer string (e.g. "2026.6.0"), so pre-release
 * suffixes like "-alpha" are stripped. The stripped version is still unique
 * per published release because package.json bumps on every release.
 *
 * Runs automatically via `beforeBuildCommand` in tauri.conf.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const pkg = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));
const version = pkg.version.split("-", 1)[0];

if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`sync-tauri-version: package.json version "${pkg.version}" did not produce a valid SemVer after stripping pre-release tag (got "${version}").`);
    process.exit(1);
}

// tauri.conf.json
const confPath = resolve(projectRoot, "src-tauri/tauri.conf.json");
const conf = JSON.parse(readFileSync(confPath, "utf8"));
if (conf.version !== version) {
    conf.version = version;
    writeFileSync(confPath, `${JSON.stringify(conf, null, 4)}\n`);
    console.log(`sync-tauri-version: tauri.conf.json → ${version}`);
}

// Cargo.toml — line-level edit to avoid pulling in a TOML dep.
// Scope the replacement to the `[package]` section so a dependency named
// `version` (or any other section's version line) can never be touched.
const cargoPath = resolve(projectRoot, "src-tauri/Cargo.toml");
const cargo = readFileSync(cargoPath, "utf8");
const packageVersionRe = /(^\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m;
if (!packageVersionRe.test(cargo)) {
    console.error(`sync-tauri-version: could not locate [package].version in ${cargoPath}`);
    process.exit(1);
}
const updated = cargo.replace(packageVersionRe, `$1${version}$3`);
if (updated !== cargo) {
    writeFileSync(cargoPath, updated);
    console.log(`sync-tauri-version: Cargo.toml → ${version}`);
}
