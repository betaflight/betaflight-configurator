import { i18n } from '../localization';
import GUI, { TABS } from '../gui';
import { get as getConfig, set as setConfig } from '../ConfigStorage';
import PortHandler from '../port_handler';
import CliAutoComplete from '../CliAutoComplete';
import DarkTheme, { setDarkTheme } from '../DarkTheme';
import { checkForConfiguratorUpdates } from '../utils/checkForConfiguratorUpdates';
import { checkSetupAnalytics } from '../Analytics';
import $ from 'jquery';
import CONFIGURATOR from '../data_storage';

const options = {};
options.initialize = function (callback) {
    if (GUI.active_tab !== 'options') {
        GUI.active_tab = 'options';
    }

    $('#content').load("./tabs/options.html", function () {
        i18n.localizePage();

        TABS.options.initRememberLastTab();
        TABS.options.initCheckForConfiguratorUnstableVersions();
        TABS.options.initAnalyticsOptOut();
        TABS.options.initCliAutoComplete();
        TABS.options.initShowAllSerialDevices();
        TABS.options.initShowVirtualMode();
        TABS.options.initUseManualConnection();
        TABS.options.initCordovaForceComputerUI();
        TABS.options.initDarkTheme();
        TABS.options.initShowDevToolsOnStartup();

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
    const result = getConfig('showPresetsWarningBackup');
    if (result.showPresetsWarningBackup) {
        $('div.presetsWarningBackup input').prop('checked', true);
    }

    $('div.presetsWarningBackup input').change(function () {
        const checked = $(this).is(':checked');
        setConfig({'showPresetsWarningBackup': checked});
    }).change();
};

options.initRememberLastTab = function () {
    const result = getConfig('rememberLastTab');
    $('div.rememberLastTab input')
        .prop('checked', !!result.rememberLastTab)
        .change(function() { setConfig({rememberLastTab: $(this).is(':checked')}); })
        .change();
};

options.initCheckForConfiguratorUnstableVersions = function () {
    const result = getConfig('checkForConfiguratorUnstableVersions');
    if (result.checkForConfiguratorUnstableVersions) {
        $('div.checkForConfiguratorUnstableVersions input').prop('checked', true);
    }

    $('div.checkForConfiguratorUnstableVersions input').change(function () {
        const checked = $(this).is(':checked');

        setConfig({'checkForConfiguratorUnstableVersions': checked});

        checkForConfiguratorUpdates();
    });
};

options.initAnalyticsOptOut = function () {
    const result = getConfig('analyticsOptOut');
    if (result.analyticsOptOut) {
        $('div.analyticsOptOut input').prop('checked', true);
    }

    $('div.analyticsOptOut input').change(function () {
        const checked = $(this).is(':checked');

        setConfig({'analyticsOptOut': checked});

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
};

options.initCliAutoComplete = function () {
    $('div.cliAutoComplete input')
        .prop('checked', CliAutoComplete.configEnabled)
        .change(function () {
            const checked = $(this).is(':checked');

            setConfig({'cliAutoComplete': checked});
            CliAutoComplete.setEnabled(checked);
        }).change();
};

options.initAutoConnectConnectionTimeout = function () {
    const result = getConfig('connectionTimeout');
    if (result.connectionTimeout) {
        $('#connectionTimeoutSelect').val(result.connectionTimeout);
    }
    $('#connectionTimeoutSelect').on('change', function () {
        const value = parseInt($(this).val());
        setConfig({'connectionTimeout': value});
    });
};

options.initShowAllSerialDevices = function() {
    const showAllSerialDevicesElement = $('div.showAllSerialDevices input');
    const result = getConfig('showAllSerialDevices');
    showAllSerialDevicesElement
        .prop('checked', !!result.showAllSerialDevices)
        .on('change', () => {
            setConfig({ showAllSerialDevices: showAllSerialDevicesElement.is(':checked') });
            PortHandler.reinitialize();
        });
};

options.initShowVirtualMode = function() {
    const showVirtualModeElement = $('div.showVirtualMode input');
    const result = getConfig('showVirtualMode');
    showVirtualModeElement
        .prop('checked', !!result.showVirtualMode)
        .on('change', () => {
            const checked = showVirtualModeElement.is(':checked');
            setConfig({ showVirtualMode: checked });
            PortHandler.setShowVirtualMode(checked);
        });
};

options.initUseManualConnection = function() {
    const showManualModeElement = $('div.showManualMode input');
    const result = getConfig('showManualMode');
    showManualModeElement
        .prop('checked', !!result.showManualMode)
        .on('change', () => {
            const checked = showManualModeElement.is(':checked');
            setConfig({ showManualMode: checked });
            PortHandler.setShowManualMode(checked);
        });
};

options.initCordovaForceComputerUI = function () {
    $('div.cordovaForceComputerUI').hide();
};

options.initDarkTheme = function () {
    $('#darkThemeSelect')
        .val(DarkTheme.configSetting)
        .change(function () {
            const value = parseInt($(this).val());

            setConfig({'darkTheme': value});
            setDarkTheme(value);
        }).change();
};

options.initShowDevToolsOnStartup = function () {
    const result = getConfig('showDevToolsOnStartup');
    $('div.showDevToolsOnStartup input')
        .prop('checked', !!result.showDevToolsOnStartup)
        .change(function () { setConfig({ showDevToolsOnStartup: $(this).is(':checked') }); })
        .change();
};

// TODO: remove when modules are in place
TABS.options = options;
export { options };
