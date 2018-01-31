'use strict';

/*
 * Wrapper around the i18n system
 */

var i18n = {}

const languagesAvailables = ['ca', 'de', 'en', 'es', 'fr', 'ko', 'zh_CN'];

/**
 * Functions that depend on the i18n framework
 */
i18n.init = function(cb) {

    getStoredUserLocale(function(userLanguage){

        i18next
            .use(i18nextXHRBackend)
            .init({
                lng: userLanguage,
                getAsync: false,
                debug: true,
                ns: ['messages'],
                defaultNS:['messages'],
                fallbackLng: 'en',
                backend: { loadPath: '/_locales/{{lng}}/{{ns}}.json' }
                }, function(err, t) {
                    if (err !== undefined) {
                        console.error('Error loading i18n ' + err);
                    } else {
                        console.log('i18n system loaded');
                    }
                    if (cb !== undefined) {
                        cb();
                    }
            });
    });
}

i18n.getMessage = function(messageID, parameters) {
    var translatedString =  i18next.t(messageID + '.message');

    if (parameters !== undefined) {
        if (parameters.constructor !== Array) {
            parameters = [parameters];
        }
        parameters.forEach(function(element, index) {
            translatedString = translatedString.replace('$' + (index + 1), element);
        });
    }

    return translatedString;
}

i18n.getLanguagesAvailables = function() {
    return languagesAvailables;
}

/**
 * Helper functions, don't depend of the i18n framework
 */

i18n.localizePage = function() {

    var localized = 0;

    var translate = function(messageID) {
        localized++;

        return i18n.getMessage(messageID);
    };

    $('[i18n]:not(.i18n-replaced)').each(function() {
        var element = $(this);

        element.html(translate(element.attr('i18n')));
        element.addClass('i18n-replaced');
    });

    $('[i18n_title]:not(.i18n_title-replaced)').each(function() {
        var element = $(this);

        element.attr('title', translate(element.attr('i18n_title')));
        element.addClass('i18n_title-replaced');
    });

    $('[i18n_value]:not(.i18n_value-replaced)').each(function() {
        var element = $(this);

        element.val(translate(element.attr('i18n_value')));
        element.addClass('i18n_value-replaced');
    });

    $('[i18n_placeholder]:not(.i18n_placeholder-replaced)').each(function() {
        var element = $(this);

        element.attr('placeholder', translate(element.attr('i18n_placeholder')));
        element.addClass('i18n_placeholder-replaced');
    });

    return localized;
}

/*
 * Reads the chrome config, if DEFAULT or there is no config stored,
 * returns the current locale to the callback
 */
function getStoredUserLocale(cb) {
    chrome.storage.local.get('userLanguageSelect', function (result) {
        var userLanguage = 'DEFAULT';
        if (result.userLanguageSelect) {
            userLanguage = result.userLanguageSelect
        } 

        userLanguage = getValidLocale(userLanguage);

        cb(userLanguage);
    })
}

function getValidLocale(userLocale) {

    if (userLocale == 'DEFAULT') {
        userLocale = window.navigator.userLanguage || window.navigator.language;
    } 
    return userLocale;
}
