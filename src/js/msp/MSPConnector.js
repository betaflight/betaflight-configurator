import MspHelper from "./MSPHelper";
import { read_serial } from "../serial_backend";
import { i18n } from "../localization";
import GUI from "../gui";
import MSP from "../msp";
import FC from "../fc";
import MSPCodes from "./MSPCodes";
import CONFIGURATOR from "../data_storage";
import serial from "../serial";
import { gui_log } from "../gui_log";

/**
 * This seems to be mainly used in firmware flasher parts.
 */
const MSPConnectorImpl = function () {
    this.baud = undefined;
    this.port = undefined;
    this.onConnectCallback = undefined;
    this.onTimeoutCallback = undefined;
    this.onDisconnectCallback = undefined;
};

MSPConnectorImpl.prototype.connect = function (port, baud, onConnectCallback, onTimeoutCallback, onFailureCallback) {

    const self = this;
    self.port = port;
    self.baud = baud;
    self.onConnectCallback = onConnectCallback;
    self.onTimeoutCallback = onTimeoutCallback;
    self.onFailureCallback = onFailureCallback;

    serial.connect(self.port, {bitrate: self.baud}, function (openInfo) {
        if (openInfo) {
            const disconnectAndCleanup = function() {
                serial.disconnect(function(result) {
                    console.log('Disconnected');

                    MSP.clearListeners();

                    self.onTimeoutCallback();
                });

                MSP.disconnect_cleanup();
            };

            FC.resetState();

            // disconnect after 10 seconds with error if we don't get IDENT data
            GUI.timeout_add('msp_connector', function () {
                if (!CONFIGURATOR.connectionValid) {
                    gui_log(i18n.getMessage('noConfigurationReceived'));

                    disconnectAndCleanup();
                }
            }, 10000);

            serial.onReceive.addListener(read_serial);

            const mspHelper = new MspHelper();
            MSP.listen(mspHelper.process_data.bind(mspHelper));

            MSP.send_message(MSPCodes.MSP_API_VERSION, false, false, function () {
                CONFIGURATOR.connectionValid = true;

                GUI.timeout_remove('msp_connector');
                console.log('Connected');

                self.onConnectCallback();
            });
        } else {
            gui_log(i18n.getMessage('serialPortOpenFail'));
            self.onFailureCallback();
        }
    });
};

MSPConnectorImpl.prototype.disconnect = function(onDisconnectCallback) {
    self.onDisconnectCallback = onDisconnectCallback;

    serial.disconnect(function (result) {
        MSP.clearListeners();
        console.log('Disconnected');

        self.onDisconnectCallback(result);
    });

    MSP.disconnect_cleanup();
};

export default MSPConnectorImpl;
