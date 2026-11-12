import { describe, it, expect, vi } from "vitest";
import { getCommitHash, resolveGitBinary } from "../../scripts/git-commit-hash.mjs";

describe("resolveGitBinary", () => {
    it("prefers a fixed POSIX install location over PATH", () => {
        const exists = (path: string) => path === "/usr/local/bin/git";
        expect(resolveGitBinary({ platform: "linux", env: { PATH: "/tmp/evil" }, exists })).toBe("/usr/local/bin/git");
    });

    it("takes the first fixed location that exists", () => {
        const exists = (path: string) => path === "/usr/bin/git" || path === "/opt/homebrew/bin/git";
        expect(resolveGitBinary({ platform: "darwin", env: {}, exists })).toBe("/usr/bin/git");
    });

    it("never resolves git from a PATH entry itself", () => {
        const probed: string[] = [];
        const exists = (path: string) => {
            probed.push(path);
            return path.startsWith("/tmp/evil");
        };
        expect(resolveGitBinary({ platform: "linux", env: { PATH: "/tmp/evil:/usr/bin" }, exists })).toBe("git");
        expect(probed.some((path) => path.startsWith("/tmp/evil"))).toBe(false);
    });

    it("finds Git for Windows under Program Files", () => {
        const env = { ProgramFiles: "D:\\Program Files", "ProgramFiles(x86)": "D:\\Program Files (x86)" };
        const exists = (path: string) => path === "D:\\Program Files (x86)\\Git\\cmd\\git.exe";
        expect(resolveGitBinary({ platform: "win32", env, exists })).toBe("D:\\Program Files (x86)\\Git\\cmd\\git.exe");
    });

    it("falls back to the bare name when git is installed elsewhere", () => {
        expect(resolveGitBinary({ platform: "win32", env: {}, exists: () => false })).toBe("git");
        expect(resolveGitBinary({ platform: "linux", env: {}, exists: () => false })).toBe("git");
    });
});

describe("getCommitHash", () => {
    it("runs git rev-parse without a shell and trims the output", () => {
        const exec = vi.fn(() => "5c43bee8\n");
        expect(getCommitHash({ cwd: "/repo", gitBinary: "/usr/bin/git", exec })).toBe("5c43bee8");
        expect(exec).toHaveBeenCalledWith("/usr/bin/git", ["rev-parse", "--short", "HEAD"], {
            cwd: "/repo",
            encoding: "utf8",
            shell: false,
        });
    });

    it("reads a short hash from this checkout", () => {
        expect(getCommitHash()).toMatch(/^[0-9a-f]{7,40}$/);
    });
});
