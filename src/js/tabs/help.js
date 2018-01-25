'use strict';

TABS.help = {};
TABS.help.initialize = function (callback) {
    var self = this;

    if (GUI.active_tab != 'help') {
        GUI.active_tab = 'help';
    }

    $('#content').load("./tabs/help.html", function () {
        i18n.localizePage();

        GUI.content_ready(callback);
    });
};

TABS.help.cleanup = function (callback) {
    if (callback) callback();
};
