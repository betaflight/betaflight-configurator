'use strict';

TABS.firmware_flasher = {
    releases: null,
    releaseChecker: new ReleaseChecker('firmware', 'https://api.github.com/repos/betaflight/betaflight/releases'),
    jenkinsLoader: new JenkinsLoader('https://ci.betaflight.tech'),
    localFileLoaded: false,
};

TABS.firmware_flasher.initialize = function (callback) {
    var self = this;

    if (GUI.active_tab != 'firmware_flasher') {
        GUI.active_tab = 'firmware_flasher';
    }


    var intel_hex = false, // standard intel hex in string format
        parsed_hex = false; // parsed raw hex in array format

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

        function process_hex(data, summary) {
            intel_hex = data;

            analytics.setFirmwareData(analytics.DATA.FIRMWARE_CHECKSUM, objectHash.sha1(intel_hex));

            parse_hex(intel_hex, function (data) {
                parsed_hex = data;

                if (parsed_hex) {
                    analytics.setFirmwareData(analytics.DATA.FIRMWARE_SIZE, parsed_hex.bytes_total);

                    if (!FirmwareCache.has(summary)) {
                        FirmwareCache.put(summary, intel_hex);
                    }

                    self.flashingMessage('<a class="save_firmware" href="#" title="Save Firmware">' + i18n.getMessage('firmwareFlasherFirmwareOnlineLoaded', parsed_hex.bytes_total) + '</a>', 
                                         self.FLASH_MESSAGE_TYPES.NEUTRAL);

                    self.enableFlashing(true);

                    $('div.release_info .target').text(summary.target);
                    $('div.release_info .name').text(summary.version).prop('href', summary.releaseUrl);
                    $('div.release_info .date').text(summary.date);
                    $('div.release_info .status').text(summary.status);
                    $('div.release_info .file').text(summary.file).prop('href', summary.url);

                    var formattedNotes = summary.notes.replace(/#(\d+)/g, '[#$1](https://github.com/betaflight/betaflight/pull/$1)');
                    formattedNotes = marked(formattedNotes);
                    $('div.release_info .notes').html(formattedNotes);
                    $('div.release_info .notes').find('a').each(function() {
                        $(this).attr('target', '_blank');
                    });

                    $('div.release_info').slideDown();

                } else {
                    self.flashingMessage('firmwareFlasherHexCorrupted', self.FLASH_MESSAGE_TYPES.INVALID);
                }
            });
        }

        function onLoadSuccess(data, summary) {
            summary = typeof summary === "object" 
                ? summary 
                : $('select[name="firmware_version"] option:selected').data('summary');
            process_hex(data, summary);
            $("a.load_remote_file").removeClass('disabled');
            $("a.load_remote_file").text(i18n.getMessage('firmwareFlasherButtonLoadOnline'));
        };
    
        function buildJenkinsBoardOptions(builds) {
            if (!builds) {
                $('select[name="board"]').empty().append('<option value="0">Offline</option>');
                $('select[name="firmware_version"]').empty().append('<option value="0">Offline</option>');

                return;
            }

            var boards_e = $('select[name="board"]');
            var versions_e = $('select[name="firmware_version"]');

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
                                    )).data('summary', descriptor);
                            boards_e.append(select_e);
                        }
                    });
                });

            TABS.firmware_flasher.releases = builds;

            chrome.storage.local.get('selected_board', function (result) {
                if (result.selected_board) {
                    var boardBuilds = builds[result.selected_board]
                    $('select[name="board"]').val(boardBuilds ? result.selected_board : 0).trigger('change');
                }
            });
        }

        function buildBoardOptions(releaseData, showDevReleases) {
            if (!releaseData) {
                $('select[name="board"]').empty().append('<option value="0">Offline</option>');
                $('select[name="firmware_version"]').empty().append('<option value="0">Offline</option>');
            } else {
                var boards_e = $('select[name="board"]');
                var versions_e = $('select[name="firmware_version"]');

                var releases = {};
                var sortedTargets = [];
                var unsortedTargets = [];
                releaseData.forEach(function(release){
                    release.assets.forEach(function(asset){
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

                releaseData.forEach(function(release){
                    var versionFromTagExpression = /v?(.*)/;
                    var matchVersionFromTag = versionFromTagExpression.exec(release.tag_name);
                    var version = matchVersionFromTag[1];

                    release.assets.forEach(function(asset){
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
                        var formattedDate = ("0" + date.getDate()).slice(-2) + "-" + ("0"+(date.getMonth()+1)).slice(-2) + "-" + date.getFullYear() + " " + ("0" + date.getHours()).slice(-2) + ":" + ("0" + date.getMinutes()).slice(-2);

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
                var selectTargets = [];
                Object.keys(releases)
                    .sort()
                    .forEach(function(target, i) {
                        var descriptors = releases[target];
                        descriptors.forEach(function(descriptor){
                            if($.inArray(target, selectTargets) == -1) {
                                selectTargets.push(target);
                                var select_e =
                                        $("<option value='{0}'>{0}</option>".format(
                                                descriptor.target
                                        )).data('summary', descriptor);
                                boards_e.append(select_e);
                            }
                        });
                    });
                TABS.firmware_flasher.releases = releases;

                chrome.storage.local.get('selected_board', function (result) {
                    if (result.selected_board) {
                        var boardReleases = releases[result.selected_board]
                        $('select[name="board"]').val(boardReleases ? result.selected_board : 0).trigger('change');
                    }
                });
            }
        };

        var buildTypes = [
            {
                tag: 'firmwareFlasherOptionLabelBuildTypeRelease',
                loader: () => self.releaseChecker.loadReleaseData(releaseData => buildBoardOptions(releaseData, false))
            },
            {
                tag: 'firmwareFlasherOptionLabelBuildTypeReleaseCandidate',
                loader: () => self.releaseChecker.loadReleaseData(releaseData => buildBoardOptions(releaseData, true))
            }
        ];

        var ciBuildsTypes = self.jenkinsLoader._jobs.map(job => {
            return {
                title: job.title,
                loader: () => self.jenkinsLoader.loadBuilds(job.name, buildJenkinsBoardOptions)
            };
        })
        var buildTypesToShow;

        var buildType_e = $('select[name="build_type"]');
        function buildBuildTypeOptionsList() {
            buildType_e.empty();
            buildTypesToShow.forEach((build, index) => {
                buildType_e.append($("<option value='{0}' {1}>{2}</option>".format(index,build.tag ? 'i18n="' + build.tag + '" ' : '', build.tag ? i18n.getMessage(build.tag) : build.title)))
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
            .append($("<option value='0' i18n='firmwareFlasherOptionLabelSelectBoard'></option>"));

            $('select[name="firmware_version"]').empty()
            .append($("<option value='0' i18n='firmwareFlasherOptionLabelSelectFirmwareVersion'></option>"));

            if (!GUI.connect_lock) {
                buildTypesToShow[build_type].loader();
            }

            chrome.storage.local.set({'selected_build_type': build_type});
            i18n.localizePage();
        });

        $('select[name="board"]').change(function() {
            $("a.load_remote_file").addClass('disabled');
            var target = $(this).val();

            if (!GUI.connect_lock) {
                self.flashingMessage('firmwareFlasherLoadFirmwareFile', self.FLASH_MESSAGE_TYPES.NEUTRAL)
                    .flashProgress(0);

                $('div.git_info').slideUp();
                $('div.release_info').slideUp();

                if (!self.localFileLoaded) {
                    self.enableFlashing(false);
                }

                var versions_e = $('select[name="firmware_version"]').empty();
                if(target == 0) {
                    versions_e.append($("<option value='0'>{0}</option>".format(i18n.getMessage('firmwareFlasherOptionLabelSelectFirmwareVersion'))));
                } else {
                    versions_e.append($("<option value='0'>{0} {1}</option>".format(i18n.getMessage('firmwareFlasherOptionLabelSelectFirmwareVersionFor'), target)));

                    TABS.firmware_flasher.releases[target].forEach(function(descriptor) {
                        var select_e =
                                $("<option value='{0}'>{0} - {1} - {2}</option>".format(
                                        descriptor.version,
                                        descriptor.target,
                                        descriptor.date
                                ))
                                .css("font-weight", FirmwareCache.has(descriptor)
                                        ? "bold"
                                        : "normal"
                                )
                                .data('summary', descriptor);

                        versions_e.append(select_e);
                    });
                }

                // Assume flashing latest, so default to it.
                versions_e.prop("selectedIndex", 1).change();
            }
            chrome.storage.local.set({'selected_board': target});
        });

        // UI Hooks
        $('a.load_file').click(function () {
            self.enableFlashing(false);
            self.localFileLoaded = true;

            analytics.setFirmwareData(analytics.DATA.FIRMWARE_CHANNEL, undefined);
            analytics.setFirmwareData(analytics.DATA.FIRMWARE_SOURCE, 'file');

            chrome.fileSystem.chooseEntry({type: 'openFile', accepts: [{description: 'HEX files', extensions: ['hex']}]}, function (fileEntry) {
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

                                intel_hex = e.target.result;

                                analytics.setFirmwareData(analytics.DATA.FIRMWARE_CHECKSUM, objectHash.sha1(intel_hex));

                                parse_hex(intel_hex, function (data) {
                                    parsed_hex = data;

                                    if (parsed_hex) {
                                        analytics.setFirmwareData(analytics.DATA.FIRMWARE_SIZE, parsed_hex.bytes_total);

                                        self.enableFlashing(true);

                                        self.flashingMessage(i18n.getMessage('firmwareFlasherFirmwareLocalLoaded', parsed_hex.bytes_total), self.FLASH_MESSAGE_TYPES.NEUTRAL);
                                    } else {
                                        self.flashingMessage('firmwareFlasherHexCorrupted', self.FLASH_MESSAGE_TYPES.INVALID);
                                    }
                                });
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

            if (!self.localFileLoaded) {
                self.enableFlashing(false);
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
            self.localFileLoaded = false;

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
                analytics.setFirmwareData(analytics.DATA.FIRMWARE_NAME, summary.file);
                $("a.load_remote_file").text(i18n.getMessage('firmwareFlasherButtonDownloading'));
                $("a.load_remote_file").addClass('disabled');
                $.get(summary.url, onLoadSuccess).fail(failed_to_load);
            } else {
                $('span.progressLabel').attr('i18n','firmwareFlasherFailedToLoadOnlineFirmware').removeClass('i18n-replaced');
                i18n.localizePage();
            }
        });

        $('a.flash_firmware').click(function () {
            if (!$(this).hasClass('disabled')) {
                if (!GUI.connect_lock) { // button disabled while flashing is in progress
                    if (parsed_hex != false) {
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

                                analytics.sendEvent(analytics.EVENT_CATEGORIES.FIRMWARE, 'Flashing');

                                STM32.connect(port, baud, parsed_hex, options);
                            } else {
                                console.log('Please select valid serial port');
                                GUI.log(i18n.getMessage('firmwareFlasherNoValidPort'));
                            }
                        } else {
                            analytics.sendEvent(analytics.EVENT_CATEGORIES.FIRMWARE, 'Flashing');

                            STM32DFU.connect(usbDevices, parsed_hex, options);
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
                            var blob = new Blob([intel_hex], {type: 'text/plain'});

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

        chrome.storage.local.get('no_reboot_sequence', function (result) {
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

                chrome.storage.local.set({'no_reboot_sequence': status});
            });

            $('input.updating').change();
        });

        chrome.storage.local.get('flash_manual_baud', function (result) {
            if (result.flash_manual_baud) {
                $('input.flash_manual_baud').prop('checked', true);
            } else {
                $('input.flash_manual_baud').prop('checked', false);
            }

            // bind UI hook so the status is saved on change
            $('input.flash_manual_baud').change(function() {
                var status = $(this).is(':checked');
                chrome.storage.local.set({'flash_manual_baud': status});
            });

            $('input.flash_manual_baud').change();
        });

        chrome.storage.local.get('flash_manual_baud_rate', function (result) {
            $('#flash_manual_baud_rate').val(result.flash_manual_baud_rate);

            // bind UI hook so the status is saved on change
            $('#flash_manual_baud_rate').change(function() {
                var baud = parseInt($('#flash_manual_baud_rate').val());
                chrome.storage.local.set({'flash_manual_baud_rate': baud});
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

        chrome.storage.local.get('erase_chip', function (result) {
            if (result.erase_chip) {
                $('input.erase_chip').prop('checked', true);
            } else {
                $('input.erase_chip').prop('checked', false);
            }

            $('input.erase_chip').change(function () {
                chrome.storage.local.set({'erase_chip': $(this).is(':checked')});
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
