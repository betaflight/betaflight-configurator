/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { bit_check, bit_set } from "../bit";
import { i18n } from "../localization";
import { gui_log } from "../gui_log";
import FC from "../fc";
import semver from "semver";
import vtxDeviceStatusFactory from "../utils/VtxDeviceStatus/VtxDeviceStatusFactory";
import MSP from "../msp";
import MSPCodes, { MSP2TextType } from "./MSPCodes";
import { MspCrcError } from "./mspErrors";
import { MspBuffer, MspDataView } from "./mspBytes";
import {
    API_VERSION_1_45,
    API_VERSION_1_46,
    API_VERSION_1_47,
    API_VERSION_1_48,
    API_VERSION_1_49,
} from "../data_storage";
import EscProtocols from "../utils/EscProtocols";
import huffmanDecodeBuf from "../huffman";
import { defaultHuffmanTree, defaultHuffmanLenIndex } from "../default_huffman_tree";
import { updateTabList } from "../utils/updateTabList";
import { showErrorDialog } from "../utils/showErrorDialog";
import GUI, { TABS } from "../gui";
import { OSD } from "../../components/tabs/osd/osd";
import { reinitializeConnection } from "../serial_backend";
import type { MspCallback, MspFrame, MspResponse } from "../msp";
import type { CurrentMeterConfig, LedStripEntry } from "../../stores/fc.types";
import type Features from "../Features";
import type Beepers from "../Beepers";

// serial_backend's initFeaturesOnConnect (or VirtualFC) replaces the reset value 0 with these
// instances before any feature or beeper MSP is exchanged.
function features(): Features {
    return FC.FEATURE_CONFIG.features as Features;
}

function beepers(which: "beepers" | "dshotBeaconConditions"): Beepers {
    return FC.BEEPER_CONFIG[which] as Beepers;
}

// osd.js assigns OSD.data inside a function, where TypeScript does not see it.
function osdData(): { canvas?: { cols: number; rows: number } } {
    return (OSD as unknown as { data: ReturnType<typeof osdData> }).data;
}

/**
 * Receives one dataflash block. `data` is null when the block must be re-requested (CRC or
 * address mismatch) or on failure, in which case `error` says why.
 */
export type DataflashReadCallback = (
    address: number,
    data: DataView | null,
    bytesCompressed?: number | null,
    error?: unknown,
) => void;

// Used for LED_STRIP
const ledDirectionLetters = ["n", "e", "s", "w", "u", "d"]; // in LSB bit order
const ledBaseFunctionLetters = ["c", "f", "a", "l", "s", "g", "r", "p", "e", "u"]; // in LSB bit
let ledOverlayLetters = ["t", "y", "o", "b", "v", "i", "w"]; // in LSB bit

let lastI2cErrorCount: number | null = null;

function reportI2cErrors(count: number) {
    // Seed on first poll (and on FC reboot/reconnect, where the counter drops).
    if (lastI2cErrorCount === null || count < lastI2cErrorCount) {
        lastI2cErrorCount = count;
        return;
    }
    if (count > lastI2cErrorCount) {
        gui_log(
            i18n.getMessage("i2cErrorDetected", {
                delta: count - lastI2cErrorCount,
                total: count,
            }),
        );
        lastI2cErrorCount = count;
    }
}

function getMSPCodeName(code: number) {
    return Object.keys(MSPCodes).find((key) => (MSPCodes as unknown as Record<string, number>)[key] === code);
}

// Pack one LED's config into its 32-bit mask. The two API layouts are identical except for
// where the colour and direction fields sit (overlay bits are always at +12), so both are
// handled by passing those two offsets in — see sendLedStripConfig.
function buildLedStripMask(led: LedStripEntry, colorOffset: number, directionOffset: number) {
    let mask = 0;

    mask |= Math.trunc(led.y);
    mask |= led.x << 4;

    for (const functionLetter of led.functions) {
        const fnIndex = ledBaseFunctionLetters.indexOf(functionLetter);
        if (fnIndex >= 0) {
            mask |= fnIndex << 8;
            break;
        }
    }

    for (const overlayLetter of led.functions) {
        const bitIndex = ledOverlayLetters.indexOf(overlayLetter);
        if (bitIndex >= 0) {
            mask |= bit_set(mask, bitIndex + 12);
        }
    }

    mask |= led.color << colorOffset;

    for (const directionLetter of led.directions) {
        const bitIndex = ledDirectionLetters.indexOf(directionLetter);
        if (bitIndex >= 0) {
            mask |= bit_set(mask, bitIndex + directionOffset);
        }
    }

    return mask;
}

interface ArmingState {
    armingDisabled: boolean;
    runawayTakeoffPreventionDisabled: boolean;
}

type SerialPortFunction = keyof MspHelper["SERIAL_PORT_FUNCTIONS"];

// Where the fields of one LED's 32-bit mask sit; API 1.46 widened the overlays and dropped parameters.
interface LedMaskLayout {
    overlayMask: number;
    colorShift: number;
    directionShift: number;
    hasParameters: boolean;
}

const LED_MASK_LAYOUT: LedMaskLayout = { overlayMask: 0x3ff, colorShift: 22, directionShift: 26, hasParameters: false };
const LED_MASK_LAYOUT_PRE_1_46: LedMaskLayout = {
    overlayMask: 0x3f,
    colorShift: 18,
    directionShift: 22,
    hasParameters: true,
};

// The inverse of buildLedStripMask.
function decodeLedMask(mask: number, layout: LedMaskLayout): LedStripEntry {
    const functions: string[] = [];
    const functionId = (mask >> 8) & 0xf;
    if (functionId < ledBaseFunctionLetters.length) {
        functions.push(ledBaseFunctionLetters[functionId]);
    }

    const overlayMask = (mask >> 12) & layout.overlayMask;
    ledOverlayLetters.forEach((letter, index) => {
        if (bit_check(overlayMask, index)) {
            functions.push(letter);
        }
    });

    const directionMask = (mask >> layout.directionShift) & 0x3f;
    const directions = ledDirectionLetters.filter((_letter, index) => bit_check(directionMask, index));

    const led: LedStripEntry = {
        y: mask & 0xf,
        x: (mask >> 4) & 0xf,
        functions,
        color: (mask >> layout.colorShift) & 0xf,
        directions,
    };
    if (layout.hasParameters) {
        led.parameters = (mask >> 28) & 0xf;
    }
    return led;
}

// Settles one pending request with the frame that answers it.
function deliverResponse(callback: MspCallback, errorAware: boolean, frame: MspFrame) {
    const { code, dataView: data, crcError } = frame;
    const response: MspResponse = {
        command: code,
        data,
        length: data ? data.byteLength : 0,
        crcError,
        unsupported: frame.unsupported,
    };
    // Legacy callbacks receive the original DataView with the crcError flag so they can choose
    // how to handle CRC errors; errorAware callbacks reject on crcError and otherwise receive the
    // response as the first argument.
    try {
        if (!errorAware) {
            callback(response);
        } else if (crcError) {
            callback(null, new MspCrcError(`CRC error for MSP code ${code}`, code));
        } else {
            callback(response, undefined);
        }
    } catch (e) {
        console.error(`callback for code ${code} threw:`, e);
    }
}

class MspHelper {
    // 0 based index, must be identical to 'baudRates' in 'src/main/io/serial.c' in betaflight
    BAUD_RATES = [
        "AUTO",
        "9600",
        "19200",
        "38400",
        "57600",
        "115200",
        "230400",
        "250000",
        "400000",
        "460800",
        "500000",
        "921600",
        "1000000",
        "1500000",
        "2000000",
        "2470000",
    ];
    // needs to be identical to 'serialPortFunction_e' in 'src/main/io/serial.h' in betaflight
    SERIAL_PORT_FUNCTIONS = {
        MSP: 0,
        GPS: 1,
        TELEMETRY_FRSKY: 2,
        TELEMETRY_HOTT: 3,
        TELEMETRY_LTM: 4,
        TELEMETRY_SMARTPORT: 5,
        RX_SERIAL: 6,
        BLACKBOX: 7,
        TELEMETRY_MAVLINK: 9,
        ESC_SENSOR: 10,
        TBS_SMARTAUDIO: 11,
        TELEMETRY_IBUS: 12,
        IRC_TRAMP: 13,
        RUNCAM_DEVICE_CONTROL: 14, // support communitate with RunCam Device
        LIDAR_TF: 15,
        FRSKY_OSD: 16,
        VTX_MSP: 17,
        GIMBAL: 18,
        OSD_CUSTOM_TEXT: 19,
    };

    REBOOT_TYPES = {
        FIRMWARE: 0,
        BOOTLOADER: 1,
        MSC: 2,
        MSC_UTC: 3,
        BOOTLOADER_FLASH: 4,
    };

    RESET_TYPES = {
        BASE_DEFAULTS: 0,
        CUSTOM_DEFAULTS: 1,
    };

    SIGNATURE_LENGTH = 32;

    mspMultipleCache: number[] = [];

    setText(buffer: MspBuffer, type: number, config: string, length: number) {
        // type byte
        buffer.push8(type);

        const size = Math.min(length, config.length);
        // length byte followed by the actual characters
        buffer.push8(size);

        for (let i = 0; i < size; i++) {
            buffer.push8(config.codePointAt(i)!);
        }
    }

    getText(data: MspDataView): string {
        // length byte followed by the actual characters
        const size = data.readU8() || 0;
        let str = "";

        for (let i = 0; i < size; i++) {
            str += String.fromCodePoint(data.readU8());
        }

        return str;
    }

    static readPidSliderSettings(data: MspDataView) {
        FC.TUNING_SLIDERS.slider_pids_mode = data.readU8();
        FC.TUNING_SLIDERS.slider_master_multiplier = data.readU8();
        FC.TUNING_SLIDERS.slider_roll_pitch_ratio = data.readU8();
        FC.TUNING_SLIDERS.slider_i_gain = data.readU8();
        FC.TUNING_SLIDERS.slider_d_gain = data.readU8();
        FC.TUNING_SLIDERS.slider_pi_gain = data.readU8();
        FC.TUNING_SLIDERS.slider_dmax_gain = data.readU8();
        FC.TUNING_SLIDERS.slider_feedforward_gain = data.readU8();
        FC.TUNING_SLIDERS.slider_pitch_pi_gain = data.readU8();
        data.readU32(); // reserved for future use
        data.readU32(); // reserved for future use
    }

    static writePidSliderSettings(buffer: MspBuffer) {
        buffer
            .push8(FC.TUNING_SLIDERS.slider_pids_mode)
            .push8(FC.TUNING_SLIDERS.slider_master_multiplier)
            .push8(FC.TUNING_SLIDERS.slider_roll_pitch_ratio)
            .push8(FC.TUNING_SLIDERS.slider_i_gain)
            .push8(FC.TUNING_SLIDERS.slider_d_gain)
            .push8(FC.TUNING_SLIDERS.slider_pi_gain)
            .push8(FC.TUNING_SLIDERS.slider_dmax_gain)
            .push8(FC.TUNING_SLIDERS.slider_feedforward_gain)
            .push8(FC.TUNING_SLIDERS.slider_pitch_pi_gain)
            .push32(0) // reserved for future use
            .push32(0); // reserved for future use
    }

    static readDtermFilterSliderSettings(data: MspDataView) {
        FC.TUNING_SLIDERS.slider_dterm_filter = data.readU8();
        FC.TUNING_SLIDERS.slider_dterm_filter_multiplier = data.readU8();
        FC.FILTER_CONFIG.dterm_lowpass_hz = data.readU16();
        FC.FILTER_CONFIG.dterm_lowpass2_hz = data.readU16();
        FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = data.readU16();
        FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz = data.readU16();
        data.readU32(); // reserved for future use
        data.readU32(); // reserved for future use
    }

    static writeDtermFilterSliderSettings(buffer: MspBuffer) {
        buffer
            .push8(FC.TUNING_SLIDERS.slider_dterm_filter)
            .push8(FC.TUNING_SLIDERS.slider_dterm_filter_multiplier)
            .push16(FC.FILTER_CONFIG.dterm_lowpass_hz)
            .push16(FC.FILTER_CONFIG.dterm_lowpass2_hz)
            .push16(FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz)
            .push16(FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz)
            .push32(0) // reserved for future use
            .push32(0); // reserved for future use
    }

    static readGyroFilterSliderSettings(data: MspDataView) {
        FC.TUNING_SLIDERS.slider_gyro_filter = data.readU8();
        FC.TUNING_SLIDERS.slider_gyro_filter_multiplier = data.readU8();
        FC.FILTER_CONFIG.gyro_lowpass_hz = data.readU16();
        FC.FILTER_CONFIG.gyro_lowpass2_hz = data.readU16();
        FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = data.readU16();
        FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = data.readU16();
        data.readU32(); // reserved for future use
        data.readU32(); // reserved for future use
    }

    static writeGyroFilterSliderSettings(buffer: MspBuffer) {
        buffer
            .push8(FC.TUNING_SLIDERS.slider_gyro_filter)
            .push8(FC.TUNING_SLIDERS.slider_gyro_filter_multiplier)
            .push16(FC.FILTER_CONFIG.gyro_lowpass_hz)
            .push16(FC.FILTER_CONFIG.gyro_lowpass2_hz)
            .push16(FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz)
            .push16(FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz)
            .push32(0) // reserved for future use
            .push32(0); // reserved for future use
    }

    process_data(dataHandler: MspFrame) {
        if (this.decodeFrame(dataHandler)) {
            this.settleCallbacks(dataHandler);
        }
        dataHandler._release_parked?.(dataHandler.code);
    }

    // Returns false when the frame's requests must stay pending (see KEEP_PENDING).
    private decodeFrame(dataHandler: MspFrame): boolean {
        const code = dataHandler.code;

        if (dataHandler.crcError) {
            console.warn(`code: ${code} (${getMSPCodeName(code)}) - crc failed`);
            return true;
        }

        if (dataHandler.unsupported) {
            console.log(`FC reports unsupported message error: ${code} (${getMSPCodeName(code)})`);

            if (code === MSPCodes.MSP_SET_REBOOT) {
                (TABS.onboard_logging as { mscRebootFailedCallback: () => void }).mscRebootFailedCallback();
            }
            return true;
        }

        const decode = DECODERS[code];
        if (!decode) {
            console.log(`Unknown code detected: ${code} (${getMSPCodeName(code)})`);
            return true;
        }
        return decode.call(this, dataHandler.dataView, dataHandler) !== KEEP_PENDING;
    }

    // Removes and settles every pending request for the frame's code. Iterates in reverse because
    // it splices, and re-reads the queue each step because a callback may queue new requests.
    private settleCallbacks(dataHandler: MspFrame) {
        for (let i = dataHandler.callbacks.length - 1; i >= 0; i--) {
            const entry = dataHandler.callbacks[i];
            if (entry?.code !== dataHandler.code) {
                continue;
            }

            clearTimeout(entry.timer ?? undefined);
            dataHandler.callbacks.splice(i, 1);

            if (typeof entry.callback === "function") {
                deliverResponse(entry.callback, entry.errorAware, dataHandler);
            }
        }
    }

    /**
     * Encode the request body for the MSP request with the given code and return it as an array of bytes.
     * The second (optional) 'modifierCode' argument can be used to extend/specify the behavior of certain MSP codes
     * (e.g. 'MSPCodes.MSP2_GET_TEXT' and 'MSPCodes.MSP2_SET_TEXT')
     */
    crunch(code: number, modifierCode?: number): number[] {
        const buffer = new MspBuffer();

        ENCODERS[code]?.call(this, buffer, modifierCode);

        return buffer;
    }

    /**
     * Set raw Rx values over MSP protocol.
     *
     * Channels is an array of 16-bit unsigned integer channel values to be sent. 8 channels is probably the maximum.
     */
    setRawRx(channels: number[]) {
        const buffer = new MspBuffer();

        for (const channel of channels) {
            buffer.push16(channel);
        }

        MSP.send_message(MSPCodes.MSP_SET_RAW_RC, buffer, false);
    }

    /**
     * Send a request to read a block of data from the dataflash at the given address and pass that address and a dataview
     * of the returned data to the given callback (or null for the data if an error occured).
     */
    dataflashRead(address: number, blockSize: number, onDataCallback: DataflashReadCallback) {
        let outData = [address & 0xff, (address >> 8) & 0xff, (address >> 16) & 0xff, (address >> 24) & 0xff];

        outData = outData.concat([blockSize & 0xff, (blockSize >> 8) & 0xff]);

        // Allow compression
        outData = outData.concat([1]);

        MSP.promise(MSPCodes.MSP_DATAFLASH_READ, outData).then(
            (response) => {
                // Undefined only in virtual mode; dereferenced unguarded, as before.
                const reply = response!.data;
                const chunkAddress = reply.readU32();

                const headerSize = 7;
                const dataSize = reply.readU16();
                const dataCompressionType = reply.readU8();

                // Verify that the address of the memory returned matches what the caller asked for
                if (chunkAddress == address) {
                    /* Strip that address off the front of the reply and deliver it separately so the caller doesn't have to
                     * figure out the reply format:
                     */
                    if (dataCompressionType == 0) {
                        onDataCallback(address, new MspDataView(reply.buffer, reply.byteOffset + headerSize, dataSize));
                    } else if (dataCompressionType == 1) {
                        // Read compressed char count to avoid decoding stray bit sequences as bytes
                        const compressedCharCount = reply.readU16();

                        // Compressed format uses 2 additional bytes as a pseudo-header to denote the number of uncompressed bytes
                        const compressedArray = new Uint8Array(
                            reply.buffer,
                            reply.byteOffset + headerSize + 2,
                            dataSize - 2,
                        );
                        const decompressedArray = huffmanDecodeBuf(
                            compressedArray,
                            compressedCharCount,
                            defaultHuffmanTree,
                            defaultHuffmanLenIndex,
                        );

                        onDataCallback(address, new MspDataView(decompressedArray.buffer), dataSize);
                    } else {
                        console.error(`Unknown dataflash compression type ${dataCompressionType}`);
                        onDataCallback(
                            address,
                            null,
                            null,
                            new Error(`Unknown dataflash compression type ${dataCompressionType}`),
                        );
                    }
                } else {
                    // Report address error
                    console.log(`Expected address ${address} but received ${chunkAddress} - retrying`);
                    onDataCallback(address, null); // returning null to the callback forces a retry
                }
            },
            (error) => {
                if (error instanceof MspCrcError) {
                    // Report crc error
                    console.log(`CRC error for address ${address} - retrying`);
                    onDataCallback(address, null); // returning null to the callback forces a retry
                } else {
                    // Timeout or cancellation: surface the error as the fourth argument
                    onDataCallback(address, null, null, error);
                }
            },
        );
    }

    async sendServoConfigurations() {
        for (let servoIndex = 0; servoIndex < FC.SERVO_CONFIG.length; servoIndex++) {
            const servoConfiguration = FC.SERVO_CONFIG[servoIndex];
            const buffer = new MspBuffer();

            buffer
                .push8(servoIndex)
                .push16(servoConfiguration.min)
                .push16(servoConfiguration.max)
                .push16(servoConfiguration.middle)
                .push8(servoConfiguration.rate);

            let out = servoConfiguration.indexOfChannelToForward;
            out ??= 255; // Cleanflight defines "CHANNEL_FORWARDING_DISABLED" as "(uint8_t)0xFF"
            buffer.push8(out).push32(servoConfiguration.reversedInputSources);

            await MSP.promise(MSPCodes.MSP_SET_SERVO_CONFIGURATION, buffer);
        }
    }

    async sendModeRanges() {
        for (let modeRangeIndex = 0; modeRangeIndex < FC.MODE_RANGES.length; modeRangeIndex++) {
            const modeRange = FC.MODE_RANGES[modeRangeIndex];
            const buffer = new MspBuffer();

            buffer
                .push8(modeRangeIndex)
                .push8(modeRange.id)
                .push8(modeRange.auxChannelIndex)
                .push8((modeRange.range.start - 900) / 25)
                .push8((modeRange.range.end - 900) / 25);

            const modeRangeExtra = FC.MODE_RANGES_EXTRA[modeRangeIndex];

            buffer.push8(modeRangeExtra.modeLogic).push8(modeRangeExtra.linkedTo);

            await MSP.promise(MSPCodes.MSP_SET_MODE_RANGE, buffer);
        }
    }

    async sendAdjustmentRanges() {
        for (let adjustmentRangeIndex = 0; adjustmentRangeIndex < FC.ADJUSTMENT_RANGES.length; adjustmentRangeIndex++) {
            const adjustmentRange = FC.ADJUSTMENT_RANGES[adjustmentRangeIndex];
            const buffer = new MspBuffer();

            buffer
                .push8(adjustmentRangeIndex)
                .push8(adjustmentRange.slotIndex)
                .push8(adjustmentRange.auxChannelIndex)
                .push8((adjustmentRange.range.start - 900) / 25)
                .push8((adjustmentRange.range.end - 900) / 25)
                .push8(adjustmentRange.adjustmentFunction)
                .push8(adjustmentRange.auxSwitchChannelIndex);
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_48)) {
                buffer.push16(adjustmentRange.adjustmentCenter || 0).push16(adjustmentRange.adjustmentScale || 0);
            }

            await MSP.promise(MSPCodes.MSP_SET_ADJUSTMENT_RANGE, buffer);
        }
    }

    async sendVoltageConfig() {
        for (const config of FC.VOLTAGE_METER_CONFIGS) {
            const buffer = new MspBuffer();

            buffer
                .push8(config.id)
                .push8(config.vbatscale)
                .push8(config.vbatresdivval)
                .push8(config.vbatresdivmultiplier);

            await MSP.promise(MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG, buffer);
        }
    }

    async sendCurrentConfig() {
        for (const config of FC.CURRENT_METER_CONFIGS) {
            const buffer = new MspBuffer();

            buffer.push8(config.id).push16(config.scale).push16(config.offset);

            await MSP.promise(MSPCodes.MSP_SET_CURRENT_METER_CONFIG, buffer);
        }
    }

    async sendLedStripConfig() {
        // API 1.46 shifted the colour (18 -> 22) and direction (22 -> 26) fields up in the mask.
        const isNewLayout = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46);
        const colorOffset = isNewLayout ? 22 : 18;
        const directionOffset = isNewLayout ? 26 : 22;

        for (let ledIndex = 0; ledIndex < FC.LED_STRIP.length; ledIndex++) {
            const buffer = new MspBuffer();

            buffer.push(ledIndex);
            buffer.push32(buildLedStripMask(FC.LED_STRIP[ledIndex], colorOffset, directionOffset));

            await MSP.promise(MSPCodes.MSP_SET_LED_STRIP_CONFIG, buffer);
        }
    }

    async sendLedStripColors() {
        if (FC.LED_COLORS.length == 0) {
            return;
        }

        const buffer = new MspBuffer();

        for (const color of FC.LED_COLORS) {
            buffer.push16(color.h).push8(color.s).push8(color.v);
        }

        await MSP.promise(MSPCodes.MSP_SET_LED_COLORS, buffer);
    }

    async sendLedStripModeColors() {
        for (const modeColor of FC.LED_MODE_COLORS) {
            const buffer = new MspBuffer();

            buffer.push8(modeColor.mode).push8(modeColor.direction).push8(modeColor.color);

            await MSP.promise(MSPCodes.MSP_SET_LED_STRIP_MODECOLOR, buffer);
        }
    }

    sendLedStripConfigValues(onCompleteCallback?: () => void) {
        const buffer = new MspBuffer();
        buffer.push8(FC.LED_CONFIG_VALUES.brightness ?? 0);
        buffer.push16(FC.LED_CONFIG_VALUES.rainbow_delta ?? 0);
        buffer.push16(FC.LED_CONFIG_VALUES.rainbow_freq ?? 0);
        MSP.send_message(MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES, buffer, false, onCompleteCallback);
    }

    serialPortFunctionMaskToFunctions(functionMask: number): SerialPortFunction[] {
        const functions: SerialPortFunction[] = [];

        const keys = Object.keys(this.SERIAL_PORT_FUNCTIONS) as SerialPortFunction[];
        for (const key of keys) {
            const bit = this.SERIAL_PORT_FUNCTIONS[key];
            if (bit_check(functionMask, bit)) {
                functions.push(key);
            }
        }
        return functions;
    }

    serialPortFunctionsToMask(functions: string[]): number {
        let mask = 0;

        for (const key of functions) {
            const bitIndex = (this.SERIAL_PORT_FUNCTIONS as Record<string, number | undefined>)[key];
            if (bitIndex !== undefined && bitIndex >= 0) {
                mask = bit_set(mask, bitIndex);
            }
        }

        return mask;
    }

    sendRxFailConfig(onCompleteCallback: () => void) {
        let nextFunction = send_next_rxfail_config;

        let rxFailIndex = 0;

        if (FC.RXFAIL_CONFIG.length == 0) {
            onCompleteCallback();
        } else {
            send_next_rxfail_config();
        }

        function send_next_rxfail_config() {
            const rxFail = FC.RXFAIL_CONFIG[rxFailIndex];

            const buffer = new MspBuffer();
            buffer.push8(rxFailIndex).push8(rxFail.mode).push16(rxFail.value);

            // prepare for next iteration
            rxFailIndex++;
            if (rxFailIndex == FC.RXFAIL_CONFIG.length) {
                nextFunction = onCompleteCallback;
            }
            MSP.send_message(MSPCodes.MSP_SET_RXFAIL_CONFIG, buffer, false, nextFunction);
        }
    }

    /** Stops the FC from arming, with runaway takeoff prevention on. */
    disableArming(onCompleteCallback?: () => void) {
        this.applyArmingState({ armingDisabled: true, runawayTakeoffPreventionDisabled: false }, onCompleteCallback);
    }

    /** Lets the FC arm again, with runaway takeoff prevention on. */
    enableArming(onCompleteCallback?: () => void) {
        this.applyArmingState({ armingDisabled: false, runawayTakeoffPreventionDisabled: false }, onCompleteCallback);
    }

    /** Lets the FC arm with runaway takeoff prevention off, which spinning motors on the bench needs. */
    enableArmingForMotorTest(onCompleteCallback?: () => void) {
        this.applyArmingState({ armingDisabled: false, runawayTakeoffPreventionDisabled: true }, onCompleteCallback);
    }

    // Sends MSP_ARMING_DISABLE only when the FC is not already in `target`.
    private applyArmingState(target: ArmingState, onCompleteCallback?: () => void) {
        if (
            FC.CONFIG.armingDisabled === target.armingDisabled &&
            FC.CONFIG.runawayTakeoffPreventionDisabled === target.runawayTakeoffPreventionDisabled
        ) {
            onCompleteCallback?.();
            return;
        }

        FC.CONFIG.armingDisabled = target.armingDisabled;
        FC.CONFIG.runawayTakeoffPreventionDisabled = target.runawayTakeoffPreventionDisabled;

        MSP.send_message(MSPCodes.MSP_ARMING_DISABLE, this.crunch(MSPCodes.MSP_ARMING_DISABLE), false, () => {
            if (target.armingDisabled) {
                gui_log(i18n.getMessage("armingDisabled"));
            } else {
                gui_log(i18n.getMessage("armingEnabled"));
                gui_log(
                    i18n.getMessage(
                        target.runawayTakeoffPreventionDisabled
                            ? "runawayTakeoffPreventionDisabled"
                            : "runawayTakeoffPreventionEnabled",
                    ),
                );
            }

            onCompleteCallback?.();
        });
    }

    loadSerialConfig(callback?: () => void) {
        const mspCode = MSPCodes.MSP2_COMMON_SERIAL_CONFIG;
        MSP.send_message(mspCode, false, false, callback);
    }

    sendSerialConfig(callback?: () => void) {
        const mspCode = MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG;
        MSP.send_message(mspCode, mspHelper.crunch(mspCode), false, callback);
    }

    writeConfiguration(reboot: boolean, callback?: () => void) {
        // We need some protection when testing motors on motors tab
        if (!FC.CONFIG.armingDisabled) {
            this.disableArming();
        }

        setTimeout(function () {
            MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, function () {
                gui_log(i18n.getMessage("configurationEepromSaved"));
                console.log("Configuration saved to EEPROM");
                if (reboot) {
                    GUI.tab_switch_cleanup(function () {
                        return reinitializeConnection();
                    });
                }
                if (callback) {
                    callback();
                }
            });
        }, 100); // 100ms delay before sending MSP_EEPROM_WRITE to ensure that all settings have been received
    }
}

// A decoder returns this when the frame only partly answers its requests, so they stay pending.
const KEEP_PENDING = "keep-pending";

type Decoder = (this: MspHelper, data: MspDataView, dataHandler: MspFrame) => void | typeof KEEP_PENDING;
type Encoder = (this: MspHelper, buffer: MspBuffer, modifierCode: number | undefined) => void;

// For codes whose reply or request carries nothing to decode or encode.
const NOTHING_TO_DO = () => {
    // intentionally empty: the code is known, there is just no payload to handle
};

// One decoder per MSP reply code; process_data dispatches here and logs codes with no entry.
const DECODERS: Partial<Record<number, Decoder>> = {
    [MSPCodes.MSP_STATUS](data) {
        FC.CONFIG.cycleTime = data.readU16();
        FC.CONFIG.i2cError = data.readU16();
        reportI2cErrors(FC.CONFIG.i2cError);
        FC.CONFIG.activeSensors = data.readU16();
        FC.CONFIG.mode = data.readU32();
        FC.CONFIG.profile = data.readU8();
    },

    [MSPCodes.MSP_STATUS_EX](data) {
        FC.CONFIG.cycleTime = data.readU16();
        FC.CONFIG.i2cError = data.readU16();
        reportI2cErrors(FC.CONFIG.i2cError);
        FC.CONFIG.activeSensors = data.readU16();
        FC.CONFIG.mode = data.readU32();
        FC.CONFIG.profile = data.readU8();
        FC.CONFIG.cpuload = data.readU16();
        FC.CONFIG.numProfiles = data.readU8();
        FC.CONFIG.rateProfile = data.readU8();

        // Read flight mode flags
        const byteCount = data.readU8();
        for (let i = 0; i < byteCount; i++) {
            data.readU8();
        }

        // Read arming disable flags
        FC.CONFIG.armingDisableCount = data.readU8(); // Flag count
        FC.CONFIG.armingDisableFlags = data.readU32();

        // Read config state flags - bits to indicate the state of the configuration, reboot required, etc.
        FC.CONFIG.configStateFlag = data.readU8();

        // Read CPU temp, from API version 1.46
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            FC.CONFIG.cpuTemp = data.readU16();
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            FC.CONFIG.numberOfRateProfiles = data.readU8();
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_48)) {
            FC.CONFIG.numberOfBatteryProfiles = data.readU8();
            FC.CONFIG.batteryProfile = data.readU8();
            // Grow batteryProfileNames to match actual profile count from FC
            while (FC.CONFIG.batteryProfileNames.length < FC.CONFIG.numberOfBatteryProfiles) {
                FC.CONFIG.batteryProfileNames.push("");
            }
        }
    },

    [MSPCodes.MSP_RAW_IMU](data) {
        // 2048 for mpu6050, 1024 for mma (times 4 since we don't scale in the firmware)
        // currently we are unable to differentiate between the sensor types, so we are going with 2048
        FC.SENSOR_DATA.accelerometer[0] = data.read16() / 2048;
        FC.SENSOR_DATA.accelerometer[1] = data.read16() / 2048;
        FC.SENSOR_DATA.accelerometer[2] = data.read16() / 2048;

        // properly scaled
        FC.SENSOR_DATA.gyroscope[0] = data.read16() * (4 / 16.4);
        FC.SENSOR_DATA.gyroscope[1] = data.read16() * (4 / 16.4);
        FC.SENSOR_DATA.gyroscope[2] = data.read16() * (4 / 16.4);

        // no clue about scaling factor
        FC.SENSOR_DATA.magnetometer[0] = data.read16();
        FC.SENSOR_DATA.magnetometer[1] = data.read16();
        FC.SENSOR_DATA.magnetometer[2] = data.read16();
    },

    [MSPCodes.MSP_SERVO](data) {
        const servoCount = data.byteLength / 2;
        for (let i = 0; i < servoCount; i++) {
            FC.SERVO_DATA[i] = data.readU16();
        }
    },

    [MSPCodes.MSP_MOTOR](data) {
        const motorCount = data.byteLength / 2;
        for (let i = 0; i < motorCount; i++) {
            FC.MOTOR_DATA[i] = data.readU16();
        }
    },

    [MSPCodes.MSP2_MOTOR_OUTPUT_REORDERING](data) {
        FC.MOTOR_OUTPUT_ORDER = [];
        const arraySize = data.read8();
        for (let i = 0; i < arraySize; i++) {
            FC.MOTOR_OUTPUT_ORDER[i] = data.readU8();
        }
    },

    [MSPCodes.MSP2_GET_VTX_DEVICE_STATUS](data) {
        FC.VTX_DEVICE_STATUS = null;
        const dataLength = data.byteLength;
        if (dataLength > 0) {
            const vtxDeviceStatusData = new Uint8Array(dataLength);
            for (let i = 0; i < dataLength; i++) {
                vtxDeviceStatusData[i] = data.readU8();
            }
            FC.VTX_DEVICE_STATUS = vtxDeviceStatusFactory.createVtxDeviceStatus(vtxDeviceStatusData);
        }
    },

    [MSPCodes.MSP_MOTOR_TELEMETRY](data) {
        const telemMotorCount = data.readU8();
        for (let i = 0; i < telemMotorCount; i++) {
            FC.MOTOR_TELEMETRY_DATA.rpm[i] = data.readU32(); // RPM
            FC.MOTOR_TELEMETRY_DATA.invalidPercent[i] = data.readU16(); // 10000 = 100.00%
            FC.MOTOR_TELEMETRY_DATA.temperature[i] = data.readU8(); // degrees celsius
            FC.MOTOR_TELEMETRY_DATA.voltage[i] = data.readU16(); // 0.01V per unit
            FC.MOTOR_TELEMETRY_DATA.current[i] = data.readU16(); // 0.01A per unit
            FC.MOTOR_TELEMETRY_DATA.consumption[i] = data.readU16(); // mAh
        }
    },

    [MSPCodes.MSP_RC](data) {
        FC.RC.active_channels = data.byteLength / 2;
        for (let i = 0; i < FC.RC.active_channels; i++) {
            FC.RC.channels[i] = data.readU16();
        }
    },

    [MSPCodes.MSP_RAW_GPS](data) {
        FC.GPS_DATA.fix = data.readU8();
        FC.GPS_DATA.numSat = data.readU8();
        FC.GPS_DATA.latitude = data.read32();
        FC.GPS_DATA.longitude = data.read32();
        FC.GPS_DATA.alt = data.readU16();
        FC.GPS_DATA.speed = data.readU16();
        FC.GPS_DATA.ground_course = data.readU16();
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            FC.GPS_DATA.positionalDop = data.readU16();
        }
    },

    [MSPCodes.MSP_COMP_GPS](data) {
        FC.GPS_DATA.distanceToHome = data.readU16();
        FC.GPS_DATA.directionToHome = data.readU16();
        FC.GPS_DATA.update = data.readU8();
    },

    [MSPCodes.MSP_ATTITUDE](data) {
        FC.SENSOR_DATA.kinematics[0] = data.read16() / 10.0; // x
        FC.SENSOR_DATA.kinematics[1] = data.read16() / 10.0; // y
        FC.SENSOR_DATA.kinematics[2] = data.read16();
    },

    [MSPCodes.MSP_ATTITUDE_QUATERNION](data) {
        FC.SENSOR_DATA.quaternion = {
            w: data.read16() / 32767,
            x: data.read16() / 32767,
            y: data.read16() / 32767,
            z: data.read16() / 32767,
        };
    },

    [MSPCodes.MSP_ALTITUDE](data) {
        FC.SENSOR_DATA.altitude = Number.parseFloat((data.read32() / 100.0).toFixed(2));
    },

    [MSPCodes.MSP_SONAR](data) {
        FC.SENSOR_DATA.sonar = data.read32();
    },

    [MSPCodes.MSP_PITOT](data) {
        FC.SENSOR_DATA.pitot = {
            airspeed: data.read32(),
            diffPressure: data.read32(),
        };
    },

    [MSPCodes.MSP_ANALOG](data) {
        FC.ANALOG.voltage = data.readU8() / 10.0;
        FC.ANALOG.mAhdrawn = data.readU16();
        FC.ANALOG.rssi = data.readU16(); // 0-1023
        FC.ANALOG.amperage = data.read16() / 100; // A
        FC.ANALOG.voltage = data.readU16() / 100;
        FC.ANALOG.last_received_timestamp = performance.now();
    },

    [MSPCodes.MSP_VOLTAGE_METERS](data) {
        FC.VOLTAGE_METERS = [];
        const voltageMeterLength = 2;
        for (let i = 0; i < data.byteLength / voltageMeterLength; i++) {
            const voltageMeter = {
                id: data.readU8(),
                voltage: data.readU8() / 10.0,
            };

            FC.VOLTAGE_METERS.push(voltageMeter);
        }
    },

    [MSPCodes.MSP_CURRENT_METERS](data) {
        FC.CURRENT_METERS = [];
        const currentMeterLength = 5;
        for (let i = 0; i < data.byteLength / currentMeterLength; i++) {
            const currentMeter = {
                id: data.readU8(),
                mAhDrawn: data.readU16(), // mAh
                amperage: data.readU16() / 1000, // A
            };

            FC.CURRENT_METERS.push(currentMeter);
        }
    },

    [MSPCodes.MSP_BATTERY_STATE](data) {
        FC.BATTERY_STATE.cellCount = data.readU8();
        FC.BATTERY_STATE.capacity = data.readU16(); // mAh

        FC.BATTERY_STATE.voltage = data.readU8() / 10.0; // V
        FC.BATTERY_STATE.mAhDrawn = data.readU16(); // mAh
        FC.BATTERY_STATE.amperage = data.readU16() / 100; // A
        FC.BATTERY_STATE.batteryState = data.readU8();
        FC.BATTERY_STATE.voltage = data.readU16() / 100;
    },

    [MSPCodes.MSP_VOLTAGE_METER_CONFIG](data) {
        FC.VOLTAGE_METER_CONFIGS = [];
        const voltageMeterCount = data.readU8();

        for (let i = 0; i < voltageMeterCount; i++) {
            const subframeLength = data.readU8();
            if (subframeLength !== 5) {
                for (let j = 0; j < subframeLength; j++) {
                    data.readU8();
                }
            } else {
                const voltageMeterConfig = {
                    id: data.readU8(),
                    sensorType: data.readU8(),
                    vbatscale: data.readU8(),
                    vbatresdivval: data.readU8(),
                    vbatresdivmultiplier: data.readU8(),
                };

                FC.VOLTAGE_METER_CONFIGS.push(voltageMeterConfig);
            }
        }
    },

    [MSPCodes.MSP_CURRENT_METER_CONFIG](data) {
        FC.CURRENT_METER_CONFIGS = [];
        const currentMeterCount = data.readU8();
        for (let i = 0; i < currentMeterCount; i++) {
            const subframeLength = data.readU8();

            if (subframeLength !== 6) {
                for (let j = 0; j < subframeLength; j++) {
                    data.readU8();
                }
            } else {
                // Fields are read in declaration order, the same order as before.
                const currentMeterConfig: CurrentMeterConfig = {
                    id: data.readU8(),
                    sensorType: data.readU8(),
                    scale: data.read16(),
                    offset: data.read16(),
                };

                FC.CURRENT_METER_CONFIGS.push(currentMeterConfig);
            }
        }
    },

    [MSPCodes.MSP_BATTERY_CONFIG](data) {
        FC.BATTERY_CONFIG.vbatmincellvoltage = data.readU8() / 10; // 10-50
        FC.BATTERY_CONFIG.vbatmaxcellvoltage = data.readU8() / 10; // 10-50
        FC.BATTERY_CONFIG.vbatwarningcellvoltage = data.readU8() / 10; // 10-50
        FC.BATTERY_CONFIG.capacity = data.readU16();
        FC.BATTERY_CONFIG.voltageMeterSource = data.readU8();
        FC.BATTERY_CONFIG.currentMeterSource = data.readU8();
        FC.BATTERY_CONFIG.vbatmincellvoltage = data.readU16() / 100;
        FC.BATTERY_CONFIG.vbatmaxcellvoltage = data.readU16() / 100;
        FC.BATTERY_CONFIG.vbatwarningcellvoltage = data.readU16() / 100;
    },

    [MSPCodes.MSP_SET_BATTERY_CONFIG]() {
        console.log("Battery configuration saved");
    },

    [MSPCodes.MSP_RC_TUNING](data) {
        FC.RC_TUNING.RC_RATE = Number.parseFloat((data.readU8() / 100).toFixed(2));
        FC.RC_TUNING.RC_EXPO = Number.parseFloat((data.readU8() / 100).toFixed(2));
        FC.RC_TUNING.roll_pitch_rate = 0;
        FC.RC_TUNING.roll_rate = Number.parseFloat((data.readU8() / 100).toFixed(2));
        FC.RC_TUNING.pitch_rate = Number.parseFloat((data.readU8() / 100).toFixed(2));
        FC.RC_TUNING.yaw_rate = Number.parseFloat((data.readU8() / 100).toFixed(2));
        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            FC.RC_TUNING.dynamic_THR_PID = Number.parseFloat((data.readU8() / 100).toFixed(2));
        } else {
            data.readU8();
        }
        FC.RC_TUNING.throttle_MID = Number.parseFloat((data.readU8() / 100).toFixed(2));
        FC.RC_TUNING.throttle_EXPO = Number.parseFloat((data.readU8() / 100).toFixed(2));
        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            FC.RC_TUNING.dynamic_THR_breakpoint = data.readU16();
        } else {
            data.readU16();
        }
        FC.RC_TUNING.RC_YAW_EXPO = Number.parseFloat((data.readU8() / 100).toFixed(2));
        FC.RC_TUNING.rcYawRate = Number.parseFloat((data.readU8() / 100).toFixed(2));
        FC.RC_TUNING.rcPitchRate = Number.parseFloat((data.readU8() / 100).toFixed(2));
        FC.RC_TUNING.RC_PITCH_EXPO = Number.parseFloat((data.readU8() / 100).toFixed(2));
        FC.RC_TUNING.throttleLimitType = data.readU8();
        FC.RC_TUNING.throttleLimitPercent = data.readU8();
        FC.RC_TUNING.roll_rate_limit = data.readU16();
        FC.RC_TUNING.pitch_rate_limit = data.readU16();
        FC.RC_TUNING.yaw_rate_limit = data.readU16();
        FC.RC_TUNING.rates_type = data.readU8();
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            FC.RC_TUNING.throttle_HOVER = Number.parseFloat((data.readU8() / 100).toFixed(2));
        }
    },

    [MSPCodes.MSP_PID](data) {
        // PID data arrived, we need to scale it and save to appropriate bank / array
        for (let i = 0, needle = 0; i < data.byteLength / 3; i++, needle += 3) {
            // main for loop selecting the pid section
            for (let j = 0; j < 3; j++) {
                FC.PIDS_ACTIVE[i][j] = data.readU8();
                FC.PIDS[i][j] = FC.PIDS_ACTIVE[i][j];
            }
        }
    },

    [MSPCodes.MSP_ARMING_CONFIG](data) {
        FC.ARMING_CONFIG.auto_disarm_delay = data.readU8();
        data.readU8(); // was FC.ARMING_CONFIG.auto_disarm_kill_switch
        FC.ARMING_CONFIG.small_angle = data.readU8();
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            FC.ARMING_CONFIG.gyro_cal_on_first_arm = data.readU8();
        }
    },

    [MSPCodes.MSP_LOOP_TIME](data) {
        FC.FC_CONFIG.loopTime = data.readU16();
    },

    [MSPCodes.MSP_MISC](data) {
        // 22 bytes
        FC.RX_CONFIG.midrc = data.readU16();
        FC.MOTOR_CONFIG.minthrottle = data.readU16(); // 0-2000
        FC.MOTOR_CONFIG.maxthrottle = data.readU16(); // 0-2000
        FC.MOTOR_CONFIG.mincommand = data.readU16(); // 0-2000
        FC.MISC.failsafe_throttle = data.readU16(); // 1000-2000
        FC.GPS_CONFIG.provider = data.readU8();
        FC.MISC.gps_baudrate = data.readU8();
        FC.GPS_CONFIG.ublox_sbas = data.readU8();
        FC.MISC.multiwiicurrentoutput = data.readU8();
        FC.RSSI_CONFIG.channel = data.readU8();
        FC.MISC.placeholder2 = data.readU8();
        data.read16(); // was mag_declination
        FC.MISC.vbatscale = data.readU8(); // was FC.MISC.vbatscale - 10-200
        FC.MISC.vbatmincellvoltage = data.readU8() / 10; // 10-50
        FC.MISC.vbatmaxcellvoltage = data.readU8() / 10; // 10-50
        FC.MISC.vbatwarningcellvoltage = data.readU8() / 10;
    },

    [MSPCodes.MSP_MOTOR_CONFIG](data) {
        FC.MOTOR_CONFIG.minthrottle = data.readU16(); // 0-2000
        FC.MOTOR_CONFIG.maxthrottle = data.readU16(); // 0-2000
        FC.MOTOR_CONFIG.mincommand = data.readU16(); // 0-2000
        FC.MOTOR_CONFIG.motor_count = data.readU8();
        FC.MOTOR_CONFIG.motor_poles = data.readU8();
        FC.MOTOR_CONFIG.use_dshot_telemetry = data.readU8() != 0;
        FC.MOTOR_CONFIG.use_esc_sensor = data.readU8() != 0;

        // Introduced in 1.49
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_49)) {
            FC.MOTOR_CONFIG.motor_kv = data.readU16();
        }
    },

    [MSPCodes.MSP_COMPASS_CONFIG](data) {
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            FC.COMPASS_CONFIG.mag_declination = data.read16() / 10;
        }
    },

    [MSPCodes.MSP_GPS_CONFIG](data) {
        FC.GPS_CONFIG.provider = data.readU8();
        FC.GPS_CONFIG.ublox_sbas = data.readU8();
        FC.GPS_CONFIG.auto_config = data.readU8();
        FC.GPS_CONFIG.auto_baud = data.readU8();

        // Introduced in API version 1.43
        FC.GPS_CONFIG.home_point_once = data.readU8();
        FC.GPS_CONFIG.ublox_use_galileo = data.readU8();
    },

    [MSPCodes.MSP_GPS_RESCUE](data) {
        FC.GPS_RESCUE.angle = data.readU16();
        FC.GPS_RESCUE.returnAltitudeM = data.readU16();
        FC.GPS_RESCUE.descentDistanceM = data.readU16();
        FC.GPS_RESCUE.groundSpeed = data.readU16();
        FC.GPS_RESCUE.throttleMin = data.readU16();
        FC.GPS_RESCUE.throttleMax = data.readU16();
        FC.GPS_RESCUE.throttleHover = data.readU16();
        FC.GPS_RESCUE.sanityChecks = data.readU8();
        FC.GPS_RESCUE.minSats = data.readU8();

        // Introduced in API version 1.43
        FC.GPS_RESCUE.ascendRate = data.readU16();
        FC.GPS_RESCUE.descendRate = data.readU16();
        FC.GPS_RESCUE.allowArmingWithoutFix = data.readU8();
        FC.GPS_RESCUE.altitudeMode = data.readU8();

        // Introduced in API version 1.44
        FC.GPS_RESCUE.minStartDistM = data.readU16();

        // Introduced in API version 1.46
        FC.GPS_RESCUE.initialClimbM = data.readU16();
    },

    [MSPCodes.MSP_RSSI_CONFIG](data) {
        FC.RSSI_CONFIG.channel = data.readU8();
    },

    [MSPCodes.MSP_MOTOR_3D_CONFIG](data) {
        FC.MOTOR_3D_CONFIG.deadband3d_low = data.readU16();
        FC.MOTOR_3D_CONFIG.deadband3d_high = data.readU16();
        FC.MOTOR_3D_CONFIG.neutral = data.readU16();
    },

    [MSPCodes.MSP_BOXNAMES](data) {
        let buff: number[] = [];
        let char = 0;
        FC.AUX_CONFIG = []; // empty the array as new data is coming in

        buff = [];
        for (let i = 0; i < data.byteLength; i++) {
            char = data.readU8();
            if (char == 0x3b) {
                // ; (delimeter char)
                FC.AUX_CONFIG.push(String.fromCodePoint(...buff)); // convert bytes into ASCII and save as strings

                // empty buffer
                buff = [];
            } else {
                buff.push(char);
            }
        }
    },

    [MSPCodes.MSP_PIDNAMES](data) {
        let buff: number[] = [];
        let char = 0;
        FC.PID_NAMES = []; // empty the array as new data is coming in

        buff = [];
        for (let i = 0; i < data.byteLength; i++) {
            char = data.readU8();
            if (char == 0x3b) {
                // ; (delimeter char)
                FC.PID_NAMES.push(String.fromCodePoint(...buff)); // convert bytes into ASCII and save as strings

                // empty buffer
                buff = [];
            } else {
                buff.push(char);
            }
        }
    },

    [MSPCodes.MSP_BOXIDS](data) {
        FC.AUX_CONFIG_IDS = []; // empty the array as new data is coming in

        for (let i = 0; i < data.byteLength; i++) {
            FC.AUX_CONFIG_IDS.push(data.readU8());
        }
    },

    [MSPCodes.MSP_SERVO_MIX_RULES]: NOTHING_TO_DO,

    [MSPCodes.MSP_SERVO_CONFIGURATIONS](data) {
        FC.SERVO_CONFIG = []; // empty the array as new data is coming in
        if (data.byteLength % 12 == 0) {
            for (let i = 0; i < data.byteLength; i += 12) {
                const arr = {
                    min: data.readU16(),
                    max: data.readU16(),
                    middle: data.readU16(),
                    rate: data.read8(),
                    indexOfChannelToForward: data.readU8(),
                    reversedInputSources: data.readU32(),
                };

                FC.SERVO_CONFIG.push(arr);
            }
        }
    },

    [MSPCodes.MSP_RC_DEADBAND](data) {
        FC.RC_DEADBAND_CONFIG.deadband = data.readU8();
        FC.RC_DEADBAND_CONFIG.yaw_deadband = data.readU8();
        FC.RC_DEADBAND_CONFIG.alt_hold_deadband = data.readU8();

        FC.RC_DEADBAND_CONFIG.deadband3d_throttle = data.readU16();
    },

    [MSPCodes.MSP_SENSOR_ALIGNMENT](data) {
        FC.SENSOR_ALIGNMENT.align_gyro = data.readU8();
        FC.SENSOR_ALIGNMENT.align_acc = data.readU8();
        FC.SENSOR_ALIGNMENT.align_mag = data.readU8();
        FC.SENSOR_ALIGNMENT.gyro_detection_flags = data.readU8();

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            FC.SENSOR_ALIGNMENT.gyro_enable_mask = data.readU8(); // replacing gyro_to_use
            FC.SENSOR_ALIGNMENT.mag_align_roll = data.read16() / 10;
            FC.SENSOR_ALIGNMENT.mag_align_pitch = data.read16() / 10;
            FC.SENSOR_ALIGNMENT.mag_align_yaw = data.read16() / 10;
        } else {
            FC.SENSOR_ALIGNMENT.gyro_to_use = data.readU8();
            FC.SENSOR_ALIGNMENT.gyro_1_align = data.readU8();
            FC.SENSOR_ALIGNMENT.gyro_2_align = data.readU8();
        }
    },

    [MSPCodes.MSP_DISPLAYPORT]: NOTHING_TO_DO,

    [MSPCodes.MSP_SET_RAW_RC]: NOTHING_TO_DO,

    [MSPCodes.MSP_SET_PID]() {
        console.log("PID settings saved");
        FC.PIDS_ACTIVE = FC.PIDS.map((array) => array.slice());
    },

    [MSPCodes.MSP_SET_RC_TUNING]() {
        console.log("RC Tuning saved");
    },

    [MSPCodes.MSP_ACC_CALIBRATION]() {
        console.log("Accel calibration executed");
    },

    [MSPCodes.MSP_MAG_CALIBRATION]() {
        console.log("Mag calibration executed");
    },

    [MSPCodes.MSP_SET_MOTOR_CONFIG]() {
        console.log("Motor Configuration saved");
    },

    [MSPCodes.MSP_SET_GPS_CONFIG]() {
        console.log("GPS Configuration saved");
    },

    [MSPCodes.MSP_SET_GPS_RESCUE]() {
        console.log("GPS Rescue Configuration saved");
    },

    [MSPCodes.MSP_SET_RSSI_CONFIG]() {
        console.log("RSSI Configuration saved");
    },

    [MSPCodes.MSP_SET_FEATURE_CONFIG]() {
        console.log("Features saved");
    },

    [MSPCodes.MSP_SET_BEEPER_CONFIG]() {
        console.log("Beeper Configuration saved");
    },

    [MSPCodes.MSP_RESET_CONF]() {
        console.log("Settings Reset");
    },

    [MSPCodes.MSP_SELECT_SETTING]() {
        console.log("Profile selected");
    },

    [MSPCodes.MSP_SET_SERVO_CONFIGURATION]() {
        console.log("Servo Configuration saved");
    },

    [MSPCodes.MSP_EEPROM_WRITE]() {
        console.log("Settings Saved in EEPROM");
    },

    [MSPCodes.MSP_SET_CURRENT_METER_CONFIG]() {
        console.log("Amperage Settings saved");
    },

    [MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG]() {
        console.log("Voltage config saved");
    },

    [MSPCodes.MSP_DEBUG](data) {
        for (let i = 0; i < 8; i++) {
            FC.SENSOR_DATA.debug[i] = data.read16();
        }
    },

    [MSPCodes.MSP_SET_MOTOR]: NOTHING_TO_DO,

    [MSPCodes.MSP_UID](data) {
        FC.CONFIG.uid[0] = data.readU32();
        FC.CONFIG.uid[1] = data.readU32();
        FC.CONFIG.uid[2] = data.readU32();
        FC.CONFIG.deviceIdentifier =
            FC.CONFIG.uid[0].toString(16) + FC.CONFIG.uid[1].toString(16) + FC.CONFIG.uid[2].toString(16);
    },

    [MSPCodes.MSP_ACC_TRIM](data) {
        FC.CONFIG.accelerometerTrims[0] = data.read16(); // pitch
        FC.CONFIG.accelerometerTrims[1] = data.read16();
    },

    [MSPCodes.MSP_SET_ACC_TRIM]() {
        console.log("Accelerometer trimms saved.");
    },

    [MSPCodes.MSP_GPS_SV_INFO](data) {
        if (data.byteLength > 0) {
            const numCh = data.readU8();

            for (let i = 0; i < numCh; i++) {
                FC.GPS_DATA.chn[i] = data.readU8();
                FC.GPS_DATA.svid[i] = data.readU8();
                FC.GPS_DATA.quality[i] = data.readU8();
                FC.GPS_DATA.cno[i] = data.readU8();
            }
        }
    },

    [MSPCodes.MSP_RX_MAP](data) {
        FC.RC_MAP = []; // empty the array as new data is coming in

        for (let i = 0; i < data.byteLength; i++) {
            FC.RC_MAP.push(data.readU8());
        }
    },

    [MSPCodes.MSP_SET_RX_MAP]() {
        console.log("RCMAP saved");
    },

    [MSPCodes.MSP_MIXER_CONFIG](data) {
        FC.MIXER_CONFIG.mixer = data.readU8();
        FC.MIXER_CONFIG.reverseMotorDir = data.readU8();
    },

    [MSPCodes.MSP_FEATURE_CONFIG](data) {
        features().setMask(data.readU32());

        updateTabList(features());
    },

    [MSPCodes.MSP_BEEPER_CONFIG](data) {
        beepers("beepers").setDisabledMask(data.readU32());
        FC.BEEPER_CONFIG.dshotBeaconTone = data.readU8();
        beepers("dshotBeaconConditions").setDisabledMask(data.readU32());
    },

    [MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG](data) {
        FC.BOARD_ALIGNMENT_CONFIG.roll = data.read16(); // -180 - 360
        FC.BOARD_ALIGNMENT_CONFIG.pitch = data.read16(); // -180 - 360
        FC.BOARD_ALIGNMENT_CONFIG.yaw = data.read16();
    },

    [MSPCodes.MSP_SET_REBOOT](data) {
        const rebootType = data.read8();
        if (rebootType === this.REBOOT_TYPES.MSC || rebootType === this.REBOOT_TYPES.MSC_UTC) {
            if (data.read8() === 0) {
                console.log("Storage device not ready.");

                showErrorDialog(i18n.getMessage("storageDeviceNotReady"));
                return;
            }
        }
        console.log("Reboot request accepted");
    },

    [MSPCodes.MSP_API_VERSION](data) {
        // A truncated/corrupt payload makes readU8() return null, producing an
        // unparseable version like "null.null.0". This happens intermittently
        // with MSP corruption / firmware issues and makes every downstream
        // semver comparison throw "Invalid Version". Validate the constructed
        // string and keep the semver-valid default ("0.0.0") otherwise, so the
        // connection logic can detect and abort the handshake cleanly.
        FC.CONFIG.mspProtocolVersion = data.readU8();
        const apiVersion = `${data.readU8()}.${data.readU8()}.0`;
        if (semver.valid(apiVersion)) {
            FC.CONFIG.apiVersion = apiVersion;
        } else {
            console.error(
                `MSP_API_VERSION: received invalid version "${apiVersion}" - possible MSP corruption / firmware issue`,
            );
        }
    },

    [MSPCodes.MSP_FC_VARIANT](data) {
        let fcVariantIdentifier = "";
        for (let i = 0; i < 4; i++) {
            fcVariantIdentifier += String.fromCodePoint(data.readU8());
        }
        FC.CONFIG.flightControllerIdentifier = fcVariantIdentifier;
    },

    [MSPCodes.MSP_FC_VERSION](data) {
        const major = data.readU8();
        if (major < 10) {
            // use the old method (the 3 bytes)
            FC.CONFIG.flightControllerVersion = `${major}.${data.readU8()}.${data.readU8()}`;
        } else {
            // discard the next two bytes
            data.readU16();
            // the version is the text that follows
            FC.CONFIG.flightControllerVersion = this.getText(data);
        }
    },

    [MSPCodes.MSP_BUILD_INFO](data) {
        let buff: number[] = [];
        const dateLength = 11;
        buff = [];

        for (let i = 0; i < dateLength; i++) {
            buff.push(data.readU8());
        }
        buff.push(32); // ascii space

        const timeLength = 8;
        for (let i = 0; i < timeLength; i++) {
            buff.push(data.readU8());
        }
        FC.CONFIG.buildInfo = String.fromCodePoint(...buff);

        const gitRevisionLength = 7;
        buff = [];
        for (let i = 0; i < gitRevisionLength; i++) {
            buff.push(data.readU8());
        }

        FC.CONFIG.gitRevision = String.fromCodePoint(...buff);
        console.log("Fw git rev:", FC.CONFIG.gitRevision);

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            // Numeric ids until processBuildOptions() replaces them with names.
            const optionIds: number[] = [];
            FC.CONFIG.buildOptions = optionIds as unknown as string[];
            let option;
            while ((option = data.readU16())) {
                optionIds.push(option);
            }
            // Humanize the build options
            FC.processBuildOptions();
        }
    },

    [MSPCodes.MSP_BOARD_INFO](data) {
        FC.CONFIG.boardIdentifier = "";

        for (let i = 0; i < 4; i++) {
            FC.CONFIG.boardIdentifier += String.fromCodePoint(data.readU8());
        }

        FC.CONFIG.boardVersion = data.readU16();
        FC.CONFIG.boardType = data.readU8();

        FC.CONFIG.targetCapabilities = data.readU8();
        FC.CONFIG.targetName = this.getText(data);

        FC.CONFIG.boardName = this.getText(data);
        FC.CONFIG.manufacturerId = this.getText(data);
        FC.CONFIG.signature = [];

        for (let i = 0; i < this.SIGNATURE_LENGTH; i++) {
            FC.CONFIG.signature.push(data.readU8());
        }

        FC.CONFIG.mcuTypeId = data.readU8();
        // Introduced in API version 1.42
        FC.CONFIG.configurationState = data.readU8();

        // Introduced in API version 1.43
        FC.CONFIG.sampleRateHz = data.readU16();
        FC.CONFIG.configurationProblems = data.readU32();

        // Refresh the hardware name (it's a calculated field)
        FC.calculateHardwareName();
    },

    [MSPCodes.MSP_NAME](data) {
        let char = 0;
        FC.CONFIG.name = "";
        while ((char = data.readU8()) !== null) {
            FC.CONFIG.name += String.fromCodePoint(char);
        }
    },

    [MSPCodes.MSP2_GET_TEXT](data) {
        // type byte
        const textType = data.readU8();

        switch (textType) {
            case MSP2TextType.PILOT_NAME:
                FC.CONFIG.pilotName = this.getText(data);
                break;
            case MSP2TextType.CRAFT_NAME:
                FC.CONFIG.craftName = this.getText(data);
                break;
            case MSP2TextType.PID_PROFILE_NAME:
                FC.CONFIG.pidProfileNames[FC.CONFIG.profile] = this.getText(data);
                break;
            case MSP2TextType.RATE_PROFILE_NAME:
                FC.CONFIG.rateProfileNames[FC.CONFIG.rateProfile] = this.getText(data);
                break;
            case MSP2TextType.BUILDKEY:
                FC.CONFIG.buildKey = this.getText(data);
                break;
            case MSP2TextType.BATTERY_PROFILE_NAME:
                FC.CONFIG.batteryProfileNames[FC.CONFIG.batteryProfile] = this.getText(data);
                break;
            default:
                console.log("Unsupport text type");
                break;
        }
    },

    [MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES](data) {
        FC.LED_CONFIG_VALUES.brightness = data.readU8();
        FC.LED_CONFIG_VALUES.rainbow_delta = data.readU16();
        FC.LED_CONFIG_VALUES.rainbow_freq = data.readU16();
    },

    [MSPCodes.MSP_CF_SERIAL_CONFIG](data) {
        FC.SERIAL_CONFIG.ports = [];
        const bytesPerPort = 1 + 2 + 1 * 4;

        const serialPortCount = data.byteLength / bytesPerPort;
        for (let i = 0; i < serialPortCount; i++) {
            const serialPort = {
                identifier: data.readU8(),
                functions: this.serialPortFunctionMaskToFunctions(data.readU16()),
                msp_baudrate: this.BAUD_RATES[data.readU8()],
                gps_baudrate: this.BAUD_RATES[data.readU8()],
                telemetry_baudrate: this.BAUD_RATES[data.readU8()],
                blackbox_baudrate: this.BAUD_RATES[data.readU8()],
            };

            FC.SERIAL_CONFIG.ports.push(serialPort);
        }
    },

    [MSPCodes.MSP2_COMMON_SERIAL_CONFIG](data) {
        FC.SERIAL_CONFIG.ports = [];
        const count = data.readU8();
        const portConfigSize = data.remaining() / count;
        for (let ii = 0; ii < count; ii++) {
            const start = data.remaining();
            const serialPort = {
                identifier: data.readU8(),
                functions: this.serialPortFunctionMaskToFunctions(data.readU32()),
                msp_baudrate: this.BAUD_RATES[data.readU8()],
                gps_baudrate: this.BAUD_RATES[data.readU8()],
                telemetry_baudrate: this.BAUD_RATES[data.readU8()],
                blackbox_baudrate: this.BAUD_RATES[data.readU8()],
            };
            FC.SERIAL_CONFIG.ports.push(serialPort);
            while (start - data.remaining() < portConfigSize && data.remaining() > 0) {
                data.readU8();
            }
        }
    },

    [MSPCodes.MSP_SET_CF_SERIAL_CONFIG]() {
        console.log("Serial config saved");
    },

    [MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG]() {
        console.log("Serial config saved (MSPv2)");
    },

    [MSPCodes.MSP_MODE_RANGES](data) {
        FC.MODE_RANGES = []; // empty the array as new data is coming in

        const modeRangeCount = data.byteLength / 4; // 4 bytes per item.

        for (let i = 0; i < modeRangeCount; i++) {
            const modeRange = {
                id: data.readU8(),
                auxChannelIndex: data.readU8(),
                range: {
                    start: 900 + data.readU8() * 25,
                    end: 900 + data.readU8() * 25,
                },
            };
            FC.MODE_RANGES.push(modeRange);
        }
    },

    [MSPCodes.MSP_MODE_RANGES_EXTRA](data) {
        FC.MODE_RANGES_EXTRA = []; // empty the array as new data is coming in

        const modeRangeExtraCount = data.readU8();

        for (let i = 0; i < modeRangeExtraCount; i++) {
            const modeRangeExtra = {
                id: data.readU8(),
                modeLogic: data.readU8(),
                linkedTo: data.readU8(),
            };
            FC.MODE_RANGES_EXTRA.push(modeRangeExtra);
        }
    },

    [MSPCodes.MSP_ADJUSTMENT_RANGES](data) {
        FC.ADJUSTMENT_RANGES = []; // empty the array as new data is coming in

        const bytesPerItem = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_48) ? 10 : 6; // 10 bytes per item if >= V1.48 (adjustmentCenter and adjustmentScale were added), otherwise 6 bytes per item
        const adjustmentRangeCount = data.byteLength / bytesPerItem;

        for (let i = 0; i < adjustmentRangeCount; i++) {
            const adjustmentRange = {
                slotIndex: data.readU8(),
                auxChannelIndex: data.readU8(),
                range: {
                    start: 900 + data.readU8() * 25,
                    end: 900 + data.readU8() * 25,
                },
                adjustmentFunction: data.readU8(),
                auxSwitchChannelIndex: data.readU8(),
                adjustmentCenter: semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_48) ? data.readU16() : 0,
                adjustmentScale: semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_48) ? data.readU16() : 0,
            };
            FC.ADJUSTMENT_RANGES.push(adjustmentRange);
        }
    },

    [MSPCodes.MSP_RX_CONFIG](data) {
        FC.RX_CONFIG.serialrx_provider = data.readU8();
        FC.RX_CONFIG.stick_max = data.readU16();
        FC.RX_CONFIG.stick_center = data.readU16();
        FC.RX_CONFIG.stick_min = data.readU16();
        FC.RX_CONFIG.spektrum_sat_bind = data.readU8();
        FC.RX_CONFIG.rx_min_usec = data.readU16();
        FC.RX_CONFIG.rx_max_usec = data.readU16();
        data.readU8(); // was FC.RX_CONFIG.rcInterpolation
        data.readU8(); // was FC.RX_CONFIG.rcInterpolationInterval
        FC.RX_CONFIG.airModeActivateThreshold = data.readU16();
        FC.RX_CONFIG.rxSpiProtocol = data.readU8();
        FC.RX_CONFIG.rxSpiId = data.readU32();
        FC.RX_CONFIG.rxSpiRfChannelCount = data.readU8();
        FC.RX_CONFIG.fpvCamAngleDegrees = data.readU8();
        data.readU8(); // was FC.RX_CONFIG.rcInterpolationChannels
        data.readU8(); // was FC.RX_CONFIG.rcSmoothingType
        FC.RX_CONFIG.rcSmoothingSetpointCutoff = data.readU8();
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            FC.RX_CONFIG.rcSmoothingThrottleCutoff = data.readU8();
            FC.RX_CONFIG.rcSmoothingAutoFactorThrottle = data.readU8();
        } else {
            FC.RX_CONFIG.rcSmoothingFeedforwardCutoff = data.readU8(); // deprecated in 1.47
            data.readU8(); // was FC.RX_CONFIG.rcSmoothingDerivativeCutoff
        }
        data.readU8(); // was FC.RX_CONFIG.rcSmoothingDerivativeType
        FC.RX_CONFIG.usbCdcHidType = data.readU8();
        FC.RX_CONFIG.rcSmoothingAutoFactor = data.readU8();
        FC.RX_CONFIG.rcSmoothing = data.readU8();

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            const elrsUidLength = 6;
            FC.RX_CONFIG.elrsUid = [];
            for (let i = 0; i < elrsUidLength; i++) {
                FC.RX_CONFIG.elrsUid.push(data.readU8());
            }
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            FC.RX_CONFIG.elrsModelId = data.readU8();
        }
    },

    [MSPCodes.MSP_FAILSAFE_CONFIG](data) {
        FC.FAILSAFE_CONFIG.failsafe_delay = data.readU8();
        FC.FAILSAFE_CONFIG.failsafe_off_delay = data.readU8();
        FC.FAILSAFE_CONFIG.failsafe_throttle = data.readU16();
        FC.FAILSAFE_CONFIG.failsafe_switch_mode = data.readU8();
        FC.FAILSAFE_CONFIG.failsafe_throttle_low_delay = data.readU16();
        FC.FAILSAFE_CONFIG.failsafe_procedure = data.readU8();
    },

    [MSPCodes.MSP_RXFAIL_CONFIG](data) {
        FC.RXFAIL_CONFIG = []; // empty the array as new data is coming in

        const channelCount = data.byteLength / 3;
        for (let i = 0; i < channelCount; i++) {
            const rxfailChannel = {
                mode: data.readU8(),
                value: data.readU16(),
            };
            FC.RXFAIL_CONFIG.push(rxfailChannel);
        }
    },

    [MSPCodes.MSP_ADVANCED_CONFIG](data) {
        FC.PID_ADVANCED_CONFIG.gyro_sync_denom = data.readU8();
        FC.PID_ADVANCED_CONFIG.pid_process_denom = data.readU8();
        FC.PID_ADVANCED_CONFIG.use_unsyncedPwm = data.readU8();
        FC.PID_ADVANCED_CONFIG.fast_pwm_protocol = EscProtocols.ReorderPwmProtocols(
            FC.CONFIG.apiVersion,
            data.readU8(),
        );
        FC.PID_ADVANCED_CONFIG.motor_pwm_rate = data.readU16();
        FC.PID_ADVANCED_CONFIG.motorIdle = data.readU16() / 100;
        data.readU8(); // gyroUse32Khz is not supported
        // Introduced in 1.42
        FC.PID_ADVANCED_CONFIG.motorPwmInversion = data.readU8();
        FC.SENSOR_ALIGNMENT.gyro_to_use = data.readU8(); // We don't want to double up on storing this state
        FC.PID_ADVANCED_CONFIG.gyroHighFsr = data.readU8();
        FC.PID_ADVANCED_CONFIG.gyroMovementCalibThreshold = data.readU8();
        FC.PID_ADVANCED_CONFIG.gyroCalibDuration = data.readU16();
        FC.PID_ADVANCED_CONFIG.gyroOffsetYaw = data.readU16();
        FC.PID_ADVANCED_CONFIG.gyroCheckOverflow = data.readU8();
        FC.PID_ADVANCED_CONFIG.debugMode = data.readU8();
        FC.PID_ADVANCED_CONFIG.debugModeCount = data.readU8();
    },

    [MSPCodes.MSP_FILTER_CONFIG](data) {
        FC.FILTER_CONFIG.gyro_lowpass_hz = data.readU8();
        FC.FILTER_CONFIG.dterm_lowpass_hz = data.readU16();
        FC.FILTER_CONFIG.yaw_lowpass_hz = data.readU16();
        FC.FILTER_CONFIG.gyro_notch_hz = data.readU16();
        FC.FILTER_CONFIG.gyro_notch_cutoff = data.readU16();
        FC.FILTER_CONFIG.dterm_notch_hz = data.readU16();
        FC.FILTER_CONFIG.dterm_notch_cutoff = data.readU16();
        FC.FILTER_CONFIG.gyro_notch2_hz = data.readU16();
        FC.FILTER_CONFIG.gyro_notch2_cutoff = data.readU16();
        FC.FILTER_CONFIG.dterm_lowpass_type = data.readU8();
        FC.FILTER_CONFIG.gyro_hardware_lpf = data.readU8();
        data.readU8(); // gyro_32khz_hardware_lpf not used
        FC.FILTER_CONFIG.gyro_lowpass_hz = data.readU16();
        FC.FILTER_CONFIG.gyro_lowpass2_hz = data.readU16();
        FC.FILTER_CONFIG.gyro_lowpass_type = data.readU8();
        FC.FILTER_CONFIG.gyro_lowpass2_type = data.readU8();
        FC.FILTER_CONFIG.dterm_lowpass2_hz = data.readU16();
        FC.FILTER_CONFIG.gyro_32khz_hardware_lpf = 0;
        FC.FILTER_CONFIG.dterm_lowpass2_type = data.readU8();
        FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = data.readU16();
        FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = data.readU16();
        FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = data.readU16();
        FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz = data.readU16();
        // Introduced in 1.42
        FC.FILTER_CONFIG.dyn_notch_range = data.readU8();
        FC.FILTER_CONFIG.dyn_notch_width_percent = data.readU8();
        FC.FILTER_CONFIG.dyn_notch_q = data.readU16();
        FC.FILTER_CONFIG.dyn_notch_min_hz = data.readU16();

        FC.FILTER_CONFIG.gyro_rpm_notch_harmonics = data.readU8();
        FC.FILTER_CONFIG.gyro_rpm_notch_min_hz = data.readU8();
        // Introduced in 1.43
        FC.FILTER_CONFIG.dyn_notch_max_hz = data.readU16();
        // Introduced in 1.44
        FC.FILTER_CONFIG.dyn_lpf_curve_expo = data.readU8();
        FC.FILTER_CONFIG.dyn_notch_count = data.readU8();
        // Introduced in 1.48
        if (data.remaining() >= 7) {
            FC.FILTER_CONFIG.gyro_rpm_notch_fade_range_hz = data.readU16();
            FC.FILTER_CONFIG.gyro_rpm_notch_q = data.readU16();
            FC.FILTER_CONFIG.gyro_rpm_notch_weights = [];
            for (let i = 0; i < 3; i++) {
                FC.FILTER_CONFIG.gyro_rpm_notch_weights.push(data.readU8());
            }
        }
    },

    [MSPCodes.MSP_SET_PID_ADVANCED]() {
        console.log("Advanced PID settings saved");
        FC.ADVANCED_TUNING_ACTIVE = { ...FC.ADVANCED_TUNING };
    },

    [MSPCodes.MSP_PID_ADVANCED](data) {
        FC.ADVANCED_TUNING.rollPitchItermIgnoreRate = data.readU16();
        FC.ADVANCED_TUNING.yawItermIgnoreRate = data.readU16();
        FC.ADVANCED_TUNING.yaw_p_limit = data.readU16();
        FC.ADVANCED_TUNING.deltaMethod = data.readU8();
        FC.ADVANCED_TUNING.vbatPidCompensation = data.readU8();
        FC.ADVANCED_TUNING.feedforwardTransition = data.readU8();
        FC.ADVANCED_TUNING.dtermSetpointWeight = data.readU8();
        FC.ADVANCED_TUNING.toleranceBand = data.readU8();
        FC.ADVANCED_TUNING.toleranceBandReduction = data.readU8();
        FC.ADVANCED_TUNING.itermThrottleGain = data.readU8();
        FC.ADVANCED_TUNING.pidMaxVelocity = data.readU16();
        FC.ADVANCED_TUNING.pidMaxVelocityYaw = data.readU16();
        FC.ADVANCED_TUNING.levelAngleLimit = data.readU8();
        FC.ADVANCED_TUNING.levelSensitivity = data.readU8();
        FC.ADVANCED_TUNING.itermThrottleThreshold = data.readU16();
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            FC.ADVANCED_TUNING.antiGravityGain = data.readU16();
        } else {
            FC.ADVANCED_TUNING.itermAcceleratorGain = data.readU16();
        }

        FC.ADVANCED_TUNING.dtermSetpointWeight = data.readU16();
        FC.ADVANCED_TUNING.itermRotation = data.readU8();
        FC.ADVANCED_TUNING.smartFeedforward = data.readU8();
        FC.ADVANCED_TUNING.itermRelax = data.readU8();
        FC.ADVANCED_TUNING.itermRelaxType = data.readU8();
        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_48)) {
            FC.ADVANCED_TUNING.absoluteControlGain = data.readU8();
        } else {
            data.readU8();
        }
        FC.ADVANCED_TUNING.throttleBoost = data.readU8();
        FC.ADVANCED_TUNING.acroTrainerAngleLimit = data.readU8();
        FC.ADVANCED_TUNING.feedforwardRoll = data.readU16();
        FC.ADVANCED_TUNING.feedforwardPitch = data.readU16();
        FC.ADVANCED_TUNING.feedforwardYaw = data.readU16();
        FC.ADVANCED_TUNING.antiGravityMode = data.readU8();

        FC.ADVANCED_TUNING.dMaxRoll = data.readU8();
        FC.ADVANCED_TUNING.dMaxPitch = data.readU8();
        FC.ADVANCED_TUNING.dMaxYaw = data.readU8();
        FC.ADVANCED_TUNING.dMaxGain = data.readU8();
        FC.ADVANCED_TUNING.dMaxAdvance = data.readU8();
        // No Configurator UI for these; round-tripped as-is so saving other PID_ADVANCED
        // fields doesn't reset a value still active on firmware older than 2026.12.0.
        FC.ADVANCED_TUNING.useIntegratedYaw = data.readU8();
        FC.ADVANCED_TUNING.integratedYawRelax = data.readU8();

        // Introduced in 1.42
        FC.ADVANCED_TUNING.itermRelaxCutoff = data.readU8();

        // Introduced in 1.43
        FC.ADVANCED_TUNING.motorOutputLimit = data.readU8();
        FC.ADVANCED_TUNING.autoProfileCellCount = data.read8();
        FC.ADVANCED_TUNING.idleMinRpm = data.readU8();

        // Introduced in 1.44
        FC.ADVANCED_TUNING.feedforward_averaging = data.readU8();
        FC.ADVANCED_TUNING.feedforward_smooth_factor = data.readU8();
        FC.ADVANCED_TUNING.feedforward_boost = data.readU8();
        FC.ADVANCED_TUNING.feedforward_max_rate_limit = data.readU8();
        FC.ADVANCED_TUNING.feedforward_jitter_factor = data.readU8();
        FC.ADVANCED_TUNING.vbat_sag_compensation = data.readU8();
        FC.ADVANCED_TUNING.thrustLinearization = data.readU8();

        // Introduced in 1.45
        FC.ADVANCED_TUNING.tpaMode = data.readU8();
        FC.ADVANCED_TUNING.tpaRate = Number.parseFloat((data.readU8() / 100).toFixed(2));
        FC.ADVANCED_TUNING.tpaBreakpoint = data.readU16();

        FC.ADVANCED_TUNING_ACTIVE = { ...FC.ADVANCED_TUNING };
    },

    [MSPCodes.MSP_SENSOR_CONFIG](data) {
        FC.SENSOR_CONFIG.acc_hardware = data.readU8();
        FC.SENSOR_CONFIG.baro_hardware = data.readU8();
        FC.SENSOR_CONFIG.mag_hardware = data.readU8();
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            FC.SENSOR_CONFIG.sonar_hardware = data.readU8();
        }
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            FC.SENSOR_CONFIG.opticalflow_hardware = data.readU8();
        }
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_49)) {
            FC.SENSOR_CONFIG.pitot_hardware = data.readU8();
        }
    },

    [MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE](data) {
        FC.SENSOR_CONFIG_ACTIVE.gyro_hardware = data.readU8();
        FC.SENSOR_CONFIG_ACTIVE.acc_hardware = data.readU8();
        FC.SENSOR_CONFIG_ACTIVE.baro_hardware = data.readU8();
        FC.SENSOR_CONFIG_ACTIVE.mag_hardware = data.readU8();
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            FC.SENSOR_CONFIG_ACTIVE.sonar_hardware = data.readU8();
        }
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            FC.SENSOR_CONFIG_ACTIVE.opticalflow_hardware = data.readU8();
        }
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_49)) {
            FC.SENSOR_CONFIG_ACTIVE.pitot_hardware = data.readU8();
        }
    },

    [MSPCodes.MSP2_MCU_INFO](data) {
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            FC.MCU_INFO = {
                id: data.readU8(),
                name: this.getText(data),
            };
        }
    },

    [MSPCodes.MSP2_GYRO_SENSOR](data) {
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            FC.GYRO_SENSOR.gyro_count = data.readU8();
            for (let i = 0; i < FC.GYRO_SENSOR.gyro_count; i++) {
                FC.GYRO_SENSOR.gyro_hardware[i] = data.readU8();
            }
        }
    },

    [MSPCodes.MSP_LED_STRIP_CONFIG](data) {
        FC.LED_STRIP = [];

        const ledCount = (data.byteLength - 2) / 4;

        // The 32 bit config of each LED contains the following in LSB:
        // +----------------------------------------------------------------------------------------------------------+
        // | Directions - 6 bit | Color ID - 4 bit | Overlays - 10 bit | Function ID - 4 bit  | X - 4 bit | Y - 4 bit |
        // +----------------------------------------------------------------------------------------------------------+
        // According to betaflight/src/main/msp/msp.c
        // API 1.41 - add indicator for advanced profile support and the current profile selection
        // 0 = basic ledstrip available
        // 1 = advanced ledstrip available
        // Following byte is the current LED profile

        //Before API_VERSION_1_46 Parameters were 4 bit and Overlays 6 bit

        const layout = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46) ? LED_MASK_LAYOUT : LED_MASK_LAYOUT_PRE_1_46;
        if (layout === LED_MASK_LAYOUT_PRE_1_46) {
            ledOverlayLetters = ledOverlayLetters.filter((x) => x !== "y"); //remove rainbow because it's only supported after API 1.46
        }

        for (let i = 0; i < ledCount; i++) {
            FC.LED_STRIP.push(decodeLedMask(data.readU32(), layout));
        }
    },

    [MSPCodes.MSP_SET_LED_STRIP_CONFIG]() {
        console.log("Led strip config saved");
    },

    [MSPCodes.MSP_LED_COLORS](data) {
        FC.LED_COLORS = [];

        const ledcolorCount = data.byteLength / 4;

        for (let i = 0; i < ledcolorCount; i++) {
            const color = {
                h: data.readU16(),
                s: data.readU8(),
                v: data.readU8(),
            };
            FC.LED_COLORS.push(color);
        }
    },

    [MSPCodes.MSP_SET_LED_COLORS]() {
        console.log("Led strip colors saved");
    },

    [MSPCodes.MSP_LED_STRIP_MODECOLOR](data) {
        FC.LED_MODE_COLORS = [];

        const colorCount = data.byteLength / 3;

        for (let i = 0; i < colorCount; i++) {
            const modeColor = {
                mode: data.readU8(),
                direction: data.readU8(),
                color: data.readU8(),
            };
            FC.LED_MODE_COLORS.push(modeColor);
        }
    },

    [MSPCodes.MSP_SET_LED_STRIP_MODECOLOR]() {
        console.log("Led strip mode colors saved");
    },

    [MSPCodes.MSP_DATAFLASH_SUMMARY](data) {
        let flags = 0;
        if (data.byteLength >= 13) {
            flags = data.readU8();
            FC.DATAFLASH.ready = (flags & 1) != 0;
            FC.DATAFLASH.supported = (flags & 2) != 0;
            FC.DATAFLASH.sectors = data.readU32();
            FC.DATAFLASH.totalSize = data.readU32();
            FC.DATAFLASH.usedSize = data.readU32();
        } else {
            // Firmware version too old to support MSP_DATAFLASH_SUMMARY
            FC.DATAFLASH.ready = false;
            FC.DATAFLASH.supported = false;
            FC.DATAFLASH.sectors = 0;
            FC.DATAFLASH.totalSize = 0;
            FC.DATAFLASH.usedSize = 0;
        }
    },

    [MSPCodes.MSP_DATAFLASH_READ]: NOTHING_TO_DO,

    [MSPCodes.MSP_DATAFLASH_ERASE]() {
        console.log("Data flash erase begun...");
    },

    [MSPCodes.MSP_SDCARD_SUMMARY](data) {
        let flags = 0;
        flags = data.readU8();

        FC.SDCARD.supported = (flags & 0x01) != 0;
        FC.SDCARD.state = data.readU8();
        FC.SDCARD.filesystemLastError = data.readU8();
        FC.SDCARD.freeSizeKB = data.readU32();
        FC.SDCARD.totalSizeKB = data.readU32();
    },

    [MSPCodes.MSP_BLACKBOX_CONFIG](data) {
        FC.BLACKBOX.supported = (data.readU8() & 1) != 0;
        FC.BLACKBOX.blackboxDevice = data.readU8();
        FC.BLACKBOX.blackboxRateNum = data.readU8();
        FC.BLACKBOX.blackboxRateDenom = data.readU8();
        FC.BLACKBOX.blackboxPDenom = data.readU16();

        // Introduced in API version 1.44
        FC.BLACKBOX.blackboxSampleRate = data.readU8();

        // Introduced in API version 1.45
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            FC.BLACKBOX.blackboxDisabledMask = data.readU32();
        }
    },

    [MSPCodes.MSP_SET_BLACKBOX_CONFIG]() {
        console.log("Blackbox config saved");
    },

    [MSPCodes.MSP_VTX_CONFIG](data) {
        FC.VTX_CONFIG.vtx_type = data.readU8();
        FC.VTX_CONFIG.vtx_band = data.readU8();
        FC.VTX_CONFIG.vtx_channel = data.readU8();
        FC.VTX_CONFIG.vtx_power = data.readU8();
        FC.VTX_CONFIG.vtx_pit_mode = data.readU8() != 0;
        FC.VTX_CONFIG.vtx_frequency = data.readU16();
        FC.VTX_CONFIG.vtx_device_ready = data.readU8() != 0;
        FC.VTX_CONFIG.vtx_low_power_disarm = data.readU8();

        // Introduced in API version 1.42
        FC.VTX_CONFIG.vtx_pit_mode_frequency = data.readU16();
        FC.VTX_CONFIG.vtx_table_available = data.readU8() != 0;
        FC.VTX_CONFIG.vtx_table_bands = data.readU8();
        FC.VTX_CONFIG.vtx_table_channels = data.readU8();
        FC.VTX_CONFIG.vtx_table_powerlevels = data.readU8();
        FC.VTX_CONFIG.vtx_table_clear = false;
    },

    [MSPCodes.MSP_SET_VTX_CONFIG]() {
        console.log("VTX config sent");
    },

    [MSPCodes.MSP_VTXTABLE_BAND](data) {
        FC.VTXTABLE_BAND.vtxtable_band_number = data.readU8();

        const bandNameLength = data.readU8();
        FC.VTXTABLE_BAND.vtxtable_band_name = "";
        for (let i = 0; i < bandNameLength; i++) {
            FC.VTXTABLE_BAND.vtxtable_band_name += String.fromCodePoint(data.readU8());
        }

        FC.VTXTABLE_BAND.vtxtable_band_letter = String.fromCodePoint(data.readU8());
        FC.VTXTABLE_BAND.vtxtable_band_is_factory_band = data.readU8() != 0;

        const bandFrequenciesLength = data.readU8();
        FC.VTXTABLE_BAND.vtxtable_band_frequencies = [];
        for (let i = 0; i < bandFrequenciesLength; i++) {
            FC.VTXTABLE_BAND.vtxtable_band_frequencies.push(data.readU16());
        }
    },

    [MSPCodes.MSP_SET_VTXTABLE_BAND]() {
        console.log("VTX band sent");
    },

    [MSPCodes.MSP_VTXTABLE_POWERLEVEL](data) {
        FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_number = data.readU8();
        FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_value = data.readU16();

        const powerLabelLength = data.readU8();
        FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label = "";
        for (let i = 0; i < powerLabelLength; i++) {
            FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label += String.fromCodePoint(data.readU8());
        }
    },

    [MSPCodes.MSP_SET_SIMPLIFIED_TUNING]() {
        console.log("Tuning Sliders sent");
    },

    [MSPCodes.MSP_SIMPLIFIED_TUNING](data) {
        MspHelper.readPidSliderSettings(data);
        MspHelper.readDtermFilterSliderSettings(data);
        MspHelper.readGyroFilterSliderSettings(data);
    },

    [MSPCodes.MSP_CALCULATE_SIMPLIFIED_PID](data) {
        if (FC.TUNING_SLIDERS.slider_pids_mode > 0) {
            FC.PIDS[0][0] = data.readU8();
            FC.PIDS[0][1] = data.readU8();
            FC.PIDS[0][2] = data.readU8();
            FC.ADVANCED_TUNING.dMaxRoll = data.readU8();
            FC.ADVANCED_TUNING.feedforwardRoll = data.readU16();

            FC.PIDS[1][0] = data.readU8();
            FC.PIDS[1][1] = data.readU8();
            FC.PIDS[1][2] = data.readU8();
            FC.ADVANCED_TUNING.dMaxPitch = data.readU8();
            FC.ADVANCED_TUNING.feedforwardPitch = data.readU16();
        }

        if (FC.TUNING_SLIDERS.slider_pids_mode > 1) {
            FC.PIDS[2][0] = data.readU8();
            FC.PIDS[2][1] = data.readU8();
            FC.PIDS[2][2] = data.readU8();
            FC.ADVANCED_TUNING.dMaxYaw = data.readU8();
            FC.ADVANCED_TUNING.feedforwardYaw = data.readU16();
        }
    },

    [MSPCodes.MSP_CALCULATE_SIMPLIFIED_GYRO](data) {
        MspHelper.readGyroFilterSliderSettings(data);
    },

    [MSPCodes.MSP_CALCULATE_SIMPLIFIED_DTERM](data) {
        MspHelper.readDtermFilterSliderSettings(data);
    },

    [MSPCodes.MSP_VALIDATE_SIMPLIFIED_TUNING](data) {
        FC.TUNING_SLIDERS.slider_pids_valid = data.readU8();
        FC.TUNING_SLIDERS.slider_gyro_valid = data.readU8();
        FC.TUNING_SLIDERS.slider_dterm_valid = data.readU8();
    },

    [MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL]() {
        console.log("VTX powerlevel sent");
    },

    [MSPCodes.MSP_SET_MODE_RANGE]() {
        console.log("Mode range saved");
    },

    [MSPCodes.MSP_SET_ADJUSTMENT_RANGE]() {
        console.log("Adjustment range saved");
    },

    [MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG]() {
        console.log("Board alignment saved");
    },

    [MSPCodes.MSP_PID_CONTROLLER](data) {
        FC.PID.controller = data.readU8();
    },

    [MSPCodes.MSP_SET_PID_CONTROLLER]() {
        console.log("PID controller changed");
    },

    [MSPCodes.MSP_SET_LOOP_TIME]() {
        console.log("Looptime saved");
    },

    [MSPCodes.MSP_SET_ARMING_CONFIG]() {
        console.log("Arming config saved");
    },

    [MSPCodes.MSP_SET_RESET_CURR_PID]() {
        console.log("Current PID profile reset");
    },

    [MSPCodes.MSP_SET_MOTOR_3D_CONFIG]() {
        console.log("3D settings saved");
    },

    [MSPCodes.MSP_SET_MIXER_CONFIG]() {
        console.log("Mixer config saved");
    },

    [MSPCodes.MSP_SET_RC_DEADBAND]() {
        console.log("Rc controls settings saved");
    },

    [MSPCodes.MSP_SET_SENSOR_ALIGNMENT]() {
        console.log("Sensor alignment saved");
    },

    [MSPCodes.MSP_SET_RX_CONFIG]() {
        console.log("Rx config saved");
    },

    [MSPCodes.MSP_SET_RXFAIL_CONFIG]() {
        console.log("Rxfail config saved");
    },

    [MSPCodes.MSP_SET_FAILSAFE_CONFIG]() {
        console.log("Failsafe config saved");
    },

    [MSPCodes.MSP_OSD_CANVAS](data) {
        // Applied to the grid size tables by OSD.applyCanvas after MSP_OSD_CONFIG has shown which OSD device, video system in use.
        const cols = data.readU8();
        const rows = data.readU8();
        if (cols > 0 && rows > 0) {
            osdData().canvas = { cols, rows };
            console.log(`Canvas ${cols} x ${rows}`);
        } else {
            console.log("OSD canvas not reported");
        }
    },

    [MSPCodes.MSP_SET_OSD_CANVAS]() {
        console.log("OSD Canvas config set");
    },

    [MSPCodes.MSP_OSD_CONFIG]: NOTHING_TO_DO,

    [MSPCodes.MSP_SET_OSD_CONFIG]() {
        console.log("OSD config set");
    },

    [MSPCodes.MSP_OSD_CHAR_READ]: NOTHING_TO_DO,

    [MSPCodes.MSP_OSD_CHAR_WRITE]() {
        console.log("OSD char uploaded");
    },

    [MSPCodes.MSP_SET_NAME]() {
        console.log("Name set");
    },

    [MSPCodes.MSP2_SET_TEXT]() {
        console.log("Text set");
    },

    [MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES]: NOTHING_TO_DO,

    [MSPCodes.MSP_SET_FILTER_CONFIG]: NOTHING_TO_DO,

    [MSPCodes.MSP_SET_ADVANCED_CONFIG]() {
        console.log("Advanced config parameters set");
    },

    [MSPCodes.MSP_SET_SENSOR_CONFIG]() {
        console.log("Sensor config parameters set");
    },

    [MSPCodes.MSP_COPY_PROFILE]() {
        console.log("Copy profile");
    },

    [MSPCodes.MSP_ARMING_DISABLE]() {
        console.log("Arming disable");
    },

    [MSPCodes.MSP_SET_RTC]() {
        console.log("Real time clock set");
    },

    [MSPCodes.MSP2_SET_MOTOR_OUTPUT_REORDERING]() {
        console.log("Motor output reordering set");
    },

    [MSPCodes.MSP2_SEND_DSHOT_COMMAND]() {
        console.log("DSHOT command sent");
    },

    [MSPCodes.MSP_MULTIPLE_MSP](data, dataHandler) {
        let hasReturnedSomeCommand = false; // To avoid infinite loops

        while (data.offset < data.byteLength) {
            hasReturnedSomeCommand = true;

            // The FC answers at most the commands crunch() queued in mspMultipleCache.
            const command = this.mspMultipleCache.shift()!;
            const payloadSize = data.readU8();

            if (payloadSize != 0) {
                // crcError/unsupported were absent (undefined) here; false/0 read the same.
                const currentDataHandler: MspFrame = {
                    code: command,
                    dataView: new MspDataView(data.buffer, data.offset, payloadSize),
                    crcError: false,
                    unsupported: 0,
                    callbacks: [],
                };

                this.process_data(currentDataHandler);

                data.offset += payloadSize;
            }
        }

        if (hasReturnedSomeCommand) {
            // Send again MSP messages missing, the buffer in the FC was too small
            if (this.mspMultipleCache.length > 0) {
                const partialBuffer = new MspBuffer();
                for (const instance of this.mspMultipleCache) {
                    partialBuffer.push8(instance);
                }

                MSP.send_message(MSPCodes.MSP_MULTIPLE_MSP, partialBuffer, false);

                // The requests that asked for these are answered by the remainder, not by this
                // partial reply; restart their timers so a retry does not re-send the full list.
                for (const entry of dataHandler.callbacks) {
                    if (entry.code === MSPCodes.MSP_MULTIPLE_MSP) {
                        clearTimeout(entry.timer ?? undefined);
                        MSP._arm_timer(entry);
                    }
                }
                return KEEP_PENDING;
            }
        } else {
            console.log("MSP Multiple can't process the command");
            this.mspMultipleCache = [];
        }
    },

    [MSPCodes.MSP_WING](data) {
        for (let i = 0; i < 3; i++) {
            FC.WING_CONFIG.s_term[i] = data.readU8();
        }
        for (let i = 0; i < 3; i++) {
            FC.WING_CONFIG.spa_center[i] = data.readU16();
        }
        for (let i = 0; i < 3; i++) {
            FC.WING_CONFIG.spa_width[i] = data.readU16();
        }
        for (let i = 0; i < 3; i++) {
            FC.WING_CONFIG.spa_mode[i] = data.readU8();
        }

        FC.WING_CONFIG.tpa_curve_type = data.readU8();
        FC.WING_CONFIG.tpa_curve_stall_throttle = data.readU8();
        FC.WING_CONFIG.tpa_curve_pid_thr0 = data.readU16();
        FC.WING_CONFIG.tpa_curve_pid_thr100 = data.readU16();
        FC.WING_CONFIG.tpa_curve_expo = data.read8();
        FC.WING_CONFIG.tpa_speed_type = data.readU8();
        FC.WING_CONFIG.tpa_speed_basic_delay = data.readU16();
        FC.WING_CONFIG.tpa_speed_basic_gravity = data.readU16();
        FC.WING_CONFIG.tpa_speed_adv_prop_pitch = data.readU16();
        FC.WING_CONFIG.tpa_speed_adv_mass = data.readU16();
        FC.WING_CONFIG.tpa_speed_adv_drag_k = data.readU16();
        FC.WING_CONFIG.tpa_speed_adv_thrust = data.readU16();
        FC.WING_CONFIG.tpa_speed_max_voltage = data.readU16();
        FC.WING_CONFIG.tpa_speed_pitch_offset = data.read16();
        FC.WING_CONFIG.yaw_type = data.readU8();
        FC.WING_CONFIG.angle_pitch_offset = data.read16();
    },

    [MSPCodes.MSP_SET_WING]: NOTHING_TO_DO,

    // Named settings, read straight off the raw response by useMspSetting rather than
    // decoded into FC state here. Listed so the dispatcher stops reporting them as
    // unknown codes on every probe.
    [MSPCodes.MSP2_CLI_SETTING]: NOTHING_TO_DO,

    [MSPCodes.MSP2_CLI_SETTING_INFO]: NOTHING_TO_DO,
};

// One encoder per MSP request code that carries a payload; crunch dispatches here.
const ENCODERS: Partial<Record<number, Encoder>> = {
    [MSPCodes.MSP_SET_FEATURE_CONFIG](buffer) {
        const featureMask = features().getMask();
        buffer.push32(featureMask);
    },

    [MSPCodes.MSP_SET_BEEPER_CONFIG](buffer) {
        const beeperDisabledMask = beepers("beepers").getDisabledMask();
        buffer.push32(beeperDisabledMask);
        buffer.push8(FC.BEEPER_CONFIG.dshotBeaconTone);
        buffer.push32(beepers("dshotBeaconConditions").getDisabledMask());
    },

    [MSPCodes.MSP_SET_MIXER_CONFIG](buffer) {
        buffer.push8(FC.MIXER_CONFIG.mixer);
        buffer.push8(FC.MIXER_CONFIG.reverseMotorDir);
    },

    [MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG](buffer) {
        buffer
            .push16(FC.BOARD_ALIGNMENT_CONFIG.roll)
            .push16(FC.BOARD_ALIGNMENT_CONFIG.pitch)
            .push16(FC.BOARD_ALIGNMENT_CONFIG.yaw);
    },

    [MSPCodes.MSP_SET_PID_CONTROLLER](buffer) {
        buffer.push8(FC.PID.controller);
    },

    [MSPCodes.MSP_SET_PID](buffer) {
        for (const pid of FC.PIDS) {
            for (let j = 0; j < 3; j++) {
                buffer.push8(Number.parseInt(String(pid[j])));
            }
        }
    },

    [MSPCodes.MSP_SET_RC_TUNING](buffer) {
        buffer
            .push8(Math.round(FC.RC_TUNING.RC_RATE * 100))
            .push8(Math.round(FC.RC_TUNING.RC_EXPO * 100))
            .push8(Math.round(FC.RC_TUNING.roll_rate * 100))
            .push8(Math.round(FC.RC_TUNING.pitch_rate * 100))
            .push8(Math.round(FC.RC_TUNING.yaw_rate * 100));
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            buffer.push8(0);
        } else {
            buffer.push8(Math.round(FC.RC_TUNING.dynamic_THR_PID * 100));
        }
        buffer.push8(Math.round(FC.RC_TUNING.throttle_MID * 100));
        buffer.push8(Math.round(FC.RC_TUNING.throttle_EXPO * 100));
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            buffer.push16(0);
        } else {
            buffer.push16(FC.RC_TUNING.dynamic_THR_breakpoint);
        }
        buffer.push8(Math.round(FC.RC_TUNING.RC_YAW_EXPO * 100));
        buffer.push8(Math.round(FC.RC_TUNING.rcYawRate * 100));
        buffer.push8(Math.round(FC.RC_TUNING.rcPitchRate * 100));
        buffer.push8(Math.round(FC.RC_TUNING.RC_PITCH_EXPO * 100));
        buffer.push8(FC.RC_TUNING.throttleLimitType);
        buffer.push8(FC.RC_TUNING.throttleLimitPercent);

        // Introduced in 1.42
        buffer.push16(FC.RC_TUNING.roll_rate_limit);
        buffer.push16(FC.RC_TUNING.pitch_rate_limit);
        buffer.push16(FC.RC_TUNING.yaw_rate_limit);

        // Introduced in 1.43
        buffer.push8(FC.RC_TUNING.rates_type);

        // Introduced in 1.47
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            buffer.push8(Math.round(FC.RC_TUNING.throttle_HOVER * 100));
        }
    },

    [MSPCodes.MSP_SET_RX_MAP](buffer) {
        for (const channel of FC.RC_MAP) {
            buffer.push8(channel);
        }
    },

    [MSPCodes.MSP_SET_ACC_TRIM](buffer) {
        buffer.push16(FC.CONFIG.accelerometerTrims[0]).push16(FC.CONFIG.accelerometerTrims[1]);
    },

    [MSPCodes.MSP_SET_ARMING_CONFIG](buffer) {
        buffer
            .push8(FC.ARMING_CONFIG.auto_disarm_delay)
            .push8(0) // was disarm_kill_switch
            .push8(FC.ARMING_CONFIG.small_angle);
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            buffer.push8(FC.ARMING_CONFIG.gyro_cal_on_first_arm);
        }
    },

    [MSPCodes.MSP_SET_LOOP_TIME](buffer) {
        buffer.push16(FC.FC_CONFIG.loopTime);
    },

    [MSPCodes.MSP_SET_MISC](buffer) {
        buffer
            .push16(FC.RX_CONFIG.midrc ?? 0)
            .push16(FC.MOTOR_CONFIG.minthrottle)
            .push16(FC.MOTOR_CONFIG.maxthrottle)
            .push16(FC.MOTOR_CONFIG.mincommand)
            .push16(FC.MISC.failsafe_throttle)
            .push8(FC.GPS_CONFIG.provider)
            .push8(FC.MISC.gps_baudrate)
            .push8(FC.GPS_CONFIG.ublox_sbas)
            .push8(FC.MISC.multiwiicurrentoutput)
            .push8(FC.RSSI_CONFIG.channel)
            .push8(FC.MISC.placeholder2)
            .push16(0) // was mag_declination
            .push8(FC.MISC.vbatscale)
            .push8(Math.round(FC.MISC.vbatmincellvoltage * 10))
            .push8(Math.round(FC.MISC.vbatmaxcellvoltage * 10))
            .push8(Math.round(FC.MISC.vbatwarningcellvoltage * 10));
    },

    [MSPCodes.MSP_SET_MOTOR_CONFIG](buffer) {
        buffer
            .push16(FC.MOTOR_CONFIG.minthrottle)
            .push16(FC.MOTOR_CONFIG.maxthrottle)
            .push16(FC.MOTOR_CONFIG.mincommand);

        // Introduced in 1.42
        buffer.push8(FC.MOTOR_CONFIG.motor_poles);
        buffer.push8(FC.MOTOR_CONFIG.use_dshot_telemetry ? 1 : 0);

        // Introduced in 1.49
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_49)) {
            buffer.push16(FC.MOTOR_CONFIG.motor_kv);
        }
    },

    [MSPCodes.MSP_SET_GPS_CONFIG](buffer) {
        buffer
            .push8(FC.GPS_CONFIG.provider)
            .push8(FC.GPS_CONFIG.ublox_sbas)
            .push8(FC.GPS_CONFIG.auto_config)
            .push8(FC.GPS_CONFIG.auto_baud);

        // Introduced in 1.43
        buffer.push8(FC.GPS_CONFIG.home_point_once).push8(FC.GPS_CONFIG.ublox_use_galileo);
    },

    [MSPCodes.MSP_SET_GPS_RESCUE](buffer) {
        buffer
            .push16(FC.GPS_RESCUE.angle)
            .push16(FC.GPS_RESCUE.returnAltitudeM)
            .push16(FC.GPS_RESCUE.descentDistanceM)
            .push16(FC.GPS_RESCUE.groundSpeed)
            .push16(FC.GPS_RESCUE.throttleMin)
            .push16(FC.GPS_RESCUE.throttleMax)
            .push16(FC.GPS_RESCUE.throttleHover)
            .push8(FC.GPS_RESCUE.sanityChecks)
            .push8(FC.GPS_RESCUE.minSats);

        // Introduced in 1.43
        buffer
            .push16(FC.GPS_RESCUE.ascendRate)
            .push16(FC.GPS_RESCUE.descendRate)
            .push8(FC.GPS_RESCUE.allowArmingWithoutFix)
            .push8(FC.GPS_RESCUE.altitudeMode);

        // Introduced in 1.44
        buffer.push16(FC.GPS_RESCUE.minStartDistM);

        // Introduced in 1.46
        buffer.push16(FC.GPS_RESCUE.initialClimbM);
    },

    [MSPCodes.MSP_SET_COMPASS_CONFIG](buffer) {
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            buffer.push16(Math.round(10.0 * Number.parseFloat(String(FC.COMPASS_CONFIG.mag_declination))));
        }
    },

    [MSPCodes.MSP_SET_RSSI_CONFIG](buffer) {
        buffer.push8(FC.RSSI_CONFIG.channel);
    },

    [MSPCodes.MSP_SET_BATTERY_CONFIG](buffer) {
        buffer
            .push8(Math.round(FC.BATTERY_CONFIG.vbatmincellvoltage * 10))
            .push8(Math.round(FC.BATTERY_CONFIG.vbatmaxcellvoltage * 10))
            .push8(Math.round(FC.BATTERY_CONFIG.vbatwarningcellvoltage * 10))
            .push16(FC.BATTERY_CONFIG.capacity)
            .push8(FC.BATTERY_CONFIG.voltageMeterSource)
            .push8(FC.BATTERY_CONFIG.currentMeterSource)
            .push16(Math.round(FC.BATTERY_CONFIG.vbatmincellvoltage * 100))
            .push16(Math.round(FC.BATTERY_CONFIG.vbatmaxcellvoltage * 100))
            .push16(Math.round(FC.BATTERY_CONFIG.vbatwarningcellvoltage * 100));
    },

    [MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG]: NOTHING_TO_DO,

    [MSPCodes.MSP_SET_CURRENT_METER_CONFIG]: NOTHING_TO_DO,

    [MSPCodes.MSP_SET_RX_CONFIG](buffer) {
        buffer
            .push8(FC.RX_CONFIG.serialrx_provider)
            .push16(FC.RX_CONFIG.stick_max)
            .push16(FC.RX_CONFIG.stick_center)
            .push16(FC.RX_CONFIG.stick_min)
            .push8(FC.RX_CONFIG.spektrum_sat_bind)
            .push16(FC.RX_CONFIG.rx_min_usec)
            .push16(FC.RX_CONFIG.rx_max_usec)
            .push8(FC.RX_CONFIG.rcInterpolation)
            .push8(FC.RX_CONFIG.rcInterpolationInterval)
            .push16(FC.RX_CONFIG.airModeActivateThreshold)
            .push8(FC.RX_CONFIG.rxSpiProtocol)
            .push32(FC.RX_CONFIG.rxSpiId)
            .push8(FC.RX_CONFIG.rxSpiRfChannelCount)
            .push8(FC.RX_CONFIG.fpvCamAngleDegrees)
            .push8(FC.RX_CONFIG.rcInterpolationChannels)
            .push8(FC.RX_CONFIG.rcSmoothingType)
            .push8(FC.RX_CONFIG.rcSmoothingSetpointCutoff);
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            buffer.push8(FC.RX_CONFIG.rcSmoothingThrottleCutoff);
            buffer.push8(FC.RX_CONFIG.rcSmoothingAutoFactorThrottle);
        } else {
            buffer.push8(FC.RX_CONFIG.rcSmoothingFeedforwardCutoff);
            buffer.push8(FC.RX_CONFIG.rcSmoothingInputType);
        }
        buffer.push8(FC.RX_CONFIG.rcSmoothingDerivativeType);

        // Introduced in 1.42
        buffer.push8(FC.RX_CONFIG.usbCdcHidType).push8(FC.RX_CONFIG.rcSmoothingAutoFactor);

        // Introduced in 1.44
        buffer.push8(FC.RX_CONFIG.rcSmoothing);

        // Introduced in 1.45
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            FC.RX_CONFIG.elrsUid.forEach((b) => buffer.push8(b));
        }

        // Introduced in 1.47
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            buffer.push8(FC.RX_CONFIG.elrsModelId ?? 0);
        }
    },

    [MSPCodes.MSP_SET_FAILSAFE_CONFIG](buffer) {
        buffer
            .push8(FC.FAILSAFE_CONFIG.failsafe_delay)
            .push8(FC.FAILSAFE_CONFIG.failsafe_off_delay)
            .push16(FC.FAILSAFE_CONFIG.failsafe_throttle)
            .push8(FC.FAILSAFE_CONFIG.failsafe_switch_mode)
            .push16(FC.FAILSAFE_CONFIG.failsafe_throttle_low_delay)
            .push8(FC.FAILSAFE_CONFIG.failsafe_procedure);
    },

    [MSPCodes.MSP_SET_CF_SERIAL_CONFIG](buffer) {
        for (const serialPort of FC.SERIAL_CONFIG.ports) {
            buffer.push8(serialPort.identifier);

            const functionMask = this.serialPortFunctionsToMask(serialPort.functions);
            buffer
                .push16(functionMask)
                .push8(this.BAUD_RATES.indexOf(serialPort.msp_baudrate))
                .push8(this.BAUD_RATES.indexOf(serialPort.gps_baudrate))
                .push8(this.BAUD_RATES.indexOf(serialPort.telemetry_baudrate))
                .push8(this.BAUD_RATES.indexOf(serialPort.blackbox_baudrate));
        }
    },

    [MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG](buffer) {
        buffer.push8(FC.SERIAL_CONFIG.ports.length);

        for (const serialPort of FC.SERIAL_CONFIG.ports) {
            buffer.push8(serialPort.identifier);

            const functionMask = this.serialPortFunctionsToMask(serialPort.functions);
            buffer
                .push32(functionMask)
                .push8(this.BAUD_RATES.indexOf(serialPort.msp_baudrate))
                .push8(this.BAUD_RATES.indexOf(serialPort.gps_baudrate))
                .push8(this.BAUD_RATES.indexOf(serialPort.telemetry_baudrate))
                .push8(this.BAUD_RATES.indexOf(serialPort.blackbox_baudrate));
        }
    },

    [MSPCodes.MSP_SET_MOTOR_3D_CONFIG](buffer) {
        buffer
            .push16(FC.MOTOR_3D_CONFIG.deadband3d_low)
            .push16(FC.MOTOR_3D_CONFIG.deadband3d_high)
            .push16(FC.MOTOR_3D_CONFIG.neutral);
    },

    [MSPCodes.MSP_SET_RC_DEADBAND](buffer) {
        buffer
            .push8(FC.RC_DEADBAND_CONFIG.deadband)
            .push8(FC.RC_DEADBAND_CONFIG.yaw_deadband)
            .push8(FC.RC_DEADBAND_CONFIG.alt_hold_deadband)
            .push16(FC.RC_DEADBAND_CONFIG.deadband3d_throttle);
    },

    [MSPCodes.MSP_SET_SENSOR_ALIGNMENT](buffer) {
        buffer
            .push8(FC.SENSOR_ALIGNMENT.align_gyro)
            .push8(FC.SENSOR_ALIGNMENT.align_acc)
            .push8(FC.SENSOR_ALIGNMENT.align_mag);

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            buffer
                .push8(FC.SENSOR_ALIGNMENT.gyro_enable_mask ?? 0) // replacing gyro_to_use
                .push16(FC.SENSOR_ALIGNMENT.mag_align_roll * 10)
                .push16(FC.SENSOR_ALIGNMENT.mag_align_pitch * 10)
                .push16(FC.SENSOR_ALIGNMENT.mag_align_yaw * 10);
        } else {
            buffer
                .push8(FC.SENSOR_ALIGNMENT.gyro_to_use)
                .push8(FC.SENSOR_ALIGNMENT.gyro_1_align)
                .push8(FC.SENSOR_ALIGNMENT.gyro_2_align);
        }
    },

    [MSPCodes.MSP_SET_ADVANCED_CONFIG](buffer) {
        buffer
            .push8(FC.PID_ADVANCED_CONFIG.gyro_sync_denom)
            .push8(FC.PID_ADVANCED_CONFIG.pid_process_denom)
            .push8(FC.PID_ADVANCED_CONFIG.use_unsyncedPwm)
            .push8(EscProtocols.ReorderPwmProtocols(FC.CONFIG.apiVersion, FC.PID_ADVANCED_CONFIG.fast_pwm_protocol))
            .push16(FC.PID_ADVANCED_CONFIG.motor_pwm_rate)
            .push16(FC.PID_ADVANCED_CONFIG.motorIdle * 100)
            .push8(0); // gyroUse32kHz not used

        // Introduced in 1.42
        buffer
            .push8(FC.PID_ADVANCED_CONFIG.motorPwmInversion)
            .push8(FC.SENSOR_ALIGNMENT.gyro_to_use) // We don't want to double up on storing this state
            .push8(FC.PID_ADVANCED_CONFIG.gyroHighFsr)
            .push8(FC.PID_ADVANCED_CONFIG.gyroMovementCalibThreshold)
            .push16(FC.PID_ADVANCED_CONFIG.gyroCalibDuration)
            .push16(FC.PID_ADVANCED_CONFIG.gyroOffsetYaw)
            .push8(FC.PID_ADVANCED_CONFIG.gyroCheckOverflow)
            .push8(FC.PID_ADVANCED_CONFIG.debugMode);
    },

    [MSPCodes.MSP_SET_FILTER_CONFIG](buffer) {
        buffer
            .push8(FC.FILTER_CONFIG.gyro_lowpass_hz)
            .push16(FC.FILTER_CONFIG.dterm_lowpass_hz)
            .push16(FC.FILTER_CONFIG.yaw_lowpass_hz)
            .push16(FC.FILTER_CONFIG.gyro_notch_hz)
            .push16(FC.FILTER_CONFIG.gyro_notch_cutoff)
            .push16(FC.FILTER_CONFIG.dterm_notch_hz)
            .push16(FC.FILTER_CONFIG.dterm_notch_cutoff)
            .push16(FC.FILTER_CONFIG.gyro_notch2_hz)
            .push16(FC.FILTER_CONFIG.gyro_notch2_cutoff)
            .push8(FC.FILTER_CONFIG.dterm_lowpass_type)
            .push8(FC.FILTER_CONFIG.gyro_hardware_lpf)
            .push8(0) // gyro_32khz_hardware_lpf not used
            .push16(FC.FILTER_CONFIG.gyro_lowpass_hz)
            .push16(FC.FILTER_CONFIG.gyro_lowpass2_hz)
            .push8(FC.FILTER_CONFIG.gyro_lowpass_type)
            .push8(FC.FILTER_CONFIG.gyro_lowpass2_type)
            .push16(FC.FILTER_CONFIG.dterm_lowpass2_hz)
            .push8(FC.FILTER_CONFIG.dterm_lowpass2_type)
            .push16(FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz)
            .push16(FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz)
            .push16(FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz)
            .push16(FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz);

        // Introduced in 1.42
        buffer
            .push8(FC.FILTER_CONFIG.dyn_notch_range)
            .push8(FC.FILTER_CONFIG.dyn_notch_width_percent)
            .push16(FC.FILTER_CONFIG.dyn_notch_q)
            .push16(FC.FILTER_CONFIG.dyn_notch_min_hz)
            .push8(FC.FILTER_CONFIG.gyro_rpm_notch_harmonics)
            .push8(FC.FILTER_CONFIG.gyro_rpm_notch_min_hz);

        // Introduced in 1.43
        buffer.push16(FC.FILTER_CONFIG.dyn_notch_max_hz);

        // Introduced in 1.44
        buffer.push8(FC.FILTER_CONFIG.dyn_lpf_curve_expo).push8(FC.FILTER_CONFIG.dyn_notch_count);

        // Introduced in 1.48
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_48)) {
            buffer.push16(FC.FILTER_CONFIG.gyro_rpm_notch_fade_range_hz).push16(FC.FILTER_CONFIG.gyro_rpm_notch_q);
            for (let i = 0; i < 3; i++) {
                buffer.push8(FC.FILTER_CONFIG.gyro_rpm_notch_weights[i]);
            }
        }
    },

    [MSPCodes.MSP_SET_PID_ADVANCED](buffer) {
        buffer
            .push16(FC.ADVANCED_TUNING.rollPitchItermIgnoreRate)
            .push16(FC.ADVANCED_TUNING.yawItermIgnoreRate)
            .push16(FC.ADVANCED_TUNING.yaw_p_limit)
            .push8(FC.ADVANCED_TUNING.deltaMethod)
            .push8(FC.ADVANCED_TUNING.vbatPidCompensation)
            .push8(FC.ADVANCED_TUNING.feedforwardTransition)
            .push8(Math.min(FC.ADVANCED_TUNING.dtermSetpointWeight, 254))
            .push8(FC.ADVANCED_TUNING.toleranceBand)
            .push8(FC.ADVANCED_TUNING.toleranceBandReduction)
            .push8(FC.ADVANCED_TUNING.itermThrottleGain)
            .push16(FC.ADVANCED_TUNING.pidMaxVelocity)
            .push16(FC.ADVANCED_TUNING.pidMaxVelocityYaw)
            .push8(FC.ADVANCED_TUNING.levelAngleLimit)
            .push8(FC.ADVANCED_TUNING.levelSensitivity)
            .push16(FC.ADVANCED_TUNING.itermThrottleThreshold);

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            buffer.push16(FC.ADVANCED_TUNING.antiGravityGain);
        } else {
            buffer.push16(FC.ADVANCED_TUNING.itermAcceleratorGain);
        }

        buffer
            .push16(FC.ADVANCED_TUNING.dtermSetpointWeight)
            .push8(FC.ADVANCED_TUNING.itermRotation)
            .push8(FC.ADVANCED_TUNING.smartFeedforward)
            .push8(FC.ADVANCED_TUNING.itermRelax)
            .push8(FC.ADVANCED_TUNING.itermRelaxType);
        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_48)) {
            buffer.push8(FC.ADVANCED_TUNING.absoluteControlGain);
        } else {
            buffer.push8(0);
        }
        buffer
            .push8(FC.ADVANCED_TUNING.throttleBoost)
            .push8(FC.ADVANCED_TUNING.acroTrainerAngleLimit)
            .push16(FC.ADVANCED_TUNING.feedforwardRoll)
            .push16(FC.ADVANCED_TUNING.feedforwardPitch)
            .push16(FC.ADVANCED_TUNING.feedforwardYaw)
            .push8(FC.ADVANCED_TUNING.antiGravityMode)
            .push8(FC.ADVANCED_TUNING.dMaxRoll)
            .push8(FC.ADVANCED_TUNING.dMaxPitch)
            .push8(FC.ADVANCED_TUNING.dMaxYaw)
            .push8(FC.ADVANCED_TUNING.dMaxGain)
            .push8(FC.ADVANCED_TUNING.dMaxAdvance)
            .push8(FC.ADVANCED_TUNING.useIntegratedYaw)
            .push8(FC.ADVANCED_TUNING.integratedYawRelax);

        // Introduced in 1.42
        buffer.push8(FC.ADVANCED_TUNING.itermRelaxCutoff);

        // Introduced in 1.43
        buffer
            .push8(FC.ADVANCED_TUNING.motorOutputLimit)
            .push8(FC.ADVANCED_TUNING.autoProfileCellCount)
            .push8(FC.ADVANCED_TUNING.idleMinRpm);

        // Introduced in 1.44
        buffer
            .push8(FC.ADVANCED_TUNING.feedforward_averaging)
            .push8(FC.ADVANCED_TUNING.feedforward_smooth_factor)
            .push8(FC.ADVANCED_TUNING.feedforward_boost)
            .push8(FC.ADVANCED_TUNING.feedforward_max_rate_limit)
            .push8(FC.ADVANCED_TUNING.feedforward_jitter_factor)
            .push8(FC.ADVANCED_TUNING.vbat_sag_compensation)
            .push8(FC.ADVANCED_TUNING.thrustLinearization);

        // Introduced in 1.45
        buffer.push8(FC.ADVANCED_TUNING.tpaMode ?? 0);
        buffer.push8(Math.round(FC.ADVANCED_TUNING.tpaRate * 100));
        buffer.push16(FC.ADVANCED_TUNING.tpaBreakpoint);
    },

    [MSPCodes.MSP_SET_SENSOR_CONFIG](buffer) {
        buffer.push8(FC.SENSOR_CONFIG.acc_hardware);
        buffer.push8(FC.SENSOR_CONFIG.baro_hardware);
        buffer.push8(FC.SENSOR_CONFIG.mag_hardware);
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            buffer.push8(FC.SENSOR_CONFIG.sonar_hardware);
            buffer.push8(FC.SENSOR_CONFIG.opticalflow_hardware);
        }
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_49)) {
            buffer.push8(FC.SENSOR_CONFIG.pitot_hardware);
        }
    },

    [MSPCodes.MSP_SET_NAME](buffer) {
        const MSP_BUFFER_SIZE = 64;
        for (let i = 0; i < FC.CONFIG.name.length && i < MSP_BUFFER_SIZE; i++) {
            buffer.push8(FC.CONFIG.name.codePointAt(i)!);
        }
    },

    [MSPCodes.MSP2_GET_TEXT](buffer, modifierCode) {
        buffer.push8(modifierCode ?? 0);
    },

    [MSPCodes.MSP2_SET_TEXT](buffer, modifierCode) {
        switch (modifierCode) {
            case MSP2TextType.PILOT_NAME:
                this.setText(buffer, modifierCode, FC.CONFIG.pilotName, 16);
                break;
            case MSP2TextType.CRAFT_NAME:
                this.setText(buffer, modifierCode, FC.CONFIG.craftName, 16);
                break;
            case MSP2TextType.PID_PROFILE_NAME:
                this.setText(buffer, modifierCode, FC.CONFIG.pidProfileNames[FC.CONFIG.profile], 8);
                break;
            case MSP2TextType.RATE_PROFILE_NAME:
                this.setText(buffer, modifierCode, FC.CONFIG.rateProfileNames[FC.CONFIG.rateProfile], 8);
                break;
            case MSP2TextType.BATTERY_PROFILE_NAME:
                this.setText(buffer, modifierCode, FC.CONFIG.batteryProfileNames[FC.CONFIG.batteryProfile], 8);
                break;
            default:
                console.log("Unsupported text type");
                break;
        }
    },

    [MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES]: NOTHING_TO_DO,

    [MSPCodes.MSP_SET_BLACKBOX_CONFIG](buffer) {
        buffer
            .push8(FC.BLACKBOX.blackboxDevice)
            .push8(FC.BLACKBOX.blackboxRateNum)
            .push8(FC.BLACKBOX.blackboxRateDenom)
            .push16(FC.BLACKBOX.blackboxPDenom);

        // Introduced in 1.44
        buffer.push8(FC.BLACKBOX.blackboxSampleRate);

        // Introduced in 1.45
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            buffer.push32(FC.BLACKBOX.blackboxDisabledMask);
        }
    },

    [MSPCodes.MSP_COPY_PROFILE](buffer) {
        buffer.push8(FC.COPY_PROFILE.type).push8(FC.COPY_PROFILE.dstProfile).push8(FC.COPY_PROFILE.srcProfile);
    },

    [MSPCodes.MSP_ARMING_DISABLE](buffer) {
        let value;
        if (FC.CONFIG.armingDisabled) {
            value = 1;
        } else {
            value = 0;
        }
        buffer.push8(value);

        if (FC.CONFIG.runawayTakeoffPreventionDisabled) {
            value = 1;
        } else {
            value = 0;
        }
        // This will be ignored if `armingDisabled` is true
        buffer.push8(value);
    },

    [MSPCodes.MSP_SET_RTC](buffer) {
        const now = new Date();

        const timestamp = now.getTime();
        const secs = timestamp / 1000;
        const millis = timestamp % 1000;
        buffer.push32(secs);
        buffer.push16(millis);
    },

    [MSPCodes.MSP_SET_VTX_CONFIG](buffer) {
        buffer
            .push16(FC.VTX_CONFIG.vtx_frequency)
            .push8(FC.VTX_CONFIG.vtx_power)
            .push8(FC.VTX_CONFIG.vtx_pit_mode ? 1 : 0)
            .push8(FC.VTX_CONFIG.vtx_low_power_disarm);

        // Introduced in 1.42
        buffer
            .push16(FC.VTX_CONFIG.vtx_pit_mode_frequency)
            .push8(FC.VTX_CONFIG.vtx_band)
            .push8(FC.VTX_CONFIG.vtx_channel)
            .push16(FC.VTX_CONFIG.vtx_frequency)
            .push8(FC.VTX_CONFIG.vtx_table_bands)
            .push8(FC.VTX_CONFIG.vtx_table_channels)
            .push8(FC.VTX_CONFIG.vtx_table_powerlevels)
            .push8(FC.VTX_CONFIG.vtx_table_clear ? 1 : 0);
    },

    [MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL](buffer) {
        buffer
            .push8(FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_number)
            .push16(FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_value)
            .push8(FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label.length);

        for (let i = 0; i < FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label.length; i++) {
            buffer.push8(FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label.codePointAt(i)!);
        }
    },

    [MSPCodes.MSP_SET_VTXTABLE_BAND](buffer) {
        buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_number);

        buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_name.length);
        for (let i = 0; i < FC.VTXTABLE_BAND.vtxtable_band_name.length; i++) {
            buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_name.codePointAt(i)!);
        }

        if (FC.VTXTABLE_BAND.vtxtable_band_letter != "") {
            buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_letter.codePointAt(0)!);
        } else {
            buffer.push8(" ".codePointAt(0)!);
        }
        buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_is_factory_band ? 1 : 0);

        buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_frequencies.length);
        for (const frequency of FC.VTXTABLE_BAND.vtxtable_band_frequencies) {
            buffer.push16(frequency);
        }
    },

    [MSPCodes.MSP_MULTIPLE_MSP](buffer) {
        while (FC.MULTIPLE_MSP.msp_commands.length > 0) {
            const mspCommand = FC.MULTIPLE_MSP.msp_commands.shift()!;
            this.mspMultipleCache.push(mspCommand);
            buffer.push8(mspCommand);
        }
    },

    [MSPCodes.MSP2_SET_MOTOR_OUTPUT_REORDERING](buffer) {
        buffer.push8(FC.MOTOR_OUTPUT_ORDER.length);
        for (const motorIndex of FC.MOTOR_OUTPUT_ORDER) {
            buffer.push8(motorIndex);
        }
    },

    [MSPCodes.MSP2_SEND_DSHOT_COMMAND](buffer) {
        buffer.push8(1);
    },

    [MSPCodes.MSP_SET_SIMPLIFIED_TUNING](buffer) {
        MspHelper.writePidSliderSettings(buffer);
        MspHelper.writeDtermFilterSliderSettings(buffer);
        MspHelper.writeGyroFilterSliderSettings(buffer);
    },

    [MSPCodes.MSP_CALCULATE_SIMPLIFIED_PID](buffer) {
        MspHelper.writePidSliderSettings(buffer);
    },

    [MSPCodes.MSP_CALCULATE_SIMPLIFIED_GYRO](buffer) {
        MspHelper.writeGyroFilterSliderSettings(buffer);
    },

    [MSPCodes.MSP_CALCULATE_SIMPLIFIED_DTERM](buffer) {
        MspHelper.writeDtermFilterSliderSettings(buffer);
    },

    [MSPCodes.MSP_SET_WING](buffer) {
        for (let i = 0; i < 3; i++) {
            buffer.push8(FC.WING_CONFIG.s_term[i]);
        }
        for (let i = 0; i < 3; i++) {
            buffer.push16(FC.WING_CONFIG.spa_center[i]);
        }
        for (let i = 0; i < 3; i++) {
            buffer.push16(FC.WING_CONFIG.spa_width[i]);
        }
        for (let i = 0; i < 3; i++) {
            buffer.push8(FC.WING_CONFIG.spa_mode[i]);
        }
        buffer
            .push8(FC.WING_CONFIG.tpa_curve_type)
            .push8(FC.WING_CONFIG.tpa_curve_stall_throttle)
            .push16(FC.WING_CONFIG.tpa_curve_pid_thr0)
            .push16(FC.WING_CONFIG.tpa_curve_pid_thr100)
            .push8(FC.WING_CONFIG.tpa_curve_expo)
            .push8(FC.WING_CONFIG.tpa_speed_type)
            .push16(FC.WING_CONFIG.tpa_speed_basic_delay)
            .push16(FC.WING_CONFIG.tpa_speed_basic_gravity)
            .push16(FC.WING_CONFIG.tpa_speed_adv_prop_pitch)
            .push16(FC.WING_CONFIG.tpa_speed_adv_mass)
            .push16(FC.WING_CONFIG.tpa_speed_adv_drag_k)
            .push16(FC.WING_CONFIG.tpa_speed_adv_thrust)
            .push16(FC.WING_CONFIG.tpa_speed_max_voltage)
            .push16(FC.WING_CONFIG.tpa_speed_pitch_offset)
            .push8(FC.WING_CONFIG.yaw_type)
            .push16(FC.WING_CONFIG.angle_pitch_offset);
    },
};

declare global {
    interface Window {
        // This is temporary, till things are moved to modules and every usage of this can
        // create its own instance or re-use the existing one where needed.
        mspHelper: MspHelper;
    }
}

const mspHelper = new MspHelper();
window.mspHelper = mspHelper;
export { mspHelper };
export default MspHelper;
