import MspHelper from "./MSPHelper";
import { read_serial } from "../serial_backend";
import { i18n } from "../localization";
import GUI from "../gui";
import MSP from "../msp";
import FC from "../fc";
import { serialShim } from "../serial_shim";
import MSPCodes from "./MSPCodes";
import CONFIGURATOR from "../data_storage";
import { gui_log } from "../gui_log";

const serial = serialShim();
/**
 * This seems to be mainly used in firmware flasher parts.
 */

function readSerialAdapter(e) {
    read_serial(e.detail.buffer);
}

function disconnectAndCleanup() {
    serial.disconnect((result) => {
        console.log('Disconnected', result);

        MSP.clearListeners();

        this.onTimeoutCallback();
    });

    MSP.disconnect_cleanup();
}

class MSPConnectorImpl {
    constructor() {
        this.baud = undefined;
        this.port = undefined;
        this.onConnectCallback = undefined;
        this.onTimeoutCallback = undefined;
        this.onDisconnectCallback = undefined;
    }

    handleConnect(openInfo) {
        if (openInfo) {
            FC.resetState();

            // disconnect after 10 seconds with error if we don't get IDENT data
            GUI.timeout_add('msp_connector', function () {
                if (!CONFIGURATOR.connectionValid) {
                    gui_log(i18n.getMessage('noConfigurationReceived'));

                    disconnectAndCleanup();
                }
            }, 10000);

            serial.removeEventListener('receive', readSerialAdapter);
            serial.addEventListener('receive', readSerialAdapter);

            const mspHelper = new MspHelper();
            MSP.listen(mspHelper.process_data.bind(mspHelper));

            MSP.send_message(MSPCodes.MSP_API_VERSION, false, false, () => {
                CONFIGURATOR.connectionValid = true;

                GUI.timeout_remove('msp_connector');
                console.log('Connected');

                this.onConnectCallback();
            });
        } else {
            gui_log(i18n.getMessage('serialPortOpenFail'));
            this.onFailureCallback();
        }
    }

    handleDisconnect (detail) {
        console.log('Disconnected', detail);

        serial.removeEventListener('receive', readSerialAdapter);

        // Calling in case event listeners were not removed
        serial.removeEventListener('connect', (e) => this.handleConnect(e.detail));
        serial.removeEventListener('disconnect', (e) => this.handleDisconnect(e));

        MSP.clearListeners();
        MSP.disconnect_cleanup();
    }

    connect(port, baud, onConnectCallback, onTimeoutCallback, onFailureCallback) {

        this.port = port;
        this.baud = baud;
        this.onConnectCallback = onConnectCallback;
        this.onTimeoutCallback = onTimeoutCallback;
        this.onFailureCallback = onFailureCallback;

        serial.removeEventListener('connect', (e) => this.handleConnect(e.detail));
        serial.addEventListener('connect', (e) => this.handleConnect(e.detail), { once: true });

        serial.removeEventListener('disconnect', (e) => this.handleDisconnect(e));
        serial.addEventListener('disconnect', (e) => this.handleDisconnect(e), { once: true });

        serial.connect(this.port, { baudRate: this.baud });
    }

    disconnect(onDisconnectCallback) {
        this.onDisconnectCallback = onDisconnectCallback;

        serial.disconnect((result) => {
            MSP.clearListeners();
            console.log('Disconnected', result);

            this.onDisconnectCallback(result);
        });

        MSP.disconnect_cleanup();
    }
}

export default MSPConnectorImpl;
