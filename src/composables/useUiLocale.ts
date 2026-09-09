/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { computed, type ComputedRef } from "vue";
import { useTranslation } from "i18next-vue";
import type { Locale, Messages } from "@nuxt/ui/runtime/types/locale.js";
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
