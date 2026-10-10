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
import { useFlightControllerStore } from "../../stores/fc";
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

// serial_backend's initFeaturesOnConnect (or VirtualFC) replaces the reset value null with these
// instances before any feature or beeper MSP is exchanged.
function features(): Features {
    return useFlightControllerStore().features.features as Features;
}

function beepers(which: "beepers" | "dshotBeaconConditions"): Beepers {
    return useFlightControllerStore().beepers[which] as Beepers;
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
        const fcStore = useFlightControllerStore();
        fcStore.tuningSliders.slider_pids_mode = data.readU8();
        fcStore.tuningSliders.slider_master_multiplier = data.readU8();
        fcStore.tuningSliders.slider_roll_pitch_ratio = data.readU8();
        fcStore.tuningSliders.slider_i_gain = data.readU8();
        fcStore.tuningSliders.slider_d_gain = data.readU8();
        fcStore.tuningSliders.slider_pi_gain = data.readU8();
        fcStore.tuningSliders.slider_dmax_gain = data.readU8();
        fcStore.tuningSliders.slider_feedforward_gain = data.readU8();
        fcStore.tuningSliders.slider_pitch_pi_gain = data.readU8();
        data.readU32(); // reserved for future use
        data.readU32(); // reserved for future use
    }

    static writePidSliderSettings(buffer: MspBuffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.tuningSliders.slider_pids_mode)
            .push8(fcStore.tuningSliders.slider_master_multiplier)
            .push8(fcStore.tuningSliders.slider_roll_pitch_ratio)
            .push8(fcStore.tuningSliders.slider_i_gain)
            .push8(fcStore.tuningSliders.slider_d_gain)
            .push8(fcStore.tuningSliders.slider_pi_gain)
            .push8(fcStore.tuningSliders.slider_dmax_gain)
            .push8(fcStore.tuningSliders.slider_feedforward_gain)
            .push8(fcStore.tuningSliders.slider_pitch_pi_gain)
            .push32(0) // reserved for future use
            .push32(0); // reserved for future use
    }

    static readDtermFilterSliderSettings(data: MspDataView) {
        const fcStore = useFlightControllerStore();
        fcStore.tuningSliders.slider_dterm_filter = data.readU8();
        fcStore.tuningSliders.slider_dterm_filter_multiplier = data.readU8();
        fcStore.filterConfig.dterm_lowpass_hz = data.readU16();
        fcStore.filterConfig.dterm_lowpass2_hz = data.readU16();
        fcStore.filterConfig.dterm_lowpass_dyn_min_hz = data.readU16();
        fcStore.filterConfig.dterm_lowpass_dyn_max_hz = data.readU16();
        data.readU32(); // reserved for future use
        data.readU32(); // reserved for future use
    }

    static writeDtermFilterSliderSettings(buffer: MspBuffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.tuningSliders.slider_dterm_filter)
            .push8(fcStore.tuningSliders.slider_dterm_filter_multiplier)
            .push16(fcStore.filterConfig.dterm_lowpass_hz)
            .push16(fcStore.filterConfig.dterm_lowpass2_hz)
            .push16(fcStore.filterConfig.dterm_lowpass_dyn_min_hz)
            .push16(fcStore.filterConfig.dterm_lowpass_dyn_max_hz)
            .push32(0) // reserved for future use
            .push32(0); // reserved for future use
    }

    static readGyroFilterSliderSettings(data: MspDataView) {
        const fcStore = useFlightControllerStore();
        fcStore.tuningSliders.slider_gyro_filter = data.readU8();
        fcStore.tuningSliders.slider_gyro_filter_multiplier = data.readU8();
        fcStore.filterConfig.gyro_lowpass_hz = data.readU16();
        fcStore.filterConfig.gyro_lowpass2_hz = data.readU16();
        fcStore.filterConfig.gyro_lowpass_dyn_min_hz = data.readU16();
        fcStore.filterConfig.gyro_lowpass_dyn_max_hz = data.readU16();
        data.readU32(); // reserved for future use
        data.readU32(); // reserved for future use
    }

    static writeGyroFilterSliderSettings(buffer: MspBuffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.tuningSliders.slider_gyro_filter)
            .push8(fcStore.tuningSliders.slider_gyro_filter_multiplier)
            .push16(fcStore.filterConfig.gyro_lowpass_hz)
            .push16(fcStore.filterConfig.gyro_lowpass2_hz)
            .push16(fcStore.filterConfig.gyro_lowpass_dyn_min_hz)
            .push16(fcStore.filterConfig.gyro_lowpass_dyn_max_hz)
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
        const fcStore = useFlightControllerStore();
        for (let servoIndex = 0; servoIndex < fcStore.servoConfig.length; servoIndex++) {
            const servoConfiguration = fcStore.servoConfig[servoIndex];
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
        const fcStore = useFlightControllerStore();
        for (let modeRangeIndex = 0; modeRangeIndex < fcStore.modeRanges.length; modeRangeIndex++) {
            const modeRange = fcStore.modeRanges[modeRangeIndex];
            const buffer = new MspBuffer();

            buffer
                .push8(modeRangeIndex)
                .push8(modeRange.id)
                .push8(modeRange.auxChannelIndex)
                .push8((modeRange.range.start - 900) / 25)
                .push8((modeRange.range.end - 900) / 25);

            const modeRangeExtra = fcStore.modeRangesExtra[modeRangeIndex];

            buffer.push8(modeRangeExtra.modeLogic).push8(modeRangeExtra.linkedTo);

            await MSP.promise(MSPCodes.MSP_SET_MODE_RANGE, buffer);
        }
    }

    async sendAdjustmentRanges() {
        const fcStore = useFlightControllerStore();
        for (
            let adjustmentRangeIndex = 0;
            adjustmentRangeIndex < fcStore.adjustmentRanges.length;
            adjustmentRangeIndex++
        ) {
            const adjustmentRange = fcStore.adjustmentRanges[adjustmentRangeIndex];
            const buffer = new MspBuffer();

            buffer
                .push8(adjustmentRangeIndex)
                .push8(adjustmentRange.slotIndex)
                .push8(adjustmentRange.auxChannelIndex)
                .push8((adjustmentRange.range.start - 900) / 25)
                .push8((adjustmentRange.range.end - 900) / 25)
                .push8(adjustmentRange.adjustmentFunction)
                .push8(adjustmentRange.auxSwitchChannelIndex);
            if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_48)) {
                buffer.push16(adjustmentRange.adjustmentCenter || 0).push16(adjustmentRange.adjustmentScale || 0);
            }

            await MSP.promise(MSPCodes.MSP_SET_ADJUSTMENT_RANGE, buffer);
        }
    }

    async sendVoltageConfig() {
        const fcStore = useFlightControllerStore();
        for (const config of fcStore.voltageMeterConfigs) {
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
        const fcStore = useFlightControllerStore();
        for (const config of fcStore.currentMeterConfigs) {
            const buffer = new MspBuffer();

            buffer.push8(config.id).push16(config.scale).push16(config.offset);

            await MSP.promise(MSPCodes.MSP_SET_CURRENT_METER_CONFIG, buffer);
        }
    }

    async sendLedStripConfig() {
        const fcStore = useFlightControllerStore();
        // API 1.46 shifted the colour (18 -> 22) and direction (22 -> 26) fields up in the mask.
        const isNewLayout = semver.gte(fcStore.config.apiVersion, API_VERSION_1_46);
        const colorOffset = isNewLayout ? 22 : 18;
        const directionOffset = isNewLayout ? 26 : 22;

        for (let ledIndex = 0; ledIndex < fcStore.ledStrip.length; ledIndex++) {
            const buffer = new MspBuffer();

            buffer.push(ledIndex);
            buffer.push32(buildLedStripMask(fcStore.ledStrip[ledIndex], colorOffset, directionOffset));

            await MSP.promise(MSPCodes.MSP_SET_LED_STRIP_CONFIG, buffer);
        }
    }

    async sendLedStripColors() {
        const fcStore = useFlightControllerStore();
        if (fcStore.ledColors.length == 0) {
            return;
        }

        const buffer = new MspBuffer();

        for (const color of fcStore.ledColors) {
            buffer.push16(color.h).push8(color.s).push8(color.v);
        }

        await MSP.promise(MSPCodes.MSP_SET_LED_COLORS, buffer);
    }

    async sendLedStripModeColors() {
        const fcStore = useFlightControllerStore();
        for (const modeColor of fcStore.ledModeColors) {
            const buffer = new MspBuffer();

            buffer.push8(modeColor.mode).push8(modeColor.direction).push8(modeColor.color);

            await MSP.promise(MSPCodes.MSP_SET_LED_STRIP_MODECOLOR, buffer);
        }
    }

    sendLedStripConfigValues(onCompleteCallback?: () => void) {
        const fcStore = useFlightControllerStore();
        const buffer = new MspBuffer();
        buffer.push8(fcStore.ledConfigValues.brightness ?? 0);
        buffer.push16(fcStore.ledConfigValues.rainbow_delta ?? 0);
        buffer.push16(fcStore.ledConfigValues.rainbow_freq ?? 0);
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
        const fcStore = useFlightControllerStore();
        let nextFunction = send_next_rxfail_config;

        let rxFailIndex = 0;

        if (fcStore.rxFailConfig.length == 0) {
            onCompleteCallback();
        } else {
            send_next_rxfail_config();
        }

        function send_next_rxfail_config() {
            const rxFail = fcStore.rxFailConfig[rxFailIndex];

            const buffer = new MspBuffer();
            buffer.push8(rxFailIndex).push8(rxFail.mode).push16(rxFail.value);

            // prepare for next iteration
            rxFailIndex++;
            if (rxFailIndex == fcStore.rxFailConfig.length) {
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
        const fcStore = useFlightControllerStore();
        if (
            fcStore.config.armingDisabled === target.armingDisabled &&
            fcStore.config.runawayTakeoffPreventionDisabled === target.runawayTakeoffPreventionDisabled
        ) {
            onCompleteCallback?.();
            return;
        }

        fcStore.config.armingDisabled = target.armingDisabled;
        fcStore.config.runawayTakeoffPreventionDisabled = target.runawayTakeoffPreventionDisabled;

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
        const fcStore = useFlightControllerStore();
        // We need some protection when testing motors on motors tab
        if (!fcStore.config.armingDisabled) {
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
        const fcStore = useFlightControllerStore();
        fcStore.config.cycleTime = data.readU16();
        fcStore.config.i2cError = data.readU16();
        reportI2cErrors(fcStore.config.i2cError);
        fcStore.config.activeSensors = data.readU16();
        fcStore.config.mode = data.readU32();
        fcStore.config.profile = data.readU8();
    },

    [MSPCodes.MSP_STATUS_EX](data) {
        const fcStore = useFlightControllerStore();
        fcStore.config.cycleTime = data.readU16();
        fcStore.config.i2cError = data.readU16();
        reportI2cErrors(fcStore.config.i2cError);
        fcStore.config.activeSensors = data.readU16();
        fcStore.config.mode = data.readU32();
        fcStore.config.profile = data.readU8();
        fcStore.config.cpuload = data.readU16();
        fcStore.config.numProfiles = data.readU8();
        fcStore.config.rateProfile = data.readU8();

        // Read flight mode flags
        const byteCount = data.readU8();
        for (let i = 0; i < byteCount; i++) {
            data.readU8();
        }

        // Read arming disable flags
        fcStore.config.armingDisableCount = data.readU8(); // Flag count
        fcStore.config.armingDisableFlags = data.readU32();

        // Read config state flags - bits to indicate the state of the configuration, reboot required, etc.
        fcStore.config.configStateFlag = data.readU8();

        // Read CPU temp, from API version 1.46
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
            fcStore.config.cpuTemp = data.readU16();
        }

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            fcStore.config.numberOfRateProfiles = data.readU8();
        }

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_48)) {
            fcStore.config.numberOfBatteryProfiles = data.readU8();
            fcStore.config.batteryProfile = data.readU8();
            // Grow batteryProfileNames to match actual profile count from FC
            while (fcStore.config.batteryProfileNames.length < fcStore.config.numberOfBatteryProfiles) {
                fcStore.config.batteryProfileNames.push("");
            }
        }
    },

    [MSPCodes.MSP_RAW_IMU](data) {
        const fcStore = useFlightControllerStore();
        // 2048 for mpu6050, 1024 for mma (times 4 since we don't scale in the firmware)
        // currently we are unable to differentiate between the sensor types, so we are going with 2048
        fcStore.sensorData.accelerometer[0] = data.read16() / 2048;
        fcStore.sensorData.accelerometer[1] = data.read16() / 2048;
        fcStore.sensorData.accelerometer[2] = data.read16() / 2048;

        // properly scaled
        fcStore.sensorData.gyroscope[0] = data.read16() * (4 / 16.4);
        fcStore.sensorData.gyroscope[1] = data.read16() * (4 / 16.4);
        fcStore.sensorData.gyroscope[2] = data.read16() * (4 / 16.4);

        // no clue about scaling factor
        fcStore.sensorData.magnetometer[0] = data.read16();
        fcStore.sensorData.magnetometer[1] = data.read16();
        fcStore.sensorData.magnetometer[2] = data.read16();
    },

    [MSPCodes.MSP_SERVO](data) {
        const fcStore = useFlightControllerStore();
        const servoCount = data.byteLength / 2;
        for (let i = 0; i < servoCount; i++) {
            fcStore.servoData[i] = data.readU16();
        }
    },

    [MSPCodes.MSP_MOTOR](data) {
        const fcStore = useFlightControllerStore();
        const motorCount = data.byteLength / 2;
        for (let i = 0; i < motorCount; i++) {
            fcStore.motorData[i] = data.readU16();
        }
    },

    [MSPCodes.MSP2_MOTOR_OUTPUT_REORDERING](data) {
        const fcStore = useFlightControllerStore();
        fcStore.motorOutputOrder = [];
        const arraySize = data.read8();
        for (let i = 0; i < arraySize; i++) {
            fcStore.motorOutputOrder[i] = data.readU8();
        }
    },

    [MSPCodes.MSP2_GET_VTX_DEVICE_STATUS](data) {
        const fcStore = useFlightControllerStore();
        fcStore.vtxDeviceStatus = null;
        const dataLength = data.byteLength;
        if (dataLength > 0) {
            const vtxDeviceStatusData = new Uint8Array(dataLength);
            for (let i = 0; i < dataLength; i++) {
                vtxDeviceStatusData[i] = data.readU8();
            }
            fcStore.vtxDeviceStatus = vtxDeviceStatusFactory.createVtxDeviceStatus(vtxDeviceStatusData);
        }
    },

    [MSPCodes.MSP_MOTOR_TELEMETRY](data) {
        const fcStore = useFlightControllerStore();
        const telemMotorCount = data.readU8();
        for (let i = 0; i < telemMotorCount; i++) {
            fcStore.motorTelemetryData.rpm[i] = data.readU32(); // RPM
            fcStore.motorTelemetryData.invalidPercent[i] = data.readU16(); // 10000 = 100.00%
            fcStore.motorTelemetryData.temperature[i] = data.readU8(); // degrees celsius
            fcStore.motorTelemetryData.voltage[i] = data.readU16(); // 0.01V per unit
            fcStore.motorTelemetryData.current[i] = data.readU16(); // 0.01A per unit
            fcStore.motorTelemetryData.consumption[i] = data.readU16(); // mAh
        }
    },

    [MSPCodes.MSP_RC](data) {
        const fcStore = useFlightControllerStore();
        fcStore.rc.active_channels = data.byteLength / 2;
        for (let i = 0; i < fcStore.rc.active_channels; i++) {
            fcStore.rc.channels[i] = data.readU16();
        }
    },

    [MSPCodes.MSP_RAW_GPS](data) {
        const fcStore = useFlightControllerStore();
        fcStore.gpsData.fix = data.readU8();
        fcStore.gpsData.numSat = data.readU8();
        fcStore.gpsData.latitude = data.read32();
        fcStore.gpsData.longitude = data.read32();
        fcStore.gpsData.alt = data.readU16();
        fcStore.gpsData.speed = data.readU16();
        fcStore.gpsData.ground_course = data.readU16();
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
            fcStore.gpsData.positionalDop = data.readU16();
        }
    },

    [MSPCodes.MSP_COMP_GPS](data) {
        const fcStore = useFlightControllerStore();
        fcStore.gpsData.distanceToHome = data.readU16();
        fcStore.gpsData.directionToHome = data.readU16();
        fcStore.gpsData.update = data.readU8();
    },

    [MSPCodes.MSP_ATTITUDE](data) {
        const fcStore = useFlightControllerStore();
        fcStore.sensorData.kinematics[0] = data.read16() / 10.0; // x
        fcStore.sensorData.kinematics[1] = data.read16() / 10.0; // y
        fcStore.sensorData.kinematics[2] = data.read16();
    },

    [MSPCodes.MSP_ATTITUDE_QUATERNION](data) {
        const fcStore = useFlightControllerStore();
        fcStore.sensorData.quaternion = {
            w: data.read16() / 32767,
            x: data.read16() / 32767,
            y: data.read16() / 32767,
            z: data.read16() / 32767,
        };
    },

    [MSPCodes.MSP_ALTITUDE](data) {
        const fcStore = useFlightControllerStore();
        fcStore.sensorData.altitude = Number.parseFloat((data.read32() / 100.0).toFixed(2));
    },

    [MSPCodes.MSP_SONAR](data) {
        const fcStore = useFlightControllerStore();
        fcStore.sensorData.sonar = data.read32();
    },

    [MSPCodes.MSP_PITOT](data) {
        const fcStore = useFlightControllerStore();
        fcStore.sensorData.pitot = {
            airspeed: data.read32(),
            diffPressure: data.read32(),
        };
    },

    [MSPCodes.MSP_ANALOG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.analogData.voltage = data.readU8() / 10.0;
        fcStore.analogData.mAhdrawn = data.readU16();
        fcStore.analogData.rssi = data.readU16(); // 0-1023
        fcStore.analogData.amperage = data.read16() / 100; // A
        fcStore.analogData.voltage = data.readU16() / 100;
        fcStore.analogData.last_received_timestamp = performance.now();
    },

    [MSPCodes.MSP_VOLTAGE_METERS](data) {
        const fcStore = useFlightControllerStore();
        fcStore.voltageMeters = [];
        const voltageMeterLength = 2;
        for (let i = 0; i < data.byteLength / voltageMeterLength; i++) {
            const voltageMeter = {
                id: data.readU8(),
                voltage: data.readU8() / 10.0,
            };

            fcStore.voltageMeters.push(voltageMeter);
        }
    },

    [MSPCodes.MSP_CURRENT_METERS](data) {
        const fcStore = useFlightControllerStore();
        fcStore.currentMeters = [];
        const currentMeterLength = 5;
        for (let i = 0; i < data.byteLength / currentMeterLength; i++) {
            const currentMeter = {
                id: data.readU8(),
                mAhDrawn: data.readU16(), // mAh
                amperage: data.readU16() / 1000, // A
            };

            fcStore.currentMeters.push(currentMeter);
        }
    },

    [MSPCodes.MSP_BATTERY_STATE](data) {
        const fcStore = useFlightControllerStore();
        fcStore.batteryState.cellCount = data.readU8();
        fcStore.batteryState.capacity = data.readU16(); // mAh

        fcStore.batteryState.voltage = data.readU8() / 10.0; // V
        fcStore.batteryState.mAhDrawn = data.readU16(); // mAh
        fcStore.batteryState.amperage = data.readU16() / 100; // A
        fcStore.batteryState.batteryState = data.readU8();
        fcStore.batteryState.voltage = data.readU16() / 100;
    },

    [MSPCodes.MSP_VOLTAGE_METER_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.voltageMeterConfigs = [];
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

                fcStore.voltageMeterConfigs.push(voltageMeterConfig);
            }
        }
    },

    [MSPCodes.MSP_CURRENT_METER_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.currentMeterConfigs = [];
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

                fcStore.currentMeterConfigs.push(currentMeterConfig);
            }
        }
    },

    [MSPCodes.MSP_BATTERY_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.batteryConfig.vbatmincellvoltage = data.readU8() / 10; // 10-50
        fcStore.batteryConfig.vbatmaxcellvoltage = data.readU8() / 10; // 10-50
        fcStore.batteryConfig.vbatwarningcellvoltage = data.readU8() / 10; // 10-50
        fcStore.batteryConfig.capacity = data.readU16();
        fcStore.batteryConfig.voltageMeterSource = data.readU8();
        fcStore.batteryConfig.currentMeterSource = data.readU8();
        fcStore.batteryConfig.vbatmincellvoltage = data.readU16() / 100;
        fcStore.batteryConfig.vbatmaxcellvoltage = data.readU16() / 100;
        fcStore.batteryConfig.vbatwarningcellvoltage = data.readU16() / 100;
    },

    [MSPCodes.MSP_SET_BATTERY_CONFIG]() {
        console.log("Battery configuration saved");
    },

    [MSPCodes.MSP_RC_TUNING](data) {
        const fcStore = useFlightControllerStore();
        fcStore.rcTuning.RC_RATE = Number.parseFloat((data.readU8() / 100).toFixed(2));
        fcStore.rcTuning.RC_EXPO = Number.parseFloat((data.readU8() / 100).toFixed(2));
        fcStore.rcTuning.roll_pitch_rate = 0;
        fcStore.rcTuning.roll_rate = Number.parseFloat((data.readU8() / 100).toFixed(2));
        fcStore.rcTuning.pitch_rate = Number.parseFloat((data.readU8() / 100).toFixed(2));
        fcStore.rcTuning.yaw_rate = Number.parseFloat((data.readU8() / 100).toFixed(2));
        if (semver.lt(fcStore.config.apiVersion, API_VERSION_1_45)) {
            fcStore.rcTuning.dynamic_THR_PID = Number.parseFloat((data.readU8() / 100).toFixed(2));
        } else {
            data.readU8();
        }
        fcStore.rcTuning.throttle_MID = Number.parseFloat((data.readU8() / 100).toFixed(2));
        fcStore.rcTuning.throttle_EXPO = Number.parseFloat((data.readU8() / 100).toFixed(2));
        if (semver.lt(fcStore.config.apiVersion, API_VERSION_1_45)) {
            fcStore.rcTuning.dynamic_THR_breakpoint = data.readU16();
        } else {
            data.readU16();
        }
        fcStore.rcTuning.RC_YAW_EXPO = Number.parseFloat((data.readU8() / 100).toFixed(2));
        fcStore.rcTuning.rcYawRate = Number.parseFloat((data.readU8() / 100).toFixed(2));
        fcStore.rcTuning.rcPitchRate = Number.parseFloat((data.readU8() / 100).toFixed(2));
        fcStore.rcTuning.RC_PITCH_EXPO = Number.parseFloat((data.readU8() / 100).toFixed(2));
        fcStore.rcTuning.throttleLimitType = data.readU8();
        fcStore.rcTuning.throttleLimitPercent = data.readU8();
        fcStore.rcTuning.roll_rate_limit = data.readU16();
        fcStore.rcTuning.pitch_rate_limit = data.readU16();
        fcStore.rcTuning.yaw_rate_limit = data.readU16();
        fcStore.rcTuning.rates_type = data.readU8();
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            fcStore.rcTuning.throttle_HOVER = Number.parseFloat((data.readU8() / 100).toFixed(2));
        }
    },

    [MSPCodes.MSP_PID](data) {
        const fcStore = useFlightControllerStore();
        // PID data arrived, we need to scale it and save to appropriate bank / array
        for (let i = 0, needle = 0; i < data.byteLength / 3; i++, needle += 3) {
            // main for loop selecting the pid section
            for (let j = 0; j < 3; j++) {
                fcStore.pidsActive[i][j] = data.readU8();
                fcStore.pids[i][j] = fcStore.pidsActive[i][j];
            }
        }
    },

    [MSPCodes.MSP_ARMING_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.armingConfig.auto_disarm_delay = data.readU8();
        data.readU8(); // was fcStore.armingConfig.auto_disarm_kill_switch
        fcStore.armingConfig.small_angle = data.readU8();
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            fcStore.armingConfig.gyro_cal_on_first_arm = data.readU8();
        }
    },

    [MSPCodes.MSP_LOOP_TIME](data) {
        const fcStore = useFlightControllerStore();
        fcStore.fcConfig.loopTime = data.readU16();
    },

    [MSPCodes.MSP_MISC](data) {
        const fcStore = useFlightControllerStore();
        // 22 bytes
        fcStore.rxConfig.midrc = data.readU16();
        fcStore.motorConfig.minthrottle = data.readU16(); // 0-2000
        fcStore.motorConfig.maxthrottle = data.readU16(); // 0-2000
        fcStore.motorConfig.mincommand = data.readU16(); // 0-2000
        fcStore.misc.failsafe_throttle = data.readU16(); // 1000-2000
        fcStore.gpsConfig.provider = data.readU8();
        fcStore.misc.gps_baudrate = data.readU8();
        fcStore.gpsConfig.ublox_sbas = data.readU8();
        fcStore.misc.multiwiicurrentoutput = data.readU8();
        fcStore.rssiConfig.channel = data.readU8();
        fcStore.misc.placeholder2 = data.readU8();
        data.read16(); // was mag_declination
        fcStore.misc.vbatscale = data.readU8(); // was fcStore.misc.vbatscale - 10-200
        fcStore.misc.vbatmincellvoltage = data.readU8() / 10; // 10-50
        fcStore.misc.vbatmaxcellvoltage = data.readU8() / 10; // 10-50
        fcStore.misc.vbatwarningcellvoltage = data.readU8() / 10;
    },

    [MSPCodes.MSP_MOTOR_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.motorConfig.minthrottle = data.readU16(); // 0-2000
        fcStore.motorConfig.maxthrottle = data.readU16(); // 0-2000
        fcStore.motorConfig.mincommand = data.readU16(); // 0-2000
        fcStore.motorConfig.motor_count = data.readU8();
        fcStore.motorConfig.motor_poles = data.readU8();
        fcStore.motorConfig.use_dshot_telemetry = data.readU8() != 0;
        fcStore.motorConfig.use_esc_sensor = data.readU8() != 0;

        // Introduced in 1.49
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_49)) {
            fcStore.motorConfig.motor_kv = data.readU16();
        }
    },

    [MSPCodes.MSP_COMPASS_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
            fcStore.compassConfig.mag_declination = data.read16() / 10;
        }
    },

    [MSPCodes.MSP_GPS_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.gpsConfig.provider = data.readU8();
        fcStore.gpsConfig.ublox_sbas = data.readU8();
        fcStore.gpsConfig.auto_config = data.readU8();
        fcStore.gpsConfig.auto_baud = data.readU8();

        // Introduced in API version 1.43
        fcStore.gpsConfig.home_point_once = data.readU8();
        fcStore.gpsConfig.ublox_use_galileo = data.readU8();
    },

    [MSPCodes.MSP_GPS_RESCUE](data) {
        const fcStore = useFlightControllerStore();
        fcStore.gpsRescue.angle = data.readU16();
        fcStore.gpsRescue.returnAltitudeM = data.readU16();
        fcStore.gpsRescue.descentDistanceM = data.readU16();
        fcStore.gpsRescue.groundSpeed = data.readU16();
        fcStore.gpsRescue.throttleMin = data.readU16();
        fcStore.gpsRescue.throttleMax = data.readU16();
        fcStore.gpsRescue.throttleHover = data.readU16();
        fcStore.gpsRescue.sanityChecks = data.readU8();
        fcStore.gpsRescue.minSats = data.readU8();

        // Introduced in API version 1.43
        fcStore.gpsRescue.ascendRate = data.readU16();
        fcStore.gpsRescue.descendRate = data.readU16();
        fcStore.gpsRescue.allowArmingWithoutFix = data.readU8();
        fcStore.gpsRescue.altitudeMode = data.readU8();

        // Introduced in API version 1.44
        fcStore.gpsRescue.minStartDistM = data.readU16();

        // Introduced in API version 1.46
        fcStore.gpsRescue.initialClimbM = data.readU16();
    },

    [MSPCodes.MSP_RSSI_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.rssiConfig.channel = data.readU8();
    },

    [MSPCodes.MSP_MOTOR_3D_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.motor3dConfig.deadband3d_low = data.readU16();
        fcStore.motor3dConfig.deadband3d_high = data.readU16();
        fcStore.motor3dConfig.neutral = data.readU16();
    },

    [MSPCodes.MSP_BOXNAMES](data) {
        const fcStore = useFlightControllerStore();
        let buff: number[] = [];
        let char = 0;
        fcStore.auxConfig = []; // empty the array as new data is coming in

        buff = [];
        for (let i = 0; i < data.byteLength; i++) {
            char = data.readU8();
            if (char == 0x3b) {
                // ; (delimeter char)
                fcStore.auxConfig.push(String.fromCodePoint(...buff)); // convert bytes into ASCII and save as strings

                // empty buffer
                buff = [];
            } else {
                buff.push(char);
            }
        }
    },

    [MSPCodes.MSP_PIDNAMES](data) {
        const fcStore = useFlightControllerStore();
        let buff: number[] = [];
        let char = 0;
        fcStore.pidNames = []; // empty the array as new data is coming in

        buff = [];
        for (let i = 0; i < data.byteLength; i++) {
            char = data.readU8();
            if (char == 0x3b) {
                // ; (delimeter char)
                fcStore.pidNames.push(String.fromCodePoint(...buff)); // convert bytes into ASCII and save as strings

                // empty buffer
                buff = [];
            } else {
                buff.push(char);
            }
        }
    },

    [MSPCodes.MSP_BOXIDS](data) {
        const fcStore = useFlightControllerStore();
        fcStore.auxConfigIds = []; // empty the array as new data is coming in

        for (let i = 0; i < data.byteLength; i++) {
            fcStore.auxConfigIds.push(data.readU8());
        }
    },

    [MSPCodes.MSP_SERVO_MIX_RULES]: NOTHING_TO_DO,

    [MSPCodes.MSP_SERVO_CONFIGURATIONS](data) {
        const fcStore = useFlightControllerStore();
        fcStore.servoConfig = []; // empty the array as new data is coming in
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

                fcStore.servoConfig.push(arr);
            }
        }
    },

    [MSPCodes.MSP_RC_DEADBAND](data) {
        const fcStore = useFlightControllerStore();
        fcStore.rcDeadbandConfig.deadband = data.readU8();
        fcStore.rcDeadbandConfig.yaw_deadband = data.readU8();
        fcStore.rcDeadbandConfig.alt_hold_deadband = data.readU8();

        fcStore.rcDeadbandConfig.deadband3d_throttle = data.readU16();
    },

    [MSPCodes.MSP_SENSOR_ALIGNMENT](data) {
        const fcStore = useFlightControllerStore();
        fcStore.sensorAlignment.align_gyro = data.readU8();
        fcStore.sensorAlignment.align_acc = data.readU8();
        fcStore.sensorAlignment.align_mag = data.readU8();
        fcStore.sensorAlignment.gyro_detection_flags = data.readU8();

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            fcStore.sensorAlignment.gyro_enable_mask = data.readU8(); // replacing gyro_to_use
            fcStore.sensorAlignment.mag_align_roll = data.read16() / 10;
            fcStore.sensorAlignment.mag_align_pitch = data.read16() / 10;
            fcStore.sensorAlignment.mag_align_yaw = data.read16() / 10;
        } else {
            fcStore.sensorAlignment.gyro_to_use = data.readU8();
            fcStore.sensorAlignment.gyro_1_align = data.readU8();
            fcStore.sensorAlignment.gyro_2_align = data.readU8();
        }
    },

    [MSPCodes.MSP_DISPLAYPORT]: NOTHING_TO_DO,

    [MSPCodes.MSP_SET_RAW_RC]: NOTHING_TO_DO,

    [MSPCodes.MSP_SET_PID]() {
        const fcStore = useFlightControllerStore();
        console.log("PID settings saved");
        fcStore.pidsActive = fcStore.pids.map((array) => array.slice());
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
        const fcStore = useFlightControllerStore();
        for (let i = 0; i < 8; i++) {
            fcStore.sensorData.debug[i] = data.read16();
        }
    },

    [MSPCodes.MSP_SET_MOTOR]: NOTHING_TO_DO,

    [MSPCodes.MSP_UID](data) {
        const fcStore = useFlightControllerStore();
        fcStore.config.uid[0] = data.readU32();
        fcStore.config.uid[1] = data.readU32();
        fcStore.config.uid[2] = data.readU32();
        fcStore.config.deviceIdentifier =
            fcStore.config.uid[0].toString(16) +
            fcStore.config.uid[1].toString(16) +
            fcStore.config.uid[2].toString(16);
    },

    [MSPCodes.MSP_ACC_TRIM](data) {
        const fcStore = useFlightControllerStore();
        fcStore.config.accelerometerTrims[0] = data.read16(); // pitch
        fcStore.config.accelerometerTrims[1] = data.read16();
    },

    [MSPCodes.MSP_SET_ACC_TRIM]() {
        console.log("Accelerometer trimms saved.");
    },

    [MSPCodes.MSP_GPS_SV_INFO](data) {
        const fcStore = useFlightControllerStore();
        if (data.byteLength > 0) {
            const numCh = data.readU8();

            for (let i = 0; i < numCh; i++) {
                fcStore.gpsData.chn[i] = data.readU8();
                fcStore.gpsData.svid[i] = data.readU8();
                fcStore.gpsData.quality[i] = data.readU8();
                fcStore.gpsData.cno[i] = data.readU8();
            }
        }
    },

    [MSPCodes.MSP_RX_MAP](data) {
        const fcStore = useFlightControllerStore();
        fcStore.rcMap = []; // empty the array as new data is coming in

        for (let i = 0; i < data.byteLength; i++) {
            fcStore.rcMap.push(data.readU8());
        }
    },

    [MSPCodes.MSP_SET_RX_MAP]() {
        console.log("RCMAP saved");
    },

    [MSPCodes.MSP_MIXER_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.mixerConfig.mixer = data.readU8();
        fcStore.mixerConfig.reverseMotorDir = data.readU8();
    },

    [MSPCodes.MSP_FEATURE_CONFIG](data) {
        features().setMask(data.readU32());

        updateTabList(features());
    },

    [MSPCodes.MSP_BEEPER_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        beepers("beepers").setDisabledMask(data.readU32());
        fcStore.beepers.dshotBeaconTone = data.readU8();
        beepers("dshotBeaconConditions").setDisabledMask(data.readU32());
    },

    [MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.boardAlignment.roll = data.read16(); // -180 - 360
        fcStore.boardAlignment.pitch = data.read16(); // -180 - 360
        fcStore.boardAlignment.yaw = data.read16();
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
        const fcStore = useFlightControllerStore();
        // A truncated/corrupt payload makes readU8() return null, producing an
        // unparseable version like "null.null.0". This happens intermittently
        // with MSP corruption / firmware issues and makes every downstream
        // semver comparison throw "Invalid Version". Validate the constructed
        // string and keep the semver-valid default ("0.0.0") otherwise, so the
        // connection logic can detect and abort the handshake cleanly.
        fcStore.config.mspProtocolVersion = data.readU8();
        const apiVersion = `${data.readU8()}.${data.readU8()}.0`;
        if (semver.valid(apiVersion)) {
            fcStore.config.apiVersion = apiVersion;
        } else {
            console.error(
                `MSP_API_VERSION: received invalid version "${apiVersion}" - possible MSP corruption / firmware issue`,
            );
        }
    },

    [MSPCodes.MSP_FC_VARIANT](data) {
        const fcStore = useFlightControllerStore();
        let fcVariantIdentifier = "";
        for (let i = 0; i < 4; i++) {
            fcVariantIdentifier += String.fromCodePoint(data.readU8());
        }
        fcStore.config.flightControllerIdentifier = fcVariantIdentifier;
    },

    [MSPCodes.MSP_FC_VERSION](data) {
        const fcStore = useFlightControllerStore();
        const major = data.readU8();
        if (major < 10) {
            // use the old method (the 3 bytes)
            fcStore.config.flightControllerVersion = `${major}.${data.readU8()}.${data.readU8()}`;
        } else {
            // discard the next two bytes
            data.readU16();
            // the version is the text that follows
            fcStore.config.flightControllerVersion = this.getText(data);
        }
    },

    [MSPCodes.MSP_BUILD_INFO](data) {
        const fcStore = useFlightControllerStore();
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
        fcStore.config.buildInfo = String.fromCodePoint(...buff);

        const gitRevisionLength = 7;
        buff = [];
        for (let i = 0; i < gitRevisionLength; i++) {
            buff.push(data.readU8());
        }

        fcStore.config.gitRevision = String.fromCodePoint(...buff);
        console.log("Fw git rev:", fcStore.config.gitRevision);

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
            // Numeric ids until processBuildOptions() replaces them with names.
            const optionIds: number[] = [];
            fcStore.config.buildOptions = optionIds as unknown as string[];
            let option;
            while ((option = data.readU16())) {
                optionIds.push(option);
            }
            // Humanize the build options
            fcStore.processBuildOptions();
        }
    },

    [MSPCodes.MSP_BOARD_INFO](data) {
        const fcStore = useFlightControllerStore();
        fcStore.config.boardIdentifier = "";

        for (let i = 0; i < 4; i++) {
            fcStore.config.boardIdentifier += String.fromCodePoint(data.readU8());
        }

        fcStore.config.boardVersion = data.readU16();
        fcStore.config.boardType = data.readU8();

        fcStore.config.targetCapabilities = data.readU8();
        fcStore.config.targetName = this.getText(data);

        fcStore.config.boardName = this.getText(data);
        fcStore.config.manufacturerId = this.getText(data);
        fcStore.config.signature = [];

        for (let i = 0; i < this.SIGNATURE_LENGTH; i++) {
            fcStore.config.signature.push(data.readU8());
        }

        fcStore.config.mcuTypeId = data.readU8();
        // Introduced in API version 1.42
        fcStore.config.configurationState = data.readU8();

        // Introduced in API version 1.43
        fcStore.config.sampleRateHz = data.readU16();
        fcStore.config.configurationProblems = data.readU32();

        // Refresh the hardware name (it's a calculated field)
        fcStore.calculateHardwareName();
    },

    [MSPCodes.MSP_NAME](data) {
        const fcStore = useFlightControllerStore();
        let char = 0;
        fcStore.config.name = "";
        while ((char = data.readU8()) !== null) {
            fcStore.config.name += String.fromCodePoint(char);
        }
    },

    [MSPCodes.MSP2_GET_TEXT](data) {
        const fcStore = useFlightControllerStore();
        // type byte
        const textType = data.readU8();

        switch (textType) {
            case MSP2TextType.PILOT_NAME:
                fcStore.config.pilotName = this.getText(data);
                break;
            case MSP2TextType.CRAFT_NAME:
                fcStore.config.craftName = this.getText(data);
                break;
            case MSP2TextType.PID_PROFILE_NAME:
                fcStore.config.pidProfileNames[fcStore.config.profile] = this.getText(data);
                break;
            case MSP2TextType.RATE_PROFILE_NAME:
                fcStore.config.rateProfileNames[fcStore.config.rateProfile] = this.getText(data);
                break;
            case MSP2TextType.BUILDKEY:
                fcStore.config.buildKey = this.getText(data);
                break;
            case MSP2TextType.BATTERY_PROFILE_NAME:
                fcStore.config.batteryProfileNames[fcStore.config.batteryProfile] = this.getText(data);
                break;
            default:
                console.log("Unsupport text type");
                break;
        }
    },

    [MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES](data) {
        const fcStore = useFlightControllerStore();
        fcStore.ledConfigValues.brightness = data.readU8();
        fcStore.ledConfigValues.rainbow_delta = data.readU16();
        fcStore.ledConfigValues.rainbow_freq = data.readU16();
    },

    [MSPCodes.MSP_CF_SERIAL_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.serialConfig.ports = [];
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

            fcStore.serialConfig.ports.push(serialPort);
        }
    },

    [MSPCodes.MSP2_COMMON_SERIAL_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.serialConfig.ports = [];
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
            fcStore.serialConfig.ports.push(serialPort);
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
        const fcStore = useFlightControllerStore();
        fcStore.modeRanges = []; // empty the array as new data is coming in

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
            fcStore.modeRanges.push(modeRange);
        }
    },

    [MSPCodes.MSP_MODE_RANGES_EXTRA](data) {
        const fcStore = useFlightControllerStore();
        fcStore.modeRangesExtra = []; // empty the array as new data is coming in

        const modeRangeExtraCount = data.readU8();

        for (let i = 0; i < modeRangeExtraCount; i++) {
            const modeRangeExtra = {
                id: data.readU8(),
                modeLogic: data.readU8(),
                linkedTo: data.readU8(),
            };
            fcStore.modeRangesExtra.push(modeRangeExtra);
        }
    },

    [MSPCodes.MSP_ADJUSTMENT_RANGES](data) {
        const fcStore = useFlightControllerStore();
        fcStore.adjustmentRanges = []; // empty the array as new data is coming in

        const bytesPerItem = semver.gte(fcStore.config.apiVersion, API_VERSION_1_48) ? 10 : 6; // 10 bytes per item if >= V1.48 (adjustmentCenter and adjustmentScale were added), otherwise 6 bytes per item
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
                adjustmentCenter: semver.gte(fcStore.config.apiVersion, API_VERSION_1_48) ? data.readU16() : 0,
                adjustmentScale: semver.gte(fcStore.config.apiVersion, API_VERSION_1_48) ? data.readU16() : 0,
            };
            fcStore.adjustmentRanges.push(adjustmentRange);
        }
    },

    [MSPCodes.MSP_RX_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.rxConfig.serialrx_provider = data.readU8();
        fcStore.rxConfig.stick_max = data.readU16();
        fcStore.rxConfig.stick_center = data.readU16();
        fcStore.rxConfig.stick_min = data.readU16();
        fcStore.rxConfig.spektrum_sat_bind = data.readU8();
        fcStore.rxConfig.rx_min_usec = data.readU16();
        fcStore.rxConfig.rx_max_usec = data.readU16();
        data.readU8(); // was fcStore.rxConfig.rcInterpolation
        data.readU8(); // was fcStore.rxConfig.rcInterpolationInterval
        fcStore.rxConfig.airModeActivateThreshold = data.readU16();
        fcStore.rxConfig.rxSpiProtocol = data.readU8();
        fcStore.rxConfig.rxSpiId = data.readU32();
        fcStore.rxConfig.rxSpiRfChannelCount = data.readU8();
        fcStore.rxConfig.fpvCamAngleDegrees = data.readU8();
        data.readU8(); // was fcStore.rxConfig.rcInterpolationChannels
        data.readU8(); // was fcStore.rxConfig.rcSmoothingType
        fcStore.rxConfig.rcSmoothingSetpointCutoff = data.readU8();
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            fcStore.rxConfig.rcSmoothingThrottleCutoff = data.readU8();
            fcStore.rxConfig.rcSmoothingAutoFactorThrottle = data.readU8();
        } else {
            fcStore.rxConfig.rcSmoothingFeedforwardCutoff = data.readU8(); // deprecated in 1.47
            data.readU8(); // was fcStore.rxConfig.rcSmoothingDerivativeCutoff
        }
        data.readU8(); // was fcStore.rxConfig.rcSmoothingDerivativeType
        fcStore.rxConfig.usbCdcHidType = data.readU8();
        fcStore.rxConfig.rcSmoothingAutoFactor = data.readU8();
        fcStore.rxConfig.rcSmoothing = data.readU8();

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            const elrsUidLength = 6;
            fcStore.rxConfig.elrsUid = [];
            for (let i = 0; i < elrsUidLength; i++) {
                fcStore.rxConfig.elrsUid.push(data.readU8());
            }
        }

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            fcStore.rxConfig.elrsModelId = data.readU8();
        }
    },

    [MSPCodes.MSP_FAILSAFE_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.failsafeConfig.failsafe_delay = data.readU8();
        fcStore.failsafeConfig.failsafe_off_delay = data.readU8();
        fcStore.failsafeConfig.failsafe_throttle = data.readU16();
        fcStore.failsafeConfig.failsafe_switch_mode = data.readU8();
        fcStore.failsafeConfig.failsafe_throttle_low_delay = data.readU16();
        fcStore.failsafeConfig.failsafe_procedure = data.readU8();
    },

    [MSPCodes.MSP_RXFAIL_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.rxFailConfig = []; // empty the array as new data is coming in

        const channelCount = data.byteLength / 3;
        for (let i = 0; i < channelCount; i++) {
            const rxfailChannel = {
                mode: data.readU8(),
                value: data.readU16(),
            };
            fcStore.rxFailConfig.push(rxfailChannel);
        }
    },

    [MSPCodes.MSP_ADVANCED_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.pidAdvancedConfig.gyro_sync_denom = data.readU8();
        fcStore.pidAdvancedConfig.pid_process_denom = data.readU8();
        fcStore.pidAdvancedConfig.use_unsyncedPwm = data.readU8();
        fcStore.pidAdvancedConfig.fast_pwm_protocol = EscProtocols.ReorderPwmProtocols(
            fcStore.config.apiVersion,
            data.readU8(),
        );
        fcStore.pidAdvancedConfig.motor_pwm_rate = data.readU16();
        fcStore.pidAdvancedConfig.motorIdle = data.readU16() / 100;
        data.readU8(); // gyroUse32Khz is not supported
        // Introduced in 1.42
        fcStore.pidAdvancedConfig.motorPwmInversion = data.readU8();
        fcStore.sensorAlignment.gyro_to_use = data.readU8(); // We don't want to double up on storing this state
        fcStore.pidAdvancedConfig.gyroHighFsr = data.readU8();
        fcStore.pidAdvancedConfig.gyroMovementCalibThreshold = data.readU8();
        fcStore.pidAdvancedConfig.gyroCalibDuration = data.readU16();
        fcStore.pidAdvancedConfig.gyroOffsetYaw = data.readU16();
        fcStore.pidAdvancedConfig.gyroCheckOverflow = data.readU8();
        fcStore.pidAdvancedConfig.debugMode = data.readU8();
        fcStore.pidAdvancedConfig.debugModeCount = data.readU8();
    },

    [MSPCodes.MSP_FILTER_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.filterConfig.gyro_lowpass_hz = data.readU8();
        fcStore.filterConfig.dterm_lowpass_hz = data.readU16();
        fcStore.filterConfig.yaw_lowpass_hz = data.readU16();
        fcStore.filterConfig.gyro_notch_hz = data.readU16();
        fcStore.filterConfig.gyro_notch_cutoff = data.readU16();
        fcStore.filterConfig.dterm_notch_hz = data.readU16();
        fcStore.filterConfig.dterm_notch_cutoff = data.readU16();
        fcStore.filterConfig.gyro_notch2_hz = data.readU16();
        fcStore.filterConfig.gyro_notch2_cutoff = data.readU16();
        fcStore.filterConfig.dterm_lowpass_type = data.readU8();
        fcStore.filterConfig.gyro_hardware_lpf = data.readU8();
        data.readU8(); // gyro_32khz_hardware_lpf not used
        fcStore.filterConfig.gyro_lowpass_hz = data.readU16();
        fcStore.filterConfig.gyro_lowpass2_hz = data.readU16();
        fcStore.filterConfig.gyro_lowpass_type = data.readU8();
        fcStore.filterConfig.gyro_lowpass2_type = data.readU8();
        fcStore.filterConfig.dterm_lowpass2_hz = data.readU16();
        fcStore.filterConfig.gyro_32khz_hardware_lpf = 0;
        fcStore.filterConfig.dterm_lowpass2_type = data.readU8();
        fcStore.filterConfig.gyro_lowpass_dyn_min_hz = data.readU16();
        fcStore.filterConfig.gyro_lowpass_dyn_max_hz = data.readU16();
        fcStore.filterConfig.dterm_lowpass_dyn_min_hz = data.readU16();
        fcStore.filterConfig.dterm_lowpass_dyn_max_hz = data.readU16();
        // Introduced in 1.42
        fcStore.filterConfig.dyn_notch_range = data.readU8();
        fcStore.filterConfig.dyn_notch_width_percent = data.readU8();
        fcStore.filterConfig.dyn_notch_q = data.readU16();
        fcStore.filterConfig.dyn_notch_min_hz = data.readU16();

        fcStore.filterConfig.gyro_rpm_notch_harmonics = data.readU8();
        fcStore.filterConfig.gyro_rpm_notch_min_hz = data.readU8();
        // Introduced in 1.43
        fcStore.filterConfig.dyn_notch_max_hz = data.readU16();
        // Introduced in 1.44
        fcStore.filterConfig.dyn_lpf_curve_expo = data.readU8();
        fcStore.filterConfig.dyn_notch_count = data.readU8();
        // Introduced in 1.48
        if (data.remaining() >= 7) {
            fcStore.filterConfig.gyro_rpm_notch_fade_range_hz = data.readU16();
            fcStore.filterConfig.gyro_rpm_notch_q = data.readU16();
            fcStore.filterConfig.gyro_rpm_notch_weights = [];
            for (let i = 0; i < 3; i++) {
                fcStore.filterConfig.gyro_rpm_notch_weights.push(data.readU8());
            }
        }
    },

    [MSPCodes.MSP_SET_PID_ADVANCED]() {
        const fcStore = useFlightControllerStore();
        console.log("Advanced PID settings saved");
        fcStore.advancedTuningActive = { ...fcStore.advancedTuning };
    },

    [MSPCodes.MSP_PID_ADVANCED](data) {
        const fcStore = useFlightControllerStore();
        fcStore.advancedTuning.rollPitchItermIgnoreRate = data.readU16();
        fcStore.advancedTuning.yawItermIgnoreRate = data.readU16();
        fcStore.advancedTuning.yaw_p_limit = data.readU16();
        fcStore.advancedTuning.deltaMethod = data.readU8();
        fcStore.advancedTuning.vbatPidCompensation = data.readU8();
        fcStore.advancedTuning.feedforwardTransition = data.readU8();
        fcStore.advancedTuning.dtermSetpointWeight = data.readU8();
        fcStore.advancedTuning.toleranceBand = data.readU8();
        fcStore.advancedTuning.toleranceBandReduction = data.readU8();
        fcStore.advancedTuning.itermThrottleGain = data.readU8();
        fcStore.advancedTuning.pidMaxVelocity = data.readU16();
        fcStore.advancedTuning.pidMaxVelocityYaw = data.readU16();
        fcStore.advancedTuning.levelAngleLimit = data.readU8();
        fcStore.advancedTuning.levelSensitivity = data.readU8();
        fcStore.advancedTuning.itermThrottleThreshold = data.readU16();
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            fcStore.advancedTuning.antiGravityGain = data.readU16();
        } else {
            fcStore.advancedTuning.itermAcceleratorGain = data.readU16();
        }

        fcStore.advancedTuning.dtermSetpointWeight = data.readU16();
        fcStore.advancedTuning.itermRotation = data.readU8();
        fcStore.advancedTuning.smartFeedforward = data.readU8();
        fcStore.advancedTuning.itermRelax = data.readU8();
        fcStore.advancedTuning.itermRelaxType = data.readU8();
        if (semver.lt(fcStore.config.apiVersion, API_VERSION_1_48)) {
            fcStore.advancedTuning.absoluteControlGain = data.readU8();
        } else {
            data.readU8();
        }
        fcStore.advancedTuning.throttleBoost = data.readU8();
        fcStore.advancedTuning.acroTrainerAngleLimit = data.readU8();
        fcStore.advancedTuning.feedforwardRoll = data.readU16();
        fcStore.advancedTuning.feedforwardPitch = data.readU16();
        fcStore.advancedTuning.feedforwardYaw = data.readU16();
        fcStore.advancedTuning.antiGravityMode = data.readU8();

        fcStore.advancedTuning.dMaxRoll = data.readU8();
        fcStore.advancedTuning.dMaxPitch = data.readU8();
        fcStore.advancedTuning.dMaxYaw = data.readU8();
        fcStore.advancedTuning.dMaxGain = data.readU8();
        fcStore.advancedTuning.dMaxAdvance = data.readU8();
        // No Configurator UI for these; round-tripped as-is so saving other PID_ADVANCED
        // fields doesn't reset a value still active on firmware older than 2026.12.0.
        fcStore.advancedTuning.useIntegratedYaw = data.readU8();
        fcStore.advancedTuning.integratedYawRelax = data.readU8();

        // Introduced in 1.42
        fcStore.advancedTuning.itermRelaxCutoff = data.readU8();

        // Introduced in 1.43
        fcStore.advancedTuning.motorOutputLimit = data.readU8();
        fcStore.advancedTuning.autoProfileCellCount = data.read8();
        fcStore.advancedTuning.idleMinRpm = data.readU8();

        // Introduced in 1.44
        fcStore.advancedTuning.feedforward_averaging = data.readU8();
        fcStore.advancedTuning.feedforward_smooth_factor = data.readU8();
        fcStore.advancedTuning.feedforward_boost = data.readU8();
        fcStore.advancedTuning.feedforward_max_rate_limit = data.readU8();
        fcStore.advancedTuning.feedforward_jitter_factor = data.readU8();
        fcStore.advancedTuning.vbat_sag_compensation = data.readU8();
        fcStore.advancedTuning.thrustLinearization = data.readU8();

        // Introduced in 1.45
        fcStore.advancedTuning.tpaMode = data.readU8();
        fcStore.advancedTuning.tpaRate = Number.parseFloat((data.readU8() / 100).toFixed(2));
        fcStore.advancedTuning.tpaBreakpoint = data.readU16();

        fcStore.advancedTuningActive = { ...fcStore.advancedTuning };
    },

    [MSPCodes.MSP_SENSOR_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.sensorConfig.acc_hardware = data.readU8();
        fcStore.sensorConfig.baro_hardware = data.readU8();
        fcStore.sensorConfig.mag_hardware = data.readU8();
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
            fcStore.sensorConfig.sonar_hardware = data.readU8();
        }
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            fcStore.sensorConfig.opticalflow_hardware = data.readU8();
        }
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_49)) {
            fcStore.sensorConfig.pitot_hardware = data.readU8();
        }
    },

    [MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE](data) {
        const fcStore = useFlightControllerStore();
        fcStore.sensorConfigActive.gyro_hardware = data.readU8();
        fcStore.sensorConfigActive.acc_hardware = data.readU8();
        fcStore.sensorConfigActive.baro_hardware = data.readU8();
        fcStore.sensorConfigActive.mag_hardware = data.readU8();
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
            fcStore.sensorConfigActive.sonar_hardware = data.readU8();
        }
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            fcStore.sensorConfigActive.opticalflow_hardware = data.readU8();
        }
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_49)) {
            fcStore.sensorConfigActive.pitot_hardware = data.readU8();
        }
    },

    [MSPCodes.MSP2_MCU_INFO](data) {
        const fcStore = useFlightControllerStore();
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            fcStore.mcuInfo = {
                id: data.readU8(),
                name: this.getText(data),
            };
        }
    },

    [MSPCodes.MSP2_GYRO_SENSOR](data) {
        const fcStore = useFlightControllerStore();
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            fcStore.gyroSensor.gyro_count = data.readU8();
            for (let i = 0; i < fcStore.gyroSensor.gyro_count; i++) {
                fcStore.gyroSensor.gyro_hardware[i] = data.readU8();
            }
        }
    },

    [MSPCodes.MSP_LED_STRIP_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.ledStrip = [];

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

        const layout = semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)
            ? LED_MASK_LAYOUT
            : LED_MASK_LAYOUT_PRE_1_46;
        if (layout === LED_MASK_LAYOUT_PRE_1_46) {
            ledOverlayLetters = ledOverlayLetters.filter((x) => x !== "y"); //remove rainbow because it's only supported after API 1.46
        }

        for (let i = 0; i < ledCount; i++) {
            fcStore.ledStrip.push(decodeLedMask(data.readU32(), layout));
        }
    },

    [MSPCodes.MSP_SET_LED_STRIP_CONFIG]() {
        console.log("Led strip config saved");
    },

    [MSPCodes.MSP_LED_COLORS](data) {
        const fcStore = useFlightControllerStore();
        fcStore.ledColors = [];

        const ledcolorCount = data.byteLength / 4;

        for (let i = 0; i < ledcolorCount; i++) {
            const color = {
                h: data.readU16(),
                s: data.readU8(),
                v: data.readU8(),
            };
            fcStore.ledColors.push(color);
        }
    },

    [MSPCodes.MSP_SET_LED_COLORS]() {
        console.log("Led strip colors saved");
    },

    [MSPCodes.MSP_LED_STRIP_MODECOLOR](data) {
        const fcStore = useFlightControllerStore();
        fcStore.ledModeColors = [];

        const colorCount = data.byteLength / 3;

        for (let i = 0; i < colorCount; i++) {
            const modeColor = {
                mode: data.readU8(),
                direction: data.readU8(),
                color: data.readU8(),
            };
            fcStore.ledModeColors.push(modeColor);
        }
    },

    [MSPCodes.MSP_SET_LED_STRIP_MODECOLOR]() {
        console.log("Led strip mode colors saved");
    },

    [MSPCodes.MSP_DATAFLASH_SUMMARY](data) {
        const fcStore = useFlightControllerStore();
        let flags = 0;
        if (data.byteLength >= 13) {
            flags = data.readU8();
            fcStore.dataflash.ready = (flags & 1) != 0;
            fcStore.dataflash.supported = (flags & 2) != 0;
            fcStore.dataflash.sectors = data.readU32();
            fcStore.dataflash.totalSize = data.readU32();
            fcStore.dataflash.usedSize = data.readU32();
        } else {
            // Firmware version too old to support MSP_DATAFLASH_SUMMARY
            fcStore.dataflash.ready = false;
            fcStore.dataflash.supported = false;
            fcStore.dataflash.sectors = 0;
            fcStore.dataflash.totalSize = 0;
            fcStore.dataflash.usedSize = 0;
        }
    },

    [MSPCodes.MSP_DATAFLASH_READ]: NOTHING_TO_DO,

    [MSPCodes.MSP_DATAFLASH_ERASE]() {
        console.log("Data flash erase begun...");
    },

    [MSPCodes.MSP_SDCARD_SUMMARY](data) {
        const fcStore = useFlightControllerStore();
        let flags = 0;
        flags = data.readU8();

        fcStore.sdcard.supported = (flags & 0x01) != 0;
        fcStore.sdcard.state = data.readU8();
        fcStore.sdcard.filesystemLastError = data.readU8();
        fcStore.sdcard.freeSizeKB = data.readU32();
        fcStore.sdcard.totalSizeKB = data.readU32();
    },

    [MSPCodes.MSP_BLACKBOX_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.blackbox.supported = (data.readU8() & 1) != 0;
        fcStore.blackbox.blackboxDevice = data.readU8();
        fcStore.blackbox.blackboxRateNum = data.readU8();
        fcStore.blackbox.blackboxRateDenom = data.readU8();
        fcStore.blackbox.blackboxPDenom = data.readU16();

        // Introduced in API version 1.44
        fcStore.blackbox.blackboxSampleRate = data.readU8();

        // Introduced in API version 1.45
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            fcStore.blackbox.blackboxDisabledMask = data.readU32();
        }
    },

    [MSPCodes.MSP_SET_BLACKBOX_CONFIG]() {
        console.log("Blackbox config saved");
    },

    [MSPCodes.MSP_VTX_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.vtxConfig.vtx_type = data.readU8();
        fcStore.vtxConfig.vtx_band = data.readU8();
        fcStore.vtxConfig.vtx_channel = data.readU8();
        fcStore.vtxConfig.vtx_power = data.readU8();
        fcStore.vtxConfig.vtx_pit_mode = data.readU8() != 0;
        fcStore.vtxConfig.vtx_frequency = data.readU16();
        fcStore.vtxConfig.vtx_device_ready = data.readU8() != 0;
        fcStore.vtxConfig.vtx_low_power_disarm = data.readU8();

        // Introduced in API version 1.42
        fcStore.vtxConfig.vtx_pit_mode_frequency = data.readU16();
        fcStore.vtxConfig.vtx_table_available = data.readU8() != 0;
        fcStore.vtxConfig.vtx_table_bands = data.readU8();
        fcStore.vtxConfig.vtx_table_channels = data.readU8();
        fcStore.vtxConfig.vtx_table_powerlevels = data.readU8();
        fcStore.vtxConfig.vtx_table_clear = false;
    },

    [MSPCodes.MSP_SET_VTX_CONFIG]() {
        console.log("VTX config sent");
    },

    [MSPCodes.MSP_VTXTABLE_BAND](data) {
        const fcStore = useFlightControllerStore();
        fcStore.vtxTableBand.vtxtable_band_number = data.readU8();

        const bandNameLength = data.readU8();
        fcStore.vtxTableBand.vtxtable_band_name = "";
        for (let i = 0; i < bandNameLength; i++) {
            fcStore.vtxTableBand.vtxtable_band_name += String.fromCodePoint(data.readU8());
        }

        fcStore.vtxTableBand.vtxtable_band_letter = String.fromCodePoint(data.readU8());
        fcStore.vtxTableBand.vtxtable_band_is_factory_band = data.readU8() != 0;

        const bandFrequenciesLength = data.readU8();
        fcStore.vtxTableBand.vtxtable_band_frequencies = [];
        for (let i = 0; i < bandFrequenciesLength; i++) {
            fcStore.vtxTableBand.vtxtable_band_frequencies.push(data.readU16());
        }
    },

    [MSPCodes.MSP_SET_VTXTABLE_BAND]() {
        console.log("VTX band sent");
    },

    [MSPCodes.MSP_VTXTABLE_POWERLEVEL](data) {
        const fcStore = useFlightControllerStore();
        fcStore.vtxTablePowerLevel.vtxtable_powerlevel_number = data.readU8();
        fcStore.vtxTablePowerLevel.vtxtable_powerlevel_value = data.readU16();

        const powerLabelLength = data.readU8();
        fcStore.vtxTablePowerLevel.vtxtable_powerlevel_label = "";
        for (let i = 0; i < powerLabelLength; i++) {
            fcStore.vtxTablePowerLevel.vtxtable_powerlevel_label += String.fromCodePoint(data.readU8());
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
        const fcStore = useFlightControllerStore();
        if (fcStore.tuningSliders.slider_pids_mode > 0) {
            fcStore.pids[0][0] = data.readU8();
            fcStore.pids[0][1] = data.readU8();
            fcStore.pids[0][2] = data.readU8();
            fcStore.advancedTuning.dMaxRoll = data.readU8();
            fcStore.advancedTuning.feedforwardRoll = data.readU16();

            fcStore.pids[1][0] = data.readU8();
            fcStore.pids[1][1] = data.readU8();
            fcStore.pids[1][2] = data.readU8();
            fcStore.advancedTuning.dMaxPitch = data.readU8();
            fcStore.advancedTuning.feedforwardPitch = data.readU16();
        }

        if (fcStore.tuningSliders.slider_pids_mode > 1) {
            fcStore.pids[2][0] = data.readU8();
            fcStore.pids[2][1] = data.readU8();
            fcStore.pids[2][2] = data.readU8();
            fcStore.advancedTuning.dMaxYaw = data.readU8();
            fcStore.advancedTuning.feedforwardYaw = data.readU16();
        }
    },

    [MSPCodes.MSP_CALCULATE_SIMPLIFIED_GYRO](data) {
        MspHelper.readGyroFilterSliderSettings(data);
    },

    [MSPCodes.MSP_CALCULATE_SIMPLIFIED_DTERM](data) {
        MspHelper.readDtermFilterSliderSettings(data);
    },

    [MSPCodes.MSP_VALIDATE_SIMPLIFIED_TUNING](data) {
        const fcStore = useFlightControllerStore();
        fcStore.tuningSliders.slider_pids_valid = data.readU8();
        fcStore.tuningSliders.slider_gyro_valid = data.readU8();
        fcStore.tuningSliders.slider_dterm_valid = data.readU8();
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
        const fcStore = useFlightControllerStore();
        fcStore.pidController.controller = data.readU8();
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
        const fcStore = useFlightControllerStore();
        for (let i = 0; i < 3; i++) {
            fcStore.wingConfig.s_term[i] = data.readU8();
        }
        for (let i = 0; i < 3; i++) {
            fcStore.wingConfig.spa_center[i] = data.readU16();
        }
        for (let i = 0; i < 3; i++) {
            fcStore.wingConfig.spa_width[i] = data.readU16();
        }
        for (let i = 0; i < 3; i++) {
            fcStore.wingConfig.spa_mode[i] = data.readU8();
        }

        fcStore.wingConfig.tpa_curve_type = data.readU8();
        fcStore.wingConfig.tpa_curve_stall_throttle = data.readU8();
        fcStore.wingConfig.tpa_curve_pid_thr0 = data.readU16();
        fcStore.wingConfig.tpa_curve_pid_thr100 = data.readU16();
        fcStore.wingConfig.tpa_curve_expo = data.read8();
        fcStore.wingConfig.tpa_speed_type = data.readU8();
        fcStore.wingConfig.tpa_speed_basic_delay = data.readU16();
        fcStore.wingConfig.tpa_speed_basic_gravity = data.readU16();
        fcStore.wingConfig.tpa_speed_adv_prop_pitch = data.readU16();
        fcStore.wingConfig.tpa_speed_adv_mass = data.readU16();
        fcStore.wingConfig.tpa_speed_adv_drag_k = data.readU16();
        fcStore.wingConfig.tpa_speed_adv_thrust = data.readU16();
        fcStore.wingConfig.tpa_speed_max_voltage = data.readU16();
        fcStore.wingConfig.tpa_speed_pitch_offset = data.read16();
        fcStore.wingConfig.yaw_type = data.readU8();
        fcStore.wingConfig.angle_pitch_offset = data.read16();
    },

    [MSPCodes.MSP_SET_WING]: NOTHING_TO_DO,

    [MSPCodes.MSP_PSAS_CONFIG](data) {
        const fcStore = useFlightControllerStore();
        fcStore.psasConfig.stick_gain[0] = data.readU8();
        fcStore.psasConfig.stick_gain[1] = data.readU8();
        fcStore.psasConfig.stick_gain[2] = data.readU8();
        fcStore.psasConfig.damping_gain[0] = data.readU16();
        fcStore.psasConfig.damping_gain[1] = data.readU16();
        fcStore.psasConfig.damping_gain[2] = data.readU16();
        fcStore.psasConfig.pitch_damping_filter_freq = data.readU16();
        fcStore.psasConfig.accel_z_filter_freq = data.readU8();
        fcStore.psasConfig.pitch_stability_gain = data.readU16();
        fcStore.psasConfig.pitch_accel_p_gain = data.readU16();
        fcStore.psasConfig.pitch_accel_i_gain = data.readU8();
        fcStore.psasConfig.pitch_accel_max = data.readU8();
        fcStore.psasConfig.pitch_accel_min = data.readU8();
        fcStore.psasConfig.yaw_damping_filter_freq = data.readU16();
        fcStore.psasConfig.accel_y_filter_freq = data.readU8();
        fcStore.psasConfig.yaw_stability_gain = data.readU16();
        fcStore.psasConfig.wing_load = data.readU16();
        fcStore.psasConfig.air_density = data.readU16();
        fcStore.psasConfig.lift_c_limit = data.readU8();
        fcStore.psasConfig.aoa_limiter_gain = data.readU8();
        fcStore.psasConfig.lift_coef_filter_freq = data.readU8();
        fcStore.psasConfig.aoa_limiter_forecast_time = data.readU8();
        fcStore.psasConfig.aoa_limiter_tau_return = data.readU8();
        fcStore.psasConfig.servo_time = data.readU16();
        fcStore.psasConfig.roll_yaw_clift_start = data.readU8();
        fcStore.psasConfig.roll_yaw_clift_stop = data.readU8();
        fcStore.psasConfig.roll_to_yaw_link = data.readU8();
        fcStore.psasConfig.speed_main_curve_enable[0] = data.readU8();
        fcStore.psasConfig.speed_main_curve_enable[1] = data.readU8();
        fcStore.psasConfig.speed_main_curve_enable[2] = data.readU8();
        fcStore.psasConfig.speed_stick_curve_enable[0] = data.readU8();
        fcStore.psasConfig.speed_stick_curve_enable[1] = data.readU8();
        fcStore.psasConfig.speed_stick_curve_enable[2] = data.readU8();
        fcStore.psasConfig.speed_optimum_vref = data.readU8();
        fcStore.psasConfig.speed_main_curve_power = data.readU8();
        fcStore.psasConfig.speed_roll_stick_curve_power = data.readU8();
        fcStore.psasConfig.speed_main_curve_min = data.readU16();
        fcStore.psasConfig.speed_main_curve_max = data.readU16();
        fcStore.psasConfig.speed_stick_curve_min = data.readU16();
        fcStore.psasConfig.speed_stick_curve_max = data.readU16();
        fcStore.psasConfig.speed_curve_mode = data.readU8();
    },

    [MSPCodes.MSP_SET_PSAS_CONFIG]: NOTHING_TO_DO,

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
        const fcStore = useFlightControllerStore();
        const beeperDisabledMask = beepers("beepers").getDisabledMask();
        buffer.push32(beeperDisabledMask);
        buffer.push8(fcStore.beepers.dshotBeaconTone);
        buffer.push32(beepers("dshotBeaconConditions").getDisabledMask());
    },

    [MSPCodes.MSP_SET_MIXER_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        buffer.push8(fcStore.mixerConfig.mixer);
        buffer.push8(fcStore.mixerConfig.reverseMotorDir);
    },

    [MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push16(fcStore.boardAlignment.roll)
            .push16(fcStore.boardAlignment.pitch)
            .push16(fcStore.boardAlignment.yaw);
    },

    [MSPCodes.MSP_SET_PID_CONTROLLER](buffer) {
        const fcStore = useFlightControllerStore();
        buffer.push8(fcStore.pidController.controller);
    },

    [MSPCodes.MSP_SET_PID](buffer) {
        const fcStore = useFlightControllerStore();
        for (const pid of fcStore.pids) {
            for (let j = 0; j < 3; j++) {
                buffer.push8(Number.parseInt(String(pid[j])));
            }
        }
    },

    [MSPCodes.MSP_SET_RC_TUNING](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(Math.round(fcStore.rcTuning.RC_RATE * 100))
            .push8(Math.round(fcStore.rcTuning.RC_EXPO * 100))
            .push8(Math.round(fcStore.rcTuning.roll_rate * 100))
            .push8(Math.round(fcStore.rcTuning.pitch_rate * 100))
            .push8(Math.round(fcStore.rcTuning.yaw_rate * 100));
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            buffer.push8(0);
        } else {
            buffer.push8(Math.round(fcStore.rcTuning.dynamic_THR_PID * 100));
        }
        buffer.push8(Math.round(fcStore.rcTuning.throttle_MID * 100));
        buffer.push8(Math.round(fcStore.rcTuning.throttle_EXPO * 100));
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            buffer.push16(0);
        } else {
            buffer.push16(fcStore.rcTuning.dynamic_THR_breakpoint);
        }
        buffer.push8(Math.round(fcStore.rcTuning.RC_YAW_EXPO * 100));
        buffer.push8(Math.round(fcStore.rcTuning.rcYawRate * 100));
        buffer.push8(Math.round(fcStore.rcTuning.rcPitchRate * 100));
        buffer.push8(Math.round(fcStore.rcTuning.RC_PITCH_EXPO * 100));
        buffer.push8(fcStore.rcTuning.throttleLimitType);
        buffer.push8(fcStore.rcTuning.throttleLimitPercent);

        // Introduced in 1.42
        buffer.push16(fcStore.rcTuning.roll_rate_limit);
        buffer.push16(fcStore.rcTuning.pitch_rate_limit);
        buffer.push16(fcStore.rcTuning.yaw_rate_limit);

        // Introduced in 1.43
        buffer.push8(fcStore.rcTuning.rates_type);

        // Introduced in 1.47
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            buffer.push8(Math.round(fcStore.rcTuning.throttle_HOVER * 100));
        }
    },

    [MSPCodes.MSP_SET_RX_MAP](buffer) {
        const fcStore = useFlightControllerStore();
        for (const channel of fcStore.rcMap) {
            buffer.push8(channel);
        }
    },

    [MSPCodes.MSP_SET_ACC_TRIM](buffer) {
        const fcStore = useFlightControllerStore();
        buffer.push16(fcStore.config.accelerometerTrims[0]).push16(fcStore.config.accelerometerTrims[1]);
    },

    [MSPCodes.MSP_SET_ARMING_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.armingConfig.auto_disarm_delay)
            .push8(0) // was disarm_kill_switch
            .push8(fcStore.armingConfig.small_angle);
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            buffer.push8(fcStore.armingConfig.gyro_cal_on_first_arm);
        }
    },

    [MSPCodes.MSP_SET_LOOP_TIME](buffer) {
        const fcStore = useFlightControllerStore();
        buffer.push16(fcStore.fcConfig.loopTime);
    },

    [MSPCodes.MSP_SET_MISC](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push16(fcStore.rxConfig.midrc ?? 0)
            .push16(fcStore.motorConfig.minthrottle)
            .push16(fcStore.motorConfig.maxthrottle)
            .push16(fcStore.motorConfig.mincommand)
            .push16(fcStore.misc.failsafe_throttle)
            .push8(fcStore.gpsConfig.provider)
            .push8(fcStore.misc.gps_baudrate)
            .push8(fcStore.gpsConfig.ublox_sbas)
            .push8(fcStore.misc.multiwiicurrentoutput)
            .push8(fcStore.rssiConfig.channel)
            .push8(fcStore.misc.placeholder2)
            .push16(0) // was mag_declination
            .push8(fcStore.misc.vbatscale)
            .push8(Math.round(fcStore.misc.vbatmincellvoltage * 10))
            .push8(Math.round(fcStore.misc.vbatmaxcellvoltage * 10))
            .push8(Math.round(fcStore.misc.vbatwarningcellvoltage * 10));
    },

    [MSPCodes.MSP_SET_MOTOR_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push16(fcStore.motorConfig.minthrottle)
            .push16(fcStore.motorConfig.maxthrottle)
            .push16(fcStore.motorConfig.mincommand);

        // Introduced in 1.42
        buffer.push8(fcStore.motorConfig.motor_poles);
        buffer.push8(fcStore.motorConfig.use_dshot_telemetry ? 1 : 0);

        // Introduced in 1.49
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_49)) {
            buffer.push16(fcStore.motorConfig.motor_kv);
        }
    },

    [MSPCodes.MSP_SET_GPS_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.gpsConfig.provider)
            .push8(fcStore.gpsConfig.ublox_sbas)
            .push8(fcStore.gpsConfig.auto_config)
            .push8(fcStore.gpsConfig.auto_baud);

        // Introduced in 1.43
        buffer.push8(fcStore.gpsConfig.home_point_once).push8(fcStore.gpsConfig.ublox_use_galileo);
    },

    [MSPCodes.MSP_SET_GPS_RESCUE](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push16(fcStore.gpsRescue.angle)
            .push16(fcStore.gpsRescue.returnAltitudeM)
            .push16(fcStore.gpsRescue.descentDistanceM)
            .push16(fcStore.gpsRescue.groundSpeed)
            .push16(fcStore.gpsRescue.throttleMin)
            .push16(fcStore.gpsRescue.throttleMax)
            .push16(fcStore.gpsRescue.throttleHover)
            .push8(fcStore.gpsRescue.sanityChecks)
            .push8(fcStore.gpsRescue.minSats);

        // Introduced in 1.43
        buffer
            .push16(fcStore.gpsRescue.ascendRate)
            .push16(fcStore.gpsRescue.descendRate)
            .push8(fcStore.gpsRescue.allowArmingWithoutFix)
            .push8(fcStore.gpsRescue.altitudeMode);

        // Introduced in 1.44
        buffer.push16(fcStore.gpsRescue.minStartDistM);

        // Introduced in 1.46
        buffer.push16(fcStore.gpsRescue.initialClimbM);
    },

    [MSPCodes.MSP_SET_COMPASS_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
            buffer.push16(Math.round(10.0 * Number.parseFloat(String(fcStore.compassConfig.mag_declination))));
        }
    },

    [MSPCodes.MSP_SET_RSSI_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        buffer.push8(fcStore.rssiConfig.channel);
    },

    [MSPCodes.MSP_SET_BATTERY_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(Math.round(fcStore.batteryConfig.vbatmincellvoltage * 10))
            .push8(Math.round(fcStore.batteryConfig.vbatmaxcellvoltage * 10))
            .push8(Math.round(fcStore.batteryConfig.vbatwarningcellvoltage * 10))
            .push16(fcStore.batteryConfig.capacity)
            .push8(fcStore.batteryConfig.voltageMeterSource)
            .push8(fcStore.batteryConfig.currentMeterSource)
            .push16(Math.round(fcStore.batteryConfig.vbatmincellvoltage * 100))
            .push16(Math.round(fcStore.batteryConfig.vbatmaxcellvoltage * 100))
            .push16(Math.round(fcStore.batteryConfig.vbatwarningcellvoltage * 100));
    },

    [MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG]: NOTHING_TO_DO,

    [MSPCodes.MSP_SET_CURRENT_METER_CONFIG]: NOTHING_TO_DO,

    [MSPCodes.MSP_SET_RX_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.rxConfig.serialrx_provider)
            .push16(fcStore.rxConfig.stick_max)
            .push16(fcStore.rxConfig.stick_center)
            .push16(fcStore.rxConfig.stick_min)
            .push8(fcStore.rxConfig.spektrum_sat_bind)
            .push16(fcStore.rxConfig.rx_min_usec)
            .push16(fcStore.rxConfig.rx_max_usec)
            .push8(fcStore.rxConfig.rcInterpolation)
            .push8(fcStore.rxConfig.rcInterpolationInterval)
            .push16(fcStore.rxConfig.airModeActivateThreshold)
            .push8(fcStore.rxConfig.rxSpiProtocol)
            .push32(fcStore.rxConfig.rxSpiId)
            .push8(fcStore.rxConfig.rxSpiRfChannelCount)
            .push8(fcStore.rxConfig.fpvCamAngleDegrees)
            .push8(fcStore.rxConfig.rcInterpolationChannels)
            .push8(fcStore.rxConfig.rcSmoothingType)
            .push8(fcStore.rxConfig.rcSmoothingSetpointCutoff);
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            buffer.push8(fcStore.rxConfig.rcSmoothingThrottleCutoff);
            buffer.push8(fcStore.rxConfig.rcSmoothingAutoFactorThrottle);
        } else {
            buffer.push8(fcStore.rxConfig.rcSmoothingFeedforwardCutoff);
            buffer.push8(fcStore.rxConfig.rcSmoothingInputType);
        }
        buffer.push8(fcStore.rxConfig.rcSmoothingDerivativeType);

        // Introduced in 1.42
        buffer.push8(fcStore.rxConfig.usbCdcHidType).push8(fcStore.rxConfig.rcSmoothingAutoFactor);

        // Introduced in 1.44
        buffer.push8(fcStore.rxConfig.rcSmoothing);

        // Introduced in 1.45
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            fcStore.rxConfig.elrsUid.forEach((b) => buffer.push8(b));
        }

        // Introduced in 1.47
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            buffer.push8(fcStore.rxConfig.elrsModelId ?? 0);
        }
    },

    [MSPCodes.MSP_SET_FAILSAFE_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.failsafeConfig.failsafe_delay)
            .push8(fcStore.failsafeConfig.failsafe_off_delay)
            .push16(fcStore.failsafeConfig.failsafe_throttle)
            .push8(fcStore.failsafeConfig.failsafe_switch_mode)
            .push16(fcStore.failsafeConfig.failsafe_throttle_low_delay)
            .push8(fcStore.failsafeConfig.failsafe_procedure);
    },

    [MSPCodes.MSP_SET_CF_SERIAL_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        for (const serialPort of fcStore.serialConfig.ports) {
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
        const fcStore = useFlightControllerStore();
        buffer.push8(fcStore.serialConfig.ports.length);

        for (const serialPort of fcStore.serialConfig.ports) {
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
        const fcStore = useFlightControllerStore();
        buffer
            .push16(fcStore.motor3dConfig.deadband3d_low)
            .push16(fcStore.motor3dConfig.deadband3d_high)
            .push16(fcStore.motor3dConfig.neutral);
    },

    [MSPCodes.MSP_SET_RC_DEADBAND](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.rcDeadbandConfig.deadband)
            .push8(fcStore.rcDeadbandConfig.yaw_deadband)
            .push8(fcStore.rcDeadbandConfig.alt_hold_deadband)
            .push16(fcStore.rcDeadbandConfig.deadband3d_throttle);
    },

    [MSPCodes.MSP_SET_SENSOR_ALIGNMENT](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.sensorAlignment.align_gyro)
            .push8(fcStore.sensorAlignment.align_acc)
            .push8(fcStore.sensorAlignment.align_mag);

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            buffer
                .push8(fcStore.sensorAlignment.gyro_enable_mask ?? 0) // replacing gyro_to_use
                .push16(fcStore.sensorAlignment.mag_align_roll * 10)
                .push16(fcStore.sensorAlignment.mag_align_pitch * 10)
                .push16(fcStore.sensorAlignment.mag_align_yaw * 10);
        } else {
            buffer
                .push8(fcStore.sensorAlignment.gyro_to_use)
                .push8(fcStore.sensorAlignment.gyro_1_align)
                .push8(fcStore.sensorAlignment.gyro_2_align);
        }
    },

    [MSPCodes.MSP_SET_ADVANCED_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.pidAdvancedConfig.gyro_sync_denom)
            .push8(fcStore.pidAdvancedConfig.pid_process_denom)
            .push8(fcStore.pidAdvancedConfig.use_unsyncedPwm)
            .push8(
                EscProtocols.ReorderPwmProtocols(
                    fcStore.config.apiVersion,
                    fcStore.pidAdvancedConfig.fast_pwm_protocol,
                ),
            )
            .push16(fcStore.pidAdvancedConfig.motor_pwm_rate)
            .push16(fcStore.pidAdvancedConfig.motorIdle * 100)
            .push8(0); // gyroUse32kHz not used

        // Introduced in 1.42
        buffer
            .push8(fcStore.pidAdvancedConfig.motorPwmInversion)
            .push8(fcStore.sensorAlignment.gyro_to_use) // We don't want to double up on storing this state
            .push8(fcStore.pidAdvancedConfig.gyroHighFsr)
            .push8(fcStore.pidAdvancedConfig.gyroMovementCalibThreshold)
            .push16(fcStore.pidAdvancedConfig.gyroCalibDuration)
            .push16(fcStore.pidAdvancedConfig.gyroOffsetYaw)
            .push8(fcStore.pidAdvancedConfig.gyroCheckOverflow)
            .push8(fcStore.pidAdvancedConfig.debugMode);
    },

    [MSPCodes.MSP_SET_FILTER_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.filterConfig.gyro_lowpass_hz)
            .push16(fcStore.filterConfig.dterm_lowpass_hz)
            .push16(fcStore.filterConfig.yaw_lowpass_hz)
            .push16(fcStore.filterConfig.gyro_notch_hz)
            .push16(fcStore.filterConfig.gyro_notch_cutoff)
            .push16(fcStore.filterConfig.dterm_notch_hz)
            .push16(fcStore.filterConfig.dterm_notch_cutoff)
            .push16(fcStore.filterConfig.gyro_notch2_hz)
            .push16(fcStore.filterConfig.gyro_notch2_cutoff)
            .push8(fcStore.filterConfig.dterm_lowpass_type)
            .push8(fcStore.filterConfig.gyro_hardware_lpf)
            .push8(0) // gyro_32khz_hardware_lpf not used
            .push16(fcStore.filterConfig.gyro_lowpass_hz)
            .push16(fcStore.filterConfig.gyro_lowpass2_hz)
            .push8(fcStore.filterConfig.gyro_lowpass_type)
            .push8(fcStore.filterConfig.gyro_lowpass2_type)
            .push16(fcStore.filterConfig.dterm_lowpass2_hz)
            .push8(fcStore.filterConfig.dterm_lowpass2_type)
            .push16(fcStore.filterConfig.gyro_lowpass_dyn_min_hz)
            .push16(fcStore.filterConfig.gyro_lowpass_dyn_max_hz)
            .push16(fcStore.filterConfig.dterm_lowpass_dyn_min_hz)
            .push16(fcStore.filterConfig.dterm_lowpass_dyn_max_hz);

        // Introduced in 1.42
        buffer
            .push8(fcStore.filterConfig.dyn_notch_range)
            .push8(fcStore.filterConfig.dyn_notch_width_percent)
            .push16(fcStore.filterConfig.dyn_notch_q)
            .push16(fcStore.filterConfig.dyn_notch_min_hz)
            .push8(fcStore.filterConfig.gyro_rpm_notch_harmonics)
            .push8(fcStore.filterConfig.gyro_rpm_notch_min_hz);

        // Introduced in 1.43
        buffer.push16(fcStore.filterConfig.dyn_notch_max_hz);

        // Introduced in 1.44
        buffer.push8(fcStore.filterConfig.dyn_lpf_curve_expo).push8(fcStore.filterConfig.dyn_notch_count);

        // Introduced in 1.48
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_48)) {
            buffer
                .push16(fcStore.filterConfig.gyro_rpm_notch_fade_range_hz)
                .push16(fcStore.filterConfig.gyro_rpm_notch_q);
            for (let i = 0; i < 3; i++) {
                buffer.push8(fcStore.filterConfig.gyro_rpm_notch_weights[i]);
            }
        }
    },

    [MSPCodes.MSP_SET_PID_ADVANCED](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push16(fcStore.advancedTuning.rollPitchItermIgnoreRate)
            .push16(fcStore.advancedTuning.yawItermIgnoreRate)
            .push16(fcStore.advancedTuning.yaw_p_limit)
            .push8(fcStore.advancedTuning.deltaMethod)
            .push8(fcStore.advancedTuning.vbatPidCompensation)
            .push8(fcStore.advancedTuning.feedforwardTransition)
            .push8(Math.min(fcStore.advancedTuning.dtermSetpointWeight, 254))
            .push8(fcStore.advancedTuning.toleranceBand)
            .push8(fcStore.advancedTuning.toleranceBandReduction)
            .push8(fcStore.advancedTuning.itermThrottleGain)
            .push16(fcStore.advancedTuning.pidMaxVelocity)
            .push16(fcStore.advancedTuning.pidMaxVelocityYaw)
            .push8(fcStore.advancedTuning.levelAngleLimit)
            .push8(fcStore.advancedTuning.levelSensitivity)
            .push16(fcStore.advancedTuning.itermThrottleThreshold);

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            buffer.push16(fcStore.advancedTuning.antiGravityGain);
        } else {
            buffer.push16(fcStore.advancedTuning.itermAcceleratorGain);
        }

        buffer
            .push16(fcStore.advancedTuning.dtermSetpointWeight)
            .push8(fcStore.advancedTuning.itermRotation)
            .push8(fcStore.advancedTuning.smartFeedforward)
            .push8(fcStore.advancedTuning.itermRelax)
            .push8(fcStore.advancedTuning.itermRelaxType);
        if (semver.lt(fcStore.config.apiVersion, API_VERSION_1_48)) {
            buffer.push8(fcStore.advancedTuning.absoluteControlGain);
        } else {
            buffer.push8(0);
        }
        buffer
            .push8(fcStore.advancedTuning.throttleBoost)
            .push8(fcStore.advancedTuning.acroTrainerAngleLimit)
            .push16(fcStore.advancedTuning.feedforwardRoll)
            .push16(fcStore.advancedTuning.feedforwardPitch)
            .push16(fcStore.advancedTuning.feedforwardYaw)
            .push8(fcStore.advancedTuning.antiGravityMode)
            .push8(fcStore.advancedTuning.dMaxRoll)
            .push8(fcStore.advancedTuning.dMaxPitch)
            .push8(fcStore.advancedTuning.dMaxYaw)
            .push8(fcStore.advancedTuning.dMaxGain)
            .push8(fcStore.advancedTuning.dMaxAdvance)
            .push8(fcStore.advancedTuning.useIntegratedYaw)
            .push8(fcStore.advancedTuning.integratedYawRelax);

        // Introduced in 1.42
        buffer.push8(fcStore.advancedTuning.itermRelaxCutoff);

        // Introduced in 1.43
        buffer
            .push8(fcStore.advancedTuning.motorOutputLimit)
            .push8(fcStore.advancedTuning.autoProfileCellCount)
            .push8(fcStore.advancedTuning.idleMinRpm);

        // Introduced in 1.44
        buffer
            .push8(fcStore.advancedTuning.feedforward_averaging)
            .push8(fcStore.advancedTuning.feedforward_smooth_factor)
            .push8(fcStore.advancedTuning.feedforward_boost)
            .push8(fcStore.advancedTuning.feedforward_max_rate_limit)
            .push8(fcStore.advancedTuning.feedforward_jitter_factor)
            .push8(fcStore.advancedTuning.vbat_sag_compensation)
            .push8(fcStore.advancedTuning.thrustLinearization);

        // Introduced in 1.45
        buffer.push8(fcStore.advancedTuning.tpaMode ?? 0);
        buffer.push8(Math.round(fcStore.advancedTuning.tpaRate * 100));
        buffer.push16(fcStore.advancedTuning.tpaBreakpoint);
    },

    [MSPCodes.MSP_SET_SENSOR_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        buffer.push8(fcStore.sensorConfig.acc_hardware);
        buffer.push8(fcStore.sensorConfig.baro_hardware);
        buffer.push8(fcStore.sensorConfig.mag_hardware);
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            buffer.push8(fcStore.sensorConfig.sonar_hardware);
            buffer.push8(fcStore.sensorConfig.opticalflow_hardware);
        }
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_49)) {
            buffer.push8(fcStore.sensorConfig.pitot_hardware);
        }
    },

    [MSPCodes.MSP_SET_NAME](buffer) {
        const fcStore = useFlightControllerStore();
        const MSP_BUFFER_SIZE = 64;
        for (let i = 0; i < fcStore.config.name.length && i < MSP_BUFFER_SIZE; i++) {
            buffer.push8(fcStore.config.name.codePointAt(i)!);
        }
    },

    [MSPCodes.MSP2_GET_TEXT](buffer, modifierCode) {
        buffer.push8(modifierCode ?? 0);
    },

    [MSPCodes.MSP2_SET_TEXT](buffer, modifierCode) {
        const fcStore = useFlightControllerStore();
        switch (modifierCode) {
            case MSP2TextType.PILOT_NAME:
                this.setText(buffer, modifierCode, fcStore.config.pilotName, 16);
                break;
            case MSP2TextType.CRAFT_NAME:
                this.setText(buffer, modifierCode, fcStore.config.craftName, 16);
                break;
            case MSP2TextType.PID_PROFILE_NAME:
                this.setText(buffer, modifierCode, fcStore.config.pidProfileNames[fcStore.config.profile], 8);
                break;
            case MSP2TextType.RATE_PROFILE_NAME:
                this.setText(buffer, modifierCode, fcStore.config.rateProfileNames[fcStore.config.rateProfile], 8);
                break;
            case MSP2TextType.BATTERY_PROFILE_NAME:
                this.setText(
                    buffer,
                    modifierCode,
                    fcStore.config.batteryProfileNames[fcStore.config.batteryProfile],
                    8,
                );
                break;
            default:
                console.log("Unsupported text type");
                break;
        }
    },

    [MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES]: NOTHING_TO_DO,

    [MSPCodes.MSP_SET_BLACKBOX_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.blackbox.blackboxDevice)
            .push8(fcStore.blackbox.blackboxRateNum)
            .push8(fcStore.blackbox.blackboxRateDenom)
            .push16(fcStore.blackbox.blackboxPDenom);

        // Introduced in 1.44
        buffer.push8(fcStore.blackbox.blackboxSampleRate);

        // Introduced in 1.45
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            buffer.push32(fcStore.blackbox.blackboxDisabledMask);
        }
    },

    [MSPCodes.MSP_COPY_PROFILE](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.copyProfile.type)
            .push8(fcStore.copyProfile.dstProfile)
            .push8(fcStore.copyProfile.srcProfile);
    },

    [MSPCodes.MSP_ARMING_DISABLE](buffer) {
        const fcStore = useFlightControllerStore();
        let value;
        if (fcStore.config.armingDisabled) {
            value = 1;
        } else {
            value = 0;
        }
        buffer.push8(value);

        if (fcStore.config.runawayTakeoffPreventionDisabled) {
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
        const fcStore = useFlightControllerStore();
        buffer
            .push16(fcStore.vtxConfig.vtx_frequency)
            .push8(fcStore.vtxConfig.vtx_power)
            .push8(fcStore.vtxConfig.vtx_pit_mode ? 1 : 0)
            .push8(fcStore.vtxConfig.vtx_low_power_disarm);

        // Introduced in 1.42
        buffer
            .push16(fcStore.vtxConfig.vtx_pit_mode_frequency)
            .push8(fcStore.vtxConfig.vtx_band)
            .push8(fcStore.vtxConfig.vtx_channel)
            .push16(fcStore.vtxConfig.vtx_frequency)
            .push8(fcStore.vtxConfig.vtx_table_bands)
            .push8(fcStore.vtxConfig.vtx_table_channels)
            .push8(fcStore.vtxConfig.vtx_table_powerlevels)
            .push8(fcStore.vtxConfig.vtx_table_clear ? 1 : 0);
    },

    [MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.vtxTablePowerLevel.vtxtable_powerlevel_number)
            .push16(fcStore.vtxTablePowerLevel.vtxtable_powerlevel_value)
            .push8(fcStore.vtxTablePowerLevel.vtxtable_powerlevel_label.length);

        for (let i = 0; i < fcStore.vtxTablePowerLevel.vtxtable_powerlevel_label.length; i++) {
            buffer.push8(fcStore.vtxTablePowerLevel.vtxtable_powerlevel_label.codePointAt(i)!);
        }
    },

    [MSPCodes.MSP_SET_VTXTABLE_BAND](buffer) {
        const fcStore = useFlightControllerStore();
        buffer.push8(fcStore.vtxTableBand.vtxtable_band_number);

        buffer.push8(fcStore.vtxTableBand.vtxtable_band_name.length);
        for (let i = 0; i < fcStore.vtxTableBand.vtxtable_band_name.length; i++) {
            buffer.push8(fcStore.vtxTableBand.vtxtable_band_name.codePointAt(i)!);
        }

        if (fcStore.vtxTableBand.vtxtable_band_letter != "") {
            buffer.push8(fcStore.vtxTableBand.vtxtable_band_letter.codePointAt(0)!);
        } else {
            buffer.push8(" ".codePointAt(0)!);
        }
        buffer.push8(fcStore.vtxTableBand.vtxtable_band_is_factory_band ? 1 : 0);

        buffer.push8(fcStore.vtxTableBand.vtxtable_band_frequencies.length);
        for (const frequency of fcStore.vtxTableBand.vtxtable_band_frequencies) {
            buffer.push16(frequency);
        }
    },

    [MSPCodes.MSP_MULTIPLE_MSP](buffer) {
        const fcStore = useFlightControllerStore();
        while (fcStore.multipleMsp.msp_commands.length > 0) {
            const mspCommand = fcStore.multipleMsp.msp_commands.shift()!;
            this.mspMultipleCache.push(mspCommand);
            buffer.push8(mspCommand);
        }
    },

    [MSPCodes.MSP2_SET_MOTOR_OUTPUT_REORDERING](buffer) {
        const fcStore = useFlightControllerStore();
        buffer.push8(fcStore.motorOutputOrder.length);
        for (const motorIndex of fcStore.motorOutputOrder) {
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
        const fcStore = useFlightControllerStore();
        for (let i = 0; i < 3; i++) {
            buffer.push8(fcStore.wingConfig.s_term[i]);
        }
        for (let i = 0; i < 3; i++) {
            buffer.push16(fcStore.wingConfig.spa_center[i]);
        }
        for (let i = 0; i < 3; i++) {
            buffer.push16(fcStore.wingConfig.spa_width[i]);
        }
        for (let i = 0; i < 3; i++) {
            buffer.push8(fcStore.wingConfig.spa_mode[i]);
        }
        buffer
            .push8(fcStore.wingConfig.tpa_curve_type)
            .push8(fcStore.wingConfig.tpa_curve_stall_throttle)
            .push16(fcStore.wingConfig.tpa_curve_pid_thr0)
            .push16(fcStore.wingConfig.tpa_curve_pid_thr100)
            .push8(fcStore.wingConfig.tpa_curve_expo)
            .push8(fcStore.wingConfig.tpa_speed_type)
            .push16(fcStore.wingConfig.tpa_speed_basic_delay)
            .push16(fcStore.wingConfig.tpa_speed_basic_gravity)
            .push16(fcStore.wingConfig.tpa_speed_adv_prop_pitch)
            .push16(fcStore.wingConfig.tpa_speed_adv_mass)
            .push16(fcStore.wingConfig.tpa_speed_adv_drag_k)
            .push16(fcStore.wingConfig.tpa_speed_adv_thrust)
            .push16(fcStore.wingConfig.tpa_speed_max_voltage)
            .push16(fcStore.wingConfig.tpa_speed_pitch_offset)
            .push8(fcStore.wingConfig.yaw_type)
            .push16(fcStore.wingConfig.angle_pitch_offset);
    },

    [MSPCodes.MSP_SET_PSAS_CONFIG](buffer) {
        const fcStore = useFlightControllerStore();
        buffer
            .push8(fcStore.psasConfig.stick_gain[0])
            .push8(fcStore.psasConfig.stick_gain[1])
            .push8(fcStore.psasConfig.stick_gain[2])
            .push16(fcStore.psasConfig.damping_gain[0])
            .push16(fcStore.psasConfig.damping_gain[1])
            .push16(fcStore.psasConfig.damping_gain[2])
            .push16(fcStore.psasConfig.pitch_damping_filter_freq)
            .push8(fcStore.psasConfig.accel_z_filter_freq)
            .push16(fcStore.psasConfig.pitch_stability_gain)
            .push16(fcStore.psasConfig.pitch_accel_p_gain)
            .push8(fcStore.psasConfig.pitch_accel_i_gain)
            .push8(fcStore.psasConfig.pitch_accel_max)
            .push8(fcStore.psasConfig.pitch_accel_min)
            .push16(fcStore.psasConfig.yaw_damping_filter_freq)
            .push8(fcStore.psasConfig.accel_y_filter_freq)
            .push16(fcStore.psasConfig.yaw_stability_gain)
            .push16(fcStore.psasConfig.wing_load)
            .push16(fcStore.psasConfig.air_density)
            .push8(fcStore.psasConfig.lift_c_limit)
            .push8(fcStore.psasConfig.aoa_limiter_gain)
            .push8(fcStore.psasConfig.lift_coef_filter_freq)
            .push8(fcStore.psasConfig.aoa_limiter_forecast_time)
            .push8(fcStore.psasConfig.aoa_limiter_tau_return)
            .push16(fcStore.psasConfig.servo_time)
            .push8(fcStore.psasConfig.roll_yaw_clift_start)
            .push8(fcStore.psasConfig.roll_yaw_clift_stop)
            .push8(fcStore.psasConfig.roll_to_yaw_link)
            .push8(fcStore.psasConfig.speed_main_curve_enable[0])
            .push8(fcStore.psasConfig.speed_main_curve_enable[1])
            .push8(fcStore.psasConfig.speed_main_curve_enable[2])
            .push8(fcStore.psasConfig.speed_stick_curve_enable[0])
            .push8(fcStore.psasConfig.speed_stick_curve_enable[1])
            .push8(fcStore.psasConfig.speed_stick_curve_enable[2])
            .push8(fcStore.psasConfig.speed_optimum_vref)
            .push8(fcStore.psasConfig.speed_main_curve_power)
            .push8(fcStore.psasConfig.speed_roll_stick_curve_power)
            .push16(fcStore.psasConfig.speed_main_curve_min)
            .push16(fcStore.psasConfig.speed_main_curve_max)
            .push16(fcStore.psasConfig.speed_stick_curve_min)
            .push16(fcStore.psasConfig.speed_stick_curve_max)
            .push8(fcStore.psasConfig.speed_curve_mode);
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
