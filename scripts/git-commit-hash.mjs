/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Short commit hash of the checkout, for the build's __APP_REVISION__.
 *
 * Trust assumptions (Sonar S4036, issue #5784):
 *
 * - git is run with execFileSync and no shell, so nothing in the command line
 *   is interpreted and no shell is looked up.
 * - git is first taken from fixed install locations - the system one, then the
 *   Homebrew prefixes, then Git for Windows under Program Files - the way
 *   scripts/check-tauri-prereqs.mjs finds pkg-config. These are absolute paths
 *   chosen here, never PATH entries, so a directory planted early in PATH
 *   cannot substitute git there. (The Homebrew prefixes belong to the user who
 *   installed Homebrew, which is no wider than that user's own PATH.)
 * - A location that exists but cannot run git is skipped: on macOS
 *   /usr/bin/git is a shim that fails until the Xcode Command Line Tools are
 *   installed, while a Homebrew git may work.
 * - Only when none of them works is git looked up through PATH. That is the
 *   PATH which already chose the node and npm running this build, so anyone
 *   able to change it can run code in the build without git's help; the lookup
 *   adds no reach of its own.
 *
 * The hash length is left to git (core.abbrev), so it stays the length
 * `git rev-parse --short HEAD` prints and is unambiguous in this repository.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { win32 } from "node:path";

const POSIX_GIT_CANDIDATES = ["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git"];
const PATH_GIT = "git";

function windowsGitCandidates(env) {
    return [env.ProgramFiles, env["ProgramFiles(x86)"], env.ProgramW6432]
        .filter(Boolean)
        .map((programFiles) => win32.join(programFiles, "Git", "cmd", "git.exe"));
}

/**
 * The git executables to try, in order: the absolute paths of the fixed
 * install locations that exist, then the bare name "git" for a PATH lookup.
 */
export function resolveGitBinaries({ platform = process.platform, env = process.env, exists = existsSync } = {}) {
    const candidates = platform === "win32" ? windowsGitCandidates(env) : POSIX_GIT_CANDIDATES;
    return [...new Set(candidates)].filter((candidate) => exists(candidate)).concat(PATH_GIT);
}

/**
 * Runs `git rev-parse --short HEAD` with each binary in turn and returns the
 * first answer; throws the last failure when none of them gives one.
 */
export function getCommitHash({ cwd = process.cwd(), gitBinaries = resolveGitBinaries(), exec = execFileSync } = {}) {
    let lastError;
    for (const gitBinary of gitBinaries) {
        try {
            // The PATH fallback is justified in the trust assumptions above.
            return exec(gitBinary, ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf8", shell: false }).trim(); // NOSONAR
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}
