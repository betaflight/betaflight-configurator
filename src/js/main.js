'use strict';

window.googleAnalytics = analytics;
window.analytics = null;

$(document).ready(function () {
    $.getJSON('version.json', function(data) {
        CONFIGURATOR.version = data.version;
        CONFIGURATOR.gitChangesetId = data.gitChangesetId;

        // Version in the ChromeApp's manifest takes precedence.
        if(chrome.runtime && chrome.runtime.getManifest) {
            const manifest = chrome.runtime.getManifest();
            CONFIGURATOR.version = manifest.version;
            // manifest.json for ChromeApp can't have a version
            // with a prerelease tag eg 10.0.0-RC4
            // Work around is to specify the prerelease version in version_name
            if (manifest.version_name) {
                CONFIGURATOR.version = manifest.version_name;
            }
        }
        i18n.init(function() {
            startProcess();

            checkSetupAnalytics(function (analyticsService) {
                analyticsService.sendEvent(analyticsService.EVENT_CATEGORIES.APPLICATION, 'SelectedLanguage', i18n.selectedLanguage);
            });

            initializeSerialBackend();
        });
    });
});

function checkSetupAnalytics(callback) {
    if (!analytics) {
        setTimeout(function () {
            ConfigStorage.get(['userId', 'analyticsOptOut', 'checkForConfiguratorUnstableVersions', ], function (result) {
                if (!analytics) {
                    setupAnalytics(result);
                }

                callback(analytics);
            });
        });
    } else if (callback) {
        callback(analytics);
    }
}

function getBuildType() {
    return GUI.Mode;
}

function setupAnalytics(result) {
    let userId;
    if (result.userId) {
        userId = result.userId;
    } else {
        const uid = new ShortUniqueId();
        userId = uid.randomUUID(13);

        ConfigStorage.set({ 'userId': userId });
    }

    const optOut = !!result.analyticsOptOut;
    const checkForDebugVersions = !!result.checkForConfiguratorUnstableVersions;

    const debugMode = typeof process === "object" && process.versions['nw-flavor'] === 'sdk';

    window.analytics = new Analytics('UA-123002063-1', userId, 'Betaflight Configurator', CONFIGURATOR.version, CONFIGURATOR.gitChangesetId, GUI.operating_system,
        checkForDebugVersions, optOut, debugMode, getBuildType());

    function logException(exception) {
        analytics.sendException(exception.stack);
    }

    if (typeof process === "object") {
        process.on('uncaughtException', logException);
    }

    analytics.sendEvent(analytics.EVENT_CATEGORIES.APPLICATION, 'AppStart', { sessionControl: 'start' });

    function sendCloseEvent() {
        analytics.sendEvent(analytics.EVENT_CATEGORIES.APPLICATION, 'AppClose', { sessionControl: 'end' });
    }

    if (GUI.isNWJS()) {
        const win = GUI.nwGui.Window.get();
        win.on('close', function () {
            sendCloseEvent();

            this.close(true);
        });
        win.on('new-win-policy', function(frame, url, policy) {
            // do not open the window
            policy.ignore();
            // and open it in external browser
            GUI.nwGui.Shell.openExternal(url);
        });
    } else if (!GUI.isOther()) {
        // Looks like we're in Chrome - but the event does not actually get fired
        chrome.runtime.onSuspend.addListener(sendCloseEvent);
    }

    $('.connect_b a.connect').removeClass('disabled');
    $('.firmware_b a.flash').removeClass('disabled');
}

//Process to execute to real start the app
function startProcess() {
    // translate to user-selected language
    i18n.localizePage();

    GUI.log(i18n.getMessage('infoVersions', {
        operatingSystem: GUI.operating_system,
        chromeVersion: window.navigator.appVersion.replace(/.*Chrome\/([0-9.]*).*/, "$1"),
        configuratorVersion: CONFIGURATOR.version }));

    $('#logo .version').text(CONFIGURATOR.version);
    updateStatusBarVersion();
    updateTopBarVersion();

    if (!GUI.isOther() && GUI.operating_system !== 'ChromeOS') {
        checkForConfiguratorUpdates();
    }

    // log webgl capability
    // it would seem the webgl "enabling" through advanced settings will be ignored in the future
    // and webgl will be supported if gpu supports it by default (canary 40.0.2175.0), keep an eye on this one
    document.createElement('canvas');

    // log library versions in console to make version tracking easier
    console.log(`Libraries: jQuery - ${$.fn.jquery}, d3 - ${d3.version}, three.js - ${THREE.REVISION}`);

    // Tabs
    $("#tabs ul.mode-connected li").click(function() {
        // store the first class of the current tab (omit things like ".active")
        ConfigStorage.set(
            {lastTab: $(this).attr("class").split(' ')[0]}
        );
    });

    const ui_tabs = $('#tabs > ul');
    $('a', ui_tabs).click(function () {
        if ($(this).parent().hasClass('active') === false && !GUI.tab_switch_in_progress) { // only initialize when the tab isn't already active
            const self = this;
            const tabClass = $(self).parent().prop('class');

            const tabRequiresConnection = $(self).parent().hasClass('mode-connected');

            const tab = tabClass.substring(4);
            const tabName = $(self).text();

            if (tabRequiresConnection && !CONFIGURATOR.connectionValid) {
                GUI.log(i18n.getMessage('tabSwitchConnectionRequired'));
                return;
            }

            if (GUI.connect_lock) { // tab switching disabled while operation is in progress
                GUI.log(i18n.getMessage('tabSwitchWaitForOperation'));
                return;
            }

            if (GUI.allowedTabs.indexOf(tab) < 0 && tabName === "Firmware Flasher") {
                if (GUI.connected_to || GUI.connecting_to) {
                    $('a.connect').click();
                } else {
                    self.disconnect();
                }
                $('div.open_firmware_flasher a.flash').click();
            } else if (GUI.allowedTabs.indexOf(tab) < 0) {
                GUI.log(i18n.getMessage('tabSwitchUpgradeRequired', [tabName]));
                return;
            }

            GUI.tab_switch_in_progress = true;

            GUI.tab_switch_cleanup(function () {
                // disable active firmware flasher if it was active
                if ($('div#flashbutton a.flash_state').hasClass('active') && $('div#flashbutton a.flash').hasClass('active')) {
                    $('div#flashbutton a.flash_state').removeClass('active');
                    $('div#flashbutton a.flash').removeClass('active');
                }
                // disable previously active tab highlight
                $('li', ui_tabs).removeClass('active');

                // Highlight selected tab
                $(self).parent().addClass('active');

                // detach listeners and remove element data
                const content = $('#content');
                content.empty();

                // display loading screen
                $('#cache .data-loading').clone().appendTo(content);

                function content_ready() {
                    GUI.tab_switch_in_progress = false;
                }

                checkSetupAnalytics(function (analyticsService) {
                    analyticsService.sendAppView(tab);
                });

                switch (tab) {
                    case 'landing':
                        TABS.landing.initialize(content_ready);
                        break;
                    case 'changelog':
                        TABS.staticTab.initialize('changelog', content_ready);
                        break;
                    case 'privacy_policy':
                        TABS.staticTab.initialize('privacy_policy', content_ready);
                        break;
                    case 'firmware_flasher':
                        TABS.firmware_flasher.initialize(content_ready);
                        break;
                    case 'help':
                        TABS.help.initialize(content_ready);
                        break;
                    case 'auxiliary':
                        TABS.auxiliary.initialize(content_ready);
                        break;
                    case 'adjustments':
                        TABS.adjustments.initialize(content_ready);
                        break;
                    case 'ports':
                        TABS.ports.initialize(content_ready);
                        break;
                    case 'led_strip':
                        TABS.led_strip.initialize(content_ready);
                        break;
                    case 'failsafe':
                        TABS.failsafe.initialize(content_ready);
                        break;
                    case 'transponder':
                        TABS.transponder.initialize(content_ready);
                        break;
                    case 'osd':
                        TABS.osd.initialize(content_ready);
                        break;
                    case 'vtx':
                        TABS.vtx.initialize(content_ready);
                        break;
                    case 'power':
                        TABS.power.initialize(content_ready);
                        break;
                    case 'setup':
                        TABS.setup.initialize(content_ready);
                        break;
                    case 'setup_osd':
                        TABS.setup_osd.initialize(content_ready);
                        break;

                    case 'configuration':
                        TABS.configuration.initialize(content_ready);
                        break;
                    case 'pid_tuning':
                        TABS.pid_tuning.initialize(content_ready);
                        break;
                    case 'receiver':
                        TABS.receiver.initialize(content_ready);
                        break;
                    case 'servos':
                        TABS.servos.initialize(content_ready);
                        break;
                    case 'gps':
                        TABS.gps.initialize(content_ready);
                        break;
                    case 'motors':
                        TABS.motors.initialize(content_ready);
                        break;
                    case 'sensors':
                        TABS.sensors.initialize(content_ready);
                        break;
                    case 'logging':
                        TABS.logging.initialize(content_ready);
                        break;
                    case 'onboard_logging':
                        TABS.onboard_logging.initialize(content_ready);
                        break;
                    case 'cli':
                        TABS.cli.initialize(content_ready, GUI.nwGui);
                        break;

                    default:
                        console.log(`Tab not found: ${tab}`);
                }
            });
        }
    });

    $('#tabs ul.mode-disconnected li a:first').click();

    // options
    $('a#options').click(function () {
        const el = $(this);

        if (!el.hasClass('active')) {
            el.addClass('active');
            el.after('<div id="options-window"></div>');

            $('div#options-window').load('./tabs/options.html', function () {
                // translate to user-selected language
                i18n.localizePage();

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

                ConfigStorage.get('rememberLastTab', function (result) {
                    $('div.rememberLastTab input')
                        .prop('checked', !!result.rememberLastTab)
                        .change(function() { ConfigStorage.set({rememberLastTab: $(this).is(':checked')}); })
                        .change();
                });

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

                $('div.cliAutoComplete input')
                    .prop('checked', CliAutoComplete.configEnabled)
                    .change(function () {
                        const checked = $(this).is(':checked');

                        ConfigStorage.set({'cliAutoComplete': checked});
                        CliAutoComplete.setEnabled(checked);
                    }).change();

                $('#darkThemeSelect')
                    .val(DarkTheme.configEnabled)
                    .change(function () {
                        const value = parseInt($(this).val());

                        ConfigStorage.set({'darkTheme': value});
                        setDarkTheme(value);
                    }).change();

                function close_and_cleanup(e) {
                    if (e.type === 'click' && !$.contains($('div#options-window')[0], e.target) || e.type === 'keyup' && e.keyCode === 27) {
                        $(document).unbind('click keyup', close_and_cleanup);

                        $('div#options-window').slideUp(250, function () {
                            el.removeClass('active');
                            $(this).empty().remove();
                        });
                    }
                }

                $(document).bind('click keyup', close_and_cleanup);

                $(this).slideDown(250);
            });
        }
    });

    // listen to all input change events and adjust the value within limits if necessary
    $("#content").on('focus', 'input[type="number"]', function () {
        const element = $(this);
        const val = element.val();

        if (!isNaN(val)) {
            element.data('previousValue', parseFloat(val));
        }
    });

    $("#content").on('keydown', 'input[type="number"]', function (e) {
        // whitelist all that we need for numeric control
        const whitelist = [
            96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, // numpad and standard number keypad
            109, 189, // minus on numpad and in standard keyboard
            8, 46, 9, // backspace, delete, tab
            190, 110, // decimal point
            37, 38, 39, 40, 13, // arrows and enter
        ];

        if (whitelist.indexOf(e.keyCode) === -1) {
            e.preventDefault();
        }
    });

    $("#content").on('change', 'input[type="number"]', function () {
        const element = $(this);
        const min = parseFloat(element.prop('min'));
        const max = parseFloat(element.prop('max'));
        const step = parseFloat(element.prop('step'));

        let val = parseFloat(element.val());

        // only adjust minimal end if bound is set
        if (element.prop('min') && val < min) {
            element.val(min);
            val = min;
        }

        // only adjust maximal end if bound is set
        if (element.prop('max') && val > max) {
            element.val(max);
            val = max;
        }

        // if entered value is illegal use previous value instead
        if (isNaN(val)) {
            element.val(element.data('previousValue'));
            val = element.data('previousValue');
        }

        // if step is not set or step is int and value is float use previous value instead
        if ((isNaN(step) || step % 1 === 0) && val % 1 !== 0) {
            element.val(element.data('previousValue'));
            val = element.data('previousValue');
        }

        // if step is set and is float and value is int, convert to float, keep decimal places in float according to step *experimental*
        if (!isNaN(step) && step % 1 !== 0) {
            const decimal_places = String(step).split('.')[1].length;

            if (val % 1 === 0 || String(val).split('.')[1].length !== decimal_places) {
                element.val(val.toFixed(decimal_places));
            }
        }
    });

    $("#showlog").on('click', function () {
        let state = $(this).data('state');
        if (state) {
            $("#log").animate({height: 27}, 200, function () {
                const command_log = $('div#log');
                command_log.scrollTop($('div.wrapper', command_log).height());
            });
            $("#log").removeClass('active');
            $("#content").removeClass('logopen');
            $(".tab_container").removeClass('logopen');
            $("#scrollicon").removeClass('active');
            ConfigStorage.set({'logopen': false});

            state = false;
        } else {
            $("#log").animate({height: 111}, 200);
            $("#log").addClass('active');
            $("#content").addClass('logopen');
            $(".tab_container").addClass('logopen');
            $("#scrollicon").addClass('active');
            ConfigStorage.set({'logopen': true});

            state = true;
        }
        $(this).text(state ? i18n.getMessage('logActionHide') : i18n.getMessage('logActionShow'));
        $(this).data('state', state);
    });

    ConfigStorage.get('logopen', function (result) {
        if (result.logopen) {
            $("#showlog").trigger('click');
        }
    });

    ConfigStorage.get('permanentExpertMode', function (result) {
        if (result.permanentExpertMode) {
            $('input[name="expertModeCheckbox"]').prop('checked', true);
        }

        $('input[name="expertModeCheckbox"]').change(function () {
            const checked = $(this).is(':checked');
            checkSetupAnalytics(function (analyticsService) {
                analyticsService.setDimension(analyticsService.DIMENSIONS.CONFIGURATOR_EXPERT_MODE, checked ? 'On' : 'Off');
            });

            if (FEATURE_CONFIG && FEATURE_CONFIG.features !== 0) {
                updateTabList(FEATURE_CONFIG.features);
            }
        }).change();
    });

    ConfigStorage.get('cliAutoComplete', function (result) {
        CliAutoComplete.setEnabled(typeof result.cliAutoComplete == 'undefined' || result.cliAutoComplete); // On by default
    });

    ConfigStorage.get('darkTheme', function (result) {
        if (result.darkTheme === undefined || typeof result.darkTheme !== "number") {
            // sets dark theme to auto if not manually changed
            setDarkTheme(2);
        } else {
            setDarkTheme(result.darkTheme);
        }
    });
}

function setDarkTheme(enabled) {
    DarkTheme.setConfig(enabled);

    checkSetupAnalytics(function (analyticsService) {
        analyticsService.sendEvent(analyticsService.EVENT_CATEGORIES.APPLICATION, 'DarkTheme', enabled);
    });
}

function checkForConfiguratorUpdates() {
    const releaseChecker = new ReleaseChecker('configurator', 'https://api.github.com/repos/betaflight/betaflight-configurator/releases');

    releaseChecker.loadReleaseData(notifyOutdatedVersion);
}

function notifyOutdatedVersion(releaseData) {
    ConfigStorage.get('checkForConfiguratorUnstableVersions', function (result) {
        let showUnstableReleases = false;
        if (result.checkForConfiguratorUnstableVersions) {
            showUnstableReleases = true;
        }
        const versions = releaseData.filter(function (version) {
            const semVerVersion = semver.parse(version.tag_name);
            if (semVerVersion && (showUnstableReleases || semVerVersion.prerelease.length === 0)) {
                return version;
            } else {
                return null;
            }
         }).sort(function (v1, v2) {
            try {
                return semver.compare(v2.tag_name, v1.tag_name);
            } catch (e) {
                return false;
            }
        });

        if (versions.length > 0 && semver.lt(CONFIGURATOR.version, versions[0].tag_name)) {
            GUI.log(i18n.getMessage('configuratorUpdateNotice', [versions[0].tag_name, versions[0].html_url]));

            const dialog = $('.dialogConfiguratorUpdate')[0];

            $('.dialogConfiguratorUpdate-content').html(i18n.getMessage('configuratorUpdateNotice', [versions[0].tag_name, versions[0].html_url]));

            $('.dialogConfiguratorUpdate-closebtn').click(function() {
                dialog.close();
            });

            $('.dialogConfiguratorUpdate-websitebtn').click(function() {
                dialog.close();

                window.open(versions[0].html_url, '_blank');
            });

            dialog.showModal();
        }
    });
}

function update_packet_error(caller) {
    $('span.packet-error').html(caller.packet_error);
}

function microtime() {
    return new Date().getTime() / 1000;
}

function millitime() {
    return new Date().getTime();
}

const DEGREE_TO_RADIAN_RATIO = Math.PI / 180;

function degToRad(degrees) {
    return degrees * DEGREE_TO_RADIAN_RATIO;
}

function bytesToSize(bytes) {

    let outputBytes;

    if (bytes < 1024) {
        outputBytes = `${bytes} Bytes`;
    } else if (bytes < 1048576) {
        outputBytes = `${(bytes / 1024).toFixed(3)} KB`;
    } else if (bytes < 1073741824) {
        outputBytes = `${(bytes / 1048576).toFixed(3)} MB`;
    } else {
        outputBytes = `${(bytes / 1073741824).toFixed(3)} GB`;
    }

    return outputBytes;
}

function isExpertModeEnabled() {
    return $('input[name="expertModeCheckbox"]').is(':checked');
}

function updateTabList(features) {

    if (isExpertModeEnabled()) {
        $('#tabs ul.mode-connected li.tab_failsafe').show();
        $('#tabs ul.mode-connected li.tab_adjustments').show();
        $('#tabs ul.mode-connected li.tab_servos').show();
        $('#tabs ul.mode-connected li.tab_sensors').show();
        $('#tabs ul.mode-connected li.tab_logging').show();
    } else {
        $('#tabs ul.mode-connected li.tab_failsafe').hide();
        $('#tabs ul.mode-connected li.tab_adjustments').hide();
        $('#tabs ul.mode-connected li.tab_servos').hide();
        $('#tabs ul.mode-connected li.tab_sensors').hide();
        $('#tabs ul.mode-connected li.tab_logging').hide();
    }

    if (features.isEnabled('GPS') && isExpertModeEnabled()) {
        $('#tabs ul.mode-connected li.tab_gps').show();
    } else {
        $('#tabs ul.mode-connected li.tab_gps').hide();
    }

    if (features.isEnabled('LED_STRIP')) {
        $('#tabs ul.mode-connected li.tab_led_strip').show();
    } else {
        $('#tabs ul.mode-connected li.tab_led_strip').hide();
    }

    if (features.isEnabled('TRANSPONDER')) {
        $('#tabs ul.mode-connected li.tab_transponder').show();
    } else {
        $('#tabs ul.mode-connected li.tab_transponder').hide();
    }

    if (features.isEnabled('OSD')) {
        $('#tabs ul.mode-connected li.tab_osd').show();
    } else {
        $('#tabs ul.mode-connected li.tab_osd').hide();
    }

    if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
        $('#tabs ul.mode-connected li.tab_power').show();
    } else {
        $('#tabs ul.mode-connected li.tab_power').hide();
    }

    if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
        $('#tabs ul.mode-connected li.tab_vtx').show();
    } else {
        $('#tabs ul.mode-connected li.tab_vtx').hide();
    }

}

function zeroPad(value, width) {

    let valuePadded = String(value);

    while (valuePadded.length < width) {
        valuePadded = `0${value}`;
    }

    return valuePadded;
}

function generateFilename(prefix, suffix) {
    const date = new Date();
    let filename = prefix;

    if (CONFIG) {
        if (CONFIG.flightControllerIdentifier) {
            filename = `${CONFIG.flightControllerIdentifier}_${filename}`;
        }
        if(CONFIG.name && CONFIG.name.trim() !== '') {
            filename = `${filename}_${CONFIG.name.trim().replace(' ', '_')}`;
        }
    }

    const yyyymmdd = `${date.getFullYear()}${zeroPad(date.getMonth() + 1, 2)}${zeroPad(date.getDate(), 2)}`;
    const hhmmss = `${zeroPad(date.getHours(), 2)}${zeroPad(date.getMinutes(), 2)}${zeroPad(date.getSeconds(), 2)}`;
    filename = `${filename}_${yyyymmdd}_${hhmmss}`;

    return `${filename}.${suffix}`;
}

function getTargetVersion(hardwareId) {
    let versionText = '';

    if (hardwareId) {
       versionText = `${i18n.getMessage('versionLabelTarget')}: ${hardwareId}`;
    }

    return versionText;
}

function getFirmwareVersion(firmwareVersion, firmwareId) {
    let versionText = '';

    if (firmwareVersion) {
        versionText = `${i18n.getMessage('versionLabelFirmware')}: ${firmwareId} ${firmwareVersion}`;
    }

    return versionText;
}

function getConfiguratorVersion() {
    return `${i18n.getMessage('versionLabelConfigurator')}: ${CONFIGURATOR.version}`;
}

function updateTopBarVersion(firmwareVersion, firmwareId, hardwareId) {

    const configuratorVersion = getConfiguratorVersion();
    const firmwareVersionAndId = getFirmwareVersion(firmwareVersion, firmwareId);
    const targetVersion = getTargetVersion(hardwareId);

    const versionText = `${configuratorVersion}<br />${firmwareVersionAndId}<br />${targetVersion}`;

    $('#logo .logo_text').html(versionText);
}

function updateStatusBarVersion(firmwareVersion, firmwareId, hardwareId) {
    let versionText = '';

    versionText = versionText + getFirmwareVersion(firmwareVersion, firmwareId);

    if (versionText !== '') {
        versionText = `${versionText}, `;
    }

    const targetVersion = getTargetVersion(hardwareId);
    versionText = versionText + targetVersion;

    if (targetVersion !== '') {
        versionText = `${versionText}, `;
    }

    versionText = `${versionText}${getConfiguratorVersion()} (${CONFIGURATOR.gitChangesetId})`;

    $('#status-bar .version').text(versionText);
}

function showErrorDialog(message) {
   const dialog = $('.dialogError')[0];

    $('.dialogError-content').html(message);

    $('.dialogError-closebtn').click(function() {
        dialog.close();
    });

    dialog.showModal();
}
