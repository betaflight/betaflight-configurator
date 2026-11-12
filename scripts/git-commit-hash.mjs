/**
 * Short commit hash of the checkout, for the build's __APP_REVISION__.
 *
 * Trust assumptions (Sonar S4036, issue #5784):
 *
 * - git is run with execFileSync and no shell, so nothing in the command line
 *   is interpreted and no shell is looked up.
 * - git itself is taken from a fixed, admin-writable install location when one
 *   exists, the same way scripts/check-tauri-prereqs.mjs finds pkg-config, so
 *   a directory planted early in PATH cannot substitute it there.
 * - Only when git lives somewhere else (nix, scoop, asdf, a custom prefix) is
 *   it looked up through PATH. That is the PATH which already chose the node
 *   and npm running this build, so anyone able to change it can run code in
 *   the build without git's help; the lookup adds no reach of its own.
 *
 * The hash length is left to git (core.abbrev), so it stays the length
 * `git rev-parse --short HEAD` prints and is unambiguous in this repository.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { win32 } from "node:path";

const POSIX_GIT_CANDIDATES = ["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git"];

function windowsGitCandidates(env) {
    return [env.ProgramFiles, env["ProgramFiles(x86)"], env.ProgramW6432]
        .filter(Boolean)
        .map((programFiles) => win32.join(programFiles, "Git", "cmd", "git.exe"));
}

/**
 * The git executable to run: an absolute path from a fixed install location,
 * or the bare name "git" when none of them holds it.
 */
export function resolveGitBinary({ platform = process.platform, env = process.env, exists = existsSync } = {}) {
    const candidates = platform === "win32" ? windowsGitCandidates(env) : POSIX_GIT_CANDIDATES;
    return candidates.find((candidate) => exists(candidate)) ?? "git";
}

export function getCommitHash({ cwd = process.cwd(), gitBinary = resolveGitBinary(), exec = execFileSync } = {}) {
    // The PATH fallback is justified in the trust assumptions above.
    return exec(gitBinary, ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf8", shell: false }).trim(); // NOSONAR
}
