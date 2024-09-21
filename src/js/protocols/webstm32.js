/*
    STM32 F103 serial bus seems to properly initialize with quite a huge auto-baud range
    From 921600 down to 1200, i don't recommend getting any lower then that
    Official "specs" are from 115200 to 1200

    popular choices - 921600, 460800, 256000, 230400, 153600, 128000, 115200, 57600, 38400, 28800, 19200
*/
import MSPConnectorImpl from "../msp/MSPConnector";
import GUI, { TABS } from "../gui";
import { i18n } from "../localization";
import MSP from "../msp";
import FC from "../fc";
import { bit_check } from "../bit";
import { gui_log } from "../gui_log";
import MSPCodes from "../msp/MSPCodes";
import PortUsage from "../port_usage";
import $ from 'jquery';
import serial from "../webSerial";
import DFU from "../protocols/webusbdfu";
import { read_serial } from "../serial_backend";
import NotificationManager from "../utils/notifications";
import { get as getConfig } from '../ConfigStorage';

function readSerialAdapter(event) {
    read_serial(event.detail.buffer);
}

function onTimeoutHandler() {
    GUI.connect_lock = false;
    console.log('Looking for capabilities via MSP failed');

    TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32RebootingToBootloaderFailed'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);
}

function onFailureHandler() {
    GUI.connect_lock = false;
    TABS.firmware_flasher.refresh();
}

class STM32Protocol {
    constructor() {
        this.baud = null;
        this.options = {};
        this.callback = null;
        this.hex = null;
        this.verify_hex = [];

        this.receive_buffer = [];

        this.bytesToRead = 0;
        this.read_callback = null;

        this.upload_time_start = 0;
        this.upload_process_alive = false;

        this.mspConnector = new MSPConnectorImpl();

        this.status = {
            ACK: 0x79, // y
            NACK: 0x1F,
        };

        this.command = {
            get: 0x00, // Gets the version and the allowed commands supported by the current version of the bootloader
            get_ver_r_protect_s: 0x01, // Gets the bootloader version and the Read Protection status of the Flash memory
            get_ID: 0x02, // Gets the chip ID
            read_memory: 0x11, // Reads up to 256 bytes of memory starting from an address specified by the application
            go: 0x21, // Jumps to user application code located in the internal Flash memory or in SRAM
            write_memory: 0x31, // Writes up to 256 bytes to the RAM or Flash memory starting from an address specified by the application
            erase: 0x43, // Erases from one to all the Flash memory pages
            extended_erase: 0x44, // Erases from one to all the Flash memory pages using two byte addressing mode (v3.0+ usart).
            write_protect: 0x63, // Enables the write protection for some sectors
            write_unprotect: 0x73, // Disables the write protection for all Flash memory sectors
            readout_protect: 0x82, // Enables the read protection
            readout_unprotect: 0x92, // Disables the read protection
        };

        // Erase (x043) and Extended Erase (0x44) are exclusive. A device may support either the Erase command or the Extended Erase command but not both.
        this.available_flash_size = 0;
        this.page_size = 0;
        this.useExtendedErase = false;
        this.rebootMode = 0;
        this.handleMSPConnect = this.handleMSPConnect.bind(this);
    }

    handleConnect(event) {
        console.log('Connected to serial port', event.detail, event);
        if (event) {
            // we are connected, disabling connect button in the UI
            GUI.connect_lock = true;

            this.initialize();
        } else {
            gui_log(i18n.getMessage('serialPortOpenFail'));
        }
    }

    handleDisconnect(disconnectionResult) {
        console.log('Waiting for DFU connection');

        serial.removeEventListener('connect', (event) => this.handleConnect(event.detail));
        serial.removeEventListener('disconnect', (event) => this.handleDisconnect(event.detail));

        if (disconnectionResult && this.rebootMode) {

            // If the firmware_flasher does not start flashing, we need to ask for permission to flash
            setTimeout(() => {
                if (this.rebootMode) {
                    console.log('STM32 Requesting permission for device');

                    DFU.requestPermission()
                    .then((device) => {

                        if (device != null) {
                            console.log('DFU request permission granted', device);
                        } else {
                            console.error('DFU request permission denied');
                            this.rebootMode = 0;
                            GUI.connect_lock = false;
                        }
                    })
                    .catch (e => {
                        console.error('DFU request permission failed', e);
                        this.rebootMode = 0;
                        GUI.connect_lock = false;
                    });
                }
            }, 3000);

        } else {
            GUI.connect_lock = false;
        }
    }

    prepareSerialPort() {
        serial.removeEventListener('connect', (event) => this.handleConnect(event.detail));
        serial.addEventListener('connect', (event) => this.handleConnect(event.detail), { once: true });

        serial.removeEventListener('disconnect', (event) => this.handleDisconnect(event.detail));
        serial.addEventListener('disconnect', (event) => this.handleDisconnect(event.detail) , { once: true });
    }

    reboot() {
        const buffer = [];
        buffer.push8(this.rebootMode);
        setTimeout(() => {
            MSP.promise(MSPCodes.MSP_SET_REBOOT, buffer)
            .then(() => {
                // if firmware doesn't flush MSP/serial send buffers and gracefully shutdown VCP connections we won't get a reply, so don't wait for it.
                this.mspConnector.disconnect(disconnectionResult => {
                    console.log('Disconnecting from MSP', disconnectionResult);
                    this.handleDisconnect(disconnectionResult);
                });
            });
            console.log('Reboot request received by device');
        }, 100);
    }

    onAbort() {
        GUI.connect_lock = false;
        this.rebootMode = 0;
        console.log('User cancelled because selected target does not match verified board');
        this.reboot();
        TABS.firmware_flasher.refresh();
    }

    lookingForCapabilitiesViaMSP() {
        console.log('Looking for capabilities via MSP');

        MSP.promise(MSPCodes.MSP_BOARD_INFO)
        .then(() => {
            if (bit_check(FC.CONFIG.targetCapabilities, FC.TARGET_CAPABILITIES_FLAGS.HAS_FLASH_BOOTLOADER)) {
                // Board has flash bootloader
                gui_log(i18n.getMessage('deviceRebooting_flashBootloader'));
                console.log('flash bootloader detected');
                this.rebootMode = 4; // MSP_REBOOT_BOOTLOADER_FLASH
            } else {
                gui_log(i18n.getMessage('deviceRebooting_romBootloader'));
                console.log('no flash bootloader detected');
                this.rebootMode = 1; // MSP_REBOOT_BOOTLOADER_ROM;
            }

            const selectedBoard = TABS.firmware_flasher.selectedBoard !== '0' ? TABS.firmware_flasher.selectedBoard : 'NONE';
            const connectedBoard = FC.CONFIG.boardName ? FC.CONFIG.boardName : 'UNKNOWN';

            try {
                if (selectedBoard !== connectedBoard && !TABS.firmware_flasher.localFirmwareLoaded) {
                    TABS.firmware_flasher.showDialogVerifyBoard(selectedBoard, connectedBoard, this.reboot.bind(this), this.onAbort.bind(this));
                } else {
                    this.reboot();
                }
            } catch (e) {
                console.error(e);
                this.reboot();
            }
        });
    }

    handleMSPConnect() {
        gui_log(i18n.getMessage('apiVersionReceived', [FC.CONFIG.apiVersion]));

        this.lookingForCapabilitiesViaMSP();
    }

    // no input parameters
    connect(port, baud, hex, options, callback) {
        this.hex = hex;
        this.port = port;
        this.baud = baud;
        this.callback = callback;
        this.serialOptions = options;

        // we will crunch the options here since doing it inside initialization routine would be too late
        this.mspOptions = {
            no_reboot: false,
            reboot_baud: false,
            erase_chip: false,
        };

        if (options.no_reboot) {
            this.mspOptions.no_reboot = true;
        } else {
            this.mspOptions.reboot_baud = options.reboot_baud;
        }

        if (options.erase_chip) {
            this.mspOptions.erase_chip = true;
        }

        if (this.options.no_reboot) {
            // TODO: update to use web serial / USB API
            this.prepareSerialPort();
            serial.connect(port, { baudRate: this.baud, parityBit: 'even', stopBits: 'one' });
        } else {
            this.rebootMode = 0; // FIRMWARE

            GUI.connect_lock = true;
            TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32RebootingToBootloader'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL);

            serial.addEventListener('disconnect', (event) => this.handleDisconnect(event.detail), { once: true });

            this.mspConnector.connect(this.port, this.mspOptions.reboot_baud, this.handleMSPConnect, onTimeoutHandler, onFailureHandler);
        }
    }

    // initialize certain variables and start timers that oversee the communication
    initialize() {

        console.log(":exploding_head:");

        // reset and set some variables before we start
        this.receive_buffer = [];
        this.verify_hex = [];

        this.upload_time_start = new Date().getTime();
        this.upload_process_alive = false;

        // reset progress bar to initial state
        TABS.firmware_flasher.flashingMessage(null, TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL)
            .flashProgress(0);

        // lock some UI elements TODO needs rework
        $('select[name="release"]').prop('disabled', true);

        serial.removeEventListener('receive', readSerialAdapter);
        serial.addEventListener('receive', readSerialAdapter);

        GUI.interval_add('STM32_timeout', () => {
            if (this.upload_process_alive) { // process is running
                this.upload_process_alive = false;
            } else {
                console.log('STM32 - timed out, programming failed ...');

                TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32TimedOut'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);

                // protocol got stuck, clear timer and disconnect
                GUI.interval_remove('STM32_timeout');

                // exit
                this.upload_procedure(99);
            }
        }, 2000);

        console.log('STM32 - Initialization done, starting upload procedure');

        this.upload_procedure(1);
    }
    // no input parameters
    // this method should be executed every 1 ms via interval timer
    read(readInfo) {
        // routine that fills the buffer
        const data = new Uint8Array(readInfo.data);

        for (const instance of data) {
            this.receive_buffer.push(instance);
        }

        // routine that fetches data from buffer if statement is true
        if (this.receive_buffer.length >= this.bytesToRead && this.bytesToRead != 0) {
            const fetched = this.receive_buffer.slice(0, this.bytesToRead); // bytes requested
            this.receive_buffer.splice(0, this.bytesToRead); // remove read bytes

            this.bytesToRead = 0; // reset trigger

            this.read_callback(fetched);
        }
    }
    // we should always try to consume all "proper" available data while using retrieve
    retrieve(nBytes, callback) {
        if (this.receive_buffer.length >= nBytes) {
            // data that we need are there, process immediately
            const data = this.receive_buffer.slice(0, nBytes);
            this.receive_buffer.splice(0, nBytes); // remove read bytes

            callback(data);
        } else {
            // still waiting for data, add callback
            this.bytesToRead = nBytes;
            this.read_callback = callback;
        }
    }
    // bytes_to_send = array of bytes that will be send over serial
    // bytesToRead = received bytes necessary to trigger read_callback
    // callback = function that will be executed after received bytes = bytesToRead
    send(bytes_to_send, bytesToRead, callback) {
        // flip flag
        this.upload_process_alive = true;

        const bufferOut = new ArrayBuffer(bytes_to_send.length);
        const bufferView = new Uint8Array(bufferOut);

        // set bytes_to_send values inside bufferView (alternative to for loop)
        bufferView.set(bytes_to_send);

        // update references
        this.bytesToRead = bytesToRead;
        this.read_callback = callback;

        // empty receive buffer before next command is out
        this.receive_buffer = [];

        // send over the actual data
        serial.send(bufferOut);
    }
    // val = single byte to be verified
    // data = response of n bytes from mcu (array)
    // result = true/false
    verify_response(val, data) {

        if (val !== data[0]) {
            const message = `STM32 Communication failed, wrong response, expected: ${val} (0x${val.toString(16)}) received: ${data[0]} (0x${data[0].toString(16)})`;
            console.error(message);
            TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32WrongResponse', [val, val.toString(16), data[0], data[0].toString(16)]), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);

            // disconnect
            this.upload_procedure(99);

            return false;
        }

        return true;
    }
    // input = 16 bit value
    // result = true/false
    verify_chip_signature(signature) {
        switch (signature) {
            case 0x412: // not tested
                console.log('Chip recognized as F1 Low-density');
                break;
            case 0x410:
                console.log('Chip recognized as F1 Medium-density');
                this.available_flash_size = 131072;
                this.page_size = 1024;
                break;
            case 0x414:
                this.available_flash_size = 0x40000;
                this.page_size = 2048;
                console.log('Chip recognized as F1 High-density');
                break;
            case 0x418: // not tested
                console.log('Chip recognized as F1 Connectivity line');
                break;
            case 0x420: // not tested
                console.log('Chip recognized as F1 Medium-density value line');
                break;
            case 0x428: // not tested
                console.log('Chip recognized as F1 High-density value line');
                break;
            case 0x430: // not tested
                console.log('Chip recognized as F1 XL-density value line');
                break;
            case 0x416: // not tested
                console.log('Chip recognized as L1 Medium-density ultralow power');
                break;
            case 0x436: // not tested
                console.log('Chip recognized as L1 High-density ultralow power');
                break;
            case 0x427: // not tested
                console.log('Chip recognized as L1 Medium-density plus ultralow power');
                break;
            case 0x411: // not tested
                console.log('Chip recognized as F2 STM32F2xxxx');
                break;
            case 0x440: // not tested
                console.log('Chip recognized as F0 STM32F051xx');
                break;
            case 0x444: // not tested
                console.log('Chip recognized as F0 STM32F050xx');
                break;
            case 0x413: // not tested
                console.log('Chip recognized as F4 STM32F40xxx/41xxx');
                break;
            case 0x419: // not tested
                console.log('Chip recognized as F4 STM32F427xx/437xx, STM32F429xx/439xx');
                break;
            case 0x432: // not tested
                console.log('Chip recognized as F3 STM32F37xxx, STM32F38xxx');
                break;
            case 0x422:
                console.log('Chip recognized as F3 STM32F30xxx, STM32F31xxx');
                this.available_flash_size = 0x40000;
                this.page_size = 2048;
                break;
            default:
                console.log(`Chip NOT recognized: ${signature}`);
                break;
        }

        if (this.available_flash_size > 0) {
            if (this.hex.bytes_total < this.available_flash_size) {
                return true;
            } else {
                console.log(`Supplied hex is bigger then flash available on the chip, HEX: ${this.hex.bytes_total} bytes, limit = ${this.available_flash_size} bytes`);
                return false;
            }
        }

        console.log(`Chip NOT recognized: ${signature}`);

        return false;
    }
    // firstArray = usually hex_to_flash array
    // secondArray = usually verify_hex array
    // result = true/false
    verify_flash(firstArray, secondArray) {
        for (let i = 0; i < firstArray.length; i++) {
            if (firstArray[i] !== secondArray[i]) {
                console.log(`Verification failed on byte: ${i} expected: 0x${firstArray[i].toString(16)} received: 0x${secondArray[i].toString(16)}`);
                return false;
            }
        }

        console.log(`Verification successful, matching: ${firstArray.length} bytes`);

        return true;
    }
    // step = value depending on current state of upload_procedure
    upload_procedure(step) {

        switch (step) {
            case 1: {
                // initialize serial interface on the MCU side, auto baud rate settings
                TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32ContactingBootloader'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL);

                let sendCounter = 0;
                GUI.interval_add('stm32_initialize_mcu', () => {
                    this.send([0x7F], 1, (reply) => {
                        if (reply[0] === 0x7F || reply[0] === this.status.ACK || reply[0] === this.status.NACK) {
                            GUI.interval_remove('stm32_initialize_mcu');
                            console.log('STM32 - Serial interface initialized on the MCU side');

                            // proceed to next step
                            this.upload_procedure(2);
                        } else {
                            TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32ContactingBootloaderFailed'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);

                            GUI.interval_remove('stm32_initialize_mcu');

                            // disconnect
                            this.upload_procedure(99);
                        }
                    });

                    if (sendCounter++ > 3) {
                        // stop retrying, its too late to get any response from MCU
                        console.log('STM32 - no response from bootloader, disconnecting');

                        TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32ResponseBootloaderFailed'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);

                        GUI.interval_remove('stm32_initialize_mcu');
                        GUI.interval_remove('STM32_timeout');

                        // exit
                        this.upload_procedure(99);
                    }
                }, 250, true);

                break;
            }
            case 2: {
                // get version of the bootloader and supported commands
                this.send([this.command.get, 0xFF], 2, (data) => {
                    if (this.verify_response(this.status.ACK, data)) {
                        this.retrieve(data[1] + 1 + 1, (data) => {
                            console.log(`STM32 - Bootloader version: ${(parseInt(data[0].toString(16)) / 10).toFixed(1)}`); // convert dec to hex, hex to dec and add floating point

                            this.useExtendedErase = (data[7] === this.command.extended_erase);

                            // proceed to next step
                            this.upload_procedure(3);
                        });
                    }
                });

                break;
            }
            case 3:
                // get ID (device signature)
                this.send([this.command.get_ID, 0xFD], 2, (data) => {
                    if (this.verify_response(this.status.ACK, data)) {
                        this.retrieve(data[1] + 1 + 1, (data) => {
                            const signature = (data[0] << 8) | data[1];
                            console.log(`STM32 - Signature: 0x${signature.toString(16)}`); // signature in hex representation

                            if (this.verify_chip_signature(signature)) {
                                // proceed to next step
                                this.upload_procedure(4);
                            } else {
                                // disconnect
                                this.upload_procedure(99);
                            }
                        });
                    }
                });

                break;
            case 4: {
                // erase memory
                if (this.useExtendedErase) {
                    if (this.options.erase_chip) {

                        const message = 'Executing global chip erase (via extended erase)';
                        console.log(message);
                        TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32GlobalEraseExtended'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL);

                        this.send([this.command.extended_erase, 0xBB], 1, (reply) => {
                            if (this.verify_response(this.status.ACK, reply)) {
                                this.send([0xFF, 0xFF, 0x00], 1, (reply) => {
                                    if (this.verify_response(this.status.ACK, reply)) {
                                        console.log('Executing global chip extended erase: done');
                                        this.upload_procedure(5);
                                    }
                                });
                            }
                        });

                    } else {
                        const message = 'Executing local erase (via extended erase)';
                        console.log(message);
                        TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32LocalEraseExtended'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL);

                        this.send([this.command.extended_erase, 0xBB], 1, (reply) => {
                            if (this.verify_response(this.status.ACK, reply)) {

                                // For reference: https://code.google.com/p/stm32flash/source/browse/stm32.c#723
                                const maxAddress = this.hex.data[this.hex.data.length - 1].address + this.hex.data[this.hex.data.length - 1].bytes - 0x8000000;
                                const erasePagesN = Math.ceil(maxAddress / this.page_size);
                                const buff = [];
                                let checksum = 0;

                                let pgByte;

                                pgByte = (erasePagesN - 1) >> 8;
                                buff.push(pgByte);
                                checksum ^= pgByte;
                                pgByte = (erasePagesN - 1) & 0xFF;
                                buff.push(pgByte);
                                checksum ^= pgByte;


                                for (let i = 0; i < erasePagesN; i++) {
                                    pgByte = i >> 8;
                                    buff.push(pgByte);
                                    checksum ^= pgByte;
                                    pgByte = i & 0xFF;
                                    buff.push(pgByte);
                                    checksum ^= pgByte;
                                }

                                buff.push(checksum);
                                console.log(`Erasing. pages: 0x00 - 0x${erasePagesN.toString(16)}, checksum: 0x${checksum.toString(16)}`);

                                this.send(buff, 1, (_reply) => {
                                    if (this.verify_response(this.status.ACK, _reply)) {
                                        console.log('Erasing: done');
                                        // proceed to next step
                                        this.upload_procedure(5);
                                    }
                                });
                            }
                        });


                    }
                    break;
                }

                if (this.options.erase_chip) {
                    const message = 'Executing global chip erase';
                    console.log(message);
                    TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32GlobalErase'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL);

                    this.send([this.command.erase, 0xBC], 1, (reply) => {
                        if (this.verify_response(this.status.ACK, reply)) {
                            this.send([0xFF, 0x00], 1, (reply) => {
                                if (this.verify_response(this.status.ACK, reply)) {
                                    console.log('Erasing: done');
                                    // proceed to next step
                                    this.upload_procedure(5);
                                }
                            });
                        }
                    });
                } else {
                    const message = 'Executing local erase';
                    console.log(message);
                    TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32LocalErase'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL);

                    this.send([this.command.erase, 0xBC], 1, (reply) => {
                        if (this.verify_response(this.status.ACK, reply)) {
                            // the bootloader receives one byte that contains N, the number of pages to be erased – 1
                            const maxAddress = this.hex.data[this.hex.data.length - 1].address + this.hex.data[this.hex.data.length - 1].bytes - 0x8000000;
                            const erasePagesN = Math.ceil(maxAddress / this.page_size);
                            const buff = [];
                            let checksum = erasePagesN - 1;

                            buff.push(erasePagesN - 1);

                            for (let ii = 0; ii < erasePagesN; ii++) {
                                buff.push(ii);
                                checksum ^= ii;
                            }

                            buff.push(checksum);

                            this.send(buff, 1, (reply) => {
                                if (this.verify_response(this.status.ACK, reply)) {
                                    console.log('Erasing: done');
                                    // proceed to next step
                                    this.upload_procedure(5);
                                }
                            });
                        }
                    });
                }

                break;
            }
            case 5: {
                // upload
                console.log('Writing data ...');
                TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32Flashing'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL);

                let blocks = this.hex.data.length - 1, flashing_block = 0, address = this.hex.data[flashing_block].address, bytes_flashed = 0, bytes_flashed_total = 0; // used for progress bar

                const write = () => {
                    if (bytes_flashed < this.hex.data[flashing_block].bytes) {
                        const bytesToWrite = ((bytes_flashed + 256) <= this.hex.data[flashing_block].bytes) ? 256 : (this.hex.data[flashing_block].bytes - bytes_flashed);

                        // DEBUG - console.log('STM32 - Writing to: 0x' + address.toString(16) + ', ' + bytesToWrite + ' bytes');
                        this.send([this.command.write_memory, 0xCE], 1, (reply) => {
                            if (this.verify_response(this.status.ACK, reply)) {
                                // address needs to be transmitted as 32 bit integer, we need to bit shift each byte out and then calculate address checksum
                                const addressArray = [(address >> 24), (address >> 16), (address >> 8), address];
                                const addressChecksum = addressArray[0] ^ addressArray[1] ^ addressArray[2] ^ addressArray[3];
                                // write start address + checksum
                                this.send([addressArray[0], addressArray[1], addressArray[2], addressArray[3], addressChecksum], 1, (_reply) => {
                                    if (this.verify_response(this.status.ACK, _reply)) {
                                        const arrayOut = Array.from(bytesToWrite + 2); // 2 byte overhead [N, ...., checksum]
                                        arrayOut[0] = bytesToWrite - 1; // number of bytes to be written (to write 128 bytes, N must be 127, to write 256 bytes, N must be 255)

                                        let checksum = arrayOut[0];
                                        for (let ii = 0; ii < bytesToWrite; ii++) {
                                            arrayOut[ii + 1] = this.hex.data[flashing_block].data[bytes_flashed]; // + 1 because of the first byte offset
                                            checksum ^= this.hex.data[flashing_block].data[bytes_flashed];

                                            bytes_flashed++;
                                        }
                                        arrayOut[arrayOut.length - 1] = checksum; // checksum (last byte in the arrayOut array)

                                        address += bytesToWrite;
                                        bytes_flashed_total += bytesToWrite;

                                        this.send(arrayOut, 1, (response) => {
                                            if (this.verify_response(this.status.ACK, response)) {
                                                // flash another page
                                                write();
                                            }
                                        });

                                        // update progress bar
                                        TABS.firmware_flasher.flashProgress(Math.round(bytes_flashed_total / (this.hex.bytes_total * 2) * 100));
                                    }
                                });
                            }
                        });
                    } else if (flashing_block < blocks) {
                        // move to another block
                        flashing_block++;

                        address = this.hex.data[flashing_block].address;
                        bytes_flashed = 0;

                        write();
                    } else {
                        // all blocks flashed
                        console.log('Writing: done');

                        // proceed to next step
                        this.upload_procedure(6);
                    }
                };

                // start writing
                write();

                break;
            }
            case 6: {
                // verify
                console.log('Verifying data ...');
                TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32Verifying'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL);

                const blocks = this.hex.data.length - 1;
                let readingBlock = 0;
                let address = this.hex.data[readingBlock].address;
                let bytesVerified = 0;
                let bytesVerifiedTotal = 0; // used for progress bar


                // initialize arrays
                for (let i = 0; i <= blocks; i++) {
                    this.verify_hex.push([]);
                }

                const reading = () => {
                    if (bytesVerified < this.hex.data[readingBlock].bytes) {
                        const bytesToRead = ((bytesVerified + 256) <= this.hex.data[readingBlock].bytes) ? 256 : (this.hex.data[readingBlock].bytes - bytesVerified);

                        // DEBUG console.log('STM32 - Reading from: 0x' + address.toString(16) + ', ' + bytesToRead + ' bytes');
                        this.send([this.command.read_memory, 0xEE], 1, (reply) => {
                            if (this.verify_response(this.status.ACK, reply)) {
                                const addressArray = [(address >> 24), (address >> 16), (address >> 8), address];
                                const addressChecksum = addressArray[0] ^ addressArray[1] ^ addressArray[2] ^ addressArray[3];

                                this.send([addressArray[0], addressArray[1], addressArray[2], addressArray[3], addressChecksum], 1, (_reply) => {
                                    if (this.verify_response(this.status.ACK, _reply)) {
                                        const bytesToReadN = bytesToRead - 1;
                                        // bytes to be read + checksum XOR(complement of bytesToReadN)
                                        this.send([bytesToReadN, (~bytesToReadN) & 0xFF], 1, (response) => {
                                            if (this.verify_response(this.status.ACK, response)) {
                                                this.retrieve(bytesToRead, (data) => {
                                                    for (const instance of data) {
                                                        this.verify_hex[readingBlock].push(instance);
                                                    }

                                                    address += bytesToRead;
                                                    bytesVerified += bytesToRead;
                                                    bytesVerifiedTotal += bytesToRead;

                                                    // verify another page
                                                    reading();
                                                });
                                            }
                                        });

                                        // update progress bar
                                        TABS.firmware_flasher.flashProgress(Math.round((this.hex.bytes_total + bytesVerifiedTotal) / (this.hex.bytes_total * 2) * 100));
                                    }
                                });
                            }
                        });
                    } else if (readingBlock < blocks) {
                        // move to another block
                        readingBlock++;

                        address = this.hex.data[readingBlock].address;
                        bytesVerified = 0;

                        reading();
                    } else {
                        // all blocks read, verify
                        let verify = true;
                        for (let i = 0; i <= blocks; i++) {
                            verify = this.verify_flash(this.hex.data[i].data, this.verify_hex[i]);

                            if (!verify) {
                                break;
                            }
                        }

                        if (verify) {
                            console.log('Programming: SUCCESSFUL');
                            // update progress bar
                            TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32ProgrammingSuccessful'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.VALID);

                            // Show notification
                            if (getConfig('showNotifications').showNotifications) {
                                NotificationManager.showNotification("Betaflight Configurator", {body: i18n.getMessage('programmingSuccessfulNotification'), icon: "/images/pwa/favicon.ico"});
                            }

                            // proceed to next step
                            this.upload_procedure(7);
                        } else {
                            console.log('Programming: FAILED');
                            // update progress bar
                            TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32ProgrammingFailed'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);

                            // Show notification
                            if (getConfig('showNotifications').showNotifications) {
                                NotificationManager.showNotification("Betaflight Configurator", {body: i18n.getMessage('programmingFailedNotification'), icon: "/images/pwa/favicon.ico"});
                            }

                            // disconnect
                            this.upload_procedure(99);
                        }
                    }
                };

                // start reading
                reading();

                break;
            }
            case 7: {
                // go
                // memory address = 4 bytes, 1st high byte, 4th low byte, 5th byte = checksum XOR(byte 1, byte 2, byte 3, byte 4)
                console.log('Sending GO command: 0x8000000');

                this.send([this.command.go, 0xDE], 1, (reply) => {
                    if (this.verify_response(this.status.ACK, reply)) {
                        const gtAddress = 0x8000000;
                        const address = [(gtAddress >> 24), (gtAddress >> 16), (gtAddress >> 8), gtAddress];
                        const addressChecksum = address[0] ^ address[1] ^ address[2] ^ address[3];

                        this.send([address[0], address[1], address[2], address[3], addressChecksum], 1, (response) => {
                            if (this.verify_response(this.status.ACK, response)) {
                                // disconnect
                                this.upload_procedure(99);
                            }
                        });
                    }
                });

                break;
            }
            case 99: {
                // disconnect
                GUI.interval_remove('STM32_timeout'); // stop STM32 timeout timer (everything is finished now)


                // close connection
                if (serial.connectionId) {
                    serial.disconnect(this.cleanup);
                } else {
                    this.cleanup();
                }

                break;
            }
        }
    }
    cleanup() {
        PortUsage.reset();

        // unlocking connect button
        GUI.connect_lock = false;

        // unlock some UI elements TODO needs rework
        $('select[name="release"]').prop('disabled', false);

        // handle timing
        const timeSpent = new Date().getTime() - this.upload_time_start;

        console.log(`Script finished after: ${(timeSpent / 1000)} seconds`);

        if (this.callback) {
            this.callback();
        }
    }
}

// initialize object
const STM32 = new STM32Protocol();
export default STM32;
