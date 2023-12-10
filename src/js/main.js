import './jqueryPlugins';
import $ from 'jquery';
import 'jbox';
import '../components/init.js';
import { gui_log } from './gui_log.js';
// same, msp seems to be everywhere used from global scope
import './msp/MSPHelper.js';
import { i18n } from './localization.js';
import GUI, { TABS } from './gui.js';
import { get as getConfig, set as setConfig } from './ConfigStorage.js';
import { tracking, checkSetupAnalytics } from './Analytics.js';
import { initializeSerialBackend } from './serial_backend.js';
import FC from './fc.js';
import CONFIGURATOR from './data_storage.js';
import serial from './serial.js';
import CliAutoComplete from './CliAutoComplete.js';
import DarkTheme, { setDarkTheme } from './DarkTheme.js';
import UI_PHONES from './phones_ui.js';
import { isExpertModeEnabled } from './utils/isExportModeEnabled.js';
import { updateTabList } from './utils/updateTabList.js';
import { checkForConfiguratorUpdates } from './utils/checkForConfiguratorUpdates.js';
import * as THREE from 'three';
import * as d3 from 'd3';

if (typeof String.prototype.replaceAll === "undefined") {
    String.prototype.replaceAll = function(match, replace) {
        return this.replace(new RegExp(match, 'g'), () => replace);
    };
}

$(document).ready(function () {

    useGlobalNodeFunctions();

    if (typeof cordovaApp === 'undefined') {
        appReady();
    }
});

function useGlobalNodeFunctions() {
    // The global functions of Node continue working on background. This is good to continue flashing,
    // for example, when the window is minimized
    if (GUI.isNWJS()) {
        console.log("Replacing timeout/interval functions with Node versions");
        window.setTimeout = global.setTimeout;
        window.clearTimeout = global.clearTimeout;
        window.setInterval = global.setInterval;
        window.clearInterval = global.clearInterval;
    }
}

function readConfiguratorVersionMetadata() {
    if (GUI.isNWJS() || GUI.isCordova()) {
        const manifest = chrome.runtime.getManifest();
        CONFIGURATOR.productName = manifest.productName;
        CONFIGURATOR.version = manifest.version;
        CONFIGURATOR.gitRevision = manifest.gitRevision;
    } else {
        CONFIGURATOR.productName = __APP_PRODUCTNAME__;
        CONFIGURATOR.version = __APP_VERSION__;
        CONFIGURATOR.gitRevision = __APP_REVISION__;
    }
}

function cleanupLocalStorage() {

    const cleanupLocalStorageList = [
        'cache',
        'firmware',
        'https',
        'selected_board',
        'unifiedConfigLast',
        'unifiedSourceCache',
    ];

    for (const key in localStorage) {
        for (const item of cleanupLocalStorageList) {
            if (key.includes(item)) {
                localStorage.removeItem(key);
            }
        }
    }
}

function appReady() {
    readConfiguratorVersionMetadata();

    cleanupLocalStorage();

    i18n.init(function() {

        // pass the configurator version as a custom header for every AJAX request.
        $.ajaxSetup({
            headers: {
                'X-CFG-VER': `${CONFIGURATOR.version}`,
            },
        });

        startProcess();

        checkSetupAnalytics(function (analyticsService) {
            analyticsService.sendEvent(analyticsService.EVENT_CATEGORIES.APPLICATION, 'SelectedLanguage', i18n.selectedLanguage);
        });

        initializeSerialBackend();
    });
}

function closeSerial() {
    // automatically close the port when application closes
    const connectionId = serial.connectionId;

    if (connectionId && CONFIGURATOR.connectionValid && !CONFIGURATOR.virtualMode) {
        // code below is handmade MSP message (without pretty JS wrapper), it behaves exactly like MSP.send_message
        // sending exit command just in case the cli tab was open.
        // reset motors to default (mincommand)

        let bufferOut = new ArrayBuffer(5),
        bufView = new Uint8Array(bufferOut);

        bufView[0] = 0x65; // e
        bufView[1] = 0x78; // x
        bufView[2] = 0x69; // i
        bufView[3] = 0x74; // t
        bufView[4] = 0x0D; // enter

        const sendFn = (serial.connectionType === 'serial' ? chrome.serial.send : chrome.sockets.tcp.send);
        sendFn(connectionId, bufferOut, function () {
            console.log('Send exit');
        });

        setTimeout(function() {
            bufferOut = new ArrayBuffer(22);
            bufView = new Uint8Array(bufferOut);
            let checksum = 0;

            bufView[0] = 36; // $
            bufView[1] = 77; // M
            bufView[2] = 60; // <
            bufView[3] = 16; // data length
            bufView[4] = 214; // MSP_SET_MOTOR

            checksum = bufView[3] ^ bufView[4];

            for (let i = 0; i < 16; i += 2) {
                bufView[i + 5] = FC.MOTOR_CONFIG.mincommand & 0x00FF;
                bufView[i + 6] = FC.MOTOR_CONFIG.mincommand >> 8;

                checksum ^= bufView[i + 5];
                checksum ^= bufView[i + 6];
            }

            bufView[5 + 16] = checksum;

            sendFn(connectionId, bufferOut, function () {
                serial.disconnect();
            });
        }, 100);
    } else if (connectionId) {
        serial.disconnect();
    }
}

function closeHandler() {
    if (!GUI.isCordova()) {
        this.hide();
    }

    tracking.sendEvent(tracking.EVENT_CATEGORIES.APPLICATION, 'AppClose', { sessionControl: 'end' });

    closeSerial();

    if (!GUI.isCordova()) {
        this.close(true);
    }
}

//Process to execute to real start the app
function startProcess() {
    // translate to user-selected language
    i18n.localizePage();

    gui_log(i18n.getMessage('infoVersionOs', { operatingSystem: GUI.operating_system }));
    gui_log(i18n.getMessage('infoVersionConfigurator', { configuratorVersion: CONFIGURATOR.getDisplayVersion() }));

    if (GUI.isNWJS()) {
        const nwWindow = GUI.nwGui.Window.get();
        nwWindow.on('new-win-policy', function(frame, url, policy) {
            // do not open the window
            policy.ignore();
            // and open it in external browser
            GUI.nwGui.Shell.openExternal(url);
        });
        nwWindow.on('close', closeHandler);
        const config = getConfig('showDevToolsOnStartup');
        if (CONFIGURATOR.isDevVersion() && !!config.showDevToolsOnStartup) {
            nwWindow.showDevTools();
        }
    } else if (GUI.isCordova()) {
        window.addEventListener('beforeunload', closeHandler);
        document.addEventListener('backbutton', function(e) {
            e.preventDefault();
            navigator.notification.confirm(
                i18n.getMessage('cordovaExitAppMessage'),
                function(stat) {
                    if (stat === 1) {
                        navigator.app.exitApp();
                    }
                },
                i18n.getMessage('cordovaExitAppTitle'),
                [i18n.getMessage('yes'),i18n.getMessage('no')],
            );
        });
    }

    $('.connect_b a.connect').removeClass('disabled');
    // with Vue reactive system we don't need to call these,
    // our view is reactive to model changes
    // updateTopBarVersion();

    if (!GUI.isOther()) {
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
        const tabName = $(this).attr("class").split(' ')[0];

        const tabNameWithoutPrefix = tabName.substring(4);
        if (tabNameWithoutPrefix !== "cli") {
            // Don't store 'cli' otherwise you can never connect to another tab.
            setConfig(
                {lastTab: tabName},
            );
        }
    });

    if (GUI.isCordova()) {
        UI_PHONES.init();
    }

    const ui_tabs = $('#tabs > ul');
    $('a', ui_tabs).click(function () {
        if ($(this).parent().hasClass('active') === false && !GUI.tab_switch_in_progress) { // only initialize when the tab isn't already active
            const self = this;
            const tabClass = $(self).parent().prop('class');

            const tabRequiresConnection = $(self).parent().hasClass('mode-connected');

            const tab = tabClass.substring(4);
            const tabName = $(self).text();

            if (tabRequiresConnection && !CONFIGURATOR.connectionValid) {
                gui_log(i18n.getMessage('tabSwitchConnectionRequired'));
                return;
            }

            if (GUI.connect_lock) { // tab switching disabled while operation is in progress
                gui_log(i18n.getMessage('tabSwitchWaitForOperation'));
                return;
            }

            if (GUI.allowedTabs.indexOf(tab) < 0 && tab === "firmware_flasher") {
                if (GUI.connected_to || GUI.connecting_to) {
                    $('a.connect').click();
                } else {
                    serial.disconnect();
                }
                $('div.open_firmware_flasher a.flash').click();
            } else if (GUI.allowedTabs.indexOf(tab) < 0) {
                gui_log(i18n.getMessage('tabSwitchUpgradeRequired', [tabName]));
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
                        import("./tabs/landing").then(({ landing }) =>
                            landing.initialize(content_ready),
                        );
                        break;
                    case 'changelog':
                        import("./tabs/static_tab").then(({ staticTab }) =>
                            staticTab.initialize("changelog", content_ready),
                        );
                        break;
                    case 'privacy_policy':
                        import("./tabs/static_tab").then(({ staticTab }) =>
                            staticTab.initialize("privacy_policy", content_ready),
                        );
                        break;
                    case 'options':
                        import("./tabs/options").then(({ options }) =>
                            options.initialize(content_ready),
                        );
                        break;
                    case 'firmware_flasher':
                        import("./tabs/firmware_flasher").then(({ firmware_flasher }) =>
                            firmware_flasher.initialize(content_ready),
                        );
                        break;
                    case 'help':
                        import("./tabs/help").then(({ help }) =>
                            help.initialize(content_ready),
                        );
                        break;
                    case 'auxiliary':
                        import("./tabs/auxiliary").then(({ auxiliary }) =>
                            auxiliary.initialize(content_ready),
                        );
                        break;
                    case 'adjustments':
                        import("./tabs/adjustments").then(({ adjustments }) =>
                            adjustments.initialize(content_ready),
                        );
                        break;
                    case 'ports':
                        import("./tabs/ports").then(({ ports }) =>
                            ports.initialize(content_ready),
                        );
                        break;
                    case 'led_strip':
                        import("./tabs/led_strip").then(({ led_strip }) =>
                            led_strip.initialize(content_ready),
                        );
                        break;
                    case 'failsafe':
                        import("./tabs/failsafe").then(({ failsafe }) =>
                            failsafe.initialize(content_ready),
                        );
                        break;
                    case 'transponder':
                        import("./tabs/transponder").then(({ transponder }) =>
                            transponder.initialize(content_ready),
                        );
                        break;
                    case 'osd':
                        import("./tabs/osd").then(({ osd }) =>
                            osd.initialize(content_ready),
                        );
                        break;
                    case 'vtx':
                        import("./tabs/vtx").then(({ vtx }) =>
                            vtx.initialize(content_ready),
                        );
                        break;
                    case 'power':
                        import("./tabs/power").then(({ power }) =>
                            power.initialize(content_ready),
                        );
                        break;
                    case 'setup':
                        import("./tabs/setup").then(({ setup }) =>
                            setup.initialize(content_ready),
                        );
                        break;
                    case 'setup_osd':
                        import("./tabs/setup_osd").then(({ setup_osd }) =>
                            setup_osd.initialize(content_ready),
                        );
                        break;
                    case 'configuration':
                        import("./tabs/configuration").then(({ configuration }) =>
                            configuration.initialize(content_ready),
                        );
                        break;
                    case 'pid_tuning':
                        import("./tabs/pid_tuning").then(({ pid_tuning }) =>
                            pid_tuning.initialize(content_ready),
                        );
                        break;
                    case 'receiver':
                        import("./tabs/receiver").then(({ receiver }) =>
                            receiver.initialize(content_ready),
                        );
                        break;
                    case 'servos':
                        import("./tabs/servos").then(({ servos }) =>
                            servos.initialize(content_ready),
                        );
                        break;
                    case 'gps':
                        import("./tabs/gps").then(({ gps }) =>
                            gps.initialize(content_ready),
                        );
                        break;
                    case 'motors':
                        import("./tabs/motors").then(({ motors }) =>
                            motors.initialize(content_ready),
                        );
                        break;
                    case 'sensors':
                        import("./tabs/sensors").then(({ sensors }) =>
                            sensors.initialize(content_ready),
                        );
                        break;
                    case 'logging':
                        import("./tabs/logging").then(({ logging }) =>
                            logging.initialize(content_ready),
                        );
                        break;
                    case 'onboard_logging':
                        import("./tabs/onboard_logging").then(({ onboard_logging }) =>
                            onboard_logging.initialize(content_ready),
                        );
                        break;
                    case 'cli':
                        import("./tabs/cli").then(({ cli }) =>
                            cli.initialize(content_ready),
                        );
                        break;
                    case 'presets':
                        import("../tabs/presets/presets").then(({ presets }) =>
                            presets.initialize(content_ready),
                        );
                        break;

                    default:
                        console.log(`Tab not found: ${tab}`);
                }
            });
        }
    });

    $('#tabs ul.mode-disconnected li a:first').click();

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
            setTimeout(function() {
                const command_log = $('div#log');
                command_log.scrollTop($('div.wrapper', command_log).height());
            }, 200);
            $("#log").removeClass('active');
            $("#tab-content-container").removeClass('logopen');
            $("#scrollicon").removeClass('active');
            setConfig({'logopen': false});

            state = false;
        } else {
            $("#log").addClass('active');
            $("#tab-content-container").addClass('logopen');
            $("#scrollicon").addClass('active');
            setConfig({'logopen': true});

            state = true;
        }
        $(this).text(state ? i18n.getMessage('logActionHide') : i18n.getMessage('logActionShow'));
        $(this).data('state', state);
    });

    let result = getConfig('logopen');
    if (result.logopen) {
        $("#showlog").trigger('click');
    }

    result = getConfig('expertMode').expertMode ?? false;

    const expertModeCheckbox = $('input[name="expertModeCheckbox"]');
    expertModeCheckbox.prop('checked', result).trigger('change');

    expertModeCheckbox.on("change", () => {
        const checked = expertModeCheckbox.is(':checked');

        checkSetupAnalytics(function (analyticsService) {
            analyticsService.setDimension(analyticsService.DIMENSIONS.CONFIGURATOR_EXPERT_MODE, checked ? 'On' : 'Off');
        });

        if (FC.FEATURE_CONFIG && FC.FEATURE_CONFIG.features !== 0) {
            updateTabList(FC.FEATURE_CONFIG.features);
        }

        if (GUI.active_tab) {
            TABS[GUI.active_tab]?.expertModeChanged?.(checked);
        }

        setConfig({'expertMode': checked});
    });

    result = getConfig('cliAutoComplete');
    CliAutoComplete.setEnabled(typeof result.cliAutoComplete === "undefined" || result.cliAutoComplete); // On by default

    result = getConfig('darkTheme');
    if (result.darkTheme === undefined || typeof result.darkTheme !== "number") {
        // sets dark theme to auto if not manually changed
        setDarkTheme(2);
    } else {
        setDarkTheme(result.darkTheme);
    }

    if (GUI.isCordova()) {
        let darkMode = false;
        const checkDarkMode = function() {
            cordova.plugins.ThemeDetection.isDarkModeEnabled(function(success) {
                if (success.value !== darkMode) {
                    darkMode = success.value;
                    DarkTheme.autoSet();
                }
            });
        };
        setInterval(checkDarkMode, 500);
    } else {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function() {
            DarkTheme.autoSet();
        });
    }
}

window.isExpertModeEnabled = isExpertModeEnabled;
window.appReady = appReady;
