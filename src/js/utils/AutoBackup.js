import PortHandler from '../port_handler';
import FileSystem from '../FileSystem';
import { generateFilename } from './generate_filename';
import { gui_log } from '../gui_log';
import { i18n } from "../localization";
import serial from '../webSerial';

/**
 *
 * Bacup the current configuration to a file before flashing in serial mode
 *
 */

class AutoBackup {
    constructor() {
        this.outputHistory = '';
        this.callback = null;
    }

    handleConnect(openInfo) {
        console.log('Connected to serial port:', openInfo);
        if (openInfo) {
            serial.removeEventListener('receive', this.readSerialAdapter);
            serial.addEventListener('receive', this.readSerialAdapter.bind(this));

            this.run();
        } else {
            gui_log(i18n.getMessage('serialPortOpenFail'));
        }
    }

    handleDisconnect(event) {
        gui_log(i18n.getMessage(event.detail ? 'serialPortClosedOk' : 'serialPortClosedFail'));

        serial.removeEventListener('receive', this.readSerialAdapter);
        serial.removeEventListener('connect', this.handleConnect);
        serial.removeEventListener('disconnect', this.handleDisconnect);
    }

    readSerialAdapter(info) {
        const data = new Uint8Array(info.detail.buffer);

        for (const charCode of data) {
            const currentChar = String.fromCharCode(charCode);
            this.outputHistory += currentChar;
        }
    }

    onClose() {
        serial.addEventListener('disconnect', this.handleDisconnect.bind(this), { once: true });
        serial.disconnect();
    }

    async save(data) {
        console.log('Saving backup');
        const prefix = 'cli_backup';
        const suffix = 'txt';
        const filename = generateFilename(prefix, suffix);

        FileSystem.pickSaveFile(filename, i18n.getMessage('fileSystemPickerFiles', { types: suffix.toUpperCase() }), `.${suffix}`)
        .then((file) => {
            console.log("Saving config to:", file.name);
            FileSystem.writeFile(file, data);
        })
        .catch((error) => {
            console.error("Error saving config:", error);
        })
        .finally(() => {
            if (this.callback) {
                this.callback();
            }
        });
    }

    async run() {
        console.log('Running backup');

        await this.activateCliMode();
        await this.sendCommand("diff all");

        setTimeout(async () => {
            this.sendCommand("exit", this.onClose);
            // remove the command from the output
            const data = this.outputHistory.split("\n").slice(1).join("\n");
            await this.save(data);
        }, 1500);
    }

    async activateCliMode() {
        return new Promise(resolve => {
            const bufferOut = new ArrayBuffer(1);
            const bufView = new Uint8Array(bufferOut);

            bufView[0] = 0x23;

            serial.send(bufferOut);

            setTimeout(() => {
                this.outputHistory = '';
                resolve();
            }, 500);
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

        if (port.startsWith('serial')) {
            serial.addEventListener('connect', this.handleConnect.bind(this), { once: true });
            serial.connect(port, { baudRate: baud });
        } else {
            gui_log(i18n.getMessage('firmwareFlasherNoPortSelected'));
        }
    }
}

export default new AutoBackup();
