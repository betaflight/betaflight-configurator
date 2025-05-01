import PortHandler from "../port_handler";
import { gui_log } from "../gui_log";
import { i18n } from "../localization";
import { TABS } from "../gui";
import MspHelper from "../msp/MSPHelper";
import FC from "../fc";
import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import semver from "semver";
import { API_VERSION_1_45, API_VERSION_1_46 } from "../data_storage";
import { serial } from "../serial";

/**
 *
 * Auto-detect firmware flashed and return target
 *
 */

let mspHelper = null;

class AutoDetect {
    constructor() {
        this.board = FC.CONFIG.boardName;
        this.targetAvailable = false;

        // Store bound event handlers to make removal more reliable
        this.boundHandleConnect = this.handleConnect.bind(this);
        this.boundHandleDisconnect = this.handleDisconnect.bind(this);
        this.boundHandleSerialReceive = this.handleSerialReceive.bind(this);
    }

    handleSerialReceive(event) {
        MSP.read(event.detail);
    }

    verifyBoard() {
        const port = PortHandler.portPicker.selectedPort;
        const isLoaded = TABS.firmware_flasher.targets ? Object.keys(TABS.firmware_flasher.targets).length > 0 : false;

        if (!isLoaded) {
            console.log("Releases not loaded yet");
            gui_log(i18n.getMessage("firmwareFlasherNoTargetsLoaded"));
            return;
        }

        if (serial.connected || serial.connectionId) {
            console.warn(
                "Attempting to connect while there still is a connection",
                serial.connected,
                serial.connectionId,
                serial.openCanceled,
            );
            serial.disconnect();
            return;
        }

        gui_log(i18n.getMessage("firmwareFlasherDetectBoardQuery"));

        if (port.startsWith("serial")) {
            serial.addEventListener("connect", this.boundHandleConnect, { once: true });
            serial.addEventListener("disconnect", this.boundHandleDisconnect, { once: true });

            serial.selectProtocol("serial");
            serial.connect(port, { baudRate: 115200 });
        } else {
            gui_log(i18n.getMessage("serialPortOpenFail"));
        }
    }

    handleConnect(event) {
        this.onConnect(event.detail);
    }

    handleDisconnect(event) {
        this.onClosed(event.detail);
    }

    onClosed(result) {
        gui_log(i18n.getMessage(result ? "serialPortClosedOk" : "serialPortClosedFail"));

        if (!this.targetAvailable) {
            gui_log(i18n.getMessage("firmwareFlasherBoardVerificationFail"));
        }
    }

    onFinishClose() {
        const board = FC.CONFIG.boardName;

        if (board) {
            const boardSelect = $('select[name="board"]');
            const boardSelectOptions = $('select[name="board"] option');
            const target = boardSelect.val();

            boardSelectOptions.each((_, e) => {
                if ($(e).text() === board) {
                    this.targetAvailable = true;
                }
            });

            if (board !== target) {
                boardSelect.val(board).trigger("change");
            }

            gui_log(
                i18n.getMessage(
                    this.targetAvailable
                        ? "firmwareFlasherBoardVerificationSuccess"
                        : "firmwareFlasherBoardVerficationTargetNotAvailable",
                    { boardName: board },
                ),
            );
        }

        // Remove event listeners using stored references
        serial.removeEventListener("receive", this.boundHandleSerialReceive);
        serial.removeEventListener("connect", this.boundHandleConnect);
        serial.removeEventListener("disconnect", this.boundHandleDisconnect);

        // Clean up MSP listeners
        MSP.clearListeners();
        MSP.disconnect_cleanup();

        // Disconnect without passing onClosed as a callback
        serial.disconnect();
    }

    async getBoardInfo() {
        await MSP.promise(MSPCodes.MSP_BOARD_INFO);
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            TABS.firmware_flasher.cloudBuildOptions = FC.CONFIG.buildOptions;
        }
        this.onFinishClose();
    }

    async getCloudBuildOptions(options) {
        // Do not use FC.CONFIG.buildOptions here as the object gets destroyed.
        TABS.firmware_flasher.cloudBuildOptions = options.Request.Options;

        await this.getBoardInfo();
    }

    async getBuildInfo() {
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) && FC.CONFIG.flightControllerIdentifier === "BTFL") {
            await MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.BUILD_KEY));
            await MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.CRAFT_NAME));
            await MSP.promise(MSPCodes.MSP_BUILD_INFO);

            // store FC.CONFIG.buildKey as the object gets destroyed after disconnect
            TABS.firmware_flasher.cloudBuildKey = FC.CONFIG.buildKey;

            // 3/21/2024 is the date when the build key was introduced
            const supportedDate = new Date("3/21/2024");
            const buildDate = new Date(FC.CONFIG.buildInfo);

            if (
                TABS.firmware_flasher.validateBuildKey() &&
                (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_46) || buildDate < supportedDate)
            ) {
                return TABS.firmware_flasher.buildApi.requestBuildOptions(
                    TABS.firmware_flasher.cloudBuildKey,
                    this.getCloudBuildOptions.bind(this),
                    this.getBoardInfo.bind(this),
                );
            }
        }

        await this.getBoardInfo();
    }

    async requestBoardInformation() {
        await MSP.promise(MSPCodes.MSP_API_VERSION);
        gui_log(i18n.getMessage("apiVersionReceived", FC.CONFIG.apiVersion));

        if (FC.CONFIG.apiVersion.includes("null") || semver.lt(FC.CONFIG.apiVersion, "1.39.0")) {
            // auto-detect is not supported
            this.onFinishClose();
        } else {
            await MSP.promise(MSPCodes.MSP_FC_VARIANT);
            await this.getBuildInfo();
        }
    }

    onConnect(openInfo) {
        if (openInfo) {
            serial.removeEventListener("receive", this.boundHandleSerialReceive);
            serial.addEventListener("receive", this.boundHandleSerialReceive);

            mspHelper = new MspHelper();
            MSP.listen(mspHelper.process_data.bind(mspHelper));
            this.requestBoardInformation();
        } else {
            gui_log(i18n.getMessage("serialPortOpenFail"));
        }
    }
}

export default new AutoDetect();
