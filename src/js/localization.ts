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

import i18next, { type FallbackLngObjList } from "i18next";
import HttpBackend from "i18next-http-backend";
// Named imports rather than a namespace import: `@nuxt/ui/locale` re-exports every locale
// it ships, and `import * as` would defeat tree shaking for the ones we never use.
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
    hr,
    it,
    ja,
    ka,
    ko,
    nl,
    pt,
    pt_br,
    pl,
    ru,
    uk,
    uz,
    zh_cn,
    zh_tw,
} from "@nuxt/ui/locale";
import type { Locale, Messages } from "@nuxt/ui/runtime/types/locale.js";
import { gui_log } from "./gui_log";
import { get as getConfig, set as setConfig } from "./ConfigStorage";

type UiLocale = Locale<Messages>;

/**
 * Substitutions for a message. Either an i18next interpolation object
 * (`{ value: 3 }` for `{{value}}`), or the legacy Chrome-style positional form, where an
 * array, or a single value, fills `{{1}}`, `{{2}}`, ... in order.
 */
export type MessageParameters = Record<string, unknown> | readonly unknown[] | string | number;

/** The DOM properties `localizePage()` fills from `i18n*` attributes. */
type LocalizedProperty = "innerHTML" | "title" | "value" | "placeholder";

export interface I18n {
    /** Active language code, or "DEFAULT" to follow the browser; set by init() and changeLanguage(). */
    selectedLanguage: string | undefined;
    /** @param cb called once i18next has finished loading, whether or not it succeeded */
    init(cb?: () => void): void;
    parseInputFile(data: string): Record<string, unknown>;
    changeLanguage(languageSelected: string): void;
    getMessage(messageID: string, parameters?: MessageParameters): string;
    getLanguagesAvailables(): string[];
    getCurrentLocale(): string;
    getSystemLocale(): string;
    existsMessage(key: string): boolean;
    isRtl(locale?: string): boolean;
    getUiLocale(language?: string): UiLocale;
    updatePageDirection(targetDocument?: Document): void;
    localizePage(forceReTranslate?: boolean): number;
    addResources(bundle: Record<string, string>): void;
}

// Nuxt UI does not currently ship some languages
// Create new locale for them extending the English locale as base
// For Serbian locales, use its closely related Croatian
const he: UiLocale = { ...en, name: "עברית", code: "he", dir: "rtl" };
const kk: UiLocale = { ...en, name: "Қазақша", code: "kk" };
const sr: UiLocale = { ...hr, name: "Srpski (latinica)", code: "sr" };
const sr_Cyrl: UiLocale = {
    ...hr,
    name: "Српски (ћирилица)",
    code: "sr-Cyrl",
};

/**
 * The single list of languages the configurator ships translations for, each entry being
 * the matching Nuxt UI locale. Keeping the Nuxt UI locale here rather than in a second
 * list means text direction, the language picker and Nuxt UI's own strings can never
 * drift apart. Array order drives the pickers in LandingTab and OptionsDialog.
 */
const supportedLocales: UiLocale[] = [
    ar,
    ca,
    da,
    de,
    en,
    es,
    eu,
    fr,
    gl,
    he,
    it,
    ja,
    ka,
    kk,
    ko,
    nl,
    pt,
    pt_br,
    pl,
    ru,
    sr,
    sr_Cyrl,
    uk,
    uz,
    zh_cn,
    zh_tw,
];

const languagesAvailables = supportedLocales.map((locale) => locale.code);

/**
 * Keyed on the lowercased code so lookups can be case-insensitive: browsers are not
 * consistent about the case of the region subtag, and preferences stored by older
 * versions predate the move to BCP 47.
 */
const localesByCode = new Map(
    supportedLocales.map((locale) => [locale.code.replaceAll("_", "-").toLowerCase(), locale]),
);

/**
 * Resolves any incoming language code onto a locale we ship translations for, be it a
 * BCP 47 tag from the browser, a legacy underscore code from a stored preference, or a
 * dialect we have no translation for. So "pt-BR", "pt_BR" and "pt-br" all land on the
 * same locale, and "de-AT" degrades to German rather than to nothing.
 * @param language a language code in any of those forms
 * @returns the matching locale, or undefined when the input is not a code we recognise
 */
function findLocale(language?: unknown): UiLocale | undefined {
    // Not just a falsiness check: a stored preference is whatever was serialised into
    // localStorage, and a non-string would throw below rather than fall back.
    if (typeof language !== "string" || language === "") {
        return undefined;
    }

    const normalized = language.replaceAll("_", "-").toLowerCase();

    return localesByCode.get(normalized) ?? localesByCode.get(normalized.split("-")[0]);
}

const languageFallback: FallbackLngObjList = {
    pt: ["pt-BR", "en"],
    "pt-BR": ["pt", "en"],
    default: ["en"],
};

const i18n: I18n = {
    selectedLanguage: undefined,

    /**
     * Functions that depend on the i18n framework
     */
    init(cb) {
        getStoredUserLocale(function (userLanguage) {
            i18next.use(HttpBackend).init(
                {
                    lng: userLanguage,
                    // BCP 47 codes let i18next strip the region on its own, which would have it
                    // request a `locales/zh/` that does not exist. `getValidLocale()` has already
                    // resolved the code to one we ship, so only that one needs loading; the
                    // pt/pt-BR pairing is handled by `fallbackLng` below.
                    load: "currentOnly",
                    debug: true,
                    ns: ["messages"],
                    defaultNS: ["messages"],
                    fallbackLng: languageFallback,
                    backend: {
                        loadPath: "./locales/{{lng}}/{{ns}}.json",
                        parse: i18n.parseInputFile,
                    },
                },
                function (err) {
                    if (err !== undefined) {
                        console.error(`Error loading i18n: ${err}`);
                    } else {
                        console.log("i18n system loaded");
                        const detectedLanguage = i18n.getMessage(`language_${getValidLocale("DEFAULT")}`);
                        i18n.addResources({ detectedLanguage: detectedLanguage });
                        i18n.updatePageDirection();
                        i18next.on("languageChanged", function () {
                            i18n.localizePage(true);
                            i18n.updatePageDirection();
                        });
                    }
                    if (cb !== undefined) {
                        cb();
                    }
                },
            );
        });
    },

    /**
     * We have different interpolate methods in the input messages file,
     * we unify all of them here to the i18next style and simplify it
     */
    parseInputFile(data) {
        // Remove the $n interpolate of Chrome $1, $2, ... -> {{1}}, {{2}}, ...
        const REGEXP_CHROME = /\$([1-9])/g;
        const dataChrome = data.replaceAll(REGEXP_CHROME, "{{$1}}");

        // Remove the .message of the nesting $t(xxxxx.message) -> $t(xxxxx)
        const REGEXP_NESTING = /\$t\(([^)]*).message\)/g;
        const dataNesting = dataChrome.replaceAll(REGEXP_NESTING, "$t($1)");

        // Move the .message of the json object to root xxxxx.message -> xxxxx
        const jsonData: Record<string, unknown> = JSON.parse(dataNesting);
        for (const [key, value] of Object.entries(jsonData)) {
            jsonData[key] = (value as { message: unknown }).message;
        }

        return jsonData;
    },

    changeLanguage(languageSelected) {
        setConfig({ userLanguageSelect: languageSelected });
        i18next.changeLanguage(getValidLocale(languageSelected));
        i18n.selectedLanguage = languageSelected;
        gui_log(i18n.getMessage("language_changed"));
    },

    getMessage(messageID, parameters) {
        let parametersObject: Record<string, unknown> | undefined;

        // Option 1, no parameters or Object as parameters (i18Next type parameters)
        if (parameters === undefined || (parameters.constructor !== Array && parameters instanceof Object)) {
            parametersObject = parameters as Record<string, unknown> | undefined;

            // Option 2: parameters as $1, $2, etc.
            // (deprecated, from the old Chrome i18n
        } else {
            // Convert the input to an array
            const parametersArray = (parameters.constructor === Array ? parameters : [parameters]) as unknown[];

            const positional: Record<string, unknown> = {};
            parametersArray.forEach(function (parameter, index) {
                positional[index + 1] = parameter;
            });
            parametersObject = positional;
        }

        // i18next types t() as a union that also covers `returnObjects`, which is never used
        // here, so every message is a string.
        return i18next.t(messageID, parametersObject) as string;
    },

    getLanguagesAvailables() {
        return languagesAvailables;
    },

    getCurrentLocale() {
        return i18next.language;
    },

    getSystemLocale() {
        return getValidLocale("DEFAULT");
    },

    existsMessage(key) {
        return i18next.exists(key);
    },

    isRtl(locale) {
        return i18next.dir(locale) === "rtl";
    },

    /**
     * Resolves a language code onto the Nuxt UI locale that `UApp` needs. An unknown code
     * degrades to LTR English rather than leaving Nuxt UI with no locale at all.
     * @param language language code, e.g. "ar" or "zh-CN"; defaults to the active one
     */
    getUiLocale(language = i18n.getCurrentLocale()) {
        return findLocale(language) ?? en;
    },

    updatePageDirection(targetDocument = document) {
        const html = targetDocument.documentElement;
        html.setAttribute("dir", i18n.isRtl() ? "rtl" : "ltr");
        html.setAttribute("lang", i18n.getCurrentLocale());
    },

    /**
     * Helper functions, don't depend of the i18n framework
     */
    localizePage(forceReTranslate) {
        let localized = 0;

        const translate = function (messageID: string) {
            localized++;
            return i18n.getMessage(messageID);
        };

        const attrs: { attr: string; prop: LocalizedProperty }[] = [
            { attr: "i18n", prop: "innerHTML" },
            { attr: "i18n_title", prop: "title" },
            { attr: "i18n_value", prop: "value" },
            { attr: "i18n_placeholder", prop: "placeholder" },
        ];

        for (const { attr, prop } of attrs) {
            const suffix = forceReTranslate ? "" : `:not(.${attr}-replaced)`;
            for (const el of document.querySelectorAll(`[${attr}]${suffix}`)) {
                // The selector only matches elements that carry the attribute, so it is never null.
                (el as unknown as Record<LocalizedProperty, string>)[prop] = translate(el.getAttribute(attr) ?? "");
                if (!forceReTranslate) {
                    el.classList.add(`${attr}-replaced`);
                }
            }
        }

        return localized;
    },

    addResources(bundle) {
        // Both options are set in init() as one-element arrays. The old
        // `hasOwnProperty("length")` guard is gone: it is true for every string and array,
        // the only types i18next allows here. A bare string still yields its first
        // character, as it always did.
        const takeFirst = (value: string | readonly string[]): string =>
            0 < value.length ? value[0] : (value as string);
        const lang = takeFirst((i18next.options.fallbackLng as FallbackLngObjList)["default"]);
        const ns = takeFirst(i18next.options.defaultNS as string | readonly string[]);
        i18next.addResourceBundle(lang, ns, bundle, true, true);
    },
};

/*
 * Reads the chrome config, if DEFAULT or there is no config stored,
 * returns the current locale to the callback
 */
function getStoredUserLocale(cb: (locale: string) => void): void {
    let userLanguage = "DEFAULT";
    const result = getConfig("userLanguageSelect");
    if (result.userLanguageSelect) {
        // A preference stored before the move to BCP 47 reads "zh_CN" where the pickers now
        // offer "zh-CN", so rewrite it rather than leave the picker with no selection. An
        // unrecognised value, "DEFAULT" included, means follow the browser.
        userLanguage = findLocale(result.userLanguageSelect)?.code ?? "DEFAULT";
    }
    i18n.selectedLanguage = userLanguage;
    cb(getValidLocale(userLanguage));
}

/**
 * @param userLocale a language code we ship, or "DEFAULT" to follow the browser
 * @returns the language code to translate into
 */
function getValidLocale(userLocale: string): string {
    if (userLocale !== "DEFAULT") {
        return userLocale;
    }

    // `userLanguage` is the legacy (IE) name; it is not in the DOM lib types.
    const navigator = window.navigator as Navigator & { userLanguage?: string };
    const detectedLocale = navigator.userLanguage || navigator.language;
    console.log(`Detected locale ${detectedLocale}`);

    return findLocale(detectedLocale)?.code ?? "en";
}

export { i18n };
