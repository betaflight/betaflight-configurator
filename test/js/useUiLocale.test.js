import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computed, createApp, h, nextTick } from "vue";
import i18nextBase from "i18next";
import I18NextVue from "i18next-vue";
import UApp from "@nuxt/ui/components/App.vue";
import { useLocale } from "@nuxt/ui/composables";
import { useUiLocale } from "../../src/composables/useUiLocale";
import { i18n } from "../../src/js/localization.js";

describe("i18n.getUiLocale", () => {
    it("maps every language the configurator offers onto its own Nuxt UI locale", () => {
        for (const language of i18n.getLanguagesAvailables()) {
            // A silent fallback to English would still yield a locale, so assert the exact
            // code: Nuxt UI writes dialects with a hyphen where the configurator uses "_".
            expect(i18n.getUiLocale(language).code, `no Nuxt UI locale for "${language}"`).toBe(
                language.replaceAll("_", "-"),
            );
        }
    });

    it("agrees with i18next about the text direction of every language", () => {
        expect(i18n.getUiLocale("ar").dir).toBe("rtl");

        for (const language of i18n.getLanguagesAvailables()) {
            const isRtl = i18n.getUiLocale(language).dir === "rtl";

            expect(isRtl, `direction mismatch for "${language}"`).toBe(i18n.isRtl(language));
        }
    });

    it("accepts hyphenated dialects and falls back to the base language", () => {
        expect(i18n.getUiLocale("zh-CN").code).toBe("zh-CN");
        expect(i18n.getUiLocale("de_AT").code).toBe("de");
    });

    it("falls back to English for unknown or missing codes", () => {
        expect(i18n.getUiLocale("xx_YY").code).toBe("en");
        expect(i18n.getUiLocale("").code).toBe("en");
    });
});

/**
 * Reka UI measures its popper anchors, which jsdom cannot do.
 * Only the locale context is under test here, so an inert observer is enough.
 */
class InertResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

/**
 * Drives the real chain the app uses — i18next language -> useUiLocale() -> UApp ->
 * useLocale() — so that a useUiLocale() which failed to react to `languageChanged`, or a
 * UApp that never received the locale, fails here rather than passing.
 */
function mountAppWithI18next(i18next) {
    const probe = {
        setup() {
            const { dir } = useLocale();
            // Same derivation as both HelpIcon components.
            const tooltipSide = computed(() => (dir.value === "rtl" ? "left" : "right"));

            return () => h("div", { "data-dir": dir.value, "data-side": tooltipSide.value });
        },
    };

    const host = document.createElement("div");
    document.body.appendChild(host);

    const app = createApp({
        setup() {
            const uiLocale = useUiLocale();

            return () => h(UApp, { locale: uiLocale.value }, { default: () => h(probe) });
        },
    });
    app.use(I18NextVue, { i18next });
    app.mount(host);

    return {
        read: () => {
            const el = host.querySelector("[data-dir]");

            return { dir: el?.dataset.dir, side: el?.dataset.side };
        },
        destroy: () => {
            app.unmount();
            host.remove();
        },
    };
}

/** i18next-vue invalidates its reactive marker inside nextTick, so the re-render lands a tick later. */
async function flushLanguageChange() {
    await nextTick();
    await nextTick();
}

describe("useUiLocale", () => {
    let originalResizeObserver;
    let i18next;
    let mounted;

    beforeEach(async () => {
        originalResizeObserver = globalThis.ResizeObserver;
        globalThis.ResizeObserver = InertResizeObserver;

        i18next = i18nextBase.createInstance();
        await i18next.init({
            lng: "en",
            ns: ["messages"],
            defaultNS: "messages",
            resources: { en: { messages: {} }, ar: { messages: {} }, zh_CN: { messages: {} } },
        });
    });

    afterEach(() => {
        mounted?.destroy();
        mounted = undefined;
        globalThis.ResizeObserver = originalResizeObserver;
    });

    it("hands Nuxt UI the direction of the language it starts on", () => {
        mounted = mountAppWithI18next(i18next);

        expect(mounted.read()).toEqual({ dir: "ltr", side: "right" });
    });

    it("flips Nuxt UI to RTL when the language changes to Arabic", async () => {
        mounted = mountAppWithI18next(i18next);

        await i18next.changeLanguage("ar");
        await flushLanguageChange();

        expect(mounted.read()).toEqual({ dir: "rtl", side: "left" });
    });

    it("flips back to LTR when the language changes away from Arabic", async () => {
        mounted = mountAppWithI18next(i18next);

        await i18next.changeLanguage("ar");
        await flushLanguageChange();
        await i18next.changeLanguage("zh_CN");
        await flushLanguageChange();

        expect(mounted.read()).toEqual({ dir: "ltr", side: "right" });
    });
});
