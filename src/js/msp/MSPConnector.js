import MspHelper from "./MSPHelper";
import { read_serial } from "../serial_backend";
import { i18n } from "../localization";
import GUI from "../gui";
import MSP from "../msp";
import FC from "../fc";
import { serial } from "../serial";
import MSPCodes from "./MSPCodes";
import CONFIGURATOR from "../data_storage";
import { gui_log } from "../gui_log";

/**
 * This seems to be mainly used in firmware flasher parts.
 */

function readSerialAdapter(e) {
    read_serial(e.detail);
}

class MSPConnectorImpl {
    constructor() {
        this.baud = undefined;
        this.port = undefined;
        this.onConnectCallback = undefined;
        this.onTimeoutCallback = undefined;
        this.onDisconnectCallback = undefined;
        /** Used for connect timeout only; must not toggle CONFIGURATOR.connectionValid (main UI connect button). */
        this._mspApiVersionReceived = false;
    }

    _disconnectAfterMspTimeout() {
        serial.disconnect((result) => {
            console.log("Disconnected", result);

            MSP.clearListeners();

            Promise.resolve(this.onTimeoutCallback?.())
                .catch((err) => {
                    console.error(err);
                })
                .finally(() => {
                    MSP.disconnect_cleanup();
                });
        });
    }

    handleConnect(openInfo) {
        if (openInfo) {
            this._mspApiVersionReceived = false;
            FC.resetState();

            // disconnect after 10 seconds with error if we don't get IDENT data
            GUI.timeout_add(
                "msp_connector",
                () => {
                    if (!this._mspApiVersionReceived) {
                        gui_log(i18n.getMessage("noConfigurationReceived"));

                        this._disconnectAfterMspTimeout();
                    }
                },
                10000,
            );

            serial.removeEventListener("receive", readSerialAdapter);
            serial.addEventListener("receive", readSerialAdapter);

            const mspHelper = new MspHelper();
            MSP.listen(mspHelper.process_data.bind(mspHelper));

            MSP.send_message(MSPCodes.MSP_API_VERSION, false, false, () => {
                this._mspApiVersionReceived = true;
                GUI.timeout_remove("msp_connector");
                console.log("Connected");

                this.onConnectCallback();
            });
        } else {
            gui_log(i18n.getMessage("serialPortOpenFail"));
            this.onFailureCallback();
        }
    }

    handleDisconnect(detail) {
        console.log("Disconnected", detail);

        serial.removeEventListener("receive", readSerialAdapter);

        // Calling in case event listeners were not removed
        serial.removeEventListener("connect", (e) => this.handleConnect(e.detail));
        serial.removeEventListener("disconnect", (e) => this.handleDisconnect(e));

        MSP.clearListeners();
        MSP.disconnect_cleanup();

        // Flashing path does not run serial_backend disconnectHandler; clear stale UI state if anything set it.
        CONFIGURATOR.connectionValid = false;
    }

    connect(port, baud, onConnectCallback, onTimeoutCallback, onFailureCallback) {
        this.port = port;
        this.baud = baud;
        this.onConnectCallback = onConnectCallback;
        this.onTimeoutCallback = onTimeoutCallback;
        this.onFailureCallback = onFailureCallback;

        serial.removeEventListener("connect", (e) => this.handleConnect(e.detail));
        serial.addEventListener("connect", (e) => this.handleConnect(e.detail), { once: true });

        serial.removeEventListener("disconnect", (e) => this.handleDisconnect(e));
        serial.addEventListener("disconnect", (e) => this.handleDisconnect(e), { once: true });

        serial.connect(this.port, { baudRate: this.baud });
    }

    disconnect(onDisconnectCallback) {
        this.onDisconnectCallback = onDisconnectCallback;

        serial.disconnect((result) => {
            MSP.clearListeners();
            console.log("Disconnected", result);

            Promise.resolve(this.onDisconnectCallback?.(result))
                .catch((err) => {
                    console.error(err);
                })
                .finally(() => {
                    MSP.disconnect_cleanup();
                });
        });
    }
}

export default MSPConnectorImpl;
