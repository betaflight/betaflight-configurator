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

import { describe, it, expect, vi } from "vitest";
import { getCommitHash, resolveGitBinaries } from "../../scripts/git-commit-hash";

const REV_PARSE = ["rev-parse", "--short", "HEAD"];

describe("resolveGitBinaries", () => {
    it("tries the fixed POSIX locations that exist, in order, before PATH", () => {
        const exists = (path: string) => path === "/usr/bin/git" || path === "/opt/homebrew/bin/git";
        expect(resolveGitBinaries({ platform: "darwin", env: { PATH: "/tmp/evil" }, exists })).toEqual([
            "/usr/bin/git",
            "/opt/homebrew/bin/git",
            "git",
        ]);
    });

    it("never probes a PATH entry itself", () => {
        const probed: string[] = [];
        const exists = (path: string) => {
            probed.push(path);
            return path.startsWith("/tmp/evil");
        };
        expect(resolveGitBinaries({ platform: "linux", env: { PATH: "/tmp/evil:/usr/bin" }, exists })).toEqual(["git"]);
        expect(probed.some((path) => path.startsWith("/tmp/evil"))).toBe(false);
    });

    it("finds Git for Windows under Program Files, once per directory", () => {
        const env = {
            ProgramFiles: "D:\\Program Files",
            ProgramW6432: "D:\\Program Files",
            "ProgramFiles(x86)": "D:\\Program Files (x86)",
        };
        const exists = (path: string) => path.endsWith("\\Git\\cmd\\git.exe");
        expect(resolveGitBinaries({ platform: "win32", env, exists })).toEqual([
            "D:\\Program Files\\Git\\cmd\\git.exe",
            "D:\\Program Files (x86)\\Git\\cmd\\git.exe",
            "git",
        ]);
    });

    it("leaves only the PATH lookup when git is installed elsewhere", () => {
        expect(resolveGitBinaries({ platform: "win32", env: {}, exists: () => false })).toEqual(["git"]);
        expect(resolveGitBinaries({ platform: "linux", env: {}, exists: () => false })).toEqual(["git"]);
    });
});

describe("getCommitHash", () => {
    it("runs git rev-parse without a shell and trims the output", () => {
        const exec = vi.fn(() => "5c43bee8\n");
        expect(getCommitHash({ cwd: "/repo", gitBinaries: ["/usr/bin/git", "git"], exec })).toBe("5c43bee8");
        expect(exec).toHaveBeenCalledTimes(1);
        expect(exec).toHaveBeenCalledWith("/usr/bin/git", REV_PARSE, { cwd: "/repo", encoding: "utf8", shell: false });
    });

    it("moves on when a location exists but cannot run git (the macOS /usr/bin/git shim)", () => {
        const exec = vi.fn((file: string) => {
            if (file === "/usr/bin/git") {
                throw new Error("xcrun: error: invalid active developer path");
            }
            return "5c43bee8\n";
        });
        expect(
            getCommitHash({ cwd: "/repo", gitBinaries: ["/usr/bin/git", "/opt/homebrew/bin/git", "git"], exec }),
        ).toBe("5c43bee8");
        expect(exec.mock.calls.map(([file]) => file)).toEqual(["/usr/bin/git", "/opt/homebrew/bin/git"]);
    });

    it("throws the last failure when no git works", () => {
        let attempt = 0;
        const exec = vi.fn(() => {
            attempt += 1;
            throw new Error(`failure ${attempt}`);
        });
        expect(() => getCommitHash({ cwd: "/repo", gitBinaries: ["/usr/bin/git", "git"], exec })).toThrow("failure 2");
    });

    it("reads a short hash from this checkout", () => {
        expect(getCommitHash()).toMatch(/^[0-9a-f]{4,40}$/);
    });
});
