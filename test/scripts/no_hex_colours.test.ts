import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";

// Lints through the project's own eslint.config.js, so this also covers the rule being wired up.
const eslint = new ESLint({ cwd: process.cwd() });

async function hexColours(source: string): Promise<{ line: number; column: number; message: string }[]> {
    const [result] = await eslint.lintText(source, { filePath: "src/components/Probe.vue" });
    return result.messages
        .filter((message) => message.ruleId === "betaflight/no-hex-colours")
        .map(({ line, column, message }) => ({ line, column, message }));
}

describe("betaflight/no-hex-colours", () => {
    it("reports a hex colour in a style block, at its position", async () => {
        const found = await hexColours(
            '<template><div /></template>\n<style lang="less">\n.probe {\n    color: #ABCDEF;\n    border-color: #fff8;\n}\n</style>\n',
        );
        expect(found.map(({ line, column }) => [line, column])).toEqual([
            [4, 12],
            [5, 19],
        ]);
        expect(found[0].message).toContain("#ABCDEF");
    });

    it("reports a hex colour in a static style attribute", async () => {
        const found = await hexColours('<template><div style="color: #123" /></template>\n');
        expect(found.map(({ line, column }) => [line, column])).toEqual([[1, 30]]);
    });

    it("allows theme tokens, comments, anchors, url() fragments and id selectors", async () => {
        const found = await hexColours(
            [
                '<template><a href="#add" :style="{ color: active }">x</a></template>',
                '<style lang="less">',
                "/* --surface-400 is #d6d6d6 */",
                ".probe {",
                "    color: var(--surface-100); // was #333",
                "    mask: url(icons.svg#bad);",
                "    width: 100%;",
                "}",
                "#face-panel, #deadline {",
                "    color: var(--text);",
                "}",
                "</style>",
                "",
            ].join("\n"),
        );
        expect(found).toEqual([]);
    });
});
