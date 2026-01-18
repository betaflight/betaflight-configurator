import { reactive } from "vue";
import { get as getConfig } from "../js/ConfigStorage";
import GUI from "../js/gui";
import ConfigInserter from "../js/ConfigInserter";
import { tracking } from "../js/Analytics";
import read_hex_file from "../js/workers/hex_parser";
import STM32 from "../js/protocols/webstm32";
import DFU from "../js/protocols/webusbdfu";
import PortHandler from "../js/port_handler";

/**
 * A composable for managing firmware flashing operations.
 * Handles firmware state, parsing, and flashing workflows.
 *
 * @param {Object} params - Configuration object
 * @param {Function} params.flashingMessage - Callback to display flashing messages
 * @param {Function} params.flashProgress - Callback to update flash progress
 * @param {Object} params.FLASH_MESSAGE_TYPES - Flash message types enum
 * @param {Function} params.$t - Translation function
 * @param {string} params.logHead - Log prefix for console messages
 */
export function useFirmwareFlashing(params = {}) {
    const { flashingMessage, flashProgress, FLASH_MESSAGE_TYPES, $t, logHead = "[FIRMWARE_FLASHER]" } = params;

    // Reactive firmware state
    const firmwareState = reactive({
        parsedHex: null,
        uf2Binary: null,
        intelHex: null,
    });

    /**
     * Clear all firmware state
     */
    const clearFirmwareState = () => {
        firmwareState.parsedHex = null;
        firmwareState.uf2Binary = null;
        firmwareState.intelHex = null;
    };

    /**
     * Parse HEX string into structured firmware data
     */
    const parseHex = async (hexString) => {
        return await read_hex_file(hexString);
    };

    /**
     * Process HEX firmware data (from file or HTTP) and parse it
     */
    const processHex = async (data, options) => {
        const { enableFlashButton, enableLoadRemoteFileButton, showLoadedFirmware, key, isLocalFile } = options;

        console.log(`${logHead} processHex called with data type:`, typeof data);

        // Handle string data directly (for local .hex files which are text)
        let intelHex;
        if (typeof data === "string") {
            intelHex = data;
            console.log(`${logHead} Using string data directly, length:`, intelHex.length);
        } else {
            // Convert binary data to string
            const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null;

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
            intelHex = decoder.decode(bytes);
        }

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
                return { intelHex, parsedHex: parsedHexData, firmwareType: "HEX" };
            } else {
                flashingMessage?.($t?.("firmwareFlasherHexCorrupted"), FLASH_MESSAGE_TYPES?.INVALID);
                enableFlashButton?.(false);
                return null;
            }
        } catch (error) {
            flashingMessage?.($t?.("firmwareFlasherHexCorrupted"), FLASH_MESSAGE_TYPES?.INVALID);
            enableFlashButton?.(false);
            return null;
        }
    };

    /**
     * Process UF2 firmware binary data
     */
    const processUf2 = async (data, options) => {
        const { enableLoadRemoteFileButton, showLoadedFirmware, key, isLocalFile } = options;

        const toBytes = (buf) => {
            return buf instanceof Uint8Array
                ? buf
                : buf instanceof ArrayBuffer
                    ? new Uint8Array(buf)
                    : buf.arrayBuffer
                        ? new Uint8Array(buf.arrayBuffer ? undefined : buf)
                        : buf;
        };

        const bytes = data
            ? data instanceof Blob
                ? new Uint8Array(await data.arrayBuffer())
                : toBytes(data)
            : undefined;

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
        return { uf2Binary: bytes, firmwareType: "UF2" };
    };

    /**
     * Process firmware file (HEX or UF2) based on extension
     */
    const processFirmware = async (data, extension, options) => {
        const { enableFlashButton, enableLoadRemoteFileButton, showLoadedFirmware, key } = options;

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
                });
            } else if (fileExtension === "uf2") {
                return await processUf2(data, {
                    enableLoadRemoteFileButton,
                    showLoadedFirmware,
                    key,
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
    const flashHexFirmware = async (options) => {
        const {
            firmware,
            eraseChip,
            noRebootSequence,
            flashManualBaud,
            flashManualBaudRate,
            filename,
            resetFlashingState,
        } = options;

        const flashing_options = {
            flashingMessage,
            flashProgress,
            flashMessageTypes: FLASH_MESSAGE_TYPES,
        };

        if (eraseChip) {
            flashing_options.erase_chip = true;
        }

        const port = PortHandler.portPicker.selectedPort;
        const isSerial = port.startsWith("serial");
        const isDFU = port.startsWith("usb");

        console.log(`${logHead} Selected port:`, port);

        if (isDFU) {
            tracking.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, "DFU Flashing", {
                filename: filename || null,
            });
            DFU.connect(port, firmware, flashing_options);
        } else if (isSerial) {
            if (noRebootSequence) {
                flashing_options.no_reboot = true;
            } else {
                flashing_options.reboot_baud = PortHandler.portPicker.selectedBauds;
            }

            let baud = 115200;
            if (flashManualBaud) {
                baud = Number.parseInt(flashManualBaudRate) || 115200;
            }

            tracking.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, "Flashing", {
                filename: filename || null,
            });

            STM32.connect(port, baud, firmware, flashing_options);
        } else {
            console.log(`${logHead} No valid port detected, asking for permissions`);

            DFU.requestPermission()
                .then((device) => {
                    DFU.connect(device.path, firmware, flashing_options);
                })
                .catch((error) => {
                    console.error("Permission request failed", error);
                    resetFlashingState?.();
                });
        }

        GUI.interval_resume("sponsor");
    };

    /**
     * Executes the flashing sequence for HEX firmware, including optional config insertion
     */
    const startFlashing = async (options) => {
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
            });
        } catch (e) {
            console.log(`${logHead} Flashing failed: ${e.message}`);
        }

        setFlashOnConnect?.(false);
    };

    /**
     * Orchestrates the flash workflow triggered by the Flash Firmware button
     */
    const runFlashWorkflow = async (options) => {
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

        const report = (stage, extra = {}) => {
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
            tracking.sendEvent(tracking.EVENT_CATEGORIES.FLASHING, "UF2 Flashing", {
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

        const flashOnConnectEnabled = !!flashOnConnect;

        // Either flash-on-connect or no available port falls back to immediate flashing
        if (flashOnConnectEnabled || !portAvailable) {
            report("flash-now", { flashOnConnect: flashOnConnectEnabled, portAvailable });
            await startFlashingCallback?.();
            return;
        }

        const backupOnFlash = getConfig("backupOnFlash", 1).backupOnFlash;
        report("backup-decision", { backupOnFlash });

        switch (backupOnFlash) {
            case 1:
                startBackup?.(initiateFlashing);
                break;
            case 2:
                GUI.showYesNoDialog({
                    title: $t?.("firmwareFlasherRemindBackupTitle"),
                    text: $t?.("firmwareFlasherRemindBackup"),
                    buttonYesText: $t?.("firmwareFlasherBackup"),
                    buttonNoText: $t?.("firmwareFlasherBackupIgnore"),
                    buttonYesCallback: () => {
                        startBackup?.(initiateFlashing);
                    },
                    buttonNoCallback: initiateFlashing,
                });
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
    const exitDfu = async (options) => {
        const { dfuExitButtonDisabled, connectLock } = options;

        if (!dfuExitButtonDisabled && !connectLock) {
            try {
                console.log(`${logHead} Closing DFU`);
                DFU.requestPermission().then((device) => {
                    DFU.connect(device.path, firmwareState.parsedHex, {
                        exitDfu: true,
                        flashingMessage,
                        flashProgress,
                        flashMessageTypes: FLASH_MESSAGE_TYPES,
                    });
                });
            } catch (e) {
                console.log(`${logHead} Exiting DFU failed: ${e.message}`);
            }
        }
    };

    /**
     * Setup EventBus listeners for device events
     */
    const setupFlashingEventListeners = (options) => {
        const { flashOnConnect, onBoardChange, clearBufferedFirmware, updateDfuExitButtonState } = options;

        const detectedUsbDevice = (device) => {
            const isFlashOnConnect = flashOnConnect;

            console.log(`${logHead} Detected USB device:`, device);

            updateDfuExitButtonState?.();

            if (GUI.connect_lock && !STM32.rebootMode) {
                console.log(`${logHead} Port event ignored due to active operation (connect_lock)`);
                return;
            }

            if (STM32.rebootMode || isFlashOnConnect) {
                const wasReboot = !!STM32.rebootMode;
                STM32.rebootMode = 0;
                if (wasReboot) {
                    GUI.connect_lock = false;
                }
            }
        };

        const onDeviceRemoved = async (devicePath) => {
            console.log(`${logHead} Device removed:`, devicePath);

            if (GUI.connect_lock || STM32.rebootMode) {
                return;
            }

            await onBoardChange("0");
            clearBufferedFirmware();
        };

        return { detectedUsbDevice, onDeviceRemoved };
    };

    return {
        // State
        firmwareState,

        // Getters (for backward compatibility)
        getParsedHex: () => firmwareState.parsedHex,
        getUf2Binary: () => firmwareState.uf2Binary,
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
export const cleanUnifiedConfigFile = (input, options) => {
    const { flashingMessage, gui_log, t, flashMessageTypes } = options;

    let output = [];
    let inComment = false;

    for (let i = 0; i < input.length; i++) {
        if (input.charAt(i) === "\n" || input.charAt(i) === "\r") {
            inComment = false;
        }

        if (input.charAt(i) === "#") {
            inComment = true;
        }

        if (!inComment && input.codePointAt(i) > 255) {
            flashingMessage?.(t?.("firmwareFlasherConfigCorrupted"), flashMessageTypes?.INVALID);
            gui_log?.(t?.("firmwareFlasherConfigCorruptedLogMessage"));
            return null;
        }

        if (input.codePointAt(i) > 255) {
            output.push("_");
        } else {
            output.push(input.charAt(i));
        }
    }

    return output.join("").split("\n");
};
