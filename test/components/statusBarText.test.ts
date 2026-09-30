import { describe, expect, it } from "vitest";
import { shortenTargetDisplay, stripVersionDisplay } from "../../src/components/status-bar/statusBarText";

// The regex versions these replaced; the helpers must agree with them on every input.
function shortenWithRegex(name: string): string {
    let s = name.trim();
    const i = s.indexOf("/");
    if (i >= 0) {
        s = s.slice(i + 1);
    }
    return s.replace(/\([^)]*\)\s*$/, "").trim();
}

function stripWithRegex(version: string): string {
    let s = version.trim();
    let prev;
    do {
        prev = s;
        s = s.replace(/\s+\([^)]*\)\s*$/, "").trim();
    } while (s !== prev);
    return s;
}

// Every string of up to 7 characters over the characters the patterns care about.
function* allStrings(alphabet: string, maxLength: number): Generator<string> {
    yield "";
    let level = [""];
    for (let length = 1; length <= maxLength; length++) {
        const next: string[] = [];
        for (const prefix of level) {
            for (const c of alphabet) {
                next.push(prefix + c);
            }
        }
        yield* next;
        level = next;
    }
}

describe("status bar text", () => {
    it("shortens targets exactly as the regex did", () => {
        for (const s of allStrings("a/() \t", 7)) {
            if (s.trim()) {
                expect(shortenTargetDisplay(s), JSON.stringify(s)).toBe(shortenWithRegex(s));
            }
        }
    });

    it("strips version groups exactly as the regex did", () => {
        for (const s of allStrings("a() \t", 7)) {
            if (s.trim()) {
                expect(stripVersionDisplay(s), JSON.stringify(s)).toBe(stripWithRegex(s));
            }
        }
    });

    it("handles the shapes the status bar shows", () => {
        expect(shortenTargetDisplay("MFGID/TARGETNAME(MCUNAME)")).toBe("TARGETNAME");
        expect(shortenTargetDisplay("a(b (c)")).toBe("a");
        expect(stripVersionDisplay("25.1.0 (a1b2c3d)")).toBe("25.1.0");
        expect(stripVersionDisplay("4.5.0 (x) (y)")).toBe("4.5.0");
        expect(stripVersionDisplay("a(b (c)")).toBe("a(b");
        expect(stripVersionDisplay("4.5.0(nospace)")).toBe("4.5.0(nospace)");
        expect(shortenTargetDisplay(null)).toBe("");
        expect(stripVersionDisplay(42)).toBe("");
    });
});
