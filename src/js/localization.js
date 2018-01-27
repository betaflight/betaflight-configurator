'use strict';

/*
 * Wrapper around the i18n system
 */

var i18n = {}

/**
 * Functions that depend on the i18n framework
 */
i18n.init = function(cb) {

    var defaultLocale = window.navigator.userLanguage || window.navigator.language;

    i18next
        .use(i18nextXHRBackend)
        .init({
            lng: defaultLocale,
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
}

i18n.getMessage = function(messageID, parameters) {
    var translatedString =  i18next.t(messageID + '.message');

    if (parameters !== undefined) {
        parameters.forEach(function(element, index) {
            translatedString = translatedString.replace('$' + (index + 1), element);
        });
    }
    
    return translatedString;

    
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
