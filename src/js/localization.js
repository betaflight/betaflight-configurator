import i18next from 'i18next';
import i18nextXHRBackend from 'i18next-xhr-backend';
import { gui_log } from './gui_log.js';
import { get as getConfig, set as setConfig } from './ConfigStorage.js';
import $ from "jquery";

const i18n = {};
/*
 * Wrapper around the i18n system
 */
window.i18n = i18n;


const languagesAvailables = ['ca', 'da', 'de', 'en', 'es', 'eu', 'fr', 'gl', 'it',
                             'ja', 'ko', 'nl', 'pt', 'pt_BR', 'pl', 'ru', 'uk', 'zh_CN', 'zh_TW'];

const languageFallback = {
                            'pt': ['pt_BR', 'en'],
                            'pt_BR': ['pt', 'en'],
                            'default': ['en'],
};

// must be aligned with languagesAvailables
const languageISOcode = ['ca-ES', 'da-DK', 'de-DE', 'en-US', 'es-ES', 'eu-ES', 'fr-FR', 'gl-ES', 'it-IT',
                         'ja-JP', 'ko-KR', 'nl-NL', 'pt-PT', 'pt-BR', 'pl-PL', 'ru-RU', 'uk-UA', 'zh-CN', 'zh-TW'];

/**
 * Functions that return ISO Language Code Table from http://www.lingoes.net/en/translator/langcode.htm
 * Map between languagesAvailables and languageISOcode
 * Fallback to en-US
 */
function getCurrentLocaleISO() {
    const isoCodeIndex = languagesAvailables.indexOf(i18next.language);
    if (isoCodeIndex === -1) {
        return 'en-US';
    }
    return languageISOcode[isoCodeIndex];
}

/**
 * Functions that depend on the i18n framework
 */
i18n.init = function(cb) {
    getStoredUserLocale(function(userLanguage) {

        i18next
            .use(i18nextXHRBackend)
            .init({
                lng: userLanguage,
                getAsync: false,
                debug: true,
                ns: ['messages'],
                defaultNS:['messages'],
                fallbackLng: languageFallback,
                backend: {
                    loadPath: './locales/{{lng}}/{{ns}}.json',
                    parse: i18n.parseInputFile,
                },
            },
            function(err) {
                if (err !== undefined) {
                    console.error(`Error loading i18n: ${err}`);
                } else {
                    console.log('i18n system loaded');
                    const detectedLanguage = i18n.getMessage(`language_${getValidLocale("DEFAULT")}`);
                    i18n.addResources({"detectedLanguage": detectedLanguage });
                    i18next.on('languageChanged', function () {
                        i18n.localizePage(true);
                    });
                }
                if (cb !== undefined) {
                    cb();
                }
            });
    });

};

/**
 * We have different interpolate methods in the input messages file,
 * we unify all of them here to the i18next style and simplify it
 */
i18n.parseInputFile = function(data) {

    // Remove the $n interpolate of Chrome $1, $2, ... -> {{1}}, {{2}}, ...
    const REGEXP_CHROME = /\$([1-9])/g;
    const dataChrome = data.replace(REGEXP_CHROME, '{{$1}}');

    // Remove the .message of the nesting $t(xxxxx.message) -> $t(xxxxx)
    const REGEXP_NESTING = /\$t\(([^\)]*).message\)/g;
    const dataNesting = dataChrome.replace(REGEXP_NESTING, '$t($1)');

    // Move the .message of the json object to root xxxxx.message -> xxxxx
    const jsonData = JSON.parse(dataNesting);
    Object.entries(jsonData).forEach(([key, value]) => {
        jsonData[key] = value.message;
    });

    return jsonData;
};

i18n.changeLanguage = function(languageSelected) {
    setConfig({'userLanguageSelect': languageSelected});
    i18next.changeLanguage(getValidLocale(languageSelected));
    i18n.selectedLanguage = languageSelected;
    gui_log(i18n.getMessage('language_changed'));
};

i18n.getMessage = function(messageID, parameters) {

    let parametersObject;

    // Option 1, no parameters or Object as parameters (i18Next type parameters)
    if ((parameters === undefined) || ((parameters.constructor !== Array) && (parameters instanceof Object))) {
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
        parametersArray.forEach(function(parameter, index) {
            parametersObject[index + 1] = parameter;
        });
    }

    return i18next.t(messageID, parametersObject);
};

i18n.getLanguagesAvailables = function() {
    return languagesAvailables;
};

i18n.getCurrentLocale = function() {
    return i18next.language;
};

i18n.existsMessage = function(key) {
    return i18next.exists(key);
};

/**
 * Helper functions, don't depend of the i18n framework
 */

i18n.localizePage = function(forceReTranslate) {

    let localized = 0;

    const translate = function(messageID) {
        localized++;
        return i18n.getMessage(messageID);
    };

    if (forceReTranslate) {
        $('[i18n]').each(function() {
            const element = $(this);
            element.html(translate(element.attr('i18n')));
        });
        $('[i18n_title]').each(function() {
            const element = $(this);
            element.attr('title', translate(element.attr('i18n_title')));
        });
        $('[i18n_value]').each(function() {
            const element = $(this);
            element.val(translate(element.attr('i18n_value')));
        });
        $('[i18n_placeholder]').each(function() {
            const element = $(this);
            element.attr('placeholder', translate(element.attr('i18n_placeholder')));
        });
    } else {

        $('[i18n]:not(.i18n-replaced)').each(function() {
            const element = $(this);
            element.html(translate(element.attr('i18n')));
            element.addClass('i18n-replaced');
        });

        $('[i18n_title]:not(.i18n_title-replaced)').each(function() {
            const element = $(this);
            element.attr('title', translate(element.attr('i18n_title')));
            element.addClass('i18n_title-replaced');
        });

        $('[i18n_value]:not(.i18n_value-replaced)').each(function() {
            const element = $(this);
            element.val(translate(element.attr('i18n_value')));
            element.addClass('i18n_value-replaced');
        });

        $('[i18n_placeholder]:not(.i18n_placeholder-replaced)').each(function() {
            const element = $(this);
            element.attr('placeholder', translate(element.attr('i18n_placeholder')));
            element.addClass('i18n_placeholder-replaced');
        });
    }
    return localized;
};

/*
 * Reads the chrome config, if DEFAULT or there is no config stored,
 * returns the current locale to the callback
 */
function getStoredUserLocale(cb) {
    let userLanguage = 'DEFAULT';
    const result = getConfig('userLanguageSelect');
    if (result.userLanguageSelect) {
        userLanguage = result.userLanguageSelect;
    }
    i18n.selectedLanguage = userLanguage;
    userLanguage = getValidLocale(userLanguage);
    cb(userLanguage);
}

function getValidLocale(userLocale) {

    let validUserLocale = userLocale;
    if (validUserLocale === 'DEFAULT') {
        validUserLocale = window.navigator.userLanguage || window.navigator.language;
        console.log(`Detected locale ${validUserLocale}`);

        // The i18next can fallback automatically to the dialect, but needs to be used with hyphen and
        // we use underscore because the eventPage.js uses Chrome localization that needs underscore.
        // If at some moment we get rid of the Chrome localization we can remove all of this
        validUserLocale = validUserLocale.replace('-','_');
        // Locale not found
        if (languagesAvailables.indexOf(validUserLocale) === -1) {
            // Is a composite locale?
            const underscorePosition = validUserLocale.indexOf('_');
            if (underscorePosition !== -1) {
                validUserLocale = validUserLocale.substring(0, underscorePosition);
                // Locale dialect fallback not found
                if (languagesAvailables.indexOf(validUserLocale) === -1) {
                    validUserLocale = 'en'; // Fallback language
                }
            } else {
                validUserLocale = 'en';
            }
        }
    }

    return validUserLocale;
}

i18n.addResources = function(bundle) {
    const takeFirst = obj => obj.hasOwnProperty("length") && 0 < obj.length ? obj[0] : obj;
    const lang = takeFirst(i18next.options.fallbackLng['default']);
    const ns = takeFirst(i18next.options.defaultNS);
    i18next.addResourceBundle(lang, ns, bundle, true, true);
};

export { i18n, getCurrentLocaleISO };
