/*
    WEB USB DFU uses:

    Some references:
    https://wicg.github.io/webusb/
    https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API

    control transfers for communicating
    recipient is interface
    request type is class

    General rule to remember is that DFU doesn't like running specific operations while the device isn't in idle state
    that being said, it seems that certain level of CLRSTATUS is required before running another type of operation for
    example switching from DNLOAD to UPLOAD, etc, clearning the state so device is in dfuIDLE is highly recommended.
*/
import GUI, { TABS } from "../gui";
import { i18n } from "../localization";
import { gui_log } from "../gui_log";
import { usbDevices } from "../usb_devices";
import NotificationManager from "../utils/notifications";
import { get as getConfig } from '../ConfigStorage';

class WEBUSBDFU_protocol extends EventTarget {
    constructor() {
        super();
        this.callback = null;
        this.hex = null;
        this.verify_hex = [];

        this.request = {
            DETACH: 0x00, // OUT, Requests the device to leave DFU mode and enter the application.
            DNLOAD: 0x01, // OUT, Requests data transfer from Host to the device in order to load them into device internal Flash. Includes also erase commands
            UPLOAD: 0x02, // IN,  Requests data transfer from device to Host in order to load content of device internal Flash into a Host file.
            GETSTATUS: 0x03, // IN,  Requests device to send status report to the Host (including status resulting from the last request execution and the state the device will enter immediately after this request).
            CLRSTATUS: 0x04, // OUT, Requests device to clear error status and move to next step
            GETSTATE: 0x05, // IN,  Requests the device to send only the state it will enter immediately after this request.
            ABORT: 0x06, // OUT, Requests device to exit the current state/operation and enter idle state immediately.
        };

        this.status = {
            OK: 0x00, // No error condition is present.
            errTARGET: 0x01, // File is not targeted for use by this device.
            errFILE: 0x02, // File is for this device but fails some vendor-specific verification test
            errWRITE: 0x03, // Device is unable to write memory.
            errERASE: 0x04, // Memory erase function failed.
            errCHECK_ERASED: 0x05, // Memory erase check failed.
            errPROG: 0x06, // Program memory function failed.
            errVERIFY: 0x07, // Programmed memory failed verification.
            errADDRESS: 0x08, // Cannot program memory due to received address that is out of range.
            errNOTDONE: 0x09, // Received DFU_DNLOAD with wLength = 0, but device does not think it has all of the data yet.
            errFIRMWARE: 0x0A, // Device's firmware is corrupt. It cannot return to run-time (non-DFU) operations.
            errVENDOR: 0x0B, // iString indicates a vendor-specific error.
            errUSBR: 0x0C, // Device detected unexpected USB reset signaling.
            errPOR: 0x0D, // Device detected unexpected power on reset.
            errUNKNOWN: 0x0E, // Something went wrong, but the device does not know what it was.
            errSTALLEDPKT: 0x0F, // Device stalled an unexpected request.
        };

        this.state = {
            appIDLE: 0, // Device is running its normal application.
            appDETACH: 1, // Device is running its normal application, has received the DFU_DETACH request, and is waiting for a USB reset.
            dfuIDLE: 2, // Device is operating in the DFU mode and is waiting for requests.
            dfuDNLOAD_SYNC: 3, // Device has received a block and is waiting for the host to solicit the status via DFU_GETSTATUS.
            dfuDNBUSY: 4, // Device is programming a control-write block into its nonvolatile memories.
            dfuDNLOAD_IDLE: 5, // Device is processing a download operation. Expecting DFU_DNLOAD requests.
            dfuMANIFEST_SYNC: 6, // Device has received the final block of firmware from the host and is waiting for receipt of DFU_GETSTATUS to begin the Manifestation phase; or device has completed the Manifestation phase and is waiting for receipt of DFU_GETSTATUS.
            dfuMANIFEST: 7, // Device is in the Manifestation phase. (Not all devices will be able to respond to DFU_GETSTATUS when in this state.)
            dfuMANIFEST_WAIT_RESET: 8, // Device has programmed its memories and is waiting for a USB reset or a power on reset. (Devices that must enter this state clear bitManifestationTolerant to 0.)
            dfuUPLOAD_IDLE: 9, // The device is processing an upload operation. Expecting DFU_UPLOAD requests.
            dfuERROR: 10, // An error has occurred. Awaiting the DFU_CLRSTATUS request.
        };

        this.chipInfo = null; // information about chip's memory
        this.flash_layout = { 'start_address': 0, 'total_size': 0, 'sectors': [] };
        this.transferSize = 2048; // Default USB DFU transfer size for F3,F4 and F7

        navigator.usb.addEventListener("connect", e => this.handleNewDevice(e.device));
        navigator.usb.addEventListener("disconnect", e => this.handleNewDevice(e.device));
    }
    handleNewDevice(device) {
        const added = this.createPort(device);
        this.dispatchEvent(new CustomEvent("addedDevice", { detail: added }));

        return added;
    }
    handleRemovedDevice(device) {
        const removed = this.createPort(device);
        this.dispatchEvent(new CustomEvent("removedDevice", { detail: removed }));
    }
    createPort(port) {
        return {
            path: `usb_${port.serialNumber}`,
            displayName: `Betaflight ${port.productName}`,
            vendorId: port.manufacturerName,
            productId: port.productName,
            port: port,
        };
    }
    async getDevices() {
        const ports = await navigator.usb.getDevices(usbDevices);
        const customPorts = ports.map(function (port) {
            return this.createPort(port);
        }, this);

        return customPorts;
    }
    async requestPermission() {
        let newPermissionPort = null;
        try {
            const userSelectedPort = await navigator.usb.requestDevice(usbDevices);
            console.info("User selected USB device from permissions:", userSelectedPort);
            console.log(`WebUSB Version: ${userSelectedPort.deviceVersionMajor}.${userSelectedPort.deviceVersionMinor}.${userSelectedPort.deviceVersionSubminor}`);

            newPermissionPort = this.handleNewDevice(userSelectedPort);
        } catch (error) {
            console.error("User didn't select any USB device when requesting permission:", error);
        }
        return newPermissionPort;

    }
    getConnectedPort() {
        return this.usbDevice ? `usb_${this.usbDevice.serialNumber}` : null;
    }
    async connect(devicePath, hex, options, callback) {
        this.hex = hex;
        this.callback = callback;

        this.options = {
            erase_chip: false,
            exitDfu: false,
        };

        if (options.exitDfu) {
            this.options.exitDfu = true;
        } else if (options.erase_chip) {
            this.options.erase_chip = true;
        }

        // reset and set some variables before we start
        this.upload_time_start = new Date().getTime();
        this.verify_hex = [];

        // reset progress bar to initial state
        TABS.firmware_flasher.flashingMessage(null, TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL).flashProgress(0);

        const devices = await this.getDevices();
        const deviceFound = devices.find(device => device.path === devicePath);
        this.usbDevice = deviceFound.port;
        return this.openDevice();
    }
    openDevice() {
        this.usbDevice
        .open()
        .then(async () => {
            // show key values for the device
            console.log(`USB Device opened: ${this.usbDevice.productName}`);
            if (this.usbDevice.configuration === null) {
                await this.usbDevice.selectConfiguration(1);
            }
            this.claimInterface(0);
        })
        .catch(error => {
            console.log('Failed to open USB device:', error);
            gui_log(i18n.getMessage('usbDeviceOpenFail'));
        });
    }
    closeDevice() {
        this.usbDevice
        .close()
        .then(() => {
            gui_log(i18n.getMessage('usbDeviceClosed'));
            console.log('DFU Device closed');
        })
        .catch(error => {
            console.log('Failed to close USB device:', error);
            gui_log(i18n.getMessage('usbDeviceCloseFail'));
        });
        this.usbDevice = null;
    }
    claimInterface(interfaceNumber) {
        this.usbDevice
        .claimInterface(interfaceNumber)
        .then(() => {
            console.log(`Claimed interface: ${interfaceNumber}`);
            if (this.options.exitDfu) {
                this.leave();
            } else {
                this.upload_procedure(0);
            }
        })
        .catch(error => {
            console.log('Failed to claim USB device', error);
            this.cleanup();
        });
    }
    releaseInterface(interfaceNumber) {
        this.usbDevice
        .releaseInterface(interfaceNumber, () => {
            console.log(`Released interface: ${interfaceNumber}`);
        })
        .catch(error => {
            console.log(`Could not release interface: ${interfaceNumber} (${error})`);
        })
        .finally(() => {
            // releaseInterface does not work on some devices, so we close the device anyways
            this.closeDevice();
        });
    }
    resetDevice(callback) {
        this.usbDevice
        .reset()
        .then(() => {
            console.log('Reset Device');
            callback?.();
        })
        .catch(error => {
            console.log(`Could not reset device: ${error}`);
            callback?.();
        });
    }
    getString(index, callback) {
        const setup = {
            requestType: 'standard',
            recipient: 'device',
            request: 6,
            value: 0x300 | index,
            index: 0, // specifies language
        };

        this.usbDevice
        .controlTransferIn(setup, 255)
        .then(result => {
            if (result.status === 'ok') {
                const _length = result.data.getUint8(0);
                let _descriptor = '';
                for (let i = 2; i < _length; i += 2) {
                    const charCode = result.data.getUint16(i, true);
                    _descriptor += String.fromCharCode(charCode);
                }
                callback(_descriptor, 0);
            } else {
                throw new Error(`USB getString failed! ${result.status}`);
            }
        })
        .catch(error => {
            console.log(`USB getString failed! ${error}`);
            callback('', 1);
        });
    }
    getInterfaceDescriptors(interfaceNum, callback) {
        let interfaceID = 0;
        const descriptorStringArray = [];
        const interfaceCount = this.usbDevice.configuration.interfaces.length;
        let descriptorCount = 0;

        if (interfaceCount === 0) {
            callback(0, 1); // no interfaces
        } else if (interfaceCount === 1) {
            descriptorCount = this.usbDevice.configuration.interfaces[0].alternates.length;
        } else if (interfaceCount > 1) {
            descriptorCount = interfaceCount;
        }

        const getDescriptorString = () => {
            if (interfaceID < descriptorCount) {
                this.getInterfaceDescriptor(interfaceID, (descriptor, resultCode) => {
                    if (resultCode) {
                        callback([], resultCode);
                        return;
                    }
                    interfaceID++;
                    this.getString(descriptor.iInterface, (descriptorString, resultCode) => {
                        if (resultCode) {
                            callback([], resultCode);
                            return;
                        }
                        if (descriptor.bInterfaceNumber === interfaceNum) {
                            descriptorStringArray.push(descriptorString);
                        }
                        getDescriptorString();
                    });
                });
            } else {
                //console.log(descriptorStringArray);
                callback(descriptorStringArray, 0);
                return;
            }
        };
        getDescriptorString();
    }
    getInterfaceDescriptor(_interface, callback) {
        const setup = {
            requestType: 'standard',
            recipient: 'device',
            request: 6,
            value: 0x200,
            index: 0,
        };

        this.usbDevice
        .controlTransferIn(setup, 18 + _interface * 9)
        .then(result => {
            if (result.status === 'ok') {
                const buf = new Uint8Array(result.data.buffer, 9 + _interface * 9);
                console.log(`USB getInterfaceDescriptor: ${buf}`);
                const descriptor = {
                    bLength: buf[0],
                    bDescriptorType: buf[1],
                    bInterfaceNumber: buf[2],
                    bAlternateSetting: buf[3],
                    bNumEndpoints: buf[4],
                    bInterfaceClass: buf[5],
                    bInterfaceSubclass: buf[6],
                    bInterfaceProtocol: buf[7],
                    iInterface: buf[8],
                };
                callback(descriptor, 0);
            } else {
                console.log(`USB getInterfaceDescriptor failed: ${result.status}`);
                throw new Error(result.status);
            }
        })
        .catch(error => {
            console.log(`USB getInterfaceDescriptor failed: ${error}`);
            callback({}, 1);
            return;
        });
    }
    getFunctionalDescriptor(_interface, callback) {
        const setup = {
            requestType: 'standard',
            recipient: 'interface',
            request: 6,
            value: 0x2100,
            index: 0,
        };

        this.usbDevice
        .controlTransferIn(setup, 255)
        .then(result => {
            if (result.status === 'ok') {
                const buf = new Uint8Array(result.data.buffer);
                const descriptor = {
                    bLength: buf[0],
                    bDescriptorType: buf[1],
                    bmAttributes: buf[2],
                    wDetachTimeOut: (buf[4] << 8) | buf[3],
                    wTransferSize: (buf[6] << 8) | buf[5],
                    bcdDFUVersion: buf[7],
                };
                callback(descriptor, 0);
            } else {
                throw new Error(result.status);
            }
        })
        .catch(error => {
            console.log(`USB getFunctionalDescriptor failed: ${error}`);
            callback({}, 1);
        });
    }
    getChipInfo(_interface, callback) {
        this.getInterfaceDescriptors(0, (descriptors, resultCode) => {
            if (resultCode) {
                callback({}, resultCode);
                return;
            }

            // Keep this for new MCU debugging
            // console.log('Descriptors: ' + descriptors);
            const parseDescriptor = (str) => {
                // F303: "@Internal Flash  /0x08000000/128*0002Kg"
                // F40x: "@Internal Flash  /0x08000000/04*016Kg,01*064Kg,07*128Kg"
                // F72x: "@Internal Flash  /0x08000000/04*016Kg,01*64Kg,03*128Kg"
                // F74x: "@Internal Flash  /0x08000000/04*032Kg,01*128Kg,03*256Kg"
                // H750 SPRacing H7 EXST: "@External Flash /0x90000000/998*128Kg,1*128Kg,4*128Kg,21*128Ka"
                // H750 SPRacing H7 EXST: "@External Flash /0x90000000/1001*128Kg,3*128Kg,20*128Ka" - Early BL firmware with incorrect string, treat as above.
                // H750 Partitions: Flash, Config, Firmware, 1x BB Management block + x BB Replacement blocks)
                // AT32 F437 "@Internal Flash   /0x08000000/08*04Ka,1000*04Kg"
                if (str === "@External Flash /0x90000000/1001*128Kg,3*128Kg,20*128Ka") {
                    str = "@External Flash /0x90000000/998*128Kg,1*128Kg,4*128Kg,21*128Ka";
                }
                //AT32F43xxM
                if (str === "@Option byte   /0x1FFFC000/01*4096 g") {
                    str = "@Option bytes   /0x1FFFC000/01*4096 g";
                }
                //AT32F43xxG
                if (str === "@Option byte   /0x1FFFC000/01*512 g") {
                    str = "@Option bytes   /0x1FFFC000/01*512 g";
                }
                // split main into [location, start_addr, sectors]
                const tmp0 = str.replace(/[^\x20-\x7E]+/g, "");
                const tmp1 = tmp0.split('/');

                // G474 (and may be other G4 variants) returns
                // "@Option Bytes   /0x1FFF7800/01*048 e/0x1FFFF800/01*048 e"
                // for two banks of options bytes which may be fine in terms of descriptor syntax,
                // but as this splits into an array of size 5 instead of 3, it induces an length error.
                // Here, we blindly trim the array length to 3. While doing so may fail to
                // capture errornous patterns, but it is good to avoid this known and immediate
                // error.
                // May need to preserve the second bank if the configurator starts to really
                // support option bytes.
                if (tmp1.length > 3) {
                    console.log(`parseDescriptor: shrinking long descriptor "${str}"`);
                    tmp1.length = 3;
                }

                if (!tmp1[0].startsWith("@")) {
                    return null;
                }

                const type = tmp1[0].trim().replace('@', '');
                const start_address = parseInt(tmp1[1]);

                // split sectors into array
                const sectors = [];
                let total_size = 0;
                const tmp2 = tmp1[2].split(',');

                if (tmp2.length < 1) {
                    return null;
                }

                for (const tmp2Index of tmp2) {
                    // split into [num_pages, page_size]
                    const tmp3 = tmp2Index.split('*');
                    if (tmp3.length !== 2) {
                        return null;
                    }

                    const num_pages = parseInt(tmp3[0]);
                    let page_size = parseInt(tmp3[1]);

                    if (!page_size) {
                        return null;
                    }
                    const unit = tmp3[1].slice(-2, -1);

                    switch (unit) {
                        case 'M':
                            page_size *= 1024; //  fall through to K as well
                        case 'K':
                            page_size *= 1024;
                            break;
                    }

                    sectors.push({
                        num_pages: num_pages,
                        start_address: start_address + total_size,
                        page_size: page_size,
                        total_size: num_pages * page_size,
                    });

                    total_size += num_pages * page_size;
                }

                const memory = {
                    type: type,
                    start_address: start_address,
                    sectors: sectors,
                    total_size: total_size,
                };
                return memory;
            };
            const chipInfo = descriptors.map(parseDescriptor).reduce((o, v, i) => {
                o[v.type.toLowerCase().replace(' ', '_')] = v;
                return o;
            }, {});
            callback(chipInfo, resultCode);
        });
    }
    controlTransfer(direction, request, value, _interface, length, data, callback, _timeout = 0) {
        if (direction === 'in') {
            // data is ignored
            const setup = {
                requestType: 'class',
                recipient: 'interface',
                request: request,
                value: value,
                index: _interface,
            };

            this.usbDevice
            .controlTransferIn(setup, length)
            .then(USBInTransferResult => {
                if (USBInTransferResult.status === 'ok') {
                    const buf = new Uint8Array(USBInTransferResult.data.buffer);
                    callback(buf, USBInTransferResult.resultCode);
                } else {
                    throw new Error(USBInTransferResult.status);
                }
            })
            .catch(error => {
                console.log(`USB controlTransfer IN failed for request: ${request}`);
                callback([], 1);
            });
        } else {
            // length is ignored
            const setup = {
                requestType: 'class',
                recipient: 'interface',
                request: request,
                value: value,
                index: _interface,
            };

            const arrayBuf = data ? new Uint8Array(data) : new Uint8Array(0);

            this.usbDevice
            .controlTransferOut(setup, arrayBuf)
            .then(USBOutTransferResult => {
                if (USBOutTransferResult.status === 'ok') {
                    callback(USBOutTransferResult);
                } else {
                    throw new Error(USBOutTransferResult.status);
                }
            })
            .catch(error => {
                console.log(`USB controlTransfer OUT failed for request: ${request}`);
            });
        }
    }
    // routine calling DFU_CLRSTATUS until device is in dfuIDLE state
    clearStatus(callback) {
        const check_status = () => {
            this.controlTransfer('in', this.request.GETSTATUS, 0, 0, 6, 0, (data) => {
                let delay = 0;

                if (data[4] === this.state.dfuIDLE) {
                    callback(data);
                } else {
                    if (data.length) {
                        delay = data[1] | (data[2] << 8) | (data[3] << 16);
                    }
                    setTimeout(clear_status, delay);
                }
            });
        };

        const clear_status = () => this.controlTransfer('out', this.request.CLRSTATUS, 0, 0, 0, 0, check_status);

        check_status();
    }
    loadAddress(address, callback, abort) {
        this.controlTransfer('out', this.request.DNLOAD, 0, 0, 0, [0x21, address & 0xff, (address >> 8) & 0xff, (address >> 16) & 0xff, (address >> 24) & 0xff], () => {
            this.controlTransfer('in', this.request.GETSTATUS, 0, 0, 6, 0, (data) => {
                if (data[4] === this.state.dfuDNBUSY) {
                    const delay = data[1] | (data[2] << 8) | (data[3] << 16);

                    setTimeout(() => {
                        this.controlTransfer('in', this.request.GETSTATUS, 0, 0, 6, 0, (data) => {
                            if (data[4] === this.state.dfuDNLOAD_IDLE) {
                                callback(data);
                            } else {
                                console.log('Failed to execute address load');
                                if (typeof abort === "undefined" || abort) {
                                    this.cleanup();
                                } else {
                                    callback(data);
                                }
                            }
                        });
                    }, delay);
                } else {
                    console.log('Failed to request address load');
                    this.cleanup();
                }
            });
        });
    }
    // first_array = usually hex_to_flash array
    // second_array = usually verify_hex array
    // result = true/false
    verify_flash(first_array, second_array) {
        for (let i = 0; i < first_array.length; i++) {
            if (first_array[i] !== second_array[i]) {
                console.log(`Verification failed on byte: ${i} expected: 0x${first_array[i].toString(16)} received: 0x${second_array[i].toString(16)}`);
                return false;
            }
        }

        console.log(`Verification successful, matching: ${first_array.length} bytes`);

        return true;
    }
    isBlockUsable(startAddress, length) {
        let result = false;

        let searchAddress = startAddress;
        let remainingLength = length;

        let restart;

        do {
            restart = false;

            for (const sector of this.flash_layout.sectors) {
                const sectorStart = sector.start_address;
                const sectorLength = sector.num_pages * sector.page_size;
                const sectorEnd = sectorStart + sectorLength - 1; // - 1 for inclusive

                const addressInSector = (searchAddress >= sectorStart) && (searchAddress <= sectorEnd);

                if (addressInSector) {
                    const endAddress = searchAddress + remainingLength - 1; // - 1 for inclusive

                    const endAddressInSector = (endAddress <= sectorEnd);
                    if (endAddressInSector) {
                        result = true;
                        restart = false;
                        break;
                    }

                    // some of the block is in this sector, search for the another sector that contains the next part of the block
                    searchAddress = sectorEnd + 1;
                    remainingLength -= sectorLength;
                    restart = true;
                    break;
                }
            }
        } while (restart);

        return result;
    }
    upload_procedure(step) {
        let blocks;
        let address;
        let wBlockNum;

        switch (step) {
            case 0:
                this.getChipInfo(0, (chipInfo, resultCode) => {
                    if (resultCode !== 0 || typeof chipInfo === "undefined") {
                        console.log(`Failed to detect chip info, resultCode: ${resultCode}`);
                        this.cleanup();
                    } else {
                        let nextAction;

                        if (typeof chipInfo.internal_flash !== "undefined") {
                            // internal flash
                            nextAction = 1;

                            this.chipInfo = chipInfo;
                            this.flash_layout = chipInfo.internal_flash;

                            if (TABS.firmware_flasher.parsed_hex.bytes_total > chipInfo.internal_flash.total_size) {
                                const firmwareSize = TABS.firmware_flasher.parsed_hex.bytes_total;
                                const boardSize = chipInfo.internal_flash.total_size;
                                const bareBoard = TABS.firmware_flasher.bareBoard;
                                console.log(`Firmware size ${firmwareSize} exceeds board memory size ${boardSize} (${bareBoard})`);
                            }

                        } else if (typeof chipInfo.external_flash !== "undefined") {
                            // external flash
                            nextAction = 2; // no option bytes

                            this.chipInfo = chipInfo;
                            this.flash_layout = chipInfo.external_flash;
                        } else {
                            console.log('Failed to detect internal or external flash');
                            this.cleanup();
                        }

                        if (typeof nextAction !== "undefined") {
                            gui_log(i18n.getMessage('dfu_device_flash_info', (this.flash_layout.total_size / 1024).toString()));

                            // verify all addresses in the hex are writable.
                            const unusableBlocks = [];

                            for (const block of this.hex.data) {
                                const usable = this.isBlockUsable(block.address, block.bytes);
                                if (!usable) {
                                    unusableBlocks.push(block);
                                }
                            }

                            if (unusableBlocks.length > 0) {
                                gui_log(i18n.getMessage('dfu_hex_address_errors'));
                                TABS.firmware_flasher.flashingMessage(i18n.getMessage('dfu_hex_address_errors'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);
                                this.leave();
                            } else {
                                this.getFunctionalDescriptor(0, (descriptor, resultCode) => {
                                    this.transferSize = resultCode ? 2048 : descriptor.wTransferSize;
                                    console.log(`Using transfer size: ${this.transferSize}`);
                                    this.clearStatus(() => {
                                        this.upload_procedure(nextAction);
                                    });
                                });
                            }
                        }
                    }
                });
                break;
            case 1: {
                if (typeof this.chipInfo.option_bytes === "undefined") {
                    console.log('Failed to detect option bytes');
                    this.cleanup();
                }

                const unprotect = () => {
                    console.log('Initiate read unprotect');
                    const messageReadProtected = i18n.getMessage('stm32ReadProtected');
                    gui_log(messageReadProtected);
                    TABS.firmware_flasher.flashingMessage(messageReadProtected, TABS.firmware_flasher.FLASH_MESSAGE_TYPES.ACTION);

                    this.controlTransfer('out', this.request.DNLOAD, 0, 0, 0, [0x92], () => {
                        this.controlTransfer('in', this.request.GETSTATUS, 0, 0, 6, 0, (data) => {
                            if (data[4] === this.state.dfuDNBUSY) { // completely normal
                                const delay = data[1] | (data[2] << 8) | (data[3] << 16);
                                const total_delay = delay + 20000; // wait at least 20 seconds to make sure the user does not disconnect the board while erasing the memory
                                let timeSpentWaiting = 0;
                                const incr = 1000; // one sec increments
                                const waitForErase = setInterval(() => {

                                    TABS.firmware_flasher.flashProgress(Math.min(timeSpentWaiting / total_delay, 1) * 100);

                                    if (timeSpentWaiting < total_delay) {
                                        timeSpentWaiting += incr;
                                        return;
                                    }
                                    clearInterval(waitForErase);
                                    setTimeout(() => {
                                        this.controlTransfer('in', this.request.GETSTATUS, 0, 0, 6, 0, (data, error) => {
                                            if (error) { // we encounter an error, but this is expected. should be a stall.
                                                console.log('Unprotect memory command ran successfully. Unplug flight controller. Connect again in DFU mode and try flashing again.');
                                                gui_log(i18n.getMessage('stm32UnprotectSuccessful'));

                                                const messageUnprotectUnplug = i18n.getMessage('stm32UnprotectUnplug');
                                                gui_log(messageUnprotectUnplug);

                                                TABS.firmware_flasher.flashingMessage(messageUnprotectUnplug, TABS.firmware_flasher.FLASH_MESSAGE_TYPES.ACTION)
                                                    .flashProgress(0);

                                            } else { // unprotecting the flight controller did not work. It did not reboot.
                                                console.log('Failed to execute unprotect memory command');

                                                gui_log(i18n.getMessage('stm32UnprotectFailed'));
                                                TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32UnprotectFailed'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);
                                                console.log(data);
                                                this.cleanup();
                                            }
                                        });
                                    }, 2000); // this should stall/disconnect anyways. so we only wait 2 sec max.
                                }, incr);
                            } else {
                                console.log('Failed to initiate unprotect memory command');
                                let messageUnprotectInitFailed = i18n.getMessage('stm32UnprotectInitFailed');
                                gui_log(messageUnprotectInitFailed);
                                TABS.firmware_flasher.flashingMessage(messageUnprotectInitFailed, TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);
                                this.cleanup();
                            }
                        });
                    });
                };

                const tryReadOB = () => {
                    // the following should fail if read protection is active
                    this.controlTransfer('in', this.request.UPLOAD, 2, 0, this.chipInfo.option_bytes.total_size, 0, (ob_data, errcode) => {
                        if (errcode) {
                            // TODO: this was undefined, guessing with how it usually works it should be 1
                            const errcode1 = 1;
                            console.log(`USB transfer error while reading option bytes: ${errcode1}`);
                            this.cleanup();
                            return;
                        }

                        this.controlTransfer('in', this.request.GETSTATUS, 0, 0, 6, 0, (data) => {
                            if (data[4] === this.state.dfuUPLOAD_IDLE && ob_data.length === this.chipInfo.option_bytes.total_size) {
                                console.log('Option bytes read successfully');
                                console.log('Chip does not appear read protected');
                                gui_log(i18n.getMessage('stm32NotReadProtected'));
                                // it is pretty safe to continue to erase flash
                                this.clearStatus(() => {
                                    this.upload_procedure(2);
                                });
                            } else {
                                console.log('Option bytes could not be read. Quite possibly read protected.');
                                this.clearStatus(unprotect);
                            }
                        });
                    });
                };

                const initReadOB = (loadAddressResponse) => {
                    // contrary to what is in the docs. Address load should in theory work even if read protection is active
                    // if address load fails with this specific error though, it is very likely bc of read protection
                    if (loadAddressResponse[4] === this.state.dfuERROR && loadAddressResponse[0] === this.status.errVENDOR) {
                        // read protected
                        gui_log(i18n.getMessage('stm32AddressLoadFailed'));
                        this.clearStatus(unprotect);
                        return;
                    } else if (loadAddressResponse[4] === this.state.dfuDNLOAD_IDLE) {
                        console.log('Address load for option bytes sector succeeded.');
                        this.clearStatus(tryReadOB);
                    } else {
                        gui_log(i18n.getMessage('stm32AddressLoadUnknown'));
                        this.cleanup();
                    }
                };

                this.clearStatus(() => {
                    // load address fails if read protection is active unlike as stated in the docs
                    this.loadAddress(this.chipInfo.option_bytes.start_address, initReadOB, false);
                });
                break;
            }
            case 2: {
                // erase
                // find out which pages to erase
                const erase_pages = [];
                for (let i = 0; i < this.flash_layout.sectors.length; i++) {
                    for (let j = 0; j < this.flash_layout.sectors[i].num_pages; j++) {
                        if (this.options.erase_chip) {
                            // full chip erase
                            erase_pages.push({ 'sector': i, 'page': j });
                        } else {
                            // local erase
                            const page_start = this.flash_layout.sectors[i].start_address + j * this.flash_layout.sectors[i].page_size;
                            const page_end = page_start + this.flash_layout.sectors[i].page_size - 1;
                            for (const hexData of this.hex.data) {
                                const starts_in_page = hexData.address >= page_start && hexData.address <= page_end;
                                const end_address = hexData.address + hexData.bytes - 1;
                                const ends_in_page = end_address >= page_start && end_address <= page_end;
                                const spans_page = hexData.address < page_start && end_address > page_end;

                                if (starts_in_page || ends_in_page || spans_page) {
                                    const idx = erase_pages.findIndex((element, index, array) => {
                                        return element.sector === i && element.page === j;
                                    });
                                    if (idx === -1)
                                        erase_pages.push({ 'sector': i, 'page': j });
                                }
                            }
                        }
                    }
                }

                if (erase_pages.length === 0) {
                    console.log('Aborting, No flash pages to erase');
                    TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32InvalidHex'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);
                    this.cleanup();
                    break;
                }

                TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32Erase'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL);
                console.log('Executing local chip erase', erase_pages);

                let page = 0;
                let total_erased = 0; // bytes

                const erase_page_next = () =>{
                    TABS.firmware_flasher.flashProgress((page + 1) / erase_pages.length * 100);
                    page++;

                    if (page === erase_pages.length) {
                        console.log("Erase: complete");
                        gui_log(i18n.getMessage('dfu_erased_kilobytes', (total_erased / 1024).toString()));
                        this.upload_procedure(4);
                    } else {
                        erase_page();
                    }
                };

                const erase_page = () => {
                    const page_addr = erase_pages[page].page
                        * this.flash_layout.sectors[erase_pages[page].sector].page_size
                        + this.flash_layout.sectors[erase_pages[page].sector].start_address;
                    const cmd = [0x41, page_addr & 0xff, (page_addr >> 8) & 0xff, (page_addr >> 16) & 0xff, (page_addr >> 24) & 0xff];
                    total_erased += this.flash_layout.sectors[erase_pages[page].sector].page_size;
                    console.log(`Erasing. sector ${erase_pages[page].sector}, page ${erase_pages[page].page} @ 0x${page_addr.toString(16)}`);

                    this.controlTransfer('out', this.request.DNLOAD, 0, 0, 0, cmd, () => {
                        this.controlTransfer('in', this.request.GETSTATUS, 0, 0, 6, 0, (data) => {
                            if (data[4] === this.state.dfuDNBUSY) { // completely normal
                                const delay = data[1] | (data[2] << 8) | (data[3] << 16);

                                setTimeout(() => {
                                    this.controlTransfer('in', this.request.GETSTATUS, 0, 0, 6, 0, (data) => {

                                        if (data[4] === this.state.dfuDNBUSY) {

                                            //
                                            // H743 Rev.V (probably other H7 Rev.Vs also) remains in dfuDNBUSY state after the specified delay time.
                                            // STM32CubeProgrammer deals with behavior with an undocumented procedure as follows.
                                            //     1. Issue DFU_CLRSTATUS, which ends up with (14,10) = (errUNKNOWN, dfuERROR)
                                            //     2. Issue another DFU_CLRSTATUS which delivers (0,2) = (OK, dfuIDLE)
                                            //     3. Treat the current erase successfully finished.
                                            // Here, we call clarStatus to get to the dfuIDLE state.
                                            //
                                            console.log('erase_page: dfuDNBUSY after timeout, clearing');

                                            this.clearStatus(() => {
                                                this.controlTransfer('in', this.request.GETSTATUS, 0, 0, 6, 0, (data) => {
                                                    if (data[4] === this.state.dfuIDLE) {
                                                        erase_page_next();
                                                    } else {
                                                        console.log(`Failed to erase page 0x${page_addr.toString(16)} (did not reach dfuIDLE after clearing`);
                                                        this.cleanup();
                                                    }
                                                });
                                            });
                                        } else if (data[4] === this.state.dfuDNLOAD_IDLE) {
                                            erase_page_next();
                                        } else {
                                            console.log(`Failed to erase page 0x${page_addr.toString(16)}`);
                                            this.cleanup();
                                        }
                                    });
                                }, delay);
                            } else {
                                console.log(`Failed to initiate page erase, page 0x${page_addr.toString(16)}`);
                                this.cleanup();
                            }
                        });
                    });
                };

                // start
                erase_page();
                break;
            }
            case 4: {
                // upload
                // we dont need to clear the state as we are already using DFU_DNLOAD
                console.log('Writing data ...');
                TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32Flashing'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL);

                blocks = this.hex.data.length - 1;
                let flashing_block = 0;
                address = this.hex.data[flashing_block].address;

                let bytes_flashed = 0;
                let bytes_flashed_total = 0; // used for progress bar
                wBlockNum = 2; // required by DFU

                const write = () => {
                    if (bytes_flashed < this.hex.data[flashing_block].bytes) {
                        const bytes_to_write = ((bytes_flashed + this.transferSize) <= this.hex.data[flashing_block].bytes) ? this.transferSize : (this.hex.data[flashing_block].bytes - bytes_flashed);

                        const data_to_flash = this.hex.data[flashing_block].data.slice(bytes_flashed, bytes_flashed + bytes_to_write);

                        address += bytes_to_write;
                        bytes_flashed += bytes_to_write;
                        bytes_flashed_total += bytes_to_write;

                        this.controlTransfer('out', this.request.DNLOAD, wBlockNum++, 0, 0, data_to_flash, () => {
                            this.controlTransfer('in', this.request.GETSTATUS, 0, 0, 6, 0, (data) => {
                                if (data[4] === this.state.dfuDNBUSY) {
                                    const delay = data[1] | (data[2] << 8) | (data[3] << 16);

                                    setTimeout(() => {
                                        this.controlTransfer('in', this.request.GETSTATUS, 0, 0, 6, 0, (data) => {
                                            if (data[4] === this.state.dfuDNLOAD_IDLE) {
                                                // update progress bar
                                                TABS.firmware_flasher.flashProgress(bytes_flashed_total / (this.hex.bytes_total * 2) * 100);

                                                // flash another page
                                                write();
                                            } else {
                                                console.log(`Failed to write ${bytes_to_write}bytes to 0x${address.toString(16)}`);
                                                this.cleanup();
                                            }
                                        });
                                    }, delay);
                                } else {
                                    console.log(`Failed to initiate write ${bytes_to_write}bytes to 0x${address.toString(16)}`);
                                    this.cleanup();
                                }
                            });
                        });
                    } else {
                        if (flashing_block < blocks) {
                            // move to another block
                            flashing_block++;

                            address = this.hex.data[flashing_block].address;
                            bytes_flashed = 0;
                            wBlockNum = 2;

                            this.loadAddress(address, write);
                        } else {
                            // all blocks flashed
                            console.log('Writing: done');

                            // proceed to next step
                            this.upload_procedure(5);
                        }
                    }
                };

                // start
                this.loadAddress(address, write);

                break;
            }
            case 5: {
                // verify
                console.log('Verifying data ...');
                TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32Verifying'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL);

                blocks = this.hex.data.length - 1;
                let reading_block = 0;
                address = this.hex.data[reading_block].address;

                let bytes_verified = 0;
                let bytes_verified_total = 0; // used for progress bar
                wBlockNum = 2; // required by DFU


                // initialize arrays
                for (let i = 0; i <= blocks; i++) {
                    this.verify_hex.push([]);
                }

                // start
                this.clearStatus(() => {
                    this.loadAddress(address, () => {
                        this.clearStatus(read);
                    });
                });

                const read = () => {
                    if (bytes_verified < this.hex.data[reading_block].bytes) {
                        const bytes_to_read = ((bytes_verified + this.transferSize) <= this.hex.data[reading_block].bytes) ? this.transferSize : (this.hex.data[reading_block].bytes - bytes_verified);

                        this.controlTransfer('in', this.request.UPLOAD, wBlockNum++, 0, bytes_to_read, 0, (data, code) => {
                            for (const piece of data) {
                                this.verify_hex[reading_block].push(piece);
                            }

                            address += bytes_to_read;
                            bytes_verified += bytes_to_read;
                            bytes_verified_total += bytes_to_read;

                            // update progress bar
                            TABS.firmware_flasher.flashProgress((this.hex.bytes_total + bytes_verified_total) / (this.hex.bytes_total * 2) * 100);

                            // verify another page
                            read();
                        });
                    } else {
                        if (reading_block < blocks) {
                            // move to another block
                            reading_block++;

                            address = this.hex.data[reading_block].address;
                            bytes_verified = 0;
                            wBlockNum = 2;

                            this.clearStatus(() => {
                                this.loadAddress(address, () => {
                                    this.clearStatus(read);
                                });
                            });
                        } else {
                            // all blocks read, verify
                            let verify = true;
                            for (let i = 0; i <= blocks; i++) {
                                verify = this.verify_flash(this.hex.data[i].data, this.verify_hex[i]);

                                if (!verify) break;
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
                                this.leave();
                            } else {
                                console.log('Programming: FAILED');
                                // update progress bar
                                TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32ProgrammingFailed'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);

                                // Show notification
                                if (getConfig('showNotifications').showNotifications) {
                                    NotificationManager.showNotification("Betaflight Configurator", {body: i18n.getMessage('programmingFailedNotification'), icon: "/images/pwa/favicon.ico"});
                                }

                                // disconnect
                                this.cleanup();
                            }
                        }
                    }
                };
                break;
            }
        }
    }
    leave() {
        // leave DFU
        const address = this.hex ? this.hex.data[0].address : 0x08000000;

        this.clearStatus(() => {
            this.loadAddress(address, () => {
                // 'downloading' 0 bytes to the program start address followed by a GETSTATUS is used to trigger DFU exit on STM32
                this.controlTransfer('out', this.request.DNLOAD, 0, 0, 0, 0, () => {
                    this.controlTransfer('in', this.request.GETSTATUS, 0, 0, 6, 0, (data) => {
                        this.cleanup();
                    });
                });
            });
        });
    }
    cleanup() {
        this.releaseInterface(0);

        GUI.connect_lock = false;

        const timeSpent = new Date().getTime() - this.upload_time_start;

        console.log(`Script finished after: ${timeSpent / 1000} seconds`);

        if (this.callback) {
            this.callback();
        }
    }
}

// initialize object
const WEBUSBDFU = new WEBUSBDFU_protocol();

export default WEBUSBDFU;
