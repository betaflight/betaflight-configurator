'use strict';

TABS.options = {};
TABS.options.initialize = function (callback) {
    if (GUI.active_tab !== 'options') {
        GUI.active_tab = 'options';
    }

    $('#content').load("./tabs/options.html", function () {
        i18n.localizePage();

        TABS.options.initPermanentExpertMode();
        TABS.options.initRememberLastTab();
        TABS.options.initCheckForConfiguratorUnstableVersions();
        TABS.options.initAnalyticsOptOut();
        TABS.options.initCliAutoComplete();
        TABS.options.initCordovaForceComputerUI();
        TABS.options.initDarkTheme();

        GUI.content_ready(callback);
    });
};

TABS.options.cleanup = function (callback) {
    if (callback) {
        callback();
    }
};

TABS.options.initPermanentExpertMode = function () {
    ConfigStorage.get('permanentExpertMode', function (result) {
        if (result.permanentExpertMode) {
            $('div.permanentExpertMode input').prop('checked', true);
        }

        $('div.permanentExpertMode input').change(function () {
            const checked = $(this).is(':checked');

            ConfigStorage.set({'permanentExpertMode': checked});

            $('input[name="expertModeCheckbox"]').prop('checked', checked).change();
        }).change();
    });
};

TABS.options.initRememberLastTab = function () {
    ConfigStorage.get('rememberLastTab', function (result) {
        $('div.rememberLastTab input')
            .prop('checked', !!result.rememberLastTab)
            .change(function() { ConfigStorage.set({rememberLastTab: $(this).is(':checked')}); })
            .change();
    });
};

TABS.options.initCheckForConfiguratorUnstableVersions = function () {
    if (GUI.operating_system !== 'ChromeOS') {
        ConfigStorage.get('checkForConfiguratorUnstableVersions', function (result) {
            if (result.checkForConfiguratorUnstableVersions) {
                $('div.checkForConfiguratorUnstableVersions input').prop('checked', true);
            }

            $('div.checkForConfiguratorUnstableVersions input').change(function () {
                const checked = $(this).is(':checked');

                ConfigStorage.set({'checkForConfiguratorUnstableVersions': checked});

                checkForConfiguratorUpdates();
            });
        });
    } else {
        $('div.checkForConfiguratorUnstableVersions').hide();
    }
};

TABS.options.initAnalyticsOptOut = function () {
    ConfigStorage.get('analyticsOptOut', function (result) {
        if (result.analyticsOptOut) {
            $('div.analyticsOptOut input').prop('checked', true);
        }

        $('div.analyticsOptOut input').change(function () {
            const checked = $(this).is(':checked');

            ConfigStorage.set({'analyticsOptOut': checked});

            checkSetupAnalytics(function (analyticsService) {
                if (checked) {
                    analyticsService.sendEvent(analyticsService.EVENT_CATEGORIES.APPLICATION, 'OptOut');
                }

                analyticsService.setOptOut(checked);

                if (!checked) {
                    analyticsService.sendEvent(analyticsService.EVENT_CATEGORIES.APPLICATION, 'OptIn');
                }
            });
        }).change();
    });
};

TABS.options.initCliAutoComplete = function () {
    $('div.cliAutoComplete input')
        .prop('checked', CliAutoComplete.configEnabled)
        .change(function () {
            const checked = $(this).is(':checked');

            ConfigStorage.set({'cliAutoComplete': checked});
            CliAutoComplete.setEnabled(checked);
        }).change();
};

TABS.options.initCordovaForceComputerUI = function () {
    if (GUI.isCordova() && cordovaUI.canChangeUI) {
        ConfigStorage.get('cordovaForceComputerUI', function (result) {
            if (result.cordovaForceComputerUI) {
                $('div.cordovaForceComputerUI input').prop('checked', true);
            }

            $('div.cordovaForceComputerUI input').change(function () {
                const checked = $(this).is(':checked');

                ConfigStorage.set({'cordovaForceComputerUI': checked});

                if (typeof cordovaUI.set === 'function') {
                    cordovaUI.set();
                }
            });
        });
    } else {
        $('div.cordovaForceComputerUI').hide();
    }
};

TABS.options.initDarkTheme = function () {
    $('#darkThemeSelect')
        .val(DarkTheme.configEnabled)
        .change(function () {
            const value = parseInt($(this).val());

            ConfigStorage.set({'darkTheme': value});
            setDarkTheme(value);
        }).change();
};
