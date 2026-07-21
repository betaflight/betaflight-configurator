// Four-way AM32 passthrough implementation ported from
// am32-firmware/am32-configurator/src/communication/four_way.ts and adapted to
// reuse this app's existing Betaflight serial/MSP singleton.

import MSP from "../msp.js";
import MSPCodes from "../msp/MSPCodes.js";
import { serial } from "../serial.js";
import Flash from "./flash.js";
import Mcu from "./mcu.js";
import { bufferToSettings, compareBytes, settingsToBuffer } from "./eeprom.js";

export const FOUR_WAY_COMMANDS = Object.freeze({
    cmd_InterfaceTestAlive: 0x30,
    cmd_ProtocolGetVersion: 0x31,
    cmd_InterfaceGetName: 0x32,
    cmd_InterfaceGetVersion: 0x33,
    cmd_InterfaceExit: 0x34,
    cmd_DeviceReset: 0x35,
    cmd_DeviceInitFlash: 0x37,
    cmd_DeviceEraseAll: 0x38,
    cmd_DevicePageErase: 0x39,
    cmd_DeviceRead: 0x3a,
    cmd_DeviceWrite: 0x3b,
    cmd_DeviceC2CK_LOW: 0x3c,
    cmd_DeviceReadEEprom: 0x3d,
    cmd_DeviceWriteEEprom: 0x3e,
    cmd_InterfaceSetMode: 0x3f,
});

export const FOUR_WAY_ACK = Object.freeze({
    ACK_OK: 0x00,
    ACK_I_UNKNOWN_ERROR: 0x01,
    ACK_I_INVALID_CMD: 0x02,
    ACK_I_INVALID_CRC: 0x03,
    ACK_I_VERIFY_ERROR: 0x04,
    ACK_D_INVALID_COMMAND: 0x05,
    ACK_D_COMMAND_FAILED: 0x06,
    ACK_D_UNKNOWN_ERROR: 0x07,
    ACK_I_INVALID_CHANNEL: 0x08,
    ACK_I_INVALID_PARAM: 0x09,
    ACK_D_GENERAL_ERROR: 0x0f,
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ACK_NAMES = Object.fromEntries(Object.entries(FOUR_WAY_ACK).map(([name, value]) => [value, name]));
const COMMAND_NAMES = Object.fromEntries(Object.entries(FOUR_WAY_COMMANDS).map(([name, value]) => [value, name]));

function appendBytes(first, second) {
    const merged = new Uint8Array(first.length + second.length);
    merged.set(first, 0);
    merged.set(second, first.length);
    return merged;
}

export default class Am32FourWaySession extends EventTarget {
    constructor() {
        super();
        this.active = false;
        this.expectedCount = 0;
        this.rxBuffer = new Uint8Array();
        this.pending = null;
        this.receive = this.receive.bind(this);
    }

    log(message) {
        this.dispatchEvent(new CustomEvent("log", { detail: message }));
    }

    async enter() {
        if (this.active) {
            return this.expectedCount;
        }
        if (!serial.connected) {
            throw new Error("Connect to a GIGFLIGHT/Betaflight flight controller first.");
        }

        this.log("Requesting Betaflight 4-way ESC passthrough...");
        const response = await MSP.promise(MSPCodes.MSP_SET_PASSTHROUGH);
        const count = response?.data?.getUint8?.(0) ?? 0;
        if (!count) {
            throw new Error("Betaflight opened 4-way passthrough but reported zero ESCs.");
        }

        MSP.callbacks_cleanup();
        MSP.clearListeners();
        this.expectedCount = count;
        this.rxBuffer = new Uint8Array();
        serial.addEventListener("receive", this.receive);
        this.active = true;
        await delay(2000);
        this.log(`4-way passthrough active. ESC count: ${count}`);
        return count;
    }

    async exit({ disconnect = true } = {}) {
        if (this.active) {
            try {
                await this.send(FOUR_WAY_COMMANDS.cmd_InterfaceExit, [0], 0, 100);
            } catch (error) {
                console.warn("AM32 interface exit did not acknowledge:", error);
            }
        }
        this.cleanup();
        if (disconnect && serial.connected) {
            await serial.disconnect();
        }
    }

    cleanup() {
        serial.removeEventListener("receive", this.receive);
        if (this.pending) {
            clearTimeout(this.pending.timer);
            this.pending.reject(new Error("AM32 session closed."));
            this.pending = null;
        }
        this.active = false;
        this.expectedCount = 0;
        this.rxBuffer = new Uint8Array();
    }

    receive(event) {
        const bytes = event.detail?.data ?? event.detail;
        if (!bytes?.length) {
            return;
        }
        this.rxBuffer = appendBytes(this.rxBuffer, new Uint8Array(bytes));
        this.processRxBuffer();
    }

    processRxBuffer() {
        while (this.rxBuffer.length >= 8) {
            const start = this.rxBuffer.indexOf(0x2e);
            if (start < 0) {
                this.rxBuffer = new Uint8Array();
                return;
            }
            if (start > 0) {
                this.rxBuffer = this.rxBuffer.slice(start);
            }
            if (this.rxBuffer.length < 8) {
                return;
            }

            const paramCount = this.rxBuffer[4] === 0 ? 256 : this.rxBuffer[4];
            const totalLength = 8 + paramCount;
            if (this.rxBuffer.length < totalLength) {
                return;
            }

            const frame = this.rxBuffer.slice(0, totalLength);
            this.rxBuffer = this.rxBuffer.slice(totalLength);

            let message;
            try {
                message = this.parseMessage(frame);
            } catch (error) {
                if (this.pending) {
                    this.pending.reject(error);
                    clearTimeout(this.pending.timer);
                    this.pending = null;
                }
                continue;
            }

            if (this.pending) {
                const pending = this.pending;
                clearTimeout(pending.timer);
                this.pending = null;
                pending.resolve(message);
            }
        }
    }

    makePackage(cmd, params = [0], address = 0) {
        const payload = params.length === 0 ? [0] : params;
        if (payload.length > 256) {
            throw new Error(`AM32 4-way payload too large: ${payload.length}`);
        }

        const buffer = new ArrayBuffer(7 + payload.length);
        const view = new Uint8Array(buffer);

        view[0] = 0x2f;
        view[1] = cmd;
        view[2] = (address >> 8) & 0xff;
        view[3] = address & 0xff;
        view[4] = payload.length === 256 ? 0 : payload.length;
        view.set(payload, 5);

        const checksum = view.subarray(0, -2).reduce(this.crc16XmodemUpdate, 0);
        view[5 + payload.length] = (checksum >> 8) & 0xff;
        view[6 + payload.length] = checksum & 0xff;

        return view;
    }

    crc16XmodemUpdate(crc, byte) {
        const poly = 0x1021;
        let next = crc ^ (byte << 8);
        for (let i = 0; i < 8; i++) {
            next = next & 0x8000 ? (next << 1) ^ poly : next << 1;
        }
        return next & 0xffff;
    }

    parseMessage(buffer) {
        const view = new Uint8Array(buffer);
        if (view[0] !== 0x2e) {
            throw new Error(`Invalid AM32 4-way response start: ${view[0]}`);
        }

        const paramCount = view[4] === 0 ? 256 : view[4];
        const message = {
            command: view[1],
            address: (view[2] << 8) | view[3],
            ack: view[5 + paramCount],
            checksum: (view[6 + paramCount] << 8) | view[7 + paramCount],
            params: view.slice(5, 5 + paramCount),
        };

        const checksum = view.subarray(0, 6 + paramCount).reduce(this.crc16XmodemUpdate, 0);
        if (checksum !== message.checksum) {
            throw new Error(`AM32 checksum mismatch, received ${message.checksum}, calculated ${checksum}`);
        }

        return message;
    }

    async writeRaw(bytes) {
        const result = await serial.send(bytes);
        if (result.bytesSent !== bytes.byteLength) {
            throw new Error("AM32 passthrough write was incomplete.");
        }
    }

    waitForFrame(command, timeout) {
        if (this.pending) {
            throw new Error("AM32 command already pending.");
        }

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending = null;
                reject(new Error(`Timed out waiting for ${COMMAND_NAMES[command] ?? command}`));
            }, timeout);
            this.pending = { resolve, reject, timer };
        });
    }

    async send(command, params = [0], address = 0, timeout = 250) {
        const packet = this.makePackage(command, params, address);
        const wait = command === FOUR_WAY_COMMANDS.cmd_InterfaceExit ? null : this.waitForFrame(command, timeout);
        await this.writeRaw(packet);
        return wait;
    }

    async sendWithPromise(command, params = [0], address = 0, retries = 10, timeout = 250) {
        let lastError = null;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await this.send(command, params, address, timeout);
                if (command === FOUR_WAY_COMMANDS.cmd_InterfaceExit) {
                    return null;
                }
                if (response.ack === FOUR_WAY_ACK.ACK_OK) {
                    return response;
                }
                lastError = new Error(`AM32 returned ${ACK_NAMES[response.ack] ?? response.ack}`);
            } catch (error) {
                lastError = error;
            }
            await delay(250);
        }
        throw lastError ?? new Error(`AM32 command failed: ${COMMAND_NAMES[command] ?? command}`);
    }

    initFlash(target, retries = 10) {
        return this.sendWithPromise(FOUR_WAY_COMMANDS.cmd_DeviceInitFlash, [target], 0, retries);
    }

    reset(target) {
        return this.sendWithPromise(FOUR_WAY_COMMANDS.cmd_DeviceReset, [target], 0);
    }

    readAddress(address, bytes, retries = 10, timeout = 250) {
        return this.sendWithPromise(
            FOUR_WAY_COMMANDS.cmd_DeviceRead,
            [bytes === 256 ? 0 : bytes],
            address,
            retries,
            timeout,
        );
    }

    write(address, data, timeout = 250) {
        return this.sendWithPromise(FOUR_WAY_COMMANDS.cmd_DeviceWrite, Array.from(data), address, 10, timeout);
    }

    async getInfo(target, initRetries = 2) {
        const flash = await this.initFlash(target, initRetries);
        const info = Flash.getInfo(flash);
        const mcu = new Mcu(info.meta.signature);
        mcu.setInfo(info);

        const eepromOffset = mcu.getEepromOffset();
        try {
            const fileNameRead = await this.readAddress(eepromOffset - 32, 32);
            const zeroIndex = fileNameRead.params.indexOf(0x00);
            const fileNameBytes = fileNameRead.params.slice(0, zeroIndex < 0 ? undefined : zeroIndex);
            const fileName = new TextDecoder().decode(fileNameBytes);
            if (/^[A-Z0-9_]+$/.test(fileName)) {
                info.meta.am32.fileName = fileName;
                info.meta.am32.mcuType = fileName.slice(fileName.lastIndexOf("_") + 1);
            }
        } catch (error) {
            console.warn("Could not read AM32 firmware filename:", error);
        }

        const settingsMessage = await this.readAddress(eepromOffset, Mcu.LAYOUT_SIZE);
        info.layoutSize = Mcu.LAYOUT_SIZE;
        info.settingsBuffer = settingsMessage.params;
        info.settings = bufferToSettings(settingsMessage.params);
        info.bootloader.input = info.meta.input;
        info.bootloader.version = info.settings.BOOT_LOADER_REVISION ?? 0;

        const [valid, pin] = Mcu.parseBootLoaderPin(info.bootloader.input);
        info.bootloader.valid = valid;
        info.bootloader.pin = pin;

        info.displayName = info.meta.am32.fileName ?? "AM32 ESC";
        info.firmwareName = info.meta.am32.fileName ?? "UNKNOWN";
        info.mcu = {
            name: mcu.getName(),
            signature: info.meta.signature,
            pageSize: mcu.getPageSize(),
            flashSize: mcu.getFlashSize(),
            eepromOffset,
            firmwareStart: mcu.getFirmwareStart(),
            flashOffset: mcu.getFlashOffset(),
        };

        return info;
    }

    async writeSettings(target, esc) {
        await this.initFlash(target);
        const mcu = new Mcu(esc.meta.signature);
        const newSettings = settingsToBuffer(esc.settings, esc.settings.LAYOUT_REVISION);
        if (newSettings.length !== esc.settingsBuffer.length) {
            throw new Error("AM32 settings length mismatch.");
        }
        if (compareBytes(newSettings, esc.settingsBuffer)) {
            return false;
        }
        await this.write(mcu.getEepromOffset(), newSettings);
        const readback = await this.readAddress(mcu.getEepromOffset(), Mcu.LAYOUT_SIZE);
        if (!compareBytes(newSettings, readback.params)) {
            throw new Error("AM32 settings verification failed.");
        }
        esc.settingsBuffer = newSettings;
        esc.settingsDirty = false;
        return true;
    }

    async writeHex(target, hex, { timeout = 250, onProgress = null } = {}) {
        const parsed = Flash.parseHex(hex);
        if (!parsed) {
            throw new Error("Invalid AM32 Intel HEX file.");
        }

        const initFlash = await this.initFlash(target, 3);
        const info = Flash.getInfo(initFlash);
        const mcu = new Mcu(info.meta.signature);
        const endAddress = parsed.data[parsed.data.length - 1].address + parsed.data[parsed.data.length - 1].bytes;
        const image = Flash.fillImage(parsed, endAddress - mcu.getFlashOffset(), mcu.getFlashOffset());
        if (!image) {
            throw new Error("The AM32 HEX file does not fit the detected ESC flash layout.");
        }

        const eepromOffset = mcu.getEepromOffset();
        const pageSize = mcu.getPageSize();
        const firmwareStart = mcu.getFirmwareStart();
        const settingsMessage = await this.readAddress(eepromOffset, Mcu.LAYOUT_SIZE);
        const originalSettings = settingsMessage.params;

        originalSettings[0] = 0x00;
        await this.write(eepromOffset, originalSettings, timeout);

        const beginAddress = 0x04 * pageSize;
        const endPageAddress = 0x40 * pageSize;
        const step = 0x100;
        const total = Math.max(1, Math.min(endPageAddress, image.length) - beginAddress);

        for (let address = beginAddress; address < endPageAddress && address < image.length; address += step) {
            await this.write(address, image.subarray(address, Math.min(address + step, image.length)), timeout);
            onProgress?.(Math.min(100, ((address + step - beginAddress) / total) * 100));
        }

        originalSettings[0] = 0x01;
        await this.write(eepromOffset, originalSettings, timeout);
    }
}
