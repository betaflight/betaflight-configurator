'use strict';

TABS.cli = {
    lineDelayMs: 15,
    profileSwitchDelayMs: 100,
    outputHistory: "",
    cliBuffer: "",
    GUI: {
        snippetPreviewWindow: null,
    },
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

function copyToClipboard(text, nwGui) {
    function onCopySuccessful() {
        const button = $('.tab-cli .copy');
        const origText = button.text();
        const origWidth = button.css("width");
        button.text(i18n.getMessage("cliCopySuccessful"));
        button.css({
            width: origWidth,
            textAlign: "center",
        });
        setTimeout(() => {
            button.text(origText);
            button.css({
                width: "",
                textAlign: "",
            });
        }, 1500);
    }

    function onCopyFailed(ex) {
        console.warn(ex);
    }

    function nwCopy(text) {
        try {
            let clipboard = nwGui.Clipboard.get();
            clipboard.set(text, "text");
            onCopySuccessful();
        } catch (ex) {
            onCopyFailed(ex);
        }
    }

    function webCopy(text) {
        navigator.clipboard.writeText(text)
            .then(onCopySuccessful, onCopyFailed);
    }

    let copyFunc = nwGui ? nwCopy : webCopy;
    copyFunc(text);
}

TABS.cli.initialize = function (callback, nwGui) {
    var self = this;

    if (GUI.active_tab != 'cli') {
        GUI.active_tab = 'cli';
    }
    
    self.outputHistory = "";
    self.cliBuffer = "";

    // nwGui variable is set in main.js
    const clipboardCopySupport = !(nwGui == null && !navigator.clipboard);
    const enterKeyCode = 13;

    function executeCommands(out_string) {
        self.history.add(out_string.trim());

        var outputArray = out_string.split("\n");
        Promise.reduce(outputArray, function(delay, line, index) {
            return new Promise(function (resolve) {
                GUI.timeout_add('CLI_send_slowly', function () {
                    var processingDelay = self.lineDelayMs;
                    line = line.trim();
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
}

    $('#content').load("./tabs/cli.html", function () {
        // translate to user-selected language
        i18n.localizePage();

        CONFIGURATOR.cliActive = true;

        var textarea = $('.tab-cli textarea[name="commands"]');

        CliAutoComplete.initialize(textarea, self.sendLine.bind(self), writeToOutput);
        $(CliAutoComplete).on('build:start', function() {
            textarea
                .val('')
                .attr('placeholder', i18n.getMessage('cliInputPlaceholderBuilding'))
                .prop('disabled', true);
        });
        $(CliAutoComplete).on('build:stop', function() {
            textarea
                .attr('placeholder', i18n.getMessage('cliInputPlaceholder'))
                .prop('disabled', false)
                .focus();
        });

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

        $('.tab-cli .clear').click(function() {
            self.outputHistory = "";
            $('.tab-cli .window .wrapper').empty();
        });

        if (clipboardCopySupport) {
            $('.tab-cli .copy').click(function() {
                copyToClipboard(self.outputHistory, nwGui);
            });
        } else {
            $('.tab-cli .copy').hide();
        }
        
        $('.tab-cli .load').click(function() {
            var accepts = [
                {
                    description: 'Config files', extensions: ["txt", "config"],
                },
                {
                    description: 'All files',
                },
            ];

            chrome.fileSystem.chooseEntry({type: 'openFile', accepts: accepts}, function(entry) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    return;
                }

                if (!entry) {
                    console.log('No file selected');
                    return;
                }
                
                let previewArea = $("#snippetpreviewcontent textarea#preview");

                function executeSnippet() {
                    const commands = previewArea.val();
                    executeCommands(commands);
                    self.GUI.snippetPreviewWindow.close();
                }

                function previewCommands(result) {
                    if (!self.GUI.snippetPreviewWindow) {
                        self.GUI.snippetPreviewWindow = new jBox("Modal", {
                            id: "snippetPreviewWindow",
                            width: 'auto',
                            height: 'auto',
                            closeButton: 'title',
                            animation: false,
                            isolateScroll: false,
                            title: i18n.getMessage("cliConfirmSnippetDialogTitle"),
                            content: $('#snippetpreviewcontent'),
                            onCreated: () =>  
                                $("#snippetpreviewcontent a.confirm").click(() => executeSnippet())
                            ,
                        });
                    }
                    previewArea.val(result);
                    self.GUI.snippetPreviewWindow.open();
                }

                entry.file((file) => {
                    let reader = new FileReader();
                    reader.onload = 
                        () => previewCommands(reader.result);
                    reader.onerror = () => console.error(reader.error);
                    reader.readAsText(file);
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

                if (!CliAutoComplete.isEnabled()) {
                    // Native FC autoComplete
                    const outString = textarea.val();
                    const lastCommand = outString.split("\n").pop();
                    const command = getCliCommand(lastCommand, self.cliBuffer);
                    if (command) {
                        self.sendNativeAutoComplete(command);
                        textarea.val('');
                    }
                }
                else if (!CliAutoComplete.isOpen() && !CliAutoComplete.isBuilding()) {
                    // force show autocomplete on Tab
                    CliAutoComplete.openLater(true);
                }
            }
        });

        textarea.keypress(function (event) {
            if (event.which == enterKeyCode) {
                event.preventDefault(); // prevent the adding of new line

                if (CliAutoComplete.isBuilding()) {
                    return; // silently ignore commands if autocomplete is still building
                }

                var out_string = textarea.val();
                executeCommands(out_string);
                textarea.val('');
            }
        });

        textarea.keyup(function (event) {
            var keyUp = {38: true},
                keyDown = {40: true};

            if (CliAutoComplete.isOpen()) {
                return; // disable history keys if autocomplete is open
            }

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
    if (CliAutoComplete.isBuilding()) {
        CliAutoComplete.builderParseLine(text);
        return; // suppress output if in building state
    }

    if (text.startsWith("###ERROR: ")) {
        writeToOutput('<span class="error_message">' + text + '</span><br>');
    } else {
        writeToOutput(text + "<br>");
    }
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
                this.outputHistory = this.outputHistory.slice(0, -1);
                continue;

            default:
                this.cliBuffer += currentChar;
        }

        if (!CliAutoComplete.isBuilding()) {
            // do not include the building dialog into the history
            this.outputHistory += currentChar;
        }

        if (this.cliBuffer == 'Rebooting') {
            CONFIGURATOR.cliActive = false;
            CONFIGURATOR.cliValid = false;
            GUI.log(i18n.getMessage('cliReboot'));
            reinitialiseConnection(self);
        }

    }

    if (!CONFIGURATOR.cliValid && validateText.indexOf('CLI') !== -1) {
        GUI.log(i18n.getMessage('cliEnter'));
        CONFIGURATOR.cliValid = true;
        // begin output history with the prompt (last line of welcome message)
        // this is to match the content of the history with what the user sees on this tab
        const lastLine = validateText.split("\n").pop();
        this.outputHistory = lastLine;
        validateText = "";

        if (CliAutoComplete.isEnabled() && !CliAutoComplete.isBuilding()) {
            // start building autoComplete
            CliAutoComplete.builderStart();
        }
    }

    if (!CliAutoComplete.isEnabled())
        // fallback to native autocomplete
        setPrompt(removePromptHash(this.cliBuffer));
};

TABS.cli.sendLine = function (line, callback) {
    this.send(line + '\n', callback);
};

TABS.cli.sendNativeAutoComplete = function (line, callback) {
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
    if (TABS.cli.GUI.snippetPreviewWindow) {
        TABS.cli.GUI.snippetPreviewWindow.destroy();
        TABS.cli.GUI.snippetPreviewWindow = null;
    }
    if (!(CONFIGURATOR.connectionValid && CONFIGURATOR.cliValid && CONFIGURATOR.cliActive)) {
        if (callback) {
            callback();
        }

        return;
    }
    this.send(getCliCommand('exit\r', this.cliBuffer), function (writeInfo) {
        // we could handle this "nicely", but this will do for now
        // (another approach is however much more complicated):
        // we can setup an interval asking for data lets say every 200ms, when data arrives, callback will be triggered and tab switched
        // we could probably implement this someday
        if (callback) {
            callback();
        }

        CONFIGURATOR.cliActive = false;
        CONFIGURATOR.cliValid = false;
    });

    CliAutoComplete.cleanup();
    $(CliAutoComplete).off();
};
