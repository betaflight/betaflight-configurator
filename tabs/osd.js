'use strict';

TABS.osd = {};
TABS.osd.initialize = function (callback) {
    var self = this;

    console.log('Initialize OSD');
    if (GUI.active_tab != 'osd') {
        GUI.active_tab = 'osd';
        googleAnalytics.sendAppView('OSD');
    }


    var font_mcm = false, // standard mcm font in string format
        parsed_mcm = false; // parsed raw mcm in array format

    $('#content').load("./tabs/osd.html", function () {
        // translate to user-selected language
        localize();

        function parse_mcm(str, callback) {
            // parsing hex in different thread
            var worker = new Worker('./js/workers/mcm_parser.js');

            // "callback"
            worker.onmessage = function (event) {
                callback(event.data);
            };

            // send data/string over for processing
            worker.postMessage(str);
        }


        // UI Hooks
        $('a.load_font_file').click(function () {
            chrome.fileSystem.chooseEntry({type: 'openFile', accepts: [{extensions: ['mcm']}]}, function (fileEntry) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);

                    return;
                }

                chrome.fileSystem.getDisplayPath(fileEntry, function (path) {
                    console.log('Loading file from: ' + path);

                    fileEntry.file(function (file) {
                        var reader = new FileReader();

                        reader.onprogress = function (e) {
                            if (e.total > 1048576) { // 1 MB
                                // dont allow reading files bigger then 1 MB
                                console.log('File limit (1 MB) exceeded, aborting');
                                reader.abort();
                            }
                        };

                        reader.onloadend = function(e) {
                            if (e.total != 0 && e.total == e.loaded) {
                                console.log('File loaded');

                                font_mcm = e.target.result;

                                parse_mcm(font_mcm, function (data) {
                                    parsed_mcm = data;

                                    if (parsed_mcm) {
                                        googleAnalytics.sendEvent('Flashing', 'Font', 'local');
                                        $('a.flash_font').removeClass('disabled');

                                        $('span.progressLabel').text('Loaded Local Font: (' + parsed_mcm.bytes_total + ' bytes)');
                                    } else {
                                        $('span.progressLabel').text(chrome.i18n.getMessage('fontFlasherHexCorrupted'));
                                    }
                                });
                            }
                        };

                        reader.readAsText(file);
                    });
                });
            });
        });

        function asyncLoop(iterations, func, callback) {
            var index = 0;
            var done = false;
            var loop = {
                next: function() {
                    if (done) {
                        return;
                    }

                    if (index < iterations) {
                        index++;
                        func(loop);

                    } else {
                        done = true;
                        callback();
                    }
                },

                iteration: function() {
                    return index - 1;
                },

                break: function() {
                    done = true;
                    callback();
                }
            };
            loop.next();
            return loop;
        }
        $('a.flash_font').click(function () {
            if (!$(this).hasClass('disabled')) {
                if (!GUI.connect_lock) { // button disabled while flashing is in progress
                    if (parsed_mcm != false) {
                        var addr = 0;
                        // send loaded font here
                        asyncLoop(256, function(loop) {
                                var i = loop.iteration();
                                var data = parsed_mcm.data.slice(i * 64, i * 64 + 64);
                                MSP.osdCharWrite(i, data, function(result) {
                                    // log the iteration
                                    $('.progress').val(Math.round(loop.iteration()*64 / (parsed_mcm.bytes_total) * 100));
                                    // Okay, for cycle could continue
                                    loop.next();
                                })
                        }, function() { console.log('cycle ended') });
                   } else {
                        $('span.progressLabel').text(chrome.i18n.getMessage('fontFlasherFirmwareNotLoaded'));
                    }
                }
            }
        });

        $(document).on('click', 'span.progressLabel a.save_font', function () {
            chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: 'baseflight', accepts: [{extensions: ['mcm']}]}, function (fileEntry) {
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
                            GUI.log('You don\'t have <span style="color: red">write permissions</span> for this file');
                        }
                    });
                });
            });
        });

        $(document).keypress(function (e) {
            if (e.which == 13) { // enter
                // Trigger regular Flashing sequence
                $('a.flash_font').click();
            }
        });

        GUI.content_ready(callback);
    });
};

TABS.osd.cleanup = function (callback) {
    PortHandler.flush_callbacks();

    // unbind "global" events
    $(document).unbind('keypress');
    $(document).off('click', 'span.progressLabel a');

    if (callback) callback();
};
