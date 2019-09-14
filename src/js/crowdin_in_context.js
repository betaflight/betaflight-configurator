'use strict';

var _jipt = [];

_jipt.push(['project', 'betaflight-configurator']);
_jipt.push(['escape', function() {
    let languageSelected = 'DEFAULT';
    ConfigStorage.set({'userLanguageSelect': languageSelected});
    i18next.changeLanguage(getValidLocale(languageSelected));
    i18n.selectedLanguage = languageSelected;
    GUI.log(i18n.getMessage('language_changed'));
    // If anyone is following along, escape doesn't get rid of the crowdin login screen.
    window.location.href = "/main.html";
}]);
