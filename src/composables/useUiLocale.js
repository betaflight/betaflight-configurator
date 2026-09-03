import { computed } from "vue";
import { useTranslation } from "i18next-vue";
import {
    ar,
    ca,
    da,
    de,
    en,
    es,
    eu,
    fr,
    gl,
    it,
    ja,
    ka,
    ko,
    nl,
    pl,
    pt,
    pt_br,
    ru,
    uk,
    uz,
    zh_cn,
    zh_tw,
} from "@nuxt/ui/locale";

/**
 * Nuxt UI locale for every language in `languagesAvailables` (src/js/localization.js).
 * Keys match the configurator's own codes, which use an underscore for dialects.
 *
 * Imported by name rather than as a namespace: `@nuxt/ui/locale` re-exports every locale
 * it ships, and a namespace import would defeat tree shaking for the ones we never use.
 */
const UI_LOCALES = {
    ar,
    ca,
    da,
    de,
    en,
    es,
    eu,
    fr,
    gl,
    it,
    ja,
    ka,
    ko,
    nl,
    pl,
    pt,
    pt_BR: pt_br,
    ru,
    uk,
    uz,
    zh_CN: zh_cn,
    zh_TW: zh_tw,
};

/**
 * Maps an i18next language code onto a Nuxt UI locale.
 * Falls back to the base language, then to English, so an unknown code degrades to LTR
 * instead of leaving Nuxt UI without a locale at all.
 * @param {string | undefined} language i18next language code, e.g. "ar", "pt_BR", "zh-CN"
 * @returns {object} a Nuxt UI locale object
 */
export function resolveUiLocale(language) {
    if (!language) {
        return en;
    }

    const normalized = language.replaceAll("-", "_");

    return UI_LOCALES[normalized] ?? UI_LOCALES[normalized.split("_")[0]] ?? en;
}

/**
 * Reactive Nuxt UI locale for the active language, for `UApp`'s `locale` prop.
 *
 * Feeding `UApp` a locale gives Nuxt UI both the text direction and its own message
 * table, so built-in strings (close buttons, pagination, calendar, file upload) follow
 * the selected language instead of staying English.
 *
 * No extra reactive state is needed in localization.js: the i18next instance handed out
 * by `useTranslation()` is a Proxy that records reactive access on every property read
 * and is invalidated on `languageChanged`, so reading `language` here is enough.
 * @returns {import("vue").ComputedRef<object>} the locale for the active language
 */
export function useUiLocale() {
    const { i18next } = useTranslation();

    return computed(() => resolveUiLocale(i18next.language));
}
