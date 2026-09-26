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

import { reactive } from "vue";
import { get as getConfig } from "../js/ConfigStorage";
import { useDialog } from "./useDialog";
import GUI from "../js/gui";
import ConfigInserter from "../js/ConfigInserter";
import { getTracking } from "../js/Analytics";
import read_hex_file from "../js/workers/hex_parser";
import STM32 from "../js/protocols/webstm32";
import ESP32 from "../js/protocols/esp32";
import DeviceHandler from "../js/device_handler";
import { getConnectionState } from "../js/connection_state";
import type { ParsedHex } from "../js/workers/hex_parser";
import type { STM32FlashOptions } from "../js/protocols/webstm32";

type Translate = (key: string, params?: Record<string, unknown>) => string;
type FlashingMessage = (message: string | null, type: string) => unknown;
type FlashProgress = (value: number) => unknown;

export type FlashMessageType = "NEUTRAL" | "VALID" | "INVALID" | "ACTION" | "ERASING" | "FLASHING" | "VERIFYING";
export type FlashMessageTypes = Record<FlashMessageType, string>;
export type FirmwareType = "HEX" | "UF2" | "BIN";

/** Raw firmware as it arrives: text for a local .hex, bytes or a Blob otherwise. */
export type FirmwareData = string | ArrayBuffer | Uint8Array | Blob;

export type ShowDialogVerifyBoard = NonNullable<STM32FlashOptions["showDialogVerifyBoard"]>;

export interface FirmwareFlashingParams {
    flashingMessage: FlashingMessage;
    flashProgress: FlashProgress;
    FLASH_MESSAGE_TYPES: FlashMessageTypes;
    $t: Translate;
    logHead?: string;
}

export interface ProcessFirmwareOptions {
    enableFlashButton?: (enabled: boolean) => void;
    enableLoadRemoteFileButton?: (enabled: boolean) => void;
    showLoadedFirmware?: (filename: string, bytes: number) => void;
    key: string;
    isLocalFile?: boolean;
}

export type ProcessFirmwareResult =
    | { intelHex: string; parsedHex: ParsedHex; firmwareType: "HEX" }
    | { uf2Binary: Uint8Array; firmwareType: "UF2" }
    | { espBinary: Uint8Array; firmwareType: "BIN" };

interface HexFlashSettings {
    eraseChip?: boolean;
    noRebootSequence?: boolean;
    flashManualBaud?: boolean;
    flashManualBaudRate?: number;
    filename?: string | null;
    resetFlashingState?: () => void;
    selectedBoard?: string;
    localFirmwareLoaded?: boolean;
    showDialogVerifyBoard?: ShowDialogVerifyBoard;
}

export interface StartFlashingOptions extends HexFlashSettings {
    /** The board config text, or `{}` when none is loaded (FlasherState.config). */
    config?: string | Record<string, never>;
    clearBoardConfig?: () => void;
    setFlashOnConnect?: (value: boolean) => void;
}

export interface FlashWorkflowOptions {
    connectLock?: boolean;
    firmwareType?: FirmwareType;
    filename?: string | null;
    flashOnConnect?: boolean;
    portAvailable?: boolean;
    dfuAvailable?: boolean;
    preservePreFlashingState?: () => void;
    pauseSponsorInterval?: () => void;
    resumeSponsorInterval?: () => void;
    enableFlashButton?: (enabled: boolean) => void;
    enableDfuExitButton?: (enabled: boolean | undefined) => void;
    enableLoadRemoteFileButton?: (enabled: boolean) => void;
    enableLoadFileButton?: (enabled: boolean) => void;
    saveFirmware?: () => Promise<boolean>;
    startFlashing?: () => Promise<void>;
    startBackup?: (callback: () => Promise<void>) => void;
    initiateFlashing: () => Promise<void>;
    progressCallback?: (progress: { stage: string; [key: string]: unknown }) => void;
}

export interface FlashingEventListenerOptions {
    getFlashOnConnect: () => boolean;
    onBoardChange: (board: string) => unknown;
    clearBufferedFirmware?: () => void;
    updateDfuExitButtonState?: () => void;
    initiateFlashing?: () => unknown;
    startFlashing?: () => unknown;
}

function errorMessageOf(error: unknown) {
    return error instanceof Error ? error.message : undefined;
}

/**
 * A composable for managing firmware flashing operations.
 * Handles firmware state, parsing, and flashing workflows.
 */
export function useFirmwareFlashing(params: FirmwareFlashingParams) {
    const { flashingMessage, flashProgress, FLASH_MESSAGE_TYPES, $t, logHead = "[FIRMWARE_FLASHER]" } = params;
    const dialog = useDialog();

    // Reactive firmware state
    const firmwareState = reactive({
        parsedHex: null as ParsedHex | null,
        uf2Binary: null as Uint8Array | null,
        espBinary: null as Uint8Array | null,
        intelHex: null as string | null,
    });

    /**
     * Clear all firmware state
     */
    const clearFirmwareState = () => {
        firmwareState.parsedHex = null;
        firmwareState.uf2Binary = null;
        firmwareState.espBinary = null;
        firmwareState.intelHex = null;
    };

    /**
     * Parse HEX string into structured firmware data
     */
    const parseHex = (hexString: string) => {
        return read_hex_file(hexString);
    };

    /**
     * Convert data to bytes (Uint8Array)
     */
    const convertToBytes = (data: FirmwareData) => {
        if (data instanceof Uint8Array) {
            return data;
        }
        if (data instanceof ArrayBuffer) {
            return new Uint8Array(data);
        }
        return null;
    };

    /**
     * Convert HEX data to string format
     */
    const convertHexDataToString = (
        data: FirmwareData,
        options: Pick<ProcessFirmwareOptions, "key" | "isLocalFile" | "enableLoadRemoteFileButton">,
    ) => {
        const { key, isLocalFile, enableLoadRemoteFileButton } = options;

        // Handle string data directly (for local .hex files which are text)
        if (typeof data === "string") {
            console.log(`${logHead} Using string data directly, length:`, data.length);
            return data;
        }

        // Convert binary data to string
        const bytes = convertToBytes(data);
        if (!bytes || bytes.byteLength === 0) {
            console.error(`${logHead} Failed: bytes is null or empty`);
            const errorMessage = isLocalFile
                ? `Failed to load ${key}`
                : $t?.("firmwareFlasherFailedToLoadOnlineFirmware");
            flashingMessage?.(errorMessage, FLASH_MESSAGE_TYPES?.NEUTRAL);
            enableLoadRemoteFileButton?.(true);
            return null;
        }

        const decoder = new TextDecoder("utf-8");
        return decoder.decode(bytes);
    };

    /**
     * Process HEX firmware data (from file or HTTP) and parse it
     */
    const processHex = async (data: FirmwareData, options: ProcessFirmwareOptions) => {
        const { enableFlashButton, enableLoadRemoteFileButton, showLoadedFirmware, key, isLocalFile } = options;

        console.log(`${logHead} processHex called with data type:`, typeof data);

        const intelHex = convertHexDataToString(data, { key, isLocalFile, enableLoadRemoteFileButton });

        if (!intelHex || intelHex.length === 0) {
            console.error(`${logHead} Failed: intelHex is empty`);
            const errorMessage = isLocalFile
                ? `Failed to load ${key}`
                : $t?.("firmwareFlasherFailedToLoadOnlineFirmware");
            flashingMessage?.(errorMessage, FLASH_MESSAGE_TYPES?.NEUTRAL);
            enableLoadRemoteFileButton?.(true);
            return null;
        }

        try {
            const parsedHexData = await parseHex(intelHex);

            if (parsedHexData) {
                firmwareState.parsedHex = parsedHexData;
                firmwareState.intelHex = intelHex;
                showLoadedFirmware?.(key, parsedHexData.bytes_total);
                return { intelHex, parsedHex: parsedHexData, firmwareType: "HEX" as const };
            } else {
                flashingMessage?.($t?.("firmwareFlasherHexCorrupted"), FLASH_MESSAGE_TYPES?.INVALID);
                enableFlashButton?.(false);
                return null;
            }
        } catch (error) {
            console.error(`${logHead} Error parsing HEX:`, error);
            flashingMessage?.($t?.("firmwareFlasherHexCorrupted"), FLASH_MESSAGE_TYPES?.INVALID);
            enableFlashButton?.(false);
            return null;
        }
    };

    /**
     * Process UF2 firmware binary data
     */
    const processUf2 = async (data: FirmwareData, options: ProcessFirmwareOptions) => {
        const { enableLoadRemoteFileButton, showLoadedFirmware, key, isLocalFile } = options;

        const toBytes = (buf: string | ArrayBuffer | Uint8Array) => {
            if (buf instanceof Uint8Array) {
                return buf;
            }
            if (buf instanceof ArrayBuffer) {
                return new Uint8Array(buf);
            }
            // A UF2 arrives as a Blob (local file) or bytes (download), never as text; treat text as unreadable.
            return null;
        };

        let bytes;
        if (!data) {
            bytes = undefined;
        } else if (data instanceof Blob) {
            bytes = new Uint8Array(await data.arrayBuffer());
        } else {
            bytes = toBytes(data);
        }

        if (!bytes || bytes.byteLength === 0) {
            const errorMessage = isLocalFile
                ? `Failed to load ${key}`
                : $t?.("firmwareFlasherFailedToLoadOnlineFirmware");
            flashingMessage?.(errorMessage, FLASH_MESSAGE_TYPES?.NEUTRAL);
            enableLoadRemoteFileButton?.(true);
            return null;
        }

        firmwareState.uf2Binary = bytes;
        showLoadedFirmware?.(key, bytes.byteLength);
        return { uf2Binary: bytes, firmwareType: "UF2" as const };
    };

    /**
     * Process a raw ESP32 .bin firmware image (merged image flashed at offset 0x0)
     */
    const processBin = async (data: FirmwareData, options: ProcessFirmwareOptions) => {
        const { enableLoadRemoteFileButton, showLoadedFirmware, key, isLocalFile } = options;

        let bytes;
        if (!data) {
            bytes = null;
        } else if (data instanceof Blob) {
            bytes = new Uint8Array(await data.arrayBuffer());
        } else if (data instanceof ArrayBuffer) {
            bytes = new Uint8Array(data);
        } else if (data instanceof Uint8Array) {
            bytes = data;
        } else {
            bytes = null;
        }

        if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
            const errorMessage = isLocalFile
                ? `Failed to load ${key}`
                : $t?.("firmwareFlasherFailedToLoadOnlineFirmware");
            flashingMessage?.(errorMessage, FLASH_MESSAGE_TYPES?.NEUTRAL);
            enableLoadRemoteFileButton?.(true);
            return null;
        }

        firmwareState.espBinary = bytes;
        showLoadedFirmware?.(key, bytes.byteLength);
        return { espBinary: bytes, firmwareType: "BIN" as const };
    };

    /**
     * Process firmware file (HEX, UF2 or ESP32 BIN) based on extension
     */
    const processFirmware = async (
        data: FirmwareData | null | undefined,
        extension: string | undefined,
        options: ProcessFirmwareOptions,
    ): Promise<ProcessFirmwareResult | null> => {
        const { enableFlashButton, enableLoadRemoteFileButton, showLoadedFirmware, key, isLocalFile } = options;

        if (!data || !key) {
            flashingMessage?.($t?.("firmwareFlasherFailedToLoadOnlineFirmware"), FLASH_MESSAGE_TYPES?.NEUTRAL);
            enableLoadRemoteFileButton?.(true);
            return null;
        }

        const fileExtension = extension?.toLowerCase();

        try {
            if (fileExtension === "hex") {
                return await processHex(data, {
                    enableFlashButton,
                    enableLoadRemoteFileButton,
                    showLoadedFirmware,
                    key,
                    isLocalFile,
                });
            } else if (fileExtension === "uf2") {
                return await processUf2(data, {
                    enableLoadRemoteFileButton,
                    showLoadedFirmware,
                    key,
                    isLocalFile,
                });
            } else if (fileExtension === "bin") {
                return await processBin(data, {
                    enableLoadRemoteFileButton,
                    showLoadedFirmware,
                    key,
                    isLocalFile,
                });
            } else {
                flashingMessage?.(
                    $t?.("firmwareFlasherInvalidFileFormat") || "Invalid file format",
                    FLASH_MESSAGE_TYPES?.INVALID,
                );
                enableLoadRemoteFileButton?.(true);
                return null;
            }
        } catch (error) {
            console.error(`${logHead} Error processing firmware:`, error);
            flashingMessage?.($t?.("firmwareFlasherFailedToLoadOnlineFirmware"), FLASH_MESSAGE_TYPES?.INVALID);
            enableLoadRemoteFileButton?.(true);
            return null;
        }
    };

    /**
     * Flash HEX firmware via selected port (DFU or Serial)
     */
    const flashHexFirmware = async (options: HexFlashSettings & { firmware: ParsedHex }) => {
        const {
            firmware,
            eraseChip,
            noRebootSequence,
            flashManualBaud,
            flashManualBaudRate,
            filename,
            resetFlashingState,
            selectedBoard,
            localFirmwareLoaded,
            showDialogVerifyBoard,
        } = options;

        const flashing_options: STM32FlashOptions & Record<string, unknown> = {
            flashingMessage,
            flashProgress,
            flashMessageTypes: FLASH_MESSAGE_TYPES,
            selectedBoard,
            localFirmwareLoaded,
            showDialogVerifyBoard,
        };

        if (eraseChip) {
            flashing_options.erase_chip = true;
        }

        const port = DeviceHandler.devicePicker.selectedDevice;
        const isSerial = port.startsWith("serial") || port.startsWith("capacitor-");
        const isDFU = port.startsWith("usb");

        console.log(`${logHead} Selected port:`, port);

        if (isDFU) {
            const tracking = getTracking();
            tracking?.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, "DFU Flashing", {
                filename: filename || null,
            });
            DeviceHandler.dfuProtocol.connect(port, firmware, flashing_options);
        } else if (isSerial) {
            if (noRebootSequence) {
                flashing_options.no_reboot = true;
            } else {
                flashing_options.reboot_baud = DeviceHandler.devicePicker.selectedBauds;
            }

            let baud = 115200;
            if (flashManualBaud) {
                baud = Number.parseInt(String(flashManualBaudRate)) || 115200;
            }

            const tracking = getTracking();
            tracking?.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, "Flashing", {
                filename: filename || null,
            });

            STM32.connect(port, baud, firmware, flashing_options);
        } else {
            console.log(`${logHead} No valid port detected, asking for permissions`);

            DeviceHandler.dfuProtocol
                .requestPermission()
                .then((device) => {
                    DeviceHandler.dfuProtocol.connect(device.path, firmware, flashing_options);
                })
                .catch((error) => {
                    console.error("Permission request failed", error);
                    resetFlashingState?.();
                });
        }
    };

    /**
     * Flash a raw ESP32 .bin image over the serial ROM bootloader (browser Web Serial only).
     */
    const flashEspFirmware = async (options: { filename?: string | null } = {}) => {
        const { filename } = options;

        const image = firmwareState.espBinary;
        if (!image) {
            flashingMessage?.($t?.("firmwareFlasherFirmwareNotLoaded"), FLASH_MESSAGE_TYPES?.INVALID);
            return false;
        }

        const tracking = getTracking();
        tracking?.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, "ESP32 Flashing", {
            filename: filename || null,
        });

        // Let ESP32.connect() own environment gating (Web Serial only) and port
        // validation, so the correct message is shown on Tauri/Capacitor and when
        // no port is selected.
        const port = DeviceHandler.devicePicker.selectedDevice;

        // esptool-js connects at the ROM baud (115200) and bumps to this rate after the stub loads.
        const ESP_FLASH_BAUD = 460800;

        return ESP32.connect(port, ESP_FLASH_BAUD, image, {
            flashingMessage,
            flashProgress,
            flashMessageTypes: FLASH_MESSAGE_TYPES,
        });
    };

    /**
     * Executes the flashing sequence for HEX firmware, including optional config insertion
     */
    const startFlashing = async (options: StartFlashingOptions = {}) => {
        const {
            config,
            clearBoardConfig,
            eraseChip,
            noRebootSequence,
            flashManualBaud,
            flashManualBaudRate,
            filename,
            resetFlashingState,
            setFlashOnConnect,
            selectedBoard,
            localFirmwareLoaded,
            showDialogVerifyBoard,
        } = options;

        if (GUI.connect_lock) {
            return;
        }

        const parsedHexData = firmwareState.parsedHex;
        if (!parsedHexData) {
            flashingMessage?.($t?.("firmwareFlasherFirmwareNotLoaded"), FLASH_MESSAGE_TYPES?.NEUTRAL);
            return;
        }

        try {
            if (config && !parsedHexData.configInserted) {
                const configInserter = new ConfigInserter();

                if (configInserter.insertConfig(parsedHexData, config)) {
                    parsedHexData.configInserted = true;
                } else {
                    console.log(`${logHead} Firmware does not support custom defaults.`);
                    clearBoardConfig?.();
                }
            }

            await flashHexFirmware({
                firmware: parsedHexData,
                eraseChip,
                noRebootSequence,
                flashManualBaud,
                flashManualBaudRate,
                filename,
                resetFlashingState,
                selectedBoard,
                localFirmwareLoaded,
                showDialogVerifyBoard,
            });
        } catch (e) {
            console.log(`${logHead} Flashing failed: ${errorMessageOf(e)}`);
        }

        setFlashOnConnect?.(false);
    };

    /**
     * Orchestrates the flash workflow triggered by the Flash Firmware button
     */
    const runFlashWorkflow = async (options: FlashWorkflowOptions) => {
        const {
            connectLock,
            firmwareType,
            filename,
            flashOnConnect,
            portAvailable,
            dfuAvailable,
            preservePreFlashingState,
            pauseSponsorInterval,
            resumeSponsorInterval,
            enableFlashButton,
            enableDfuExitButton,
            enableLoadRemoteFileButton,
            enableLoadFileButton,
            saveFirmware,
            startFlashing: startFlashingCallback,
            startBackup,
            initiateFlashing,
            progressCallback,
        } = options;

        const report = (stage: string, extra: Record<string, unknown> = {}) => {
            if (progressCallback) {
                progressCallback({ stage, ...extra });
            }
        };

        if (connectLock) {
            report("connect-locked");
            return;
        }

        report("start", { firmwareType, flashOnConnect, portAvailable });

        preservePreFlashingState?.();
        pauseSponsorInterval?.();

        enableFlashButton?.(false);
        enableDfuExitButton?.(false);
        enableLoadRemoteFileButton?.(false);
        enableLoadFileButton?.(false);

        // UF2 save-only flow
        if (firmwareType === "UF2") {
            const tracking = getTracking();
            tracking?.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, "UF2 Flashing", {
                filename: filename || null,
            });

            flashProgress?.(50);
            const saved = await saveFirmware?.();
            flashProgress?.(100);

            flashingMessage?.(
                saved ? $t?.("firmwareFlasherUF2SaveSuccess") : $t?.("firmwareFlasherUF2SaveFailed"),
                saved ? FLASH_MESSAGE_TYPES?.VALID : FLASH_MESSAGE_TYPES?.INVALID,
            );

            resumeSponsorInterval?.();
            enableFlashButton?.(true);
            enableLoadRemoteFileButton?.(true);
            enableLoadFileButton?.(true);
            enableDfuExitButton?.(dfuAvailable);

            report("uf2-complete", { saved });
            return;
        }

        // ESP32 .bin flow — flashed over the serial ROM bootloader via esptool-js.
        // Bypasses the STM32 MSP reboot-to-bootloader and the backup machinery.
        if (firmwareType === "BIN") {
            // Hold the connect lock for the duration of the long-running flash so
            // nothing else grabs the port, and always finalise the UI in finally.
            // Also stand the MSP reconnect down and enter FLASHING so the connection state
            // reflects that the flasher owns the port (hard-blocks connect/reboot).
            GUI.connect_lock = true;
            getConnectionState().beginDeviceReplacement();
            try {
                const flashed = await flashEspFirmware({ filename });
                if (!flashed) {
                    flashProgress?.(100);
                }
                report("bin-complete", { flashed });
            } finally {
                GUI.connect_lock = false;
                getConnectionState().endFlashing();
                resumeSponsorInterval?.();
                enableFlashButton?.(true);
                enableLoadRemoteFileButton?.(true);
                enableLoadFileButton?.(true);
                enableDfuExitButton?.(dfuAvailable);
            }
            return;
        }

        const flashOnConnectEnabled = !!flashOnConnect;

        // Either flash-on-connect or no available port falls back to immediate flashing
        if (flashOnConnectEnabled || !portAvailable) {
            report("flash-now", { flashOnConnect: flashOnConnectEnabled, portAvailable });
            await startFlashingCallback?.();
            return;
        }

        const backupOnFlash = getConfig<number>("backupOnFlash", 1).backupOnFlash;
        report("backup-decision", { backupOnFlash });

        switch (backupOnFlash) {
            case 1:
                startBackup?.(initiateFlashing);
                break;
            case 2:
                dialog.openYesNo(
                    $t?.("firmwareFlasherRemindBackupTitle"),
                    $t?.("firmwareFlasherRemindBackup"),
                    () => startBackup?.(initiateFlashing),
                    initiateFlashing,
                    {
                        yesText: $t?.("firmwareFlasherBackup"),
                        noText: $t?.("firmwareFlasherBackupIgnore"),
                    },
                );
                break;
            default:
                await initiateFlashing?.();
                break;
        }

        report("done");
    };

    /**
     * Exit DFU mode
     */
    const exitDfu = async (options: { dfuExitButtonDisabled?: boolean; connectLock?: boolean } = {}) => {
        const { dfuExitButtonDisabled, connectLock } = options;

        if (!dfuExitButtonDisabled && !connectLock) {
            try {
                console.log(`${logHead} Closing DFU`);
                const device = await DeviceHandler.dfuProtocol.requestPermission();
                if (device) {
                    DeviceHandler.dfuProtocol.connect(device.path, firmwareState.parsedHex, {
                        exitDfu: true,
                        flashingMessage,
                        flashProgress,
                        flashMessageTypes: FLASH_MESSAGE_TYPES,
                    });
                } else {
                    console.log(`${logHead} No DFU device selected`);
                }
            } catch (e) {
                console.log(`${logHead} Exiting DFU failed: ${errorMessageOf(e)}`);
            }
        }
    };

    /**
     * Setup EventBus listeners for device events
     */
    const setupFlashingEventListeners = (options: FlashingEventListenerOptions) => {
        const {
            getFlashOnConnect,
            onBoardChange,
            clearBufferedFirmware,
            updateDfuExitButtonState,
            initiateFlashing,
            startFlashing,
        } = options;

        const detectedUsbDevice = (device: unknown) => {
            const isFlashOnConnect = getFlashOnConnect();

            console.log(
                `${logHead} Detected USB device:`,
                device,
                `rebootMode=${STM32.rebootMode}`,
                `connectLock=${GUI.connect_lock}`,
                `flashOnConnect=${isFlashOnConnect}`,
            );

            updateDfuExitButtonState?.();

            if (GUI.connect_lock && !STM32.rebootMode) {
                console.log(`${logHead} Port event ignored: connect_lock active, no reboot pending`);
                return;
            }

            if (STM32.rebootMode || isFlashOnConnect) {
                const wasReboot = !!STM32.rebootMode;
                STM32.rebootMode = 0;
                if (wasReboot) {
                    GUI.connect_lock = false;
                }
                // After DFU reboot: call startFlashing directly — the unstable firmware
                // dialog was already shown on the initial flash trigger.
                // For flash-on-connect: use initiateFlashing which includes the dialog check.
                if (wasReboot && startFlashing) {
                    console.log(`${logHead} Device rebooted to DFU, starting flash`);
                    startFlashing();
                } else if (isFlashOnConnect && initiateFlashing) {
                    console.log(`${logHead} Flash on connect triggered`);
                    initiateFlashing();
                }
            } else {
                console.log(`${logHead} USB device detected but no reboot pending and flash-on-connect disabled`);
            }
        };

        const onDeviceRemoved = async (devicePath: unknown) => {
            console.log(`${logHead} Device removed:`, devicePath);

            if (GUI.connect_lock || STM32.rebootMode) {
                return;
            }

            await onBoardChange("0");
            clearBufferedFirmware?.();
            updateDfuExitButtonState?.();
        };

        return { detectedUsbDevice, onDeviceRemoved };
    };

    return {
        // State
        firmwareState,

        // Getters (for backward compatibility)
        getParsedHex: () => firmwareState.parsedHex,
        getUf2Binary: () => firmwareState.uf2Binary,
        getEspBinary: () => firmwareState.espBinary,
        getIntelHex: () => firmwareState.intelHex,

        // Methods
        clearFirmwareState,
        processFirmware,
        startFlashing,
        runFlashWorkflow,
        exitDfu,
        setupFlashingEventListeners,
    };
}

/**
 * Clean unified config file by removing comments and handling special characters
 * This is a pure utility function that doesn't need to be part of the composable
 */
export const cleanUnifiedConfigFile = (
    input: string,
    options: {
        flashingMessage?: FlashingMessage;
        gui_log?: (message: string) => void;
        t: Translate;
        flashMessageTypes: FlashMessageTypes;
    },
) => {
    const { flashingMessage, gui_log, t, flashMessageTypes } = options;

    const output: string[] = [];
    let inComment = false;

    for (let i = 0; i < input.length; i++) {
        if (input.charAt(i) === "\n" || input.charAt(i) === "\r") {
            inComment = false;
        }

        if (input.charAt(i) === "#") {
            inComment = true;
        }

        // i < input.length, so codePointAt always returns a number here.
        const codePoint = input.codePointAt(i) ?? 0;
        if (!inComment && codePoint > 255) {
            flashingMessage?.(t?.("firmwareFlasherConfigCorrupted"), flashMessageTypes?.INVALID);
            gui_log?.(t?.("firmwareFlasherConfigCorruptedLogMessage"));
            return null;
        }

        if (codePoint > 255) {
            output.push("_");
        } else {
            output.push(input.charAt(i));
        }
    }

    return output.join("").split("\n");
};
