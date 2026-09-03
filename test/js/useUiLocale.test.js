import { describe, expect, it } from "vitest";
import { computed, createApp, h } from "vue";
import UApp from "@nuxt/ui/components/App.vue";
import { useLocale } from "@nuxt/ui/composables";
import { resolveUiLocale } from "../../src/composables/useUiLocale.js";
import { i18n } from "../../src/js/localization.js";

describe("resolveUiLocale", () => {
    it("maps every language the configurator offers onto its own Nuxt UI locale", () => {
        for (const language of i18n.getLanguagesAvailables()) {
            // A silent fallback to English would still yield a locale, so assert the exact
            // code: Nuxt UI writes dialects with a hyphen where the configurator uses "_".
            expect(resolveUiLocale(language).code, `no Nuxt UI locale for "${language}"`).toBe(
                language.replaceAll("_", "-"),
            );
        }
    });

    it("agrees with i18next about the text direction of every language", () => {
        expect(resolveUiLocale("ar").dir).toBe("rtl");

        for (const language of i18n.getLanguagesAvailables()) {
            const isRtl = resolveUiLocale(language).dir === "rtl";

            expect(isRtl, `direction mismatch for "${language}"`).toBe(i18n.isRtl(language));
        }
    });

    it("accepts hyphenated dialects and falls back to the base language", () => {
        expect(resolveUiLocale("zh-CN").code).toBe("zh-CN");
        expect(resolveUiLocale("de_AT").code).toBe("de");
    });

    it("falls back to English for unknown or missing codes", () => {
        expect(resolveUiLocale("xx_YY").code).toBe("en");
        expect(resolveUiLocale(undefined).code).toBe("en");
    });
});

/**
 * Mounts a probe inside a real UApp to check that a locale handed to UApp reaches
 * `useLocale()`, which is how both HelpIcon components derive their tooltip side.
 */
function mountWithLocale(language) {
    const Probe = {
        setup() {
            const { dir } = useLocale();
            const tooltipSide = computed(() => (dir.value === "rtl" ? "left" : "right"));

            return () => h("div", { "data-dir": dir.value, "data-side": tooltipSide.value });
        },
    };

    const host = document.createElement("div");
    document.body.appendChild(host);

    const app = createApp({
        setup() {
            return () => h(UApp, { locale: resolveUiLocale(language) }, { default: () => h(Probe) });
        },
    });
    app.mount(host);

    const probe = host.querySelector("[data-dir]");
    const observed = { dir: probe?.dataset.dir, side: probe?.dataset.side };

    app.unmount();
    host.remove();

    return observed;
}

describe("UApp locale propagation", () => {
    it("flips direction and tooltip side for an RTL language", () => {
        expect(mountWithLocale("ar")).toEqual({ dir: "rtl", side: "left" });
    });

    it("keeps LTR direction and tooltip side for an LTR language", () => {
        expect(mountWithLocale("zh_CN")).toEqual({ dir: "ltr", side: "right" });
    });

    it("defaults to LTR when the language is unknown", () => {
        expect(mountWithLocale("xx_YY")).toEqual({ dir: "ltr", side: "right" });
    });
});
