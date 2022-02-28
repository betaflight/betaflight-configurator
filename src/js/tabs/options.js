import { i18n } from '../localization';

const options = {};
options.initialize = function (callback) {
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
        TABS.options.initShowAllSerialDevices();
        TABS.options.initShowVirtualMode();
        TABS.options.initCordovaForceComputerUI();
        TABS.options.initDarkTheme();

        TABS.options.initShowWarnings();

        GUI.content_ready(callback);
    });
};

options.cleanup = function (callback) {
    if (callback) {
        callback();
    }
};

options.initShowWarnings = function () {
    ConfigStorage.get('showPresetsWarningBackup', function (result) {
        if (result.showPresetsWarningBackup) {
            $('div.presetsWarningBackup input').prop('checked', true);
        }

        $('div.presetsWarningBackup input').change(function () {
            const checked = $(this).is(':checked');
            ConfigStorage.set({'showPresetsWarningBackup': checked});
        }).change();
    });
};

options.initPermanentExpertMode = function () {
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

options.initRememberLastTab = function () {
    ConfigStorage.get('rememberLastTab', function (result) {
        $('div.rememberLastTab input')
            .prop('checked', !!result.rememberLastTab)
            .change(function() { ConfigStorage.set({rememberLastTab: $(this).is(':checked')}); })
            .change();
    });
};

options.initCheckForConfiguratorUnstableVersions = function () {
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
};

options.initAnalyticsOptOut = function () {
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

options.initCliAutoComplete = function () {
    $('div.cliAutoComplete input')
        .prop('checked', CliAutoComplete.configEnabled)
        .change(function () {
            const checked = $(this).is(':checked');

            ConfigStorage.set({'cliAutoComplete': checked});
            CliAutoComplete.setEnabled(checked);
        }).change();
};

options.initShowAllSerialDevices = function() {
    const showAllSerialDevicesElement = $('div.showAllSerialDevices input');
    ConfigStorage.get('showAllSerialDevices', result => {
        showAllSerialDevicesElement
            .prop('checked', !!result.showAllSerialDevices)
            .on('change', () => ConfigStorage.set({ showAllSerialDevices: showAllSerialDevicesElement.is(':checked') }))
            .trigger('change');
    });
};

options.initShowVirtualMode = function() {
    const showVirtualModeElement = $('div.showVirtualMode input');
    ConfigStorage.get('showVirtualMode', result => {
        showVirtualModeElement
            .prop('checked', !!result.showVirtualMode)
            .on('change', () => {
                ConfigStorage.set({ showVirtualMode: showVirtualModeElement.is(':checked') });
                PortHandler.initialPorts = false;
            })
            .trigger('change');
    });
};

options.initCordovaForceComputerUI = function () {
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

options.initDarkTheme = function () {
    $('#darkThemeSelect')
        .val(DarkTheme.configEnabled)
        .change(function () {
            const value = parseInt($(this).val());

            ConfigStorage.set({'darkTheme': value});
            setDarkTheme(value);
        }).change();
};

// TODO: remove when modules are in place
window.TABS.options = options;
export { options };
