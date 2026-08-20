import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FIRMWARE_BUILD_OPTIONS } from "../../src/js/build_options.js";
import EscProtocols from "../../src/js/utils/EscProtocols";

// vitest runs from the repo root.
const generatedFile = readFileSync(resolve("src/js/build_options.js"), "utf8");

describe("build_options", () => {
    it("keeps the generated header that records where the table came from", () => {
        expect(generatedFile).toContain("auto-generated file");
        expect(generatedFile).toMatch(/Generator {4}: `scripts\/generate-build-options\.mjs`/);
        expect(generatedFile).toMatch(/Source {7}: https:\/\/build\.betaflight\.com\/api\/options\/[\w.]+/);
        expect(generatedFile).toMatch(/Input hash {3}: [0-9a-f]{32}/);
    });

    it("maps every option name to a distinct integer key", () => {
        const entries = Object.entries(FIRMWARE_BUILD_OPTIONS);

        expect(entries.length).toBeGreaterThan(0);
        for (const [name, key] of entries) {
            expect(name).toMatch(/^USE_[A-Z0-9_]+$/);
            expect(Number.isInteger(key)).toBe(true);
        }
        expect(new Set(entries.map(([, key]) => key)).size).toBe(entries.length);
    });

    it("carries the DroneCAN options served by the 2026.12 build API", () => {
        expect(FIRMWARE_BUILD_OPTIONS.USE_DRONECAN).toBe(16430);
        expect(FIRMWARE_BUILD_OPTIONS.USE_DRONECAN_ESC).toBe(8236);
    });
});

describe("EscProtocols.BUILD_OPTIONS", () => {
    it("only requires options the firmware can actually report", () => {
        // A name outside the table makes hasBuildOption() fail open, which would
        // silently drop the gating in production.
        for (const option of Object.values(EscProtocols.BUILD_OPTIONS)) {
            expect(Object.hasOwn(FIRMWARE_BUILD_OPTIONS, option)).toBe(true);
        }
    });

    it("only maps protocols the configurator offers", () => {
        const available = EscProtocols.GetAvailableProtocols("1.48.0");

        for (const protocol of Object.keys(EscProtocols.BUILD_OPTIONS)) {
            expect(available).toContain(protocol);
        }
    });

    it("leaves DISABLED unmapped so it is never gated", () => {
        expect(EscProtocols.GetBuildOption(EscProtocols.PROTOCOL_DISABLED)).toBeUndefined();
    });

    it("maps every offered protocol except DISABLED", () => {
        const unmapped = EscProtocols.GetAvailableProtocols("1.48.0").filter(
            (protocol) => EscProtocols.GetBuildOption(protocol) === undefined,
        );

        expect(unmapped).toEqual([EscProtocols.PROTOCOL_DISABLED]);
    });
});
