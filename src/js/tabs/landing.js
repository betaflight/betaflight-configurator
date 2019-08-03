'use strict';

TABS.landing = {};
TABS.landing.initialize = function (callback) {
  var self = this;

  if (GUI.active_tab != 'landing') {
    GUI.active_tab = 'landing';
  }

  $('#content').load("./tabs/landing.html", function () {
    function showLang(newLang) {
      var bottomSection = $('.languageSwitcher');
      bottomSection.find('a').each(function(index) {
        var element = $(this);
        var languageSelected = element.attr('lang');
        if (newLang == languageSelected) {
          element.removeClass('selected_language');
          element.addClass('selected_language');
        } else {
          element.removeClass('selected_language');
        }
      });
    }
    var bottomSection = $('.languageSwitcher');
    bottomSection.html(' <span i18n="language_choice_message"></span>');
    bottomSection.append(' <a href="#" i18n="language_default_pretty" lang="DEFAULT"></a>');
    var languagesAvailables = i18n.getLanguagesAvailables();
    languagesAvailables.forEach(function(element) {
      bottomSection.append(' <a href="#" lang="' + element + '" i18n="language_' + element + '"></a>');
    });
    bottomSection.find('a').each(function(index) {
      var element = $(this);
      element.click(function(){
        var element = $(this);
        var languageSelected = element.attr('lang');
        if (!languageSelected) { return; }
        if (i18n.selectedLanguage != languageSelected) {
          i18n.changeLanguage(languageSelected);
          showLang(languageSelected);
        }
      });
    });
    showLang(i18n.selectedLanguage);
    // translate to user-selected language
    i18n.localizePage();

    GUI.content_ready(callback);
  });

};

TABS.landing.cleanup = function (callback) {
    if (callback) callback();
};
