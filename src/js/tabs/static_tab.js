import { i18n } from '../localization';
import GUI, { TABS } from '../gui';
import $ from 'jquery';

const staticTab = {};
staticTab.initialize = function (staticTabName, callback) {

    if (GUI.active_tab != staticTabName) {
        GUI.active_tab = staticTabName;
    }
    const tabFile = `./tabs/${staticTabName}.html`;

    $('#content').html('<div id="tab-static"><div id="tab-static-contents"></div>');
    $('#tab-static-contents').load(tabFile, function () {
        // translate to user-selected language
        i18n.localizePage();

        GUI.content_ready(callback);
    });

};
// Just noting that other tabs have cleanup functions.

// TODO: remove when modules are in place
TABS.staticTab = staticTab;
export { staticTab };
