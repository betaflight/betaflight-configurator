import GUI from "../../js/gui";
import { i18n } from "../../js/localization";
import CONFIGURATOR from "../../js/data_storage";
import { reinitializeConnection } from "../../js/serial_backend";
import { gui_log } from "../../js/gui_log";
import { serialShim } from "../../js/serial_shim";

const serial = serialShim();

export default class CliEngine
{
    constructor(currentTab) {
        this._currentTab = currentTab;
        this._lineDelayMs = 15;
        this._profileSwitchDelayMs = 100;
        this._cliBuffer = "";
        this._window = null;
        this._windowWrapper = null;
        this._cliErrorsCount = 0;
        this._sendCommandsProgress = 0;
        this._onSendCommandsProgressChange = undefined;
        this._responseCallback = undefined;
        this._onRowCameCallback = undefined;
    }

    setUi(window, windowWrapper, textarea) {
        this._window = window;
        this._windowWrapper = windowWrapper;
        this._setTextareaListen(textarea);
    }

    get errorsCount() { return this._cliErrorsCount; }

    setProgressCallback(sendCommandsProgressCallBack) {
        this._onSendCommandsProgressChange = sendCommandsProgressCallBack;
    }

    _reportSendCommandsProgress(value) {
        this._sendCommandsProgress = value;
        this._onSendCommandsProgressChange?.(value);
    }

    enterCliMode() {
        const bufferOut = new ArrayBuffer(1);
        const bufView = new Uint8Array(bufferOut);
        this.cliBuffer = "";

        bufView[0] = 0x23;

        serial.send(bufferOut);
    }

    _setTextareaListen(textarea) {
        // Tab key detection must be on keydown,
        // `keypress`/`keyup` happens too late, as `textarea` will have already lost focus.
        textarea.keydown(event => {
            if (event.which === CliEngine.s_tabCode) {
                // prevent default tabbing behaviour
                event.preventDefault();
            }
        });

        textarea.keypress(event => {
            if (event.which === CliEngine.s_enterKeyCode) {
                event.preventDefault(); // prevent the adding of new line
                const outString = textarea.val();
                this.executeCommands(outString);
                textarea.val('');
            }
        });

        // give input element user focus
        textarea.focus();
    }

    close(callback) {
        this.send(this.getCliCommand('exit\r', ""), function () { //this.cliBuffer
            if (callback) {
                callback();
            }
        });
    }

    executeCommands(outString) {
        const outputArray = outString.split("\n");
        return this.executeCommandsArray(outputArray);
    }

    executeCommandsArray(strings) {
        this._reportSendCommandsProgress(0);
        const totalCommandsCount = strings.length;

        return strings.reduce((p, line, index) =>
            p.then((delay) =>
                new Promise((resolve) => {
                    GUI.timeout_add('CLI_send_slowly', () => {
                        let processingDelay = this.lineDelayMs;
                        line = line.trim();

                        if (line.toLowerCase().startsWith('profile')) {
                            processingDelay = this.profileSwitchDelayMs;
                        }

                        const isLastCommand = totalCommandsCount === index + 1;

                        if (isLastCommand && this.cliBuffer) {
                            line = this.getCliCommand(line, this.cliBuffer);
                        }

                        this.sendLine(line, () => { /* empty on-send callback */ }, () => {
                            resolve(processingDelay);
                            this._reportSendCommandsProgress(100.0 * index / totalCommandsCount);
                        });
                    }, delay);
                }),
            ),
            Promise.resolve(0),
        ).then(() => {
            this._reportSendCommandsProgress(100);
        });
    }

    removePromptHash(promptText) {
        return promptText.replace(/^# /, '');
    }

    cliBufferCharsToDelete(command, buffer) {
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

    commandWithBackSpaces(command, buffer, noOfCharsToDelete) {
        const backspace = String.fromCharCode(127);
        return backspace.repeat(noOfCharsToDelete) + command.substring(buffer.length - noOfCharsToDelete, command.length);
    }

    getCliCommand(command, cliBuffer) {
        const buffer = this.removePromptHash(cliBuffer);
        const bufferRegex = new RegExp(`^${buffer}`, 'g');

        if (command.match(bufferRegex)) {
            return command.replace(bufferRegex, '');
        }

        const noOfCharsToDelete = this.cliBufferCharsToDelete(command, buffer);
        return this.commandWithBackSpaces(command, buffer, noOfCharsToDelete);
    }

    writeToOutput(text) {
        this._windowWrapper.append(text);
        this._window.scrollTop(this._windowWrapper.height());
    }

    writeLineToOutput(text) {
        if (text.startsWith("###ERROR")) {
            this.writeToOutput(`<span class="error_message">${text}</span><br>`);
            this._cliErrorsCount++;
        } else {
            this.writeToOutput(`${text}<br>`);
        }
        this._responseCallback?.();
        this._onRowCameCallback?.(text);
    }

    subscribeOnRowCame(callback) {
        this._onRowCameCallback = callback;
    }

    unsubscribeOnRowCame() {
        this._onRowCameCallback = undefined;
    }

    readSerial(readInfo) {
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
        for (const charCode of data) {
            const currentChar = String.fromCharCode(charCode);

            if (!CONFIGURATOR.cliEngineValid) {
                // try to catch part of valid CLI enter message
                validateText += currentChar;
                this.writeToOutput(currentChar);
                continue;
            }

            const escapeSequenceCode = 27;
            const escapeSequenceCharLength = 3;
            if (charCode === escapeSequenceCode && !sequenceCharsToSkip) { // ESC + other
                sequenceCharsToSkip = escapeSequenceCharLength;
            }

            if (sequenceCharsToSkip) {
                sequenceCharsToSkip--;
                continue;
            }

            this._adjustCliBuffer(charCode);

            if (this.cliBuffer === 'Rebooting' && CliEngine.s_backspaceCode !== charCode) {
                CONFIGURATOR.cliEngineActive = false;
                CONFIGURATOR.cliEngineValid = false;
                gui_log(i18n.getMessage('cliReboot'));
                reinitializeConnection(this._currentTab);
            }
        }

        if (!CONFIGURATOR.cliEngineValid && validateText.indexOf('CLI') !== -1) {
            gui_log(i18n.getMessage('cliEnter'));
            CONFIGURATOR.cliEngineValid = true;
        }
    }

    sendLine(line, callback, responseCallback) {
        this.send(`${line}\n`, callback, responseCallback);
    }

    send(line, callback, responseCallback) {
        this._responseCallback = responseCallback;
        const bufferOut = new ArrayBuffer(line.length);
        const bufView = new Uint8Array(bufferOut);

        for (let cKey = 0; cKey < line.length; cKey++) {
            bufView[cKey] = line.charCodeAt(cKey);
        }

        serial.send(bufferOut, callback);
    }

    _adjustCliBuffer(newCharacterCode) {
        const currentChar = String.fromCharCode(newCharacterCode);
        switch (newCharacterCode) {
            case CliEngine.s_lineFeedCode:
                if (GUI.operating_system === "Windows") {
                    this.writeLineToOutput(this.cliBuffer);
                    this.cliBuffer = "";
                }
                break;
            case CliEngine.s_carriageReturnCode:
                if (GUI.operating_system !== "Windows") {
                    this.writeLineToOutput(this.cliBuffer);
                    this.cliBuffer = "";
                }
                break;
            case 60:
                this.cliBuffer += '&lt';
                break;
            case 62:
                this.cliBuffer += '&gt';
                break;
            case CliEngine.s_backspaceCode:
                this.cliBuffer = this.cliBuffer.slice(0, -1);
                break;
            default:
                this.cliBuffer += currentChar;
        }
    }
}

CliEngine.s_backspaceCode = 8;
CliEngine.s_lineFeedCode = 10;
CliEngine.s_carriageReturnCode = 13;
CliEngine.s_tabCode = 9;
CliEngine.s_enterKeyCode = 13;
CliEngine.s_commandDiffAll = "diff all";
CliEngine.s_commandDefaultsNoSave = "defaults nosave";
CliEngine.s_commandSave = "save";
CliEngine.s_commandExit = "exit";
