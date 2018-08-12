'use strict';

TABS.cli = {
    lineDelayMs: 15,
    profileSwitchDelayMs: 100,
    outputHistory: "",
    cliBuffer: ""
};

function removePromptHash(promptText) {
    return promptText.replace(/^# /, '');
}

function cliBufferCharsToDelete(command, buffer) {
    var commonChars = 0;
    for (var i = 0;i < buffer.length;i++) {
        if (command[i] === buffer[i]) {
            commonChars++;
        } else {
            break;
        }
    }

    return buffer.length - commonChars;
}

function commandWithBackSpaces(command, buffer, noOfCharsToDelete) {
    const backspace = String.fromCharCode(127);
    return backspace.repeat(noOfCharsToDelete) + command.substring(buffer.length - noOfCharsToDelete, command.length);
}

function getCliCommand(command, cliBuffer) {
    const buffer = removePromptHash(cliBuffer);
    const bufferRegex = new RegExp('^' + buffer, 'g');
    if (command.match(bufferRegex)) {
        return command.replace(bufferRegex, '');
    }

    const noOfCharsToDelete = cliBufferCharsToDelete(command, buffer);

    return commandWithBackSpaces(command, buffer, noOfCharsToDelete);
}

TABS.cli.initialize = function (callback) {
    var self = this;

    if (GUI.active_tab != 'cli') {
        GUI.active_tab = 'cli';
    }
    
    self.outputHistory = "";
    self.cliBuffer = "";

    $('#content').load("./tabs/cli.html", function () {
        // translate to user-selected language
        i18n.localizePage();

        CONFIGURATOR.cliActive = true;

        var textarea = $('.tab-cli textarea');

        $('.tab-cli .save').click(function() {
            var prefix = 'cli';
            var suffix = 'txt';

            var filename = generateFilename(prefix, suffix);

            var accepts = [{
                description: suffix.toUpperCase() + ' files', extensions: [suffix],
            }];

            chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: filename, accepts: accepts}, function(entry) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    return;
                }

                if (!entry) {
                    console.log('No file selected');
                    return;
                }

                entry.createWriter(function (writer) {
                    writer.onerror = function (){
                        console.error('Failed to write file');
                    };

                    writer.onwriteend = function () {
                        if (self.outputHistory.length > 0 && writer.length === 0) {
                            writer.write(new Blob([self.outputHistory], {type: 'text/plain'}));
                        } else {
                            analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'CliSave', self.outputHistory.length);

                            console.log('write complete');
                        }
                    };

                    writer.truncate(0);
                }, function (){
                    console.error('Failed to get file writer');
                });
            });
        });

        // Tab key detection must be on keydown,
        // `keypress`/`keyup` happens too late, as `textarea` will have already lost focus.
        textarea.keydown(function (event) {
            const tabKeyCode = 9;
            if (event.which == tabKeyCode) {
                // prevent default tabbing behaviour
                event.preventDefault();
                const outString = textarea.val();
                const lastCommand = outString.split("\n").pop();
                const command = getCliCommand(lastCommand, self.cliBuffer);
                if (command) {
                    self.sendAutoComplete(command);
                    textarea.val('');
                }
            }
        });

        textarea.keypress(function (event) {
            const enterKeyCode = 13;
            if (event.which == enterKeyCode) {
                event.preventDefault(); // prevent the adding of new line

                var out_string = textarea.val();
                self.history.add(out_string.trim());

                var outputArray = out_string.split("\n");
                Promise.reduce(outputArray, function(delay, line, index) {
                    return new Promise(function (resolve) {
                        GUI.timeout_add('CLI_send_slowly', function () {
                            var processingDelay = self.lineDelayMs;
                            if (line.toLowerCase().startsWith('profile')) {
                                processingDelay = self.profileSwitchDelayMs;
                            }
                            const isLastCommand = outputArray.length === index + 1;
                            if (isLastCommand && self.cliBuffer) {
                                line = getCliCommand(line, self.cliBuffer);
                            }
                            self.sendLine(line, function () {
                                resolve(processingDelay);
                            });
                        }, delay)
                    })
                }, 0);

                textarea.val('');
            }
        });

        textarea.keyup(function (event) {
            var keyUp = {38: true},
                keyDown = {40: true};

            if (event.keyCode in keyUp) {
                textarea.val(self.history.prev());
            }

            if (event.keyCode in keyDown) {
                textarea.val(self.history.next());
            }
        });

        // give input element user focus
        textarea.focus();

        GUI.timeout_add('enter_cli', function enter_cli() {
            // Enter CLI mode
            var bufferOut = new ArrayBuffer(1);
            var bufView = new Uint8Array(bufferOut);

            bufView[0] = 0x23; // #

            serial.send(bufferOut);
        }, 250);

        GUI.content_ready(callback);
    });
};

TABS.cli.history = {
    history: [],
    index:  0
};

TABS.cli.history.add = function (str) {
    this.history.push(str);
    this.index = this.history.length;
};

TABS.cli.history.prev = function () {
    if (this.index > 0) this.index -= 1;
    return this.history[this.index];
};

TABS.cli.history.next = function () {
    if (this.index < this.history.length) this.index += 1;
    return this.history[this.index - 1];
};

const backspaceCode = 8;
const lineFeedCode = 10;
const carriageReturnCode = 13;

function writeToOutput(text) {
    $('.tab-cli .window .wrapper').append(text);
    $('.tab-cli .window').scrollTop($('.tab-cli .window .wrapper').height());
}

function writeLineToOutput(text) {
    writeToOutput(text + "<br>");
}

function setPrompt(text) {
    $('.tab-cli textarea').val(text);
}

TABS.cli.read = function (readInfo) {
    /*  Some info about handling line feeds and carriage return

        line feed = LF = \n = 0x0A = 10
        carriage return = CR = \r = 0x0D = 13

        MAC only understands CR
        Linux and Unix only understand LF
        Windows understands (both) CRLF
        Chrome OS currently unknown
    */
    var data = new Uint8Array(readInfo.data),
        validateText = "",
        sequenceCharsToSkip = 0;

    for (var i = 0; i < data.length; i++) {
        const currentChar = String.fromCharCode(data[i]);

        if (!CONFIGURATOR.cliValid) {
            // try to catch part of valid CLI enter message
            validateText += currentChar;
            writeToOutput(currentChar);
            continue;
        }

        const escapeSequenceCode = 27;
        const escapeSequenceCharLength = 3;
        if (data[i] == escapeSequenceCode && !sequenceCharsToSkip) { // ESC + other
            sequenceCharsToSkip = escapeSequenceCharLength;
        }

        if (sequenceCharsToSkip) {
            sequenceCharsToSkip--;
            continue;
        }

        switch (data[i]) {
            case lineFeedCode:
                if (GUI.operating_system === "Windows") {
                    writeLineToOutput(this.cliBuffer);
                    this.cliBuffer = "";
                }
                break;
            case carriageReturnCode:
                if (GUI.operating_system !== "Windows") {
                    writeLineToOutput(this.cliBuffer);
                    this.cliBuffer = "";
                }
                break;
            case 60:
                this.cliBuffer += '&lt';
                break;
            case 62:
                this.cliBuffer += '&gt';
                break;
            case backspaceCode:
                this.cliBuffer = this.cliBuffer.slice(0, -1);
                break;

            default:
                this.cliBuffer += currentChar;
        }

        this.outputHistory += currentChar;

        if (this.cliBuffer == 'Rebooting') {
            CONFIGURATOR.cliActive = false;
            CONFIGURATOR.cliValid = false;
            GUI.log(i18n.getMessage('cliReboot'));
            GUI.log(i18n.getMessage('deviceRebooting'));

            if (BOARD.find_board_definition(CONFIG.boardIdentifier).vcp) { // VCP-based flight controls may crash old drivers, we catch and reconnect
                $('a.connect').click();
                GUI.timeout_add('start_connection', function start_connection() {
                    $('a.connect').click();
                }, 2500);
            } else {

                GUI.timeout_add('waiting_for_bootup', function waiting_for_bootup() {
                    MSP.send_message(MSPCodes.MSP_STATUS, false, false, function () {
                        GUI.log(i18n.getMessage('deviceReady'));
                        if (!GUI.tab_switch_in_progress) {
                            $('#tabs ul.mode-connected .tab_setup a').click();
                        }
                    });
                }, 1500); // 1500 ms seems to be just the right amount of delay to prevent data request timeouts
            }
        }

    }

    if (!CONFIGURATOR.cliValid && validateText.indexOf('CLI') !== -1) {
        GUI.log(i18n.getMessage('cliEnter'));
        CONFIGURATOR.cliValid = true;
        validateText = "";
    }

    setPrompt(removePromptHash(this.cliBuffer));
};

TABS.cli.sendLine = function (line, callback) {
    this.send(line + '\n', callback);
};

TABS.cli.sendAutoComplete = function (line, callback) {
    this.send(line + '\t', callback);
};

TABS.cli.send = function (line, callback) {
    var bufferOut = new ArrayBuffer(line.length);
    var bufView = new Uint8Array(bufferOut);

    for (var c_key = 0; c_key < line.length; c_key++) {
        bufView[c_key] = line.charCodeAt(c_key);
    }

    serial.send(bufferOut, callback);
};

TABS.cli.cleanup = function (callback) {
    if (!(CONFIGURATOR.connectionValid && CONFIGURATOR.cliValid && CONFIGURATOR.cliActive)) {
        if (callback) callback();
        return;
    }
    this.send(getCliCommand('exit\r', this.cliBuffer), function (writeInfo) {
        // we could handle this "nicely", but this will do for now
        // (another approach is however much more complicated):
        // we can setup an interval asking for data lets say every 200ms, when data arrives, callback will be triggered and tab switched
        // we could probably implement this someday
        GUI.timeout_add('waiting_for_bootup', function waiting_for_bootup() {
            if (callback) callback();
        }, 1000); // if we dont allow enough time to reboot, CRC of "first" command sent will fail, keep an eye for this one
        CONFIGURATOR.cliActive = false;
    });
};
