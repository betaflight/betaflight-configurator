import { describe, expect, it } from "vitest";

import { mixerList, resolveMixerModelFile } from "../../src/js/model.js";

function mixerId(name) {
    return mixerList.findIndex((mixer) => mixer.name === name) + 1;
}

describe("resolveMixerModelFile", () => {
    it("keeps built-in mixer meshes", () => {
        expect(resolveMixerModelFile(mixerId("Quad X"), 4)).toBe("quad_x");
        expect(resolveMixerModelFile(mixerId("Tricopter"), 3)).toBe("tricopter");
        expect(resolveMixerModelFile(mixerId("Airplane"), 1)).toBe("airplane");
        expect(resolveMixerModelFile(mixerId("A-tail Quad"), 4)).toBe("quad_atail");
    });

    it("maps Custom Airplane / Custom Tricopter to their craft meshes", () => {
        expect(resolveMixerModelFile(mixerId("Custom Airplane"), 1)).toBe("airplane");
        expect(resolveMixerModelFile(mixerId("Custom Tricopter"), 3)).toBe("tricopter");
    });

    it("maps generic Custom by FC motor count (deadcat mmix → quad_x)", () => {
        const custom = mixerId("Custom");

        expect(resolveMixerModelFile(custom, 4)).toBe("quad_x");
        expect(resolveMixerModelFile(custom, 3)).toBe("tricopter");
        expect(resolveMixerModelFile(custom, 6)).toBe("hex_x");
        expect(resolveMixerModelFile(custom, 1)).toBe("airplane");
        expect(resolveMixerModelFile(custom, 0)).toBe("fallback");
        expect(resolveMixerModelFile(custom, 8)).toBe("fallback");
    });

    it("does not infer meshes from motor count for other custom-model mixers", () => {
        // Flying Wing / Hex H / octo variants share model:"custom" but are not Custom mmix.
        expect(resolveMixerModelFile(mixerId("Flying Wing"), 1)).toBe("fallback");
        expect(resolveMixerModelFile(mixerId("Hex H"), 6)).toBe("fallback");
        expect(resolveMixerModelFile(mixerId("Octo X8"), 8)).toBe("fallback");
        expect(resolveMixerModelFile(mixerId("Bicopter"), 2)).toBe("fallback");
    });

    it("returns fallback for unknown mixer ids", () => {
        expect(resolveMixerModelFile(0, 4)).toBe("fallback");
        expect(resolveMixerModelFile(mixerList.length + 1, 4)).toBe("fallback");
    });
});
