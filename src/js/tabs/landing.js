import GUI, { TABS } from '../gui';
import { i18n } from '../localization';
import Sponsor from '../Sponsor';
import $ from 'jquery';

const landing = {
    sponsor: new Sponsor(),
};

landing.initialize = function (callback) {
    const self = this;

    if (GUI.active_tab != 'landing') {
        GUI.active_tab = 'landing';
    }

    $('#content').load("./tabs/landing.html", () => {
        function showLang(newLang) {
            bottomSection = $('.languageSwitcher');
            bottomSection.find('a').each(function(index) {
                const element = $(this);
                const languageSelected = element.attr('lang');
                if (newLang == languageSelected) {
                    element.removeClass('selected_language');
                    element.addClass('selected_language');
                } else {
                    element.removeClass('selected_language');
                }
            });
        }

        let bottomSection = $('.languageSwitcher');
        bottomSection.html(' <span i18n="language_choice_message"></span>');
        bottomSection.append(' <a href="#" i18n="language_default_pretty" lang="DEFAULT"></a>');
        const languagesAvailables = i18n.getLanguagesAvailables();

        languagesAvailables.forEach((element) => {
            bottomSection.append(` <a href="#" lang="${element}" i18n="language_${element}"></a>`);
        });

        bottomSection.find('a').each((index) => {
            let element = $(this);
            element.click(() => {
                element = $(this);
                const languageSelected = element.attr('lang');
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

        self.sponsor.loadSponsorTile('landing', $('div.tab_sponsor'));

        GUI.content_ready(callback);
    });
};

landing.cleanup = function (callback) {
    if (callback) {
        callback();
    }
};

// TODO: remove after all is using modules
TABS.landing = landing;
export {
    landing,
};
