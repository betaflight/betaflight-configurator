'use strict';

TABS.staticTab = {};
TABS.staticTab.initialize = function (staticTabName, callback) {
    var self = this;

    if (GUI.active_tab != staticTabName) {
        GUI.active_tab = staticTabName;
    }
    var tabFile = "./tabs/" + staticTabName + ".html";

    $('#content').html('<div id="tab-static"><div id="tab-static-contents"></div>');
    $('#tab-static-contents').load(tabFile, function () {
        // translate to user-selected language
        i18n.localizePage();

        GUI.content_ready(callback);
    });

};
// Just noting that other tabs have cleanup functions.
