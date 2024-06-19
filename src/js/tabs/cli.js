import { i18n } from "../localization";
import Clipboard from "../Clipboard";
import { generateFilename } from "../utils/generate_filename";
import GUI, { TABS } from '../gui';
import BuildApi from '../BuildApi';
import { tracking } from '../Analytics';
import { reinitializeConnection } from "../serial_backend";
import CONFIGURATOR from "../data_storage";
import CliAutoComplete from "../CliAutoComplete";
import UI_PHONES from "../phones_ui";
import { gui_log } from "../gui_log";
import jBox from "jbox";
import $ from 'jquery';
import { serialShim } from "../serial_shim";
import FileSystem from "../FileSystem";

const serial =  serialShim();

const cli = {
    lineDelayMs: 15,
    profileSwitchDelayMs: 100,
    outputHistory: "",
    cliBuffer: "",
    startProcessing: false,
    GUI: {
        snippetPreviewWindow: null,
        copyButton: null,
        windowWrapper: null,
    },
    lastArrival: 0,
};

function removePromptHash(promptText) {
    return promptText.replace(/^# /, '');
}

function cliBufferCharsToDelete(command, buffer) {
    let commonChars = 0;
    for (let i = 0; i < buffer.length; i++) {
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
    const bufferRegex = new RegExp(`^${buffer}`, 'g');
    if (command.match(bufferRegex)) {
        return command.replace(bufferRegex, '');
    }

    const noOfCharsToDelete = cliBufferCharsToDelete(command, buffer);

    return commandWithBackSpaces(command, buffer, noOfCharsToDelete);
}

function copyToClipboard(text) {
    function onCopySuccessful() {

        tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'CliCopyToClipboard', { length: text.length });
        const button = TABS.cli.GUI.copyButton;
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

    Clipboard.writeText(text, onCopySuccessful, onCopyFailed);
}

cli.initialize = function (callback) {
    const self = this;

    if (GUI.active_tab !== 'cli') {
        GUI.active_tab = 'cli';
    }

    self.outputHistory = "";
    self.cliBuffer = "";
    self.startProcessing = false;

    const enterKeyCode = 13;

    function clearHistory() {
        self.outputHistory = "";
        self.GUI.windowWrapper.empty();
    }

    async function executeCommands(outString) {
        self.history.add(outString.trim());

        const outputArray = outString.split("\n");

        outputArray.forEach((command, index) => {
            let line = command.trim();
            let processingDelay = self.lineDelayMs;
            if (line.toLowerCase().startsWith('profile')) {
                processingDelay = self.profileSwitchDelayMs;
            }
            const isLastCommand = outputArray.length === index + 1;
            if (isLastCommand && self.cliBuffer) {
                line = getCliCommand(line, self.cliBuffer);
            }

            GUI.timeout_add('CLI_send_slowly', function () {
                self.sendLine(line, function () {
                    console.log('line sent', line);
                });
            }, processingDelay);
        });
    }

    async function loadFile() {
        const previewArea = $("#snippetpreviewcontent textarea#preview");

        function executeSnippet(fileName) {
            const commands = previewArea.val();

            tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'CliExecuteFromFile', { filename: fileName });

            executeCommands(commands);
            self.GUI.snippetPreviewWindow.close();
        }

        function previewCommands(result, fileName) {
            if (!self.GUI.snippetPreviewWindow) {
                self.GUI.snippetPreviewWindow = new jBox("Modal", {
                    id: "snippetPreviewWindow",
                    width: 'auto',
                    height: 'auto',
                    closeButton: 'title',
                    animation: false,
                    isolateScroll: false,
                    title: i18n.getMessage("cliConfirmSnippetDialogTitle", { fileName: fileName }),
                    content: $('#snippetpreviewcontent'),
                    onCreated: () =>
                        $("#snippetpreviewcontent a.confirm").click(() => executeSnippet(fileName))
                    ,
                });
            }
            previewArea.val(result);
            self.GUI.snippetPreviewWindow.open();
        }

        const file = await FileSystem.pickOpenFile(i18n.getMessage('fileSystemPickerFiles', {typeof: 'TXT'}), '.txt');
        const contents = await FileSystem.readFile(file);
        previewCommands(contents, file.name);
    }

    async function saveFile(filename, content) {
        const file = await FileSystem.pickSaveFile(filename, i18n.getMessage('fileSystemPickerFiles', {typeof: 'TXT'}), '.txt');
        await FileSystem.writeFile(file, content);
    }

    $('#content').load("./tabs/cli.html", function () {
        // translate to user-selected language
        i18n.localizePage();

        TABS.cli.adaptPhones();

        CONFIGURATOR.cliActive = true;

        self.GUI.copyButton = $('.tab-cli .copy');
        self.GUI.windowWrapper = $('.tab-cli .window .wrapper');

        const textarea = $('.tab-cli textarea[name="commands"]');

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

        $('.tab-cli .save').on('click', function() {
            const filename = generateFilename('cli', 'txt');

            saveFile(filename, self.outputHistory);
        });

        $('.tab-cli .clear').click(function() {
            clearHistory();
        });

        if (Clipboard.available) {
            self.GUI.copyButton.click(function() {
                copyToClipboard(self.outputHistory);
            });
        } else {
            self.GUI.copyButton.hide();
        }

        $('.tab-cli .load').on('click', function() {
            loadFile();
        });

        $('.tab-cli .support')
        .toggle(navigator.onLine)
        .on('click', function() {

            function submitSupportData(data) {
                clearHistory();
                const api = new BuildApi();

                api.getSupportCommands(async commands => {
                    commands = [`###\n# Problem description\n# ${data}\n###`, ...commands];
                    await executeCommands(commands.join('\n'));
                    const delay = setInterval(() => {
                        const time = new Date().getTime();
                        if (self.lastArrival < time - 250) {
                            clearInterval(delay);
                            const text = self.outputHistory;
                            api.submitSupportData(text, key => {
                                writeToOutput(i18n.getMessage('buildServerSupportRequestSubmission', [key]));
                            });
                        }
                    }, 250);
                });
            }

            self.supportWarningDialog(submitSupportData);
        });

        // Tab key detection must be on keydown,
        // `keypress`/`keyup` happens too late, as `textarea` will have already lost focus.
        textarea.keydown(function (event) {
            const tabKeyCode = 9;
            if (event.which === tabKeyCode) {
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
            if (event.which === enterKeyCode) {
                event.preventDefault(); // prevent the adding of new line

                if (CliAutoComplete.isBuilding()) {
                    return; // silently ignore commands if autocomplete is still building
                }

                const outString = textarea.val();
                executeCommands(outString);
                textarea.val('');
            }
        });

        textarea.keyup(function (event) {
            const keyUp = {38: true};
            const keyDown = {40: true};

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
            const bufferOut = new ArrayBuffer(1);
            const bufView = new Uint8Array(bufferOut);

            bufView[0] = 0x23; // #

            serial.send(bufferOut);
        }, 250);

        GUI.content_ready(callback);
    });
};

cli.adaptPhones = function() {
    if ($(window).width() < 575) {
        const backdropHeight = $('.note').height() + 22 + 38;
        $('.backdrop').css('height', `calc(100% - ${backdropHeight}px)`);
    }

    const mediaQuery = window.matchMedia('(max-width: 576px)');
    const handleMediaChange = function(e) {
        if (e.matches) {
            UI_PHONES.initToolbar();
        }
    };
    mediaQuery.addEventListener('change', handleMediaChange);
    handleMediaChange(mediaQuery);
};

cli.history = {
    history: [],
    index:  0,
};

cli.history.add = function (str) {
    this.history.push(str);
    this.index = this.history.length;
};

cli.history.prev = function () {
    if (this.index > 0) {
        this.index -= 1;
    }
    return this.history[this.index];
};

cli.history.next = function () {
    if (this.index < this.history.length) {
        this.index += 1;
    }
    return this.history[this.index - 1];
};

const backspaceCode = 8;
const lineFeedCode = 10;
const carriageReturnCode = 13;

function writeToOutput(text) {
    TABS.cli.GUI.windowWrapper.append(text);
    const cliWindow = $('.tab-cli .window');
    cliWindow.scrollTop(cliWindow.prop("scrollHeight"));
}

function writeLineToOutput(text) {
    if (CliAutoComplete.isBuilding()) {
        CliAutoComplete.builderParseLine(text);
        return; // suppress output if in building state
    }

    if (text.startsWith("###ERROR")) {
        writeToOutput(`<span class="error_message">${text}</span><br>`);
    } else {
        writeToOutput(`${text}<br>`);
    }
}

function setPrompt(text) {
    $('.tab-cli textarea').val(text);
}

cli.read = function (readInfo) {
    /*  Some info about handling line feeds and carriage return

        line feed = LF = \n = 0x0A = 10
        carriage return = CR = \r = 0x0D = 13

        MAC only understands CR
        Linux and Unix only understand LF
        Windows understands (both) CRLF
        Chrome OS currently unknown
    */
    const data = new Uint8Array(readInfo.data ?? readInfo);
    let validateText = "";
    let sequenceCharsToSkip = 0;

    for (let i = 0; i < data.length; i++) {
        const currentChar = String.fromCharCode(data[i]);
        const isCRLF = currentChar.charCodeAt() === lineFeedCode || currentChar.charCodeAt() === carriageReturnCode;

        if (!CONFIGURATOR.cliValid && (isCRLF || this.startProcessing)) {
            // try to catch part of valid CLI enter message (firmware message starts with CRLF)
            this.startProcessing = true;
            validateText += currentChar;
            writeToOutput(currentChar);
            continue;
        }

        const escapeSequenceCode = 27;
        const escapeSequenceCharLength = 3;
        if (data[i] === escapeSequenceCode && !sequenceCharsToSkip) { // ESC + other
            sequenceCharsToSkip = escapeSequenceCharLength;
        }

        if (sequenceCharsToSkip) {
            sequenceCharsToSkip--;
            continue;
        }

        if (CONFIGURATOR.cliValid) {
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
        }

        if (!CliAutoComplete.isBuilding()) {
            // do not include the building dialog into the history
            this.outputHistory += currentChar;
        }

        if (this.cliBuffer === 'Rebooting') {
            CONFIGURATOR.cliActive = false;
            CONFIGURATOR.cliValid = false;
            gui_log(i18n.getMessage('cliReboot'));
            reinitializeConnection();
        }

    }

    this.lastArrival = new Date().getTime();

    if (!CONFIGURATOR.cliValid && validateText.indexOf('CLI') !== -1) {
        gui_log(i18n.getMessage('cliEnter'));
        CONFIGURATOR.cliValid = true;
        // begin output history with the prompt (last line of welcome message)
        // this is to match the content of the history with what the user sees on this tab
        const lastLine = validateText.split("\n").pop();
        this.outputHistory = lastLine;

        if (CliAutoComplete.isEnabled() && !CliAutoComplete.isBuilding()) {
            // start building autoComplete
            CliAutoComplete.builderStart();
        }
    }

    // fallback to native autocomplete
    if (!CliAutoComplete.isEnabled()) {
        setPrompt(removePromptHash(this.cliBuffer));
    }
};

cli.sendLine = function (line, callback) {
    this.send(`${line}\n`, callback);
};

cli.sendNativeAutoComplete = function (line, callback) {
    this.send(`${line}\t`, callback);
};

cli.send = function (line, callback) {
    const bufferOut = new ArrayBuffer(line.length);
    const bufView = new Uint8Array(bufferOut);

    for (let cKey = 0; cKey < line.length; cKey++) {
        bufView[cKey] = line.charCodeAt(cKey);
    }

    serial.send(bufferOut, callback);
};

cli.supportWarningDialog = function (onAccept) {
    const supportWarningDialog = $('.supportWarningDialog')[0];
    const supportWarningDialogTextArea = $('.tab-cli textarea[name="supportWarningDialogInput"]');

    if (!supportWarningDialog.hasAttribute('open')) {
        supportWarningDialog.showModal();

        $('.cancel').on('click', function() {
            supportWarningDialog.close();
        });

        $('.submit').on('click', function() {
            supportWarningDialog.close();
            onAccept(supportWarningDialogTextArea.val());
            supportWarningDialogTextArea.val('');
        });
    }
};

cli.cleanup = function (callback) {
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

    this.send(getCliCommand('exit\r', this.cliBuffer), function () {
        // we could handle this "nicely", but this will do for now
        // (another approach is however much more complicated):
        // we can setup an interval asking for data lets say every 200ms, when data arrives, callback will be triggered and tab switched
        // we could probably implement this someday
        reinitializeConnection(function () {
            GUI.timeout_add('tab_change_callback', callback, 500);
        });
    });

    CONFIGURATOR.cliActive = false;
    CONFIGURATOR.cliValid = false;

    CliAutoComplete.cleanup();
    $(CliAutoComplete).off();
};

TABS.cli = cli;
export {
    cli,
};
