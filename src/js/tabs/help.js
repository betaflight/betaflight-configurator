const help = {};
help.initialize = function (callback) {

    if (GUI.active_tab != 'help') {
        GUI.active_tab = 'help';
    }

    $('#content').load("./tabs/help.html", function () {
        i18n.localizePage();

        GUI.content_ready(callback);
    });
};

help.cleanup = function (callback) {
    if (callback) callback();
};

// TODO: move to modules when possible
window.TABS.help = help;
