import $ from 'jquery';
import { i18n } from '../localization';
import GUI, { TABS } from '../gui';
import { get as getConfig, set as setConfig } from '../ConfigStorage';
import { get as getStorage, set as setStorage } from '../SessionStorage';
import BuildApi from '../BuildApi';
import ConfigInserter from "../ConfigInserter.js";
import { tracking } from "../Analytics";
import MspHelper from '../msp/MSPHelper';
import STM32 from '../protocols/stm32';
import FC from '../fc';
import MSP from '../msp';
import MSPCodes from '../msp/MSPCodes';
import PortHandler, { usbDevices } from '../port_handler';
import { API_VERSION_1_39, API_VERSION_1_45 } from '../data_storage';
import serial from '../serial';
import STM32DFU from '../protocols/stm32usbdfu';
import { gui_log } from '../gui_log';
import semver from 'semver';
import { checkChromeRuntimeError, urlExists } from '../utils/common';
import { generateFilename } from '../utils/generate_filename';
import DarkTheme from '../DarkTheme';

const firmware_flasher = {
    targets: null,
    releaseLoader: new BuildApi(),
    localFirmwareLoaded: false,
    selectedBoard: undefined,
    boardNeedsVerification: false,
    allowBoardDetection: true,
    cloudBuildKey: null,
    cloudBuildOptions: null,
    isFlashing: false,
    intel_hex: undefined, // standard intel hex in string format
    parsed_hex: undefined, // parsed raw hex in array format
    isConfigLocal: false, // Set to true if the user loads one locally
    configFilename: null,
    config: {},
    developmentFirmwareLoaded: false, // Is the firmware to be flashed from the development branch?
};

firmware_flasher.initialize = function (callback) {
    const self = this;

    if (GUI.active_tab !== 'firmware_flasher') {
        GUI.active_tab = 'firmware_flasher';
    }

    self.selectedBoard = undefined;

    self.cloudBuildKey = null;
    self.cloudBuildOptions = null;

    self.localFirmwareLoaded = false;
    self.isConfigLocal = false;
    self.intel_hex = undefined;
    self.parsed_hex = undefined;

    function onDocumentLoad() {

        function loadSponsor() {
            if (!navigator.onLine) {
                return;
            }

            self.releaseLoader.loadSponsorTile(DarkTheme.enabled ? 'dark' : 'light',
                (content) => {
                    if (content) {
                        $('div.tab_sponsor').html(content);
                        $('div.tab_sponsor').show();
                    } else {
                        $('div.tab_sponsor').hide();
                    }
                },
            );
        }

        function parseHex(str, callback) {
            // parsing hex in different thread
            const worker = new Worker('./js/workers/hex_parser.js');

            // "callback"
            worker.onmessage = function (event) {
                callback(event.data);
            };

            // send data/string over for processing
            worker.postMessage(str);
        }

        function showLoadedHex(fileName) {
            if (self.localFirmwareLoaded) {
                self.flashingMessage(i18n.getMessage('firmwareFlasherFirmwareLocalLoaded', { filename: fileName, bytes: self.parsed_hex.bytes_total }), self.FLASH_MESSAGE_TYPES.NEUTRAL);
            } else {
                self.flashingMessage(`<a class="save_firmware" href="#" title="Save Firmware">${i18n.getMessage('firmwareFlasherFirmwareOnlineLoaded', { filename: fileName, bytes: self.parsed_hex.bytes_total })}</a>`,
                    self.FLASH_MESSAGE_TYPES.NEUTRAL);
            }
            self.enableFlashButton(true);
        }

        function showReleaseNotes(summary) {
            if (summary.manufacturer) {
                $('div.release_info #manufacturer').text(summary.manufacturer);
                $('div.release_info #manufacturerInfo').show();
            } else {
                $('div.release_info #manufacturerInfo').hide();
            }

            $('div.release_info .target').text(summary.target);
            $('div.release_info .name').text(summary.release).prop('href', summary.releaseUrl);
            $('div.release_info .date').text(summary.date);
            $('div.release_info #targetMCU').text(summary.mcu);
            $('div.release_info .configFilename').text(self.isConfigLocal ? self.configFilename : "[default]");

            if (summary.cloudBuild) {
                $('div.release_info #cloudTargetInfo').show();
                $('div.release_info #cloudTargetLog').text('');
                $('div.release_info #cloudTargetStatus').text('pending');
            } else {
                $('div.release_info #cloudTargetInfo').hide();
            }

            if (self.targets) {
                $('div.release_info').slideDown();
                $('.tab-firmware_flasher .content_wrapper').animate({ scrollTop: $('div.release_info').position().top }, 1000);
            }
        }

        function clearBoardConfig() {
            self.config = {};
            self.isConfigLocal = false;
            self.configFilename = null;
        }

        function setBoardConfig(config, filename) {
            self.config = config.join('\n');
            self.isConfigLocal = filename !== undefined;
            self.configFilename = filename !== undefined ? filename : null;
        }

        function processHex(data, key) {
            self.intel_hex = data;

            parseHex(self.intel_hex, function (data) {
                self.parsed_hex = data;

                if (self.parsed_hex) {
                    tracking.setFirmwareData(tracking.DATA.FIRMWARE_SIZE, self.parsed_hex.bytes_total);
                    showLoadedHex(key);
                } else {
                    self.flashingMessage(i18n.getMessage('firmwareFlasherHexCorrupted'), self.FLASH_MESSAGE_TYPES.INVALID);
                    self.enableFlashButton(false);
                }
            });
        }

        function onLoadSuccess(data, key) {
            self.localFirmwareLoaded = false;

            processHex(data, key);
            self.enableLoadRemoteFileButton(true);
            $("a.load_remote_file").text(i18n.getMessage('firmwareFlasherButtonLoadOnline'));
        }

        function loadTargetList(targets) {
            if (!targets || !navigator.onLine) {
                $('select[name="board"]').empty().append('<option value="0">Offline</option>');
                $('select[name="firmware_version"]').empty().append('<option value="0">Offline</option>');

                return;
            }

            const boards_e = $('select[name="board"]');
            boards_e.empty();
            boards_e.append($(`<option value='0'>${i18n.getMessage("firmwareFlasherOptionLabelSelectBoard")}</option>`));

            const versions_e = $('select[name="firmware_version"]');
            versions_e.empty();
            versions_e.append($(`<option value='0'>${i18n.getMessage("firmwareFlasherOptionLabelSelectFirmwareVersion")}</option>`));

            Object.keys(targets)
                .sort((a,b) => a.target - b.target)
                .forEach(function(target, i) {
                    const descriptor = targets[target];
                    const select_e = $(`<option value='${descriptor.target}'>${descriptor.target}</option>`);
                    boards_e.append(select_e);
                });

            TABS.firmware_flasher.targets = targets;


            // For discussion. Rather remove build configuration and let user use auto-detect. Often I think already had pressed the button.
            $('div.build_configuration').slideUp();
        }

        function buildOptionsList(select_e, options) {
            select_e.empty();
            options.forEach((option) => {
                if (option.default) {
                    select_e.append($(`<option value='${option.value}' selected>${option.name}</option>`));
                } else {
                    select_e.append($(`<option value='${option.value}'>${option.name}</option>`));
                }
            });
        }

        function buildOptions(data) {
            if (!navigator.onLine) {
                return;
            }

            buildOptionsList($('select[name="radioProtocols"]'), data.radioProtocols);
            buildOptionsList($('select[name="telemetryProtocols"]'), data.telemetryProtocols);
            buildOptionsList($('select[name="options"]'), data.generalOptions);
            buildOptionsList($('select[name="motorProtocols"]'), data.motorProtocols);

            if (!self.validateBuildKey()) {
                preselectRadioProtocolFromStorage();
            }
        }

        function preselectRadioProtocolFromStorage() {
            const storedRadioProtocol = getConfig("ffRadioProtocol").ffRadioProtocol;
            if (storedRadioProtocol) {
                const valueExistsInSelect = $('select[name="radioProtocols"] option').filter(function (i, o) {return o.value === storedRadioProtocol;}).length !== 0;
                if (valueExistsInSelect) {
                    $('select[name="radioProtocols"]').val(storedRadioProtocol);
                }
            }
        }

        let buildTypesToShow;
        const buildType_e = $('select[name="build_type"]');
        function buildBuildTypeOptionsList() {
            buildType_e.empty();
            buildTypesToShow.forEach(({ tag, title }, index) => {
                buildType_e.append($(`<option value='${index}'>${tag ? i18n.getMessage(tag) : title}</option>`));
            });
        }

        const buildTypes = [
            {
                tag: 'firmwareFlasherOptionLabelBuildTypeRelease',
            },
            {
                tag: 'firmwareFlasherOptionLabelBuildTypeReleaseCandidate',
            },
            {
                tag: "firmwareFlasherOptionLabelBuildTypeDevelopment",
            },
        ];

        function showOrHideBuildTypes() {
            const showExtraReleases = $(this).is(':checked');

            if (showExtraReleases) {
                $('tr.build_type').show();
            } else {
                $('tr.build_type').hide();
                buildType_e.val(0).trigger('change');
            }
        }

        function showOrHideExpertMode() {
            const expertModeChecked = $(this).is(':checked');

            if (expertModeChecked) {
                buildTypesToShow = buildTypes;
            } else {
                buildTypesToShow = buildTypes.slice(0,2);
            }

            buildBuildTypeOptionsList();
            buildType_e.val(0).trigger('change');

            setTimeout(() => {
                $('tr.expertOptions').toggle(expertModeChecked);
                $('div.expertOptions').toggle(expertModeChecked);
            }, 0);

            setConfig({'expertMode': expertModeChecked});
        }

        const expertMode_e = $('.tab-firmware_flasher input.expert_mode');
        const expertMode = getConfig('expertMode').expertMode;

        expertMode_e.prop('checked', expertMode);
        expertMode_e.on('change', showOrHideExpertMode).trigger('change');

        $('input.show_development_releases').change(showOrHideBuildTypes).change();

        // translate to user-selected language
        i18n.localizePage();

        loadSponsor();

        buildType_e.on('change', function() {
            self.enableLoadRemoteFileButton(false);

            tracking.setFirmwareData(tracking.DATA.FIRMWARE_CHANNEL, $('option:selected', this).text());

            const build_type = buildType_e.val();

            $('select[name="board"]').empty()
            .append($(`<option value='0'>${i18n.getMessage("firmwareFlasherOptionLoading")}</option>`));

            $('select[name="firmware_version"]').empty()
            .append($(`<option value='0'>${i18n.getMessage("firmwareFlasherOptionLoading")}</option>`));

            if (!GUI.connect_lock) {
                try {
                    self.releaseLoader.loadTargets(loadTargetList);
                } catch (err) {
                    console.error(err);
                }
            }

            setConfig({'selected_build_type': build_type});
        });

        function selectFirmware(release) {
            $('div.build_configuration').slideUp();
            $('div.release_info').slideUp();

            if (!self.localFirmwareLoaded) {
                self.enableFlashButton(false);
                self.flashingMessage(i18n.getMessage('firmwareFlasherLoadFirmwareFile'), self.FLASH_MESSAGE_TYPES.NEUTRAL);
                if (self.parsed_hex && self.parsed_hex.bytes_total) {
                    // Changing the board triggers a version change, so we need only dump it here.
                    console.log('throw out loaded hex');
                    self.intel_hex = undefined;
                    self.parsed_hex = undefined;
                }
            }

            const target = $('select[name="board"] option:selected').val();

            function onTargetDetail(response) {
                self.targetDetail = response;

                if (response.cloudBuild === true) {
                    $('div.build_configuration').slideDown();

                    const expertMode = expertMode_e.is(':checked');
                    if (expertMode) {
                        if (response.releaseType === 'Unstable') {
                            self.releaseLoader.loadCommits(response.release, (commits) => {
                                const select_e = $('select[name="commits"]');
                                select_e.empty();
                                commits.forEach((commit) => {
                                    select_e.append($(`<option value='${commit.sha}'>${commit.message}</option>`));
                                });
                            });

                            $('div.commitSelection').show();
                        } else {
                            $('div.commitSelection').hide();
                        }
                    }

                    $('div.expertOptions').toggle(expertMode);
                }

                if (response.configuration && !self.isConfigLocal) {
                    setBoardConfig(response.configuration);
                }

                self.enableLoadRemoteFileButton(true);
            }

            self.releaseLoader.loadTarget(target, release, onTargetDetail);

            if (self.validateBuildKey() && navigator.onLine) {
                self.releaseLoader.loadOptionsByBuildKey(release, self.cloudBuildKey, buildOptions);
            } else {
                self.releaseLoader.loadOptions(release, buildOptions);
            }
        }

        function populateReleases(versions_element, target) {
            const sortReleases = function (a, b) {
                return -semver.compareBuild(a.release, b.release);
            };

            versions_element.empty();
            const releases = target.releases;
            if (releases.length > 0) {
                versions_element.append(
                    $(
                        `<option value='0'>${i18n.getMessage(
                            "firmwareFlasherOptionLabelSelectFirmwareVersionFor",
                        )} ${target.target}</option>`,
                    ),
                );

                const build_type = $('select[name="build_type"]').val();

                releases
                    .sort(sortReleases)
                    .filter(r => {
                        return (r.type === 'Unstable' && build_type > 1) ||
                               (r.type === 'ReleaseCandidate' && build_type > 0) ||
                               (r.type === 'Stable');
                    })
                    .forEach(function(release) {
                        const releaseName = release.release;

                        const select_e = $(`<option value='${releaseName}'>${releaseName} [${release.label}]</option>`);
                        const summary = `${target}/${release}`;
                        select_e.data('summary', summary);
                        versions_element.append(select_e);
                    });

                // Assume flashing latest, so default to it.
                versions_element.prop("selectedIndex", 1);
                selectFirmware(versions_element.val());
            }
        }

        function clearBufferedFirmware() {
            clearBoardConfig();
            self.intel_hex = undefined;
            self.parsed_hex = undefined;
            self.localFirmwareLoaded = false;
        }

        $('select[name="board"]').select2();
        $('select[name="radioProtocols"]').select2();
        $('select[name="telemetryProtocols"]').select2();
        $('select[name="motorProtocols"]').select2();
        $('select[name="options"]').select2({ tags: false, closeOnSelect: false });
        $('select[name="commits"]').select2({ tags: true });

        $('select[name="options"]')
        .on('select2:opening', function() {
            const searchfield = $(this).parent().find('.select2-search__field');
            searchfield.prop('disabled', false);
        })
        .on('select2:closing', function() {
            const searchfield = $(this).parent().find('.select2-search__field');
            searchfield.prop('disabled', true);
        });

        $('select[name="radioProtocols"]').on("select2:select", function() {
            const selectedProtocol = $('select[name="radioProtocols"] option:selected').first().val();
            if (selectedProtocol) {
                setConfig({"ffRadioProtocol" : selectedProtocol});
            }
        });

        $('select[name="board"]').on('change', function() {
            self.enableLoadRemoteFileButton(false);
            let target = $(this).val();

            // exception for board flashed with local custom firmware
            if (target === null) {
                target = '0';
                $(this).val(target).trigger('change');
            }

            if (!GUI.connect_lock) {
                self.selectedBoard = target;
                console.log('board changed to', target);

                self.flashingMessage(i18n.getMessage('firmwareFlasherLoadFirmwareFile'), self.FLASH_MESSAGE_TYPES.NEUTRAL)
                    .flashProgress(0);

                $('div.release_info').slideUp();
                $('div.build_configuration').slideUp();

                if (!self.localFirmwareLoaded) {
                    self.enableFlashButton(false);
                }

                const versions_e = $('select[name="firmware_version"]');
                if (target === '0') {
                    // target is 0 is the "Choose a Board" option. Throw out anything loaded
                    clearBufferedFirmware();

                    versions_e.empty();
                    versions_e.append(
                        $(
                            `<option value='0'>${i18n.getMessage(
                                "firmwareFlasherOptionLabelSelectFirmwareVersion",
                            )}</option>`,
                        ),
                    );
                } else {
                    // Show a loading message as there is a delay in loading a configuration
                    versions_e.empty();
                    versions_e.append(
                        $(
                            `<option value='0'>${i18n.getMessage(
                                "firmwareFlasherOptionLoading",
                            )}</option>`,
                        ),
                    );

                    self.releaseLoader.loadTargetReleases(target, (data) => populateReleases(versions_e, data));
                }
            }
        });
        // when any of the select2 elements is opened, force a focus on that element's search box
        const select2Elements = [
            'select[name="board"]',
            'select[name="radioProtocols"]',
            'select[name="telemetryProtocols"]',
            'select[name="motorProtocols"]',
            'select[name="options"]',
            'select[name="commits"]',
        ];

        $(document).on('select2:open', select2Elements.join(','), () => {
            const allFound = document.querySelectorAll('.select2-container--open .select2-search__field');
            $(this).one('mouseup keyup', () => {
                setTimeout(() => {
                    allFound[allFound.length - 1].focus();
                }, 0);
            });
        });

        function cleanUnifiedConfigFile(input) {
            let output = [];
            let inComment = false;
            for (let i = 0; i < input.length; i++) {
                if (input.charAt(i) === "\n" || input.charAt(i) === "\r") {
                    inComment = false;
                }

                if (input.charAt(i) === "#") {
                    inComment = true;
                }

                if (!inComment && input.charCodeAt(i) > 255) {
                    self.flashingMessage(i18n.getMessage('firmwareFlasherConfigCorrupted'), self.FLASH_MESSAGE_TYPES.INVALID);
                    gui_log(i18n.getMessage('firmwareFlasherConfigCorruptedLogMessage'));
                    return null;
                }

                if (input.charCodeAt(i) > 255) {
                    output.push('_');
                } else {
                    output.push(input.charAt(i));
                }
            }
            return output.join('').split('\n');
        }

        const portPickerElement = $('div#port-picker #port');

        function flashFirmware(firmware) {
            const options = {};

            let eraseAll = false;
            if ($('input.erase_chip').is(':checked') || expertMode_e.is(':not(:checked)')) {
                options.erase_chip = true;

                eraseAll = true;
            }
            tracking.setFirmwareData(tracking.DATA.FIRMWARE_ERASE_ALL, eraseAll.toString());

            if (!$('option:selected', portPickerElement).data().isDFU) {
                if (String(portPickerElement.val()) !== '0') {
                    const port = String(portPickerElement.val());

                    if ($('input.updating').is(':checked')) {
                        options.no_reboot = true;
                    } else {
                        options.reboot_baud = parseInt($('div#port-picker #baud').val());
                    }

                    let baud = 115200;
                    if ($('input.flash_manual_baud').is(':checked')) {
                        baud = parseInt($('#flash_manual_baud_rate').val());
                    }

                    tracking.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, 'Flashing', self.fileName || null);

                    STM32.connect(port, baud, firmware, options);
                } else {
                    console.log('Please select valid serial port');
                    gui_log(i18n.getMessage('firmwareFlasherNoValidPort'));
                }
            } else {
                tracking.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, 'Flashing', self.fileName || null);

                STM32DFU.connect(usbDevices, firmware, options);
            }

            self.isFlashing = false;
        }

        let result = getConfig('erase_chip');
        if (result.erase_chip) {
            $('input.erase_chip').prop('checked', true);
        } else {
            $('input.erase_chip').prop('checked', false);
        }

        $('input.erase_chip').change(function () {
            setConfig({'erase_chip': $(this).is(':checked')});
        }).change();

        result = getConfig('show_development_releases');
        $('input.show_development_releases')
        .prop('checked', result.show_development_releases)
        .change(function () {
            setConfig({'show_development_releases': $(this).is(':checked')});
        }).change();

        result = getConfig('selected_build_type');
        // ensure default build type is selected
        buildType_e.val(result.selected_build_type || 0).trigger('change');

        result = getConfig('no_reboot_sequence');
        if (result.no_reboot_sequence) {
            $('input.updating').prop('checked', true);
            $('.flash_on_connect_wrapper').show();
        } else {
            $('input.updating').prop('checked', false);
        }

        // bind UI hook so the status is saved on change
        $('input.updating').change(function() {
            const status = $(this).is(':checked');

            if (status) {
                $('.flash_on_connect_wrapper').show();
            } else {
                $('input.flash_on_connect').prop('checked', false).change();
                $('.flash_on_connect_wrapper').hide();
            }

            setConfig({'no_reboot_sequence': status});
        });

        $('input.updating').change();

        result = getConfig('flash_manual_baud');
        if (result.flash_manual_baud) {
            $('input.flash_manual_baud').prop('checked', true);
        } else {
            $('input.flash_manual_baud').prop('checked', false);
        }

        $('input.corebuild_mode').change(function () {
            const status = $(this).is(':checked');

            $('.hide-in-core-build-mode').toggle(!status);
            $('div.expertOptions').toggle(!status && expertMode_e.is(':checked'));
        });
        $('input.corebuild_mode').change();

        // bind UI hook so the status is saved on change
        $('input.flash_manual_baud').change(function() {
            const status = $(this).is(':checked');
            setConfig({'flash_manual_baud': status});
        });

        $('input.flash_manual_baud').change();

        result = getConfig('flash_manual_baud_rate');
        $('#flash_manual_baud_rate').val(result.flash_manual_baud_rate);

        // bind UI hook so the status is saved on change
        $('#flash_manual_baud_rate').change(function() {
            const baud = parseInt($('#flash_manual_baud_rate').val());
            setConfig({'flash_manual_baud_rate': baud});
        });

        $('input.flash_manual_baud_rate').change();

        // UI Hooks
        $('a.load_file').on('click', function () {
            self.enableFlashButton(false);
            self.developmentFirmwareLoaded = false;

            tracking.setFirmwareData(tracking.DATA.FIRMWARE_CHANNEL, undefined);
            tracking.setFirmwareData(tracking.DATA.FIRMWARE_SOURCE, 'file');

            chrome.fileSystem.chooseEntry({
                type: 'openFile',
                accepts: [
                    {
                        description: 'target files',
                        extensions: ['hex', 'config'],
                    },
                ],
            }, function (fileEntry) {
                if (checkChromeRuntimeError()) {
                    return;
                }

                $('div.build_configuration').slideUp();

                chrome.fileSystem.getDisplayPath(fileEntry, function (path) {
                    console.log('Loading file from:', path);

                    fileEntry.file(function (file) {
                        tracking.setFirmwareData(tracking.DATA.FIRMWARE_NAME, file.name);
                        const reader = new FileReader();

                        reader.onloadend = function(e) {
                            if (e.total !== 0 && e.total === e.loaded) {
                                console.log(`File loaded (${e.loaded})`);

                                if (file.name.split('.').pop() === "hex") {
                                    self.intel_hex = e.target.result;

                                    parseHex(self.intel_hex, function (data) {
                                        self.parsed_hex = data;

                                        if (self.parsed_hex) {
                                            tracking.setFirmwareData(tracking.DATA.FIRMWARE_SIZE, self.parsed_hex.bytes_total);
                                            self.localFirmwareLoaded = true;

                                            showLoadedHex(file.name);
                                        } else {
                                            self.flashingMessage(i18n.getMessage('firmwareFlasherHexCorrupted'), self.FLASH_MESSAGE_TYPES.INVALID);
                                        }
                                    });
                                } else {
                                    clearBufferedFirmware();

                                    let config = cleanUnifiedConfigFile(e.target.result);
                                    if (config !== null) {
                                        setBoardConfig(config, file.name);

                                        if (self.isConfigLocal && !self.parsed_hex) {
                                            self.flashingMessage(i18n.getMessage('firmwareFlasherLoadedConfig'), self.FLASH_MESSAGE_TYPES.NEUTRAL);
                                        }

                                        if ((self.isConfigLocal && self.parsed_hex && !self.localFirmwareLoaded) || self.localFirmwareLoaded) {
                                            self.enableFlashButton(true);
                                            self.flashingMessage(i18n.getMessage('firmwareFlasherFirmwareLocalLoaded', self.parsed_hex.bytes_total), self.FLASH_MESSAGE_TYPES.NEUTRAL);
                                        }
                                    }
                                }
                            }
                        };

                        reader.readAsText(file);
                    });
                });
            });
        });

        /**
         * Lock / Unlock the firmware download button according to the firmware selection dropdown.
         */
        $('select[name="firmware_version"]').change((evt) => {
                selectFirmware($("option:selected", evt.target).val());
            },
        );

        $('a.load_remote_file').on('click', function (evt) {
            if (!self.selectedBoard) {
                return;
            }

            self.enableLoadRemoteFileButton(false);

            self.localFirmwareLoaded = false;
            self.developmentFirmwareLoaded = buildTypesToShow[$('select[name="build_type"]').val()].tag === 'firmwareFlasherOptionLabelBuildTypeDevelopment';

            tracking.setFirmwareData(tracking.DATA.FIRMWARE_SOURCE, 'http');

            if ($('select[name="firmware_version"]').val() === "0") {
                gui_log(i18n.getMessage('firmwareFlasherNoFirmwareSelected'));
                return;
            }

            function onLoadFailed() {
                $('span.progressLabel').attr('i18n','firmwareFlasherFailedToLoadOnlineFirmware').removeClass('i18n-replaced');
                self.enableLoadRemoteFileButton(true);
                $("a.load_remote_file").text(i18n.getMessage('firmwareFlasherButtonLoadOnline'));
                i18n.localizePage();
            }

            function updateStatus(status, key, val, showLog) {
                if (showLog === true) {
                    $('div.release_info #cloudTargetLog').text(i18n.getMessage(`firmwareFlasherCloudBuildLogUrl`)).prop('href', `https://build.betaflight.com/api/builds/${key}/log`);
                }
                $('div.release_info #cloudTargetStatus').text(i18n.getMessage(`firmwareFlasherCloudBuild${status}`));
                $('.buildProgress').val(val);
            }

            function processBuildStatus(response, statusResponse, retries) {
                if (statusResponse.status === 'success') {
                    updateStatus(retries <= 0 ? 'SuccessCached' : "Success", response.key, 100, true);
                    if (statusResponse.configuration !== undefined && !self.isConfigLocal) {
                        setBoardConfig(statusResponse.configuration);
                    }
                    self.releaseLoader.loadTargetHex(response.url, (hex) => onLoadSuccess(hex, response.file), onLoadFailed);
                } else {
                    updateStatus(retries > 10 ? 'TimedOut' : "Failed", response.key, 0, true);
                    onLoadFailed();
                }
            }

            function requestCloudBuild(targetDetail) {
                let request = {
                    target: targetDetail.target,
                    release: targetDetail.release,
                    options: [],
                };

                const coreBuild = (targetDetail.cloudBuild !== true) || $('input[name="coreBuildModeCheckbox"]').is(':checked');
                if (coreBuild === true) {
                    request.options.push("CORE_BUILD");
                } else {
                    request.options.push("CLOUD_BUILD");
                    $('select[name="radioProtocols"] option:selected').each(function () {
                        request.options.push($(this).val());
                    });

                    $('select[name="telemetryProtocols"] option:selected').each(function () {
                        request.options.push($(this).val());
                    });

                    $('select[name="options"] option:selected').each(function () {
                        request.options.push($(this).val());
                    });

                    $('select[name="motorProtocols"] option:selected').each(function () {
                        request.options.push($(this).val());
                    });

                    if ($('input[name="expertModeCheckbox"]').is(':checked')) {
                        if (targetDetail.releaseType === "Unstable") {
                            request.commit = $('select[name="commits"] option:selected').val();
                        }

                        $('input[name="customDefines"]').val().split(' ').map(element => element.trim()).forEach(v => {
                            request.options.push(v);
                        });
                    }
                }

                console.info("Build request:", request);
                self.releaseLoader.requestBuild(request, (response) => {
                    console.info("Build response:", response);

                    // Complete the summary object to be used later
                    self.targetDetail.file = response.file;

                    if (!targetDetail.cloudBuild) {
                        // it is a previous release, so simply load the hex
                        self.releaseLoader.loadTargetHex(response.url, (hex) => onLoadSuccess(hex, response.file), onLoadFailed);
                        return;
                    }

                    tracking.setFirmwareData(tracking.DATA.FIRMWARE_NAME, response.file);

                    updateStatus('Pending', response.key, 0, false);

                    let retries = 1;
                    self.releaseLoader.requestBuildStatus(response.key, (statusResponse) => {
                        if (statusResponse.status !== "queued") {
                            // will be cached already, no need to wait.
                            processBuildStatus(response, statusResponse, 0);
                            return;
                        }

                        const timer = setInterval(() => {
                            self.releaseLoader.requestBuildStatus(response.key, (statusResponse) => {
                                if (statusResponse.status !== 'queued' || retries > 10) {
                                    clearInterval(timer);
                                    processBuildStatus(response, statusResponse, retries);
                                    return;
                                }

                                updateStatus('Processing', response.key, retries * 10, false);
                                retries++;
                            });
                        }, 5000);
                    });
                }, onLoadFailed);
            }

            if (self.targetDetail) { // undefined while list is loading or while running offline
                $("a.load_remote_file").text(i18n.getMessage('firmwareFlasherButtonDownloading'));
                self.enableLoadRemoteFileButton(false);

                showReleaseNotes(self.targetDetail);

                requestCloudBuild(self.targetDetail);
            } else {
                $('span.progressLabel').attr('i18n','firmwareFlasherFailedToLoadOnlineFirmware').removeClass('i18n-replaced');
                i18n.localizePage();
            }
        });

        const exitDfuElement = $('a.exit_dfu');

        exitDfuElement.on('click', function () {
            self.enableDfuExitButton(false);

            if (!GUI.connect_lock) { // button disabled while flashing is in progress
                tracking.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, 'ExitDfu', null);
                try {
                    console.log('Closing DFU');
                    STM32DFU.connect(usbDevices, self.parsed_hex, { exitDfu: true });
                } catch (e) {
                    console.log(`Exiting DFU failed: ${e.message}`);
                }
            }
        });

        portPickerElement.on('change', function () {
            if (GUI.active_tab === 'firmware_flasher') {
                if (!GUI.connect_lock) {
                    if ($('option:selected', this).data().isDFU) {
                        self.enableDfuExitButton(true);
                    } else {
                        if (!self.isFlashing) {
                            // Porthandler resets board on port detect
                            if (self.boardNeedsVerification) {
                                // reset to prevent multiple calls
                                self.boardNeedsVerification = false;
                                self.verifyBoard();
                            }
                            if (self.selectedBoard) {
                                self.enableLoadRemoteFileButton(true);
                                self.enableLoadFileButton(true);
                            }
                        }
                        self.enableDfuExitButton(false);
                    }
                }
                self.updateDetectBoardButton();
            }
        }).trigger('change');

        const targetSupportInfo = $('#targetSupportInfoUrl');

        targetSupportInfo.on('click', function() {
            let urlSupport = 'https://betaflight.com/docs/wiki/boards/missing';                 // general board missing
            const urlBoard = `https://betaflight.com/docs/wiki/boards/${self.selectedBoard}`;   // board description
            if (urlExists(urlBoard)) {
                urlSupport = urlBoard;
            }
            targetSupportInfo.attr("href", urlSupport);
        });

        const detectBoardElement = $('a.detect-board');

        detectBoardElement.on('click', () => {
            detectBoardElement.addClass('disabled');

            self.verifyBoard();
            setTimeout(() => detectBoardElement.removeClass('disabled'), 1000);
        });

        $('a.flash_firmware').on('click', function () {
            self.isFlashing = true;

            self.enableFlashButton(false);
            self.enableDfuExitButton(false);
            self.enableLoadRemoteFileButton(false);
            self.enableLoadFileButton(false);

            function initiateFlashing() {
                if (self.developmentFirmwareLoaded) {
                    checkShowAcknowledgementDialog();
                } else {
                    startFlashing();
                }
            }

            // Backup not available in DFU, manual or virtual mode.
            if (self.isSerialPortAvailable()) {
                GUI.showYesNoDialog(
                    {
                        title: i18n.getMessage('firmwareFlasherRemindBackupTitle'),
                        text: i18n.getMessage('firmwareFlasherRemindBackup'),
                        buttonYesText: i18n.getMessage('firmwareFlasherBackup'),
                        buttonNoText: i18n.getMessage('firmwareFlasherBackupIgnore'),
                        buttonYesCallback: () => firmware_flasher.backupConfig(initiateFlashing),
                        buttonNoCallback: initiateFlashing,
                    },
                );
            } else {
                initiateFlashing();
            }
        });

        function checkShowAcknowledgementDialog() {
            const DAY_MS = 86400 * 1000;
            const storageTag = 'lastDevelopmentWarningTimestamp';

            function setAcknowledgementTimestamp() {
                const storageObj = {};
                storageObj[storageTag] = Date.now();
                setStorage(storageObj);
            }

            result = getStorage(storageTag);
            if (!result[storageTag] || Date.now() - result[storageTag] > DAY_MS) {

                showAcknowledgementDialog(setAcknowledgementTimestamp);
            } else {
                startFlashing();
            }
        }

        function showAcknowledgementDialog(acknowledgementCallback) {
            const dialog = $('#dialogUnstableFirmwareAcknowledgement')[0];
            const flashButtonElement = $('#dialogUnstableFirmwareAcknowledgement-flashbtn');
            const acknowledgeCheckboxElement = $('input[name="dialogUnstableFirmwareAcknowledgement-acknowledge"]');

            acknowledgeCheckboxElement.change(function () {
                if ($(this).is(':checked')) {
                    flashButtonElement.removeClass('disabled');
                } else {
                    flashButtonElement.addClass('disabled');
                }
            });

            flashButtonElement.click(function() {
                dialog.close();

                if (acknowledgeCheckboxElement.is(':checked')) {
                    if (acknowledgementCallback) {
                        acknowledgementCallback();
                    }

                    startFlashing();
                }
            });

            $('#dialogUnstableFirmwareAcknowledgement-cancelbtn').click(function() {
                dialog.close();
            });

            dialog.addEventListener('close', function () {
                acknowledgeCheckboxElement.prop('checked', false).change();
            });

            dialog.showModal();
        }

        function startFlashing() {
            if (!GUI.connect_lock) { // button disabled while flashing is in progress
                if (self.parsed_hex) {
                    try {
                        if (self.config && !self.parsed_hex.configInserted) {
                            const configInserter = new ConfigInserter();

                            if (configInserter.insertConfig(self.parsed_hex, self.config)) {
                                self.parsed_hex.configInserted = true;
                            } else {
                                console.log('Firmware does not support custom defaults.');
                                clearBoardConfig();
                            }
                        }

                        flashFirmware(self.parsed_hex);
                    } catch (e) {
                        console.log(`Flashing failed: ${e.message}`);
                    }
                } else {
                    $('span.progressLabel').attr('i18n','firmwareFlasherFirmwareNotLoaded').removeClass('i18n-replaced');
                    i18n.localizePage();
                }
            }
        }

        $('span.progressLabel').on('click', 'a.save_firmware', function () {
            chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: self.targetDetail.file, accepts: [{description: 'HEX files', extensions: ['hex']}]}, function (fileEntry) {
                if (checkChromeRuntimeError()) {
                    return;
                }

                chrome.fileSystem.getDisplayPath(fileEntry, function (path) {
                    console.log('Saving firmware to:', path);

                    // check if file is writable
                    chrome.fileSystem.isWritableEntry(fileEntry, function (isWritable) {
                        if (isWritable) {
                            const blob = new Blob([self.intel_hex], {type: 'text/plain'});

                            fileEntry.createWriter(function (writer) {
                                let truncated = false;

                                writer.onerror = function (e) {
                                    console.error(e);
                                };

                                writer.onwriteend = function() {
                                    if (!truncated) {
                                        // onwriteend will be fired again when truncation is finished
                                        truncated = true;
                                        writer.truncate(blob.size);

                                        return;
                                    }

                                    tracking.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, 'SaveFirmware', path);
                                };

                                writer.write(blob);
                            }, function (e) {
                                console.error(e);
                            });
                        } else {
                            console.log('You don\'t have write permissions for this file, sorry.');
                            gui_log(i18n.getMessage('firmwareFlasherWritePermissions'));
                        }
                    });
                });
            });
        });

        $('input.flash_on_connect').change(function () {
            const status = $(this).is(':checked');

            if (status) {
                const catch_new_port = function () {
                    PortHandler.port_detected('flash_detected_device', function (resultPort) {
                        const port = resultPort[0];

                        if (!GUI.connect_lock) {
                            gui_log(i18n.getMessage('firmwareFlasherFlashTrigger', [port]));
                            console.log(`Detected: ${port} - triggering flash on connect`);

                            // Trigger regular Flashing sequence
                            GUI.timeout_add('initialization_timeout', function () {
                                $('a.flash_firmware').click();
                            }, 100); // timeout so bus have time to initialize after being detected by the system
                        } else {
                            gui_log(i18n.getMessage('firmwareFlasherPreviousDevice', [port]));
                        }

                        // Since current port_detected request was consumed, create new one
                        catch_new_port();
                    }, false, true);
                };

                catch_new_port();
            } else {
                PortHandler.flush_callbacks();
            }
        }).change();

        $(document).keypress(function (e) {
            if (e.which === 13) { // enter
                // Trigger regular Flashing sequence
                $('a.flash_firmware').click();
            }
        });

        self.flashingMessage(i18n.getMessage('firmwareFlasherLoadFirmwareFile'), self.FLASH_MESSAGE_TYPES.NEUTRAL);

        GUI.content_ready(callback);
    }

    self.releaseLoader.loadTargets(() => {
       $('#content').load("./tabs/firmware_flasher.html", onDocumentLoad);
    });
};


// Helper functions


firmware_flasher.isSerialPortAvailable = function() {
    const selected_port = $('div#port-picker #port option:selected');
    const isBusy = GUI.connect_lock;
    const isDfu = PortHandler.dfu_available;
    const isManual = selected_port.data().isManual || false;
    const isVirtual = selected_port.data().isVirtual || false;

    return !isDfu && !isManual && !isVirtual && !isBusy;
};

firmware_flasher.updateDetectBoardButton = function() {
    $('a.detect-board').toggleClass('disabled', !this.isSerialPortAvailable());
};

firmware_flasher.validateBuildKey = function() {
    return this.cloudBuildKey.length === 32;
};

/**
 *
 *    Auto-detect board and set the dropdown to the correct value
 */

firmware_flasher.verifyBoard = function() {
    const self = this;

    if (!self.isSerialPortAvailable()) {
        gui_log(i18n.getMessage('firmwareFlasherNoValidPort'));
        return;
    }

    function onClose(success) {
        if (!success) {
            gui_log(i18n.getMessage('firmwareFlasherBoardVerificationFail'));
        }

        serial.disconnect(function () {
            MSP.clearListeners();
            MSP.disconnect_cleanup();
        });
    }

    function onFinish() {
        const board = FC.CONFIG.boardName;
        const boardSelect = $('select[name="board"]');
        const boardSelectOptions = $('select[name="board"] option');
        const target = boardSelect.val();
        let targetAvailable = false;

        if (board) {
            boardSelectOptions.each((_, e) => {
                if ($(e).text() === board) {
                    targetAvailable = true;
                }
            });

            if (board !== target) {
                boardSelect.val(board).trigger('change');
            }

            gui_log(i18n.getMessage(targetAvailable ? 'firmwareFlasherBoardVerificationSuccess' : 'firmwareFlasherBoardVerficationTargetNotAvailable',
                { boardName: board }));
            onClose(true);
        } else {
            onClose(false);
        }
    }

    function requestBoardInformation(onSucces, onFail) {
        MSP.send_message(MSPCodes.MSP_API_VERSION, false, false, () => {
            gui_log(i18n.getMessage('apiVersionReceived', FC.CONFIG.apiVersion));

            if (FC.CONFIG.apiVersion.includes('null') || semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_39)) {
                onFail(); // not supported
            } else {
                MSP.send_message(MSPCodes.MSP_FC_VARIANT, false, false, onSucces);
            }
        });
    }

    function getBoardInfo() {
        MSP.send_message(MSPCodes.MSP_BOARD_INFO, false, false, onFinish);
    }

    function getCloudBuildOptions(options) {
        // Do not use FC.CONFIG.buildOptions here as the object gets destroyed.
        self.cloudBuildOptions = options.Request.Options;

        getBoardInfo();
    }

    function getBuildInfo() {
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) && navigator.onLine && FC.CONFIG.flightControllerIdentifier === 'BTFL') {
            MSP.send_message(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.BUILD_KEY), false, () => {
                MSP.send_message(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.CRAFT_NAME), false, () => {
                    // store FC.CONFIG.buildKey as the object gets destroyed after disconnect
                    self.cloudBuildKey = FC.CONFIG.buildKey;

                    if (self.validateBuildKey()) {
                        self.releaseLoader.requestBuildOptions(self.cloudBuildKey, getCloudBuildOptions, getBoardInfo);
                    } else {
                        getBoardInfo();
                    }
                });
            });
        } else {
            getBoardInfo();
        }
    }

    function onConnect(openInfo) {
        if (openInfo) {
            serial.onReceive.addListener(data => MSP.read(data));
            mspHelper = new MspHelper();
            MSP.listen(mspHelper.process_data.bind(mspHelper));
            requestBoardInformation(getBuildInfo, onClose);
        } else {
            gui_log(i18n.getMessage('serialPortOpenFail'));
        }
    }

    let mspHelper;
    const port = String($('div#port-picker #port').val());
    const baud = $('input.flash_manual_baud').is(':checked') ? parseInt($('#flash_manual_baud_rate').val()) : 115200;
    const isLoaded = self.targets ? Object.keys(self.targets).length > 0 : false;

    if (!isLoaded) {
        console.log('Releases not loaded yet');
        gui_log(i18n.getMessage('firmwareFlasherNoTargetsLoaded'));
        return;
    }

    if (!(serial.connected || serial.connectionId)) {
        gui_log(i18n.getMessage('firmwareFlasherDetectBoardQuery'));
        serial.connect(port, {bitrate: baud}, onConnect);
    } else {
        console.warn('Attempting to connect while there still is a connection', serial.connected, serial.connectionId, serial.openCanceled);
    }
};

firmware_flasher.getPort = function () {
    return String($('div#port-picker #port').val());
};

/**
 *
 * Bacup the current configuration to a file before flashing in serial mode
 */

firmware_flasher.backupConfig = function (callback) {
    let mspHelper;
    let cliBuffer = '';
    let catchOutputCallback = null;

    function readOutput(callback) {
        catchOutputCallback = callback;
    }

    function writeOutput(text) {
        if (catchOutputCallback) {
            catchOutputCallback(text);
        }
    }

    function readSerial(readInfo) {
        const data = new Uint8Array(readInfo.data);

        for (const charCode of data) {
            const currentChar = String.fromCharCode(charCode);

            switch (charCode) {
                case 10:
                    if (GUI.operating_system === "Windows") {
                        writeOutput(cliBuffer);
                        cliBuffer = '';
                    }
                    break;
                case 13:
                    if (GUI.operating_system !== "Windows") {
                        writeOutput(cliBuffer);
                        cliBuffer = '';
                    }
                    break;
                default:
                    cliBuffer += currentChar;
            }
        }
    }

    function activateCliMode() {
        return new Promise(resolve => {
            const bufferOut = new ArrayBuffer(1);
            const bufView = new Uint8Array(bufferOut);

            cliBuffer = '';
            bufView[0] = 0x23;

            serial.send(bufferOut);

            GUI.timeout_add('enter_cli_mode_done', () => {
                resolve();
            }, 500);
        });
    }

    function sendSerial(line, callback) {
        const bufferOut = new ArrayBuffer(line.length);
        const bufView = new Uint8Array(bufferOut);

        for (let cKey = 0; cKey < line.length; cKey++) {
            bufView[cKey] = line.charCodeAt(cKey);
        }

        serial.send(bufferOut, callback);
    }

    function sendCommand(line, callback) {
        sendSerial(`${line}\n`, callback);
    }

    function readCommand() {
        let timeStamp = performance.now();
        const output = [];
        const commandInterval = "COMMAND_INTERVAL";

        readOutput(str => {
            timeStamp = performance.now();
            output.push(str);
        });

        sendCommand("diff all defaults");

        return new Promise(resolve => {
            GUI.interval_add(commandInterval, () => {
                const currentTime = performance.now();
                if (currentTime - timeStamp > 500) {
                    catchOutputCallback = null;
                    GUI.interval_remove(commandInterval);
                    resolve(output);
                }
            }, 500, false);
        });
    }

    function onFinishClose() {
        MSP.clearListeners();

        // Include timeout in count
        let count = 15;
        // Allow reboot after CLI exit
        const waitOnReboot = () => {
            const disconnect = setInterval(function() {
                if (PortHandler.port_available) {
                    console.log(`Connection ready for flashing in ${count / 10} seconds`);
                    clearInterval(disconnect);
                    callback();
                }
                count++;
            }, 100);
        };

        // PortHandler has a 500ms timer - so triple for safety
        setTimeout(waitOnReboot, 1500);
    }

    function onClose() {
        serial.disconnect(onFinishClose);
        MSP.disconnect_cleanup();
    }

    function onSaveConfig() {
        // Prevent auto-detect after CLI reset
        TABS.firmware_flasher.allowBoardDetection = false;

        activateCliMode()
        .then(readCommand)
        .then(output => {
            const prefix = 'cli_backup';
            const suffix = 'txt';
            const text = output.join("\n");
            const filename = generateFilename(prefix, suffix);

            return GUI.saveToTextFileDialog(text, filename, suffix);
        })
        .then(() => sendCommand("exit", onClose));
    }

    function onConnect(openInfo) {
        if (openInfo) {
            mspHelper = new MspHelper();
            serial.onReceive.addListener(readSerial);
            MSP.listen(mspHelper.process_data.bind(mspHelper));

            onSaveConfig();
        } else {
            gui_log(i18n.getMessage('serialPortOpenFail'));

            if (callback) {
                callback();
            }
        }
    }

    const port = this.getPort();

    if (port !== '0') {
        const baud = parseInt($('#flash_manual_baud_rate').val()) || 115200;
        serial.connect(port, {bitrate: baud}, onConnect);
    } else {
        gui_log(i18n.getMessage('firmwareFlasherNoPortSelected'));
    }
};



firmware_flasher.cleanup = function (callback) {
    PortHandler.flush_callbacks();

    // unbind "global" events
    $(document).unbind('keypress');
    $(document).off('click', 'span.progressLabel a');

    tracking.resetFirmwareData();

    if (callback) callback();
};

firmware_flasher.enableFlashButton = function (enabled) {
    $('a.flash_firmware').toggleClass('disabled', !enabled);
};

firmware_flasher.enableLoadRemoteFileButton = function (enabled) {
    $('a.load_remote_file').toggleClass('disabled', !enabled);
};

firmware_flasher.enableLoadFileButton = function (enabled) {
    $('a.load_file').toggleClass('disabled', !enabled);
};

firmware_flasher.enableDfuExitButton = function (enabled) {
    $('a.exit_dfu').toggleClass('disabled', !enabled);
};

firmware_flasher.refresh = function (callback) {
    const self = this;

    GUI.tab_switch_cleanup(function() {
        self.initialize();

        if (callback) {
            callback();
        }
    });
};

firmware_flasher.showDialogVerifyBoard = function (selected, verified, onAbort, onAccept) {
    const dialogVerifyBoard = $('#dialog-verify-board')[0];

    $('#dialog-verify-board-content').html(i18n.getMessage('firmwareFlasherVerifyBoard', {selected_board: selected, verified_board: verified}));

    if (!dialogVerifyBoard.hasAttribute('open')) {
        dialogVerifyBoard.showModal();
        $('#dialog-verify-board-abort-confirmbtn').click(function() {
            dialogVerifyBoard.close();
            onAbort();
        });
        $('#dialog-verify-board-continue-confirmbtn').click(function() {
            dialogVerifyBoard.close();
            onAccept();
        });
    }
};

firmware_flasher.FLASH_MESSAGE_TYPES = {
    NEUTRAL : 'NEUTRAL',
    VALID   : 'VALID',
    INVALID : 'INVALID',
    ACTION  : 'ACTION',
};

firmware_flasher.flashingMessage = function(message, type) {
    let self = this;

    let progressLabel_e = $('span.progressLabel');
    switch (type) {
        case self.FLASH_MESSAGE_TYPES.VALID:
            progressLabel_e.removeClass('invalid actionRequired')
                           .addClass('valid');
            break;
        case self.FLASH_MESSAGE_TYPES.INVALID:
            progressLabel_e.removeClass('valid actionRequired')
                           .addClass('invalid');
            break;
        case self.FLASH_MESSAGE_TYPES.ACTION:
            progressLabel_e.removeClass('valid invalid')
                           .addClass('actionRequired');
            break;
        case self.FLASH_MESSAGE_TYPES.NEUTRAL:
        default:
            progressLabel_e.removeClass('valid invalid actionRequired');
            break;
    }
    if (message !== null) {
        progressLabel_e.html(message);
    }

    return self;
};

firmware_flasher.flashProgress = function(value) {
    $('.progress').val(value);

    return this;
};

firmware_flasher.injectTargetInfo = function (targetConfig, targetName, manufacturerId, commitInfo) {
    const targetInfoLineRegex = /^# config: manufacturer_id: .*, board_name: .*, version: .*$, date: .*\n/gm;

    const config = targetConfig.replace(targetInfoLineRegex, '');

    const targetInfo = `# config: manufacturer_id: ${manufacturerId}, board_name: ${targetName}, version: ${commitInfo.commitHash}, date: ${commitInfo.date}`;

    const lines = config.split('\n');
    lines.splice(1, 0, targetInfo);
    return lines.join('\n');
};

TABS.firmware_flasher = firmware_flasher;

export {
    firmware_flasher,
};
