import { computed, type ComputedRef } from "vue";
import { useTranslation } from "i18next-vue";
import type { Locale, Messages } from "@nuxt/ui/runtime/types/locale";
import { i18n } from "@/js/localization.js";

/**
 * Reactive Nuxt UI locale for the active language, for `UApp`'s `locale` prop.
 *
 * Feeding `UApp` a locale gives Nuxt UI both the text direction and its own message
 * table, so built-in strings (close buttons, pagination, calendar, file upload) follow
 * the selected language instead of staying English.
 *
 * The locale list itself lives in `localization.js` alongside `languagesAvailables`, so
 * there is one list to maintain. No extra reactive state is needed there either: the
 * i18next instance handed out by `useTranslation()` is a Proxy that records reactive
 * access on every property read and is invalidated on `languageChanged`, so reading
 * `language` inside this computed is enough to track language switches.
 */
export function useUiLocale(): ComputedRef<Locale<Messages>> {
    const { i18next } = useTranslation();

    return computed(() => i18n.getUiLocale(i18next.language));
}
