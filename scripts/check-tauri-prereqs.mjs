#!/usr/bin/env node
/**
 * Pre-flight check for Tauri prerequisites.
 *
 * Runs before `tauri dev` / `tauri build` so a missing system lib fails
 * fast with an actionable apt line instead of panicking mid-Cargo-compile
 * after several minutes.
 *
 * Linux is the main source of pain — macOS and Windows prereqs are handled
 * cleanly by rustup / Xcode CLT / VS Build Tools, so this script is
 * effectively a no-op there.
 */
import { execSync } from "node:child_process";
import { platform } from "node:os";

const missing = [];

function requirePkgConfig(pkg, aptPkg, note = "") {
    try {
        execSync(`pkg-config --exists ${pkg}`, { stdio: "pipe" });
    } catch {
        missing.push({ lib: pkg, apt: aptPkg, note });
    }
}

if (platform() === "linux") {
    try {
        execSync("pkg-config --version", { stdio: "pipe" });
    } catch {
        console.error("Tauri prereq check: `pkg-config` is not installed.");
        console.error("  sudo apt install -y pkg-config build-essential");
        process.exit(1);
    }

    // Required by Tauri's webview + bundler.
    requirePkgConfig("webkit2gtk-4.1", "libwebkit2gtk-4.1-dev");
    requirePkgConfig("javascriptcoregtk-4.1", "libjavascriptcoregtk-4.1-dev");
    requirePkgConfig("libsoup-3.0", "libsoup-3.0-dev");
    requirePkgConfig("librsvg-2.0", "librsvg2-dev");
    requirePkgConfig("openssl", "libssl-dev");

    // Required by tauri-plugin-serialplugin for device enumeration.
    requirePkgConfig("libudev", "libudev-dev", "serial device enumeration");
}

if (missing.length > 0) {
    console.error("");
    console.error("Tauri prerequisites missing on this system:");
    console.error("");
    for (const m of missing) {
        const suffix = m.note ? ` — ${m.note}` : "";
        console.error(`  - ${m.lib}${suffix}`);
        console.error(`    apt: ${m.apt}`);
    }
    const aptList = [...new Set(missing.map((m) => m.apt))].join(" ");
    console.error("");
    console.error("One-shot install:");
    console.error(`  sudo apt install -y ${aptList}`);
    console.error("");
    console.error("See https://v2.tauri.app/start/prerequisites/ for the full list.");
    console.error("");
    process.exit(1);
}
