import { describe, expect, it, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Serve the real locales/ tree to i18next-http-backend through a fetch stub, so this
// exercises the actual init options in src/js/localization.js against the shipped files.
beforeAll(() => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url) => {
            const path = String(url).replace(/^.*?\.\/locales\//, "locales/");
            const body = readFileSync(resolve(process.cwd(), path), "utf8");
            return { ok: true, status: 200, text: async () => body };
        }),
    );
});

describe("i18n init against the shipped locale files", () => {
    it("loads en and resolves keys, including nested and positional forms", async () => {
        const { i18n } = await import("../../src/js/localization.js");
        await new Promise((done) => i18n.init(done));

        expect(i18n.getCurrentLocale()).toBe("en");
        expect(i18n.existsMessage("auxiliaryHelpMode_ARM")).toBe(true);
        expect(i18n.getMessage("auxiliaryHelpMode_ARM")).not.toBe("auxiliaryHelpMode_ARM");
        expect(i18n.getMessage("auxiliaryHelpMode_ARM")).not.toMatch(/\$t\(|\{\{/);
    });

    it("switches to a region-tagged locale and loads that file", async () => {
        const { i18n } = await import("../../src/js/localization.js");
        i18n.changeLanguage("zh-CN");
        await vi.waitFor(() => expect(i18n.getCurrentLocale()).toBe("zh-CN"));
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining("locales/zh-CN/messages.json"), expect.anything());
    });

    it("reports text direction per locale", async () => {
        const { i18n } = await import("../../src/js/localization.js");
        expect(i18n.isRtl("ar")).toBe(true);
        expect(i18n.isRtl("en")).toBe(false);
    });
});
