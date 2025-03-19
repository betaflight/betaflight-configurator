import PortHandler from "../port_handler";
import FileSystem from "../FileSystem";
import { generateFilename } from "./generate_filename";
import { gui_log } from "../gui_log";
import { i18n } from "../localization";
import serial from "../webSerial";

/**
 *
 * Bacup the current configuration to a file before flashing in serial mode
 *
 */

class AutoBackup {
    constructor() {
        this.outputHistory = "";
        this.callback = null;
    }

    handleConnect(openInfo) {
        console.log("Connected to serial port:", openInfo);
        if (openInfo) {
            serial.removeEventListener("receive", this.readSerialAdapter);
            serial.addEventListener("receive", this.readSerialAdapter.bind(this));

            this.run();
        } else {
            gui_log(i18n.getMessage("serialPortOpenFail"));
        }
    }

    handleDisconnect(event) {
        gui_log(i18n.getMessage(event.detail ? "serialPortClosedOk" : "serialPortClosedFail"));

        serial.removeEventListener("receive", this.readSerialAdapter);
        serial.removeEventListener("connect", this.handleConnect);
        serial.removeEventListener("disconnect", this.handleDisconnect);
    }

    readSerialAdapter(info) {
        const data = new Uint8Array(info.detail.buffer);

        for (const charCode of data) {
            const currentChar = String.fromCharCode(charCode);
            this.outputHistory += currentChar;
        }
    }

    onClose() {
        serial.addEventListener("disconnect", this.handleDisconnect.bind(this), { once: true });
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
        this.outputHistory = "";

        // Send the command
        this.sendCommand(command);

        // Set up a check interval
        const checkInterval = 100; // Check every 100ms
        const maxWaitTime = 10000; // Maximum 10 seconds wait
        let elapsedTime = 0;

        const intervalId = setInterval(() => {
            elapsedTime += checkInterval;

            // Check if we have received the CLI prompt (#) at the end of a line
            if (this.outputHistory.includes("\n# ") || this.outputHistory.match(/\r?\n#$/)) {
                clearInterval(intervalId);

                // Process and save the output
                // Remove the command from the output and the ending prompt
                const lines = this.outputHistory.split(/\r?\n/);
                const filteredLines = lines.slice(1, -1); // Remove first line (command) and last line (prompt)
                const data = filteredLines.join("\n");

                this.sendCommand("exit", this.onClose.bind(this));
                this.save(data);
            }
            // Check if we've waited too long
            else if (elapsedTime >= maxWaitTime) {
                clearInterval(intervalId);
                console.error("Timeout waiting for command completion");

                // Try to save what we have (partial data is better than none)
                const data = this.outputHistory.split(/\r?\n/).slice(1).join("\n");
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
                this.outputHistory = "";
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
        this.callback = callback;

        const port = PortHandler.portPicker.selectedPort;
        const baud = PortHandler.portPicker.selectedBauds;

        if (port.startsWith("serial")) {
            serial.addEventListener("connect", this.handleConnect.bind(this), { once: true });
            serial.connect(port, { baudRate: baud });
        } else {
            gui_log(i18n.getMessage("firmwareFlasherNoPortSelected"));
        }
    }
}

export default new AutoBackup();
