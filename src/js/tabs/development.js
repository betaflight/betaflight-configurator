import GUI, { TABS } from '../gui';
import { i18n } from '../localization';
import $ from 'jquery';

const development = {};
development.initialize = function (callback) {

    if (GUI.active_tab != 'development') {
        GUI.active_tab = 'development';
    }

    $('#content').load("./tabs/development.html", function () {
        i18n.localizePage();

        GUI.content_ready(callback);
    });
};

development.cleanup = function (callback) {
    if (callback) callback();
};

TABS.development = development;

export { development };
