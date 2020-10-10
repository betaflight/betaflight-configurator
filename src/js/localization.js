'use strict';

/*
 * Wrapper around the i18n system
 */

window.i18n = {};

const languagesAvailables = ['ca', 'de', 'en', 'es', 'eu', 'fr', 'gl', 'hr', 'hu', 'id', 'it', 'ja', 'ko', 'lv', 'nl', 'pt', 'pt_BR', 'pl', 'ru', 'sv', 'zh_CN', 'zh_TW'];

const languageFallback = {
                            'pt': ['pt_BR', 'en'],
                            'pt_BR': ['pt', 'en'],
                            'default': ['en'],
};

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
                backend: { loadPath: '/_locales/{{lng}}/{{ns}}.json' },
                }, function(err) {
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

i18n.changeLanguage = function(languageSelected) {
    if (typeof ConfigStorage !== 'undefined') {
        ConfigStorage.set({'userLanguageSelect': languageSelected});
    }
    i18next.changeLanguage(getValidLocale(languageSelected));
    i18n.selectedLanguage = languageSelected;
    GUI.log(i18n.getMessage('language_changed'));
};

i18n.getMessage = function(messageID, parameters) {

    let translatedString;

    // Option 1, no parameters or Object as parameters (i18Next type parameters)
    if ((parameters === undefined) || ((parameters.constructor !== Array) && (parameters instanceof Object))) {
        translatedString =  i18next.t(`${messageID}.message`, parameters);

    // Option 2: parameters as $1, $2, etc.
    // (deprecated, from the old Chrome i18n
    } else {

        translatedString =  i18next.t(`${messageID}.message`);

        let parametersArray = parameters;
        if (parametersArray.constructor !== Array) {
            parametersArray = [parameters];
        }
        parametersArray.forEach(function(element, index) {
            translatedString = translatedString.replace(`$${(index + 1)}`, element);
        });
    }

    return translatedString;
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
    if (typeof ConfigStorage !== 'undefined') {
        ConfigStorage.get('userLanguageSelect', function (result) {
            let userLanguage = 'DEFAULT';
            if (result.userLanguageSelect) {
                userLanguage = result.userLanguageSelect;
            }
            i18n.selectedLanguage = userLanguage;

            userLanguage = getValidLocale(userLanguage);

            cb(userLanguage);
        });
    } else {
        const userLanguage = getValidLocale('DEFAULT');
        cb(userLanguage);
    }
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
