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

        // load changelog content
        $('#changelog .log').load('./changelog.html');

        /** changelog trigger **/
        $("#changelog_toggle").on('click', function() {
            var state = $(this).data('state2');
            if (state) {
                $("#changelog").animate({right: -245}, 200, function () {
                    $("#content").removeClass('log_open');
                    });
                state = false;
            } else {
                $("#changelog").animate({right: 0}, 200);
                $("#content").addClass('log_open');
                state = true;
            }
            $(this).text(state ? i18n.getMessage('close') : i18n.getMessage('defaultChangelogAction'));
            $(this).data('state2', state);
        });

        // load privacy policy content
        $('#privacy_policy .policy').load('./tabs/privacy_policy.html');

        /** changelog trigger **/
        $("#privacy_policy_toggle").on('click', function() {
            var state = $(this).data('state2');
            if (state) {
                $("#privacy_policy").animate({right: -495}, 200, function () {
                    $("#content").removeClass('policy_open');
                    });
                state = false;
            } else {
                $("#privacy_policy").animate({right: 0}, 200);
                $("#content").addClass('policy_open');
                state = true;
            }
            $(this).text(state ? i18n.getMessage('close') : i18n.getMessage('defaultPrivacyPolicyAction'));
            $(this).data('state2', state);
        });

        GUI.content_ready(callback);
    });

};

TABS.landing.cleanup = function (callback) {
    if (callback) callback();
};
