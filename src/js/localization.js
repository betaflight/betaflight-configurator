import i18next from "i18next";
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
import { gui_log } from "./gui_log.js";
import { get as getConfig, set as setConfig } from "./ConfigStorage.js";

const i18n = {};

/**
 * The single list of languages the configurator ships translations for, each entry being
 * the matching Nuxt UI locale. Keeping the Nuxt UI locale here rather than in a second
 * list means text direction, the language picker and Nuxt UI's own strings can never
 * drift apart. Array order drives the pickers in LandingTab and OptionsDialog.
 * @type {Array<{ name: string, code: string, dir: "ltr" | "rtl", messages: object }>}
 */
const supportedLocales = [
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
    pt,
    pt_br,
    pl,
    ru,
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
const localesByCode = new Map(supportedLocales.map((locale) => [locale.code.toLowerCase(), locale]));

/**
 * Resolves any incoming language code onto a locale we ship translations for, be it a
 * BCP 47 tag from the browser, a legacy underscore code from a stored preference, or a
 * dialect we have no translation for. So "pt-BR", "pt_BR" and "pt-br" all land on the
 * same locale, and "de-AT" degrades to German rather than to nothing.
 * @param {string} [language] a language code in any of those forms
 * @returns {{ name: string, code: string, dir: "ltr" | "rtl", messages: object } | undefined} the
 *     matching locale, or undefined when neither the code nor its base language matches
 */
function findLocale(language) {
    if (!language) {
        return undefined;
    }

    const normalized = language.replaceAll("_", "-").toLowerCase();

    return localesByCode.get(normalized) ?? localesByCode.get(normalized.split("-")[0]);
}

const languageFallback = {
    pt: ["pt-BR", "en"],
    "pt-BR": ["pt", "en"],
    default: ["en"],
};

/**
 * Functions that depend on the i18n framework
 */
i18n.init = function (cb) {
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
};

/**
 * We have different interpolate methods in the input messages file,
 * we unify all of them here to the i18next style and simplify it
 */
i18n.parseInputFile = function (data) {
    // Remove the $n interpolate of Chrome $1, $2, ... -> {{1}}, {{2}}, ...
    const REGEXP_CHROME = /\$([1-9])/g;
    const dataChrome = data.replace(REGEXP_CHROME, "{{$1}}");

    // Remove the .message of the nesting $t(xxxxx.message) -> $t(xxxxx)
    const REGEXP_NESTING = /\$t\(([^\)]*).message\)/g;
    const dataNesting = dataChrome.replace(REGEXP_NESTING, "$t($1)");

    // Move the .message of the json object to root xxxxx.message -> xxxxx
    const jsonData = JSON.parse(dataNesting);
    Object.entries(jsonData).forEach(([key, value]) => {
        jsonData[key] = value.message;
    });

    return jsonData;
};

i18n.changeLanguage = function (languageSelected) {
    setConfig({ userLanguageSelect: languageSelected });
    i18next.changeLanguage(getValidLocale(languageSelected));
    i18n.selectedLanguage = languageSelected;
    gui_log(i18n.getMessage("language_changed"));
};

i18n.getMessage = function (messageID, parameters) {
    let parametersObject;

    // Option 1, no parameters or Object as parameters (i18Next type parameters)
    if (parameters === undefined || (parameters.constructor !== Array && parameters instanceof Object)) {
        parametersObject = parameters;

        // Option 2: parameters as $1, $2, etc.
        // (deprecated, from the old Chrome i18n
    } else {
        // Convert the input to an array
        let parametersArray = parameters;
        if (parametersArray.constructor !== Array) {
            parametersArray = [parameters];
        }

        parametersObject = {};
        parametersArray.forEach(function (parameter, index) {
            parametersObject[index + 1] = parameter;
        });
    }

    return i18next.t(messageID, parametersObject);
};

i18n.getLanguagesAvailables = function () {
    return languagesAvailables;
};

i18n.getCurrentLocale = function () {
    return i18next.language;
};

i18n.existsMessage = function (key) {
    return i18next.exists(key);
};

i18n.isRtl = function (locale) {
    return i18next.dir(locale) === "rtl";
};

/**
 * Resolves a language code onto the Nuxt UI locale that `UApp` needs. An unknown code
 * degrades to LTR English rather than leaving Nuxt UI with no locale at all.
 * @param {string} [language] language code, e.g. "ar" or "zh-CN"; defaults to the active one
 * @returns {{ name: string, code: string, dir: "ltr" | "rtl", messages: object }} a Nuxt UI locale
 */
i18n.getUiLocale = function (language = i18n.getCurrentLocale()) {
    return findLocale(language) ?? en;
};

i18n.updatePageDirection = function (targetDocument = document) {
    const html = targetDocument.documentElement;
    html.setAttribute("dir", i18n.isRtl() ? "rtl" : "ltr");
    html.setAttribute("lang", i18n.getCurrentLocale());
};

/**
 * Helper functions, don't depend of the i18n framework
 */

i18n.localizePage = function (forceReTranslate) {
    let localized = 0;

    const translate = function (messageID) {
        localized++;
        return i18n.getMessage(messageID);
    };

    const attrs = [
        { attr: "i18n", prop: "innerHTML" },
        { attr: "i18n_title", prop: "title" },
        { attr: "i18n_value", prop: "value" },
        { attr: "i18n_placeholder", prop: "placeholder" },
    ];

    for (const { attr, prop } of attrs) {
        const suffix = forceReTranslate ? "" : `:not(.${attr}-replaced)`;
        for (const el of document.querySelectorAll(`[${attr}]${suffix}`)) {
            el[prop] = translate(el.getAttribute(attr));
            if (!forceReTranslate) {
                el.classList.add(`${attr}-replaced`);
            }
        }
    }

    return localized;
};

/*
 * Reads the chrome config, if DEFAULT or there is no config stored,
 * returns the current locale to the callback
 */
function getStoredUserLocale(cb) {
    let userLanguage = "DEFAULT";
    const result = getConfig("userLanguageSelect");
    if (result.userLanguageSelect) {
        // A preference stored before the move to BCP 47 reads "zh_CN" where the pickers now
        // offer "zh-CN", so rewrite it rather than leave the picker with no selection. An
        // unknown code, "DEFAULT" included, means follow the browser.
        userLanguage = findLocale(result.userLanguageSelect)?.code ?? "DEFAULT";
    }
    i18n.selectedLanguage = userLanguage;
    cb(getValidLocale(userLanguage));
}

/**
 * @param {string} userLocale a language code we ship, or "DEFAULT" to follow the browser
 * @returns {string} the language code to translate into
 */
function getValidLocale(userLocale) {
    if (userLocale !== "DEFAULT") {
        return userLocale;
    }

    const detectedLocale = window.navigator.userLanguage || window.navigator.language;
    console.log(`Detected locale ${detectedLocale}`);

    return findLocale(detectedLocale)?.code ?? "en";
}

i18n.addResources = function (bundle) {
    const takeFirst = (obj) => (obj.hasOwnProperty("length") && 0 < obj.length ? obj[0] : obj);
    const lang = takeFirst(i18next.options.fallbackLng["default"]);
    const ns = takeFirst(i18next.options.defaultNS);
    i18next.addResourceBundle(lang, ns, bundle, true, true);
};

export { i18n };
