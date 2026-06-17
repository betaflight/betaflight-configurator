import { ref } from "vue";
import PortHandler from "../port_handler";
import FileSystem from "../FileSystem";
import { generateFilename } from "./generate_filename";
import { gui_log } from "../gui_log";
import { i18n } from "../localization";
import { serial } from "../serial";

/**
 *
 * Backup the current configuration to a file before flashing in serial mode
 *
 */

/**
 * Reactive cache of the last captured backup data (the `diff all` output).
 * Reactive so Vue computeds (e.g. the post-flash restore button) re-evaluate
 * when the backup is captured or reset.
 */
const _lastBackupData = ref(null);

export function getLastBackupData() {
    return _lastBackupData.value;
}

export function setLastBackupData(data) {
    _lastBackupData.value = data;
}

export function resetLastBackupData() {
    _lastBackupData.value = null;
}

// CLI dumps are plain text: printable ASCII plus tab, CR and LF.
function isPrintableCharCode(charCode) {
    return charCode === 9 || charCode === 10 || charCode === 13 || (charCode >= 32 && charCode <= 126);
}

// Count non-printable characters in a string (firmware-version-independent).
function countNonPrintable(text) {
    let invalid = 0;
    for (let i = 0; i < text.length; i++) {
        if (!isPrintableCharCode(text.charCodeAt(i))) {
            invalid++;
        }
    }
    return invalid;
}

// A real diff/dump is non-empty, pure printable text, and contains at least one
// CLI comment line (every diff/dump emits `#` header comments). This avoids
// matching a brittle version banner string that changes between releases.
export function isPlausibleCliDump(text) {
    return text.length > 0 && countNonPrintable(text) === 0 && text.split(/\r?\n/).some((line) => line.startsWith("#"));
}

class AutoBackup {
    constructor() {
        this.outputHistory = "";
        this.invalidCharCount = 0;
        this.callback = null;
        // Store bound handler references to ensure proper removal
        this.boundReadSerialAdapter = null;
        this.boundHandleConnect = null;
        this.boundHandleDisconnect = null;
    }

    // Reset the receive buffer and its validation counters together.
    resetBuffer() {
        this.outputHistory = "";
        this.invalidCharCount = 0;
    }

    // A valid CLI dump is pure printable ASCII, so a single non-printable byte
    // means the stream is not CLI text (e.g. the device is still in MSP/binary
    // mode). Tracked incrementally via invalidCharCount so the growing buffer
    // isn't re-scanned, and trips on the very first garbage byte.
    isReceivingGarbage() {
        return this.invalidCharCount > 0;
    }

    // Centralised failure path: stop the interval, leave CLI, surface an error
    // to the user, and notify the caller that the backup did not succeed.
    failBackup(intervalId, reason) {
        clearInterval(intervalId);
        console.error(`AutoBackup: Aborting - ${reason}`);
        gui_log(i18n.getMessage("firmwareFlasherBackupInvalidData"));

        this.sendCommand("exit", this.onClose.bind(this));

        if (this.callback) {
            this.callback(false);
        }
    }

    handleConnect(openInfo) {
        console.log("Connected to serial port:", openInfo);
        if (openInfo) {
            // Ensure we have a fresh start
            this.cleanupListeners();
            this.resetBuffer();

            // Store bound reference for later cleanup
            this.boundReadSerialAdapter = this.readSerialAdapter.bind(this);
            serial.addEventListener("receive", this.boundReadSerialAdapter);

            this.run();
        } else {
            gui_log(i18n.getMessage("serialPortOpenFail"));
        }
    }

    handleDisconnect(event) {
        gui_log(i18n.getMessage(event.detail ? "serialPortClosedOk" : "serialPortClosedFail"));
        this.cleanupListeners();
    }

    // New method to ensure all listeners are properly removed
    cleanupListeners() {
        if (this.boundReadSerialAdapter) {
            serial.removeEventListener("receive", this.boundReadSerialAdapter);
            this.boundReadSerialAdapter = null;
        }

        if (this.boundHandleConnect) {
            serial.removeEventListener("connect", this.boundHandleConnect);
            this.boundHandleConnect = null;
        }

        if (this.boundHandleDisconnect) {
            serial.removeEventListener("disconnect", this.boundHandleDisconnect);
            this.boundHandleDisconnect = null;
        }
    }

    readSerialAdapter(info) {
        const data = new Uint8Array(info.detail.data);

        for (const charCode of data) {
            if (!isPrintableCharCode(charCode)) {
                this.invalidCharCount++;
            }
            const currentChar = String.fromCharCode(charCode);
            this.outputHistory += currentChar;
        }
    }

    onClose() {
        this.boundHandleDisconnect = this.handleDisconnect.bind(this);
        serial.addEventListener("disconnect", this.boundHandleDisconnect, { once: true });
        serial.disconnect();
    }

    async save(data) {
        console.log("Saving backup");
        const prefix = "cli_backup";
        const suffix = "txt";
        const filename = generateFilename(prefix, suffix);
        let result = false;

        try {
            const file = await FileSystem.pickSaveFile(
                filename,
                i18n.getMessage("fileSystemPickerFiles", { typeof: suffix.toUpperCase() }),
                `.${suffix}`,
            );

            if (file) {
                console.log("Saving config to:", file.name);
                await FileSystem.writeFile(file, data);
                result = true;
            }
        } catch (error) {
            console.error("Error saving config:", error);
        } finally {
            if (this.callback) {
                this.callback(result);
            }
        }
    }

    async run() {
        console.log("Running backup");

        await this.activateCliMode();
        this.waitForCommandCompletion("diff all");
    }

    waitForCommandCompletion(command) {
        // Clear previous output
        this.resetBuffer();

        // Add debug mode for troubleshooting
        const DEBUG = true;

        // Send the command
        this.sendCommand(command);

        if (DEBUG) console.log(`AutoBackup: Command sent: "${command}"`);

        // Set up a check interval
        const checkInterval = 100; // Check every 100ms
        const maxWaitTime = 30000; // Increase to 30 seconds max wait - some configs are large
        let elapsedTime = 0;

        const intervalId = setInterval(() => {
            elapsedTime += checkInterval;

            if (DEBUG && elapsedTime % 1000 === 0) {
                console.log(
                    `AutoBackup: Waiting for ${elapsedTime / 1000}s, buffer length: ${this.outputHistory.length} chars`,
                );
                if (this.outputHistory.length > 0) {
                    // Show last 30 chars for debugging
                    const lastChars = this.outputHistory.slice(-30).replace(/\r/g, "\\r").replace(/\n/g, "\\n");
                    console.log(`AutoBackup: Last chars: "${lastChars}"`);
                }
            }

            // Early bail-out: a single non-printable byte means the device is not
            // producing a valid CLI dump (e.g. it is still in MSP/binary mode).
            // Saving this garbage to a backup file is worse than failing fast.
            if (this.isReceivingGarbage()) {
                this.failBackup(
                    intervalId,
                    `received invalid (non-printable) data after ${elapsedTime / 1000}s ` +
                        `(${this.invalidCharCount} invalid of ${this.outputHistory.length} chars). ` +
                        `Device is not in CLI mode.`,
                );
                return;
            }

            // More robust prompt detection with multiple patterns
            const hasPrompt =
                this.outputHistory.endsWith("# ") ||
                this.outputHistory.endsWith("#\r") ||
                this.outputHistory.endsWith("#\n") ||
                this.outputHistory.endsWith("#\r\n") ||
                this.outputHistory.match(/\r?\n# ?$/);

            if (hasPrompt) {
                clearInterval(intervalId);

                if (DEBUG) console.log("AutoBackup: Prompt detected, processing output");

                // Process and save the output - more robust parsing
                let lines = this.outputHistory.split(/\r?\n/);

                // Log line count for debugging
                if (DEBUG) console.log(`AutoBackup: Received ${lines.length} lines of output`);

                // Check if first line contains the command
                if (lines[0].includes(command)) {
                    lines = lines.slice(1);
                    if (DEBUG) console.log("AutoBackup: Removed command line from output");
                }

                // Check if last line is a prompt
                if (
                    lines.length > 0 &&
                    (lines[lines.length - 1].trim() === "#" || lines[lines.length - 1].trim() === "")
                ) {
                    lines = lines.slice(0, -1);
                    if (DEBUG) console.log("AutoBackup: Removed prompt line from output");
                }

                const data = lines.join("\n");

                if (DEBUG) console.log(`AutoBackup: Final data length: ${data.length} chars`);

                // Hold the captured backup in memory immediately so it is available
                // for restore regardless of whether the file-save picker succeeds.
                setLastBackupData(data);

                this.sendCommand("exit", this.onClose.bind(this));
                this.save(data);
            }
            // Check if we've waited too long
            else if (elapsedTime >= maxWaitTime) {
                console.error(`AutoBackup: Timeout waiting for command completion after ${maxWaitTime / 1000}s`);

                const lines = this.outputHistory.split(/\r?\n/);
                // Remove first line if it contains the command
                const filteredLines = lines[0].includes(command) ? lines.slice(1) : lines;
                const data = filteredLines.join("\n");

                // Hold partial backup data in memory as well — better than nothing.
                setLastBackupData(data);
                // Only persist partial data if it actually looks like a CLI dump.
                // Writing a truncated-but-valid backup beats nothing, but writing
                // binary/garbage that merely never reached the prompt is worse.
                if (!isPlausibleCliDump(data)) {
                    this.failBackup(intervalId, "timed out without receiving a valid CLI dump.");
                    return;
                }

                clearInterval(intervalId);
                if (DEBUG) console.log(`AutoBackup: Saving partial data, buffer length: ${this.outputHistory.length}`);

                this.sendCommand("exit", this.onClose.bind(this));
                this.save(data);
            }
        }, checkInterval);
    }

    async activateCliMode() {
        return new Promise((resolve) => {
            const bufferOut = new ArrayBuffer(1);
            const bufView = new Uint8Array(bufferOut);

            bufView[0] = 0x23;

            serial.send(bufferOut);

            setTimeout(() => {
                this.resetBuffer();
                resolve();
            }, 1000);
        });
    }

    async sendSerial(line, callback) {
        const bufferOut = new ArrayBuffer(line.length);
        const bufView = new Uint8Array(bufferOut);

        for (let cKey = 0; cKey < line.length; cKey++) {
            bufView[cKey] = line.charCodeAt(cKey);
        }

        serial.send(bufferOut, callback);
    }

    async sendCommand(line, callback) {
        this.sendSerial(`${line}\n`, callback);
    }

    execute(callback) {
        // Reset state at the beginning of a new run
        this.resetBuffer();
        this.callback = callback;
        this.cleanupListeners();

        const port = PortHandler.portPicker.selectedPort;
        const baud = PortHandler.portPicker.selectedBauds;

        if (port.startsWith("serial")) {
            this.boundHandleConnect = this.handleConnect.bind(this);
            serial.addEventListener("connect", this.boundHandleConnect, { once: true });
            serial.connect(port, { baudRate: baud });
        } else if (port.startsWith("capacitor-")) {
            // Skip backup on Android (serial disconnect causes device loss), proceed with flashing
            console.log("AutoBackup: Skipping backup on Android capacitor port");
            if (this.callback) {
                this.callback(true);
            }
        } else {
            gui_log(i18n.getMessage("firmwareFlasherNoPortSelected"));
        }
    }
}

export default new AutoBackup();
