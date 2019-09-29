'use strict';

TABS.firmware_flasher = {
    releases: null,
    releaseChecker: new ReleaseChecker('firmware', 'https://api.github.com/repos/betaflight/betaflight/releases'),
    jenkinsLoader: new JenkinsLoader('https://ci.betaflight.tech'),
    localFirmwareLoaded: false,
    selectedBoard: undefined,
    intel_hex: undefined, // standard intel hex in string format
    parsed_hex: undefined, // parsed raw hex in array format
    unifiedTargetConfig: undefined, // the Unified Target configuration to be spliced into the configuration
    unifiedTargetConfigName: undefined,
    isConfigLocal: false, // Set to true if the user loads one locally
    remoteUnifiedTargetConfig: undefined, // Unified target configuration loaded from the menu, used when throwing out a local config
};

TABS.firmware_flasher.initialize = function (callback) {
    var self = this;

    if (GUI.active_tab != 'firmware_flasher') {
        GUI.active_tab = 'firmware_flasher';
    }

    self.selectedBoard = undefined;
    self.localFirmwareLoaded = false;
    self.isConfigLocal = false;
    self.intel_hex = undefined;
    self.parsed_hex = undefined;

    var unifiedSource = 'https://api.github.com/repos/betaflight/unified-targets/contents/configs/default';


        /**
         * Change boldness of firmware option depending on cache status
         * 
         * @param {Descriptor} release 
         */
    function onFirmwareCacheUpdate(release) {
        $("option[value='{0}']".format(release.version))
            .css("font-weight", FirmwareCache.has(release)
                ? "bold"
                : "normal");
    }

    function onDocumentLoad() {
        FirmwareCache.load();
        FirmwareCache.onPutToCache(onFirmwareCacheUpdate);
        FirmwareCache.onRemoveFromCache(onFirmwareCacheUpdate);

        function parse_hex(str, callback) {
            // parsing hex in different thread
            var worker = new Worker('./js/workers/hex_parser.js');

            // "callback"
            worker.onmessage = function (event) {
                callback(event.data);
            };

            // send data/string over for processing
            worker.postMessage(str);
        }
        function show_loaded_hex(summary) {
            self.flashingMessage('<a class="save_firmware" href="#" title="Save Firmware">' + i18n.getMessage('firmwareFlasherFirmwareOnlineLoaded', self.parsed_hex.bytes_total) + '</a>',
                     self.FLASH_MESSAGE_TYPES.NEUTRAL);

            self.enableFlashing(true);

            let targetName = TABS.firmware_flasher.selectedBoard;
            const TARGET_REGEXP = /^([^+-]+)(?:\+(.{1,4})|-legacy)?$/;
            let targetParts = targetName.match(TARGET_REGEXP);
            if (targetParts) {
                targetName = targetParts[1];
                if (targetParts[2]) {
                    $('div.release_info #manufacturerInfo').show();
                    $('div.release_info #manufacturer').text(targetParts[2]);
                } else {
                    $('div.release_info #manufacturerInfo').hide();
                }
	    }
            $('div.release_info .target').text(targetName);
            $('div.release_info .name').text(summary.version).prop('href', summary.releaseUrl);
            $('div.release_info .date').text(summary.date);
            $('div.release_info .file').text(summary.file).prop('href', summary.url);

            var formattedNotes = summary.notes.replace(/#(\d+)/g, '[#$1](https://github.com/betaflight/betaflight/pull/$1)');
            formattedNotes = marked(formattedNotes);
            $('div.release_info .notes').html(formattedNotes);
            $('div.release_info .notes').find('a').each(function() {
                $(this).attr('target', '_blank');
            });
            $('div.release_info').slideDown();
        }
        function process_hex(data, summary) {
            self.intel_hex = data;

            parse_hex(self.intel_hex, function (data) {
                self.parsed_hex = data;

                if (self.parsed_hex) {
                    analytics.setFirmwareData(analytics.DATA.FIRMWARE_SIZE, self.parsed_hex.bytes_total);

                    if (!FirmwareCache.has(summary)) {
                        FirmwareCache.put(summary, self.intel_hex);
                    }
                    show_loaded_hex(summary)

                } else {
                    self.flashingMessage('firmwareFlasherHexCorrupted', self.FLASH_MESSAGE_TYPES.INVALID);
                }
            });
        }

        function onLoadSuccess(data, summary) {
            self.localFirmwareLoaded = false;
            // The path from getting a firmware doesn't fill in summary.
            summary = typeof summary === "object" 
                ? summary 
                : $('select[name="firmware_version"] option:selected').data('summary');
            process_hex(data, summary);
            $("a.load_remote_file").removeClass('disabled');
            $("a.load_remote_file").text(i18n.getMessage('firmwareFlasherButtonLoadOnline'));
        };

        function populateBoardOptions(builds) {
            if (!builds) {
                $('select[name="board"]').empty().append('<option value="0">Offline</option>');
                $('select[name="firmware_version"]').empty().append('<option value="0">Offline</option>');

                return;
            }

            var boards_e = $('select[name="board"]');
            boards_e.empty();
            boards_e.append($("<option value='0' i18n='firmwareFlasherOptionLabelSelectBoard'></option>"));

            var versions_e = $('select[name="firmware_version"]');
            versions_e.empty();
            versions_e.append($("<option value='0' i18n='firmwareFlasherOptionLabelSelectFirmwareVersion'></option>"));


            var selectTargets = [];
            Object.keys(builds)
                .sort()
                .forEach(function(target, i) {
                    var descriptors = builds[target];
                    descriptors.forEach(function(descriptor){
                        if($.inArray(target, selectTargets) == -1) {
                            selectTargets.push(target);
                            var select_e =
                                $("<option value='{0}'>{0}</option>".format(
                                        descriptor.target
                                ));
                            boards_e.append(select_e);
                        }
                    });
                });

            TABS.firmware_flasher.releases = builds;

            ConfigStorage.get('selected_board', function (result) {
                if (result.selected_board) {
                    var boardBuilds = builds[result.selected_board];
                    $('select[name="board"]').val(boardBuilds ? result.selected_board : 0).trigger('change');
                }
            });
        }

        function processBoardOptions(releaseData, showDevReleases) {
            var releases = {};
            var sortedTargets = [];
            var unsortedTargets = [];
            releaseData.forEach(function(release) {
                release.assets.forEach(function(asset) {
                    var targetFromFilenameExpression = /betaflight_([\d.]+)?_?(\w+)(\-.*)?\.(.*)/;
                    var match = targetFromFilenameExpression.exec(asset.name);
                    if ((!showDevReleases && release.prerelease) || !match) {
                        return;
                    }
                    var target = match[2];
                    if($.inArray(target, unsortedTargets) == -1) {
                        unsortedTargets.push(target);
                    }
                });
                sortedTargets = unsortedTargets.sort();
            });
            sortedTargets.forEach(function(release) {
                releases[release] = [];
            });
            releaseData.forEach(function(release) {
                var versionFromTagExpression = /v?(.*)/;
                var matchVersionFromTag = versionFromTagExpression.exec(release.tag_name);
                var version = matchVersionFromTag[1];
                release.assets.forEach(function(asset) {
                    var targetFromFilenameExpression = /betaflight_([\d.]+)?_?(\w+)(\-.*)?\.(.*)/;
                    var match = targetFromFilenameExpression.exec(asset.name);
                    if ((!showDevReleases && release.prerelease) || !match) {
                        return;
                    }
                    var target = match[2];
                    var format = match[4];
                    if (format != 'hex') {
                        return;
                    }
                    var date = new Date(release.published_at);
                    var formattedDate = ("0" + date.getDate()).slice(-2) + "-" + ("0" + (date.getMonth() + 1)).slice(-2) + "-" + date.getFullYear() + " " + ("0" + date.getHours()).slice(-2) + ":" + ("0" + date.getMinutes()).slice(-2);
                    var descriptor = {
                        "releaseUrl": release.html_url,
                        "name"      : version,
                        "version"   : version,
                        "url"       : asset.browser_download_url,
                        "file"      : asset.name,
                        "target"    : target,
                        "date"      : formattedDate,
                        "notes"     : release.body
                    };
                    releases[target].push(descriptor);
                });
            });
            loadUnifiedBuilds(releases);
        };

        function checkOneVersionForUnification(version) {
            return semver.gte(version.split(' ')[0], '4.1.0-RC1');
        }

        function checkBuildsForUnification(builds) {
            // Find a build that is newer than 4.1.0, return true if found
            let foundSuitable = false;
            Object.keys(builds).forEach(function (key) {
                builds[key].forEach(function(target) {
                    if (checkOneVersionForUnification(target.version)) {
                        foundSuitable = true;
                    }
                });
            });
            return foundSuitable;
        }

        function loadUnifiedBuilds(builds) {
            var expirationPeriod = 3600 * 2; // Two of your earth hours.
            var checkTime = Math.floor(Date.now() / 1000); // Lets deal in seconds.
            if (builds && checkBuildsForUnification(builds)) {
                console.log('loaded some builds for later');
                var storageTag = 'unifiedSourceCache';
                chrome.storage.local.get(storageTag, function (result) {
                    let storageObj = result[storageTag];
                    if(!storageObj || !storageObj.lastUpdate || checkTime - storageObj.lastUpdate > expirationPeriod ) {
                        console.log('go get', unifiedSource);
                        $.get(unifiedSource, function(data, textStatus, jqXHR) {
                            // Cache the information for later use.
                            let newStorageObj = {};
                            let newDataObj = {};
                            newDataObj.lastUpdate = checkTime;
                            newDataObj.data = data;
                            newStorageObj[storageTag] = newDataObj;
                            chrome.storage.local.set(newStorageObj);

                            parseUnifiedBuilds(data, builds);
                        }).fail(xhr => {
                            console.log('failed to get new', unifiedSource, 'cached data', Math.floor((checkTime - storageObj.lastUpdate) / 60), 'mins old');
                            parseUnifiedBuilds(storageObj.data, builds);
                        });
                    } else {
                      // In the event that the cache is okay
                      console.log('unified config cached data', Math.floor((checkTime - storageObj.lastUpdate)/60), 'mins old');
                      parseUnifiedBuilds(storageObj.data, builds);
                    }
                });
            } else {
                populateBoardOptions(builds);
            }
        }

        function parseUnifiedBuilds(data, builds) {
            if (!data) { return; }
            let releases = {};
            let unifiedConfigs = {};
            let items = {};
            let unifiedTargetNames = [];
            data.forEach(function(target) {
                const TARGET_REGEXP = /^(?:([^-]{1,4})-)?(.*).config$/;
                let targetParts = target.name.match(TARGET_REGEXP);
                if (!targetParts) {
                    return;
                }
                let boardName = targetParts[2];
                let manufacturerId = targetParts[1];
                let targetName;
                let displayName;
                if (manufacturerId) {
                    targetName = `${boardName}+${manufacturerId}`;
                    displayName = `${boardName} (${manufacturerId})`;
                } else {
                    targetName = boardName;
                }
                unifiedTargetNames.push(boardName);
                unifiedConfigs[targetName] = target.download_url;
                items[targetName] = { displayName: displayName };
                // Chicken and egg problem: We need to know what Unified Target this configuration uses before reading the configuration.
                // Solving this by assuming that all Unified Targets have the same availability for now.
                const DEFAULT_UNIFIED_TARGET_NAME = "STM32F405";
                releases[targetName] = builds[DEFAULT_UNIFIED_TARGET_NAME];
            });
            Object.keys(builds).forEach(function (key) {
                let targetName;
                let displayName;
                if (unifiedTargetNames.includes(key)) {
                    targetName = `${key}-legacy`;
                    displayName = i18n.getMessage("firmwareFlasherLegacyLabel", { target: key });
                } else {
                    targetName = key;
                }
                items[targetName] = { displayName: displayName };
                releases[targetName] = builds[key];
            });
            var boards_e = $('select[name="board"]');
            var versions_e = $('select[name="firmware_version"]');
            boards_e.empty()
                .append($("<option value='0' i18n='firmwareFlasherOptionLabelSelectBoard'></option>"));

            versions_e.empty()
                .append($("<option value='0' i18n='firmwareFlasherOptionLabelSelectFirmwareVersion'></option>"));
            var selectTargets = [];
            Object.keys(items)
                .sort()
                .forEach(function(target, i) {
                    let item = items[target];

                    var select_e = $("<option value='{0}'>{1}</option>".format(target, items[target].displayName || target));
                    boards_e.append(select_e);
                });
            TABS.firmware_flasher.releases = releases;
            TABS.firmware_flasher.unifiedConfigs = unifiedConfigs;

            ConfigStorage.get('selected_board', function (result) {
                if (result.selected_board) {
                    var boardReleases = TABS.firmware_flasher.unifiedConfigs[result.selected_board]
                        || TABS.firmware_flasher.releases[result.selected_board];
                    $('select[name="board"]').val(boardReleases ? result.selected_board : 0).trigger('change');
                }
            });
        }

        var buildTypes = [
            {
                tag: 'firmwareFlasherOptionLabelBuildTypeRelease',
                loader: () => self.releaseChecker.loadReleaseData(releaseData => processBoardOptions(releaseData, false))
            },
            {
                tag: 'firmwareFlasherOptionLabelBuildTypeReleaseCandidate',
                loader: () => self.releaseChecker.loadReleaseData(releaseData => processBoardOptions(releaseData, true))
            }
        ];

        var ciBuildsTypes = self.jenkinsLoader._jobs.map(job => {
            if (job.title === "Development") {
                return {
                    tag: "firmwareFlasherOptionLabelBuildTypeDevelopment",
                    loader: () => self.jenkinsLoader.loadBuilds(job.name, loadUnifiedBuilds)
                };
            }
            return {
                title: job.title,
                loader: () => self.jenkinsLoader.loadBuilds(job.name, loadUnifiedBuilds)
            };
        })
        var buildTypesToShow;

        var buildType_e = $('select[name="build_type"]');
        function buildBuildTypeOptionsList() {
            buildType_e.empty();
            buildTypesToShow.forEach((build, index) => {
                buildType_e.append($("<option value='{0}'>{1}</option>".format(index, build.tag ? i18n.getMessage(build.tag) : build.title)))
            });
            $('select[name="build_type"]').val($('select[name="build_type"] option:first').val());
        }

        function showOrHideBuildTypes() {
            var showExtraReleases = $(this).is(':checked');

            if (showExtraReleases) {
                $('tr.build_type').show();
                $('tr.expert_mode').show();
            } else {
                $('tr.build_type').hide();
                $('tr.expert_mode').hide();
                buildType_e.val(0).trigger('change');
            }
        }

        var globalExpertMode_e = $('input[name="expertModeCheckbox"]');
        function showOrHideBuildTypeSelect() {
            var expertModeChecked = $(this).is(':checked');

            globalExpertMode_e.prop('checked', expertModeChecked);
            if (expertModeChecked) {
                buildTypesToShow = buildTypes.concat(ciBuildsTypes);
                buildBuildTypeOptionsList();
            } else {
                buildTypesToShow = buildTypes;
                buildBuildTypeOptionsList();
                buildType_e.val(0).trigger('change');
            }
        }

        var expertMode_e = $('.tab-firmware_flasher input.expert_mode');
        expertMode_e.prop('checked', globalExpertMode_e.is(':checked'));
        $('input.show_development_releases').change(showOrHideBuildTypes).change();
        expertMode_e.change(showOrHideBuildTypeSelect).change();

        // translate to user-selected language
        i18n.localizePage();

        buildType_e.change(function() {
            analytics.setFirmwareData(analytics.DATA.FIRMWARE_CHANNEL, $(this).find('option:selected').text());

            $("a.load_remote_file").addClass('disabled');
            var build_type = $(this).val();

            $('select[name="board"]').empty()
            .append($("<option value='0' i18n='firmwareFlasherOptionLoading'></option>"));

            $('select[name="firmware_version"]').empty()
            .append($("<option value='0' i18n='firmwareFlasherOptionLoading'></option>"));
            i18n.localizePage();

            if (!GUI.connect_lock) {
                TABS.firmware_flasher.unifiedConfigs = {};
                buildTypesToShow[build_type].loader();
            }

            chrome.storage.local.set({'selected_build_type': build_type});
        });

        function populateVersions(versions_element, targetVersions, target) {
            versions_element.empty();
            if (targetVersions) {
                versions_element.append($("<option value='0'>{0} {1}</option>".format(i18n.getMessage('firmwareFlasherOptionLabelSelectFirmwareVersionFor'), target)));
                targetVersions.forEach(function(descriptor) {
                    if (self.remoteUnifiedTargetConfig && !checkOneVersionForUnification(descriptor.version)) {
                        return;
                    }
                    var select_e =
                        $("<option value='{0}'>{0} - {1}</option>".format(
                                descriptor.version,
                                descriptor.date
                        ))
                        .css("font-weight", FirmwareCache.has(descriptor)
                                ? "bold"
                                : "normal"
                        );
                    select_e.data('summary', descriptor);
                    versions_element.append(select_e);
                });
                // Assume flashing latest, so default to it.
                versions_element.prop("selectedIndex", 1).change();
            }
        }

        function grabBuildNameFromConfig(config) {
            let bareBoard;
            try {
                bareBoard = config.split("\n")[0].split(' ')[3];
            } catch (e) {
                bareBoard = undefined;
                console.log('grabBuildNameFromConfig failed: ', e.message);
            }
            return bareBoard;
        }

        function setUnifiedConfig(target, configText, bareBoard) {
            // a target might request a firmware with the same name, remove configuration in this case.
            if (bareBoard == target) {
                console.log(bareBoard, '==', target);
                if (!self.isConfigLocal) {
                    self.unifiedTargetConfig = undefined;
                    self.unifiedTargetConfigName = undefined;
                    self.remoteUnifiedTargetConfig = undefined;
                } else {
                    self.remoteUnifiedTargetConfig = undefined;
                }
            } else {
                self.unifiedTargetConfig = configText;
                self.unifiedTargetConfigName = `${target}.config`;
                self.isConfigLocal = false;
                self.remoteUnifiedTargetConfig = configText;
            }
        }
        function clearBufferedFirmware() {
            self.isConfigLocal = false;
            self.unifiedTargetConfig = undefined;
            self.unifiedTargetConfigName = undefined;
            self.remoteUnifiedTargetConfig = undefined;
            self.intel_hex = undefined;
            self.parsed_hex = undefined;
            self.localFirmwareLoaded = false;
        }

        $('select[name="board"]').change(function() {
            $("a.load_remote_file").addClass('disabled');
            var target = $(this).val();

            if (!GUI.connect_lock) {
                if (TABS.firmware_flasher.selectedBoard != target) {
                    // We're sure the board actually changed
                    if (self.isConfigLocal) {
                        console.log('Board changed, unloading local config');
                        self.isConfigLocal = false;
                        self.unifiedTargetConfig = undefined;
                        self.unifiedTargetConfigName = undefined;
                    }
                }
                ConfigStorage.set({'selected_board': target});
                TABS.firmware_flasher.selectedBoard = target;
                TABS.firmware_flasher.bareBoard = undefined;
                console.log('board changed to', target);

                self.flashingMessage('firmwareFlasherLoadFirmwareFile', self.FLASH_MESSAGE_TYPES.NEUTRAL)
                    .flashProgress(0);

                $('div.git_info').slideUp();
                $('div.release_info').slideUp();

                if (!self.localFirmwareLoaded) {
                    self.enableFlashing(false);
                }

                var versions_e = $('select[name="firmware_version"]');
                if(target == 0) {
                    // target == 0 is the "Choose a Board" option. Throw out anything loaded
                    clearBufferedFirmware();

                    versions_e.empty();
                    versions_e.append($("<option value='0'>{0}</option>".format(i18n.getMessage('firmwareFlasherOptionLabelSelectFirmwareVersion'))));
                } else {
                    // Show a loading message as there is a delay in loading a configuration
                    versions_e.empty();
                    versions_e.append($("<option value='0'>{0}</option>".format(i18n.getMessage('firmwareFlasherOptionLoading'))));
                    let selecteBuild = buildTypesToShow[$('select[name="build_type"]').val()];
                    if (TABS.firmware_flasher.unifiedConfigs[target]) {
                        var storageTag = 'unifiedConfigLast';
                        var expirationPeriod = 3600; // One of your earth hours.
                        var checkTime = Math.floor(Date.now() / 1000); // Lets deal in seconds.
                        chrome.storage.local.get(storageTag, function (result) {
                            let storageObj = result[storageTag];
                            let bareBoard = null;
                            // Check to see if the cached configuration is the one we want.
                            if (!storageObj || !storageObj.target || storageObj.target != target) {
                                // Have to go and try and get the unified config, and then do stuff
                                $.get(TABS.firmware_flasher.unifiedConfigs[target], function(data) {
                                    console.log('got unified config');
                                    // cache it for later
                                    let tempObj = {};
                                    tempObj['data'] = data;
                                    tempObj['target'] = target;
                                    tempObj['checkTime'] = checkTime;
                                    let newStorageObj = {};
                                    newStorageObj[storageTag] = tempObj;
                                    chrome.storage.local.set(newStorageObj);

                                    bareBoard = grabBuildNameFromConfig(data);
                                    TABS.firmware_flasher.bareBoard = bareBoard;
                                    setUnifiedConfig(target, data, bareBoard);
                                    populateVersions(versions_e, TABS.firmware_flasher.releases[bareBoard], target);
                                }).fail(xhr => {
                                    //TODO error, populate nothing?
                                    self.unifiedTargetConfig = undefined;
                                    self.unifiedTargetConfigName = undefined;
                                    self.isConfigLocal = false;
                                    self.remoteUnifiedTargetConfig = undefined;
                                    let baseFileName = TABS.firmware_flasher.unifiedConfigs[target].reverse()[0];
                                    GUI.log(i18n.getMessage('firmwareFlasherFailedToLoadUnifiedConfig',
                                        {remote_file: baseFileName}));
                                });
                            } else {
                                console.log('We have the config cached for', target);
                                var data = storageObj.data;

                                bareBoard = grabBuildNameFromConfig(data);
                                TABS.firmware_flasher.bareBoard = bareBoard;
                                setUnifiedConfig(target, data, bareBoard);
                                populateVersions(versions_e, TABS.firmware_flasher.releases[bareBoard], target);
                            }
                        });
                    } else {
                        if (!self.isConfigLocal) {
                            self.unifiedTargetConfig = undefined;
                            self.unifiedTargetConfigName = undefined;
                            self.remoteUnifiedTargetConfig = undefined;
                        } else {
                            self.remoteUnifiedTargetConfig = undefined;
                        }
                        TABS.firmware_flasher.bareBoard = target;
                        populateVersions(versions_e, TABS.firmware_flasher.releases[target], target);
                    }
                }

            }
        });

        function flashingMessageLocal() {
            // used by the a.load_file hook, evaluate the loaded information, and enable flashing if suitable
            if (self.isConfigLocal && !self.parsed_hex) {
                self.flashingMessage(i18n.getMessage('firmwareFlasherLoadedConfig'), self.FLASH_MESSAGE_TYPES.NEUTRAL);
            }
            if (self.isConfigLocal && self.parsed_hex && !self.localFirmwareLoaded) {
                self.enableFlashing(true);
                self.flashingMessage(i18n.getMessage('firmwareFlasherFirmwareLocalLoaded', self.parsed_hex.bytes_total), self.FLASH_MESSAGE_TYPES.NEUTRAL);
            }
            if (self.localFirmwareLoaded) {
                self.enableFlashing(true);
                self.flashingMessage(i18n.getMessage('firmwareFlasherFirmwareLocalLoaded', self.parsed_hex.bytes_total), self.FLASH_MESSAGE_TYPES.NEUTRAL);
            }
        }
        function cleanUnifiedConfigFile(input) {
            let output = [];
            let inComment = false;
            for (let i=0; i < input.length; i++) {
                if (input.charAt(i) == "\n" || input.charAt(i) == "\r") {
                    inComment = false;
                }
                if (input.charAt(i) == "#") {
                    inComment = true;
                }
                if (!inComment && input.charCodeAt(i) > 255) {
                    // Note: we're not showing this error in betaflight-configurator
                    throw new Error('commands are limited to characters 0-255, comments have no limitation');
                }
                if (input.charCodeAt(i) > 255) {
                    output.push('_');
                } else {
                    output.push(input.charAt(i));
                }
            }
            return output.join('');
        }
        // UI Hooks
        $('a.load_file').click(function () {
            self.enableFlashing(false);
            //self.localFileLoaded = true;

            analytics.setFirmwareData(analytics.DATA.FIRMWARE_CHANNEL, undefined);
            analytics.setFirmwareData(analytics.DATA.FIRMWARE_SOURCE, 'file');

            chrome.fileSystem.chooseEntry({
                type: 'openFile',
                accepts: [
                    {
                        description: 'target files',
                        extensions: ['hex', 'config']
                    }
                ]
            }, function (fileEntry) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);

                    return;
                }

                // hide github info (if it exists)
                $('div.git_info').slideUp();

                chrome.fileSystem.getDisplayPath(fileEntry, function (path) {
                    console.log('Loading file from: ' + path);

                    fileEntry.file(function (file) {
                        analytics.setFirmwareData(analytics.DATA.FIRMWARE_NAME, file.name);
                        var reader = new FileReader();

                        reader.onloadend = function(e) {
                            if (e.total != 0 && e.total == e.loaded) {
                                console.log('File loaded (' + e.loaded + ')');

                                if (file.name.split('.').pop() === "hex") {
                                    self.intel_hex = e.target.result;

                                    parse_hex(self.intel_hex, function (data) {
                                        self.parsed_hex = data;

                                        if (self.parsed_hex) {
                                            analytics.setFirmwareData(analytics.DATA.FIRMWARE_SIZE, self.parsed_hex.bytes_total);
                                            self.localFirmwareLoaded = true;

                                            flashingMessageLocal();
                                        } else {
                                            self.flashingMessage('firmwareFlasherHexCorrupted', self.FLASH_MESSAGE_TYPES.INVALID);
                                        }
                                    });
                                } else {
                                    clearBufferedFirmware();
                                    try {
                                        self.unifiedTargetConfig = cleanUnifiedConfigFile(e.target.result);
                                        self.unifiedTargetConfigName = file.name;
                                        self.isConfigLocal = true;
                                        flashingMessageLocal();
                                    } catch(err) {
                                        self.flashingMessage('firmwareFlasherConfigCorrupted', self.FLASH_MESSAGE_TYPES.INVALID);
                                        GUI.log(i18n.getMessage('firmwareFlasherConfigCorruptedLogMessage'));
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
        $('select[name="firmware_version"]').change(function(evt){
            $('div.release_info').slideUp();

            if (!self.localFirmwareLoaded) {
                self.enableFlashing(false);
                self.flashingMessage(i18n.getMessage('firmwareFlasherLoadFirmwareFile'), self.FLASH_MESSAGE_TYPES.NEUTRAL);
                if(self.parsed_hex && self.parsed_hex.bytes_total) {
                    // Changing the board triggers a version change, so we need only dump it here.
                    console.log('throw out loaded hex');
                    self.intel_hex = undefined;
                    self.parsed_hex = undefined;
                }
            }

            let release = $("option:selected", evt.target).data("summary");
            let isCached = FirmwareCache.has(release);
            if (evt.target.value=="0" || isCached) {
                if (isCached) {
                    analytics.setFirmwareData(analytics.DATA.FIRMWARE_SOURCE, 'cache');

                    FirmwareCache.get(release, cached => {
                        analytics.setFirmwareData(analytics.DATA.FIRMWARE_NAME, release.file);
                        console.info("Release found in cache: " + release.file);
                        onLoadSuccess(cached.hexdata, release);
                    });
                }
                $("a.load_remote_file").addClass('disabled');
            }
            else {
                $("a.load_remote_file").removeClass('disabled');
            }
        });

        $('a.load_remote_file').click(function (evt) {
            self.enableFlashing(false);
            self.localFirmwareLoaded = false;

            analytics.setFirmwareData(analytics.DATA.FIRMWARE_SOURCE, 'http');

            if ($('select[name="firmware_version"]').val() == "0") {
                GUI.log(i18n.getMessage('firmwareFlasherNoFirmwareSelected'));
                return;
            }

            function failed_to_load() {
                $('span.progressLabel').attr('i18n','firmwareFlasherFailedToLoadOnlineFirmware').removeClass('i18n-replaced');
                $("a.load_remote_file").removeClass('disabled');
                $("a.load_remote_file").text(i18n.getMessage('firmwareFlasherButtonLoadOnline'));
                i18n.localizePage();
            }

            var summary = $('select[name="firmware_version"] option:selected').data('summary');
            if (summary) { // undefined while list is loading or while running offline
                if (self.isConfigLocal && FirmwareCache.has(summary)) {
                    // Load the .hex from Cache if available when the user is providing their own config.
                    analytics.setFirmwareData(analytics.DATA.FIRMWARE_SOURCE, 'cache');
                    FirmwareCache.get(summary, cached => {
                        analytics.setFirmwareData(analytics.DATA.FIRMWARE_NAME, summary.file);
                        console.info("Release found in cache: " + summary.file);
                        onLoadSuccess(cached.hexdata, summary);
                    });
                    return;
                }
                analytics.setFirmwareData(analytics.DATA.FIRMWARE_NAME, summary.file);
                $("a.load_remote_file").text(i18n.getMessage('firmwareFlasherButtonDownloading'));
                $("a.load_remote_file").addClass('disabled');
                $.get(summary.url, onLoadSuccess).fail(failed_to_load);
            } else {
                $('span.progressLabel').attr('i18n','firmwareFlasherFailedToLoadOnlineFirmware').removeClass('i18n-replaced');
                i18n.localizePage();
            }
        });

        function flashFirmware(firmware) {
            var options = {};

            var eraseAll = false;
            if ($('input.erase_chip').is(':checked')) {
                options.erase_chip = true;

                eraseAll = true
            }
            analytics.setFirmwareData(analytics.DATA.FIRMWARE_ERASE_ALL, eraseAll.toString());

            if (String($('div#port-picker #port').val()) != 'DFU') {
                if (String($('div#port-picker #port').val()) != '0') {
                    var port = String($('div#port-picker #port').val()), baud;
                    baud = 115200;

                    if ($('input.updating').is(':checked')) {
                        options.no_reboot = true;
                    } else {
                        options.reboot_baud = parseInt($('div#port-picker #baud').val());
                    }

                    if ($('input.flash_manual_baud').is(':checked')) {
                        baud = parseInt($('#flash_manual_baud_rate').val());
                    }

                    analytics.sendEvent(analytics.EVENT_CATEGORIES.FIRMWARE, 'Flashing', self.unifiedTargetConfigName || null);

                    STM32.connect(port, baud, firmware, options);
                } else {
                    console.log('Please select valid serial port');
                    GUI.log(i18n.getMessage('firmwareFlasherNoValidPort'));
                }
            } else {
                analytics.sendEvent(analytics.EVENT_CATEGORIES.FIRMWARE, 'Flashing', self.unifiedTargetConfigName || null);

                STM32DFU.connect(usbDevices, firmware, options);
            }
        }

        $('a.flash_firmware').click(function () {
            if (!$(this).hasClass('disabled')) {
                if (!GUI.connect_lock) { // button disabled while flashing is in progress
                    if (self.parsed_hex != false) {
                        try {
                            if (self.unifiedTargetConfig && !self.parsed_hex.configInserted) {
                                var configInserter = new ConfigInserter();

                                if (configInserter.insertConfig(self.parsed_hex, self.unifiedTargetConfig)) {
                                    self.parsed_hex.configInserted = true;
                                } else {
                                    console.log('Firmware does not support custom defaults.');

                                    self.unifiedTargetConfig = undefined;
                                    self.unifiedTargetConfigName = undefined;
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
        });

        $(document).on('click', 'span.progressLabel a.save_firmware', function () {
            var summary = $('select[name="firmware_version"] option:selected').data('summary');
            chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: summary.file, accepts: [{description: 'HEX files', extensions: ['hex']}]}, function (fileEntry) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    return;
                }

                chrome.fileSystem.getDisplayPath(fileEntry, function (path) {
                    console.log('Saving firmware to: ' + path);

                    // check if file is writable
                    chrome.fileSystem.isWritableEntry(fileEntry, function (isWritable) {
                        if (isWritable) {
                            var blob = new Blob([self.intel_hex], {type: 'text/plain'});

                            fileEntry.createWriter(function (writer) {
                                var truncated = false;

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
                                };

                                writer.write(blob);
                            }, function (e) {
                                console.error(e);
                            });
                        } else {
                            console.log('You don\'t have write permissions for this file, sorry.');
                            GUI.log(i18n.getMessage('firmwareFlasherWritePermissions'));
                        }
                    });
                });
            });
        });

        chrome.storage.local.get('selected_build_type', function (result) {
            // ensure default build type is selected
            buildType_e.val(result.selected_build_type || 0).trigger('change');
        });

        ConfigStorage.get('no_reboot_sequence', function (result) {
            if (result.no_reboot_sequence) {
                $('input.updating').prop('checked', true);
                $('.flash_on_connect_wrapper').show();
            } else {
                $('input.updating').prop('checked', false);
            }

            // bind UI hook so the status is saved on change
            $('input.updating').change(function() {
                var status = $(this).is(':checked');

                if (status) {
                    $('.flash_on_connect_wrapper').show();
                } else {
                    $('input.flash_on_connect').prop('checked', false).change();
                    $('.flash_on_connect_wrapper').hide();
                }

                ConfigStorage.set({'no_reboot_sequence': status});
            });

            $('input.updating').change();
        });

        ConfigStorage.get('flash_manual_baud', function (result) {
            if (result.flash_manual_baud) {
                $('input.flash_manual_baud').prop('checked', true);
            } else {
                $('input.flash_manual_baud').prop('checked', false);
            }

            // bind UI hook so the status is saved on change
            $('input.flash_manual_baud').change(function() {
                var status = $(this).is(':checked');
                ConfigStorage.set({'flash_manual_baud': status});
            });

            $('input.flash_manual_baud').change();
        });

        ConfigStorage.get('flash_manual_baud_rate', function (result) {
            $('#flash_manual_baud_rate').val(result.flash_manual_baud_rate);

            // bind UI hook so the status is saved on change
            $('#flash_manual_baud_rate').change(function() {
                var baud = parseInt($('#flash_manual_baud_rate').val());
                ConfigStorage.set({'flash_manual_baud_rate': baud});
            });

            $('input.flash_manual_baud_rate').change();
        });

        $('input.flash_on_connect').change(function () {
            var status = $(this).is(':checked');

            if (status) {
                var catch_new_port = function () {
                    PortHandler.port_detected('flash_detected_device', function (result) {
                        var port = result[0];

                        if (!GUI.connect_lock) {
                            GUI.log(i18n.getMessage('firmwareFlasherFlashTrigger', [port]));
                            console.log('Detected: ' + port + ' - triggering flash on connect');

                            // Trigger regular Flashing sequence
                            GUI.timeout_add('initialization_timeout', function () {
                                $('a.flash_firmware').click();
                            }, 100); // timeout so bus have time to initialize after being detected by the system
                        } else {
                            GUI.log(i18n.getMessage('firmwareFlasherPreviousDevice', [port]));
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

        ConfigStorage.get('erase_chip', function (result) {
            if (result.erase_chip) {
                $('input.erase_chip').prop('checked', true);
            } else {
                $('input.erase_chip').prop('checked', false);
            }

            $('input.erase_chip').change(function () {
                ConfigStorage.set({'erase_chip': $(this).is(':checked')});
            }).change();
        });

        chrome.storage.local.get('show_development_releases', function (result) {
            $('input.show_development_releases')
            .prop('checked', result.show_development_releases)
            .change(function () {
                chrome.storage.local.set({'show_development_releases': $(this).is(':checked')});
            }).change();

        });

        $(document).keypress(function (e) {
            if (e.which == 13) { // enter
                // Trigger regular Flashing sequence
                $('a.flash_firmware').click();
            }
        });

        // Update Firmware button at top
        $('div#flashbutton a.flash_state').addClass('active');
        $('div#flashbutton a.flash').addClass('active');
        GUI.content_ready(callback);
    }

    self.jenkinsLoader.loadJobs('Firmware', () => {
       $('#content').load("./tabs/firmware_flasher.html", onDocumentLoad);
    });
};

TABS.firmware_flasher.cleanup = function (callback) {
    PortHandler.flush_callbacks();
    FirmwareCache.unload();

    // unbind "global" events
    $(document).unbind('keypress');
    $(document).off('click', 'span.progressLabel a');

    // Update Firmware button at top
    $('div#flashbutton a.flash_state').removeClass('active');
    $('div#flashbutton a.flash').removeClass('active');

    analytics.resetFirmwareData();

    if (callback) callback();
};

TABS.firmware_flasher.enableFlashing = function (enabled) {
    var self = this;

    if (enabled) {
        $('a.flash_firmware').removeClass('disabled');
    } else {
        $('a.flash_firmware').addClass('disabled');
    }
}

TABS.firmware_flasher.FLASH_MESSAGE_TYPES = {NEUTRAL : 'NEUTRAL', 
                                             VALID   : 'VALID', 
                                             INVALID : 'INVALID',
                                             ACTION  : 'ACTION'};

TABS.firmware_flasher.flashingMessage = function(message, type) {
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
    if (message != null) {
        if (i18next.exists(message)) {
            progressLabel_e.attr('i18n',message).removeClass('i18n-replaced');
            i18n.localizePage();
        } else {
            progressLabel_e.removeAttr('i18n');
            progressLabel_e.html(message);
        }
    }

    return self;
};

TABS.firmware_flasher.flashProgress = function(value) {
    $('.progress').val(value);

    return this;
};
