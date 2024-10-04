import $ from 'jquery';
import { i18n } from '../localization';
import GUI, { TABS } from '../gui';
import { get as getConfig, set as setConfig } from '../ConfigStorage';
import { get as getStorage, set as setStorage } from '../SessionStorage';
import BuildApi from '../BuildApi';
import ConfigInserter from "../ConfigInserter.js";
import { tracking } from "../Analytics";
import PortHandler from '../port_handler';
import { gui_log } from '../gui_log';
import semver from 'semver';
import { urlExists } from '../utils/common';
import read_hex_file from '../workers/hex_parser.js';
import Sponsor from '../Sponsor';
import FileSystem from '../FileSystem';
import STM32 from '../protocols/webstm32';
import DFU from '../protocols/webusbdfu';
import AutoBackup from '../utils/AutoBackup.js';
import AutoDetect from '../utils/AutoDetect.js';
import { EventBus } from "../../components/eventBus";
import { ispConnected } from '../utils/connection.js';

const firmware_flasher = {
    targets: null,
    buildApi: new BuildApi(),
    sponsor: new Sponsor(),
    localFirmwareLoaded: false,
    selectedBoard: undefined,
    cloudBuildKey: null,
    cloudBuildOptions: null,
    isFlashing: false,
    intel_hex: undefined, // standard intel hex in string format
    parsed_hex: undefined, // parsed raw hex in array format
    isConfigLocal: false, // Set to true if the user loads one locally
    filename: null,
    configFilename: null,
    config: {},
    developmentFirmwareLoaded: false, // Is the firmware to be flashed from the development branch?
    cancelBuild: false,
};

firmware_flasher.initialize = function (callback) {
    const self = this;

    if (GUI.active_tab !== 'firmware_flasher') {
        GUI.active_tab = 'firmware_flasher';
    }

    // reset on tab change
    self.selectedBoard = undefined;

    self.cloudBuildKey = null;
    self.cloudBuildOptions = null;

    self.localFirmwareLoaded = false;
    self.isConfigLocal = false;
    self.intel_hex = undefined;
    self.parsed_hex = undefined;

    function onDocumentLoad() {

        function parseHex(str, callback) {
            read_hex_file(str).then((data) => {
                callback(data);
            });
        }

        function showLoadedHex(filename) {
            self.filename = filename;

            if (self.localFirmwareLoaded) {
                self.flashingMessage(i18n.getMessage('firmwareFlasherFirmwareLocalLoaded', { filename: filename, bytes: self.parsed_hex.bytes_total }), self.FLASH_MESSAGE_TYPES.NEUTRAL);
            } else {
                self.flashingMessage(`<a class="save_firmware" href="#" title="Save Firmware">${i18n.getMessage('firmwareFlasherFirmwareOnlineLoaded', { filename: filename, bytes: self.parsed_hex.bytes_total })}</a>`, self.FLASH_MESSAGE_TYPES.NEUTRAL);
            }
            self.enableFlashButton(true);

            tracking.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, 'FirmwareLoaded', {
                firmwareSize: self.parsed_hex.bytes_total,
                firmwareName: filename,
                firmwareSource: self.localFirmwareLoaded ? 'file' : 'http',
                selectedTarget: self.targetDetail?.target,
                selectedRelease: self.targetDetail?.release,
            });
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
            if (!targets || !ispConnected()) {
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

        function toggleTelemetryProtocolInfo() {
            const radioProtocol = $('select[name="radioProtocols"] option:selected').val();
            const hasTelemetryEnabledByDefault = [
                'USE_SERIALRX_CRSF',
                'USE_SERIALRX_FPORT',
                'USE_SERIALRX_GHST',
                'USE_SERIALRX_JETIEXBUS',
            ].includes(radioProtocol);

            $('select[name="telemetryProtocols"]').attr('disabled', hasTelemetryEnabledByDefault);

            if (hasTelemetryEnabledByDefault) {
                if ($('select[name="telemetryProtocols"] option[value="-1"]').length === 0) {
                    $('select[name="telemetryProtocols"]').prepend($('<option>', {
                        value: '-1',
                        selected: 'selected',
                        text: i18n.getMessage('firmwareFlasherOptionLabelTelemetryProtocolIncluded'),
                    }));
                } else {
                    $('select[name="telemetryProtocols"] option:first').attr('selected', 'selected').text(i18n.getMessage('firmwareFlasherOptionLabelTelemetryProtocolIncluded'));
                }
            } else if ($('select[name="telemetryProtocols"] option[value="-1"]').length) {
                $('select[name="telemetryProtocols"] option:first').remove();
            }
        }

        function buildOptions(data) {
            if (!ispConnected()) {
                return;
            }

            buildOptionsList($('select[name="radioProtocols"]'), data.radioProtocols);
            buildOptionsList($('select[name="telemetryProtocols"]'), data.telemetryProtocols);
            buildOptionsList($('select[name="options"]'), data.generalOptions);
            buildOptionsList($('select[name="motorProtocols"]'), data.motorProtocols);

            if (!self.validateBuildKey()) {
                preselectRadioProtocolFromStorage();
            }

            toggleTelemetryProtocolInfo();
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

        self.sponsor.loadSponsorTile('flash', $('div.tab_sponsor'));

        buildType_e.on('change', function() {
            self.enableLoadRemoteFileButton(false);

            const build_type = buildType_e.val();

            $('select[name="board"]').empty()
                .append($(`<option value='0'>${i18n.getMessage("firmwareFlasherOptionLoading")}</option>`));

            $('select[name="firmware_version"]').empty()
                .append($(`<option value='0'>${i18n.getMessage("firmwareFlasherOptionLoading")}</option>`));

            if (!GUI.connect_lock) {
                try {
                    self.buildApi.loadTargets(loadTargetList);
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
                            self.buildApi.loadCommits(response.release, (commits) => {
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
                    // Need to reset core build mode
                    $('input.corebuild_mode').trigger('change');
                }

                if (response.configuration && !self.isConfigLocal) {
                    setBoardConfig(response.configuration);
                }

                self.enableLoadRemoteFileButton(true);
            }

            self.buildApi.loadTarget(target, release, onTargetDetail);

            const OnInvalidBuildKey = () => self.buildApi.loadOptions(release, buildOptions);

            if (self.validateBuildKey()) {
                self.buildApi.loadOptionsByBuildKey(release, self.cloudBuildKey, buildOptions, OnInvalidBuildKey);
            } else {
                OnInvalidBuildKey();
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

            toggleTelemetryProtocolInfo();
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

                    self.buildApi.loadTargetReleases(target, (data) => populateReleases(versions_e, data));
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

        function detectedUsbDevice(device) {

            const isFlashOnConnect = $('input.flash_on_connect').is(':checked');

            console.log('Detected USB device:', device);
            console.log('Reboot mode: %s, flash on connect', STM32.rebootMode, isFlashOnConnect);

            if (STM32.rebootMode || isFlashOnConnect) {
                STM32.rebootMode = 0;
                GUI.connect_lock = false;
                startFlashing();
            }
        }

        EventBus.$on('port-handler:auto-select-usb-device', detectedUsbDevice);

        function flashFirmware(firmware) {
            const options = {};

            let eraseAll = false;
            if ($('input.erase_chip').is(':checked') || expertMode_e.is(':not(:checked)')) {
                options.erase_chip = true;

                eraseAll = true;
            }

            const port = PortHandler.portPicker.selectedPort;
            const isSerial = port.startsWith('serial_');
            const isDFU = port.startsWith('usb_');

            console.log('Selected port:', port);

            if (isDFU) {
                tracking.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, 'DFU Flashing', { filename: self.filename || null });
                DFU.connect(port, firmware, options);
            } else if (isSerial) {
                if ($('input.updating').is(':checked')) {
                    options.no_reboot = true;
                } else {
                    options.reboot_baud = PortHandler.portPicker.selectedBauds;
                }

                let baud = 115200;
                if ($('input.flash_manual_baud').is(':checked')) {
                    baud = parseInt($('#flash_manual_baud_rate').val()) || 115200;
                }

                tracking.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, 'Flashing', { filename: self.filename || null });

                STM32.connect(port, baud, firmware, options);
            } else {
                // Maybe the board is in DFU mode, but it does not have permissions. Ask for them.
                console.log('No valid port detected, asking for permissions');
                DFU.requestPermission()
                .then((device) => {
                    DFU.connect(device.path, firmware, options);
                });
            }

            self.isFlashing = false;
        }

        let result = getConfig('erase_chip');
        $('input.erase_chip').prop('checked', result.erase_chip); // users can override this during the session

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
            // Reset button when loading a new firmware
            self.enableFlashButton(false);
            self.enableLoadRemoteFileButton(false);

            self.developmentFirmwareLoaded = false;

            FileSystem.pickOpenFile(i18n.getMessage('fileSystemPickerFiles', {typeof: 'HEX'}), '.hex')
            .then((file) => {
                console.log("Saving firmware to:", file.name);
                FileSystem.readFile(file)
                .then((data) => {
                    if (file.name.split('.').pop() === "hex") {
                        self.intel_hex = data;
                        parseHex(self.intel_hex, function (data) {
                            self.parsed_hex = data;

                            if (self.parsed_hex) {
                                self.localFirmwareLoaded = true;

                                showLoadedHex(file.name);
                            } else {
                                self.flashingMessage(i18n.getMessage('firmwareFlasherHexCorrupted'), self.FLASH_MESSAGE_TYPES.INVALID);
                            }
                        });
                    } else {
                        clearBufferedFirmware();

                        let config = cleanUnifiedConfigFile(data);
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
                });
            })
            .catch((error) => {
                console.error("Error reading file:", error);
            });
        });

        /**
         * Lock / Unlock the firmware download button according to the firmware selection dropdown.
         */
        $('select[name="firmware_version"]').change((evt) => {
                selectFirmware($("option:selected", evt.target).val());
            },
        );

        $('a.cloud_build_cancel').on('click', function (evt) {
            $('a.cloud_build_cancel').toggleClass('disabled', true);
            self.cancelBuild = true;
        });

        $('a.load_remote_file').on('click', function (evt) {
            if (!self.selectedBoard) {
                return;
            }

            // Reset button when loading a new firmware
            self.enableFlashButton(false);
            self.enableLoadRemoteFileButton(false);

            self.localFirmwareLoaded = false;
            self.developmentFirmwareLoaded = buildTypesToShow[$('select[name="build_type"]').val()].tag === 'firmwareFlasherOptionLabelBuildTypeDevelopment';

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

            function processBuildSuccess(response, statusResponse, suffix) {
                if (statusResponse.status !== 'success') {
                    return;
                }
                updateStatus(`Success${suffix}`, response.key, 100, true);
                if (statusResponse.configuration !== undefined && !self.isConfigLocal) {
                    setBoardConfig(statusResponse.configuration);
                }
                self.buildApi.loadTargetHex(response.url, (hex) => onLoadSuccess(hex, response.file), onLoadFailed);
            }

            function processBuildFailure(key, suffix) {
                updateStatus(`Fail${suffix}`, key, 0, true);
                onLoadFailed();
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
                self.buildApi.requestBuild(request, (response) => {
                    console.info("Build response:", response);

                    // Complete the summary object to be used later
                    self.targetDetail.file = response.file;

                    if (!targetDetail.cloudBuild) {
                        // it is a previous release, so simply load the hex
                        self.buildApi.loadTargetHex(response.url, (hex) => onLoadSuccess(hex, response.file), onLoadFailed);
                        return;
                    }

                    updateStatus('Pending', response.key, 0, false);
                    self.cancelBuild = false;

                    self.buildApi.requestBuildStatus(response.key, (statusResponse) => {
                        if (statusResponse.status === "success") {
                            // will be cached already, no need to wait.
                            processBuildSuccess(response, statusResponse, "Cached");
                            return;
                        }

                        self.enableCancelBuildButton(true);
                        const retrySeconds = 5;
                        let retries = 1;
                        let processing = false;
                        let timeout = 120;
                        const timer = setInterval(() => {
                            self.buildApi.requestBuildStatus(response.key, (statusResponse) => {
                                if (statusResponse.timeOut !== undefined) {
                                    if (!processing) {
                                        processing = true;
                                        retries = 1;
                                    }
                                    timeout = statusResponse.timeOut;
                                }
                                const retryTotal = timeout / retrySeconds;

                                if (statusResponse.status !== 'queued' || retries > retryTotal || self.cancelBuild) {
                                    self.enableCancelBuildButton(false);
                                    clearInterval(timer);

                                    if (statusResponse.status === 'success') {
                                        processBuildSuccess(response, statusResponse, "");
                                        return;
                                    }

                                    let suffix = "";
                                    if (retries > retryTotal) {
                                        suffix = "TimeOut";
                                    }

                                    if (self.cancelBuild) {
                                        suffix = "Cancel";
                                    }
                                    processBuildFailure(response.key, suffix);
                                    return;
                                }

                                if (processing) {
                                    updateStatus('Processing', response.key, retries * (100 / retryTotal), false);
                                }
                                retries++;
                            });
                        }, retrySeconds * 1000);
                    });
                }, () => {
                    updateStatus('FailRequest', '', 0, false);
                    onLoadFailed();
                });
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
                    DFU.requestPermission()
                    .then((device) => {
                        DFU.connect(device.path, self.parsed_hex, { exitDfu: true });
                    });
                } catch (e) {
                    console.log(`Exiting DFU failed: ${e.message}`);
                }
            }
        });

        const targetSupportInfo = $('#targetSupportInfoUrl');

        targetSupportInfo.on('click', function() {
            let urlSupport = 'https://betaflight.com/docs/wiki/boards/archive/Missing';                 // general board missing
            const urlBoard = `https://betaflight.com/docs/wiki/boards/current/${self.selectedBoard}`;   // board description
            if (urlExists(urlBoard)) {
                urlSupport = urlBoard;
            }
            targetSupportInfo.attr("href", urlSupport);
        });

        const detectBoardElement = $('a.detect-board');

        detectBoardElement.on('click', () => {
            detectBoardElement.toggleClass('disabled', true);

            /**
             *
             *    Auto-detect board and set the dropdown to the correct value
             */

            if (!GUI.connect_lock) {
                AutoDetect.verifyBoard(PortHandler.portPicker.selectedPort);
            }

            // prevent spamming the button
            setTimeout(() => detectBoardElement.toggleClass('disabled', false), 2000);
        });

        $('a.flash_firmware').on('click', function () {
            self.isFlashing = true;
            const isFlashOnConnect = $('input.flash_on_connect').is(':checked');

            self.enableFlashButton(false);
            self.enableDfuExitButton(false);
            self.enableLoadRemoteFileButton(false);
            self.enableLoadFileButton(false);

            function initiateFlashing() {
                if (self.developmentFirmwareLoaded && !isFlashOnConnect) {
                    checkShowAcknowledgementDialog();
                } else {
                    startFlashing();
                }
            }

            // Backup not available in DFU, manual or virtual mode.
            // When flash on connect is enabled, the backup dialog is not shown.
            if (isFlashOnConnect || !(PortHandler.portAvailable || GUI.connect_lock)) {
                initiateFlashing();
            } else {
                GUI.showYesNoDialog(
                    {
                        title: i18n.getMessage('firmwareFlasherRemindBackupTitle'),
                        text: i18n.getMessage('firmwareFlasherRemindBackup'),
                        buttonYesText: i18n.getMessage('firmwareFlasherBackup'),
                        buttonNoText: i18n.getMessage('firmwareFlasherBackupIgnore'),
                        buttonYesCallback: () => {
                            // prevent connection while backup is in progress
                            GUI.connect_lock = true;
                            AutoBackup.execute(() => {
                                GUI.connect_lock = false;
                                initiateFlashing();
                            });
                        },

                        buttonNoCallback: initiateFlashing,
                    },
                );
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
                    // Disable flash on connect after flashing to prevent continuous flashing
                    $('input.flash_on_connect').prop('checked', false).change();
                } else {
                    $('span.progressLabel').attr('i18n','firmwareFlasherFirmwareNotLoaded').removeClass('i18n-replaced');
                    i18n.localizePage();
                }
            }
        }

        $('span.progressLabel').on('click', 'a.save_firmware', function () {

            FileSystem.pickSaveFile(self.targetDetail.file, i18n.getMessage('fileSystemPickerFiles', {typeof: 'HEX'}), '.hex')
            .then((file) => {
                console.log("Saving firmware to:", file.name);
                FileSystem.writeFile(file, self.intel_hex);

                tracking.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, 'SaveFirmware');
            })
            .catch((error) => {
                console.error("Error saving file:", error);
            });
        });

        self.flashingMessage(i18n.getMessage('firmwareFlasherLoadFirmwareFile'), self.FLASH_MESSAGE_TYPES.NEUTRAL);

        if (PortHandler.dfuAvailable) {
            $('a.exit_dfu').removeClass('disabled');
        }

        GUI.content_ready(callback);
    }

    self.buildApi.loadTargets(() => {
        $('#content').load("./tabs/firmware_flasher.html", onDocumentLoad);
    });
};


// Helper functions


firmware_flasher.validateBuildKey = function() {
    return this.cloudBuildKey?.length === 32 && ispConnected();
};

firmware_flasher.cleanup = function (callback) {
    // unbind "global" events
    $(document).unbind('keypress');
    $(document).off('click', 'span.progressLabel a');

    if (callback) callback();
};

firmware_flasher.enableCancelBuildButton = function (enabled) {
    $('a.cloud_build_cancel').toggleClass('disabled', !enabled);
    self.cancelBuild = false; // remove the semaphore
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

firmware_flasher.showDialogVerifyBoard = function (selected, verified, onAccept, onAbort) {
    const dialogVerifyBoard = $('#dialog-verify-board')[0];

    $('#dialog-verify-board-content').html(i18n.getMessage('firmwareFlasherVerifyBoard', {selected_board: selected, verified_board: verified}));

    if (!dialogVerifyBoard.hasAttribute('open')) {
        dialogVerifyBoard.showModal();

        $('#dialog-verify-board-continue-confirmbtn').on('click', function() {
            dialogVerifyBoard.close();
            onAccept();
        });

        $('#dialog-verify-board-abort-confirmbtn').on('click', function() {
            dialogVerifyBoard.close();
            onAbort();
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
