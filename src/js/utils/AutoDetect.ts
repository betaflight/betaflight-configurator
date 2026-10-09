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

import DeviceHandler from "../device_handler";
import { gui_log } from "../gui_log";
import { i18n } from "../localization";
import MspHelper from "../msp/MSPHelper";
import MSP from "../msp";
import MSPCodes, { MSP2TextType } from "../msp/MSPCodes";
import semver from "semver";
import { API_VERSION_1_45, API_VERSION_1_46 } from "../data_storage";
import { serial } from "../serial";
import BuildApi from "../BuildApi";
import { useFlightControllerStore } from "../../stores/fc";

/**
 *
 * Auto-detect firmware flashed and return target
 *
 */

/** One entry of the build API's target list. */
interface BoardTarget {
    target: string;
}

/** Resolves truthy when the detected board is one the caller can build for. */
type BoardDetectedCallback = (boardName: string) => boolean | Promise<boolean>;

let mspHelper: MspHelper | null = null;

class AutoDetect {
    targetAvailable = false;
    cloudBuildOptions?: string[];
    cloudBuildKey?: string;
    private _boardOptions?: BoardTarget[];
    private _onBoardDetected?: BoardDetectedCallback;

    // Store bound event handlers to make removal more reliable
    readonly boundHandleConnect = this.handleConnect.bind(this);
    readonly boundHandleDisconnect = this.handleDisconnect.bind(this);
    readonly boundHandleSerialReceive = this.handleSerialReceive.bind(this);

    handleSerialReceive(event: Event) {
        MSP.read((event as CustomEvent).detail);
    }

    async loadTargetsIfNeeded(): Promise<boolean> {
        if (this._boardOptions && Array.isArray(this._boardOptions) && this._boardOptions.length > 0) {
            return true;
        }

        try {
            const buildApi = new BuildApi();
            this._boardOptions = await buildApi.loadTargets();
            return true;
        } catch (e) {
            console.error("Failed to load targets:", e);
            gui_log(i18n.getMessage("firmwareFlasherNoTargetsLoaded"));
            return false;
        }
    }

    canAttemptConnection(): boolean {
        if (!DeviceHandler.portAvailable) {
            gui_log(i18n.getMessage("firmwareFlasherNoValidPort"));
            return false;
        }

        if (!this._boardOptions || this._boardOptions.length === 0) {
            gui_log(i18n.getMessage("firmwareFlasherNoTargetsLoaded"));
            return false;
        }

        if (serial.connected || serial.connectionId) {
            console.warn("Attempting to connect while there still is a connection", serial.connected);
            gui_log(i18n.getMessage("serialPortOpenFail"));
            return false;
        }

        return true;
    }

    async verifyBoard(onBoardDetected: BoardDetectedCallback): Promise<void> {
        const port = DeviceHandler.devicePicker.selectedDevice;
        if (port.startsWith("virtual")) {
            return;
        }

        const targetsLoaded = await this.loadTargetsIfNeeded();
        if (!targetsLoaded) {
            return;
        }

        if (!this.canAttemptConnection()) {
            return;
        }

        let result: boolean | void = false;
        try {
            // Register listeners just-in-time before connection attempt
            this._onBoardDetected = onBoardDetected;
            serial.addEventListener("connect", this.boundHandleConnect, { once: true });
            serial.addEventListener("disconnect", this.boundHandleDisconnect, { once: true });

            console.log("Connecting to serial port", port);
            gui_log(i18n.getMessage("firmwareFlasherDetectBoardQuery"));
            result = await serial.connect(
                port,
                { baudRate: DeviceHandler.devicePicker.selectedBauds || 115200 },
                undefined,
            );
        } catch (error) {
            console.error("Failed to connect:", error);
        } finally {
            // Only run cleanup when connection attempt failed
            if (!result) {
                void this.cleanup();
            }
        }
    }

    handleConnect(event: Event) {
        this.onConnect((event as CustomEvent).detail);
    }

    handleDisconnect(event: Event) {
        this.onClosed((event as CustomEvent).detail);
    }

    onClosed(result: unknown) {
        gui_log(i18n.getMessage(result ? "serialPortClosedOk" : "serialPortClosedFail"));

        if (!this.targetAvailable) {
            gui_log(i18n.getMessage("firmwareFlasherBoardVerificationFail"));
        }
    }

    onFinishClose() {
        const fcStore = useFlightControllerStore();
        const board = fcStore.config.boardName;
        let found: unknown = false;
        if (board && typeof this._onBoardDetected === "function") {
            found = this._onBoardDetected(board);
        } else if (board && this._boardOptions) {
            // fallback: just check if board exists in loaded targets
            found = this._boardOptions.some((b) => b.target === board);
        }
        this.targetAvailable = !!found;
        gui_log(
            i18n.getMessage(
                this.targetAvailable
                    ? "firmwareFlasherBoardVerificationSuccess"
                    : "firmwareFlasherBoardVerficationTargetNotAvailable",
                { boardName: board },
            ),
        );
        void this.cleanup();
    }

    async getBoardInfo() {
        const fcStore = useFlightControllerStore();
        await MSP.promise(MSPCodes.MSP_BOARD_INFO);
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
            this.cloudBuildOptions = fcStore.config.buildOptions;
        }
        this.onFinishClose();
    }

    async getBuildInfo() {
        const fcStore = useFlightControllerStore();
        if (
            semver.gte(fcStore.config.apiVersion, API_VERSION_1_45) &&
            fcStore.config.flightControllerIdentifier === "BTFL"
        ) {
            await MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper!.crunch(MSPCodes.MSP2_GET_TEXT, MSP2TextType.BUILDKEY));
            await MSP.promise(
                MSPCodes.MSP2_GET_TEXT,
                mspHelper!.crunch(MSPCodes.MSP2_GET_TEXT, MSP2TextType.CRAFT_NAME),
            );
            await MSP.promise(MSPCodes.MSP_BUILD_INFO);

            // store the build key locally if needed
            this.cloudBuildKey = fcStore.config.buildKey;
        }
        await this.getBoardInfo();
    }

    async requestBoardInformation() {
        const fcStore = useFlightControllerStore();
        await MSP.promise(MSPCodes.MSP_API_VERSION);
        gui_log(i18n.getMessage("apiVersionReceived", fcStore.config.apiVersion));

        if (fcStore.config.apiVersion.includes("null") || semver.lt(fcStore.config.apiVersion, "1.39.0")) {
            // auto-detect is not supported
            this.onFinishClose();
        } else {
            await MSP.promise(MSPCodes.MSP_FC_VARIANT);
            await this.getBuildInfo();
        }
    }

    onConnect(openInfo: unknown) {
        if (openInfo) {
            serial.removeEventListener("receive", this.boundHandleSerialReceive);
            serial.addEventListener("receive", this.boundHandleSerialReceive);

            mspHelper = new MspHelper();
            MSP.listen(mspHelper.process_data.bind(mspHelper));
            void this.requestBoardInformation();
        } else {
            gui_log(i18n.getMessage("serialPortOpenFail"));
        }
    }

    async cleanup() {
        // Disconnect first, so the once-registered disconnect handler can fire
        try {
            await serial.disconnect();
        } catch (error) {
            // Log the error with context but continue to run cleanup
            console.error("Serial disconnection failed:", error);
        } finally {
            // Remove event listeners using stored references (disconnect listener is once-registered and already removed)
            serial.removeEventListener("receive", this.boundHandleSerialReceive);
            serial.removeEventListener("connect", this.boundHandleConnect);
            // Do NOT remove disconnect listener, as it is once-registered and will be auto-removed

            // Clean up MSP listeners after disconnect (always run)
            MSP.clearListeners();
            MSP.disconnect_cleanup();
        }
    }
}

export default new AutoDetect();
