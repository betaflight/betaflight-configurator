import { ref, reactive, nextTick } from "vue";
import { i18n } from "../js/localization";
import BFClipboard from "../js/Clipboard";
import { generateFilename } from "../js/utils/generate_filename";
import GUI from "../js/gui";
import BuildApi from "../js/BuildApi";
import CONFIGURATOR from "../js/data_storage";
import CliAutoComplete from "../js/CliAutoComplete";
import { gui_log } from "../js/gui_log";
import { serial } from "../js/serial";
import FileSystem from "../js/FileSystem";
import { ispConnected } from "../js/utils/connection";
import { get as getConfig } from "../js/ConfigStorage";
import { useCliAutocomplete } from "./useCliAutocomplete";
import { highlightCliLine } from "../js/CliSyntaxHighlight";
import { escapeHtml } from "../js/utils/common";

const backspaceCode = 8;
const lineFeedCode = 10;
const carriageReturnCode = 13;
const enterKeyCode = 13;
const tabKeyCode = 9;

function removePromptHash(promptText) {
    return promptText.replace(/^# /, "");
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
    const backspace = String.fromCodePoint(127);
    return backspace.repeat(noOfCharsToDelete) + command.substring(buffer.length - noOfCharsToDelete, command.length);
}

function getCliCommand(command, cliBuffer) {
    const buffer = removePromptHash(cliBuffer);
    if (command.startsWith(buffer)) {
        return command.slice(buffer.length);
    }

    const noOfCharsToDelete = cliBufferCharsToDelete(command, buffer);

    return commandWithBackSpaces(command, buffer, noOfCharsToDelete);
}

// History management — module scope so it survives tab switches
const history = reactive({
    items: [],
    index: 0,
    add(str) {
        this.items.push(str);
        this.index = this.items.length;
    },
    prev() {
        if (this.index > 0) {
            this.index -= 1;
        }
        return this.items[this.index];
    },
    next() {
        if (this.index < this.items.length) {
            this.index += 1;
        }
        return this.items[this.index - 1];
    },
});

function onCopyFailed(ex) {
    console.warn(ex);
}

async function submitSupportData(data, state, clearHistory, executeCommands, writeToOutput, getOutputHistory) {
    clearHistory();
    const api = new BuildApi();

    let commands = await api.getSupportCommands();
    if (!commands) {
        alert("An error has occurred");
        return;
    }

    commands = [`###\n# Problem description\n# ${data}\n###`, ...commands];
    await executeCommands(commands.join("\n"));
    const delay = setInterval(async () => {
        const time = Date.now();
        if (state.lastArrival < time - 250) {
            clearInterval(delay);
            const text = getOutputHistory();
            let key = await api.submitSupportData(text);
            if (!key) {
                writeToOutput(i18n.getMessage("buildServerSupportRequestSubmission", ["** error **"]));
                return;
            }
            state.lastSupportId = key;
            writeToOutput(i18n.getMessage("buildServerSupportRequestSubmission", [key]));
        }
    }, 250);
}

export function useCli() {
    const autocomplete = useCliAutocomplete();

    // Reactive state — outputHistory and cliBuffer are intentionally kept as plain closure
    // variables below, not in reactive(), to avoid Vue Proxy overhead in the serial read
    // hot path where they are updated thousands of times per large paste.
    const state = reactive({
        startProcessing: false,
        lastArrival: 0,
        lastSupportId: null,
        lineDelayMs: 5,
        profileSwitchDelayMs: 100,
        commandInput: "",
        promptInput: "",
        snippetPreview: "",
        supportDialogInput: "",
        copyButtonText: i18n.getMessage("cliCopyToClipboardBtn"),
        copyButtonWidth: "",
    });

    // Plain variables — not reactive because they are never rendered in the template.
    // Reads only happen on explicit user actions (copy, save, submit support).
    let outputHistory = "";
    let cliBuffer = "";

    // Refs for DOM elements
    const windowWrapperRef = ref(null);
    const cliWindowRef = ref(null);
    const commandInputRef = ref(null);
    const snippetPreviewDialogRef = ref(null);
    const supportWarningDialogRef = ref(null);

    // Support dialog callback
    let supportDialogCallback = null;

    let outputBuffer = "";
    let outputFlushRaf = null;
    // true while the user is at (or near) the bottom of the output — maintained by a
    // passive scroll listener so flushOutput never needs to read layout properties.
    let scrollPinned = true;
    let scrollListener = null;

    const flushOutput = () => {
        outputFlushRaf = null;
        if (outputBuffer && windowWrapperRef.value) {
            // insertAdjacentHTML only parses the new fragment — it never serializes or
            // re-parses existing DOM nodes. The previous innerHTML += caused O(N²) slowdown:
            // every flush re-parsed the entire growing output on each animation frame.
            windowWrapperRef.value.insertAdjacentHTML("beforeend", outputBuffer);
            outputBuffer = "";
            if (scrollPinned && cliWindowRef.value) {
                // Writing MAX_SAFE_INTEGER avoids reading scrollHeight (which would force a
                // synchronous layout recalc). The browser clamps scrollTop to the actual max.
                cliWindowRef.value.scrollTop = Number.MAX_SAFE_INTEGER;
            }
        }
    };

    const writeToOutput = (text) => {
        if (!windowWrapperRef.value) {
            return;
        }
        outputBuffer += text;
        if (!outputFlushRaf) {
            outputFlushRaf = requestAnimationFrame(flushOutput);
        }
    };

    const writeLineToOutput = (text) => {
        if (CliAutoComplete.isBuilding()) {
            CliAutoComplete.builderParseLine(text);
            return; // suppress output if in building state
        }

        if (text.startsWith("###ERROR")) {
            writeToOutput(`<span class="error_message">${escapeHtml(text)}</span><br>`);
        } else {
            writeToOutput(`${highlightCliLine(text)}<br>`);
        }
    };

    const setPrompt = (text) => {
        state.promptInput = text;
    };

    const clearHistory = () => {
        outputHistory = "";
        outputBuffer = "";
        scrollPinned = true;
        if (windowWrapperRef.value) {
            windowWrapperRef.value.innerHTML = "";
        }
    };

    const sendLine = (line, callback) => {
        send(`${line}\n`, callback);
    };

    const sendNativeAutoComplete = (line, callback) => {
        send(`${line}\t`, callback);
    };

    const send = (line, callback) => {
        const bufferOut = new ArrayBuffer(line.length);
        const bufView = new Uint8Array(bufferOut);

        for (let cKey = 0; cKey < line.length; cKey++) {
            bufView[cKey] = line.codePointAt(cKey);
        }

        serial.send(bufferOut, callback);
    };

    const executeCommands = async (outString) => {
        history.add(outString.trim());

        function sendCommandIterative(commandArray) {
            const command = commandArray.shift();

            let line = command.trim();
            let processingDelay = state.lineDelayMs;
            if (line.toLowerCase().startsWith("profile")) {
                processingDelay = state.profileSwitchDelayMs;
            }
            const isLastCommand = outputArray.length === 0;
            if (isLastCommand && cliBuffer) {
                line = getCliCommand(line, cliBuffer);
            }

            sendLine(line);

            if (!isLastCommand) {
                GUI.timeout_add(
                    "CLI_send_slowly",
                    function () {
                        sendCommandIterative(commandArray);
                    },
                    processingDelay,
                );
            }
        }

        const outputArray = outString.split("\n");
        sendCommandIterative(outputArray);
    };

    const loadFile = async () => {
        const executeSnippet = () => {
            const commands = state.snippetPreview;
            executeCommands(commands);
            if (snippetPreviewDialogRef.value) {
                snippetPreviewDialogRef.value.close();
            }
        };

        const previewCommands = (result, _fileName) => {
            state.snippetPreview = result;
            if (snippetPreviewDialogRef.value) {
                snippetPreviewDialogRef.value.showModal();
            }
        };

        const file = await FileSystem.pickOpenFile(i18n.getMessage("fileSystemPickerFiles", { typeof: "TXT" }), ".txt");
        const contents = await FileSystem.readFile(file);
        previewCommands(contents, file.name);

        return executeSnippet;
    };

    const saveFile = async () => {
        const filename = generateFilename("cli", "txt");
        const content = formatContentWithSupportId(outputHistory, state.lastSupportId);

        const file = await FileSystem.pickSaveFile(
            filename,
            i18n.getMessage("fileSystemPickerFiles", { typeof: "TXT" }),
            ".txt",
        );
        await FileSystem.writeFile(file, content);
    };

    const formatContentWithSupportId = (content, supportId) => {
        if (supportId) {
            content = `# Support ID: ${supportId}\n\n${content}`;
        }
        return content;
    };

    const copyToClipboard = () => {
        const text = formatContentWithSupportId(outputHistory, state.lastSupportId);

        function onCopySuccessful() {
            const origText = state.copyButtonText;
            const origWidth = state.copyButtonWidth;
            state.copyButtonText = i18n.getMessage("cliCopySuccessful");
            state.copyButtonWidth = origWidth;
            setTimeout(() => {
                state.copyButtonText = origText;
                state.copyButtonWidth = "";
            }, 1500);
        }

        BFClipboard.writeText(text, onCopySuccessful, onCopyFailed);
    };

    const submitSupportRequest = async () => {
        showSupportWarningDialog((data) =>
            submitSupportData(data, state, clearHistory, executeCommands, writeToOutput, () => outputHistory),
        );
    };

    const showSupportWarningDialog = (onAccept) => {
        supportDialogCallback = onAccept;
        if (supportWarningDialogRef.value && !supportWarningDialogRef.value.hasAttribute("open")) {
            supportWarningDialogRef.value.showModal();
        }
    };

    const handleSupportDialogSubmit = () => {
        if (supportWarningDialogRef.value) {
            supportWarningDialogRef.value.close();
        }
        if (supportDialogCallback) {
            supportDialogCallback(state.supportDialogInput);
            supportDialogCallback = null;
        }
        state.supportDialogInput = "";
    };

    const handleSupportDialogCancel = () => {
        if (supportWarningDialogRef.value) {
            supportWarningDialogRef.value.close();
        }
        supportDialogCallback = null;
        state.supportDialogInput = "";
    };

    const handleCommandKeyDown = (event) => {
        const upKeyCode = 38;
        const downKeyCode = 40;
        const escKeyCode = 27;

        if (event.which === escKeyCode && autocomplete.isOpen()) {
            event.preventDefault();
            autocomplete.hide();
            return;
        }

        if (event.which === tabKeyCode) {
            event.preventDefault();

            if (!CliAutoComplete.isEnabled()) {
                // Native FC autoComplete
                const outString = state.commandInput;
                const lastCommand = outString.split("\n").pop();
                const command = getCliCommand(lastCommand, cliBuffer);
                if (command) {
                    sendNativeAutoComplete(command);
                    state.commandInput = "";
                }
            } else if (autocomplete.isOpen()) {
                // Tab selects the active item in the dropdown (never execute)
                autocomplete.selectItem(autocomplete.activeIndex.value);
            } else if (!CliAutoComplete.isBuilding()) {
                // force show autocomplete on Tab
                autocomplete.openForced(state.commandInput);
            }
        }

        if (event.which === enterKeyCode) {
            event.preventDefault();

            if (CliAutoComplete.isBuilding()) {
                return;
            }

            if (autocomplete.isOpen()) {
                autocomplete.selectItem(autocomplete.activeIndex.value);
                if (autocomplete.sendOnEnter.value) {
                    nextTick(() => {
                        executeCommands(state.commandInput);
                        state.commandInput = "";
                    });
                }
            } else {
                const outString = state.commandInput;
                executeCommands(outString);
                state.commandInput = "";
            }
        }

        // Arrow keys when dropdown is open
        if (autocomplete.isOpen()) {
            if (event.which === upKeyCode) {
                event.preventDefault();
                autocomplete.navigateUp();
            }
            if (event.which === downKeyCode) {
                event.preventDefault();
                autocomplete.navigateDown();
            }
        }
    };

    const handleCommandKeyPress = (event) => {
        // Deprecated: keypress event - keeping for compatibility but main logic moved to keydown
        // This prevents any default keypress behavior
        if (event.which === enterKeyCode) {
            event.preventDefault();
        }
    };

    const handleCommandKeyUp = (event) => {
        const keyUp = { 38: true };
        const keyDown = { 40: true };

        if (autocomplete.isOpen()) {
            return; // disable history keys if autocomplete is open
        }

        if (event.keyCode in keyUp) {
            state.commandInput = history.prev();
        }

        if (event.keyCode in keyDown) {
            state.commandInput = history.next();
        }
    };

    const processCharacterInCliMode = (charCode, currentChar) => {
        switch (charCode) {
            case lineFeedCode:
                if (GUI.operating_system === "Windows") {
                    writeLineToOutput(cliBuffer);
                    cliBuffer = "";
                }
                break;
            case carriageReturnCode:
                if (GUI.operating_system !== "Windows") {
                    writeLineToOutput(cliBuffer);
                    cliBuffer = "";
                }
                break;
            case 60:
                cliBuffer += "&lt;";
                break;
            case 62:
                cliBuffer += "&gt;";
                break;
            case backspaceCode:
                cliBuffer = cliBuffer.slice(0, -1);
                outputHistory = outputHistory.slice(0, -1);
                return true; // signal to continue
            default:
                cliBuffer += currentChar;
        }
        return false;
    };

    const checkForReboot = () => {
        if (cliBuffer === "Rebooting") {
            CONFIGURATOR.cliActive = false;
            CONFIGURATOR.cliValid = false;
            gui_log(i18n.getMessage("cliReboot"));
            GUI.reinitializeConnection();
        }
    };

    const validateCliEntry = (validateText) => {
        if (!CONFIGURATOR.cliValid && validateText.includes("CLI")) {
            gui_log(i18n.getMessage(getConfig("cliOnlyMode")?.cliOnlyMode ? "cliDevEnter" : "cliEnter"));
            CONFIGURATOR.cliValid = true;
            // begin output history with the prompt (last line of welcome message)
            // this is to match the content of the history with what the user sees on this tab
            const lastLine = validateText.split("\n").pop();
            outputHistory = lastLine;

            if (CliAutoComplete.isEnabled() && !CliAutoComplete.isBuilding()) {
                // start building autoComplete
                CliAutoComplete.builderStart();
            }
        }
    };

    const read = (readInfo) => {
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

        for (const byte of data) {
            const currentChar = String.fromCodePoint(byte);
            const currentCode = currentChar.codePointAt(0);
            const isCRLF = currentCode === lineFeedCode || currentCode === carriageReturnCode;

            if (!CONFIGURATOR.cliValid && (isCRLF || state.startProcessing)) {
                // try to catch part of valid CLI enter message (firmware message starts with CRLF)
                state.startProcessing = true;
                validateText += currentChar;
                writeToOutput(currentChar);
                continue;
            }

            const escapeSequenceCode = 27;
            const escapeSequenceCharLength = 3;
            if (byte === escapeSequenceCode && !sequenceCharsToSkip) {
                // ESC + other
                sequenceCharsToSkip = escapeSequenceCharLength;
            }

            if (sequenceCharsToSkip) {
                sequenceCharsToSkip--;
                continue;
            }

            if (CONFIGURATOR.cliValid) {
                const shouldContinue = processCharacterInCliMode(byte, currentChar);
                if (shouldContinue) {
                    continue;
                }
            }

            if (!CliAutoComplete.isBuilding()) {
                // do not include the building dialog into the history
                outputHistory += currentChar;
            }

            checkForReboot();
        }

        state.lastArrival = Date.now();

        validateCliEntry(validateText);

        // fallback to native autocomplete
        if (!CliAutoComplete.isEnabled()) {
            setPrompt(removePromptHash(cliBuffer));
        }
    };

    const initialize = async () => {
        outputHistory = "";
        cliBuffer = "";
        state.startProcessing = false;

        CONFIGURATOR.cliActive = true;

        // Wait for DOM to be ready
        await nextTick();

        // Track whether the user is scrolled to the bottom so flushOutput never
        // needs to read layout-forcing properties (scrollHeight, clientHeight).
        if (cliWindowRef.value) {
            scrollListener = () => {
                const el = cliWindowRef.value;
                if (el) {
                    scrollPinned = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
                }
            };
            cliWindowRef.value.addEventListener("scroll", scrollListener, { passive: true });
        }

        // Initialize CLI autocomplete cache builder
        CliAutoComplete.initialize(sendLine, writeToOutput);

        // Connect the autocomplete composable to the textarea's v-model
        autocomplete.connect(
            () => state.commandInput,
            (value) => {
                state.commandInput = value;
            },
            () => commandInputRef.value,
        );

        // Enter CLI mode
        GUI.timeout_add(
            "enter_cli",
            function enter_cli() {
                const bufferOut = new ArrayBuffer(1);
                const bufView = new Uint8Array(bufferOut);
                bufView[0] = 0x23; // #
                serial.send(bufferOut);
            },
            250,
        );
    };

    const cleanup = () => {
        // Remove any pending CLI timeouts
        GUI.timeout_remove("CLI_send_slowly");
        GUI.timeout_remove("enter_cli");

        // Cancel any pending output flush
        if (outputFlushRaf) {
            cancelAnimationFrame(outputFlushRaf);
            outputFlushRaf = null;
        }
        outputBuffer = "";

        if (cliWindowRef.value && scrollListener) {
            cliWindowRef.value.removeEventListener("scroll", scrollListener);
            scrollListener = null;
        }
        scrollPinned = true;

        if (CONFIGURATOR.connectionValid && CONFIGURATOR.cliValid && CONFIGURATOR.cliActive) {
            send(getCliCommand("exit\r", cliBuffer), function () {
                GUI.reinitializeConnection();
            });
        }

        CONFIGURATOR.cliActive = false;
        CONFIGURATOR.cliValid = false;

        CliAutoComplete.cleanup();
    };

    const adaptPhones = () => {
        // This will be handled in Vue template with reactive CSS
        // Keeping for reference if needed
    };

    const isSupportRequestAvailable = () => {
        return ispConnected();
    };

    return {
        state,
        history,
        autocomplete,
        windowWrapperRef,
        cliWindowRef,
        commandInputRef,
        snippetPreviewDialogRef,
        supportWarningDialogRef,
        initialize,
        cleanup,
        clearHistory,
        saveFile,
        loadFile,
        copyToClipboard,
        submitSupportRequest,
        handleCommandKeyDown,
        handleCommandKeyPress,
        handleCommandKeyUp,
        handleSupportDialogSubmit,
        handleSupportDialogCancel,
        showSupportWarningDialog,
        read,
        sendLine,
        isSupportRequestAvailable,
        adaptPhones,
    };
}
