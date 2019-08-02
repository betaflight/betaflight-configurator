'use strict';

TABS.landing = {};
TABS.landing.initialize = function (callback) {
    var self = this;

    if (GUI.active_tab != 'landing') {
        GUI.active_tab = 'landing';
    }

    $('#content').load("./tabs/landing.html", function () {
        // translate to user-selected language
        i18n.localizePage();

        GUI.content_ready(callback);
    });

};

TABS.landing.cleanup = function (callback) {
    if (callback) callback();
};
